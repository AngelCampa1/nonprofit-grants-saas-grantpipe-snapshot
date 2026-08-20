import { eq, and, isNull, desc, count as drizzleCount, getTableColumns } from "drizzle-orm";
import {
  donations,
  funds,
  grantFundAllocations,
  grants,
  restrictionTerms,
  restrictionAdditions,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type {
  AcceptedClassificationInput,
  CreateDonationInput,
  UpdateDonationInput,
} from "@grantpipe/shared";
import { createDonationSchema, updateDonationSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, internalError, notFound } from "../../lib/app-error";
import { assertContactInOrg } from "./donor-guards";
import { postDonation } from "../accounting/postingEngine";
import { resolveAndClassifyRestriction } from "./classification.service";

type NetAssetClass = "unrestricted" | "temporarily_restricted" | "permanently_restricted";

// Resolve the three-way net-asset class stored on the donation row. The
// human-entered binary `restriction` flag is authoritative for "is this gift
// restricted at all": an unrestricted gift stays unrestricted no matter what
// fund it links to. Only when the gift is marked restricted does the classifier
// resolve temporary vs permanent from the fund, grant, and designation, so the
// posted GL entry lands on the right revenue account the first time.
async function resolveNetAssetClass(
  tx: Database | TransactionDatabase,
  params: {
    orgId: string;
    restriction: string | null | undefined;
    fundId?: string | null;
    grantId?: string | null;
    designation?: string | null;
    date?: string;
  },
): Promise<NetAssetClass> {
  if (params.restriction !== "restricted") return "unrestricted";

  const resolved = await resolveAndClassifyRestriction(tx, {
    orgId: params.orgId,
    ...(params.fundId ? { fundId: params.fundId } : {}),
    ...(params.grantId ? { grantId: params.grantId } : {}),
    ...(params.designation ? { designation: params.designation } : {}),
    ...(params.date ? { date: params.date } : {}),
  });

  return resolved.netAssetClass === "permanently_restricted"
    ? "permanently_restricted"
    : "temporarily_restricted";
}

function donationLabel(amountCents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amountCents / 100,
  );
}

async function assertFundInOrg(db: Database | TransactionDatabase, orgId: string, fundId: string) {
  const fund = await db.query.funds.findFirst({
    where: and(eq(funds.id, fundId), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
  });

  if (!fund) throw notFound("Fund not found");
}

async function assertGrantInOrg(
  db: Database | TransactionDatabase,
  orgId: string,
  grantId: string,
) {
  const grant = await db.query.grants.findFirst({
    where: and(eq(grants.id, grantId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
  });

  if (!grant) throw notFound("Grant not found");
}

export async function assertFundAllocatedToGrant(
  db: Database | TransactionDatabase,
  params: { fundId?: string | null; grantId?: string | null },
) {
  if (!params.fundId || !params.grantId) return;

  const allocation = await db.query.grantFundAllocations.findFirst({
    where: and(
      eq(grantFundAllocations.fundId, params.fundId),
      eq(grantFundAllocations.grantId, params.grantId),
      isNull(grantFundAllocations.deletedAt),
    ),
  });

  if (!allocation) throw notFound("Fund is not allocated to this grant");
}

// ---------------------------------------------------------------------------
// createDonation
// ---------------------------------------------------------------------------

export async function createDonationInTransaction(
  tx: TransactionDb,
  params: { orgId: string; actorId?: string; contactId: string } & CreateDonationInput,
): Promise<typeof donations.$inferSelect> {
  const data = createDonationSchema.parse(params);
  const { orgId, actorId, contactId } = params;
  const { date, fundId, grantId, acceptedClassification, ...rest } = data;

  await assertContactInOrg(tx, orgId, contactId);
  if (fundId !== undefined) await assertFundInOrg(tx, orgId, fundId);
  if (grantId !== undefined) await assertGrantInOrg(tx, orgId, grantId);
  await assertFundAllocatedToGrant(tx, { fundId, grantId });

  const netAssetClass = await resolveNetAssetClass(tx, {
    orgId,
    restriction: data.restriction,
    fundId,
    grantId,
    designation: data.designation,
    date,
  });

  const [donation] = await tx
    .insert(donations)
    .values({
      orgId,
      contactId,
      date: new Date(date),
      ...rest,
      netAssetClass,
      ...(fundId !== undefined ? { fundId } : {}),
      ...(grantId !== undefined ? { grantId } : {}),
    })
    .returning();

  if (!donation) throw internalError("Failed to create donation");

  // Auto-create a restriction term + addition when the user accepts a
  // classifier suggestion. The accepted payload is NOT trusted for the
  // restriction shape: we re-resolve the classification server-side from the
  // real fund/grant/designation and only act when the server itself classifies
  // the gift as restricted. Only the human-entered title is taken from the
  // client. This prevents a buggy or hostile client from writing a
  // more-restrictive (or fabricated) term into the net-asset ledger.
  if (actorId && acceptedClassification) {
    const resolved = await resolveAndClassifyRestriction(tx, {
      orgId,
      ...(fundId ? { fundId } : {}),
      ...(grantId ? { grantId } : {}),
      ...(data.designation ? { designation: data.designation } : {}),
      date,
    });

    if (resolved.donationRestriction === "restricted") {
      await linkAcceptedClassification(tx, {
        orgId,
        actorId,
        donationId: donation.id,
        amountCents: donation.amountCents,
        currency: donation.currency,
        date,
        fundId,
        grantId,
        classification: {
          restrictionType: resolved.restrictionType,
          title: acceptedClassification.title,
          releaseRule: resolved.suggestedReleaseRule ?? null,
          startDate: resolved.suggestedStartDate ?? null,
          endDate: resolved.suggestedEndDate ?? null,
        },
      });
    }
  }

  if (actorId) {
    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "created",
      entityType: "donation",
      entityId: donation.id,
      entityLabel: donationLabel(donation.amountCents),
      changes: {
        contactId,
        date,
        ...rest,
        fundId: fundId ?? null,
        grantId: grantId ?? null,
      },
    });
    await postDonation(tx, { orgId, actorId, donationId: donation.id, action: "create" });
  }

  return donation;
}

export async function createDonation(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string } & CreateDonationInput,
): Promise<typeof donations.$inferSelect> {
  return db.transaction((tx) => createDonationInTransaction(tx, params));
}

