import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createAiSdrProxyFailureReporter,
  handleAiSdrProxy,
  reportAiSdrProxyFailure,
} from "./proxy.js";
import { hmacHex, buildHmacPayload, verifyHmacSignature } from "./signing.js";
import { WORKER_BASE_URL } from "./config.js";

const VALID_ORIGIN = "https://grantpipe.com";
const TEST_SECRET = "test-client-assertion-secret";

interface MockEnv {
  AI_SDR_CLIENT_ASSERTION_SECRET?: string;
  PUBLIC_SENTRY_DSN?: string;
  PUBLIC_SENTRY_ENVIRONMENT?: string;
}

function makeRequest(method: string, body: unknown, origin = VALID_ORIGIN): Request {
  return new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("handleAiSdrProxy", () => {
  const mockFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 405 for non-POST methods", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "GET",
      headers: { Origin: VALID_ORIGIN },
    });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(405);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Method not allowed");
  });

  it("returns 403 for a disallowed origin", async () => {
    const req = makeRequest("POST", { sessionId: "test" }, "https://evil.com");
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Forbidden origin");
  });

  it("returns 403 when Origin header is missing", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(403);
  });

  it("accepts a localhost dev origin (advances past the 403 gate)", async () => {
    const req = makeRequest("POST", { sessionId: "test" }, "http://localhost:4321");
    const env: MockEnv = {};
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    // No secret configured, so the next gate (503) is reached — proving the
    // localhost origin cleared the allowlist check.
    expect(res.status).toBe(503);
  });

  it("accepts a Cloudflare Pages preview origin (advances past the 403 gate)", async () => {
    const req = makeRequest(
      "POST",
      { sessionId: "test" },
      "https://my-branch.grantpipe-site.pages.dev",
    );
    const env: MockEnv = {};
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(503);
  });

  it("returns 503 when AI_SDR_CLIENT_ASSERTION_SECRET is missing", async () => {
    const req = makeRequest("POST", { sessionId: "test" });
    const env: MockEnv = {};
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("AI assistant unavailable");
  });

  it("returns 503 when AI_SDR_CLIENT_ASSERTION_SECRET is an empty string", async () => {
    const req = makeRequest("POST", { sessionId: "test" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: "   " };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(503);
  });

  it("returns 400 when body is not a plain object (array)", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: VALID_ORIGIN,
      },
      body: JSON.stringify([1, 2, 3]),
    });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Invalid request body");
  });

  it("returns 400 when body is not a plain object (string)", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: VALID_ORIGIN,
      },
      body: JSON.stringify("a string"),
    });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: VALID_ORIGIN,
      },
      body: "not json{",
    });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });
    expect(res.status).toBe(400);
  });

  it("forwards with correct URL and HMAC assertion headers on happy path", async () => {
    const upstreamBody = { ok: true };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const reqBody = { productId: "grantpipe" };
    const req = makeRequest("POST", reqBody);
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${WORKER_BASE_URL}/v1/sessions`);
    expect((calledInit.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((calledInit.headers as Record<string, string>)["Origin"]).toBe(VALID_ORIGIN);

    const ts = (calledInit.headers as Record<string, string>)["X-Ventora-Timestamp"] as string;
    const nonce = (calledInit.headers as Record<string, string>)["X-Ventora-Nonce"] as string;
    const sig = (calledInit.headers as Record<string, string>)["X-Ventora-Signature"] as string;

    expect(ts).toBeTruthy();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);

    // Verify the signature is correct over pathname-only path
    const sentBody = JSON.parse(calledInit.body as string) as Record<string, unknown>;
    const recomputedPayload = await buildHmacPayload({
      timestamp: ts,
      nonce,
      method: "POST",
      path: "/v1/sessions",
      body: sentBody,
    });
    const valid = await verifyHmacSignature({
      payload: recomputedPayload,
      signature: sig,
      secret: TEST_SECRET,
      timestamp: ts,
    });
    expect(valid).toBe(true);
  });

  it("signs over pathname-only path (not full URL)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const req = makeRequest("POST", { x: 1 });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/chat" });

    const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const ts = (calledInit.headers as Record<string, string>)["X-Ventora-Timestamp"] as string;
    const nonce = (calledInit.headers as Record<string, string>)["X-Ventora-Nonce"] as string;
    const sig = (calledInit.headers as Record<string, string>)["X-Ventora-Signature"] as string;
    const sentBody = JSON.parse(calledInit.body as string) as Record<string, unknown>;

    // The path used for signing must be just "/v1/chat", not the full URL
    const payloadWithPathname = await buildHmacPayload({
      timestamp: ts,
      nonce,
      method: "POST",
      path: "/v1/chat",
      body: sentBody,
    });
    const payloadWithFullUrl = await buildHmacPayload({
      timestamp: ts,
      nonce,
      method: "POST",
      path: "https://grantpipe.com/api/ai-sdr/v1/chat",
      body: sentBody,
    });

    const sigFromPathname = await hmacHex(payloadWithPathname, TEST_SECRET);
    const sigFromFullUrl = await hmacHex(payloadWithFullUrl, TEST_SECRET);

    expect(sig).toBe(sigFromPathname);
    expect(sig).not.toBe(sigFromFullUrl);
  });

  it("sets Cache-Control: no-store and preserves Content-Type for /v1/chat", async () => {
    const sseBody = "data: hello\n\n";
    mockFetch.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const req = makeRequest("POST", { message: "hi" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/chat" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("streams the upstream body through (does not buffer)", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: chunk1\n\n"));
        controller.enqueue(encoder.encode("data: chunk2\n\n"));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const req = makeRequest("POST", { message: "stream test" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/chat" });

    // Body is passed through (not re-encoded), so reading it returns the streamed content
    const text = await res.text();
    expect(text).toBe("data: chunk1\n\ndata: chunk2\n\n");
  });

  it("returns 502 when fetch throws a network error", async () => {
    const reportFailure = vi.fn();
    mockFetch.mockRejectedValueOnce(new TypeError("Network failure"));

    const req = makeRequest("POST", { sessionId: "abc" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({
      request: req,
      env,
      upstreamPath: "/v1/sessions",
      reportFailure,
    });

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Upstream request failed");
    expect(reportFailure).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({
        feature: "ai-sdr",
        upstreamPath: "/v1/sessions",
        failureType: "network",
      }),
    );
    expect(JSON.stringify(reportFailure.mock.calls)).not.toContain("abc");
  });

  it("waits for network failure reporting before returning the 502 response", async () => {
    let releaseReporter: (() => void) | undefined;
    let reported = false;
    const reporterStarted = vi.fn();
    const reportFailure = vi.fn(async () => {
      reporterStarted();
      await new Promise<void>((resolve) => {
        releaseReporter = resolve;
      });
      reported = true;
    });
    mockFetch.mockRejectedValueOnce(new TypeError("Network failure"));

    const responsePromise = handleAiSdrProxy({
      request: makeRequest("POST", { sessionId: "abc" }),
      env: { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET },
      upstreamPath: "/v1/sessions",
      reportFailure,
    });

    let settled = false;
    responsePromise.then(() => {
      settled = true;
    });
    await vi.waitFor(() => {
      expect(reporterStarted).toHaveBeenCalledOnce();
    });

    expect(settled).toBe(false);
    expect(reported).toBe(false);

    releaseReporter?.();
    const res = await responsePromise;

    expect(res.status).toBe(502);
    expect(reported).toBe(true);
  });

  it("reports and forwards upstream error status codes through", async () => {
    const reportFailure = vi.fn();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("POST", { sessionId: "secret-session" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({
      request: req,
      env,
      upstreamPath: "/v1/sessions",
      reportFailure,
    });

    expect(res.status).toBe(500);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        feature: "ai-sdr",
        upstreamPath: "/v1/sessions",
        failureType: "upstream-status",
        status: "500",
      }),
    );
    expect(JSON.stringify(reportFailure.mock.calls)).not.toContain("secret-session");
  });

  it("waits for upstream status reporting before forwarding the error response", async () => {
    let releaseReporter: (() => void) | undefined;
    let reported = false;
    const reporterStarted = vi.fn();
    const reportFailure = vi.fn(async () => {
      reporterStarted();
      await new Promise<void>((resolve) => {
        releaseReporter = resolve;
      });
      reported = true;
    });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "upstream failure" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const responsePromise = handleAiSdrProxy({
      request: makeRequest("POST", { sessionId: "secret-session" }),
      env: { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET },
      upstreamPath: "/v1/chat",
      reportFailure,
    });

    let settled = false;
    responsePromise.then(() => {
      settled = true;
    });
    await vi.waitFor(() => {
      expect(reporterStarted).toHaveBeenCalledOnce();
    });

    expect(settled).toBe(false);

    releaseReporter?.();
    const res = await responsePromise;

    expect(res.status).toBe(503);
    expect(reported).toBe(true);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ failureType: "upstream-status", status: "503" }),
    );
  });

  it("preserves Content-Type for sessions and handoff (non-chat) routes", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "s123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("POST", { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    const res = await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });

    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("sends stableJson body to upstream (verifiable by the worker)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    // Send object with keys in reverse order
    const req = makeRequest("POST", { z: "last", a: "first" });
    const env: MockEnv = { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET };
    await handleAiSdrProxy({ request: req, env, upstreamPath: "/v1/sessions" });

    const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const ts = (calledInit.headers as Record<string, string>)["X-Ventora-Timestamp"] as string;
    const nonce = (calledInit.headers as Record<string, string>)["X-Ventora-Nonce"] as string;
    const sig = (calledInit.headers as Record<string, string>)["X-Ventora-Signature"] as string;
    const sentBodyStr = calledInit.body as string;
    const sentBody = JSON.parse(sentBodyStr) as Record<string, unknown>;

    // The signature is over stableJson of body - verify it matches regardless of key order
    const payloadA = await buildHmacPayload({
      timestamp: ts,
      nonce,
      method: "POST",
      path: "/v1/sessions",
      body: { a: "first", z: "last" },
    });
    const payloadB = await buildHmacPayload({
      timestamp: ts,
      nonce,
      method: "POST",
      path: "/v1/sessions",
      body: sentBody,
    });
    const sigA = await hmacHex(payloadA, TEST_SECRET);
    const sigB = await hmacHex(payloadB, TEST_SECRET);

    // Both key orderings should produce the same hash
    expect(sigA).toBe(sigB);
    expect(sig).toBe(sigA);
  });

  it("reports proxy failures to Sentry without request bodies when a DSN is configured", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

    await reportAiSdrProxyFailure(
      new Error("upstream exploded"),
      {
        feature: "ai-sdr",
        upstreamPath: "/v1/chat",
        failureType: "upstream-status",
        status: "500",
      },
      {
        PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/12345",
        PUBLIC_SENTRY_ENVIRONMENT: "test",
      },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.sentry.io/api/12345/envelope/",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
      }),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const envelope = String(init.body);
    expect(envelope).toContain('"feature":"ai-sdr"');
    expect(envelope).toContain('"upstream_path":"/v1/chat"');
    expect(envelope).not.toContain("secret-session");
    expect(envelope).not.toContain("request body");
  });

  it("creates an env-bound proxy failure reporter", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));
    const reportFailure = createAiSdrProxyFailureReporter({
      PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/12345",
      PUBLIC_SENTRY_ENVIRONMENT: "test",
    });

    await reportFailure(new Error("upstream exploded"), {
      feature: "ai-sdr",
      upstreamPath: "/v1/handoff",
      failureType: "upstream-status",
      status: "503",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.sentry.io/api/12345/envelope/",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('"upstream_path":"/v1/handoff"');
  });

  it("uses SENTRY_DSN first and serializes non-Error failures with a none status tag", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

    await reportAiSdrProxyFailure(
      "upstream string failure",
      {
        feature: "ai-sdr",
        upstreamPath: "/v1/sessions",
        failureType: "network",
      },
      {
        SENTRY_DSN: "https://secret@example.sentry.io/999",
        PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/12345",
        PUBLIC_SENTRY_ENVIRONMENT: "test",
      },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.sentry.io/api/999/envelope/",
      expect.any(Object),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const envelope = String(init.body);
    expect(envelope).toContain('"type":"Error"');
    expect(envelope).toContain('"value":"upstream string failure"');
    expect(envelope).toContain('"status":"none"');
    expect(envelope).not.toContain("12345");
  });

  it("falls back to runtime logs when Sentry is not configured", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await reportAiSdrProxyFailure(new Error("upstream exploded"), {
        feature: "ai-sdr",
        upstreamPath: "/v1/sessions",
        failureType: "network",
      });

      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure",
        expect.objectContaining({
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
          error: "upstream exploded",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to runtime logs when the Sentry DSN is invalid", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await reportAiSdrProxyFailure(
        new Error("upstream exploded"),
        {
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
        },
        { PUBLIC_SENTRY_DSN: "not a url" },
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure",
        expect.objectContaining({
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to runtime logs when the Sentry DSN has no project id", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await reportAiSdrProxyFailure(
        new Error("upstream exploded"),
        {
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
        },
        { PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/" },
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure",
        expect.objectContaining({
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to runtime logs when Sentry transport fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error("sentry unavailable"));

    try {
      await reportAiSdrProxyFailure(
        new Error("upstream exploded"),
        {
          feature: "ai-sdr",
          upstreamPath: "/v1/handoff",
          failureType: "upstream-status",
          status: "503",
        },
        { PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/12345" },
      );

      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure",
        expect.objectContaining({
          upstreamPath: "/v1/handoff",
          failureType: "upstream-status",
          status: "503",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to runtime logs when Sentry returns a non-2xx status", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    try {
      await reportAiSdrProxyFailure(
        new Error("upstream exploded"),
        {
          feature: "ai-sdr",
          upstreamPath: "/v1/handoff",
          failureType: "upstream-status",
          status: "503",
        },
        { PUBLIC_SENTRY_DSN: "https://public@example.sentry.io/12345" },
      );

      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure",
        expect.objectContaining({
          upstreamPath: "/v1/handoff",
          failureType: "upstream-status",
          status: "503",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs reporter failures without changing the proxy response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new TypeError("Network failure"));

    try {
      const res = await handleAiSdrProxy({
        request: makeRequest("POST", { sessionId: "secret-session" }),
        env: { AI_SDR_CLIENT_ASSERTION_SECRET: TEST_SECRET },
        upstreamPath: "/v1/sessions",
        reportFailure: async () => {
          throw new Error("reporter down");
        },
      });
      await Promise.resolve();

      expect(res.status).toBe(502);
      expect(consoleError).toHaveBeenCalledWith(
        "[ai-sdr] proxy failure reporter failed",
        expect.objectContaining({
          feature: "ai-sdr",
          upstreamPath: "/v1/sessions",
          failureType: "network",
          error: "reporter down",
        }),
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret-session");
    } finally {
      consoleError.mockRestore();
    }
  });
});
