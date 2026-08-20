import { and, eq, isNull } from "drizzle-orm";
import { programBudgetLines, programBudgets, type Database } from "@grantpipe/db";
import {
  programBudgetCreateSchema,
  programBudgetUpdateSchema,
  type ProgramBudgetCreateInput,
  type ProgramBudgetUpdateInput,
} from "@grantpipe/shared";
import { badRequest, internalError, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { assertProgramInOrg } from "./program.service";

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function assertValidBudgetPeriod(periodStart: Date, periodEnd: Date) {
  if (periodStart > periodEnd) {
    throw badRequest("Program budget periodStart must be on or before periodEnd");
  }
}

export async function createProgramBudget(
  db: Database,
  params: { orgId: string; actorId?: string } & ProgramBudgetCreateInput,
) {
  const data = programBudgetCreateSchema.parse(params);
  const periodStart = parseDate(data.periodStart);
  const periodEnd = parseDate(data.periodEnd);
  assertValidBudgetPeriod(periodStart, periodEnd);

  await assertProgramInOrg(db, params.orgId, data.programId);

  return db.transaction(async (tx) => {
    const [budget] = await tx
      .insert(programBudgets)
      .values({
        orgId: params.orgId,
        programId: data.programId,
        name: data.name,
        status: data.status,
        periodStart,
        periodEnd,
      })
      .returning();
    if (!budget) throw internalError("Failed to create program budget");

    const lines = await tx
      .insert(programBudgetLines)
      .values(
        data.lines.map((line) => ({
          orgId: params.orgId,
          budgetId: budget.id,
          category: line.category,
          budgetedCents: line.budgetedCents,
          notes: line.notes ?? null,
        })),
      )
      .returning();

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "program_budget",
        entityId: budget.id,
        entityLabel: budget.name,
        changes: { after: { ...budget, lines } },
      });
    }

    return { ...budget, lines };
  });
}

export async function updateProgramBudget(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    budgetId: string;
    data: ProgramBudgetUpdateInput;
  },
) {
  const data = programBudgetUpdateSchema.parse(params.data);

  const existing = await db.query.programBudgets.findFirst({
    where: and(
      eq(programBudgets.id, params.budgetId),
      eq(programBudgets.orgId, params.orgId),
      isNull(programBudgets.deletedAt),
    ),
    with: { lines: true },
  });
  if (!existing) throw notFound("Program budget not found");

  const effectivePeriodStart = data.periodStart
    ? parseDate(data.periodStart)
    : existing.periodStart;
  const effectivePeriodEnd = data.periodEnd ? parseDate(data.periodEnd) : existing.periodEnd;
  assertValidBudgetPeriod(effectivePeriodStart, effectivePeriodEnd);

  return db.transaction(async (tx) => {
    const [budget] = await tx
      .update(programBudgets)
      .set({
        name: data.name,
        status: data.status,
        periodStart: data.periodStart ? parseDate(data.periodStart) : undefined,
        periodEnd: data.periodEnd ? parseDate(data.periodEnd) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(programBudgets.id, params.budgetId),
          eq(programBudgets.orgId, params.orgId),
          isNull(programBudgets.deletedAt),
        ),
      )
      .returning();
    if (!budget) throw notFound("Program budget not found");

    let lines = existing.lines;
    if (data.lines) {
      await tx
        .update(programBudgetLines)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(programBudgetLines.budgetId, params.budgetId),
            eq(programBudgetLines.orgId, params.orgId),
            isNull(programBudgetLines.deletedAt),
          ),
        );
      lines = await tx
        .insert(programBudgetLines)
        .values(
          data.lines.map((line) => ({
            orgId: params.orgId,
            budgetId: budget.id,
            category: line.category,
            budgetedCents: line.budgetedCents,
            notes: line.notes ?? null,
          })),
        )
        .returning();
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "program_budget",
        entityId: budget.id,
        entityLabel: budget.name,
        changes: { before: existing, after: { ...budget, lines } },
      });
    }

    return { ...budget, lines };
  });
}
