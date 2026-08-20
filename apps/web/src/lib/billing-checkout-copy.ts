import type { PaywallReason } from "@grantpipe/shared";

type BlockedBillingCopyInput = {
  reason: PaywallReason;
  isAdmin: boolean;
  checkoutPlanLabel?: string;
};

type BlockedBillingPrimaryAction = "checkout" | "settings" | "none";

type BlockedBillingCopy = {
  title: string;
  message: string;
  primaryAction: BlockedBillingPrimaryAction;
  primaryCta: string | null;
};

export function getBlockedBillingCopy({
  reason,
  isAdmin,
  checkoutPlanLabel = "Growth",
}: BlockedBillingCopyInput): BlockedBillingCopy {
  if (!isAdmin) {
    return {
      title: reason === "trial_expired" ? "Your free trial has ended" : "Billing action required",
      message:
        reason === "trial_expired"
          ? "Your free trial ended. Ask an admin to choose a plan so your team can keep using GrantPipe."
          : "Ask an admin to add billing. They can get you back in.",
      primaryAction: "none",
      primaryCta: null,
    };
  }

  if (reason === "trial_expired") {
    return {
      title: "Start billing to keep using GrantPipe",
      message: `Your free trial ended. Start the ${checkoutPlanLabel} annual plan to get back in.`,
      primaryAction: "checkout",
      primaryCta: `Start ${checkoutPlanLabel} annual`,
    };
  }

  return {
    title: "Billing action required",
    message:
      reason === "subscription_canceled"
        ? "Your billing stopped. Add billing to get back in."
        : "Add billing from Settings to keep using GrantPipe.",
    primaryAction: "settings",
    primaryCta: "Start billing",
  };
}
