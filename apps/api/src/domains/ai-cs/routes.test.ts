import { Hono } from "hono";
import { appKnowledge, canUseHelpArticle } from "@grantpipe/shared/knowledge";
import type { AiSdrMeetingLink } from "@grantpipe/shared/public-kb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));
vi.mock("../../lib/sentry.js", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

import type { AppEnv } from "../../types.js";
import {
  aiCsRoutes,
  buildAssertionPayload,
  buildForwardBody,
  buildGrantpipeAppContext,
  consumeNonce,
  persistEscalation,
  readJsonObject,
} from "./routes.js";

const SECRET = "test-client-assertion-secret";
const WORKER_ORIGIN = "https://ai-cs.example.test";

type TestContext = {
  user?: AppEnv["Variables"]["user"];
  session?: AppEnv["Variables"]["session"];
  orgId?: AppEnv["Variables"]["orgId"];
};

type MockD1Result = { success: boolean; meta: { changes: number } };
type MockD1Statement = {
  bind: (...args: unknown[]) => MockD1Statement;
  run: () => Promise<MockD1Result>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  raw: <T>() => Promise<T[]>;
};

function makeMockD1(runResult: MockD1Result = { success: true, meta: { changes: 1 } }) {
  const stmt: MockD1Statement = {
    bind: (..._args: unknown[]) => stmt,
    run: vi.fn(async () => runResult),
    first: vi.fn(async () => null),
    all: vi.fn(async () => ({ results: [] })),
    raw: vi.fn(async () => []),
  };
  const db = {
    prepare: vi.fn(() => stmt),
    batch: vi.fn(async () => []),
    _stmt: stmt,
  };
  return db;
}

function buildApp(env: Partial<AppEnv["Bindings"]> = {}, context: TestContext = {}) {
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set(
        "user",
        context.user === undefined
          ? { id: "user-1", email: "user@example.com", name: "Test User" }
          : context.user,
      );
      c.set(
        "session",
        context.session === undefined ? { id: "session-1", userId: "user-1" } : context.session,
      );
      c.set("orgId", context.orgId === undefined ? "org-1" : context.orgId);
      c.set("memberRole", "admin");
      await next();
    })
    .route("/ai-cs", aiCsRoutes);

  return (path: string, init?: RequestInit) =>
    app.request(path, init, {
      AI_CS_WORKER_ORIGIN: WORKER_ORIGIN,
      AI_CS_CLIENT_ASSERTION_SECRET: SECRET,
      ...env,
    } as AppEnv["Bindings"]);
}

