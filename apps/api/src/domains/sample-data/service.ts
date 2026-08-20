import { and, eq, inArray } from "drizzle-orm";
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
import type { Database, TransactionDatabase } from "@grantpipe/db";
import { buildSampleContent, type SampleContent } from "./seed-content";
import { clearSampleDependents, getSampleDependencyGraph } from "./dependent-cleanup";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SampleDataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SampleDataConflictError";
  }
}

// ---------------------------------------------------------------------------
// INSERT_ORDER — single source of truth for FK-safe insert/delete ordering
//
// entityTable strings were verified against pgTable("name", ...) declarations:
//   funders          → grants.ts:27
//   funds            → grants.ts:97
//   grants           → grants.ts:70
//   grant_fund_allocations → grants.ts:115
//   expenses         → grants.ts:133
//   grant_reporting_requirements → compliance.ts:20
//   grant_impact_metrics → grants.ts:378
//   impact_metric_entries → compliance.ts:42
//   grant_closeout_items → compliance.ts:61
//   contacts         → contacts.ts:18
//   donations        → contacts.ts:50
//   restriction_terms → restrictions.ts:10
//   restriction_allowed_categories → restrictions.ts:186
//   restriction_additions → restrictions.ts:84
//   restriction_releases → restrictions.ts:112
//   restriction_evidence_links → restrictions.ts:140
// ---------------------------------------------------------------------------

type InsertOrderEntry = {
  key: keyof SampleContent;
  table: unknown;
  entityTable: string;
  // Most sample tables carry org_id, so deletes can be scoped to the org as a
  // defense-in-depth guard. A few junction/child tables (grant_fund_allocations,
  // impact_metric_entries) have no org_id column — they inherit tenancy through
  // their parent FK. For those, set hasOrgId:false so the delete scopes by the
  // ledgered ids alone (referencing a nonexistent table.orgId would throw).
  hasOrgId?: boolean;
};

export const INSERT_ORDER: InsertOrderEntry[] = [
  { key: "funders", table: funders, entityTable: "funders" },
  { key: "funds", table: funds, entityTable: "funds" },
  { key: "grants", table: grants, entityTable: "grants" },
  {
    key: "allocations",
    table: grantFundAllocations,
    entityTable: "grant_fund_allocations",
    hasOrgId: false,
  },
  { key: "expenses", table: expenses, entityTable: "expenses" },
  {
    key: "reportingRequirements",
    table: grantReportingRequirements,
    entityTable: "grant_reporting_requirements",
  },
  { key: "impactMetrics", table: grantImpactMetrics, entityTable: "grant_impact_metrics" },
  {
    key: "metricEntries",
    table: impactMetricEntries,
    entityTable: "impact_metric_entries",
    hasOrgId: false,
  },
  { key: "closeoutItems", table: grantCloseoutItems, entityTable: "grant_closeout_items" },
  { key: "contacts", table: contacts, entityTable: "contacts" },
  { key: "donations", table: donations, entityTable: "donations" },
  { key: "restrictionTerms", table: restrictionTerms, entityTable: "restriction_terms" },
  {
    key: "restrictionAllowedCategories",
    table: restrictionAllowedCategories,
    entityTable: "restriction_allowed_categories",
  },
  {
    key: "restrictionAdditions",
    table: restrictionAdditions,
    entityTable: "restriction_additions",
  },
  {
    key: "restrictionReleases",
    table: restrictionReleases,
    entityTable: "restriction_releases",
  },
  {
    key: "restrictionEvidenceLinks",
    table: restrictionEvidenceLinks,
    entityTable: "restriction_evidence_links",
  },
];

export const DELETE_ORDER: InsertOrderEntry[] = [...INSERT_ORDER].reverse();

// ---------------------------------------------------------------------------
// seedSampleData
// ---------------------------------------------------------------------------

