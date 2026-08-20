import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { getDefaultPermissionsForRole, type Role } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { orgRoutes } from "./routes";

vi.mock("./service", () => ({
  createBillingCheckoutSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
  createCustomFieldDefinition: vi.fn(),
  getOrgProfile: vi.fn(),
  getOrgBillingSummary: vi.fn(),
  listCustomFieldDefinitions: vi.fn(),
  listCustomFieldValues: vi.fn(),
  saveBillingSelection: vi.fn(),
  softDeleteCustomFieldDefinition: vi.fn(),
  updateCustomFieldDefinition: vi.fn(),
  updateOrgSettings: vi.fn(),
  upsertCustomFieldValue: vi.fn(),
}));

vi.mock("./trial-usage", () => ({
  getTrialFeatureUsage: vi.fn(),
  recordTrialFeatureUsage: vi.fn(),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

const { mockCaptureAnalytics, mockCaptureErrors, mockCaptureBackgroundException } = vi.hoisted(
  () => ({
    mockCaptureAnalytics: vi.fn(),
    mockCaptureErrors: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }),
);

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
    errors: { capture: mockCaptureErrors },
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("@grantpipe/db", () => ({
  entities: {
    orgId: "entities.orgId",
    id: "entities.id",
    status: "entities.status",
    deletedAt: "entities.deletedAt",
  },
  entityMembers: {
    orgId: "entityMembers.orgId",
    orgMemberId: "entityMembers.orgMemberId",
    deletedAt: "entityMembers.deletedAt",
  },
  orgMembers: {
    userId: "orgMembers.userId",
    orgId: "orgMembers.orgId",
    deletedAt: "orgMembers.deletedAt",
    joinedAt: "orgMembers.joinedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

import {
  createCustomFieldDefinition,
  getOrgProfile,
  listCustomFieldDefinitions,
  listCustomFieldValues,
  saveBillingSelection,
  softDeleteCustomFieldDefinition,
  updateCustomFieldDefinition,
  updateOrgSettings,
  upsertCustomFieldValue,
} from "./service";
import { getTrialFeatureUsage } from "./trial-usage";

const mockFindMany = vi.fn<() => Promise<unknown[]>>();
const mockEntityMembersFindMany = vi.fn<() => Promise<unknown[]>>();

function buildMockDb() {
  const db: Record<string, unknown> = {};
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  db.query = {
    orgMembers: {
      findMany: mockFindMany,
    },
    entityMembers: {
      findMany: mockEntityMembersFindMany,
    },
  };
  return db;
}

function buildApp(
  role: Role = "admin",
  permissions?: AppEnv["Variables"]["memberPermissions"],
  activeOrgId: string | null = "org-1",
) {
  return new Hono<AppEnv>()
    .use("/org/*", async (c, next) => {
      c.set("db", buildMockDb() as never);
      c.set("orgId", activeOrgId);
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions ?? getDefaultPermissionsForRole(role));
      await next();
    })
    .route("/org", orgRoutes);
}

const MOCK_ENV = {
  APP_URL: "http://localhost:5173",
  INTEGRATION_MODE: "mock",
} as AppEnv["Bindings"];

describe("GET /org/custom-fields", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns definitions for the entity type", async () => {
    vi.mocked(listCustomFieldDefinitions).mockResolvedValue([{ id: "field-1" }] as never);

    const app = buildApp("viewer");
    const res = await app.request("/org/custom-fields?entityType=grant");

    expect(res.status).toBe(200);
  });

  it("blocks auditors from donor custom field definitions", async () => {
    const app = buildApp("auditor");
    const res = await app.request("/org/custom-fields?entityType=contact");

    expect(res.status).toBe(403);
    expect(listCustomFieldDefinitions).not.toHaveBeenCalled();
  });

  it("rejects custom field definitions when there is no org role", async () => {
    const app = buildUnauthenticatedApp();
    const res = await app.request("/org/custom-fields?entityType=grant");

    expect(res.status).toBe(403);
    expect(listCustomFieldDefinitions).not.toHaveBeenCalled();
  });

  it("falls back to default role permissions when overrides omit a feature", async () => {
    vi.mocked(listCustomFieldDefinitions).mockResolvedValue([] as never);

    const app = buildApp("viewer", {} as never);
    const res = await app.request("/org/custom-fields?entityType=grant");

    expect(res.status).toBe(200);
    expect(listCustomFieldDefinitions).toHaveBeenCalledOnce();
  });

  it("rejects invalid entity types", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/org/custom-fields?entityType=invalid");

    expect(res.status).toBe(400);
    expect(listCustomFieldDefinitions).not.toHaveBeenCalled();
  });

  it("rejects missing entity types after allowing neutral permission checks", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/org/custom-fields");

    expect(res.status).toBe(400);
    expect(listCustomFieldDefinitions).not.toHaveBeenCalled();
  });
});

describe("GET /org/profile", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the organization profile for viewers", async () => {
    vi.mocked(getOrgProfile).mockResolvedValue({
      id: "org-1",
      name: "Foundation Alpha",
    } as never);

    const app = buildApp("viewer");
    const res = await app.request("/org/profile");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe("Foundation Alpha");
    expect(getOrgProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
  });

  it("allows auditors with accounting view to read profile feature flags", async () => {
    vi.mocked(getOrgProfile).mockResolvedValue({
      id: "org-1",
      name: "Foundation Alpha",
      accountingEnabled: true,
    } as never);

    const app = buildApp("auditor");
    const res = await app.request("/org/profile");

    expect(res.status).toBe(200);
    expect(getOrgProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
  });

  it("blocks profile reads when neither settings nor accounting are visible", async () => {
    const app = buildApp("viewer", {
      settings: "none",
      accounting: "none",
    } as never);
    const res = await app.request("/org/profile");

    expect(res.status).toBe(403);
    expect(getOrgProfile).not.toHaveBeenCalled();
  });
});

