import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OUTCOMES_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildGrantMetricEntriesRoute,
  buildGrantMetricsRoute,
  buildOutcomesRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/outcomes-prod-stress.mjs";

describe("outcomes production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/outcomes-prod-stress.mjs"), "utf8");

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("creates the disposable org through auth and onboarding APIs", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/outcomes-prod-stress.mjs"), "utf8");

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("defines the outcome indicator progress scenario", () => {
    expect(OUTCOMES_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "outcome-indicator-progress-summary",
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

  it("evaluates program and grant filtered outcome progress summaries", () => {
    const result = evaluateScenarioResult({
      programOutcomeIds: ["outcome-1"],
      grantOutcomeIds: ["outcome-1"],
      statusOutcomeIds: ["outcome-1"],
      summary: {
        totalIndicators: 3,
        onTrack: 1,
        behind: 1,
        missing: 1,
        atRisk: true,
      },
      indicatorStatuses: {
        "Youth served": "on_track",
        "Case plans complete": "behind",
        "Family follow-ups": "missing",
      },
      indicatorActualValues: {
        "Youth served": 120,
        "Case plans complete": 50,
        "Family follow-ups": null,
      },
      browserOutcomeVisible: true,
      browserOnTrackVisible: true,
      browserBehindVisible: true,
      browserMissingVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak outcome progress coverage", () => {
    const result = evaluateScenarioResult({
      programOutcomeIds: [],
      grantOutcomeIds: [],
      statusOutcomeIds: [],
      summary: {
        totalIndicators: 2,
        onTrack: 0,
        behind: 2,
        missing: 0,
        atRisk: false,
      },
      indicatorStatuses: {
        "Youth served": "behind",
        "Case plans complete": "on_track",
        "Family follow-ups": "on_track",
      },
      indicatorActualValues: {
        "Youth served": 80,
        "Case plans complete": 120,
        "Family follow-ups": 1,
      },
      browserOutcomeVisible: false,
      browserOnTrackVisible: false,
      browserBehindVisible: false,
      browserMissingVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "program filter did not return only the fixture outcome",
      "grant filter did not return only the fixture outcome",
      "status filter did not return only the fixture outcome",
      "summary totalIndicators expected 3, got 2",
      "summary onTrack expected 1, got 0",
      "summary behind expected 1, got 2",
      "summary missing expected 1, got 0",
      "summary atRisk expected true, got false",
      "Youth served status expected on_track, got behind",
      "Youth served actual value expected 120, got 80",
      "Case plans complete status expected behind, got on_track",
      "Case plans complete actual value expected 50, got 120",
      "Family follow-ups status expected missing, got on_track",
      "Family follow-ups actual value expected null, got 1",
      "browser outcome card was not visible",
      "browser on-track indicator was not visible",
      "browser behind indicator was not visible",
      "browser missing indicator was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], OUTCOMES_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        OUTCOMES_STRESS_SCENARIOS.map((scenario) => ({ key: scenario.key, pass: true })),
        OUTCOMES_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_OUTCOMES_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds outcome and metric routes through exported helpers", () => {
    expect(buildOutcomesRoute()).toBe("/api/outcomes");
    expect(buildOutcomesRoute("programId=program-1")).toBe("/api/outcomes?programId=program-1");
    expect(buildGrantMetricsRoute("grant-1")).toBe("/api/grants/grant-1/metrics");
    expect(buildGrantMetricEntriesRoute("grant-1", "metric-1")).toBe(
      "/api/grants/grant-1/metrics/metric-1/entries",
    );
  });

  it("uses program, grant metric, outcome, cleanup, auth, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/outcomes-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "outcomes"');
    expect(source).toContain('"/api/programs"');
    expect(source).toContain('"/api/outcomes"');
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain("/metrics");
    expect(source).toContain("/entries");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/signup?plan=audit_ready&cycle=monthly");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
