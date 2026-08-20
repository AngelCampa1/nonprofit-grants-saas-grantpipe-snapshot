import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OVERVIEW_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildCalendarRoute,
  buildDashboardPreferencesRoute,
  buildDashboardRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/overview-prod-stress.mjs";

describe("overview production stress harness", () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  it("defines the dashboard overview lifecycle scenario", () => {
    expect(OVERVIEW_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "dashboard-overview-preferences-calendar",
    ]);
  });

  it("refuses direct production execution outside the cleanup wrapper", () => {
    expect(() => assertProductionWrapper({ appUrl: "https://app.grantpipe.com", env: {} })).toThrow(
      /cleanup/,
    );
    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {
          GRANTPIPE_LIVE_E2E_WRAPPER: "1",
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "390138",
        },
      }),
    ).not.toThrow();
  });

  it("evaluates dashboard, preference, calendar, browser, and cleanup coverage", () => {
    const result = evaluateScenarioResult({
      dashboardStatus: 200,
      dashboardHasAsOf: true,
      dashboardDefaultLayoutSource: "default",
      dashboardHasExecutiveSnapshot: true,
      dashboardHasDonorMetrics: true,
      preferencesStatus: 200,
      preferencesSource: "saved",
      preferencesPinnedWidgets: ["executive_snapshot", "agenda", "recent_activity"],
      refreshedLayoutSource: "saved",
      refreshedPinnedWidgets: ["executive_snapshot", "agenda", "recent_activity"],
      invalidPreferencesRejected: true,
      calendarStatus: 200,
      calendarMonth: currentMonth,
      calendarHasDays: true,
      calendarTotalsPresent: true,
      invalidCalendarRejected: true,
      browserDashboardVisible: true,
      browserExecutiveSnapshotVisible: true,
      browserCustomizeVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak overview coverage", () => {
    const result = evaluateScenarioResult({
      dashboardStatus: 500,
      dashboardHasAsOf: false,
      dashboardDefaultLayoutSource: "saved",
      dashboardHasExecutiveSnapshot: false,
      dashboardHasDonorMetrics: false,
      preferencesStatus: 500,
      preferencesSource: "default",
      preferencesPinnedWidgets: [],
      refreshedLayoutSource: "default",
      refreshedPinnedWidgets: [],
      invalidPreferencesRejected: false,
      calendarStatus: 500,
      calendarMonth: "wrong",
      calendarHasDays: false,
      calendarTotalsPresent: false,
      invalidCalendarRejected: false,
      browserDashboardVisible: false,
      browserExecutiveSnapshotVisible: false,
      browserCustomizeVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "dashboard overview expected HTTP 200, got 500",
      "dashboard overview did not include an asOf timestamp",
      "initial dashboard layout did not use the default source",
      "dashboard overview did not include the executive snapshot",
      "dashboard overview did not include donor metrics",
      "dashboard preferences expected HTTP 200, got 500",
      "dashboard preferences did not return saved source",
      "dashboard preferences did not preserve pinned widgets",
      "refreshed dashboard layout did not use saved source",
      "refreshed dashboard layout did not include saved widgets",
      "invalid dashboard preferences were not rejected",
      "calendar overview expected HTTP 200, got 500",
      "calendar overview returned the wrong month",
      "calendar overview did not include days",
      "calendar overview did not include totals",
      "invalid calendar month was not rejected",
      "browser dashboard page was not visible",
      "browser executive snapshot was not visible",
      "browser customize control was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], OVERVIEW_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        OVERVIEW_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        OVERVIEW_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_OVERVIEW_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc token Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] token [redacted-token]",
    );
  });

  it("builds overview routes through exported helpers", () => {
    expect(buildDashboardRoute()).toBe("/api/overview/dashboard");
    expect(buildDashboardPreferencesRoute()).toBe("/api/overview/dashboard/preferences");
    expect(buildCalendarRoute("month=2026-06")).toBe("/api/overview/calendar?month=2026-06");
  });

  it("uses overview, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/overview-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "overview"');
    expect(source).toContain('"/api/overview/dashboard"');
    expect(source).toContain('"/api/overview/dashboard/preferences"');
    expect(source).toContain('"/api/overview/calendar"');
    expect(source).toContain('"/api/onboarding/complete"');
    expect(source).toContain("/app/dashboard");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/overview-prod-stress.mjs"), "utf8");

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
