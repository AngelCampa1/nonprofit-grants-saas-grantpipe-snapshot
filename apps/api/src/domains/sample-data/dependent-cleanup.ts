// ---------------------------------------------------------------------------
// FK-safe cleanup of rows that depend on sample data
//
// clearSampleData only hard-deletes the 16 ledgered sample tables. Every foreign
// key from an *outside* table into one of those 16 is ON DELETE NO ACTION, so
// once a user creates a row that references a sample row (e.g. a restricted
// rollforward writes restriction_balances pointing at a sample restriction_term),
// deleting the sample rows throws a Postgres FK violation (23503) and the sample
// data becomes undeletable.
//
// To stay correct as the schema grows, this cleanup is derived from the live
// Drizzle FK metadata rather than a hand-maintained list (a hand list is exactly
// what rotted into the original bug). For every row transitively reachable from
// the ledgered sample ids we either:
//   - SET NULL the reference when the FK column is nullable (a "tagging" ref such
//     as journal_lines.grant_id or generated_reports.fund_id — the real row must
//     survive, only the link to the sample row is removed), or
//   - DELETE the row when the FK column is NOT NULL (a structural ref that cannot
//     exist without its parent, such as restriction_balances.restriction_term_id),
//     after first clearing anything that references *it*.
//
// Intra-sample FKs (both ends inside the 16) are left to clearSampleData's
// DELETE_ORDER; this walk only touches external dependents.
// ---------------------------------------------------------------------------

import { and, eq, getTableColumns, getTableName, inArray, is, Table, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";

export type FkEdge = {
  /** Table that holds the foreign key (the referencing/child table). */
  childTable: PgTable;
  /** Postgres name of the child table. */
  childName: string;
  /** The local FK column on the child table. */
  fkColumn: PgColumn;
  /** JS property key of the FK column, for building `.set({ [key]: null })`. */
  fkColumnKey: string;
  /** True when the FK column is NOT NULL (structural ref → delete, not set null). */
  notNull: boolean;
  /** The child's org_id column when present, for tenant-scoped predicates. */
  orgColumn: PgColumn | null;
  /** The child's id column when present, needed to recurse into its dependents. */
  idColumn: PgColumn | null;
  /** True for composite FKs, which the single-column walk cannot handle. */
  multi: boolean;
};

export type FkGraph = {
  /** refTableName → edges whose child references that table. */
  incoming: Map<string, FkEdge[]>;
};

/** Structural view of the transaction the walk needs, kept free of `any`. */
type CleanupTx = {
  update: (table: PgTable) => {
    set: (values: Record<string, unknown>) => { where: (predicate: SQL) => Promise<unknown> };
  };
  select: (fields: Record<string, PgColumn>) => {
    from: (table: PgTable) => { where: (predicate: SQL) => Promise<Array<{ id: string }>> };
  };
  delete: (table: PgTable) => { where: (predicate: SQL) => Promise<unknown> };
};

/** All Drizzle pg tables exported by @grantpipe/db. */
export function collectSchemaTables(): PgTable[] {
  // schema also exports Relations objects and helpers; keep only pg tables.
  return (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, Table));
}

function pushEdge(incoming: Map<string, FkEdge[]>, refTable: string, edge: FkEdge): void {
  const existing = incoming.get(refTable);
  if (existing) existing.push(edge);
  else incoming.set(refTable, [edge]);
}

/** Build the reverse foreign-key graph (who references whom) from Drizzle metadata. */
export function buildFkGraph(tables: PgTable[]): FkGraph {
  const incoming = new Map<string, FkEdge[]>();

  for (const table of tables) {
    const cfg = getTableConfig(table);
    const columns = getTableColumns(table);

    let orgColumn: PgColumn | null = null;
    let idColumn: PgColumn | null = null;
    const keyByColumn = new Map<PgColumn, string>();
    for (const [key, column] of Object.entries(columns)) {
      keyByColumn.set(column, key);
      if (column.name === "org_id") orgColumn = column;
      if (column.name === "id") idColumn = column;
    }

    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const refTableName = getTableName(ref.foreignColumns[0]!.table);
      const localColumn = ref.columns[0]!;
      pushEdge(incoming, refTableName, {
        childTable: table,
        childName: cfg.name,
        fkColumn: localColumn,
        fkColumnKey: keyByColumn.get(localColumn) ?? "",
        notNull: ref.columns.every((column) => column.notNull),
        orgColumn,
        idColumn,
        multi: ref.columns.length > 1,
      });
    }
  }

  return { incoming };
}

