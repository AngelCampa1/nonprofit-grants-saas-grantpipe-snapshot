import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXTERNAL_REVIEWER_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildPortalRoute,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/external-reviewer-prod-stress.mjs";

describe("external reviewer production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/external-reviewer-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("creates the disposable org through auth and onboarding APIs", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/external-reviewer-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships generated portal scope scenarios", () => {
    expect(EXTERNAL_REVIEWER_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "grant-quick-share-scope",
      "fund-quick-share-scope",
    ]);
    expect(EXTERNAL_REVIEWER_STRESS_SCENARIOS.every((scenario) => scenario.ttlMs > 0)).toBe(true);
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

  it("builds portal routes with encoded token query params", () => {
    expect(buildPortalRoute("/api/public/portal/grants/grant 1", "token/with+chars")).toBe(
      "/api/public/portal/grants/grant%201?token=token%2Fwith%2Bchars",
    );
  });

  it("marks an expected scenario result as passing", () => {
    const scenario = EXTERNAL_REVIEWER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      quickShareStatus: 201,
      portalAuthStatus: 200,
      meStatus: 200,
      scopedReadStatus: 200,
      outOfScopeStatus: 403,
      crossTypeOutOfScopeStatus: 403,
      bundleReadStatus: 200,
      revokedReadStatus: 401,
      reviewerMatches: true,
      scopeTypes: ["grant", "evidence_bundle"],
      scopeKeys: ["grant:grant-1", "evidence_bundle:bundle-1"],
      expectedScopeKeys: ["grant:grant-1", "evidence_bundle:bundle-1"],
      bundleItemTypes: ["grant"],
      bundleItemKeys: ["grant:grant-1"],
      expectedBundleItemKeys: ["grant:grant-1"],
      auditEventTypes: ["session_open", "view", "bundle_view"],
      scopedEntityName: "GrantPipe E2E Review Grant",
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails scope, auth, bundle, revoke, and audit mismatches", () => {
    const scenario = EXTERNAL_REVIEWER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      quickShareStatus: 200,
      portalAuthStatus: 401,
      meStatus: 401,
      scopedReadStatus: 403,
      outOfScopeStatus: 200,
      crossTypeOutOfScopeStatus: 200,
      bundleReadStatus: 404,
      revokedReadStatus: 200,
      reviewerMatches: false,
      scopeTypes: ["grant", "fund"],
      scopeKeys: ["grant:grant-1", "grant:grant-2", "fund:fund-1"],
      expectedScopeKeys: ["grant:grant-1", "evidence_bundle:bundle-1"],
      bundleItemTypes: ["fund", "document"],
      bundleItemKeys: ["fund:fund-1", "fund:fund-2"],
      expectedBundleItemKeys: ["grant:grant-1"],
      auditEventTypes: ["session_open"],
      scopedEntityName: "Wrong Grant",
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("quickShareStatus expected 201, got 200");
    expect(result.failures).toContain("portalAuthStatus expected 200, got 401");
    expect(result.failures).toContain("out-of-scope read was not denied");
    expect(result.failures).toContain("crossTypeOutOfScopeStatus expected 403, got 200");
    expect(result.failures).toContain("revoked session still had portal access");
    expect(result.failures).toContain("portal reviewer did not match quick-share reviewer");
    expect(result.failures).toContain("scopeTypes missing evidence_bundle");
    expect(result.failures).toContain("scopeTypes had unexpected fund");
    expect(result.failures).toContain("scopeKeys expected 2 item(s), got 3");
    expect(result.failures).toContain("scopeKeys missing evidence_bundle:bundle-1");
    expect(result.failures).toContain("scopeKeys had unexpected grant:grant-2");
    expect(result.failures).toContain("bundleItemTypes missing grant");
    expect(result.failures).toContain("bundleItemTypes had unexpected document");
    expect(result.failures).toContain("bundleItemKeys expected 1 item(s), got 2");
    expect(result.failures).toContain("bundleItemKeys had unexpected fund:fund-2");
    expect(result.failures).toContain("auditEventTypes missing view");
    expect(result.failures).toContain(
      "scopedEntityName expected GrantPipe E2E Review Grant, got Wrong Grant",
    );
  });

  it("redacts emails, portal tokens, cookies, and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email reviewer@grantpipe.test rawToken gp_live_portal_secret "token":"abc123456789" Cookie: gp_portal_session=secret Authorization: Bearer live-secret',
      ),
    ).toBe(
      'Email [redacted-email] rawToken [redacted-token] "token":"[redacted-token]" Cookie: [redacted-token] Authorization: Bearer [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_REVIEWER_STRESS_LIMIT: "not-a-number" })).toHaveLength(1);
  });
});
