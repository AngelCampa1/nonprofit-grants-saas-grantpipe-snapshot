import type { Bindings } from "../../types";
import { captureBackgroundException } from "../../lib/sentry";
import {
  buildSessionExtendedEmailRequest,
  buildReviewerInviteEmailRequest,
  sendSessionExtendedEmail,
  sendReviewerInviteEmail,
  type ReviewerInviteEmailRequestPayload,
} from "./email";
import { createDbHandle, type Database } from "@grantpipe/db";
import { externalReviewers, externalReviewSessions, organizations, user } from "@grantpipe/db";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { buildAppUrl } from "@grantpipe/shared";
import { hashPortalTokenForStorage, signPortalToken } from "./tokens";
import { hmacSha256Hex } from "../../lib/hmac";
import { runSettledWithConcurrency } from "../../lib/bounded-concurrency";

export type InvitationDeliveryIntent = {
  sessionId: string;
  reviewerId: string;
  orgId: string;
  attempt: number;
  claimedAt: Date;
  deliveryKind: "invite" | "extension";
  reviewerEmail: string;
  reviewerName: string;
  inviterName: string;
  orgName: string;
  purpose: string;
  expiresAt: Date;
  portalUrl: string;
};

export type InvitationAuthorizationResult = "authorized" | "ineligible" | "contended";

type InvitationSnapshotFields = {
  reviewerEmail: string;
  reviewerName: string;
  inviterName: string;
  orgName: string;
  purpose: string;
  expiresAt: string;
  deliveryKind: "invite" | "extension";
};

type InvitationDeliveryPayload = InvitationSnapshotFields & {
  requestFingerprint: string;
};

export interface InvitationDeliveryStore {
  claim(sessionId: string): Promise<InvitationDeliveryIntent | null>;
  authorize(
    sessionId: string,
    attempt: number,
    claimedAt: Date,
    reviewerId: string,
    orgId: string,
  ): Promise<InvitationAuthorizationResult>;
  suppress(sessionId: string, attempt: number, claimedAt: Date): Promise<void>;
  markSent(sessionId: string, attempt: number, claimedAt: Date): Promise<void>;
  markUnavailable(
    sessionId: string,
    attempt: number,
    claimedAt: Date,
    error: string,
  ): Promise<void>;
  markRetryable(sessionId: string, attempt: number, claimedAt: Date, error: string): Promise<void>;
  markAmbiguous(sessionId: string, attempt: number, claimedAt: Date, error: string): Promise<void>;
  markQuarantined(
    sessionId: string,
    attempt: number,
    claimedAt: Date,
    error: string,
  ): Promise<void>;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error";
}

function isDefiniteProviderRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const match = /^Resend returned (\d{3}):/.exec(error.message);
  if (!match) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

async function recordDeliveryState(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    captureBackgroundException(error, "external-reviewers", {
      step: "invite_email_delivery_state",
    });
  }
}

async function suppressInvitation(
  db: Database,
  sessionId: string,
  attempt: number,
  claimedAt: Date,
): Promise<void> {
  await db
    .update(externalReviewSessions)
    .set({ invitationDeliveryStatus: "suppressed", invitationDeliveryError: null })
    .where(
      and(
        eq(externalReviewSessions.id, sessionId),
        eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
        eq(externalReviewSessions.invitationDeliveryStatus, "processing"),
        eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
      ),
    );
}

async function quarantineInvitation(
  db: Database,
  sessionId: string,
  attempt: number,
): Promise<void> {
  await db
    .update(externalReviewSessions)
    .set({
      invitationDeliveryStatus: "quarantined",
      invitationDeliveryError: "Invitation payload could not be reconstructed safely",
    })
    .where(
      and(
        eq(externalReviewSessions.id, sessionId),
        eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
        ne(externalReviewSessions.invitationDeliveryStatus, "sent"),
      ),
    );
}

function isInvitationDeliveryPayload(value: unknown): value is InvitationDeliveryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    [
      "reviewerEmail",
      "reviewerName",
      "inviterName",
      "orgName",
      "purpose",
      "expiresAt",
      "requestFingerprint",
    ].every((key) => typeof payload[key] === "string" && payload[key].length > 0) &&
    (payload.deliveryKind === "invite" || payload.deliveryKind === "extension")
  );
}

