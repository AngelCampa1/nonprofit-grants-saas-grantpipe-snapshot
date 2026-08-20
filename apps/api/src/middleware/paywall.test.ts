import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireActiveBilling, requirePlanTier } from "./paywall";
import type { AppEnv } from "../types";
import { recordTrialFeatureUsage } from "../domains/org/trial-usage";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));
vi.mock("../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("../domains/org/trial-usage", () => ({
  recordTrialFeatureUsage: vi.fn().mockResolvedValue(undefined),
}));

const paywallSource = readFileSync(fileURLToPath(new URL("./paywall.ts", import.meta.url)), "utf8");

beforeEach(() => {
  vi.mocked(recordTrialFeatureUsage).mockClear();
  vi.mocked(recordTrialFeatureUsage).mockResolvedValue(undefined);
});

describe("paywall pricing source contract", () => {
  it("uses shared plan-order helpers instead of a local tier-order array", () => {
    expect(paywallSource).toContain("isPlanTierAtLeast");
    expect(paywallSource).not.toContain(
      'export const PLAN_TIER_ORDER: PlanTier[] = ["starter", "growth", "audit_ready", "enterprise"];',
    );
  });
});

function buildApp(orgRow: Record<string, unknown> | undefined, orgId: string | null = "org-1") {
  const db = {
    query: {
      organizations: { findFirst: vi.fn().mockResolvedValue(orgRow) },
    },
  } as never;
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db);
      c.set("orgId", orgId);
      await next();
    })
    .use("*", requireActiveBilling())
    .get("/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("requireActiveBilling", () => {
  it("allows requests for active subscriptions", async () => {
    const app = buildApp({ subscriptionStatus: "active", trialEndsAt: null, planTier: "growth" });
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });

  it("allows trialing requests when trial in the future without a Stripe subscription", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const app = buildApp({
      subscriptionStatus: "trialing",
      trialEndsAt: future,
      planTier: "starter",
      stripeSubscriptionId: null,
    });
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });

  it("blocks expired trials with 402 and surfaces the reason", async () => {
    const past = new Date(Date.now() - 1000);
    const app = buildApp({
      subscriptionStatus: "trialing",
      trialEndsAt: past,
      planTier: "starter",
    });
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "paywall", reason: "trial_expired" });
  });

  it("blocks canceled subscriptions", async () => {
    const app = buildApp({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
      planTier: "growth",
    });
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      reason: "subscription_canceled",
    });
  });

  it("blocks past_due subscriptions", async () => {
    const app = buildApp({
      subscriptionStatus: "past_due",
      trialEndsAt: null,
      planTier: "growth",
    });
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
  });

  it("returns 403 when no orgId is attached", async () => {
    const app = buildApp(undefined, null);
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
  });

  it("returns 403 when org row not found", async () => {
    const app = buildApp(undefined, "org-1");
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
  });

  it("defaults to trialing when org row has no status", async () => {
    const past = new Date(Date.now() - 1000);
    const app = buildApp({ trialEndsAt: past, planTier: "starter" });
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
  });
});

describe("requireActiveBilling — cached orgSubscription", () => {
  it("skips the DB query when orgSubscription is pre-populated in context", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      planTier: "growth",
    });
    const db = {
      query: {
        organizations: { findFirst },
      },
    } as never;

    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        // Pre-populate the cache — simulates the org context middleware having run first
        c.set("orgSubscription", {
          subscriptionStatus: "trialing",
          trialEndsAt: future,
          planTier: "starter",
          onboardingCompleted: false,
          planSelectedAt: null,
          stripeSubscriptionId: "sub_cache",
        });
        await next();
      })
      .use("*", requireActiveBilling())
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    // The DB should NOT have been queried because the cached value was used
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("falls back to DB query when orgSubscription is null in context", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      planTier: "growth",
    });
    const db = {
      query: {
        organizations: { findFirst },
      },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        c.set("orgSubscription", null);
        await next();
      })
      .use("*", requireActiveBilling())
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    // Without cache, the DB must be queried
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

