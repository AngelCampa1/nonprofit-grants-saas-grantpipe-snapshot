import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";

// ---------------------------------------------------------------------------
// Mock the sentinel service
// ---------------------------------------------------------------------------

const { mockAnalyticsCapture, mockCaptureApiException, mockGetBudgetSentinel } = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn().mockResolvedValue({ id: "evt-1" }),
  mockCaptureApiException: vi.fn(),
  mockGetBudgetSentinel: vi.fn(),
}));

vi.mock("./sentinel.service", () => ({
  getBudgetSentinel: mockGetBudgetSentinel,
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  })),
}));

vi.mock("../../lib/sentry", () => ({
  captureApiException: mockCaptureApiException,
}));

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return { ...actual };
});

// Import route AFTER mock is wired
import { grantRoutes } from "./routes";
import * as shared from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp(
  planTier = "growth",
  role: "admin" | "editor" | "viewer" = "viewer",
  permissions: Partial<PermissionMap> | null = null,
  entityId: string | null = "entity-1",
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      if (entityId) {
        c.set("entityId", entityId);
      }
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", {
        planTier,
        subscriptionStatus: "active",
        trialEndsAt: null,
        effectivePlanTier: planTier,
        onboardingCompleted: true,
        stripeSubscriptionId: null,
        planSelectedAt: null,
      } as never);
      await next();
    })
    .route("/grants", grantRoutes);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_OVERSPEND_ITEM = {
  kind: "overspend",
  id: "line-1",
  grantId: "g-1",
  grantName: "Grant A",
  category: "Personnel",
  band: "over_budget",
  approvedAmountCents: 10_000,
  actualCents: 12_000,
  plannedCents: 0,
  projectedCents: 12_000,
  overByCents: 2_000,
  utilizationPercent: 120,
  riskScore: 83,
};

const MOCK_UNDERSPEND_ITEM = {
  kind: "underspend",
  id: "term-1",
  fundId: "fund-1",
  fundName: "Youth Fund",
  grantId: null,
  title: "Youth Program",
  band: "lapsed_unspent",
  balanceCents: 5_000,
  daysUntilEnd: -10,
  endDate: new Date("2026-06-01"),
  riskScore: 82,
};