describe("AI-CS proxy routes (v1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCaptureBackgroundException.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ sessionId: "cs-session-1", status: "ready" })),
    );
  });

  it("creates a signed support session at /v1/sessions", async () => {
    const res = await buildApp()("/ai-cs/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ currentPath: "/dashboard" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      sessionId: "cs-session-1",
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${WORKER_ORIGIN}/v1/sessions`);
    expect(init).toBeDefined();
    const headers = new Headers(init!.headers);
    expect(headers.get("X-Ventora-Timestamp")).toBeTruthy();
    expect(headers.get("X-Ventora-Nonce")).toBeTruthy();
    expect(headers.get("X-Ventora-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(headers.get("Content-Type")).toBe("application/json");

    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ appId: "grantpipe", userId: "user-1" });
    expect(body.currentPath).toBe("/dashboard");
  });

  it("injects appId=grantpipe and drops any client-supplied appId or userId", async () => {
    await buildApp()("/ai-cs/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ appId: "attacker", userId: "evil" }),
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body.appId).toBe("grantpipe");
    expect(body.userId).toBe("user-1");
  });

  it("injects server-resolved orgId and ignores client-supplied metadata orgId", async () => {
    await buildApp({}, { orgId: "org-server" })("/ai-cs/v1/sessions", {
      method: "POST",
      body: JSON.stringify({
        metadata: { orgId: "org-forged", plan: "starter" },
      }),
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init!.body)) as {
      metadata?: Record<string, unknown>;
    };
    expect(body.metadata).toEqual({ orgId: "org-server" });
  });

  it("proxies chat to /v1/chat with authenticated identity rebound", async () => {
    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "cs-session-1",
        message: "Help?",
        appId: "forged",
        userId: "attacker",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(`${WORKER_ORIGIN}/v1/chat`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      appId: "grantpipe",
      userId: "user-1",
      sessionId: "cs-session-1",
      message: "Help?",
    });
  });

  it("signs chat bodies that contain array values (stable array serialization)", async () => {
    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "cs-session-1",
        message: "Help?",
        history: ["hi", "there", "again"],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      history: ["hi", "there", "again"],
    });
  });

  it("streams chat SSE responses without buffering", async () => {
    const sseChunk = 'data: {"delta":"Hello"}\n\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new TextEncoder().encode(sseChunk), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );

    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "cs-1", message: "Hi" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toBe(sseChunk);
  });

  it("defaults streamed chat responses to text/event-stream when upstream omits content type", async () => {
    const sseChunk = 'data: {"delta":"Hello"}\n\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode(sseChunk), { status: 200 })),
    );

    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "cs-1", message: "Hi" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns 502 when chat upstream returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 502 })),
    );

    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "cs-1", message: "Hi" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
  });

  it("proxies escalations to /v1/escalations with authenticated identity rebound", async () => {
    const mockDb = makeMockD1();

    const res = await buildApp({
      MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    })("/ai-cs/v1/escalations", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "cs-session-1",
        reason: "Need help",
        appId: "forged",
        userId: "attacker",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(`${WORKER_ORIGIN}/v1/escalations`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      appId: "grantpipe",
      userId: "user-1",
      sessionId: "cs-session-1",
      reason: "Need help",
    });
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_cs_escalations"),
    );
  });

  it("persists nullable message and string contact for escalations", async () => {
    const mockDb = makeMockD1();
    const bindSpy = vi.fn((..._args: unknown[]) => mockDb._stmt);
    mockDb._stmt.bind = bindSpy;

    const res = await buildApp({
      MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    })("/ai-cs/v1/escalations", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "cs-1",
        reason: "Need help",
        contact: "ops@example.com",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const bindArgs = bindSpy.mock.calls[0] ?? [];
    expect(bindArgs[4]).toBeNull();
    expect(bindArgs[5]).toBe("ops@example.com");
  });

  it("serializes object contact to JSON string in escalations", async () => {
    const mockDb = makeMockD1();

    const res = await buildApp({
      MARKETING_DB: mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"],
    })("/ai-cs/v1/escalations", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "cs-1",
        contact: { email: "test@example.com" },
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_cs_escalations"),
    );
  });

  it("returns 400 for escalation without sessionId", async () => {
    const res = await buildApp()("/ai-cs/v1/escalations", {
      method: "POST",
      body: JSON.stringify({ reason: "no session" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when worker origin is missing", async () => {
    const res = await buildApp({ AI_CS_WORKER_ORIGIN: "" })("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "AI support unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when worker origin has unsupported protocol", async () => {
    const res = await buildApp({ AI_CS_WORKER_ORIGIN: "mailto:foo@bar.test" })(
      "/ai-cs/v1/sessions",
      { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } },
    );

    expect(res.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when worker origin is not a valid URL", async () => {
    const res = await buildApp({ AI_CS_WORKER_ORIGIN: "http://[" })("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when assertion secret is missing", async () => {
    const res = await buildApp({ AI_CS_CLIENT_ASSERTION_SECRET: " " })("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not on context", async () => {
    const res = await buildApp({}, { user: null })("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: "{bad",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Request body must be valid JSON",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object JSON body", async () => {
    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify(["array"]),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Request body must be a JSON object",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 413 for oversized body", async () => {
    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: "x".repeat(32_001),
    });

    expect(res.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );

    const res = await buildApp()("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
    // A worker we cannot even reach is an actionable outage. Capture the thrown
    // fetch error to Sentry, tagged to the ai-cs surface and the proxy step.
    expect(mockCaptureBackgroundException).toHaveBeenCalledTimes(1);
    const [capturedError, surface, tags] = mockCaptureBackgroundException.mock.calls[0]!;
    expect((capturedError as Error).message).toBe("network");
    expect(surface).toBe("ai-cs");
    expect(tags).toMatchObject({ step: "worker-proxy", route: "sessions" });
  });

  it("returns 502 when upstream returns non-2xx for sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "upstream error" }, { status: 500 })),
    );

    const res = await buildApp()("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
    // A non-2xx from a reachable worker is also actionable. Capture it with the
    // upstream status so the failure is triageable, never the request body.
    expect(mockCaptureBackgroundException).toHaveBeenCalledTimes(1);
    const [, surface, tags] = mockCaptureBackgroundException.mock.calls[0]!;
    expect(surface).toBe("ai-cs");
    expect(tags).toMatchObject({ step: "worker-proxy", route: "sessions", status: "500" });
  });

  it("propagates 404 from upstream chat so widget session-recovery fires", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "session not found" }, { status: 404 })),
    );

    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "stale-session", message: "hello" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Session not found" });
    // A 404 is the normal stale-session signal, not a failure. It must never be
    // reported to Sentry, or every expired session would page someone.
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("returns 502 for non-404 upstream error on chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "upstream error" }, { status: 500 })),
    );

    const res = await buildApp()("/ai-cs/v1/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "s1", message: "hello" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
    // A non-404 chat error is a real outage. Capture it with the chat route and
    // upstream status; the user message is never forwarded.
    expect(mockCaptureBackgroundException).toHaveBeenCalledTimes(1);
    const [, surface, tags] = mockCaptureBackgroundException.mock.calls[0]!;
    expect(surface).toBe("ai-cs");
    expect(tags).toMatchObject({ step: "worker-proxy", route: "chat", status: "500" });
  });

  it("normalizes worker origin to strip path component", async () => {
    await buildApp({ AI_CS_WORKER_ORIGIN: `${WORKER_ORIGIN}/extra/path` })("/ai-cs/v1/sessions", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(`${WORKER_ORIGIN}/v1/sessions`);
  });

  it("accepts empty body for session creation", async () => {
    const res = await buildApp()("/ai-cs/v1/sessions", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ appId: "grantpipe", userId: "user-1" });
    expect(body.currentPath).toBeUndefined();
  });
});

describe("buildAssertionPayload", () => {
  it("produces a deterministic payload string", async () => {
    const payload = await buildAssertionPayload({
      timestamp: "2026-06-07T00:00:00.000Z",
      nonce: "abc123",
      method: "POST",
      path: "/v1/sessions",
      body: { appId: "grantpipe", userId: "u1" },
    });

    expect(payload).toMatch(
      /^2026-06-07T00:00:00\.000Z\.abc123\.POST\.\/v1\/sessions\.[a-f0-9]{64}$/,
    );
  });

  it("produces the same payload for the same stable input", async () => {
    const input = {
      timestamp: "2026-06-07T00:00:00.000Z",
      nonce: "test-nonce",
      method: "POST",
      path: "/v1/sessions",
      body: { userId: "u1", appId: "grantpipe" },
    };
    const p1 = await buildAssertionPayload(input);
    const p2 = await buildAssertionPayload(input);
    expect(p1).toBe(p2);
  });

  it("sorts body keys for stable serialization regardless of input order", async () => {
    const a = await buildAssertionPayload({
      timestamp: "t",
      nonce: "n",
      method: "POST",
      path: "/v1/sessions",
      body: { z: 1, a: 2 },
    });
    const b = await buildAssertionPayload({
      timestamp: "t",
      nonce: "n",
      method: "POST",
      path: "/v1/sessions",
      body: { a: 2, z: 1 },
    });
    expect(a).toBe(b);
  });
});

describe("buildForwardBody", () => {
  it("injects appId and userId for sessions route", () => {
    const result = buildForwardBody("sessions", {}, "user-42");
    expect(result).toMatchObject({ appId: "grantpipe", userId: "user-42" });
  });

  it("forwards currentPath for sessions when present", () => {
    const result = buildForwardBody("sessions", { currentPath: "/grants" }, "u1");
    expect(result).toMatchObject({ currentPath: "/grants" });
  });

  it("rebounds chat body to the authenticated app user", () => {
    const body = { sessionId: "s1", message: "hello", appId: "forged", userId: "attacker" };
    expect(buildForwardBody("chat", body, "u1")).toEqual({
      sessionId: "s1",
      message: "hello",
      appId: "grantpipe",
      userId: "u1",
    });
  });

  it("rebounds escalations body to the authenticated app user", () => {
    const body = { sessionId: "s1", reason: "need help", appId: "forged", userId: "attacker" };
    expect(buildForwardBody("escalations", body, "u1")).toEqual({
      sessionId: "s1",
      reason: "need help",
      appId: "grantpipe",
      userId: "u1",
    });
  });

  it("injects server org metadata for sessions and ignores client metadata", () => {
    const result = buildForwardBody(
      "sessions",
      { metadata: { orgId: "forged", plan: "starter" } },
      "u1",
      "org-server",
    );
    expect(result).toMatchObject({ metadata: { orgId: "org-server" } });
  });

  it("does not include undefined metadata when absent in sessions", () => {
    const result = buildForwardBody("sessions", {}, "u1") as Record<string, unknown>;
    expect("metadata" in result).toBe(false);
  });
});

describe("readJsonObject", () => {
  it("returns empty object for empty body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "",
    });
    const result = await readJsonObject(req);
    expect(result).toEqual({});
  });

  it("returns parsed object", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });
    const result = await readJsonObject(req);
    expect(result).toEqual({ foo: "bar" });
  });

  it("returns 400 response for invalid JSON", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "{bad",
    });
    const result = await readJsonObject(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(400);
  });

  it("returns 413 response for oversized body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "x".repeat(32_001),
    });
    const result = await readJsonObject(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(413);
  });

  it("returns 400 for JSON array", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });
    const result = await readJsonObject(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(400);
  });
});

describe("persistEscalation", () => {
  it("inserts into D1 with the correct columns", async () => {
    const mockDb = makeMockD1();
    await persistEscalation(mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"], {
      userId: "u1",
      sessionId: "s1",
      reason: "test reason",
      message: null,
      contact: null,
    });
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_cs_escalations"),
    );
    expect(mockDb._stmt.run).toHaveBeenCalled();
  });

  it("is a no-op when db is undefined", async () => {
    await expect(
      persistEscalation(undefined, {
        userId: "u1",
        sessionId: "s1",
        reason: null,
        message: null,
        contact: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows D1 errors without throwing", async () => {
    const mockDb = makeMockD1();
    mockDb._stmt.run = vi.fn(async () => {
      throw new Error("D1 error");
    });
    await expect(
      persistEscalation(mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"], {
        userId: "u1",
        sessionId: "s1",
        reason: null,
        message: null,
        contact: null,
      }),
    ).resolves.toBeUndefined();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "ai-cs", {
      step: "escalation-persist",
    });
  });

  it("serializes non-string contact to JSON string", async () => {
    const mockDb = makeMockD1();
    await persistEscalation(mockDb as unknown as AppEnv["Bindings"]["MARKETING_DB"], {
      userId: "u1",
      sessionId: "s1",
      reason: null,
      message: null,
      contact: '{"email":"test@example.com"}',
    });
    expect(mockDb._stmt.run).toHaveBeenCalled();
  });
});

describe("consumeNonce", () => {
  it("returns true when nonce is successfully inserted", async () => {
    const mockDb = makeMockD1({ success: true, meta: { changes: 1 } });
    const result = await consumeNonce(
      "nonce-1",
      new Date().toISOString(),
      mockDb as unknown as NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
    );
    expect(result).toBe(true);
  });

  it("returns false when nonce is already consumed (no row changes)", async () => {
    const mockDb = makeMockD1({ success: true, meta: { changes: 0 } });
    const result = await consumeNonce(
      "nonce-dup",
      new Date().toISOString(),
      mockDb as unknown as NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
    );
    expect(result).toBe(false);
  });

  it("returns false when D1 reports success=false", async () => {
    const mockDb = makeMockD1({ success: false, meta: { changes: 0 } });
    const result = await consumeNonce(
      "n",
      new Date().toISOString(),
      mockDb as unknown as NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
    );
    expect(result).toBe(false);
  });

  it("returns false for unparseable timestamp", async () => {
    const mockDb = makeMockD1();
    const result = await consumeNonce(
      "n",
      "not-a-date",
      mockDb as unknown as NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
    );
    expect(result).toBe(false);
  });

  it("returns false when D1 throws", async () => {
    const mockDb = makeMockD1();
    mockDb._stmt.run = vi.fn(async () => {
      throw new Error("D1 error");
    });
    const result = await consumeNonce(
      "n",
      new Date().toISOString(),
      mockDb as unknown as NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
    );
    expect(result).toBe(false);
  });
});

describe("buildGrantpipeAppContext", () => {
  const contextBytes = (ctx: ReturnType<typeof buildGrantpipeAppContext>) =>
    Buffer.byteLength(JSON.stringify(ctx), "utf8");

  it("returns correct appId and assistantId", () => {
    const ctx = buildGrantpipeAppContext();
    expect(ctx.appId).toBe("grantpipe");
    expect(ctx.assistantId).toBe("ai-cs");
    expect(ctx.authenticatedOnly).toBe(true);
    expect(ctx.appName).toBe("GrantPipe");
  });

  it("tells the worker to answer directly without exposing reasoning", () => {
    const ctx = buildGrantpipeAppContext();

    expect(ctx.description).toContain("Answer directly");
    expect(ctx.description).toContain("Do not reveal");
    expect(ctx.description).toContain("internal reasoning");
  });

  it("includes help sources with required fields", () => {
    const ctx = buildGrantpipeAppContext();
    expect(ctx.sources.length).toBeGreaterThan(0);
    for (const src of ctx.sources) {
      expect(src).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        url: expect.any(String),
        excerpt: expect.any(String),
      });
    }
  });

  it("builds sources and navigation from the shared app knowledge index", () => {
    const ctx = buildGrantpipeAppContext();

    expect(ctx.sources).toEqual(
      appKnowledge.helpArticles.map((article) => ({
        id: article.key,
        title: article.title,
        url: `https://app.grantpipe.com/app/help#${article.key}`,
        excerpt: `${article.summary} ${article.steps.join(" ")}`,
      })),
    );
    expect(ctx.navigation).toEqual(
      appKnowledge.routes.map((route) => ({
        label: route.label,
        path: route.path,
        description: `Roles that can open the ${route.label} screen: ${route.roles.join(", ")}.`,
      })),
    );
  });

  it("includes navigation targets with required fields", () => {
    const ctx = buildGrantpipeAppContext();
    expect(ctx.navigation.length).toBeGreaterThan(0);
    for (const nav of ctx.navigation) {
      expect(nav).toMatchObject({
        label: expect.any(String),
        path: expect.any(String),
        description: expect.any(String),
      });
    }
  });

  it("includes onboarding workflow steps with status=next", () => {
    const ctx = buildGrantpipeAppContext();
    expect(ctx.workflow.length).toBeGreaterThan(0);
    for (const step of ctx.workflow) {
      expect(step.status).toBe("next");
      expect(step.id).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.path).toBeTruthy();
    }
  });

  it("filters help articles and navigation by member role when a role is supplied", () => {
    const adminCtx = buildGrantpipeAppContext("admin");
    const viewerCtx = buildGrantpipeAppContext("viewer");

    expect(adminCtx.sources.length).toBeGreaterThan(0);
    expect(adminCtx.navigation.length).toBeGreaterThan(0);

    // Viewers cannot see every admin-only article/route, so the role-scoped
    // context is a subset of the unfiltered admin context.
    expect(viewerCtx.sources.length).toBeLessThanOrEqual(adminCtx.sources.length);
    expect(viewerCtx.navigation.length).toBeLessThanOrEqual(adminCtx.navigation.length);

    // Every article surfaced to a viewer must actually be viewer-safe.
    const viewerIds = new Set(viewerCtx.sources.map((s) => s.id));
    for (const article of appKnowledge.helpArticles) {
      if (viewerIds.has(article.key)) {
        expect(canUseHelpArticle(article, "viewer")).toBe(true);
      }
    }
  });

  it("returns an empty role-scoped context for a null member role", () => {
    const ctx = buildGrantpipeAppContext(null);
    expect(ctx.navigation).toEqual([]);
  });

  it("maps accounting-report workflows to their specific routes, not the generic /reports index", () => {
    const ctx = buildGrantpipeAppContext();

    const activities = ctx.workflow.find((step) => step.id === "statement_of_activities_report");
    const functional = ctx.workflow.find((step) => step.id === "functional_expenses_report");

    expect(activities?.path).toBe("/accounting/reports/activities");
    expect(functional?.path).toBe("/accounting/reports/functional-expenses");

    // The generic "Generate a report" workflow still points at the report index.
    const generic = ctx.workflow.find((step) => step.id === "generate_report");
    expect(generic?.path).toBe("/reports");

    // No workflow step should land on the bare /reports index while claiming to
    // open a specific accounting statement.
    for (const step of ctx.workflow) {
      if (
        step.id === "statement_of_activities_report" ||
        step.id === "functional_expenses_report"
      ) {
        expect(step.path).not.toBe("/reports");
      }
    }
  });

  it("includes a how-to for every feature-knowledge screen with exact button labels", () => {
    const ctx = buildGrantpipeAppContext("admin");

    const grants = ctx.howtos?.find((h) => h.goal.includes("Grants"));
    expect(grants).toBeDefined();
    expect(grants?.steps[0]?.button).toBe("Opportunities");
    expect(grants?.steps[0]?.path).toBe("/grants");

    const labels = ctx.howtos?.flatMap((h) => h.steps.map((s) => s.button));
    expect(labels).toContain("Add grant");
  });

  it("exposes plain-language concepts derived from feature knowledge", () => {
    const ctx = buildGrantpipeAppContext("admin");

    const grants = ctx.concepts?.find((c) => c.term === "Grants");
    expect(grants).toBeDefined();
    expect(grants?.plainDefinition).toContain("Grants screen");
    expect(grants?.whyItMatters).toBeTruthy();
    expect(grants?.path).toBe("/grants");
  });

  it("turns notFeatures into disambiguating FAQs", () => {
    const ctx = buildGrantpipeAppContext("admin");

    const donationFaq = ctx.faqs?.find((f) => f.answer.includes("go in Donors instead"));
    expect(donationFaq).toBeDefined();
    expect(donationFaq?.answer.startsWith("No.")).toBe(true);
  });

  it("leads the FAQ list with authoritative role capability answers", () => {
    const ctx = buildGrantpipeAppContext("admin");

    // Role FAQs are prepended so they survive the worker's 40-FAQ slice.
    expect(ctx.faqs?.slice(0, 4).map((f) => f.question)).toEqual([
      "What can an Admin do in GrantPipe?",
      "What can an Editor do in GrantPipe?",
      "What can a Viewer do in GrantPipe?",
      "What can an Auditor do in GrantPipe?",
    ]);

    const viewerFaq = ctx.faqs?.find((f) => f.question.includes("Viewer"));
    expect(viewerFaq?.answer.toLowerCase()).toContain("cannot add or change anything");
  });

  it("keeps current-path context under the AI-CS worker payload budget", () => {
    const ctx = buildGrantpipeAppContext("admin", { currentPath: "/dashboard" });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(contextBytes(ctx)).toBeLessThan(32_000);
    expect(howtoIds).toEqual(
      expect.arrayContaining(["dashboard", "grants", "funds", "import", "reports"]),
    );
    expect(howtoIds).not.toContain("donor_email");
    expect(ctx.concepts?.length).toBeGreaterThan(40);
    expect(ctx.faqs?.some((faq) => faq.question.includes("Auditor"))).toBe(true);
  });

  it("adds the current screen and related screens to scoped how-tos", () => {
    const ctx = buildGrantpipeAppContext("admin", {
      currentPath: "https://app.grantpipe.com/app/accounting/ledger/",
    });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(contextBytes(ctx)).toBeLessThan(32_000);
    expect(howtoIds).toEqual(expect.arrayContaining(["account_ledger", "trial_balance"]));
  });

  it("falls back to core production how-tos for unknown current paths", () => {
    const ctx = buildGrantpipeAppContext("admin", { currentPath: "/unknown" });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(contextBytes(ctx)).toBeLessThan(32_000);
    expect(howtoIds).toEqual(["grants", "funds", "import", "reports", "report_builder"]);
  });

  it("falls back to core production how-tos for malformed absolute URLs", () => {
    const ctx = buildGrantpipeAppContext("admin", { currentPath: "http://[" });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(contextBytes(ctx)).toBeLessThan(32_000);
    expect(howtoIds).toEqual(["grants", "funds", "import", "reports", "report_builder"]);
  });

  it("matches dynamic current paths when scoping how-tos", () => {
    const ctx = buildGrantpipeAppContext("admin", {
      currentPath: "/app/award-intake/extraction-123",
    });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(contextBytes(ctx)).toBeLessThan(32_000);
    expect(howtoIds).toContain("award_intake");
    expect(howtoIds).not.toContain("donor_email");
  });

  it("keeps the full teaching payload when currentPath is empty", () => {
    const ctx = buildGrantpipeAppContext("admin", { currentPath: "" });
    const howtoIds = ctx.howtos?.map((howto) => howto.id) ?? [];

    expect(howtoIds).toContain("donor_email");
    expect(howtoIds.length).toBeGreaterThan(40);
  });

  it("omits teaching fields a member's role cannot reach", () => {
    const nullRoleCtx = buildGrantpipeAppContext(null);

    // The grants screen is gated to admin/editor/viewer/auditor, so a null role
    // (no membership) sees none of its teaching fields.
    expect(nullRoleCtx.howtos?.some((h) => h.goal.includes("Grants"))).toBe(false);
    expect(nullRoleCtx.concepts?.some((c) => c.term === "Grants")).toBe(false);
  });

  it("includes meetingLinks with the quick-call booking URL", () => {
    const ctx = buildGrantpipeAppContext();

    expect(ctx.meetingLinks).toBeDefined();
    expect(Array.isArray(ctx.meetingLinks)).toBe(true);

    const quickLink = ctx.meetingLinks?.find((link: AiSdrMeetingLink) => link.id === "quick-call");
    expect(quickLink).toBeDefined();
    expect(quickLink?.url).toBe("https://cal.com/angel-campa-grantpipe/15min");
  });

  it("meetingLinks ids are unique and urls are valid cal.com links", () => {
    const ctx = buildGrantpipeAppContext();
    const links = ctx.meetingLinks ?? [];

    const ids = links.map((l: AiSdrMeetingLink) => l.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const link of links as AiSdrMeetingLink[]) {
      expect(link.url).toMatch(/^https:\/\/cal\.com\//);
      expect(link.label).toBeTruthy();
      expect(link.id).toBeTruthy();
    }
  });
});
