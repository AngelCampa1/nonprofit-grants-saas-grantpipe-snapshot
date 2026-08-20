import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { notifications, type Database, type NotificationEmailRequestSnapshot } from "@grantpipe/db";
import { getIntegrations, type EmailProvider, type EmailSendParams } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";

const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const PROVIDER_IDEMPOTENCY_RECOVERY_MS = 23 * 60 * 60 * 1000;
const DELIVERY_BATCH_SIZE = 100;

type DeliveryIntegrations = {
  email: Pick<EmailProvider, "send">;
  analytics?: {
    capture: (params: {
      orgId?: string;
      eventName: string;
      payload?: Record<string, unknown> | null;
    }) => Promise<unknown> | unknown;
  };
};

export type NotificationEmailDeliveryClaim = {
  id: string;
  orgId: string;
  type: string;
  emailRequestSnapshot: NotificationEmailRequestSnapshot;
  emailRequestFingerprint: string;
  emailClaimedAt: Date;
};

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonicalizeJson(record[key])]),
  );
}

async function fingerprintRequest(request: NotificationEmailRequestSnapshot): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonicalizeJson(request))),
  );
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function buildNotificationEmailDeliveryFields(
  notificationId: string,
  params: EmailSendParams,
): Promise<{
  emailDeliveryStatus: "pending";
  emailRequestSnapshot: NotificationEmailRequestSnapshot;
  emailRequestFingerprint: string;
}> {
  const request: NotificationEmailRequestSnapshot = {
    version: 1,
    idempotencyKey: `notification-email/${notificationId}`,
    orgId: params.orgId,
    to: [...params.to],
    subject: params.subject,
    text: params.text,
    ...(params.html === undefined ? {} : { html: params.html }),
    source: { ...params.source },
  };
  return {
    emailDeliveryStatus: "pending",
    emailRequestSnapshot: request,
    emailRequestFingerprint: await fingerprintRequest(request),
  };
}

export async function prepareNotificationEmailClaims(
  rows: Array<typeof notifications.$inferInsert>,
  emailByDedupe: Map<string, EmailSendParams>,
  now: Date = new Date(),
): Promise<Map<string, NotificationEmailDeliveryClaim>> {
  const claims = new Map<string, NotificationEmailDeliveryClaim>();
  for (const row of rows) {
    if (!row.dedupeKey) continue;
    const params = emailByDedupe.get(row.dedupeKey);
    if (!params) continue;
    const id = crypto.randomUUID();
    const emailFields = await buildNotificationEmailDeliveryFields(id, params);
    Object.assign(row, {
      id,
      ...emailFields,
      emailDeliveryStatus: "sending",
      emailClaimedAt: now,
      emailAttemptCount: 1,
    });
    claims.set(row.dedupeKey, {
      id,
      orgId: row.orgId,
      type: row.type,
      emailRequestSnapshot: emailFields.emailRequestSnapshot,
      emailRequestFingerprint: emailFields.emailRequestFingerprint,
      emailClaimedAt: now,
    });
  }
  return claims;
}

function isNotificationEmailRequest(value: unknown): value is NotificationEmailRequestSnapshot {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<NotificationEmailRequestSnapshot>;
  return (
    request.version === 1 &&
    typeof request.idempotencyKey === "string" &&
    typeof request.orgId === "string" &&
    Array.isArray(request.to) &&
    request.to.every((recipient) => typeof recipient === "string") &&
    typeof request.subject === "string" &&
    typeof request.text === "string" &&
    !!request.source &&
    typeof request.source.entityType === "string" &&
    typeof request.source.entityId === "string"
  );
}

function failureState(error: unknown): "ambiguous" | "failed" | "quarantined" {
  const message = error instanceof Error ? error.message : String(error);
  const status = /Resend API error (\d{3})/.exec(message)?.[1];
  if (status === "409") return "quarantined";
  if (!status || ["408", "425", "429"].includes(status) || Number(status) >= 500) {
    return "ambiguous";
  }
  return "failed";
}

