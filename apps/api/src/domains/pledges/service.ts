import { and, eq, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import {
  contacts,
  funds,
  grants,
  organizations,
  pledges,
  pledgeInstallments,
  pledgePayments,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import {
  createPledgeSchema,
  recordPledgePaymentSchema,
  setPledgeAllowanceSchema,
  writeOffPledgeSchema,
  isPledgeConditional,
  presentValuePledge,
  accretionThrough,
  buildAmortizationSchedule,
  classifyInstallmentAging,
  type CreatePledgeInput,
  type RecordPledgePaymentInput,
  type SetPledgeAllowanceInput,
  type WriteOffPledgeInput,
  type PledgeStatus,
  type InstallmentAgingBucket,
} from "@grantpipe/shared";
import {
  postPledgeRecognition,
  postPledgeAccretion,
  postPledgePayment,
  postPledgeWriteOff,
  postPledgeAllowance,
} from "../accounting/postingEngine";
import { recordActivityLog } from "../../lib/activity-log";
import { notFound, badRequest } from "../../lib/app-error";
import { donorContactEntityScope } from "../donors/ownership";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PledgeRow = typeof pledges.$inferSelect;
type InstallmentRow = typeof pledgeInstallments.$inferSelect;
type PaymentRow = typeof pledgePayments.$inferSelect;

type AgingBucketCounts = Record<InstallmentAgingBucket, number>;

type PledgeWithComputedFields = PledgeRow & {
  outstandingCents: number;
  agingBuckets: AgingBucketCounts;
};

type PledgeListResult = {
  pledges: PledgeWithComputedFields[];
  totals: {
    totalFaceCents: number;
    totalPVCents: number;
    totalOutstandingCents: number;
    totalWrittenOffCents: number;
    totalAllowanceCents: number;
  };
};

type PledgeDetailResult = {
  pledge: PledgeRow;
  installments: InstallmentRow[];
  payments: PaymentRow[];
  amortizationSchedule: ReturnType<typeof buildAmortizationSchedule>;
  carryingValueCents: number;
};

type PledgeOwnershipColumns = {
  fundId: SQLWrapper;
  grantId: SQLWrapper;
};

function pledgeRecordEntityScope(
  orgId: string,
  entityId: string,
  columns: PledgeOwnershipColumns = pledges,
) {
  const fundAlias = sql.identifier("pledge_scope_fund");
  const grantAlias = sql.identifier("pledge_scope_grant");
  const organizationAlias = sql.identifier("pledge_scope_org");

  return and(
    or(
      isNull(columns.fundId),
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("funds")} ${fundAlias}
        WHERE ${fundAlias}.${sql.identifier("id")} = ${columns.fundId}
          AND ${fundAlias}.${sql.identifier("org_id")} = ${orgId}
          AND ${fundAlias}.${sql.identifier("entity_id")} = ${entityId}
          AND ${fundAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
    or(
      isNull(columns.grantId),
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("grants")} ${grantAlias}
        WHERE ${grantAlias}.${sql.identifier("id")} = ${columns.grantId}
          AND ${grantAlias}.${sql.identifier("org_id")} = ${orgId}
          AND ${grantAlias}.${sql.identifier("entity_id")} = ${entityId}
          AND ${grantAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
    or(
      sql`${columns.fundId} IS NOT NULL`,
      sql`${columns.grantId} IS NOT NULL`,
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("organizations")} ${organizationAlias}
        WHERE ${organizationAlias}.${sql.identifier("id")} = ${orgId}
          AND ${organizationAlias}.${sql.identifier("default_entity_id")} = ${entityId}
          AND ${organizationAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
  );
}

function pledgeContactEntityScope(contactId: SQLWrapper, orgId: string, entityId: string) {
  const contactAlias = sql.identifier("pledge_contact");
  const scopedContactId = sql`${contactAlias}.${sql.identifier("id")}`;

  return sql`EXISTS (
    SELECT 1 FROM ${sql.identifier("contacts")} ${contactAlias}
    WHERE ${contactAlias}.${sql.identifier("id")} = ${contactId}
      AND ${contactAlias}.${sql.identifier("org_id")} = ${orgId}
      AND ${contactAlias}.${sql.identifier("deleted_at")} IS NULL
      AND ${donorContactEntityScope(orgId, entityId, scopedContactId)}
  )`;
}

async function assertPledgeReferences(
  tx: TransactionDatabase,
  params: { orgId: string; entityId: string; input: CreatePledgeInput },
) {
  const contact = await tx.query.contacts.findFirst({
    where: and(
      eq(contacts.id, params.input.contactId),
      eq(contacts.orgId, params.orgId),
      isNull(contacts.deletedAt),
      pledgeContactEntityScope(contacts.id, params.orgId, params.entityId),
    ),
    columns: { id: true },
  });
  if (!contact) throw notFound("Contact not found");

  if (params.input.fundId) {
    const fund = await tx.query.funds.findFirst({
      where: and(
        eq(funds.id, params.input.fundId),
        eq(funds.orgId, params.orgId),
        eq(funds.entityId, params.entityId),
        isNull(funds.deletedAt),
      ),
      columns: { id: true },
    });
    if (!fund) throw notFound("Fund not found");
  }

  if (params.input.grantId) {
    const grant = await tx.query.grants.findFirst({
      where: and(
        eq(grants.id, params.input.grantId),
        eq(grants.orgId, params.orgId),
        eq(grants.entityId, params.entityId),
        isNull(grants.deletedAt),
      ),
      columns: { id: true },
    });
    if (!grant) throw notFound("Grant not found");
  }

  if (!params.input.fundId && !params.input.grantId) {
    const organization = await tx.query.organizations.findFirst({
      where: and(
        eq(organizations.id, params.orgId),
        eq(organizations.defaultEntityId, params.entityId),
        isNull(organizations.deletedAt),
      ),
      columns: { id: true },
    });
    if (!organization) throw notFound("Pledge not found");
  }
}

// ---------------------------------------------------------------------------
// createPledge
// ---------------------------------------------------------------------------

export async function createPledge(
  db: Database,
  params: { orgId: string; entityId: string; actorId: string; input: CreatePledgeInput },
): Promise<{ pledge: PledgeRow; installments: InstallmentRow[] }> {
  const input = createPledgeSchema.parse(params.input);

  const isConditional = isPledgeConditional(input.hasBarrier, input.hasRightOfReturn);
  const { pvCents, discountCents, faceCents } = presentValuePledge(
    input.installments,
    input.discountRateBasisPoints,
    input.pledgeDate,
  );

  const status: PledgeStatus = isConditional ? "conditional" : "active";

  return db.transaction(async (tx: TransactionDatabase) => {
    await assertPledgeReferences(tx, params);
    const [pledge] = await tx
      .insert(pledges)
      .values({
        orgId: params.orgId,
        contactId: input.contactId,
        fundId: input.fundId ?? null,
        grantId: input.grantId ?? null,
        status,
        isConditional,
        hasBarrier: input.hasBarrier,
        hasRightOfReturn: input.hasRightOfReturn,
        conditionNote: input.conditionNote ?? null,
        faceAmountCents: faceCents,
        pledgeDate: input.pledgeDate,
        discountRateBasisPoints: input.discountRateBasisPoints,
        presentValueCents: pvCents,
        discountCents,
        netAssetClass: input.netAssetClass,
        notes: input.notes ?? null,
      })
      .returning();

    if (!pledge) throw new Error("Failed to insert pledge");

    const installmentRows = await tx
      .insert(pledgeInstallments)
      .values(
        input.installments.map((inst) => ({
          orgId: params.orgId,
          pledgeId: pledge.id,
          dueDate: inst.dueDate,
          amountCents: inst.amountCents,
          status: "scheduled" as const,
          paidCents: 0,
        })),
      )
      .returning();

    if (!isConditional) {
      await postPledgeRecognition(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        pledgeId: pledge.id,
        action: "create",
      });
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "pledge",
      entityId: pledge.id,
      changes: { after: { ...pledge, installments: installmentRows } },
    });

    return { pledge, installments: installmentRows };
  });
}

// ---------------------------------------------------------------------------
// listPledges
// ---------------------------------------------------------------------------

export async function listPledges(
  db: Database,
  params: { orgId: string; entityId: string; status?: PledgeStatus; limit?: number },
): Promise<PledgeListResult> {
  const limit = params.limit ?? 25;
  const now = new Date();

  const rows = await db.query.pledges.findMany({
    where: and(
      eq(pledges.orgId, params.orgId),
      pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
      pledgeRecordEntityScope(params.orgId, params.entityId),
      isNull(pledges.deletedAt),
      params.status ? eq(pledges.status, params.status) : undefined,
    ),
    with: {
      installments: {
        where: isNull(pledgeInstallments.deletedAt),
      },
    },
    orderBy: /* v8 ignore next */ (p, { desc }) => [desc(p.pledgeDate)],
    limit,
  });

  const totals = {
    totalFaceCents: 0,
    totalPVCents: 0,
    totalOutstandingCents: 0,
    totalWrittenOffCents: 0,
    totalAllowanceCents: 0,
  };

  type PledgeWithInstallments = PledgeRow & { installments: InstallmentRow[] };

  const pledgeList: PledgeWithComputedFields[] = (rows as PledgeWithInstallments[]).map((row) => {
    const paidCents = row.installments.reduce((sum, i) => sum + i.paidCents, 0);
    const outstandingCents = Math.max(
      0,
      row.faceAmountCents -
        paidCents -
        (row.status === "written_off" ? row.faceAmountCents - paidCents : 0),
    );

    const agingBuckets: AgingBucketCounts = {
      current: 0,
      "1_30": 0,
      "31_60": 0,
      "61_90": 0,
      "90_plus": 0,
    };

    for (const inst of row.installments) {
      const isOutstanding =
        inst.status !== "paid" &&
        inst.status !== "written_off" &&
        inst.paidCents < inst.amountCents;
      const bucket = classifyInstallmentAging(
        inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate),
        now,
        isOutstanding,
      );
      agingBuckets[bucket]++;
    }

    totals.totalFaceCents += row.faceAmountCents;
    totals.totalPVCents += row.presentValueCents;
    totals.totalOutstandingCents += outstandingCents;
    totals.totalAllowanceCents += row.allowanceCents;

    if (row.status === "written_off") {
      totals.totalWrittenOffCents += row.faceAmountCents - paidCents;
    }

    return { ...row, outstandingCents, agingBuckets };
  });

  return { pledges: pledgeList, totals };
}

// ---------------------------------------------------------------------------
// getPledge
// ---------------------------------------------------------------------------

export async function getPledge(
  db: Database,
  params: { orgId: string; entityId: string; pledgeId: string },
): Promise<PledgeDetailResult> {
  const row = await db.query.pledges.findFirst({
    where: and(
      eq(pledges.id, params.pledgeId),
      eq(pledges.orgId, params.orgId),
      pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
      pledgeRecordEntityScope(params.orgId, params.entityId),
      isNull(pledges.deletedAt),
    ),
    with: {
      installments: {
        where: isNull(pledgeInstallments.deletedAt),
        orderBy: /* v8 ignore next */ (i, { asc }) => [asc(i.dueDate)],
      },
      payments: {
        where: isNull(pledgePayments.deletedAt),
        orderBy: /* v8 ignore next */ (p, { asc }) => [asc(p.paymentDate)],
      },
    },
  });

  if (!row) throw notFound("Pledge not found");

  type PledgeWithRelations = PledgeRow & {
    installments: InstallmentRow[];
    payments: PaymentRow[];
  };

  const pledgeWithRelations = row as PledgeWithRelations;

  const pledgeDate =
    pledgeWithRelations.pledgeDate instanceof Date
      ? pledgeWithRelations.pledgeDate
      : new Date(pledgeWithRelations.pledgeDate);

  const periodEndDates = pledgeWithRelations.installments.map((i) =>
    i.dueDate instanceof Date ? i.dueDate : new Date(i.dueDate),
  );

  const amortizationSchedule = buildAmortizationSchedule(
    pledgeWithRelations.presentValueCents,
    pledgeWithRelations.discountRateBasisPoints,
    pledgeDate,
    periodEndDates,
    pledgeWithRelations.discountCents,
  );

  const now = new Date();
  const carryingValueCents =
    pledgeWithRelations.presentValueCents +
    accretionThrough(
      pledgeWithRelations.presentValueCents,
      pledgeWithRelations.discountRateBasisPoints,
      pledgeDate,
      now,
      pledgeWithRelations.discountCents,
    );

  return {
    pledge: pledgeWithRelations,
    installments: pledgeWithRelations.installments,
    payments: pledgeWithRelations.payments,
    amortizationSchedule,
    carryingValueCents,
  };
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

export async function recordPayment(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    actorId: string;
    pledgeId: string;
    input: RecordPledgePaymentInput;
  },
): Promise<{ payment: PaymentRow }> {
  const input = recordPledgePaymentSchema.parse(params.input);

  return db.transaction(async (tx: TransactionDatabase) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${params.orgId}:${params.pledgeId}`}))`,
    );
    // Load pledge
    const [pledge] = await tx
      .select()
      .from(pledges)
      .where(
        and(
          eq(pledges.id, params.pledgeId),
          eq(pledges.orgId, params.orgId),
          pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
          pledgeRecordEntityScope(params.orgId, params.entityId),
          isNull(pledges.deletedAt),
        ),
      )
      .limit(1);

    if (!pledge) throw notFound("Pledge not found");

    if (
      pledge.status === "conditional" ||
      pledge.status === "completed" ||
      pledge.status === "written_off" ||
      pledge.status === "cancelled" ||
      pledge.isConditional
    ) {
      throw badRequest("Payments can only be recorded for active pledges");
    }

    const pledgeDate =
      pledge.pledgeDate instanceof Date ? pledge.pledgeDate : new Date(pledge.pledgeDate);
    const paymentDate =
      /* v8 ignore next */
      input.paymentDate instanceof Date ? input.paymentDate : new Date(input.paymentDate);

    // Sum accretion already posted at earlier payments (non-deleted) so we only
    // post the INCREMENTAL accretion at this payment — never re-post the full
    // cumulative figure (that would over-debit 1150 and overstate revenue).
    const priorPayments = await tx
      .select()
      .from(pledgePayments)
      .where(
        and(
          eq(pledgePayments.pledgeId, pledge.id),
          eq(pledgePayments.orgId, params.orgId),
          isNull(pledgePayments.deletedAt),
        ),
      )
      .limit(10000);

    const priorAccreted = priorPayments.reduce((sum, p) => sum + p.accretionCents, 0);

    // Determine whether this payment completes the pledge. We look at the
    // existing installment rows plus the effect of this payment so the FINAL
    // payment can top the discount up to exactly discountCents (rounded
    // per-term PV can otherwise leave the contra a cent or two short).
    const allInstallments = await tx
      .select()
      .from(pledgeInstallments)
      .where(
        and(
          eq(pledgeInstallments.pledgeId, pledge.id),
          eq(pledgeInstallments.orgId, params.orgId),
          isNull(pledgeInstallments.deletedAt),
        ),
      )
      .limit(10000);

    const nextInstallments = allInstallments.map((installment) => ({
      id: installment.id,
      paidCents: installment.paidCents,
      status: installment.status,
      amountCents: installment.amountCents,
    }));
    const installmentUpdates: {
      id: string;
      paidCents: number;
      status: "paid" | "partial";
    }[] = [];

    if (input.installmentId) {
      const installment = allInstallments.find((row) => row.id === input.installmentId);
      if (!installment || installment.pledgeId !== pledge.id) {
        throw badRequest("Installment does not belong to pledge");
      }

      if (installment.status === "written_off") {
        throw badRequest("Payment cannot be recorded against a written-off installment");
      }

      const newPaid = installment.paidCents + input.amountCents;
      if (newPaid > installment.amountCents) {
        throw badRequest("Payment exceeds installment balance");
      }

      const newStatus = newPaid >= installment.amountCents ? "paid" : "partial";
      installmentUpdates.push({
        id: installment.id,
        paidCents: newPaid,
        status: newStatus,
      });

      const next = nextInstallments.find((row) => row.id === installment.id);
      if (next) {
        next.paidCents = newPaid;
        next.status = newStatus;
      }
    } else {
      let remainingPaymentCents = input.amountCents;
      const openInstallments = [...allInstallments]
        .filter(
          (installment) =>
            installment.status !== "paid" &&
            installment.status !== "written_off" &&
            installment.paidCents < installment.amountCents,
        )
        .sort((a, b) => {
          const aDate = a.dueDate instanceof Date ? a.dueDate : new Date(a.dueDate);
          const bDate = b.dueDate instanceof Date ? b.dueDate : new Date(b.dueDate);
          return aDate.getTime() - bDate.getTime();
        });

      if (openInstallments.length === 0 && remainingPaymentCents > 0) {
        throw badRequest("No open installment balance available for payment");
      }

      for (const installment of openInstallments) {
        if (remainingPaymentCents <= 0) break;

        const installmentBalance = installment.amountCents - installment.paidCents;
        const appliedCents = Math.min(installmentBalance, remainingPaymentCents);
        const newPaid = installment.paidCents + appliedCents;
        const newStatus = newPaid >= installment.amountCents ? "paid" : "partial";

        installmentUpdates.push({
          id: installment.id,
          paidCents: newPaid,
          status: newStatus,
        });

        const next = nextInstallments.find((row) => row.id === installment.id);
        if (next) {
          next.paidCents = newPaid;
          next.status = newStatus;
        }

        remainingPaymentCents -= appliedCents;
      }

      if (remainingPaymentCents > 0) {
        throw badRequest("Payment exceeds open pledge balance");
      }
    }

    const completesPledge =
      nextInstallments.length > 0 &&
      nextInstallments.every((i) => i.status === "paid" || i.status === "written_off");

    // Cumulative accretion that should be on the books through this date,
    // clamped to the total discount.
    const cumulativeAccretion = accretionThrough(
      pledge.presentValueCents,
      pledge.discountRateBasisPoints,
      pledgeDate,
      paymentDate,
      pledge.discountCents,
    );

    // Target cumulative accretion: on the final payment, force it to exactly
    // close the discount; otherwise use the effective-interest figure.
    const targetCumulative = completesPledge ? pledge.discountCents : cumulativeAccretion;

    // Incremental accretion to post now = target − already-posted, clamped so
    // it never drives cumulative posted accretion above the total discount.
    const headroom = pledge.discountCents - priorAccreted;
    const accretionCents = Math.min(
      Math.max(0, targetCumulative - priorAccreted),
      Math.max(0, headroom),
    );

    if (accretionCents > 0) {
      await postPledgeAccretion(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        pledgeId: pledge.id,
        accretionCents,
        asOfDate: paymentDate,
        action: "create",
      });
    }

    // Insert payment row first so postPledgePayment can find it. Persist the
    // INCREMENTAL accretion posted at this payment (not the cumulative figure).
    const [payment] = await tx
      .insert(pledgePayments)
      .values({
        orgId: params.orgId,
        pledgeId: pledge.id,
        installmentId: input.installmentId ?? null,
        amountCents: input.amountCents,
        paymentDate,
        accretionCents,
        notes: input.notes ?? null,
      })
      .returning();

    if (!payment) throw new Error("Failed to insert payment");

    await postPledgePayment(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      pledgeId: pledge.id,
      paymentId: payment.id,
      amountCents: input.amountCents,
      paymentDate,
      action: "create",
    });

    for (const update of installmentUpdates) {
      await tx
        .update(pledgeInstallments)
        .set({ paidCents: update.paidCents, status: update.status })
        .where(
          and(eq(pledgeInstallments.id, update.id), eq(pledgeInstallments.orgId, params.orgId)),
        )
        .returning();
    }

    // Check if all installments are paid → complete the pledge
    if (completesPledge) {
      await tx
        .update(pledges)
        .set({ status: "completed", updatedAt: new Date() })
        .where(and(eq(pledges.id, pledge.id), eq(pledges.orgId, params.orgId)))
        .returning();
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "pledge",
      entityId: pledge.id,
      changes: { after: { payment } },
    });

    return { payment };
  });
}

