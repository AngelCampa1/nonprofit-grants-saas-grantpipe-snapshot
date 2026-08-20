import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_DATA_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildSampleDataRoute,
  buildSampleDataStatusRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/sample-data-prod-stress.mjs";

describe("sample data production stress harness", () => {
  it("defines the seed, conflict, clear lifecycle scenario", () => {
    expect(SAMPLE_DATA_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "sample-data-seed-conflict-clear",
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

  it("evaluates status, seed, conflict, clear, and browser coverage", () => {
    const result = evaluateScenarioResult({
      initialStatusCode: 200,
      initialSeeded: false,
      seedStatus: 200,
      seedRecordCountPositive: true,
      seededStatusCode: 200,
      seededStatusReflectsRows: true,
      secondSeedConflict: true,
      browserDashboardVisible: true,
      browserSampleBannerVisible: true,
      clearStatus: 200,
      clearRecordCountMatchesSeed: true,
      finalStatusCode: 200,
      finalStatusCleared: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak sample-data coverage", () => {
    const result = evaluateScenarioResult({
      initialStatusCode: 500,
      initialSeeded: true,
      seedStatus: 500,
      seedRecordCountPositive: false,
      seededStatusCode: 500,
      seededStatusReflectsRows: false,
      secondSeedConflict: false,
      browserDashboardVisible: false,
      browserSampleBannerVisible: false,
      clearStatus: 500,
      clearRecordCountMatchesSeed: false,
      finalStatusCode: 500,
      finalStatusCleared: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "initial sample-data status expected HTTP 200, got 500",
      "initial sample-data status was already seeded",
      "sample-data seed expected HTTP 200, got 500",
      "sample-data seed did not create any records",
      "seeded status expected HTTP 200, got 500",
      "seeded status did not reflect seeded records",
      "second seed did not return a conflict",
      "browser dashboard page was not visible",
      "browser sample-data banner was not visible",
      "sample-data clear expected HTTP 200, got 500",
      "sample-data clear did not report the seeded record count",
      "final sample-data status expected HTTP 200, got 500",
      "final sample-data status was not cleared",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], SAMPLE_DATA_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        SAMPLE_DATA_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        SAMPLE_DATA_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_SAMPLE_DATA_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc password Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] password [redacted-token]",
    );
  });

  it("builds sample-data routes through exported helpers", () => {
    expect(buildSampleDataRoute()).toBe("/api/sample-data");
    expect(buildSampleDataStatusRoute()).toBe("/api/sample-data/status");
  });

  it("uses sample-data, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/sample-data-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "sample-data"');
    expect(source).toContain('"/api/sample-data"');
    expect(source).toContain('"/api/sample-data/status"');
    expect(source).toContain("/app/dashboard");
    expect(source).toContain("sample data");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/sample-data-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
