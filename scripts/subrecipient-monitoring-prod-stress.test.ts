import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SUBRECIPIENT_MONITORING_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/subrecipient-monitoring-prod-stress.mjs";

describe("subrecipient monitoring production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/subrecipient-monitoring-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("signs up on the Audit-Ready plan because subrecipient monitoring is plan gated", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/subrecipient-monitoring-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/signup?plan=audit_ready&cycle=monthly");
  });

  it("uses direct auth and API onboarding instead of stale UI onboarding", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/subrecipient-monitoring-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships generated subrecipient monitoring lifecycle scenarios", () => {
    expect(SUBRECIPIENT_MONITORING_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "high-risk-subaward-evidence-bundle",
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

  it("marks an expected subrecipient monitoring result as passing", () => {
    const result = evaluateScenarioResult(SUBRECIPIENT_MONITORING_STRESS_SCENARIOS[0]!, {
      invalidDateRangeRejected: true,
      invalidDateRangeStatus: 400,
      createdSubrecipientStatus: "active",
      createdSubawardStatus: "active",
      riskAssessmentFinalRisk: "high",
      generatedTaskCount: 8,
      completedTaskStatus: "completed",
      monitoringLogType: "desk_review",
      findingSeverity: "material",
      findingStatus: "open",
      correctiveActionStatus: "open",
      portfolioTotal: 1,
      portfolioHighRisk: 1,
      portfolioOpenFindings: 1,
      portfolioOpenTasks: 7,
      highRiskFilteredCount: 1,
      openFindingsFilteredCount: 1,
      subawardListCount: 1,
      evidenceBundleHasSubrecipient: true,
      evidenceBundleHasSubaward: true,
      evidenceBundleHasRiskAssessment: true,
      evidenceBundleHasTask: true,
      evidenceBundleHasFinding: true,
      evidenceBundleHasCorrectiveAction: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched subrecipient monitoring facts", () => {
    const result = evaluateScenarioResult(SUBRECIPIENT_MONITORING_STRESS_SCENARIOS[0]!, {
      invalidDateRangeRejected: false,
      invalidDateRangeStatus: 201,
      createdSubrecipientStatus: "inactive",
      createdSubawardStatus: "draft",
      riskAssessmentFinalRisk: "low",
      generatedTaskCount: 3,
      completedTaskStatus: "open",
      monitoringLogType: "other",
      findingSeverity: "low",
      findingStatus: "resolved",
      correctiveActionStatus: "completed",
      portfolioTotal: 0,
      portfolioHighRisk: 0,
      portfolioOpenFindings: 0,
      portfolioOpenTasks: 0,
      highRiskFilteredCount: 0,
      openFindingsFilteredCount: 0,
      subawardListCount: 0,
      evidenceBundleHasSubrecipient: false,
      evidenceBundleHasSubaward: false,
      evidenceBundleHasRiskAssessment: false,
      evidenceBundleHasTask: false,
      evidenceBundleHasFinding: false,
      evidenceBundleHasCorrectiveAction: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("invalid subaward date range was not rejected");
    expect(result.failures).toContain("generatedTaskCount expected 8, got 3");
    expect(result.failures).toContain("evidence bundle is missing subrecipient");
    expect(result.failures).toContain("evidence bundle is missing corrective action");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-subrecipient@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_SUBRECIPIENT_STRESS_LIMIT: "not-a-number" })).toHaveLength(
      1,
    );
  });
});
