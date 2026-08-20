import { and, eq, isNull, lt } from "drizzle-orm";
import { organizations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { Bindings } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { isRetryableScheduledDbError, withDbRetry } from "../../lib/db-retry";
import { captureBackgroundException } from "../../lib/sentry";

const BATCH_SIZE = 100;

export type ExpiredTrialOrg = {
  id: string;
  subscriptionStatus: string | null;
};

function analyticsEnvironment(bindings: Bindings): string {
  if (bindings.SENTRY_ENVIRONMENT) return bindings.SENTRY_ENVIRONMENT;
  return bindings.APP_URL?.includes("app.grantpipe.com") ? "production" : "development";
}

export async function findExpiredTrialOrgs(
  db: Database,
  now: Date,
  limit = BATCH_SIZE,
): Promise<ExpiredTrialOrg[]> {
  // Side-effect-free discovery read; a transient database control-plane blip is
  // safe to retry (GRANTPIPE-API-Z).
  return withDbRetry(
    () =>
      db
        .select({
          id: organizations.id,
          subscriptionStatus: organizations.subscriptionStatus,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.subscriptionStatus, "trialing"),
            lt(organizations.trialEndsAt, now),
            isNull(organizations.trialExpiredEventAt),
          ),
        )
        .orderBy(organizations.trialEndsAt)
        .limit(limit),
    { isRetryable: isRetryableScheduledDbError },
  );
}

export async function runTrialExpiryTick(db: Database, bindings: Bindings): Promise<void> {
  const orgs = await findExpiredTrialOrgs(db, new Date(), BATCH_SIZE);
  if (orgs.length === 0) return;

  const integrations = getIntegrations(db, bindings);
  const environment = analyticsEnvironment(bindings);

  for (const org of orgs) {
    try {
      await integrations.analytics.capture({
        orgId: org.id,
        eventName: ANALYTICS_EVENTS.trialExpired,
        payload: {
          subscription_status: org.subscriptionStatus ?? "trialing",
          previous_subscription_status: org.subscriptionStatus ?? "trialing",
          new_subscription_status: "expired",
          environment,
        },
      });
    } catch (error) {
      // Leave trial_expired_event_at unset so the next tick retries this org.
      // Emitting before stamping keeps the marker honest about delivery.
      // Surface the failure so a persistently broken analytics pipe (which would
      // otherwise retry silently every tick) is visible in Sentry.
      captureBackgroundException(error, "trial-expiry", { step: "analytics" });
      continue;
    }

    // Emit-before-stamp is intentionally at-least-once: if this stamp throws
    // after a successful capture, the marker stays NULL and the next tick
    // re-emits for this org (a small, bounded re-emit window). PostHog
    // dedupes downstream, so the analytics cost is negligible.
    try {
      await db
        .update(organizations)
        .set({
          subscriptionStatus: "expired",
          trialExpiredEventAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));
    } catch (error) {
      captureBackgroundException(error, "trial-expiry", {
        step: "mark-expired",
        org_id: org.id,
      });
    }
  }
}
