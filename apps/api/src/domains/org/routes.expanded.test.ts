import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { serviceUnavailable } from "../../lib/app-error";
import { orgRoutes } from "./routes";

vi.mock("./service", async () => {
  const actual = await vi.importActual("./service");
  return {
    ...actual,
    getOrgProfile: vi.fn(),
    updateOrgProfile: vi.fn(),
    listOrgMembers: vi.fn(),
    createInviteLink: vi.fn(),
    updateOrgMember: vi.fn(),
    getOrgBillingSummary: vi.fn(),
    createBillingCheckoutSession: vi.fn(),
    createBillingPortalSession: vi.fn(),
    listDebugAnalyticsEvents: vi.fn(),
    listDebugEmails: vi.fn(),
    listDebugErrorEvents: vi.fn(),
    listDebugStorageObjects: vi.fn(),
    listDebugBillingEvents: vi.fn(),
    listEntities: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    archiveEntity: vi.fn(),
    assignEntityAccess: vi.fn(),
    updateEntityAccess: vi.fn(),
    revokeEntityAccess: vi.fn(),
    updateOrgSettings: vi.fn(),
  };
});

const { mockCaptureAnalytics, mockCaptureError, mockCaptureBackgroundException } = vi.hoisted(
  () => ({
    mockCaptureAnalytics: vi.fn(),
    mockCaptureError: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }),
);

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
    errors: { capture: mockCaptureError },
  }),
}));

import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  createInviteLink,
  getOrgBillingSummary,
  getOrgProfile,
  listDebugAnalyticsEvents,
  listDebugBillingEvents,
  listDebugEmails,
  listDebugErrorEvents,
  listDebugStorageObjects,
  listEntities,
  listOrgMembers,
  archiveEntity,
  assignEntityAccess,
  createEntity,
  revokeEntityAccess,
  updateEntity,
  updateEntityAccess,
  updateOrgSettings,
  updateOrgMember,
  updateOrgProfile,
} from "./service";

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  options: {
    defaultEntityId?: string;
    entityId?: string;
    entityRole?: "admin" | "editor" | "viewer" | "auditor" | null;
    entityPermissions?: AppEnv["Variables"]["entityPermissions"];
  } = {},
) {
  return new Hono<AppEnv>()
    .use("/org/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", null);
      c.set("entityId", options.entityId ?? null);
      c.set("entityRole", options.entityRole ?? null);
      c.set("entityPermissions", options.entityPermissions ?? null);
      if (options.defaultEntityId) {
        c.set("orgSubscription", { defaultEntityId: options.defaultEntityId } as never);
      }
      await next();
    })
    .route("/org", orgRoutes);
}

