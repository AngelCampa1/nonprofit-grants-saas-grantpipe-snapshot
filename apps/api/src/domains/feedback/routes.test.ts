import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv, Bindings } from "../../types";

vi.mock("./service", () => ({
  sendFeedbackEmail: vi.fn(),
}));

vi.mock("../org/service", () => ({
  getOrgProfile: vi.fn(),
}));

import { sendFeedbackEmail } from "./service";
import { getOrgProfile } from "../org/service";
import {
  feedbackRoutes,
  publicFeedbackRoutes,
  _resetPublicFeedbackRateLimit,
  checkRateLimit,
  checkFeedbackEmailRateLimit,
  checkOptionalFeedbackEmailRateLimit,
  type RateLimitStore,
} from "./routes";

const env: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "secret",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  RESEND_API_KEY: "re_test",
  FEEDBACK_RECIPIENT_EMAIL: "to@example.com",
};

function buildAuthApp(role: "admin" | "editor" | "viewer" = "admin") {
  return new Hono<AppEnv>()
    .use("/feedback/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "u@example.com", name: "U" });
      c.set("session", { id: "s", userId: "user-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/feedback", feedbackRoutes);
}

function buildPublicApp() {
  return new Hono<AppEnv>().route("/feedback/public", publicFeedbackRoutes);
}

describe("feedback routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _resetPublicFeedbackRateLimit();
    vi.mocked(getOrgProfile).mockResolvedValue({ name: "Acme", planTier: "growth" } as never);
  });

  afterEach(() => {
    _resetPublicFeedbackRateLimit();
  });

  describe("POST /feedback", () => {
    it("returns 200 when valid", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildAuthApp();
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hello", category: "bug" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(sendFeedbackEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: "hello", category: "bug" }),
        expect.objectContaining({ orgId: "org-1", userId: "user-1", orgName: "Acme" }),
        expect.anything(),
      );
    });

    it.each([true, false])(
      "rejects oversized public bodies before validation and delivery (declared=%s)",
      async (includeLength) => {
        const app = buildPublicApp();
        const body = JSON.stringify({
          category: "other",
          message: "x".repeat(20_000),
          reporterEmail: "large@example.com",
        });
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (includeLength) headers["Content-Length"] = String(body.length);

        const res = await app.request("/feedback/public", { method: "POST", headers, body }, env);

        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ error: "Payload too large" });
        expect(sendFeedbackEmail).not.toHaveBeenCalled();
      },
    );

    it("returns 403 when member role is missing", async () => {
      const app = new Hono<AppEnv>()
        .use("/feedback/*", async (c, next) => {
          c.set("db", {} as never);
          c.set("orgId", "org-1");
          c.set("user", { id: "user-1", email: "u@example.com", name: "U" });
          c.set("session", { id: "s", userId: "user-1" });
          c.set("memberRole", null);
          await next();
        })
        .route("/feedback", feedbackRoutes);
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi", category: "bug" }),
        },
        env,
      );
      expect(res.status).toBe(403);
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid body", async () => {
      const app = buildAuthApp();
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "" }),
        },
        env,
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 when service throws", async () => {
      vi.mocked(sendFeedbackEmail).mockRejectedValueOnce(new Error("boom"));
      const app = buildAuthApp();
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi", category: "idea" }),
        },
        env,
      );
      expect(res.status).toBe(500);
    });

    it("sends feedback with undefined orgId when org context is null", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = new Hono<AppEnv>()
        .use("/feedback/*", async (c, next) => {
          c.set("db", {} as never);
          c.set("orgId", null);
          c.set("user", { id: "user-1", email: "u@example.com", name: "U" });
          c.set("session", { id: "s", userId: "user-1" });
          c.set("memberRole", "admin");
          await next();
        })
        .route("/feedback", feedbackRoutes);
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi", category: "bug" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(sendFeedbackEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ orgId: undefined }),
        expect.anything(),
      );
    });

    it("falls back gracefully when org profile lookup fails", async () => {
      vi.mocked(getOrgProfile).mockRejectedValueOnce(new Error("not found"));
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildAuthApp();
      const res = await app.request(
        "/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi", category: "bug" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(sendFeedbackEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ orgId: "org-1" }),
        expect.anything(),
      );
    });
  });

  describe("POST /feedback/public", () => {
    it("returns 200 when valid", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "1.2.3.4",
          },
          body: JSON.stringify({
            message: "hi from outside",
            category: "idea",
            reporterEmail: "ext@example.com",
          }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("returns 400 when reporterEmail is missing", async () => {
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "1.2.3.5",
          },
          body: JSON.stringify({ message: "hi", category: "bug" }),
        },
        env,
      );
      expect(res.status).toBe(400);
    });

    it("returns 429 when rate limit exceeded", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      const app = buildPublicApp();
      // Use unique emails per iteration to avoid the per-email throttle (max 3)
      const headers = {
        "Content-Type": "application/json",
        "cf-connecting-ip": "9.9.9.9",
      };
      for (let i = 0; i < 5; i++) {
        const body = JSON.stringify({
          message: "hi",
          category: "bug",
          reporterEmail: `iplimit-fb${i}@example.com`,
        });
        const res = await app.request("/feedback/public", { method: "POST", headers, body }, env);
        expect(res.status).toBe(200);
      }
      const finalBody = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "iplimit-fb-final@example.com",
      });
      const res = await app.request(
        "/feedback/public",
        { method: "POST", headers, body: finalBody },
        env,
      );
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "Too many requests" });
    });

    it("returns 500 when service throws", async () => {
      vi.mocked(sendFeedbackEmail).mockRejectedValueOnce(new Error("boom"));
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "2.2.2.2",
          },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "ext@example.com",
          }),
        },
        env,
      );
      expect(res.status).toBe(500);
    });

    it("falls back to x-forwarded-for and unknown ip", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      const app = buildPublicApp();
      const body = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "ext@example.com",
      });
      let res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" },
          body,
        },
        env,
      );
      expect(res.status).toBe(200);

      res = await app.request(
        "/feedback/public",
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
        env,
      );
      expect(res.status).toBe(200);
    });

    it("uses c.env.RATE_LIMIT_KV when provided", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);

      const kvData = new Map<string, string>();
      const kvMock = {
        get: vi.fn(async (key: string) => kvData.get(key) ?? null),
        put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
          kvData.set(key, value);
        }),
      };

      const envWithKv = {
        ...env,
        RATE_LIMIT_KV: kvMock as unknown as KVNamespace,
      } as Bindings;

      const app = buildPublicApp();
      const body = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "ext@example.com",
      });
      const headers = {
        "Content-Type": "application/json",
        "cf-connecting-ip": "7.7.7.7",
      };

      const res = await app.request(
        "/feedback/public",
        { method: "POST", headers, body },
        envWithKv,
      );
      expect(res.status).toBe(200);
      expect(kvMock.get).toHaveBeenCalledWith("feedback-ip:7.7.7.7");
      expect(kvMock.put).toHaveBeenCalledWith(
        "feedback-ip:7.7.7.7",
        "1",
        expect.objectContaining({ expirationTtl: expect.any(Number) }),
      );
    });

    it("prefers the atomic coordinator and hashes the reporter email key", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
      const namespace = {
        idFromName: vi.fn((key: string) => key),
        get: vi.fn(() => ({ fetch })),
      };
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "7.7.7.9" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "Private@Example.com",
          }),
        },
        { ...env, AUTH_RATE_LIMITER: namespace as never },
      );

      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
      const serialized = JSON.stringify(fetch.mock.calls);
      const coordinatorBodies = fetch.mock.calls.map((call) =>
        JSON.parse(String((call[1] as RequestInit).body)),
      );
      expect(serialized).toContain("feedback-ip:7.7.7.9");
      expect(coordinatorBodies).toContainEqual(expect.objectContaining({ kind: "feedback-email" }));
      expect(serialized).not.toContain("private@example.com");
    });

    it("returns 429 when KV-backed store exceeds rate limit", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);

      const kvData = new Map<string, string>();
      const kvMock = {
        get: vi.fn(async (key: string) => kvData.get(key) ?? null),
        put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
          kvData.set(key, value);
        }),
      };

      const envWithKv = {
        ...env,
        RATE_LIMIT_KV: kvMock as unknown as KVNamespace,
      } as Bindings;

      const app = buildPublicApp();
      // Use unique emails to avoid the per-email throttle (max 3 per email)
      const headers = {
        "Content-Type": "application/json",
        "cf-connecting-ip": "8.8.8.8",
      };

      for (let i = 0; i < 5; i++) {
        const body = JSON.stringify({
          message: "hi",
          category: "bug",
          reporterEmail: `kv-iplimit${i}@example.com`,
        });
        const res = await app.request(
          "/feedback/public",
          { method: "POST", headers, body },
          envWithKv,
        );
        expect(res.status).toBe(200);
      }

      const finalBody = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "kv-iplimit-final@example.com",
      });
      const res = await app.request(
        "/feedback/public",
        { method: "POST", headers, body: finalBody },
        envWithKv,
      );
      expect(res.status).toBe(429);
    });
  });

  describe("POST /feedback/public — bot hardening", () => {
    it("honeypot: returns success-shaped 200 and does NOT send email when companyWebsite is populated", async () => {
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.1.1" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "bot@example.com",
            companyWebsite: "http://spam.example.com",
          }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("honeypot: proceeds normally when companyWebsite is absent", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.1.2" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "real@example.com",
          }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(sendFeedbackEmail).toHaveBeenCalledOnce();
    });

    it("honeypot: proceeds normally when companyWebsite is empty string", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.1.3" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "real2@example.com",
            companyWebsite: "",
          }),
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(sendFeedbackEmail).toHaveBeenCalledOnce();
    });

    it("per-email throttle: returns 429 after 3 requests from same email", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      const app = buildPublicApp();
      const body = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "throttled-fb@example.com",
      });
      for (let i = 0; i < 3; i++) {
        const res = await app.request(
          "/feedback/public",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "cf-connecting-ip": `20.0.2.${i + 1}`,
            },
            body,
          },
          env,
        );
        expect(res.status).toBe(200);
      }
      const blocked = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.2.99" },
          body,
        },
        env,
      );
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "Too many requests" });
    });

    it("per-email throttle 429 carries CORS header when Origin is set", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      const appWithCors = new Hono<AppEnv>();
      appWithCors.use("*", async (c, next) => {
        await next();
        c.res.headers.set("access-control-allow-origin", c.req.header("origin") ?? "*");
      });
      appWithCors.route("/feedback/public", publicFeedbackRoutes);

      const body = JSON.stringify({
        message: "hi",
        category: "bug",
        reporterEmail: "cors-throttled-fb@example.com",
      });
      for (let i = 0; i < 3; i++) {
        await appWithCors.request(
          "/feedback/public",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://grantpipe.com",
              "cf-connecting-ip": `20.0.3.${i + 10}`,
            },
            body,
          },
          env,
        );
      }
      const blocked = await appWithCors.request(
        "/feedback/public",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://grantpipe.com",
            "cf-connecting-ip": "20.0.3.1",
          },
          body,
        },
        env,
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("access-control-allow-origin")).toBeTruthy();
    });

    it("Turnstile: returns 403 when secret is set and token is missing", async () => {
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.4.1" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "notoken-fb@example.com",
          }),
        },
        { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Verification failed" });
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("Turnstile: fails closed when the secret is missing in real mode", async () => {
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.4.5" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "missing-secret-fb@example.com",
            turnstileToken: "must-not-be-logged",
          }),
        },
        { ...env, INTEGRATION_MODE: "real", TURNSTILE_SECRET_KEY: undefined },
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Verification failed" });
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("Turnstile: returns 403 when token verification fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: false }),
        }),
      );
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.4.2" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "badtoken-fb@example.com",
            turnstileToken: "bad-token",
          }),
        },
        { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
      );
      expect(res.status).toBe(403);
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("Turnstile 403 carries CORS header when Origin is set", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: false }),
        }),
      );
      const appWithCors = new Hono<AppEnv>();
      appWithCors.use("*", async (c, next) => {
        await next();
        c.res.headers.set("access-control-allow-origin", c.req.header("origin") ?? "*");
      });
      appWithCors.route("/feedback/public", publicFeedbackRoutes);

      const res = await appWithCors.request(
        "/feedback/public",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://grantpipe.com",
            "cf-connecting-ip": "20.0.4.3",
          },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "cors403-fb@example.com",
            turnstileToken: "bad",
          }),
        },
        { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
      vi.unstubAllGlobals();
    });

    it("Turnstile: bypasses when secret is unset (dev mode) and proceeds with send", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValueOnce(undefined);
      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "20.0.4.4" },
          body: JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: "bypass-fb@example.com",
          }),
        },
        env, // no TURNSTILE_SECRET_KEY
      );
      expect(res.status).toBe(200);
      expect(sendFeedbackEmail).toHaveBeenCalledOnce();
    });
  });

  describe("checkFeedbackEmailRateLimit", () => {
    it("skips the shared email bucket when reporter email is absent", async () => {
      const store: RateLimitStore = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };

      await expect(
        checkOptionalFeedbackEmailRateLimit(store, undefined, "test-secret"),
      ).resolves.toBe(true);
      expect(store.get).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    });

    beforeEach(() => {
      _resetPublicFeedbackRateLimit();
    });

    it("allows first 3 requests from same email", async () => {
      const data = new Map<string, string>();
      const store: RateLimitStore = {
        get: vi.fn(async (k: string) => data.get(k) ?? null),
        put: vi.fn(async (k: string, v: string, _opts: { expirationTtl: number }) => {
          data.set(k, v);
        }),
      };
      for (let i = 0; i < 3; i++) {
        expect(await checkFeedbackEmailRateLimit(store, "rate@example.com", "test-secret")).toBe(
          true,
        );
      }
    });

    it("denies 4th request from same email via in-memory store", async () => {
      const data = new Map<string, string>();
      const store: RateLimitStore = {
        get: vi.fn(async (k: string) => data.get(k) ?? null),
        put: vi.fn(async (k: string, v: string, _opts: { expirationTtl: number }) => {
          data.set(k, v);
        }),
      };
      for (let i = 0; i < 3; i++) {
        await checkFeedbackEmailRateLimit(store, "deny@example.com", "test-secret");
      }
      expect(await checkFeedbackEmailRateLimit(store, "deny@example.com", "test-secret")).toBe(
        false,
      );
    });
  });

  describe("checkRateLimit", () => {
    function makeStore(): RateLimitStore & {
      data: Map<string, string>;
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    } {
      const data = new Map<string, string>();
      return {
        data,
        get: vi.fn(async (key: string) => data.get(key) ?? null),
        put: vi.fn(async (key: string, value: string, _options: { expirationTtl: number }) => {
          data.set(key, value);
        }),
      };
    }

    it("allows first request and stores initial count via put", async () => {
      const store = makeStore();
      const allowed = await checkRateLimit(store, "1.1.1.1");
      expect(allowed).toBe(true);
      expect(store.get).toHaveBeenCalledWith("feedback-ip:1.1.1.1");
      expect(store.put).toHaveBeenCalledWith("feedback-ip:1.1.1.1", "1", {
        expirationTtl: 60,
      });
    });

    it("increments count on subsequent requests", async () => {
      const store = makeStore();
      expect(await checkRateLimit(store, "2.2.2.2")).toBe(true);
      expect(await checkRateLimit(store, "2.2.2.2")).toBe(true);
      expect(store.data.get("feedback-ip:2.2.2.2")).toBe("2");
    });

    it("denies after exceeding RATE_LIMIT_MAX (MemoryRateLimitStore)", async () => {
      // Use MemoryRateLimitStore directly to verify atomic increment path
      _resetPublicFeedbackRateLimit();
      const store = makeStore();
      for (let i = 0; i < 5; i++) {
        expect(await checkRateLimit(store, "3.3.3.3")).toBe(true);
      }
      expect(await checkRateLimit(store, "3.3.3.3")).toBe(false);
    });

    it("5 calls via MemoryRateLimitStore return true, 6th returns false", async () => {
      // Exercises the actual MemoryRateLimitStore increment path (not a mock)
      // Use unique emails to avoid per-email throttle (max 3)
      const app = buildPublicApp();
      const headers = {
        "Content-Type": "application/json",
        "cf-connecting-ip": "10.0.0.1",
      };
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
      for (let i = 0; i < 5; i++) {
        const body = JSON.stringify({
          message: "increment test",
          category: "bug",
          reporterEmail: `mem-iplimit${i}@example.com`,
        });
        const res = await app.request("/feedback/public", { method: "POST", headers, body }, env);
        expect(res.status).toBe(200);
      }
      const finalBody = JSON.stringify({
        message: "increment test",
        category: "bug",
        reporterEmail: "mem-iplimit-final@example.com",
      });
      const res = await app.request(
        "/feedback/public",
        { method: "POST", headers, body: finalBody },
        env,
      );
      expect(res.status).toBe(429);
    });

    it("memory fallback expires entries once TTL elapses", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        _resetPublicFeedbackRateLimit();

        vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);
        const app = buildPublicApp();
        // Use unique emails to avoid per-email throttle (max 3)
        const headers = {
          "Content-Type": "application/json",
          "cf-connecting-ip": "6.6.6.6",
        };

        // Exhaust the IP rate limit
        for (let i = 0; i < 5; i++) {
          const body = JSON.stringify({
            message: "hi",
            category: "bug",
            reporterEmail: `ttl-fb${i}@example.com`,
          });
          const res = await app.request("/feedback/public", { method: "POST", headers, body }, env);
          expect(res.status).toBe(200);
        }
        const blockedBody = JSON.stringify({
          message: "hi",
          category: "bug",
          reporterEmail: "ttl-fb-blocked@example.com",
        });
        const blocked = await app.request(
          "/feedback/public",
          { method: "POST", headers, body: blockedBody },
          env,
        );
        expect(blocked.status).toBe(429);

        // Advance past the 60s window; entry should expire and request is allowed again
        vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
        const allowedBody = JSON.stringify({
          message: "hi",
          category: "bug",
          reporterEmail: "ttl-fb-allowed@example.com",
        });
        const allowed = await app.request(
          "/feedback/public",
          { method: "POST", headers, body: allowedBody },
          env,
        );
        expect(allowed.status).toBe(200);
      } finally {
        vi.useRealTimers();
        _resetPublicFeedbackRateLimit();
      }
    });

    it("KV-backed store treats non-numeric value as over limit", async () => {
      vi.mocked(sendFeedbackEmail).mockResolvedValue(undefined);

      const kvData = new Map<string, string>([["feedback-ip:11.11.11.11", "notanumber"]]);
      const kvMock = {
        get: vi.fn(async (key: string) => kvData.get(key) ?? null),
        put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
          kvData.set(key, value);
        }),
      };

      const envWithKv = {
        ...env,
        RATE_LIMIT_KV: kvMock as unknown as KVNamespace,
      } as Bindings;

      const app = buildPublicApp();
      const res = await app.request(
        "/feedback/public",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "cf-connecting-ip": "11.11.11.11" },
          body: JSON.stringify({ message: "hi", category: "bug", reporterEmail: "x@example.com" }),
        },
        envWithKv,
      );
      expect(res.status).toBe(429);
    });
  });
});
