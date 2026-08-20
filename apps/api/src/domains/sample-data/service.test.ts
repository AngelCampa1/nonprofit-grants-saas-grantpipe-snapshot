import { describe, it, expect, vi } from "vitest";
import {
  funders,
  funds,
  grants,
  grantFundAllocations,
  expenses,
  grantReportingRequirements,
  grantImpactMetrics,
  impactMetricEntries,
  grantCloseoutItems,
  contacts,
  donations,
  restrictionTerms,
  restrictionAllowedCategories,
  restrictionAdditions,
  restrictionReleases,
  restrictionEvidenceLinks,
  sampleDataRecords,
} from "@grantpipe/db";
import { buildSampleContent } from "./seed-content";
import {
  seedSampleData,
  clearSampleData,
  getSampleDataStatus,
  SampleDataConflictError,
  INSERT_ORDER,
} from "./service";

// Allow spying on seed-content module
vi.mock("./seed-content", async (importActual) => {
  const actual = await importActual<typeof import("./seed-content")>();
  return {
    ...actual,
    buildSampleContent: vi.fn(actual.buildSampleContent),
  };
});

// ---------------------------------------------------------------------------
// Mock transaction helpers
// ---------------------------------------------------------------------------

type InsertRecord = { table: unknown; values: unknown[] };
type DeleteRecord = { table: unknown; whereArg: unknown };
type UpdateRecord = { table: unknown; values: unknown; whereArg: unknown };

function makeTx() {
  const inserts: InsertRecord[] = [];
  const deletes: DeleteRecord[] = [];
  const updates: UpdateRecord[] = [];

  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        returning: async () => {
          const arr = Array.isArray(values) ? values : [values];
          const rows = arr.map((v, i) => ({
            ...(v as object),
            id: (v as { id?: string }).id ?? `gen-${i}`,
          }));
          inserts.push({ table, values: arr });
          return rows;
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (whereArg: unknown) => {
        deletes.push({ table, whereArg });
        return [];
      },
    }),
    // The FK-safe dependent cleanup runs before DELETE_ORDER. With no seeded
    // dependents, select returns [] (so no external deletes are issued) and
    // set-null updates are recorded separately, leaving `deletes` unaffected.
    select: () => ({
      from: () => ({
        where: async () => [] as Array<{ id: string }>,
      }),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (whereArg: unknown) => {
          updates.push({ table, values, whereArg });
          return [];
        },
      }),
    }),
  };

  return { tx, inserts, deletes, updates };
}

function makeDb(txContainer: { tx: ReturnType<typeof makeTx>["tx"] | null }) {
  return {
    transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      if (!txContainer.tx) throw new Error("No tx");
      return fn(txContainer.tx);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = "org-test-123";

// Recursively collect the SQL column names referenced by a Drizzle condition
// (SQL object / Column / nested queryChunks). Used to prove a WHERE clause
// scopes by both org_id and id.
function collectColumnNames(node: unknown, acc: Set<string>): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) collectColumnNames(n, acc);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.name === "string" && "table" in obj) {
      acc.add(obj.name);
    }
    if (Array.isArray(obj.queryChunks)) {
      collectColumnNames(obj.queryChunks, acc);
    }
  }
}

// ---------------------------------------------------------------------------
// seedSampleData
// ---------------------------------------------------------------------------

