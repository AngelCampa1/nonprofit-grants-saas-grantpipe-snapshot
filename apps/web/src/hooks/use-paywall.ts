import { useMemo } from "react";
import { paywallState, type PaywallState, type SubscriptionStatus } from "@grantpipe/shared";
import { useOrgBilling } from "./use-org-settings";
import { useSession } from "./use-session";

const BILLING_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
];

function isSubscriptionStatus(value: string | null): value is SubscriptionStatus {
  return value !== null && BILLING_STATUSES.includes(value as SubscriptionStatus);
}

export function usePaywall(options?: { enabled?: boolean }): {
  state: PaywallState | null;
  isLoading: boolean;
  isError: boolean;
} {
  const session = useSession();
  const sessionSubscription = session.orgSubscription;
  const hasSessionSubscription =
    session.hasLoadedContext &&
    !session.contextError &&
    sessionSubscription != null &&
    isSubscriptionStatus(sessionSubscription.subscriptionStatus);
  const billing = useOrgBilling({ enabled: options?.enabled && !hasSessionSubscription });
  const state = useMemo(() => {
    if (
      hasSessionSubscription &&
      sessionSubscription &&
      isSubscriptionStatus(sessionSubscription.subscriptionStatus)
    ) {
      return paywallState({
        subscriptionStatus: sessionSubscription.subscriptionStatus,
        trialEndsAt: sessionSubscription.trialEndsAt,
        stripeSubscriptionId: sessionSubscription.stripeSubscriptionId,
      });
    }
    if (!billing.data) return null;
    return paywallState({
      subscriptionStatus: billing.data.status,
      trialEndsAt: billing.data.trialEndsAt ?? null,
      stripeSubscriptionId: billing.data.subscriptionId ?? null,
    });
  }, [billing.data, hasSessionSubscription, sessionSubscription]);

  return {
    state,
    isLoading: hasSessionSubscription ? false : billing.isLoading,
    isError: hasSessionSubscription ? false : billing.isError,
  };
}
