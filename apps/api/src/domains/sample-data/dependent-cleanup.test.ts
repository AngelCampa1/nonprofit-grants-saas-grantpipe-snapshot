import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  buildFkGraph,
  clearSampleDependents,
  collectSchemaTables,
  getSampleDependencyGraph,
  type FkGraph,
} from "./dependent-cleanup";
import { INSERT_ORDER } from "./service";

const SAMPLE_TABLE_NAMES = new Set(INSERT_ORDER.map((entry) => entry.entityTable));

// Per-table metadata straight from the live schema, used by the completeness guard.
type TableInfo = { hasId: boolean; hasOrg: boolean };
function tableInfoByName(): Map<string, TableInfo> {
  const info = new Map<string, TableInfo>();
  for (const table of collectSchemaTables()) {
    const columns = Object.values(getTableColumns(table)) as PgColumn[];
    info.set(getTableName(table), {
      hasId: columns.some((c) => c.name === "id"),
      hasOrg: columns.some((c) => c.name === "org_id"),
    });
  }
  return info;
}

// Walk the external dependency closure the cleanup will traverse: start at the 16
// sample tables, follow NOT NULL edges into the rows that get deleted (recursing),
// and record nullable edges (which stop, since the row survives).
function dependencyClosure(graph: FkGraph) {
  const deleteEdges: string[] = []; // `${child}.${col}` NOT NULL edges (rows deleted)
  const setNullEdges: string[] = []; // nullable edges (rows unlinked)
  const deletedTables = new Set<string>();
  const multiColEdges: string[] = [];
  const visited = new Set<string>(SAMPLE_TABLE_NAMES);
  const frontier = [...SAMPLE_TABLE_NAMES];

  while (frontier.length > 0) {
    const table = frontier.pop()!;
    for (const edge of graph.incoming.get(table) ?? []) {
      if (SAMPLE_TABLE_NAMES.has(edge.childName)) continue; // owned by DELETE_ORDER
      if (edge.multi) {
        multiColEdges.push(`${edge.childName}.${edge.fkColumn.name}`);
        continue;
      }
      const label = `${edge.childName}.${edge.fkColumn.name}`;
      if (edge.notNull) {
        deleteEdges.push(label);
        deletedTables.add(edge.childName);
        if (!visited.has(edge.childName)) {
          visited.add(edge.childName);
          frontier.push(edge.childName);
        }
      } else {
        setNullEdges.push(label);
      }
    }
  }

  return { deleteEdges, setNullEdges, deletedTables, multiColEdges };
}

describe("sample-data dependency completeness guard", () => {
  const graph = buildFkGraph(collectSchemaTables());
  const closure = dependencyClosure(graph);
  const info = tableInfoByName();

  it("has no composite foreign keys anywhere in the dependency closure", () => {
    // The single-column walk cannot express a composite-FK predicate. If this
    // ever fails, a schema change added a composite FK into the sample graph and
    // clearSampleDependents must be extended (and this test updated).
    expect(closure.multiColEdges).toEqual([]);
  });

  it("can recurse into or safely delete every NOT NULL dependent it removes", () => {
    // A deleted table must either have an id (so we can recurse into its own
    // dependents) or have no external inbound FKs (a safe leaf). Otherwise the
    // walk could leave a dangling reference and the clear would still fail.
    const unsafe = [...closure.deletedTables].filter((name) => {
      if (info.get(name)?.hasId) return false;
      const inbound = (graph.incoming.get(name) ?? []).filter(
        (e) => !SAMPLE_TABLE_NAMES.has(e.childName),
      );
      return inbound.length > 0;
    });
    expect(unsafe).toEqual([]);
  });

  it("covers the headline restriction_balances dependency both ways", () => {
    // NOT NULL FK to restriction_terms → the row is deleted.
    expect(closure.deleteEdges).toContain("restriction_balances.restriction_term_id");
    // Nullable FKs to funds/grants → those links are set null, row kept when its
    // restriction term is real.
    expect(closure.setNullEdges).toContain("restriction_balances.fund_id");
    expect(closure.setNullEdges).toContain("restriction_balances.grant_id");
  });

  it("unlinks real financial/report rows instead of deleting them", () => {
    // generated_reports and journal_lines carry nullable tagging refs; the real
    // rows must survive with the sample link cleared.
    expect(closure.deletedTables.has("generated_reports")).toBe(false);
    expect(closure.deletedTables.has("journal_lines")).toBe(false);
    expect(closure.setNullEdges).toContain("generated_reports.grant_id");
    expect(closure.setNullEdges).toContain("journal_lines.grant_id");
  });

  it("recursively removes payment-request descendants of sample grants", () => {
    expect(closure.deletedTables.has("grant_payment_requests")).toBe(true);
    expect(closure.deleteEdges).toContain("grant_payment_request_lines.request_id");
  });
});

