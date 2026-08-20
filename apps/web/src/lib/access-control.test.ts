import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  adminOnlyRoles,
  canAccessEvents,
  canAccessFeature,
  canAccessImport,
  canCreateRecords,
  editorUpRoles,
  hasRoleAccess,
  readOnlyRoles,
  standardRoles,
  type AppRole,
} from "./access-control";

describe("access-control", () => {
  it("derives role groups from shared role policy constants", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/access-control.ts"), "utf8");

    expect(source).toContain("READ_ONLY_ROLES");
    expect(source).toContain("STANDARD_ROLES");
    expect(source).toContain("EDITOR_UP_ROLES");
    expect(source).toContain("ADMIN_ONLY_ROLES");
    expect(source).not.toContain('["admin", "editor", "viewer", "auditor"]');
  });

  it("defines the expected role groups", () => {
    expect(readOnlyRoles).toEqual(["admin", "editor", "viewer", "auditor"]);
    expect(standardRoles).toEqual(["admin", "editor", "viewer"]);
    expect(editorUpRoles).toEqual(["admin", "editor"]);
    expect(adminOnlyRoles).toEqual(["admin"]);
  });

  it("checks membership within allowed role groups", () => {
    expect(hasRoleAccess("admin", adminOnlyRoles)).toBe(true);
    expect(hasRoleAccess("editor", adminOnlyRoles)).toBe(false);
    expect(hasRoleAccess("auditor", readOnlyRoles)).toBe(true);
    expect(hasRoleAccess(null, readOnlyRoles)).toBe(false);
    expect(hasRoleAccess(undefined, readOnlyRoles)).toBe(false);
  });

  it("allows only admin and editor to create records", () => {
    const expectations: Array<[AppRole, boolean]> = [
      ["admin", true],
      ["editor", true],
      ["viewer", false],
      ["auditor", false],
    ];

    for (const [role, expected] of expectations) {
      expect(canCreateRecords(role)).toBe(expected);
    }
  });

  it("allows import only for admin and editor", () => {
    expect(canAccessImport("admin")).toBe(true);
    expect(canAccessImport("editor")).toBe(true);
    expect(canAccessImport("viewer")).toBe(false);
    expect(canAccessImport("auditor")).toBe(false);
  });

  it("blocks auditor from events while allowing standard roles", () => {
    expect(canAccessEvents("admin")).toBe(true);
    expect(canAccessEvents("editor")).toBe(true);
    expect(canAccessEvents("viewer")).toBe(true);
    expect(canAccessEvents("auditor")).toBe(false);
  });

  it("keeps auditors blocked from API-blocked features even with overrides", () => {
    expect(canAccessFeature("auditor", { donors: "manage" }, "donors", "view")).toBe(false);
    expect(canAccessFeature("auditor", { grants: "manage" }, "grants", "edit")).toBe(false);
    expect(canAccessFeature("auditor", { documents: "manage" }, "documents", "edit")).toBe(false);
    expect(canAccessFeature("auditor", { events: "manage" }, "events", "view")).toBe(false);
    expect(canAccessFeature("auditor", { import: "manage" }, "import", "edit")).toBe(false);
    expect(canAccessEvents("auditor", { events: "view" })).toBe(false);
    expect(canAccessImport("auditor", { import: "edit" })).toBe(false);
  });

  it("allows explicit permission maps to grant feature access beyond the base role", () => {
    expect(canAccessFeature("viewer", { import: "edit" }, "import", "edit")).toBe(true);
    expect(canAccessImport("viewer", { import: "edit" })).toBe(true);
  });

  it("uses explicit permission maps to narrow feature access below the base role", () => {
    expect(canAccessFeature("editor", { events: "none" }, "events", "view")).toBe(false);
    expect(canAccessEvents("editor", { events: "none" })).toBe(false);
  });

  it("blocks missing roles even when feature permissions are present", () => {
    expect(canAccessFeature(null, { import: "edit" }, "import", "edit")).toBe(false);
    expect(canAccessFeature(undefined, { events: "manage" }, "events", "view")).toBe(false);
  });

  it("keeps admin defaults authoritative over restrictive overrides", () => {
    expect(canAccessFeature("admin", { import: "none" }, "import", "manage")).toBe(true);
    expect(canAccessEvents("admin", { events: "none" })).toBe(true);
  });

  it("treats unrecognized feature areas as inaccessible", () => {
    const unknownFeature = "unknown" as Parameters<typeof canAccessFeature>[2];

    expect(canAccessFeature("editor", {}, unknownFeature, "view")).toBe(false);
  });
});