export async function createInvitationRequestFingerprint(
  fields: InvitationSnapshotFields,
  portalUrl: string,
  secret: string,
  idempotencyKey?: string,
): Promise<string> {
  const expiresAt = new Date(fields.expiresAt);
  const request =
    fields.deliveryKind === "extension"
      ? buildSessionExtendedEmailRequest({
          to: fields.reviewerEmail,
          reviewerName: fields.reviewerName,
          orgName: fields.orgName,
          purpose: fields.purpose,
          newExpiresAt: expiresAt,
          portalUrl,
        })
      : buildReviewerInviteEmailRequest({
          to: fields.reviewerEmail,
          reviewerName: fields.reviewerName,
          inviterName: fields.inviterName,
          orgName: fields.orgName,
          purpose: fields.purpose,
          expiresAt,
          portalUrl,
        });
  return fingerprintReviewerInviteRequestPayload(request, secret, idempotencyKey);
}

export async function fingerprintReviewerInviteRequestPayload(
  request: ReviewerInviteEmailRequestPayload,
  secret: string,
  idempotencyKey?: string,
): Promise<string> {
  return hmacSha256Hex(
    secret,
    JSON.stringify({
      method: "POST",
      url: "https://api.resend.com/emails",
      body: JSON.stringify(request),
      contentType: "application/json",
      idempotencyKey: idempotencyKey ?? null,
    }),
  );
}

export async function dispatchInvitationDelivery(
  store: InvitationDeliveryStore,
  bindings: Bindings,
  sessionId: string,
): Promise<void> {
  let intent: InvitationDeliveryIntent | null;
  try {
    intent = await store.claim(sessionId);
  } catch (error) {
    captureBackgroundException(error, "external-reviewers", {
      step: "invite_email_delivery_claim",
    });
    return;
  }
  if (!intent) return;

  try {
    const authorization = await store.authorize(
      sessionId,
      intent.attempt,
      intent.claimedAt,
      intent.reviewerId,
      intent.orgId,
    );
    if (authorization !== "authorized") {
      if (authorization === "ineligible") {
        await recordDeliveryState(() =>
          store.suppress(sessionId, intent.attempt, intent.claimedAt),
        );
      }
      return;
    }
  } catch (error) {
    captureBackgroundException(error, "external-reviewers", {
      step: "invite_email_delivery_eligibility",
    });
    return;
  }

  if (!bindings.RESEND_API_KEY) {
    const message = "RESEND_API_KEY is not configured";
    await recordDeliveryState(() =>
      store.markUnavailable(sessionId, intent.attempt, intent.claimedAt, message),
    );
    captureBackgroundException(new Error(message), "external-reviewers", {
      step: "invite_email_delivery_configuration",
    });
    return;
  }

  try {
    const idempotencyKey = `external-review-invite/${sessionId}/${intent.attempt}`;
    if (intent.deliveryKind === "extension") {
      await sendSessionExtendedEmail({
        to: intent.reviewerEmail,
        reviewerName: intent.reviewerName,
        orgName: intent.orgName,
        purpose: intent.purpose,
        portalUrl: intent.portalUrl,
        newExpiresAt: intent.expiresAt,
        resendKey: bindings.RESEND_API_KEY,
        idempotencyKey,
      });
    } else {
      await sendReviewerInviteEmail({
        to: intent.reviewerEmail,
        reviewerName: intent.reviewerName,
        inviterName: intent.inviterName,
        orgName: intent.orgName,
        purpose: intent.purpose,
        portalUrl: intent.portalUrl,
        expiresAt: intent.expiresAt,
        resendKey: bindings.RESEND_API_KEY,
        idempotencyKey,
      });
    }
    await store.markSent(sessionId, intent.attempt, intent.claimedAt);
  } catch (error) {
    const message = safeError(error);
    if (isDefiniteProviderRejection(error)) {
      await recordDeliveryState(() =>
        store.markQuarantined(sessionId, intent.attempt, intent.claimedAt, message),
      );
    } else {
      await recordDeliveryState(() =>
        store.markAmbiguous(sessionId, intent.attempt, intent.claimedAt, message),
      );
    }
    captureBackgroundException(error, "external-reviewers", {
      step: "invite_email_delivery",
    });
  }
}

