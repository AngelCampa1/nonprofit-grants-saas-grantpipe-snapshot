import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";
import { getGrantSpendDown } from "./spend-down.service";

type FakeGrant = {
  id: string;
  orgId: string;
  name: string;
  amountCents: number | null;
  startDate: Date | null;
};

type FakeAllocation = {
  id: string;
  grantId: string;
  fundId: string;
  allocatedAmountCents: number;
  deletedAt?: Date | null;
  fund: { id: string; name: string | null; deletedAt: Date | null } | null;
};

type FakeExpense = {
  id: string;
  orgId: string;
  grantId: string | null;
  fundId: string | null;
  amountCents: number;
  date: Date;
  category: string | null;
  deletedAt: Date | null;
};

function makeDbWithExpenses(params: {
  grant?: FakeGrant | null;
  allocations?: FakeAllocation[];
  expenses?: FakeExpense[];
}) {
  const allocations = params.allocations ?? [];
  const expenses = params.expenses ?? [];

  return {
    query: {
      grants: {
        findFirst: async () => params.grant ?? null,
      },
      expenses: {
        findMany: async () => expenses,
      },
    },
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () =>
            allocations.map((a) => ({
              id: a.id,
              grantId: a.grantId,
              fundId: a.fundId,
              allocatedAmountCents: a.allocatedAmountCents,
              deletedAt: a.deletedAt ?? null,
              fund_id: a.fund?.id ?? null,
              fund_name: a.fund?.name ?? null,
              fund_deletedAt: a.fund?.deletedAt ?? null,
            })),
        }),
      }),
    }),
  } as never;
}

const BASE_GRANT: FakeGrant = {
  id: "grant-1",
  orgId: "org-1",
  name: "Community Impact Grant",
  amountCents: 100_000,
  startDate: new Date("2026-01-01T00:00:00.000Z"),
};

