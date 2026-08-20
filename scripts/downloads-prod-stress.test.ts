import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildPublicFileDownloadRoute,
  buildPublicTokenDownloadRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/downloads-prod-stress.mjs";

describe("public downloads production stress harness", () => {
  it("defines the public lead magnet asset scenario", () => {
    expect(DOWNLOAD_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "public-lead-magnet-assets",
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

  it("evaluates PDF, XLSX, invalid slug, and invalid token coverage", () => {
    const result = evaluateScenarioResult({
      pdfStatus: 200,
      pdfContentType: "application/pdf",
      pdfDisposition: 'inline; filename="grant-compliance-checklist.pdf"',
      pdfCacheControl: "public, max-age=86400",
      pdfBodyBytes: 1024,
      xlsxStatus: 200,
      xlsxContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsxDisposition: 'inline; filename="grant-tracking-template.xlsx"',
      xlsxCacheControl: "public, max-age=86400",
      xlsxBodyBytes: 1024,
      invalidSlugStatus: 404,
      invalidSlugError: "File not found",
      invalidTokenStatus: 401,
      invalidTokenError: "Invalid or expired download link",
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak public download coverage", () => {
    const result = evaluateScenarioResult({
      pdfStatus: 404,
      pdfContentType: "text/html",
      pdfDisposition: "attachment",
      pdfCacheControl: "private",
      pdfBodyBytes: 0,
      xlsxStatus: 404,
      xlsxContentType: "application/json",
      xlsxDisposition: "attachment",
      xlsxCacheControl: "private",
      xlsxBodyBytes: 0,
      invalidSlugStatus: 200,
      invalidSlugError: "",
      invalidTokenStatus: 200,
      invalidTokenError: "",
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "PDF lead magnet download expected HTTP 200, got 404",
      "PDF lead magnet content-type expected application/pdf",
      "PDF lead magnet content-disposition filename was wrong",
      "PDF lead magnet cache-control was wrong",
      "PDF lead magnet body was empty",
      "XLSX lead magnet download expected HTTP 200, got 404",
      "XLSX lead magnet content-type expected spreadsheet MIME type",
      "XLSX lead magnet content-disposition filename was wrong",
      "XLSX lead magnet cache-control was wrong",
      "XLSX lead magnet body was empty",
      "invalid lead magnet slug expected HTTP 404, got 200",
      "invalid lead magnet slug did not return File not found",
      "invalid download token expected HTTP 401, got 200",
      "invalid download token did not return the expected error",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], DOWNLOAD_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        DOWNLOAD_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        DOWNLOAD_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_DOWNLOAD_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org token Secret-12345")).toBe(
      "Email [redacted-email] token [redacted-token]",
    );
  });

  it("builds public download routes through exported helpers", () => {
    expect(buildPublicFileDownloadRoute("grant-compliance-checklist")).toBe(
      "/api/public/downloads/file/grant-compliance-checklist",
    );
    expect(buildPublicTokenDownloadRoute("badtoken")).toBe("/api/public/downloads/badtoken");
  });

  it("uses public downloads, cleanup wrapper, artifact, PDF, and XLSX paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/downloads-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "downloads"');
    expect(source).toContain('"/api/public/downloads/file"');
    expect(source).toContain("grant-compliance-checklist");
    expect(source).toContain("grant-tracking-template");
    expect(source).toContain("application/pdf");
    expect(source).toContain("spreadsheetml.sheet");
    expect(source).not.toContain("e2e:live:cleanup");
  });
});
