import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { errorHandler } from "../../middleware/error-handler";
import { captureBackgroundException } from "../../lib/sentry";
import type { AppEnv } from "../../types";
import { outcomeRoutes } from "./routes";

const analyticsCapture = vi.fn();

vi.mock("./service", () => ({
  createOutcome: vi.fn(),
  createOutcomeIndicator: vi.fn(),
  listOutcomes: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: analyticsCapture },
  })),
}));

vi.mock("../../lib/sentry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/sentry")>()),
  captureBackgroundException: vi.fn(),
}));

const service = await import("./service");

function buildApp(overrides: Partial<AppEnv["Variables"]> = {}) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1" } as never);
      c.set("memberRole", "admin");
      c.set("memberPermissions", null);
      c.set("orgSubscription", {
        planTier: "growth",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never);
      for (const [key, value] of Object.entries(overrides)) {
        c.set(key as never, value as never);
      }
      await next();
    })
    .route("/outcomes", outcomeRoutes);
}

describe("outcomeRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsCapture.mockResolvedValue({ id: "analytics-1" });
    vi.mocked(service.listOutcomes).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, hasNextPage: false },
    });
    vi.mocked(service.createOutcome).mockResolvedValue({
      id: "outcome-1",
      name: "Stable housing",
      status: "active",
    } as never);
    vi.mocked(service.createOutcomeIndicator).mockResolvedValue({
      id: "indicator-1",
      name: "Households housed",
    } as never);
  });

  it("lists outcomes for Growth orgs", async () => {
    const res = await buildApp().request("/outcomes?status=active&page=2");

    expect(res.status).toBe(200);
    expect(service.listOutcomes).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      query: expect.objectContaining({ status: "active", page: 2 }),
    });
  });

  it("blocks outcome measurement below Growth", async () => {
    const res = await buildApp({
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never,
    }).request("/outcomes");

    expect(res.status).toBe(402);
    expect(service.listOutcomes).not.toHaveBeenCalled();
  });

  it("creates outcomes and captures a safe analytics event", async () => {
    const res = await buildApp().request("/outcomes", {
      method: "POST",
      body: JSON.stringify({
        name: "Stable housing",
        statement: "Families stay housed.",
        status: "active",
        programId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(service.createOutcome).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      data: expect.objectContaining({ name: "Stable housing" }),
    });
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.outcomeGoalCreated,
      payload: {
        actorId: "user-1",
        surface: "api",
        has_program_link: true,
        has_grant_link: false,
        status: "active",
      },
    });
  });

  it("captures analytics failures to Sentry without failing outcome creation", async () => {
    analyticsCapture.mockRejectedValueOnce(new Error("posthog down"));

    const res = await buildApp().request("/outcomes", {
      method: "POST",
      body: JSON.stringify({
        name: "Stable housing",
        statement: "Families stay housed.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "outcomes",
      expect.objectContaining({
        telemetry: "analytics_capture",
        operation: "outcome_goal_created",
      }),
    );
  });

  it("creates indicators and captures safe metric linkage properties", async () => {
    const res = await buildApp().request("/outcomes/outcome-1/indicators", {
      method: "POST",
      body: JSON.stringify({
        name: "Households housed",
        indicatorType: "outcome",
        impactMetricId: "123e4567-e89b-12d3-a456-426614174000",
        funderDefined: true,
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.outcomeIndicatorCreated,
      payload: {
        actorId: "user-1",
        surface: "api",
        indicator_type: "outcome",
        has_metric_link: true,
        funder_defined: true,
      },
    });
  });
});