const LEASE_MS = 5 * 60 * 1000;
const AMBIGUITY_MS = 23 * 60 * 60 * 1000;
const DELIVERY_RECOVERY_CONCURRENCY = 3;
const MAX_AUTOMATIC_DELIVERY_ATTEMPTS = 3;

export function isInvitationDeliveryEligible(
  session: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}

export function createPostgresInvitationDeliveryStore(
  db: Database,
  bindings: Bindings,
): InvitationDeliveryStore {
  return {
    async claim(sessionId) {
      const now = new Date();
      const staleAt = new Date(now.getTime() - LEASE_MS);
      const quarantineAt = new Date(now.getTime() - AMBIGUITY_MS);
      await db
        .update(externalReviewSessions)
        .set({ invitationDeliveryStatus: "quarantined" })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            inArray(externalReviewSessions.invitationDeliveryStatus, [
              "processing",
              "sending",
              "ambiguous",
            ]),
            isNotNull(externalReviewSessions.invitationDeliveryStartedAt),
            lt(externalReviewSessions.invitationDeliveryStartedAt, quarantineAt),
          ),
        );
      const [claimed] = await db
        .update(externalReviewSessions)
        .set({
          invitationDeliveryStatus: "processing",
          invitationDeliveryAttempt: sql`case
            when ${externalReviewSessions.invitationDeliveryStatus} = 'failed'
            then ${externalReviewSessions.invitationDeliveryAttempt} + 1
            else ${externalReviewSessions.invitationDeliveryAttempt}
          end`,
          invitationDeliveryPayload: sql`case
            when ${externalReviewSessions.invitationDeliveryStatus} = 'failed'
            then null
            else ${externalReviewSessions.invitationDeliveryPayload}
          end`,
          invitationDeliveryStartedAt: sql`case
            when ${externalReviewSessions.invitationDeliveryStatus} = 'failed'
            then ${now}
            else coalesce(${externalReviewSessions.invitationDeliveryStartedAt}, ${now})
          end`,
          invitationDeliveryClaimedAt: now,
          invitationDeliverySentAt: sql`case
            when ${externalReviewSessions.invitationDeliveryStatus} = 'failed'
            then null
            else ${externalReviewSessions.invitationDeliverySentAt}
          end`,
          invitationProviderId: sql`case
            when ${externalReviewSessions.invitationDeliveryStatus} = 'failed'
            then null
            else ${externalReviewSessions.invitationProviderId}
          end`,
          invitationDeliveryError: null,
        })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            isNull(externalReviewSessions.revokedAt),
            gt(externalReviewSessions.expiresAt, now),
            or(
              inArray(externalReviewSessions.invitationDeliveryStatus, ["pending", "failed"]),
              and(
                inArray(externalReviewSessions.invitationDeliveryStatus, [
                  "processing",
                  "sending",
                  "ambiguous",
                ]),
                isNotNull(externalReviewSessions.invitationDeliveryClaimedAt),
                lt(externalReviewSessions.invitationDeliveryClaimedAt, staleAt),
                isNotNull(externalReviewSessions.invitationDeliveryStartedAt),
                gt(externalReviewSessions.invitationDeliveryStartedAt, quarantineAt),
              ),
            ),
          ),
        )
        .returning();
      if (!claimed) return null;
      if (!isInvitationDeliveryEligible(claimed, now)) return null;
      const attempt = claimed.invitationDeliveryAttempt ?? 1;
      const deliveryKind = claimed.invitationDeliveryKind === "extension" ? "extension" : "invite";

      const secret = bindings.PORTAL_TOKEN_SECRET ?? bindings.BETTER_AUTH_SECRET;
      let payload: InvitationDeliveryPayload;

      if (
        claimed.invitationDeliveryPayload !== null &&
        claimed.invitationDeliveryPayload !== undefined
      ) {
        if (!isInvitationDeliveryPayload(claimed.invitationDeliveryPayload)) {
          await quarantineInvitation(db, sessionId, attempt);
          return null;
        }
        payload = claimed.invitationDeliveryPayload;
      } else {
        const reviewer = await db.query.externalReviewers.findFirst({
          where: and(
            eq(externalReviewers.id, claimed.reviewerId),
            eq(externalReviewers.orgId, claimed.orgId),
            isNull(externalReviewers.deletedAt),
          ),
        });
        if (!reviewer) {
          await suppressInvitation(db, sessionId, attempt, now);
          return null;
        }
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, claimed.orgId),
        });
        const inviter = claimed.createdBy
          ? await db.query.user.findFirst({ where: eq(user.id, claimed.createdBy) })
          : null;
        if (!org) throw new Error("Invitation delivery dependencies are missing");

        const fields: InvitationSnapshotFields = {
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.name,
          inviterName: inviter?.name ?? "A teammate",
          orgName: org.name,
          purpose: claimed.purpose,
          expiresAt: claimed.expiresAt.toISOString(),
          deliveryKind,
        };
        const initialToken = await signPortalToken(claimed.id, claimed.expiresAt.getTime(), secret);
        const initialPortalUrl = buildAppUrl(bindings.APP_URL, `/portal/${initialToken}`);
        payload = {
          ...fields,
          requestFingerprint: await createInvitationRequestFingerprint(
            fields,
            initialPortalUrl,
            secret,
            `external-review-invite/${sessionId}/${attempt}`,
          ),
        };
        const [persistedPayload] = await db
          .update(externalReviewSessions)
          .set({ invitationDeliveryPayload: payload })
          .where(
            and(
              eq(externalReviewSessions.id, sessionId),
              eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
              isNull(externalReviewSessions.invitationDeliveryPayload),
            ),
          )
          .returning({ id: externalReviewSessions.id });
        if (!persistedPayload) {
          throw new Error("Failed to persist immutable invitation payload");
        }
      }

      const snapshotExpiresAt = new Date(payload.expiresAt);
      const rawToken = await signPortalToken(claimed.id, snapshotExpiresAt.getTime(), secret);
      const reconstructedTokenHash = await hashPortalTokenForStorage(rawToken, secret);
      if (typeof claimed.tokenHash === "string" && reconstructedTokenHash !== claimed.tokenHash) {
        await quarantineInvitation(db, sessionId, attempt);
        return null;
      }
      const portalUrl = buildAppUrl(bindings.APP_URL, `/portal/${rawToken}`);
      const fingerprint = await createInvitationRequestFingerprint(
        payload,
        portalUrl,
        secret,
        `external-review-invite/${sessionId}/${attempt}`,
      );
      if (fingerprint !== payload.requestFingerprint) {
        await quarantineInvitation(db, sessionId, attempt);
        return null;
      }

      return {
        sessionId: claimed.id,
        reviewerId: claimed.reviewerId,
        orgId: claimed.orgId,
        attempt,
        claimedAt: now,
        deliveryKind,
        reviewerEmail: payload.reviewerEmail,
        reviewerName: payload.reviewerName,
        inviterName: payload.inviterName,
        orgName: payload.orgName,
        purpose: payload.purpose,
        expiresAt: snapshotExpiresAt,
        portalUrl,
      };
    },
    async authorize(sessionId, attempt, claimedAt, reviewerId, orgId) {
      const now = new Date();
      const reviewer = await db.query.externalReviewers.findFirst({
        where: and(
          eq(externalReviewers.id, reviewerId),
          eq(externalReviewers.orgId, orgId),
          isNull(externalReviewers.deletedAt),
        ),
        columns: { id: true },
      });
      if (!reviewer) return "ineligible";
      const [session] = await db
        .update(externalReviewSessions)
        .set({ invitationDeliveryStatus: "sending" })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
            gt(externalReviewSessions.expiresAt, now),
            eq(externalReviewSessions.invitationDeliveryStatus, "processing"),
          ),
        )
        .returning({
          reviewerId: externalReviewSessions.reviewerId,
          orgId: externalReviewSessions.orgId,
        });
      return session ? "authorized" : "contended";
    },
    suppress: (sessionId, attempt, claimedAt) =>
      suppressInvitation(db, sessionId, attempt, claimedAt),
    async markSent(sessionId, attempt, claimedAt) {
      await db
        .update(externalReviewSessions)
        .set({
          invitationDeliveryStatus: "sent",
          invitationDeliverySentAt: new Date(),
          invitationDeliveryError: null,
        })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryStatus, "sending"),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
          ),
        );
    },
    async markUnavailable(sessionId, attempt, claimedAt, error) {
      await db
        .update(externalReviewSessions)
        .set({ invitationDeliveryStatus: "pending", invitationDeliveryError: error })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryStatus, "sending"),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
          ),
        );
    },
    async markRetryable(sessionId, attempt, claimedAt, error) {
      await db
        .update(externalReviewSessions)
        .set({
          invitationDeliveryStatus:
            attempt >= MAX_AUTOMATIC_DELIVERY_ATTEMPTS ? "quarantined" : "failed",
          invitationDeliveryError: error,
        })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryStatus, "sending"),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
          ),
        );
    },
    async markAmbiguous(sessionId, attempt, claimedAt, error) {
      await db
        .update(externalReviewSessions)
        .set({ invitationDeliveryStatus: "ambiguous", invitationDeliveryError: error })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryStatus, "sending"),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
          ),
        );
    },
    async markQuarantined(sessionId, attempt, claimedAt, error) {
      await db
        .update(externalReviewSessions)
        .set({ invitationDeliveryStatus: "quarantined", invitationDeliveryError: error })
        .where(
          and(
            eq(externalReviewSessions.id, sessionId),
            eq(externalReviewSessions.invitationDeliveryAttempt, attempt),
            eq(externalReviewSessions.invitationDeliveryStatus, "sending"),
            eq(externalReviewSessions.invitationDeliveryClaimedAt, claimedAt),
            isNull(externalReviewSessions.revokedAt),
          ),
        );
    },
  };
}