// ---------------------------------------------------------------------------
// updateDonation
// ---------------------------------------------------------------------------

export async function updateDonation(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    contactId: string;
    donationId: string;
    data: UpdateDonationInput;
  },
): Promise<typeof donations.$inferSelect> {
  const data = updateDonationSchema.parse(params.data);
  const { date, fundId, grantId, ...rest } = data;
  const setData: Record<string, unknown> = { ...rest };
  if (date) setData.date = new Date(date);
  if (fundId !== undefined) {
    if (fundId !== null) {
      await assertFundInOrg(db, params.orgId, fundId);
    }
    setData.fundId = fundId;
  }
  if (grantId !== undefined) {
    if (grantId !== null) {
      await assertGrantInOrg(db, params.orgId, grantId);
    }
    setData.grantId = grantId;
  }

  const updated = await db.transaction(async (tx) => {
    let [updated] = await tx
      .update(donations)
      .set(setData)
      .where(
        and(
          eq(donations.id, params.donationId),
          eq(donations.orgId, params.orgId),
          eq(donations.contactId, params.contactId),
          isNull(donations.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw notFound("Donation not found");
    if (updated.goodsServicesValueCents > updated.amountCents) {
      throw badRequest("Goods and services value cannot exceed the donation amount");
    }
    await assertFundAllocatedToGrant(tx, {
      fundId: updated.fundId,
      grantId: updated.grantId,
    });

    // Recompute the net-asset class from the final row state so an edit to the
    // restriction flag, fund, grant, or designation re-routes the reposted GL
    // entry to the correct revenue account.
    const netAssetClass = await resolveNetAssetClass(tx, {
      orgId: params.orgId,
      restriction: updated.restriction,
      fundId: updated.fundId,
      grantId: updated.grantId,
      designation: updated.designation,
      date: updated.date instanceof Date ? updated.date.toISOString() : undefined,
    });
    if (netAssetClass !== updated.netAssetClass) {
      const [reclassed] = await tx
        .update(donations)
        .set({ netAssetClass })
        .where(and(eq(donations.id, updated.id), eq(donations.orgId, params.orgId)))
        .returning();
      if (reclassed) updated = reclassed;
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "donation",
        entityId: updated.id,
        entityLabel: donationLabel(updated.amountCents),
        changes: data,
      });
      await postDonation(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        donationId: params.donationId,
        action: "update",
      });
    }
    return updated;
  });

  return updated;
}

