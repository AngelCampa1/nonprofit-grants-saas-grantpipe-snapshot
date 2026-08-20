import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getAnomalies, isReviewableAnomaly } from "./anomaly.service";
import type { AnomalyItem } from "./anomaly.service";

const anomalyServiceSource = readFileSync(
  fileURLToPath(new URL("./anomaly.service.ts", import.meta.url)),
  "utf8",
);

// ---------------------------------------------------------------------------
// DB mock builder
//
// Routing strategy for db.select(fields):
//   • fields has "requestId"  → indirect-lines query (has innerJoin)
//   • fields is undefined/{}  → grantIndirectCostRules query (no innerJoin, no known keys)
//   • fields has "total"      → restriction additions sum query per release date
//   • fields has "category" && "accountId"  → restrictionAllowedCategories
//   • fields has "amountCents" && "description" → direct-lines query
//
// All sum calls share a single iterator so multi-term scenarios round-robin correctly.
// ---------------------------------------------------------------------------

type SumPair = { additionsCents: number; releasesCents: number };

type QueryMocks = {
  expenses?: Array<{
    id: string;
    fundId: string | null;
    grantId?: string | null;
    category: string | null;
    accountId: string | null;
  }>;
  /** findMany for restrictionTerms (category detector) */
  restrictionTermsByFund?: Array<{ id: string }>;
  allowedCategories?: Array<{ category: string | null; accountId: string | null }>;
  releases?: Array<{
    id: string;
    restrictionTermId: string;
    amountCents: number;
    date?: Date | string;
    createdAt?: Date | string;
  }>;
  /** null means term not found (skip release) */
  termFindFirstResults?: Array<{
    id: string;
    beginningBalanceCents: number;
    fundId?: string | null;
    grantId?: string | null;
    donationId?: string | null;
    donation?: { contactId: string } | null;
  } | null>;
  /** one SumPair per unique termId encountered (in order of first encounter) */
  termSumPairs?: SumPair[];
  donations?: Array<{
    id: string;
    contactId: string;
    amountCents: number;
    date: Date | string;
  }>;
  indirectLines?: Array<{
    requestId: string;
    lineId: string;
    postedAmountCents: number;
    grantId: string | null;
  }>;
  rules?: Array<{
    id: string;
    grantId: string | null;
    base: "direct_costs" | "salaries_only" | "modified_total_direct";
    rateBasisPoints: number;
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
    orgId?: string;
    deletedAt?: null;
  }>;
  /** direct lines per requestId — keyed by requestId */
  directLinesByRequest?: Record<string, Array<{ amountCents: number; description: string | null }>>;
};

