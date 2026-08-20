import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { onboardingRoutes } from "./routes";

// ---------------------------------------------------------------------------
// Mock integrations
// ---------------------------------------------------------------------------

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

const { mockRecordLifecycleEvent } = vi.hoisted(() => ({
  mockRecordLifecycleEvent: vi.fn(),
}));

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock service module
// ---------------------------------------------------------------------------

vi.mock("./service", () => ({
  getOnboardingStatus: vi.fn(),
  completeOnboarding: vi.fn(),
  markOnboardingCompleted: vi.fn(),
}));

vi.mock("../org/service", () => ({
  saveBillingSelection: vi.fn(),
}));

vi.mock("../leads/sequencer", () => ({
  recordLifecycleEvent: mockRecordLifecycleEvent,
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

import { getOnboardingStatus, completeOnboarding, markOnboardingCompleted } from "./service";
import { saveBillingSelection } from "../org/service";

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

const mockOrgId = "org-test-1";

function buildApp(role: "admin" | "editor" | "viewer" = "admin") {
  return new Hono<AppEnv>()
    .use("/onboarding/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", mockOrgId);
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/onboarding", onboardingRoutes);
}

// ---------------------------------------------------------------------------
// GET /onboarding/status
// ---------------------------------------------------------------------------

describe("GET /onboarding/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with { completed: false } when onboarding not done", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ completed: false });

    const app = buildApp();
    const res = await app.request("/onboarding/status");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ completed: false });
    expect(getOnboardingStatus).toHaveBeenCalledWith(expect.anything(), mockOrgId);
  });

  it("returns 200 with { completed: true } when onboarding is done", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ completed: true });

    const app = buildApp();
    const res = await app.request("/onboarding/status");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ completed: true });
  });
});

// ---------------------------------------------------------------------------
// PATCH /onboarding
// ---------------------------------------------------------------------------

