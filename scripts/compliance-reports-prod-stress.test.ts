import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMPLIANCE_REPORTS_STRESS_SCENARIOS,
  assertProductionWrapper,
  createScenarioRunPlan,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/compliance-reports-prod-stress.mjs";

describe("compliance reports production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/compliance-reports-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("signs up on the Audit-Ready plan because SEFA is plan gated", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/compliance-reports-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/signup?plan=audit_ready&cycle=monthly");
  });

  it("creates the disposable org through auth and onboarding APIs", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/compliance-reports-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships generated compliance report artifact scenarios", () => {
    expect(COMPLIANCE_REPORTS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "sefa-csv-bundle-with-metadata-warnings",
      "sefa-fiscal-year-boundary-and-non-federal-exclusion",
    ]);
  });

  it("isolates each scenario in a distinct disposable org", () => {
    const runPlan = createScenarioRunPlan(COMPLIANCE_REPORTS_STRESS_SCENARIOS, (scenarioKey) => ({
      email: `${scenarioKey}@grantpipe.test`,
      password: "GrantPipe-test!",
      name: "GrantPipe E2E Compliance",
      orgName: `GrantPipe E2E Compliance ${scenarioKey}`,
    }));

    expect(runPlan).toHaveLength(2);
    expect(new Set(runPlan.map((run) => run.credentials.email)).size).toBe(2);
    expect(new Set(runPlan.map((run) => run.credentials.orgName)).size).toBe(2);
    expect(runPlan.map((run) => run.scenario.key)).toEqual([
      "sefa-csv-bundle-with-metadata-warnings",
      "sefa-fiscal-year-boundary-and-non-federal-exclusion",
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

  it("marks an expected compliance report result as passing", () => {
    const result = evaluateScenarioResult(COMPLIANCE_REPORTS_STRESS_SCENARIOS[0]!, {
      invalidPreviewRejected: true,
      invalidPreviewStatus: 400,
      metadataEndpointStatus: 200,
      tripwireState: "clear",
      tripwireRows: 2,
      tripwireWarnings: 2,
      totalFederalExpendituresCents: 125_000,
      completeMetadataRows: 1,
      missingMetadataRows: 1,
      sefaReportType: "sefa",
      sefaReportFormat: "csv_bundle",
      sefaReportStatus: "ready",
      previewKind: "html",
      previewMentionsWarning: true,
      downloadStatus: 200,
      downloadContentType: "text/csv; charset=utf-8",
      downloadHasSefaSection: true,
      downloadHasSummarySection: true,
      listContainsReport: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("marks the SEFA fiscal-year boundary and non-federal exclusion result as passing", () => {
    const result = evaluateScenarioResult(COMPLIANCE_REPORTS_STRESS_SCENARIOS[1]!, {
      currentYearState: "clear",
      currentYearRows: 2,
      currentYearWarnings: 0,
      currentYearTotalFederalExpendituresCents: 755_555,
      priorYearRows: 1,
      priorYearTotalFederalExpendituresCents: 111_111,
      nextYearRows: 1,
      nextYearTotalFederalExpendituresCents: 222_222,
      nonFederalGrantExcluded: true,
      boundaryStartIncluded: true,
      boundaryEndIncluded: true,
      priorYearExpenseExcluded: true,
      nextYearExpenseExcluded: true,
      generatedReportStatus: "ready",
      generatedReportFiscalYear: "2026",
      generatedReportDownloadStatus: 200,
      generatedReportDownloadOmitsNonFederal: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched compliance report facts", () => {
    const result = evaluateScenarioResult(COMPLIANCE_REPORTS_STRESS_SCENARIOS[0]!, {
      invalidPreviewRejected: false,
      invalidPreviewStatus: 200,
      metadataEndpointStatus: 404,
      tripwireState: "watch",
      tripwireRows: 1,
      tripwireWarnings: 0,
      totalFederalExpendituresCents: 0,
      completeMetadataRows: 0,
      missingMetadataRows: 0,
      sefaReportType: "board",
      sefaReportFormat: "pdf",
      sefaReportStatus: "failed",
      previewKind: "csv",
      previewMentionsWarning: false,
      downloadStatus: 500,
      downloadContentType: "application/json",
      downloadHasSefaSection: false,
      downloadHasSummarySection: false,
      listContainsReport: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("invalid SEFA preview request was not rejected");
    expect(result.failures).toContain("metadataEndpointStatus expected 200, got 404");
    expect(result.failures).toContain("download is missing sefa.csv section");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-compliance@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_COMPLIANCE_REPORTS_STRESS_LIMIT: "nope" })).toHaveLength(
      1,
    );
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/compliance-reports-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("const createdAt = new Date().toISOString()");
    expect(source).toContain("createdAt,");
    expect(source).toContain("pass: passed === results.length");
    expect(source).toContain("scenarioCount: results.length");
  });
});
