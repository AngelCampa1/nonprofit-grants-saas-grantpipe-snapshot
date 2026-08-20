import {
  and,
  asc,
  count as drizzleCount,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  chartOfAccounts,
  expenses,
  funds,
  grantFundAllocations,
  grants,
  organizations,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type {
  CreateExpenseInput,
  CreateFundInput,
  FundListParams,
  UpdateExpenseInput,
  UpdateFundInput,
} from "@grantpipe/shared";
import { buildFundSummary } from "./summary";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, internalError, notFound } from "../../lib/app-error";
import { postExpense } from "../accounting/postingEngine";

type FundGrantAllocationRecord = {
  allocatedAmountCents: number;
  deletedAt?: Date | null;
  grant?: {
    deletedAt?: Date | null;
  } | null;
};

type FundExpenseRecord = {
  amountCents: number;
  deletedAt?: Date | null;
};

function parseDateValue(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

type EntityScopedParams = { entityId?: string };

function fundEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(funds.entityId, entityId) : undefined;
}

function grantEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(grants.entityId, entityId) : undefined;
}

function expenseEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(expenses.entityId, entityId) : undefined;
}

function allocationEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(grantFundAllocations.entityId, entityId) : undefined;
}

async function assertFundInOrg(db: Database, orgId: string, fundId: string, entityId?: string) {
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(funds.id, fundId),
      eq(funds.orgId, orgId),
      fundEntityScopeCondition(entityId),
      isNull(funds.deletedAt),
    ),
  });

  if (!fund) throw notFound("Fund not found");
  return fund;
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string, entityId?: string) {
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      grantEntityScopeCondition(entityId),
      isNull(grants.deletedAt),
    ),
  });

  if (!grant) throw notFound("Grant not found");
  return grant;
}

async function resolveDefaultEntityId(db: Database, orgId: string) {
  const org = await db.query?.organizations?.findFirst?.({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (org?.defaultEntityId) return org.defaultEntityId;
  return "entity-1";
}

async function assertActiveAccountInOrg(db: Database, orgId: string, accountId: string) {
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, accountId),
      eq(chartOfAccounts.orgId, orgId),
      eq(chartOfAccounts.isActive, true),
      isNull(chartOfAccounts.deletedAt),
    ),
  });

  if (!account) throw notFound("Account not found");
}

async function assertExpenseInGrant(
  db: Database,
  orgId: string,
  grantId: string,
  expenseId: string,
  entityId?: string,
) {
  const expense = await db.query.expenses.findFirst({
    where: and(
      eq(expenses.id, expenseId),
      eq(expenses.orgId, orgId),
      expenseEntityScopeCondition(entityId),
      isNull(expenses.deletedAt),
    ),
  });

  if (!expense) throw notFound("Expense not found");
  // A grant-linked expense must match the grant in the URL. Fund-only expenses
  // (grantId === null) carry no grant, so they remain reachable through any
  // grant-scoped expense path the caller is authorized for — otherwise an
  // expense moved to fund-only via updateExpense would become permanently
  // uneditable and undeletable (there is no fund-scoped expense route).
  if (expense.grantId !== null && expense.grantId !== grantId) {
    throw notFound("Expense not found");
  }
  return expense;
}

