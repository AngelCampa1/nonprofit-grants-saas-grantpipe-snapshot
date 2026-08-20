import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CUSTOM_FIELD_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildCustomFieldDefinitionsRoute,
  buildCustomFieldValuesRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/custom-fields-prod-stress.mjs";

describe("custom fields production stress harness", () => {
  it("defines the grant custom field lifecycle scenario", () => {
    expect(CUSTOM_FIELD_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "grant-custom-field-lifecycle",
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

  it("passes when the custom field definition, value, report metadata, and browser checks pass", () => {
    const result = evaluateScenarioResult({
      createStatus: 201,
      createdName: "Risk tier",
      listContainsCreated: true,
      updateStatus: 200,
      updatedName: "Risk tier updated",
      valueStatus: 200,
      valueReturned: "High",
      valuesContainUpdatedDefinition: true,
      valuesContainSavedValue: true,
      invalidOptionRejected: true,
      reportMetadataContainsDefinition: true,
      browserTabVisible: true,
      browserFieldVisible: true,
      browserValueVisible: true,
      deleteStatus: 204,
      hiddenAfterDelete: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak custom field coverage", () => {
    const result = evaluateScenarioResult({
      createStatus: 500,
      createdName: "",
      listContainsCreated: false,
      updateStatus: 500,
      updatedName: "",
      valueStatus: 500,
      valueReturned: "",
      valuesContainUpdatedDefinition: false,
      valuesContainSavedValue: false,
      invalidOptionRejected: false,
      reportMetadataContainsDefinition: false,
      browserTabVisible: false,
      browserFieldVisible: false,
      browserValueVisible: false,
      deleteStatus: 500,
      hiddenAfterDelete: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "custom field definition create expected HTTP 201, got 500",
      "created custom field name was not preserved",
      "custom field definition list did not include the created field",
      "custom field definition update expected HTTP 200, got 500",
      "updated custom field name was not returned",
      "custom field value upsert expected HTTP 200, got 500",
      "custom field value response did not include the saved value",
      "custom field value list did not include the updated definition",
      "custom field value list did not include the saved value",
      "invalid custom field option was not rejected",
      "report metadata did not expose the grant custom field",
      "browser custom fields tab was not visible",
      "browser custom field name was not visible",
      "browser custom field value was not visible",
      "custom field definition delete expected HTTP 204, got 500",
      "deleted custom field definition remained visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], CUSTOM_FIELD_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        CUSTOM_FIELD_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        CUSTOM_FIELD_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_CUSTOM_FIELD_STRESS_LIMIT: "bad" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(
      redactForReport(
        'Email e2e-custom-fields@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("builds custom field routes through exported helpers", () => {
    expect(buildCustomFieldDefinitionsRoute("entityType=grant")).toBe(
      "/api/org/custom-fields?entityType=grant",
    );
    expect(buildCustomFieldValuesRoute("grant", "grant-1")).toBe(
      "/api/org/custom-fields/grant/grant-1/values",
    );
  });

  it("uses cleanup, auth, custom field API, browser, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/custom-fields-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results"');
    expect(source).toContain('"live-e2e"');
    expect(source).toContain('"custom-fields"');
    expect(source).toContain("CUSTOM_FIELDS_ROUTE");
    expect(source).toContain("buildCustomFieldDefinitionsRoute");
    expect(source).toContain("buildCustomFieldValuesRoute");
    expect(source).toContain("/app/grants/");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
