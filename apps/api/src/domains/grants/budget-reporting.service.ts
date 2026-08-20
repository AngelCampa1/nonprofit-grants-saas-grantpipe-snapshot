import { escapeCsvCell } from "../../lib/csv";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  grantBudgetLineAllocations,
  grantBudgetLines,
  grantBudgetVersions,
  plannedExpenses,
  type Database,
} from "@grantpipe/db";
import type { BudgetVarianceQuery } from "@grantpipe/shared";

type EntityScopedParams = { entityId?: string };

function entityScopeCondition(table: { entityId: Column }, entityId?: string) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

type BudgetLineInput = {
  id: string;
  category: string;
  approvedAmountCents: number;
  allowable: boolean;
  costType: string;
};

type AmountInput = {
  budgetLineId: string;
  amountCents: number;
};

export type GrantBudgetVarianceRow = {
  lineId: string;
  category: string;
  approvedAmountCents: number;
  actualCents: number;
  plannedCents: number;
  remainingCents: number;
  varianceCents: number;
  variancePercent: number | null;
  allowable: boolean;
  costType: string;
};

export function getBudgetVarianceRowsFromData(params: {
  lines: BudgetLineInput[];
  allocations: AmountInput[];
  plannedExpenses: AmountInput[];
}): GrantBudgetVarianceRow[] {
  const actualByLine = new Map<string, number>();
  for (const allocation of params.allocations) {
    actualByLine.set(
      allocation.budgetLineId,
      (actualByLine.get(allocation.budgetLineId) ?? 0) + allocation.amountCents,
    );
  }

  const plannedByLine = new Map<string, number>();
  for (const planned of params.plannedExpenses) {
    plannedByLine.set(
      planned.budgetLineId,
      (plannedByLine.get(planned.budgetLineId) ?? 0) + planned.amountCents,
    );
  }

  return params.lines.map((line) => {
    const actualCents = actualByLine.get(line.id) ?? 0;
    const plannedCents = plannedByLine.get(line.id) ?? 0;
    const remainingCents = line.approvedAmountCents - actualCents - plannedCents;
    const varianceCents = line.approvedAmountCents - actualCents;
    return {
      lineId: line.id,
      category: line.category,
      approvedAmountCents: line.approvedAmountCents,
      actualCents,
      plannedCents,
      remainingCents,
      varianceCents,
      variancePercent:
        line.approvedAmountCents === 0
          ? null
          : Math.round((varianceCents / line.approvedAmountCents) * 10000) / 100,
      allowable: line.allowable,
      costType: line.costType,
    };
  });
}

export async function getBudgetVarianceRows(
  db: Database,
  params: { orgId: string; grantId: string; query: BudgetVarianceQuery } & EntityScopedParams,
): Promise<GrantBudgetVarianceRow[]> {
  const currentVersion = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      eq(grantBudgetVersions.status, "approved"),
      isNull(grantBudgetVersions.deletedAt),
    ),
    columns: { id: true },
  });

  if (!currentVersion) return [];

  const lineFilters = [
    eq(grantBudgetLines.orgId, params.orgId),
    entityScopeCondition(grantBudgetLines, params.entityId),
    eq(grantBudgetLines.budgetVersionId, currentVersion.id),
    isNull(grantBudgetLines.deletedAt),
  ];
  if (params.query.periodId) {
    lineFilters.push(eq(grantBudgetLines.budgetPeriodId, params.query.periodId));
  }
  if (params.query.category) {
    lineFilters.push(eq(grantBudgetLines.category, params.query.category));
  }
  if (params.query.programId) {
    lineFilters.push(eq(grantBudgetLines.programId, params.query.programId));
  }
  if (params.query.fundId) {
    lineFilters.push(eq(grantBudgetLines.fundId, params.query.fundId));
  }
  if (params.query.allowable) {
    lineFilters.push(eq(grantBudgetLines.allowable, params.query.allowable === "true"));
  }
  if (params.query.costType) {
    lineFilters.push(eq(grantBudgetLines.costType, params.query.costType));
  }

  const lines = await db.query.grantBudgetLines.findMany({
    where: and(...lineFilters),
    columns: {
      id: true,
      category: true,
      approvedAmountCents: true,
      allowable: true,
      costType: true,
    },
    orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.category)],
  });

  if (lines.length === 0) return [];
  const lineIds = lines.map((line) => line.id);

  const allocations = await db.query.grantBudgetLineAllocations.findMany({
    where: and(
      eq(grantBudgetLineAllocations.orgId, params.orgId),
      entityScopeCondition(grantBudgetLineAllocations, params.entityId),
      inArray(grantBudgetLineAllocations.budgetLineId, lineIds),
      isNull(grantBudgetLineAllocations.deletedAt),
    ),
    columns: { budgetLineId: true, amountCents: true },
  });
  const planned = await db.query.plannedExpenses.findMany({
    where: and(
      eq(plannedExpenses.orgId, params.orgId),
      eq(plannedExpenses.grantId, params.grantId),
      entityScopeCondition(plannedExpenses, params.entityId),
      inArray(plannedExpenses.budgetLineId, lineIds),
      inArray(plannedExpenses.status, ["planned", "committed"]),
      isNull(plannedExpenses.deletedAt),
    ),
    columns: { budgetLineId: true, amountCents: true },
  });

  return getBudgetVarianceRowsFromData({
    lines,
    allocations,
    plannedExpenses: planned,
  });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function getBudgetAlertsFromRows(rows: GrantBudgetVarianceRow[]) {
  return rows.flatMap((row) => {
    const alerts: Array<{
      type: "over_budget" | "unallowable_category";
      budgetLineId: string;
      message: string;
    }> = [];
    if (row.remainingCents < 0) {
      alerts.push({
        type: "over_budget",
        budgetLineId: row.lineId,
        message: `${row.category} is ${formatCurrency(Math.abs(row.remainingCents))} over its approved budget.`,
      });
    }
    if (!row.allowable && row.actualCents > 0) {
      alerts.push({
        type: "unallowable_category",
        budgetLineId: row.lineId,
        message: `${row.category} is marked unallowable and has actual spend.`,
      });
    }
    return alerts;
  });
}

function csvEscape(value: string | number | boolean | null) {
  return escapeCsvCell(value);
}

export function exportGrantBudgetActualsCsv(rows: GrantBudgetVarianceRow[]) {
  const header = [
    "budget_line_id",
    "category",
    "approved_cents",
    "actual_cents",
    "planned_cents",
    "remaining_cents",
    "variance_cents",
    "variance_percent",
    "allowable",
    "cost_type",
  ];
  const body = rows.map((row) =>
    [
      row.lineId,
      row.category,
      row.approvedAmountCents,
      row.actualCents,
      row.plannedCents,
      row.remainingCents,
      row.varianceCents,
      row.variancePercent,
      row.allowable,
      row.costType,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}
