import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEADLINE_RADAR_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildDeadlineRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
  totalsDelta,
} from "../e2e-adhoc/deadline-radar-prod-stress.mjs";

describe("deadline radar production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/deadline-radar-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines a generated cross-domain obligation scenario", () => {
    expect(DEADLINE_RADAR_STRESS_SCENARIOS).toHaveLength(1);
    expect(DEADLINE_RADAR_STRESS_SCENARIOS[0]).toMatchObject({
      key: "cross-domain-obligation-filtering",
      expected: {
        defaultTotals: {
          application_deadline: 1,
          reporting_requirement: 1,
          closeout_item: 1,
          restriction_release: 1,
          period_close: 1,
        },
        resolvedTotals: {
          application_deadline: 1,
          reporting_requirement: 2,
          closeout_item: 2,
          restriction_release: 2,
          period_close: 2,
        },
        kindFilterKinds: ["period_close", "reporting_requirement"],
        overdueKinds: ["reporting_requirement"],
        defaultExcludesResolved: true,
        resolvedIncludesResolved: true,
        narrowHorizonExcludesApplication: true,
        targetRoutesPreserved: true,
      },
    });
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

  it("evaluates the generated deadline radar contract", () => {
    const scenario = DEADLINE_RADAR_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      defaultTotals: {
        application_deadline: 1,
        reporting_requirement: 1,
        closeout_item: 1,
        restriction_release: 1,
        period_close: 1,
      },
      resolvedTotals: {
        application_deadline: 1,
        reporting_requirement: 2,
        closeout_item: 2,
        restriction_release: 2,
        period_close: 2,
      },
      defaultBands: {
        overdue: ["reporting_requirement"],
        this_week: ["closeout_item", "period_close"],
        this_month: ["restriction_release"],
        later: ["application_deadline"],
      },
      kindFilterKinds: ["period_close", "reporting_requirement"],
      overdueKinds: ["reporting_requirement"],
      defaultExcludesResolved: true,
      resolvedIncludesResolved: true,
      narrowHorizonExcludesApplication: true,
      targetRoutesPreserved: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("computes route totals deltas from the API totals field", () => {
    expect(
      totalsDelta(
        {
          application_deadline: 4,
          reporting_requirement: 3,
          closeout_item: 2,
          restriction_release: 1,
          period_close: 5,
        },
        {
          application_deadline: 5,
          reporting_requirement: 4,
          closeout_item: 3,
          restriction_release: 2,
          period_close: 6,
        },
      ),
    ).toEqual({
      application_deadline: 1,
      reporting_requirement: 1,
      closeout_item: 1,
      restriction_release: 1,
      period_close: 1,
    });
  });

  it("reports stable failures for totals, bands, filters, and targets", () => {
    const scenario = DEADLINE_RADAR_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      defaultTotals: {
        application_deadline: 0,
        reporting_requirement: 1,
        closeout_item: 1,
        restriction_release: 1,
        period_close: 1,
      },
      resolvedTotals: {
        application_deadline: 1,
        reporting_requirement: 1,
        closeout_item: 2,
        restriction_release: 2,
        period_close: 2,
      },
      defaultBands: {
        overdue: [],
        this_week: ["period_close"],
        this_month: [],
        later: [],
      },
      kindFilterKinds: ["period_close", "closeout_item"],
      overdueKinds: ["period_close"],
      defaultExcludesResolved: false,
      resolvedIncludesResolved: false,
      narrowHorizonExcludesApplication: false,
      targetRoutesPreserved: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "defaultTotals.application_deadline expected 1, got 0",
      "resolvedTotals.reporting_requirement expected 2, got 1",
      "overdue band missing reporting_requirement",
      "this_week band missing closeout_item",
      "this_month band missing restriction_release",
      "later band missing application_deadline",
      "kind filter returned closeout_item,period_close instead of period_close,reporting_requirement",
      "overdue filter returned period_close instead of reporting_requirement",
      "default radar included resolved obligations",
      "includeResolved radar did not include resolved obligations",
      "narrow horizon still included the later application deadline",
      "deadline targets did not preserve source routing",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    const scenarios = DEADLINE_RADAR_STRESS_SCENARIOS;
    expect(isCompleteRun([], scenarios)).toBe(false);
    expect(
      isCompleteRun(
        scenarios.map((scenario) => ({ key: scenario.key, pass: true })),
        scenarios,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_DEADLINE_RADAR_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds deadline radar routes through the exported route helper", () => {
    expect(buildDeadlineRoute()).toBe("/api/deadlines");
    expect(buildDeadlineRoute("horizonDays=180&includeResolved=true")).toBe(
      "/api/deadlines?horizonDays=180&includeResolved=true",
    );
  });

  it("uses deadline source endpoints and writes deadline radar artifacts", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/deadline-radar-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "deadline-radar"');
    expect(source).toContain('"/api/deadlines"');
    expect(source).toContain('"/api/grants/funds"');
    expect(source).toContain('"/api/restrictions/terms"');
    expect(source).toContain('"/api/accounting/periods"');
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("Origin: APP_URL");
    expect(source).toContain("reporting-requirements");
    expect(source).toContain("closeout-items");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
