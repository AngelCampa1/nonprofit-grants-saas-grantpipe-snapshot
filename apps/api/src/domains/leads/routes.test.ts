import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv, Bindings } from "../../types";

vi.mock("./service", () => ({
  upsertLead: vi.fn(),
  unsubscribeLead: vi.fn(),
}));

const mockMarketingStore = { kind: "d1-marketing-store" };

vi.mock("./marketing-store", () => ({
  createD1MarketingStore: vi.fn(() => mockMarketingStore),
}));

const { mockAnalyticsCapture, mockCaptureApiException, mockCaptureBackgroundException } =
  vi.hoisted(() => ({
    mockAnalyticsCapture: vi.fn(),
    mockCaptureApiException: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  })),
}));

vi.mock("../../lib/sentry", () => ({
  captureApiException: mockCaptureApiException,
  captureBackgroundException: mockCaptureBackgroundException,
}));

import { upsertLead, unsubscribeLead } from "./service";
import { createD1MarketingStore } from "./marketing-store";
import {
  publicLeadsRoutes,
  _resetLeadsRateLimit,
  checkLeadsRateLimit,
  checkLeadsEmailRateLimit,
  MemoryRateLimitStore,
  type RateLimitStore,
} from "./routes";

const env: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "auth",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  RESEND_API_KEY: "re_test",
  MARKETING_DB: {} as D1Database,
};

function buildApp(options: { attachPostgresDb?: boolean } = {}) {
  const app = new Hono<AppEnv>();
  if (options.attachPostgresDb) {
    app.use("/public/leads/*", async (c, next) => {
      c.set("db", {} as never);
      await next();
    });
  }
  return app.route("/public/leads", publicLeadsRoutes);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  _resetLeadsRateLimit();
});

afterEach(() => {
  _resetLeadsRateLimit();
});

