import { Hono } from "hono";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { portalReviewerMiddleware } from "./portal-reviewer";
import type { AppEnv, Bindings } from "../types";
import {
  createPortalSessionCredential,
  hashPortalTokenForStorage,
} from "../domains/external-reviewers/tokens";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

const SECRET = "test-portal-secret";
const SESSION_ID = "session-uuid-1";
const REVIEWER_ID = "reviewer-uuid-1";
const ORG_ID = "org-uuid-1";

/** Default bindings — BETTER_AUTH_SECRET is used as the portal secret fallback. */
const DEFAULT_ENV: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: SECRET,
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
};

function makeFutureDate(ms = 3_600_000): Date {
  return new Date(Date.now() + ms);
}

function makePastDate(ms = 1_000): Date {
  return new Date(Date.now() - ms);
}

async function makeValidToken(sessionId = SESSION_ID, expiresAt?: number): Promise<string> {
  const exp = expiresAt ?? Date.now() + 3_600_000;
  return createPortalSessionCredential(sessionId, exp, SECRET);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  mockCaptureBackgroundException.mockClear();
});

type MockDb = {
  query: {
    externalReviewSessions: { findFirst: ReturnType<typeof vi.fn> };
    externalReviewers: { findFirst: ReturnType<typeof vi.fn> };
  };
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function makeMockDb(): MockDb {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const insertChain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  return {
    query: {
      externalReviewSessions: { findFirst: vi.fn() },
      externalReviewers: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValue(insertChain),
  };
}

async function makeDefaultSession(rawToken: string, overrides?: Record<string, unknown>) {
  const tokenHash = await hashPortalTokenForStorage(rawToken, SECRET);
  return {
    id: SESSION_ID,
    orgId: ORG_ID,
    reviewerId: REVIEWER_ID,
    tokenHash,
    purpose: "Annual audit",
    expiresAt: makeFutureDate(),
    revokedAt: null,
    revokedBy: null,
    lastAccessedAt: null,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const defaultReviewer = {
  id: REVIEWER_ID,
  orgId: ORG_ID,
  email: "reviewer@example.com",
  name: "Jane Reviewer",
  reviewerType: "auditor",
  organizationName: null,
  notes: null,
  createdBy: null,
  createdAt: new Date(),
  deletedAt: null,
};

function buildApp(db: MockDb, envOverrides: Partial<Bindings> = {}) {
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db as never);
      await next();
    })
    .use("*", portalReviewerMiddleware)
    .get("/portal/test", (c) => {
      return c.json({
        portalSessionId: c.get("portalSessionId"),
        portalReviewerId: c.get("portalReviewerId"),
        portalOrgId: c.get("portalOrgId"),
        hasSession: c.get("portalSession") !== null,
        hasReviewer: c.get("portalReviewer") !== null,
      });
    });
  return { app, env: { ...DEFAULT_ENV, ...envOverrides } };
}

// ---------------------------------------------------------------------------
// Missing / invalid token
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — no token", () => {
  it("returns 401 when no cookie or query param is provided", async () => {
    const db = makeMockDb();
    const { app, env } = buildApp(db);

    const res = await app.request("/portal/test", {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Portal authentication required" });
  });
});

describe("portalReviewerMiddleware — invalid/expired token", () => {
  it("returns 401 when token HMAC verification fails", async () => {
    const db = makeMockDb();
    const { app, env } = buildApp(db);

    const res = await app.request("/portal/test?token=bad.token.value", {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired portal session" });
  });

  it("returns 401 when token is expired", async () => {
    const db = makeMockDb();
    const { app, env } = buildApp(db);
    const expiredToken = await createPortalSessionCredential(
      SESSION_ID,
      Date.now() - 1_000,
      SECRET,
    );

    const res = await app.request(
      `/portal/test?token=${encodeURIComponent(expiredToken)}`,
      {},
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired portal session" });
  });
});

// ---------------------------------------------------------------------------
// Session not found / revoked / tokenHash mismatch
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — session DB checks", () => {
  it("returns 401 when session is not found in DB", async () => {
    const db = makeMockDb();
    db.query.externalReviewSessions.findFirst.mockResolvedValue(null);

    const { app, env } = buildApp(db);
    const token = await makeValidToken();

    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired portal session" });
  });

  it("returns 401 when session tokenHash does not match", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    db.query.externalReviewSessions.findFirst.mockResolvedValue({
      id: SESSION_ID,
      orgId: ORG_ID,
      reviewerId: REVIEWER_ID,
      tokenHash: "wrong-hash",
      purpose: "audit",
      expiresAt: makeFutureDate(),
      revokedAt: null,
    });

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is revoked", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token, { revokedAt: makePastDate() });
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 when session.expiresAt is in the past (DB check)", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token, { expiresAt: makePastDate() });
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Reviewer not found / deleted
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — reviewer DB checks", () => {
  it("returns 401 when reviewer is not found in DB", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(null);

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 when reviewer has been soft-deleted", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue({
      ...defaultReviewer,
      deletedAt: makePastDate(),
    });

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 when reviewer belongs to a different org than the session", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue({
      ...defaultReviewer,
      orgId: "org-foreign",
    });

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Happy path — query param token
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — valid token via query param", () => {
  let db: MockDb;
  let token: string;

  beforeEach(async () => {
    db = makeMockDb();
    token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);
  });

  it("returns 200 and sets context variables", async () => {
    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.portalSessionId).toBe(SESSION_ID);
    expect(body.portalReviewerId).toBe(REVIEWER_ID);
    expect(body.portalOrgId).toBe(ORG_ID);
    expect(body.hasSession).toBe(true);
    expect(body.hasReviewer).toBe(true);
  });

  it("sets the gp_portal_session cookie on the response", async () => {
    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("gp_portal_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
  });

  it("waits for durable session access writes before returning", async () => {
    let releaseUpdate!: () => void;
    let releaseAudit!: () => void;
    db.update.mockReturnValueOnce({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        }),
      ),
    });
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        }),
      ),
    });
    const { app, env } = buildApp(db);
    let settled = false;
    const responsePromise = Promise.resolve(
      app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env),
    ).then((response) => {
      settled = true;
      return response;
    });

    await vi.waitFor(() => {
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });
    expect(settled).toBe(false);
    releaseUpdate();
    releaseAudit();
    expect((await responsePromise).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Happy path — cookie token
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — valid token via cookie", () => {
  it("reads the token from the cookie header", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const req = new Request("http://localhost/portal/test", {
      headers: { cookie: `gp_portal_session=${token}` },
    });
    const res = await app.request(req, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.portalSessionId).toBe(SESSION_ID);
  });

  it("a fresh explicit query token replaces a stale cookie and refreshes it", async () => {
    const db = makeMockDb();
    const cookieToken = await makeValidToken("stale-session");
    const queryToken = await createPortalSessionCredential(
      "other-session",
      Date.now() + 3_600_000,
      SECRET,
    );
    const session = await makeDefaultSession(queryToken, { id: "other-session" });
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const req = new Request(
      `http://localhost/portal/test?token=${encodeURIComponent(queryToken)}`,
      {
        headers: { cookie: `gp_portal_session=${cookieToken}` },
      },
    );
    const res = await app.request(req, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.portalSessionId).toBe("other-session");
    expect(res.headers.get("set-cookie")).toContain(`gp_portal_session=${queryToken}`);
  });
});

