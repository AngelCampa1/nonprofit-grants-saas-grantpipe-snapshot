import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { pledgeRoutes } from "./routes";
import type { AppEnv } from "../../types";

// ---------------------------------------------------------------------------
// Mock service layer
// ---------------------------------------------------------------------------

vi.mock("./service", () => ({
  createPledge: vi.fn(),
  listPledges: vi.fn(),
  getPledge: vi.fn(),
  recordPayment: vi.fn(),
  setAllowance: vi.fn(),
  writeOff: vi.fn(),
  promotePledge: vi.fn(),
}));

const { mockAnalyticsCapture, mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn().mockResolvedValue({ id: "analytics-1" }),
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  })),
}));

vi.mock("../../lib/sentry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/sentry")>()),
  captureBackgroundException: mockCaptureBackgroundException,
}));

// Mock the effective plan tier module so we can control the plan tier per test
vi.mock("../../lib/effective-plan-tier", () => ({
  getContextEffectivePlanTier: vi.fn().mockReturnValue("growth"),
  recordContextTrialFeatureUsage: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(
  overrides: {
    permissions?: Record<string, string>;
    role?: string;
  } = {},
) {
  const { permissions = {}, role = "admin" } = overrides;

  const app = new Hono<AppEnv>();

  // Inject context mocks
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("entityId", "entity-1");
    c.set("memberRole", role as "admin");
    c.set("memberPermissions", {
      donors: "manage",
      grants: "manage",
      funds: "manage",
      events: "manage",
      documents: "manage",
      compliance: "manage",
      programs: "manage",
      accounting: "manage",
      import: "manage",
      reports: "manage",
      payments: "manage",
      settings: "manage",
      billing: "manage",
      team: "manage",
      ...permissions,
    });
    c.set("orgSubscription", {
      planTier: "growth",
      subscriptionStatus: "active",
      trialEndsAt: null,
      onboardingCompleted: true,
      planSelectedAt: new Date(),
      stripeSubscriptionId: "sub-1",
      effectivePlanTier: "growth",
    });
    c.set("db", {} as never);
    c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
    c.set("session", { id: "sess-1", userId: "user-1" });
    await next();
  });

  app.route("/pledges", pledgeRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /pledges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges");
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("insufficient_plan");
  });

  it("returns pledge list on growth plan", async () => {
    const { listPledges } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(listPledges).mockResolvedValueOnce({
      pledges: [],
      totals: {
        totalFaceCents: 0,
        totalPVCents: 0,
        totalOutstandingCents: 0,
        totalWrittenOffCents: 0,
        totalAllowanceCents: 0,
      },
    });

    const app = makeApp();
    const res = await app.request("/pledges");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("pledges");
  });

  it("accepts query string limits from HTTP requests", async () => {
    const { listPledges } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(listPledges).mockResolvedValueOnce({
      pledges: [],
      totals: {
        totalFaceCents: 0,
        totalPVCents: 0,
        totalOutstandingCents: 0,
        totalWrittenOffCents: 0,
        totalAllowanceCents: 0,
      },
    });

    const app = makeApp();
    const res = await app.request("/pledges?limit=100");
    expect(res.status).toBe(200);
    expect(listPledges).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1", limit: 100 }),
    );
  });

  it("returns 403 for viewer with no donors:view permission", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp({ role: "auditor", permissions: { donors: "none" } });
    const res = await app.request("/pledges");
    expect(res.status).toBe(403);
  });
});

