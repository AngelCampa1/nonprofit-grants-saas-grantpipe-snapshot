import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { AppError } from "../../lib/app-error";
import { errorHandler } from "../../middleware/error-handler";
import {
  externalReviewersRoutes,
  portalRoutes,
  checkPortalAuthRateLimit,
  _resetPortalAuthRateLimit,
  type RateLimitStore,
} from "./routes";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const { mockCaptureAnalytics, mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn().mockResolvedValue({ id: "analytics-1" }),
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("./reviewer.service", () => ({
  listReviewers: vi.fn(),
  getReviewer: vi.fn(),
  createReviewer: vi.fn(),
  updateReviewer: vi.fn(),
  softDeleteReviewer: vi.fn(),
}));

vi.mock("./session.service", () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  extendSession: vi.fn(),
  touchSession: vi.fn(),
}));

vi.mock("./scope.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./scope.service")>();
  return {
    listScopes: vi.fn(),
    addScopes: vi.fn(),
    removeScope: vi.fn(),
    checkScope: vi.fn(),
    publicPortalScope: actual.publicPortalScope,
  };
});

vi.mock("./bundle.service", () => ({
  listBundles: vi.fn(),
  getBundle: vi.fn(),
  createBundle: vi.fn(),
  updateBundle: vi.fn(),
  softDeleteBundle: vi.fn(),
  publishBundle: vi.fn(),
  addBundleItem: vi.fn(),
  removeBundleItem: vi.fn(),
  reorderBundleItems: vi.fn(),
}));

vi.mock("./scope-targets", () => ({
  assertScopeTargetsBelongToOrg: vi.fn(async () => undefined),
  isExternalReviewDocumentEntityType: (entityType: string) =>
    [
      "grant",
      "fund",
      "generated_report",
      "payment_request",
      "award_intake",
      "subrecipient",
      "subaward",
      "subrecipient_monitoring_task",
      "subrecipient_finding",
      "subrecipient_corrective_action",
    ].includes(entityType),
  isExternalReviewSubrecipientFileEntityType: (entityType: string) =>
    [
      "subrecipient",
      "subaward",
      "subrecipient_monitoring_task",
      "subrecipient_finding",
      "subrecipient_corrective_action",
    ].includes(entityType),
}));

vi.mock("./audit-event.service", () => ({
  listAuditEvents: vi.fn(),
  exportAuditEventsCSV: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("./tokens", () => ({
  signPortalToken: vi.fn().mockResolvedValue("raw-token-abc"),
  createPortalSessionCredential: vi.fn().mockResolvedValue("cookie-token-random"),
  hashPortalTokenForStorage: vi.fn().mockResolvedValue("hash-abc"),
  verifyPortalToken: vi.fn(),
  verifyPortalSessionCredential: vi.fn().mockResolvedValue({
    sessionId: "sess-portal-1",
    expiresAt: Date.now() + 86400000,
  }),
  nthLastIndexOf: vi.fn(),
}));

vi.mock("./email", () => ({
  sendReviewerInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendSessionExtendedEmail: vi.fn().mockResolvedValue(undefined),
  sendSessionRevokedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./invitation-delivery.service", () => ({
  createPostgresInvitationDeliveryStore: vi.fn(() => ({ kind: "delivery-store" })),
  dispatchInvitationDelivery: vi.fn().mockResolvedValue(undefined),
  dispatchInvitationDeliveryWithDedicatedHandle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockCaptureAnalytics },
  })),
}));

vi.mock("../../lib/sentry", () => ({
  captureApiException: vi.fn(),
  captureBackgroundException: mockCaptureBackgroundException,
}));

import {
  listReviewers,
  getReviewer,
  createReviewer,
  updateReviewer,
  softDeleteReviewer,
} from "./reviewer.service";
import {
  listSessions,
  getSession,
  createSession,
  revokeSession,
  extendSession,
} from "./session.service";
import { listScopes, addScopes, removeScope, checkScope } from "./scope.service";
import {
  listBundles,
  getBundle,
  createBundle,
  updateBundle,
  softDeleteBundle,
  publishBundle,
  addBundleItem,
  removeBundleItem,
  reorderBundleItems,
} from "./bundle.service";
import { assertScopeTargetsBelongToOrg } from "./scope-targets";
import { listAuditEvents, exportAuditEventsCSV, recordAuditEvent } from "./audit-event.service";
import {
  signPortalToken,
  createPortalSessionCredential,
  hashPortalTokenForStorage,
  verifyPortalToken,
  verifyPortalSessionCredential,
} from "./tokens";
import { sendSessionExtendedEmail } from "./email";
import {
  createPostgresInvitationDeliveryStore,
  dispatchInvitationDelivery,
  dispatchInvitationDeliveryWithDedicatedHandle,
} from "./invitation-delivery.service";

// ---------------------------------------------------------------------------
// App builder helpers
// ---------------------------------------------------------------------------

const FULL_PERMISSIONS: PermissionMap = {
  donors: "manage",
  grants: "manage",
  funds: "manage",
  programs: "manage",
  compliance: "manage",
  documents: "manage",
  reports: "manage",
  events: "manage",
  accounting: "manage",
  settings: "manage",
  billing: "manage",
  import: "manage",
  team: "manage",
  payments: "manage",
};

function buildAdminApp(
  role: "admin" | "editor" | "viewer" | "auditor" = "admin",
  db: unknown = {},
  permissions: Partial<PermissionMap> | null = null,
) {
  const app = new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/external-reviewers/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "admin@example.com", name: "Admin User" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", (permissions as PermissionMap | null) ?? FULL_PERMISSIONS);
      c.set("orgSubscription", null);
      await next();
    })
    .route("/external-reviewers", externalReviewersRoutes);

  return app;
}

function buildPortalTestApp(db: unknown = {}) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/public/portal/*", async (c, next) => {
      c.set("db", db as never);
      await next();
    })
    .route("/public/portal", portalRoutes);
}

function createTransactionalDb(base: Record<string, unknown> = { query: {} }) {
  const db = {
    ...base,
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
  return db;
}

// ISO strings used so res.json() comparisons work without Date deserialization mismatches.
const REVIEWER = {
  id: "rev-1",
  orgId: "org-1",
  email: "reviewer@external.com",
  name: "External Reviewer",
  reviewerType: "auditor",
  organizationName: "Audit Co",
  notes: null,
  createdBy: "user-1",
  createdAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
};

const SESSION = {
  id: "sess-portal-1",
  orgId: "org-1",
  reviewerId: "rev-1",
  tokenHash: "hash-abc",
  purpose: "Annual audit",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  revokedAt: null,
  revokedBy: null,
  createdBy: "user-1",
  createdAt: "2025-01-01T00:00:00.000Z",
  lastAccessedAt: "2025-01-01T00:00:00.000Z",
};

const BUNDLE = {
  id: "bundle-1",
  orgId: "org-1",
  title: "Q4 Evidence",
  description: null,
  purpose: "audit",
  periodStart: null,
  periodEnd: null,
  publishedAt: null,
  createdBy: "user-1",
  createdAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
};

/**
 * Minimal env bindings for routes that access c.env.PORTAL_TOKEN_SECRET /
 * c.env.BETTER_AUTH_SECRET / c.env.APP_URL. Pass as the third argument to
 * app.request(url, init, TEST_ENV) to avoid TypeError on c.env access.
 */
