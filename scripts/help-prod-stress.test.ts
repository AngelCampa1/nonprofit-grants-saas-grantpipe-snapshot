import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HELP_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildGuideProgressRoute,
  buildHelpProgressRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/help-prod-stress.mjs";

describe("help production stress harness", () => {
  it("defines the guide progress lifecycle scenario", () => {
    expect(HELP_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "guide-progress-help-center-lifecycle",
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

  it("evaluates help guide progress, validation, browser, and cleanup coverage", () => {
    const result = evaluateScenarioResult({
      initialListStatus: 200,
      initialListEmpty: true,
      updateStatus: 200,
      updatedGuideKey: "open_pdf_report",
      updatedStatus: "completed",
      updatedLastStep: "downloaded-pdf",
      completedAtPresent: true,
      refreshedListContainsGuide: true,
      refreshedListPreservesStatus: true,
      dismissStatus: 200,
      dismissedAtPresent: true,
      invalidGuideRejected: true,
      invalidStatusRejected: true,
      browserHelpVisible: true,
      browserProductTourVisible: true,
      browserGuideVisible: true,
      browserSearchVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak help progress coverage", () => {
    const result = evaluateScenarioResult({
      initialListStatus: 500,
      initialListEmpty: false,
      updateStatus: 500,
      updatedGuideKey: "wrong",
      updatedStatus: "in_progress",
      updatedLastStep: "wrong",
      completedAtPresent: false,
      refreshedListContainsGuide: false,
      refreshedListPreservesStatus: false,
      dismissStatus: 500,
      dismissedAtPresent: false,
      invalidGuideRejected: false,
      invalidStatusRejected: false,
      browserHelpVisible: false,
      browserProductTourVisible: false,
      browserGuideVisible: false,
      browserSearchVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "initial guide progress expected HTTP 200, got 500",
      "initial guide progress list was not empty for the disposable org",
      "guide progress update expected HTTP 200, got 500",
      "guide progress update returned the wrong guide key",
      "guide progress update did not save completed status",
      "guide progress update did not save the last step",
      "completed guide progress did not include completedAt",
      "refreshed guide progress list did not include the guide",
      "refreshed guide progress list did not preserve completed status",
      "guide progress dismissal expected HTTP 200, got 500",
      "dismissed guide progress did not include dismissedAt",
      "invalid guide key was not rejected",
      "invalid guide status was not rejected",
      "browser help page was not visible",
      "browser product tour was not visible",
      "browser guide card was not visible",
      "browser help search was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], HELP_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        HELP_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        HELP_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_HELP_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc token Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] token [redacted-token]",
    );
  });

  it("builds help routes through exported helpers", () => {
    expect(buildHelpProgressRoute()).toBe("/api/help/progress");
    expect(buildGuideProgressRoute("open_pdf_report")).toBe("/api/help/progress/open_pdf_report");
  });

  it("uses help, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/help-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "help"');
    expect(source).toContain('"/api/help/progress"');
    expect(source).toContain('"/api/onboarding/complete"');
    expect(source).toContain("/app/help");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/help-prod-stress.mjs"), "utf8");

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
