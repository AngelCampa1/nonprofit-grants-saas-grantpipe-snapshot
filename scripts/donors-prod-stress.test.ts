import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DONOR_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildContactCommunicationsRoute,
  buildContactDonationsRoute,
  buildContactRoute,
  buildContactsExportRoute,
  buildContactsRoute,
  buildSegmentsRoute,
  buildTagsRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/donors-prod-stress.mjs";

describe("donors production stress harness", () => {
  it("defines the donor CRM portability lifecycle scenario", () => {
    expect(DONOR_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "donor-crm-portability-lifecycle",
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

  it("evaluates donor create, linkage, export, browser, and cleanup coverage", () => {
    const result = evaluateScenarioResult({
      createContactStatus: 201,
      createdContactName: "Avery Donor",
      updateStageStatus: 200,
      listContainsContact: true,
      filteredListContainsOnlyContact: true,
      tagCreateStatus: 201,
      tagAttachStatus: 204,
      taggedListContainsContact: true,
      donationCreateStatus: 201,
      donationsContainGift: true,
      contactStatsIncludeGift: true,
      communicationCreateStatus: 201,
      communicationsContainNote: true,
      segmentCreateStatus: 201,
      segmentListContainsSegment: true,
      exportStatus: 200,
      exportContentType: "text/csv; charset=utf-8",
      exportDisposition: 'attachment; filename="contacts.csv"',
      exportCacheControl: "private, no-store",
      exportIncludesContact: true,
      exportIncludesStage: true,
      exportIncludesGiving: true,
      browserListVisible: true,
      browserDetailVisible: true,
      browserDonationVisible: true,
      browserTagVisible: true,
      contactDeleteStatus: 204,
      hiddenAfterDelete: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak donor lifecycle coverage", () => {
    const result = evaluateScenarioResult({
      createContactStatus: 500,
      createdContactName: "Wrong",
      updateStageStatus: 500,
      listContainsContact: false,
      filteredListContainsOnlyContact: false,
      tagCreateStatus: 500,
      tagAttachStatus: 500,
      taggedListContainsContact: false,
      donationCreateStatus: 500,
      donationsContainGift: false,
      contactStatsIncludeGift: false,
      communicationCreateStatus: 500,
      communicationsContainNote: false,
      segmentCreateStatus: 500,
      segmentListContainsSegment: false,
      exportStatus: 500,
      exportContentType: "application/json",
      exportDisposition: "inline",
      exportCacheControl: "public",
      exportIncludesContact: false,
      exportIncludesStage: false,
      exportIncludesGiving: false,
      browserListVisible: false,
      browserDetailVisible: false,
      browserDonationVisible: false,
      browserTagVisible: false,
      contactDeleteStatus: 500,
      hiddenAfterDelete: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "contact create expected HTTP 201, got 500",
      "created contact name was not preserved",
      "pipeline stage update expected HTTP 200, got 500",
      "donor list did not include the created contact",
      "filtered donor list did not isolate the created contact",
      "tag create expected HTTP 201, got 500",
      "tag attach expected HTTP 204, got 500",
      "tag-filtered donor list did not include the created contact",
      "donation create expected HTTP 201, got 500",
      "donation list did not include the fixture gift",
      "contact detail stats did not include the fixture gift",
      "communication create expected HTTP 201, got 500",
      "communication list did not include the fixture note",
      "segment create expected HTTP 201, got 500",
      "segment list did not include the created segment",
      "contact export expected HTTP 200, got 500",
      "contact export did not return CSV content",
      "contact export did not use attachment disposition",
      "contact export did not use private no-store caching",
      "contact export did not include the created contact",
      "contact export did not include the updated stage",
      "contact export did not include giving totals",
      "browser donor list did not show the fixture contact",
      "browser donor detail did not show the fixture contact",
      "browser donor detail did not show the fixture donation",
      "browser donor detail did not show the fixture tag",
      "contact delete expected HTTP 204, got 500",
      "deleted contact remained visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], DONOR_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        DONOR_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        DONOR_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_DONOR_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc token Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] token [redacted-token]",
    );
  });

  it("builds donor routes through exported helpers", () => {
    expect(buildContactsRoute("page=1")).toBe("/api/donors?page=1");
    expect(buildContactsExportRoute("search=Avery")).toBe("/api/donors/export?search=Avery");
    expect(buildContactRoute("contact-1")).toBe("/api/donors/contact-1");
    expect(buildContactDonationsRoute("contact-1")).toBe("/api/donors/contact-1/donations");
    expect(buildContactCommunicationsRoute("contact-1")).toBe(
      "/api/donors/contact-1/communications",
    );
    expect(buildTagsRoute()).toBe("/api/donors/tags");
    expect(buildSegmentsRoute()).toBe("/api/donors/segments");
  });

  it("uses donor, export, cleanup, auth, browser, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/donors-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "donors"');
    expect(source).toContain('"/api/donors"');
    expect(source).toContain('"/api/donors/export"');
    expect(source).toContain('"/api/donors/tags"');
    expect(source).toContain('"/api/donors/segments"');
    expect(source).toContain('"/api/onboarding/complete"');
    expect(source).toContain("/app/donors/${fixture.contactId}");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/donors-prod-stress.mjs"), "utf8");

    expect(source).toContain("createdAt: startedAt");
    expect(source).toContain("pass: isCompleteRun(results, scenarios)");
    expect(source).toContain("scenarioCount: scenarios.length");
  });
});
