import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  blockEntityRole,
  blockRole,
  requireAllEntityPermissions,
  requireAllPermissions,
  requireEntityPermission,
  requireEntityRole,
  requirePermission,
  requireRole,
} from "./require-role";
import type {
  EntityPermissionMap,
  EntityRole,
  FeatureArea,
  PermissionMap,
  PermissionLevel,
  Role,
} from "@grantpipe/shared";

type TestVariables = {
  memberRole: Role | null;
  memberPermissions?: PermissionMap | null;
  entityRole?: EntityRole | null;
  entityPermissions?: EntityPermissionMap | null;
};

type EntityContext = {
  entityRole: EntityRole | null;
  entityPermissions?: EntityPermissionMap | null;
};

function createTestApp(
  requiredRole: Role,
  userRole: Role | null,
  entity?: EntityContext,
  scope?: "entity",
) {
  const app = new Hono<{ Variables: TestVariables }>();

  // Simulate upstream middleware setting memberRole
  app.use("/test", async (c, next) => {
    c.set("memberRole", userRole);
    if (entity) {
      c.set("entityRole", entity.entityRole);
      c.set("entityPermissions", entity.entityPermissions ?? null);
    }
    await next();
  });

  app.use("/test", scope ? requireEntityRole(requiredRole) : requireRole(requiredRole));

  app.get("/test", (c) => {
    return c.json({ ok: true });
  });

  return app;
}

