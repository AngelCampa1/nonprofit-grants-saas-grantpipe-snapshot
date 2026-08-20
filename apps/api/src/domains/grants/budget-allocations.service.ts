import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  expenses,
  grantBudgetLineAllocations,
  grantBudgetLines,
  journalLines,
  type Database,
} from "@grantpipe/db";
import type { ExpenseBudgetAllocationInput } from "@grantpipe/shared";
import { badRequest, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";

type AllocationRow = { amountCents: number };
type EntityScopedParams = { entityId?: string };

function entityScopeCondition(table: { entityId: Column }, entityId?: string) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

export function totalBudgetAllocationCents(rows: AllocationRow[]) {
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

export function getBudgetLineAllocationWarnings(params: {
  approvedAmountCents: number;
  existingActualCents: number;
  newAmountCents: number;
  allowable: boolean;
}) {
  const warnings: BudgetAllocationWarning[] = [];
  const projectedActualCents = params.existingActualCents + params.newAmountCents;
  if (projectedActualCents > params.approvedAmountCents) {
    warnings.push({
      code: "line_over_budget",
      approvedAmountCents: params.approvedAmountCents,
      projectedActualCents,
    });
  }
  if (!params.allowable) {
    warnings.push({ code: "unallowable_category" });
  }
  return warnings;
}

type BudgetAllocationWarning =
  | {
      code: "line_over_budget";
      approvedAmountCents: number;
      projectedActualCents: number;
    }
  | { code: "unallowable_category" };

async function getExpenseInOrg(
  db: Database,
  params: { orgId: string; grantId: string; expenseId: string } & EntityScopedParams,
) {
  const expense = await db.query.expenses.findFirst({
    where: and(
      eq(expenses.id, params.expenseId),
      eq(expenses.orgId, params.orgId),
      eq(expenses.grantId, params.grantId),
      entityScopeCondition(expenses, params.entityId),
      isNull(expenses.deletedAt),
    ),
  });
  if (!expense) throw notFound("Expense not found");
  return expense;
}

async function getJournalLineInGrant(
  db: Database,
  params: { orgId: string; grantId: string; journalLineId: string },
) {
  const journalLine = await db.query.journalLines.findFirst({
    where: and(
      eq(journalLines.id, params.journalLineId),
      eq(journalLines.orgId, params.orgId),
      eq(journalLines.grantId, params.grantId),
    ),
  });
  if (!journalLine) throw notFound("Journal line not found");
  return journalLine;
}

async function getBudgetLineInGrant(
  db: Database,
  params: { orgId: string; grantId: string; budgetLineId: string } & EntityScopedParams,
) {
  const line = await db.query.grantBudgetLines.findFirst({
    where: and(
      eq(grantBudgetLines.id, params.budgetLineId),
      eq(grantBudgetLines.orgId, params.orgId),
      entityScopeCondition(grantBudgetLines, params.entityId),
      isNull(grantBudgetLines.deletedAt),
    ),
    with: { budgetVersion: true },
  });
  if (
    !line ||
    line.budgetVersion?.orgId !== params.orgId ||
    line.budgetVersion.grantId !== params.grantId ||
    line.budgetVersion.deletedAt != null
  ) {
    throw notFound("Budget line not found");
  }
  return line;
}

export async function setExpenseBudgetAllocations(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    grantId: string;
    expenseId: string;
    actorId?: string;
  } & ExpenseBudgetAllocationInput,
) {
  const expense = await getExpenseInOrg(db, params);
  return setBudgetAllocationsForSource(db, {
    ...params,
    activeEntityId: params.entityId ?? expense.entityId ?? "entity-1",
    sourceKind: "expense",
    sourceId: params.expenseId,
    sourceAmountCents: expense.amountCents,
  });
}

export async function setJournalLineBudgetAllocations(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    grantId: string;
    journalLineId: string;
    actorId?: string;
  } & ExpenseBudgetAllocationInput,
) {
  const journalLine = await getJournalLineInGrant(db, params);
  return setBudgetAllocationsForSource(db, {
    ...params,
    activeEntityId: params.entityId ?? "entity-1",
    sourceKind: "journal_line",
    sourceId: params.journalLineId,
    sourceAmountCents: Math.max(journalLine.debitCents, journalLine.creditCents),
  });
}