describe("GET /pledges/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges/pledge-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when service throws AppError with status 404", async () => {
    const { getPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    // Simulate the AppError that app-error.ts creates
    const err = Object.assign(new Error("Pledge not found"), { status: 404 });
    vi.mocked(getPledge).mockRejectedValueOnce(err);

    const app = makeApp();
    // Add error handler so AppErrors become proper HTTP responses
    app.onError((err, c) => {
      const anyErr = err as unknown as Record<string, unknown>;
      const status = anyErr.status;
      if (typeof status === "number") {
        return c.json({ error: (err as Error).message }, status as 404);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    const res = await app.request("/pledges/missing");
    expect(res.status).toBe(404);
  });

  it("returns pledge detail on success", async () => {
    const { getPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(getPledge).mockResolvedValueOnce({
      pledge: { id: "pledge-1" } as never,
      installments: [],
      payments: [],
      amortizationSchedule: [],
      carryingValueCents: 100_000,
    });

    const app = makeApp();
    const res = await app.request("/pledges/pledge-1");
    expect(res.status).toBe(200);
    expect(getPledge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });
});

describe("POST /pledges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "c1",
        pledgeDate: "2024-01-01",
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: "2025-01-01", amountCents: 50000 }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp();
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    expect(res.status).toBe(400);
  });

  it("creates pledge and returns 201", async () => {
    const { createPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(createPledge).mockResolvedValueOnce({
      pledge: { id: "pledge-new" } as never,
      installments: [],
    });

    const app = makeApp();
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "contact-1",
        pledgeDate: "2024-01-01",
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: "2025-01-01", amountCents: 50000 }],
      }),
    });
    expect(res.status).toBe(201);
    expect(createPledge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });

  it("captures privacy-safe API analytics when creating a pledge", async () => {
    const { createPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(createPledge).mockResolvedValueOnce({
      pledge: { id: "pledge-new" } as never,
      installments: [],
    });

    const app = makeApp();
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "contact-1",
        fundId: "fund-1",
        pledgeDate: "2024-01-01",
        discountRateBasisPoints: 450,
        netAssetClass: "temporarily_restricted",
        hasBarrier: true,
        hasRightOfReturn: true,
        installments: [
          { dueDate: "2025-01-01", amountCents: 50000 },
          { dueDate: "2026-01-01", amountCents: 50000 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.pledgeCreated,
      payload: {
        surface: "api",
        has_fund: true,
        has_grant: false,
        is_conditional: true,
        installment_count_bucket: "1_5",
        discount_rate_bucket: "1_500_bp",
        net_asset_class: "temporarily_restricted",
      },
    });
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("contact-1");
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("pledge-new");
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("buckets large pledge schedules without sending raw counts or rates", async () => {
    const { createPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(createPledge).mockResolvedValue({
      pledge: { id: "pledge-new" } as never,
      installments: [],
    });

    const app = makeApp();
    const schedules = [
      { count: 6, rate: 750, countBucket: "6_10", rateBucket: "501_1000_bp" },
      { count: 12, rate: 1_200, countBucket: "11_25", rateBucket: "1000_plus_bp" },
      { count: 26, rate: 1_200, countBucket: "25_plus", rateBucket: "1000_plus_bp" },
    ];

    for (const schedule of schedules) {
      mockAnalyticsCapture.mockClear();
      const res = await app.request("/pledges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: "contact-1",
          grantId: "grant-1",
          pledgeDate: "2024-01-01",
          discountRateBasisPoints: schedule.rate,
          netAssetClass: "unrestricted",
          hasBarrier: false,
          hasRightOfReturn: false,
          installments: Array.from({ length: schedule.count }, (_, index) => ({
            dueDate: `2025-01-${String(index + 1).padStart(2, "0")}`,
            amountCents: 50000,
          })),
        }),
      });

      expect(res.status).toBe(201);
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: ANALYTICS_EVENTS.pledgeCreated,
          payload: expect.objectContaining({
            has_grant: true,
            installment_count_bucket: schedule.countBucket,
            discount_rate_bucket: schedule.rateBucket,
          }) as Record<string, unknown>,
        }),
      );
      expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain(
        `"rate":${schedule.rate}`,
      );
      expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain(
        `"count":${schedule.count}`,
      );
    }
  });

  it("captures analytics transport failures in Sentry without failing pledge creation", async () => {
    const { createPledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    const analyticsError = new Error("posthog down");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(createPledge).mockResolvedValueOnce({
      pledge: { id: "pledge-new" } as never,
      installments: [],
    });
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);

    const app = makeApp();
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "contact-1",
        pledgeDate: "2024-01-01",
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: "2025-01-01", amountCents: 50000 }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(analyticsError, "pledges", {
      telemetry: "analytics_capture",
      operation: "pledge_created",
    });
  });

  it("returns 403 when accounting:manage permission missing", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp({ role: "viewer", permissions: { accounting: "view" } });
    const res = await app.request("/pledges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "contact-1",
        pledgeDate: "2024-01-01",
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: "2025-01-01", amountCents: 50000 }],
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /pledges/:id/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges/p1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pledgeId: "p1",
        amountCents: 10000,
        paymentDate: "2025-01-15",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("records payment and returns 201", async () => {
    const { recordPayment } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(recordPayment).mockResolvedValueOnce({
      payment: { id: "pay-1" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pledgeId: "p1",
        amountCents: 10000,
        paymentDate: "2025-01-15",
      }),
    });
    expect(res.status).toBe(201);
    expect(recordPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });

  it("captures privacy-safe API analytics when recording a payment", async () => {
    const { recordPayment } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(recordPayment).mockResolvedValueOnce({ payment: { id: "pay-1" } as never });

    const app = makeApp();
    const res = await app.request("/pledges/p1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installmentId: "inst-1",
        amountCents: 10000,
        paymentDate: "2025-01-15",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.pledgePaymentRecorded,
      payload: {
        surface: "api",
        has_installment: true,
        amount_bucket: "1_100",
      },
    });
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("inst-1");
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("buckets payment amounts without sending raw cents", async () => {
    const { recordPayment } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(recordPayment).mockResolvedValue({ payment: { id: "pay-1" } as never });

    const app = makeApp();
    const examples = [
      { amountCents: 100_000, bucket: "101_1000" },
      { amountCents: 1_001_00, bucket: "1001_10000" },
      { amountCents: 1_000_100, bucket: "10000_plus" },
    ];

    for (const example of examples) {
      mockAnalyticsCapture.mockClear();
      const res = await app.request("/pledges/p1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: example.amountCents,
          paymentDate: "2025-01-15",
        }),
      });

      expect(res.status).toBe(201);
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: ANALYTICS_EVENTS.pledgePaymentRecorded,
          payload: expect.objectContaining({
            amount_bucket: example.bucket,
          }) as Record<string, unknown>,
        }),
      );
      expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain(
        String(example.amountCents),
      );
    }
  });

  it("returns 400 for invalid body", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp();
    const res = await app.request("/pledges/p1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: -1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /pledges/:id/allowance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges/p1/allowance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pledgeId: "p1", allowanceCents: 5000 }),
    });
    expect(res.status).toBe(403);
  });

  it("sets allowance and returns updated pledge", async () => {
    const { setAllowance } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(setAllowance).mockResolvedValueOnce({
      pledge: { id: "p1", allowanceCents: 5000 } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/allowance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pledgeId: "p1", allowanceCents: 5000 }),
    });
    expect(res.status).toBe(200);
    expect(setAllowance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });

  it("captures privacy-safe API analytics when setting allowance", async () => {
    const { setAllowance } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(setAllowance).mockResolvedValueOnce({
      pledge: { id: "p1", allowanceCents: 5000 } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/allowance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowanceCents: 5000 }),
    });

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.pledgeAllowanceSet,
      payload: {
        surface: "api",
        allowance_bucket: "1_100",
      },
    });
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("buckets zero and large allowance amounts without sending raw cents", async () => {
    const { setAllowance } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(setAllowance).mockResolvedValue({ pledge: { id: "p1" } as never });

    const app = makeApp();
    const examples = [
      { allowanceCents: 0, bucket: "0" },
      { allowanceCents: 1_000_100, bucket: "10000_plus" },
    ];

    for (const example of examples) {
      mockAnalyticsCapture.mockClear();
      const res = await app.request("/pledges/p1/allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowanceCents: example.allowanceCents }),
      });

      expect(res.status).toBe(200);
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: ANALYTICS_EVENTS.pledgeAllowanceSet,
          payload: expect.objectContaining({
            allowance_bucket: example.bucket,
          }) as Record<string, unknown>,
        }),
      );
      if (example.allowanceCents > 0) {
        expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain(
          String(example.allowanceCents),
        );
      }
    }
  });
});

