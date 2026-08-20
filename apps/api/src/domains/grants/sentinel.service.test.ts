import { describe, it, expect, vi } from "vitest";
import { getBudgetSentinel } from "./sentinel.service";

// ---------------------------------------------------------------------------
// Helpers to build fake DB
// ---------------------------------------------------------------------------

type MockVersion = {
  id: string;
  grantId: string;
};

type MockGrant = {
  id: string;
  name: string;
  status: string;
};

type MockFund = {
  id: string;
};

type MockLine = {
  id: string;
  category: string;
  approvedAmountCents: number;
  allowable: boolean;
  costType: string;
  budgetVersionId: string;
};

type MockAllocation = {
  budgetLineId: string;
  amountCents: number;
  expenseId?: string | null;
  expense?: { deletedAt: Date | null } | null;
};

type MockPlanned = {
  budgetLineId: string;
  amountCents: number;
};

type MockTerm = {
  id: string;
  orgId: string;
  fundId: string | null;
  grantId: string | null;
  title: string;
  endDate: Date;
  beginningBalanceCents: number;
  deletedAt: null;
  fund?: { id: string; name: string } | null;
  additions?: { amountCents: number }[];
  releases?: { amountCents: number }[];
};

function buildDb(opts: {
  versions?: MockVersion[];
  grants?: MockGrant[];
  funds?: MockFund[];
  lines?: MockLine[];
  allocations?: MockAllocation[];
  planned?: MockPlanned[];
  terms?: MockTerm[];
}) {
  const versions = opts.versions ?? [];
  const grantsList = opts.grants ?? [];
  const fundsList = opts.funds ?? [];
  const lines = opts.lines ?? [];
  const allocs = opts.allocations ?? [];
  const plannedList = opts.planned ?? [];
  const terms = opts.terms ?? [];

  return {
    query: {
      grantBudgetVersions: {
        findMany: vi.fn(async (_queryArg?: unknown) => versions),
      },
      grants: {
        findMany: vi.fn(async (_queryArg?: unknown) => grantsList),
      },
      funds: {
        findMany: vi.fn(async (_queryArg?: unknown) => fundsList),
      },
      grantBudgetLines: {
        findMany: vi.fn(async (_queryArg?: unknown) => lines),
      },
      grantBudgetLineAllocations: {
        findMany: vi.fn(async (_queryArg?: unknown) => allocs),
      },
      plannedExpenses: {
        findMany: vi.fn(async (_queryArg?: unknown) => plannedList),
      },
      restrictionTerms: {
        findMany: vi.fn(async (_queryArg?: unknown) => terms),
      },
    },
  };
}

function collectColumnNames(node: unknown, acc: Set<string>): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const child of node) collectColumnNames(child, acc);
    return;
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.name === "string" && "table" in record) {
      acc.add(record.name);
    }
    if (Array.isArray(record.queryChunks)) {
      collectColumnNames(record.queryChunks, acc);
    }
  }
}

function expectEntityScopedWhere(queryArg: unknown): void {
  const columns = new Set<string>();
  const where = (queryArg as { where?: unknown }).where;
  collectColumnNames(where, columns);
  expect(columns).toContain("entity_id");
}

function expectWhereContainsColumns(queryArg: unknown, expectedColumns: string[]): void {
  const columns = new Set<string>();
  const where = (queryArg as { where?: unknown }).where;
  collectColumnNames(where, columns);
  for (const column of expectedColumns) {
    expect(columns).toContain(column);
  }
}

function expectWhereOmitsColumns(queryArg: unknown, omittedColumns: string[]): void {
  const columns = new Set<string>();
  const where = (queryArg as { where?: unknown }).where;
  collectColumnNames(where, columns);
  for (const column of omittedColumns) {
    expect(columns).not.toContain(column);
  }
}

