import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { allocationRoutes } from "./routes";
import type { AppEnv } from "../../types";

// ---------------------------------------------------------------------------
// Mock analytics capture
// ---------------------------------------------------------------------------

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn().mockResolvedValue({ id: "analytics-1" }),
}));

// ---------------------------------------------------------------------------
// Mock service layer
// ---------------------------------------------------------------------------

vi.mock("./service", () => ({
  listAllocationBases: vi.fn(),
  getAllocationBase: vi.fn(),
  createAllocationBase: vi.fn(),
  updateAllocationBase: vi.fn(),
  softDeleteAllocationBase: vi.fn(),
  getAllocationTargets: vi.fn(),
  setAllocationTargets: vi.fn(),
  listAllocationRules: vi.fn(),
  createAllocationRule: vi.fn(),
  updateAllocationRule: vi.fn(),
  softDeleteAllocationRule: vi.fn(),
  getAllocatedStatementOfFunctionalExpenses: vi.fn(),
}));

vi.mock("../../lib/effective-plan-tier", () => ({
  getContextEffectivePlanTier: vi.fn().mockReturnValue("growth"),
  recordContextTrialFeatureUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockCaptureAnalytics },
  })),
}));

import {
  listAllocationBases,
  getAllocationBase,
  createAllocationBase,
  updateAllocationBase,
  softDeleteAllocationBase,
  getAllocationTargets,
  setAllocationTargets,
  listAllocationRules,
  createAllocationRule,
  updateAllocationRule,
  softDeleteAllocationRule,
  getAllocatedStatementOfFunctionalExpenses,
} from "./service";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

import type { PermissionMap } from "@grantpipe/shared";

// Per-role default permissions mirroring the shared package definitions
const ROLE_PERMISSIONS: Record<string, PermissionMap> = {
  admin: {
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
  },
  editor: {
    donors: "edit",
    grants: "edit",
    funds: "edit",
    events: "edit",
    documents: "edit",
    compliance: "edit",
    programs: "edit",
    accounting: "edit",
    import: "edit",
    reports: "edit",
    payments: "edit",
    settings: "view",
    billing: "none",
    team: "none",
  },
  viewer: {
    donors: "view",
    grants: "view",
    funds: "view",
    events: "view",
    documents: "view",
    compliance: "view",
    programs: "view",
    accounting: "view",
    import: "none",
    reports: "view",
    payments: "view",
    settings: "view",
    billing: "none",
    team: "none",
  },
  auditor: {
    donors: "none",
    grants: "view",
    funds: "view",
    events: "none",
    documents: "view",
    compliance: "view",
    programs: "none",
    accounting: "view",
    import: "none",
    reports: "view",
    payments: "none",
    settings: "none",
    billing: "none",
    team: "none",
  },
};

function makeApp(
  overrides: {
    permissions?: Record<string, string>;
    role?: string;
    planTier?: string;
  } = {},
) {
  const { permissions = {}, role = "admin", planTier = "growth" } = overrides;

  vi.mocked(getContextEffectivePlanTier).mockReturnValue(planTier as "growth");

  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("memberRole", role as "admin");
    c.set("memberPermissions", {
      ...(ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS["admin"]!),
      ...permissions,
    });
    c.set("orgSubscription", {
      planTier,
      subscriptionStatus: "active",
      trialEndsAt: null,
      onboardingCompleted: true,
      planSelectedAt: new Date(),
      stripeSubscriptionId: "sub-1",
      effectivePlanTier: planTier,
    });
    c.set("db", {} as never);
    c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
    c.set("session", { id: "sess-1", userId: "user-1" });
    await next();
  });

  app.route("/allocation", allocationRoutes);
  return app;
}

