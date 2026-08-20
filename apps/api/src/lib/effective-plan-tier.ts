import {
  getEffectivePlanTier,
  type EffectivePlanTierInput,
  type PlanTier,
} from "@grantpipe/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { recordTrialFeatureUsage } from "../domains/org/trial-usage";
import { captureBackgroundException } from "./sentry";

type OrgSubscriptionLike = EffectivePlanTierInput | null | undefined;

export function getEffectiveOrgPlanTier(subscription: OrgSubscriptionLike): PlanTier {
  return getEffectivePlanTier({
    planTier: subscription?.planTier,
    subscriptionStatus: subscription?.subscriptionStatus,
    trialEndsAt: subscription?.trialEndsAt,
  });
}

export function getContextEffectivePlanTier(c: Context<AppEnv>): PlanTier {
  return getEffectiveOrgPlanTier(c.get("orgSubscription"));
}

function isEffectiveTrialActive(subscription: OrgSubscriptionLike): boolean {
  if (subscription?.subscriptionStatus !== "trialing") return false;
  if (subscription.trialEndsAt == null) return false;
  const ends =
    subscription.trialEndsAt instanceof Date
      ? subscription.trialEndsAt
      : new Date(subscription.trialEndsAt);
  if (Number.isNaN(ends.getTime())) return false;
  return ends.getTime() > Date.now();
}

export function getContextTrialUsageTier<T extends PlanTier>(
  c: Context<AppEnv>,
  requiredTier: T,
): T | null {
  return isEffectiveTrialActive(c.get("orgSubscription")) ? requiredTier : null;
}

export async function recordContextTrialFeatureUsage(
  c: Context<AppEnv>,
  requiredTier: PlanTier,
): Promise<void> {
  const orgId = c.get("orgId");
  const trialTier = getContextTrialUsageTier(c, requiredTier);
  if (!orgId || !trialTier) {
    return;
  }
  try {
    await recordTrialFeatureUsage(c.get("db"), { orgId, requiredTier: trialTier });
  } catch (error) {
    console.error("recordTrialFeatureUsage failed", error);
    captureBackgroundException(error, "trial-feature-usage", {
      required_tier: requiredTier,
    });
  }
}
