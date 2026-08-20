import type { PlanTier, SubscriptionStatus } from "../constants";

export type PaywallOrgState = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | Date | null;
  planTier?: PlanTier;
  stripeSubscriptionId?: string | null;
};

export type PaywallReason = "trial_expired" | "subscription_inactive" | "subscription_canceled";
export type BillingLifecycleState = "trialing" | "expired" | "active" | "past_due";

export type PaywallState =
  | { allowed: true; status: "trialing"; trialEndsAt: Date; daysRemaining: number }
  | { allowed: true; status: "active" }
  | { allowed: false; reason: PaywallReason; trialEndsAt: Date | null };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isTrialActive(org: PaywallOrgState, now: Date = new Date()): boolean {
  if (org.subscriptionStatus !== "trialing") return false;
  const ends = toDate(org.trialEndsAt);
  if (!ends) return false;
  return ends.getTime() > now.getTime();
}

export function isSubscriptionActive(org: PaywallOrgState): boolean {
  return org.subscriptionStatus === "active";
}

export function billingLifecycleState(
  org: Pick<PaywallOrgState, "subscriptionStatus" | "trialEndsAt">,
  now: Date = new Date(),
): BillingLifecycleState {
  if (org.subscriptionStatus === "active") return "active";
  if (org.subscriptionStatus === "past_due") return "past_due";
  if (isTrialActive({ ...org, subscriptionStatus: "trialing" }, now)) return "trialing";
  return "expired";
}

export function paywallState(org: PaywallOrgState, now: Date = new Date()): PaywallState {
  if (isSubscriptionActive(org)) {
    return { allowed: true, status: "active" };
  }
  if (isTrialActive(org, now)) {
    const ends = toDate(org.trialEndsAt) as Date;
    const daysRemaining = Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / MS_PER_DAY));
    return { allowed: true, status: "trialing", trialEndsAt: ends, daysRemaining };
  }
  const ends = toDate(org.trialEndsAt);
  if (org.subscriptionStatus === "canceled") {
    return { allowed: false, reason: "subscription_canceled", trialEndsAt: ends };
  }
  if (org.subscriptionStatus === "trialing" || org.subscriptionStatus === "expired") {
    return { allowed: false, reason: "trial_expired", trialEndsAt: ends };
  }
  return { allowed: false, reason: "subscription_inactive", trialEndsAt: ends };
}
