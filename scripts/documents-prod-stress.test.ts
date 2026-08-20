import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildDocumentDownloadRoute,
  buildDocumentsRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/documents-prod-stress.mjs";

describe("documents production stress harness", () => {
  it("defines the grant document lifecycle scenario", () => {
    expect(DOCUMENT_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "grant-document-lifecycle",
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

  it("evaluates upload, list, download, browser, validation, and deletion coverage", () => {
    const result = evaluateScenarioResult({
      uploadStatus: 201,
      uploadedFilename: "grant-evidence.txt",
      listedAfterUpload: true,
      downloadStatus: 200,
      downloadContentMatches: true,
      downloadContentType: "text/plain",
      downloadEntityType: "grant",
      downloadSizeBucket: "under_10kb",
      browserDocumentsVisible: true,
      browserFilenameVisible: true,
      unsupportedMimeRejected: true,
      invalidEntityRejected: true,
      deleteStatus: 204,
      hiddenAfterDelete: true,
      downloadAfterDeleteStatus: 404,
      downloadAfterDeleteBlocked: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak document lifecycle coverage", () => {
    const result = evaluateScenarioResult({
      uploadStatus: 500,
      uploadedFilename: "wrong.txt",
      listedAfterUpload: false,
      downloadStatus: 404,
      downloadContentMatches: false,
      downloadContentType: "application/json",
      downloadEntityType: "contact",
      downloadSizeBucket: "unknown",
      browserDocumentsVisible: false,
      browserFilenameVisible: false,
      unsupportedMimeRejected: false,
      invalidEntityRejected: false,
      deleteStatus: 500,
      hiddenAfterDelete: false,
      downloadAfterDeleteStatus: 200,
      downloadAfterDeleteBlocked: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "document upload expected HTTP 201, got 500",
      "uploaded filename was not preserved",
      "uploaded document was not returned by the grant document list",
      "document download expected HTTP 200, got 404",
      "downloaded document content did not match uploaded bytes",
      "download content-type expected text/plain",
      "download entity header expected grant",
      "download size bucket expected under_10kb",
      "browser document tab was not visible",
      "browser uploaded filename was not visible",
      "unsupported document MIME type was not rejected",
      "missing grant document entity was not rejected",
      "document delete expected HTTP 204, got 500",
      "deleted document remained visible in the grant document list",
      "deleted document download expected HTTP 404, got 200",
      "deleted document remained downloadable after delete",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], DOCUMENT_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        DOCUMENT_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        DOCUMENT_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_DOCUMENT_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc token Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] token [redacted-token]",
    );
  });

  it("builds document routes through exported helpers", () => {
    expect(buildDocumentsRoute("entityType=grant&entityId=grant-1")).toBe(
      "/api/documents?entityType=grant&entityId=grant-1",
    );
    expect(buildDocumentDownloadRoute("doc-1")).toBe("/api/documents/doc-1/download");
  });

  it("uses document, cleanup, auth, grant, browser, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/documents-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "documents"');
    expect(source).toContain('"/api/documents"');
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain('"/api/grants"');
    expect(source).toContain('"/api/onboarding/complete"');
    expect(source).toContain("/app/grants/${fixture.grantId}");
    expect(source).toContain("grant-evidence.txt");
    expect(source).toContain("application/x-msdownload");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
