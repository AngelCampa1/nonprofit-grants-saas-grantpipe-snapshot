import { describe, expect, it } from "vitest";

import { getBlockedBillingCopy } from "./billing-checkout-copy";

describe("getBlockedBillingCopy", () => {
  it("uses direct checkout copy for admins whose trial expired", () => {
    expect(
      getBlockedBillingCopy({
        reason: "trial_expired",
        isAdmin: true,
        checkoutPlanLabel: "Audit-Ready",
      }),
    ).toEqual({
      title: "Start billing to keep using GrantPipe",
      message: "Your free trial ended. Start the Audit-Ready annual plan to get back in.",
      primaryAction: "checkout",
      primaryCta: "Start Audit-Ready annual",
    });
  });

  it("keeps non-admin expired trial copy focused on asking an admin", () => {
    expect(getBlockedBillingCopy({ reason: "trial_expired", isAdmin: false })).toEqual({
      title: "Your free trial has ended",
      message:
        "Your free trial ended. Ask an admin to choose a plan so your team can keep using GrantPipe.",
      primaryAction: "none",
      primaryCta: null,
    });
  });

  it("keeps canceled subscriptions on the settings billing recovery path", () => {
    expect(getBlockedBillingCopy({ reason: "subscription_canceled", isAdmin: true })).toEqual({
      title: "Billing action required",
      message: "Your billing stopped. Add billing to get back in.",
      primaryAction: "settings",
      primaryCta: "Start billing",
    });
  });

  it("keeps non-admin inactive-subscription blocks focused on asking an admin", () => {
    expect(getBlockedBillingCopy({ reason: "subscription_inactive", isAdmin: false })).toEqual({
      title: "Billing action required",
      message: "Ask an admin to add billing. They can get you back in.",
      primaryAction: "none",
      primaryCta: null,
    });
  });

  it("sends admin inactive-subscription blocks to settings", () => {
    expect(getBlockedBillingCopy({ reason: "subscription_inactive", isAdmin: true })).toEqual({
      title: "Billing action required",
      message: "Add billing from Settings to keep using GrantPipe.",
      primaryAction: "settings",
      primaryCta: "Start billing",
    });
  });
});