// ---------------------------------------------------------------------------
// setAllowance
// ---------------------------------------------------------------------------

export async function setAllowance(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    actorId: string;
    pledgeId: string;
    input: SetPledgeAllowanceInput;
  },
): Promise<{ pledge: PledgeRow }> {
  const input = setPledgeAllowanceSchema.parse(params.input);

  return db.transaction(async (tx: TransactionDatabase) => {
    const [pledge] = await tx
      .select()
      .from(pledges)
      .where(
        and(
          eq(pledges.id, params.pledgeId),
          eq(pledges.orgId, params.orgId),
          pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
          pledgeRecordEntityScope(params.orgId, params.entityId),
          isNull(pledges.deletedAt),
        ),
      )
      .limit(1);

    if (!pledge) throw notFound("Pledge not found");

    const deltaCents = input.allowanceCents - pledge.allowanceCents;

    await postPledgeAllowance(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      pledgeId: pledge.id,
      deltaCents,
      asOfDate: new Date(),
      action: "create",
    });

    const [updated] = await tx
      .update(pledges)
      .set({ allowanceCents: input.allowanceCents, updatedAt: new Date() })
      .where(and(eq(pledges.id, pledge.id), eq(pledges.orgId, params.orgId)))
      .returning();

    if (!updated) throw new Error("Failed to update pledge allowance");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "updated",
      entityType: "pledge",
      entityId: pledge.id,
      changes: {
        before: { allowanceCents: pledge.allowanceCents },
        after: { allowanceCents: input.allowanceCents },
      },
    });

    return { pledge: updated };
  });
}

