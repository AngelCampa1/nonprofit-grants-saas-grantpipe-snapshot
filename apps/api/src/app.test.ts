import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";

// Mutable mock state — tests can override these per scenario
const mockGetSession = vi.fn<
  () => Promise<{
    user: { id: string; email: string; name: string };
    session: { id: string; userId: string; token: string };
  } | null>
>();

const mockAuthHandler = vi.fn(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

const mockFindFirst = vi.fn<
  () => Promise<
    | {
        id: string;
        orgId: string;
        role: string;
        permissions?: Record<string, string> | null;
        deletedAt: Date | null;
      }
    | undefined
  >
>();

// Mutable mock for the organizations paywall query (used by requireActiveBilling)
const mockOrgFindFirst = vi.fn<
  () => Promise<
    | {
        id: string;
        subscriptionStatus: string | null;
        trialEndsAt: Date | null;
        planTier: string | null;
        onboardingCompleted?: boolean;
        onboardingGoal?: string | null;
        planSelectedAt?: Date | null;
        stripeSubscriptionId?: string | null;
        defaultEntityId?: string | null;
      }
    | undefined
  >
>();
const mockEntityFindFirst = vi.fn<
  () => Promise<
    | {
        id: string;
        orgId: string;
        status: string;
        deletedAt: Date | null;
      }
    | undefined
  >
>();
const mockEntityMemberFindFirst = vi.fn<
  () => Promise<
    | {
        entityId: string;
        role: string;
        permissions?: Record<string, string> | null;
        deletedAt: Date | null;
      }
    | undefined
  >
>();
const mockEntityMemberFindMany = vi.fn<() => Promise<unknown[]>>();
const mockDbExecute = vi.fn<() => Promise<unknown[] | { rows: unknown[] }>>();
const mockCloseDbHandle = vi.fn<() => Promise<void>>();

function buildSelectQuery() {
  const chain = {
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return chain;
    },
    offset: vi.fn(async () => []),
    then(resolve: (value: unknown[]) => unknown) {
      return Promise.resolve([]).then(resolve);
    },
  };

  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectQuery()),
  execute: mockDbExecute,
  query: {
    orgMembers: {
      findFirst: mockFindFirst,
    },
    organizations: {
      findFirst: mockOrgFindFirst,
    },
    entities: {
      findFirst: mockEntityFindFirst,
    },
    entityMembers: {
      findFirst: mockEntityMemberFindFirst,
      findMany: mockEntityMemberFindMany,
    },
  },
};

// Mock @grantpipe/db so no real DB connection is needed while preserving
// table exports consumed by mounted route modules.
vi.mock("@grantpipe/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/db")>();
  return {
    ...actual,
    createDb: vi.fn(() => mockDb),
    createDbHandle: vi.fn(async () => ({
      db: mockDb,
      close: mockCloseDbHandle,
    })),
    orgMembers: {
      ...actual.orgMembers,
      id: "orgMembers.id",
      joinedAt: "orgMembers.joinedAt",
      userId: "orgMembers.userId",
      orgId: "orgMembers.orgId",
      deletedAt: "orgMembers.deletedAt",
    },
    organizations: {
      ...actual.organizations,
      id: "organizations.id",
      defaultEntityId: "organizations.defaultEntityId",
    },
    entities: {
      ...actual.entities,
      id: "entities.id",
      orgId: "entities.orgId",
      status: "entities.status",
      deletedAt: "entities.deletedAt",
    },
    entityMembers: {
      ...actual.entityMembers,
      orgId: "entityMembers.orgId",
      entityId: "entityMembers.entityId",
      orgMemberId: "entityMembers.orgMemberId",
      deletedAt: "entityMembers.deletedAt",
    },
  };
});

// Mock drizzle-orm operators used in org-context inline middleware
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn(),
    isNull: vi.fn(),
    and: vi.fn(),
    desc: vi.fn(),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  };
});

// Mock Better Auth — getSession is swappable per test via mockGetSession
vi.mock("./lib/auth", () => ({
  createAuth: () => ({
    handler: (...args: Parameters<typeof mockAuthHandler>) => mockAuthHandler(...args),
    api: { getSession: (...args: Parameters<typeof mockGetSession>) => mockGetSession(...args) },
  }),
}));

// Capture the Sentry options callback so tests can invoke it directly
// Must use vi.hoisted so the reference is available inside vi.mock factory
const { mockCaptureException, mockWithSentry } = vi.hoisted(() => {
  const mockCaptureException = vi.fn();
  const mockWithSentry = vi.fn((_optionsCb: unknown, handler: unknown) => handler);
  return { mockCaptureException, mockWithSentry };
});

const { mockAcceptInvite, mockCheckInvite } = vi.hoisted(() => ({
  mockAcceptInvite: vi.fn(),
  mockCheckInvite: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
  withSentry: mockWithSentry,
  captureException: mockCaptureException,
  addBreadcrumb: vi.fn(),
}));

vi.mock("./domains/notifications/reminders", () => ({
  sendScheduledGrantDeadlineReminders: vi.fn(),
  checkGrantSpendDownThresholds: vi.fn(),
}));

vi.mock("./domains/notifications/lapse-alerts", () => ({
  scanDonorLapseAlerts: vi.fn(),
}));

vi.mock("./domains/notifications/sentinel-alerts", () => ({
  scanBudgetSentinelAlerts: vi.fn(),
}));

vi.mock("./domains/notifications/anomaly-alerts", () => ({
  scanAccountingAnomalies: vi.fn(),
}));

vi.mock("./domains/notifications/email-delivery", () => ({
  dispatchPendingNotificationEmails: vi.fn(),
}));

vi.mock("./domains/notifications/pledge-alerts", () => ({
  scanPledgeInstallmentAlerts: vi.fn(),
  PLEDGE_ALERT_JOB: "notifications.pledge_tracker",
}));

vi.mock("./domains/trial-emails/service", () => ({
  runTrialEmailTick: vi.fn(),
  runTrialWrapupDiscoveryTick: vi.fn(),
}));

vi.mock("./domains/trial-emails/trial-expiry", () => ({
  runTrialExpiryTick: vi.fn(),
}));

vi.mock("./domains/accounting/recurringService", () => ({
  tickRecurring: vi.fn().mockResolvedValue({ ran: 0, errors: 0 }),
}));

const { mockProcessAwardIntakeQueue } = vi.hoisted(() => ({
  mockProcessAwardIntakeQueue: vi.fn(async (_batch: unknown, _env: unknown) => undefined),
}));

vi.mock("./domains/document-extractions/queue", () => ({
  processAwardIntakeQueue: (batch: unknown, env: unknown) =>
    mockProcessAwardIntakeQueue(batch, env),
}));

const { mockRedispatchPendingAwardIntakes } = vi.hoisted(() => ({
  mockRedispatchPendingAwardIntakes: vi.fn(async () => ({
    attempted: 0,
    dispatched: 0,
    failed: 0,
  })),
}));

vi.mock("./domains/document-extractions/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/document-extractions/service")>();
  return {
    ...actual,
    redispatchPendingAwardIntakes: mockRedispatchPendingAwardIntakes,
  };
});

const { mockRecoverCustomReports, mockRecoverRollforwards } = vi.hoisted(() => ({
  mockRecoverCustomReports: vi.fn(async () => 0),
  mockRecoverRollforwards: vi.fn(async () => 0),
}));

const { mockRecoverComplianceArtifacts } = vi.hoisted(() => ({
  mockRecoverComplianceArtifacts: vi.fn(async () => 0),
}));

const { mockDispatchPendingReportReadyEffects } = vi.hoisted(() => ({
  mockDispatchPendingReportReadyEffects: vi.fn(async () => 0),
}));

const { mockRedispatchPendingLeadDeliveries } = vi.hoisted(() => ({
  mockRedispatchPendingLeadDeliveries: vi.fn(async () => undefined),
}));

const { mockRedispatchPendingInvitations } = vi.hoisted(() => ({
  mockRedispatchPendingInvitations: vi.fn(async () => 0),
}));

vi.mock("./domains/leads/delivery.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/leads/delivery.service")>();
  return {
    ...actual,
    redispatchPendingLeadDeliveries: mockRedispatchPendingLeadDeliveries,
  };
});

vi.mock("./domains/external-reviewers/invitation-delivery.service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("./domains/external-reviewers/invitation-delivery.service")
    >();
  return {
    ...actual,
    redispatchPendingInvitations: mockRedispatchPendingInvitations,
  };
});

vi.mock("./domains/report-builder/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/report-builder/service")>();
  return { ...actual, recoverPendingCustomReports: mockRecoverCustomReports };
});

vi.mock("./domains/compliance/recovery.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/compliance/recovery.service")>();
  return {
    ...actual,
    recoverPendingComplianceArtifacts: mockRecoverComplianceArtifacts,
  };
});

vi.mock("./domains/report-builder/ready-effects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/report-builder/ready-effects")>();
  return {
    ...actual,
    dispatchPendingReportReadyEffects: mockDispatchPendingReportReadyEffects,
  };
});

vi.mock("./domains/restrictions/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/restrictions/service")>();
  return { ...actual, recoverPendingRestrictedRollforwards: mockRecoverRollforwards };
});

vi.mock("./domains/overview/service", () => ({
  getDashboardOverview: vi.fn(),
  getCalendarOverview: vi.fn(),
}));

vi.mock("./domains/auth/service", () => ({
  acceptInvite: (...args: Parameters<typeof mockAcceptInvite>) => mockAcceptInvite(...args),
  checkInvite: (...args: Parameters<typeof mockCheckInvite>) => mockCheckInvite(...args),
}));

