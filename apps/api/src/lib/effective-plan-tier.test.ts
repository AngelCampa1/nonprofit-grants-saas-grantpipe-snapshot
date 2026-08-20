import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveOrgPlanTier, recordContextTrialFeatureUsage } from "./effective-plan-tier";
import { recordTrialFeatureUsage } from "../domains/org/trial-usage";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../domains/org/trial-usage", () => ({
  recordTrialFeatureUsage: vi.fn(),
}));

vi.mock("./sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

function makeContext(values: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as never;
}

describe("effective plan tier helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("falls back to Starter when subscription context is missing", () => {
    expect(getEffectiveOrgPlanTier(null)).toBe("starter");
  });

  it("records trial feature usage for active trials", async () => {
    const db = { db: true };
    const context = makeContext({
      db,
      orgId: "org-1",
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    await recordContextTrialFeatureUsage(context, "growth");

    expect(recordTrialFeatureUsage).toHaveBeenCalledWith(db, {
      orgId: "org-1",
      requiredTier: "growth",
    });
  });

  it("does not record usage when the trial is inactive or org context is missing", async () => {
    await recordContextTrialFeatureUsage(
      makeContext({
        orgId: "org-1",
        orgSubscription: {
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2000-01-01T00:00:00.000Z"),
        },
      }),
      "growth",
    );
    await recordContextTrialFeatureUsage(
      makeContext({
        orgId: null,
        orgSubscription: {
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      }),
      "growth",
    );

    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("handles string trial end dates when recording trial feature usage", async () => {
    const db = { db: true };
    const context = makeContext({
      db,
      orgId: "org-1",
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: "2099-01-01T00:00:00.000Z",
      },
    });

    await recordContextTrialFeatureUsage(context, "growth");

    expect(recordTrialFeatureUsage).toHaveBeenCalledWith(db, {
      orgId: "org-1",
      requiredTier: "growth",
    });
  });

  it("does not record usage when trial state is missing, inactive, or invalid", async () => {
    await recordContextTrialFeatureUsage(
      makeContext({
        orgId: "org-1",
        orgSubscription: {
          planTier: "starter",
          subscriptionStatus: "active",
          trialEndsAt: "2099-01-01T00:00:00.000Z",
        },
      }),
      "growth",
    );
    await recordContextTrialFeatureUsage(
      makeContext({
        orgId: "org-1",
        orgSubscription: {
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: null,
        },
      }),
      "growth",
    );
    await recordContextTrialFeatureUsage(
      makeContext({
        orgId: "org-1",
        orgSubscription: {
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: "not-a-date",
        },
      }),
      "growth",
    );

    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("swallows trial usage recording failures", async () => {
    const error = new Error("db unavailable");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(recordTrialFeatureUsage).mockRejectedValue(error);
    const context = makeContext({
      db: { db: true },
      orgId: "org-1",
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    await expect(recordContextTrialFeatureUsage(context, "growth")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("recordTrialFeatureUsage failed", expect.any(Error));
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(error, "trial-feature-usage", {
      required_tier: "growth",
    });
    errorSpy.mockRestore();
  });
});