let cachedGraph: FkGraph | null = null;

/** Memoized graph over the full schema (built once; clears are infrequent). */
export function getSampleDependencyGraph(): FkGraph {
  cachedGraph ??= buildFkGraph(collectSchemaTables());
  return cachedGraph;
}

/**
 * Remove or unlink every external row that transitively depends on the ledgered
 * sample ids, so clearSampleData's subsequent DELETE_ORDER never hits a dangling
 * NOT NULL foreign key. Runs inside the caller's transaction.
 */
export async function clearSampleDependents(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    ledger: Record<string, string[]>;
    graph: FkGraph;
    sampleTableNames: ReadonlySet<string>;
  },
): Promise<void> {
  const { orgId, ledger, graph, sampleTableNames } = params;
  const cleanupTx = tx as unknown as CleanupTx;

  const scoped = (edge: FkEdge, ids: string[]): SQL => {
    const idPredicate = inArray(edge.fkColumn, ids);
    // ids already descend from this org's ledger; pin to org_id as defense in
    // depth wherever the child table carries it (mirrors clearSampleData).
    return edge.orgColumn ? and(eq(edge.orgColumn, orgId), idPredicate)! : idPredicate;
  };

  // Guards against a NOT NULL foreign-key cycle. Such a cycle cannot be inserted
  // in Postgres without deferred constraints (which this schema does not use), so
  // this is defensive: it guarantees termination even if the schema ever changes,
  // without affecting acyclic diamonds (a table is only on the stack within its
  // own subtree, i.e. a real cycle).
  const onStack = new Set<string>();

  // Clears everything that references the given rows of `tableName`. Deletes
  // NOT NULL dependents depth-first (their own dependents first) so Postgres
  // never sees a dangling reference.
  const processInbound = async (tableName: string, ids: string[]): Promise<void> => {
    if (ids.length === 0 || onStack.has(tableName)) return;
    onStack.add(tableName);
    try {
      await processEdges(tableName, ids);
    } finally {
      onStack.delete(tableName);
    }
  };

  const processEdges = async (tableName: string, ids: string[]): Promise<void> => {
    const edges = graph.incoming.get(tableName) ?? [];

    for (const edge of edges) {
      // Both ends inside the sample set: clearSampleData's DELETE_ORDER owns it.
      if (sampleTableNames.has(edge.childName)) continue;
      // Composite FKs are not expressible as a single-column predicate. The
      // completeness guard test asserts none exist in the dependency closure, so
      // reaching one means the schema drifted and needs code + test updates.
      if (edge.multi) {
        throw new Error(
          `clearSampleDependents cannot handle composite FK from ${edge.childName} into ${tableName}`,
        );
      }

      const predicate = scoped(edge, ids);

      if (!edge.notNull) {
        // Nullable "tagging" ref: unlink, keep the real row.
        await cleanupTx
          .update(edge.childTable)
          .set({ [edge.fkColumnKey]: null })
          .where(predicate);
        continue;
      }

      // NOT NULL structural ref: the child row cannot survive its parent.
      if (edge.idColumn) {
        const rows = await cleanupTx
          .select({ id: edge.idColumn })
          .from(edge.childTable)
          .where(predicate);
        const childIds = rows.map((row) => row.id);
        if (childIds.length === 0) continue;
        await processInbound(edge.childName, childIds);
        await cleanupTx.delete(edge.childTable).where(predicate);
      } else {
        // No id column (e.g. a junction table); nothing can reference it by a
        // discoverable primary key, so delete it directly. The completeness
        // guard asserts such tables have no inbound FKs of their own.
        await cleanupTx.delete(edge.childTable).where(predicate);
      }
    }
  };

  for (const [tableName, ids] of Object.entries(ledger)) {
    await processInbound(tableName, ids);
  }
}
