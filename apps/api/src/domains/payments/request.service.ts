import { and, count as drizzleCount, desc, eq, isNull, sql } from "drizzle-orm";
import {
  grantPaymentRequests,
  grantPaymentRequestLines,
  grantPaymentRequestAdjustments,
  grantPayments,
  grants,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type {
  CreatePaymentRequestInput,
  PaymentRequestListParams,
  PaymentRequestStatusTransitionInput,
  UpdatePaymentRequestInput,
} from "@grantpipe/shared";
import {
  createPaymentRequestSchema,
  STATUS_TRANSITIONS,
  updatePaymentRequestSchema,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, conflict, internalError, notFound } from "../../lib/app-error";
import {
  paymentRequestEntityScope,
  type ActivePaymentEntityScope,
  type PaymentEntityScope,
} from "./entity-scope";

// ---------------------------------------------------------------------------
// listPaymentRequests
// ---------------------------------------------------------------------------

export async function listPaymentRequests(
  db: Database,
  params: PaymentEntityScope & PaymentRequestListParams,
) {
  const { orgId, grantId, status, type, page, pageSize } = params;

  const conditions = [
    eq(grantPaymentRequests.orgId, orgId),
    isNull(grantPaymentRequests.deletedAt),
    paymentRequestEntityScope(grantPaymentRequests.grantId, params),
  ];

  if (grantId) conditions.push(eq(grantPaymentRequests.grantId, grantId));
  if (status) conditions.push(eq(grantPaymentRequests.status, status));
  if (type) conditions.push(eq(grantPaymentRequests.type, type));

  const where = and(...conditions);

  const data = await db
    .select({
      id: grantPaymentRequests.id,
      orgId: grantPaymentRequests.orgId,
      grantId: grantPaymentRequests.grantId,
      grantName: grants.name,
      requestNumber: grantPaymentRequests.requestNumber,
      type: grantPaymentRequests.type,
      status: grantPaymentRequests.status,
      periodStart: grantPaymentRequests.periodStart,
      periodEnd: grantPaymentRequests.periodEnd,
      submittedAt: grantPaymentRequests.submittedAt,
      approvedAt: grantPaymentRequests.approvedAt,
      rejectedAt: grantPaymentRequests.rejectedAt,
      closedAt: grantPaymentRequests.closedAt,
      requestedAmountCents: grantPaymentRequests.requestedAmountCents,
      approvedAmountCents: grantPaymentRequests.approvedAmountCents,
      funderReference: grantPaymentRequests.funderReference,
      notes: grantPaymentRequests.notes,
      autoPostJournalEntry: grantPaymentRequests.autoPostJournalEntry,
      createdBy: grantPaymentRequests.createdBy,
      createdAt: grantPaymentRequests.createdAt,
      updatedAt: grantPaymentRequests.updatedAt,
    })
    .from(grantPaymentRequests)
    .leftJoin(grants, and(eq(grantPaymentRequests.grantId, grants.id), eq(grants.orgId, orgId)))
    .where(where)
    .orderBy(desc(grantPaymentRequests.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db
    .select({ count: drizzleCount() })
    .from(grantPaymentRequests)
    .where(where);

  return {
    data,
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// getOutstandingSummary
// ---------------------------------------------------------------------------

export async function getOutstandingSummary(db: Database, params: PaymentEntityScope) {
  const { orgId } = params;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [summaryRow] = await db
    .select({
      totalOutstandingCents: sql<number>`
        COALESCE(SUM(
          CASE WHEN ${grantPaymentRequests.status} IN ('approved','partially_approved')
          THEN GREATEST(0, ${grantPaymentRequests.approvedAmountCents} - COALESCE((
            SELECT SUM(p.amount_cents)
            FROM grant_payments p
            WHERE p.request_id = ${grantPaymentRequests.id}
              AND p.org_id = ${orgId}
              AND p.deleted_at IS NULL
          ), 0))
          ELSE 0 END
        ), 0)`,
      submittedCount: sql<number>`
        COUNT(*) FILTER (WHERE ${grantPaymentRequests.status} = 'submitted')`,
      approvedCount: sql<number>`
        COUNT(*) FILTER (WHERE ${grantPaymentRequests.status} IN ('approved','partially_approved'))`,
      overdueCount: sql<number>`
        COUNT(*) FILTER (WHERE ${grantPaymentRequests.status} = 'submitted'
          AND ${grantPaymentRequests.submittedAt} < ${thirtyDaysAgo.toISOString()})`,
    })
    .from(grantPaymentRequests)
    .where(
      and(
        eq(grantPaymentRequests.orgId, orgId),
        isNull(grantPaymentRequests.deletedAt),
        paymentRequestEntityScope(grantPaymentRequests.grantId, params),
      ),
    );

  return {
    totalOutstandingCents: Number(summaryRow?.totalOutstandingCents ?? 0),
    submittedCount: Number(summaryRow?.submittedCount ?? 0),
    approvedCount: Number(summaryRow?.approvedCount ?? 0),
    overdueCount: Number(summaryRow?.overdueCount ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getPaymentRequest
// ---------------------------------------------------------------------------

export async function getPaymentRequest(
  db: Database,
  params: PaymentEntityScope & { requestId: string },
) {
  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, params.requestId),
      eq(grantPaymentRequests.orgId, params.orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
    with: {
      lines: {
        where: isNull(grantPaymentRequestLines.deletedAt),
      },
      adjustments: {
        where: isNull(grantPaymentRequestAdjustments.deletedAt),
      },
      payments: {
        where: isNull(grantPayments.deletedAt),
      },
    },
  });

  if (!request) throw notFound("Payment request not found");

  const lines = request.lines ?? [];
  const payments = request.payments ?? [];

  // requestedAmountCents is recomputed from live lines (authoritative).
  // The cached DB column exists for list-query performance and is kept
  // in sync by recalcRequestAmounts after every line mutation.
  const requestedAmountCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const paidAmountCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const approvedAmountCents = request.approvedAmountCents;
  const outstandingCents = Math.max(0, approvedAmountCents - paidAmountCents);

  return {
    ...request,
    requestedAmountCents,
    approvedAmountCents,
    paidAmountCents,
    outstandingCents,
  };
}

// ---------------------------------------------------------------------------
// createPaymentRequest
// ---------------------------------------------------------------------------

export async function createPaymentRequest(
  db: Database,
  params: PaymentEntityScope & { actorId: string } & CreatePaymentRequestInput,
) {
  const data = createPaymentRequestSchema.parse(params);
  const {
    orgId,
    actorId,
    grantId,
    type,
    periodStart,
    periodEnd,
    funderReference,
    notes,
    autoPostJournalEntry,
  } = { ...params, ...data };

  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      eq(grants.entityId, params.entityId ?? ""),
      isNull(grants.deletedAt),
    ),
  });
  if (!grant) throw notFound("Grant not found");

  return db.transaction(async (tx) => {
    // requestNumber generation with retry for concurrent creates
    const MAX_RETRIES = 5;
    let requestNumber = 1;
    let created: typeof grantPaymentRequests.$inferSelect | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Intentionally includes soft-deleted requests — requestNumber must be
      // monotonically increasing to prevent audit confusion over gaps.
      const [numberRow] = await tx
        .select({
          nextNumber: sql<number>`COALESCE(MAX(${grantPaymentRequests.requestNumber}), 0) + 1`,
        })
        .from(grantPaymentRequests)
        .where(eq(grantPaymentRequests.orgId, orgId));

      requestNumber = numberRow?.nextNumber ?? 1;

      try {
        const [result] = await tx
          .insert(grantPaymentRequests)
          .values({
            orgId,
            grantId,
            requestNumber,
            type,
            status: "draft",
            periodStart: periodStart ? new Date(periodStart) : null,
            periodEnd: periodEnd ? new Date(periodEnd) : null,
            funderReference: funderReference ?? null,
            notes: notes ?? null,
            autoPostJournalEntry: autoPostJournalEntry ?? false,
            createdBy: actorId,
            requestedAmountCents: 0,
            approvedAmountCents: 0,
          })
          .returning();
        created = result;
        break;
      } catch (err) {
        // Retry on unique constraint violation for (orgId, requestNumber)
        const isUniqueViolation =
          err instanceof Error &&
          (err.message.includes("unique") || err.message.includes("duplicate"));
        if (!isUniqueViolation || attempt === MAX_RETRIES - 1) throw err;
      }
    }

    if (!created) throw internalError("Failed to create payment request");

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "created",
      entityType: "payment_request",
      entityId: created.id,
      entityLabel: `Request #${requestNumber}`,
      changes: { grantId, type, requestNumber },
    });

    return created;
  });
}