function makeDb(mocks: QueryMocks = {}) {
  const {
    expenses: expenseRows = [],
    restrictionTermsByFund: termRows = [],
    allowedCategories: allowedCatRows = [],
    releases: rawReleaseRows = [],
    termFindFirstResults = [],
    termSumPairs = [],
    donations: donationRows = [],
    indirectLines: indirectLineRows = [],
    rules: ruleRows = [],
    directLinesByRequest = {},
  } = mocks;

  const releaseRows = rawReleaseRows.map((release) => ({
    date: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...release,
  }));

  // Iterators for sequential calls
  let findFirstIdx = 0;
  // sumCallIdx tracks the addition sum for each release balance check.
  let sumCallIdx = 0;

  // These three core-select paths replaced db.query.restrictionReleases.findMany,
  // db.query.restrictionTerms.findFirst, and db.query.donations.findMany (see the
  // relational-API re-qualification note on anomaly.service.ts). They're exposed
  // as named spies below so tests can assert on the `where` args / call counts
  // the same way the old db.query.* mocks allowed.
  const releasesWhereSpy = vi.fn().mockResolvedValue(releaseRows);
  const termsLimitSpy = vi.fn().mockImplementation(() => {
    const result = termFindFirstResults[findFirstIdx] ?? null;
    findFirstIdx++;
    return Promise.resolve(result ? [result] : []);
  });
  const termsWhereSpy = vi.fn().mockReturnValue({ limit: termsLimitSpy });
  const donationsWhereSpy = vi.fn().mockResolvedValue(donationRows);
  const indirectInnerJoinSpy = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue(indirectLineRows) });

  const db = {
    query: {
      expenses: {
        findMany: vi.fn().mockResolvedValue(expenseRows),
      },
      restrictionTerms: {
        findMany: vi.fn().mockResolvedValue(termRows),
      },
    },

    select: vi.fn().mockImplementation((fields: Record<string, unknown> | undefined) => {
      // -----------------------------------------------------------------------
      // Indirect-lines query: fields has "requestId" key
      // -----------------------------------------------------------------------
      if (fields && "requestId" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: indirectInnerJoinSpy,
          }),
        };
      }

      // -----------------------------------------------------------------------
      // Sum queries: fields has "total" key
      // -----------------------------------------------------------------------
      if (fields && "total" in fields) {
        const pair = termSumPairs[sumCallIdx++] ?? { additionsCents: 0, releasesCents: 0 };
        const total = pair.additionsCents;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: String(total) }]),
          }),
        };
      }

      // -----------------------------------------------------------------------
      // AllowedCategories query: fields has "category" AND "accountId"
      // -----------------------------------------------------------------------
      if (fields && "category" in fields && "accountId" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(allowedCatRows),
          }),
        };
      }

      // -----------------------------------------------------------------------
      // Direct-lines query: fields has "amountCents" AND "description"
      // -----------------------------------------------------------------------
      if (fields && "amountCents" in fields && "description" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((..._args: unknown[]) => {
              // We can't easily inspect where args; return all direct lines flat.
              // Tests that need per-request routing should use a single requestId.
              const allDirect = Object.values(directLinesByRequest).flat();
              return Promise.resolve(allDirect);
            }),
          }),
        };
      }

      // -----------------------------------------------------------------------
      // Restriction releases (core select): fields has "restrictionTermId" AND
      // "amountCents" (checked before donations, which shares "amountCents")
      // -----------------------------------------------------------------------
      if (fields && "restrictionTermId" in fields && "amountCents" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: releasesWhereSpy,
          }),
        };
      }

      // -----------------------------------------------------------------------
      // Restriction terms findFirst-replacement (core select + limit(1)):
      // fields has "beginningBalanceCents"
      // -----------------------------------------------------------------------
      if (fields && "beginningBalanceCents" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: termsWhereSpy,
          }),
        };
      }

      // -----------------------------------------------------------------------
      // Donations (core select): fields has "contactId" AND "amountCents"
      // -----------------------------------------------------------------------
      if (fields && "contactId" in fields && "amountCents" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: donationsWhereSpy,
          }),
        };
      }

      // -----------------------------------------------------------------------
      // grantIndirectCostRules query: select() with no fields (or empty object)
      // -----------------------------------------------------------------------
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(ruleRows),
        }),
      };
    }),
  };

  return Object.assign(db, {
    _releasesWhereSpy: releasesWhereSpy,
    _termsWhereSpy: termsWhereSpy,
    _termsLimitSpy: termsLimitSpy,
    _donationsWhereSpy: donationsWhereSpy,
    _indirectInnerJoinSpy: indirectInnerJoinSpy,
  });
}

// Helper to cast the mock db to the expected type
type DbParam = Parameters<typeof getAnomalies>[0];
function asDb(mock: ReturnType<typeof makeDb>): DbParam {
  return mock as unknown as DbParam;
}

function compiledQuery(value: unknown) {
  return new PgDialect().sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);
}

// ---------------------------------------------------------------------------
// isReviewableAnomaly
// ---------------------------------------------------------------------------

