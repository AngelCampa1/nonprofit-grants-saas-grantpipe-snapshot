import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicMarketingRoutes } from "./routes";
import type { AppEnv } from "../../types";

const hoisted = vi.hoisted(() => ({
  mockCaptureSanitizedPostHogEvent: vi.fn(),
  mockCaptureBackgroundException: vi.fn(),
}));

type LaunchPromoResponse = {
  activeCode: string | null;
  percentOff: number;
  remaining: number;
  total: number;
  totalRedemptions: number;
  phaseIndex: number;
  phaseCount: number;
  updatedAt: string;
  active: boolean;
  endsAt: string | null;
  deadlineLabel: string;
};

vi.mock("../../lib/integrations", () => ({
  captureSanitizedPostHogEvent: hoisted.mockCaptureSanitizedPostHogEvent,
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: hoisted.mockCaptureBackgroundException,
}));

function makeKv(overrides: Record<string, ReturnType<typeof vi.fn>> = {}): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
    ...overrides,
  } as unknown as KVNamespace;
}

function buildApp(env: Record<string, unknown> = {}) {
  const app = new Hono<AppEnv>().route("/public/marketing", publicMarketingRoutes);
  return (path: string) =>
    app.request(path, { method: "GET" }, env as unknown as AppEnv["Bindings"]);
}