// ---------------------------------------------------------------------------
// updatePaymentRequest
// ---------------------------------------------------------------------------

export async function updatePaymentRequest(
  db: Database,
  params: PaymentEntityScope & {
    actorId: string;
    requestId: string;
    data: UpdatePaymentRequestInput;
  },
) {
  const data = updatePaymentRequestSchema.parse(params.data);
  const existing = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, params.requestId),
      eq(grantPaymentRequests.orgId, params.orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!existing) throw notFound("Payment request not found");
  if (existing.status !== "draft") {
    throw badRequest("Payment request can only be updated when in draft status");
  }

  const payload: Partial<typeof grantPaymentRequests.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.type !== undefined) payload.type = data.type;
  if (data.periodStart !== undefined) {
    payload.periodStart = data.periodStart === null ? null : new Date(data.periodStart);
  }
  if (data.periodEnd !== undefined) {
    payload.periodEnd = data.periodEnd === null ? null : new Date(data.periodEnd);
  }
  if (data.funderReference !== undefined) payload.funderReference = data.funderReference;
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.autoPostJournalEntry !== undefined)
    payload.autoPostJournalEntry = data.autoPostJournalEntry;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(grantPaymentRequests)
      .set(payload)
      .where(
        and(
          eq(grantPaymentRequests.id, params.requestId),
          eq(grantPaymentRequests.orgId, params.orgId),
          isNull(grantPaymentRequests.deletedAt),
          paymentRequestEntityScope(grantPaymentRequests.grantId, params),
        ),
      )
      .returning();

    if (!updated) throw notFound("Payment request not found");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "updated",
      entityType: "payment_request",
      entityId: updated.id,
      entityLabel: `Request #${updated.requestNumber}`,
      changes: data,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// deletePaymentRequest