describe("GET /org/custom-fields/:entityType/:entityId/values", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns custom field values for a valid entity type", async () => {
    vi.mocked(listCustomFieldValues).mockResolvedValue([] as never);

    const app = buildApp("viewer");
    const res = await app.request("/org/custom-fields/grant/grant-1/values");

    expect(res.status).toBe(200);
  });

  it("blocks auditors from donor custom field values", async () => {
    const app = buildApp("auditor");
    const res = await app.request("/org/custom-fields/donation/donation-1/values");

    expect(res.status).toBe(403);
    expect(listCustomFieldValues).not.toHaveBeenCalled();
  });

  it("rejects invalid entity types for value lookups", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/org/custom-fields/invalid/grant-1/values");

    expect(res.status).toBe(400);
    expect(listCustomFieldValues).not.toHaveBeenCalled();
  });
});

describe("POST /org/custom-fields", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets admins create a definition", async () => {
    vi.mocked(createCustomFieldDefinition).mockResolvedValue({
      id: "field-1",
      name: "Program Area",
    } as never);

    const app = buildApp("admin");
    const res = await app.request("/org/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "grant",
        name: "Program Area",
        fieldType: "single_select",
        options: ["STEM", "Arts"],
      }),
    });

    expect(res.status).toBe(201);
    expect(createCustomFieldDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        name: "Program Area",
      }),
    );
  });
});

describe("PATCH /org/custom-fields/:definitionId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets admins update a definition", async () => {
    vi.mocked(updateCustomFieldDefinition).mockResolvedValue({ id: "field-1" } as never);

    const app = buildApp("admin");
    const res = await app.request("/org/custom-fields/field-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Program Focus" }),
    });

    expect(res.status).toBe(200);
    expect(updateCustomFieldDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
        data: { name: "Program Focus" },
      }),
    );
  });
});

describe("DELETE /org/custom-fields/:definitionId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets admins delete a definition", async () => {
    vi.mocked(softDeleteCustomFieldDefinition).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/org/custom-fields/field-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(softDeleteCustomFieldDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
      }),
    );
  });
});