describe("POST /pledges/:id/write-off", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges/p1/write-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pledgeId: "p1" }),
    });
    expect(res.status).toBe(403);
  });

  it("writes off pledge and returns 200", async () => {
    const { writeOff } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(writeOff).mockResolvedValueOnce({
      pledge: { id: "p1", status: "written_off" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/write-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pledgeId: "p1" }),
    });
    expect(res.status).toBe(200);
    expect(writeOff).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });

  it("captures privacy-safe API analytics when writing off a pledge", async () => {
    const { writeOff } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(writeOff).mockResolvedValueOnce({
      pledge: { id: "p1", status: "written_off" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/write-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Donor unreachable" }),
    });

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.pledgeWrittenOff,
      payload: {
        surface: "api",
        has_reason: true,
      },
    });
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("Donor unreachable");
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("accepts an empty body (pledgeId comes from the path, not the body)", async () => {
    const { writeOff } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(writeOff).mockResolvedValueOnce({
      pledge: { id: "p1", status: "written_off" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/write-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    // pledgeId must be derived from the path param, not from the request body.
    expect(vi.mocked(writeOff)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pledgeId: "p1" }),
    );
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.pledgeWrittenOff,
        payload: expect.objectContaining({ has_reason: false }) as Record<string, unknown>,
      }),
    );
  });

  it("rejects a non-string reason with 400", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp();
    const res = await app.request("/pledges/p1/write-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: 123 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /pledges/:id/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 403 on starter plan", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValueOnce("starter");

    const app = makeApp();
    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("insufficient_plan");
  });

  it("promotes the pledge and returns 200 (pledgeId from path, default date)", async () => {
    const { promotePledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(promotePledge).mockResolvedValueOnce({
      pledge: { id: "p1", status: "active" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const call = vi.mocked(promotePledge).mock.calls[0]?.[1];
    expect(call?.pledgeId).toBe("p1");
    expect(call?.entityId).toBe("entity-1");
    expect(call?.promotionDate).toBeInstanceOf(Date);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.pledgePromoted,
        payload: expect.objectContaining({
          has_explicit_promotion_date: false,
        }) as Record<string, unknown>,
      }),
    );
  });

  it("captures privacy-safe API analytics when promoting a conditional pledge", async () => {
    const { promotePledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(promotePledge).mockResolvedValueOnce({
      pledge: { id: "p1", status: "active" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotionDate: "2026-01-01" }),
    });

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.pledgePromoted,
      payload: {
        surface: "api",
        has_explicit_promotion_date: true,
      },
    });
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("forwards an explicit promotionDate from the body", async () => {
    const { promotePledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    vi.mocked(promotePledge).mockResolvedValueOnce({
      pledge: { id: "p1", status: "active" } as never,
    });

    const app = makeApp();
    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotionDate: "2026-01-01" }),
    });
    expect(res.status).toBe(200);
    const call = vi.mocked(promotePledge).mock.calls[0]?.[1];
    expect(call?.promotionDate).toEqual(new Date("2026-01-01"));
  });

  it("returns 404 when the pledge does not exist", async () => {
    const { promotePledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    const err = Object.assign(new Error("Pledge not found"), { status: 404 });
    vi.mocked(promotePledge).mockRejectedValueOnce(err);

    const app = makeApp();
    app.onError((e, c) => {
      const status = (e as unknown as Record<string, unknown>).status;
      if (typeof status === "number") {
        return c.json({ error: (e as Error).message }, status as 404);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    const res = await app.request("/pledges/missing/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the pledge is not conditional", async () => {
    const { promotePledge } = await import("./service");
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    const err = Object.assign(new Error("Only conditional pledges can be promoted"), {
      status: 400,
    });
    vi.mocked(promotePledge).mockRejectedValueOnce(err);

    const app = makeApp();
    app.onError((e, c) => {
      const status = (e as unknown as Record<string, unknown>).status;
      if (typeof status === "number") {
        return c.json({ error: (e as Error).message }, status as 400);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when accounting:manage permission is missing", async () => {
    const { getContextEffectivePlanTier } = await import("../../lib/effective-plan-tier");
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");

    const app = makeApp({ role: "viewer", permissions: { accounting: "view" } });
    const res = await app.request("/pledges/p1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });
});