// ---------------------------------------------------------------------------
// deleteDonation
// ---------------------------------------------------------------------------

export async function deleteDonation(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string; donationId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(donations)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(donations.id, params.donationId),
          eq(donations.orgId, params.orgId),
          eq(donations.contactId, params.contactId),
          isNull(donations.deletedAt),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Donation not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "donation",
        entityId: params.donationId,
        entityLabel: donationLabel(deleted.amountCents),
        changes: { deletedAt: deleted.deletedAt?.toISOString?.() ?? null },
      });
      await postDonation(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        donationId: params.donationId,
        action: "delete",
      });
    }
  });
}

// ---------------------------------------------------------------------------
// listDonations
// ---------------------------------------------------------------------------

type DonationWithFundName = typeof donations.$inferSelect & { fundName: string | null };

export async function listDonations(
  db: Database,
  params: { orgId: string; contactId: string; page: number; pageSize: number },
): Promise<{
  data: DonationWithFundName[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, contactId, page, pageSize } = params;

  const where = and(
    eq(donations.orgId, orgId),
    eq(donations.contactId, contactId),
    isNull(donations.deletedAt),
  );

  const data = await db
    .select({
      ...getTableColumns(donations),
      fundName: funds.name,
    })
    .from(donations)
    .leftJoin(
      funds,
      and(eq(donations.fundId, funds.id), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
    )
    .where(where)
    .orderBy(desc(donations.date))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db.select({ count: drizzleCount() }).from(donations).where(where);

  return { data: data as DonationWithFundName[], total: countResult?.count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// linkAcceptedClassification (internal)
//
// Creates a restriction term linked to the donation (+ fund/grant when present)
// and an opening addition of the full donation amount.  Called only when the
// caller passes `acceptedClassification` with a restricted restrictionType.
// ---------------------------------------------------------------------------

type TransactionDb = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function linkAcceptedClassification(
  tx: TransactionDb,
  params: {
    orgId: string;
    actorId: string;
    donationId: string;
    amountCents: number;
    currency: string;
    date: string;
    fundId?: string | null;
    grantId?: string | null;
    classification: AcceptedClassificationInput;
  },
): Promise<void> {
  const {
    orgId,
    actorId,
    donationId,
    amountCents,
    currency,
    date,
    fundId,
    grantId,
    classification,
  } = params;

  // Dedup: a restricted fund/grant should have ONE canonical restriction term.
  // If an active term already exists for the linked fund (then grant), attach
  // the opening addition to it instead of fragmenting the balance ledger with a
  // parallel term per gift. Only create a new term when none exists.
  let term = fundId
    ? await tx.query.restrictionTerms.findFirst({
        where: and(
          eq(restrictionTerms.orgId, orgId),
          isNull(restrictionTerms.deletedAt),
          eq(restrictionTerms.fundId, fundId),
        ),
      })
    : undefined;

  if (!term && grantId) {
    term = await tx.query.restrictionTerms.findFirst({
      where: and(
        eq(restrictionTerms.orgId, orgId),
        isNull(restrictionTerms.deletedAt),
        eq(restrictionTerms.grantId, grantId),
      ),
    });
  }

  if (!term) {
    [term] = await tx
      .insert(restrictionTerms)
      .values({
        orgId,
        createdBy: actorId,
        restrictionType: classification.restrictionType,
        source: "internal",
        title: classification.title,
        releaseRule: classification.releaseRule ?? null,
        startDate: classification.startDate ? new Date(classification.startDate) : null,
        endDate: classification.endDate ? new Date(classification.endDate) : null,
        fundId: fundId ?? null,
        grantId: grantId ?? null,
        donationId,
        beginningBalanceCents: 0,
        currency,
      })
      .returning();
  }

  if (!term) throw internalError("Failed to create restriction term");

  await tx.insert(restrictionAdditions).values({
    orgId,
    restrictionTermId: term.id,
    createdBy: actorId,
    donationId,
    amountCents,
    date: new Date(date),
    description: `Opening addition from donation ${donationId}`,
  });
}