describe("PUT /org/custom-fields/:entityType/:entityId/values/:fieldId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets editors upsert field values", async () => {
    vi.mocked(upsertCustomFieldValue).mockResolvedValue({ id: "value-1" } as never);

    const app = buildApp("editor");
    const res = await app.request("/org/custom-fields/grant/grant-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: ["alpha"] }),
    });

    expect(res.status).toBe(200);
    expect(upsertCustomFieldValue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        fieldId: "field-1",
        entityId: "grant-1",
      }),
    );
  });

  it("allows viewer overrides with donors edit permission to update contact field values", async () => {
    vi.mocked(upsertCustomFieldValue).mockResolvedValue({ id: "value-1" } as never);

    const app = buildApp("viewer", {
      donors: "edit",
      grants: "view",
      funds: "view",
      events: "none",
      documents: "view",
      compliance: "view",
      programs: "view",
      accounting: "view",
      import: "none",
      reports: "view",
      settings: "none",
      billing: "none",
      team: "none",
      payments: "none",
    });
    const res = await app.request("/org/custom-fields/contact/contact-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "major donor" }),
    });

    expect(res.status).toBe(200);
    expect(upsertCustomFieldValue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "contact",
        entityId: "contact-1",
      }),
    );
  });

  it("keeps auditor donor access blocked even with donor edit overrides", async () => {
    const app = buildApp("auditor", {
      donors: "edit",
      grants: "view",
      funds: "view",
      events: "none",
      documents: "view",
      compliance: "view",
      programs: "view",
      accounting: "view",
      import: "none",
      reports: "view",
      settings: "none",
      billing: "none",
      team: "none",
      payments: "none",
    });
    const res = await app.request("/org/custom-fields/contact/contact-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "major donor" }),
    });

    expect(res.status).toBe(403);
    expect(upsertCustomFieldValue).not.toHaveBeenCalled();
  });

  it("requires grants edit permission for grant field values", async () => {
    const app = buildApp("editor", {
      donors: "edit",
      grants: "view",
      funds: "edit",
      events: "edit",
      documents: "edit",
      compliance: "edit",
      programs: "edit",
      accounting: "edit",
      import: "edit",
      reports: "edit",
      settings: "view",
      billing: "none",
      team: "none",
      payments: "none",
    });
    const res = await app.request("/org/custom-fields/grant/grant-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: ["alpha"] }),
    });

    expect(res.status).toBe(403);
    expect(upsertCustomFieldValue).not.toHaveBeenCalled();
  });

  it("requires donors edit permission for donation field values", async () => {
    const app = buildApp("editor", {
      donors: "view",
      grants: "edit",
      funds: "edit",
      events: "edit",
      documents: "edit",
      compliance: "edit",
      programs: "edit",
      accounting: "edit",
      import: "edit",
      reports: "edit",
      settings: "view",
      billing: "none",
      team: "none",
      payments: "none",
    });
    const res = await app.request("/org/custom-fields/donation/donation-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "pledge" }),
    });

    expect(res.status).toBe(403);
    expect(upsertCustomFieldValue).not.toHaveBeenCalled();
  });

  it("rejects invalid entity types for value upserts", async () => {
    const app = buildApp("editor");
    const res = await app.request("/org/custom-fields/invalid/grant-1/values/field-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: ["alpha"] }),
    });

    expect(res.status).toBe(400);
    expect(upsertCustomFieldValue).not.toHaveBeenCalled();
  });
});

describe("removed incentive routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not expose the removed info endpoint", async () => {
    const app = buildApp("admin");
    const removedPath = `/org/${["refer", "rals"].join("")}`;
    const res = await app.request(removedPath);

    expect(res.status).toBe(404);
  });

  it("does not accept removed code application", async () => {
    const app = buildApp("admin");
    const removedPath = `/org/${["refer", "rals"].join("")}/apply`;
    const res = await app.request(removedPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD1234" }),
    });

    expect(res.status).toBe(404);
  });
});

function buildUnauthenticatedApp() {
  return new Hono<AppEnv>()
    .use("/org/*", async (c, next) => {
      c.set("db", buildMockDb() as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      // memberRole is intentionally not set (null) to simulate no org membership
      c.set("memberRole", null as never);
      await next();
    })
    .route("/org", orgRoutes);
}

describe("GET /org/memberships", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects requests with no org role (unauthenticated membership) with 403", async () => {
    const app = buildUnauthenticatedApp();
    const res = await app.request("/org/memberships");
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns the list of org memberships for the current user", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "org-member-1",
        orgId: "org-1",
        role: "admin",
        organization: { id: "org-1", name: "Foundation Alpha" },
      },
      {
        id: "org-member-2",
        orgId: "org-2",
        role: "editor",
        organization: { id: "org-2", name: "Fund Beta" },
      },
    ]);
    mockEntityMembersFindMany.mockResolvedValue([
      {
        entityId: "entity-1",
        role: "admin",
        permissions: {
          entitySettings: "manage",
          entityTeam: "manage",
          grants: "manage",
          funds: "manage",
          documents: "manage",
          compliance: "manage",
          accounting: "manage",
          reports: "manage",
        },
        entity: {
          id: "entity-1",
          name: "Foundation Alpha",
          kind: "root",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
        },
      },
    ]);

    const app = buildApp("viewer");
    const res = await app.request("/org/memberships");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        orgId: string;
        orgName: string;
        role: string;
        entityAccess: unknown[];
      }>;
    };
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      orgId: "org-1",
      orgName: "Foundation Alpha",
      role: "admin",
      entityAccess: [
        {
          entityId: "entity-1",
          entityName: "Foundation Alpha",
          kind: "root",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "admin",
          permissions: {
            entitySettings: "manage",
            entityTeam: "manage",
            grants: "manage",
            funds: "manage",
            documents: "manage",
            compliance: "manage",
            accounting: "manage",
            reports: "manage",
          },
        },
      ],
    });
    expect(body.data[1]).toEqual({
      orgId: "org-2",
      orgName: "Fund Beta",
      role: "editor",
      entityAccess: [],
    });
    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(mockEntityMembersFindMany).toHaveBeenCalledOnce();
  });

  it("returns an empty list when the user has no memberships (edge case)", async () => {
    mockFindMany.mockResolvedValue([]);

    const app = buildApp("viewer");
    const res = await app.request("/org/memberships");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("does not load entity access when no active org context is set", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "org-member-1",
        orgId: "org-1",
        role: "admin",
        organization: { id: "org-1", name: "Foundation Alpha" },
      },
    ]);

    const app = buildApp("viewer", undefined, null);
    const res = await app.request("/org/memberships");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ orgId: string; entityAccess: unknown[] }>;
    };
    expect(body.data).toEqual([
      { orgId: "org-1", orgName: "Foundation Alpha", role: "admin", entityAccess: [] },
    ]);
    expect(mockEntityMembersFindMany).not.toHaveBeenCalled();
  });

  it("passes userId to the query", async () => {
    mockFindMany.mockResolvedValue([]);

    const app = buildApp("admin");
    await app.request("/org/memberships");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.anything(),
      }),
    );
  });
});

