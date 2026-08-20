import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildActivityRoute,
  buildOrgActivityRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/activity-prod-stress.mjs";

describe("activity production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/activity-prod-stress.mjs"), "utf8");

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines the grant audit trail scenario", () => {
    expect(ACTIVITY_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "grant-funder-audit-trail",
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

  it("evaluates entity, org, actor, date, and browser activity coverage", () => {
    const result = evaluateScenarioResult({
      entityActionsAsc: ["created", "updated"],
      entityIds: ["grant-1", "grant-1"],
      grantOrgActions: ["updated", "created"],
      funderOrgActions: ["created"],
      actorGrantActions: ["updated", "created"],
      futureGrantCount: 0,
      browserActivityVisible: true,
      browserGrantVisible: true,
      browserUpdatedVisible: true,
      browserFunderVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak activity trail coverage", () => {
    const result = evaluateScenarioResult({
      entityActionsAsc: ["created"],
      entityIds: ["grant-1", "grant-2"],
      grantOrgActions: ["created"],
      funderOrgActions: [],
      actorGrantActions: [],
      futureGrantCount: 1,
      browserActivityVisible: false,
      browserGrantVisible: false,
      browserUpdatedVisible: false,
      browserFunderVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "entity activity actions expected created,updated, got created",
      "entity activity included rows outside the fixture grant",
      "org grant activity actions expected updated,created, got created",
      "org funder activity did not include the fixture funder creation",
      "actor-filtered grant activity did not include both grant changes",
      "future date filter returned fixture grant activity",
      "browser activity feed was not visible",
      "browser grant activity was not visible",
      "browser updated action was not visible",
      "browser funder activity was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], ACTIVITY_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        ACTIVITY_STRESS_SCENARIOS.map((scenario) => ({ key: scenario.key, pass: true })),
        ACTIVITY_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_ACTIVITY_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds activity routes through exported helpers", () => {
    expect(buildActivityRoute("entityType=grant&entityId=grant-1")).toBe(
      "/api/activity?entityType=grant&entityId=grant-1",
    );
    expect(buildOrgActivityRoute("entityType=funder")).toBe("/api/activity/org?entityType=funder");
  });

  it("uses activity, grant, funder, cleanup, auth, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/activity-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "activity"');
    expect(source).toContain('"/api/activity"');
    expect(source).toContain('"/api/activity/org"');
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain('"/api/grants"');
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
