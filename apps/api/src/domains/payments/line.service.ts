import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  grantBudgetLines,
  grantPaymentRequests,
  grantPaymentRequestLines,
  grantPaymentRequestAdjustments,
  expenses,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  createPaymentRequestAdjustmentSchema,
  createPaymentRequestLineSchema,
  updatePaymentRequestLineSchema,
} from "@grantpipe/shared";
import type {
  CreatePaymentRequestAdjustmentInput,
  CreatePaymentRequestLineInput,
  EligibleExpenseQueryParams,
  UpdatePaymentRequestLineInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, conflict, internalError, notFound } from "../../lib/app-error";
import { recalcRequestAmounts } from "./request.service";
import { evaluateUniformGuidanceCostGuardrails } from "./ug-guardrails.service";
import { paymentRequestEntityScope, type PaymentEntityScope } from "./entity-scope";

function assertLineAmountWithinExpense(lineAmountCents: number, expenseAmountCents: number) {
  if (lineAmountCents > expenseAmountCents) {
    throw badRequest("Line amount cannot exceed the source expense amount");
  }
}

async function assertBudgetLineInGrant(
  db: Database,
  params: PaymentEntityScope & { grantId: string; budgetLineId: string },
) {
  const budgetLine = await db.query.grantBudgetLines.findFirst({
    where: and(
      eq(grantBudgetLines.id, params.budgetLineId),
      eq(grantBudgetLines.orgId, params.orgId),
      eq(grantBudgetLines.entityId, params.entityId ?? ""),
      isNull(grantBudgetLines.deletedAt),
    ),
    with: { budgetVersion: true },
  });

  if (
    !budgetLine ||
    budgetLine.budgetVersion?.orgId !== params.orgId ||
    budgetLine.budgetVersion.grantId !== params.grantId ||
    budgetLine.budgetVersion.deletedAt != null
  ) {
    throw notFound("Budget line not found");
  }
}

// ---------------------------------------------------------------------------
// listEligibleExpenses
// ---------------------------------------------------------------------------

