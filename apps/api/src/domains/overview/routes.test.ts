import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { overviewRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn().mockResolvedValue({ id: "analytics-1" }),
}));

vi.mock("./service", () => ({
  getDashboardOverview: vi.fn(),
  getCalendarOverview: vi.fn(),
  upsertDashboardHomePreference: vi.fn(),
}));
vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockCaptureAnalytics },
  })),
}));

import {
  getCalendarOverview,
  getDashboardOverview,
  upsertDashboardHomePreference,
} from "./service";

function buildApp(memberRole: AppEnv["Variables"]["memberRole"] = "viewer") {
  return new Hono<AppEnv>()
    .use("/overview/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "user@example.com", name: "User" });
      c.set("session", { id: "session-1", userId: "user-1" });
      c.set("memberRole", memberRole);
      await next();
    })
    .route("/overview", overviewRoutes);
}

describe("overview routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns the dashboard payload", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      asOf: "2026-04-08T00:00:00.000Z",
      executiveSnapshot: {
        status: "clear",
        statusLabel: "Under control",
        statusDescription: "No urgent grant or reporting work needs attention.",
        primaryMetricLabel: "Grant health",
        primaryMetricValue: "0 urgent",
        secondaryMetricLabel: "Upcoming deadlines",
        secondaryMetricValue: "0 next 30 days",
        priorityActions: [],
      },
      upcomingDeadlines: [],
      atRiskGrants: [],
      complianceHealth: {
        overdueGrantCount: 0,
        atRiskGrantCount: 0,
        upcomingDeadlineCount: 0,
        restrictedFundWatchCount: 0,
        auditEvidenceEventCount: 0,
      },
      boardReportFreshness: {
        latestReportId: null,
        latestReportTitle: null,
        latestGeneratedAt: null,
        daysSinceLatestReport: null,
      },
      recentActivity: [],
      donorMetrics: {
        totalDonors: 0,
        totalGivingThisFY: 0,
        previousFiscalYearGivingCents: 0,
        newDonorsThisFY: 0,
        retentionRate: 0,
      },
      pipelineSummary: {
        donor: [],
        grants: [],
      },
      fundBalancesOverview: [],
      dashboardLayout: {
        pinnedWidgetIds: ["executive_snapshot"],
        source: "default",
      },
    });

    const app = buildApp();
    const res = await app.request("/overview/dashboard");

    expect(res.status).toBe(200);
    expect(getDashboardOverview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        memberRole: "viewer",
      }),
    );
  });

  it("suppresses donor data for auditor dashboard requests", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      asOf: "2026-04-08T00:00:00.000Z",
      executiveSnapshot: {
        status: "clear",
        statusLabel: "Under control",
        statusDescription: "No urgent grant or reporting work needs attention.",
        primaryMetricLabel: "Grant health",
        primaryMetricValue: "0 urgent",
        secondaryMetricLabel: "Upcoming deadlines",
        secondaryMetricValue: "0 next 30 days",
        priorityActions: [],
      },
      upcomingDeadlines: [],
      atRiskGrants: [],
      complianceHealth: {
        overdueGrantCount: 0,
        atRiskGrantCount: 0,
        upcomingDeadlineCount: 0,
        restrictedFundWatchCount: 0,
        auditEvidenceEventCount: 0,
      },
      boardReportFreshness: {
        latestReportId: null,
        latestReportTitle: null,
        latestGeneratedAt: null,
        daysSinceLatestReport: null,
      },
      recentActivity: [],
      donorMetrics: {
        totalDonors: 0,
        totalGivingThisFY: 0,
        previousFiscalYearGivingCents: 0,
        newDonorsThisFY: 0,
        retentionRate: 0,
      },
      pipelineSummary: {
        donor: [],
        grants: [],
      },
      fundBalancesOverview: [],
      dashboardLayout: {
        pinnedWidgetIds: ["grant_health"],
        source: "default",
      },
    });

    const app = buildApp("auditor");
    const res = await app.request("/overview/dashboard");

    expect(res.status).toBe(200);
    expect(getDashboardOverview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        memberRole: "auditor",
        includeDonorData: false,
      }),
    );
  });

  it("persists dashboard home preferences for the current member", async () => {
    vi.mocked(upsertDashboardHomePreference).mockResolvedValue({
      pinnedWidgetIds: ["needs_attention", "grant_health"],
      source: "saved",
    });

    const app = buildApp("editor");
    const res = await app.request("/overview/dashboard/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pinnedWidgetIds: ["needs_attention", "grant_health"],
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pinnedWidgetIds: ["needs_attention", "grant_health"],
      source: "saved",
    });
    expect(upsertDashboardHomePreference).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      userId: "user-1",
      memberRole: "editor",
      pinnedWidgetIds: ["needs_attention", "grant_health"],
    });
  });

  it("captures a dashboardHomeCustomized analytics event on successful PUT preferences", async () => {
    vi.mocked(upsertDashboardHomePreference).mockResolvedValue({
      pinnedWidgetIds: ["needs_attention", "grant_health"],
      source: "saved",
    });

    const app = buildApp("editor");
    const res = await app.request("/overview/dashboard/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pinnedWidgetIds: ["needs_attention", "grant_health"],
      }),
    });

    expect(res.status).toBe(200);
    // Flush promise microtasks so swallowCapture's void promise resolves
    await Promise.resolve();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.dashboardHomeCustomized,
        payload: expect.objectContaining({
          actorId: "user-1",
          member_role: "editor",
          pinned_count: 2,
        }),
      }),
    );
  });

  it("rejects malformed dashboard home preferences", async () => {
    const app = buildApp();
    const res = await app.request("/overview/dashboard/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pinnedWidgetIds: ["needs_attention", "not-real"],
      }),
    });

    expect(res.status).toBe(400);
    expect(upsertDashboardHomePreference).not.toHaveBeenCalled();
  });

  it("returns the calendar payload for a month", async () => {
    vi.mocked(getCalendarOverview).mockResolvedValue({
      month: "2026-04",
      days: [],
      totals: {
        applicationDeadlines: 0,
        reportingRequirements: 0,
        closeoutItems: 0,
      },
    });

    const app = buildApp();
    const res = await app.request("/overview/calendar?month=2026-04");

    expect(res.status).toBe(200);
    expect(getCalendarOverview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        month: "2026-04",
      }),
    );
  });

  it("rejects malformed month filters", async () => {
    const app = buildApp();
    const res = await app.request("/overview/calendar?month=2026-4");

    expect(res.status).toBe(400);
  });
});