// ---------------------------------------------------------------------------
// writeOff
// ---------------------------------------------------------------------------

export async function writeOff(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    actorId: string;
    pledgeId: string;
    input: WriteOffPledgeInput;
  },
): Promise<{ pledge: PledgeRow }> {
  const input = writeOffPledgeSchema.parse(params.input);

  return db.transaction(async (tx: TransactionDatabase) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${params.orgId}:${params.pledgeId}`}))`,
    );
    const [pledge] = await tx
      .select()
      .from(pledges)
      .where(
        and(
          eq(pledges.id, params.pledgeId),
          eq(pledges.orgId, params.orgId),
          pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
          pledgeRecordEntityScope(params.orgId, params.entityId),
          isNull(pledges.deletedAt),
        ),
      )
      .limit(1);

    if (!pledge) throw notFound("Pledge not found");

    // Outstanding = face - already paid. Also use the payment rows to recover
    // how much discount has actually been unwound (the sum of accretion posted
    // at each payment), so the contra closes correctly regardless of how many
    // accretion postings occurred.
    const paidTotal = await tx
      .select()
      .from(pledgePayments)
      .where(
        and(
          eq(pledgePayments.pledgeId, pledge.id),
          eq(pledgePayments.orgId, params.orgId),
          isNull(pledgePayments.deletedAt),
        ),
      )
      .limit(10000);

    const totalPaid = paidTotal.reduce((sum, p) => sum + p.amountCents, 0);
    const writeOffCents = Math.max(0, pledge.faceAmountCents - totalPaid);

    // Remaining discount = initial discount − accretion ALREADY posted. Use the
    // actual sum of posted accretion (priorAccreted), not an assumed single
    // accretionThrough() figure, so the residual contra closes to zero no
    // matter how many incremental accretion entries were posted.
    const priorAccreted = paidTotal.reduce((sum, p) => sum + p.accretionCents, 0);
    const remainingDiscountCents = Math.max(0, pledge.discountCents - priorAccreted);

    const installmentRows = await tx
      .select()
      .from(pledgeInstallments)
      .where(
        and(
          eq(pledgeInstallments.pledgeId, pledge.id),
          eq(pledgeInstallments.orgId, params.orgId),
          isNull(pledgeInstallments.deletedAt),
        ),
      )
      .limit(10000);

    await postPledgeWriteOff(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      pledgeId: pledge.id,
      writeOffCents,
      remainingDiscountCents,
      action: "create",
    });

    for (const installment of installmentRows) {
      if (
        installment.status === "paid" ||
        installment.status === "written_off" ||
        installment.paidCents >= installment.amountCents
      ) {
        continue;
      }

      await tx
        .update(pledgeInstallments)
        .set({ status: "written_off" })
        .where(
          and(
            eq(pledgeInstallments.id, installment.id),
            eq(pledgeInstallments.orgId, params.orgId),
          ),
        )
        .returning();
    }

    const [updated] = await tx
      .update(pledges)
      .set({ status: "written_off", updatedAt: new Date() })
      .where(and(eq(pledges.id, pledge.id), eq(pledges.orgId, params.orgId)))
      .returning();

    if (!updated) throw new Error("Failed to update pledge status");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "updated",
      entityType: "pledge",
      entityId: pledge.id,
      changes: {
        before: { status: pledge.status },
        after: { status: "written_off", reason: input.reason },
      },
    });

    return { pledge: updated };
  });
}

