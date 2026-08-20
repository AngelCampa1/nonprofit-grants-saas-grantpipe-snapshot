import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REPORT_BUILDER_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/report-builder-prod-stress.mjs";

describe("report builder production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/report-builder-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines a generated custom-field CSV artifact scenario", () => {
    expect(REPORT_BUILDER_STRESS_SCENARIOS).toHaveLength(1);
    expect(REPORT_BUILDER_STRESS_SCENARIOS[0]).toMatchObject({
      key: "grant-custom-field-export-artifact",
      customFieldName: "=HYPERLINK(1,2)",
      customFieldValue: "\t=cmd()",
      expected: {
        metadataHasGrantCustomField: true,
        invalidCustomFieldRejected: true,
        invalidCustomFieldStatus: 400,
        previewTotalRows: 1,
        previewIncludesMatchingGrant: true,
        previewExcludesFilteredGrant: true,
        previewHasCustomValue: true,
        definitionStatus: 201,
        definitionPreservedEntity: true,
        definitionPreservedColumns: true,
        definitionPreservedCustomField: true,
        definitionPreservedFilter: true,
        definitionPreservedSort: true,
        runStatus: 201,
        reportType: "custom_report",
        reportFormat: "csv_bundle",
        reportReady: true,
        downloadStatus: 200,
        downloadContentType: "text/csv; charset=utf-8",
        downloadNoStore: true,
        csvHasCustomFieldHeader: true,
        csvHasMatchingGrant: true,
        csvHasCustomValue: true,
        csvNeutralizesCustomFieldHeader: true,
        csvNeutralizesCustomValue: true,
        csvDoesNotExposeRawFormulaValue: true,
        csvExcludesFilteredGrant: true,
        reportListed: true,
        reportListMetadataRows: 1,
        reportListMetadataDefinition: true,
        reportListMetadataEntity: "grants",
        reportListMetadataCustomField: true,
      },
    });
  });

  it("uses direct auth and API onboarding instead of stale signup UI copy", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/report-builder-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/signup?plan=audit_ready&cycle=monthly");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
    expect(source).not.toContain('button", { name: "Start your free trial" }');
    expect(source).not.toContain('button", { name: "Show me how it works" }');
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

  it("evaluates the generated report builder artifact contract", () => {
    const scenario = REPORT_BUILDER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      metadataHasGrantCustomField: true,
      invalidCustomFieldRejected: true,
      invalidCustomFieldStatus: 400,
      previewTotalRows: 1,
      previewIncludesMatchingGrant: true,
      previewExcludesFilteredGrant: true,
      previewHasCustomValue: true,
      definitionStatus: 201,
      definitionPreservedEntity: true,
      definitionPreservedColumns: true,
      definitionPreservedCustomField: true,
      definitionPreservedFilter: true,
      definitionPreservedSort: true,
      runStatus: 201,
      reportType: "custom_report",
      reportFormat: "csv_bundle",
      reportReady: true,
      downloadStatus: 200,
      downloadContentType: "text/csv; charset=utf-8",
      downloadNoStore: true,
      csvHasCustomFieldHeader: true,
      csvHasMatchingGrant: true,
      csvHasCustomValue: true,
      csvNeutralizesCustomFieldHeader: true,
      csvNeutralizesCustomValue: true,
      csvDoesNotExposeRawFormulaValue: true,
      csvExcludesFilteredGrant: true,
      reportListed: true,
      reportListMetadataRows: 1,
      reportListMetadataDefinition: true,
      reportListMetadataEntity: "grants",
      reportListMetadataCustomField: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for missing preview, download, and list assertions", () => {
    const scenario = REPORT_BUILDER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      metadataHasGrantCustomField: false,
      invalidCustomFieldRejected: false,
      invalidCustomFieldStatus: 200,
      previewTotalRows: 2,
      previewIncludesMatchingGrant: false,
      previewExcludesFilteredGrant: false,
      previewHasCustomValue: false,
      definitionStatus: 201,
      definitionPreservedEntity: false,
      definitionPreservedColumns: false,
      definitionPreservedCustomField: false,
      definitionPreservedFilter: false,
      definitionPreservedSort: false,
      runStatus: 201,
      reportType: "custom_report",
      reportFormat: "csv_bundle",
      reportReady: false,
      downloadStatus: 404,
      downloadContentType: "text/plain",
      downloadNoStore: false,
      csvHasCustomFieldHeader: false,
      csvHasMatchingGrant: false,
      csvHasCustomValue: false,
      csvNeutralizesCustomFieldHeader: false,
      csvNeutralizesCustomValue: false,
      csvDoesNotExposeRawFormulaValue: false,
      csvExcludesFilteredGrant: false,
      reportListed: false,
      reportListMetadataRows: 0,
      reportListMetadataDefinition: false,
      reportListMetadataEntity: "donors",
      reportListMetadataCustomField: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "metadata missing grant custom field",
      "invalid custom field was not rejected",
      "invalidCustomFieldStatus expected 400, got 200",
      "previewTotalRows expected 1, got 2",
      "preview missing matching grant",
      "preview included filtered grant",
      "preview missing custom field value",
      "saved definition did not preserve entity",
      "saved definition did not preserve columns",
      "saved definition did not preserve custom field",
      "saved definition did not preserve filter",
      "saved definition did not preserve sort",
      "generated report was not ready",
      "downloadStatus expected 200, got 404",
      "downloadContentType expected text/csv; charset=utf-8, got text/plain",
      "download was cacheable",
      "csv missing custom field header",
      "csv missing matching grant",
      "csv missing custom value",
      "csv did not neutralize formula-like custom field header",
      "csv did not neutralize formula-like custom value",
      "csv exposed a raw formula-like custom value",
      "csv included filtered grant",
      "generated report list missing report",
      "reportListMetadataRows expected 1, got 0",
      "report list metadata missing definition",
      "reportListMetadataEntity expected grants, got donors",
      "report list metadata missing custom field",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    const scenarios = REPORT_BUILDER_STRESS_SCENARIOS;
    expect(isCompleteRun([], scenarios)).toBe(false);
    expect(
      isCompleteRun(
        scenarios.map((scenario) => ({ key: scenario.key, pass: true })),
        scenarios,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_REPORT_BUILDER_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("uses report-builder endpoints and writes report-builder artifacts", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/report-builder-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "report-builder"');
    expect(source).toContain('"/api/report-builder/metadata"');
    expect(source).toContain('"/api/report-builder/preview"');
    expect(source).toContain('"/api/report-builder/definitions"');
    expect(source).toContain("`/api/report-builder/definitions/${definition.id}/run`");
    expect(source).toContain("downloadPath");
    expect(source).toContain('"/api/compliance/reports"');
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
