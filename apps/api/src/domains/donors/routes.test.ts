// apps/api/src/domains/donors/routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { donorRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock all service modules
// ---------------------------------------------------------------------------

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
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

vi.mock("./mail-merge.service", () => ({
  sendDonorMailMerge: vi.fn(),
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

vi.mock("./lapse.service", () => ({
  getAtRiskDonors: vi.fn(),
}));

vi.mock("./classification.service", () => ({
  resolveAndClassifyRestriction: vi.fn(),
}));

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return { ...actual };
});

import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  updatePipelineStage,
  exportContactsCsv,
} from "./contact.service";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addContactTags,
  removeContactTag,
} from "./tag.service";
import { listDonations, createDonation, updateDonation, deleteDonation } from "./donation.service";
import { listCommunications, createCommunication } from "./communication.service";
import { sendDonorMailMerge } from "./mail-merge.service";
import { listSegments, createSegment, updateSegment, deleteSegment } from "./segment.service";
import { getDonorStats, getRetentionStats, getPipelineGroups } from "./stats.service";
import { getAtRiskDonors } from "./lapse.service";
import { resolveAndClassifyRestriction } from "./classification.service";
import * as shared from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function buildSelectChain(countValue: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ value: countValue }]),
  };
  return vi.fn().mockReturnValue(chain);
}

function buildDefaultDb(contactCountValue = 2) {
  return {
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ fiscalYearStartMonth: 1 }),
      },
    },
    select: buildSelectChain(contactCountValue),
  };
}

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  db: unknown = buildDefaultDb() as never,
  permissions: Partial<PermissionMap> | null = null,
  orgSubscription: unknown = {
    planTier: "growth",
    subscriptionStatus: "active",
    trialEndsAt: null,
  },
) {
  return new Hono<AppEnv>()
    .use("/donors/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", orgSubscription as never);
      await next();
    })
    .route("/donors", donorRoutes);
}

// ---------------------------------------------------------------------------
// GET /donors (list contacts)
// ---------------------------------------------------------------------------

describe("GET /donors", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with paginated contacts", async () => {
    vi.mocked(listContacts).mockResolvedValue({
      data: [{ id: "c-1" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("viewer");
    const res = await app.request("/donors?page=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("does not query org row on a plain contact list request", async () => {
    vi.mocked(listContacts).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const db = {
      query: {
        organizations: {
          findFirst: vi.fn(),
        },
      },
    };

    const app = buildApp("viewer", db);
    const res = await app.request("/donors?page=1");

    expect(res.status).toBe(200);
    expect(db.query.organizations.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /donors/:contactId (get contact detail)
// ---------------------------------------------------------------------------

describe("GET /donors/:contactId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with contact, stats, and tags", async () => {
    vi.mocked(getContact).mockResolvedValue({
      contact: { id: "c-1", firstName: "Jane" } as never,
      givingStats: {
        totalLifetimeGiving: 5000,
        donationCount: 2,
        firstGiftDate: null,
        lastGiftDate: null,
        averageGiftAmount: 2500,
        totalThisFY: 0,
        totalLastFY: 0,
      },
      tags: [],
      affiliatedOrg: null,
    });

    const app = buildApp();
    const res = await app.request("/donors/c-1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      contact: { id: string };
      givingStats: { totalLifetimeGiving: number };
    };
    expect(body.contact.id).toBe("c-1");
    expect(body.givingStats.totalLifetimeGiving).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// POST /donors (create contact)
// ---------------------------------------------------------------------------

describe("POST /donors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns 201 when editor creates a contact", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "c-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(201);
  });

  it("captures contact_created with privacy-safe metadata", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "c-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "individual",
        firstName: "Jane",
        lastName: "Sensitive",
        email: "jane@example.org",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.contactCreated,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        contact_type: "individual",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("jane@example.org");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Sensitive");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("c-new");
  });

  it("returns 403 when viewer tries to create", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(403);
    expect(createContact).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid" }),
    });

    expect(res.status).toBe(400);
  });

  it("emits first_contact_created when this is the org's first contact", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "c-first" } as never);
    const db = buildDefaultDb(1);
    const app = buildApp("editor", db);

    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstContactCreated }),
    );
  });

  it("does NOT emit first_contact_created when the org already has contacts", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "c-second" } as never);
    const db = buildDefaultDb(2);
    const app = buildApp("editor", db);

    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(201);
    const firstEvents = vi
      .mocked(mockCaptureAnalytics)
      .mock.calls.filter(([args]) => args.eventName === ANALYTICS_EVENTS.firstContactCreated);
    expect(firstEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /donors/:contactId (admin only)
// ---------------------------------------------------------------------------

describe("DELETE /donors/:contactId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 when editor tries to delete", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/c-1", { method: "DELETE" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tags routes
// ---------------------------------------------------------------------------

describe("GET /donors/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with tags", async () => {
    vi.mocked(listTags).mockResolvedValue([{ id: "t-1", name: "VIP" }] as never);

    const app = buildApp();
    const res = await app.request("/donors/tags");

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

describe("POST /donors/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 201 when editor creates a tag", async () => {
    vi.mocked(createTag).mockResolvedValue({ id: "t-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Major Donor" }),
    });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Contact tags
// ---------------------------------------------------------------------------

describe("POST /donors/:contactId/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when adding tags to a contact", async () => {
    vi.mocked(addContactTags).mockResolvedValue(undefined);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tagIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      }),
    });

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Stats routes
// ---------------------------------------------------------------------------

describe("GET /donors/stats", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with aggregate stats", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 10,
      totalGivingThisFY: 50000,
      previousFiscalYearGivingCents: 42000,
      newDonorsThisFY: 3,
      retentionRate: 0.75,
    });

    const app = buildApp();
    const res = await app.request("/donors/stats");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalDonors: number };
    expect(body.totalDonors).toBe(10);
  });

  it("falls back to fiscal year month 1 when the org lookup returns no row", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 10,
      totalGivingThisFY: 50000,
      previousFiscalYearGivingCents: 42000,
      newDonorsThisFY: 3,
      retentionRate: 0.75,
    });

    const app = buildApp("viewer", {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    const res = await app.request("/donors/stats");

    expect(res.status).toBe(200);
    expect(getDonorStats).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
    });
  });
});

