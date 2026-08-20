import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  getDefaultPermissionsForEntityRole,
  getDefaultPermissionsForRole,
  type EntityPermissionOverrides,
  type EntityRole,
  type PermissionOverrides,
  type Role,
} from "@grantpipe/shared";
import type { AppEnv } from "../types";
import { orgEntityContextMiddleware } from "./org-entity-context";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

type OrgMember = {
  id: string;
  orgId: string;
  role: Role;
  permissions?: PermissionOverrides | null;
  deletedAt: Date | null;
};

type EntityMember = {
  entityId: string;
  role: EntityRole;
  permissions?: EntityPermissionOverrides | null;
  deletedAt: Date | null;
};

type Entity = {
  id: string;
  orgId: string;
  status: "active" | "archived";
  deletedAt: Date | null;
};

const mockOrgMembersFindFirst = vi.fn<(query?: unknown) => Promise<OrgMember | undefined>>();
const mockEntitiesFindFirst = vi.fn<(query?: unknown) => Promise<Entity | undefined>>();
const mockEntityMembersFindFirst = vi.fn<(query?: unknown) => Promise<EntityMember | undefined>>();
const mockFindOrgSubscription = vi.fn<
  () => Promise<
    | (NonNullable<AppEnv["Variables"]["orgSubscription"]> & {
        defaultEntityId: string | null;
      })
    | null
  >
>();
const mockCaptureContextFailure = vi.fn();

const mockDb = {
  query: {
    orgMembers: {
      findFirst: mockOrgMembersFindFirst,
    },
    entities: {
      findFirst: mockEntitiesFindFirst,
    },
    entityMembers: {
      findFirst: mockEntityMembersFindFirst,
    },
  },
};

function createApp(options: { includeUser?: boolean; injectCapture?: boolean } = {}) {
  const app = new Hono<AppEnv>();
  app.use("/test", async (c, next) => {
    c.set("db", mockDb as unknown as AppEnv["Variables"]["db"]);
    if (options.includeUser !== false) {
      c.set("user", {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
      });
    }
    await next();
  });
  app.use(
    "/test",
    orgEntityContextMiddleware({
      findOrgSubscription: mockFindOrgSubscription,
      ...(options.injectCapture === false
        ? {}
        : { captureContextFailure: mockCaptureContextFailure }),
    }),
  );
  app.get("/test", (c) =>
    c.json({
      orgId: c.get("orgId"),
      entityId: c.get("entityId"),
      entityScope: c.get("entityScope"),
      memberRole: c.get("memberRole"),
      memberPermissions: c.get("memberPermissions"),
      entityRole: c.get("entityRole"),
      entityPermissions: c.get("entityPermissions"),
      orgSubscription: c.get("orgSubscription"),
    }),
  );
  return app;
}

