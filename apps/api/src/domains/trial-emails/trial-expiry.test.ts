import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@grantpipe/db";
import type { Bindings } from "../../types";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));
vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

const { mockAnalyticsCapture, mockGetIntegrations } = vi.hoisted(() => {
  const mockAnalyticsCapture = vi.fn().mockResolvedValue({ id: "evt-1" });
  const mockGetIntegrations = vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  }));
  return { mockAnalyticsCapture, mockGetIntegrations };
});

vi.mock("../../lib/integrations", () => ({
  getIntegrations: mockGetIntegrations,
}));

import { findExpiredTrialOrgs, runTrialExpiryTick } from "./trial-expiry";

function buildExpiryDb(rows: Array<Record<string, unknown>>, options?: { updateError?: Error }) {
  const updates: Array<{ set: Record<string, unknown> }> = [];
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  const updateSet = vi.fn((value: Record<string, unknown>) => {
    updates.push({ set: value });
    return {
      where: options?.updateError
        ? vi.fn().mockRejectedValue(options.updateError)
        : vi.fn().mockResolvedValue(undefined),
    };
  });
  const update = vi.fn(() => ({ set: updateSet }));
  return {
    db: { select: vi.fn(() => selectChain), update } as unknown as Database,
    updates,
  };
}

const bindings = { APP_URL: "https://app.grantpipe.com" } as Bindings;

beforeEach(() => {
  vi.clearAllMocks();
  mockAnalyticsCapture.mockResolvedValue({ id: "evt-1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("findExpiredTrialOrgs", () => {
  it("returns the lapsed trialing orgs from the discovery read", async () => {
    const { db } = buildExpiryDb([
      { id: "org-1", subscriptionStatus: "trialing" },
      { id: "org-2", subscriptionStatus: "trialing" },
    ]);

    await expect(findExpiredTrialOrgs(db, new Date("2026-06-01T00:00:00Z"))).resolves.toEqual([
      { id: "org-1", subscriptionStatus: "trialing" },
      { id: "org-2", subscriptionStatus: "trialing" },
    ]);
  });
});

describe("runTrialExpiryTick", () => {
  it("emits trial_expired once per lapsed org and stamps the dedup marker", async () => {
    const { db, updates } = buildExpiryDb([{ id: "org-1", subscriptionStatus: "trialing" }]);

    await runTrialExpiryTick(db, bindings);

    expect(mockGetIntegrations).toHaveBeenCalledWith(db, bindings);
    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: "trial_expired",
      payload: {
        subscription_status: "trialing",
        previous_subscription_status: "trialing",
        new_subscription_status: "expired",
        environment: "production",
      },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set).toMatchObject({
      subscriptionStatus: "expired",
      trialExpiredEventAt: expect.any(Date),
    });
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          previous_subscription_status: "trialing",
          new_subscription_status: "expired",
        }),
      }),
    );
  });

  it("does not re-emit for orgs the discovery read already excludes", async () => {
    const { db, updates } = buildExpiryDb([]);

    await runTrialExpiryTick(db, bindings);

    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("leaves the marker unset when analytics capture fails so the next tick retries", async () => {
    mockAnalyticsCapture.mockRejectedValueOnce(new Error("posthog down"));
    const { db, updates } = buildExpiryDb([{ id: "org-1", subscriptionStatus: "trialing" }]);

    await expect(runTrialExpiryTick(db, bindings)).resolves.toBeUndefined();

    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "trial-expiry", {
      step: "analytics",
    });
  });

  it("captures update failures without retrying the same org in the same tick", async () => {
    const updateError = new Error("database unavailable");
    const { db, updates } = buildExpiryDb(
      [
        { id: "org-1", subscriptionStatus: "trialing" },
        { id: "org-2", subscriptionStatus: "trialing" },
      ],
      { updateError },
    );

    await expect(runTrialExpiryTick(db, bindings)).resolves.toBeUndefined();

    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(2);
    expect(updates).toHaveLength(2);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(updateError, "trial-expiry", {
      step: "mark-expired",
      org_id: "org-1",
    });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(updateError, "trial-expiry", {
      step: "mark-expired",
      org_id: "org-2",
    });
  });

  it("keeps trial_expired analytics payload privacy-safe", async () => {
    const { db } = buildExpiryDb([{ id: "org-1", subscriptionStatus: "trialing" }]);

    await runTrialExpiryTick(db, bindings);

    const payload = mockAnalyticsCapture.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "environment",
      "new_subscription_status",
      "previous_subscription_status",
      "subscription_status",
    ]);
  });

  it("uses a development environment tag outside the production app host", async () => {
    const { db } = buildExpiryDb([{ id: "org-1", subscriptionStatus: "trialing" }]);

    await runTrialExpiryTick(db, { APP_URL: "http://localhost:3050" } as Bindings);

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ environment: "development" }),
      }),
    );
  });

  it("prefers an explicit SENTRY_ENVIRONMENT tag when configured", async () => {
    const { db } = buildExpiryDb([{ id: "org-1", subscriptionStatus: "trialing" }]);

    await runTrialExpiryTick(db, {
      APP_URL: "http://localhost:3050",
      SENTRY_ENVIRONMENT: "staging",
    } as Bindings);

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ environment: "staging" }),
      }),
    );
  });

  it("falls back to a trialing status when the org status is null", async () => {
    const { db } = buildExpiryDb([{ id: "org-1", subscriptionStatus: null }]);

    await runTrialExpiryTick(db, bindings);

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ subscription_status: "trialing" }),
      }),
    );
  });
});