describe("GET /donors/stats/retention", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with retention trend", async () => {
    vi.mocked(getRetentionStats).mockResolvedValue([
      { fiscalYear: "FY2024", retentionRate: 0, donorCount: 5, retainedCount: 0 },
      { fiscalYear: "FY2025", retentionRate: 0.8, donorCount: 6, retainedCount: 4 },
    ]);

    const app = buildApp();
    const res = await app.request("/donors/stats/retention");

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
  });
});

describe("GET /donors/pipeline", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is not exposed as a standalone donor pipeline endpoint", async () => {
    const app = buildApp();
    const res = await app.request("/donors/pipeline");

    expect(res.status).toBe(404);
    expect(getPipelineGroups).not.toHaveBeenCalled();
  });
});

describe("GET /donors/lapse-risk", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns at-risk donors for Growth plans", async () => {
    vi.mocked(getAtRiskDonors).mockResolvedValue({
      donors: [{ id: "c-1", risk: { band: "lapsing" } }],
      totals: { lapsing: 1, atRisk: 0, lapsed: 0 },
    } as never);

    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=lapsing,at_risk&limit=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string;
      donors: unknown[];
      totals: Record<string, number>;
    };
    expect(body.asOf).toMatch(/T/);
    expect(body.donors).toHaveLength(1);
    expect(body.totals.lapsing).toBe(1);
    expect(getAtRiskDonors).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        bands: ["lapsing", "at_risk"],
        limit: 10,
      }),
    );
  });

  it("returns 400 for unsupported lapse-risk bands", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/lapse-risk?bands=none");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_band", value: "none" });
    expect(getAtRiskDonors).not.toHaveBeenCalled();
  });

  it("returns 200 for starter plan — lapse-risk now available on all plans", async () => {
    vi.mocked(getAtRiskDonors).mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });
    const app = buildApp("viewer", buildDefaultDb(), null, {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    const res = await app.request("/donors/lapse-risk");

    expect(res.status).toBe(200);
    expect(getAtRiskDonors).toHaveBeenCalled();
  });

  it("returns 402 when hasAutomationEmails guard is triggered (defense-in-depth branch)", async () => {
    // The guard is unreachable via any real PlanTier since all tiers now have
    // hasAutomationEmails = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "hasAutomationEmails").mockReturnValueOnce(false);
    const app = buildApp("viewer", buildDefaultDb(), null, {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    const res = await app.request("/donors/lapse-risk");

    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({
      error: "insufficient_plan",
    });
    expect(getAtRiskDonors).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// PATCH /donors/:contactId (update contact)
// ---------------------------------------------------------------------------

describe("PATCH /donors/:contactId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns 200 when editor updates a contact", async () => {
    vi.mocked(updateContact).mockResolvedValue({ id: "c-1", firstName: "Updated" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Updated" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { firstName: string };
    expect(body.firstName).toBe("Updated");
  });

  it("captures contact_updated with changed field keys only", async () => {
    vi.mocked(updateContact).mockResolvedValue({
      id: "c-1",
      firstName: "Updated",
    } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Updated", email: "updated@example.org" }),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.contactUpdated,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        changed_fields: ["firstName", "email"],
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("updated@example.org");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("c-1");
  });

  it("returns 403 when viewer tries to update", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/c-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Updated" }),
    });

    expect(res.status).toBe(403);
    expect(updateContact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /donors/:contactId (admin only) — success path
// ---------------------------------------------------------------------------

describe("DELETE /donors/:contactId success", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns 204 when admin deletes a contact", async () => {
    vi.mocked(deleteContact).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/donors/c-1", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(deleteContact).toHaveBeenCalled();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.contactDeleted,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("c-1");
  });
});

// ---------------------------------------------------------------------------
// PATCH /donors/:contactId/stage
// ---------------------------------------------------------------------------

describe("PATCH /donors/:contactId/stage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns 200 when editor updates pipeline stage", async () => {
    vi.mocked(updatePipelineStage).mockResolvedValue({
      id: "c-1",
      pipelineStage: "cultivation",
    } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/stage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "cultivation" }),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.donorStageChanged,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        stage: "cultivation",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Donation sub-routes
// ---------------------------------------------------------------------------

describe("GET /donors/:contactId/donations", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with donations list", async () => {
    vi.mocked(listDonations).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    } as never);

    const app = buildApp("viewer");
    const res = await app.request("/donors/c-1/donations?page=1");

    expect(res.status).toBe(200);
  });
});

