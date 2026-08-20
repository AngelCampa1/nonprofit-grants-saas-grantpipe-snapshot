import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_WIDGETS_BY_ROLE,
  dashboardPreferenceInputSchema,
  getAllowedDashboardWidgetsForRole,
  normalizeDashboardWidgetIds,
  overviewCalendarQuerySchema,
} from "./overview";

describe("overviewCalendarQuerySchema", () => {
  it("accepts YYYY-MM month filters", () => {
    const result = overviewCalendarQuerySchema.safeParse({
      month: "2026-04",
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed month filters", () => {
    const result = overviewCalendarQuerySchema.safeParse({
      month: "2026-4",
    });

    expect(result.success).toBe(false);
  });
});

describe("dashboard preference validators", () => {
  it("accepts a pinned dashboard widget list", () => {
    const result = dashboardPreferenceInputSchema.safeParse({
      pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown widget ids", () => {
    const result = dashboardPreferenceInputSchema.safeParse({
      pinnedWidgetIds: ["needs_attention", "made_up_widget"],
    });

    expect(result.success).toBe(false);
  });

  it("keeps auditor defaults free of donor widgets", () => {
    expect(DEFAULT_DASHBOARD_WIDGETS_BY_ROLE.auditor).not.toContain("donor_metrics");
    expect(DEFAULT_DASHBOARD_WIDGETS_BY_ROLE.auditor).not.toContain("donor_pipeline");
    expect(getAllowedDashboardWidgetsForRole("auditor")).not.toContain("donor_metrics");
    expect(getAllowedDashboardWidgetsForRole("auditor")).not.toContain("donor_pipeline");
  });

  it("deduplicates and filters pinned widgets by role", () => {
    expect(
      normalizeDashboardWidgetIds(
        ["donor_metrics", "grant_health", "grant_health", "fund_balances"],
        "auditor",
      ),
    ).toEqual(["grant_health", "fund_balances"]);
  });

  it("falls back to the role home when no allowed widgets remain", () => {
    expect(normalizeDashboardWidgetIds(["donor_metrics"], "auditor")).toEqual(
      DEFAULT_DASHBOARD_WIDGETS_BY_ROLE.auditor,
    );
  });
});
