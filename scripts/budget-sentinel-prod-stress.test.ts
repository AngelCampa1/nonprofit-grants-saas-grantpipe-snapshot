import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUDGET_SENTINEL_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildBudgetSentinelRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/budget-sentinel-prod-stress.mjs";

describe("budget sentinel production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/budget-sentinel-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines generated overspend and underspend sentinel scenarios", () => {
    expect(BUDGET_SENTINEL_STRESS_SCENARIOS).toHaveLength(1);
    expect(BUDGET_SENTINEL_STRESS_SCENARIOS[0]).toMatchObject({
      key: "budget-risk-filtering",
      expected: {
        totals: {
          overspend: {
            near_limit: 1,
            projected_overspend: 1,
            over_budget: 1,
            total: 3,
          },
          underspend: {
            lapse_watch: 0,
            lapsing_soon: 1,
            lapsed_unspent: 1,
            total: 2,
          },
          totalAtRisk: 5,
        },
        overspendBands: ["near_limit", "over_budget", "projected_overspend"],
        underspendBands: ["lapsed_unspent", "lapsing_soon"],
        overspendFilterKinds: ["overspend"],
        underspendFilterKinds: ["underspend"],
        limitOneCount: 1,
        limitOneHighestRisk: true,
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

  it("evaluates the generated budget sentinel contract", () => {
    const scenario = BUDGET_SENTINEL_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      totals: {
        overspend: {
          near_limit: 1,
          projected_overspend: 1,
          over_budget: 1,
          total: 3,
        },
        underspend: {
          lapse_watch: 0,
          lapsing_soon: 1,
          lapsed_unspent: 1,
          total: 2,
        },
        totalAtRisk: 5,
      },
      overspendBands: ["near_limit", "over_budget", "projected_overspend"],
      underspendBands: ["lapsed_unspent", "lapsing_soon"],
      overspendFilterKinds: ["overspend"],
      underspendFilterKinds: ["underspend"],
      limitOneCount: 1,
      limitOneHighestRisk: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for totals, bands, filters, and limit ordering", () => {
    const scenario = BUDGET_SENTINEL_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      totals: {
        overspend: {
          near_limit: 0,
          projected_overspend: 1,
          over_budget: 1,
          total: 2,
        },
        underspend: {
          lapse_watch: 1,
          lapsing_soon: 0,
          lapsed_unspent: 1,
          total: 2,
        },
        totalAtRisk: 4,
      },
      overspendBands: ["over_budget"],
      underspendBands: ["lapsed_unspent"],
      overspendFilterKinds: ["underspend"],
      underspendFilterKinds: ["overspend"],
      limitOneCount: 2,
      limitOneHighestRisk: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "totals.overspend.near_limit expected 1, got 0",
      "totals.overspend.total expected 3, got 2",
      "totals.underspend.lapse_watch expected 0, got 1",
      "totals.underspend.lapsing_soon expected 1, got 0",
      "totals.totalAtRisk expected 5, got 4",
      "overspend bands returned over_budget instead of near_limit,over_budget,projected_overspend",
      "underspend bands returned lapsed_unspent instead of lapsed_unspent,lapsing_soon",
      "overspend filter returned underspend instead of overspend",
      "underspend filter returned overspend instead of underspend",
      "limit=1 returned 2 items instead of 1",
      "limit=1 did not return the highest-risk fixture item",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    const scenarios = BUDGET_SENTINEL_STRESS_SCENARIOS;
    expect(isCompleteRun([], scenarios)).toBe(false);
    expect(
      isCompleteRun(
        scenarios.map((scenario) => ({ key: scenario.key, pass: true })),
        scenarios,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_BUDGET_SENTINEL_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds budget sentinel routes through the exported route helper", () => {
    expect(buildBudgetSentinelRoute()).toBe("/api/grants/budget-sentinel");
    expect(buildBudgetSentinelRoute("kinds=overspend&limit=1")).toBe(
      "/api/grants/budget-sentinel?kinds=overspend&limit=1",
    );
  });

  it("uses budget, expense, restriction, auth, and artifact paths without leaking passwords", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/budget-sentinel-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "budget-sentinel"');
    expect(source).toContain('"/api/grants/budget-sentinel"');
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain('"/api/grants/funds"');
    expect(source).toContain("/budget/versions");
    expect(source).toContain("/budget/periods");
    expect(source).toContain("/budget/lines");
    expect(source).toContain("/budget/planned-expenses");
    expect(source).toContain("/budget/expenses/");
    expect(source).toContain('"/api/restrictions/terms"');
    expect(source).toContain("/additions");
    expect(source).toContain("/releases");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("Origin: APP_URL");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