// ---------------------------------------------------------------------------

export async function deletePaymentRequest(
  db: Database,
  params: PaymentEntityScope & { actorId: string; requestId: string },
) {
  const existing = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, params.requestId),
      eq(grantPaymentRequests.orgId, params.orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!existing) throw notFound("Payment request not found");
  if (existing.status !== "draft" && existing.status !== "rejected") {
    throw badRequest("Payment request can only be deleted when in draft or rejected status");
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    const [deleted] = await tx
      .update(grantPaymentRequests)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(grantPaymentRequests.id, params.requestId),
          eq(grantPaymentRequests.orgId, params.orgId),
          isNull(grantPaymentRequests.deletedAt),
          paymentRequestEntityScope(grantPaymentRequests.grantId, params),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Payment request not found");

    await tx
      .update(grantPaymentRequestLines)
      .set({ deletedAt: now, dedupReleasedAt: now })
      .where(
        and(
          eq(grantPaymentRequestLines.orgId, params.orgId),
          eq(grantPaymentRequestLines.requestId, params.requestId),
          isNull(grantPaymentRequestLines.deletedAt),
        ),
      );

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "payment_request",
      entityId: params.requestId,
      entityLabel: `Request #${existing.requestNumber}`,
      changes: null,
    });
  });
}

// ---------------------------------------------------------------------------
// transitionPaymentRequest
// ---------------------------------------------------------------------------

