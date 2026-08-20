import { escapeCsvCell } from "../../lib/csv";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  expenseProgramAllocations,
  expenses,
  programBudgetLines,
  programBudgets,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type {
  ProgramBudgetVsActualExportQuery,
  ProgramBudgetVsActualQuery,
} from "@grantpipe/shared";

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

// Date-only period bounds arrive as "YYYY-MM-DD". The lower bound is the first
// instant of the day; the upper bound must be the LAST instant of the day, or an
// inclusive `lte` against a timestamptz column silently drops every row recorded
// on the final day after midnight UTC.
function parseEndOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

export type ProgramBudgetVsActualRow = {
  programId: string;
  category: string;
  budgetedCents: number;
  actualCents: number;
  remainingCents: number;
};

export async function getProgramBudgetVsActual(
  db: Database,
  params: { orgId: string } & ProgramBudgetVsActualQuery,
) {
  const periodStart = parseDate(params.periodStart);
  const periodEnd = parseEndOfDay(params.periodEnd);

  const budgetRows = await db
    .select({
      programId: programBudgets.programId,
      category: programBudgetLines.category,
      budgetedCents: sql<number>`sum(${programBudgetLines.budgetedCents})::bigint`,
    })
    .from(programBudgets)
    .innerJoin(
      programBudgetLines,
      and(
        eq(programBudgetLines.budgetId, programBudgets.id),
        eq(programBudgetLines.orgId, params.orgId),
      ),
    )
    .where(
      and(
        eq(programBudgets.orgId, params.orgId),
        isNull(programBudgets.deletedAt),
        isNull(programBudgetLines.deletedAt),
        gte(programBudgets.periodEnd, periodStart),
        lte(programBudgets.periodStart, periodEnd),
        params.programId ? eq(programBudgets.programId, params.programId) : undefined,
      ),
    )
    .groupBy(programBudgets.programId, programBudgetLines.category);

  const actualRows = await db
    .select({
      programId: expenseProgramAllocations.programId,
      category: expenses.category,
      actualCents: sql<number>`sum(coalesce(${expenseProgramAllocations.amountCents}, floor((${expenses.amountCents} * ${expenseProgramAllocations.percentBasisPoints} + 5000) / 10000)))::bigint`,
    })
    .from(expenseProgramAllocations)
    .innerJoin(
      expenses,
      and(eq(expenses.id, expenseProgramAllocations.expenseId), eq(expenses.orgId, params.orgId)),
    )
    .where(
      and(
        eq(expenseProgramAllocations.orgId, params.orgId),
        isNull(expenseProgramAllocations.deletedAt),
        isNull(expenses.deletedAt),
        gte(expenses.date, periodStart),
        lte(expenses.date, periodEnd),
        params.programId ? eq(expenseProgramAllocations.programId, params.programId) : undefined,
        params.grantId ? eq(expenseProgramAllocations.grantId, params.grantId) : undefined,
        params.fundId ? eq(expenseProgramAllocations.fundId, params.fundId) : undefined,
      ),
    )
    .groupBy(expenseProgramAllocations.programId, expenses.category);

  const rows = new Map<string, ProgramBudgetVsActualRow>();
  for (const budget of budgetRows) {
    const category = budget.category;
    const key = `${budget.programId}:${category}`;
    rows.set(key, {
      programId: budget.programId,
      category,
      budgetedCents: Number(budget.budgetedCents),
      actualCents: 0,
      remainingCents: Number(budget.budgetedCents),
    });
  }

  for (const actual of actualRows) {
    const category = actual.category ?? "Uncategorized";
    const key = `${actual.programId}:${category}`;
    const existing =
      rows.get(key) ??
      ({
        programId: actual.programId,
        category,
        budgetedCents: 0,
        actualCents: 0,
        remainingCents: 0,
      } satisfies ProgramBudgetVsActualRow);
    existing.actualCents += Number(actual.actualCents);
    existing.remainingCents = existing.budgetedCents - existing.actualCents;
    rows.set(key, existing);
  }

  return {
    rows: [...rows.values()].sort((left, right) =>
      left.programId === right.programId
        ? left.category.localeCompare(right.category)
        : left.programId.localeCompare(right.programId),
    ),
  };
}

function csvEscape(value: string | number | boolean | null) {
  return escapeCsvCell(value);
}

export async function exportProgramBudgetVsActual(
  db: Database,
  params: { orgId: string } & ProgramBudgetVsActualExportQuery,
) {
  const report = await getProgramBudgetVsActual(db, params);
  const header = "program_id,category,budgeted_cents,actual_cents,remaining_cents";
  const body = report.rows.map((row) =>
    [row.programId, row.category, row.budgetedCents, row.actualCents, row.remainingCents]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...body].join("\n");
}