export async function listEligibleExpenses(
  db: Database,
  params: PaymentEntityScope & {
    grantId: string;
    requestId: string;
    queryParams: EligibleExpenseQueryParams;
  },
) {
  const { orgId, grantId, queryParams } = params;

  const conditions = [
    eq(expenses.orgId, orgId),
    eq(expenses.entityId, params.entityId ?? ""),
    eq(expenses.reimbursable, true),
    isNull(expenses.deletedAt),
  ];

  if (grantId) conditions.push(eq(expenses.grantId, grantId));
  if (queryParams.category) conditions.push(eq(expenses.category, queryParams.category));

  if (queryParams.periodStart) {
    conditions.push(sql`${expenses.date} >= ${new Date(queryParams.periodStart)}`);
  }
  if (queryParams.periodEnd) {
    conditions.push(sql`${expenses.date} <= ${new Date(queryParams.periodEnd)}`);
  }
  if (queryParams.search) {
    const pattern = `%${queryParams.search}%`;
    conditions.push(
      sql`(${expenses.description} ILIKE ${pattern} OR ${expenses.vendor} ILIKE ${pattern})`,
    );
  }

  // Exclude expenses already claimed in any non-deleted, non-rejected request.
  conditions.push(
    sql`NOT EXISTS (
      SELECT 1 FROM ${grantPaymentRequestLines} l
      INNER JOIN ${grantPaymentRequests} r ON r.id = l.request_id
      WHERE l.expense_id = ${expenses.id}
        AND l.deleted_at IS NULL
        AND r.org_id = ${orgId}
        AND r.deleted_at IS NULL
        AND r.status NOT IN ('rejected')
    )`,
  );

  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      vendor: expenses.vendor,
      date: expenses.date,
      amountCents: expenses.amountCents,
      category: expenses.category,
    })
    .from(expenses)
    .where(and(...conditions));

  // Compute alreadyClaimedCents per expense across all non-rejected, non-deleted lines
  const expenseIds = rows.map((r) => r.id);
  if (expenseIds.length === 0) return [];

  const claimedRows = await db
    .select({
      expenseId: grantPaymentRequestLines.expenseId,
      claimedCents: sql<number>`COALESCE(SUM(${grantPaymentRequestLines.amountCents}), 0)`,
    })
    .from(grantPaymentRequestLines)
    .innerJoin(
      grantPaymentRequests,
      eq(grantPaymentRequests.id, grantPaymentRequestLines.requestId),
    )
    .where(
      and(
        inArray(grantPaymentRequestLines.expenseId, expenseIds),
        isNull(grantPaymentRequestLines.deletedAt),
        isNull(grantPaymentRequests.deletedAt),
        sql`${grantPaymentRequests.status} NOT IN ('rejected')`,
        eq(grantPaymentRequests.orgId, orgId),
        paymentRequestEntityScope(grantPaymentRequests.grantId, params),
      ),
    )
    .groupBy(grantPaymentRequestLines.expenseId);

  const claimedMap = new Map<string, number>();
  for (const row of claimedRows) {
    if (row.expenseId) claimedMap.set(row.expenseId, Number(row.claimedCents));
  }

  return rows.map((expense) => ({
    ...expense,
    alreadyClaimedCents: claimedMap.get(expense.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// addLine
// ---------------------------------------------------------------------------

export async function addLine(
  db: Database,
  params: PaymentEntityScope & {
    actorId: string;
    requestId: string;
    data: CreatePaymentRequestLineInput;
  },
) {
  const { orgId, actorId, requestId } = params;
  const data = createPaymentRequestLineSchema.parse(params.data);

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");
  if (request.status !== "draft") {
    throw badRequest("Lines can only be added to draft requests");
  }
  if (data.budgetLineId) {
    await assertBudgetLineInGrant(db, {
      orgId,
      entityId: params.entityId,
      grantId: request.grantId,
      budgetLineId: data.budgetLineId,
    });
  }

  const guardrails = await evaluateUniformGuidanceCostGuardrails(db, {
    orgId,
    entityId: params.entityId,
    requestId,
    data,
  });
  const blockingFinding = guardrails.findings.find((finding) => finding.severity === "block");
  if (blockingFinding) {
    throw badRequest(blockingFinding.message);
  }

  if (data.expenseId) {
    const expenseId = data.expenseId;
    return db.transaction(async (tx) => {
      // Dedup guard: check if this expense is already claimed in an active request.
      const [existing] = await tx
        .select({ id: grantPaymentRequestLines.id })
        .from(grantPaymentRequestLines)
        .innerJoin(
          grantPaymentRequests,
          eq(grantPaymentRequests.id, grantPaymentRequestLines.requestId),
        )
        .where(
          and(
            eq(grantPaymentRequestLines.expenseId, expenseId),
            isNull(grantPaymentRequestLines.deletedAt),
            eq(grantPaymentRequests.orgId, orgId),
            isNull(grantPaymentRequests.deletedAt),
            paymentRequestEntityScope(grantPaymentRequests.grantId, params),
            sql`${grantPaymentRequests.status} NOT IN ('rejected')`,
          ),
        );

      if (existing) {
        throw conflict(
          "Expense is already claimed in an active request. Use an adjustment to override.",
        );
      }

      // Verify the expense belongs to this org and the same grant as the request
      const expense = await tx.query.expenses.findFirst({
        where: and(
          eq(expenses.id, expenseId),
          eq(expenses.orgId, orgId),
          eq(expenses.entityId, params.entityId ?? ""),
          isNull(expenses.deletedAt),
        ),
      });

      if (!expense) throw notFound("Expense not found");
      if (expense.grantId !== request.grantId) {
        throw badRequest("Expense does not belong to the same grant as this request");
      }
      if (expense.reimbursable === false) {
        throw badRequest("Expense is not reimbursable");
      }
      assertLineAmountWithinExpense(data.amountCents, expense.amountCents);

      const [line] = await tx
        .insert(grantPaymentRequestLines)
        .values({
          orgId,
          requestId,
          expenseId,
          budgetLineId: data.budgetLineId ?? null,
          category: data.category,
          description: data.description ?? null,
          amountCents: data.amountCents,
          sortOrder: data.sortOrder,
        })
        .returning();

      if (!line) throw internalError("Failed to create line");

      await recalcRequestAmounts(tx, { requestId, orgId, entityId: params.entityId });

      await recordActivityLog(tx, {
        orgId,
        activeEntityId: params.entityId,
        actorId,
        action: "added",
        entityType: "payment_request_line",
        entityId: line.id,
        entityLabel: data.description ?? null,
        changes: { requestId, amountCents: data.amountCents, category: data.category },
      });

      return line;
    });
  }

  // No expenseId path
  return db.transaction(async (tx) => {
    const [line] = await tx
      .insert(grantPaymentRequestLines)
      .values({
        orgId,
        requestId,
        expenseId: null,
        budgetLineId: data.budgetLineId ?? null,
        category: data.category,
        description: data.description ?? null,
        amountCents: data.amountCents,
        sortOrder: data.sortOrder,
      })
      .returning();

    if (!line) throw internalError("Failed to create line");

    await recalcRequestAmounts(tx, { requestId, orgId, entityId: params.entityId });

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "added",
      entityType: "payment_request_line",
      entityId: line.id,
      entityLabel: data.description ?? null,
      changes: { requestId, amountCents: data.amountCents, category: data.category },
    });

    return line;
  });
}

// ---------------------------------------------------------------------------
// updateLine
// ---------------------------------------------------------------------------

export async function updateLine(
  db: Database,
  params: PaymentEntityScope & {
    actorId: string;
    requestId: string;
    lineId: string;
    data: UpdatePaymentRequestLineInput;
  },
) {
  const { orgId, actorId, requestId, lineId } = params;
  const data = updatePaymentRequestLineSchema.parse(params.data);

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");
  if (request.status !== "draft") {
    throw badRequest("Lines can only be updated on draft requests");
  }

  const line = await db.query.grantPaymentRequestLines.findFirst({
    where: and(
      eq(grantPaymentRequestLines.id, lineId),
      eq(grantPaymentRequestLines.requestId, requestId),
      eq(grantPaymentRequestLines.orgId, orgId),
      isNull(grantPaymentRequestLines.deletedAt),
    ),
  });

  if (!line) throw notFound("Line not found");
  if (line.expenseId && data.amountCents !== undefined) {
    const expense = await db.query.expenses.findFirst({
      where: and(
        eq(expenses.id, line.expenseId),
        eq(expenses.orgId, orgId),
        eq(expenses.entityId, params.entityId ?? ""),
        isNull(expenses.deletedAt),
      ),
    });

    if (!expense) throw notFound("Expense not found");
    assertLineAmountWithinExpense(data.amountCents, expense.amountCents);
  }

  const guardrails = await evaluateUniformGuidanceCostGuardrails(db, {
    orgId,
    entityId: params.entityId,
    requestId,
    data: {
      expenseId: line.expenseId ?? undefined,
      budgetLineId: line.budgetLineId ?? undefined,
      category: (data.category ?? line.category) as CreatePaymentRequestLineInput["category"],
      description: data.description ?? line.description ?? undefined,
      amountCents: data.amountCents ?? line.amountCents,
      sortOrder: data.sortOrder ?? line.sortOrder ?? 0,
    },
  });
  const blockingFinding = guardrails.findings.find((finding) => finding.severity === "block");
  if (blockingFinding) {
    throw badRequest(blockingFinding.message);
  }

  const payload: Partial<typeof grantPaymentRequestLines.$inferInsert> = {};
  if (data.category !== undefined) payload.category = data.category;
  if (data.description !== undefined) payload.description = data.description;
  if (data.amountCents !== undefined) payload.amountCents = data.amountCents;
  if (data.approvedAmountCents !== undefined)
    payload.approvedAmountCents = data.approvedAmountCents;
  if (data.rejectionReason !== undefined) payload.rejectionReason = data.rejectionReason;
  if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(grantPaymentRequestLines)
      .set(payload)
      .where(
        and(
          eq(grantPaymentRequestLines.id, lineId),
          eq(grantPaymentRequestLines.orgId, orgId),
          isNull(grantPaymentRequestLines.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw notFound("Line not found");

    await recalcRequestAmounts(tx, { requestId, orgId, entityId: params.entityId });

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "updated",
      entityType: "payment_request_line",
      entityId: lineId,
      entityLabel: updated.description ?? null,
      changes: data,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// removeLine
// ---------------------------------------------------------------------------

export async function removeLine(
  db: Database,
  params: PaymentEntityScope & { actorId: string; requestId: string; lineId: string },
) {
  const { orgId, actorId, requestId, lineId } = params;

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");
  if (request.status !== "draft") {
    throw badRequest("Lines can only be removed from draft requests");
  }

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(grantPaymentRequestLines)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantPaymentRequestLines.id, lineId),
          eq(grantPaymentRequestLines.requestId, requestId),
          eq(grantPaymentRequestLines.orgId, orgId),
          isNull(grantPaymentRequestLines.deletedAt),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Line not found");

    await recalcRequestAmounts(tx, { requestId, orgId, entityId: params.entityId });

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "removed",
      entityType: "payment_request_line",
      entityId: lineId,
      entityLabel: deleted.description ?? null,
      changes: null,
    });
  });
}

// ---------------------------------------------------------------------------
// createAdjustment
// ---------------------------------------------------------------------------

export async function createAdjustment(
  db: Database,
  params: PaymentEntityScope & {
    actorId: string;
    requestId: string;
    data: CreatePaymentRequestAdjustmentInput;
  },
) {
  const { orgId, actorId, requestId } = params;
  const data = createPaymentRequestAdjustmentSchema.parse(params.data);

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");

  return db.transaction(async (tx) => {
    const [adjustment] = await tx
      .insert(grantPaymentRequestAdjustments)
      .values({
        orgId,
        requestId,
        kind: data.kind,
        amountCents: data.amountCents ?? null,
        reason: data.reason,
        createdBy: actorId,
      })
      .returning();

    if (!adjustment) throw internalError("Failed to create adjustment");

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "created",
      entityType: "payment_request_adjustment",
      entityId: adjustment.id,
      entityLabel: `Request #${request.requestNumber} adjustment`,
      changes: { kind: data.kind, amountCents: data.amountCents, reason: data.reason },
    });

    return adjustment;
  });
}
