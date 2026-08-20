import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNTING_ANOMALIES_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildAccountingRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/accounting-anomalies-prod-stress.mjs";

describe("accounting anomalies production stress harness", () => {
  it("defines the audit-ready empty feed and validation scenario", () => {
    expect(ACCOUNTING_ANOMALIES_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "audit-ready-empty-feed-validation-and-ui",
    ]);
  });

  it("refuses direct production execution outside the cleanup wrapper", () => {
    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {},
      }),
    ).toThrow(/cleanup/);

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

  it("passes when anomaly API gates, validation, and UI empty state behave", () => {
    const result = evaluateScenarioResult({
      auditReadyStatus: 200,
      auditReadySafeShape: true,
      auditReadyTotalsShape: true,
      filteredStatus: 200,
      filteredSafeShape: true,
      invalidClassStatus: 400,
      invalidClassRejected: true,
      invalidLimitStatus: 400,
      invalidLimitRejected: true,
      browserPageVisible: true,
      browserEmptyStateVisible: true,
      browserFilterChipsVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak anomaly coverage", () => {
    const result = evaluateScenarioResult({
      auditReadyStatus: 500,
      auditReadySafeShape: false,
      auditReadyTotalsShape: false,
      filteredStatus: 500,
      filteredSafeShape: false,
      invalidClassStatus: 200,
      invalidClassRejected: false,
      invalidLimitStatus: 200,
      invalidLimitRejected: false,
      browserPageVisible: false,
      browserEmptyStateVisible: false,
      browserFilterChipsVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "Audit-Ready anomaly feed expected HTTP 200, got 500",
      "Audit-Ready anomaly feed did not use the safe public anomaly shape",
      "Audit-Ready anomaly feed totals did not include every anomaly class",
      "Filtered anomaly feed expected HTTP 200, got 500",
      "Filtered anomaly feed did not use the safe public anomaly shape",
      "invalid anomaly class expected HTTP 400, got 200",
      "invalid anomaly class was not rejected",
      "invalid anomaly limit expected HTTP 400, got 200",
      "invalid anomaly limit was not rejected",
      "browser anomaly detector page was not visible",
      "browser empty anomaly state was not visible",
      "browser anomaly filter chips were not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], ACCOUNTING_ANOMALIES_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        ACCOUNTING_ANOMALIES_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        ACCOUNTING_ANOMALIES_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(
      selectedScenarios({
        GRANTPIPE_ACCOUNTING_ANOMALIES_STRESS_LIMIT: "invalid",
      }),
    ).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(
      redactForReport(
        'Email e2e-accounting-anomalies@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("builds accounting routes through exported helpers", () => {
    expect(buildAccountingRoute("anomalies")).toBe("/api/accounting/anomalies");
    expect(buildAccountingRoute("anomalies?classes=duplicate_donation")).toBe(
      "/api/accounting/anomalies?classes=duplicate_donation",
    );
  });

  it("uses cleanup, auth, billing, accounting setup, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/accounting-anomalies-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results"');
    expect(source).toContain('"live-e2e"');
    expect(source).toContain('"accounting-anomalies"');
    expect(source).toContain('buildAccountingRoute("anomalies")');
    expect(source).toContain("/api/org/billing/selection");
    expect(source).toContain("/api/org/settings");
    expect(source).toContain("/api/donors");
    expect(source).toContain("/app/accounting/anomalies");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/accounting-anomalies-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