function buildPlanApp(
  orgRow: Record<string, unknown> | undefined,
  orgId: string | null = "org-1",
  minimumTier: "starter" | "growth" | "audit_ready" = "growth",
) {
  const db = {
    query: {
      organizations: { findFirst: vi.fn().mockResolvedValue(orgRow) },
    },
  } as never;
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db);
      c.set("orgId", orgId);
      await next();
    })
    .use("*", requirePlanTier(minimumTier))
    .get("/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("requirePlanTier", () => {
  it("blocks starter org when growth is required (returns 402)", async () => {
    const app = buildPlanApp(
      { planTier: "starter", subscriptionStatus: "active" },
      "org-1",
      "growth",
    );
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "insufficient_plan",
      required: "growth",
      current: "starter",
    });
  });

  it("allows growth org when growth is required", async () => {
    const app = buildPlanApp(
      { planTier: "growth", subscriptionStatus: "active" },
      "org-1",
      "growth",
    );
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });

  it("allows audit_ready org when growth is required", async () => {
    const app = buildPlanApp(
      { planTier: "audit_ready", subscriptionStatus: "active" },
      "org-1",
      "growth",
    );
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });

  it("allows enterprise org when audit_ready is required", async () => {
    const app = buildPlanApp(
      { planTier: "enterprise", subscriptionStatus: "active" },
      "org-1",
      "audit_ready",
    );
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });

  it("blocks growth org when audit_ready is required", async () => {
    const app = buildPlanApp(
      { planTier: "growth", subscriptionStatus: "active" },
      "org-1",
      "audit_ready",
    );
    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "insufficient_plan",
      required: "audit_ready",
      current: "growth",
    });
  });

  it("returns 403 when no orgId is attached", async () => {
    const app = buildPlanApp(undefined, null, "growth");
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
  });

  it("returns 403 when org row not found", async () => {
    const app = buildPlanApp(undefined, "org-1", "growth");
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
  });
});

describe("requirePlanTier — cached orgSubscription", () => {
  it("skips the DB query when orgSubscription is pre-populated in context", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "growth",
      subscriptionStatus: "active",
    });
    const db = {
      query: {
        organizations: { findFirst },
      },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        // Pre-populate the cache with a growth-tier org
        c.set("orgSubscription", {
          planTier: "growth",
          subscriptionStatus: "active",
          trialEndsAt: null,
          onboardingCompleted: true,
          planSelectedAt: null,
          stripeSubscriptionId: "sub_cache",
        });
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    // The DB should NOT have been queried because the cached value was used
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("falls back to DB query when orgSubscription is null in context", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "growth",
      subscriptionStatus: "active",
    });
    const db = {
      query: {
        organizations: { findFirst },
      },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        c.set("orgSubscription", null);
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("requirePlanTier - selected-plan trials", () => {
  it("blocks starter trialing orgs at the audit_ready gate", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: future,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-trial");
        await next();
      })
      .use("*", requirePlanTier("audit_ready"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("blocks expired-trial org with insufficient_plan even if status='trialing'", async () => {
    const past = new Date(Date.now() - 1000);
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: past,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        await next();
      })
      .use("*", requirePlanTier("audit_ready"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("does NOT track usage for active growth subscription hitting growth gate", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "growth",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("trialing-status with null trialEndsAt is not treated as active trial", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: null,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("does not call trial usage tracking when an active trial is already entitled", async () => {
    vi.mocked(recordTrialFeatureUsage).mockRejectedValueOnce(new Error("db down"));
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "growth",
      subscriptionStatus: "trialing",
      trialEndsAt: future,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-trial");
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("treats string trialEndsAt as parseable without bypassing the selected plan", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: future,
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-trial");
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("treats invalid trialEndsAt string as not active", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: "not-a-date",
    });
    const db = {
      query: { organizations: { findFirst } },
    } as never;

    const app = new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("db", db);
        c.set("orgId", "org-1");
        await next();
      })
      .use("*", requirePlanTier("growth"))
      .get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping");
    expect(res.status).toBe(402);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });
});