const TEST_ENV = {
  BETTER_AUTH_SECRET: "test-better-auth",
  PORTAL_TOKEN_SECRET: "test-portal-secret",
  APP_URL: "http://localhost:3050",
  DATABASE_URL: "postgres://test",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
} as const;

// ---------------------------------------------------------------------------
// Reviewer CRUD
// ---------------------------------------------------------------------------

describe("GET /external-reviewers/reviewers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns reviewer list for admin", async () => {
    vi.mocked(listReviewers).mockResolvedValue({ items: [REVIEWER as never], total: 1 });
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [REVIEWER], total: 1 });
  });

  it("returns 403 for viewer without compliance view", async () => {
    const app = buildAdminApp("viewer", {}, { compliance: "none" });
    const res = await app.request("/external-reviewers/reviewers");
    expect(res.status).toBe(403);
  });
});

describe("POST /external-reviewers/reviewers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates reviewer and returns 201", async () => {
    vi.mocked(createReviewer).mockResolvedValue(REVIEWER as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "reviewer@external.com",
        name: "External Reviewer",
        reviewerType: "auditor",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid body", async () => {
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Only Name" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for editor without compliance manage", async () => {
    const app = buildAdminApp("editor", {}, { compliance: "view" });
    const res = await app.request("/external-reviewers/reviewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "r@external.com",
        name: "R",
        reviewerType: "auditor",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/reviewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "r@external.com",
        name: "R",
        reviewerType: "auditor",
      }),
    });
    expect(res.status).toBe(403);
    expect(createReviewer).not.toHaveBeenCalled();
  });
});

describe("GET /external-reviewers/reviewers/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the reviewer", async () => {
    vi.mocked(getReviewer).mockResolvedValue(REVIEWER as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers/rev-1");
    expect(res.status).toBe(200);
  });

  it("returns 404 when reviewer not found", async () => {
    vi.mocked(getReviewer).mockResolvedValue(null);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers/no-such");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /external-reviewers/reviewers/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("updates and returns reviewer", async () => {
    vi.mocked(updateReviewer).mockResolvedValue({ ...REVIEWER, name: "Updated" } as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers/rev-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/reviewers/rev-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(403);
    expect(updateReviewer).not.toHaveBeenCalled();
  });
});

describe("DELETE /external-reviewers/reviewers/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("soft deletes and returns 204", async () => {
    vi.mocked(softDeleteReviewer).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/reviewers/rev-1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/reviewers/rev-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(softDeleteReviewer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe("GET /external-reviewers/sessions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns session list", async () => {
    vi.mocked(listSessions).mockResolvedValue({ items: [SESSION as never], total: 1 });
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions");
    expect(res.status).toBe(200);
  });
});

describe("POST /external-reviewers/sessions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes the exact signed expiry through even when signing advances the clock", async () => {
    vi.useFakeTimers();
    try {
      const startedAt = new Date("2026-07-11T12:00:00.000Z");
      vi.setSystemTime(startedAt);
      const ttlMs = 86400000;
      let signedExpiry = 0;
      vi.mocked(signPortalToken).mockImplementation(async (_sessionId, expiresAt) => {
        signedExpiry = expiresAt;
        vi.advanceTimersByTime(250);
        return "raw-token-abc";
      });
      vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
      vi.mocked(createSession).mockResolvedValue(SESSION as never);
      const app = buildAdminApp("admin", { query: {} });

      const res = await app.request(
        "/external-reviewers/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerId: "rev-1",
            purpose: "Annual audit",
            ttlMs,
            scopes: [],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      expect(signedExpiry).toBe(startedAt.getTime() + ttlMs);
      expect(createSession).toHaveBeenCalledWith(
        expect.anything(),
        "org-1",
        "user-1",
        expect.anything(),
        "raw-token-abc",
        "hash-abc",
        expect.any(String),
        "email",
        new Date(signedExpiry),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates session and returns rawToken + portalUrl", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    vi.mocked(getReviewer).mockResolvedValue(null); // skip email
    const app = buildAdminApp("admin", { query: {} });
    const res = await app.request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [],
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("rawToken", "raw-token-abc");
    expect(body).toHaveProperty("portalUrl");
    expect(body["portalUrl"] as string).toContain("raw-token-abc");
  });

  it("falls back to BETTER_AUTH_SECRET when signing session tokens", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    const app = buildAdminApp("admin", { query: {} });
    const res = await app.request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [],
        }),
      },
      { ...TEST_ENV, PORTAL_TOKEN_SECRET: undefined },
    );

    expect(res.status).toBe(201);
    expect(signPortalToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      "test-better-auth",
    );
  });

  it("returns 400 for missing required fields", async () => {
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "no reviewer" }),
    });
    expect(res.status).toBe(400);
  });

  it("sends invite email when RESEND_API_KEY is configured and reviewer is found", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    vi.mocked(getReviewer).mockResolvedValue(REVIEWER as never);
    const app = buildAdminApp("admin", { query: {} });
    const res = await app.request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [],
        }),
      },
      { ...TEST_ENV, RESEND_API_KEY: "resend-key-123" },
    );
    expect(res.status).toBe(201);
    expect(dispatchInvitationDeliveryWithDedicatedHandle).toHaveBeenCalledWith(
      expect.objectContaining({ RESEND_API_KEY: "resend-key-123" }),
      SESSION.id,
    );
    expect(createPostgresInvitationDeliveryStore).not.toHaveBeenCalled();
    expect(dispatchInvitationDelivery).not.toHaveBeenCalled();
  });

  it("reports invite email failures without failing session creation", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    vi.mocked(getReviewer).mockResolvedValue(REVIEWER as never);
    vi.mocked(dispatchInvitationDeliveryWithDedicatedHandle).mockResolvedValue(undefined);
    const app = buildAdminApp("admin", { query: {} });

    const res = await app.request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [],
        }),
      },
      { ...TEST_ENV, RESEND_API_KEY: "resend-key-123" },
    );

    expect(res.status).toBe(201);
    expect(dispatchInvitationDeliveryWithDedicatedHandle).toHaveBeenCalled();
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor", { query: {} });
    const res = await app.request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [],
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("GET /external-reviewers/sessions/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns session", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/sess-portal-1");
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/no-such");
    expect(res.status).toBe(404);
  });
});