export async function listFunds(
  db: Database,
  params: { orgId: string } & EntityScopedParams & FundListParams,
) {
  const { orgId, page, pageSize, search, type, sortBy, sortOrder } = params;
  const conditions = [
    eq(funds.orgId, orgId),
    fundEntityScopeCondition(params.entityId),
    isNull(funds.deletedAt),
  ];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(funds.name, pattern), ilike(funds.description, pattern))!);
  }
  if (type) conditions.push(eq(funds.type, type));

  const where = and(...conditions);
  const sortFn = sortOrder === "desc" ? desc : asc;
  const sortColumn =
    sortBy === "type" ? funds.type : sortBy === "createdAt" ? funds.createdAt : funds.name;

  const data = await db
    .select()
    .from(funds)
    .where(where)
    .orderBy(sortFn(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [countResult] = await db.select({ count: drizzleCount() }).from(funds).where(where);

  if (data.length === 0) {
    return { data: [], total: countResult?.count ?? 0, page, pageSize };
  }

  const ids = data.map((f) => f.id);

  const allocRows = await db
    .select({
      fundId: grantFundAllocations.fundId,
      sum: sql<string>`sum(${grantFundAllocations.allocatedAmountCents})`,
    })
    .from(grantFundAllocations)
    .innerJoin(
      grants,
      and(
        eq(grantFundAllocations.grantId, grants.id),
        eq(grants.orgId, orgId),
        grantEntityScopeCondition(params.entityId),
        isNull(grants.deletedAt),
      ),
    )
    .where(
      and(
        inArray(grantFundAllocations.fundId, ids),
        allocationEntityScopeCondition(params.entityId),
        isNull(grantFundAllocations.deletedAt),
      ),
    )
    .groupBy(grantFundAllocations.fundId);

  const expRows = await db
    .select({
      fundId: expenses.fundId,
      sum: sql<string>`sum(${expenses.amountCents})`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.orgId, orgId),
        expenseEntityScopeCondition(params.entityId),
        inArray(expenses.fundId, ids),
        isNull(expenses.deletedAt),
      ),
    )
    .groupBy(expenses.fundId);

  const allocMap = new Map(allocRows.map((r) => [r.fundId, Number(r.sum) || 0]));
  const expMap = new Map(expRows.map((r) => [r.fundId, Number(r.sum) || 0]));

  const dataWithSummary = data.map((fund) => ({
    ...fund,
    summary: buildFundSummary({
      allocatedTotalCents: allocMap.get(fund.id) ?? 0,
      expenseTotalCents: expMap.get(fund.id) ?? 0,
    }),
  }));

  return {
    data: dataWithSummary,
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getFund(
  db: Database,
  params: { orgId: string; fundId: string } & EntityScopedParams,
) {
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(funds.id, params.fundId),
      eq(funds.orgId, params.orgId),
      fundEntityScopeCondition(params.entityId),
      isNull(funds.deletedAt),
    ),
    with: {
      grantAllocations: { with: { grant: true } },
      expenses: true,
    },
  });

  if (!fund) throw notFound("Fund not found");

  const liveGrantAllocations = (fund.grantAllocations as FundGrantAllocationRecord[]).filter(
    (allocation) =>
      (allocation.deletedAt === undefined || allocation.deletedAt === null) &&
      (allocation.grant?.deletedAt === undefined || allocation.grant?.deletedAt === null),
  );
  const liveExpenses = (fund.expenses as FundExpenseRecord[]).filter(
    (expense) => expense.deletedAt === undefined || expense.deletedAt === null,
  );

  const allocatedTotalCents = liveGrantAllocations.reduce(
    (sum, allocation) => sum + allocation.allocatedAmountCents,
    0,
  );
  const expenseTotalCents = liveExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  return {
    ...fund,
    grantAllocations: liveGrantAllocations,
    expenses: liveExpenses,
    summary: buildFundSummary({ allocatedTotalCents, expenseTotalCents }),
  };
}

export async function createFund(
  db: Database,
  params: { orgId: string; actorId?: string } & EntityScopedParams & CreateFundInput,
) {
  const activeEntityId = params.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  return db.transaction(async (tx) => {
    const [fund] = await tx
      .insert(funds)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        name: params.name,
        type: params.type,
        description: params.description,
      })
      .returning();
    if (!fund) throw internalError("Failed to create fund");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "fund",
        entityId: fund.id,
        changes: { name: fund.name, type: fund.type },
      });
    }
    return fund;
  });
}

export async function updateFund(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    fundId: string;
    data: UpdateFundInput;
  } & EntityScopedParams,
) {
  return db.transaction(async (tx) => {
    const [fund] = await tx
      .update(funds)
      .set({
        name: params.data.name,
        type: params.data.type,
        description: params.data.description,
      })
      .where(
        and(
          eq(funds.id, params.fundId),
          eq(funds.orgId, params.orgId),
          fundEntityScopeCondition(params.entityId),
          isNull(funds.deletedAt),
        ),
      )
      .returning();
    if (!fund) throw notFound("Fund not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "fund",
        entityId: fund.id,
        changes: params.data,
      });
    }
    return fund;
  });
}

export async function deleteFund(
  db: Database,
  params: { orgId: string; actorId?: string; fundId: string } & EntityScopedParams,
) {
  await db.transaction(async (tx) => {
    const [fund] = await tx
      .update(funds)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(funds.id, params.fundId),
          eq(funds.orgId, params.orgId),
          fundEntityScopeCondition(params.entityId),
          isNull(funds.deletedAt),
        ),
      )
      .returning();
    if (!fund) throw notFound("Fund not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "fund",
        entityId: params.fundId,
        changes: null,
      });
    }
  });
}

