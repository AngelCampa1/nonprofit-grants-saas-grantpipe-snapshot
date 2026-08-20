import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

import type { AppEnv } from "../../types.js";
import { aiCsContextRoutes } from "./context-routes.js";
import { buildAssertionPayload } from "./routes.js";

const CONTEXT_SECRET = "test-context-secret";
const APP_ID = "grantpipe";
const USER_ID = "user-test-1";
// aiCsContextRoutes is tested as a standalone router, so paths must match the
// router-level registration (GET /context), not the fully-mounted app path.
const BASE_URL = "http://localhost";

type MockD1Result = { success: boolean; meta: { changes: number } };
type MockD1Statement = {
  bind: (...args: unknown[]) => MockD1Statement;
  run: () => Promise<MockD1Result>;
  first: <T>() => Promise<T | null>;
  all: () => Promise<{ results: [] }>;
  raw: <T>() => Promise<T[]>;
};

function makeMockD1(runResult: MockD1Result = { success: true, meta: { changes: 1 } }) {
  const stmt: MockD1Statement = {
    bind: (..._args: unknown[]) => stmt,
    run: vi.fn(async () => runResult),
    first: vi.fn(async () => null),
    all: vi.fn(async () => ({ results: [] as [] })),
    raw: vi.fn(async () => []),
  };
  return {
    prepare: vi.fn(() => stmt),
    batch: vi.fn(async () => []),
    _stmt: stmt,
  };
}

function makeMockAppDb(
  member: { orgId: string; role: string; deletedAt: null } | null = {
    orgId: "org-1",
    role: "admin",
    deletedAt: null,
  },
) {
  return {
    query: {
      orgMembers: {
        findFirst: vi.fn(async () => member),
      },
    },
  };
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildSignedContextHeaders(
  path: string,
  secret: string,
  appId = APP_ID,
  userId = USER_ID,
): Promise<{
  "X-Ventora-Timestamp": string;
  "X-Ventora-Nonce": string;
  "X-Ventora-Signature": string;
}> {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const payload = await buildAssertionPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { appId, userId },
  });
  const signature = await hmacHex(payload, secret);
  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": signature,
  };
}

function buildContextRequest(
  headers: Record<string, string>,
  appId = APP_ID,
  userId = USER_ID,
  env: Partial<AppEnv["Bindings"]> = {},
  member: { orgId: string; role: string; deletedAt: null } | null = {
    orgId: "org-1",
    role: "admin",
    deletedAt: null,
  },
  extraQuery = "",
) {
  const mockDb = makeMockD1();
  const mockAppDb = makeMockAppDb(member);
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", mockAppDb as unknown as AppEnv["Variables"]["db"]);
      await next();
    })
    .route("", aiCsContextRoutes);
  const url = `${BASE_URL}/context?appId=${appId}&userId=${userId}${extraQuery}`;
  return {
    request: app.request(url, { method: "GET", headers }, {
      AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
      MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      ...env,
    } as AppEnv["Bindings"]),
    mockDb,
    mockAppDb,
  };
}

