import { describe, expect, it } from "vitest";
import {
  FEATURE_AREAS,
  PERMISSION_LEVELS,
  ADMIN_ONLY_ROLES,
  EDITOR_UP_ROLES,
  INVITABLE_ROLES,
  READ_ONLY_ROLES,
  ROLE_LABELS,
  ROLES,
  ROLE_HIERARCHY,
  STANDARD_ROLES,
  getDefaultPermissionsForRole,
  resolveEffectivePermissions,
  type Role,
} from "./index";

describe("shared types index", () => {
  it("defines the expected role hierarchy ordering", () => {
    const orderedRoles = (Object.entries(ROLE_HIERARCHY) as Array<[Role, number]>).sort(
      (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
    );

    expect(orderedRoles).toEqual([
      ["auditor", 1],
      ["viewer", 1],
      ["editor", 2],
      ["admin", 3],
    ]);
  });

  it("auditor has the same hierarchy level as viewer", () => {
    expect(ROLE_HIERARCHY["auditor"]).toBe(ROLE_HIERARCHY["viewer"]);
  });

  it("auditor is blocked from editor-level routes (hierarchy check)", () => {
    expect(ROLE_HIERARCHY["auditor"]).toBeLessThan(ROLE_HIERARCHY["editor"]);
  });

  it("all four roles are present in ROLE_HIERARCHY", () => {
    const roles: Role[] = ["admin", "editor", "viewer", "auditor"];
    for (const role of roles) {
      expect(ROLE_HIERARCHY).toHaveProperty(role);
    }
  });

  it("publishes canonical role arrays and labels for validators and app policy", () => {
    expect(ROLES).toEqual(["admin", "editor", "viewer", "auditor"]);
    expect(READ_ONLY_ROLES).toEqual(ROLES);
    expect(STANDARD_ROLES).toEqual(["admin", "editor", "viewer"]);
    expect(EDITOR_UP_ROLES).toEqual(["admin", "editor"]);
    expect(ADMIN_ONLY_ROLES).toEqual(["admin"]);
    expect(INVITABLE_ROLES).toEqual(["viewer", "editor", "auditor"]);
    expect(ROLE_LABELS).toMatchObject({
      admin: "Admin",
      editor: "Editor",
      viewer: "Viewer",
      auditor: "Auditor",
    });
  });

  it("defines stable feature areas and permission levels for team RBAC", () => {
    expect(FEATURE_AREAS).toEqual([
      "donors",
      "grants",
      "funds",
      "events",
      "documents",
      "compliance",
      "programs",
      "accounting",
      "import",
      "reports",
      "payments",
      "settings",
      "billing",
      "team",
    ]);
    expect(PERMISSION_LEVELS).toEqual(["none", "view", "edit", "manage"]);
  });

  it("resolves role defaults and merges member overrides", () => {
    const viewerDefaults = getDefaultPermissionsForRole("viewer");

    expect(viewerDefaults.donors).toBe("view");
    expect(viewerDefaults.import).toBe("none");
    expect(viewerDefaults.team).toBe("none");
    expect(viewerDefaults.programs).toBe("view");

    expect(
      resolveEffectivePermissions("viewer", {
        donors: "edit",
        accounting: "none",
      }),
    ).toMatchObject({
      donors: "edit",
      accounting: "none",
      team: "none",
    });
  });

  it("keeps admin permissions locked to manage even when overrides are provided", () => {
    expect(resolveEffectivePermissions("admin", { donors: "none" }).donors).toBe("manage");
    expect(resolveEffectivePermissions("admin", { billing: "view" }).billing).toBe("manage");
  });

  it("keeps auditor permissions read-only and donor-blocked even when overrides are provided", () => {
    const auditor = resolveEffectivePermissions("auditor", {
      donors: "manage",
      grants: "edit",
      documents: "manage",
      events: "view",
      import: "edit",
      team: "manage",
    });

    expect(auditor.donors).toBe("none");
    expect(auditor.grants).toBe("view");
    expect(auditor.documents).toBe("view");
    // programs and payments are outside the Auditor matrix — must be "none"
    expect(auditor.programs).toBe("none");
    expect(auditor.payments).toBe("none");
    expect(auditor.events).toBe("none");
    expect(auditor.import).toBe("none");
    expect(auditor.team).toBe("none");
  });

  it("auditor default permissions match the canonical CLAUDE.md matrix exactly", () => {
    const auditor = getDefaultPermissionsForRole("auditor");

    // Allowed (read-only): grants, funds, documents, compliance, accounting, reports
    expect(auditor.grants).toBe("view");
    expect(auditor.funds).toBe("view");
    expect(auditor.documents).toBe("view");
    expect(auditor.compliance).toBe("view");
    expect(auditor.accounting).toBe("view");
    expect(auditor.reports).toBe("view");

    // Denied: donors, events, import, settings, billing, team, programs, payments
    expect(auditor.donors).toBe("none");
    expect(auditor.events).toBe("none");
    expect(auditor.import).toBe("none");
    expect(auditor.settings).toBe("none");
    expect(auditor.billing).toBe("none");
    expect(auditor.team).toBe("none");
    expect(auditor.programs).toBe("none");
    expect(auditor.payments).toBe("none");
  });

  it("returns role defaults when overrides are null or undefined", () => {
    const viewerWithNull = resolveEffectivePermissions("viewer", null);
    const viewerWithUndefined = resolveEffectivePermissions("viewer", undefined);

    expect(viewerWithNull).toEqual(resolveEffectivePermissions("viewer", {}));
    expect(viewerWithUndefined).toEqual(resolveEffectivePermissions("viewer", {}));
    expect(viewerWithNull.donors).toBe("view");
    expect(viewerWithNull.import).toBe("none");
  });

  it("resolves auditor and editor defaults without overrides", () => {
    const auditor = resolveEffectivePermissions("auditor");
    expect(auditor.donors).toBe("none");
    expect(auditor.grants).toBe("view");

    const editor = resolveEffectivePermissions("editor");
    expect(editor.donors).toBe("edit");
    expect(editor.billing).toBe("none");
  });
});