// ---------------------------------------------------------------------------
// Secret fallback
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — PORTAL_TOKEN_SECRET fallback", () => {
  it("falls back to BETTER_AUTH_SECRET when PORTAL_TOKEN_SECRET is absent", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    // No PORTAL_TOKEN_SECRET — middleware should fall back to BETTER_AUTH_SECRET (=SECRET)
    const { app, env } = buildApp(db, {});
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(200);
  });

  it("uses PORTAL_TOKEN_SECRET when present", async () => {
    const customSecret = "custom-portal-secret";
    const expiresAt = Date.now() + 3_600_000;
    const token = await createPortalSessionCredential(SESSION_ID, expiresAt, customSecret);
    const tokenHash = await hashPortalTokenForStorage(token, customSecret);

    const db = makeMockDb();
    db.query.externalReviewSessions.findFirst.mockResolvedValue({
      id: SESSION_ID,
      orgId: ORG_ID,
      reviewerId: REVIEWER_ID,
      tokenHash,
      purpose: "audit",
      expiresAt: makeFutureDate(),
      revokedAt: null,
      createdAt: new Date(),
    });
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db, { PORTAL_TOKEN_SECRET: customSecret });
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(200);
  });

  it("rejects a token signed with wrong secret even if DB row would match", async () => {
    const db = makeMockDb();
    // Token signed with the default SECRET but PORTAL_TOKEN_SECRET is different
    const token = await makeValidToken();
    // DB is not reached because HMAC verification fails first
    db.query.externalReviewSessions.findFirst.mockResolvedValue(null);

    const { app, env } = buildApp(db, { PORTAL_TOKEN_SECRET: "different-secret" });
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cookie parsing edge cases
// ---------------------------------------------------------------------------

describe("portalReviewerMiddleware — cookie parsing", () => {
  it("parses cookie correctly when multiple cookies are present", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const req = new Request("http://localhost/portal/test", {
      headers: {
        cookie: `other_cookie=value1; gp_portal_session=${token}; another=value2`,
      },
    });
    const res = await app.request(req, {}, env);
    expect(res.status).toBe(200);
  });

  it("ignores cookie with matching prefix but different name", async () => {
    const db = makeMockDb();
    const { app, env } = buildApp(db);
    const req = new Request("http://localhost/portal/test", {
      // 'gp_portal_session_v2' is not 'gp_portal_session'
      headers: { cookie: "gp_portal_session_v2=sometoken" },
    });
    const res = await app.request(req, {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Portal authentication required" });
  });
});

describe("portalReviewerMiddleware — IP and UA audit hashing branches", () => {
  it("records session access when cf-connecting-ip and user-agent headers are present", async () => {
    const db = makeMockDb();
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const req = new Request(`http://localhost/portal/test?token=${token}`, {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "user-agent": "Mozilla/5.0 TestBrowser",
      },
    });
    const res = await app.request(req, {}, env);
    // The middleware should pass through to the handler successfully
    expect(res.status).toBe(200);
  });

  it("reports last-access update failures without blocking the portal response", async () => {
    const db = makeMockDb();
    const updateError = new Error("last access failed");
    db.update.mockReturnValueOnce({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(updateError),
    });
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);

    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      updateError,
      "external-reviewer-portal",
      { step: "last_accessed" },
    );
  });

  it("reports session-open audit failures without blocking the portal response", async () => {
    const db = makeMockDb();
    const auditError = new Error("audit failed");
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValue(auditError),
    });
    const token = await makeValidToken();
    const session = await makeDefaultSession(token);
    db.query.externalReviewSessions.findFirst.mockResolvedValue(session);
    db.query.externalReviewers.findFirst.mockResolvedValue(defaultReviewer);

    const { app, env } = buildApp(db);
    const res = await app.request(`/portal/test?token=${encodeURIComponent(token)}`, {}, env);

    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      auditError,
      "external-reviewer-portal",
      { step: "session_open_audit" },
    );
  });
});
