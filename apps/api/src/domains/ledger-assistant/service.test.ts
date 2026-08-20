import { beforeEach, describe, expect, it, vi } from "vitest";
import { askLedger } from "./service";

vi.mock("../grants/sentinel.service", () => ({
  getBudgetSentinel: vi.fn(),
}));

const { getBudgetSentinel } = await import("../grants/sentinel.service");

type MockRestrictedFundBalanceRow = {
  termId: string;
  fundId: string | null;
  fundName: string | null;
  endingBalanceCents: number;
  periodEnd: Date;
};

/**
 * Creates a mock db that:
 * - Handles sequential `db.select()` calls via a queue (`selectRows`).
 *   The cap-check query uses `.from().where()` (resolved async).
 *   The restriction-balance query uses `.from().innerJoin().leftJoin().where().orderBy()`.
 *   Both are handled by the same queue: the first selectRows entry goes to the
 *   first select() call, the second to the second, etc.
 * - Tracks `db.insert()` calls so tests can assert usage recording.
 */
function createMockDb(
  options: {
    selectRows?: unknown[][];
    restrictionBalanceRows?: MockRestrictedFundBalanceRow[];
  } = {},
) {
  const selectQueue = [...(options.selectRows ?? [])];
  const restrictionRows = options.restrictionBalanceRows ?? [];

  const insertCalls: Array<{ values: ReturnType<typeof vi.fn> }> = [];

  const db = {
    select: vi.fn(() => {
      const rows = selectQueue.shift();
      // Build a chain that resolves to the queued rows if present,
      // otherwise resolves to the restriction balance rows (for the fund query).
      const resolvedRows = rows ?? restrictionRows;
      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        leftJoin: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(async () => resolvedRows),
        // Some select chains resolve at `.where()` (cap-check), not `.orderBy()`
        // We need `.where()` to be both thenable (for cap check) AND chainable (for fund query).
        // We achieve this by making `.where()` return a thenable chain.
      };
      // Override where to be async when no further chaining happens (cap check path)
      // but still return `chain` for method chaining. We use a Proxy trick:
      // Actually, the cap-check query does `db.select({count}).from(table).where(cond)`
      // and awaits the result. The restriction-balance query does
      // `.from().innerJoin().leftJoin().where().orderBy()` and awaits `.orderBy()`.
      // So `.where()` must return something awaitable for cap-check AND chainable for fund query.
      // We resolve `.where()` as a promise AND provide `.orderBy()` on the result.
      const whereResult = Object.assign(Promise.resolve(resolvedRows), {
        orderBy: vi.fn(async () => resolvedRows),
      });
      chain.where = vi.fn(() => whereResult as unknown as typeof chain);
      return chain;
    }),
    insert: vi.fn(() => {
      const insertChain = {
        values: vi.fn(async () => undefined),
      };
      insertCalls.push(insertChain);
      return insertChain;
    }),
  };

  return { db, insertCalls };
}

/**
 * Creates a db mock for restriction balance queries only (no cap check select),
 * used by Growth/uncapped tests where assertAiUsageWithinCap skips the DB query.
 */
function createDbWithRestrictionBalances(rows: MockRestrictedFundBalanceRow[]) {
  const insertCalls: Array<{ values: ReturnType<typeof vi.fn> }> = [];
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(async () => rows),
  };
  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => {
        const insertChain = { values: vi.fn(async () => undefined) };
        insertCalls.push(insertChain);
        return insertChain;
      }),
    },
    insertCalls,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOverspendSentinel(count: number) {
  return {
    asOf: new Date("2026-06-18T00:00:00Z"),
    totals: {
      overspend: { near_limit: 0, projected_overspend: count, over_budget: 0, total: count },
      underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
      totalAtRisk: count,
    },
    items: Array.from({ length: count }, (_, index) => ({
      kind: "overspend" as const,
      id: `line-${index}`,
      grantId: `grant-${index}`,
      grantName: `Grant ${index}`,
      category: "Travel",
      band: "projected_overspend" as const,
      approvedAmountCents: 100_000,
      actualCents: 75_000,
      plannedCents: 50_000,
      projectedCents: 125_000,
      overByCents: 25_000,
      utilizationPercent: 75,
      riskScore: 10,
    })),
  };
}

// ---------------------------------------------------------------------------
// Metering: cap enforcement tests
// ---------------------------------------------------------------------------