async function setBudgetAllocationsForSource(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    activeEntityId: string;
    grantId: string;
    actorId?: string;
    sourceKind: "expense" | "journal_line";
    sourceId: string;
    sourceAmountCents: number;
  } & ExpenseBudgetAllocationInput,
) {
  const total = totalBudgetAllocationCents(params.allocations);
  if (total !== params.sourceAmountCents) {
    throw badRequest("Budget allocation totals must equal the source amount");
  }

  const existing = await db.query.grantBudgetLineAllocations.findMany({
    where: and(
      eq(grantBudgetLineAllocations.orgId, params.orgId),
      entityScopeCondition(grantBudgetLineAllocations, params.activeEntityId),
      params.sourceKind === "expense"
        ? eq(grantBudgetLineAllocations.expenseId, params.sourceId)
        : eq(grantBudgetLineAllocations.journalLineId, params.sourceId),
      isNull(grantBudgetLineAllocations.deletedAt),
    ),
  });
  const requestedLineIds = [
    ...new Set(params.allocations.map((allocation) => allocation.budgetLineId)),
  ];
  const existingLineAllocations =
    requestedLineIds.length === 0
      ? []
      : await db.query.grantBudgetLineAllocations.findMany({
          where: and(
            eq(grantBudgetLineAllocations.orgId, params.orgId),
            entityScopeCondition(grantBudgetLineAllocations, params.activeEntityId),
            inArray(grantBudgetLineAllocations.budgetLineId, requestedLineIds),
            params.sourceKind === "expense"
              ? or(
                  ne(grantBudgetLineAllocations.expenseId, params.sourceId),
                  isNull(grantBudgetLineAllocations.expenseId),
                )
              : or(
                  ne(grantBudgetLineAllocations.journalLineId, params.sourceId),
                  isNull(grantBudgetLineAllocations.journalLineId),
                ),
            isNull(grantBudgetLineAllocations.deletedAt),
          ),
          columns: { budgetLineId: true, amountCents: true },
        });
  const existingActualByLine = new Map<string, number>();
  for (const allocation of existingLineAllocations) {
    existingActualByLine.set(
      allocation.budgetLineId,
      (existingActualByLine.get(allocation.budgetLineId) ?? 0) + allocation.amountCents,
    );
  }
  const submittedAmountByLine = new Map<string, number>();
  for (const allocation of params.allocations) {
    submittedAmountByLine.set(
      allocation.budgetLineId,
      (submittedAmountByLine.get(allocation.budgetLineId) ?? 0) + allocation.amountCents,
    );
  }

  const warnings: BudgetAllocationWarning[] = [];
  for (const [budgetLineId, newAmountCents] of submittedAmountByLine) {
    const line = await getBudgetLineInGrant(db, {
      orgId: params.orgId,
      grantId: params.grantId,
      budgetLineId,
      entityId: params.activeEntityId,
    });
    warnings.push(
      ...getBudgetLineAllocationWarnings({
        approvedAmountCents: line.approvedAmountCents,
        existingActualCents: existingActualByLine.get(budgetLineId) ?? 0,
        newAmountCents,
        allowable: line.allowable,
      }),
    );
  }
  const activeEntityId = params.activeEntityId;
  if (!activeEntityId) {
    throw badRequest("Active entity is required for budget allocations");
  }

  return db.transaction(async (tx) => {
    await tx
      .update(grantBudgetLineAllocations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(grantBudgetLineAllocations.orgId, params.orgId),
          entityScopeCondition(grantBudgetLineAllocations, activeEntityId),
          params.sourceKind === "expense"
            ? eq(grantBudgetLineAllocations.expenseId, params.sourceId)
            : eq(grantBudgetLineAllocations.journalLineId, params.sourceId),
          isNull(grantBudgetLineAllocations.deletedAt),
        ),
      );

    const allocations =
      params.allocations.length === 0
        ? []
        : await tx
            .insert(grantBudgetLineAllocations)
            .values(
              params.allocations.map((allocation) => ({
                orgId: params.orgId,
                entityId: activeEntityId,
                expenseId: params.sourceKind === "expense" ? params.sourceId : null,
                journalLineId: params.sourceKind === "journal_line" ? params.sourceId : null,
                budgetLineId: allocation.budgetLineId,
                amountCents: allocation.amountCents,
                notes: allocation.notes ?? null,
                createdByUserId: params.actorId ?? null,
              })),
            )
            .returning();

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "replaced",
        entityType: "grant_budget_allocation",
        entityId: params.sourceId,
        activeEntityId,
        changes: { before: existing, after: allocations },
      });
    }

    return { allocations, warnings };
  });
}
