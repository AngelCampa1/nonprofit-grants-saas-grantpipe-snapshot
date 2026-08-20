import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  IMPORT_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildRowsFromCsv,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/import-prod-stress.mjs";

describe("import production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/import-prod-stress.mjs"), "utf8");

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("commits rows returned by production preview", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/import-prod-stress.mjs"), "utf8");

    expect(source).toContain("rows: preview.rows");
  });

  it("uses direct auth and API onboarding instead of stale signup UI copy", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/import-prod-stress.mjs"), "utf8");

    expect(source).toContain("/signup?plan=growth&cycle=monthly");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
    expect(source).not.toContain('button", { name: "Start your free trial" }');
    expect(source).not.toContain('button", { name: "Show me how it works" }');
  });

  it("ships generated CSV import scenarios for contacts, funds, and grants", () => {
    expect(IMPORT_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "contacts-dedupe-validation",
      "funds-restriction-validation",
      "grants-funder-validation",
      "donations-money-dedupe-validation",
    ]);
    expect(IMPORT_STRESS_SCENARIOS.every((scenario) => scenario.csvText.length > 150)).toBe(true);
    expect(
      IMPORT_STRESS_SCENARIOS.find(
        (scenario) => scenario.key === "donations-money-dedupe-validation",
      ),
    ).toMatchObject({
      entityType: "donations",
      csvText: expect.stringContaining('"$1,250.50"'),
      expected: {
        previewTotalRows: 3,
        insertedRows: 1,
        duplicateRows: 1,
        failedRows: 1,
        createdCounts: {
          contacts: 1,
          donations: 1,
        },
        errorCodes: ["invalid_amount"],
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

  it("converts generated CSV text into commit rows", () => {
    expect(buildRowsFromCsv("First Name,Last Name,Email\nAda,Lovelace,ada@example.org")).toEqual([
      { "First Name": "Ada", "Last Name": "Lovelace", Email: "ada@example.org" },
    ]);
  });

  it("marks an expected import scenario result as passing", () => {
    const scenario = IMPORT_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      previewTotalRows: 4,
      previewHeaders: ["First Name", "Last Name", "Email", "Type", "Pipeline Stage", "Notes"],
      totalRows: 4,
      insertedRows: 2,
      duplicateRows: 1,
      failedRows: 1,
      createdCounts: {
        contacts: 2,
        donations: 0,
        grants: 0,
        funders: 0,
        grantOpportunities: 0,
        funds: 0,
        openingBalanceLines: 0,
        pledges: 0,
        pledgeInstallments: 0,
      },
      errorCodes: ["missing_contact_lookup"],
      latestHistoryMatches: true,
      migrationStatus: "has_errors",
      migrationInsertedRows: 2,
      migrationFailedRows: 1,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched import totals, history, progress, and row errors", () => {
    const scenario = IMPORT_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      previewTotalRows: 3,
      previewHeaders: ["First Name", "Unexpected Header"],
      totalRows: 4,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: {
        contacts: 1,
        donations: 0,
        grants: 0,
        funders: 0,
        grantOpportunities: 0,
        funds: 0,
        openingBalanceLines: 0,
        pledges: 0,
        pledgeInstallments: 0,
      },
      errorCodes: ["unexpected_error"],
      latestHistoryMatches: false,
      migrationStatus: "completed",
      migrationInsertedRows: 1,
      migrationFailedRows: 0,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("previewTotalRows expected 4, got 3");
    expect(result.failures).toContain("previewHeaders missing Last Name");
    expect(result.failures).toContain("previewHeaders had unexpected Unexpected Header");
    expect(result.failures).toContain("insertedRows expected 2, got 1");
    expect(result.failures).toContain("duplicateRows expected 1, got 0");
    expect(result.failures).toContain("failedRows expected 1, got 0");
    expect(result.failures).toContain("createdCounts.contacts expected 2, got 1");
    expect(result.failures).toContain("missing expected row error missing_contact_lookup");
    expect(result.failures).toContain("unexpected row error unexpected_error");
    expect(result.failures).toContain("latest import history did not match commit result");
    expect(result.failures).toContain("migrationStatus expected has_errors, got completed");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-import@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_IMPORT_STRESS_LIMIT: "not-a-number" })).toHaveLength(1);
  });
});
