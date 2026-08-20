import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  exportGrantBudgetActualsCsv,
  getBudgetAlertsFromRows,
  getBudgetVarianceRows,
  getBudgetVarianceRowsFromData,
} from "./budget-reporting.service";

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("grant budget reporting service", () => {
  it("aggregates approved, actual, planned, remaining, and variance by line", () => {
    const rows = getBudgetVarianceRowsFromData({
      lines: [
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10000,
          allowable: true,
          costType: "direct",
        },
      ],
      allocations: [{ budgetLineId: "line-1", amountCents: 6500 }],
      plannedExpenses: [{ budgetLineId: "line-1", amountCents: 1500 }],
    });

    expect(rows).toEqual([
      {
        lineId: "line-1",
        category: "Personnel",
        approvedAmountCents: 10000,
        actualCents: 6500,
        plannedCents: 1500,
        remainingCents: 2000,
        varianceCents: 3500,
        variancePercent: 35,
        allowable: true,
        costType: "direct",
      },
    ]);
  });

  it("builds alert rows for over-budget and unallowable categories", () => {
    const alerts = getBudgetAlertsFromRows([
      {
        lineId: "line-1",
        category: "Lobbying",
        approvedAmountCents: 10000,
        actualCents: 12000,
        plannedCents: 0,
        remainingCents: -2000,
        varianceCents: -2000,
        variancePercent: -20,
        allowable: false,
        costType: "direct",
      },
    ]);

    expect(alerts).toEqual([
      {
        type: "over_budget",
        budgetLineId: "line-1",
        message: "Lobbying is $20.00 over its approved budget.",
      },
      {
        type: "unallowable_category",
        budgetLineId: "line-1",
        message: "Lobbying is marked unallowable and has actual spend.",
      },
    ]);
  });

  it("exports budget-vs-actual rows as safe CSV", () => {
    const csv = exportGrantBudgetActualsCsv([
      {
        lineId: "line-1",
        category: 'Program, "Direct"',
        approvedAmountCents: 100,
        actualCents: 25,
        plannedCents: 0,
        remainingCents: 75,
        varianceCents: 75,
        variancePercent: 75,
        allowable: true,
        costType: "direct",
      },
    ]);

    expect(csv).toContain(
      "budget_line_id,category,approved_cents,actual_cents,planned_cents,remaining_cents,variance_cents,variance_percent,allowable,cost_type",
    );
    expect(csv).toContain('"Program, ""Direct"""');
  });

  it("loads variance rows from the current approved budget version", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "version-1" });
    const findLines = vi.fn().mockImplementation((options) => {
      options.orderBy(
        { sortOrder: "sortOrder", category: "category" },
        { asc: (value: string) => value },
      );
      return Promise.resolve([
        {
          id: "line-1",
          category: "Personnel",
          approvedAmountCents: 10000,
          allowable: true,
          costType: "direct",
        },
      ]);
    });
    const findAllocations = vi
      .fn()
      .mockResolvedValue([{ budgetLineId: "line-1", amountCents: 3000 }]);
    const findPlannedExpenses = vi
      .fn()
      .mockResolvedValue([{ budgetLineId: "line-1", amountCents: 2000 }]);
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
        grantBudgetLines: { findMany: findLines },
        grantBudgetLineAllocations: { findMany: findAllocations },
        plannedExpenses: { findMany: findPlannedExpenses },
      },
    };

    const rows = await getBudgetVarianceRows(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      query: {},
    });

    expect(rows).toEqual([
      {
        lineId: "line-1",
        category: "Personnel",
        approvedAmountCents: 10000,
        actualCents: 3000,
        plannedCents: 2000,
        remainingCents: 5000,
        varianceCents: 7000,
        variancePercent: 70,
        allowable: true,
        costType: "direct",
      },
    ]);
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findLines).toHaveBeenCalledOnce();
    expect(findAllocations).toHaveBeenCalledOnce();
    expect(findPlannedExpenses).toHaveBeenCalledOnce();
  });

  it("only counts active planned and committed expenses as planned budget", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "version-1" });
    const findLines = vi.fn().mockResolvedValue([
      {
        id: "line-1",
        category: "Personnel",
        approvedAmountCents: 10000,
        allowable: true,
        costType: "direct",
      },
    ]);
    const findAllocations = vi.fn().mockResolvedValue([]);
    const findPlannedExpenses = vi
      .fn()
      .mockResolvedValue([{ budgetLineId: "line-1", amountCents: 2000 }]);
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
        grantBudgetLines: { findMany: findLines },
        grantBudgetLineAllocations: { findMany: findAllocations },
        plannedExpenses: { findMany: findPlannedExpenses },
      },
    };

    await getBudgetVarianceRows(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      query: {},
    });

    const plannedWhere = findPlannedExpenses.mock.calls[0]?.[0]?.where;
    const plannedWhereQuery = renderSql(plannedWhere);
    const plannedWhereSql = plannedWhereQuery.sql;
    expect(plannedWhereSql).toContain('"planned_expenses"."status" in ($');
    expect(plannedWhereQuery.params).toContain("planned");
    expect(plannedWhereQuery.params).toContain("committed");
    expect(plannedWhereQuery.params).not.toContain("converted");
    expect(plannedWhereQuery.params).not.toContain("cancelled");
  });

  it("returns an empty variance set when no approved budget exists", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findLines = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
        grantBudgetLines: { findMany: findLines },
      },
    };

    const rows = await getBudgetVarianceRows(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      query: {},
    });

    expect(rows).toEqual([]);
    expect(findLines).not.toHaveBeenCalled();
  });

  it("returns an empty variance set when filters match no budget lines", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "version-1" });
    const findLines = vi.fn().mockResolvedValue([]);
    const findAllocations = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
        grantBudgetLines: { findMany: findLines },
        grantBudgetLineAllocations: { findMany: findAllocations },
      },
    };

    const rows = await getBudgetVarianceRows(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      query: {
        periodId: "period-1",
        category: "Personnel",
        programId: "program-1",
        fundId: "fund-1",
        allowable: "false",
        costType: "indirect",
      },
    });

    expect(rows).toEqual([]);
    expect(findLines).toHaveBeenCalledOnce();
    expect(findAllocations).not.toHaveBeenCalled();
  });

  it("handles zero approved budgets and formula-like CSV categories", () => {
    const rows = getBudgetVarianceRowsFromData({
      lines: [
        {
          id: "line-1",
          category: "=SUM(A1:A2)",
          approvedAmountCents: 0,
          allowable: true,
          costType: "indirect",
        },
      ],
      allocations: [],
      plannedExpenses: [],
    });

    expect(rows[0]).toMatchObject({
      variancePercent: null,
      remainingCents: 0,
    });
    expect(exportGrantBudgetActualsCsv(rows)).toContain("'=SUM(A1:A2)");
  });
});