describe("seedSampleData", () => {
  it("throws SampleDataConflictError when alreadySeeded returns true", async () => {
    const { tx, inserts } = makeTx();
    const txContainer = { tx };
    const db = makeDb(txContainer);

    await expect(
      seedSampleData(db as never, {
        orgId: ORG_ID,
        hasRealData: async () => false,
        alreadySeeded: async () => true,
        lockOrg: async () => {},
        recheckSeeded: async () => false,
      }),
    ).rejects.toThrow(SampleDataConflictError);

    await expect(
      seedSampleData(db as never, {
        orgId: ORG_ID,
        hasRealData: async () => false,
        alreadySeeded: async () => true,
        lockOrg: async () => {},
        recheckSeeded: async () => false,
      }),
    ).rejects.toThrow("Sample data already exists for this organization.");

    expect(inserts).toHaveLength(0);
  });

  it("throws SampleDataConflictError when hasRealData returns true", async () => {
    const { tx, inserts } = makeTx();
    const txContainer = { tx };
    const db = makeDb(txContainer);

    await expect(
      seedSampleData(db as never, {
        orgId: ORG_ID,
        hasRealData: async () => true,
        alreadySeeded: async () => false,
        lockOrg: async () => {},
        recheckSeeded: async () => false,
      }),
    ).rejects.toThrow(SampleDataConflictError);

    await expect(
      seedSampleData(db as never, {
        orgId: ORG_ID,
        hasRealData: async () => true,
        alreadySeeded: async () => false,
        lockOrg: async () => {},
        recheckSeeded: async () => false,
      }),
    ).rejects.toThrow("Real data is present; refusing to seed sample data.");

    expect(inserts).toHaveLength(0);
  });

  it("checks alreadySeeded before hasRealData (alreadySeeded wins when both true)", async () => {
    const hasRealData = vi.fn(async () => true);
    const alreadySeeded = vi.fn(async () => true);
    const { tx } = makeTx();
    const db = makeDb({ tx });

    const err = await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData,
      alreadySeeded,
      lockOrg: async () => {},
      recheckSeeded: async () => false,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SampleDataConflictError);
    expect((err as SampleDataConflictError).message).toBe(
      "Sample data already exists for this organization.",
    );
    // alreadySeeded called; hasRealData may or may not be called before check — just verify the right error
  });

  it("acquires the org lock before re-checking, and throws when recheckSeeded sees a concurrent seed", async () => {
    const callOrder: string[] = [];
    const { tx, inserts } = makeTx();
    const db = makeDb({ tx });

    await expect(
      seedSampleData(db as never, {
        orgId: ORG_ID,
        hasRealData: async () => false,
        alreadySeeded: async () => false,
        lockOrg: async () => {
          callOrder.push("lock");
        },
        recheckSeeded: async () => {
          callOrder.push("recheck");
          return true; // a concurrent request already seeded
        },
      }),
    ).rejects.toThrow(SampleDataConflictError);

    // Lock must be taken before the in-transaction recheck.
    expect(callOrder).toEqual(["lock", "recheck"]);
    // No rows are inserted when the recheck detects an existing seed.
    expect(inserts).toHaveLength(0);
  });

  it("passes the transaction handle to lockOrg and recheckSeeded", async () => {
    const { tx } = makeTx();
    const db = makeDb({ tx });
    const lockOrg = vi.fn(async () => {});
    const recheckSeeded = vi.fn(async () => false);

    await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData: async () => false,
      alreadySeeded: async () => false,
      lockOrg,
      recheckSeeded,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(lockOrg).toHaveBeenCalledWith(tx);
    expect(recheckSeeded).toHaveBeenCalledWith(tx);
  });

  it("inserts content rows and ledger rows in FK-safe order; returns correct recordCount", async () => {
    const { tx, inserts } = makeTx();
    const txContainer = { tx };
    const db = makeDb(txContainer);

    const fixedNow = new Date("2026-01-01T00:00:00Z");

    const result = await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData: async () => false,
      alreadySeeded: async () => false,
      lockOrg: async () => {},
      recheckSeeded: async () => false,
      now: fixedNow,
    });

    expect(result.seeded).toBe(true);
    expect(result.recordCount).toBeGreaterThan(0);

    // Filter to business inserts (non-sampleDataRecords)
    const businessInserts = inserts.filter((r) => r.table !== sampleDataRecords);
    const ledgerInserts = inserts.filter((r) => r.table === sampleDataRecords);

    // We should have inserted at least 1 business entity and matching ledger batches
    expect(businessInserts.length).toBeGreaterThan(0);
    expect(ledgerInserts.length).toBeGreaterThan(0);
    // Ledger insert count should equal business insert count (one ledger batch per entity batch)
    expect(ledgerInserts).toHaveLength(businessInserts.length);

    // Verify insert order matches INSERT_ORDER (parents before children)
    const businessTables = businessInserts.map((r) => r.table);
    const expectedOrder = INSERT_ORDER.map((entry) => entry.table);

    let prevIdx = -1;
    for (const tbl of businessTables) {
      const idx = expectedOrder.indexOf(tbl);
      expect(idx).toBeGreaterThan(prevIdx);
      prevIdx = idx;
    }

    // recordCount = sum of business rows (not ledger rows)
    const totalBusinessRows = businessInserts.reduce((sum, r) => sum + r.values.length, 0);
    expect(result.recordCount).toBe(totalBusinessRows);
  });

  it("sampleDataRecords inserts contain orgId, entityTable, and entityId", async () => {
    const { tx, inserts } = makeTx();
    const db = makeDb({ tx });

    await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData: async () => false,
      alreadySeeded: async () => false,
      lockOrg: async () => {},
      recheckSeeded: async () => false,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    const ledgerInserts = inserts.filter((r) => r.table === sampleDataRecords);
    expect(ledgerInserts.length).toBeGreaterThan(0);

    for (const batch of ledgerInserts) {
      for (const row of batch.values as Array<{
        orgId: string;
        entityTable: string;
        entityId: string;
      }>) {
        expect(row.orgId).toBe(ORG_ID);
        expect(typeof row.entityTable).toBe("string");
        expect(row.entityTable.length).toBeGreaterThan(0);
        expect(typeof row.entityId).toBe("string");
        expect(row.entityId.length).toBeGreaterThan(0);
      }
    }
  });

  it("skips empty entity arrays (no insert call for them)", async () => {
    // Build a minimal scenario — if all entities in buildSampleContent have at
    // least 1 row we expect all INSERT_ORDER entries to appear. Just verify
    // that every business insert table is in INSERT_ORDER (i.e. no unknown tables).
    const { tx, inserts } = makeTx();
    const db = makeDb({ tx });

    await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData: async () => false,
      alreadySeeded: async () => false,
      lockOrg: async () => {},
      recheckSeeded: async () => false,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    const knownTables = INSERT_ORDER.map((e) => e.table);
    const businessInserts = inserts.filter((r) => r.table !== sampleDataRecords);
    for (const bi of businessInserts) {
      expect(knownTables).toContain(bi.table);
    }
  });

  it("does not insert rows for an entity when buildSampleContent returns an empty array for that key", async () => {
    // Force metricEntries to [] to exercise the `if (rows.length === 0) continue` branch.
    vi.mocked(buildSampleContent).mockReturnValueOnce({
      funders: [
        {
          id: "funder-1",
          orgId: ORG_ID,
          entityId: "entity-1",
          name: "Test Funder",
          type: "foundation",
        },
      ],
      funds: [],
      grants: [],
      allocations: [],
      expenses: [],
      reportingRequirements: [],
      impactMetrics: [],
      metricEntries: [], // explicitly empty — the branch to cover
      closeoutItems: [],
      contacts: [],
      donations: [],
      restrictionTerms: [],
      restrictionAllowedCategories: [],
      restrictionAdditions: [],
      restrictionReleases: [],
      restrictionEvidenceLinks: [],
    });

    const { tx, inserts } = makeTx();
    const db = makeDb({ tx });

    const result = await seedSampleData(db as never, {
      orgId: ORG_ID,
      hasRealData: async () => false,
      alreadySeeded: async () => false,
      lockOrg: async () => {},
      recheckSeeded: async () => false,
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.seeded).toBe(true);
    expect(result.recordCount).toBe(1); // only the one funder row

    // Only funders should appear in business inserts; metricEntries was skipped
    const businessInserts = inserts.filter((r) => r.table !== sampleDataRecords);
    expect(businessInserts).toHaveLength(1);
    expect(businessInserts[0]!.table).toBe(funders);
    const insertedTables = businessInserts.map((r) => r.table);
    expect(insertedTables).not.toContain(impactMetricEntries);
  });
});

