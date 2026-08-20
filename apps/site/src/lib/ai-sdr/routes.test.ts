import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIRoute } from "astro";
// Resolves to test/stubs/cloudflare-workers.ts via the vitest alias. The route
// wrappers read the worker environment from this module, so mutating it here is
// how we exercise their secret-dependent branches.
import { env as workerEnv } from "cloudflare:workers";
import { POST as sessionsPost } from "../../pages/api/ai-sdr/v1/sessions.js";
import { POST as chatPost } from "../../pages/api/ai-sdr/v1/chat.js";
import { POST as handoffPost } from "../../pages/api/ai-sdr/v1/handoff.js";
import { GET as contextGet } from "../../pages/api/ai-sdr/context.js";

const mutableWorkerEnv = workerEnv as typeof workerEnv & {
  PUBLIC_SENTRY_DSN?: string;
  PUBLIC_SENTRY_ENVIRONMENT?: string;
};

function invoke(route: APIRoute, request: Request): ReturnType<APIRoute> {
  // Astro v6 routes no longer receive env via `locals.runtime.env`; the wrapper
  // reads it from the `cloudflare:workers` module. The context only needs the
  // request.
  const ctx = { request } as unknown as Parameters<APIRoute>[0];
  return route(ctx);
}

afterEach(() => {
  delete workerEnv.AI_SDR_CLIENT_ASSERTION_SECRET;
  delete workerEnv.AI_SDR_CONTEXT_SECRET;
  delete mutableWorkerEnv.PUBLIC_SENTRY_DSN;
  delete mutableWorkerEnv.PUBLIC_SENTRY_ENVIRONMENT;
  vi.unstubAllGlobals();
});

describe("ai-sdr api routes", () => {
  it("sessions route delegates to the proxy (405 on non-POST method)", async () => {
    const response = await invoke(
      sessionsPost,
      new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("chat route delegates to the proxy (403 on forbidden origin)", async () => {
    const response = await invoke(
      chatPost,
      new Request("https://grantpipe.com/api/ai-sdr/v1/chat", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("handoff route delegates to the proxy (403 on forbidden origin)", async () => {
    const response = await invoke(
      handoffPost,
      new Request("https://grantpipe.com/api/ai-sdr/v1/handoff", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("sessions route forwards the worker env to the proxy (503 when secret absent)", async () => {
    // Allowed origin + POST clears the 405/403 gates; the next gate is the
    // missing-secret 503. Reaching it proves the wrapper passed the (empty)
    // worker env object through — had it passed `undefined`, the proxy's
    // `env.AI_SDR_CLIENT_ASSERTION_SECRET` read would have thrown instead.
    const response = await invoke(
      sessionsPost,
      new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: "https://grantpipe.com", "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
  });

  it("context route delegates to the context handler (404 on unknown product)", async () => {
    const response = await invoke(
      contextGet,
      new Request("https://grantpipe.com/api/ai-sdr/context?productId=other", { method: "GET" }),
    );
    expect(response.status).toBe(404);
  });

  it("context route forwards the worker env (503 when secret absent for the right product)", async () => {
    // Correct productId clears the 404 gate; the next gate is the missing-secret
    // 503. Reaching it proves the wrapper handed the worker env to the handler.
    const response = await invoke(
      contextGet,
      new Request("https://grantpipe.com/api/ai-sdr/context?productId=grantpipe", {
        method: "GET",
      }),
    );
    expect(response.status).toBe(503);
  });

  it("context route reads the secret from the worker env (401 when signature missing)", async () => {
    // With the secret populated on the worker env, the handler advances past the
    // 503 to the missing-signature 401 — confirming the secret is sourced from
    // the `cloudflare:workers` module, not from request-scoped locals.
    workerEnv.AI_SDR_CONTEXT_SECRET = "context-secret";
    const response = await invoke(
      contextGet,
      new Request("https://grantpipe.com/api/ai-sdr/context?productId=grantpipe", {
        method: "GET",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("chat route reports upstream 500s through the worker Sentry env", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    workerEnv.AI_SDR_CLIENT_ASSERTION_SECRET = "proxy-secret";
    mutableWorkerEnv.PUBLIC_SENTRY_DSN = "https://public@example.sentry.io/12345";
    mutableWorkerEnv.PUBLIC_SENTRY_ENVIRONMENT = "test";

    const response = await invoke(
      chatPost,
      new Request("https://grantpipe.com/api/ai-sdr/v1/chat", {
        method: "POST",
        headers: { Origin: "https://grantpipe.com", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "do not report this body" }),
      }),
    );

    expect(response.status).toBe(500);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, sentryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const envelope = String(sentryInit.body);
    expect(envelope).toContain('"upstream_path":"/v1/chat"');
    expect(envelope).not.toContain("do not report this body");
  });
});