type DedicatedInvitationDeliveryDependencies = {
  openHandle: typeof createDbHandle;
  dispatch: typeof dispatchInvitationDelivery;
};

export async function dispatchInvitationDeliveryWithDedicatedHandle(
  bindings: Bindings,
  sessionId: string,
  dependencies: DedicatedInvitationDeliveryDependencies = {
    openHandle: createDbHandle,
    dispatch: dispatchInvitationDelivery,
  },
): Promise<void> {
  const handle = await dependencies.openHandle(bindings.DATABASE_URL, bindings.HYPERDRIVE);
  try {
    await dependencies.dispatch(
      createPostgresInvitationDeliveryStore(handle.db, bindings),
      bindings,
      sessionId,
    );
  } finally {
    await handle.close();
  }
}

export async function redispatchPendingInvitations(
  db: Database,
  bindings: Bindings,
): Promise<void> {
  if (typeof db.select !== "function") return;
  const now = new Date();
  await db
    .update(externalReviewSessions)
    .set({
      invitationDeliveryAttempt: sql`${externalReviewSessions.invitationDeliveryAttempt} + 1`,
      invitationDeliveryStatus: "suppressed",
      invitationDeliveryPayload: null,
      invitationDeliveryClaimedAt: null,
      invitationProviderId: null,
      invitationDeliveryError: null,
    })
    .where(
      and(
        inArray(externalReviewSessions.invitationDeliveryStatus, [
          "pending",
          "failed",
          "processing",
          "sending",
          "ambiguous",
        ]),
        isNull(externalReviewSessions.revokedAt),
        lte(externalReviewSessions.expiresAt, now),
      ),
    );
  const candidates = await db
    .select({ id: externalReviewSessions.id })
    .from(externalReviewSessions)
    .where(
      and(
        inArray(externalReviewSessions.invitationDeliveryStatus, [
          "pending",
          "failed",
          "processing",
          "sending",
          "ambiguous",
        ]),
        isNull(externalReviewSessions.revokedAt),
        gt(externalReviewSessions.expiresAt, now),
      ),
    )
    .orderBy(
      sql`coalesce(${externalReviewSessions.invitationDeliveryClaimedAt}, to_timestamp(0)) asc`,
    )
    .limit(100);
  const store = createPostgresInvitationDeliveryStore(db, bindings);
  await runSettledWithConcurrency(candidates, DELIVERY_RECOVERY_CONCURRENCY, ({ id }) =>
    dispatchInvitationDelivery(store, bindings, id),
  );
}