// ---------------------------------------------------------------------------
// promotePledge
// ---------------------------------------------------------------------------

export async function promotePledge(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    actorId: string;
    pledgeId: string;
    promotionDate: Date;
  },
): Promise<{ pledge: PledgeRow }> {
  return db.transaction(async (tx: TransactionDatabase) => {
    const [pledge] = await tx
      .select()
      .from(pledges)
      .where(
        and(
          eq(pledges.id, params.pledgeId),
          eq(pledges.orgId, params.orgId),
          pledgeContactEntityScope(pledges.contactId, params.orgId, params.entityId),
          pledgeRecordEntityScope(params.orgId, params.entityId),
          isNull(pledges.deletedAt),
        ),
      )
      .limit(1);

    if (!pledge) throw notFound("Pledge not found");

    if (pledge.status !== "conditional" || !pledge.isConditional) {
      throw badRequest("Only conditional pledges can be promoted");
    }

    // Recompute PV as of promotion date
    const installmentRows = await tx.query.pledgeInstallments.findMany({
      where: and(
        eq(pledgeInstallments.pledgeId, pledge.id),
        eq(pledgeInstallments.orgId, params.orgId),
        isNull(pledgeInstallments.deletedAt),
      ),
    });

    const { pvCents, discountCents, faceCents } = presentValuePledge(
      installmentRows.map((i) => ({
        amountCents: i.amountCents,
        dueDate: i.dueDate instanceof Date ? i.dueDate : new Date(i.dueDate),
      })),
      pledge.discountRateBasisPoints,
      params.promotionDate,
    );

    const [updated] = await tx
      .update(pledges)
      .set({
        status: "active",
        isConditional: false,
        pledgeDate: params.promotionDate,
        faceAmountCents: faceCents,
        presentValueCents: pvCents,
        discountCents,
        updatedAt: new Date(),
      })
      .where(and(eq(pledges.id, pledge.id), eq(pledges.orgId, params.orgId)))
      .returning();

    if (!updated) throw new Error("Failed to promote pledge");

    await postPledgeRecognition(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      pledgeId: pledge.id,
      action: "create",
    });

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "updated",
      entityType: "pledge",
      entityId: pledge.id,
      changes: {
        before: { status: "conditional" },
        after: { status: "active", promotionDate: params.promotionDate },
      },
    });

    return { pledge: updated };
  });
}