import { createDbHandle, orgMembers } from "@grantpipe/db";
import { desc } from "drizzle-orm";
import appHandler, { app } from "./app";
import { _resetAuthRateLimit } from "./lib/auth-rate-limit";
import { tickRecurring } from "./domains/accounting/recurringService";
import { runTrialEmailTick, runTrialWrapupDiscoveryTick } from "./domains/trial-emails/service";
import { runTrialExpiryTick } from "./domains/trial-emails/trial-expiry";
import {
  checkGrantSpendDownThresholds,
  sendScheduledGrantDeadlineReminders,
} from "./domains/notifications/reminders";
import { getDashboardOverview } from "./domains/overview/service";
import type { AppEnv } from "./types";

const MOCK_ENV = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "test-secret",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  APP_URL: "http://localhost:5173",
  MARKETING_DB: {} as D1Database,
};

const makeRequest = (path: string, init?: RequestInit) => app.request(path, init, MOCK_ENV);

const MOCK_SESSION = {
  user: { id: "user-1", email: "user@example.com", name: "Test User" },
  session: { id: "session-1", userId: "user-1", token: "tok" },
};

const MOCK_MEMBER = {
  id: "org-member-1",
  orgId: "org-1",
  role: "admin",
  deletedAt: null,
};

describe("API app", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCloseDbHandle.mockResolvedValue(undefined);
    // Default: no session (unauthenticated)
    mockGetSession.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(undefined);
    mockOrgFindFirst.mockResolvedValue({
      id: "org-1",
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      planTier: "starter",
      onboardingCompleted: false,
      planSelectedAt: null,
      stripeSubscriptionId: null,
      defaultEntityId: "entity-default",
    });
    mockEntityFindFirst.mockResolvedValue({
      id: "entity-default",
      orgId: "org-1",
      status: "active",
      deletedAt: null,
    });
    mockEntityMemberFindFirst.mockResolvedValue({
      entityId: "entity-default",
      role: "admin",
      deletedAt: null,
    });
    mockEntityMemberFindMany.mockResolvedValue([
      {
        entityId: "entity-default",
        role: "admin",
        permissions: null,
        entity: {
          id: "entity-default",
          name: "Default Entity",
          kind: "root",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          deletedAt: null,
        },
      },
    ]);
    mockDbExecute.mockResolvedValue([]);
    mockAuthHandler.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    _resetAuthRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET /api/health", () => {
    it("returns 200 with status ok (public route, no auth needed)", async () => {
      const res = await makeRequest("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });

    it("exposes a DB-backed cutover health check without leaking credentials", async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ database: "grantpipe", schema_name: "public" }],
      });

      const res = await app.request(
        "/api/health/db",
        {
          headers: { "x-grantpipe-cutover-secret": "cutover-secret" },
        },
        {
          ...MOCK_ENV,
          DATABASE_URL: "postgres://user:secret@db.example.supabase.com/postgres",
          HYPERDRIVE: {
            connectionString: "postgres://user:secret@db.example.supabase.com/postgres",
          },
          CUTOVER_DB_HEALTH_ENABLED: "1",
          CUTOVER_DB_HEALTH_SECRET: "cutover-secret",
        },
      );

      expect(res.status).toBe(200);
      expect(createDbHandle).toHaveBeenCalledWith(
        "postgres://user:secret@db.example.supabase.com/postgres",
        {
          connectionString: "postgres://user:secret@db.example.supabase.com/postgres",
        },
      );
      const body = await res.json();
      expect(body).toEqual({
        status: "ok",
        database: "grantpipe",
        schema: "public",
        connection: {
          host: "db.example.supabase.com",
          mode: "hyperdrive",
        },
      });
      expect(JSON.stringify(body)).not.toContain("secret");
    });

    it("hides the DB-backed cutover health check when disabled", async () => {
      const res = await app.request("/api/health/db", undefined, {
        ...MOCK_ENV,
        DATABASE_URL: "postgres://user:secret@db.example.supabase.com/postgres",
      });

      expect(res.status).toBe(404);
    });

    it("requires the cutover health secret header", async () => {
      const res = await app.request("/api/health/db", undefined, {
        ...MOCK_ENV,
        DATABASE_URL: "postgres://user:secret@db.example.supabase.com/postgres",
        CUTOVER_DB_HEALTH_ENABLED: "1",
        CUTOVER_DB_HEALTH_SECRET: "cutover-secret",
      });

      expect(res.status).toBe(403);
    });

    it("reports direct DB mode for non-Hyperdrive cutover health checks", async () => {
      mockDbExecute.mockResolvedValueOnce([{ database: "grantpipe", schema_name: "public" }]);

      const res = await app.request(
        "/api/health/db",
        {
          headers: { "x-grantpipe-cutover-secret": "cutover-secret" },
        },
        {
          ...MOCK_ENV,
          DATABASE_URL: "postgres://user:secret@db.example.supabase.com/postgres",
          CUTOVER_DB_HEALTH_ENABLED: "1",
          CUTOVER_DB_HEALTH_SECRET: "cutover-secret",
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        status: "ok",
        database: "grantpipe",
        schema: "public",
        connection: {
          host: "db.example.supabase.com",
          mode: "direct",
        },
      });
    });

    it("handles missing DB metadata rows in the cutover health check", async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [{}] });

      const res = await app.request(
        "/api/health/db",
        {
          headers: { "x-grantpipe-cutover-secret": "cutover-secret" },
        },
        {
          ...MOCK_ENV,
          DATABASE_URL: "postgres://user:secret@db.example.supabase.com/postgres",
          CUTOVER_DB_HEALTH_ENABLED: "1",
          CUTOVER_DB_HEALTH_SECRET: "cutover-secret",
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        database: null,
        schema: null,
      });
    });
  });

  describe("POST /api/public/marketing/analytics", () => {
    it("captures outbound signup analytics without requiring auth or DB setup", async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("{}"),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      try {
        const res = await app.request(
          "/api/public/marketing/analytics",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "outbound_signup_completed",
              properties: {
                method: "email",
                auto_signin: true,
                has_invite: false,
                ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
                ve_variant: "plain_founder",
                ve_step: "1",
                ve_sequence_day: "1",
                ref: "must-not-be-sent@example.org",
              },
            }),
          },
          {
            ...MOCK_ENV,
            POSTHOG_API_KEY: "phc_test",
            POSTHOG_HOST: "https://us.i.posthog.com",
          },
        );

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(mockCloseDbHandle).not.toHaveBeenCalled();
        const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
          event: string;
          distinct_id: string;
          properties: Record<string, unknown>;
        };
        expect(body).toMatchObject({
          event: "outbound_signup_completed",
          distinct_id: "outbound:grantpipe-grants-deadline-drift-2026_06-01:plain_founder",
          properties: {
            method: "email",
            auto_signin: true,
            ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
            ve_variant: "plain_founder",
            ve_sequence_day: "1",
            source_app: "signup_api",
          },
        });
        expect(JSON.stringify(body)).not.toContain("must-not-be-sent@example.org");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("unknown routes", () => {
    it("returns 401 for unrecognised paths (session middleware intercepts before 404)", async () => {
      // In Hono, wildcard `use("*")` middleware runs for every request, including
      // paths that have no matching route handler. The session middleware fires
      // before Hono would generate a 404, so unauthenticated requests to unknown
      // paths get a 401, not a 404.
      const res = await makeRequest("/api/nonexistent");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/auth/session (protected)", () => {
    it("returns 401 when no session cookie is present", async () => {
      const res = await makeRequest("/api/auth/session");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 403 when session is valid but user has no org membership", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(undefined);

      const res = await makeRequest("/api/auth/session");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "No organization membership" });
    });

    it("returns 200 with session data when fully authenticated with org membership", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);

      const res = await makeRequest("/api/auth/session");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        user: { id: string; email: string; name: string };
        session: { id: string };
        orgId: string;
        memberRole: string;
        onboardingCompleted: boolean;
        planSelectionCompleted: boolean;
      };
      expect(body).toMatchObject({
        user: { id: "user-1", email: "user@example.com", name: "Test User" },
        session: { id: "session-1" },
        orgId: "org-1",
        memberRole: "admin",
        onboardingCompleted: false,
        planSelectionCompleted: false,
      });
      expect(body.session).toEqual({ id: "session-1" });

      // Verify the org-context middleware queries by joinedAt desc
      expect(vi.mocked(desc)).toHaveBeenCalledWith(orgMembers.joinedAt);
      const findFirstCall = (mockFindFirst.mock.calls as unknown[][])[0]?.[0] as
        | { orderBy?: unknown }
        | undefined;
      expect(Array.isArray(findFirstCall?.orderBy)).toBe(true);
    });
  });

  describe("GET /api/compliance/reports (protected)", () => {
    it("is mounted behind auth and org context", async () => {
      const res = await makeRequest("/api/compliance/reports");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  describe("GET /api/overview/dashboard (protected)", () => {
    it("returns the overview payload when the user is authenticated", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      vi.mocked(getDashboardOverview).mockResolvedValue({
        asOf: "2026-04-08T00:00:00.000Z",
        executiveSnapshot: {
          status: "clear",
          statusLabel: "Under control",
          statusDescription: "No urgent grant or reporting work needs attention.",
          primaryMetricLabel: "Grant health",
          primaryMetricValue: "0 urgent",
          secondaryMetricLabel: "Upcoming deadlines",
          secondaryMetricValue: "0 next 30 days",
          priorityActions: [],
        },
        upcomingDeadlines: [],
        atRiskGrants: [],
        complianceHealth: {
          overdueGrantCount: 0,
          atRiskGrantCount: 0,
          upcomingDeadlineCount: 0,
          restrictedFundWatchCount: 0,
          auditEvidenceEventCount: 0,
        },
        boardReportFreshness: {
          latestReportId: null,
          latestReportTitle: null,
          latestGeneratedAt: null,
          daysSinceLatestReport: null,
        },
        recentActivity: [],
        donorMetrics: {
          totalDonors: 0,
          totalGivingThisFY: 0,
          previousFiscalYearGivingCents: 0,
          newDonorsThisFY: 0,
          retentionRate: 0,
        },
        pipelineSummary: {
          donor: [],
          grants: [],
        },
        fundBalancesOverview: [],
        dashboardLayout: {
          pinnedWidgetIds: ["executive_snapshot"],
          source: "default",
        },
      });

      const res = await makeRequest("/api/overview/dashboard");

      expect(res.status).toBe(200);
      expect(getDashboardOverview).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: "org-1" }),
      );
    });
  });

  describe("Better Auth handler", () => {
    it("GET /api/auth/better/* is handled without requiring a session", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/email");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("POST /api/auth/better/* is handled without requiring a session", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "password" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("logs correlation metadata when Better Auth returns a 5xx response", async () => {
      mockAuthHandler.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "INTERNAL_SERVER_ERROR", error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await makeRequest("/api/auth/better/sign-up/email", {
        method: "POST",
        headers: {
          "cf-ray": "ray-500",
          "x-request-id": "req-500",
        },
      });

      expect(res.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] Better Auth 5xx response",
        expect.objectContaining({
          path: "/api/auth/better/sign-up/email",
          method: "POST",
          cfRay: "ray-500",
          requestId: "req-500",
          status: 500,
          code: "INTERNAL_SERVER_ERROR",
        }),
      );
      // The 5xx auth failure is also reported to Sentry, not just the console.
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Better Auth 5xx response: INTERNAL_SERVER_ERROR" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            surface: "auth",
            path: "/api/auth/better/sign-up/email",
            status: "500",
            code: "INTERNAL_SERVER_ERROR",
          }),
        }),
      );
    });

    it("rejects a malformed JSON body with a 400 before reaching Better Auth", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Better Auth would throw a SyntaxError on this body and return a 500,
        // which would falsely page Sentry as an auth outage. We short-circuit
        // to a 400 (client error) instead.
        body: "{ not json",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "Invalid request body" });
      // The malformed request must never reach the Better Auth handler, so it
      // cannot produce a 5xx that gets captured to Sentry.
      expect(mockAuthHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("passes a valid JSON body through to Better Auth unchanged", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google" }),
      });

      expect(res.status).toBe(200);
      expect(mockAuthHandler).toHaveBeenCalledTimes(1);
      // Assert the body survives the guard's clone-and-read: Better Auth must
      // still receive the original, intact request stream — a regression to a
      // direct (consuming) read would break production sign-in while this test
      // otherwise stayed green.
      const calls = mockAuthHandler.mock.calls as unknown as Array<[Request]>;
      const firstCall = calls[0];
      expect(firstCall).toBeDefined();
      const receivedBody = await firstCall![0].text();
      expect(receivedBody).toBe(JSON.stringify({ provider: "google" }));
    });

    it("rejects an oversized JSON body with 413 before reaching Better Auth", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", padding: "x".repeat(20_000) }),
      });

      expect(res.status).toBe(413);
      await expect(res.json()).resolves.toEqual({ error: "Payload too large" });
      expect(mockAuthHandler).not.toHaveBeenCalled();
    });

    it("rejects an empty application/json body with a 400 before reaching Better Auth", async () => {
      // `JSON.parse("")` throws "Unexpected end of JSON input", which Better Auth
      // surfaces as a 500 and falsely pages Sentry. The Better Auth client always
      // sends a real JSON body (sign-out posts `{}`), so a json-typed empty body
      // is a scanner/probe and must be short-circuited to a 400.
      const res = await makeRequest("/api/auth/better/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "Invalid request body" });
      expect(mockAuthHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("ignores non-JSON content types when validating the request body", async () => {
      const res = await makeRequest("/api/auth/better/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{ not json",
      });

      // Non-JSON bodies are not Better Auth's JSON path, so we do not gate them;
      // the handler runs and returns its mocked success response.
      expect(res.status).toBe(200);
      expect(mockAuthHandler).toHaveBeenCalledTimes(1);
    });

    it("does not expose auth runtime diagnostics on Better Auth 5xx responses", async () => {
      mockAuthHandler.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const res = await app.request(
        "/api/auth/better/sign-in/social",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "google" }),
        },
        {
          ...MOCK_ENV,
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: undefined,
        } as unknown as AppEnv["Bindings"],
      );

      expect(res.status).toBe(500);
      expect(res.headers.get("x-grantpipe-auth-diagnostic")).toBeNull();
      expect(res.headers.get("x-grantpipe-auth-error")).toBeNull();
    });

    it("falls back to cf-request-id and tolerates invalid JSON bodies in 5xx auth responses", async () => {
      mockAuthHandler.mockResolvedValueOnce(
        new Response("{", {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await makeRequest("/api/auth/better/sign-up/email", {
        method: "POST",
        headers: {
          "cf-request-id": "cf-500",
        },
      });

      expect(res.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] Better Auth 5xx response",
        expect.objectContaining({
          requestId: "cf-500",
          code: null,
        }),
      );
    });

    it("falls back to x-correlation-id when other request ids are absent", async () => {
      mockAuthHandler.mockResolvedValueOnce(
        new Response("boom", {
          status: 503,
          headers: { "content-type": "text/plain" },
        }),
      );

      const res = await makeRequest("/api/auth/better/sign-up/email", {
        method: "POST",
        headers: {
          "x-correlation-id": "corr-500",
        },
      });

      expect(res.status).toBe(503);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] Better Auth 5xx response",
        expect.objectContaining({
          requestId: "corr-500",
          code: null,
          status: 503,
        }),
      );
    });

    it("logs a null auth code when a JSON 5xx response omits a string code field", async () => {
      mockAuthHandler.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 500 }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await makeRequest("/api/auth/better/sign-up/email", {
        method: "POST",
      });

      expect(res.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] Better Auth 5xx response",
        expect.objectContaining({
          code: null,
        }),
      );
    });

    it("treats missing content-type headers as non-JSON 5xx auth responses", async () => {
      mockAuthHandler.mockResolvedValueOnce(
        new Response(null, {
          status: 500,
        }),
      );

      const res = await makeRequest("/api/auth/better/sign-up/email", {
        method: "POST",
      });

      expect(res.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] Better Auth 5xx response",
        expect.objectContaining({
          code: null,
          status: 500,
        }),
      );
    });

    it("rate-limits repeated POST sign-in/email from the same IP with a 429", async () => {
      const signIn = () =>
        makeRequest("/api/auth/better/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "203.0.113.10",
          },
          body: JSON.stringify({ email: "a@example.com", password: "x" }),
        });

      // The sign-in cap is 10 requests per window.
      for (let i = 0; i < 10; i++) {
        expect((await signIn()).status).toBe(200);
      }
      const blocked = await signIn();
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "Too many requests" });
    });

    it("applies a tighter cap to POST forget-password (password-reset bombing)", async () => {
      const forget = () =>
        makeRequest("/api/auth/better/forget-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "203.0.113.11",
          },
          body: JSON.stringify({ email: "victim@example.com" }),
        });

      // The password-reset cap is 5 requests per window.
      for (let i = 0; i < 5; i++) {
        expect((await forget()).status).toBe(200);
      }
      expect((await forget()).status).toBe(429);
    });

    it("uses the production Durable Object limiter when the binding is present", async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: false }));
      const get = vi.fn().mockReturnValue({ fetch });
      const idFromName = vi.fn().mockReturnValue({ name: "counter-id" });
      const env = {
        ...MOCK_ENV,
        AUTH_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
      };

      const res = await app.request(
        "/api/auth/better/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "203.0.113.12",
          },
          body: JSON.stringify({ email: "a@example.com", password: "x" }),
        },
        env,
      );

      expect(res.status).toBe(429);
      expect(idFromName).toHaveBeenCalledWith("auth:sign-in:203.0.113.12");
      expect(get).toHaveBeenCalledWith({ name: "counter-id" });
      expect(fetch).toHaveBeenCalledWith(
        "https://auth-rate-limiter.internal/take",
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockAuthHandler).not.toHaveBeenCalled();
    });

    it("captures a missing production limiter binding once while failing open", async () => {
      const env = { ...MOCK_ENV, INTEGRATION_MODE: "real" as const, AUTH_RATE_LIMITER: undefined };
      const request = () =>
        app.request(
          "/api/auth/better/sign-in/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "cf-connecting-ip": "203.0.113.15",
            },
            body: JSON.stringify({ email: "a@example.com", password: "x" }),
          },
          env,
        );

      expect((await request()).status).toBe(200);
      expect((await request()).status).toBe(200);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: {
          surface: "auth-rate-limit",
          kind: "sign-in",
          reason: "missing_production_binding",
        },
      });
    });

    it("rate-limits per IP independently", async () => {
      const signIn = (ip: string) =>
        makeRequest("/api/auth/better/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
          body: JSON.stringify({ email: "a@example.com", password: "x" }),
        });

      for (let i = 0; i < 10; i++) {
        await signIn("203.0.113.20");
      }
      expect((await signIn("203.0.113.20")).status).toBe(429);
      // A different IP is unaffected.
      expect((await signIn("203.0.113.21")).status).toBe(200);
    });

    it("does not rate-limit GET requests to abuse-sensitive paths", async () => {
      for (let i = 0; i < 15; i++) {
        const res = await makeRequest("/api/auth/better/sign-in/email");
        expect(res.status).toBe(200);
      }
    });

    it("rate-limits sign-up by IP before Better Auth can create unbounded trials", async () => {
      for (let i = 0; i < 5; i++) {
        const res = await makeRequest("/api/auth/better/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.30" },
          body: JSON.stringify({ email: "new@example.com", password: "x" }),
        });
        expect(res.status).toBe(200);
      }
      expect(
        (
          await makeRequest("/api/auth/better/sign-up/email", {
            method: "POST",
            headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.30" },
            body: JSON.stringify({ email: "new@example.com", password: "x" }),
          })
        ).status,
      ).toBe(429);
    });

    it("rate-limits sign-up by HMAC email identity without exposing the email in durable keys", async () => {
      const idFromName = vi.fn((name: string) => ({ name }));
      const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
      const env = {
        ...MOCK_ENV,
        AUTH_RATE_LIMITER: {
          idFromName,
          get: vi.fn(() => ({ fetch })),
        } as unknown as DurableObjectNamespace,
      };

      const response = await app.request(
        "/api/auth/better/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.31" },
          body: JSON.stringify({ email: "Private@Example.org", password: "x" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(idFromName).toHaveBeenCalledTimes(2);
      expect(idFromName).toHaveBeenCalledWith("auth:sign-up:203.0.113.31");
      expect(idFromName.mock.calls[1]?.[0]).toMatch(/^auth:sign-up-email:[a-f0-9]{64}$/);
      expect(JSON.stringify(idFromName.mock.calls)).not.toContain("private@example.org");
    });

    it("blocks a reused sign-up email even when its current IP counter is available", async () => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ allowed: true }))
        .mockResolvedValueOnce(Response.json({ allowed: false }));
      const env = {
        ...MOCK_ENV,
        AUTH_RATE_LIMITER: {
          idFromName: vi.fn((name: string) => ({ name })),
          get: vi.fn(() => ({ fetch })),
        } as unknown as DurableObjectNamespace,
      };

      const response = await app.request(
        "/api/auth/better/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.32" },
          body: JSON.stringify({ email: "same@example.org", password: "x" }),
        },
        env,
      );

      expect(response.status).toBe(429);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockAuthHandler).not.toHaveBeenCalled();
    });

    it("does not create an email counter from a non-string sign-up identity", async () => {
      const idFromName = vi.fn((name: string) => ({ name }));
      const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
      const env = {
        ...MOCK_ENV,
        AUTH_RATE_LIMITER: {
          idFromName,
          get: vi.fn(() => ({ fetch })),
        } as unknown as DurableObjectNamespace,
      };

      const response = await app.request(
        "/api/auth/better/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.33" },
          body: JSON.stringify({ email: 123, password: "x" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(idFromName).toHaveBeenCalledTimes(1);
      expect(idFromName).toHaveBeenCalledWith("auth:sign-up:203.0.113.33");
    });
  });

  describe("invite acceptance bootstrap", () => {
    it("allows signed-in users without an existing org membership to accept an invite", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(undefined);
      mockAcceptInvite.mockResolvedValue({ orgId: "org-2", role: "viewer" });

      const res = await makeRequest("/api/auth/invites/token-1/accept", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ orgId: "org-2", role: "viewer" });
      expect(mockAcceptInvite).toHaveBeenCalledWith(expect.anything(), {
        token: "token-1",
        userId: "user-1",
        userEmail: "user@example.com",
      });
    });
  });

  describe("queue handler", () => {
    it("dispatches queue batches only to the award intake processor", async () => {
      const batch = {
        messages: [
          {
            body: {
              extractionJobId: "job-1",
              orgId: "org-1",
              documentId: "doc-1",
            },
          },
        ],
      };

      await appHandler.queue(batch, MOCK_ENV as AppEnv["Bindings"]);

      expect(mockProcessAwardIntakeQueue).toHaveBeenCalledTimes(1);
      expect(mockProcessAwardIntakeQueue).toHaveBeenCalledWith(batch, MOCK_ENV);
    });

    it("retries award intake queue batches during read-only maintenance", async () => {
      const batch = {
        retryAll: vi.fn(),
        messages: [
          {
            body: {
              extractionId: "job-1",
              orgId: "org-1",
            },
          },
        ],
      };

      await appHandler.queue(batch, {
        ...MOCK_ENV,
        MAINTENANCE_MODE: "read_only",
      } as AppEnv["Bindings"]);

      expect(mockProcessAwardIntakeQueue).not.toHaveBeenCalled();
      expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 300 });
    });
  });

  describe("scheduled handler", () => {
    it("opens one shared Postgres handle for scheduled jobs after GrantPipe nurture moved to Sequencer", async () => {
      // Prior design opened one pg.Client per scheduled job (4x) and all four
      // `connect()` calls raced on the database connection startup window, timing out
      // together (GRANTPIPE-API-7/D/E/F/G). The correct shape is ONE shared
      // Pool per invocation so pool members open lazily as jobs
      // concurrently issue queries (Hyperdrive is intentionally not used here —
      // see GRANTPIPE-API-J and the comment in app.ts).
      const env = {
        ...MOCK_ENV,
        DATABASE_URL: "postgres://scheduled-test",
      };

      await appHandler.scheduled({ cron: "0 * * * *" }, env);

      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(createDbHandle)).toHaveBeenCalledWith(
        "postgres://scheduled-test",
        undefined,
      );
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalledWith(
        mockDb,
        env,
        "0 * * * *",
      );
      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalledWith(
        mockDb,
        env,
        "0 * * * *",
      );
      expect(vi.mocked(tickRecurring)).toHaveBeenCalledWith(mockDb);
      expect(vi.mocked(runTrialWrapupDiscoveryTick)).toHaveBeenCalledWith(mockDb, undefined, env);
      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalledWith(mockDb, env);
      expect(vi.mocked(runTrialWrapupDiscoveryTick).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(runTrialEmailTick).mock.invocationCallOrder[0]!,
      );
      expect(vi.mocked(runTrialExpiryTick)).toHaveBeenCalledWith(mockDb, env);
      expect(mockRedispatchPendingAwardIntakes).toHaveBeenCalledWith(mockDb, env);
      expect(mockRecoverCustomReports).toHaveBeenCalledWith(mockDb, env);
      expect(mockRecoverRollforwards).toHaveBeenCalledWith(mockDb, env);
      expect(mockRecoverComplianceArtifacts).toHaveBeenCalledWith(mockDb, env);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("pre-warms Postgres without touching the retired D1 marketing binding", async () => {
      const env = {
        ...MOCK_ENV,
        MARKETING_DB: { marker: "marketing-d1" } as unknown as D1Database,
      };

      await appHandler.scheduled({ cron: "0 10,22 * * *" }, env);

      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(mockDbExecute).toHaveBeenCalledTimes(1);
    });

    it("does not require the retired D1 marketing binding for scheduled jobs", async () => {
      const env = { ...MOCK_ENV, MARKETING_DB: undefined };

      await appHandler.scheduled({ cron: "0 * * * *" }, env);

      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("passes HYPERDRIVE to createDbHandle when the binding is present in scheduled env", async () => {
      // Scheduled jobs use the same provider-neutral Postgres path as HTTP
      // requests after the Supabase cutover, including Hyperdrive when bound.
      const hyperdrive = { connectionString: "postgres://user:pass@localhost:5432/grantpipe" };
      const env = {
        ...MOCK_ENV,
        DATABASE_URL: "postgres://user:pass@db.supabase.co:5432/postgres",
        HYPERDRIVE: hyperdrive,
      };

      await appHandler.scheduled({ cron: "0 * * * *" }, env);

      expect(vi.mocked(createDbHandle)).toHaveBeenCalledWith(
        "postgres://user:pass@db.supabase.co:5432/postgres",
        hyperdrive,
      );
      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("skips scheduled database work during read-only maintenance", async () => {
      await appHandler.scheduled({ cron: "0 * * * *" }, {
        ...MOCK_ENV,
        MAINTENANCE_MODE: "read_only",
      } as AppEnv["Bindings"]);

      expect(vi.mocked(createDbHandle)).not.toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).not.toHaveBeenCalled();
      expect(vi.mocked(runTrialWrapupDiscoveryTick)).not.toHaveBeenCalled();
      expect(vi.mocked(runTrialEmailTick)).not.toHaveBeenCalled();
      expect(vi.mocked(runTrialExpiryTick)).not.toHaveBeenCalled();
    });

    it("captures failing scheduled jobs, continues independent jobs, closes the shared handle, and rethrows", async () => {
      const deadlineError = new Error("deadline failed");
      vi.mocked(sendScheduledGrantDeadlineReminders).mockRejectedValueOnce(deadlineError);

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        "One or more scheduled GrantPipe jobs failed",
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "notifications.deadlines",
            surface: "scheduled",
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("deadline failed");
      // With Promise.allSettled, the surviving jobs still run in parallel.
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).toHaveBeenCalled();
      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalled();
      // Single shared handle — opened and closed exactly once even when
      // individual jobs fail.
      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("isolates a D1 lead recovery failure while Postgres-backed jobs still run", async () => {
      const leadRecoveryError = new Error("lead recovery failed");
      mockRedispatchPendingLeadDeliveries.mockRejectedValueOnce(leadRecoveryError);

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        "One or more scheduled GrantPipe jobs failed",
      );

      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "leads.magnet-delivery",
            surface: "scheduled",
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("lead recovery failed");
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("starts Postgres jobs before a pending D1 lead recovery finishes", async () => {
      let finishLeadRecovery: (() => void) | undefined;
      mockRedispatchPendingLeadDeliveries.mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            finishLeadRecovery = () => resolve(undefined);
          }),
      );

      const scheduled = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);
      await vi.waitFor(() => {
        expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      });
      expect(finishLeadRecovery).toBeTypeOf("function");

      finishLeadRecovery?.();
      await scheduled;
    });

    it("awaits and aggregates D1 recovery when database handle construction fails", async () => {
      const handleError = new Error("invalid database URL");
      const leadError = new Error("lead recovery failed");
      let releaseLeadRecovery!: () => void;
      mockRedispatchPendingLeadDeliveries.mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            releaseLeadRecovery = () => reject(leadError);
          }),
      );
      vi.mocked(createDbHandle).mockRejectedValueOnce(handleError);

      let settled = false;
      const scheduled = appHandler
        .scheduled({ cron: "0 * * * *" }, MOCK_ENV)
        .catch((error: unknown) => error)
        .finally(() => {
          settled = true;
        });

      await vi.waitFor(() => expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(settled).toBe(false);

      releaseLeadRecovery();
      const thrown = await scheduled;

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toEqual([handleError, leadError]);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "database.handle",
            surface: "scheduled",
          }),
        }),
      );
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "leads.magnet-delivery",
            surface: "scheduled",
          }),
        }),
      );
    });

    it("preserves the database handle error after a successful D1 recovery", async () => {
      const handleError = new Error("invalid database URL");
      vi.mocked(createDbHandle).mockRejectedValueOnce(handleError);

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toBe(handleError);

      expect(mockRedispatchPendingLeadDeliveries).toHaveBeenCalledOnce();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "database.handle",
            surface: "scheduled",
          }),
        }),
      );
    });

    it("isolates each report recovery stage when custom report recovery fails", async () => {
      mockRecoverCustomReports.mockRejectedValueOnce(new Error("custom recovery failed"));

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        "One or more scheduled GrantPipe jobs failed",
      );

      expect(mockRecoverRollforwards).toHaveBeenCalledWith(mockDb, MOCK_ENV);
      expect(mockRecoverComplianceArtifacts).toHaveBeenCalledWith(mockDb, MOCK_ENV);
      expect(mockDispatchPendingReportReadyEffects).toHaveBeenCalledWith(mockDb, MOCK_ENV);
    });

    it("isolates compliance artifact recovery from the other report recovery jobs", async () => {
      mockRecoverComplianceArtifacts.mockRejectedValueOnce(new Error("compliance recovery failed"));

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        "One or more scheduled GrantPipe jobs failed",
      );

      expect(mockRecoverCustomReports).toHaveBeenCalledWith(mockDb, MOCK_ENV);
      expect(mockRecoverRollforwards).toHaveBeenCalledWith(mockDb, MOCK_ENV);
      expect(mockDispatchPendingReportReadyEffects).toHaveBeenCalledWith(mockDb, MOCK_ENV);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "report-exports.compliance-recovery",
            surface: "scheduled",
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
        "compliance recovery failed",
      );
    });

    it("delivers scheduled trial email rows when wrapup discovery fails", async () => {
      vi.mocked(runTrialWrapupDiscoveryTick).mockRejectedValueOnce(
        new Error("wrapup discovery failed"),
      );

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        "One or more scheduled GrantPipe jobs failed",
      );

      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalledWith(mockDb, MOCK_ENV);
    });

    it("closes the shared handle even when createDbHandle resolves and all jobs throw persistent Postgres connect-timeout errors exhausting all retries", async () => {
      // Regression for GRANTPIPE-API-7/D/E/F/G: when the pooler surfaces
      // "Timed out while creating a new server connection." on every attempt
      // (not just the first), withDbRetry exhausts all backoffs and lets the
      // error propagate. The wrapper must (1) aggregate all into one
      // AggregateError, (2) tag each with its job name, and (3) still close
      // the shared handle — the pool's teardown must not leak even when every
      // job failed. Each job is rejected for all 3 attempts (initial + 2 retries).
      vi.useFakeTimers();
      const timeoutMessage = "Timed out while creating a new server connection.";
      const deadlineError = new Error(`Failed query: select ... from org_members ...`, {
        cause: new Error(timeoutMessage),
      });
      const spendDownError = new Error(`Failed query: select ... from grants ...`, {
        cause: new Error(timeoutMessage),
      });
      const recurringError = new Error(
        `Failed query: select ... from recurring_journal_templates ...`,
        { cause: new Error(timeoutMessage) },
      );

      // Reject for all 3 withDbRetry attempts (initial + 2 retries)
      vi.mocked(sendScheduledGrantDeadlineReminders).mockRejectedValue(deadlineError);
      vi.mocked(checkGrantSpendDownThresholds).mockRejectedValue(spendDownError);
      vi.mocked(tickRecurring).mockRejectedValue(recurringError);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);
      const thrownPromise = scheduledPromise.catch((err: unknown) => err);
      // Advance past all withDbRetry backoffs (250 + 750 ms = 1000 ms each job, run in parallel)
      await vi.advanceTimersByTimeAsync(1_000);
      const thrown = await thrownPromise;
      vi.useRealTimers();

      // Restore mocks to defaults so subsequent tests are unaffected
      vi.mocked(sendScheduledGrantDeadlineReminders).mockReset();
      vi.mocked(checkGrantSpendDownThresholds).mockReset();
      vi.mocked(tickRecurring).mockResolvedValue({ ran: 0, errors: 0 });

      expect(thrown).toBeInstanceOf(AggregateError);
      const aggregate = thrown as AggregateError;
      expect(aggregate.message).toBe("One or more scheduled GrantPipe jobs failed");
      expect(aggregate.errors).toHaveLength(3);
      expect(aggregate.errors).toEqual(
        expect.arrayContaining([deadlineError, spendDownError, recurringError]),
      );
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "accounting.recurring",
            surface: "scheduled",
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
        "recurring_journal_templates",
      );
      expect(vi.mocked(createDbHandle)).toHaveBeenCalledTimes(1);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("closes the shared handle when createDbHandle itself resolves but the pool teardown rejects", async () => {
      // Defence in depth: if pool.end() throws at teardown the scheduled
      // invocation should still surface a rejection (so Cloudflare retries
      // next cron tick) rather than silently swallowing the error.
      const teardownError = new Error("pool.end() failed");
      mockCloseDbHandle.mockRejectedValueOnce(teardownError);

      await expect(appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV)).rejects.toThrow(
        teardownError,
      );

      // Even though teardown threw, close() was still attempted.
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("pre-warms the shared handle with a single query before fanning out scheduled jobs", async () => {
      // GRANTPIPE-API-7 post-mortem: pg.Pool does NOT serialize first-connects.
      // If all four jobs issue their first query simultaneously against a cold
      // managed Postgres, pool.connect() fires 4 parallel underlying connects and
      // races on connection startup serialization - every one of the four
      // times out at connectionTimeoutMillis. The fix is to pay the cold-wake
      // cost ONCE, on ONE connection, before the fan-out: subsequent connects
      // attach to warm compute (or reuse the idle pool client).
      const callOrder: string[] = [];
      mockDbExecute.mockImplementationOnce(async () => {
        callOrder.push("pre-warm");
        return [];
      });
      vi.mocked(sendScheduledGrantDeadlineReminders).mockImplementationOnce(async () => {
        callOrder.push("notifications.deadlines");
      });
      vi.mocked(checkGrantSpendDownThresholds).mockImplementationOnce(async () => {
        callOrder.push("notifications.spend-down");
      });
      vi.mocked(tickRecurring).mockImplementationOnce(async () => {
        callOrder.push("accounting.recurring");
        return { ran: 0, errors: 0 };
      });

      await appHandler.scheduled({ cron: "0 10,22 * * *" }, MOCK_ENV);

      expect(callOrder[0]).toBe("pre-warm");
      expect(callOrder).toHaveLength(4);
      // Pre-warm SQL is exactly `select 1`. The drizzle-orm `sql` tag is mocked
      // to `{ strings, values }`, preserving the raw TemplateStringsArray, so
      // we can assert the template contents literally. A regression that swaps
      // in something like `sql\`select pg_sleep(60)\`` (expensive) or `sql.raw("")`
      // (not a parameterized query) would trip this assertion.
      expect(mockDbExecute).toHaveBeenCalledTimes(1);
      const preWarmCall = mockDbExecute.mock.calls[0] as unknown[] | undefined;
      const preWarmArg = preWarmCall?.[0] as
        | { strings: ArrayLike<string>; values: unknown[] }
        | undefined;
      expect(preWarmArg).toBeDefined();
      expect(Array.from(preWarmArg!.strings)).toEqual(["select 1"]);
      expect(preWarmArg!.values).toEqual([]);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries a transient pre-warm failure, avoids Sentry capture, and still runs DB-backed jobs", async () => {
      vi.useFakeTimers();
      const preWarmError = new Error("Timed out while creating a new server connection.");
      mockDbExecute.mockRejectedValueOnce(preWarmError).mockResolvedValueOnce([]);

      const scheduledPromise = appHandler.scheduled({ cron: "0 10,22 * * *" }, MOCK_ENV);

      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(mockDbExecute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).toHaveBeenCalled();
      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalledWith(
        preWarmError,
        expect.objectContaining({
          tags: expect.objectContaining({ job: "pre-warm" }),
        }),
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries a wrapper-only pre-warm query failure from production, avoids Sentry capture, and still runs DB-backed jobs", async () => {
      vi.useFakeTimers();
      const preWarmError = new Error("Failed query: select 1\nparams: ");
      mockDbExecute.mockRejectedValueOnce(preWarmError).mockResolvedValueOnce([]);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);

      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(mockDbExecute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).toHaveBeenCalled();
      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalledWith(
        preWarmError,
        expect.objectContaining({
          tags: expect.objectContaining({ job: "pre-warm" }),
        }),
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("absorbs repeated transient managed Postgres control-plane pre-warm failures before running scheduled jobs", async () => {
      vi.useFakeTimers();
      const preWarmError = new Error("error: Control plane request failed");
      mockDbExecute
        .mockRejectedValueOnce(preWarmError)
        .mockRejectedValueOnce(preWarmError)
        .mockRejectedValueOnce(preWarmError)
        .mockRejectedValueOnce(preWarmError)
        .mockRejectedValueOnce(preWarmError)
        .mockResolvedValueOnce([]);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);

      await vi.advanceTimersByTimeAsync(15_000);
      await scheduledPromise;
      vi.useRealTimers();

      expect(mockDbExecute).toHaveBeenCalledTimes(6);
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).toHaveBeenCalled();
      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).toHaveBeenCalled();
      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalledWith(
        preWarmError,
        expect.objectContaining({
          tags: expect.objectContaining({ job: "pre-warm" }),
        }),
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("surfaces a pre-warm failure after all retry attempts without invoking DB-backed jobs, tags it distinctly in Sentry, and still closes the handle", async () => {
      // If Postgres is genuinely unreachable, the pre-warm
      // itself will fail. In that case there's no point firing the fan-out —
      // every job would queue another doomed pool.connect(). The handler must
      // bail immediately, surface the connect error to Cloudflare (which will
      // retry on the next cron fire), still end the pool so we don't leak,
      // AND tag the capture with `job: "pre-warm"` so the Sentry Issues list
      // distinguishes pre-warm failures from per-job query failures (which
      // would otherwise look identical after wrapping).
      vi.useFakeTimers();
      const preWarmError = new Error("Timed out while creating a new server connection.");
      mockDbExecute.mockRejectedValue(preWarmError);

      const scheduledPromise = appHandler.scheduled({ cron: "0 10,22 * * *" }, MOCK_ENV);
      const rejectionExpectation = expect(scheduledPromise).rejects.toThrow(preWarmError);

      await vi.advanceTimersByTimeAsync(15_000);
      await rejectionExpectation;
      vi.useRealTimers();

      expect(mockDbExecute).toHaveBeenCalledTimes(6);
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).not.toHaveBeenCalled();
      expect(vi.mocked(checkGrantSpendDownThresholds)).not.toHaveBeenCalled();
      expect(vi.mocked(tickRecurring)).not.toHaveBeenCalled();
      expect(mockRedispatchPendingLeadDeliveries).toHaveBeenCalledWith(MOCK_ENV);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({
            job: "pre-warm",
            surface: "scheduled",
            cron: "0 10,22 * * *",
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
        "Timed out while creating a new server connection.",
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("surfaces a later Postgres pre-warm failure without the retired D1 nurture job", async () => {
      const preWarmError = new Error("Timed out while creating a new server connection.");
      mockDbExecute.mockRejectedValue(preWarmError);
      vi.useFakeTimers();

      const scheduledPromise = appHandler.scheduled({ cron: "0 10,22 * * *" }, MOCK_ENV);
      const thrownPromise = scheduledPromise.catch((error: unknown) => error);
      // Advance past all scheduled pre-warm backoffs
      // (250 + 750 + 2000 + 4000 + 8000 ms = 15000 ms total)
      // so the retry loop reaches exhaustion before we assert the call count.
      await vi.advanceTimersByTimeAsync(15_000);
      const thrown = await thrownPromise;
      vi.useRealTimers();

      expect(thrown).toBe(preWarmError);
      // 6 = initial attempt + 5 retries from the transient-retry pattern matching
      // the "Timed out..." preWarmError message.
      expect(mockDbExecute).toHaveBeenCalledTimes(6);
      expect(vi.mocked(sendScheduledGrantDeadlineReminders)).not.toHaveBeenCalled();
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("still captures and rethrows when pre-warm rejects with a non-Error value", async () => {
      // Some failure paths (native cancellation, Worker runtime abort, poorly
      // typed downstream libs) reject with non-Error values. The pre-warm
      // branch has to handle that gracefully — still tag + capture in Sentry,
      // still propagate, still close — without coercing the value into a
      // misleading Error on the way through. A non-Error rejection does not
      // match the transient-error retry patterns, so it fails fast (one call)
      // rather than wasting the cron budget on doomed retries.
      const rejectionValue = "pre-warm aborted";
      mockDbExecute.mockRejectedValue(rejectionValue);

      await expect(appHandler.scheduled({ cron: "0 10,22 * * *" }, MOCK_ENV)).rejects.toBe(
        rejectionValue,
      );

      expect(mockDbExecute).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Scheduled exception" }),
        expect.objectContaining({
          tags: expect.objectContaining({ job: "pre-warm", surface: "scheduled" }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(rejectionValue);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries pre-warm when the database control plane errors transiently (GRANTPIPE-API-Y/Z)", async () => {
      vi.useFakeTimers();
      const preWarmError = new Error("error: Control plane request failed");
      mockDbExecute.mockRejectedValueOnce(preWarmError).mockResolvedValueOnce([]);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);
      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(mockDbExecute).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).not.toHaveBeenCalledWith(
        preWarmError,
        expect.objectContaining({
          tags: expect.objectContaining({ job: "pre-warm" }),
        }),
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries trial-emails.delivery after a transient sentAt failure", async () => {
      // Each schedule row supplies a stable Resend idempotency key, so retrying
      // the provider request can finish sentAt persistence without delivering
      // the email twice.
      vi.useFakeTimers();
      const controlPlaneError = new Error("Control plane request failed");
      vi.mocked(runTrialEmailTick)
        .mockRejectedValueOnce(controlPlaneError)
        .mockResolvedValueOnce(undefined);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);
      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(vi.mocked(runTrialEmailTick)).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).not.toHaveBeenCalledWith(
        controlPlaneError,
        expect.objectContaining({
          tags: expect.objectContaining({ job: "trial-emails.delivery" }),
        }),
      );
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("wraps each task body in withDbRetry so a transient database control-plane blip on a per-task initial query is absorbed (GRANTPIPE-API-10 generalisation)", async () => {
      // tickRecurring rejects once with a transient database control-plane error,
      // then succeeds. The fan-out withDbRetry wrapper (not the domain service)
      // must absorb the first rejection and retry, so the handler resolves
      // without throwing AggregateError and tickRecurring is called twice.
      vi.useFakeTimers();
      const controlPlaneError = new Error("Control plane request failed");
      vi.mocked(tickRecurring)
        .mockRejectedValueOnce(controlPlaneError)
        .mockResolvedValueOnce({ ran: 0, errors: 0 });

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);
      // Advance past the first withDbRetry back-off (250 ms)
      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(vi.mocked(tickRecurring)).toHaveBeenCalledTimes(2);
      // No AggregateError — the handler resolved cleanly
      expect(mockCaptureException).not.toHaveBeenCalledWith(controlPlaneError, expect.anything());
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries wrapper-only Drizzle failed-query errors from retryable scheduled jobs", async () => {
      vi.useFakeTimers();
      const spendDownError = new Error(
        'Failed query: select "grants"."id", "grants"."org_id", "grants"."name", "grants"."amount_cents" from "grants"\nparams: 1,0',
      );
      const recurringError = new Error(
        'Failed query: select "id", "org_id", "name" from "recurring_journal_templates"\nparams: true,2026-05-21T14:01:35.303Z',
      );
      vi.mocked(checkGrantSpendDownThresholds)
        .mockRejectedValueOnce(spendDownError)
        .mockResolvedValueOnce(undefined);
      vi.mocked(tickRecurring)
        .mockRejectedValueOnce(recurringError)
        .mockResolvedValueOnce({ ran: 0, errors: 0 });

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);

      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(tickRecurring)).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).not.toHaveBeenCalledWith(spendDownError, expect.anything());
      expect(mockCaptureException).not.toHaveBeenCalledWith(recurringError, expect.anything());
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("retries a production-shaped Drizzle wrapper that carries a non-deterministic pg cause (GRANTPIPE-API-17)", async () => {
      // The real wrapper always carries `.cause` (drizzle's queryWithCache). The
      // spend-down cron failed with a pg cause outside our positive transient
      // list, so the old cause==null gate never retried it. This locks in that the
      // dispatcher now retries the cause-bearing wrapper instead of paging Sentry.
      vi.useFakeTimers();
      const pgCause = Object.assign(new Error("Error connecting to database."), {
        code: "57P03",
      });
      const spendDownError = new Error(
        'Failed query: select "grants"."id", "grants"."org_id" from "grants"\nparams: 1,0',
        { cause: pgCause },
      );
      vi.mocked(checkGrantSpendDownThresholds)
        .mockRejectedValueOnce(spendDownError)
        .mockResolvedValueOnce(undefined);

      const scheduledPromise = appHandler.scheduled({ cron: "0 * * * *" }, MOCK_ENV);

      await vi.advanceTimersByTimeAsync(250);
      await scheduledPromise;
      vi.useRealTimers();

      expect(vi.mocked(checkGrantSpendDownThresholds)).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).not.toHaveBeenCalledWith(spendDownError, expect.anything());
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });
  });

  describe("DB middleware — HYPERDRIVE binding", () => {
    it("passes HYPERDRIVE binding to createDbHandle for DB-touching requests", async () => {
      const hyperdrive = { connectionString: "postgres://user:pass@localhost:5432/grantpipe" };
      const env = {
        ...MOCK_ENV,
        HYPERDRIVE: hyperdrive,
      };

      // /api/auth/session reaches through the DB middleware (it opens a DB
      // handle to look up the org-member row). The health route is skipped
      // because it never touches the DB — see its own test below.
      await app.request("/api/auth/session", undefined, env);

      expect(vi.mocked(createDbHandle)).toHaveBeenCalledWith(MOCK_ENV.DATABASE_URL, hyperdrive);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("does not open a DB handle for GET /api/health", async () => {
      // /health is a liveness probe — opening a Hyperdrive-origin Postgres
      // connection for it burns connection budget on requests that can't
      // even use the DB. The middleware short-circuits before connecting.
      const res = await makeRequest("/api/health");

      expect(res.status).toBe(200);
      expect(vi.mocked(createDbHandle)).not.toHaveBeenCalled();
      expect(mockCloseDbHandle).not.toHaveBeenCalled();
    });

    it("does not open a DB handle for /api/public/downloads/* requests", async () => {
      // Signed download routes verify an HMAC token and stream from R2 — no DB.
      const res = await makeRequest("/api/public/downloads/some-token");

      // Token verification fails for an arbitrary token → 401. The assertion
      // that matters for this test is the DB side: no handle was opened.
      expect([200, 401, 404]).toContain(res.status);
      expect(vi.mocked(createDbHandle)).not.toHaveBeenCalled();
      expect(mockCloseDbHandle).not.toHaveBeenCalled();
    });

    it("opens a DB handle for signed AI-CS context requests", async () => {
      const env = { ...MOCK_ENV, AI_CS_CONTEXT_SECRET: "context-secret" };

      const res = await app.request(
        "/api/ai-cs/context?appId=grantpipe&userId=user-1",
        undefined,
        env,
      );

      expect(res.status).toBe(401);
      expect(vi.mocked(createDbHandle)).toHaveBeenCalledWith(MOCK_ENV.DATABASE_URL, undefined);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("does not run production schema DDL before session lookup", async () => {
      const env = { ...MOCK_ENV, SENTRY_ENVIRONMENT: "production" };

      const res = await app.request("/api/auth/session", undefined, env);

      expect(res.status).toBe(401);
      expect(mockDbExecute).not.toHaveBeenCalled();
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it("closes the request db handle after successful DB-touching requests", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);

      await makeRequest("/api/auth/session");

      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("closes the request db handle after failing regular requests", async () => {
      // Both the initial call and the in-middleware retry must throw so the
      // failure path actually surfaces — see getSessionWithRetry.
      mockGetSession.mockRejectedValue(new Error("session lookup failed"));

      const res = await makeRequest("/api/auth/session");

      expect(res.status).toBe(500);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });

    it("recovers from a single transient session lookup failure", async () => {
      mockGetSession
        .mockRejectedValueOnce(new Error("session lookup failed"))
        .mockResolvedValueOnce(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);

      const res = await makeRequest("/api/auth/session");

      expect(res.status).toBe(200);
      expect(mockGetSession).toHaveBeenCalledTimes(2);
      expect(mockCloseDbHandle).toHaveBeenCalledTimes(1);
    });
  });

  describe("CORS headers", () => {
    it("includes Access-Control-Allow-Credentials on public routes", async () => {
      const res = await makeRequest("/api/health");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("includes the security header baseline on public routes", async () => {
      const res = await makeRequest("/api/health");

      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Permissions-Policy")).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("survives a malformed MARKETING_URL without throwing (catch branch)", async () => {
      const env = { ...MOCK_ENV, MARKETING_URL: "not-a-valid-url" };
      const res = await app.request("/api/health", undefined, env);
      // The request completes normally — malformed URL is silently ignored
      expect(res.status).toBe(200);
    });
  });

  describe("X-Org-Id header — org context switching", () => {
    it("uses the org from X-Org-Id when the user is a member of that org", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      // Entire mock: header lookup succeeds immediately, no fallback needed.
      // mockResolvedValue sets the persistent default so all calls return this member.
      mockFindFirst.mockResolvedValue({
        id: "org-member-2",
        orgId: "org-2",
        role: "editor",
        deletedAt: null,
      });

      const res = await makeRequest("/api/auth/session", {
        headers: { "X-Org-Id": "org-2" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { orgId: string; memberRole: string };
      expect(body.orgId).toBe("org-2");
      expect(body.memberRole).toBe("editor");
      // The header lookup returned a result so fallback was NOT called — only 1 findFirst
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it("returns 403 when X-Org-Id membership is not found even if a fallback org exists", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      // Header lookup returns undefined; fallback must not run because the
      // requested org is explicit and invalid.
      mockFindFirst.mockImplementation(async () => undefined);

      const res = await makeRequest("/api/auth/session", {
        headers: { "X-Org-Id": "org-unknown" },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "No organization membership" });
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it("returns 403 and does not fall back when X-Org-Id is present but invalid", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(undefined);

      const res = await makeRequest("/api/auth/session", {
        headers: { "X-Org-Id": "org-unknown" },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "No organization membership" });
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it("does not perform the X-Org-Id lookup when no header is present", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);

      const res = await makeRequest("/api/auth/session");
      expect(res.status).toBe(200);
      // Only one findFirst call for the fallback path (no header, no lookup)
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("X-Entity-Id header — entity context switching", () => {
    it("exposes requested entity context when the member has access", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockEntityFindFirst.mockResolvedValue({
        id: "entity-requested",
        orgId: "org-1",
        status: "active",
        deletedAt: null,
      });
      mockEntityMemberFindFirst.mockResolvedValue({
        entityId: "entity-requested",
        role: "viewer",
        deletedAt: null,
      });

      const res = await makeRequest("/api/auth/session", {
        headers: { "X-Entity-Id": "entity-requested" },
      });
      const body = (await res.json()) as {
        entityId: string;
        entityScope: string;
        entityRole: string;
        entityPermissions: { reports: string };
      };

      expect(res.status).toBe(200);
      expect(body.entityId).toBe("entity-requested");
      expect(body.entityScope).toBe("entity");
      expect(body.entityRole).toBe("viewer");
      expect(body.entityPermissions.reports).toBe("view");
    });

    it("returns 403 for inaccessible X-Entity-Id and does not fall back to the default entity", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockEntityFindFirst.mockResolvedValue({
        id: "entity-requested",
        orgId: "org-1",
        status: "active",
        deletedAt: null,
      });
      mockEntityMemberFindFirst.mockResolvedValue(undefined);

      const res = await makeRequest("/api/auth/session", {
        headers: { "X-Entity-Id": "entity-requested" },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "No entity access" });
      expect(mockEntityMemberFindFirst).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: {
          surface: "org-entity-context",
          reason: "entity_switch_denied",
          org_id: "org-1",
          entity_scope: "entity",
          requested_entity_id: "entity-requested",
        },
      });
    });
  });

  describe("session exposure", () => {
    it("does not expose token-shaped session state from auth/session", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        session: { id: string; token?: string; userId?: string } | null;
      };

      expect(res.status).toBe(200);
      expect(body.session).toEqual({ id: "session-1" });
      expect(body.session).not.toHaveProperty("token");
      expect(body.session).not.toHaveProperty("userId");
    });

    it("exposes org subscription context needed for non-admin billing guards", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-05-01T00:00:00.000Z"),
        planTier: "starter",
        onboardingCompleted: true,
        planSelectedAt: new Date("2026-04-20T00:00:00.000Z"),
        stripeSubscriptionId: null,
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        onboardingCompleted: boolean;
        planSelectionCompleted: boolean;
        orgSubscription?: {
          subscriptionStatus: string | null;
          billingLifecycleState: string;
          planTier: string | null;
          effectivePlanTier: string | null;
          stripeSubscriptionId: string | null;
          trialEndsAt: string | null;
          onboardingCompleted: boolean;
          onboardingGoal: string | null;
          planSelectedAt: string | null;
        } | null;
      };

      expect(res.status).toBe(200);
      expect(body.orgSubscription).toEqual({
        subscriptionStatus: "trialing",
        billingLifecycleState: "expired",
        planTier: "starter",
        effectivePlanTier: "starter",
        stripeSubscriptionId: null,
        trialEndsAt: "2026-05-01T00:00:00.000Z",
        onboardingCompleted: true,
        onboardingGoal: null,
        planSelectedAt: "2026-04-20T00:00:00.000Z",
      });
      expect(body.onboardingCompleted).toBe(true);
      expect(body.planSelectionCompleted).toBe(true);
    });

    it("falls back when production is missing the optional plan_selected_at column", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error("Failed query: select plan_selected_at"), {
          cause: { code: "42703", message: 'column "plan_selected_at" does not exist' },
        }),
      );
      mockDbExecute.mockResolvedValue({
        rows: [
          {
            subscriptionStatus: "trialing",
            trialEndsAt: new Date("2026-05-01T00:00:00.000Z"),
            planTier: "starter",
            onboardingCompleted: false,
            stripeSubscriptionId: null,
            planSelectedAt: new Date("2026-04-01T00:00:00.000Z"),
            defaultEntityId: "entity-default",
          },
        ],
      });

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        planSelectionCompleted: boolean;
        orgSubscription?: {
          subscriptionStatus: string | null;
          billingLifecycleState: string;
          planTier: string | null;
          effectivePlanTier: string | null;
          stripeSubscriptionId: string | null;
          trialEndsAt: string | null;
          onboardingCompleted: boolean;
          onboardingGoal: string | null;
          planSelectedAt: string | null;
        } | null;
      };

      expect(res.status).toBe(200);
      expect(body.planSelectionCompleted).toBe(true);
      expect(body.orgSubscription).toEqual({
        subscriptionStatus: "trialing",
        billingLifecycleState: "expired",
        planTier: "starter",
        effectivePlanTier: "starter",
        stripeSubscriptionId: null,
        trialEndsAt: "2026-05-01T00:00:00.000Z",
        onboardingCompleted: false,
        onboardingGoal: null,
        planSelectedAt: "2026-04-01T00:00:00.000Z",
      });
      expect(mockDbExecute).toHaveBeenCalledOnce();
    });

    it("falls back when postgres metadata is on the top-level missing-column error", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute.mockResolvedValue([
        {
          subscriptionStatus: "trialing",
          trialEndsAt: "2026-05-01T00:00:00.000Z",
          planTier: "starter",
          onboardingCompleted: false,
          stripeSubscriptionId: null,
          planSelectedAt: "2026-04-01T00:05:00.000Z",
          defaultEntityId: "entity-default",
        },
      ]);

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        planSelectionCompleted: boolean;
        orgSubscription?: {
          trialEndsAt: string | null;
          planSelectedAt: string | null;
        } | null;
      };

      expect(res.status).toBe(200);
      expect(body.planSelectionCompleted).toBe(true);
      expect(body.orgSubscription?.trialEndsAt).toBe("2026-05-01T00:00:00.000Z");
      expect(body.orgSubscription?.planSelectedAt).toBe("2026-04-01T00:05:00.000Z");
    });

    it("returns an onboarding goal when the organization row has one", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: null,
        planTier: "starter",
        onboardingCompleted: false,
        onboardingGoal: "track_grants",
        planSelectedAt: null,
        stripeSubscriptionId: null,
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        orgSubscription?: { onboardingGoal: string | null } | null;
      };

      expect(res.status).toBe(200);
      expect(body.orgSubscription?.onboardingGoal).toBe("track_grants");
    });

    it("fails closed when the organization subscription row is missing", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockResolvedValue(undefined);

      const res = await makeRequest("/api/auth/session");
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No entity access" });
      expect(mockEntityFindFirst).not.toHaveBeenCalled();
    });

    it("fails closed when the compatibility fallback is also missing default_entity_id", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute
        .mockRejectedValueOnce(
          Object.assign(new Error('column "default_entity_id" does not exist'), {
            code: "42703",
          }),
        )
        .mockResolvedValueOnce([
          {
            subscriptionStatus: "trialing",
            trialEndsAt: "2026-05-01T00:00:00.000Z",
            planTier: "starter",
            onboardingCompleted: false,
            stripeSubscriptionId: null,
            planSelectedAt: "2026-04-01T00:05:00.000Z",
          },
        ]);

      const res = await makeRequest("/api/auth/session");
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No entity access" });
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
      expect(mockEntityFindFirst).not.toHaveBeenCalled();
    });

    it("does not mask non-default-entity compatibility fallback failures", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute.mockRejectedValueOnce(
        Object.assign(new Error('column "subscription_status" does not exist'), {
          code: "42703",
        }),
      );

      const res = await makeRequest("/api/auth/session");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "Internal Server Error" });
      expect(mockDbExecute).toHaveBeenCalledOnce();
    });

    it("fails closed when the older compatibility fallback returns no org row", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute
        .mockRejectedValueOnce(
          Object.assign(new Error('column "default_entity_id" does not exist'), {
            code: "42703",
          }),
        )
        .mockResolvedValueOnce({ rows: [] });

      const res = await makeRequest("/api/auth/session");
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No entity access" });
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
      expect(mockEntityFindFirst).not.toHaveBeenCalled();
    });

    it("normalizes nullable legacy timestamp fields in the compatibility fallback", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute.mockResolvedValue([
        {
          subscriptionStatus: "trialing",
          trialEndsAt: null,
          planTier: "starter",
          onboardingCompleted: false,
          stripeSubscriptionId: null,
          planSelectedAt: null,
          defaultEntityId: "entity-default",
        },
      ]);

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        planSelectionCompleted: boolean;
        orgSubscription?: {
          trialEndsAt: string | null;
          planSelectedAt: string | null;
        } | null;
      };

      expect(res.status).toBe(200);
      expect(body.planSelectionCompleted).toBe(false);
      expect(body.orgSubscription?.trialEndsAt).toBeNull();
      expect(body.orgSubscription?.planSelectedAt).toBeNull();
    });

    it("normalizes invalid legacy timestamp strings in the compatibility fallback", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error('column "plan_selected_at" does not exist'), {
          code: "42703",
        }),
      );
      mockDbExecute.mockResolvedValue([
        {
          subscriptionStatus: "trialing",
          trialEndsAt: "not-a-date",
          planTier: "starter",
          onboardingCompleted: false,
          stripeSubscriptionId: null,
          planSelectedAt: "also-not-a-date",
          defaultEntityId: "entity-default",
        },
      ]);

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        planSelectionCompleted: boolean;
        orgSubscription?: {
          trialEndsAt: string | null;
          planSelectedAt: string | null;
        } | null;
      };

      expect(res.status).toBe(200);
      expect(body.planSelectionCompleted).toBe(false);
      expect(body.orgSubscription?.trialEndsAt).toBeNull();
      expect(body.orgSubscription?.planSelectedAt).toBeNull();
    });

    it("fails closed when the compatibility fallback finds no org row", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(
        Object.assign(new Error("Failed query: select plan_selected_at"), {
          cause: { code: "42703", message: 'column "plan_selected_at" does not exist' },
        }),
      );
      mockDbExecute.mockResolvedValue([]);

      const res = await makeRequest("/api/auth/session");
      const body = (await res.json()) as {
        orgSubscription?: unknown;
        onboardingCompleted: boolean;
        planSelectionCompleted: boolean;
      };

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No entity access" });
    });

    it("does not mask non-schema org subscription query failures", async () => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
      mockOrgFindFirst.mockRejectedValue(new Error("database unavailable"));

      const res = await makeRequest("/api/auth/session");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "Internal Server Error" });
      expect(mockDbExecute).not.toHaveBeenCalled();
    });
  });

  describe("paywall — bare collection paths", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(MOCK_SESSION);
      mockFindFirst.mockResolvedValue(MOCK_MEMBER);
    });

    it("GET /api/donors returns 402 when trial is expired", async () => {
      // expired trial: trialEndsAt in the past, status trialing
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/donors");
      expect(res.status).toBe(402);
      const body = await res.json();
      expect((body as { error: string }).error).toBe("paywall");
    });

    it("GET /api/events returns 402 when trial is expired", async () => {
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/events");
      expect(res.status).toBe(402);
    });

    it("GET /api/grants returns 402 when trial is expired", async () => {
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/grants");
      expect(res.status).toBe(402);
    });

    it("GET /api/compliance returns 402 when trial is expired", async () => {
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/compliance");
      expect(res.status).toBe(402);
    });

    it("GET /api/documents returns 402 when trial is expired", async () => {
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/documents");
      expect(res.status).toBe(402);
    });

    it("GET /api/import returns 402 when trial is expired", async () => {
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2020-01-01"),
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/import");
      expect(res.status).toBe(402);
    });

    it("GET /api/donors passes through the paywall when subscription is active", async () => {
      // Active subscription — paywall must allow the request to reach the underlying handler
      mockOrgFindFirst.mockResolvedValue({
        id: "org-1",
        subscriptionStatus: "active",
        trialEndsAt: null,
        planTier: "starter",
        defaultEntityId: "entity-default",
      });

      const res = await makeRequest("/api/donors");
      // 402 would mean the paywall blocked it — any other status proves it was allowed through
      expect(res.status).not.toBe(402);
    });
  });
});

// The withSentry call happens at module load time (before beforeEach clears mocks).
// Capture the options callback here, at describe-level, so it is available before
// any beforeEach runs inside the outer describe.
describe("Sentry options callback", () => {
  // Captured at suite initialisation — module was already loaded when vi.mock ran
  const sentryOptionsCb = mockWithSentry.mock.calls[0]?.[0] as
    | ((env: AppEnv["Bindings"]) => unknown)
    | undefined;

  it("returns Sentry config with required hardening properties when SENTRY_DSN is set", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb({
      ...MOCK_ENV,
      SENTRY_DSN: "https://abc123@sentry.io/123",
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "v1.2.3",
    } as AppEnv["Bindings"]);
    expect(result).toEqual({
      dsn: "https://abc123@sentry.io/123",
      tracesSampleRate: 0,
      environment: "production",
      release: "v1.2.3",
      sendDefaultPii: false,
      enableLogs: true,
    });
  });

  it("uses Cloudflare version metadata as release before SENTRY_RELEASE", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb({
      ...MOCK_ENV,
      SENTRY_DSN: "https://abc123@sentry.io/123",
      SENTRY_RELEASE: "manual-release",
      CF_VERSION_METADATA: { id: "worker-version-id" },
    } as AppEnv["Bindings"]);
    expect(result).toMatchObject({
      release: "worker-version-id",
      enableLogs: true,
    });
  });

  it("falls back to 'development' environment and 'unknown' release when vars are absent", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb({
      ...MOCK_ENV,
      SENTRY_DSN: "https://abc123@sentry.io/123",
    } as AppEnv["Bindings"]);
    expect(result).toEqual({
      dsn: "https://abc123@sentry.io/123",
      tracesSampleRate: 0,
      environment: "development",
      release: "unknown",
      sendDefaultPii: false,
      enableLogs: true,
    });
  });

  it("preserves an explicit non-production SENTRY_ENVIRONMENT override", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb({
      ...MOCK_ENV,
      SENTRY_DSN: "https://abc123@sentry.io/123",
      SENTRY_ENVIRONMENT: "staging",
    } as AppEnv["Bindings"]);
    expect(result).toEqual({
      dsn: "https://abc123@sentry.io/123",
      tracesSampleRate: 0,
      environment: "staging",
      release: "unknown",
      sendDefaultPii: false,
      enableLogs: true,
    });
  });

  it("explicitly sets sendDefaultPii to false to prevent PII leakage", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb({
      ...MOCK_ENV,
      SENTRY_DSN: "https://abc123@sentry.io/123",
    } as AppEnv["Bindings"]) as { sendDefaultPii: boolean } | undefined;
    expect(result?.sendDefaultPii).toBe(false);
  });

  it("returns undefined when SENTRY_DSN is not set", () => {
    expect(sentryOptionsCb).toBeDefined();
    if (!sentryOptionsCb) return;

    const result = sentryOptionsCb(MOCK_ENV as AppEnv["Bindings"]);
    expect(result).toBeUndefined();
  });
});
