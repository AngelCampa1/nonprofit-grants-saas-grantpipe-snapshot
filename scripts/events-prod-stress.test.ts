import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EVENTS_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildEventsRoute,
  buildVolunteerHoursRoute,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/events-prod-stress.mjs";

describe("events production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/events-prod-stress.mjs"), "utf8");

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("defines the linked event revenue and volunteer summary scenario", () => {
    expect(EVENTS_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "event-revenue-volunteer-summary",
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

  it("evaluates deduped revenue, attendee cleanup, filters, and browser summaries", () => {
    const result = evaluateScenarioResult({
      initialSummary: {
        attendeeCount: 2,
        revenueCents: 50000,
        volunteerHoursTotal: 0,
      },
      finalSummary: {
        attendeeCount: 1,
        revenueCents: 50000,
        volunteerHoursTotal: 2.5,
      },
      filteredEventIds: ["event-1"],
      pastEventIds: [],
      volunteerEventIds: ["event-1"],
      linkedDonationId: "donation-1",
      deletedAttendeeStillReturned: false,
      browserSummaryVisible: true,
      browserAttendeeVisible: true,
      browserVolunteerVisible: true,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak event accounting coverage", () => {
    const result = evaluateScenarioResult({
      initialSummary: {
        attendeeCount: 1,
        revenueCents: 100000,
        volunteerHoursTotal: 0,
      },
      finalSummary: {
        attendeeCount: 2,
        revenueCents: 100000,
        volunteerHoursTotal: 5,
      },
      filteredEventIds: [],
      pastEventIds: ["event-1"],
      volunteerEventIds: [],
      linkedDonationId: "",
      deletedAttendeeStillReturned: true,
      browserSummaryVisible: false,
      browserAttendeeVisible: false,
      browserVolunteerVisible: false,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "initial attendee count expected 2, got 1",
      "initial deduped revenue expected 50000, got 100000",
      "final attendee count expected 1, got 2",
      "final deduped revenue expected 50000, got 100000",
      "final volunteer total expected 2.5, got 5",
      "search/upcoming filters did not return the fixture event",
      "past filter returned the future fixture event",
      "volunteer hour filter did not return only the fixture event",
      "attendee donation was not linked",
      "deleted attendee still appeared in event detail",
      "browser event summary was not visible",
      "browser attendee row was not visible",
      "browser volunteer row was not visible",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], EVENTS_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        EVENTS_STRESS_SCENARIOS.map((scenario) => ({ key: scenario.key, pass: true })),
        EVENTS_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_EVENTS_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Email sam@example.org authorization: bearer abc123 password Secret-12345"),
    ).toBe(
      "Email [redacted-email] authorization: bearer [redacted-token] password [redacted-token]",
    );
  });

  it("builds event and volunteer routes through exported helpers", () => {
    expect(buildEventsRoute()).toBe("/api/events");
    expect(buildEventsRoute("search=Gala")).toBe("/api/events?search=Gala");
    expect(buildVolunteerHoursRoute("eventId=event-1")).toBe(
      "/api/events/volunteer-hours?eventId=event-1",
    );
  });

  it("uses event, attendee, donation, volunteer, cleanup, auth, and artifact paths", () => {
    const source = readFileSync(join(process.cwd(), "e2e-adhoc/events-prod-stress.mjs"), "utf8");

    expect(source).toContain('"test-results", "live-e2e", "events"');
    expect(source).toContain('"/api/events"');
    expect(source).toContain("/attendees");
    expect(source).toContain("/donations");
    expect(source).toContain("/donation-link");
    expect(source).toContain('"/api/events/volunteer-hours"');
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
