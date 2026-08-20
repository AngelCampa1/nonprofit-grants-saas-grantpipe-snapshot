// apps/api/src/domains/donors/lapse.route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { donorRoutes } from "./routes";

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return { ...actual };
});

import * as shared from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Mock lapse service
// ---------------------------------------------------------------------------

const { mockGetAtRiskDonors } = vi.hoisted(() => ({
  mockGetAtRiskDonors: vi.fn(),
}));

vi.mock("./lapse.service", () => ({
  getAtRiskDonors: mockGetAtRiskDonors,
}));

// ---------------------------------------------------------------------------
// Stub all other service modules used by routes.ts
// ---------------------------------------------------------------------------

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: vi.fn() },
  })),
}));
vi.mock("./contact.service", () => ({
  listContacts: vi.fn(),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  updatePipelineStage: vi.fn(),
  exportContactsCsv: vi.fn(),
}));
vi.mock("./donation.service", () => ({
  listDonations: vi.fn(),
  createDonation: vi.fn(),
  updateDonation: vi.fn(),
  deleteDonation: vi.fn(),
}));
vi.mock("./tag.service", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  addContactTags: vi.fn(),
  removeContactTag: vi.fn(),
}));
vi.mock("./communication.service", () => ({
  listCommunications: vi.fn(),
  createCommunication: vi.fn(),
}));
vi.mock("./segment.service", () => ({
  listSegments: vi.fn(),
  createSegment: vi.fn(),
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
}));
vi.mock("./stats.service", () => ({
  getDonorStats: vi.fn(),
  getRetentionStats: vi.fn(),
  getPipelineGroups: vi.fn(),
}));
vi.mock("./classification.service", () => ({
  resolveAndClassifyRestriction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type OrgSub = NonNullable<AppEnv["Variables"]["orgSubscription"]>;

function buildApp(
  role: "admin" | "editor" | "viewer" = "viewer",
  orgSubscription: OrgSub | null = {
    planTier: "growth",
    subscriptionStatus: "active",
    trialEndsAt: null,
    effectivePlanTier: "growth",
    onboardingCompleted: true,
    stripeSubscriptionId: null,
    planSelectedAt: null,
  },
) {
  return new Hono<AppEnv>()
    .use("/donors/*", async (c, next) => {
      c.set("db", {
        query: {
          organizations: {
            findFirst: vi.fn().mockResolvedValue({ fiscalYearStartMonth: 1 }),
          },
        },
      } as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", null);
      c.set("orgSubscription", orgSubscription);
      await next();
    })
    .route("/donors", donorRoutes);
}

// ---------------------------------------------------------------------------
// GET /donors/lapse-risk
// ---------------------------------------------------------------------------

describe("GET /donors/lapse-risk", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 when role is insufficient (auditor blocked from donors)", async () => {
    // Auditor role does not have donor view permission; we'll test with a role
    // that lacks donors view. Here we test the role check more directly by
    // passing memberRole = null.
    const noRoleApp = new Hono<AppEnv>()
      .use("/donors/*", async (c, next) => {
        c.set("db", {} as never);
        c.set("orgId", "org-1");
        c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
        c.set("session", { id: "sess-1", userId: "user-1" });
        c.set("memberRole", null as never);
        c.set("memberPermissions", null);
        c.set("orgSubscription", null);
        await next();
      })
      .route("/donors", donorRoutes);

    const res = await noRoleApp.request("/donors/lapse-risk");
    expect(res.status).toBe(403);
  });

  it("returns 200 for starter plan (hasAutomationEmails is now true for all tiers)", async () => {
    const starterSub: OrgSub = {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
      effectivePlanTier: "starter",
      onboardingCompleted: true,
      stripeSubscriptionId: null,
      planSelectedAt: null,
    };
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("viewer", starterSub);
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(200);
  });

  it("returns 402 when hasAutomationEmails guard is triggered (defense-in-depth branch)", async () => {
    // The guard is unreachable via any real PlanTier since all tiers now have
    // hasAutomationEmails = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "hasAutomationEmails").mockReturnValueOnce(false);
    const starterSub: OrgSub = {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
      effectivePlanTier: "starter",
      onboardingCompleted: true,
      stripeSubscriptionId: null,
      planSelectedAt: null,
    };
    const app = buildApp("viewer", starterSub);
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("insufficient_plan");
    spy.mockRestore();
  });

  it("returns 200 with donors and totals for growth+ plan", async () => {
    const donors = [
      {
        contactId: "c-1",
        displayName: "Jane Smith",
        email: "j@example.com",
        band: "lapsed" as const,
        daysSinceLastGift: 600,
        typicalCadenceDays: 365,
        riskScore: 82,
        lifetimeGivingCents: 10000,
        lastGiftDate: new Date("2024-08-01"),
      },
      {
        contactId: "c-2",
        displayName: "Bob Jones",
        email: "b@example.com",
        band: "lapsing" as const,
        daysSinceLastGift: 50,
        typicalCadenceDays: 30,
        riskScore: 41,
        lifetimeGivingCents: 5000,
        lastGiftDate: new Date("2026-04-27"),
      },
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 1, at_risk: 0, lapsed: 1, total: 2 },
    });

    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      asOf: string;
      donors: typeof donors;
      totals: { lapsing: number; at_risk: number; lapsed: number; total: number };
    };

    expect(body.donors).toHaveLength(2);
    expect(body.totals.lapsed).toBe(1);
    expect(body.totals.lapsing).toBe(1);
    expect(body.totals.at_risk).toBe(0);
    expect(body.totals.total).toBe(2);
    expect(body.asOf).toBeDefined();
  });

  it("passes bands query param as array to service", async () => {
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=lapsed,lapsing");
    expect(res.status).toBe(200);
    expect(mockGetAtRiskDonors).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bands: ["lapsed", "lapsing"] }),
    );
  });

  it("passes limit query param to service (capped at 500)", async () => {
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?limit=10");
    expect(res.status).toBe(200);
    expect(mockGetAtRiskDonors).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("rejects limit over 500", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?limit=600");
    expect(res.status).toBe(400);
  });

  it("rejects invalid band values", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=bad_band");
    expect(res.status).toBe(400);
  });

  it("rejects bands=none with 400 (none is not an alert band)", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=none");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; value: string };
    expect(body.error).toBe("invalid_band");
    expect(body.value).toBe("none");
  });

  it("allows admin role", async () => {
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("admin");
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(200);
  });

  it("allows editor role", async () => {
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("editor");
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(200);
  });

  it("allows audit_ready plan tier", async () => {
    const auditSub: OrgSub = {
      planTier: "audit_ready",
      subscriptionStatus: "active",
      trialEndsAt: null,
      effectivePlanTier: "audit_ready",
      onboardingCompleted: true,
      stripeSubscriptionId: null,
      planSelectedAt: null,
    };
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("viewer", auditSub);
    const res = await app.request("/donors/lapse-risk");
    expect(res.status).toBe(200);
  });

  it("totals in response come from service result (not recomputed from filtered donors)", async () => {
    // Service returns 1 donor but totals show 5 total (reflects full population before filter)
    const oneDonor = [
      {
        contactId: "c-1",
        displayName: "Jane",
        email: "j@e.com",
        band: "lapsed" as const,
        daysSinceLastGift: 600,
        typicalCadenceDays: 365,
        riskScore: 82,
        lifetimeGivingCents: 10000,
        lastGiftDate: new Date("2024-08-01"),
      },
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors: oneDonor,
      totals: { lapsing: 2, at_risk: 2, lapsed: 1, total: 5 },
    });

    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=lapsed&limit=1");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      donors: unknown[];
      totals: { lapsing: number; at_risk: number; lapsed: number; total: number };
    };

    // Route passes service totals through unchanged (does NOT recompute from donors array)
    expect(body.donors).toHaveLength(1);
    expect(body.totals.total).toBe(5);
    expect(body.totals.lapsing).toBe(2);
    expect(body.totals.at_risk).toBe(2);
  });
});