const BASE = {
  id: "base-1",
  orgId: "org-1",
  name: "Headcount",
  description: null,
  method: "headcount_fte",
  status: "active",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const TARGET = {
  id: "target-1",
  orgId: "org-1",
  baseId: "base-1",
  functionalClass: "program",
  programId: null,
  label: null,
  weightBasisPoints: 10000,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const RULE = {
  id: "rule-1",
  orgId: "org-1",
  accountId: "acc-1",
  baseId: "base-1",
  status: "active",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const SFE_RESULT = {
  rows: [],
  totals: { program: 0, management: 0, fundraising: 0, total: 0 },
  programBreakdown: [],
};

// ---------------------------------------------------------------------------
// Entitlement gate tests
// ---------------------------------------------------------------------------

describe("entitlement gate — starter plan returns 403", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /allocation/bases returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("insufficient_plan");
  });

  it("GET /allocation/bases/:id returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases/base-1");
    expect(res.status).toBe(403);
  });

  it("POST /allocation/bases returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", method: "headcount_fte" }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /allocation/bases/:id returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases/base-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /allocation/bases/:id returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases/base-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("GET /allocation/bases/:id/targets returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases/base-1/targets");
    expect(res.status).toBe(403);
  });

  it("PUT /allocation/bases/:id/targets returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: [{ functionalClass: "program", weightBasisPoints: 10000 }] }),
    });
    expect(res.status).toBe(403);
  });

  it("GET /allocation/rules returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/rules");
    expect(res.status).toBe(403);
  });

  it("POST /allocation/rules returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", baseId: "base-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /allocation/rules/:id returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/rules/rule-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /allocation/rules/:id returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request("/allocation/rules/rule-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("GET /allocation/functional-expenses returns 403 on starter plan", async () => {
    const app = makeApp({ planTier: "starter" });
    const res = await app.request(
      "/allocation/functional-expenses?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z",
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Permission gate tests
// ---------------------------------------------------------------------------

describe("permission gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /allocation/bases returns 403 when viewer role (accounting:view, not manage)", async () => {
    // viewer role has accounting:view but not manage; write endpoints require manage
    const app = makeApp({ role: "viewer" });
    vi.mocked(createAllocationBase).mockResolvedValue(BASE as never);
    const res = await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", method: "headcount_fte" }),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /allocation/bases/:id returns 403 when viewer role (accounting:view, not manage)", async () => {
    const app = makeApp({ role: "viewer" });
    const res = await app.request("/allocation/bases/base-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("PUT /allocation/bases/:id/targets returns 403 when viewer role", async () => {
    const app = makeApp({ role: "viewer" });
    const res = await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: [{ functionalClass: "program", weightBasisPoints: 10000 }] }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /allocation/rules returns 403 when viewer role", async () => {
    const app = makeApp({ role: "viewer" });
    const res = await app.request("/allocation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", baseId: "base-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /allocation/rules/:id returns 403 when viewer role", async () => {
    const app = makeApp({ role: "viewer" });
    const res = await app.request("/allocation/rules/rule-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /bases
// ---------------------------------------------------------------------------

describe("GET /allocation/bases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and list of bases", async () => {
    vi.mocked(listAllocationBases).mockResolvedValue([BASE] as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /bases/:id
// ---------------------------------------------------------------------------

describe("GET /allocation/bases/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and a single base", async () => {
    vi.mocked(getAllocationBase).mockResolvedValue(BASE as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1");
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /bases
// ---------------------------------------------------------------------------

describe("POST /allocation/bases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 and created base", async () => {
    vi.mocked(createAllocationBase).mockResolvedValue(BASE as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Headcount", method: "headcount_fte" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 when body is invalid", async () => {
    const app = makeApp();
    const res = await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }), // missing method, empty name
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /bases/:id
// ---------------------------------------------------------------------------

describe("PATCH /allocation/bases/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and updated base", async () => {
    vi.mocked(updateAllocationBase).mockResolvedValue({ ...BASE, name: "Updated" } as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /bases/:id
// ---------------------------------------------------------------------------

describe("DELETE /allocation/bases/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 success", async () => {
    vi.mocked(softDeleteAllocationBase).mockResolvedValue(undefined);
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /bases/:id/targets
// ---------------------------------------------------------------------------

describe("GET /allocation/bases/:id/targets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and targets", async () => {
    vi.mocked(getAllocationTargets).mockResolvedValue([TARGET] as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1/targets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PUT /bases/:id/targets
// ---------------------------------------------------------------------------

describe("PUT /allocation/bases/:id/targets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and new targets", async () => {
    vi.mocked(setAllocationTargets).mockResolvedValue([TARGET] as never);
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: [{ functionalClass: "program", weightBasisPoints: 10000 }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when weights do not total 10000", async () => {
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: [{ functionalClass: "program", weightBasisPoints: 5000 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when non-program target has programId", async () => {
    const app = makeApp();
    const res = await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: [{ functionalClass: "management", programId: "prog-1", weightBasisPoints: 10000 }],
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /rules
// ---------------------------------------------------------------------------

describe("GET /allocation/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and list of rules", async () => {
    vi.mocked(listAllocationRules).mockResolvedValue([RULE] as never);
    const app = makeApp();
    const res = await app.request("/allocation/rules");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /rules
// ---------------------------------------------------------------------------

describe("POST /allocation/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 and created rule", async () => {
    vi.mocked(createAllocationRule).mockResolvedValue(RULE as never);
    const app = makeApp();
    const res = await app.request("/allocation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", baseId: "base-1" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 when body is invalid", async () => {
    const app = makeApp();
    const res = await app.request("/allocation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // missing required fields
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /rules/:id
// ---------------------------------------------------------------------------

describe("PATCH /allocation/rules/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and updated rule", async () => {
    vi.mocked(updateAllocationRule).mockResolvedValue({ ...RULE, status: "inactive" } as never);
    const app = makeApp();
    const res = await app.request("/allocation/rules/rule-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /rules/:id
// ---------------------------------------------------------------------------

describe("DELETE /allocation/rules/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 success", async () => {
    vi.mocked(softDeleteAllocationRule).mockResolvedValue(undefined);
    const app = makeApp();
    const res = await app.request("/allocation/rules/rule-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /functional-expenses
// ---------------------------------------------------------------------------

describe("GET /allocation/functional-expenses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with allocated SFE result", async () => {
    vi.mocked(getAllocatedStatementOfFunctionalExpenses).mockResolvedValue(SFE_RESULT as never);
    const app = makeApp();
    const res = await app.request(
      "/allocation/functional-expenses?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof SFE_RESULT;
    expect(body.rows).toEqual([]);
    expect(body.programBreakdown).toEqual([]);
  });

  it("returns 400 when from/to are missing", async () => {
    const app = makeApp();
    const res = await app.request("/allocation/functional-expenses");
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is after to", async () => {
    const app = makeApp();
    const res = await app.request(
      "/allocation/functional-expenses?from=2024-12-31T00:00:00Z&to=2024-01-01T00:00:00Z",
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Analytics capture assertions
// ---------------------------------------------------------------------------

describe("analytics capture on successful mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("captures allocationBaseCreated with entity_type and base_id on POST /bases", async () => {
    vi.mocked(createAllocationBase).mockResolvedValue(BASE as never);
    const app = makeApp();
    await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Headcount", method: "headcount_fte" }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationBaseCreated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_base",
          base_id: BASE.id,
        }),
      }),
    );
  });

  it("captures allocationBaseUpdated with entity_type and base_id on PATCH /bases/:id", async () => {
    vi.mocked(updateAllocationBase).mockResolvedValue(BASE as never);
    const app = makeApp();
    await app.request("/allocation/bases/base-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationBaseUpdated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_base",
          base_id: "base-1",
        }),
      }),
    );
  });

  it("captures allocationBaseDeleted with entity_type and base_id on DELETE /bases/:id", async () => {
    vi.mocked(softDeleteAllocationBase).mockResolvedValue(undefined);
    const app = makeApp();
    await app.request("/allocation/bases/base-1", { method: "DELETE" });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationBaseDeleted,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_base",
          base_id: "base-1",
        }),
      }),
    );
  });

  it("captures allocationTargetsSet with target_count on PUT /bases/:id/targets", async () => {
    vi.mocked(setAllocationTargets).mockResolvedValue([TARGET] as never);
    const app = makeApp();
    const targets = [
      { functionalClass: "program", weightBasisPoints: 5000 },
      { functionalClass: "management", weightBasisPoints: 5000 },
    ];
    await app.request("/allocation/bases/base-1/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationTargetsSet,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_base",
          base_id: "base-1",
          target_count: 2,
        }),
      }),
    );
  });

  it("captures allocationRuleCreated with entity_type and rule_id on POST /rules", async () => {
    vi.mocked(createAllocationRule).mockResolvedValue(RULE as never);
    const app = makeApp();
    await app.request("/allocation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", baseId: "base-1" }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationRuleCreated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_rule",
          rule_id: RULE.id,
        }),
      }),
    );
  });

  it("captures allocationRuleUpdated with entity_type and rule_id on PATCH /rules/:id", async () => {
    vi.mocked(updateAllocationRule).mockResolvedValue(RULE as never);
    const app = makeApp();
    await app.request("/allocation/rules/rule-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationRuleUpdated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_rule",
          rule_id: "rule-1",
        }),
      }),
    );
  });

  it("captures allocationRuleDeleted with entity_type and rule_id on DELETE /rules/:id", async () => {
    vi.mocked(softDeleteAllocationRule).mockResolvedValue(undefined);
    const app = makeApp();
    await app.request("/allocation/rules/rule-1", { method: "DELETE" });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.allocationRuleDeleted,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "allocation_rule",
          rule_id: "rule-1",
        }),
      }),
    );
  });

  it("does NOT capture analytics on read-only endpoints", async () => {
    vi.mocked(listAllocationBases).mockResolvedValue([BASE] as never);
    vi.mocked(getAllocatedStatementOfFunctionalExpenses).mockResolvedValue(SFE_RESULT as never);
    const app = makeApp();

    await app.request("/allocation/bases");
    await app.request(
      "/allocation/functional-expenses?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z",
    );

    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("never captures names or free-form text in analytics payloads", async () => {
    vi.mocked(createAllocationBase).mockResolvedValue({ ...BASE, name: "Private Name" } as never);
    vi.mocked(updateAllocationBase).mockResolvedValue({
      ...BASE,
      name: "Another Private Name",
    } as never);
    const app = makeApp();

    await app.request("/allocation/bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Private Name", method: "headcount_fte" }),
    });
    await app.request("/allocation/bases/base-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Another Private Name" }),
    });

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("Private Name");
    expect(serializedCalls).not.toContain("Another Private Name");
  });
});
