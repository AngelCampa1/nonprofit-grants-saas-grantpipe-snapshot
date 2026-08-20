import type { BillingCycle, PlanTier } from "@grantpipe/shared";

export type StripePriceIdMap = Partial<Record<PlanTier, Partial<Record<BillingCycle, string>>>>;

export interface CreateTrialCheckoutInput {
  stripeSecretKey: string;
  orgId: string;
  planTier: PlanTier;
  billingCycle: BillingCycle;
  promoCode?: string;
  appUrl: string;
  priceIds: StripePriceIdMap;
}

export interface CreateTrialCheckoutResult {
  url: string;
}

/**
 * Legacy helper retained only to fail closed for any stale caller that still
 * tries to use the removed card-required trial checkout flow.
 */
export async function createTrialCheckoutSession(
  _input: CreateTrialCheckoutInput,
): Promise<CreateTrialCheckoutResult> {
  throw new Error("trial_checkout_removed");
}