describe("POST /public/leads", () => {
  it.each([true, false])(
    "rejects oversized bodies before validation and side effects (declared=%s)",
    async (includeLength) => {
      const app = buildApp();
      const body = JSON.stringify({
        email: "large@example.com",
        firstName: "x".repeat(20_000),
      });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (includeLength) headers["Content-Length"] = String(body.length);

      const res = await app.request("/public/leads", { method: "POST", headers, body }, env);

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "Payload too large" });
      expect(upsertLead).not.toHaveBeenCalled();
      expect(mockAnalyticsCapture).not.toHaveBeenCalled();
    },
  );

  it("returns the generic accepted response on happy path", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-1" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.1" },
        body: JSON.stringify({
          email: "x@example.com",
          firstName: "Jane",
          magnetSlug: "grant-compliance-checklist",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createD1MarketingStore).toHaveBeenCalledWith(env.MARKETING_DB);
    expect(upsertLead).toHaveBeenCalledWith(
      mockMarketingStore,
      env,
      expect.objectContaining({ email: "x@example.com" }),
      expect.any(Function),
    );
  });

  it("reports lead analytics capture failures without failing signup", async () => {
    const analyticsError = new Error("PostHog down");
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-1" } as never,
      alreadySubscribed: false,
    });
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);
    const app = buildApp();

    const response = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "founder@example.com",
          sourcePage: "/free",
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(analyticsError, "leads", {
      step: "lead_created_analytics",
      analytics_event: ANALYTICS_EVENTS.leadCreated,
    });
  });

  it("captures normalized analytics for full URL referrers and lead magnets", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-referrer" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.41" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
          sourcePage: "/lead-magnets/grant-compliance-checklist",
          utm: {
            utmSource: "newsletter",
            utmMedium: "email",
            utmCampaign: "spring",
            referredBy: "https://Example.ORG/path",
          },
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(2);
    expect(mockAnalyticsCapture).toHaveBeenNthCalledWith(1, {
      orgId: "lead:lead-referrer",
      eventName: ANALYTICS_EVENTS.leadCreated,
      payload: expect.objectContaining({
        lead_type: "lead_magnet",
        page_path: "/lead-magnets/grant-compliance-checklist",
        landing_page: "/lead-magnets/grant-compliance-checklist",
        utm_source: "newsletter",
        utm_medium: "email",
        utm_campaign: "spring",
        referring_domain: "example.org",
        activation_type: "grant-compliance-checklist",
      }),
    });
    expect(mockAnalyticsCapture).toHaveBeenNthCalledWith(2, {
      orgId: "lead:lead-referrer",
      eventName: ANALYTICS_EVENTS.leadMagnetUnlocked,
      payload: expect.objectContaining({
        referring_domain: "example.org",
      }),
    });
  });

  it("captures normalized analytics for bare-domain referrers", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-bare-referrer" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.42" },
        body: JSON.stringify({
          email: "x@example.com",
          utm: { referredBy: "Example.org" },
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.leadCreated,
        payload: expect.objectContaining({
          lead_type: "waitlist",
          referring_domain: "example.org",
        }),
      }),
    );
  });

  it.each([
    ["email-like", "person@example.org"],
    ["whitespace-containing", "example.org/path with-space"],
  ])("omits referring_domain for %s referrers", async (_label, referredBy) => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: `lead-invalid-${_label}` } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": `1.1.1.5${_label.length}`,
        },
        body: JSON.stringify({
          email: "x@example.com",
          utm: { referredBy },
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.leadCreated,
        payload: expect.objectContaining({
          referring_domain: undefined,
        }),
      }),
    );
  });

  it("returns 200 when analytics capture rejects", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-analytics-down" } as never,
      alreadySubscribed: false,
    });
    mockAnalyticsCapture.mockRejectedValue(new Error("analytics down"));
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.43" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(2);
  });

  it("returns 500 and skips upsert when MARKETING_DB is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.44" },
        body: JSON.stringify({ email: "x@example.com" }),
      },
      { ...env, MARKETING_DB: undefined },
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save lead" });
    expect(upsertLead).not.toHaveBeenCalled();
    expect(mockCaptureApiException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.anything(),
      expect.objectContaining({ status: 500 }),
    );
  });

  it("does not reveal whether the address was already subscribed", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-old" } as never,
      alreadySubscribed: true,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.2" },
        body: JSON.stringify({ email: "x@example.com" }),
      },
      env,
    );
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does not reveal when consent was withdrawn", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-unsubscribed" } as never,
      alreadySubscribed: true,
      deliveryState: "unsubscribed",
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.31" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
        }),
      },
      env,
    );
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns the same generic response when an explicit resend cannot safely rotate", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-uncertain" } as never,
      alreadySubscribed: true,
      deliveryState: "in_progress",
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.34" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
          resendDelivery: true,
        }),
      },
      env,
    );

    expect(upsertLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ resendDelivery: true }),
      expect.any(Function),
    );
    expect(await res.json()).toEqual({ ok: true });
  });

  it("captures lead_magnet_delivery_suppressed for an unsubscribed delivery", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-suppressed" } as never,
      alreadySubscribed: true,
      deliveryState: "unsubscribed",
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.32" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "lead:lead-suppressed",
        eventName: ANALYTICS_EVENTS.leadMagnetDeliverySuppressed,
      }),
    );
  });

  it("does NOT capture lead_magnet_delivery_suppressed without a delivery state", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-not-suppressed" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.33" },
        body: JSON.stringify({
          email: "x@example.com",
          magnetSlug: "grant-compliance-checklist",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const suppressed = mockAnalyticsCapture.mock.calls.find(
      (call) => call[0]?.eventName === ANALYTICS_EVENTS.leadMagnetDeliverySuppressed,
    );
    expect(suppressed).toBeUndefined();
  });

  it("returns 400 on invalid email", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.3" },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    const error = new Error("db down");
    vi.mocked(upsertLead).mockRejectedValueOnce(error);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.4" },
        body: JSON.stringify({ email: "x@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(500);
    expect(mockCaptureApiException).toHaveBeenCalledWith(
      error,
      expect.anything(),
      expect.objectContaining({ status: 500 }),
    );
  });

  it("captures a deferred delivery rejection when an execution context is unavailable", async () => {
    vi.mocked(upsertLead).mockImplementationOnce(async (_store, _env, _input, defer) => {
      defer?.(Promise.reject(new Error("delivery failed")));
      return { lead: { id: "lead-deferred" } as never, alreadySubscribed: false };
    });
    const app = buildApp();

    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.40" },
        body: JSON.stringify({ email: "deferred@example.com" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
        step: "lead-magnet-delivery-dispatch",
      }),
    );
  });

  it("does not capture validation failures in Sentry", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.30" },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(mockCaptureApiException).not.toHaveBeenCalled();
  });

  it("enforces rate limit after 10 requests", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: {} as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    // Use a unique email per iteration to avoid the per-email throttle (max 3)
    const headers = { "Content-Type": "application/json", "cf-connecting-ip": "9.9.9.9" };
    for (let i = 0; i < 10; i++) {
      const body = JSON.stringify({ email: `iplimit${i}@example.com` });
      const res = await app.request("/public/leads", { method: "POST", headers, body }, env);
      expect(res.status).toBe(200);
    }
    const body = JSON.stringify({ email: "iplimit-final@example.com" });
    const res = await app.request("/public/leads", { method: "POST", headers, body }, env);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("uses only the first IP from a comma-separated X-Forwarded-For for rate-limit keying", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: {} as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    // 10 requests with a chained XFF header — all share the first IP bucket.
    // Use a unique email per iteration to avoid the per-email throttle (max 3).
    for (let i = 0; i < 10; i++) {
      const body = JSON.stringify({ email: `xff${i}@example.com` });
      const res = await app.request(
        "/public/leads",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "1.2.3.4, 5.6.7.8",
          },
          body,
        },
        env,
      );
      expect(res.status).toBe(200);
    }
    // An 11th request from the bare first IP must hit the same bucket → 429.
    const blocked = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ email: "xff-final@example.com" }),
      },
      env,
    );
    expect(blocked.status).toBe(429);
  });

  it("falls back to x-forwarded-for and unknown", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: {} as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const body = JSON.stringify({ email: "x@example.com" });
    let res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" },
        body,
      },
      env,
    );
    expect(res.status).toBe(200);
    res = await app.request(
      "/public/leads",
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("uses RATE_LIMIT_KV when provided", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: {} as never,
      alreadySubscribed: false,
    });
    const data = new Map<string, string>();
    const kvMock = {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        data.set(k, v);
      }),
    };
    const envWithKv = { ...env, RATE_LIMIT_KV: kvMock as unknown as KVNamespace };
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "7.7.7.7" },
        body: JSON.stringify({ email: "x@example.com" }),
      },
      envWithKv,
    );
    expect(res.status).toBe(200);
    expect(kvMock.get).toHaveBeenCalledWith("leads-ip:7.7.7.7");
  });

  it("prefers the atomic coordinator and never sends raw email in its key", async () => {
    vi.mocked(upsertLead).mockResolvedValue({ lead: {} as never, alreadySubscribed: false });
    const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
    const namespace = {
      idFromName: vi.fn((key: string) => key),
      get: vi.fn(() => ({ fetch })),
    };
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "7.7.7.8" },
        body: JSON.stringify({ email: "Private@Example.com" }),
      },
      { ...env, AUTH_RATE_LIMITER: namespace as never },
    );

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify(fetch.mock.calls);
    const coordinatorBodies = fetch.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(serialized).toContain("leads-ip:7.7.7.8");
    expect(coordinatorBodies).toContainEqual(expect.objectContaining({ kind: "leads-email" }));
    expect(serialized).not.toContain("private@example.com");
  });
});

