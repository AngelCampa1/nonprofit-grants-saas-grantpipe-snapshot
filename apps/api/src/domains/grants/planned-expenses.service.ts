import { and, asc, eq, isNull } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  chartOfAccounts,
  expenses,
  funds,
  grantBudgetLines,
  grantBudgetPeriods,
  grants,
  plannedExpenses,
  type Database,
  type TransactionDatabase,
} from "@grantpipe/db";
import type {
  ConvertPlannedExpenseInput,
  CreatePlannedExpenseInput,
  UpdatePlannedExpenseInput,
} from "@grantpipe/shared";
import {
  convertPlannedExpenseSchema,
  createPlannedExpenseSchema,
  updatePlannedExpenseSchema,
} from "@grantpipe/shared";
import { badRequest, internalError, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { postExpense } from "../accounting/postingEngine";

type EntityScopedParams = { entityId?: string };

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function entityScopeCondition(table: { entityId: Column }, entityId?: string) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string, entityId?: string) {
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      entityScopeCondition(grants, entityId),
      isNull(grants.deletedAt),
    ),
    columns: { id: true, entityId: true },
  });
  if (!grant) throw notFound("Grant not found");
  return grant;
}

async function assertFundInOrg(db: Database, orgId: string, fundId: string, entityId?: string) {
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(funds.id, fundId),
      eq(funds.orgId, orgId),
      entityScopeCondition(funds, entityId),
      isNull(funds.deletedAt),
    ),
    columns: { id: true },
  });
  if (!fund) throw notFound("Fund not found");
}

async function assertActiveAccountInOrg(db: Database, orgId: string, accountId: string) {
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, accountId),
      eq(chartOfAccounts.orgId, orgId),
      eq(chartOfAccounts.isActive, true),
      isNull(chartOfAccounts.deletedAt),
    ),
    columns: { id: true },
  });
  if (!account) throw notFound("Account not found");
}

async function getBudgetLineForGrant(
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

async function assertPeriodInBudgetVersion(
  db: Database,
  params: { orgId: string; budgetVersionId: string; budgetPeriodId: string } & EntityScopedParams,
) {
  const period = await db.query.grantBudgetPeriods.findFirst({
    where: and(
      eq(grantBudgetPeriods.id, params.budgetPeriodId),
      eq(grantBudgetPeriods.orgId, params.orgId),
      eq(grantBudgetPeriods.budgetVersionId, params.budgetVersionId),
      entityScopeCondition(grantBudgetPeriods, params.entityId),
      isNull(grantBudgetPeriods.deletedAt),
    ),
    columns: { id: true },
  });
  if (!period) throw notFound("Budget period not found");
}

export async function listPlannedExpenses(
  db: Database,
  params: { orgId: string; grantId: string } & EntityScopedParams,
) {
  await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  return db.query.plannedExpenses.findMany({
    where: and(
      eq(plannedExpenses.orgId, params.orgId),
      eq(plannedExpenses.grantId, params.grantId),
      entityScopeCondition(plannedExpenses, params.entityId),
      isNull(plannedExpenses.deletedAt),
    ),
    with: { budgetLine: true, budgetPeriod: true },
    orderBy: [asc(plannedExpenses.expectedDate), asc(plannedExpenses.createdAt)],
  });
}

export async function createPlannedExpense(
  db: Database,
  params: { orgId: string; grantId: string; actorId?: string } & EntityScopedParams &
    CreatePlannedExpenseInput,
) {
  const data = createPlannedExpenseSchema.parse(params);
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId = params.entityId ?? grant.entityId;
  const line = await getBudgetLineForGrant(db, {
    orgId: params.orgId,
    grantId: params.grantId,
    budgetLineId: data.budgetLineId,
    entityId: activeEntityId,
  });
  if (data.budgetPeriodId) {
    await assertPeriodInBudgetVersion(db, {
      orgId: params.orgId,
      budgetVersionId: line.budgetVersionId,
      budgetPeriodId: data.budgetPeriodId,
      entityId: activeEntityId,
    });
  }

  return db.transaction(async (tx) => {
    const [planned] = await tx
      .insert(plannedExpenses)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        grantId: params.grantId,
        budgetLineId: data.budgetLineId,
        budgetPeriodId: data.budgetPeriodId ?? null,
        description: data.description,
        amountCents: data.amountCents,
        expectedDate: parseDate(data.expectedDate),
        status: data.status,
        notes: data.notes ?? null,
        createdByUserId: params.actorId ?? null,
      })
      .returning();
    if (!planned) throw internalError("Failed to create planned expense");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "planned_expense",
        entityId: planned.id,
        activeEntityId,
        entityLabel: planned.description,
        changes: { after: planned },
      });
    }
    return planned;
  });
}