describe("POST /external-reviewers/sessions/:id/revoke", () => {
  beforeEach(() => vi.resetAllMocks());

  it("revokes session and returns 204", async () => {
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/revoke", {
      method: "POST",
    });
    expect(res.status).toBe(204);
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/revoke", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});

describe("POST /external-reviewers/sessions/:id/extend", () => {
  beforeEach(() => vi.resetAllMocks());

  it("extends session", async () => {
    const extendedExpiresAt = new Date("2026-06-01T00:00:00.000Z");
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-extended");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-extended");
    vi.mocked(extendSession).mockImplementation(
      async (_db, _orgId, _sessionId, _actorId, _input, createTokenHash) => {
        await createTokenHash(extendedExpiresAt);
        return { ...SESSION, expiresAt: extendedExpiresAt } as never;
      },
    );
    const app = buildAdminApp();
    const res = await app.request(
      "/external-reviewers/sessions/sess-portal-1/extend",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionMs: 86400000 }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      session: expect.objectContaining({ id: "sess-portal-1" }),
      rawToken: "raw-token-extended",
      portalUrl: "http://localhost:3050/app/portal/raw-token-extended",
    });
    expect(signPortalToken).toHaveBeenCalledWith(
      "sess-portal-1",
      extendedExpiresAt.getTime(),
      "test-portal-secret",
    );
    expect(hashPortalTokenForStorage).toHaveBeenCalledWith(
      "raw-token-extended",
      "test-portal-secret",
    );
    expect(extendSession).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "sess-portal-1",
      "user-1",
      { extensionMs: 86400000 },
      expect.any(Function),
    );
  });

  it("dispatches the rotated portal link through the durable extension attempt", async () => {
    const extendedExpiresAt = new Date("2026-06-01T00:00:00.000Z");
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-extended");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-extended");
    vi.mocked(extendSession).mockImplementation(
      async (_db, _orgId, _sessionId, _actorId, _input, createTokenHash) => {
        await createTokenHash(extendedExpiresAt);
        return {
          ...SESSION,
          expiresAt: extendedExpiresAt,
          invitationDeliveryStatus: "pending",
          invitationDeliveryAttempt: 2,
          invitationDeliveryKind: "extension",
        } as never;
      },
    );
    const app = buildAdminApp("admin", { query: {} });

    const res = await app.request(
      "/external-reviewers/sessions/sess-portal-1/extend",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionMs: 86400000 }),
      },
      { ...TEST_ENV, RESEND_API_KEY: "resend-key" },
    );

    expect(res.status).toBe(200);
    expect(dispatchInvitationDeliveryWithDedicatedHandle).toHaveBeenCalledWith(
      expect.objectContaining({ RESEND_API_KEY: "resend-key" }),
      SESSION.id,
    );
    expect(sendSessionExtendedEmail).not.toHaveBeenCalled();
  });

  it("does not dispatch email when a link-only session is extended", async () => {
    const extendedExpiresAt = new Date("2026-06-01T00:00:00.000Z");
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-extended");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-extended");
    vi.mocked(extendSession).mockImplementation(
      async (_db, _orgId, _sessionId, _actorId, _input, createTokenHash) => {
        await createTokenHash(extendedExpiresAt);
        return {
          ...SESSION,
          expiresAt: extendedExpiresAt,
          invitationDeliveryStatus: "not_requested",
          invitationDeliveryAttempt: 2,
          invitationDeliveryKind: "extension",
        } as never;
      },
    );
    const app = buildAdminApp("admin", { query: {} });

    const res = await app.request(
      "/external-reviewers/sessions/sess-portal-1/extend",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionMs: 86400000 }),
      },
      { ...TEST_ENV, RESEND_API_KEY: "resend-key" },
    );

    expect(res.status).toBe(200);
    expect(dispatchInvitationDeliveryWithDedicatedHandle).not.toHaveBeenCalled();
    expect(sendSessionExtendedEmail).not.toHaveBeenCalled();
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extensionMs: 86400000 }),
    });
    expect(res.status).toBe(403);
    expect(extendSession).not.toHaveBeenCalled();
  });
});

describe("GET /external-reviewers/sessions/:id/scopes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns scopes when session exists", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION as never);
    vi.mocked(listScopes).mockResolvedValue([]);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/scopes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [] });
  });

  it("returns 404 when session not found", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/no-such/scopes");
    expect(res.status).toBe(404);
  });
});

describe("POST /external-reviewers/sessions/:id/scopes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("adds scopes and returns 204", async () => {
    vi.mocked(addScopes).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: [{ scopeType: "grant", scopeId: "grant-1" }] }),
    });
    expect(res.status).toBe(204);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reviewerScopesUpdated,
        payload: expect.objectContaining({
          entity_type: "external_review_session",
          action: "add",
          scope_count_bucket: expect.any(String),
        }),
      }),
    );
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: [{ scopeType: "grant", scopeId: "grant-1" }] }),
    });
    expect(res.status).toBe(403);
    expect(addScopes).not.toHaveBeenCalled();
  });
});

describe("DELETE /external-reviewers/sessions/:id/scopes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("removes scope and returns 204", async () => {
    vi.mocked(removeScope).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/scopes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: "grant", scopeId: "grant-1" }),
    });
    expect(res.status).toBe(204);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reviewerScopesUpdated,
        payload: expect.objectContaining({
          entity_type: "external_review_session",
          action: "remove",
          scope_type: "grant",
        }),
      }),
    );
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor");
    const res = await app.request("/external-reviewers/sessions/sess-portal-1/scopes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: "grant", scopeId: "grant-1" }),
    });
    expect(res.status).toBe(403);
    expect(removeScope).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

describe("GET /external-reviewers/bundles", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns bundle list", async () => {
    vi.mocked(listBundles).mockResolvedValue({ items: [BUNDLE as never], total: 1 });
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles");
    expect(res.status).toBe(200);
  });
});

describe("POST /external-reviewers/bundles", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates bundle and returns 201", async () => {
    vi.mocked(createBundle).mockResolvedValue(BUNDLE as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Q4 Evidence", purpose: "audit" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for viewer", async () => {
    const app = buildAdminApp("viewer", {}, { compliance: "view" });
    const res = await app.request("/external-reviewers/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "B", purpose: "audit" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /external-reviewers/bundles/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns bundle with items", async () => {
    vi.mocked(getBundle).mockResolvedValue({ bundle: BUNDLE as never, items: [] });
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1");
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getBundle).mockResolvedValue(null);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/no-such");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /external-reviewers/bundles/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("updates bundle", async () => {
    vi.mocked(updateBundle).mockResolvedValue({ ...BUNDLE, title: "Updated" } as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /external-reviewers/bundles/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("soft deletes and returns 204", async () => {
    vi.mocked(softDeleteBundle).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("blocks editors without compliance manage", async () => {
    vi.mocked(softDeleteBundle).mockResolvedValue(undefined);
    const app = buildAdminApp("editor", {}, { compliance: "edit" });
    const res = await app.request("/external-reviewers/bundles/bundle-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(softDeleteBundle).not.toHaveBeenCalled();
  });
});

describe("POST /external-reviewers/bundles/:id/publish", () => {
  beforeEach(() => vi.resetAllMocks());

  it("publishes and returns bundle", async () => {
    vi.mocked(publishBundle).mockResolvedValue({ ...BUNDLE, publishedAt: new Date() } as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1/publish", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor without compliance manage", async () => {
    const app = buildAdminApp("editor", {}, { compliance: "edit" });
    const res = await app.request("/external-reviewers/bundles/bundle-1/publish", {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /external-reviewers/bundles/:id/items", () => {
  beforeEach(() => vi.resetAllMocks());

  it("adds item and returns 201", async () => {
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "grant", itemId: "grant-1", sortOrder: 0 }),
    });
    expect(res.status).toBe(201);
    expect(addBundleItem).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "bundle-1",
      expect.objectContaining({ itemType: "grant", itemId: "grant-1", sortOrder: 0 }),
    );
  });
});

describe("DELETE /external-reviewers/bundles/:id/items/:itemId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("removes item and returns 204", async () => {
    vi.mocked(removeBundleItem).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1/items/item-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(removeBundleItem).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "bundle-1",
      "item-1",
      "user-1",
    );
  });

  it("blocks editors without compliance manage", async () => {
    vi.mocked(removeBundleItem).mockResolvedValue(undefined);
    const app = buildAdminApp("editor", {}, { compliance: "edit" });
    const res = await app.request("/external-reviewers/bundles/bundle-1/items/item-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
    expect(removeBundleItem).not.toHaveBeenCalled();
  });
});

describe("POST /external-reviewers/bundles/:id/reorder", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reorders items and returns 204", async () => {
    vi.mocked(reorderBundleItems).mockResolvedValue(undefined);
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/bundles/bundle-1/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: ["item-1", "item-2"] }),
    });
    expect(res.status).toBe(204);
    expect(reorderBundleItems).toHaveBeenCalledWith(expect.anything(), "org-1", "bundle-1", {
      itemIds: ["item-1", "item-2"],
    });
  });
});