// ---------------------------------------------------------------------------
// clearSampleDependents — real schema graph driven against a recording mock tx
// ---------------------------------------------------------------------------

function collectColumnNames(node: unknown, acc: Set<string>): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) collectColumnNames(n, acc);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.name === "string" && "table" in obj) acc.add(obj.name as string);
    if (Array.isArray(obj.queryChunks)) collectColumnNames(obj.queryChunks, acc);
  }
}

// Build a NOT NULL FkEdge for synthetic graphs used by the cycle test.
function edge(
  childTable: PgTable,
  childName: string,
  fkColumn: PgColumn,
  idColumn: PgColumn,
): import("./dependent-cleanup").FkEdge {
  return {
    childTable,
    childName,
    fkColumn,
    fkColumnKey: "",
    notNull: true,
    orgColumn: null,
    idColumn,
    multi: false,
  };
}

function makeCleanupTx(childRowsByTable: Record<string, string[]>) {
  const selects: string[] = [];
  const updates: Array<{ table: string; columns: Set<string> }> = [];
  const deletes: Array<{ table: string; columns: Set<string> }> = [];

  const tx = {
    select: () => ({
      from: (table: PgTable) => ({
        where: async () => {
          const name = getTableName(table);
          selects.push(name);
          return (childRowsByTable[name] ?? []).map((id) => ({ id }));
        },
      }),
    }),
    update: (table: PgTable) => ({
      set: () => ({
        where: async (predicate: unknown) => {
          const columns = new Set<string>();
          collectColumnNames(predicate, columns);
          updates.push({ table: getTableName(table), columns });
          return [];
        },
      }),
    }),
    delete: (table: PgTable) => ({
      where: async (predicate: unknown) => {
        const columns = new Set<string>();
        collectColumnNames(predicate, columns);
        deletes.push({ table: getTableName(table), columns });
        return [];
      },
    }),
  };

  return { tx, selects, updates, deletes };
}