describe("orgEntityContextMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgMembersFindFirst.mockResolvedValue({
      id: "org-member-1",
      orgId: "org-1",
      role: "admin",
      deletedAt: null,
    });
    mockFindOrgSubscription.mockResolvedValue({
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      planTier: "starter",
      effectivePlanTier: "starter",
      onboardingCompleted: false,
      onboardingGoal: null,
      planSelectedAt: null,
      stripeSubscriptionId: null,
      defaultEntityId: "entity-default",
    });
    mockEntitiesFindFirst.mockResolvedValue({
      id: "entity-default",
      orgId: "org-1",
      status: "active",
      deletedAt: null,
    });
    mockEntityMembersFindFirst.mockResolvedValue({
      entityId: "entity-default",
      role: "admin",
      deletedAt: null,
    });
  });

  it("returns 401 when user context is missing", async () => {
    const app = createApp({ includeUser: false });

    const res = await app.request("/test");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockOrgMembersFindFirst).not.toHaveBeenCalled();
  });

  it("uses the latest joined organization and its default entity when no headers are present", async () => {
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    const orgLookup = mockOrgMembersFindFirst.mock.calls[0]?.[0] as
      | { orderBy?: unknown[] }
      | undefined;
    expect(Array.isArray(orgLookup?.orderBy)).toBe(true);
    expect(await res.json()).toMatchObject({
      orgId: "org-1",
      entityId: "entity-default",
      entityScope: "entity",
      memberRole: "admin",
      entityRole: "admin",
    });
  });

  it("uses X-Org-Id when the user is a member of that organization", async () => {
    mockOrgMembersFindFirst.mockResolvedValue({
      id: "org-member-2",
      orgId: "org-2",
      role: "editor",
      permissions: { reports: "manage" },
      deletedAt: null,
    });
    mockFindOrgSubscription.mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      planTier: "growth",
      effectivePlanTier: "growth",
      onboardingCompleted: true,
      onboardingGoal: null,
      planSelectedAt: new Date("2026-04-01T00:00:00.000Z"),
      stripeSubscriptionId: "sub_123",
      defaultEntityId: "entity-org-2",
    });
    mockEntitiesFindFirst.mockResolvedValue({
      id: "entity-org-2",
      orgId: "org-2",
      status: "active",
      deletedAt: null,
    });
    mockEntityMembersFindFirst.mockResolvedValue({
      entityId: "entity-org-2",
      role: "editor",
      permissions: { reports: "manage" },
      deletedAt: null,
    });
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Org-Id": "org-2" },
    });

    expect(res.status).toBe(200);
    expect(mockOrgMembersFindFirst).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({
      orgId: "org-2",
      entityId: "entity-org-2",
      memberRole: "editor",
      memberPermissions: { reports: "manage" },
      entityRole: "editor",
      entityPermissions: { reports: "manage" },
    });
  });

  it("returns 403 when X-Org-Id is not a membership and does not fall back", async () => {
    mockOrgMembersFindFirst.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Org-Id": "org-unknown" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No organization membership" });
    expect(mockOrgMembersFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindOrgSubscription).not.toHaveBeenCalled();
    expect(mockEntitiesFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when X-Org-Id is explicitly blank and does not fall back", async () => {
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Org-Id": "  " },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No organization membership" });
    expect(mockOrgMembersFindFirst).not.toHaveBeenCalled();
    expect(mockFindOrgSubscription).not.toHaveBeenCalled();
    expect(mockEntitiesFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when the selected org membership is soft deleted", async () => {
    mockOrgMembersFindFirst.mockResolvedValue({
      id: "org-member-1",
      orgId: "org-1",
      role: "admin",
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No organization membership" });
    expect(mockFindOrgSubscription).not.toHaveBeenCalled();
  });

  it("uses X-Entity-Id only when the member has access inside the active org", async () => {
    mockEntitiesFindFirst.mockResolvedValue({
      id: "entity-requested",
      orgId: "org-1",
      status: "active",
      deletedAt: null,
    });
    mockEntityMembersFindFirst.mockResolvedValue({
      entityId: "entity-requested",
      role: "viewer",
      deletedAt: null,
    });
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Entity-Id": "entity-requested" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      orgId: "org-1",
      entityId: "entity-requested",
      entityRole: "viewer",
      entityPermissions: getDefaultPermissionsForEntityRole("viewer"),
    });
  });

  it("returns 403 and captures a sanitized denial when X-Entity-Id is not accessible", async () => {
    mockEntitiesFindFirst.mockResolvedValue({
      id: "entity-requested",
      orgId: "org-1",
      status: "active",
      deletedAt: null,
    });
    mockEntityMembersFindFirst.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Entity-Id": "entity-requested" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No entity access" });
    expect(mockCaptureContextFailure).toHaveBeenCalledWith(expect.any(Error), {
      reason: "entity_switch_denied",
      orgId: "org-1",
      requestedEntityId: "entity-requested",
      entityScope: "entity",
    });
  });

  it("returns 403 when X-Entity-Id is explicitly blank and does not use the default entity", async () => {
    const app = createApp();

    const res = await app.request("/test", {
      headers: { "X-Entity-Id": "  " },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No entity access" });
    expect(mockCaptureContextFailure).toHaveBeenCalledWith(expect.any(Error), {
      reason: "entity_switch_denied",
      orgId: "org-1",
      entityScope: "entity",
    });
    expect(mockEntitiesFindFirst).not.toHaveBeenCalled();
    expect(mockEntityMembersFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when the default entity is inactive and captures the selected id", async () => {
    mockEntitiesFindFirst.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No entity access" });
    expect(mockCaptureContextFailure).toHaveBeenCalledWith(expect.any(Error), {
      reason: "inactive_or_missing_entity",
      orgId: "org-1",
      selectedEntityId: "entity-default",
      entityScope: "entity",
    });
  });

  it("returns 403 when the default entity membership is soft deleted", async () => {
    mockEntityMembersFindFirst.mockResolvedValue({
      entityId: "entity-default",
      role: "viewer",
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No entity access" });
    expect(mockCaptureContextFailure).toHaveBeenCalledWith(expect.any(Error), {
      reason: "entity_switch_denied",
      orgId: "org-1",
      requestedEntityId: "entity-default",
      entityScope: "entity",
    });
  });

  it("fails closed and captures a config error when the active org has no default entity", async () => {
    mockFindOrgSubscription.mockResolvedValue({
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      planTier: "starter",
      effectivePlanTier: "starter",
      onboardingCompleted: false,
      onboardingGoal: null,
      planSelectedAt: null,
      stripeSubscriptionId: null,
      defaultEntityId: null,
    });
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No entity access" });
    expect(mockCaptureContextFailure).toHaveBeenCalledWith(expect.any(Error), {
      reason: "missing_default_entity",
      orgId: "org-1",
      entityScope: "entity",
    });
  });

  it("uses the default Sentry adapter with sanitized entity context tags", async () => {
    mockEntityMembersFindFirst.mockResolvedValue(undefined);
    const app = createApp({ injectCapture: false });

    const res = await app.request("/test", {
      headers: { "X-Entity-Id": "entity-requested" },
    });

    expect(res.status).toBe(403);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "org-entity-context",
      {
        reason: "entity_switch_denied",
        org_id: "org-1",
        entity_scope: "entity",
        requested_entity_id: "entity-requested",
      },
    );
  });

  it("uses the default Sentry adapter with selected default entity context tags", async () => {
    mockEntitiesFindFirst.mockResolvedValue(undefined);
    const app = createApp({ injectCapture: false });

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "org-entity-context",
      {
        reason: "inactive_or_missing_entity",
        org_id: "org-1",
        entity_scope: "entity",
        selected_entity_id: "entity-default",
      },
    );
  });

  it("sets the full org, entity, permission, and subscription context", async () => {
    const app = createApp();

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      orgId: "org-1",
      entityId: "entity-default",
      entityScope: "entity",
      memberRole: "admin",
      memberPermissions: getDefaultPermissionsForRole("admin"),
      entityRole: "admin",
      entityPermissions: getDefaultPermissionsForEntityRole("admin"),
      orgSubscription: {
        subscriptionStatus: "trialing",
        trialEndsAt: null,
        planTier: "starter",
        effectivePlanTier: "starter",
        onboardingCompleted: false,
        onboardingGoal: null,
        planSelectedAt: null,
        stripeSubscriptionId: null,
        defaultEntityId: "entity-default",
      },
    });
  });

  it("uses default entity auditor permissions without applying overrides", async () => {
    mockEntityMembersFindFirst.mockResolvedValue({
      entityId: "entity-default",
      role: "auditor",
      permissions: { entityTeam: "manage" },
      deletedAt: null,
    });
    const app = createApp();

    const res = await app.request("/test");
    const body = (await res.json()) as {
      entityRole: string;
      entityPermissions: { entityTeam: string };
    };

    expect(res.status).toBe(200);
    expect(body.entityRole).toBe("auditor");
    expect(body.entityPermissions.entityTeam).toBe("none");
  });
});
