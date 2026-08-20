import { and, eq, isNull } from "drizzle-orm";
import {
  expenseProgramAllocations,
  expenses,
  grantProgramAllocations,
  grants,
  type Database,
} from "@grantpipe/db";
import type {
  ExpenseProgramAllocationReplaceInput,
  GrantProgramAllocationReplaceInput,
} from "@grantpipe/shared";
import {
  expenseProgramAllocationReplaceSchema,
  grantProgramAllocationReplaceSchema,
} from "@grantpipe/shared";
import { badRequest, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { assertProgramInOrg } from "./program.service";

type AllocationRow = {
  amountCents?: number;
  percentBasisPoints?: number;
};

export function totalAllocatedCents(rows: AllocationRow[], sourceAmountCents: number): number {
  return rows.reduce((total, row) => {
    if (row.amountCents !== undefined) return total + row.amountCents;
    return total + Math.round((sourceAmountCents * (row.percentBasisPoints ?? 0)) / 10_000);
  }, 0);
}

export function buildAllocationWarnings(rows: AllocationRow[], sourceAmountCents: number) {
  const allocatedCents = totalAllocatedCents(rows, sourceAmountCents);
  return allocatedCents > sourceAmountCents
    ? [{ code: "source_over_allocated" as const, allocatedCents, sourceAmountCents }]
    : [];
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string) {
  const grant = await db.query.grants.findFirst({
    where: and(eq(grants.id, grantId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
  });
  if (!grant) throw notFound("Grant not found");
  return grant;
}

async function assertExpenseInOrg(db: Database, orgId: string, expenseId: string) {
  const expense = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.orgId, orgId), isNull(expenses.deletedAt)),
  });
  if (!expense) throw notFound("Expense not found");
  return expense;
}

export async function replaceGrantProgramAllocations(
  db: Database,
  params: { orgId: string; actorId?: string } & GrantProgramAllocationReplaceInput,
) {
  const data = grantProgramAllocationReplaceSchema.parse(params);
  const grant = await assertGrantInOrg(db, params.orgId, data.grantId);
  for (const allocation of data.allocations) {
    await assertProgramInOrg(db, params.orgId, allocation.programId);
  }

  const existing = await db.query.grantProgramAllocations.findMany({
    where: and(
      eq(grantProgramAllocations.orgId, params.orgId),
      eq(grantProgramAllocations.grantId, data.grantId),
      isNull(grantProgramAllocations.deletedAt),
    ),
  });
  const warnings = buildAllocationWarnings(data.allocations, grant.amountCents ?? 0);

  return db.transaction(async (tx) => {
    await tx
      .update(grantProgramAllocations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(grantProgramAllocations.orgId, params.orgId),
          eq(grantProgramAllocations.grantId, data.grantId),
          isNull(grantProgramAllocations.deletedAt),
        ),
      );

    const allocations =
      data.allocations.length === 0
        ? []
        : await tx
            .insert(grantProgramAllocations)
            .values(
              data.allocations.map((allocation) => ({
                orgId: params.orgId,
                grantId: data.grantId,
                programId: allocation.programId,
                amountCents: allocation.amountCents ?? null,
                percentBasisPoints: allocation.percentBasisPoints ?? null,
              })),
            )
            .returning();

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "replaced",
        entityType: "program_allocation",
        entityId: data.grantId,
        entityLabel: grant.name,
        changes: { before: existing, after: allocations },
      });
    }

    return { allocations, warnings };
  });
}

export async function replaceExpenseProgramAllocations(
  db: Database,
  params: { orgId: string; actorId?: string } & ExpenseProgramAllocationReplaceInput,
) {
  const data = expenseProgramAllocationReplaceSchema.parse(params);
  const expense = await assertExpenseInOrg(db, params.orgId, data.expenseId);
  const balanced = data.balanceMode === "replace_and_balance";
  for (const allocation of data.allocations) {
    await assertProgramInOrg(db, params.orgId, allocation.programId);
  }
  if (balanced) {
    const allocated = totalAllocatedCents(data.allocations, expense.amountCents);
    if (data.allocations.some((allocation) => allocation.amountCents !== undefined)) {
      if (allocated !== expense.amountCents) {
        throw badRequest("Amount allocations must equal expense amount");
      }
    }
  }

  const existing = await db.query.expenseProgramAllocations.findMany({
    where: and(
      eq(expenseProgramAllocations.orgId, params.orgId),
      eq(expenseProgramAllocations.expenseId, data.expenseId),
      isNull(expenseProgramAllocations.deletedAt),
    ),
  });
  const warnings = buildAllocationWarnings(data.allocations, expense.amountCents);

  return db.transaction(async (tx) => {
    await tx
      .update(expenseProgramAllocations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(expenseProgramAllocations.orgId, params.orgId),
          eq(expenseProgramAllocations.expenseId, data.expenseId),
          isNull(expenseProgramAllocations.deletedAt),
        ),
      );

    const allocations =
      data.allocations.length === 0
        ? []
        : await tx
            .insert(expenseProgramAllocations)
            .values(
              data.allocations.map((allocation) => ({
                orgId: params.orgId,
                expenseId: data.expenseId,
                programId: allocation.programId,
                fundId: expense.fundId,
                grantId: expense.grantId,
                amountCents: allocation.amountCents ?? null,
                percentBasisPoints: allocation.percentBasisPoints ?? null,
              })),
            )
            .returning();

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "replaced",
        entityType: "program_allocation",
        entityId: data.expenseId,
        changes: { before: existing, after: allocations },
      });
    }

    return { allocations, warnings };
  });
}