describe("PATCH /onboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
    mockRecordLifecycleEvent.mockResolvedValue(undefined);
  });

  const validPayload = {
    orgName: "Helping Hands Nonprofit",
    fiscalYearStartMonth: 4,
    timezone: "America/New_York",
  };

  const updatedOrg = {
    id: mockOrgId,
    name: "Helping Hands Nonprofit",
    fiscalYearStartMonth: 4,
    timezone: "America/New_York",
    onboardingCompleted: false,
  };

  it("returns 200 with updated org on valid payload", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(updatedOrg);
    expect(completeOnboarding).toHaveBeenCalledWith(expect.anything(), {
      orgId: mockOrgId,
      orgName: validPayload.orgName,
      fiscalYearStartMonth: validPayload.fiscalYearStartMonth,
      timezone: validPayload.timezone,
    });
  });

  it("returns 400 when orgName is missing", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYearStartMonth: 4, timezone: "America/New_York" }),
    });

    expect(res.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 400 when fiscalYearStartMonth is out of range", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "Test Org", fiscalYearStartMonth: 13, timezone: "UTC" }),
    });

    expect(res.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 400 when timezone is empty string", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "Test Org", fiscalYearStartMonth: 1, timezone: "" }),
    });

    expect(res.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not JSON", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 403 when editor attempts PATCH /onboarding", async () => {
    const app = buildApp("editor");
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 403 when viewer attempts PATCH /onboarding", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("does not capture onboarding_completed analytics after successful PATCH", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);
    mockCaptureAnalytics.mockResolvedValue(undefined);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("passes onboardingGoal to completeOnboarding when provided", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);

    const app = buildApp();
    await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, onboardingGoal: "compliance" }),
    });

    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onboardingGoal: "compliance" }),
    );
  });

  it("persists the selected trial plan during onboarding setup", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);
    vi.mocked(saveBillingSelection).mockResolvedValue({
      planTier: "growth",
      billingCycle: "annual",
    } as never);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        planTier: "growth",
        billingCycle: "annual",
      }),
    });

    expect(res.status).toBe(200);
    expect(saveBillingSelection).toHaveBeenCalledWith(expect.anything(), {
      orgId: mockOrgId,
      actorId: "user-1",
      data: {
        planTier: "growth",
        billingCycle: "annual",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: mockOrgId,
      eventName: ANALYTICS_EVENTS.billingSelectionSaved,
      payload: {
        actorId: "user-1",
        planTier: "growth",
        billingCycle: "annual",
      },
    });
  });

  it("defaults onboarding plan selection to annual billing when cycle is omitted", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);
    vi.mocked(saveBillingSelection).mockResolvedValue({
      planTier: "starter",
      billingCycle: "annual",
    } as never);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        planTier: "starter",
      }),
    });

    expect(res.status).toBe(200);
    expect(saveBillingSelection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: {
          planTier: "starter",
          billingCycle: "annual",
        },
      }),
    );
  });

  it("rejects invalid onboarding plan selections", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        planTier: "enterprise",
      }),
    });

    expect(res.status).toBe(400);
    expect(saveBillingSelection).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("does NOT fire onboarding_goal_selected server-side even when goal provided (client owns that event)", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, onboardingGoal: "grants" }),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
    const goalCalls = mockCaptureAnalytics.mock.calls.filter(
      (call) =>
        (call[0] as { eventName: string }).eventName === ANALYTICS_EVENTS.onboardingGoalSelected,
    );
    expect(goalCalls).toHaveLength(0);
  });

  it("does NOT fire onboarding_goal_selected when goal omitted", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);

    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
    const goalCalls = mockCaptureAnalytics.mock.calls.filter(
      (call) =>
        (call[0] as { eventName: string }).eventName === ANALYTICS_EVENTS.onboardingGoalSelected,
    );
    expect(goalCalls).toHaveLength(0);
  });

  it("records onboarding completion in Sequencer with user and org context", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      org: {
        ...updatedOrg,
        onboardingCompleted: true,
        onboardingGoal: "compliance",
      },
      wasAlreadyComplete: false,
    } as never);

    const app = buildApp();
    const res = await app.request("/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(mockRecordLifecycleEvent.mock.calls[0]?.[1]).toMatchObject({
      email: "test@example.com",
      event: ANALYTICS_EVENTS.onboardingCompleted,
      idempotencyKey: "onboarding_completed:grantpipe:org:org-test-1",
      properties: {
        orgId: "org-test-1",
        userId: "user-1",
        onboardingGoal: "compliance",
      },
    });
  });

  it("attaches Sequencer lifecycle recording to the Worker waitUntil context", async () => {
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      org: {
        ...updatedOrg,
        onboardingCompleted: true,
      },
      wasAlreadyComplete: false,
    } as never);
    const waitUntil = vi.fn();

    const app = buildApp();
    const res = await app.request(
      "/onboarding/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      undefined,
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it("does not fail onboarding when Sequencer lifecycle recording fails", async () => {
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      org: {
        ...updatedOrg,
        onboardingCompleted: true,
      },
      wasAlreadyComplete: false,
    } as never);
    mockRecordLifecycleEvent.mockRejectedValue(
      new Error("Sequencer onboarding_completed event failed with email test@example.com"),
    );

    const app = buildApp();
    const res = await app.request("/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...updatedOrg, onboardingCompleted: true });
    await Promise.resolve();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Sequencer onboarding_completed event failed" }),
      "onboarding",
      {
        step: "sequencer-onboarding-completed",
        org_id: "org-test-1",
      },
    );
    const capturedError = mockCaptureBackgroundException.mock.calls[0]?.[0] as Error | undefined;
    expect(capturedError?.message).not.toContain("test@example.com");
  });

  it("does not pass onboardingGoal to completeOnboarding when omitted", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(updatedOrg as never);

    const app = buildApp();
    await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const callArg = vi.mocked(completeOnboarding).mock.calls[0]![1] as Record<string, unknown>;
    expect(!("onboardingGoal" in callArg)).toBe(true);
  });

  it("returns 400 for invalid onboardingGoal value", async () => {
    const app = buildApp();
    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, onboardingGoal: "invalid" }),
    });

    expect(res.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("marks onboarding completed and captures onboarding_completed on first action", async () => {
    const completedOrg = { ...updatedOrg, onboardingCompleted: true, onboardingGoal: "grants" };
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      org: completedOrg,
      wasAlreadyComplete: false,
    } as never);

    const app = buildApp();
    const res = await app.request("/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(completedOrg);
    expect(markOnboardingCompleted).toHaveBeenCalledWith(expect.anything(), mockOrgId);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: mockOrgId,
      eventName: ANALYTICS_EVENTS.onboardingCompleted,
      payload: { actorId: "user-1" },
    });
  });

  it("does not recapture analytics or lifecycle events for repeated completion calls", async () => {
    const completedOrg = { ...updatedOrg, onboardingCompleted: true, onboardingGoal: "grants" };
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      org: completedOrg,
      wasAlreadyComplete: true,
    } as never);
    const waitUntil = vi.fn();

    const app = buildApp();
    const res = await app.request(
      "/onboarding/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      undefined,
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(completedOrg);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
    expect(mockRecordLifecycleEvent).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
