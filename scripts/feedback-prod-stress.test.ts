import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FEEDBACK_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildActivityRoute,
  buildFeedbackRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/feedback-prod-stress.mjs";

describe("feedback production stress harness", () => {
  it("defines the authenticated feedback lifecycle scenario", () => {
    expect(FEEDBACK_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "authenticated-feedback-submission",
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

  it("evaluates feedback API, validation, activity, and browser coverage", () => {
    const result = evaluateScenarioResult({
      submitStatus: 200,
      submitSuccess: true,
      invalidCategoryRejected: true,
      emptyMessageRejected: true,
      activityStatus: 200,
      activityIncludesFeedback: true,
      activityCategorySafe: true,
      browserDashboardVisible: true,
      browserSupportLauncherVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak feedback coverage", () => {
    const result = evaluateScenarioResult({
      submitStatus: 500,
      submitSuccess: false,
      invalidCategoryRejected: false,
      emptyMessageRejected: false,
      activityStatus: 500,
      activityIncludesFeedback: false,
      activityCategorySafe: false,
      browserDashboardVisible: false,
      browserSupportLauncherVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "authenticated feedback expected HTTP 200, got 500",
      "authenticated feedback did not return success true",
      "invalid feedback category was not rejected",
      "empty feedback message was not rejected",
      "activity lookup expected HTTP 200, got 500",
      "activity feed did not include feedback.submitted",
      "feedback activity did not preserve the safe category field",
      "browser dashboard page was not visible",
      "browser support launcher was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], FEEDBACK_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        FEEDBACK_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        FEEDBACK_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_FEEDBACK_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc password Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] password [redacted-token]",
    );
  });

  it("builds feedback routes through exported helpers", () => {
    expect(buildFeedbackRoute()).toBe("/api/feedback");
    expect(buildActivityRoute()).toBe("/api/activity/org?entityType=feedback");
  });

  it("uses feedback, activity, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/feedback-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "feedback"');
    expect(source).toContain('"/api/feedback"');
    expect(source).toContain('"/api/activity/org?entityType=feedback"');
    expect(source).toContain("/app/dashboard");
    expect(source).toContain("browserSupportLauncherVisible");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/feedback-prod-stress.mjs"), "utf8");

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