describe("POST /donors/:contactId/donations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns 201 when editor creates a donation", async () => {
    vi.mocked(createDonation).mockResolvedValue({ id: "d-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 5000,
        date: "2026-05-01T00:00:00.000Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.donationRecorded,
      payload: {
        actorId: "user-1",
        entity_type: "donation",
        donation_type: "one_time",
        restriction: "unrestricted",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("d-new");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("c-1");
  });

  it("returns 403 when viewer tries to create a donation", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/c-1/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 5000,
        date: "2026-05-01T00:00:00.000Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /donors/:contactId/donations/:donationId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 when editor updates a donation", async () => {
    vi.mocked(updateDonation).mockResolvedValue({ id: "d-1", amountCents: 6000 } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/donations/d-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 6000 }),
    });

    expect(res.status).toBe(200);
  });
});

describe("DELETE /donors/:contactId/donations/:donationId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when admin deletes a donation", async () => {
    vi.mocked(deleteDonation).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/donors/c-1/donations/d-1", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(deleteDonation).toHaveBeenCalled();
  });

  it("returns 403 when editor tries to delete a donation", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/donations/d-1", { method: "DELETE" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /donors/:contactId/tags/:tagId
// ---------------------------------------------------------------------------

describe("DELETE /donors/:contactId/tags/:tagId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when an admin removes a tag from a contact", async () => {
    vi.mocked(removeContactTag).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/donors/c-1/tags/t-1", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(removeContactTag).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      tagId: "t-1",
    });
  });

  it("returns 403 when editor removes a tag from contact", async () => {
    vi.mocked(removeContactTag).mockResolvedValue(undefined);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/tags/t-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(removeContactTag).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Communication sub-routes
// ---------------------------------------------------------------------------

describe("GET /donors/:contactId/communications", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with communications list", async () => {
    vi.mocked(listCommunications).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    } as never);

    const app = buildApp("viewer");
    const res = await app.request("/donors/c-1/communications?page=1");

    expect(res.status).toBe(200);
  });
});

describe("POST /donors/:contactId/communications", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 201 when editor creates a communication log", async () => {
    vi.mocked(createCommunication).mockResolvedValue({ id: "comm-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", subject: "Thank you" }),
    });

    expect(res.status).toBe(201);
    expect(createCommunication).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        contactId: "c-1",
        loggedBy: "user-1",
        type: "email",
        subject: "Thank you",
      }),
    );
  });

  it("returns 403 when viewer tries to create a communication log", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/c-1/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", subject: "Thank you" }),
    });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tag management routes (PATCH/DELETE /donors/tags/:tagId)
// ---------------------------------------------------------------------------

