import { describe, expect, it, vi, afterEach } from "vitest";
import {
  AI_USAGE_CAP_REACHED,
  capForFeature,
  nextPlanAboveCap,
  type AiCappedFeature,
} from "./ai-usage";
import * as constants from "../constants";

describe("ai usage cap contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes a stable error code", () => {
    expect(AI_USAGE_CAP_REACHED).toBe("ai_usage_cap_reached");
  });
  it("finds the next plan whose cap is higher for award intake", () => {
    const feature: AiCappedFeature = "award_intake";
    expect(nextPlanAboveCap(feature, "starter")).toBe("growth");
  });
  it("finds the next plan for ask your ledger", () => {
    expect(nextPlanAboveCap("ask_your_ledger", "starter")).toBe("growth");
  });
  it("finds the next ask-your-ledger plan when Starter cap is zero", () => {
    expect(nextPlanAboveCap("ask_your_ledger", "starter")).toBe("growth");
  });
  it("returns null when already uncapped", () => {
    expect(nextPlanAboveCap("award_intake", "growth")).toBeNull();
  });
  it("returns null for enterprise (already highest and uncapped)", () => {
    expect(nextPlanAboveCap("award_intake", "enterprise")).toBeNull();
  });
  it("capForFeature returns the correct monthly cap for starter award intake", () => {
    expect(capForFeature("award_intake", "starter")).toBe(5);
  });
  it("capForFeature returns the correct monthly cap for starter ask your ledger", () => {
    expect(capForFeature("ask_your_ledger", "starter")).toBe(0);
  });
  it("capForFeature returns Infinity for growth award intake", () => {
    expect(capForFeature("award_intake", "growth")).toBe(Number.POSITIVE_INFINITY);
  });
  it("returns null when no higher finite cap exists in remaining tiers", () => {
    // Override PLAN_ENTITLEMENTS so all tiers have the same finite cap,
    // forcing the for-loop in nextPlanAboveCap to exhaust and hit the trailing return null.
    const original = constants.PLAN_ENTITLEMENTS;
    const allCapped = {
      starter: { ...original.starter, awardIntakeMonthlyCap: 5 },
      growth: { ...original.growth, awardIntakeMonthlyCap: 5 },
      audit_ready: { ...original.audit_ready, awardIntakeMonthlyCap: 5 },
      enterprise: { ...original.enterprise, awardIntakeMonthlyCap: 5 },
    };
    vi.spyOn(constants, "PLAN_ENTITLEMENTS", "get").mockReturnValue(
      allCapped as typeof constants.PLAN_ENTITLEMENTS,
    );
    expect(nextPlanAboveCap("award_intake", "starter")).toBeNull();
  });
});