export async function seedSampleData(
  db: Database,
  deps: {
    orgId: string;
    entityId?: string;
    hasRealData: () => Promise<boolean>;
    alreadySeeded: () => Promise<boolean>;
    lockOrg: (tx: TransactionDatabase) => Promise<void>;
    recheckSeeded: (tx: TransactionDatabase) => Promise<boolean>;
    now?: Date;
  },
): Promise<{ seeded: true; recordCount: number }> {
  if (await deps.alreadySeeded()) {
    throw new SampleDataConflictError("Sample data already exists for this organization.");
  }

  if (await deps.hasRealData()) {
    throw new SampleDataConflictError("Real data is present; refusing to seed sample data.");
  }

  const content = buildSampleContent({
    orgId: deps.orgId,
    entityId: deps.entityId,
    now: deps.now,
  });

  return db.transaction(async (tx: TransactionDatabase) => {
    // Serialize concurrent seed attempts for this org, then re-check inside the
    // transaction. The pre-transaction alreadySeeded check is a fast path; this
    // lock + recheck closes the double-click race where two requests both read
    // an empty ledger and each insert a full sample set.
    await deps.lockOrg(tx);
    if (await deps.recheckSeeded(tx)) {
      throw new SampleDataConflictError("Sample data already exists for this organization.");
    }

    let recordCount = 0;

    for (const { key, table, entityTable } of INSERT_ORDER) {
      const rows = content[key];
      if (rows.length === 0) continue;

      const inserted = await (tx as unknown as { insert: typeof tx.insert })
        .insert(table as Parameters<typeof tx.insert>[0])
        .values(rows as Parameters<ReturnType<typeof tx.insert>["values"]>[0])
        .returning();

      await tx
        .insert(sampleDataRecords)
        .values(
          (inserted as Array<{ id: string }>).map((r) => ({
            orgId: deps.orgId,
            entityTable,
            entityId: r.id,
          })),
        )
        .returning();

      recordCount += inserted.length;
    }

    return { seeded: true as const, recordCount };
  });
}

// ---------------------------------------------------------------------------
// clearSampleData
// ---------------------------------------------------------------------------

export async function clearSampleData(
  db: Database,
  deps: {
    orgId: string;
    ledgerByTable: () => Promise<Record<string, string[]>>;
  },
): Promise<{ cleared: boolean; recordCount: number }> {
  const ledger = await deps.ledgerByTable();
  const total = Object.values(ledger).reduce((sum, ids) => sum + ids.length, 0);

  if (total === 0) {
    return { cleared: false, recordCount: 0 };
  }

  const sampleTableNames = new Set(INSERT_ORDER.map((entry) => entry.entityTable));

  await db.transaction(async (tx: TransactionDatabase) => {
    // First remove/unlink any external rows that reference these sample rows
    // (e.g. restriction_balances from a rollforward). Without this, the hard
    // deletes below would throw a NO ACTION foreign-key violation and the whole
    // clear would roll back, leaving the sample data undeletable.
    await clearSampleDependents(tx, {
      orgId: deps.orgId,
      ledger,
      graph: getSampleDependencyGraph(),
      sampleTableNames,
    });

    for (const { table, entityTable, hasOrgId } of DELETE_ORDER) {
      const ids = ledger[entityTable] ?? [];
      if (ids.length === 0) continue;

      // The ids come from this org's ledger (already scoped by org_id). For
      // tables that carry org_id, also pin the delete to the org as a
      // defense-in-depth guard so a stale/foreign id can never reach another
      // tenant's row. Tables without org_id (hasOrgId:false) scope by id alone —
      // referencing a nonexistent table.orgId would throw at runtime.
      const idPredicate = inArray((table as { id: Parameters<typeof inArray>[0] }).id, ids);
      const predicate =
        hasOrgId === false
          ? idPredicate
          : and(eq((table as { orgId: Parameters<typeof eq>[0] }).orgId, deps.orgId), idPredicate);

      await (tx as unknown as { delete: typeof tx.delete })
        .delete(table as Parameters<typeof tx.delete>[0])
        .where(predicate);
    }

    await tx.delete(sampleDataRecords).where(eq(sampleDataRecords.orgId, deps.orgId));
  });

  return { cleared: true, recordCount: total };
}

// ---------------------------------------------------------------------------
// getSampleDataStatus
// ---------------------------------------------------------------------------

export async function getSampleDataStatus(deps: {
  countLedger: () => Promise<number>;
}): Promise<{ seeded: boolean; recordCount: number }> {
  const recordCount = await deps.countLedger();
  return { seeded: recordCount > 0, recordCount };
}