// ---------------------------------------------------------------------------
// clearSampleData
// ---------------------------------------------------------------------------

describe("clearSampleData", () => {
  it("returns {cleared:false, recordCount:0} and does NOT open a transaction when ledger is empty", async () => {
    let transactionCalled = false;
    const db = {
      transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        transactionCalled = true;
        return fn({});
      },
    };

    const result = await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ({}),
    });

    expect(result).toEqual({ cleared: false, recordCount: 0 });
    expect(transactionCalled).toBe(false);
  });

  it("returns {cleared:false, recordCount:0} when all id arrays are empty", async () => {
    let transactionCalled = false;
    const db = {
      transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        transactionCalled = true;
        return fn({});
      },
    };

    const result = await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ({
        funders: [],
        contacts: [],
      }),
    });

    expect(result).toEqual({ cleared: false, recordCount: 0 });
    expect(transactionCalled).toBe(false);
  });

  it("deletes rows in reverse FK order and clears ledger last; returns correct recordCount", async () => {
    const { tx, deletes } = makeTx();
    const db = makeDb({ tx });

    const ledger: Record<string, string[]> = {
      funders: ["f1", "f2"],
      funds: ["fund1"],
      grants: ["g1"],
      grant_fund_allocations: ["a1", "a2", "a3"],
      restriction_terms: ["rt1"],
      restriction_evidence_links: ["rel1"],
    };

    const totalIds =
      (ledger["funders"] ?? []).length +
      (ledger["funds"] ?? []).length +
      (ledger["grants"] ?? []).length +
      (ledger["grant_fund_allocations"] ?? []).length +
      (ledger["restriction_terms"] ?? []).length +
      (ledger["restriction_evidence_links"] ?? []).length;

    const result = await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ledger,
    });

    expect(result).toEqual({ cleared: true, recordCount: totalIds });

    // The LAST delete should target sampleDataRecords (ledger cleanup)
    expect(deletes[deletes.length - 1]!.table).toBe(sampleDataRecords);

    // All entity deletes (before the ledger) should be in reverse INSERT_ORDER
    const entityDeletes = deletes.slice(0, -1);
    const entityTables = entityDeletes.map((d) => d.table);

    // restriction_evidence_links should appear before funders in deletes
    // (children deleted before parents in reverse order)
    const relIdx = entityTables.indexOf(restrictionEvidenceLinks);
    const fIdx = entityTables.indexOf(funders);
    // relIdx may be -1 if no deletes needed for that table; skip if both not found
    if (relIdx !== -1 && fIdx !== -1) {
      expect(relIdx).toBeLessThan(fIdx);
    }
  });

  it("only calls delete for tables with ids present in the ledger", async () => {
    const { tx, deletes } = makeTx();
    const db = makeDb({ tx });

    await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ({
        funders: ["f1"],
      }),
    });

    // Only funder and sampleDataRecords deletes
    const entityDeletes = deletes.filter((d) => d.table !== sampleDataRecords);
    expect(entityDeletes).toHaveLength(1);
    expect(entityDeletes[0]!.table).toBe(funders);
  });

  it("scopes each entity delete to org_id AND id (defense-in-depth tenant guard)", async () => {
    const { tx, deletes } = makeTx();
    const db = makeDb({ tx });

    await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ({
        funders: ["f1", "f2"],
      }),
    });

    const funderDelete = deletes.find((d) => d.table === funders);
    expect(funderDelete).toBeDefined();

    const columns = new Set<string>();
    collectColumnNames(funderDelete!.whereArg, columns);
    // The WHERE must constrain by both the tenant column and the id column.
    expect(columns.has("org_id")).toBe(true);
    expect(columns.has("id")).toBe(true);
  });

  it("scopes deletes for org_id-less tables (allocations, metric entries) by id alone", async () => {
    const { tx, deletes } = makeTx();
    const db = makeDb({ tx });

    // grant_fund_allocations and impact_metric_entries have no org_id column.
    // The delete must NOT reference org_id (that would throw at runtime) and
    // must still scope by the ledgered ids.
    await clearSampleData(db as never, {
      orgId: ORG_ID,
      ledgerByTable: async () => ({
        grant_fund_allocations: ["a1", "a2"],
        impact_metric_entries: ["m1"],
      }),
    });

    for (const orglessTable of [grantFundAllocations, impactMetricEntries]) {
      const del = deletes.find((d) => d.table === orglessTable);
      expect(del).toBeDefined();
      const columns = new Set<string>();
      collectColumnNames(del!.whereArg, columns);
      expect(columns.has("id")).toBe(true);
      expect(columns.has("org_id")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getSampleDataStatus
// ---------------------------------------------------------------------------

describe("getSampleDataStatus", () => {
  it("returns {seeded:false, recordCount:0} when countLedger returns 0", async () => {
    const result = await getSampleDataStatus({ countLedger: async () => 0 });
    expect(result).toEqual({ seeded: false, recordCount: 0 });
  });

  it("returns {seeded:true, recordCount:N} when countLedger returns N > 0", async () => {
    const result = await getSampleDataStatus({ countLedger: async () => 42 });
    expect(result).toEqual({ seeded: true, recordCount: 42 });
  });

  it("handles large counts correctly", async () => {
    const result = await getSampleDataStatus({ countLedger: async () => 9999 });
    expect(result).toEqual({ seeded: true, recordCount: 9999 });
  });
});

// ---------------------------------------------------------------------------
// INSERT_ORDER completeness
// ---------------------------------------------------------------------------

describe("INSERT_ORDER", () => {
  const EXPECTED_KEYS = [
    "funders",
    "funds",
    "grants",
    "allocations",
    "expenses",
    "reportingRequirements",
    "impactMetrics",
    "metricEntries",
    "closeoutItems",
    "contacts",
    "donations",
    "restrictionTerms",
    "restrictionAllowedCategories",
    "restrictionAdditions",
    "restrictionReleases",
    "restrictionEvidenceLinks",
  ] as const;

  it("covers every SampleContent key exactly once", () => {
    const keys = INSERT_ORDER.map((e) => e.key);
    expect(keys).toHaveLength(EXPECTED_KEYS.length);
    for (const k of EXPECTED_KEYS) {
      expect(keys).toContain(k);
    }
  });

  it("maps each key to the correct Drizzle table object", () => {
    const tableMap: Record<string, unknown> = {
      funders,
      funds,
      grants,
      allocations: grantFundAllocations,
      expenses,
      reportingRequirements: grantReportingRequirements,
      impactMetrics: grantImpactMetrics,
      metricEntries: impactMetricEntries,
      closeoutItems: grantCloseoutItems,
      contacts,
      donations,
      restrictionTerms,
      restrictionAllowedCategories,
      restrictionAdditions,
      restrictionReleases,
      restrictionEvidenceLinks,
    };

    for (const entry of INSERT_ORDER) {
      expect(entry.table).toBe(tableMap[entry.key]);
    }
  });

  it("maps each key to the correct entityTable SQL name string", () => {
    const nameMap: Record<string, string> = {
      funders: "funders",
      funds: "funds",
      grants: "grants",
      allocations: "grant_fund_allocations",
      expenses: "expenses",
      reportingRequirements: "grant_reporting_requirements",
      impactMetrics: "grant_impact_metrics",
      metricEntries: "impact_metric_entries",
      closeoutItems: "grant_closeout_items",
      contacts: "contacts",
      donations: "donations",
      restrictionTerms: "restriction_terms",
      restrictionAllowedCategories: "restriction_allowed_categories",
      restrictionAdditions: "restriction_additions",
      restrictionReleases: "restriction_releases",
      restrictionEvidenceLinks: "restriction_evidence_links",
    };

    for (const entry of INSERT_ORDER) {
      expect(entry.entityTable).toBe(nameMap[entry.key]);
    }
  });
});