describe("external reviewer evidence bundle analytics", () => {
  beforeEach(() => vi.resetAllMocks());

  it("captures safe analytics for evidence bundle operations", async () => {
    vi.mocked(createBundle).mockResolvedValue(BUNDLE as never);
    vi.mocked(updateBundle).mockResolvedValue({ ...BUNDLE, title: "Updated Q4 Evidence" } as never);
    vi.mocked(softDeleteBundle).mockResolvedValue(undefined);
    vi.mocked(publishBundle).mockResolvedValue({ ...BUNDLE, publishedAt: new Date() } as never);
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: "Award memo",
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    vi.mocked(removeBundleItem).mockResolvedValue(undefined);
    vi.mocked(reorderBundleItems).mockResolvedValue(undefined);

    await buildAdminApp().request("/external-reviewers/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Q4 Evidence",
        description: "Board packet support",
        purpose: "audit",
      }),
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Q4 Evidence", purpose: "funder_review" }),
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1/publish", {
      method: "POST",
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType: "grant",
        itemId: "grant-1",
        caption: "Award memo",
        sortOrder: 0,
      }),
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1/items/item-1", {
      method: "DELETE",
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: ["item-1", "item-2"] }),
    });
    await buildAdminApp().request("/external-reviewers/bundles/bundle-1", {
      method: "DELETE",
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(7);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.evidenceBundleCreated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "evidence_bundle",
          evidence_bundle_purpose: "audit",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundleUpdated,
        payload: expect.objectContaining({
          entity_type: "evidence_bundle",
          evidence_bundle_purpose: "funder_review",
          changed_fields: ["title", "purpose"],
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundlePublished,
        payload: expect.objectContaining({ entity_type: "evidence_bundle" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundleItemAdded,
        payload: expect.objectContaining({
          entity_type: "evidence_bundle_item",
          item_type: "grant",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundleItemRemoved,
        payload: expect.objectContaining({ entity_type: "evidence_bundle_item" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundleItemsReordered,
        payload: expect.objectContaining({
          entity_type: "evidence_bundle_item",
          item_count_bucket: "1-10",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.evidenceBundleDeleted,
        payload: expect.objectContaining({ entity_type: "evidence_bundle" }),
      }),
    );

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("Q4 Evidence");
    expect(serializedCalls).not.toContain("Updated Q4 Evidence");
    expect(serializedCalls).not.toContain("Board packet support");
    expect(serializedCalls).not.toContain("Award memo");
    expect(serializedCalls).not.toContain("bundle-1");
    expect(serializedCalls).not.toContain("grant-1");
    expect(serializedCalls).not.toContain("item-1");
  });
});

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

describe("GET /external-reviewers/audit-events", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns audit event list", async () => {
    vi.mocked(listAuditEvents).mockResolvedValue({ items: [], total: 0 });
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/audit-events");
    expect(res.status).toBe(200);
  });
});

describe("GET /external-reviewers/audit-events/export.csv", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns CSV content-type", async () => {
    vi.mocked(exportAuditEventsCSV).mockResolvedValue("id,session_id\n");
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/audit-events/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

// ---------------------------------------------------------------------------
// Quick-share
// ---------------------------------------------------------------------------

describe("POST /external-reviewers/quick-share", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates bundle + session and returns 201 with portalUrl", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createBundle).mockResolvedValue(BUNDLE as never);
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    const db = createTransactionalDb();
    const app = buildAdminApp("admin", db);
    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("portalUrl");
    expect(body).toHaveProperty("rawToken", "raw-token-abc");
    expect(body).toHaveProperty("bundle");
    expect(body).toHaveProperty("session");
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(addBundleItem).toHaveBeenCalledWith(expect.anything(), "org-1", "bundle-1", {
      itemType: "grant",
      itemId: "grant-1",
      sortOrder: 0,
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "user-1",
      expect.objectContaining({
        scopes: [
          { scopeType: "grant", scopeId: "grant-1" },
          { scopeType: "evidence_bundle", scopeId: "bundle-1" },
        ],
      }),
      "raw-token-abc",
      "hash-abc",
      expect.any(String),
      "link_only",
      expect.any(Date),
    );
  });

  it("falls back to BETTER_AUTH_SECRET when signing quick-share tokens", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createBundle).mockResolvedValue(BUNDLE as never);
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    const app = buildAdminApp("admin", createTransactionalDb());

    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
        }),
      },
      { ...TEST_ENV, PORTAL_TOKEN_SECRET: undefined },
    );

    expect(res.status).toBe(201);
    expect(signPortalToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      "test-better-auth",
    );
  });

  it("uses provided bundleId when supplied", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(getBundle).mockResolvedValue({ bundle: BUNDLE as never, items: [] });
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    const app = buildAdminApp("admin", createTransactionalDb());
    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
          bundleId: "bundle-1",
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    expect(getBundle).toHaveBeenCalled();
    expect(createBundle).not.toHaveBeenCalled();
    expect(addBundleItem).toHaveBeenCalledWith(expect.anything(), "org-1", "bundle-1", {
      itemType: "grant",
      itemId: "grant-1",
      sortOrder: 0,
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "user-1",
      expect.objectContaining({
        scopes: [
          { scopeType: "grant", scopeId: "grant-1" },
          { scopeType: "evidence_bundle", scopeId: "bundle-1" },
        ],
      }),
      "raw-token-abc",
      "hash-abc",
      expect.any(String),
      "link_only",
      expect.any(Date),
    );
  });

  it("dedupes the bundle scope when quick-sharing an evidence bundle into itself", async () => {
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(getBundle).mockResolvedValue({ bundle: BUNDLE as never, items: [] });
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "evidence_bundle",
      itemId: "bundle-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    const app = buildAdminApp("admin", createTransactionalDb());

    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "evidence_bundle",
          scopeId: "bundle-1",
          bundleId: "bundle-1",
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "user-1",
      expect.objectContaining({
        scopes: [{ scopeType: "evidence_bundle", scopeId: "bundle-1" }],
      }),
      "raw-token-abc",
      "hash-abc",
      expect.any(String),
      "link_only",
      expect.any(Date),
    );
  });

  it("validates the scope target before creating an implicit quick-share bundle", async () => {
    vi.mocked(assertScopeTargetsBelongToOrg).mockRejectedValue(
      new AppError(404, "Scope target missing"),
    );
    const app = buildAdminApp("admin", { query: {} });

    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "foreign-grant",
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    expect(assertScopeTargetsBelongToOrg).toHaveBeenCalledWith(expect.anything(), "org-1", [
      { scopeType: "grant", scopeId: "foreign-grant" },
    ]);
    expect(createBundle).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns 404 when bundleId provided but bundle not found", async () => {
    vi.mocked(getBundle).mockResolvedValue(null);
    const app = buildAdminApp("admin", createTransactionalDb());
    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
          bundleId: "no-such-bundle",
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const app = buildAdminApp();
    const res = await app.request("/external-reviewers/quick-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewerId: "rev-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for editor with compliance manage", async () => {
    const app = buildAdminApp("editor", { query: {} });
    const res = await app.request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("external reviewer analytics", () => {
  beforeEach(() => vi.resetAllMocks());

  it("captures safe analytics for reviewer, session, and quick-share operations", async () => {
    vi.mocked(createReviewer).mockResolvedValue(REVIEWER as never);
    vi.mocked(updateReviewer).mockResolvedValue({ ...REVIEWER, name: "Updated" } as never);
    vi.mocked(softDeleteReviewer).mockResolvedValue(undefined);
    vi.mocked(signPortalToken).mockResolvedValue("raw-token-abc");
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(createSession).mockResolvedValue(SESSION as never);
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    vi.mocked(extendSession).mockImplementation(
      async (_db, _orgId, _sessionId, _actorId, _input, createTokenHash) => {
        const extendedExpiresAt = new Date("2026-06-01T00:00:00.000Z");
        await createTokenHash(extendedExpiresAt);
        return { ...SESSION, expiresAt: extendedExpiresAt } as never;
      },
    );
    vi.mocked(getBundle).mockResolvedValue({ bundle: BUNDLE as never, items: [] });
    vi.mocked(addBundleItem).mockResolvedValue({
      id: "item-1",
      bundleId: "bundle-1",
      itemType: "grant",
      itemId: "grant-1",
      caption: null,
      sortOrder: 0,
      createdAt: new Date(),
    } as never);

    await buildAdminApp().request("/external-reviewers/reviewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "reviewer@external.com",
        name: "External Reviewer",
        reviewerType: "auditor",
      }),
    });
    await buildAdminApp().request("/external-reviewers/reviewers/rev-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", reviewerType: "funder" }),
    });
    await buildAdminApp().request("/external-reviewers/reviewers/rev-1", {
      method: "DELETE",
    });
    await buildAdminApp("admin", { query: {} }).request(
      "/external-reviewers/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopes: [{ scopeType: "grant", scopeId: "grant-1" }],
        }),
      },
      TEST_ENV,
    );
    await buildAdminApp().request("/external-reviewers/sessions/sess-portal-1/revoke", {
      method: "POST",
    });
    await buildAdminApp().request(
      "/external-reviewers/sessions/sess-portal-1/extend",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionMs: 86400000 }),
      },
      TEST_ENV,
    );
    await buildAdminApp("admin", createTransactionalDb()).request(
      "/external-reviewers/quick-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: "rev-1",
          purpose: "Annual audit",
          ttlMs: 86400000,
          scopeType: "grant",
          scopeId: "grant-1",
          bundleId: "bundle-1",
        }),
      },
      TEST_ENV,
    );

    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(7);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.externalReviewerCreated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "external_reviewer",
          reviewer_type: "auditor",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.externalReviewerUpdated,
        payload: expect.objectContaining({
          entity_type: "external_reviewer",
          reviewer_type: "funder",
          changed_fields: ["name", "reviewerType"],
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.externalReviewerDeleted,
        payload: expect.objectContaining({ entity_type: "external_reviewer" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reviewerSessionCreated,
        payload: expect.objectContaining({
          entity_type: "external_review_session",
          scope_count_bucket: "1-10",
          ttl_bucket: "1d_7d",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reviewerSessionRevoked,
        payload: expect.objectContaining({ entity_type: "external_review_session" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reviewerSessionExtended,
        payload: expect.objectContaining({
          entity_type: "external_review_session",
          ttl_bucket: "1d_7d",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.quickShareCreated,
        payload: expect.objectContaining({
          entity_type: "external_review_quick_share",
          scope_type: "grant",
          scope_count_bucket: "1-10",
          ttl_bucket: "1d_7d",
          bundle_reused: true,
        }),
      }),
    );

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("reviewer@external.com");
    expect(serializedCalls).not.toContain("External Reviewer");
    expect(serializedCalls).not.toContain("Annual audit");
    expect(serializedCalls).not.toContain("raw-token-abc");
    expect(serializedCalls).not.toContain("rev-1");
    expect(serializedCalls).not.toContain("grant-1");
    expect(serializedCalls).not.toContain("bundle-1");
  });
});

// ---------------------------------------------------------------------------
// Portal public routes
// ---------------------------------------------------------------------------

describe("POST /public/portal/auth", () => {
  it("rejects an oversized token body before parsing or hashing it", async () => {
    const app = buildPortalTestApp();
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "20012" },
        body: JSON.stringify({ token: "x".repeat(20_000) }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    _resetPortalAuthRateLimit();
  });

  it("rate-limits repeated requests from the same IP with a 429", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue(null);
    const app = buildPortalTestApp();
    const send = () =>
      app.request(
        "/public/portal/auth",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.7" },
          body: JSON.stringify({ token: "bad-token" }),
        },
        TEST_ENV,
      );

    // The first PORTAL_AUTH_RATE_LIMIT_MAX (10) attempts pass the throttle and
    // resolve normally (401 for the bad token); the next is blocked with 429.
    for (let i = 0; i < 10; i++) {
      const res = await send();
      expect(res.status).toBe(401);
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
  });

  it("tracks the rate limit per IP independently", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue(null);
    const app = buildPortalTestApp();
    const send = (ip: string) =>
      app.request(
        "/public/portal/auth",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
          body: JSON.stringify({ token: "bad-token" }),
        },
        TEST_ENV,
      );

    for (let i = 0; i < 10; i++) {
      await send("198.51.100.1");
    }
    // A different IP still gets through.
    const other = await send("198.51.100.2");
    expect(other.status).toBe(401);
  });

  it("checkPortalAuthRateLimit allows first request and blocks past the cap", async () => {
    const map = new Map<string, string>();
    const store: RateLimitStore = {
      get: async (k) => map.get(k) ?? null,
      put: async (k, v) => {
        map.set(k, v);
      },
    };
    for (let i = 0; i < 10; i++) {
      expect(await checkPortalAuthRateLimit(store, "ip-a")).toBe(true);
    }
    expect(await checkPortalAuthRateLimit(store, "ip-a")).toBe(false);
  });

  it("checkPortalAuthRateLimit treats a corrupted counter as exhausted", async () => {
    const store: RateLimitStore = {
      get: async () => "not-a-number",
      put: async () => {},
    };
    expect(await checkPortalAuthRateLimit(store, "ip-b")).toBe(false);
  });

  it("returns 400 when token field is missing", async () => {
    const app = buildPortalTestApp();
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the auth body is malformed JSON", async () => {
    const app = buildPortalTestApp();
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(verifyPortalToken).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid token", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue(null);
    const app = buildPortalTestApp();
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "bad-token" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when session not found in DB", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-1",
      expiresAt: Date.now() + 1000,
    });
    const db = {
      query: {
        externalReviewSessions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-token" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with cookie when auth succeeds", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage)
      .mockResolvedValueOnce("hash-abc")
      .mockResolvedValueOnce("cookie-hash");
    vi.mocked(createPortalSessionCredential).mockResolvedValue("cookie-token-random");
    const returning = vi.fn().mockResolvedValue([{ id: "sess-portal-1" }]);
    const db = {
      query: {
        externalReviewSessions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sess-portal-1",
            orgId: "org-1",
            reviewerId: "rev-1",
            tokenHash: "hash-abc",
            invitationDeliveryPayload: { inviterName: "Internal Admin" },
            invitationProviderId: "provider-secret",
            invitationDeliveryError: "internal delivery error",
            createdBy: "internal-user-id",
            purpose: "Annual audit",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          }),
        },
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "rev-1",
            orgId: "org-1",
            email: "reviewer@example.com",
            name: "Reviewer",
            reviewerType: "auditor",
            organizationName: "Audit Firm",
            notes: "Internal reviewer notes",
            createdBy: "internal-user-id",
            deletedAt: null,
          }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning }),
        }),
      }),
    };
    vi.mocked(listScopes).mockResolvedValue([
      {
        sessionId: "sess-portal-1",
        scopeType: "grant",
        scopeId: "grant-1",
        scopeName: "Annual Grant",
        grantedBy: "internal-user-id",
        grantedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "raw-token-abc" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookie).toContain("gp_portal_session");
    expect(setCookie).toContain("gp_portal_session=cookie-token-random");
    expect(setCookie).not.toContain("raw-token-abc");
    expect(setCookie).toContain("Path=/api/public/portal");
    expect(createPortalSessionCredential).toHaveBeenCalledWith(
      "sess-portal-1",
      expect.any(Number),
      "test-portal-secret",
    );
    expect(returning).toHaveBeenCalledOnce();
    const body = (await res.json()) as {
      reviewer: Record<string, unknown>;
      session: Record<string, unknown>;
      scopes: unknown[];
    };
    expect(body.reviewer).toEqual({
      id: "rev-1",
      email: "reviewer@example.com",
      name: "Reviewer",
      reviewerType: "auditor",
      organizationName: "Audit Firm",
    });
    expect(body.session).toEqual({
      id: "sess-portal-1",
      orgId: "org-1",
      purpose: "Annual audit",
      expiresAt: expect.any(String),
      revokedAt: null,
    });
    expect(body.scopes).toEqual([
      {
        id: "sess-portal-1:grant:grant-1",
        sessionId: "sess-portal-1",
        scopeType: "grant",
        scopeId: "grant-1",
        scopeName: "Annual Grant",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("hash-abc");
    expect(JSON.stringify(body)).not.toContain("Internal reviewer notes");
    expect(JSON.stringify(body)).not.toContain("Internal Admin");
    expect(JSON.stringify(body)).not.toContain("provider-secret");
    expect(JSON.stringify(body)).not.toContain("internal delivery error");
    expect(JSON.stringify(body)).not.toContain("internal-user-id");
  });

  it("does not consume the emailed bearer when loading scopes fails", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage)
      .mockResolvedValueOnce("hash-abc")
      .mockResolvedValueOnce("cookie-hash");
    vi.mocked(createPortalSessionCredential).mockResolvedValue("cookie-token-random");
    vi.mocked(listScopes).mockRejectedValue(new Error("scope lookup failed"));
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "raw-token-abc" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(500);
    expect(db.update).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a replay when the emailed bearer was already consumed", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage)
      .mockResolvedValueOnce("hash-abc")
      .mockResolvedValueOnce("cookie-hash");
    vi.mocked(listScopes).mockResolvedValue([]);
    const db = makePortalAuthDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "raw-token-abc" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("falls back to BETTER_AUTH_SECRET during portal auth exchange", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    vi.mocked(listScopes).mockResolvedValue([]);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "raw-token-abc" }),
      },
      { ...TEST_ENV, PORTAL_TOKEN_SECRET: undefined },
    );

    expect(res.status).toBe(200);
    expect(verifyPortalToken).toHaveBeenCalledWith("raw-token-abc", "test-better-auth");
  });

  it("returns 401 when reviewer is deleted", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    const db = {
      query: {
        externalReviewSessions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sess-portal-1",
            tokenHash: "hash-abc",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          }),
        },
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({ id: "rev-1", deletedAt: new Date() }),
        },
      },
    };
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-token" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when reviewer belongs to a different org than the session", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
    const db = {
      query: {
        externalReviewSessions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sess-portal-1",
            orgId: "org-1",
            reviewerId: "rev-1",
            tokenHash: "hash-abc",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          }),
        },
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "rev-1",
            orgId: "org-foreign",
            deletedAt: null,
          }),
        },
      },
    };
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-token" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /public/portal/logout", () => {
  it("clears the portal cookie and returns 200", async () => {
    const app = buildPortalTestApp();
    const res = await app.request("/public/portal/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/api/public/portal");
  });
});

