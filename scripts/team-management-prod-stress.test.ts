import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TEAM_MANAGEMENT_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildAuthInviteAcceptRoute,
  buildOrgRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/team-management-prod-stress.mjs";

describe("team management production stress harness", () => {
  it("defines the invite acceptance and permissions scenario", () => {
    expect(TEAM_MANAGEMENT_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "invite-acceptance-permissions",
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

  it("evaluates invite, member role, entity access, browser, and removal coverage", () => {
    const result = evaluateScenarioResult({
      inviteRole: "editor",
      publicInviteValid: true,
      acceptedRole: "editor",
      memberListedAfterAccept: true,
      memberRoleAfterUpdate: "viewer",
      entityAccessAssigned: true,
      entityAccessUpdated: true,
      entityAccessRevoked: true,
      browserTeamVisible: true,
      browserInviteVisible: true,
      browserMemberVisible: true,
      browserEntityVisible: true,
      memberRemoved: true,
      memberHiddenAfterRemoval: true,
      removedMemberOrgAccessStatus: 403,
      removedMemberOrgAccessBlocked: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak team-management coverage", () => {
    const result = evaluateScenarioResult({
      inviteRole: "viewer",
      publicInviteValid: false,
      acceptedRole: "viewer",
      memberListedAfterAccept: false,
      memberRoleAfterUpdate: "editor",
      entityAccessAssigned: false,
      entityAccessUpdated: false,
      entityAccessRevoked: false,
      browserTeamVisible: false,
      browserInviteVisible: false,
      browserMemberVisible: false,
      browserEntityVisible: false,
      memberRemoved: false,
      memberHiddenAfterRemoval: false,
      removedMemberOrgAccessStatus: 200,
      removedMemberOrgAccessBlocked: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "invite was expected to create an editor role, got viewer",
      "public invite verification did not return valid=true",
      "invite acceptance expected editor role, got viewer",
      "accepted member was not listed in the org team",
      "member role update expected viewer, got editor",
      "entity access assignment did not return the fixture entity",
      "entity access update did not persist the editor role",
      "entity access revoke did not remove the fixture entity",
      "browser team page was not visible",
      "browser invite controls were not visible",
      "browser accepted member was not visible",
      "browser fixture entity was not visible",
      "member removal did not mark the member inactive",
      "removed member remained visible in active team list",
      "removed member org access expected HTTP 403, got 200",
      "removed member kept protected org access after removal",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], TEAM_MANAGEMENT_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        TEAM_MANAGEMENT_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        TEAM_MANAGEMENT_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_TEAM_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts invite tokens, emails, cookies, and passwords", () => {
    expect(
      redactForReport(
        "email teammate@example.org /invite/raw-token-123 cookie: gp=abc password Secret-12345",
      ),
    ).toBe(
      "email [redacted-email] /invite/[redacted] cookie: [redacted-token] password [redacted-token]",
    );
  });

  it("builds org and invite routes through exported helpers", () => {
    expect(buildOrgRoute("team")).toBe("/api/org/team");
    expect(buildAuthInviteAcceptRoute("token-1")).toBe("/api/auth/invites/token-1/accept");
  });

  it("uses team, invite, entity, cleanup, auth, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/team-management-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "team-management"');
    expect(source).toContain('"/api/org/team"');
    expect(source).toContain('"/api/org/invites"');
    expect(source).toContain('"/api/org/entities"');
    expect(source).toContain("/api/auth/invites/");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
