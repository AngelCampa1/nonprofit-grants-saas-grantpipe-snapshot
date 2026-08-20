import { and, count, ilike, inArray, isNull, or, eq, desc, gt, sql } from "drizzle-orm";
import { externalReviewers, externalReviewSessions, type ExternalReviewer } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  type CreateReviewerInput,
  type UpdateReviewerInput,
  type ListReviewersInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { notFound } from "../../lib/app-error";
import { toJsonSafeCount } from "./list-utils";

export async function createReviewer(
  db: Database,
  orgId: string,
  actorId: string,
  input: CreateReviewerInput,
): Promise<ExternalReviewer> {
  return db.transaction(async (tx) => {
    const [reviewer] = await tx
      .insert(externalReviewers)
      .values({
        orgId,
        email: input.email,
        name: input.name,
        reviewerType: input.reviewerType,
        organizationName: input.organizationName ?? null,
        notes: input.notes ?? null,
        createdBy: actorId,
      })
      .returning();

    if (!reviewer) {
      throw new Error("Failed to create reviewer");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "create",
      entityType: "external_reviewer",
      entityId: reviewer.id,
      entityLabel: reviewer.name,
      changes: { after: reviewer },
    });

    return reviewer;
  });
}

export async function updateReviewer(
  db: Database,
  orgId: string,
  reviewerId: string,
  actorId: string,
  input: UpdateReviewerInput,
): Promise<ExternalReviewer> {
  const before = await db.query.externalReviewers.findFirst({
    where: and(
      eq(externalReviewers.id, reviewerId),
      eq(externalReviewers.orgId, orgId),
      isNull(externalReviewers.deletedAt),
    ),
  });

  if (!before) {
    throw notFound("Reviewer not found");
  }

  const emailChanged =
    input.email !== undefined &&
    input.email.trim().toLowerCase() !== before.email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const [reviewer] = await tx
      .update(externalReviewers)
      .set({
        ...(input.email !== undefined && { email: input.email }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.reviewerType !== undefined && { reviewerType: input.reviewerType }),
        ...(input.organizationName !== undefined && { organizationName: input.organizationName }),
        ...(input.notes !== undefined && { notes: input.notes }),
      })
      .where(
        and(
          eq(externalReviewers.id, reviewerId),
          eq(externalReviewers.orgId, orgId),
          isNull(externalReviewers.deletedAt),
          ...(emailChanged ? [eq(externalReviewers.email, before.email)] : []),
        ),
      )
      .returning();

    if (!reviewer) {
      throw notFound("Reviewer not found");
    }

    if (emailChanged) {
      const revokedAt = new Date();
      await tx
        .update(externalReviewSessions)
        .set({
          revokedAt,
          revokedBy: actorId,
          invitationDeliveryAttempt: sql`${externalReviewSessions.invitationDeliveryAttempt} + 1`,
          invitationDeliveryStatus: "suppressed",
          invitationDeliveryPayload: null,
          invitationDeliveryStartedAt: null,
          invitationDeliveryClaimedAt: null,
          invitationDeliverySentAt: null,
          invitationProviderId: null,
          invitationDeliveryError: null,
        })
        .where(
          and(
            eq(externalReviewSessions.orgId, orgId),
            eq(externalReviewSessions.reviewerId, reviewerId),
            isNull(externalReviewSessions.revokedAt),
            gt(externalReviewSessions.expiresAt, revokedAt),
          ),
        );
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "update",
      entityType: "external_reviewer",
      entityId: reviewer.id,
      entityLabel: reviewer.name,
      changes: { before, after: reviewer },
    });

    return reviewer;
  });
}

export async function softDeleteReviewer(
  db: Database,
  orgId: string,
  reviewerId: string,
  actorId: string,
): Promise<void> {
  const before = await db.query.externalReviewers.findFirst({
    where: and(
      eq(externalReviewers.id, reviewerId),
      eq(externalReviewers.orgId, orgId),
      isNull(externalReviewers.deletedAt),
    ),
  });

  if (!before) {
    throw notFound("Reviewer not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(externalReviewers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(externalReviewers.id, reviewerId),
          eq(externalReviewers.orgId, orgId),
          isNull(externalReviewers.deletedAt),
        ),
      );

    await tx
      .update(externalReviewSessions)
      .set({
        invitationDeliveryAttempt: sql`${externalReviewSessions.invitationDeliveryAttempt} + 1`,
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryPayload: null,
        invitationDeliveryError: null,
      })
      .where(
        and(
          eq(externalReviewSessions.orgId, orgId),
          eq(externalReviewSessions.reviewerId, reviewerId),
          inArray(externalReviewSessions.invitationDeliveryStatus, [
            "pending",
            "failed",
            "processing",
            "sending",
            "ambiguous",
          ]),
        ),
      );

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "delete",
      entityType: "external_reviewer",
      entityId: reviewerId,
      entityLabel: before.name,
      changes: { before },
    });
  });
}

export async function getReviewer(
  db: Database,
  orgId: string,
  reviewerId: string,
): Promise<ExternalReviewer | null> {
  const reviewer = await db.query.externalReviewers.findFirst({
    where: and(
      eq(externalReviewers.id, reviewerId),
      eq(externalReviewers.orgId, orgId),
      isNull(externalReviewers.deletedAt),
    ),
  });

  return reviewer ?? null;
}

export async function listReviewers(
  db: Database,
  orgId: string,
  params: ListReviewersInput,
): Promise<{ items: ExternalReviewer[]; total: number }> {
  const conditions = [eq(externalReviewers.orgId, orgId), isNull(externalReviewers.deletedAt)];

  if (params.reviewerType) {
    conditions.push(eq(externalReviewers.reviewerType, params.reviewerType));
  }

  if (params.search) {
    const term = `%${params.search}%`;
    conditions.push(
      or(
        ilike(externalReviewers.name, term),
        ilike(externalReviewers.email, term),
        ilike(externalReviewers.organizationName, term),
      )!,
    );
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ value: count() })
    .from(externalReviewers)
    .where(whereClause);

  const total = toJsonSafeCount(countResult?.value);

  const items = await db
    .select()
    .from(externalReviewers)
    .where(whereClause)
    .orderBy(desc(externalReviewers.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return { items, total };
}