// ---------------------------------------------------------------------------
// Helper: builds a DB mock that satisfies portalReviewerMiddleware
// ---------------------------------------------------------------------------

function makePortalAuthDb(queryOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    query: {
      externalReviewSessions: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sess-portal-1",
          orgId: "org-1",
          reviewerId: "rev-1",
          tokenHash: "hash-abc",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
        }),
      },
      externalReviewers: {
        findFirst: vi.fn().mockResolvedValue({
          id: "rev-1",
          orgId: "org-1",
          deletedAt: null,
        }),
      },
      restrictionTerms: { findFirst: vi.fn() },
      ...queryOverrides,
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          catch: vi.fn(),
          returning: vi.fn().mockResolvedValue([{ id: "sess-portal-1" }]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
}

const PORTAL_COOKIE = "gp_portal_session=raw-token-abc";

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/restriction-terms/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/restriction-terms/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const RESTRICTION_TERM = {
    id: "term-1",
    orgId: "org-1",
    fundId: "fund-internal",
    grantId: "grant-internal",
    donationId: "donation-internal",
    sourceDocumentId: "document-internal",
    restrictionType: "purpose",
    source: "award_letter",
    title: "Federal grant restriction",
    purposeStatement: "Youth services only",
    releaseRule: "Release as spent",
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: "2025-12-31T00:00:00.000Z",
    beginningBalanceCents: 125_00,
    currency: "USD",
    evidenceRequirement: "Receipts",
    createdBy: "user-internal",
    deletedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
  };

  it("returns 200 with restriction term when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      restrictionTerms: {
        findFirst: vi.fn().mockResolvedValue(RESTRICTION_TERM),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/restriction-terms/term-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "term-1",
      restrictionType: "purpose",
      source: "award_letter",
      title: "Federal grant restriction",
      purposeStatement: "Youth services only",
      releaseRule: "Release as spent",
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: "2025-12-31T00:00:00.000Z",
      beginningBalanceCents: 125_00,
      currency: "USD",
      evidenceRequirement: "Receipts",
    });
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/restriction-terms/term-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when restriction term does not exist", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      restrictionTerms: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/restriction-terms/no-such-term",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when no portal token is provided", async () => {
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request("/public/portal/restriction-terms/term-1", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/evidence-bundles/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/evidence-bundles/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const BUNDLE_WITH_ITEMS = {
    bundle: BUNDLE,
    items: [
      {
        id: "item-1",
        bundleId: "bundle-1",
        itemType: "document",
        itemId: "document-1",
        caption: "Award letter",
        sortOrder: 0,
      },
    ],
  };

  it("returns 200 with bundle when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    vi.mocked(getBundle).mockResolvedValue(BUNDLE_WITH_ITEMS as never);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/evidence-bundles/bundle-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      bundle: {
        id: "bundle-1",
        title: "Q4 Evidence",
        description: null,
        purpose: "audit",
        periodStart: null,
        periodEnd: null,
      },
      items: [
        {
          id: "item-1",
          itemType: "document",
          itemId: "document-1",
          caption: "Award letter",
          sortOrder: 0,
        },
      ],
    });
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/evidence-bundles/bundle-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when bundle does not exist", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    vi.mocked(getBundle).mockResolvedValue(null);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/evidence-bundles/no-such-bundle",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when no portal token is provided", async () => {
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request("/public/portal/evidence-bundles/bundle-1", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/me
// ---------------------------------------------------------------------------

describe("GET /public/portal/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  it("returns 200 with reviewer, session and scopes", async () => {
    vi.mocked(listScopes).mockResolvedValue([
      {
        sessionId: "sess-portal-1",
        scopeType: "generated_report",
        scopeId: "report-1",
        scopeName: "Board Report",
        grantedBy: "internal-user-id",
        grantedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);
    const session = {
      ...SESSION,
      expiresAt: new Date(Date.now() + 86400000),
      tokenHash: "hash-abc",
      invitationDeliveryPayload: { inviterName: "Internal Admin" },
      invitationProviderId: "provider-secret",
      invitationDeliveryError: "internal delivery error",
      createdBy: "internal-user-id",
    };
    const reviewer = {
      ...REVIEWER,
      notes: "Internal reviewer notes",
      createdBy: "internal-user-id",
    };
    const db = makePortalAuthDb({
      externalReviewSessions: { findFirst: vi.fn().mockResolvedValue(session) },
      externalReviewers: { findFirst: vi.fn().mockResolvedValue(reviewer) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/me",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as {
      reviewer: Record<string, unknown>;
      session: Record<string, unknown>;
      scopes: unknown[];
    };
    expect(body.reviewer).toEqual({
      id: REVIEWER.id,
      email: REVIEWER.email,
      name: REVIEWER.name,
      reviewerType: REVIEWER.reviewerType,
      organizationName: REVIEWER.organizationName,
    });
    expect(body.session).toEqual({
      id: SESSION.id,
      orgId: SESSION.orgId,
      purpose: SESSION.purpose,
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: null,
    });
    expect(body.scopes).toEqual([
      {
        id: "sess-portal-1:generated_report:report-1",
        sessionId: "sess-portal-1",
        scopeType: "generated_report",
        scopeId: "report-1",
        scopeName: "Board Report",
      },
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("hash-abc");
    expect(serialized).not.toContain("Internal reviewer notes");
    expect(serialized).not.toContain("Internal Admin");
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).not.toContain("internal delivery error");
    expect(serialized).not.toContain("internal-user-id");
  });

  it("waits for the portal view audit write before returning record data", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    let releaseAudit!: () => void;
    vi.mocked(recordAuditEvent).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        }),
    );
    const db = makePortalAuthDb({
      grants: {
        findFirst: vi.fn().mockResolvedValue({
          id: "grant-1",
          orgId: "org-1",
          title: "Test Grant",
          deletedAt: null,
        }),
      },
    });
    const app = buildPortalTestApp(db);

    let settled = false;
    const responsePromise = Promise.resolve(
      app.request(
        "/public/portal/grants/grant-1",
        { headers: { cookie: PORTAL_COOKIE } },
        TEST_ENV,
      ),
    ).then((response) => {
      settled = true;
      return response;
    });

    await vi.waitFor(() => expect(recordAuditEvent).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    releaseAudit();
    expect((await responsePromise).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/grants/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/grants/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const GRANT_ENTITY = {
    id: "grant-1",
    orgId: "org-1",
    entityId: "entity-internal",
    funderId: "funder-1",
    name: "Test Grant",
    status: "active",
    amountCents: 500_00,
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: "2025-12-31T00:00:00.000Z",
    applicationDeadline: "2024-12-01T00:00:00.000Z",
    description: "Program support",
    notes: "Internal strategy note",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    deletedAt: null,
  };

  it("returns 200 with grant when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ grants: { findFirst: vi.fn().mockResolvedValue(GRANT_ENTITY) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/grants/grant-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "grant-1",
      name: "Test Grant",
      status: "active",
      amountCents: 500_00,
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: "2025-12-31T00:00:00.000Z",
      applicationDeadline: "2024-12-01T00:00:00.000Z",
      description: "Program support",
    });
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/grants/grant-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when grant not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ grants: { findFirst: vi.fn().mockResolvedValue(null) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/grants/no-grant",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/funds/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/funds/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const FUND_ENTITY = {
    id: "fund-1",
    orgId: "org-1",
    entityId: "entity-internal",
    name: "General Fund",
    type: "unrestricted",
    description: "General operations",
    externalId: "qb-secret-id",
    restrictionPurpose: "Internal purpose",
    restrictionSource: "Internal source",
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: null,
    status: "active",
    createdAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  it("returns 200 with fund when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ funds: { findFirst: vi.fn().mockResolvedValue(FUND_ENTITY) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/funds/fund-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "fund-1",
      name: "General Fund",
      fundType: "unrestricted",
      description: "General operations",
    });
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/funds/fund-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when fund not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ funds: { findFirst: vi.fn().mockResolvedValue(null) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/funds/no-fund",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/programs/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/programs/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const PROGRAM_ENTITY = {
    id: "prog-1",
    orgId: "org-1",
    name: "Youth Program",
    code: "YOUTH",
    description: "Youth services",
    ownerUserId: "user-internal",
    status: "active",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    deletedAt: null,
  };

  it("returns 200 with program when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      programs: { findFirst: vi.fn().mockResolvedValue(PROGRAM_ENTITY) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/programs/prog-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "prog-1",
      name: "Youth Program",
      code: "YOUTH",
      description: "Youth services",
      status: "active",
    });
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/programs/prog-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when program not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ programs: { findFirst: vi.fn().mockResolvedValue(null) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/programs/no-prog",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/documents/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/documents/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const DOC_ENTITY = {
    id: "doc-1",
    orgId: "org-1",
    entityType: "grant",
    filename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    fileKey: "docs/report.pdf",
    uploadedBy: "user-internal",
    createdAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  it("returns 200 with document metadata when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      documents: { findFirst: vi.fn().mockResolvedValue(DOC_ENTITY) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "doc-1",
      filename: "report.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 4096,
    });
  });

  it("returns subrecipient file metadata when only subrecipient_file scope allows access", async () => {
    vi.mocked(checkScope).mockImplementation(async (_db, _sessionId, scopeType) => {
      return scopeType === "subrecipient_file";
    });
    const db = makePortalAuthDb({
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          ...DOC_ENTITY,
          entityType: "subrecipient",
        }),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(checkScope).toHaveBeenCalledWith(
      expect.anything(),
      "sess-portal-1",
      "document",
      "doc-1",
    );
    expect(checkScope).toHaveBeenCalledWith(
      expect.anything(),
      "sess-portal-1",
      "subrecipient_file",
      "doc-1",
    );
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when document not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ documents: { findFirst: vi.fn().mockResolvedValue(null) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/no-doc",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for donor-adjacent documents even when a document scope exists", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          ...DOC_ENTITY,
          entityType: "contact",
        }),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/documents/:id/download
// ---------------------------------------------------------------------------

describe("GET /public/portal/documents/:id/download", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const DOC_ENTITY = {
    id: "doc-1",
    orgId: "org-1",
    entityType: "grant",
    filename: "report.pdf",
    mimeType: "application/pdf",
    fileKey: "docs/report.pdf",
    deletedAt: null,
  };

  it("returns 200 with file stream when access is allowed and R2 object exists", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      documents: { findFirst: vi.fn().mockResolvedValue(DOC_ENTITY) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("report.pdf");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("streams subrecipient files when only subrecipient_file scope allows access", async () => {
    vi.mocked(checkScope).mockImplementation(async (_db, _sessionId, scopeType) => {
      return scopeType === "subrecipient_file";
    });
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          ...DOC_ENTITY,
          entityType: "subrecipient",
        }),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(200);
    expect(r2Mock.get).toHaveBeenCalledWith("docs/report.pdf");
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when document metadata not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({ documents: { findFirst: vi.fn().mockResolvedValue(null) } });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/no-doc/download",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for donor-adjacent downloads even when a document scope exists", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          ...DOC_ENTITY,
          entityType: "event",
        }),
      },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );
    expect(res.status).toBe(403);
    expect(r2Mock.get).not.toHaveBeenCalled();
  });

  it("returns 404 when R2 object is missing", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      documents: { findFirst: vi.fn().mockResolvedValue(DOC_ENTITY) },
    });
    const app = buildPortalTestApp(db);
    // No R2 binding in TEST_ENV → object will be null
    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("does not stream the file when the download audit event cannot be written", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(new Error("audit insert failed"));
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      documents: { findFirst: vi.fn().mockResolvedValue(DOC_ENTITY) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/documents/doc-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Audit log unavailable" });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "download",
        targetType: "document",
        targetId: "doc-1",
      }),
      { throwOnFailure: true },
    );
    expect(r2Mock.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/generated-reports/:id
// ---------------------------------------------------------------------------

describe("GET /public/portal/generated-reports/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const REPORT_ENTITY = {
    id: "report-1",
    orgId: "org-1",
    entityId: "entity-internal",
    type: "spend_down",
    attemptId: "attempt-internal",
    recoveryAttemptedAt: "2025-01-02T00:00:00.000Z",
    readyEffectsStatus: "delivered",
    status: "ready",
    format: "pdf",
    title: "Spend-down report",
    grantId: "grant-internal",
    fundId: "fund-internal",
    donationId: "donation-internal",
    fiscalYear: "2025",
    fileKey: "org-1/report.pdf",
    fileName: "report.pdf",
    fileSizeBytes: 8192,
    metadata: { preview: { content: "Internal report preview" } },
    generatedBy: "user-internal",
    createdAt: "2025-01-01T00:00:00.000Z",
  };

  it("returns 200 with report when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(REPORT_ENTITY) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/generated-reports/report-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "report-1",
      type: "spend_down",
      format: "pdf",
      status: "ready",
      title: "Spend-down report",
      fileName: "report.pdf",
      fileSizeBytes: 8192,
      createdAt: "2025-01-01T00:00:00.000Z",
    });
  });

  it("does not expose generated report metadata before generation is ready", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      generatedReports: {
        findFirst: vi.fn().mockResolvedValue({
          ...REPORT_ENTITY,
          status: "failed",
          metadata: { failureReason: "render failed" },
          fileKey: "org-1/spend_down/report-1/failed.pdf",
        }),
      },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Generated report is not ready" });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 403 when scope check denies access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/generated-reports/report-1",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when report not found", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const app = buildPortalTestApp(db);
    const res = await app.request(
      "/public/portal/generated-reports/no-report",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Portal route: GET /public/portal/generated-reports/:id/download
// ---------------------------------------------------------------------------

describe("GET /public/portal/generated-reports/:id/download", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPortalSessionCredential).mockResolvedValue({
      sessionId: "sess-portal-1",
      expiresAt: Date.now() + 86400000,
    });
    vi.mocked(hashPortalTokenForStorage).mockResolvedValue("hash-abc");
  });

  const REPORT_ENTITY = {
    id: "report-1",
    orgId: "org-1",
    type: "spend_down",
    format: "pdf",
    status: "ready",
    fileKey: "org-1/spend_down/report-1/spend-down.pdf",
    fileName: 'spend/down";report.pdf',
  };

  it("returns 200 with generated report file stream when access is allowed", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(REPORT_ENTITY) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("spend-down--report.pdf");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "download",
        targetType: "generated_report",
        targetId: "report-1",
      }),
      { throwOnFailure: true },
    );
    expect(r2Mock.get).toHaveBeenCalledWith("org-1/spend_down/report-1/spend-down.pdf");
  });

  it("does not stream generated report files before generation is ready", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      generatedReports: {
        findFirst: vi.fn().mockResolvedValue({ ...REPORT_ENTITY, status: "failed" }),
      },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Generated report is not ready" });
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(r2Mock.get).not.toHaveBeenCalled();
  });

  it("streams CSV generated reports with a fallback sanitized filename", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      generatedReports: {
        findFirst: vi.fn().mockResolvedValue({
          ...REPORT_ENTITY,
          format: "csv",
          fileName: "",
        }),
      },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("download");
  });

  it("returns 403 when scope check denies generated report download access", async () => {
    vi.mocked(checkScope).mockResolvedValue(false);
    const r2Mock = { get: vi.fn() };
    const db = makePortalAuthDb();
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(403);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(r2Mock.get).not.toHaveBeenCalled();
  });

  it("returns 404 when generated report metadata is missing for download", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn() };
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/no-report/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(404);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(r2Mock.get).not.toHaveBeenCalled();
  });

  it("returns 404 when generated report object storage is unavailable", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(REPORT_ENTITY) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
  });

  it("returns 404 when generated report object storage misses the file", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    const r2Mock = { get: vi.fn().mockResolvedValue(null) };
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(REPORT_ENTITY) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
    expect(r2Mock.get).toHaveBeenCalledWith("org-1/spend_down/report-1/spend-down.pdf");
  });

  it("does not stream generated report files when the download audit event cannot be written", async () => {
    vi.mocked(checkScope).mockResolvedValue(true);
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(new Error("audit insert failed"));
    const r2Mock = { get: vi.fn().mockResolvedValue({ body: new ReadableStream() }) };
    const db = makePortalAuthDb({
      generatedReports: { findFirst: vi.fn().mockResolvedValue(REPORT_ENTITY) },
    });
    const app = buildPortalTestApp(db);

    const res = await app.request(
      "/public/portal/generated-reports/report-1/download",
      { headers: { cookie: PORTAL_COOKIE } },
      { ...TEST_ENV, R2: r2Mock },
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Audit log unavailable" });
    expect(r2Mock.get).not.toHaveBeenCalled();
  });
});
