import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingRoutes } from "./routes";
import type { AppEnv } from "../../types";

const originalFetch = globalThis.fetch;

function buildApp(options: {
  orgId?: string | null;
  memberRole?: "admin" | "editor" | "viewer" | null;
  entityRole?: "admin" | "editor" | "viewer" | "auditor" | null;
  env?: Partial<AppEnv["Bindings"]>;
}) {
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("orgId", options.orgId === undefined ? "org-1" : options.orgId);
      c.set("memberRole", options.memberRole === undefined ? "admin" : options.memberRole);
      c.set("entityRole", options.entityRole ?? null);
      await next();
    })
    .route("/billing", billingRoutes);
  return {
    request(body: Record<string, unknown>) {
      const env = {
        STRIPE_SECRET_KEY: "sk_test",
        APP_URL: "https://app.grantpipe.com",
        ...options.env,
      };
      return app.request(
        "/billing/checkout/trial",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        env,
      );
    },
  };
}

describe("POST /billing/checkout/trial", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 410 because card-required trial checkout has been removed", async () => {
    const { request } = buildApp({});
    const res = await request({ planTier: "growth", billingCycle: "monthly" });

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "trial_checkout_removed",
      message:
        "Free trials no longer require card collection. Finish onboarding, then add billing later from Settings when you're ready.",
    });
  });

  it("keeps org admin checkout authority when the selected entity role is viewer", async () => {
    const { request } = buildApp({ entityRole: "viewer" });

    expect((await request({ planTier: "growth", billingCycle: "monthly" })).status).toBe(410);
  });

  it("returns 403 when orgId is not set (no session / no membership)", async () => {
    const { request } = buildApp({ orgId: null, memberRole: null });
    const res = await request({ planTier: "starter", billingCycle: "monthly" });
    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is not an admin", async () => {
    const { request } = buildApp({ memberRole: "editor" });
    const res = await request({ planTier: "starter", billingCycle: "monthly" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("does not touch Stripe for the removed endpoint", async () => {
    globalThis.fetch = vi.fn();
    const { request } = buildApp({});
    await request({ planTier: "starter", billingCycle: "monthly", promoCode: "Y80OFF" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
