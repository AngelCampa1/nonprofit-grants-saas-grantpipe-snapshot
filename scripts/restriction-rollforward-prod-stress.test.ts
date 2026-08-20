import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RESTRICTION_ROLLFORWARD_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/restriction-rollforward-prod-stress.mjs";

describe("restriction rollforward production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/restriction-rollforward-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("uses direct auth and API onboarding instead of stale UI onboarding", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/restriction-rollforward-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships a restricted rollforward lifecycle scenario with exact math", () => {
    expect(RESTRICTION_ROLLFORWARD_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "restricted-release-evidence-rollforward",
    ]);
    expect(RESTRICTION_ROLLFORWARD_STRESS_SCENARIOS[0]?.expected).toMatchObject({
      alertBeforeEvidencePresent: true,
      alertAfterEvidenceCleared: true,
      beginningBalanceCents: 100000,
      additionsCents: 900000,
      releasesCents: 400000,
      endingBalanceCents: 600000,
      evidencePackage: true,
      reportType: "restricted_rollforward",
      reportStatus: "ready",
      reportListed: true,
      downloadStatus: 200,
      downloadHasBalanceRows: true,
      downloadHasEvidencePackage: true,
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

  it("marks a valid rollforward result as passing", () => {
    const result = evaluateScenarioResult(RESTRICTION_ROLLFORWARD_STRESS_SCENARIOS[0]!, {
      alertBeforeEvidencePresent: true,
      alertAfterEvidenceCleared: true,
      beginningBalanceCents: 100000,
      additionsCents: 900000,
      releasesCents: 400000,
      endingBalanceCents: 600000,
      evidencePackage: true,
      reportType: "restricted_rollforward",
      reportStatus: "ready",
      reportListed: true,
      downloadStatus: 200,
      downloadHasBalanceRows: true,
      downloadHasEvidencePackage: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports missing alert, bad math, inaccessible report, and missing evidence failures", () => {
    const result = evaluateScenarioResult(RESTRICTION_ROLLFORWARD_STRESS_SCENARIOS[0]!, {
      alertBeforeEvidencePresent: false,
      alertAfterEvidenceCleared: false,
      beginningBalanceCents: 0,
      additionsCents: 900000,
      releasesCents: 1,
      endingBalanceCents: 899999,
      evidencePackage: false,
      reportType: "compliance",
      reportStatus: "pending",
      reportListed: false,
      downloadStatus: 404,
      downloadHasBalanceRows: false,
      downloadHasEvidencePackage: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("release_without_support alert was missing before evidence");
    expect(result.failures).toContain("release_without_support alert did not clear after evidence");
    expect(result.failures).toContain("beginningBalanceCents expected 100000, got 0");
    expect(result.failures).toContain("report was not listed in compliance reports");
    expect(result.failures).toContain("download did not include evidence package rows");
  });

  it("redacts emails, cookies, bearer tokens, and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-123@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("records thrown scenario errors before writing the artifact report", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/restriction-rollforward-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("await runScenario(page, session, scenario).catch");
    expect(source).toContain("failureResult(scenario.key, error)");
    expect(source).toContain("writeReport(scenarios, results)");
  });

  it("records setup errors before writing the artifact report", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/restriction-rollforward-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('results.push(failureResult("setup", error))');
    expect(source).toContain("await signUpAndActivate(page, credentials).catch");
    expect(source).toContain("await loadSession(page).catch");
    expect(source).toContain("writeFileSync(reportPath");
  });

  it("keeps browser launch and close failures from skipping artifact creation", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/restriction-rollforward-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("let browser");
    expect(source).toContain("browser = await chromium.launch");
    expect(source).toContain("await browser.close().catch");
    expect(source.indexOf("browser = await chromium.launch")).toBeGreaterThan(
      source.indexOf("try {"),
    );
    expect(source.lastIndexOf("writeReport(scenarios, results)")).toBeGreaterThan(
      source.indexOf("await browser.close().catch"),
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(
      selectedScenarios({ GRANTPIPE_RESTRICTION_ROLLFORWARD_STRESS_LIMIT: "not-a-number" }),
    ).toHaveLength(1);
  });
});
