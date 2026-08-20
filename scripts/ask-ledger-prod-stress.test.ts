import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ASK_LEDGER_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildAskLedgerRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/ask-ledger-prod-stress.mjs";

describe("ask ledger production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/ask-ledger-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines restricted fund, budget risk, and unsupported intents", () => {
    expect(ASK_LEDGER_STRESS_SCENARIOS.map((scenario) => scenario.intent)).toEqual([
      "restricted_fund_balance",
      "grant_budget_risk",
      "unsupported",
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

  it("evaluates grounded answers and citations", () => {
    const scenario = ASK_LEDGER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      confidence: "high",
      answerIncludes: true,
      citationHrefPresent: true,
      safeguardPresent: true,
      noFabricatedNumbers: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak grounding", () => {
    const scenario = ASK_LEDGER_STRESS_SCENARIOS[2]!;
    const result = evaluateScenarioResult(scenario, {
      confidence: "high",
      answerIncludes: false,
      citationHrefPresent: false,
      safeguardPresent: false,
      noFabricatedNumbers: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "unsupported confidence expected low, got high",
      "unsupported answer was missing expected marker",
      "unsupported answer was missing expected citation href",
      "unsupported answer was missing safeguards",
      "unsupported answer contained a fabricated fixture number",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], ASK_LEDGER_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        ASK_LEDGER_STRESS_SCENARIOS.map((scenario) => ({ key: scenario.key, pass: true })),
        ASK_LEDGER_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_ASK_LEDGER_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds ask ledger route through the exported route helper", () => {
    expect(buildAskLedgerRoute()).toBe("/api/ask-ledger/ask");
  });

  it("uses ledger, fixture, outer-cleanup-safe auth, and artifact paths without leaking passwords", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/ask-ledger-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "ask-ledger"');
    expect(source).toContain('"/api/ask-ledger/ask"');
    expect(source).toContain('"/api/restrictions/reports/rollforward"');
    expect(source).toContain('"/api/grants/budget-sentinel"');
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("Origin: APP_URL");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