function firstMockArg(calls: unknown[][], callIndex = 0): unknown {
  const call = calls[callIndex];
  if (!call) throw new Error(`Expected mock call ${callIndex}`);
  return call[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-16T14:00:00.000Z");
const ORG_ID = "org-1";

describe("getBudgetSentinel", () => {
  it("returns empty items and zero totals when no data", async () => {
    const db = buildDb({});
    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.asOf).toBeInstanceOf(Date);
    expect(result.items).toEqual([]);
    expect(result.totals.totalAtRisk).toBe(0);
    expect(result.totals.overspend.total).toBe(0);
    expect(result.totals.underspend.total).toBe(0);
  });

  it("adds active entity scope to Sentinel data queries when entityId is provided", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      funds: [{ id: "fund-1" }],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-1", amountCents: 11_000 }],
      planned: [{ budgetLineId: "line-1", amountCents: 0 }],
      terms: [
        {
          id: "term-1",
          orgId: ORG_ID,
          fundId: "fund-1",
          grantId: null,
          title: "Youth Fund",
          endDate: new Date("2026-06-30T00:00:00.000Z"),
          beginningBalanceCents: 50_000,
          deletedAt: null,
          fund: { id: "fund-1", name: "Youth Fund" },
          additions: [],
          releases: [],
        },
      ],
    });

    await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW, entityId: "entity-1" });

    expectEntityScopedWhere(firstMockArg(db.query.grantBudgetVersions.findMany.mock.calls));
    expectEntityScopedWhere(firstMockArg(db.query.grants.findMany.mock.calls));
    expectEntityScopedWhere(firstMockArg(db.query.grantBudgetLines.findMany.mock.calls));
    expectEntityScopedWhere(firstMockArg(db.query.grantBudgetLineAllocations.findMany.mock.calls));
    expectEntityScopedWhere(firstMockArg(db.query.plannedExpenses.findMany.mock.calls));
    expectEntityScopedWhere(firstMockArg(db.query.grants.findMany.mock.calls, 1));
    expectEntityScopedWhere(firstMockArg(db.query.funds.findMany.mock.calls));
    expectWhereContainsColumns(firstMockArg(db.query.restrictionTerms.findMany.mock.calls), [
      "fund_id",
      "grant_id",
    ]);

    const termQuery = firstMockArg(db.query.restrictionTerms.findMany.mock.calls) as {
      with?: {
        additions?: { where?: unknown };
        releases?: { where?: unknown };
      };
    };
    expectWhereContainsColumns(termQuery.with?.additions, ["deleted_at"]);
    expectWhereContainsColumns(termQuery.with?.releases, ["deleted_at"]);
  });

  it("scopes restriction terms by grant when an entity has grants but no funds", async () => {
    const db = buildDb({
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
    });

    await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW, entityId: "entity-1" });

    const termQuery = firstMockArg(db.query.restrictionTerms.findMany.mock.calls);
    expectWhereContainsColumns(termQuery, ["grant_id"]);
    expectWhereOmitsColumns(termQuery, ["fund_id"]);
  });

  it("uses a no-match restriction scope when an entity has no linked grants or funds", async () => {
    const db = buildDb({});

    await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW, entityId: "entity-1" });

    const termQuery = firstMockArg(db.query.restrictionTerms.findMany.mock.calls);
    expectWhereContainsColumns(termQuery, ["id"]);
    expectWhereOmitsColumns(termQuery, ["fund_id", "grant_id"]);
  });

  it("skips the planned expense query when active lines cannot map back to grants", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "missing-version",
        },
      ],
    });

    await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(db.query.plannedExpenses.findMany).not.toHaveBeenCalled();
  });

  it("classifies over_budget line and includes it in items", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-1", amountCents: 12_000 }],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item).toBeDefined();
    if (item?.kind !== "overspend") throw new Error("Expected overspend");
    expect(item.kind).toBe("overspend");
    expect(item.band).toBe("over_budget");
    expect(item.grantName).toBe("Grant A");
    expect(item.category).toBe("Personnel");
    expect(item.overByCents).toBe(2_000);
    expect(item.riskScore).toBeGreaterThan(0);

    expect(result.totals.overspend.over_budget).toBe(1);
    expect(result.totals.totalAtRisk).toBe(1);
  });

  it("ignores allocations whose linked expense was soft-deleted", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [
        {
          budgetLineId: "line-1",
          amountCents: 12_000,
          expenseId: "expense-1",
          expense: { deletedAt: new Date("2026-06-15T00:00:00.000Z") },
        },
      ],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items).toHaveLength(0);
    expect(result.totals.overspend.total).toBe(0);
    expect(result.totals.totalAtRisk).toBe(0);
  });

  it("classifies projected_overspend line (actual ok, projected > approved)", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant B", status: "active" }],
      lines: [
        {
          id: "line-1",
          category: "Travel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-1", amountCents: 5_000 }],
      planned: [{ budgetLineId: "line-1", amountCents: 6_000 }],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    if (item?.kind !== "overspend") throw new Error("Expected overspend");
    expect(item.band).toBe("projected_overspend");
    expect(result.totals.overspend.projected_overspend).toBe(1);
  });

  it("excludes ok lines from items but includes near_limit in items and totals", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant C", status: "active" }],
      lines: [
        {
          id: "line-ok",
          category: "Equipment",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
        {
          id: "line-near",
          category: "Supplies",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      // ok: actual 2000/10000 = 20%
      // near_limit: actual 9100/10000 = 91% (>= 90% near_limit threshold but not over)
      allocations: [
        { budgetLineId: "line-ok", amountCents: 2_000 },
        { budgetLineId: "line-near", amountCents: 9_100 },
      ],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    // ok should NOT be in items; near_limit should be in items (visible in the UI)
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("line-near");
    expect(result.items[0]).toMatchObject({ kind: "overspend", band: "near_limit" });
    // near_limit tracked in totals
    expect(result.totals.overspend.near_limit).toBe(1);
    expect(result.totals.totalAtRisk).toBe(1);
  });

  it("classifies lapsed_unspent term (past end date, positive balance)", async () => {
    const PAST = new Date("2026-01-01T00:00:00.000Z");
    const db = buildDb({
      terms: [
        {
          id: "term-1",
          orgId: ORG_ID,
          fundId: "fund-1",
          grantId: null,
          title: "Youth Program Restriction",
          endDate: PAST,
          beginningBalanceCents: 5_000,
          deletedAt: null,
          fund: { id: "fund-1", name: "Youth Fund" },
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    if (item?.kind !== "underspend") throw new Error("Expected underspend");
    expect(item.kind).toBe("underspend");
    expect(item.band).toBe("lapsed_unspent");
    expect(item.balanceCents).toBe(5_000);
    expect(item.fundName).toBe("Youth Fund");
    expect(item.title).toBe("Youth Program Restriction");
    expect(item.riskScore).toBeGreaterThan(0);

    expect(result.totals.underspend.lapsed_unspent).toBe(1);
    expect(result.totals.totalAtRisk).toBe(1);
  });

  it("classifies lapsing_soon term (within 30 days, positive balance)", async () => {
    const SOON = new Date("2026-06-26T00:00:00.000Z"); // 10 days from NOW
    const db = buildDb({
      terms: [
        {
          id: "term-2",
          orgId: ORG_ID,
          fundId: "fund-2",
          grantId: "g-1",
          title: "Tech Grant Restriction",
          endDate: SOON,
          beginningBalanceCents: 8_000,
          deletedAt: null,
          fund: { id: "fund-2", name: "Tech Fund" },
          additions: [{ amountCents: 2_000 }],
          releases: [{ amountCents: 1_000 }],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    if (item?.kind !== "underspend") throw new Error("Expected underspend");
    expect(item.band).toBe("lapsing_soon");
    // balance = 8000 + 2000 - 1000 = 9000
    expect(item.balanceCents).toBe(9_000);
    expect(item.daysUntilEnd).toBe(10);

    expect(result.totals.underspend.lapsing_soon).toBe(1);
  });

  it("excludes ok terms from items (balance=0)", async () => {
    const FUTURE = new Date("2026-12-31T00:00:00.000Z");
    const db = buildDb({
      terms: [
        {
          id: "term-zero",
          orgId: ORG_ID,
          fundId: "fund-3",
          grantId: null,
          title: "Spent Restriction",
          endDate: FUTURE,
          beginningBalanceCents: 0,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(0);
    expect(result.totals.totalAtRisk).toBe(0);
  });

  it("totals are computed over full population before kinds filter", async () => {
    const PAST = new Date("2026-01-01T00:00:00.000Z");
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-1", amountCents: 12_000 }],
      planned: [],
      terms: [
        {
          id: "term-1",
          orgId: ORG_ID,
          fundId: "fund-1",
          grantId: null,
          title: "Lapsed Term",
          endDate: PAST,
          beginningBalanceCents: 5_000,
          deletedAt: null,
          fund: { id: "fund-1", name: "Fund A" },
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, {
      orgId: ORG_ID,
      now: NOW,
      kinds: ["overspend"],
    });

    // Only overspend in items
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.kind).toBe("overspend");

    // But totals include both
    expect(result.totals.totalAtRisk).toBe(2);
    expect(result.totals.overspend.over_budget).toBe(1);
    expect(result.totals.underspend.lapsed_unspent).toBe(1);
  });

  it("limit is applied after kinds filter", async () => {
    const db = buildDb({
      versions: [
        { id: "v-1", grantId: "g-1" },
        { id: "v-2", grantId: "g-2" },
      ],
      grants: [
        { id: "g-1", name: "Grant A", status: "active" },
        { id: "g-2", name: "Grant B", status: "active" },
      ],
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
        {
          id: "line-2",
          category: "Travel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-2",
        },
      ],
      allocations: [
        { budgetLineId: "line-1", amountCents: 12_000 },
        { budgetLineId: "line-2", amountCents: 12_000 },
      ],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, {
      orgId: ORG_ID,
      now: NOW,
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    // Totals still count both
    expect(result.totals.overspend.over_budget).toBe(2);
    expect(result.totals.totalAtRisk).toBe(2);
  });

  it("excludes closed grants (closeout, declined)", async () => {
    const db = buildDb({
      versions: [{ id: "v-closed", grantId: "g-closed" }],
      grants: [{ id: "g-closed", name: "Closed Grant", status: "closeout" }],
      lines: [
        {
          id: "line-closed",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-closed",
        },
      ],
      allocations: [{ budgetLineId: "line-closed", amountCents: 15_000 }],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(0);
  });

  it.each(["submitted", "renewal", "discovery", "application", "declined"])(
    "excludes pre-award/non-executing grant status: %s",
    async (status) => {
      const db = buildDb({
        versions: [{ id: "v-1", grantId: "g-1" }],
        grants: [{ id: "g-1", name: "Pre-Award Grant", status }],
        lines: [
          {
            id: "line-1",
            category: "Personnel",
            approvedAmountCents: 10_000,
            allowable: true,
            costType: "direct",
            budgetVersionId: "v-1",
          },
        ],
        allocations: [{ budgetLineId: "line-1", amountCents: 15_000 }],
        planned: [],
      });

      const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
      expect(result.items).toHaveLength(0);
    },
  );

  it.each(["awarded", "active", "reporting"])(
    "includes executing grant status: %s",
    async (status) => {
      const db = buildDb({
        versions: [{ id: "v-1", grantId: "g-1" }],
        grants: [{ id: "g-1", name: "Active Grant", status }],
        lines: [
          {
            id: "line-1",
            category: "Personnel",
            approvedAmountCents: 10_000,
            allowable: true,
            costType: "direct",
            budgetVersionId: "v-1",
          },
        ],
        allocations: [{ budgetLineId: "line-1", amountCents: 15_000 }],
        planned: [],
      });

      const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.kind).toBe("overspend");
    },
  );

  it("excludes soft-deleted budget versions (no versions returned from DB)", async () => {
    const db = buildDb({
      versions: [],
      grants: [],
      lines: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(0);
  });

  it("items are sorted by riskScore desc, then by exposure amount desc", async () => {
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-small",
          category: "Travel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
        {
          id: "line-big",
          category: "Personnel",
          approvedAmountCents: 10_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [
        { budgetLineId: "line-small", amountCents: 10_500 }, // over by 500
        { budgetLineId: "line-big", amountCents: 50_000 }, // over by 40000
      ],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(2);
    // Higher riskScore (bigger overage) should be first
    expect(result.items[0]?.id).toBe("line-big");
    expect(result.items[1]?.id).toBe("line-small");
  });

  it("lapse_watch band is included in items", async () => {
    // 60 days from now = lapse_watch (30 < days <= 90)
    const WATCH_DATE = new Date("2026-08-15T00:00:00.000Z"); // ~60 days from June 16
    const db = buildDb({
      terms: [
        {
          id: "term-watch",
          orgId: ORG_ID,
          fundId: "fund-4",
          grantId: null,
          title: "Watch Term",
          endDate: WATCH_DATE,
          beginningBalanceCents: 3_000,
          deletedAt: null,
          fund: { id: "fund-4", name: "Watch Fund" },
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    if (item?.kind !== "underspend") throw new Error("Expected underspend");
    expect(item.band).toBe("lapse_watch");
    expect(result.totals.underspend.lapse_watch).toBe(1);
  });

  it("underspend tiebreaker: same riskScore sorts by balanceCents desc", async () => {
    // Two terms lapsed on the same date → same riskScore → tiebreak by balance
    const SAME_DATE = new Date("2026-06-15T00:00:00.000Z"); // 1 day ago
    const db = buildDb({
      terms: [
        {
          id: "term-small-bal",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "Small Balance",
          endDate: SAME_DATE,
          beginningBalanceCents: 500,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
        {
          id: "term-large-bal",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "Large Balance",
          endDate: SAME_DATE,
          beginningBalanceCents: 50_000,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(2);
    // Same riskScore (same date) → larger balance first
    expect(result.items[0]?.id).toBe("term-large-bal");
    expect(result.items[1]?.id).toBe("term-small-bal");
  });

  it("keeps underspend sorting stable when risk score and balance are equal", async () => {
    const sameEndDate = new Date("2026-06-15T00:00:00.000Z");
    const db = buildDb({
      terms: [
        {
          id: "term-a",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "Term A",
          endDate: sameEndDate,
          beginningBalanceCents: 10_000,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
        {
          id: "term-b",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "Term B",
          endDate: sameEndDate,
          beginningBalanceCents: 10_000,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });

    expect(result.items.map((item) => item.id)).toEqual(["term-a", "term-b"]);
  });

  it("sorts underspend items by riskScore desc, then balanceCents desc when scores differ", async () => {
    const PAST = new Date("2026-01-01T00:00:00.000Z"); // ~166 days ago
    const VERY_PAST = new Date("2025-01-01T00:00:00.000Z"); // ~531 days ago → higher riskScore
    const db = buildDb({
      terms: [
        {
          id: "term-small",
          orgId: ORG_ID,
          fundId: "fund-1",
          grantId: null,
          title: "Small Lapsed",
          endDate: PAST,
          beginningBalanceCents: 1_000,
          deletedAt: null,
          fund: { id: "fund-1", name: "Fund A" },
          additions: [],
          releases: [],
        },
        {
          id: "term-big",
          orgId: ORG_ID,
          fundId: "fund-2",
          grantId: null,
          title: "Big Lapsed Very Long Ago",
          endDate: VERY_PAST,
          beginningBalanceCents: 50_000,
          deletedAt: null,
          fund: { id: "fund-2", name: "Fund B" },
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(2);
    // VERY_PAST has more days lapsed → higher riskScore → comes first
    expect(result.items[0]?.id).toBe("term-big");
    expect(result.items[1]?.id).toBe("term-small");
  });

  it("merge interleaves overspend and underspend by riskScore (overspend >= underspend path)", async () => {
    const PAST = new Date("2026-06-15T00:00:00.000Z"); // 1 day ago
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [
        {
          id: "line-over",
          category: "Personnel",
          approvedAmountCents: 1_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-over", amountCents: 200_000 }],
      planned: [],
      terms: [
        {
          id: "term-lapsed",
          orgId: ORG_ID,
          fundId: "fund-1",
          grantId: null,
          title: "Just Lapsed",
          endDate: PAST,
          beginningBalanceCents: 1_000,
          deletedAt: null,
          fund: { id: "fund-1", name: "Fund A" },
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(2);
    expect(result.items.some((i) => i.kind === "overspend")).toBe(true);
    expect(result.items.some((i) => i.kind === "underspend")).toBe(true);
  });

  it("org isolation: does not return items from another org", async () => {
    const db = buildDb({ versions: [], grants: [], lines: [], terms: [] });
    const result = await getBudgetSentinel(db as never, { orgId: "other-org", now: NOW });
    expect(result.items).toHaveLength(0);
  });

  it("skips planned query when no active grant lines exist (grantIdsForLines empty path)", async () => {
    // Provide active versions + grants but empty lines — so `lines.length > 0` is false.
    // This exercises the early return from the lines-block.
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-1" }],
      grants: [{ id: "g-1", name: "Grant A", status: "active" }],
      lines: [],
      allocations: [],
      planned: [],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(0);
    expect(result.totals.totalAtRisk).toBe(0);
  });

  it("skips terms with null endDate (defensive guard for TypeScript narrowing)", async () => {
    // The query uses isNotNull(endDate) but the type is nullable; this tests the guard branch.
    const db = buildDb({
      terms: [
        {
          id: "term-null-end",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "Null End Term",
          endDate: null as unknown as Date,
          beginningBalanceCents: 5_000,
          deletedAt: null,
          fund: null,
          additions: [],
          releases: [],
        },
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(0);
  });

  it("handles terms with undefined additions/releases (nullable ?? [] fallback)", async () => {
    // The Drizzle `with:` result can theoretically return undefined for relational arrays.
    // This exercises the `?? []` fallback paths on lines 288 and 292.
    const PAST = new Date("2026-01-01T00:00:00.000Z");
    const db = buildDb({
      terms: [
        {
          id: "term-no-arrays",
          orgId: ORG_ID,
          fundId: null,
          grantId: null,
          title: "No Arrays Term",
          endDate: PAST,
          beginningBalanceCents: 3_000,
          deletedAt: null,
          fund: null,
          // additions and releases intentionally omitted → undefined at runtime
        } as MockTerm,
      ],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    if (item?.kind !== "underspend") throw new Error("Expected underspend");
    // balance = 3000 + 0 - 0 = 3000
    expect(item.balanceCents).toBe(3_000);
    expect(item.fundId).toBeNull();
    expect(item.fundName).toBeNull();
  });

  it("handles line whose grant is not in the fetched grants list (grant not found)", async () => {
    // Version points to g-ghost, but grants query returns nothing (deleted at DB level)
    const db = buildDb({
      versions: [{ id: "v-1", grantId: "g-ghost" }],
      grants: [], // grant not returned (e.g. soft-deleted at DB)
      lines: [
        {
          id: "line-ghost",
          category: "Supplies",
          approvedAmountCents: 5_000,
          allowable: true,
          costType: "direct",
          budgetVersionId: "v-1",
        },
      ],
      allocations: [{ budgetLineId: "line-ghost", amountCents: 7_000 }],
    });

    const result = await getBudgetSentinel(db as never, { orgId: ORG_ID, now: NOW });
    // Grant not found → version excluded → line not processed
    expect(result.items).toHaveLength(0);
  });
});
