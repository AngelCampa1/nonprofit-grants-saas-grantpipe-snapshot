import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DONOR_LAPSE_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildLapseRiskRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/donor-lapse-prod-stress.mjs";

describe("donor lapse production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/donor-lapse-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines one aggregate donor lapse risk matrix scenario", () => {
    expect(DONOR_LAPSE_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "donor-lapse-risk-matrix",
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

  it("evaluates the generated donor lapse contract", () => {
    const result = evaluateScenarioResult({
      expectedTotals: { lapsing: 0, at_risk: 1, lapsed: 1, total: 2 },
      expectedAtRiskContactIds: ["contact-lapsed", "contact-risk"],
      expectedLapsedContactIds: ["contact-lapsed"],
      returnedContactIds: ["contact-risk", "contact-lapsed"],
      returnedBands: ["at_risk", "lapsed"],
      lapsedFilterContactIds: ["contact-lapsed"],
      lapsedFilterBands: ["lapsed"],
      filteredTotalsStable: true,
      healthyControlExcluded: true,
      sortedByRisk: true,
      browserRowsVisible: true,
      detailBadgeVisible: true,
      detailBadgeLinksBack: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for donor lapse regressions", () => {
    const result = evaluateScenarioResult({
      expectedTotals: { lapsing: 0, at_risk: 0, lapsed: 1, total: 1 },
      expectedAtRiskContactIds: ["contact-lapsed", "contact-risk"],
      expectedLapsedContactIds: ["contact-lapsed"],
      returnedContactIds: ["contact-lapsed", "contact-healthy", "contact-healthy"],
      returnedBands: ["lapsed", "none"],
      lapsedFilterContactIds: ["contact-lapsed", "contact-risk"],
      lapsedFilterBands: ["lapsed", "at_risk"],
      filteredTotalsStable: false,
      healthyControlExcluded: false,
      sortedByRisk: false,
      browserRowsVisible: false,
      detailBadgeVisible: false,
      detailBadgeLinksBack: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "totals.at_risk expected 1, got 0",
      "totals.total expected 2, got 1",
      "risk feed donor ids returned contact-healthy,contact-lapsed instead of contact-lapsed,contact-risk",
      "risk feed donor ids expected 2 rows, got 3",
      "risk feed returned at-risk,healthy bands returned lapsed,none instead of at_risk,lapsed",
      "lapsed filter donor ids returned contact-lapsed,contact-risk instead of contact-lapsed",
      "lapsed filter donor ids expected 1 rows, got 2",
      "lapsed filter returned at_risk,lapsed instead of lapsed",
      "lapsed filter expected 1 rows, got 2",
      "filtered totals changed from full at-risk population",
      "healthy donor appeared in the at-risk feed",
      "risk feed was not sorted by score and recency",
      "browser at-risk rows or totals were not visible",
      "donor detail lapse badge was not visible",
      "donor detail lapse badge did not link back to /donors/at-risk",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    const scenarios = DONOR_LAPSE_STRESS_SCENARIOS;
    expect(isCompleteRun([], scenarios)).toBe(false);
    expect(
      isCompleteRun(
        scenarios.map((scenario) => ({ key: scenario.key, pass: true })),
        scenarios,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_DONOR_LAPSE_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds donor lapse routes through the exported route helper", () => {
    expect(buildLapseRiskRoute()).toBe("/api/donors/lapse-risk");
    expect(buildLapseRiskRoute("bands=lapsed")).toBe("/api/donors/lapse-risk?bands=lapsed");
  });

  it("uses donor, donation, browser, auth, and artifact paths without leaking passwords", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/donor-lapse-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "donor-lapse"');
    expect(source).toContain('"/api/donors/lapse-risk"');
    expect(source).toContain('"/api/donors"');
    expect(source).toContain("/donations");
    expect(source).toContain("/donors/at-risk");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("Origin: APP_URL");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
