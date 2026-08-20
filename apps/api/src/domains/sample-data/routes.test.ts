import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { sampleDataRoutes } from "./routes";
import type { AppEnv } from "../../types";

// ---------------------------------------------------------------------------
// Mock service layer
// ---------------------------------------------------------------------------

vi.mock("./service", () => ({
  seedSampleData: vi.fn(),
  clearSampleData: vi.fn(),
  getSampleDataStatus: vi.fn(),
  SampleDataConflictError: class SampleDataConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SampleDataConflictError";
    }
  },
  INSERT_ORDER: [],
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

// ---------------------------------------------------------------------------
// Test app factory (standard — uses empty db mock, service is mocked)
// ---------------------------------------------------------------------------

function makeApp(
  overrides: {
    permissions?: Record<string, string>;
    role?: string;
  } = {},
) {
  const { permissions = {}, role = "admin" } = overrides;

  const app = new Hono<AppEnv>();

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

  app.route("/sample-data", sampleDataRoutes);
  return app;
}

// App factory with a custom DB mock (for callback-coverage tests)
function makeAppWithDb(
  dbMock: Record<string, unknown>,
  overrides: { role?: string; permissions?: Record<string, string> } = {},
) {
  const { role = "admin", permissions = {} } = overrides;
  const app = new Hono<AppEnv>();
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
    c.set("db", dbMock as never);
    c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
    c.set("session", { id: "sess-1", userId: "user-1" });
    await next();
  });
  app.route("/sample-data", sampleDataRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /sample-data (seed)
// ---------------------------------------------------------------------------

describe("POST /sample-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("buckets large recordCount into 100_plus without sending raw count", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 150 });

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ record_count_bucket: "100_plus" }) as Record<
          string,
          unknown
        >,
      }),
    );
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("150");
  });

  it("returns 200 with seeded result and fires PostHog event", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 42 });

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ seeded: true, recordCount: 42 });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.sampleDataSeeded,
      payload: {
        surface: "api",
        record_count_bucket: expect.any(String) as string,
      },
    });
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("does not include raw recordCount or user ID in analytics payload", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 99 });

    const app = makeApp();
    await app.request("/sample-data", { method: "POST" });

    // The raw record count should not appear — only the bucketed form
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain('"recordCount":99');
    // User ID must not appear in the analytics payload
    expect(JSON.stringify(mockAnalyticsCapture.mock.calls)).not.toContain("user-1");
  });

  it("returns 409 when already seeded (SampleDataConflictError)", async () => {
    const { seedSampleData, SampleDataConflictError } = await import("./service");
    vi.mocked(seedSampleData).mockRejectedValueOnce(
      new SampleDataConflictError("Sample data already exists for this organization."),
    );

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Sample data already exists for this organization.");
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("returns 409 when real data is present (SampleDataConflictError)", async () => {
    const { seedSampleData, SampleDataConflictError } = await import("./service");
    vi.mocked(seedSampleData).mockRejectedValueOnce(
      new SampleDataConflictError("Real data is present; refusing to seed sample data."),
    );

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Real data is present; refusing to seed sample data.");
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
  });

  it("returns 500 and calls Sentry on unexpected error with operation tag only", async () => {
    const { seedSampleData } = await import("./service");
    const boom = new Error("db exploded");
    vi.mocked(seedSampleData).mockRejectedValueOnce(boom);

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(500);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(boom, "sample-data", {
      operation: "seed",
    });
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role (donors:view only — no manage)", async () => {
    const app = makeApp({ role: "viewer", permissions: { donors: "view" } });
    const res = await app.request("/sample-data", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for auditor role", async () => {
    const app = makeApp({ role: "auditor", permissions: { donors: "none" } });
    const res = await app.request("/sample-data", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("succeeds for plain editor role (donors:edit — no manage grant)", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 10 });

    const app = makeApp({ role: "editor", permissions: { donors: "edit" } });
    const res = await app.request("/sample-data", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("analytics transport failure is captured in Sentry without failing the seed response", async () => {
    const { seedSampleData } = await import("./service");
    const analyticsError = new Error("posthog down");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 5 });
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "sample-data",
      expect.objectContaining({ telemetry: "analytics_capture", operation: "seed" }),
    );
  });

  // ---- DB callback coverage ----

  it("alreadySeeded callback returns true when ledger count > 0", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const mockWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.alreadySeeded();
    expect(result).toBe(true);
  });

  it("alreadySeeded callback returns false when ledger count is 0", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const mockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.alreadySeeded();
    expect(result).toBe(false);
  });

  it("alreadySeeded callback returns false when query returns empty rows (nullish fallback)", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    // Empty rows — exercises the `?? 0` nullish-coalescing branch
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.alreadySeeded();
    expect(result).toBe(false);
  });

  it("hasRealData callback returns true when core tables have non-sample rows", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    // The sampleIds subquery builder call returns a non-promise value (drizzle subquery).
    // The three count queries in Promise.all each get { count: 1 } via mockResolvedValue.
    const mockWhere = vi.fn().mockImplementation(() => {
      // Return a thenable for Promise.all count queries; subquery call just needs a value.
      return Promise.resolve([{ count: 1 }]);
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.hasRealData();
    expect(result).toBe(true);
  });

  it("hasRealData callback returns true when only grants table has non-sample rows", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const mockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();

    // Directly invoke hasRealData with a fresh db-like mock that returns
    // contacts=0, grants=1, funders=0 for the three Promise.all queries.
    // The sampleIds subquery builder also calls .where(); we use
    // a sequence mock that returns 0 for that call and count:0/1/0 for the rest.
    const results = [[{ count: 0 }], [{ count: 0 }], [{ count: 1 }], [{ count: 0 }]];
    let idx = 0;
    const seqWhere = vi.fn().mockImplementation(() => Promise.resolve(results[idx++]));
    const seqFrom = vi.fn().mockReturnValue({ where: seqWhere });
    const seqSelect = vi.fn().mockReturnValue({ from: seqFrom });

    // Patch the capturedDeps closure db reference isn't directly accessible,
    // so test via a modified db mock in a fresh app invocation.
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });
    const app2 = makeAppWithDb({ select: seqSelect });
    await app2.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.hasRealData();
    expect(result).toBe(true); // grants=1 makes it true
  });

  it("hasRealData callback returns true when only funders table has non-sample rows", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    // contacts=0, grants=0, funders=1 — exercises the last OR branch (line 148)
    const results = [[{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [{ count: 1 }]];
    let idx = 0;
    const seqWhere = vi.fn().mockImplementation(() => Promise.resolve(results[idx++]));
    const seqFrom = vi.fn().mockReturnValue({ where: seqWhere });
    const seqSelect = vi.fn().mockReturnValue({ from: seqFrom });

    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const app = makeAppWithDb({ select: seqSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.hasRealData();
    expect(result).toBe(true); // funders=1 makes it true
  });

  it("lockOrg callback issues a transaction-scoped advisory lock on the tx handle", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const app = makeAppWithDb({ select: vi.fn() });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const txExecute = vi.fn().mockResolvedValue(undefined);
    await capturedDeps!.lockOrg!({ execute: txExecute } as never);
    expect(txExecute).toHaveBeenCalledTimes(1);
  });

  it("recheckSeeded callback returns true when the in-tx ledger count > 0", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const app = makeAppWithDb({ select: vi.fn() });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const txWhere = vi.fn().mockResolvedValue([{ count: 3 }]);
    const txFrom = vi.fn().mockReturnValue({ where: txWhere });
    const txSelect = vi.fn().mockReturnValue({ from: txFrom });
    const result = await capturedDeps!.recheckSeeded!({ select: txSelect } as never);
    expect(result).toBe(true);
  });

  it("recheckSeeded callback returns false when the in-tx ledger is empty (nullish fallback)", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const app = makeAppWithDb({ select: vi.fn() });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    // Empty rows — exercises the `?? 0` nullish-coalescing branch
    const txWhere = vi.fn().mockResolvedValue([]);
    const txFrom = vi.fn().mockReturnValue({ where: txWhere });
    const txSelect = vi.fn().mockReturnValue({ from: txFrom });
    const result = await capturedDeps!.recheckSeeded!({ select: txSelect } as never);
    expect(result).toBe(false);
  });

  it("hasRealData callback returns false when all core tables have only sample rows", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    const mockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.hasRealData();
    expect(result).toBe(false);
  });

  it("hasRealData callback returns false when all queries return empty rows (nullish fallback branches)", async () => {
    const { seedSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof seedSampleData>[1] | undefined;
    vi.mocked(seedSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { seeded: true as const, recordCount: 0 };
    });

    // All queries return empty arrays — exercises the ?. undefined branches on lines 146-148
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "POST" });

    expect(capturedDeps).toBeDefined();
    const result = await capturedDeps!.hasRealData();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DELETE /sample-data (clear)