describe("POST /public/leads/unsubscribe", () => {
  it("rejects oversized bodies before validation and unsubscribe side effects", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.0" },
        body: JSON.stringify({ token: "x".repeat(17_000) }),
      },
      env,
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(unsubscribeLead).not.toHaveBeenCalled();
  });

  it("returns { ok: true } on valid token", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValueOnce({ ok: true });
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.1" },
        body: JSON.stringify({ token: "lead.sig" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns { ok: false } on invalid token", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValueOnce({ ok: false });
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.2" },
        body: JSON.stringify({ token: "bad" }),
      },
      env,
    );
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 when token missing", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.3" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 on service throw", async () => {
    const error = new Error("boom");
    vi.mocked(unsubscribeLead).mockRejectedValueOnce(error);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.4" },
        body: JSON.stringify({ token: "t.s" }),
      },
      env,
    );
    expect(res.status).toBe(500);
    expect(mockCaptureApiException).toHaveBeenCalledWith(
      error,
      expect.anything(),
      expect.objectContaining({ status: 500 }),
    );
  });

  it("returns 500 and skips unsubscribe when MARKETING_DB is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = buildApp();

    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.9" },
        body: JSON.stringify({ token: "t.s" }),
      },
      { ...env, MARKETING_DB: undefined },
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to unsubscribe" });
    expect(unsubscribeLead).not.toHaveBeenCalled();
    expect(mockCaptureApiException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.anything(),
      expect.objectContaining({ status: 500 }),
    );
  });

  it("passes LEAD_UNSUBSCRIBE_SECRET when provided", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValueOnce({ ok: true });
    const app = buildApp();
    await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.5" },
        body: JSON.stringify({ token: "t.s" }),
      },
      { ...env, LEAD_UNSUBSCRIBE_SECRET: "alt-secret" },
    );
    expect(unsubscribeLead).toHaveBeenCalledWith(
      mockMarketingStore,
      "t.s",
      "alt-secret",
      expect.objectContaining({ LEAD_UNSUBSCRIBE_SECRET: "alt-secret" }),
    );
  });

  it("falls back to BETTER_AUTH_SECRET when LEAD_UNSUBSCRIBE_SECRET absent", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValueOnce({ ok: true });
    const app = buildApp();
    await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.6" },
        body: JSON.stringify({ token: "t.s" }),
      },
      env,
    );
    expect(unsubscribeLead).toHaveBeenCalledWith(
      mockMarketingStore,
      "t.s",
      "auth",
      expect.objectContaining({ BETTER_AUTH_SECRET: "auth" }),
    );
  });

  it("does not require the Postgres db context", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValueOnce({ ok: true });
    const app = buildApp({ attachPostgresDb: false });

    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.8" },
        body: JSON.stringify({ token: "t.s" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(createD1MarketingStore).toHaveBeenCalledWith(env.MARKETING_DB);
    expect(unsubscribeLead).toHaveBeenCalledWith(
      mockMarketingStore,
      "t.s",
      "auth",
      expect.objectContaining({ BETTER_AUTH_SECRET: "auth" }),
    );
  });

  it("unsubscribe falls back to x-forwarded-for and unknown IPs", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValue({ ok: true });
    const app = buildApp();
    const body = JSON.stringify({ token: "t.s" });
    let res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" },
        body,
      },
      env,
    );
    expect(res.status).toBe(200);
    res = await app.request(
      "/public/leads/unsubscribe",
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("uses RATE_LIMIT_KV on unsubscribe when provided", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValue({ ok: true });
    const data = new Map<string, string>();
    const kvMock = {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        data.set(k, v);
      }),
    };
    const envWithKv = { ...env, RATE_LIMIT_KV: kvMock as unknown as KVNamespace };
    const app = buildApp();
    const res = await app.request(
      "/public/leads/unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.7" },
        body: JSON.stringify({ token: "t.s" }),
      },
      envWithKv,
    );
    expect(res.status).toBe(200);
    expect(kvMock.get).toHaveBeenCalledWith("leads-ip:2.2.2.7");
  });

  it("rate-limits unsubscribe too", async () => {
    vi.mocked(unsubscribeLead).mockResolvedValue({ ok: true });
    const app = buildApp();
    const body = JSON.stringify({ token: "t.s" });
    const headers = { "Content-Type": "application/json", "cf-connecting-ip": "3.3.3.3" };
    for (let i = 0; i < 10; i++) {
      const res = await app.request(
        "/public/leads/unsubscribe",
        { method: "POST", headers, body },
        env,
      );
      expect(res.status).toBe(200);
    }
    const res = await app.request(
      "/public/leads/unsubscribe",
      { method: "POST", headers, body },
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /public/leads — bot hardening", () => {
  it("honeypot: returns success-shaped 200 and does NOT call upsertLead when companyWebsite is populated", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.1.1" },
        body: JSON.stringify({
          email: "bot@example.com",
          companyWebsite: "http://spam.example.com",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("honeypot: proceeds normally when companyWebsite is absent", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-hp" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.1.2" },
        body: JSON.stringify({ email: "real@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(upsertLead).toHaveBeenCalledOnce();
  });

  it("honeypot: proceeds normally when companyWebsite is empty string", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-hp-empty" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.1.3" },
        body: JSON.stringify({ email: "real2@example.com", companyWebsite: "" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(upsertLead).toHaveBeenCalledOnce();
  });

  it("per-email throttle: returns 429 after 3 requests from same email", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: { id: "lead-throttle" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const body = JSON.stringify({ email: "throttled@example.com" });
    // Use distinct IPs to avoid tripping the IP rate limit
    for (let i = 0; i < 3; i++) {
      const res = await app.request(
        "/public/leads",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": `10.0.2.${i + 1}`,
          },
          body,
        },
        env,
      );
      expect(res.status).toBe(200);
    }
    const blocked = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.2.99" },
        body,
      },
      env,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Too many requests" });
  });

  it("per-email throttle 429 carries CORS header when Origin is set", async () => {
    vi.mocked(upsertLead).mockResolvedValue({
      lead: { id: "lead-cors" } as never,
      alreadySubscribed: false,
    });
    const appWithCors = new Hono<AppEnv>();
    appWithCors.use("*", async (c, next) => {
      await next();
      c.res.headers.set("access-control-allow-origin", c.req.header("origin") ?? "*");
    });
    appWithCors.route("/public/leads", publicLeadsRoutes);

    const body = JSON.stringify({ email: "cors-throttled@example.com" });
    const headers = {
      "Content-Type": "application/json",
      Origin: "https://grantpipe.com",
      "cf-connecting-ip": "10.0.3.1",
    };
    // Exhaust per-email limit
    for (let i = 0; i < 3; i++) {
      await appWithCors.request(
        "/public/leads",
        {
          method: "POST",
          headers: { ...headers, "cf-connecting-ip": `10.0.3.${i + 10}` },
          body,
        },
        env,
      );
    }
    const blocked = await appWithCors.request(
      "/public/leads",
      { method: "POST", headers, body },
      env,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("Turnstile: returns 403 when secret is set and token is missing", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.4.1" },
        body: JSON.stringify({ email: "notoken@example.com" }),
      },
      { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Verification failed" });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("Turnstile: fails closed when the secret is missing in real mode", async () => {
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.4.5" },
        body: JSON.stringify({
          email: "missing-secret@example.com",
          turnstileToken: "must-not-be-logged",
        }),
      },
      { ...env, INTEGRATION_MODE: "real", TURNSTILE_SECRET_KEY: undefined },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Verification failed" });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("Turnstile: returns 403 when token verification fails (fetch returns success:false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      }),
    );
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.4.2" },
        body: JSON.stringify({ email: "badtoken@example.com", turnstileToken: "bad-token" }),
      },
      { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
    );
    expect(res.status).toBe(403);
    expect(upsertLead).not.toHaveBeenCalled();
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
    appWithCors.route("/public/leads", publicLeadsRoutes);

    const res = await appWithCors.request(
      "/public/leads",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://grantpipe.com",
          "cf-connecting-ip": "10.0.4.3",
        },
        body: JSON.stringify({ email: "cors403@example.com", turnstileToken: "bad" }),
      },
      { ...env, TURNSTILE_SECRET_KEY: "real-secret" },
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("Turnstile: bypasses when secret is unset (dev mode) and proceeds with upsert", async () => {
    vi.mocked(upsertLead).mockResolvedValueOnce({
      lead: { id: "lead-bypass" } as never,
      alreadySubscribed: false,
    });
    const app = buildApp();
    const res = await app.request(
      "/public/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.4.4" },
        body: JSON.stringify({ email: "bypass@example.com" }),
      },
      env, // no TURNSTILE_SECRET_KEY
    );
    expect(res.status).toBe(200);
    expect(upsertLead).toHaveBeenCalledOnce();
  });
});