describe("expanded org routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
    mockCaptureError.mockResolvedValue({ id: "error-1" });
  });

  it("returns and updates the org profile", async () => {
    vi.mocked(getOrgProfile).mockResolvedValue({ id: "org-1", name: "GrantPipe" } as never);
    vi.mocked(updateOrgProfile).mockResolvedValue({ id: "org-1", name: "GrantPipe+" } as never);

    const app = buildApp("admin");
    const profileRes = await app.request("/org/profile");
    const updateRes = await app.request("/org/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "GrantPipe+",
        fiscalYearStartMonth: 1,
        timezone: "America/New_York",
      }),
    });

    expect(profileRes.status).toBe(200);
    expect(updateRes.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgProfileUpdated,
      payload: {
        actorId: "user-1",
        changed_fields: ["fiscal_year_start_month", "name", "timezone"],
        address_present: false,
        ein_present: false,
        fiscal_year_start_month_changed: true,
        logo_present: false,
        timezone_changed: true,
      },
    });
  });

  it("supports team and invite management for admins", async () => {
    vi.mocked(listOrgMembers).mockResolvedValue([] as never);
    vi.mocked(createInviteLink).mockResolvedValue({ id: "invite-1", token: "token-1" } as never);
    vi.mocked(updateOrgMember).mockResolvedValue({ id: "member-1", role: "editor" } as never);

    const app = buildApp("admin");
    expect((await app.request("/org/team")).status).toBe(200);
    expect(
      (
        await app.request("/org/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "email",
            email: "person@example.org",
            role: "editor",
            permissions: { grants: "view", donors: "none" },
          }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request("/org/team/member-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "editor" }),
        })
      ).status,
    ).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.inviteCreated,
      payload: {
        actorId: "user-1",
        inviteId: "invite-1",
        invite_mode: "email",
        has_email_invite: true,
        has_permission_overrides: true,
        permission_override_keys: ["donors", "grants"],
        target_role: "editor",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgMemberUpdated,
      payload: {
        actorId: "user-1",
        memberId: "member-1",
        permissions_changed: false,
        role_changed: true,
        status_changed: false,
        target_role: "editor",
      },
    });
  });

  it("keeps org admin team, billing, and settings authority with an entity viewer selected", async () => {
    vi.mocked(listOrgMembers).mockResolvedValue([] as never);
    vi.mocked(getOrgBillingSummary).mockResolvedValue({ planTier: "starter" } as never);
    vi.mocked(updateOrgSettings).mockResolvedValue(undefined);
    const app = buildApp("admin", {
      entityId: "entity-active",
      entityRole: "viewer",
      entityPermissions: {
        entitySettings: "view",
        entityTeam: "none",
        grants: "view",
        funds: "view",
        documents: "view",
        compliance: "view",
        accounting: "view",
        reports: "view",
      },
    });

    expect((await app.request("/org/team")).status).toBe(200);
    expect((await app.request("/org/billing")).status).toBe(200);
    expect(
      (
        await app.request("/org/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountingEnabled: true }),
        })
      ).status,
    ).toBe(200);
  });

  it("supports entity-scoped invite and entity access management for admins", async () => {
    vi.mocked(createInviteLink).mockResolvedValue({
      id: "invite-entity",
      token: "token-entity",
      entityId: "entity-client",
    } as never);
    vi.mocked(assignEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      orgMemberId: "member-1",
      role: "viewer",
    } as never);
    vi.mocked(updateEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      orgMemberId: "member-1",
      role: "editor",
    } as never);
    vi.mocked(revokeEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      orgMemberId: "member-1",
      role: "editor",
    } as never);

    const app = buildApp("admin");
    const inviteRes = await app.request("/org/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "email",
        email: "client@example.org",
        role: "viewer",
        entityId: "entity-client",
      }),
    });
    const assignRes = await app.request("/org/team/member-1/entity-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: "entity-client",
        role: "viewer",
        permissions: { grants: "view", reports: "view" },
      }),
    });
    const updateRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "editor" }),
    });
    const revokeRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "DELETE",
    });

    expect(inviteRes.status).toBe(201);
    expect(assignRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(revokeRes.status).toBe(200);
    expect(createInviteLink).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      userId: "user-1",
      mode: "email",
      email: "client@example.org",
      role: "viewer",
      permissions: undefined,
      entityId: "entity-client",
    });
    expect(assignEntityAccess).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      entityId: "entity-client",
      role: "viewer",
      permissions: { grants: "view", reports: "view" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.inviteCreated,
      payload: expect.objectContaining({
        inviteId: "invite-entity",
        invite_mode: "email",
        target_role: "viewer",
        entity_scoped: true,
        entityId: "entity-client",
      }),
    });
  });

  it("captures entity access failures with sanitized ids and no entity names", async () => {
    vi.mocked(assignEntityAccess).mockRejectedValue(new Error("Final Client name should not leak"));
    vi.mocked(updateEntityAccess).mockRejectedValue(
      new Error("Update Client name should not leak"),
    );
    vi.mocked(revokeEntityAccess).mockRejectedValue(
      new Error("Revoke Client name should not leak"),
    );

    const app = buildApp("admin");
    const assignRes = await app.request("/org/team/member-1/entity-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: "entity-client",
        role: "viewer",
      }),
    });
    const updateRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "editor" }),
    });
    const revokeRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "DELETE",
    });

    expect(assignRes.status).toBe(500);
    expect(updateRes.status).toBe(500);
    expect(revokeRes.status).toBe(500);
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity access mutation failed",
      payload: {
        feature: "entity_access",
        route: "POST /org/team/:memberId/entity-access",
        action: "assign",
        userId: "user-1",
        memberId: "member-1",
        entityId: "entity-client",
      },
    });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity access mutation failed",
      payload: {
        feature: "entity_access",
        route: "PATCH /org/team/:memberId/entity-access/:entityId",
        action: "update",
        userId: "user-1",
        memberId: "member-1",
        entityId: "entity-client",
      },
    });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity access mutation failed",
      payload: {
        feature: "entity_access",
        route: "DELETE /org/team/:memberId/entity-access/:entityId",
        action: "revoke",
        userId: "user-1",
        memberId: "member-1",
        entityId: "entity-client",
      },
    });
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("Final Client");
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("Update Client");
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("Revoke Client");
  });

  it("allows entity team managers to manage only their active entity access", async () => {
    vi.mocked(assignEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      role: "viewer",
    } as never);
    vi.mocked(updateEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      role: "editor",
    } as never);
    vi.mocked(revokeEntityAccess).mockResolvedValue({
      id: "entity-member-1",
      entityId: "entity-client",
      role: "editor",
    } as never);

    const app = buildApp("viewer", {
      entityId: "entity-client",
      entityRole: "editor",
      entityPermissions: {
        entitySettings: "view",
        entityTeam: "manage",
        grants: "view",
        funds: "view",
        compliance: "view",
        reports: "view",
        documents: "view",
        accounting: "none",
      },
    });

    const assignRes = await app.request("/org/team/member-1/entity-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: "entity-client", role: "viewer" }),
    });
    const updateRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "editor" }),
    });
    const revokeRes = await app.request("/org/team/member-1/entity-access/entity-client", {
      method: "DELETE",
    });
    const crossEntityRes = await app.request("/org/team/member-1/entity-access/entity-sibling", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "viewer" }),
    });
    const crossEntityRevokeRes = await app.request(
      "/org/team/member-1/entity-access/entity-sibling",
      {
        method: "DELETE",
      },
    );
    const noPermissionRes = await buildApp("viewer", {
      entityId: "entity-client",
      entityRole: "editor",
      entityPermissions: {
        entitySettings: "view",
        entityTeam: "view",
        grants: "view",
        funds: "view",
        compliance: "view",
        reports: "view",
        documents: "view",
        accounting: "none",
      },
    }).request("/org/team/member-1/entity-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: "entity-client", role: "viewer" }),
    });

    expect(assignRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(revokeRes.status).toBe(200);
    expect(crossEntityRes.status).toBe(403);
    expect(crossEntityRevokeRes.status).toBe(403);
    expect(noPermissionRes.status).toBe(403);
    expect(assignEntityAccess).toHaveBeenCalledTimes(1);
    expect(updateEntityAccess).toHaveBeenCalledTimes(1);
    expect(revokeEntityAccess).toHaveBeenCalledTimes(1);
  });

  it("captures org settings updates with safe dimensions", async () => {
    vi.mocked(updateOrgSettings).mockResolvedValue(undefined);

    const app = buildApp("admin");
    const response = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingEnabled: true }),
    });

    expect(response.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgProfileUpdated,
      payload: {
        actorId: "user-1",
        accounting_enabled: true,
        changed_fields: ["accounting_enabled"],
      },
    });
  });

  it("emits accountingEnabled event only when accountingEnabled is set true", async () => {
    vi.mocked(updateOrgSettings).mockResolvedValue(undefined);

    const app = buildApp("admin");

    // Setting accountingEnabled true → should emit accountingEnabled
    const resOn = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingEnabled: true }),
    });
    expect(resOn.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingEnabled,
      payload: { actorId: "user-1" },
    });

    vi.clearAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);

    // Setting accountingEnabled false → should NOT emit accountingEnabled
    const resOff = await app.request("/org/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingEnabled: false }),
    });
    expect(resOff.status).toBe(200);
    const capturedEvents = mockCaptureAnalytics.mock.calls.map(
      (call) => (call[0] as { eventName: string }).eventName,
    );
    expect(capturedEvents).not.toContain(ANALYTICS_EVENTS.accountingEnabled);
  });

  it("lists, creates, updates, and archives entities for admins with sanitized analytics", async () => {
    vi.mocked(listEntities).mockResolvedValue([
      {
        id: "entity-1",
        orgId: "org-1",
        name: "Foundation Alpha",
        kind: "root",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
      },
    ] as never);
    vi.mocked(createEntity).mockResolvedValue({
      id: "entity-2",
      name: "Sponsored Project A",
      kind: "sponsored_project",
      fiscalSponsorModel: "model_a",
      parentEntityId: "entity-1",
      status: "active",
    } as never);
    vi.mocked(updateEntity).mockResolvedValue({
      id: "entity-2",
      name: "Sponsored Project B",
      kind: "sponsored_project",
      fiscalSponsorModel: "model_c",
      parentEntityId: "entity-1",
      status: "active",
    } as never);
    vi.mocked(archiveEntity).mockResolvedValue({
      id: "entity-2",
      status: "archived",
    } as never);

    const app = buildApp("admin", { defaultEntityId: "entity-1" });
    const listRes = await app.request("/org/entities");
    expect(listRes.status).toBe(200);
    await expect(listRes.json()).resolves.toMatchObject({
      defaultEntityId: "entity-1",
      data: [{ id: "entity-1", isDefault: true }],
    });
    const createRes = await app.request("/org/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sponsored Project A",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-1",
      }),
    });
    const updateRes = await app.request("/org/entities/entity-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sponsored Project B",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_c",
      }),
    });
    const archiveRes = await app.request("/org/entities/entity-2/archive", {
      method: "POST",
    });

    expect(createRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(archiveRes.status).toBe(200);

    const appWithoutDefault = buildApp("admin");
    expect((await appWithoutDefault.request("/org/entities")).status).toBe(200);
    expect(
      (
        await appWithoutDefault.request("/org/entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Sponsored Project A",
            kind: "sponsored_project",
            fiscalSponsorModel: "model_a",
            parentEntityId: "entity-1",
          }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await appWithoutDefault.request("/org/entities/entity-2", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Sponsored Project B",
            kind: "sponsored_project",
            fiscalSponsorModel: "model_c",
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await appWithoutDefault.request("/org/entities/entity-2/archive", { method: "POST" }))
        .status,
    ).toBe(200);

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.entityCreated,
      payload: {
        actorId: "user-1",
        entityId: "entity-2",
        entity_kind: "sponsored_project",
        fiscal_sponsor_model: "model_a",
        has_parent_entity: true,
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.entityUpdated,
      payload: {
        actorId: "user-1",
        entityId: "entity-2",
        changed_fields: ["fiscalSponsorModel", "kind", "name"],
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.entityArchived,
      payload: {
        actorId: "user-1",
        entityId: "entity-2",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Sponsored Project");
  });

  it("blocks non-admin entity creation", async () => {
    const app = buildApp("editor");

    const response = await app.request("/org/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Client A", kind: "agency_client" }),
    });

    expect(response.status).toBe(403);
    expect(createEntity).not.toHaveBeenCalled();
  });

  it("captures entity mutation failures with sanitized ids and route tags", async () => {
    vi.mocked(createEntity).mockRejectedValueOnce(new Error("database unavailable"));
    vi.mocked(updateEntity).mockRejectedValueOnce(new Error("database unavailable"));
    vi.mocked(archiveEntity).mockRejectedValueOnce(new Error("database unavailable"));

    const app = buildApp("admin");
    const createRes = await app.request("/org/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sensitive Client", kind: "agency_client" }),
    });
    const updateRes = await app.request("/org/entities/entity-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Sensitive Client" }),
    });
    const archiveRes = await app.request("/org/entities/entity-2/archive", { method: "POST" });

    expect(createRes.status).toBe(500);
    expect(updateRes.status).toBe(500);
    expect(archiveRes.status).toBe(500);

    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity settings mutation failed",
      payload: {
        feature: "entity_settings",
        route: "POST /org/entities",
        action: "create",
        userId: "user-1",
      },
    });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity settings mutation failed",
      payload: {
        feature: "entity_settings",
        route: "PATCH /org/entities/:entityId",
        action: "update",
        userId: "user-1",
        entityId: "entity-2",
      },
    });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Entity settings mutation failed",
      payload: {
        feature: "entity_settings",
        route: "POST /org/entities/:entityId/archive",
        action: "archive",
        userId: "user-1",
        entityId: "entity-2",
      },
    });
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("Sensitive Client");
  });

  it("captures optional org profile dimensions without raw profile fields", async () => {
    vi.mocked(updateOrgProfile).mockResolvedValue({ id: "org-1", name: "GrantPipe+" } as never);

    const app = buildApp("admin");
    const response = await app.request("/org/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "GrantPipe+",
        ein: "12-3456789",
        fiscalYearStartMonth: 7,
        timezone: "America/Chicago",
        logoUrl: "https://cdn.example.org/logo.png",
        address: "123 Main St",
      }),
    });

    expect(response.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgProfileUpdated,
      payload: {
        actorId: "user-1",
        changed_fields: [
          "address",
          "ein",
          "fiscal_year_start_month",
          "logo_url",
          "name",
          "timezone",
        ],
        address_present: true,
        ein_present: true,
        fiscal_year_start_month_changed: true,
        logo_present: true,
        timezone_changed: true,
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("12-3456789");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("123 Main St");
  });

  it("captures shareable invites and permission-only member updates", async () => {
    vi.mocked(createInviteLink).mockResolvedValue({ id: "invite-2", token: "token-2" } as never);
    vi.mocked(updateOrgMember).mockResolvedValue({ id: "member-2", role: "viewer" } as never);

    const app = buildApp("admin");
    const inviteResponse = await app.request("/org/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "viewer" }),
    });
    const memberResponse = await app.request("/org/team/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, permissions: { reports: "view" } }),
    });

    expect(inviteResponse.status).toBe(201);
    expect(memberResponse.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.inviteCreated,
      payload: {
        actorId: "user-1",
        inviteId: "invite-2",
        invite_mode: "shareable",
        has_email_invite: false,
        has_permission_overrides: false,
        permission_override_keys: [],
        target_role: "viewer",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgMemberUpdated,
      payload: {
        actorId: "user-1",
        memberId: "member-2",
        permissions_changed: true,
        role_changed: false,
        status_changed: true,
        target_active: true,
        permission_override_keys: ["reports"],
      },
    });
  });

  it("supports billing summary and mock billing actions", async () => {
    vi.mocked(getOrgBillingSummary).mockResolvedValue({ planTier: "starter" } as never);
    vi.mocked(createBillingCheckoutSession).mockResolvedValue({
      sessionId: "checkout-1",
      url: "/app/settings?checkout=checkout-1",
    } as never);
    vi.mocked(createBillingPortalSession).mockResolvedValue({
      sessionId: "portal-1",
      url: "/app/settings?portal=portal-1",
    } as never);

    const app = buildApp("admin");
    expect((await app.request("/org/billing")).status).toBe(200);
    expect(
      (
        await app.request("/org/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planTier: "growth",
            checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/org/billing/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnPath: "/settings" }),
        })
      ).status,
    ).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(2);
  });

  it("omits billing portal session ids from analytics payloads", async () => {
    vi.mocked(createBillingPortalSession).mockResolvedValue({
      sessionId: "portal-secret-session",
      url: "/app/settings?portal=portal-secret-session",
    } as never);

    const app = buildApp("admin");
    const response = await app.request("/org/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath: "/settings" }),
    });

    expect(response.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.billingPortalOpened,
      payload: { actorId: "user-1" },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("portal-secret-session");
  });

  it("emits checkout_started with safe billing context after checkout is created", async () => {
    vi.mocked(createBillingCheckoutSession).mockResolvedValue({
      sessionId: "checkout-secret-session",
      url: "/app/settings?checkout=checkout-secret-session",
    } as never);

    const app = buildApp("admin");
    const response = await app.request("/org/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planTier: "growth",
        billingCycle: "monthly",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.checkoutStarted,
      payload: {
        org_id: "org-1",
        plan_tier: "growth",
        billing_cycle: "monthly",
        billing_surface: "settings",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain(
      "checkout-secret-session",
    );
  });

  it("emits the supplied checkout surface for paywall-originated checkout", async () => {
    vi.mocked(createBillingCheckoutSession).mockResolvedValue({
      sessionId: "checkout-secret-session",
      url: "/app/settings?checkout=checkout-secret-session",
    } as never);

    const app = buildApp("admin");
    const response = await app.request("/org/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planTier: "growth",
        billingCycle: "annual",
        surface: "paywall",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.checkoutStarted,
      payload: {
        org_id: "org-1",
        plan_tier: "growth",
        billing_cycle: "annual",
        billing_surface: "paywall",
      },
    });
  });

  it("emits checkout_start_failed with safe billing context when checkout creation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createBillingCheckoutSession).mockRejectedValue(new Error("stripe unavailable"));
    let resolveErrorCapture: (value: { id: string }) => void = () => undefined;
    const pendingErrorCapture = new Promise<{ id: string }>((resolve) => {
      resolveErrorCapture = resolve;
    });
    mockCaptureError.mockReturnValue(pendingErrorCapture);

    const app = buildApp("admin");
    const responsePromise = Promise.resolve(
      app.request("/org/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "growth",
          billingCycle: "annual",
          surface: "paywall",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
    let responseSettled = false;
    void responsePromise.then(() => {
      responseSettled = true;
    });

    await vi.waitFor(() => {
      expect(mockCaptureError).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    expect(responseSettled).toBe(false);
    resolveErrorCapture({ id: "error-1" });

    const response = await responsePromise;
    expect(response.status).toBe(500);
    expect(responseSettled).toBe(true);
    await expect(pendingErrorCapture).resolves.toEqual({ id: "error-1" });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.checkoutStartFailed,
      payload: {
        org_id: "org-1",
        plan_tier: "growth",
        billing_cycle: "annual",
        billing_surface: "paywall",
        failure_type: "checkout_session_creation_failed",
      },
    });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message: "Billing checkout session creation failed",
      payload: {
        feature: "billing",
        operation: "checkout_start",
        userId: "user-1",
        org_id: "org-1",
        plan_tier: "growth",
        billing_cycle: "annual",
        billing_surface: "paywall",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("stripe unavailable");
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("stripe unavailable");
    consoleError.mockRestore();
  });

  it("returns a controlled 503 and captures missing Stripe checkout configuration", async () => {
    vi.mocked(createBillingCheckoutSession).mockRejectedValue(
      serviceUnavailable("Billing is temporarily unavailable", "billing_unavailable"),
    );

    const response = await buildApp("admin").request("/org/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planTier: "growth",
        billingCycle: "annual",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Billing is temporarily unavailable",
      errorCode: "billing_unavailable",
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Billing checkout session creation failed",
        payload: expect.objectContaining({ operation: "checkout_start" }),
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "billing_unavailable" }),
      "billing",
      { step: "checkout_unavailable" },
    );
  });

  it("returns a controlled 503 and captures missing Stripe portal configuration", async () => {
    vi.mocked(createBillingPortalSession).mockRejectedValue(
      serviceUnavailable("Billing is temporarily unavailable", "billing_unavailable"),
    );

    const response = await buildApp("admin").request("/org/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath: "/settings" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Billing is temporarily unavailable",
      errorCode: "billing_unavailable",
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Billing portal session creation failed",
        payload: expect.objectContaining({ operation: "portal_start" }),
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "billing_unavailable" }),
      "billing",
      { step: "portal_unavailable" },
    );
  });

  it("waits for checkout analytics capture before returning the checkout response", async () => {
    vi.useFakeTimers();
    let resolveCapture: (value: { id: string }) => void = () => undefined;
    const pendingCapture = new Promise<{ id: string }>((resolve) => {
      resolveCapture = resolve;
    });
    mockCaptureAnalytics.mockReturnValue(pendingCapture);
    vi.mocked(createBillingCheckoutSession).mockResolvedValue({
      sessionId: "checkout-1",
      url: "/app/settings?checkout=checkout-1",
    } as never);
    const app = new Hono<AppEnv>()
      .use("/org/*", async (c, next) => {
        c.set("db", {} as never);
        c.set("orgId", "org-1");
        c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
        c.set("session", { id: "sess-1", userId: "user-1" });
        c.set("memberRole", "admin");
        await next();
      })
      .route("/org", orgRoutes);

    const responsePromise = Promise.resolve(
      app.request("/org/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "starter",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );

    let responseSettled = false;
    void responsePromise.then(() => {
      responseSettled = true;
    });
    await vi.waitFor(() => {
      expect(mockCaptureAnalytics).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(responseSettled).toBe(false);
    resolveCapture({ id: "analytics-1" });
    await Promise.resolve();

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(responseSettled).toBe(true);
    await expect(pendingCapture).resolves.toEqual({ id: "analytics-1" });
    vi.useRealTimers();
  });

  it("continues checkout when analytics capture exceeds the short timeout", async () => {
    vi.useFakeTimers();
    mockCaptureAnalytics.mockReturnValue(new Promise(() => undefined));
    vi.mocked(createBillingCheckoutSession).mockResolvedValue({
      sessionId: "checkout-1",
      url: "/app/settings?checkout=checkout-1",
    } as never);
    const app = buildApp("admin");

    const responsePromise = Promise.resolve(
      app.request("/org/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: "starter",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );

    let responseSettled = false;
    void responsePromise.then(() => {
      responseSettled = true;
    });
    await vi.waitFor(() => {
      expect(mockCaptureAnalytics).toHaveBeenCalledOnce();
    });
    expect(responseSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(responseSettled).toBe(true);
    vi.useRealTimers();
  });

  it("returns debug inspection data for admins only", async () => {
    vi.mocked(listDebugEmails).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 });
    vi.mocked(listDebugStorageObjects).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    vi.mocked(listDebugBillingEvents).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    vi.mocked(listDebugAnalyticsEvents).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    vi.mocked(listDebugErrorEvents).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const adminApp = buildApp("admin");
    const viewerApp = buildApp("viewer");

    expect((await adminApp.request("/org/debug/emails")).status).toBe(200);
    expect((await adminApp.request("/org/debug/storage")).status).toBe(200);
    expect((await adminApp.request("/org/debug/billing")).status).toBe(200);
    expect((await adminApp.request("/org/debug/analytics")).status).toBe(200);
    expect((await adminApp.request("/org/debug/errors")).status).toBe(200);
    expect((await viewerApp.request("/org/debug/emails")).status).toBe(403);
  });
});
