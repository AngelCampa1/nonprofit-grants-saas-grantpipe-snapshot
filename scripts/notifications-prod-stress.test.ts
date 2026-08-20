import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_STRESS_SCENARIOS,
  assertProductionWrapper,
  buildNotificationsRoute,
  databaseUrl,
  evaluateScenarioResult,
  isCompleteRun,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/notifications-prod-stress.mjs";

describe("notifications production stress harness", () => {
  it("defines the notification inbox and preference scenario", () => {
    expect(NOTIFICATION_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "notification-inbox-preferences",
    ]);
  });

  it("refuses direct production execution outside the cleanup wrapper", () => {
    const tokenDir = mkdtempSync(join(tmpdir(), "grantpipe-live-proof-"));
    const tokenFile = join(tokenDir, "token.json");
    writeFileSync(tokenFile, JSON.stringify({ token: "token" }), "utf8");

    expect(() => assertProductionWrapper({ appUrl: "https://app.grantpipe.com", env: {} })).toThrow(
      /cleanup/,
    );
    try {
      expect(() =>
        assertProductionWrapper({
          appUrl: "https://app.grantpipe.com",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: "token",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: tokenFile,
            POSTHOG_PERSONAL_API_KEY: "phx_secret",
            POSTHOG_PROJECT_ID: "390138",
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(tokenDir, { force: true, recursive: true });
    }
  });

  it("evaluates API filters, read actions, preferences, and browser clearing", () => {
    const result = evaluateScenarioResult({
      initialTotal: 3,
      initialUnreadCount: 2,
      unreadReportDueIds: ["notification-1", "notification-2"],
      typeReportDueCount: 2,
      singleReadAtPresent: true,
      afterSingleUnreadCount: 1,
      preferenceSaved: true,
      defaultPreferencePresent: true,
      browserInboxVisible: true,
      browserUnreadVisible: true,
      browserPreferenceVisible: true,
      browserMarkAllCleared: true,
      finalUnreadCount: 0,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports stable failures for weak notification coverage", () => {
    const result = evaluateScenarioResult({
      initialTotal: 2,
      initialUnreadCount: 1,
      unreadReportDueIds: ["notification-1"],
      typeReportDueCount: 1,
      singleReadAtPresent: false,
      afterSingleUnreadCount: 2,
      preferenceSaved: false,
      defaultPreferencePresent: false,
      browserInboxVisible: false,
      browserUnreadVisible: false,
      browserPreferenceVisible: false,
      browserMarkAllCleared: false,
      finalUnreadCount: 1,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "notification list expected 3 seeded rows, got 2",
      "unread count expected 2 seeded unread rows, got 1",
      "unread report_due filter expected two fixture notifications",
      "type report_due filter expected 2 rows, got 1",
      "single notification read mutation did not set readAt",
      "unread count after single read expected 1, got 2",
      "report_due preference update was not persisted",
      "default trial_lifecycle preference was missing",
      "browser notification inbox row was not visible",
      "browser unread count was not visible",
      "browser preference row was not visible",
      "browser mark-all-read action did not clear unread state",
      "final unread count expected 0, got 1",
    ]);
  });

  it("does not treat empty results as a complete production run", () => {
    expect(isCompleteRun([], NOTIFICATION_STRESS_SCENARIOS)).toBe(false);
    expect(
      isCompleteRun(
        NOTIFICATION_STRESS_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          pass: true,
        })),
        NOTIFICATION_STRESS_SCENARIOS,
      ),
    ).toBe(true);
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_NOTIFICATION_STRESS_LIMIT: "NaN" })).toHaveLength(1);
  });

  it("refuses to use the Supabase rehearsal URL as the direct DB target", () => {
    expect(() =>
      databaseUrl({
        DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
        SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
      }),
    ).toThrow("Refusing to use SUPABASE_MIGRATION_DB_URL for production E2E database access.");

    expect(
      databaseUrl({
        DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
        SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
        GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@prod.supabase.co/postgres",
      }),
    ).toBe("postgres://postgres:pass@prod.supabase.co/postgres");

    expect(() =>
      databaseUrl({
        DATABASE_URL: "postgres://postgres:pass@prod.supabase.co/postgres",
        SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
        GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
      }),
    ).toThrow("Refusing to use SUPABASE_MIGRATION_DB_URL for production E2E database access.");
  });

  it("requires explicit Supabase direct DB targeting after cutover", () => {
    expect(() =>
      databaseUrl({
        DATABASE_URL: "postgres://postgres:pass@old.neon.tech/postgres",
        EXPECTED_PROD_DB_PROVIDER: "supabase",
      }),
    ).toThrow("GRANTPIPE_PROD_DATABASE_URL is required");

    expect(() =>
      databaseUrl({
        GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@old.neon.tech/postgres",
        EXPECTED_PROD_DB_PROVIDER: "supabase",
      }),
    ).toThrow("Production E2E database access must use a Supabase database URL");

    expect(
      databaseUrl({
        GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@db.project.supabase.co/postgres",
        EXPECTED_PROD_DB_PROVIDER: "supabase",
      }),
    ).toBe("postgres://postgres:pass@db.project.supabase.co/postgres");
  });

  it("redacts sensitive report values", () => {
    expect(redactForReport("Email sam@example.org cookie: gp=abc token Secret-12345")).toBe(
      "Email [redacted-email] cookie: [redacted-token] token [redacted-token]",
    );
  });

  it("builds notifications routes through an exported helper", () => {
    expect(buildNotificationsRoute("read=false&type=report_due")).toBe(
      "/api/notifications?read=false&type=report_due",
    );
  });

  it("uses notification, cleanup, auth, database, and artifact paths", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/notifications-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('"test-results", "live-e2e", "notifications"');
    expect(source).toContain('"/api/notifications"');
    expect(source).toContain('"/api/notifications/preferences"');
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain('"/api/grants"');
    expect(source).toContain("notification_preferences");
    expect(source).toContain("insert into notifications");
    expect(source).not.toContain("e2e:live:cleanup");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).not.toContain("Creating disposable account ${credentials.email}");
  });
});