describe("GET /api/ai-cs/context", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 for unknown appId", async () => {
    const path = `/context?appId=unknown&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET, "unknown");

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      { method: "GET", headers: signedHeaders },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(404);
  });

  it("returns 503 when AI_CS_CONTEXT_SECRET is missing", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const res = await aiCsContextRoutes.request(`${BASE_URL}${path}`, { method: "GET" }, {
      AI_CS_CONTEXT_SECRET: undefined,
      MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    } as AppEnv["Bindings"]);

    expect(res.status).toBe(503);
  });

  it("returns 503 when MARKETING_DB is missing", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const res = await aiCsContextRoutes.request(`${BASE_URL}${path}`, { method: "GET" }, {
      AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
      MARKETING_DB: undefined,
    } as AppEnv["Bindings"]);

    expect(res.status).toBe(503);
  });

  it("returns 401 when userId query param is missing", async () => {
    const path = `/context?appId=${APP_ID}`;
    const res = await aiCsContextRoutes.request(`${BASE_URL}${path}`, { method: "GET" }, {
      AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
      MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    } as AppEnv["Bindings"]);

    expect(res.status).toBe(401);
  });

  it("returns 401 when HMAC headers are missing", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const res = await aiCsContextRoutes.request(`${BASE_URL}${path}`, { method: "GET" }, {
      AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
      MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    } as AppEnv["Bindings"]);

    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid HMAC signature", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const validHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const tamperedHeaders = {
      ...validHeaders,
      "X-Ventora-Signature": "a".repeat(64),
    };

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      { method: "GET", headers: tamperedHeaders },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 when nonce replay is detected (changes=0)", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const mockDb = makeMockD1({ success: true, meta: { changes: 0 } });

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      { method: "GET", headers: signedHeaders },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("returns 200 with app context for a valid signed request", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const mockDb = makeMockD1();
    const mockAppDb = makeMockAppDb();
    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", mockAppDb as unknown as AppEnv["Variables"]["db"]);
        await next();
      })
      .route("", aiCsContextRoutes);

    const res = await app.request(`${BASE_URL}${path}`, { method: "GET", headers: signedHeaders }, {
      AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
      MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    } as AppEnv["Bindings"]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.appId).toBe("grantpipe");
    expect(body.assistantId).toBe("ai-cs");
    expect(body.authenticatedOnly).toBe(true);
    expect(Array.isArray(body.sources)).toBe(true);
    expect(Array.isArray(body.navigation)).toBe(true);
    expect(Array.isArray(body.workflow)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThan(32_000);
  });

  it("returns 403 when the signed user has no active org membership", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { request } = buildContextRequest(signedHeaders, APP_ID, USER_ID, {}, null);

    const res = await request;

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "No organization membership" });
  });

  it("uses the requested org only when the signed user is an active member", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}&orgId=org-requested`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { request, mockAppDb } = buildContextRequest(
      signedHeaders,
      APP_ID,
      USER_ID,
      {},
      {
        orgId: "org-requested",
        role: "editor",
        deletedAt: null,
      },
      "&orgId=org-requested",
    );

    const res = await request;

    expect(res.status).toBe(200);
    expect(mockAppDb.query.orgMembers.findFirst).toHaveBeenCalled();
  });

  it("rejects requested org context when membership lookup fails", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}&orgId=forged-org`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { request } = buildContextRequest(
      signedHeaders,
      APP_ID,
      USER_ID,
      {},
      null,
      "&orgId=forged-org",
    );

    const res = await request;

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "No organization membership" });
  });

  it("filters context to routes and help articles available to the member role", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { request, mockAppDb } = buildContextRequest(
      signedHeaders,
      APP_ID,
      USER_ID,
      {},
      {
        orgId: "org-viewer",
        role: "viewer",
        deletedAt: null,
      },
    );

    const res = await request;

    expect(res.status).toBe(200);
    expect(mockAppDb.query.orgMembers.findFirst).toHaveBeenCalled();
    const body = (await res.json()) as {
      sources: Array<{ id: string }>;
      navigation: Array<{ path: string }>;
      workflow: Array<{ id: string }>;
    };
    expect(body.sources.map((source) => source.id)).not.toContain("first_setup");
    expect(body.navigation.map((target) => target.path)).not.toContain("/settings");
    expect(body.workflow.map((step) => step.id)).not.toContain("invite_teammate");
  });

  it("returns signed response headers on success", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { request } = buildContextRequest(signedHeaders);

    const res = await request;

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Ventora-Timestamp")).toBeTruthy();
    expect(res.headers.get("X-Ventora-Nonce")).toBeTruthy();
    expect(res.headers.get("X-Ventora-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("returns 401 when timestamp is too old (skew > 5 min)", async () => {
    const oldTimestamp = new Date(Date.now() - 6 * 60 * 1_000).toISOString();
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const nonce = crypto.randomUUID();
    const payload = await buildAssertionPayload({
      timestamp: oldTimestamp,
      nonce,
      method: "GET",
      path,
      body: { appId: APP_ID, userId: USER_ID },
    });
    const signature = await hmacHex(payload, CONTEXT_SECRET);

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          "X-Ventora-Timestamp": oldTimestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": signature,
        },
      },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 when timestamp is not a valid date string", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const nonce = crypto.randomUUID();
    const invalidTimestamp = "not-a-date";
    const payload = await buildAssertionPayload({
      timestamp: invalidTimestamp,
      nonce,
      method: "GET",
      path,
      body: { appId: APP_ID, userId: USER_ID },
    });
    const signature = await hmacHex(payload, CONTEXT_SECRET);
    const mockDb = makeMockD1();

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          "X-Ventora-Timestamp": invalidTimestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": signature,
        },
      },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 when HMAC length differs from expected", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    // Use a short signature (wrong length, not padded to 64 chars)
    const tamperedHeaders = {
      ...signedHeaders,
      "X-Ventora-Signature": "abc123",
    };

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      { method: "GET", headers: tamperedHeaders },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("accepts a currentPath query signed with the canonical worker body", async () => {
    // The AI-CS worker carries currentPath in the query string for app-context
    // scoping, but signs only the stable context body: { appId, userId }.
    const currentPath = "/dashboard";
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}&currentPath=${encodeURIComponent(currentPath)}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const payload = await buildAssertionPayload({
      timestamp,
      nonce,
      method: "GET",
      path,
      body: { appId: APP_ID, userId: USER_ID },
    });
    const signature = await hmacHex(payload, CONTEXT_SECRET);
    const mockDb = makeMockD1();
    const mockAppDb = makeMockAppDb();
    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", mockAppDb as unknown as AppEnv["Variables"]["db"]);
        await next();
      })
      .route("", aiCsContextRoutes);

    const res = await app.request(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          "X-Ventora-Timestamp": timestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": signature,
        },
      },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { howtos: Array<{ id: string }> };
    const howtoIds = body.howtos.map((howto) => howto.id);

    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThan(32_000);
    expect(howtoIds).toContain("dashboard");
    expect(howtoIds).toContain("grants");
    expect(howtoIds).not.toContain("donor_email");
  });

  it("rejects a currentPath request signed with currentPath in the body", async () => {
    // Guard against the inverse drift: currentPath belongs in the query string,
    // not in the canonical signed context body.
    const currentPath = "/grants";
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}&currentPath=${encodeURIComponent(currentPath)}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const payload = await buildAssertionPayload({
      timestamp,
      nonce,
      method: "GET",
      path,
      body: { appId: APP_ID, userId: USER_ID, currentPath },
    });
    const signature = await hmacHex(payload, CONTEXT_SECRET);

    const res = await aiCsContextRoutes.request(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          "X-Ventora-Timestamp": timestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": signature,
        },
      },
      {
        AI_CS_CONTEXT_SECRET: CONTEXT_SECRET,
        MARKETING_DB: makeMockD1() as unknown as AppEnv["Bindings"]["MARKETING_DB"],
      } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(401);
  });

  it("calls D1 to delete expired nonces and insert the new one", async () => {
    const path = `/context?appId=${APP_ID}&userId=${USER_ID}`;
    const signedHeaders = await buildSignedContextHeaders(path, CONTEXT_SECRET);
    const { mockDb, request } = buildContextRequest(signedHeaders);

    await request;

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM ai_cs_nonces"),
    );
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO ai_cs_nonces"),
    );
  });
});