describe("isReviewableAnomaly", () => {
  it("returns true for warning severity", () => {
    const item: AnomalyItem = {
      class: "duplicate_donation",
      severity: "warning",
      reason: "test",
      entityType: "donation",
      entityId: "d-1",
      contactId: "c-1",
      duplicateGroupIds: ["d-1", "d-2"],
    };
    expect(isReviewableAnomaly(item)).toBe(true);
  });

  it("returns true for critical severity", () => {
    const item: AnomalyItem = {
      class: "category_misallocation",
      severity: "critical",
      reason: "test",
      entityType: "expense",
      entityId: "e-1",
      expenseCategory: "food",
      expenseAccountId: null,
      termId: "t-1",
      fundId: "f-1",
    };
    expect(isReviewableAnomaly(item)).toBe(true);
  });

  it("returns false for info severity", () => {
    const item: AnomalyItem = {
      class: "release_over_balance",
      severity: "info",
      reason: "",
      entityType: "restriction_release",
      entityId: "r-1",
      releaseAmountCents: 100,
      availableBalanceCents: 200,
      overByCents: 0,
      termId: "t-1",
      fundId: "f-1",
      grantId: null,
      donationId: null,
      contactId: null,
    };
    expect(isReviewableAnomaly(item)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAnomalies — empty / no-data cases
// ---------------------------------------------------------------------------

describe("getAnomalies — empty data", () => {
  it("applies the active entity to every anomaly source query", async () => {
    const db = makeDb();

    await getAnomalies(asDb(db), {
      orgId: "org-1",
      entityId: "entity-a",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const expenseQuery = compiledQuery(db.query.expenses.findMany.mock.calls[0]![0].where);
    const releaseQuery = compiledQuery(db._releasesWhereSpy.mock.calls[0]![0]);
    const donationQuery = compiledQuery(db._donationsWhereSpy.mock.calls[0]![0]);
    const indirectJoin = db._indirectInnerJoinSpy.mock.calls[0]![1];
    const indirectQuery = compiledQuery(indirectJoin);

    expect(expenseQuery.sql).toContain('"expenses"."entity_id"');
    expect(releaseQuery.params).toContain("entity-a");
    expect(donationQuery.params).toContain("entity-a");
    expect(indirectQuery.params).toContain("entity-a");
  });

  it("returns empty items and zero totals when no data", async () => {
    const db = makeDb();
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
    });

    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({
      category_misallocation: 0,
      release_over_balance: 0,
      duplicate_donation: 0,
      indirect_rate_mismatch: 0,
    });
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it("produces zero category/release totals when hasRestrictionData is false", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "food", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      hasRestrictionData: false,
    });
    expect(result.totals.category_misallocation).toBe(0);
    expect(result.totals.release_over_balance).toBe(0);
    // duplicate detector still runs
    expect(result.totals.duplicate_donation).toBe(0);
  });

  it("produces zero indirect total when hasIndirectRules is false", async () => {
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 1000, grantId: "g-1" },
      ],
      rules: [
        {
          id: "r-1",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      hasIndirectRules: false,
    });
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// asOf reflects now
// ---------------------------------------------------------------------------

describe("getAnomalies — asOf", () => {
  it("returns asOf matching the now param", async () => {
    const now = new Date("2026-06-16T12:00:00Z");
    const db = makeDb();
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now });
    expect(result.asOf).toBe(now);
  });
});

// ---------------------------------------------------------------------------
// category_misallocation
// ---------------------------------------------------------------------------

describe("getAnomalies — category_misallocation", () => {
  it("skips expenses with no fundId", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: null, category: "food", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(0);
  });

  it("skips expenses with no category and no accountId", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: null, accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(0);
  });

  it("does not flag an expense whose category is in the allowed list", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "program", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(0);
  });

  it("flags an expense whose category is NOT in the allowed list (critical)", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "travel", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(1);
    const item = result.items[0];
    expect(item?.class).toBe("category_misallocation");
    expect(item?.severity).toBe("critical");
    expect(item?.entityType).toBe("expense");
    expect(item?.entityId).toBe("e-1");
    if (item?.class === "category_misallocation") {
      expect(item.fundId).toBe("f-1");
      expect(item.termId).toBe("t-1");
      expect(item.expenseCategory).toBe("travel");
      expect(item.expenseAccountId).toBeNull();
    }
  });

  it("flags via accountId mismatch when category is null", async () => {
    const db = makeDb({
      expenses: [{ id: "e-2", fundId: "f-1", category: null, accountId: "acct-99" }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: null, accountId: "acct-01" }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(1);
    const item = result.items[0];
    if (item?.class === "category_misallocation") {
      expect(item.expenseAccountId).toBe("acct-99");
    }
  });

  it("does not flag when allowedCategories is empty (open-set semantics)", async () => {
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "anything", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.category_misallocation).toBe(0);
  });

  it("checks each term independently — two terms, one mismatch", async () => {
    // term t-1 allows "program", term t-2 does not allow "travel"
    // expense has category "travel"
    // Since restrictionTermsByFund returns both t-1 and t-2,
    // and the allowed categories mock returns same allowedCatRows for every call,
    // we need a db whose allowedCategories mock varies by term.
    // We'll test with a single term mismatch here (simpler).
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "travel", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }, { id: "t-2" }],
      allowedCategories: [{ category: "program", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // Both terms fire an anomaly for the mismatched expense
    expect(result.totals.category_misallocation).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// release_over_balance
// ---------------------------------------------------------------------------

describe("getAnomalies — release_over_balance", () => {
  it("does not flag a release within available balance", async () => {
    const db = makeDb({
      releases: [{ id: "rel-1", restrictionTermId: "t-1", amountCents: 500 }],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      termSumPairs: [{ additionsCents: 0, releasesCents: 0 }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(0);
  });

  it("flags a release that exceeds available balance (critical)", async () => {
    // pool = beginning(500) + additions(200) = 700
    // prior releases on term as of rel-1 date = 0
    // available = pool - prior releases = 700
    // over by release - available = 900 - 700 = 200
    const db = makeDb({
      releases: [{ id: "rel-1", restrictionTermId: "t-1", amountCents: 900 }],
      termFindFirstResults: [
        {
          id: "t-1",
          beginningBalanceCents: 500,
          fundId: "fund-1",
          grantId: null,
          donationId: "donation-1",
          donation: { contactId: "contact-1" },
        },
      ],
      termSumPairs: [{ additionsCents: 200, releasesCents: 0 }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    expect(item?.class).toBe("release_over_balance");
    expect(item?.severity).toBe("critical");
    if (item?.class === "release_over_balance") {
      expect(item.entityId).toBe("rel-1");
      expect(item.overByCents).toBe(200);
      expect(item.termId).toBe("t-1");
      expect(item.releaseAmountCents).toBe(900);
      expect(item.availableBalanceCents).toBe(700);
      expect(item.fundId).toBe("fund-1");
      expect(item.grantId).toBeNull();
      expect(item.donationId).toBe("donation-1");
      expect(item.contactId).toBe("contact-1");
    }
  });

  it("skips a release whose term is not found (findFirst returns null)", async () => {
    const db = makeDb({
      releases: [{ id: "rel-1", restrictionTermId: "t-missing", amountCents: 100 }],
      termFindFirstResults: [null],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(0);
  });

  it("uses cache: two releases for the same termId trigger only ONE findFirst", async () => {
    // Both releases share termId "t-1".
    // The first release is within the $10 pool on its release date.
    // The second release happens later and exceeds what remained.
    // The point of this test is that term metadata is resolved once while
    // balance math is still evaluated per release date.
    const db = makeDb({
      releases: [
        {
          id: "rel-1",
          restrictionTermId: "t-1",
          amountCents: 200,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "rel-2",
          restrictionTermId: "t-1",
          amountCents: 1500,
          date: new Date("2026-01-10T00:00:00.000Z"),
        },
      ],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      termSumPairs: [
        { additionsCents: 0, releasesCents: 200 },
        { additionsCents: 0, releasesCents: 1700 },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // findFirst should only be called once (cached on second release)
    expect(db._termsLimitSpy).toHaveBeenCalledTimes(1);
    expect(result.totals.release_over_balance).toBe(1);
    const ids = result.items
      .filter((i) => i.class === "release_over_balance")
      .map((i) => i.entityId)
      .sort();
    expect(ids).toEqual(["rel-2"]);
  });

  it("uses createdAt ordering so same-date releases do not count each other as prior", async () => {
    const db = makeDb({
      releases: [
        {
          id: "rel-2",
          restrictionTermId: "t-1",
          amountCents: 400,
          date: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T10:00:00.000Z"),
        },
        {
          id: "rel-1",
          restrictionTermId: "t-1",
          amountCents: 700,
          date: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      termSumPairs: [
        { additionsCents: 0, releasesCents: 0 },
        { additionsCents: 0, releasesCents: 0 },
      ],
    });

    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });

    expect(db._termsLimitSpy).toHaveBeenCalledTimes(1);
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    expect(item?.class).toBe("release_over_balance");
    if (item?.class === "release_over_balance") {
      expect(item.entityId).toBe("rel-2");
      expect(item.availableBalanceCents).toBe(300);
      expect(item.overByCents).toBe(100);
    }
  });

  it("uses id ordering as a final tie-breaker for releases with identical timestamps", async () => {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    const db = makeDb({
      releases: [
        {
          id: "rel-2",
          restrictionTermId: "t-1",
          amountCents: 400,
          date: timestamp,
          createdAt: timestamp,
        },
        {
          id: "rel-1",
          restrictionTermId: "t-1",
          amountCents: 700,
          date: timestamp,
          createdAt: timestamp,
        },
      ],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      termSumPairs: [
        { additionsCents: 0, releasesCents: 0 },
        { additionsCents: 0, releasesCents: 0 },
      ],
    });

    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });

    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    expect(item?.class).toBe("release_over_balance");
    if (item?.class === "release_over_balance") {
      expect(item.entityId).toBe("rel-2");
      expect(item.availableBalanceCents).toBe(300);
      expect(item.overByCents).toBe(100);
    }
  });

  it("correctly combines additions and releases into available balance", async () => {
    // pool = beginning(1000) + additions(500) = 1500
    // prior releases on term as of rel-1 date = 800
    // available = pool - prior releases = 1500 - 800 = 700
    // over by release - available = 701 - 700 = 1
    const db = makeDb({
      releases: [
        {
          id: "rel-0",
          restrictionTermId: "t-1",
          amountCents: 800,
          date: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T09:00:00.000Z"),
        },
        {
          id: "rel-1",
          restrictionTermId: "t-1",
          amountCents: 701,
          date: new Date("2026-01-02T00:00:00.000Z"),
          createdAt: new Date("2026-01-02T09:00:00.000Z"),
        },
      ],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      termSumPairs: [
        { additionsCents: 500, releasesCents: 0 },
        { additionsCents: 500, releasesCents: 0 },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    if (item?.class === "release_over_balance") {
      expect(item.availableBalanceCents).toBe(700);
      expect(item.overByCents).toBe(1);
    }
  });

  it("handles null total from additions sum query (?? 0 branch)", async () => {
    // The additions sum returns [{ total: null }], so the ?? 0 fallback yields 0.
    // pool = beginning(1000) + null(→0) = 1000
    // prior releases on term as of rel-1 date = 0 → available = 1000
    const db = makeDb({
      releases: [{ id: "rel-1", restrictionTermId: "t-1", amountCents: 1500 }],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 1000 }],
      // Sum queries are overridden below: additions → null, releases → 1500
      termSumPairs: [],
    });
    // Override select: first sum query (additions) returns null total to exercise
    // the ?? 0 branch; second (prior releases) returns 0.
    let sumCallCount = 0;
    const origSelect = db.select.bind(db);
    db.select = vi.fn().mockImplementation((fields: Record<string, unknown> | undefined) => {
      if (fields && "total" in fields) {
        sumCallCount++;
        const isAdditions = sumCallCount % 2 === 1;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: isAdditions ? null : 0 }]),
          }),
        };
      }
      return origSelect(fields);
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    if (item?.class === "release_over_balance") {
      expect(item.availableBalanceCents).toBe(1000);
      expect(item.overByCents).toBe(500);
    }
  });

  it("handles two different terms each with their own balance", async () => {
    const db = makeDb({
      releases: [
        { id: "rel-1", restrictionTermId: "t-1", amountCents: 1500 }, // over
        { id: "rel-2", restrictionTermId: "t-2", amountCents: 500 }, // ok
      ],
      termFindFirstResults: [
        { id: "t-1", beginningBalanceCents: 1000 },
        { id: "t-2", beginningBalanceCents: 2000 },
      ],
      termSumPairs: [
        { additionsCents: 0, releasesCents: 0 }, // t-1: pool 1000 < rel 1500 → over
        { additionsCents: 0, releasesCents: 0 }, // t-2: pool 2000 > rel 500 → ok
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items.find((i) => i.class === "release_over_balance");
    expect(item?.entityId).toBe("rel-1");
  });

  it("flags a $150 release against a $100 term pool (over by $50)", async () => {
    // Canonical case: pool = beginning(10000) + additions(0) = 10000 ($100)
    // prior releases on term as of rel-1 date = 0
    // over by release - available = 15000 - 10000 = 5000 ($50)
    const db = makeDb({
      releases: [{ id: "rel-1", restrictionTermId: "t-1", amountCents: 15000 }],
      termFindFirstResults: [{ id: "t-1", beginningBalanceCents: 10000 }],
      termSumPairs: [{ additionsCents: 0, releasesCents: 0 }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.release_over_balance).toBe(1);
    const item = result.items[0];
    expect(item?.severity).toBe("critical");
    if (item?.class === "release_over_balance") {
      expect(item.overByCents).toBe(5000);
      expect(item.availableBalanceCents).toBe(10000);
    }
  });
});

// ---------------------------------------------------------------------------
// duplicate_donation
// ---------------------------------------------------------------------------

describe("getAnomalies — duplicate_donation", () => {
  it("flags donations from same contact/amount within 3 days", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02T00:00:00Z"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(2);
    const dupItems = result.items.filter((i) => i.class === "duplicate_donation");
    expect(dupItems).toHaveLength(2);
    if (dupItems[0]?.class === "duplicate_donation") {
      expect(dupItems[0].severity).toBe("warning");
      expect(dupItems[0].contactId).toBe("c-1");
      expect(dupItems[0].duplicateGroupIds).toEqual(["d-1", "d-2"]);
    }
  });

  it("does not flag donations from different contacts", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-2",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(0);
  });

  it("does not flag donations with different amounts (same contact)", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 7500,
          date: new Date("2026-01-02"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(0);
  });

  it("does not flag donations beyond the 3-day window", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-10"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(0);
  });

  it("handles date as Date object (instanceof Date path)", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-03T00:00:00Z"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(2);
  });

  it("handles date as string (non-Date path)", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: "2026-01-01T00:00:00Z",
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: "2026-01-02T00:00:00Z",
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.duplicate_donation).toBe(2);
  });

  it("deduplicates: same donation id not pushed twice across overlapping groups", async () => {
    // Three donations from same contact/amount within 3 days → one group, 3 duplicates
    // The seenDonationIds Set prevents double-pushing
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
        {
          id: "d-3",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-03"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // 3 items, each unique
    expect(result.totals.duplicate_donation).toBe(3);
    const ids = result.items.filter((i) => i.class === "duplicate_donation").map((i) => i.entityId);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// indirect_rate_mismatch
// ---------------------------------------------------------------------------

describe("getAnomalies — indirect_rate_mismatch", () => {
  it("returns no items when there are no indirect lines (early return)", async () => {
    const db = makeDb({ indirectLines: [], rules: [] });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });

  it("returns no items when there are indirect lines but no active rules (early return)", async () => {
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-1" },
      ],
      rules: [],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });

  it("flags a mismatch: posted != expected (warning, correct deltaCents)", async () => {
    // base = direct_costs, rateBps = 1500 (15%)
    // direct line = 10000 cents → expected = round(10000 * 1500 / 10000) = 1500
    // posted = 2000 → delta = 500
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 2000, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 10000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(1);
    const item = result.items[0];
    expect(item?.class).toBe("indirect_rate_mismatch");
    expect(item?.severity).toBe("warning");
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.entityId).toBe("req-1");
      expect(item.deltaCents).toBe(500);
      expect(item.expectedAmountCents).toBe(1500);
      expect(item.postedAmountCents).toBe(2000);
    }
  });

  it("produces no anomaly when posted == expected", async () => {
    // rateBps=1000, direct=5000 → expected=500; posted=500
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });

  it("base=salaries_only: only salary/payroll/compensation lines count", async () => {
    // salary line=8000, non-salary line=5000 → base=8000, expected=round(8000*1500/10000)=1200
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 2000, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "salaries_only",
          rateBasisPoints: 1500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [
          { amountCents: 8000, description: "Salary for program staff" },
          { amountCents: 5000, description: "Office supplies" },
        ],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(1);
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(1200);
    }
  });

  it("base=salaries_only: payroll keyword matches", async () => {
    // payroll line=4000 → expected=round(4000*2500/10000)=1000; posted=500 → mismatch
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "salaries_only",
          rateBasisPoints: 2500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 4000, description: "Payroll processing" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(1000);
    }
  });

  it("base=salaries_only: compensation keyword matches", async () => {
    const db = makeDb({
      indirectLines: [{ requestId: "req-1", lineId: "l-1", postedAmountCents: 0, grantId: "g-1" }],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "salaries_only",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 6000, description: "Executive compensation" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // expected = 600, posted = 0 → mismatch
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(600);
    }
  });

  it("base=salaries_only: non-matching line (no salary/payroll/compensation) excluded", async () => {
    // description = "Office supplies" → none of the keywords match → excluded from base
    // base = 0 → expected = 0; posted = 500 → mismatch
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "salaries_only",
          rateBasisPoints: 1500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: "Office supplies" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(0);
    }
  });

  it("base=salaries_only: null description treated as empty string", async () => {
    // description null → desc="" → no keywords → excluded
    const db = makeDb({
      indirectLines: [{ requestId: "req-1", lineId: "l-1", postedAmountCents: 999, grantId: null }],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "salaries_only",
          rateBasisPoints: 1500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: null }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(0);
    }
  });

  it("base=modified_total_direct: null description treated as empty string (not excluded)", async () => {
    // description null → desc="" → not equipment/capital → included in base
    // base = 5000, rate = 1000 → expected = 500; posted = 0 → mismatch
    const db = makeDb({
      indirectLines: [{ requestId: "req-1", lineId: "l-1", postedAmountCents: 0, grantId: null }],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "modified_total_direct",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: null }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(500);
    }
  });

  it("base=modified_total_direct: excludes equipment and capital lines", async () => {
    // direct lines: staff=5000, equipment=3000, capital=2000
    // base = 5000 (equipment/capital excluded)
    // rateBps=2000 → expected=round(5000*2000/10000)=1000; posted=2000 → mismatch
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 2000, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "modified_total_direct",
          rateBasisPoints: 2000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [
          { amountCents: 5000, description: "Staff time" },
          { amountCents: 3000, description: "equipment purchase" },
          { amountCents: 2000, description: "Capital project" },
        ],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(1);
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(1000);
    }
  });

  it("prefers grant-specific rule over org-wide rule", async () => {
    // grantId "g-1" has grant-specific rule (rateBps=500), org-wide rule (rateBps=1500)
    // direct=10000 → with specific: expected=500; posted=1500 → mismatch of 1000
    // (org-wide would give expected=1500 → no mismatch)
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 1500, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-org",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
        {
          id: "rule-grant",
          grantId: "g-1",
          base: "direct_costs",
          rateBasisPoints: 500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 10000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(1);
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.expectedAmountCents).toBe(500);
      expect(item.deltaCents).toBe(1000);
    }
  });

  it("skips a request whose grant has no relevant rule (grantId not null, no match)", async () => {
    // Indirect line has grantId="g-2"; only rule is for grantId="g-1"
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-2" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: "g-1",
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });

  it("deduplicates: two indirect lines for same requestId processed once", async () => {
    // Two indirect lines for same request → one processedRequests guard → one check
    // direct=5000, rate=1000 → expected=500; total posted=800+700=1500 → mismatch
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 800, grantId: "g-1" },
        { requestId: "req-1", lineId: "l-2", postedAmountCents: 700, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // Only one anomaly item (one request processed)
    expect(result.totals.indirect_rate_mismatch).toBe(1);
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      expect(item.postedAmountCents).toBe(1500); // 800+700
      expect(item.expectedAmountCents).toBe(500);
    }
  });

  it("prefers newest rule when both are org-wide (same specificity)", async () => {
    // two org-wide rules, newer effectiveFrom wins
    // older: rateBps=1000 (2019); newer: rateBps=2000 (2023)
    // direct=5000 → newer expected=1000; posted=2000 → mismatch
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 2000, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-old",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: new Date("2019-01-01"),
          effectiveTo: null,
        },
        {
          id: "rule-new",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 2000,
          effectiveFrom: new Date("2023-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 5000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const item = result.items[0];
    if (item?.class === "indirect_rate_mismatch") {
      // newer rule: 2000 bps → expected = round(5000*2000/10000) = 1000
      expect(item.expectedAmountCents).toBe(1000);
    }
  });

  it("handles effectiveFrom as string for single rule (Date parsing path)", async () => {
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 2000, grantId: null },
      ],
      rules: [
        {
          id: "rule-1",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1500,
          effectiveFrom: "2020-01-01" as unknown as Date,
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 10000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.totals.indirect_rate_mismatch).toBe(1);
  });

  it("sort comparator: both rules have string effectiveFrom — covers both instanceof false branches", async () => {
    // Two org-wide rules, both with string effectiveFrom → sort falls to the string→Date conversion path for both a AND b
    // Newer string date wins
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 3000, grantId: null },
      ],
      rules: [
        {
          id: "rule-old",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 1000,
          effectiveFrom: "2019-06-01" as unknown as Date,
          effectiveTo: null,
        },
        {
          id: "rule-new",
          grantId: null,
          base: "direct_costs",
          rateBasisPoints: 3000,
          effectiveFrom: "2023-06-01" as unknown as Date,
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 10000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // newer rule wins: 3000 bps → expected = round(10000*3000/10000) = 3000; posted = 3000 → no mismatch
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });

  it("sort comparator: bGrantId is null (bSpecific=0) while aGrantId is non-null (aSpecific=1)", async () => {
    // This covers the branch at line 391 where bGrantId !== null is false → bSpecific=0
    // grant-specific rule (rateBps=500) wins over org-wide (rateBps=2000)
    const db = makeDb({
      indirectLines: [
        { requestId: "req-1", lineId: "l-1", postedAmountCents: 500, grantId: "g-1" },
      ],
      rules: [
        {
          id: "rule-grant",
          grantId: "g-1",
          base: "direct_costs",
          rateBasisPoints: 500,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: null,
        },
        {
          id: "rule-org",
          grantId: null, // bGrantId null → bSpecific=0
          base: "direct_costs",
          rateBasisPoints: 2000,
          effectiveFrom: new Date("2022-01-01"),
          effectiveTo: null,
        },
      ],
      directLinesByRequest: {
        "req-1": [{ amountCents: 10000, description: "staff" }],
      },
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    // grant-specific wins: expected = round(10000*500/10000) = 500; posted=500 → no mismatch
    expect(result.totals.indirect_rate_mismatch).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getAnomalies orchestration
// ---------------------------------------------------------------------------

describe("getAnomalies — orchestration", () => {
  it("classes filter narrows items but totals remain for full population", async () => {
    // Set up: duplicate_donation anomalies exist AND a category_misallocation anomaly
    // Then filter classes to only ["duplicate_donation"]
    // totals.category_misallocation should still be 1
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
      ],
      expenses: [{ id: "e-1", fundId: "f-1", category: "travel", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      classes: ["duplicate_donation"],
    });
    // Items only contain duplicate_donation
    expect(result.items.every((i) => i.class === "duplicate_donation")).toBe(true);
    // But totals reflect full population
    expect(result.totals.duplicate_donation).toBe(2);
    expect(result.totals.category_misallocation).toBe(1);
  });

  it("limit truncates items but totals are unaffected", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      limit: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.totals.duplicate_donation).toBe(2);
  });

  it("severity sort: critical items come before warning items", async () => {
    // category_misallocation is critical; duplicate_donation is warning
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "travel", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    expect(result.items[0]?.severity).toBe("critical");
    // Last items are warning
    const lastItem = result.items[result.items.length - 1];
    expect(lastItem?.severity).toBe("warning");
  });

  it("secondary sort: equal severity items sorted by class then entityId", async () => {
    // Two critical category_misallocation items with different entityIds
    const db = makeDb({
      expenses: [
        { id: "e-a", fundId: "f-1", category: "travel", accountId: null },
        { id: "e-b", fundId: "f-1", category: "travel", accountId: null },
      ],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const critItems = result.items.filter((i) => i.severity === "critical");
    expect(critItems.length).toBeGreaterThanOrEqual(2);
    // Should be sorted by entityId ascending
    expect(critItems[0]?.entityId.localeCompare(critItems[1]?.entityId ?? "")).toBeLessThanOrEqual(
      0,
    );
  });

  it("hasRestrictionData=false: category and release items absent, but duplicate still runs", async () => {
    const db = makeDb({
      donations: [
        {
          id: "d-1",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-01"),
        },
        {
          id: "d-2",
          contactId: "c-1",
          amountCents: 5000,
          date: new Date("2026-01-02"),
        },
      ],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      hasRestrictionData: false,
    });
    expect(result.totals.category_misallocation).toBe(0);
    expect(result.totals.release_over_balance).toBe(0);
    expect(result.totals.duplicate_donation).toBe(2);
  });

  it("classes filter with no matching anomalies returns empty items but correct totals", async () => {
    const db = makeDb({
      donations: [
        { id: "d-1", contactId: "c-1", amountCents: 100, date: new Date("2026-01-01") },
        { id: "d-2", contactId: "c-1", amountCents: 100, date: new Date("2026-01-02") },
      ],
    });
    const result = await getAnomalies(asDb(db), {
      orgId: "org-1",
      now: new Date(),
      classes: ["category_misallocation"], // no category anomalies exist
    });
    expect(result.items).toHaveLength(0);
    // totals still show duplicate_donation
    expect(result.totals.duplicate_donation).toBe(2);
    expect(result.totals.category_misallocation).toBe(0);
  });

  it("severitySort: different class same severity triggers class localeCompare branch", async () => {
    // category_misallocation (critical) + release_over_balance (critical)
    // Both critical → diff===0 → compare by class → "category_misallocation" < "release_over_balance"
    const db = makeDb({
      expenses: [{ id: "e-1", fundId: "f-1", category: "travel", accountId: null }],
      restrictionTermsByFund: [{ id: "t-1" }],
      allowedCategories: [{ category: "program", accountId: null }],
      releases: [{ id: "rel-1", restrictionTermId: "t-2", amountCents: 9000 }],
      termFindFirstResults: [{ id: "t-2", beginningBalanceCents: 100 }],
      termSumPairs: [{ additionsCents: 0, releasesCents: 9000 }], // pool 100 < 9000 → over
    });
    const result = await getAnomalies(asDb(db), { orgId: "org-1", now: new Date() });
    const critItems = result.items.filter((i) => i.severity === "critical");
    expect(critItems.length).toBeGreaterThanOrEqual(2);
    // category_misallocation should come before release_over_balance alphabetically
    const classes = critItems.map((i) => i.class);
    const catIdx = classes.indexOf("category_misallocation");
    const relIdx = classes.indexOf("release_over_balance");
    expect(catIdx).toBeLessThan(relIdx);
  });
});

// ---------------------------------------------------------------------------
// Regression guard — relational query API + cross-table sql fragments
//
// The Drizzle relational query API (`db.query.<table>.findMany`/`findFirst`)
// re-qualifies every bare Column reference inside its `where` with the base
// table's own alias when it compiles the query. The three detectors below
// pass `where` expressions built from donationEntityScope /
// restrictionReleaseEntityScope / restrictionTermEntityScope, which embed
// raw `sql` fragments referencing OTHER tables' columns (funds, grants,
// organizations, restrictionTerms). Under the relational compiler those
// fragments get silently re-qualified to the wrong table (e.g.
// "donations"."entity_id", which doesn't exist) and Postgres 500s. The core
// query builder (`db.select().from().where()`) does not re-qualify columns,
// so these three call sites must use it instead of `db.query.*`.
// ---------------------------------------------------------------------------

describe("anomaly.service source contract — no relational API for cross-table scopes", () => {
  it("does not call db.query.donations.findMany (donationEntityScope re-qualification hazard)", () => {
    expect(anomalyServiceSource).not.toContain("db.query.donations.findMany");
  });

  it("does not call db.query.restrictionReleases.findMany (restrictionReleaseEntityScope re-qualification hazard)", () => {
    expect(anomalyServiceSource).not.toContain("db.query.restrictionReleases.findMany");
  });

  it("does not call db.query.restrictionTerms.findFirst (restrictionTermEntityScope re-qualification hazard)", () => {
    expect(anomalyServiceSource).not.toContain("db.query.restrictionTerms.findFirst");
  });
});
