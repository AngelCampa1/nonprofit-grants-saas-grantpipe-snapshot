import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  bankTransactions,
  grantPaymentRequests,
  grantPayments,
  journalEntries,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type { PaymentRequestStatus, RecordPaymentInput } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, internalError, notFound } from "../../lib/app-error";
import { postGrantPayment, reverseGrantPayment } from "../accounting/postingEngine";
import { transitionPaymentRequest } from "./request.service";
import {
  paymentRequestEntityScope,
  type ActivePaymentEntityScope,
  type PaymentEntityScope,
} from "./entity-scope";

function resolveReopenedRequestStatus(request: {
  approvedAmountCents: number;
  requestedAmountCents: number;
}): Extract<PaymentRequestStatus, "approved" | "partially_approved"> {
  return request.approvedAmountCents < request.requestedAmountCents
    ? "partially_approved"
    : "approved";
}

async function reopenPaidRequestIfOutstanding(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId: string;
    request: typeof grantPaymentRequests.$inferSelect;
  },
) {
  if (params.request.status !== "paid") return;

  const [totalRow] = await tx
    .select({
      totalPaid: sql<number>`COALESCE(SUM(${grantPayments.amountCents}), 0)`,
    })
    .from(grantPayments)
    .where(
      and(
        eq(grantPayments.requestId, params.request.id),
        eq(grantPayments.orgId, params.orgId),
        isNull(grantPayments.deletedAt),
      ),
    );

  const totalPaid = Number(totalRow?.totalPaid ?? 0);
  if (totalPaid >= params.request.approvedAmountCents) return;

  const toStatus = resolveReopenedRequestStatus(params.request);
  await tx
    .update(grantPaymentRequests)
    .set({
      status: toStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(grantPaymentRequests.id, params.request.id),
        eq(grantPaymentRequests.orgId, params.orgId),
        isNull(grantPaymentRequests.deletedAt),
        paymentRequestEntityScope(grantPaymentRequests.grantId, params),
      ),
    );

  await recordActivityLog(tx, {
    orgId: params.orgId,
    activeEntityId: params.entityId,
    actorId: params.actorId,
    action: "transitioned",
    entityType: "payment_request",
    entityId: params.request.id,
    entityLabel: `Request #${params.request.requestNumber}`,
    changes: {
      fromStatus: "paid",
      toStatus,
      paidAmountCents: totalPaid,
      approvedAmountCents: params.request.approvedAmountCents,
    },
  });
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

export async function recordPayment(
  db: Database,
  env: { INTEGRATION_MODE?: string },
  params: ActivePaymentEntityScope & {
    actorId: string;
    requestId: string;
    data: RecordPaymentInput;
  },
) {
  const { orgId, actorId, requestId, data } = params;

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");
  if (request.status !== "approved" && request.status !== "partially_approved") {
    throw badRequest("Payments can only be recorded on approved or partially_approved requests");
  }

  if (data.journalEntryId) {
    const journalEntry = await db.query.journalEntries.findFirst({
      where: and(eq(journalEntries.id, data.journalEntryId), eq(journalEntries.orgId, orgId)),
    });

    if (!journalEntry) throw notFound("Journal entry not found");
  }

  if (data.bankTransactionId) {
    const bankTransaction = await db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, data.bankTransactionId),
        eq(bankTransactions.orgId, orgId),
      ),
    });

    if (!bankTransaction) throw notFound("Bank transaction not found");
  }

  return db.transaction(async (tx) => {
    let journalEntryId = data.journalEntryId ?? null;

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${orgId}:${requestId}`}))`);

    const [totalRow] = await tx
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${grantPayments.amountCents}), 0)`,
      })
      .from(grantPayments)
      .where(
        and(
          eq(grantPayments.requestId, requestId),
          eq(grantPayments.orgId, orgId),
          isNull(grantPayments.deletedAt),
        ),
      );

    const currentTotalPaid = Number(totalRow?.totalPaid ?? 0);
    const projectedTotalPaid = currentTotalPaid + data.amountCents;

    if (projectedTotalPaid > request.approvedAmountCents) {
      throw badRequest("Recorded payments cannot exceed the approved amount");
    }

    // Insert payment first (without JE id if we need to auto-post)
    const [payment] = await tx
      .insert(grantPayments)
      .values({
        orgId,
        requestId,
        grantId: request.grantId,
        receivedDate: new Date(data.receivedDate),
        amountCents: data.amountCents,
        referenceNumber: data.referenceNumber ?? null,
        method: data.method ?? null,
        journalEntryId,
        bankTransactionId: data.bankTransactionId ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    if (!payment) throw internalError("Failed to record payment");

    // Auto-post JE if requested and no manual JE provided
    if (request.autoPostJournalEntry && !data.journalEntryId) {
      const postedJeId = await postGrantPayment(tx as TransactionDatabase, {
        orgId,
        actorId,
        paymentId: payment.id,
        requestId,
        grantId: request.grantId,
        receivedDate: new Date(data.receivedDate),
        amountCents: data.amountCents,
      });

      if (postedJeId) {
        journalEntryId = postedJeId;
        await tx
          .update(grantPayments)
          .set({ journalEntryId: postedJeId })
          .where(eq(grantPayments.id, payment.id));
      }
    }

    // Check if total payments now cover approvedAmountCents → auto-advance to "paid"
    if (projectedTotalPaid >= request.approvedAmountCents) {
      await transitionPaymentRequest(tx, {
        orgId,
        entityId: params.entityId,
        actorId,
        requestId,
        transition: {
          fromStatus: request.status as "approved" | "partially_approved",
          toStatus: "paid",
        },
      });
    }

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "recorded",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: null,
      changes: {
        requestId,
        amountCents: data.amountCents,
        receivedDate: data.receivedDate,
        journalEntryId,
      },
    });

    return { ...payment, journalEntryId };
  });
}

// ---------------------------------------------------------------------------
// removePayment
// ---------------------------------------------------------------------------

export async function removePayment(
  db: Database,
  params: ActivePaymentEntityScope & {
    actorId: string;
    requestId: string;
    paymentId: string;
  },
) {
  const { orgId, actorId, requestId, paymentId } = params;

  const payment = await db.query.grantPayments.findFirst({
    where: and(
      eq(grantPayments.id, paymentId),
      eq(grantPayments.requestId, requestId),
      eq(grantPayments.orgId, orgId),
      isNull(grantPayments.deletedAt),
    ),
  });

  if (!payment) throw notFound("Payment not found");

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${orgId}:${requestId}`}))`);

    await reverseGrantPayment(tx as TransactionDatabase, {
      orgId,
      actorId,
      paymentId,
      reversalDate: new Date(),
    });

    const [deleted] = await tx
      .update(grantPayments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantPayments.id, paymentId),
          eq(grantPayments.orgId, orgId),
          isNull(grantPayments.deletedAt),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Payment not found");

    await reopenPaidRequestIfOutstanding(tx, {
      orgId,
      entityId: params.entityId,
      actorId,
      request,
    });

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "reversed",
      entityType: "payment",
      entityId: paymentId,
      entityLabel: null,
      changes: {
        requestId,
        amountCents: payment.amountCents,
        hadJournalEntry: payment.journalEntryId !== null,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// listPayments
// ---------------------------------------------------------------------------

export async function listPayments(
  db: Database,
  params: PaymentEntityScope & { requestId: string },
) {
  return db
    .select()
    .from(grantPayments)
    .where(
      and(
        eq(grantPayments.requestId, params.requestId),
        eq(grantPayments.orgId, params.orgId),
        isNull(grantPayments.deletedAt),
        sql`exists (
          select 1 from grant_payment_requests as payment_scope_request
          where payment_scope_request.id = ${grantPayments.requestId}
            and payment_scope_request.org_id = ${params.orgId}
            and payment_scope_request.deleted_at is null
            and ${paymentRequestEntityScope(sql`payment_scope_request.grant_id`, params)}
        )`,
      ),
    )
    .orderBy(desc(grantPayments.receivedDate));
}