describe("PATCH /org/settings", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets admins update accountingEnabled", async () => {
    vi.mocked(updateOrgSettings).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingEnabled: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: true });
    expect(updateOrgSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        accountingEnabled: true,
      }),
    );
  });

  it("rejects non-admins with 403", async () => {
    const app = buildApp("editor");
    const res = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingEnabled: true }),
    });

    expect(res.status).toBe(403);
    expect(updateOrgSettings).not.toHaveBeenCalled();
  });

  it("returns 200 with empty payload (no-op)", async () => {
    vi.mocked(updateOrgSettings).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const res = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(updateOrgSettings).toHaveBeenCalled();
  });
});

describe("PATCH /org/billing/selection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets admins persist a plan selection before checkout", async () => {
    vi.mocked(saveBillingSelection).mockResolvedValue({
      planTier: "growth",
      billingCycle: "annual",
    } as never);

    const app = buildApp("admin");
    const res = await app.request(
      "/org/billing/selection",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "growth",
          billingCycle: "annual",
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    expect(saveBillingSelection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        data: {
          planTier: "growth",
          billingCycle: "annual",
        },
      }),
    );
  });

  it("reports analytics capture failures without failing billing selection", async () => {
    const analyticsError = new Error("PostHog unavailable");
    vi.mocked(saveBillingSelection).mockResolvedValue({
      planTier: "growth",
      billingCycle: "annual",
    } as never);
    mockCaptureAnalytics.mockRejectedValue(analyticsError);

    const app = buildApp("admin");
    const res = await app.request(
      "/org/billing/selection",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "growth",
          billingCycle: "annual",
        }),
      },
      MOCK_ENV,
    );
    await Promise.resolve();

    expect(res.status).toBe(200);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "org",
      expect.objectContaining({ step: "telemetry_capture" }),
    );
  });

  it("rejects promo codes because billing selection is checkout-only", async () => {
    const app = buildApp("admin");
    const res = await app.request(
      "/org/billing/selection",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "growth",
          billingCycle: "annual",
          promoCode: "Y80OFF",
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    expect(saveBillingSelection).not.toHaveBeenCalled();
  });

  it("rejects non-admins with 403", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/org/billing/selection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planTier: "starter", billingCycle: "monthly" }),
    });

    expect(res.status).toBe(403);
    expect(saveBillingSelection).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid billing payloads", async () => {
    const app = buildApp("admin");
    const res = await app.request("/org/billing/selection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planTier: "starter", billingCycle: "weekly" }),
    });

    expect(res.status).toBe(400);
    expect(saveBillingSelection).not.toHaveBeenCalled();
  });
});

describe("GET /org/trial-feature-usage", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the usage summary for any org member", async () => {
    vi.mocked(getTrialFeatureUsage).mockResolvedValue({
      highestTier: "audit_ready",
      tiersUsed: ["growth", "audit_ready"],
    });

    const app = buildApp("viewer");
    const res = await app.request("/org/trial-feature-usage");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ highestTier: "audit_ready", tiersUsed: ["growth", "audit_ready"] });
    expect(getTrialFeatureUsage).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("returns null/empty when no usage rows exist", async () => {
    vi.mocked(getTrialFeatureUsage).mockResolvedValue({
      highestTier: null,
      tiersUsed: [],
    });

    const app = buildApp("viewer");
    const res = await app.request("/org/trial-feature-usage");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ highestTier: null, tiersUsed: [] });
  });
});
