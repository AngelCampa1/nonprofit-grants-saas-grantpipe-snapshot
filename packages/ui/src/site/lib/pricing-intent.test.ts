import { describe, expect, it } from "vitest";

import { findPricingIntentTierFromSearch, getPricingIntentTierFromHref } from "./pricing-intent";

const tiers = [{ name: "Starter" }, { name: "Center" }, { name: "Enterprise" }];

describe("pricing-intent", () => {
  describe("getPricingIntentTierFromHref", () => {
    it("returns the plan query param when present", () => {
      expect(getPricingIntentTierFromHref("/?plan=center#pricing")).toBe("center");
    });

    it("returns undefined when the href has no plan query param", () => {
      expect(getPricingIntentTierFromHref("/#pricing")).toBeUndefined();
    });

    it("supports absolute urls", () => {
      expect(getPricingIntentTierFromHref("https://pebbledesk.app/?plan=enterprise#pricing")).toBe(
        "enterprise",
      );
    });

    it("ignores plan params that contain only whitespace", () => {
      expect(getPricingIntentTierFromHref("/?plan=%20%20%20#pricing")).toBe(undefined);
    });
  });

  describe("findPricingIntentTierFromSearch", () => {
    it("matches tier names case-insensitively from the search string", () => {
      expect(findPricingIntentTierFromSearch("?plan=center", tiers)).toBe("Center");
    });

    it("returns undefined when the plan param does not match any tier", () => {
      expect(findPricingIntentTierFromSearch("?plan=unknown", tiers)).toBeUndefined();
    });

    it("returns undefined when the search string has no plan param", () => {
      expect(findPricingIntentTierFromSearch("", tiers)).toBeUndefined();
    });

    it("supports search strings without a leading question mark", () => {
      expect(findPricingIntentTierFromSearch("plan=enterprise", tiers)).toBe("Enterprise");
    });

    it("returns undefined when the plan param trims to an empty value", () => {
      expect(findPricingIntentTierFromSearch("?plan=%20%20", tiers)).toBe(undefined);
    });
  });
});