export async function createExpense(
  db: Database,
  params: { orgId: string; actorId?: string } & EntityScopedParams & CreateExpenseInput,
) {
  if (!params.fundId && !params.grantId) {
    throw badRequest("Expense must reference a grant or fund");
  }
  const fund = params.fundId
    ? await assertFundInOrg(db, params.orgId, params.fundId, params.entityId)
    : undefined;
  const grant = params.grantId
    ? await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId)
    : undefined;
  const activeEntityId =
    params.entityId ??
    fund?.entityId ??
    grant?.entityId ??
    (await resolveDefaultEntityId(db, params.orgId));
  if (params.accountId) await assertActiveAccountInOrg(db, params.orgId, params.accountId);

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        grantId: params.grantId,
        fundId: params.fundId,
        amountCents: params.amountCents,
        date: parseDateValue(params.date),
        description: params.description,
        category: params.category,
        accountId: params.accountId,
        vendor: params.vendor,
        reimbursable: params.reimbursable,
      })
      .returning();
    if (!expense) throw internalError("Failed to create expense");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "expense",
        entityId: expense.id,
        changes: {
          grantId: expense.grantId,
          fundId: expense.fundId,
          amountCents: expense.amountCents,
        },
      });
      await postExpense(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        expenseId: expense.id,
        action: "create",
      });
    }
    return expense;
  });
}

export async function updateExpense(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    expenseId: string;
    data: UpdateExpenseInput;
  } & EntityScopedParams,
) {
  const currentExpense = await assertExpenseInGrant(
    db,
    params.orgId,
    params.grantId,
    params.expenseId,
    params.entityId,
  );
  const payload: Partial<typeof expenses.$inferInsert> = {};
  if (params.data.grantId !== undefined) {
    if (params.data.grantId !== null)
      await assertGrantInOrg(db, params.orgId, params.data.grantId, params.entityId);
    payload.grantId = params.data.grantId;
  }
  if (params.data.fundId !== undefined) {
    if (params.data.fundId !== null)
      await assertFundInOrg(db, params.orgId, params.data.fundId, params.entityId);
    payload.fundId = params.data.fundId;
  }
  if (params.data.amountCents !== undefined) payload.amountCents = params.data.amountCents;
  if (params.data.date !== undefined) payload.date = parseDateValue(params.data.date);
  if (params.data.description !== undefined) payload.description = params.data.description;
  if (params.data.category !== undefined) payload.category = params.data.category;
  if (params.data.vendor !== undefined) payload.vendor = params.data.vendor;
  if (params.data.reimbursable !== undefined) payload.reimbursable = params.data.reimbursable;
  if (params.data.accountId !== undefined) payload.accountId = params.data.accountId;
  if (params.data.accountId) {
    await assertActiveAccountInOrg(db, params.orgId, params.data.accountId);
  }

  const nextGrantId =
    params.data.grantId !== undefined ? params.data.grantId : currentExpense.grantId;
  const nextFundId = params.data.fundId !== undefined ? params.data.fundId : currentExpense.fundId;
  if (nextGrantId === null && nextFundId === null) {
    throw badRequest("Expense must reference a grant or fund");
  }

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .update(expenses)
      .set(payload)
      .where(
        and(
          eq(expenses.id, params.expenseId),
          eq(expenses.orgId, params.orgId),
          expenseEntityScopeCondition(params.entityId),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();
    if (!expense) throw notFound("Expense not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "expense",
        entityId: expense.id,
        changes: params.data,
      });
      await postExpense(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        expenseId: expense.id,
        action: "update",
      });
    }
    return expense;
  });
}

export async function deleteExpense(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    expenseId: string;
  } & EntityScopedParams,
): Promise<void> {
  await assertExpenseInGrant(db, params.orgId, params.grantId, params.expenseId, params.entityId);
  await db.transaction(async (tx) => {
    const [expense] = await tx
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(expenses.id, params.expenseId),
          eq(expenses.orgId, params.orgId),
          expenseEntityScopeCondition(params.entityId),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();
    if (!expense) throw notFound("Expense not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "expense",
        entityId: params.expenseId,
        changes: null,
      });
      await postExpense(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        expenseId: params.expenseId,
        action: "delete",
      });
    }
  });
}
