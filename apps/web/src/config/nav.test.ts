import { describe, it, expect } from "vitest";

import {
  navSections,
  filterNavForAccess,
  filterNavForRole,
  flattenNavItems,
  isNavItemVisible,
  NAV_ITEM_COUNT,
  type AppRole,
  type NavSection,
  type NavItem,
} from "./nav";

const DummyIcon = () => null;

describe("navSections", () => {
  it("is an array with at least one section", () => {
    expect(Array.isArray(navSections)).toBe(true);
    expect(navSections.length).toBeGreaterThan(0);
  });

  it("each section has an items array", () => {
    for (const section of navSections) {
      expect(Array.isArray(section.items)).toBe(true);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("each nav item has to, label, and icon", () => {
    for (const section of navSections) {
      for (const item of section.items) {
        expect(typeof item.to).toBe("string");
        expect(typeof item.label).toBe("string");
        // lucide-react icons are React components — they are either functions or objects with $$typeof
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it("every nav item has a non-empty, kebab-case navItemId", () => {
    for (const section of navSections) {
      for (const item of section.items) {
        expect(typeof item.navItemId).toBe("string");
        expect(item.navItemId.length).toBeGreaterThan(0);
        expect(item.navItemId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    }
  });

  it("every nav item has a unique navItemId — the id is a stable analytics identifier", () => {
    const all = flattenNavItems();
    const ids = all.map((item) => item.navItemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly 6 sections in the consolidated order", () => {
    expect(navSections.length).toBe(6);
    expect(navSections.map((s) => s.label)).toEqual([
      undefined,
      "Fundraising",
      "Grants & Funding",
      "Reporting & Compliance",
      "Accounting",
      "Workspace",
    ]);
  });

  it("has exactly 14 nav items total across the consolidated tree", () => {
    expect(flattenNavItems().length).toBe(14);
  });

  it("the Accounting section defaults to collapsed", () => {
    const accounting = navSections.find((s) => s.label === "Accounting");
    expect(accounting?.collapsible).toBe(true);
    expect(accounting?.defaultCollapsed).toBe(true);
  });

  it("every other collapsible section is not defaultCollapsed", () => {
    for (const section of navSections) {
      if (section.label && section.label !== "Accounting") {
        expect(section.collapsible).toBe(true);
        expect(section.defaultCollapsed).toBeFalsy();
      }
    }
  });

  it("navItemId and route pairs match the consolidated 14-row tree exactly, in order", () => {
    const all = flattenNavItems();
    expect(all.map((item) => [item.navItemId, item.to])).toEqual([
      ["dashboard", "/dashboard"],
      ["donors", "/donors"],
      ["events", "/events"],
      ["grants", "/grants"],
      ["funds", "/funds"],
      ["payments", "/payments"],
      ["reports", "/reports"],
      ["deadlines", "/deadlines"],
      ["activity", "/activity"],
      ["accounting", "/accounting"],
      ["import", "/import"],
      ["notifications", "/notifications"],
      ["settings", "/settings"],
      ["help", "/help"],
    ]);
  });

  it("relabels the payments nav item to Payments and the import nav item to Import", () => {
    const all = flattenNavItems();
    const payments = all.find((item) => item.to === "/payments");
    const importItem = all.find((item) => item.to === "/import");

    expect(payments?.label).toBe("Payments");
    expect(importItem?.label).toBe("Import");
  });

  it("labels the single accounting row 'Accounting', not 'Overview'", () => {
    const all = flattenNavItems();
    const accounting = all.find((item) => item.to === "/accounting");
    expect(accounting?.label).toBe("Accounting");
    expect(accounting?.navItemId).toBe("accounting");
  });

  it("optional roles field is an array of AppRole when present", () => {
    const validRoles: AppRole[] = ["admin", "editor", "viewer", "auditor"];
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.roles !== undefined) {
          expect(Array.isArray(item.roles)).toBe(true);
          for (const role of item.roles) {
            expect(validRoles).toContain(role);
          }
        }
      }
    }
  });

  it("contains a Dashboard item pointing to /dashboard", () => {
    const all = flattenNavItems();
    const dashboard = all.find((item) => item.to === "/dashboard");
    expect(dashboard).toBeDefined();
    expect(dashboard?.label).toBe("Dashboard");
  });

  it("contains a Settings item restricted to admin", () => {
    const all = flattenNavItems();
    const settings = all.find((item) => item.to === "/settings");
    expect(settings).toBeDefined();
    expect(settings?.roles).toEqual(["admin"]);
  });

  it("contains a Help item for every authenticated role", () => {
    const all = flattenNavItems();
    const help = all.find((item) => item.to === "/help");
    expect(help).toBeDefined();
    expect(help?.roles).toEqual(["admin", "editor", "viewer", "auditor"]);
  });

  it("maps grants/funds/payments/reports/accounting to their feature permissions", () => {
    const all = flattenNavItems();
    const grants = all.find((item) => item.to === "/grants");
    const funds = all.find((item) => item.to === "/funds");
    const payments = all.find((item) => item.to === "/payments");
    const reports = all.find((item) => item.to === "/reports");
    const accounting = all.find((item) => item.to === "/accounting");

    expect(grants).toMatchObject({ feature: "grants", minimumPermission: "view" });
    expect(funds).toMatchObject({ feature: "funds", minimumPermission: "view" });
    expect(payments).toMatchObject({ feature: "payments", minimumPermission: "view" });
    expect(reports).toMatchObject({ feature: "reports", minimumPermission: "view" });
    expect(accounting).toMatchObject({ feature: "accounting", minimumPermission: "view" });
  });

  it("does not contain any of the removed rows anywhere in the sidebar", () => {
    const all = flattenNavItems();
    const removedRoutes = [
      "/donors/at-risk",
      "/donors/pledges",
      "/donors/email",
      "/funders",
      "/calendar",
      "/radar",
      "/grants/sentinel",
      "/programs",
      "/subrecipients",
      "/reports/ask-ledger",
      "/accounting/chart-of-accounts",
      "/accounting/journal",
      "/accounting/ledger",
      "/accounting/trial-balance",
      "/accounting/periods",
      "/accounting/reports/financial-position",
      "/accounting/reports/activities",
      "/accounting/reports/functional-expenses",
      "/accounting/bank",
      "/accounting/recurring",
      "/accounting/anomalies",
      "/accounting/studios/functional-expense-allocation",
      "/settings/entities",
    ];
    for (const route of removedRoutes) {
      expect(all.find((item) => item.to === route)).toBeUndefined();
    }
  });

  it("Deadlines carries over the old Radar row's gates (readOnlyRoles, no feature)", () => {
    const all = flattenNavItems();
    const deadlines = all.find((item) => item.to === "/deadlines");
    expect(deadlines).toBeDefined();
    expect(deadlines?.roles).toEqual(["admin", "editor", "viewer", "auditor"]);
    expect(deadlines?.feature).toBeUndefined();
    expect(deadlines?.minimumPermission).toBeUndefined();
  });
});

describe("filterNavForRole", () => {
  it("returns all sections unchanged when role is undefined", () => {
    const result = filterNavForRole(undefined);
    // Same sections structure — every section still present
    expect(result.length).toBe(navSections.length);
  });

  it("returns all items for role undefined (no filtering)", () => {
    const unfiltered = flattenNavItems(filterNavForRole(undefined));
    const all = flattenNavItems();
    expect(unfiltered.length).toBe(all.length);
  });

  it("includes Settings for admin role", () => {
    const sections = filterNavForRole("admin");
    const items = flattenNavItems(sections);
    const settings = items.find((item) => item.to === "/settings");
    expect(settings).toBeDefined();
  });

  it("excludes Settings for editor role (adminOnly)", () => {
    const sections = filterNavForRole("editor");
    const items = flattenNavItems(sections);
    const settings = items.find((item) => item.to === "/settings");
    expect(settings).toBeUndefined();
  });

  it("excludes Settings for viewer role (adminOnly)", () => {
    const sections = filterNavForRole("viewer");
    const items = flattenNavItems(sections);
    const settings = items.find((item) => item.to === "/settings");
    expect(settings).toBeUndefined();
  });

  it("includes dashboard but excludes admin-only settings for auditor role", () => {
    const sections = filterNavForRole("auditor");
    const items = flattenNavItems(sections);
    expect(items.find((item) => item.to === "/dashboard")).toBeDefined();
    expect(items.find((item) => item.to === "/settings")).toBeUndefined();
  });

  it("excludes import for viewer role because the API requires editor access", () => {
    const sections = filterNavForRole("viewer");
    const items = flattenNavItems(sections);
    expect(items.find((item) => item.to === "/import")).toBeUndefined();
  });

  it("excludes events and import for auditor role because the API blocks auditor access", () => {
    const sections = filterNavForRole("auditor");
    const items = flattenNavItems(sections);
    expect(items.find((item) => item.to === "/events")).toBeUndefined();
    expect(items.find((item) => item.to === "/import")).toBeUndefined();
  });

  it("excludes Activity and Notifications for auditor role (not in Auditor matrix)", () => {
    const sections = filterNavForRole("auditor");
    const items = flattenNavItems(sections);
    expect(items.find((item) => item.to === "/activity")).toBeUndefined();
    expect(items.find((item) => item.to === "/notifications")).toBeUndefined();
  });

  it("excludes Payments for auditor role (payments denied)", () => {
    const sections = filterNavForRole("auditor");
    const items = flattenNavItems(sections);
    expect(items.find((item) => item.to === "/payments")).toBeUndefined();
  });

  it("includes Grants, Funds, Reports, Deadlines, Accounting, Help, and Dashboard for auditor role", () => {
    const sections = filterNavForRole("auditor");
    const items = flattenNavItems(sections);
    const visibleRoutes = items.map((item) => item.to);
    expect(visibleRoutes).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/grants",
        "/funds",
        "/reports",
        "/deadlines",
        "/accounting",
        "/help",
      ]),
    );
    // And exactly those seven — no more, no less.
    expect(visibleRoutes.sort()).toEqual(
      ["/accounting", "/dashboard", "/deadlines", "/funds", "/grants", "/help", "/reports"].sort(),
    );
  });

  it("excludes auditor from Activity and Notifications roles arrays (standardRoles only)", () => {
    // These items must carry standardRoles (no auditor), so auditor is excluded
    const all = flattenNavItems();
    const activity = all.find((item) => item.to === "/activity");
    const notifications = all.find((item) => item.to === "/notifications");

    expect(activity?.roles).not.toContain("auditor");
    expect(notifications?.roles).not.toContain("auditor");
  });

  it("removes entire sections when all items are filtered out", () => {
    // Build a synthetic single-item admin-only section
    const testSections: NavSection[] = [
      {
        label: "Admin Only",
        items: [
          {
            to: "/secret",
            label: "Secret",
            navItemId: "secret",
            icon: () => null,
            roles: ["admin"],
          },
        ],
      },
    ];
    const viewerResult = filterNavForRole("viewer", testSections);
    expect(viewerResult.length).toBe(0);
  });

  it("keeps sections that have at least one permitted item", () => {
    const testSections: NavSection[] = [
      {
        label: "Mixed",
        items: [
          {
            to: "/open",
            label: "Open",
            navItemId: "open",
            icon: () => null,
            roles: ["admin", "editor", "viewer"],
          },
          {
            to: "/admin-only",
            label: "Admin Page",
            navItemId: "admin-page",
            icon: () => null,
            roles: ["admin"],
          },
        ],
      },
    ];
    const viewerResult = filterNavForRole("viewer", testSections);
    expect(viewerResult.length).toBe(1);
    expect(viewerResult[0]!.items.length).toBe(1);
    expect(viewerResult[0]!.items[0]!.to).toBe("/open");
  });

  it("includes items with no roles field for all roles", () => {
    const testSections: NavSection[] = [
      {
        items: [
          // No roles property — visible to everyone
          { to: "/public", label: "Public", navItemId: "public", icon: () => null },
        ],
      },
    ];
    for (const role of ["admin", "editor", "viewer", "auditor"] as AppRole[]) {
      const result = filterNavForRole(role, testSections);
      const items = flattenNavItems(result);
      expect(items.find((i) => i.to === "/public")).toBeDefined();
    }
  });

  it("includes import for a viewer with explicit import edit permission", () => {
    const sections = filterNavForAccess("viewer", { import: "edit" });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/import")).toBeDefined();
  });

  it("returns all sections unchanged when access filtering has no role", () => {
    expect(filterNavForAccess(undefined)).toBe(navSections);
  });

  it("excludes events when explicit permissions remove event access from an editor", () => {
    const sections = filterNavForAccess("editor", { events: "none" });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/events")).toBeUndefined();
    expect(items.find((item) => item.to === "/import")).toBeDefined();
  });

  it("excludes grants when grant permissions are removed", () => {
    const sections = filterNavForAccess("editor", { grants: "none" });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/grants")).toBeUndefined();
  });

  it("excludes accounting route when accounting permissions are removed", () => {
    const sections = filterNavForAccess("editor", { accounting: "none" });
    const items = flattenNavItems(sections);

    expect(items.some((item) => item.to.startsWith("/accounting"))).toBe(false);
  });

  it("keeps auditor role caps even when explicit permissions grant blocked features", () => {
    const sections = filterNavForAccess("auditor", {
      events: "manage",
      import: "manage",
    });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/events")).toBeUndefined();
    expect(items.find((item) => item.to === "/import")).toBeUndefined();
  });

  it("hides funds when explicit permissions remove funds access", () => {
    const sections = filterNavForAccess("editor", { funds: "none" });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/funds")).toBeUndefined();
  });

  it("hides payments when explicit permissions remove payments access", () => {
    const sections = filterNavForAccess("editor", { payments: "none" });
    const items = flattenNavItems(sections);

    expect(items.find((item) => item.to === "/payments")).toBeUndefined();
  });
});

describe("flattenNavItems", () => {
  it("returns a flat array of all nav items across all sections", () => {
    const items = flattenNavItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("length equals NAV_ITEM_COUNT", () => {
    expect(flattenNavItems().length).toBe(NAV_ITEM_COUNT);
  });

  it("accepts a custom sections argument", () => {
    const custom: NavSection[] = [
      { items: [{ to: "/a", label: "A", navItemId: "a", icon: () => null }] },
      {
        items: [
          { to: "/b", label: "B", navItemId: "b", icon: () => null },
          { to: "/c", label: "C", navItemId: "c", icon: () => null },
        ],
      },
    ];
    const result = flattenNavItems(custom);
    expect(result.length).toBe(3);
    expect(result.map((i: NavItem) => i.to)).toEqual(["/a", "/b", "/c"]);
  });
});

describe("NAV_ITEM_COUNT", () => {
  it("is a positive integer", () => {
    expect(typeof NAV_ITEM_COUNT).toBe("number");
    expect(NAV_ITEM_COUNT).toBeGreaterThan(0);
    expect(Number.isInteger(NAV_ITEM_COUNT)).toBe(true);
  });

  it("equals 14 — the consolidated sidebar row count", () => {
    expect(NAV_ITEM_COUNT).toBe(14);
  });

  it("equals the total number of items across all default sections", () => {
    const total = navSections.reduce((sum, section) => sum + section.items.length, 0);
    expect(NAV_ITEM_COUNT).toBe(total);
  });
});

describe("filterNavForAccess golden fixture", () => {
  // Fixed fixture — deliberately independent of the live navSections — covering
  // every filtering shape isNavItemVisible/filterNavForAccess must handle:
  //   - rolesOnlyItem: filtered purely by item.roles membership
  //   - featureItem: filtered by feature + minimumPermission (canAccessFeature)
  //   - requiredItem: filtered by requiredPermissions (two entries, "every" semantics)
  //   - openItem: no filtering criteria at all — always visible
  //   - "Admin Only" section: filters to empty for non-admin roles and must be dropped
  const rolesOnlyItem: NavItem = {
    to: "/roles-only",
    label: "Roles Only",
    navItemId: "roles-only",
    icon: DummyIcon,
    roles: ["admin", "editor"],
  };
  const featureItem: NavItem = {
    to: "/feature-item",
    label: "Feature Item",
    navItemId: "feature-item",
    icon: DummyIcon,
    feature: "donors",
    minimumPermission: "edit",
  };
  const requiredItem: NavItem = {
    to: "/required-item",
    label: "Required Item",
    navItemId: "required-item",
    icon: DummyIcon,
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "programs", minimumPermission: "view" },
    ],
  };
  const openItem: NavItem = {
    to: "/open-item",
    label: "Open Item",
    navItemId: "open-item",
    icon: DummyIcon,
  };
  const adminOnlyItem: NavItem = {
    to: "/admin-only",
    label: "Admin Only",
    navItemId: "admin-only",
    icon: DummyIcon,
    roles: ["admin"],
  };

  const fixture: NavSection[] = [
    {
      label: "Section A",
      items: [rolesOnlyItem, featureItem, requiredItem, openItem],
    },
    {
      label: "Admin Only Section",
      items: [adminOnlyItem],
    },
  ];

  function toValues(role: AppRole, permissions?: Parameters<typeof filterNavForAccess>[1]) {
    return flattenNavItems(filterNavForAccess(role, permissions, fixture)).map((i) => i.to);
  }

  it("admin sees every item in both sections", () => {
    expect(toValues("admin")).toEqual([
      "/roles-only",
      "/feature-item",
      "/required-item",
      "/open-item",
      "/admin-only",
    ]);
  });

  it("editor sees Section A in full but Admin Only Section is dropped entirely", () => {
    expect(toValues("editor")).toEqual([
      "/roles-only",
      "/feature-item",
      "/required-item",
      "/open-item",
    ]);
  });

  it("viewer fails roles-only and feature-item but passes required-item and open-item; Admin Only Section dropped", () => {
    expect(toValues("viewer")).toEqual(["/required-item", "/open-item"]);
  });

  it("auditor fails roles-only, feature-item, and required-item (programs denied); only open-item remains", () => {
    expect(toValues("auditor")).toEqual(["/open-item"]);
  });

  it("permission override: granting viewer donors edit unlocks feature-item without touching roles-only", () => {
    expect(toValues("viewer", { donors: "edit" })).toEqual([
      "/feature-item",
      "/required-item",
      "/open-item",
    ]);
  });

  it("permission override: revoking editor donors access removes feature-item but keeps roles-only and required-item", () => {
    expect(toValues("editor", { donors: "none" })).toEqual([
      "/roles-only",
      "/required-item",
      "/open-item",
    ]);
  });

  it("permission override: auditor role caps ignore overrides, so required-item stays hidden even when programs is granted", () => {
    expect(toValues("auditor", { programs: "manage" })).toEqual(["/open-item"]);
  });
});

describe("isNavItemVisible", () => {
  const rolesOnlyItem: NavItem = {
    to: "/roles-only",
    label: "Roles Only",
    navItemId: "roles-only",
    icon: DummyIcon,
    roles: ["admin"],
  };
  const featureItem: NavItem = {
    to: "/feature-item",
    label: "Feature Item",
    navItemId: "feature-item",
    icon: DummyIcon,
    feature: "donors",
    minimumPermission: "edit",
  };
  const requiredItem: NavItem = {
    to: "/required-item",
    label: "Required Item",
    navItemId: "required-item",
    icon: DummyIcon,
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "programs", minimumPermission: "view" },
    ],
  };
  const openItem: NavItem = {
    to: "/open-item",
    label: "Open Item",
    navItemId: "open-item",
    icon: DummyIcon,
  };

  it("returns true for any item when role is undefined", () => {
    expect(isNavItemVisible(rolesOnlyItem, undefined)).toBe(true);
    expect(isNavItemVisible(featureItem, undefined)).toBe(true);
    expect(isNavItemVisible(requiredItem, undefined)).toBe(true);
    expect(isNavItemVisible(openItem, undefined)).toBe(true);
  });

  it("requiredPermissions takes precedence over feature/minimumPermission and roles", () => {
    const combined: NavItem = {
      to: "/combined",
      label: "Combined",
      navItemId: "combined",
      icon: DummyIcon,
      // Both roles and feature/minimumPermission would pass auditor through —
      // auditor is in roles, and auditor's accounting level ("view") satisfies
      // feature/minimumPermission — but requiredPermissions must still govern
      // and fail because auditor has "none" for programs.
      roles: ["auditor"],
      feature: "accounting",
      minimumPermission: "view",
      requiredPermissions: [{ feature: "programs", minimumPermission: "view" }],
    };
    expect(isNavItemVisible(combined, "auditor")).toBe(false);
    expect(isNavItemVisible(combined, "admin")).toBe(true);
  });

  it("falls back to feature/minimumPermission when requiredPermissions is absent", () => {
    expect(isNavItemVisible(featureItem, "editor")).toBe(true);
    expect(isNavItemVisible(featureItem, "viewer")).toBe(false);
  });

  it("falls back to roles membership when neither requiredPermissions nor feature/minimumPermission is set", () => {
    expect(isNavItemVisible(rolesOnlyItem, "admin")).toBe(true);
    expect(isNavItemVisible(rolesOnlyItem, "editor")).toBe(false);
  });

  it("returns true when none of roles, feature/minimumPermission, or requiredPermissions are set", () => {
    expect(isNavItemVisible(openItem, "auditor")).toBe(true);
  });
});
