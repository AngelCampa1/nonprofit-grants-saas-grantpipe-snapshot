import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BILLING_SETTINGS_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildOrgRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/billing-settings-prod-stress.mjs";

describe("billing settings production stress harness", () => {
  it("defines the billing selection and summary scenario", () => {
    expect(BILLING_SETTINGS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "billing-selection-summary-and-ui",
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

  it("passes when billing summary, selection, debug, and UI checks are complete", () => {
    const result = evaluateScenarioResult({
      initialBillingStatus: 200,
      initialBillingHasTrialLifecycle: true,
      initialBillingHasSafeUrls: true,
      selectionStatus: 200,
      selectionPersisted: true,
      refreshedBillingStatus: 200,
      refreshedBillingReflectsSelection: true,
      checkoutValidationStatus: 400,
      checkoutValidationRejected: true,
      legacyTrialCheckoutStatus: 410,
      legacyTrialCheckoutRemoved: true,
      debugBillingStatus: 200,
      debugBillingListVisible: true,
      browserBillingVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak billing settings coverage", () => {
    const result = evaluateScenarioResult({
      initialBillingStatus: 500,
      initialBillingHasTrialLifecycle: false,
      initialBillingHasSafeUrls: false,
      selectionStatus: 500,
      selectionPersisted: false,
      refreshedBillingStatus: 500,
      refreshedBillingReflectsSelection: false,
      checkoutValidationStatus: 200,
      checkoutValidationRejected: false,
      legacyTrialCheckoutStatus: 200,
      legacyTrialCheckoutRemoved: false,
      debugBillingStatus: 500,
      debugBillingListVisible: false,
      browserBillingVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "initial billing summary expected HTTP 200, got 500",
      "initial billing summary did not include a billing lifecycle state",
      "initial billing summary did not include safe billing URLs",
      "billing selection expected HTTP 200, got 500",
      "billing selection did not persist plan and cycle",
      "refreshed billing summary expected HTTP 200, got 500",
      "refreshed billing summary did not reflect selected plan and cycle",
      "invalid checkout payload expected HTTP 400, got 200",
      "invalid checkout payload was not rejected",
      "legacy trial checkout expected HTTP 410, got 200",
      "legacy trial checkout was not removed",
      "debug billing list expected HTTP 200, got 500",
      "debug billing list was not visible",
      "browser billing settings page was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], BILLING_SETTINGS_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        BILLING_SETTINGS_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        BILLING_SETTINGS_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_BILLING_SETTINGS_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org token secret-token-123")).toBe(
      "Email [redacted-email] token [redacted-token]",
    );
  });

  it("builds org billing routes through exported helpers", () => {
    expect(buildOrgRoute("billing")).toBe("/api/org/billing");
    expect(buildOrgRoute("billing/selection")).toBe("/api/org/billing/selection");
    expect(buildOrgRoute("debug/billing")).toBe("/api/org/debug/billing");
  });

  it("uses billing, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/billing-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "billing-settings"');
    expect(source).toContain("`/api/org/${pathPart}`");
    expect(source).toContain('buildOrgRoute("billing")');
    expect(source).toContain('buildOrgRoute("billing/selection")');
    expect(source).toContain('buildOrgRoute("billing/checkout")');
    expect(source).toContain('"/api/billing/checkout/trial"');
    expect(source).toContain('buildOrgRoute("debug/billing")');
    expect(source).toContain("/app/settings/billing");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/billing-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
