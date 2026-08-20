import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNTING_INTEGRATIONS_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildAccountingIntegrationRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/accounting-integrations-prod-stress.mjs";

const passingActual = {
  integrationsStatus: 410,
  integrationsError: "accounting_integrations_unavailable",
  connectUrlStatus: 410,
  connectUrlError: "quickbooks_integration_unavailable",
  callbackStatus: 410,
  callbackError: "quickbooks_integration_unavailable",
  syncStatus: 410,
  syncError: "accounting_integrations_unavailable",
  browserPageVisible: true,
  browserUnavailableVisible: true,
  browserConnectVisible: false,
  browserSyncVisible: false,
};

describe("accounting integrations production stress harness", () => {
  it("defines the unavailable-state scenario", () => {
    expect(ACCOUNTING_INTEGRATIONS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "accounting-integrations-unavailable",
    ]);
  });

  it("requires the cleanup wrapper proof for production", () => {
    expect(() => assertProductionWrapper({ appUrl: "https://app.grantpipe.com", env: {} })).toThrow(
      /cleanup/,
    );

    const tokenDir = mkdtempSync(join(tmpdir(), "grantpipe-live-proof-"));
    const tokenFile = join(tokenDir, "proof.json");
    writeFileSync(tokenFile, JSON.stringify({ token: "proof-token" }));
    try {
      expect(() =>
        assertProductionWrapper({
          appUrl: "https://app.grantpipe.com",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: "proof-token",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: tokenFile,
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(tokenDir, { recursive: true, force: true });
    }
  });

  it("passes only when every connector endpoint and UI action stays unavailable", () => {
    expect(evaluateScenarioResult(passingActual)).toMatchObject({ pass: true, failures: [] });

    const result = evaluateScenarioResult({
      ...passingActual,
      integrationsStatus: 200,
      connectUrlError: "unexpected",
      callbackStatus: 200,
      syncError: "unexpected",
      browserPageVisible: false,
      browserUnavailableVisible: false,
      browserConnectVisible: true,
      browserSyncVisible: true,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "integrations expected HTTP 410, got 200",
      "connect URL returned unexpected",
      "callback expected HTTP 410, got 200",
      "sync returned unexpected",
      "accounting integrations page was not visible",
      "unavailable message was not visible",
      "QuickBooks connect action was visible",
      "accounting sync action was visible",
    ]);
  });

  it("tracks complete runs and invalid stress limits", () => {
    expect(isCompleteRun([], ACCOUNTING_INTEGRATIONS_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        [{ key: "accounting-integrations-unavailable", pass: true }],
        ACCOUNTING_INTEGRATIONS_STRESS_SCENARIOS,
      ),
    ).toBe(true);
    expect(
      selectedScenarios({ GRANTPIPE_ACCOUNTING_INTEGRATIONS_STRESS_LIMIT: "invalid" }),
    ).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(
      redactForReport(
        'Email e2e@grantpipe.test password=secret-value "token":"abc123" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password=[redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("builds tombstone routes and uses the reusable E2E account", () => {
    expect(buildAccountingIntegrationRoute()).toBe("/api/accounting/integrations");
    expect(buildAccountingIntegrationRoute("quickbooks/connect-url")).toBe(
      "/api/accounting/integrations/quickbooks/connect-url",
    );

    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/accounting-integrations-prod-stress.mjs"),
      "utf8",
    );
    expect(source).toContain("GRANTPIPE_E2E_EMAIL");
    expect(source).toContain("GRANTPIPE_E2E_PASSWORD");
    expect(source).not.toContain("sign-up/email");
    expect(source).not.toContain("appcenter.intuit.com");
    expect(source).toContain('appRouteUrl(APP_URL, "/accounting/integrations")');
    expect(source).toContain(
      "name: /^(Accounting integrations are not available yet|QuickBooks Online is not currently available)$/",
    );
    expect(source).toContain('page.url() === appRouteUrl(APP_URL, "/accounting/integrations")');
    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("complete,");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
