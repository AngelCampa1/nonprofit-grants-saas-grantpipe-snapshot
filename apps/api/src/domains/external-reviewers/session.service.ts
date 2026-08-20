import { and, eq, isNull, desc, gte, sql } from "drizzle-orm";
import {
  externalReviewers,
  externalReviewSessions,
  externalReviewScopes,
  type ExternalReviewSession,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import {
  PORTAL_SESSION_MAX_TTL_MS,
  type CreateSessionInput,
  type ExtendSessionInput,
  type ListSessionsInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { conflict, notFound } from "../../lib/app-error";
import { assertScopeTargetsBelongToOrg } from "./scope-targets";

async function assertReviewerInOrg(db: TransactionDatabase, orgId: string, reviewerId: string) {
  const reviewer = await db.query.externalReviewers.findFirst({
    where: and(
      eq(externalReviewers.id, reviewerId),
      eq(externalReviewers.orgId, orgId),
      isNull(externalReviewers.deletedAt),
    ),
    columns: { id: true },
  });

  if (!reviewer) {
    throw notFound("Reviewer not found");
  }
}

export async function createSession(
  db: TransactionDatabase,
  orgId: string,
  actorId: string,
  input: CreateSessionInput,
  _rawToken: string,
  tokenHash: string,
  sessionId: string | undefined,
  deliveryMode: "email" | "link_only",
  expiresAt: Date,
): Promise<ExternalReviewSession> {
  await assertReviewerInOrg(db, orgId, input.reviewerId);
  await assertScopeTargetsBelongToOrg(db, orgId, input.scopes);

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(externalReviewSessions)
      .values({
        id: sessionId ?? crypto.randomUUID(),
        orgId,
        reviewerId: input.reviewerId,
        tokenHash,
        purpose: input.purpose,
        expiresAt,
        invitationDeliveryStatus: deliveryMode === "email" ? "pending" : "not_requested",
        createdBy: actorId,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to create session");
    }

    if (input.scopes.length > 0) {
      await tx.insert(externalReviewScopes).values(
        input.scopes.map((scope) => ({
          sessionId: session.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          grantedBy: actorId,
        })),
      );
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "create",
      entityType: "external_review_session",
      entityId: session.id,
      entityLabel: session.purpose,
      changes: { after: session },
    });

    return session;
  });
}

export async function getSession(
  db: Database,
  orgId: string,
  sessionId: string,
): Promise<ExternalReviewSession | null> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: and(eq(externalReviewSessions.id, sessionId), eq(externalReviewSessions.orgId, orgId)),
  });

  return session ?? null;
}

export async function getSessionByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<ExternalReviewSession | null> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: eq(externalReviewSessions.tokenHash, tokenHash),
  });

  return session ?? null;
}

export async function listSessions(
  db: Database,
  orgId: string,
  params: ListSessionsInput,
): Promise<{ items: ExternalReviewSession[]; total: number }> {
  const now = new Date();
  const conditions = [eq(externalReviewSessions.orgId, orgId)];

  if (params.reviewerId) {
    conditions.push(eq(externalReviewSessions.reviewerId, params.reviewerId));
  }

  if (!params.includeRevoked) {
    conditions.push(isNull(externalReviewSessions.revokedAt));
  }

  if (!params.includeExpired) {
    conditions.push(gte(externalReviewSessions.expiresAt, now));
  }

  const allItems = await db
    .select()
    .from(externalReviewSessions)
    .where(and(...conditions))
    .orderBy(desc(externalReviewSessions.createdAt));

  const total = allItems.length;
  const items = allItems.slice((params.page - 1) * params.pageSize, params.page * params.pageSize);

  return { items, total };
}

export async function revokeSession(
  db: Database,
  orgId: string,
  sessionId: string,
  actorId: string,
): Promise<void> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: and(
      eq(externalReviewSessions.id, sessionId),
      eq(externalReviewSessions.orgId, orgId),
      isNull(externalReviewSessions.revokedAt),
    ),
  });

  if (!session) {
    throw notFound("Session not found");
  }

  await db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(externalReviewSessions)
      .set({
        revokedAt: new Date(),
        revokedBy: actorId,
        invitationDeliveryAttempt: sql`${externalReviewSessions.invitationDeliveryAttempt} + 1`,
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryPayload: null,
        invitationDeliveryClaimedAt: null,
        invitationDeliveryError: null,
      })
      .where(
        and(
          eq(externalReviewSessions.id, sessionId),
          eq(externalReviewSessions.orgId, orgId),
          isNull(externalReviewSessions.revokedAt),
        ),
      )
      .returning();

    if (!revoked) {
      throw notFound("Session not found");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "delete",
      entityType: "external_review_session",
      entityId: sessionId,
      entityLabel: session.purpose,
      changes: { before: session },
    });
  });
}

export async function extendSession(
  db: Database,
  orgId: string,
  sessionId: string,
  actorId: string,
  input: ExtendSessionInput,
  createTokenHash: (expiresAt: Date) => Promise<string>,
): Promise<ExternalReviewSession> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: and(
      eq(externalReviewSessions.id, sessionId),
      eq(externalReviewSessions.orgId, orgId),
      isNull(externalReviewSessions.revokedAt),
      gte(externalReviewSessions.expiresAt, new Date()),
    ),
  });

  if (!session) {
    throw notFound("Session not found");
  }

  const maxExpiresAt = new Date(Date.now() + PORTAL_SESSION_MAX_TTL_MS);
  const proposedExpiresAt = new Date(session.expiresAt.getTime() + input.extensionMs);
  const newExpiresAt = proposedExpiresAt > maxExpiresAt ? maxExpiresAt : proposedExpiresAt;
  const tokenHash = await createTokenHash(newExpiresAt);

  return db.transaction(async (tx) => {
    const writeStartedAt = new Date();
    const [updated] = await tx
      .update(externalReviewSessions)
      .set({
        expiresAt: newExpiresAt,
        tokenHash,
        invitationDeliveryAttempt: sql`${externalReviewSessions.invitationDeliveryAttempt} + 1`,
        invitationDeliveryKind: "extension",
        invitationDeliveryStatus:
          session.invitationDeliveryStatus === "not_requested" ? "not_requested" : "pending",
        invitationDeliveryPayload: null,
        invitationDeliveryStartedAt: null,
        invitationDeliveryClaimedAt: null,
        invitationDeliverySentAt: null,
        invitationProviderId: null,
        invitationDeliveryError: null,
      })
      .where(
        and(
          eq(externalReviewSessions.id, sessionId),
          eq(externalReviewSessions.orgId, orgId),
          isNull(externalReviewSessions.revokedAt),
          gte(externalReviewSessions.expiresAt, writeStartedAt),
          eq(externalReviewSessions.expiresAt, session.expiresAt),
          eq(externalReviewSessions.tokenHash, session.tokenHash),
          eq(externalReviewSessions.invitationDeliveryAttempt, session.invitationDeliveryAttempt),
        ),
      )
      .returning();

    if (!updated) {
      throw conflict("Session changed while it was being extended");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "update",
      entityType: "external_review_session",
      entityId: sessionId,
      entityLabel: session.purpose,
      changes: { before: session, after: updated },
    });

    return updated;
  });
}

export async function touchSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(externalReviewSessions)
    .set({ lastAccessedAt: new Date() })
    .where(eq(externalReviewSessions.id, sessionId));
}
