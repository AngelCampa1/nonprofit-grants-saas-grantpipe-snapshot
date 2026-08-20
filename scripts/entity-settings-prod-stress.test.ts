import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ENTITY_SETTINGS_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildOrgRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/entity-settings-prod-stress.mjs";

describe("entity settings production stress harness", () => {
  it("defines the entity create, update, archive, and UI scenario", () => {
    expect(ENTITY_SETTINGS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "entity-create-update-archive-and-ui",
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

  it("passes when entity API and settings UI behave safely", () => {
    const result = evaluateScenarioResult({
      initialListStatus: 200,
      initialListHasDefault: true,
      createValidationStatus: 400,
      createValidationRejected: true,
      createdRelatedStatus: 201,
      createdRelatedSafeShape: true,
      createdSponsoredStatus: 201,
      createdSponsoredSafeShape: true,
      updatedStatus: 200,
      updatePersisted: true,
      defaultArchiveStatus: 400,
      defaultArchiveRejected: true,
      childArchiveStatus: 400,
      childArchiveRejected: true,
      archivedRelatedStatus: 200,
      relatedArchived: true,
      activeListExcludesArchived: true,
      archivedListIncludesArchived: true,
      browserPageVisible: true,
      browserCreatedEntityVisible: true,
      browserArchivedEntityHidden: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak entity settings coverage", () => {
    const result = evaluateScenarioResult({
      initialListStatus: 500,
      initialListHasDefault: false,
      createValidationStatus: 201,
      createValidationRejected: false,
      createdRelatedStatus: 500,
      createdRelatedSafeShape: false,
      createdSponsoredStatus: 500,
      createdSponsoredSafeShape: false,
      updatedStatus: 500,
      updatePersisted: false,
      defaultArchiveStatus: 200,
      defaultArchiveRejected: false,
      childArchiveStatus: 200,
      childArchiveRejected: false,
      archivedRelatedStatus: 500,
      relatedArchived: false,
      activeListExcludesArchived: false,
      archivedListIncludesArchived: false,
      browserPageVisible: false,
      browserCreatedEntityVisible: false,
      browserArchivedEntityHidden: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "initial entity list expected HTTP 200, got 500",
      "initial entity list did not include one default entity",
      "invalid entity create expected HTTP 400, got 201",
      "invalid entity create was not rejected",
      "related entity create expected HTTP 201, got 500",
      "related entity create did not return the safe public entity shape",
      "sponsored project create expected HTTP 201, got 500",
      "sponsored project create did not return the safe public entity shape",
      "entity update expected HTTP 200, got 500",
      "entity update did not persist the new name",
      "default entity archive expected HTTP 400, got 200",
      "default entity archive was not rejected",
      "parent entity archive with an active child expected HTTP 400, got 200",
      "parent entity archive with an active child was not rejected",
      "related entity archive expected HTTP 200, got 500",
      "related entity was not archived",
      "active entity list still included the archived related entity",
      "includeArchived entity list did not include the archived related entity",
      "browser entity settings page was not visible",
      "browser created entity was not visible",
      "browser archived entity was still visible in the active list",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], ENTITY_SETTINGS_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        ENTITY_SETTINGS_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        ENTITY_SETTINGS_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_ENTITY_SETTINGS_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(
      redactForReport(
        'Email e2e-entity-settings@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("builds org entity routes through exported helpers", () => {
    expect(buildOrgRoute("entities")).toBe("/api/org/entities");
    expect(buildOrgRoute("entities/entity-1/archive")).toBe("/api/org/entities/entity-1/archive");
  });

  it("uses cleanup, auth, entity API, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/entity-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results"');
    expect(source).toContain('"live-e2e"');
    expect(source).toContain('"entity-settings"');
    expect(source).toContain('buildOrgRoute("entities")');
    expect(source).toContain("buildOrgRoute(`entities/${createdRelated.id}/archive`)");
    expect(source).toContain("/app/settings/entities");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/entity-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