describe("getGrantSpendDown", () => {
  it("returns zeroed result when no expenses exist", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [],
      expenses: [],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.expensesCents).toBe(0);
    expect(result.budgetCents).toBe(100_000);
    expect(result.remainingCents).toBe(100_000);
    expect(result.thresholdState).toBeNull();
    expect(result.byCategory).toEqual([]);
    expect(result.byFund).toEqual([]);
    expect(result.byMonth).toEqual([]);
  });

  it("returns null thresholdState when expenses are below 80%", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 70_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: "Salaries",
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.thresholdState).toBeNull();
    expect(result.expensesCents).toBe(70_000);
  });

  it("returns '80' thresholdState when expenses are exactly 80%", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 80_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.thresholdState).toBe("80");
  });

  it("returns '90' thresholdState when expenses are exactly 90%", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 90_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.thresholdState).toBe("90");
  });

  it("returns '100' thresholdState when expenses are at or above 100%", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 105_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.thresholdState).toBe("100");
    expect(result.remainingCents).toBe(-5_000);
  });

  it("returns null thresholdState when grant has no budget", async () => {
    const db = makeDbWithExpenses({
      grant: { ...BASE_GRANT, amountCents: null },
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 50_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.budgetCents).toBeNull();
    expect(result.remainingCents).toBeNull();
    expect(result.thresholdState).toBeNull();
  });

  it("groups expenses by category, null → Uncategorized", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 30_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: "Salaries",
          deletedAt: null,
        },
        {
          id: "exp-2",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 10_000,
          date: new Date("2026-02-05T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
        {
          id: "exp-3",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 5_000,
          date: new Date("2026-02-10T00:00:00.000Z"),
          category: "Salaries",
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byCategory).toHaveLength(2);
    const salaries = result.byCategory.find((c) => c.category === "Salaries");
    expect(salaries?.amountCents).toBe(35_000);
    const uncategorized = result.byCategory.find((c) => c.category === "Uncategorized");
    expect(uncategorized?.amountCents).toBe(10_000);
    // sorted by amountCents desc
    expect(result.byCategory[0]?.category).toBe("Salaries");
  });

  it("attributes expenses to fund allocations in byFund", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [
        {
          id: "alloc-1",
          grantId: "grant-1",
          fundId: "fund-1",
          allocatedAmountCents: 60_000,
          fund: { id: "fund-1", name: "General Fund", deletedAt: null },
        },
      ],
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: "fund-1",
          amountCents: 25_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: "Salaries",
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byFund).toHaveLength(1);
    expect(result.byFund[0]).toMatchObject({
      fundId: "fund-1",
      fundName: "General Fund",
      allocatedAmountCents: 60_000,
      expensesCents: 25_000,
    });
  });

  it("scopes spend-down queries by entity and falls back to fund id when fund name is missing", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [
        {
          id: "alloc-1",
          grantId: "grant-1",
          fundId: "fund-1",
          allocatedAmountCents: 60_000,
          fund: { id: "fund-1", name: null, deletedAt: null },
        },
      ],
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: "fund-1",
          amountCents: 25_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
    });

    expect(result.byFund[0]).toMatchObject({
      fundId: "fund-1",
      fundName: "fund-1",
      expensesCents: 25_000,
    });
  });

  it("groups expenses by month in byMonth, sorted ascending", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 20_000,
          date: new Date("2026-03-15T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
        {
          id: "exp-2",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 10_000,
          date: new Date("2026-01-20T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
        {
          id: "exp-3",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 5_000,
          date: new Date("2026-03-25T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byMonth).toHaveLength(2);
    expect(result.byMonth[0]).toEqual({ month: "2026-01", amountCents: 10_000 });
    expect(result.byMonth[1]).toEqual({ month: "2026-03", amountCents: 25_000 });
  });

  it("sets projectedExhaustionDate when remaining > 0 and burn rate > 0", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 30_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const now = new Date("2026-04-01T00:00:00.000Z");
    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now,
    });

    expect(result.projectedExhaustionDate).not.toBeNull();
    expect(typeof result.projectedExhaustionDate).toBe("string");
  });

  it("returns null projectedExhaustionDate when burn rate is zero (no start date)", async () => {
    const db = makeDbWithExpenses({
      grant: { ...BASE_GRANT, startDate: null },
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 30_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.projectedExhaustionDate).toBeNull();
  });

  it("returns null projectedExhaustionDate when remaining is 0", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 100_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.projectedExhaustionDate).toBeNull();
  });

  it("returns null projectedExhaustionDate when the budget is zero", async () => {
    const db = makeDbWithExpenses({
      grant: { ...BASE_GRANT, amountCents: 0 },
      expenses: [],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
    });

    expect(result.budgetCents).toBe(0);
    expect(result.remainingCents).toBe(0);
    expect(result.thresholdState).toBeNull();
    expect(result.projectedExhaustionDate).toBeNull();
  });

  it("filters expenses by from/to date range", async () => {
    // The mock simulates DB-level filtering: only the in-range expense is returned
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-2",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 20_000,
          date: new Date("2026-02-15T00:00:00.000Z"),
          category: null,
          deletedAt: null,
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T00:00:00.000Z"),
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.expensesCents).toBe(20_000);
  });

  it("excludes soft-deleted expenses", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      expenses: [
        {
          id: "exp-1",
          orgId: "org-1",
          grantId: "grant-1",
          fundId: null,
          amountCents: 50_000,
          date: new Date("2026-02-01T00:00:00.000Z"),
          category: null,
          deletedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.expensesCents).toBe(0);
  });

  it("throws notFound when grant does not exist", async () => {
    const db = makeDbWithExpenses({ grant: null });

    await expect(
      getGrantSpendDown(db, { orgId: "org-1", grantId: "missing-grant" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws notFound when grant belongs to a different org", async () => {
    const db = makeDbWithExpenses({
      grant: { ...BASE_GRANT, orgId: "org-2" },
    });

    await expect(
      getGrantSpendDown(db, { orgId: "org-1", grantId: "grant-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("excludes allocations whose fund is soft-deleted", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [
        {
          id: "alloc-1",
          grantId: "grant-1",
          fundId: "fund-1",
          allocatedAmountCents: 60_000,
          fund: {
            id: "fund-1",
            name: "Deleted Fund",
            deletedAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        },
      ],
      expenses: [],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byFund).toHaveLength(0);
  });

  it("excludes allocations whose fund does not belong to the org", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [
        {
          id: "alloc-foreign",
          grantId: "grant-1",
          fundId: "fund-foreign",
          allocatedAmountCents: 60_000,
          fund: null,
        },
      ],
      expenses: [],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byFund).toEqual([]);
  });

  it("excludes soft-deleted allocations even when the fund is still active", async () => {
    const db = makeDbWithExpenses({
      grant: BASE_GRANT,
      allocations: [
        {
          id: "alloc-1",
          grantId: "grant-1",
          fundId: "fund-1",
          allocatedAmountCents: 60_000,
          deletedAt: new Date("2026-02-15T00:00:00.000Z"),
          fund: { id: "fund-1", name: "General Fund", deletedAt: null },
        },
      ],
      expenses: [],
    });

    const result = await getGrantSpendDown(db, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.byFund).toHaveLength(0);
  });

  it("scopes funds leftJoin by funds.orgId to prevent cross-org fund name leakage (fix #7)", async () => {
    // Capture the leftJoin call in the allocation query so we can inspect its ON predicate.
    const leftJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-isolated",
            orgId: "org-isolated",
            name: "Test Grant",
            amountCents: 100_000,
            startDate: null,
          }),
          expenses: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        expenses: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ leftJoin: leftJoinSpy }),
      }),
    } as never;

    await getGrantSpendDown(db, {
      orgId: "org-isolated",
      grantId: "grant-isolated",
    });

    // The leftJoin ON predicate must include funds.orgId so cross-org fund names cannot leak.
    expect(leftJoinSpy).toHaveBeenCalledTimes(1);
    const onPredicate = leftJoinSpy.mock.calls[0]?.[1];
    // Walk the predicate AST and collect string values (cycle-safe).
    function collectStr(node: unknown, seen = new WeakSet<object>()): string[] {
      if (node === null || node === undefined) return [];
      if (typeof node === "string") return [node];
      if (typeof node !== "object") return [];
      if (seen.has(node as object)) return [];
      seen.add(node as object);
      if (Array.isArray(node)) return node.flatMap((i) => collectStr(i, seen));
      const results: string[] = [];
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "table") continue;
        results.push(...collectStr(v, seen));
      }
      return results;
    }
    const values = collectStr(onPredicate);
    expect(values).toContain("org-isolated");
  });
});