describe("clearSampleDependents", () => {
  const graph = buildFkGraph(collectSchemaTables());

  it("deletes NOT NULL dependents, set-nulls tagging refs, and recurses", async () => {
    const { tx, selects, updates, deletes } = makeCleanupTx({
      restriction_balances: ["rb1"],
      grant_payment_requests: ["gpr1"],
      grant_payments: ["gp1"],
    });

    await clearSampleDependents(tx as never, {
      orgId: "org-1",
      ledger: {
        restriction_terms: ["rt1"],
        funds: ["fund1"],
        grants: ["grant1"],
      },
      graph,
      sampleTableNames: SAMPLE_TABLE_NAMES,
    });

    const deletedTables = deletes.map((d) => d.table);
    const updatedTables = updates.map((u) => u.table);

    // NOT NULL structural dependents are deleted.
    expect(deletedTables).toContain("restriction_balances");
    expect(deletedTables).toContain("grant_payment_requests");
    // Recursion reached the payment-request children (their rows were queried).
    expect(selects).toContain("grant_payment_request_lines");
    expect(selects).toContain("grant_payments");
    // Nullable tagging refs are unlinked, not deleted.
    expect(updatedTables).toContain("generated_reports");
    expect(updatedTables).toContain("journal_lines");
    expect(deletedTables).not.toContain("generated_reports");
    // The restriction_balances delete is tenant-scoped and keyed by the FK.
    const rbDelete = deletes.find((d) => d.table === "restriction_balances");
    expect(rbDelete?.columns.has("org_id")).toBe(true);
    expect(rbDelete?.columns.has("restriction_term_id")).toBe(true);
  });

  it("never touches tables inside the sample set (DELETE_ORDER owns those)", async () => {
    const { tx, updates, deletes } = makeCleanupTx({});
    await clearSampleDependents(tx as never, {
      orgId: "org-1",
      ledger: { contacts: ["c1"], funders: ["fn1"] },
      graph,
      sampleTableNames: SAMPLE_TABLE_NAMES,
    });
    // donations/grants are in the sample set; the walk must not delete/update them.
    for (const name of [...updates.map((u) => u.table), ...deletes.map((d) => d.table)]) {
      expect(SAMPLE_TABLE_NAMES.has(name)).toBe(false);
    }
  });

  it("does nothing when the ledger is empty", async () => {
    const { tx, selects, updates, deletes } = makeCleanupTx({});
    await clearSampleDependents(tx as never, {
      orgId: "org-1",
      ledger: {},
      graph,
      sampleTableNames: SAMPLE_TABLE_NAMES,
    });
    expect(selects).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("terminates on a NOT NULL foreign-key cycle instead of looping forever", async () => {
    // Defensive: Postgres cannot hold a NOT NULL FK cycle without deferred
    // constraints, but the walk must still terminate if the schema ever does.
    // Without the on-stack guard this test would hang (and time out).
    const byName = new Map(collectSchemaTables().map((t) => [getTableName(t), t]));
    const rb = byName.get("restriction_balances")!;
    const gr = byName.get("generated_reports")!;
    const rbId = getTableColumns(rb).id as PgColumn;
    const grId = getTableColumns(gr).id as PgColumn;

    const cyclicGraph: FkGraph = {
      incoming: new Map([
        ["funds", [edge(rb, "restriction_balances", rbId, rbId)]],
        ["restriction_balances", [edge(gr, "generated_reports", grId, grId)]],
        ["generated_reports", [edge(rb, "restriction_balances", rbId, rbId)]],
      ]),
    };

    const { tx, deletes } = makeCleanupTx({
      restriction_balances: ["rb1"],
      generated_reports: ["gr1"],
    });

    await clearSampleDependents(tx as never, {
      orgId: "org-1",
      ledger: { funds: ["fund1"] },
      graph: cyclicGraph,
      sampleTableNames: SAMPLE_TABLE_NAMES,
    });

    // It ran to completion and deleted both tables in the cycle at least once.
    expect(deletes.map((d) => d.table)).toContain("restriction_balances");
    expect(deletes.map((d) => d.table)).toContain("generated_reports");
  });

  it("throws on a composite foreign key it cannot express", async () => {
    // Guards the schema-drift escape hatch: if a future migration adds a
    // composite FK into the sample graph, the walk refuses rather than silently
    // skipping it (which would let the clear fail on a dangling reference).
    const { tx } = makeCleanupTx({});
    const multiGraph: FkGraph = {
      incoming: new Map([
        [
          "funds",
          [
            {
              childTable: {} as unknown as PgTable,
              childName: "some_composite_child",
              fkColumn: {} as unknown as PgColumn,
              fkColumnKey: "x",
              notNull: true,
              orgColumn: null,
              idColumn: null,
              multi: true,
            },
          ],
        ],
      ]),
    };
    await expect(
      clearSampleDependents(tx as never, {
        orgId: "org-1",
        ledger: { funds: ["fund1"] },
        graph: multiGraph,
        sampleTableNames: SAMPLE_TABLE_NAMES,
      }),
    ).rejects.toThrow(/composite FK/);
  });
});

describe("getSampleDependencyGraph", () => {
  it("builds the schema graph once and memoizes it", () => {
    const first = getSampleDependencyGraph();
    const second = getSampleDependencyGraph();
    expect(first).toBe(second);
    // Sanity: the memoized graph knows about the headline dependent.
    expect(first.incoming.get("restriction_terms")?.length).toBeGreaterThan(0);
  });
});