describe("checkLeadsEmailRateLimit", () => {
  beforeEach(() => {
    _resetLeadsRateLimit();
  });

  it("allows first 3 requests from same email", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) {
      expect(await checkLeadsEmailRateLimit(store, "test@example.com", "test-secret")).toBe(true);
    }
  });

  it("denies 4th request from same email", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) {
      await checkLeadsEmailRateLimit(store, "limit@example.com", "test-secret");
    }
    expect(await checkLeadsEmailRateLimit(store, "limit@example.com", "test-secret")).toBe(false);
  });

  it("does not block different email addresses", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) {
      await checkLeadsEmailRateLimit(store, "a@example.com", "test-secret");
    }
    expect(await checkLeadsEmailRateLimit(store, "b@example.com", "test-secret")).toBe(true);
  });
});

describe("checkLeadsRateLimit", () => {
  function makeStore(): RateLimitStore & {
    data: Map<string, string>;
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  } {
    const data = new Map<string, string>();
    return {
      data,
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        data.set(k, v);
      }),
    };
  }

  it("allows first and increments", async () => {
    const store = makeStore();
    expect(await checkLeadsRateLimit(store, "a")).toBe(true);
    expect(await checkLeadsRateLimit(store, "a")).toBe(true);
    expect(store.data.get("leads-ip:a")).toBe("2");
  });

  it("denies after 10", async () => {
    const store = makeStore();
    for (let i = 0; i < 10; i++) {
      expect(await checkLeadsRateLimit(store, "b")).toBe(true);
    }
    expect(await checkLeadsRateLimit(store, "b")).toBe(false);
  });

  it("denies on non-numeric stored value", async () => {
    const store = makeStore();
    store.data.set("leads-ip:c", "NaN-value");
    expect(await checkLeadsRateLimit(store, "c")).toBe(false);
  });

  it("MemoryRateLimitStore put falls back to default TTL when options omitted", async () => {
    const store = new MemoryRateLimitStore();
    await store.put("k", "v");
    expect(await store.get("k")).toBe("v");
  });

  it("MemoryRateLimitStore get returns null for expired entries", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const store = new MemoryRateLimitStore();
      await store.put("k", "v", { expirationTtl: 10 });
      expect(await store.get("k")).toBe("v");
      vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
      expect(await store.get("k")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("MemoryRateLimitStore get returns null for unknown keys", async () => {
    const store = new MemoryRateLimitStore();
    expect(await store.get("nope")).toBeNull();
  });

  it("memory fallback expires entries past TTL", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      _resetLeadsRateLimit();

      vi.mocked(upsertLead).mockResolvedValue({
        lead: {} as never,
        alreadySubscribed: false,
      });
      const app = buildApp();
      // Use a unique email per iteration to avoid the per-email throttle (max 3).
      const headers = { "Content-Type": "application/json", "cf-connecting-ip": "4.4.4.4" };
      for (let i = 0; i < 10; i++) {
        const body = JSON.stringify({ email: `ttl${i}@example.com` });
        const res = await app.request("/public/leads", { method: "POST", headers, body }, env);
        expect(res.status).toBe(200);
      }
      const blockedBody = JSON.stringify({ email: "ttl-final@example.com" });
      const blocked = await app.request(
        "/public/leads",
        { method: "POST", headers, body: blockedBody },
        env,
      );
      expect(blocked.status).toBe(429);

      vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
      const allowedBody = JSON.stringify({ email: "ttl-allowed@example.com" });
      const allowed = await app.request(
        "/public/leads",
        { method: "POST", headers, body: allowedBody },
        env,
      );
      expect(allowed.status).toBe(200);
    } finally {
      vi.useRealTimers();
      _resetLeadsRateLimit();
    }
  });
});