describe("requireRole", () => {
  it("allows admin to access admin routes", async () => {
    const app = createTestApp("admin", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows admin to access editor routes", async () => {
    const app = createTestApp("editor", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows admin to access viewer routes", async () => {
    const app = createTestApp("viewer", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows editor to access editor routes", async () => {
    const app = createTestApp("editor", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows editor to access viewer routes", async () => {
    const app = createTestApp("viewer", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("blocks editor from admin routes with 403", async () => {
    const app = createTestApp("admin", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("blocks viewer from editor routes with 403", async () => {
    const app = createTestApp("editor", "viewer");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("blocks viewer from admin routes with 403", async () => {
    const app = createTestApp("admin", "viewer");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("blocks null role from any route with 403", async () => {
    const app = createTestApp("viewer", null);
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows auditor to pass viewer-minimum routes (same hierarchy level)", async () => {
    const app = createTestApp("viewer", "auditor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("blocks auditor from editor-minimum routes with 403", async () => {
    const app = createTestApp("editor", "auditor");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("blocks auditor from admin-minimum routes with 403", async () => {
    const app = createTestApp("admin", "auditor");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("keeps organization role checks independent of selected-entity authority", async () => {
    const app = createTestApp("editor", "editor", { entityRole: "viewer" });

    const res = await app.request("/test");

    expect(res.status).toBe(200);
  });

  it("blocks an org editor from entity editor routes when the entity role is viewer", async () => {
    const app = createTestApp("editor", "editor", { entityRole: "viewer" }, "entity");

    expect((await app.request("/test")).status).toBe(403);
  });

  it("preserves organization role behavior when entity context is absent", async () => {
    const app = createTestApp("viewer", "admin", undefined, "entity");

    expect((await app.request("/test")).status).toBe(200);
  });

  it("keeps org-role behavior unchanged when no entity context exists", async () => {
    const app = createTestApp("editor", "editor");

    expect((await app.request("/test")).status).toBe(200);
  });
});

function createBlockApp(
  blockedRole: Role,
  userRole: Role | null,
  entity?: EntityContext,
  scope?: "entity",
) {
  const app = new Hono<{ Variables: TestVariables }>();

  app.use("/test", async (c, next) => {
    c.set("memberRole", userRole);
    if (entity) {
      c.set("entityRole", entity.entityRole);
      c.set("entityPermissions", entity.entityPermissions ?? null);
    }
    await next();
  });

  app.use("/test", scope ? blockEntityRole(blockedRole) : blockRole(blockedRole));

  app.get("/test", (c) => {
    return c.json({ ok: true });
  });

  return app;
}

describe("blockRole", () => {
  it("blocks auditor from the route with 403", async () => {
    const app = createBlockApp("auditor", "auditor");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows admin to pass a blockRole('auditor') guard", async () => {
    const app = createBlockApp("auditor", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows editor to pass a blockRole('auditor') guard", async () => {
    const app = createBlockApp("auditor", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows viewer to pass a blockRole('auditor') guard", async () => {
    const app = createBlockApp("auditor", "viewer");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("blocks null role from a blockRole('auditor') guard with 403", async () => {
    const app = createBlockApp("auditor", null);
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("does not apply an entity auditor role to an organization-only block", async () => {
    const app = createBlockApp("auditor", "editor", { entityRole: "auditor" });

    expect((await app.request("/test")).status).toBe(200);
  });

  it("blocks an entity auditor from an entity-scoped route", async () => {
    const app = createBlockApp("auditor", "editor", { entityRole: "auditor" }, "entity");

    expect((await app.request("/test")).status).toBe(403);
  });
});

function createPermissionApp(
  feature: FeatureArea,
  level: Exclude<PermissionLevel, "none">,
  userRole: Role | null,
  memberPermissions?: PermissionMap | null,
  entity?: EntityContext,
  scope?: "entity",
) {
  const app = new Hono<{ Variables: TestVariables }>();

  app.use("/test", async (c, next) => {
    c.set("memberRole", userRole);
    c.set("memberPermissions", memberPermissions ?? null);
    if (entity) {
      c.set("entityRole", entity.entityRole);
      c.set("entityPermissions", entity.entityPermissions ?? null);
    }
    await next();
  });

  app.use(
    "/test",
    scope ? requireEntityPermission(feature, level) : requirePermission(feature, level),
  );

  app.get("/test", (c) => c.json({ ok: true }));

  return app;
}

describe("requirePermission", () => {
  it("allows explicit feature permissions at or above the required level", async () => {
    const app = createPermissionApp("donors", "edit", "viewer", {
      donors: "edit",
    } as PermissionMap);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("blocks explicit feature permissions below the required level", async () => {
    const app = createPermissionApp("team", "manage", "editor", {
      team: "none",
    } as PermissionMap);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("falls back to role defaults when no permission map is attached", async () => {
    const app = createPermissionApp("donors", "view", "viewer");

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 403 when userRole is null", async () => {
    const app = createPermissionApp("donors", "view", null);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("uses null memberPermissions and falls back to role defaults", async () => {
    const app = createPermissionApp("grants", "view", "editor", null);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses viewer role defaults for features absent from the override map", async () => {
    // Provide a partial override map that doesn't mention 'team'
    // resolveEffectivePermissions spreads role defaults first, so viewer.team = "none"
    const partialMap = { donors: "view" } as PermissionMap;
    const app = createPermissionApp("team", "view", "viewer", partialMap);

    const res = await app.request("/test");

    // viewer's default for team is "none", which is below "view" threshold
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("ignores restrictive overrides for admin — admin always has full access", async () => {
    // Admin with a "none" override on events must still be allowed
    // resolveEffectivePermissions short-circuits for admin and ignores overrides
    const app = createPermissionApp("events", "edit", "admin", {
      events: "none",
    } as PermissionMap);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("ignores permissive donor overrides for auditors", async () => {
    const app = createPermissionApp("donors", "view", "auditor", {
      donors: "manage",
    } as PermissionMap);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("keeps auditors read-only even when granted edit overrides", async () => {
    const app = createPermissionApp("grants", "edit", "auditor", {
      grants: "edit",
    } as PermissionMap);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("keeps organization permission checks independent of selected-entity authority", async () => {
    const app = createPermissionApp("grants", "edit", "editor", null, {
      entityRole: "viewer",
      entityPermissions: { grants: "view" } as EntityPermissionMap,
    });

    expect((await app.request("/test")).status).toBe(200);
  });

  it("uses the more restrictive selected-entity permission in entity mode", async () => {
    const app = createPermissionApp(
      "grants",
      "edit",
      "editor",
      null,
      {
        entityRole: "viewer",
        entityPermissions: { grants: "view" } as EntityPermissionMap,
      },
      "entity",
    );

    expect((await app.request("/test")).status).toBe(403);
  });

  it("uses entity role defaults when the entity permission map is null", async () => {
    const app = createPermissionApp(
      "grants",
      "edit",
      "admin",
      null,
      { entityRole: "viewer", entityPermissions: null },
      "entity",
    );

    expect((await app.request("/test")).status).toBe(403);
  });

  it("preserves organization permission behavior when entity context is absent", async () => {
    const app = createPermissionApp("grants", "view", "admin", null, undefined, "entity");

    expect((await app.request("/test")).status).toBe(200);
  });
});

function createAllPermissionsApp(
  requirements: Array<[FeatureArea, Exclude<PermissionLevel, "none">]>,
  userRole: Role | null,
  memberPermissions?: PermissionMap | null,
  entity?: EntityContext,
  scope?: "entity",
) {
  const app = new Hono<{ Variables: TestVariables }>();

  app.use("/test", async (c, next) => {
    c.set("memberRole", userRole);
    c.set("memberPermissions", memberPermissions ?? null);
    if (entity) {
      c.set("entityRole", entity.entityRole);
      c.set("entityPermissions", entity.entityPermissions ?? null);
    }
    await next();
  });

  app.use(
    "/test",
    scope ? requireAllEntityPermissions(requirements) : requireAllPermissions(requirements),
  );

  app.get("/test", (c) => c.json({ ok: true }));

  return app;
}

describe("requireAllPermissions", () => {
  it("requires every listed feature permission", async () => {
    const app = createAllPermissionsApp(
      [
        ["compliance", "view"],
        ["reports", "view"],
      ],
      "editor",
      {
        compliance: "edit",
        reports: "none",
      } as PermissionMap,
    );

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows access when every listed feature meets the minimum", async () => {
    const app = createAllPermissionsApp(
      [
        ["compliance", "view"],
        ["reports", "view"],
      ],
      "editor",
      {
        compliance: "edit",
        reports: "view",
      } as PermissionMap,
    );

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("blocks in entity mode when any selected-entity permission is below its level", async () => {
    const app = createAllPermissionsApp(
      [
        ["grants", "edit"],
        ["reports", "view"],
      ],
      "editor",
      null,
      {
        entityRole: "viewer",
        entityPermissions: { grants: "view", reports: "view" } as EntityPermissionMap,
      },
      "entity",
    );

    expect((await app.request("/test")).status).toBe(403);
  });

  it("keeps organization all-permission checks independent of entity overrides", async () => {
    const orgPermissions = {
      grants: "edit",
      reports: "view",
    } as PermissionMap;
    const entityPermissions = {
      entitySettings: "view",
      entityTeam: "none",
      grants: "view",
      funds: "view",
      documents: "view",
      compliance: "view",
      accounting: "view",
      reports: "view",
    } satisfies EntityPermissionMap;
    const app = createAllPermissionsApp(
      [
        ["grants", "edit"],
        ["reports", "view"],
      ],
      "editor",
      orgPermissions,
      { entityRole: "viewer", entityPermissions },
    );

    expect((await app.request("/test")).status).toBe(200);
  });
});
