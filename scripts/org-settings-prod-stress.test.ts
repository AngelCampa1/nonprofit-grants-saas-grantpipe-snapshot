import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ORG_SETTINGS_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildOrgRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/org-settings-prod-stress.mjs";

describe("org settings production stress harness", () => {
  it("defines the profile and entity lifecycle scenario", () => {
    expect(ORG_SETTINGS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "org-profile-settings-entity-lifecycle",
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

  it("evaluates profile, accounting, entity, membership, and browser coverage", () => {
    const result = evaluateScenarioResult({
      profileStatus: 200,
      profileNameUpdated: true,
      billingFieldsHiddenFromProfile: true,
      exposedProfileBillingKeys: [],
      accountingSettingsStatus: 200,
      accountingEnabledReflected: true,
      initialEntitiesStatus: 200,
      defaultEntityListed: true,
      createEntityStatus: 201,
      childEntityCreated: true,
      updateEntityStatus: 200,
      childEntityUpdated: true,
      invalidSelfParentRejected: true,
      teamStatus: 200,
      activeTeamMemberListed: true,
      entityAccessAssignmentStatus: 201,
      entityAccessAssigned: true,
      archiveEntityStatus: 200,
      childEntityArchived: true,
      archiveError: null,
      membershipsStatus: 200,
      activeMembershipListed: true,
      trialUsageStatus: 200,
      trialUsageEmpty: true,
      browserSettingsVisible: true,
      browserEntitiesVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak org settings coverage", () => {
    const result = evaluateScenarioResult({
      profileStatus: 500,
      profileNameUpdated: false,
      billingFieldsHiddenFromProfile: false,
      exposedProfileBillingKeys: ["stripeCustomerId", "promoCodeApplied"],
      accountingSettingsStatus: 500,
      accountingEnabledReflected: false,
      initialEntitiesStatus: 500,
      defaultEntityListed: false,
      createEntityStatus: 500,
      childEntityCreated: false,
      updateEntityStatus: 500,
      childEntityUpdated: false,
      invalidSelfParentRejected: false,
      teamStatus: 500,
      activeTeamMemberListed: false,
      entityAccessAssignmentStatus: 500,
      entityAccessAssigned: false,
      archiveEntityStatus: 500,
      childEntityArchived: false,
      archiveError: "access token should redact token Secret-12345",
      membershipsStatus: 500,
      activeMembershipListed: false,
      trialUsageStatus: 500,
      trialUsageEmpty: false,
      browserSettingsVisible: false,
      browserEntitiesVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "org profile update expected HTTP 200, got 500",
      "org profile update did not persist the new name",
      "org profile exposed sensitive billing fields: stripeCustomerId, promoCodeApplied",
      "org accounting settings expected HTTP 200, got 500",
      "org accounting setting was not reflected in profile",
      "initial entity list expected HTTP 200, got 500",
      "default entity was not listed",
      "entity create expected HTTP 201, got 500",
      "child entity was not created with the expected parent",
      "entity update expected HTTP 200, got 500",
      "child entity update was not persisted",
      "self-parent entity update was not rejected",
      "team list expected HTTP 200, got 500",
      "active team member was not listed",
      "entity access assignment expected HTTP 201, got 500",
      "entity access assignment did not target the created child entity",
      "entity archive expected HTTP 200, got 500: access token should redact token [redacted-token]",
      "child entity archive was not persisted",
      "memberships expected HTTP 200, got 500",
      "active org membership was not listed",
      "trial feature usage expected HTTP 200, got 500",
      "trial feature usage was not empty for the disposable org",
      "browser settings page was not visible",
      "browser entities settings page was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], ORG_SETTINGS_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        ORG_SETTINGS_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        ORG_SETTINGS_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_ORG_SETTINGS_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc password Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] password [redacted-token]",
    );
  });

  it("builds org routes through exported helpers", () => {
    expect(buildOrgRoute("profile")).toBe("/api/org/profile");
    expect(buildOrgRoute("entities")).toBe("/api/org/entities");
    expect(buildOrgRoute("trial-feature-usage")).toBe("/api/org/trial-feature-usage");
  });

  it("uses org, entity, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/org-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "org-settings"');
    expect(source).toContain("`/api/org/${pathPart}`");
    expect(source).toContain('buildOrgRoute("profile")');
    expect(source).toContain('buildOrgRoute("entities")');
    expect(source).toContain('buildOrgRoute("team")');
    expect(source).toContain('buildOrgRoute("memberships")');
    expect(source).toContain("buildOrgRoute(`team/${activeTeamMember.id}/entity-access`)");
    expect(source).toContain("/app/settings");
    expect(source).toContain("/app/settings/entities");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/org-settings-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("scenarioCount: scenarios.length");
    expect(source).toContain("const pass = isCompleteRun(results, scenarios)");
    expect(source).toContain("pass,");
  });
});