describe("GET /public/marketing/launch-promo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns an inactive retired-offer response with status 200", async () => {
    const request = buildApp({});
    const res = await request("/public/marketing/launch-promo");

    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchPromoResponse;
    expect(body).toMatchObject({
      activeCode: null,
      percentOff: 0,
      remaining: 0,
      total: 0,
      totalRedemptions: 0,
      phaseIndex: 0,
      phaseCount: 0,
      active: false,
      endsAt: null,
      deadlineLabel: "",
    });
  });

  it("includes Cache-Control header with public, max-age=300, s-maxage=300", async () => {
    const request = buildApp({});
    const res = await request("/public/marketing/launch-promo");

    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
  });

  it("returns 200 for a plain GET with no body", async () => {
    const app = new Hono<AppEnv>().route("/public/marketing", publicMarketingRoutes);
    // A bare GET with no body or Content-Type header should be handled without error
    const res = await app.request(
      "/public/marketing/launch-promo",
      { method: "GET" },
      {} as AppEnv["Bindings"],
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchPromoResponse;
    expect(body.activeCode).toBeNull();
  });

  it("stays inactive before the retired deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00.000Z"));
    try {
      const request = buildApp({});
      const res = await request("/public/marketing/launch-promo");

      expect(res.status).toBe(200);
      const body = (await res.json()) as LaunchPromoResponse;
      expect(body.active).toBe(false);
      expect(body.endsAt).toBeNull();
      expect(body.deadlineLabel).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays inactive after the retired deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    try {
      const request = buildApp({});
      const res = await request("/public/marketing/launch-promo");

      expect(res.status).toBe(200);
      const body = (await res.json()) as LaunchPromoResponse;
      expect(body.active).toBe(false);
      expect(body.endsAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /public/marketing/analytics", () => {
  beforeEach(() => vi.resetAllMocks());

  async function postAnalytics(
    body: Record<string, unknown>,
    env: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const app = new Hono<AppEnv>().route("/public/marketing", publicMarketingRoutes);
    return app.request(
      "/public/marketing/analytics",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
      env as AppEnv["Bindings"],
    );
  }

  async function postRawAnalytics(
    body: string,
    env: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const app = new Hono<AppEnv>().route("/public/marketing", publicMarketingRoutes);
    return app.request(
      "/public/marketing/analytics",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
      },
      env as AppEnv["Bindings"],
    );
  }

  it("skips outbound analytics capture when PostHog is not configured", async () => {
    const res = await postAnalytics({
      event: "outbound_landing_viewed",
      properties: { ve_campaign_id: "campaign-1" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "posthog_not_configured" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("captures analytics with a campaign-only outbound distinct id", async () => {
    hoisted.mockCaptureSanitizedPostHogEvent.mockResolvedValue({ id: "posthog" });

    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: {
          method: "email",
          ve_campaign_id: "campaign-1",
          ve_step: "1",
        },
      },
      {
        POSTHOG_API_KEY: "phc_test",
        SENTRY_ENVIRONMENT: "preview",
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ POSTHOG_API_KEY: "phc_test" }),
      {
        distinctId: "outbound:campaign-1",
        eventName: "outbound_signup_completed",
        payload: expect.objectContaining({
          method: "email",
          ve_campaign_id: "campaign-1",
          ve_step: "1",
          source_app: "signup_api",
          app_surface: "app",
          environment: "preview",
        }),
      },
    );
  });

  it("rejects analytics without campaign attribution", async () => {
    hoisted.mockCaptureSanitizedPostHogEvent.mockResolvedValue({ id: "posthog" });

    const res = await postAnalytics(
      {
        event: "outbound_landing_viewed",
        properties: { landing_path: "/signup" },
      },
      { POSTHOG_API_KEY: "phc_test" },
    );

    expect(res.status).toBe(400);
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rejects unknown analytics properties instead of forwarding arbitrary payloads", async () => {
    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: {
          ve_campaign_id: "campaign-1",
          customer_email: "person@example.org",
        },
      },
      { POSTHOG_API_KEY: "phc_test" },
    );

    expect(res.status).toBe(400);
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rejects overlong attribution values before PostHog capture", async () => {
    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: {
          ve_campaign_id: "campaign-1",
          ve_variant: "x".repeat(201),
        },
      },
      { POSTHOG_API_KEY: "phc_test" },
    );

    expect(res.status).toBe(400);
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rate-limits analytics requests with the configured KV binding", async () => {
    const kv = makeKv({
      get: vi.fn().mockResolvedValue("120"),
    });
    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      {
        POSTHOG_API_KEY: "phc_test",
        RATE_LIMIT_KV: kv,
      },
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("increments analytics requests below the configured KV limit", async () => {
    hoisted.mockCaptureSanitizedPostHogEvent.mockResolvedValue({ id: "posthog" });
    const get = vi.fn().mockResolvedValue("1");
    const put = vi.fn().mockResolvedValue(undefined);
    const kv = makeKv({ get, put });

    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      {
        POSTHOG_API_KEY: "phc_test",
        RATE_LIMIT_KV: kv,
      },
      { "CF-Connecting-IP": "203.0.113.25" },
    );

    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalledWith("public-marketing:analytics:203.0.113.25");
    expect(put).toHaveBeenCalledWith("public-marketing:analytics:203.0.113.25", "2", {
      expirationTtl: 60,
    });
  });

  it("allows analytics when the rate-limit store fails", async () => {
    hoisted.mockCaptureSanitizedPostHogEvent.mockResolvedValue({ id: "posthog" });
    const error = new Error("rate limit unavailable");
    const kv = makeKv({
      get: vi.fn().mockRejectedValue(error),
    });

    const res = await postAnalytics(
      {
        event: "outbound_landing_viewed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      {
        POSTHOG_API_KEY: "phc_test",
        RATE_LIMIT_KV: kv,
      },
    );

    expect(res.status).toBe(200);
    expect(hoisted.mockCaptureSanitizedPostHogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ POSTHOG_API_KEY: "phc_test" }),
      expect.objectContaining({ eventName: "outbound_landing_viewed" }),
    );
    expect(hoisted.mockCaptureBackgroundException).toHaveBeenCalledWith(error, "public-marketing", {
      step: "analytics_rate_limit",
    });
  });

  it("uses x-forwarded-for and ignores malformed content-length headers", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const kv = makeKv({ put });

    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      { RATE_LIMIT_KV: kv },
      {
        "Content-Length": "not-a-number",
        "X-Forwarded-For": "198.51.100.3",
      },
    );

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledWith("public-marketing:analytics:198.51.100.3", "1", {
      expirationTtl: 60,
    });
  });

  it("rejects oversized analytics payloads before validation", async () => {
    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      { POSTHOG_API_KEY: "phc_test" },
      { "Content-Length": "8193" },
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized analytics payloads when content-length is missing", async () => {
    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: {
          ve_campaign_id: "campaign-1",
          utm_content: "x".repeat(8_192),
        },
      },
      { POSTHOG_API_KEY: "phc_test" },
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized analytics request bodies without trusting content-length", async () => {
    const res = await postRawAnalytics(
      JSON.stringify({
        event: "outbound_signup_completed",
        properties: {
          ve_campaign_id: "campaign-1",
          landing_page: "x".repeat(8_200),
        },
      }),
      { POSTHOG_API_KEY: "phc_test" },
      { "Content-Length": "12" },
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid analytics JSON bodies", async () => {
    const res = await postRawAnalytics("{", { POSTHOG_API_KEY: "phc_test" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("rate-limits analytics requests when the stored count is invalid", async () => {
    const kv = makeKv({
      get: vi.fn().mockResolvedValue("not-a-number"),
    });

    const res = await postAnalytics(
      {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      {
        POSTHOG_API_KEY: "phc_test",
        RATE_LIMIT_KV: kv,
      },
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });

  it("expires the in-memory analytics rate-limit counter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00.000Z"));
    try {
      const body = {
        event: "outbound_signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      };

      const first = await postAnalytics(body, {}, { "CF-Connecting-IP": "203.0.113.10" });
      expect(first.status).toBe(200);

      vi.setSystemTime(new Date("2026-06-17T00:01:01.000Z"));
      const second = await postAnalytics(body, {}, { "CF-Connecting-IP": "203.0.113.10" });

      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ ok: true, skipped: "posthog_not_configured" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns ok when PostHog capture fails", async () => {
    const analyticsError = new Error("PostHog unavailable");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hoisted.mockCaptureSanitizedPostHogEvent.mockRejectedValue(analyticsError);
    try {
      const res = await postAnalytics(
        {
          event: "outbound_signup_completed",
          properties: {
            ve_campaign_id: "campaign-1",
            ve_variant: "plain_founder",
          },
        },
        { POSTHOG_API_KEY: "phc_test" },
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(hoisted.mockCaptureSanitizedPostHogEvent).toHaveBeenCalledWith(
        expect.objectContaining({ POSTHOG_API_KEY: "phc_test" }),
        expect.objectContaining({
          distinctId: "outbound:campaign-1:plain_founder",
        }),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "[public-marketing] analytics capture failed",
        expect.any(Error),
      );
      expect(hoisted.mockCaptureBackgroundException).toHaveBeenCalledWith(
        analyticsError,
        "public-marketing",
        {
          step: "outbound_analytics",
          analytics_event: "outbound_signup_completed",
        },
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects unsupported outbound analytics events", async () => {
    const res = await postAnalytics(
      {
        event: "signup_completed",
        properties: { ve_campaign_id: "campaign-1" },
      },
      { POSTHOG_API_KEY: "phc_test" },
    );

    expect(res.status).toBe(400);
    expect(hoisted.mockCaptureSanitizedPostHogEvent).not.toHaveBeenCalled();
  });
});