describe("askLedger – metering cap enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a Starter org before metering or query work", async () => {
    const { db, insertCalls } = createMockDb();

    await expect(
      askLedger(db as never, {
        orgId: "org-1",
        planTier: "starter",
        input: { question: "Which grants are over budget?", mode: "deterministic" },
        allowedEntities: ["grants"],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Ask-Your-Ledger is included on Growth plans and up.",
    });

    expect(getBudgetSentinel).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it("records usage after a successful Growth query", async () => {
    vi.mocked(getBudgetSentinel).mockResolvedValueOnce({
      asOf: new Date("2026-06-18T00:00:00Z"),
      totals: {
        overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
        underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
        totalAtRisk: 0,
      },
      items: [],
    });

    const { db, insertCalls } = createMockDb();

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "growth",
      input: { question: "Which grants are over budget?", mode: "deterministic" },
      allowedEntities: ["grants"],
    });

    expect(answer.answer).toContain("No active grant budget lines");

    // Usage was recorded once with the correct feature
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        feature: "ask_your_ledger",
      }),
    );
  });

  it("never queries the usage cap DB for Growth orgs and records usage after success", async () => {
    vi.mocked(getBudgetSentinel).mockResolvedValueOnce({
      asOf: new Date("2026-06-18T00:00:00Z"),
      totals: {
        overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
        underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
        totalAtRisk: 0,
      },
      items: [],
    });

    // No selectRows: assertAiUsageWithinCap must not call db.select for uncapped tiers
    const { db, insertCalls } = createMockDb();

    await askLedger(db as never, {
      orgId: "org-1",
      planTier: "growth",
      input: { question: "Which grants are over budget?", mode: "deterministic" },
      allowedEntities: ["grants"],
    });

    // db.select should NOT have been called for the cap check
    expect(db.select).not.toHaveBeenCalled();

    // But usage was still recorded on success
    expect(insertCalls).toHaveLength(1);
  });

  it("does not record usage when the underlying query step throws (failed-query path)", async () => {
    const { db, insertCalls } = createMockDb();

    vi.mocked(getBudgetSentinel).mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      askLedger(db as never, {
        orgId: "org-1",
        planTier: "growth",
        input: { question: "Which grants are over budget?", mode: "deterministic" },
        allowedEntities: ["grants"],
      }),
    ).rejects.toThrow("DB connection lost");

    // No ai_usage_events row inserted
    expect(insertCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Existing behaviour tests (updated to use Growth tier which is uncapped)
// ---------------------------------------------------------------------------

describe("askLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers overspend questions from the deterministic sentinel with citations", async () => {
    vi.mocked(getBudgetSentinel).mockResolvedValueOnce({
      asOf: new Date("2026-06-18T00:00:00Z"),
      totals: {
        overspend: { near_limit: 0, projected_overspend: 1, over_budget: 0, total: 1 },
        underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
        totalAtRisk: 1,
      },
      items: [
        {
          kind: "overspend",
          id: "line-1",
          grantId: "grant-1",
          grantName: "Youth Grant",
          category: "Personnel",
          band: "projected_overspend",
          approvedAmountCents: 100_000,
          actualCents: 70_000,
          plannedCents: 40_000,
          projectedCents: 110_000,
          overByCents: 10_000,
          utilizationPercent: 70,
          riskScore: 10,
        },
      ],
    });

    const { db } = createMockDb();

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Which grants are over budget?", mode: "deterministic" },
      allowedEntities: ["grants"],
      entityId: "entity-1",
      now: new Date("2026-06-18T00:00:00Z"),
    });

    expect(answer.answer).toContain("1 grant budget line");
    expect(answer.citations).toEqual([
      {
        type: "grant",
        label: "Youth Grant - Personnel",
        href: "/grants/grant-1/budget",
        value: "$1,100 projected against $1,000",
      },
    ]);
    expect(answer.safeguards.join(" ")).toContain("No AI-generated numbers");
    expect(getBudgetSentinel).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-06-18T00:00:00Z"),
      kinds: ["overspend"],
      limit: 5,
    });
  });

  it("answers no-risk overspend questions with a zero citation", async () => {
    vi.mocked(getBudgetSentinel).mockResolvedValueOnce({
      asOf: new Date("2026-06-18T00:00:00Z"),
      totals: {
        overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
        underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
        totalAtRisk: 0,
      },
      items: [],
    });

    const { db } = createMockDb();

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show grant budget risk", mode: "deterministic" },
      allowedEntities: ["grants"],
      now: new Date("2026-06-18T00:00:00Z"),
    });

    expect(answer.answer).toContain("No active grant budget lines");
    expect(answer.citations).toEqual([
      {
        type: "report_row",
        label: "Budget sentinel",
        href: "/grants/budget-sentinel",
        value: "0 at-risk budget lines",
      },
    ]);
  });

  it("caps overspend citations and uses plural wording", async () => {
    vi.mocked(getBudgetSentinel).mockResolvedValueOnce(makeOverspendSentinel(4));

    const { db } = createMockDb();

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show overspend risk", mode: "deterministic" },
      allowedEntities: ["grants"],
    });

    expect(answer.answer).toContain("4 grant budget lines are");
    expect(answer.answer).toContain("$1,000");
    expect(answer.citations).toHaveLength(3);
  });

  it("answers restricted fund balance questions from latest restriction balances", async () => {
    const { db } = createDbWithRestrictionBalances([
      {
        termId: "term-2",
        fundId: "fund-2",
        fundName: "Endowment",
        endingBalanceCents: 750_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
      {
        termId: "term-1",
        fundId: "fund-1",
        fundName: "Scholarship Fund",
        endingBalanceCents: 250_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
      {
        termId: "term-1",
        fundId: "fund-1",
        fundName: "Scholarship Fund",
        endingBalanceCents: 900_000,
        periodEnd: new Date("2026-05-31T00:00:00Z"),
      },
    ]);

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show restricted fund balances", mode: "ai_assisted" },
      allowedEntities: ["funds"],
    });

    expect(answer.answer).toContain("2 restricted funds");
    expect(answer.answer).toContain("$10,000");
    expect(answer.mode).toBe("ai_assisted");
    expect(answer.citations[0]).toMatchObject({
      type: "fund",
      label: "Endowment",
      href: "/funds/fund-2",
      value: "$7,500",
    });
    // select is called once for the fund balance query (cap check skipped for audit_ready)
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("answers empty restricted fund balance questions without inventing rows", async () => {
    const { db } = createDbWithRestrictionBalances([]);

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show fund balance", mode: "deterministic" },
      allowedEntities: ["funds"],
    });

    expect(answer.answer).toContain("No restricted fund balances");
    expect(answer.citations).toEqual([
      {
        type: "report_row",
        label: "Fund balance snapshot",
        href: "/reports/builder",
        value: "0 fund rows",
      },
    ]);
  });

  it("uses safe fallback labels for sparse restriction balance rows", async () => {
    const { db } = createDbWithRestrictionBalances([
      {
        termId: "term-1",
        fundId: "fund-1",
        fundName: null,
        endingBalanceCents: 125_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
    ]);

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show funds with balances", mode: "deterministic" },
      allowedEntities: ["funds"],
    });

    expect(answer.answer).toContain("$1,250");
    expect(answer.citations[0]).toMatchObject({
      label: "Fund",
      value: "$1,250",
    });
  });

  it("groups latest restriction balance terms by fund and skips unassigned fund rows", async () => {
    const { db } = createDbWithRestrictionBalances([
      {
        termId: "term-1",
        fundId: "fund-1",
        fundName: "Scholarship Fund",
        endingBalanceCents: 125_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
      {
        termId: "term-2",
        fundId: "fund-1",
        fundName: "Scholarship Fund",
        endingBalanceCents: 75_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
      {
        termId: "term-3",
        fundId: null,
        fundName: null,
        endingBalanceCents: 500_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
    ]);

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Show restricted fund balances", mode: "deterministic" },
      allowedEntities: ["funds"],
    });

    expect(answer.answer).toContain("1 restricted fund has");
    expect(answer.answer).toContain("$2,000");
    expect(answer.citations).toEqual([
      {
        type: "fund",
        label: "Scholarship Fund",
        href: "/funds/fund-1",
        value: "$2,000",
      },
    ]);
  });

  it("answers money-left fund questions with the restricted fund path", async () => {
    const { db } = createDbWithRestrictionBalances([
      {
        termId: "term-1",
        fundId: "fund-1",
        fundName: "Endowment",
        endingBalanceCents: 500_000,
        periodEnd: new Date("2026-06-30T00:00:00Z"),
      },
    ]);

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "Which funds still have money left?", mode: "deterministic" },
      allowedEntities: ["funds"],
    });

    expect(answer.answer).toContain("1 restricted fund has");
    expect(answer.citations[0]).toMatchObject({
      label: "Endowment",
      value: "$5,000",
    });
  });

  it("refuses inaccessible entity questions", async () => {
    const { db } = createMockDb();

    await expect(
      askLedger(db as never, {
        orgId: "org-1",
        planTier: "audit_ready",
        input: { question: "Which grants are over budget?", mode: "deterministic" },
        allowedEntities: ["funds"],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "You do not have access to grants data for this question.",
    });
  });

  it("falls back to the report builder for unsupported questions without inventing data", async () => {
    const { db } = createMockDb();

    const answer = await askLedger(db as never, {
      orgId: "org-1",
      planTier: "audit_ready",
      input: { question: "What should I tell the board next month?", mode: "deterministic" },
      allowedEntities: ["grants", "funds"],
    });

    expect(answer.confidence).toBe("low");
    expect(answer.answer).toContain("could not answer");
    expect(answer.citations[0]).toMatchObject({ href: "/reports/builder" });
  });

  it("blocks Starter access as a defense-in-depth branch", async () => {
    const { db } = createMockDb();
    await expect(
      askLedger(db as never, {
        orgId: "org-1",
        planTier: "starter",
        input: { question: "Which grants are over budget?", mode: "deterministic" },
        allowedEntities: ["grants"],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Ask-Your-Ledger is included on Growth plans and up.",
    });
  });
});
