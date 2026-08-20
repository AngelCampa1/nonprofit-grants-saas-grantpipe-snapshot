import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

const hoisted = vi.hoisted(() => ({
  mockDashboardGet: vi.fn(),
  mockDashboardPreferencesPut: vi.fn(),
  mockCalendarGet: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      overview: {
        dashboard: {
          $get: hoisted.mockDashboardGet,
          preferences: {
            $put: hoisted.mockDashboardPreferencesPut,
          },
        },
        calendar: {
          $get: hoisted.mockCalendarGet,
        },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

import {
  formatRiskSummary,
  useDashboardHomePreferenceMutation,
  useDashboardOverview,
  useCalendarMonth,
} from "./use-overview";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("use-overview hooks", () => {
  beforeEach(() => {
    hoisted.mockDashboardGet.mockReset();
    hoisted.mockDashboardPreferencesPut.mockReset();
    hoisted.mockCalendarGet.mockReset();
    hoisted.mockCaptureEvent.mockReset();
  });

  it("loads the dashboard overview payload", async () => {
    hoisted.mockDashboardGet.mockResolvedValue({
      json: async () => ({
        asOf: "2026-04-08T00:00:00.000Z",
        dashboardLayout: {
          pinnedWidgetIds: ["needs_attention", "grant_health"],
          source: "saved",
        },
        executiveSnapshot: {
          status: "urgent",
          statusLabel: "Action needed",
          statusDescription: "1 overdue grant and no board packet generated.",
          primaryMetricLabel: "Grant health",
          primaryMetricValue: "1 urgent",
          secondaryMetricLabel: "Upcoming deadlines",
          secondaryMetricValue: "1 next 30 days",
          priorityActions: [
            {
              id: "grant:grant-1",
              kind: "grant_risk",
              title: "STEM Access",
              description: "reporting requirement is overdue",
              severity: "urgent",
              dueDate: "2026-04-10T00:00:00.000Z",
              targetType: "grant",
              targetId: "grant-1",
            },
          ],
        },
        upcomingDeadlines: [
          {
            kind: "application_deadline",
            grantId: "grant-9",
            grantName: "Growth Fund",
            label: "Application deadline",
            dueDate: "2026-04-20T00:00:00.000Z",
            daysUntilDue: 5,
          },
        ],
        atRiskGrants: [
          {
            grantId: "grant-1",
            grantName: "STEM Access",
            healthState: "at_risk",
            riskReasons: [
              "spend_down_90",
              "reporting_requirement_overdue",
              "closeout_item_due_soon",
              "custom_reason",
            ],
          },
        ],
        complianceHealth: {
          overdueGrantCount: 1,
          atRiskGrantCount: 1,
          upcomingDeadlineCount: 1,
          restrictedFundWatchCount: 1,
          auditEvidenceEventCount: 2,
        },
        boardReportFreshness: {
          latestReportId: "report-1",
          latestReportTitle: "March board packet",
          latestGeneratedAt: "2026-04-01T12:00:00.000Z",
          daysSinceLatestReport: 6,
        },
        recentActivity: [],
        donorMetrics: {
          totalDonors: 10,
          totalGivingThisFY: 125000,
          newDonorsThisFY: 3,
          retentionRate: 0.625,
          previousFiscalYearGivingCents: 99000,
        },
        pipelineSummary: {
          donor: [{ stage: "prospect", count: 2 }],
          grants: [{ status: "application", count: 4 }],
        },
        fundBalancesOverview: [
          {
            fundId: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            currentBalanceCents: 250000,
          },
        ],
      }),
    });

    const { result } = renderHook(() => useDashboardOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(hoisted.mockDashboardGet).toHaveBeenCalledWith();
    expect(result.current.data).toEqual({
      asOf: "2026-04-08T00:00:00.000Z",
      dashboardLayout: {
        pinnedWidgetIds: ["needs_attention", "grant_health"],
        source: "saved",
      },
      executiveSnapshot: {
        status: "urgent",
        statusLabel: "Action needed",
        statusDescription: "1 overdue grant and no board packet generated.",
        primaryMetricLabel: "Grant health",
        primaryMetricValue: "1 urgent",
        secondaryMetricLabel: "Upcoming deadlines",
        secondaryMetricValue: "1 next 30 days",
        priorityActions: [
          {
            id: "grant:grant-1",
            kind: "grant_risk",
            title: "STEM Access",
            description: "reporting requirement is overdue",
            severity: "urgent",
            dueDate: "2026-04-10T00:00:00.000Z",
            targetType: "grant",
            targetId: "grant-1",
          },
        ],
      },
      upcomingDeadlines: [
        {
          id: "application_deadline:grant-9:2026-04-20T00:00:00.000Z:Application deadline",
          title: "Application deadline",
          date: "2026-04-20T00:00:00.000Z",
          kind: "application_deadline",
          grantId: "grant-9",
          grantName: "Growth Fund",
        },
      ],
      atRiskGrants: [
        {
          id: "grant-1",
          name: "STEM Access",
          health: "at_risk",
          reason: "Budget 90% spent · Reporting overdue · Closeout item due soon · Custom reason",
        },
      ],
      recentActivity: [],
      donorMetrics: {
        retentionRate: 62.5,
        currentFiscalYearGivingCents: 125000,
        previousFiscalYearGivingCents: 99000,
        newDonorCount: 3,
      },
      pipelineSummary: {
        donors: [{ label: "prospect", count: 2 }],
        grants: [{ label: "application", count: 4 }],
      },
      complianceHealth: {
        overdueGrantCount: 1,
        atRiskGrantCount: 1,
        upcomingDeadlineCount: 1,
        restrictedFundWatchCount: 1,
        auditEvidenceEventCount: 2,
      },
      boardReportFreshness: {
        latestReportId: "report-1",
        latestReportTitle: "March board packet",
        latestGeneratedAt: "2026-04-01T12:00:00.000Z",
        daysSinceLatestReport: 6,
      },
      fundBalances: [
        {
          fundId: "fund-1",
          fundName: "General Fund",
          fundType: "unrestricted",
          balanceCents: 250000,
        },
      ],
    });
  });

  it("maps empty dashboard collections and defaults missing previous giving to zero", async () => {
    hoisted.mockDashboardGet.mockResolvedValue({
      json: async () => ({
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
        recentActivity: [
          {
            id: "activity-1",
            entityType: "grant",
            entityId: "grant-1",
            action: "updated",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
        donorMetrics: {
          totalDonors: 2,
          totalGivingThisFY: 1000,
          newDonorsThisFY: 1,
          retentionRate: 0.5,
        },
        pipelineSummary: {
          donor: [
            { stage: "cultivation", count: 4 },
            { stage: "solicitation", count: 1 },
          ],
          grants: [
            { status: "application", count: 2 },
            { status: "submitted", count: 1 },
          ],
        },
        fundBalancesOverview: [
          {
            fundId: "fund-2",
            name: "Programs",
            type: "temporarily_restricted",
            currentBalanceCents: 5000,
          },
          {
            fundId: "fund-3",
            name: "Capital",
            type: "permanently_restricted",
            currentBalanceCents: 12000,
          },
        ],
      }),
    });

    const { result } = renderHook(() => useDashboardOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      asOf: "2026-04-08T00:00:00.000Z",
      dashboardLayout: {
        pinnedWidgetIds: [
          "executive_snapshot",
          "needs_attention",
          "quick_actions",
          "payments",
          "donor_metrics",
          "donor_pipeline",
          "grant_pipeline",
          "grant_health",
          "restriction_risk",
          "fund_balances",
          "reporting_readiness",
          "recent_activity",
        ],
        source: "default",
      },
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
      recentActivity: [
        {
          id: "activity-1",
          entityType: "grant",
          entityId: "grant-1",
          action: "updated",
          createdAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      donorMetrics: {
        retentionRate: 50,
        currentFiscalYearGivingCents: 1000,
        previousFiscalYearGivingCents: 0,
        newDonorCount: 1,
      },
      pipelineSummary: {
        donors: [
          { label: "cultivation", count: 4 },
          { label: "solicitation", count: 1 },
        ],
        grants: [
          { label: "application", count: 2 },
          { label: "submitted", count: 1 },
        ],
      },
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
      fundBalances: [
        {
          fundId: "fund-2",
          fundName: "Programs",
          fundType: "temporarily_restricted",
          balanceCents: 5000,
        },
        {
          fundId: "fund-3",
          fundName: "Capital",
          fundType: "permanently_restricted",
          balanceCents: 12000,
        },
      ],
    });
  });

  it("loads the calendar month payload with a month query", async () => {
    hoisted.mockCalendarGet.mockResolvedValue({
      json: async () => ({
        month: "2026-04",
        days: [
          {
            date: "2026-04-12",
            items: [
              {
                kind: "reporting_requirement",
                grantId: "grant-1",
                grantName: "Board report",
                label: "Board report",
                dueDate: "2026-04-12T00:00:00.000Z",
                daysUntilDue: 2,
                status: "upcoming",
                reportingRequirementId: "requirement-1",
              },
              {
                kind: "closeout_item",
                grantId: "grant-1",
                grantName: "Board report",
                label: "Closeout package",
                dueDate: "2026-04-12T00:00:00.000Z",
                daysUntilDue: 0,
                status: "completed",
                closeoutItemId: "closeout-1",
              },
              {
                kind: "application_deadline",
                grantId: "grant-2",
                grantName: "",
                label: "Application deadline",
                dueDate: "2026-04-18T00:00:00.000Z",
                daysUntilDue: -2,
                status: "overdue",
              },
            ],
          },
          {
            date: "2026-04-18",
            items: [
              {
                kind: "reporting_requirement",
                grantId: "grant-3",
                grantName: "Youth Arts",
                label: "Final report",
                dueDate: "2026-04-18T00:00:00.000Z",
                daysUntilDue: 0,
                status: "submitted",
                reportingRequirementId: "requirement-2",
              },
            ],
          },
        ],
      }),
    });

    const { result } = renderHook(() => useCalendarMonth("2026-04"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(hoisted.mockCalendarGet).toHaveBeenCalledWith({
      query: { month: "2026-04" },
    });
    expect(result.current.data).toEqual({
      month: "2026-04",
      items: [
        {
          id: "requirement-1",
          title: "Board report",
          date: "2026-04-12T00:00:00.000Z",
          status: "upcoming",
          kind: "reporting_requirement",
          grantId: "grant-1",
          grantName: "Board report",
        },
        {
          id: "closeout-1",
          title: "Closeout package",
          date: "2026-04-12T00:00:00.000Z",
          status: "completed",
          kind: "closeout_item",
          grantId: "grant-1",
          grantName: "Board report",
        },
        {
          id: "application_deadline:grant-2:2026-04-18T00:00:00.000Z:Application deadline",
          title: "Application deadline",
          date: "2026-04-18T00:00:00.000Z",
          status: "overdue",
          kind: "application_deadline",
          grantId: "grant-2",
          grantName: "",
        },
        {
          id: "requirement-2",
          title: "Final report",
          date: "2026-04-18T00:00:00.000Z",
          status: "submitted",
          kind: "reporting_requirement",
          grantId: "grant-3",
          grantName: "Youth Arts",
        },
      ],
    });
  });

  it("saves dashboard home preferences", async () => {
    hoisted.mockDashboardPreferencesPut.mockResolvedValue({
      json: async () => ({
        pinnedWidgetIds: ["needs_attention", "fund_balances"],
        source: "saved",
      }),
    });

    const { result } = renderHook(() => useDashboardHomePreferenceMutation(), {
      wrapper: createWrapper(),
    });

    const saved = await result.current.mutateAsync({
      pinnedWidgetIds: ["needs_attention", "fund_balances"],
    });

    expect(hoisted.mockDashboardPreferencesPut).toHaveBeenCalledWith({
      json: { pinnedWidgetIds: ["needs_attention", "fund_balances"] },
    });
    expect(saved).toEqual({
      pinnedWidgetIds: ["needs_attention", "fund_balances"],
      source: "saved",
    });
  });

  it("fires a dashboardHomeCustomized analytics event on successful preference save", async () => {
    hoisted.mockDashboardPreferencesPut.mockResolvedValue({
      json: async () => ({
        pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
        source: "saved",
      }),
    });

    const { result } = renderHook(() => useDashboardHomePreferenceMutation(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
    });

    await waitFor(() => {
      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.dashboardHomeCustomized,
        { pinned_count: 3 },
      );
    });
  });

  it("surfaces dashboard API failures as query errors", async () => {
    hoisted.mockDashboardGet.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Overview metrics unavailable",
      }),
    });

    const { result } = renderHook(() => useDashboardOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe("Overview metrics unavailable");
  });
});

describe("formatRiskSummary", () => {
  it("returns empty string for empty reasons array", () => {
    expect(formatRiskSummary([])).toBe("");
  });

  it("formats a single due_soon reporting requirement", () => {
    expect(formatRiskSummary(["reporting_requirement_due_soon"])).toBe("Reporting due soon");
  });

  it("collapses overdue + due_soon for the same subject", () => {
    expect(
      formatRiskSummary(["reporting_requirement_due_soon", "reporting_requirement_overdue"]),
    ).toBe("Reporting overdue and due soon");
  });

  it("formats a single overdue reporting requirement", () => {
    expect(formatRiskSummary(["reporting_requirement_overdue"])).toBe("Reporting overdue");
  });

  it("formats a spend_down token as budget percentage", () => {
    expect(formatRiskSummary(["spend_down_80"])).toBe("Budget 80% spent");
  });

  it("puts budget first then subjects joined by ·", () => {
    expect(formatRiskSummary(["reporting_requirement_overdue", "spend_down_80"])).toBe(
      "Budget 80% spent · Reporting overdue",
    );
  });

  it("capitalizes non-reporting subjects", () => {
    expect(formatRiskSummary(["closeout_item_due_soon"])).toBe("Closeout item due soon");
  });

  it("handles bare unrecognized tokens as capitalized words", () => {
    expect(formatRiskSummary(["custom_reason"])).toBe("Custom reason");
  });

  it("joins budget, subjects, and bare concerns in order", () => {
    expect(
      formatRiskSummary([
        "spend_down_90",
        "reporting_requirement_overdue",
        "closeout_item_due_soon",
        "custom_reason",
      ]),
    ).toBe("Budget 90% spent · Reporting overdue · Closeout item due soon · Custom reason");
  });
});
