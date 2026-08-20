import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { organizations } from "@grantpipe/db";
import {
  SUBSCRIPTION_STATUSES,
  isPlanTierAtLeast,
  normalizePlanTier,
  paywallState,
  type PlanTier,
  type SubscriptionStatus,
} from "@grantpipe/shared";
import type { AppEnv } from "../types";

function normalizeStatus(value: string | null | undefined): SubscriptionStatus {
  if (value && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)) {
    return value as SubscriptionStatus;
  }
  return "trialing";
}

export function requirePlanTier(minimum: PlanTier) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId) return c.json({ error: "no_organization" }, 403);
    const db = c.get("db");
    const cached = c.get("orgSubscription");
    const org =
      cached ??
      (await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { planTier: true, subscriptionStatus: true, trialEndsAt: true },
      }));
    if (!org) return c.json({ error: "no_organization" }, 403);

    const tier = normalizePlanTier(org.planTier);
    if (!isPlanTierAtLeast(tier, minimum)) {
      return c.json({ error: "insufficient_plan", required: minimum, current: tier }, 402);
    }
    await next();
  });
}

export function requireActiveBilling() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId) {
      return c.json({ error: "no_organization" }, 403);
    }
    const db = c.get("db");
    const cached = c.get("orgSubscription");
    const org =
      cached ??
      (await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          subscriptionStatus: true,
          trialEndsAt: true,
          planTier: true,
          stripeSubscriptionId: true,
        },
      }));
    if (!org) {
      return c.json({ error: "no_organization" }, 403);
    }
    const state = paywallState({
      subscriptionStatus: normalizeStatus(org.subscriptionStatus),
      trialEndsAt: org.trialEndsAt ?? null,
      planTier: normalizePlanTier(org.planTier),
      stripeSubscriptionId: org.stripeSubscriptionId ?? null,
    });
    if (state.allowed) {
      await next();
      return;
    }
    return c.json(
      {
        error: "paywall",
        reason: state.reason,
        trialEndsAt: state.trialEndsAt ? state.trialEndsAt.toISOString() : null,
        planTier: org.planTier,
      },
      402,
    );
  });
}