export async function updatePlannedExpense(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    grantId: string;
    actorId?: string;
    plannedExpenseId: string;
    data: UpdatePlannedExpenseInput;
  },
) {
  const data = updatePlannedExpenseSchema.parse(params.data);
  const existing = await db.query.plannedExpenses.findFirst({
    where: and(
      eq(plannedExpenses.id, params.plannedExpenseId),
      eq(plannedExpenses.orgId, params.orgId),
      eq(plannedExpenses.grantId, params.grantId),
      entityScopeCondition(plannedExpenses, params.entityId),
      isNull(plannedExpenses.deletedAt),
    ),
  });
  if (!existing) throw notFound("Planned expense not found");

  const line = await getBudgetLineForGrant(db, {
    orgId: params.orgId,
    grantId: params.grantId,
    budgetLineId: existing.budgetLineId,
    entityId: existing.entityId,
  });
  if (data.budgetPeriodId) {
    await assertPeriodInBudgetVersion(db, {
      orgId: params.orgId,
      budgetVersionId: line.budgetVersionId,
      budgetPeriodId: data.budgetPeriodId,
      entityId: existing.entityId,
    });
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(plannedExpenses)
      .set({
        budgetPeriodId: data.budgetPeriodId === undefined ? undefined : data.budgetPeriodId,
        description: data.description,
        amountCents: data.amountCents,
        expectedDate: data.expectedDate ? parseDate(data.expectedDate) : undefined,
        status: data.status,
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plannedExpenses.id, params.plannedExpenseId),
          eq(plannedExpenses.orgId, params.orgId),
          eq(plannedExpenses.grantId, params.grantId),
          entityScopeCondition(plannedExpenses, existing.entityId),
          isNull(plannedExpenses.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw notFound("Planned expense not found");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "planned_expense",
        entityId: updated.id,
        activeEntityId: existing.entityId,
        entityLabel: updated.description,
        changes: { before: existing, after: updated },
      });
    }
    return updated;
  });
}

export async function deletePlannedExpense(
  db: Database,
  params: {
    orgId: string;
    grantId: string;
    actorId?: string;
    plannedExpenseId: string;
  } & EntityScopedParams,
) {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(plannedExpenses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(plannedExpenses.id, params.plannedExpenseId),
          eq(plannedExpenses.orgId, params.orgId),
          eq(plannedExpenses.grantId, params.grantId),
          entityScopeCondition(plannedExpenses, params.entityId),
          isNull(plannedExpenses.deletedAt),
        ),
      )
      .returning();
    if (!deleted) throw notFound("Planned expense not found");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "planned_expense",
        entityId: deleted.id,
        activeEntityId: deleted.entityId,
        entityLabel: deleted.description,
        changes: { before: deleted, after: null },
      });
    }
    return deleted;
  });
}

export async function convertPlannedExpense(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    grantId: string;
    actorId?: string;
    plannedExpenseId: string;
    data: ConvertPlannedExpenseInput;
  },
) {
  const data = convertPlannedExpenseSchema.parse(params.data);
  const existing = await db.query.plannedExpenses.findFirst({
    where: and(
      eq(plannedExpenses.id, params.plannedExpenseId),
      eq(plannedExpenses.orgId, params.orgId),
      eq(plannedExpenses.grantId, params.grantId),
      entityScopeCondition(plannedExpenses, params.entityId),
      isNull(plannedExpenses.deletedAt),
    ),
  });
  if (!existing) throw notFound("Planned expense not found");
  if (existing.status === "converted" || existing.convertedExpenseId) {
    throw badRequest("Planned expense is already converted");
  }
  if (existing.status === "cancelled") {
    throw badRequest("Cancelled planned expenses cannot be converted");
  }

  const line = await getBudgetLineForGrant(db, {
    orgId: params.orgId,
    grantId: params.grantId,
    budgetLineId: existing.budgetLineId,
    entityId: existing.entityId,
  });
  if (data.fundId) await assertFundInOrg(db, params.orgId, data.fundId, existing.entityId);
  if (data.accountId) await assertActiveAccountInOrg(db, params.orgId, data.accountId);

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        orgId: params.orgId,
        entityId: existing.entityId,
        grantId: params.grantId,
        fundId: data.fundId === undefined ? (line.fundId ?? null) : data.fundId,
        amountCents: existing.amountCents,
        date: data.date ? parseDate(data.date) : existing.expectedDate,
        description: data.description ?? existing.description,
        category: line.category,
        accountId: data.accountId === undefined ? null : data.accountId,
        vendor: data.vendor ?? null,
        reimbursable: data.reimbursable ?? true,
      })
      .returning();
    if (!expense) throw internalError("Failed to convert planned expense");

    const [converted] = await tx
      .update(plannedExpenses)
      .set({
        status: "converted",
        convertedExpenseId: expense.id,
        notes: data.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plannedExpenses.id, params.plannedExpenseId),
          eq(plannedExpenses.orgId, params.orgId),
          eq(plannedExpenses.grantId, params.grantId),
          entityScopeCondition(plannedExpenses, existing.entityId),
          isNull(plannedExpenses.convertedExpenseId),
          isNull(plannedExpenses.deletedAt),
        ),
      )
      .returning();
    if (!converted) throw badRequest("Planned expense is already converted");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "converted",
        entityType: "planned_expense",
        entityId: converted.id,
        activeEntityId: existing.entityId,
        entityLabel: converted.description,
        changes: { before: existing, after: converted, expenseId: expense.id },
      });
      await postExpense(tx as TransactionDatabase, {
        orgId: params.orgId,
        actorId: params.actorId,
        expenseId: expense.id,
        action: "create",
      });
    }

    return { plannedExpense: converted, expense };
  });
}