export async function transitionPaymentRequest(
  db: Database | TransactionDatabase,
  params: ActivePaymentEntityScope & {
    actorId: string;
    requestId: string;
    transition: PaymentRequestStatusTransitionInput;
  },
) {
  const existing = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, params.requestId),
      eq(grantPaymentRequests.orgId, params.orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!existing) throw notFound("Payment request not found");

  const { fromStatus, toStatus, approvedAmountCents } = params.transition;

  if (existing.status !== fromStatus) {
    throw conflict(
      `Request is in status '${existing.status}', but fromStatus '${fromStatus}' was specified`,
    );
  }

  const allowedTargets = STATUS_TRANSITIONS[fromStatus] ?? [];
  if (!allowedTargets.includes(toStatus)) {
    throw badRequest(`Cannot transition from '${fromStatus}' to '${toStatus}'`);
  }

  const now = new Date();
  const patch: Partial<typeof grantPaymentRequests.$inferInsert> = {
    status: toStatus,
    updatedAt: now,
  };

  if (toStatus === "submitted") patch.submittedAt = now;
  if (toStatus === "approved" || toStatus === "partially_approved") {
    patch.approvedAt = now;
    // An approved request with 0 approved cents is invisible to outstanding
    // totals and instantly flips to `paid` on first payment. Require a
    // positive integer; default to the request's existing requestedAmountCents
    // when caller omits it.
    const resolvedApprovedAmountCents = approvedAmountCents ?? existing.requestedAmountCents;
    if (!Number.isInteger(resolvedApprovedAmountCents) || resolvedApprovedAmountCents <= 0) {
      throw badRequest(
        `approvedAmountCents must be a positive integer when transitioning to '${toStatus}'`,
      );
    }
    if (resolvedApprovedAmountCents > existing.requestedAmountCents) {
      throw badRequest("approvedAmountCents cannot exceed the requested amount");
    }
    patch.approvedAmountCents = resolvedApprovedAmountCents;
  }
  if (toStatus === "rejected") patch.rejectedAt = now;
  if (toStatus === "draft") patch.rejectedAt = null;
  if (toStatus === "closed") patch.closedAt = now;

  const runUpdate = async (conn: Database | TransactionDatabase) => {
    if (toStatus === "draft") {
      const [conflictingClaim] = await conn
        .select({ id: grantPaymentRequestLines.id })
        .from(grantPaymentRequestLines)
        .where(
          and(
            eq(grantPaymentRequestLines.requestId, params.requestId),
            eq(grantPaymentRequestLines.orgId, params.orgId),
            isNull(grantPaymentRequestLines.deletedAt),
            sql`${grantPaymentRequestLines.expenseId} IS NOT NULL`,
            sql`EXISTS (
              SELECT 1
              FROM ${grantPaymentRequestLines} other_line
              INNER JOIN ${grantPaymentRequests} other_request
                ON other_request.id = other_line.request_id
              WHERE other_line.expense_id = ${grantPaymentRequestLines.expenseId}
                AND other_line.org_id = ${params.orgId}
                AND other_line.deleted_at IS NULL
                AND other_line.dedup_released_at IS NULL
                AND other_request.org_id = ${params.orgId}
                AND other_request.deleted_at IS NULL
                AND other_request.status NOT IN ('rejected')
                AND other_request.id != ${params.requestId}
            )`,
          ),
        );
      if (conflictingClaim) {
        throw conflict(
          "Payment request cannot return to draft because another active request has claimed one of its expenses",
        );
      }
    }

    // Atomic claim: gate the write on the expected fromStatus so concurrent
    // transitions cannot both pass the stale findFirst check above and both
    // apply (double-approval / double-disbursement). Only one racing UPDATE
    // matches status=fromStatus; the loser gets an empty result.
    const [updated] = await conn
      .update(grantPaymentRequests)
      .set(patch)
      .where(
        and(
          eq(grantPaymentRequests.id, params.requestId),
          eq(grantPaymentRequests.orgId, params.orgId),
          eq(grantPaymentRequests.status, fromStatus),
          isNull(grantPaymentRequests.deletedAt),
          paymentRequestEntityScope(grantPaymentRequests.grantId, params),
        ),
      )
      .returning();

    // The row existed at read time (findFirst succeeded above); an empty
    // result means the status changed underneath us — a concurrent transition
    // won the race, so this caller is the TOCTOU loser (409, not 404).
    if (!updated) {
      throw conflict(`Request status changed concurrently; expected status '${fromStatus}'`);
    }

    if (toStatus === "rejected" || toStatus === "draft") {
      await conn
        .update(grantPaymentRequestLines)
        .set({ dedupReleasedAt: toStatus === "rejected" ? now : null })
        .where(
          and(
            eq(grantPaymentRequestLines.requestId, params.requestId),
            eq(grantPaymentRequestLines.orgId, params.orgId),
            isNull(grantPaymentRequestLines.deletedAt),
          ),
        );
    }

    await recordActivityLog(conn, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "transitioned",
      entityType: "payment_request",
      entityId: params.requestId,
      entityLabel: `Request #${existing.requestNumber}`,
      changes: { fromStatus, toStatus, approvedAmountCents },
    });

    return updated;
  };

  // If called with a plain Database (not inside a tx), wrap in one.
  // If called with a TransactionDatabase (from payment.service), run directly.
  if ("transaction" in db) {
    return (db as Database).transaction((tx) => runUpdate(tx));
  }
  return runUpdate(db);
}

// ---------------------------------------------------------------------------
// recalcRequestAmounts
// ---------------------------------------------------------------------------

export async function recalcRequestAmounts(
  db: Database | TransactionDatabase,
  params: PaymentEntityScope & { requestId: string },
) {
  const [sumRow] = await db
    .select({
      totalCents: sql<number>`COALESCE(SUM(${grantPaymentRequestLines.amountCents}), 0)`,
    })
    .from(grantPaymentRequestLines)
    .where(
      and(
        eq(grantPaymentRequestLines.requestId, params.requestId),
        eq(grantPaymentRequestLines.orgId, params.orgId),
        isNull(grantPaymentRequestLines.deletedAt),
      ),
    );

  const requestedAmountCents = Number(sumRow?.totalCents ?? 0);

  await db
    .update(grantPaymentRequests)
    .set({ requestedAmountCents, updatedAt: new Date() })
    .where(
      and(
        eq(grantPaymentRequests.id, params.requestId),
        eq(grantPaymentRequests.orgId, params.orgId),
        isNull(grantPaymentRequests.deletedAt),
        paymentRequestEntityScope(grantPaymentRequests.grantId, params),
      ),
    );
}