// ---------------------------------------------------------------------------

describe("DELETE /sample-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 200 with cleared result and fires PostHog event on success", async () => {
    const { clearSampleData } = await import("./service");
    vi.mocked(clearSampleData).mockResolvedValueOnce({ cleared: true, recordCount: 30 });

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ cleared: true, recordCount: 30 });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.sampleDataCleared,
      payload: {
        surface: "api",
        record_count_bucket: expect.any(String) as string,
      },
    });
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("returns 200 with cleared:false when ledger is empty (fires cleared event with 0)", async () => {
    const { clearSampleData } = await import("./service");
    vi.mocked(clearSampleData).mockResolvedValueOnce({ cleared: false, recordCount: 0 });

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ cleared: false, recordCount: 0 });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.sampleDataCleared }),
    );
  });

  it("returns 500 and calls Sentry on unexpected error with operation tag only", async () => {
    const { clearSampleData } = await import("./service");
    const boom = new Error("delete failed");
    vi.mocked(clearSampleData).mockRejectedValueOnce(boom);

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "DELETE" });

    expect(res.status).toBe(500);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(boom, "sample-data", {
      operation: "clear",
    });
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
  });

  it("succeeds for plain editor role (donors:edit — no manage grant)", async () => {
    const { clearSampleData } = await import("./service");
    vi.mocked(clearSampleData).mockResolvedValueOnce({ cleared: true, recordCount: 5 });

    const app = makeApp({ role: "editor", permissions: { donors: "edit" } });
    const res = await app.request("/sample-data", { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for viewer role (donors:view — below edit)", async () => {
    const app = makeApp({ role: "viewer", permissions: { donors: "view" } });
    const res = await app.request("/sample-data", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for auditor role (donors:none)", async () => {
    const app = makeApp({ role: "auditor", permissions: { donors: "none" } });
    const res = await app.request("/sample-data", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("analytics transport failure on clear is captured in Sentry without failing response", async () => {
    const { clearSampleData } = await import("./service");
    const analyticsError = new Error("posthog down");
    vi.mocked(clearSampleData).mockResolvedValueOnce({ cleared: true, recordCount: 5 });
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);

    const app = makeApp();
    const res = await app.request("/sample-data", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "sample-data",
      expect.objectContaining({ telemetry: "analytics_capture", operation: "clear" }),
    );
  });

  it("ledgerByTable callback groups entityIds by entityTable", async () => {
    const { clearSampleData } = await import("./service");

    let capturedDeps: Parameters<typeof clearSampleData>[1] | undefined;
    vi.mocked(clearSampleData).mockImplementationOnce(async (_db, deps) => {
      capturedDeps = deps;
      return { cleared: true, recordCount: 2 };
    });

    const mockWhere = vi.fn().mockResolvedValue([
      { entityTable: "contacts", entityId: "c-1" },
      { entityTable: "contacts", entityId: "c-2" },
      { entityTable: "grants", entityId: "g-1" },
    ]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb({ select: mockSelect });
    await app.request("/sample-data", { method: "DELETE" });

    expect(capturedDeps).toBeDefined();
    const grouped = await capturedDeps!.ledgerByTable();
    expect(grouped).toEqual({
      contacts: ["c-1", "c-2"],
      grants: ["g-1"],
    });
  });
});

// ---------------------------------------------------------------------------
// GET /sample-data/status
// ---------------------------------------------------------------------------

describe("GET /sample-data/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns seeded:true with recordCount when data exists", async () => {
    const { getSampleDataStatus } = await import("./service");
    vi.mocked(getSampleDataStatus).mockResolvedValueOnce({ seeded: true, recordCount: 20 });

    const app = makeApp();
    const res = await app.request("/sample-data/status");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ seeded: true, recordCount: 20 });
  });

  it("returns seeded:false with recordCount 0 when no data", async () => {
    const { getSampleDataStatus } = await import("./service");
    vi.mocked(getSampleDataStatus).mockResolvedValueOnce({ seeded: false, recordCount: 0 });

    const app = makeApp();
    const res = await app.request("/sample-data/status");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ seeded: false, recordCount: 0 });
  });

  it("returns 500 and calls Sentry on error with operation tag only (no redundant feature key)", async () => {
    const { getSampleDataStatus } = await import("./service");
    const boom = new Error("count failed");
    vi.mocked(getSampleDataStatus).mockRejectedValueOnce(boom);

    const app = makeApp();
    const res = await app.request("/sample-data/status");

    expect(res.status).toBe(500);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(boom, "sample-data", {
      operation: "status",
    });
  });

  it("returns 200 for auditor role (status is accessible to every authenticated role)", async () => {
    const { getSampleDataStatus } = await import("./service");
    vi.mocked(getSampleDataStatus).mockResolvedValueOnce({ seeded: false, recordCount: 0 });

    const app = makeApp({ role: "auditor", permissions: { donors: "none" } });
    const res = await app.request("/sample-data/status");
    expect(res.status).toBe(200);
  });

  it("returns 200 for viewer role", async () => {
    const { getSampleDataStatus } = await import("./service");
    vi.mocked(getSampleDataStatus).mockResolvedValueOnce({ seeded: false, recordCount: 0 });

    const app = makeApp({ role: "viewer", permissions: { donors: "view" } });
    const res = await app.request("/sample-data/status");
    expect(res.status).toBe(200);
  });

  it("countLedger callback returns count from sampleDataRecords", async () => {
    const { getSampleDataStatus } = await import("./service");

    let capturedDeps: Parameters<typeof getSampleDataStatus>[0] | undefined;
    vi.mocked(getSampleDataStatus).mockImplementationOnce(async (deps) => {
      capturedDeps = deps;
      return { seeded: true, recordCount: 5 };
    });

    const mockWhere = vi.fn().mockResolvedValue([{ count: 5 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb(
      { select: mockSelect },
      { role: "viewer", permissions: { donors: "view" } },
    );
    await app.request("/sample-data/status");

    expect(capturedDeps).toBeDefined();
    const count = await capturedDeps!.countLedger();
    expect(count).toBe(5);
  });

  it("countLedger callback returns 0 when query returns empty rows", async () => {
    const { getSampleDataStatus } = await import("./service");

    let capturedDeps: Parameters<typeof getSampleDataStatus>[0] | undefined;
    vi.mocked(getSampleDataStatus).mockImplementationOnce(async (deps) => {
      capturedDeps = deps;
      return { seeded: false, recordCount: 0 };
    });

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const app = makeAppWithDb(
      { select: mockSelect },
      { role: "viewer", permissions: { donors: "view" } },
    );
    await app.request("/sample-data/status");

    expect(capturedDeps).toBeDefined();
    const count = await capturedDeps!.countLedger();
    expect(count).toBe(0);
  });
});

describe("countBucket branches (coverage via POST seed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("buckets 0 records into '0' bucket", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 0 });

    const app = makeApp();
    await app.request("/sample-data", { method: "POST" });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ record_count_bucket: "0" }) as Record<string, unknown>,
      }),
    );
  });

  it("buckets 26-100 records into '26_100' bucket", async () => {
    const { seedSampleData } = await import("./service");
    vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 50 });

    const app = makeApp();
    await app.request("/sample-data", { method: "POST" });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ record_count_bucket: "26_100" }) as Record<
          string,
          unknown
        >,
      }),
    );
  });
});