describe("PATCH /donors/tags/:tagId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 when editor updates a tag", async () => {
    vi.mocked(updateTag).mockResolvedValue({ id: "t-1", name: "Updated" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/tags/t-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
  });
});

describe("DELETE /donors/tags/:tagId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when admin deletes a tag", async () => {
    vi.mocked(deleteTag).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/donors/tags/t-1", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(deleteTag).toHaveBeenCalled();
  });

  it("returns 403 when editor tries to delete a tag", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/tags/t-1", { method: "DELETE" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Segment routes
// ---------------------------------------------------------------------------

describe("GET /donors/segments", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with segments list", async () => {
    vi.mocked(listSegments).mockResolvedValue([] as never);

    const app = buildApp("viewer");
    const res = await app.request("/donors/segments");

    expect(res.status).toBe(200);
  });
});

describe("POST /donors/segments", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 201 when editor creates a segment", async () => {
    vi.mocked(createSegment).mockResolvedValue({ id: "seg-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Major Donors", filters: {} }),
    });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /donors/segments/:segmentId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 when editor updates a segment", async () => {
    vi.mocked(updateSegment).mockResolvedValue({ id: "seg-1", name: "Updated" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/segments/seg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
  });
});

describe("DELETE /donors/segments/:segmentId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when admin deletes a segment", async () => {
    vi.mocked(deleteSegment).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/donors/segments/seg-1", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(deleteSegment).toHaveBeenCalled();
  });

  it("returns 403 when editor tries to delete a segment", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/segments/seg-1", { method: "DELETE" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /donors/export
// ---------------------------------------------------------------------------

describe("GET /donors/export", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with csv content-type and disposition", async () => {
    vi.mocked(exportContactsCsv).mockResolvedValue(
      "Name,Email,Phone,Type,Pipeline Stage,Last Donation Date,Total Giving (USD)\nJane Doe,jane@example.com,,individual,prospect,,0.00",
    );

    const app = buildApp("viewer");
    const res = await app.request("/donors/export");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("contacts.csv");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const text = await res.text();
    expect(text).toContain("Name,Email");
    expect(exportContactsCsv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
  });

  it("passes filter params to exportContactsCsv", async () => {
    vi.mocked(exportContactsCsv).mockResolvedValue("Name,Email\n");

    const app = buildApp("viewer");
    await app.request("/donors/export?pipelineStage=donor&type=individual&search=Jane");

    expect(exportContactsCsv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        pipelineStage: "donor",
        type: "individual",
        search: "Jane",
      }),
    );
  });

  it("returns 403 when reports permission is removed", async () => {
    const app = buildApp("viewer", buildDefaultDb(), {
      donors: "view",
      reports: "none",
    });
    const res = await app.request("/donors/export");

    expect(res.status).toBe(403);
    expect(exportContactsCsv).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid pipelineStage", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/export?pipelineStage=invalid");
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /donors/mail-merge/send
// ---------------------------------------------------------------------------

describe("POST /donors/mail-merge/send", () => {
  beforeEach(() => vi.resetAllMocks());

  const payload = {
    attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    contactIds: ["11111111-1111-4111-8111-111111111111"],
    subject: "Hi {{firstName}}",
    body: "Thanks for your support.",
  };
  const contactId = "11111111-1111-4111-8111-111111111111";

  it("sends a donor mail merge for editors on Growth and above", async () => {
    vi.mocked(sendDonorMailMerge).mockResolvedValue({
      requested: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      recipients: [
        {
          contactId,
          email: "jane@example.org",
          name: "Jane Doe",
          status: "sent",
        },
      ],
    });

    const app = buildApp("editor");
    const res = await app.request(
      "/donors/mail-merge/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { RESEND_API_KEY: "resend-key" } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ requested: 1, sent: 1 });
    expect(sendDonorMailMerge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        resendApiKey: "resend-key",
        ...payload,
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.communicationLogged,
        payload: expect.objectContaining({
          communication_type: "email",
          recipient_count: 1,
        }),
      }),
    );
  });

  it("captures privacy-safe partial batch counts", async () => {
    vi.mocked(sendDonorMailMerge).mockResolvedValue({
      requested: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      recipients: [
        {
          contactId,
          email: "jane@example.org",
          name: "Jane Doe",
          status: "failed",
          error: "delivery_persistence_failed",
        },
      ],
    });
    const app = buildApp("editor");

    const res = await app.request(
      "/donors/mail-merge/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { RESEND_API_KEY: "resend-key" } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.communicationLogged,
        payload: expect.objectContaining({
          recipient_count: 0,
          skipped_count: 0,
          failed_count: 1,
        }),
      }),
    );
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("jane@example.org");
  });

  it("returns 503 when donor email delivery is not configured", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/mail-merge/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "email_delivery_not_configured" });
    expect(sendDonorMailMerge).not.toHaveBeenCalled();
  });

  it("returns 200 on Starter for batch donor email — automation emails now included in all plans", async () => {
    vi.mocked(sendDonorMailMerge).mockResolvedValue({
      requested: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      recipients: [{ contactId, email: "admin@example.org", name: "Admin", status: "sent" }],
    });
    const app = buildApp("admin", buildDefaultDb(), null, {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });

    const res = await app.request(
      "/donors/mail-merge/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { RESEND_API_KEY: "resend-key" } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(200);
    expect(sendDonorMailMerge).toHaveBeenCalled();
  });

  it("returns 402 when hasAutomationEmails guard is triggered (defense-in-depth branch)", async () => {
    // The guard is unreachable via any real PlanTier since all tiers now have
    // hasAutomationEmails = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "hasAutomationEmails").mockReturnValueOnce(false);
    const app = buildApp("admin", buildDefaultDb(), null, {
      planTier: "starter",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });

    const res = await app.request("/donors/mail-merge/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(402);
    expect(sendDonorMailMerge).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 403 when the user lacks donor edit permission", async () => {
    const app = buildApp("viewer", buildDefaultDb(), { donors: "view" });
    const res = await app.request("/donors/mail-merge/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(403);
    expect(sendDonorMailMerge).not.toHaveBeenCalled();
  });

  it("returns 400 for unsupported merge tokens", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/mail-merge/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, body: "Hello {{nickname}}" }),
    });

    expect(res.status).toBe(400);
    expect(sendDonorMailMerge).not.toHaveBeenCalled();
  });

  it("returns 400 for stale clients that omit the attempt id", async () => {
    const app = buildApp("editor");
    const stalePayload = {
      contactIds: payload.contactIds,
      subject: payload.subject,
      body: payload.body,
    };
    const res = await app.request(
      "/donors/mail-merge/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stalePayload),
      },
      { RESEND_API_KEY: "resend-key" } as AppEnv["Bindings"],
    );

    expect(res.status).toBe(400);
    expect(sendDonorMailMerge).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /donors/classify-restriction
// ---------------------------------------------------------------------------

describe("POST /donors/classify-restriction", () => {
  beforeEach(() => vi.resetAllMocks());

  const mockResult = {
    netAssetClass: "temporarily_restricted",
    donationRestriction: "restricted",
    restrictionType: "purpose",
    confidence: "high",
    signals: [{ source: "fund_type", detail: "Linked fund is temporarily restricted" }],
  };

  it("returns 200 with classification result", async () => {
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject(mockResult);
  });

  it("captures restrictionClassificationSuggested with privacy-safe payload on success", async () => {
    mockCaptureAnalytics.mockResolvedValue(undefined);
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.restrictionClassificationSuggested,
      payload: {
        actorId: "user-1",
        classification: "temporarily_restricted",
        source: "fund_type",
      },
    });
    // Ensure no sensitive fields leak into the analytics payload
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("550e8400");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("endowment");
  });

  it("passes orgId and body data to service", async () => {
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    const app = buildApp("viewer");
    await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: "550e8400-e29b-41d4-a716-446655440000",
        designation: "endowment",
      }),
    });
    expect(resolveAndClassifyRestriction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", designation: "endowment" }),
    );
  });

  it("returns 400 for invalid fundId (not a UUID)", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    expect(resolveAndClassifyRestriction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid grantId (not a UUID)", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when user lacks donors view permission", async () => {
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    // Use viewer role with override that drops donors to "none"
    const app = buildApp("viewer", buildDefaultDb(), { donors: "none" });
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    expect(resolveAndClassifyRestriction).not.toHaveBeenCalled();
  });

  it("scopes call to the request org (org-1)", async () => {
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    const app = buildApp("viewer");
    await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const [, params] = vi.mocked(resolveAndClassifyRestriction).mock.calls[0]!;
    expect(params.orgId).toBe("org-1");
  });

  it("works with no body fields (all optional)", async () => {
    vi.mocked(resolveAndClassifyRestriction).mockResolvedValue(mockResult as never);
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for designation over 1000 chars", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors/classify-restriction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designation: "x".repeat(1001) }),
    });
    expect(res.status).toBe(400);
  });
});