export async function dispatchNotificationEmail(
  db: Database,
  integrations: DeliveryIntegrations,
  notificationId: string,
  now: Date = new Date(),
): Promise<"sent" | "skipped" | "failed"> {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const [claim] = await db
    .update(notifications)
    .set({
      emailDeliveryStatus: "sending",
      emailClaimedAt: now,
      emailAttemptCount: sql`${notifications.emailAttemptCount} + 1`,
      emailLastError: null,
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        or(
          eq(notifications.emailDeliveryStatus, "pending"),
          and(
            inArray(notifications.emailDeliveryStatus, ["sending", "ambiguous"]),
            lt(notifications.emailClaimedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({
      id: notifications.id,
      orgId: notifications.orgId,
      type: notifications.type,
      emailRequestSnapshot: notifications.emailRequestSnapshot,
      emailRequestFingerprint: notifications.emailRequestFingerprint,
      emailClaimedAt: notifications.emailClaimedAt,
      createdAt: notifications.createdAt,
    });
  const emailClaimedAt = claim?.emailClaimedAt;
  if (!claim || !emailClaimedAt) return "skipped";

  if (now.getTime() - claim.createdAt.getTime() >= PROVIDER_IDEMPOTENCY_RECOVERY_MS) {
    await db
      .update(notifications)
      .set({
        emailDeliveryStatus: "quarantined",
        emailLastError: "provider_idempotency_window_expired",
      })
      .where(
        and(
          eq(notifications.id, claim.id),
          eq(notifications.emailDeliveryStatus, "sending"),
          eq(notifications.emailClaimedAt, emailClaimedAt),
        ),
      );
    captureScheduledException(
      new Error("Notification email idempotency window expired"),
      "notifications.email-delivery.idempotency-window",
      "scheduled",
    );
    return "failed";
  }

  const request = claim.emailRequestSnapshot;
  const validRequest = isNotificationEmailRequest(request) ? request : null;
  const fingerprint = validRequest ? await fingerprintRequest(validRequest) : null;
  if (!validRequest || fingerprint === null || fingerprint !== claim.emailRequestFingerprint) {
    await db
      .update(notifications)
      .set({
        emailDeliveryStatus: "quarantined",
        emailLastError: "provider_request_drift",
      })
      .where(
        and(
          eq(notifications.id, claim.id),
          eq(notifications.emailDeliveryStatus, "sending"),
          eq(notifications.emailClaimedAt, emailClaimedAt),
        ),
      );
    captureScheduledException(
      new Error("Notification email request drifted"),
      "notifications.email-delivery.request-drift",
      "scheduled",
    );
    return "failed";
  }

  return deliverClaimedNotificationEmail(db, integrations, {
    ...claim,
    emailRequestSnapshot: validRequest,
    emailRequestFingerprint: fingerprint,
    emailClaimedAt,
  });
}

export async function deliverClaimedNotificationEmail(
  db: Database,
  integrations: DeliveryIntegrations,
  claim: NotificationEmailDeliveryClaim,
): Promise<"sent" | "failed"> {
  const request = claim.emailRequestSnapshot;
  const fingerprint = await fingerprintRequest(request);
  if (fingerprint !== claim.emailRequestFingerprint) {
    captureScheduledException(
      new Error("Notification email request drifted"),
      "notifications.email-delivery.request-drift",
      "scheduled",
    );
    return "failed";
  }
  try {
    const result = await integrations.email.send(request);
    if (typeof (db as { update?: unknown }).update === "function") {
      await db
        .update(notifications)
        .set({
          emailDeliveryStatus: "sent",
          emailProviderMessageId: result.id,
          emailSentAt: new Date(),
          emailLastError: null,
        })
        .where(
          and(
            eq(notifications.id, claim.id),
            eq(notifications.emailDeliveryStatus, "sending"),
            eq(notifications.emailClaimedAt, claim.emailClaimedAt),
          ),
        );
    }
    await Promise.resolve(
      integrations.analytics?.capture({
        orgId: claim.orgId,
        eventName: "notification_email_delivered",
        payload: { notification_type: claim.type },
      }),
    ).catch((error: unknown) => {
      captureScheduledException(error, "notifications.email-delivery.analytics", "scheduled");
    });
    return "sent";
  } catch (error) {
    const state = failureState(error);
    if (typeof (db as { update?: unknown }).update === "function") {
      try {
        await db
          .update(notifications)
          .set({
            emailDeliveryStatus: state,
            emailLastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          })
          .where(
            and(
              eq(notifications.id, claim.id),
              eq(notifications.emailDeliveryStatus, "sending"),
              eq(notifications.emailClaimedAt, claim.emailClaimedAt),
            ),
          );
      } catch (persistenceError) {
        captureScheduledException(
          persistenceError,
          "notifications.email-delivery.persist-failure",
          "scheduled",
        );
      }
    }
    captureScheduledException(error, `notifications.email-delivery.${state}`, "scheduled");
    throw error;
  }
}

export async function dispatchPendingNotificationEmails(
  db: Database,
  env: Parameters<typeof getIntegrations>[1],
  now: Date = new Date(),
): Promise<void> {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const rows = await db.query.notifications.findMany({
    where: or(
      eq(notifications.emailDeliveryStatus, "pending"),
      and(
        inArray(notifications.emailDeliveryStatus, ["sending", "ambiguous"]),
        lt(notifications.emailClaimedAt, staleBefore),
      ),
    ),
    columns: { id: true },
    limit: DELIVERY_BATCH_SIZE,
  });
  const integrations = getIntegrations(db, env);
  for (const row of rows) {
    await dispatchNotificationEmail(db, integrations, row.id, now).catch((error: unknown) => {
      captureScheduledException(error, "notifications.email-delivery.dispatch", "scheduled");
    });
  }
}
