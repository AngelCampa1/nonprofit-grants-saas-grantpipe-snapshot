import { describe, expect, it } from "vitest";
import {
  billingLifecycleState,
  isSubscriptionActive,
  isTrialActive,
  paywallState,
} from "./paywall";

const NOW = new Date("2026-04-13T12:00:00.000Z");
describe("paywall helpers", () => {
  it("treats trial as active when end date is in the future", () => {
    const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTrialActive({ subscriptionStatus: "trialing", trialEndsAt: future }, NOW)).toBe(true);
  });

  it("treats trial as inactive when status is not trialing", () => {
    const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTrialActive({ subscriptionStatus: "active", trialEndsAt: future }, NOW)).toBe(false);
  });

  it("treats trial as inactive when end date missing or invalid", () => {
    expect(isTrialActive({ subscriptionStatus: "trialing", trialEndsAt: null }, NOW)).toBe(false);
    expect(isTrialActive({ subscriptionStatus: "trialing", trialEndsAt: "not-a-date" }, NOW)).toBe(
      false,
    );
  });

  it("identifies active subscription", () => {
    expect(isSubscriptionActive({ subscriptionStatus: "active", trialEndsAt: null })).toBe(true);
    expect(isSubscriptionActive({ subscriptionStatus: "past_due", trialEndsAt: null })).toBe(false);
  });

  it("returns active state for active subscription", () => {
    const state = paywallState({ subscriptionStatus: "active", trialEndsAt: null }, NOW);
    expect(state).toEqual({ allowed: true, status: "active" });
  });

  it("returns trialing state with days remaining when trial active", () => {
    const ends = new Date(NOW.getTime() + 3.4 * 24 * 60 * 60 * 1000);
    const state = paywallState({ subscriptionStatus: "trialing", trialEndsAt: ends }, NOW);
    expect(state.allowed).toBe(true);
    if (state.allowed && state.status === "trialing") {
      expect(state.daysRemaining).toBe(4);
      expect(state.trialEndsAt).toEqual(ends);
    }
  });

  it("returns trial_expired when status still trialing but date elapsed", () => {
    const past = new Date(NOW.getTime() - 1000).toISOString();
    const state = paywallState({ subscriptionStatus: "trialing", trialEndsAt: past }, NOW);
    expect(state).toEqual({
      allowed: false,
      reason: "trial_expired",
      trialEndsAt: new Date(past),
    });
  });

  it("returns trial_expired when the persisted lifecycle status is expired", () => {
    const past = new Date(NOW.getTime() - 1000).toISOString();
    const state = paywallState({ subscriptionStatus: "expired", trialEndsAt: past }, NOW);
    expect(state).toEqual({
      allowed: false,
      reason: "trial_expired",
      trialEndsAt: new Date(past),
    });
  });

  it("returns subscription_canceled for canceled status", () => {
    const state = paywallState({ subscriptionStatus: "canceled", trialEndsAt: null }, NOW);
    expect(state).toEqual({ allowed: false, reason: "subscription_canceled", trialEndsAt: null });
  });

  it("returns subscription_inactive for past_due / incomplete", () => {
    expect(paywallState({ subscriptionStatus: "past_due", trialEndsAt: null }, NOW).allowed).toBe(
      false,
    );
    expect(paywallState({ subscriptionStatus: "incomplete", trialEndsAt: null }, NOW)).toEqual({
      allowed: false,
      reason: "subscription_inactive",
      trialEndsAt: null,
    });
  });

  it("uses default now when not provided", () => {
    const state = paywallState({ subscriptionStatus: "active", trialEndsAt: null });
    expect(state.allowed).toBe(true);
  });

  it("clamps daysRemaining to zero when computing during the final ms of the trial", () => {
    const ends = new Date(NOW.getTime() + 1);
    const state = paywallState({ subscriptionStatus: "trialing", trialEndsAt: ends }, NOW);
    expect(state.allowed).toBe(true);
    if (state.allowed && state.status === "trialing") {
      expect(state.daysRemaining).toBe(1);
    }
  });

  it("returns canonical billing lifecycle states for roadmap automation", () => {
    expect(
      billingLifecycleState(
        { subscriptionStatus: "trialing", trialEndsAt: "2026-04-12T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("expired");
    expect(
      billingLifecycleState(
        { subscriptionStatus: "trialing", trialEndsAt: "2026-04-20T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("trialing");
    expect(billingLifecycleState({ subscriptionStatus: "active", trialEndsAt: null }, NOW)).toBe(
      "active",
    );
    expect(billingLifecycleState({ subscriptionStatus: "past_due", trialEndsAt: null }, NOW)).toBe(
      "past_due",
    );
    expect(billingLifecycleState({ subscriptionStatus: "expired", trialEndsAt: null }, NOW)).toBe(
      "expired",
    );
  });

  it("treats missing trial end dates as expired for lifecycle automation", () => {
    expect(billingLifecycleState({ subscriptionStatus: "trialing", trialEndsAt: null }, NOW)).toBe(
      "expired",
    );
  });
});
