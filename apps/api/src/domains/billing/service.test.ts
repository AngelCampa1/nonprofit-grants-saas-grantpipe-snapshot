import { describe, expect, it } from "vitest";
import { createTrialCheckoutSession, type StripePriceIdMap } from "./service";

const PRICE_IDS: StripePriceIdMap = {
  starter: { monthly: "price_starter_m", annual: "price_starter_a" },
  growth: { monthly: "price_growth_m", annual: "price_growth_a" },
  audit_ready: { monthly: "price_ar_m", annual: "price_ar_a" },
};

describe("createTrialCheckoutSession", () => {
  it("fails closed because the legacy card-required trial checkout flow was removed", async () => {
    await expect(
      createTrialCheckoutSession({
        stripeSecretKey: "sk",
        orgId: "org-1",
        planTier: "starter",
        billingCycle: "monthly",
        appUrl: "https://app.grantpipe.com",
        priceIds: PRICE_IDS,
      }),
    ).rejects.toThrow("trial_checkout_removed");
  });
});