const MOCK_TOTALS = {
  overspend: { near_limit: 0, projected_overspend: 0, over_budget: 1, total: 1 },
  underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 1, total: 1 },
  totalAtRisk: 2,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /grants/budget-sentinel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "evt-1" });
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: new Date("2026-06-16T14:00:00.000Z"),
      items: [MOCK_OVERSPEND_ITEM, MOCK_UNDERSPEND_ITEM],
      totals: MOCK_TOTALS,
    });
  });

  it("returns 200 with asOf, items, and totals for growth plan", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; items: unknown[]; totals: unknown };
    expect(body).toHaveProperty("asOf");
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("totals");
    expect(body.items).toHaveLength(2);
  });

  it("filters fund underspend rows from users without funds view access", async () => {
    const app = buildApp("growth", "viewer", { grants: "view", funds: "none" });

    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ kind: string; id: string }>;
      totals: typeof MOCK_TOTALS;
    };
    expect(body.items).toEqual([MOCK_OVERSPEND_ITEM]);
    expect(body.totals).toEqual({
      overspend: { near_limit: 0, projected_overspend: 0, over_budget: 1, total: 1 },
      underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
      totalAtRisk: 1,
    });
  });

  it("allows funds-only viewers to see fund underspend rows without grant rows", async () => {
    const app = buildApp("growth", "viewer", { grants: "none", funds: "view" });

    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ kind: string; id: string }>;
      totals: typeof MOCK_TOTALS;
    };
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: "underspend",
        id: MOCK_UNDERSPEND_ITEM.id,
        fundId: MOCK_UNDERSPEND_ITEM.fundId,
      }),
    ]);
    expect(body.totals).toEqual({
      overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
      underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 1, total: 1 },
      totalAtRisk: 1,
    });
  });

  it("returns 403 when the member has neither grants nor funds view access", async () => {
    const app = buildApp("growth", "viewer", { grants: "none", funds: "none" });

    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(403);
    expect(mockGetBudgetSentinel).not.toHaveBeenCalled();
  });

  it("captures a privacy-safe budget_sentinel_viewed event on success", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?kinds=overspend&limit=5");

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.budgetSentinelViewed,
      payload: {
        actorId: "user-1",
        kind_filter: "overspend",
        limit_bucket: "1_10",
        item_count_bucket: "1_10",
        total_at_risk_bucket: "1_10",
        overspend_count_bucket: "1_10",
        underspend_count_bucket: "1_10",
      },
    });
  });

  it("scopes the service call to the active entity from request context", async () => {
    const app = buildApp("growth", "viewer", null, "entity-1");

    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(200);
    expect(mockGetBudgetSentinel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-1" }),
    );
  });

  it("returns 200 for starter plan — grant budget alerts now available on all plans", async () => {
    mockGetBudgetSentinel.mockResolvedValue({ asOf: new Date(), items: [], totals: MOCK_TOTALS });
    const app = buildApp("starter");
    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(200);
    expect(mockGetBudgetSentinel).toHaveBeenCalled();
  });

  it("returns 402 when canUseGrantBudgetAlerts guard is triggered (defense-in-depth branch)", async () => {
    // The guard is unreachable via any real PlanTier since all tiers now have
    // hasGrantBudgetAlerts = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "canUseGrantBudgetAlerts").mockReturnValueOnce(false);
    const app = buildApp("starter");
    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; required: string; current: string };
    expect(body.error).toBe("insufficient_plan");
    expect(body.required).toBe("paid_plan");
    expect(body.current).toBe("starter");
    expect(mockGetBudgetSentinel).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 400 for invalid kind token", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?kinds=invalid");

    expect(res.status).toBe(400);
    expect(mockGetBudgetSentinel).not.toHaveBeenCalled();
  });

  it("filters by kinds=overspend via query param", async () => {
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: new Date(),
      items: [MOCK_OVERSPEND_ITEM],
      totals: MOCK_TOTALS,
    });
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?kinds=overspend");

    expect(res.status).toBe(200);
    expect(mockGetBudgetSentinel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kinds: ["overspend"] }),
    );
  });

  it("accepts multiple kinds=overspend,underspend", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?kinds=overspend,underspend");

    expect(res.status).toBe(200);
    expect(mockGetBudgetSentinel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kinds: ["overspend", "underspend"] }),
    );
  });

  it("applies limit after permission filtering instead of before it", async () => {
    const app = buildApp("growth", "viewer", { grants: "none", funds: "view" });
    const res = await app.request("/grants/budget-sentinel?limit=1");

    expect(res.status).toBe(200);
    const [, options] = mockGetBudgetSentinel.mock.calls[0] as [
      unknown,
      { kinds?: string[]; limit?: number },
    ];
    expect(options).not.toHaveProperty("limit");

    const body = (await res.json()) as {
      items: Array<{ kind: string; id: string }>;
      totals: typeof MOCK_TOTALS;
    };
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: "underspend",
        id: MOCK_UNDERSPEND_ITEM.id,
      }),
    ]);
  });

  it("returns 400 for limit=0 (invalid, must be positive)", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?limit=0");
    expect(res.status).toBe(400);
  });

  it("returns 400 for kinds=none (invalid token)", async () => {
    const app = buildApp("growth");
    const res = await app.request("/grants/budget-sentinel?kinds=none");
    expect(res.status).toBe(400);
  });

  it("enterprise plan also passes the gate", async () => {
    const app = buildApp("enterprise");
    const res = await app.request("/grants/budget-sentinel");
    expect(res.status).toBe(200);
  });

  it("viewer role is allowed (grants.view permission)", async () => {
    const app = buildApp("growth", "viewer");
    const res = await app.request("/grants/budget-sentinel");
    expect(res.status).toBe(200);
  });

  it("captures Sentinel service failures through the API Sentry handler", async () => {
    const error = new Error("sentinel query failed");
    mockGetBudgetSentinel.mockRejectedValue(error);
    const app = buildApp("growth");

    const res = await app.request("/grants/budget-sentinel");

    expect(res.status).toBe(500);
    expect(mockCaptureApiException).toHaveBeenCalledWith(
      error,
      expect.anything(),
      expect.objectContaining({ status: 500 }),
    );
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.budgetSentinelOperationFailed,
      payload: {
        actorId: "user-1",
        kind_filter: "all",
        limit_bucket: "unknown",
        operation: "view",
        failure_type: "service_error",
      },
    });
    expect(mockAnalyticsCapture).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.budgetSentinelViewed }),
    );
  });
});
