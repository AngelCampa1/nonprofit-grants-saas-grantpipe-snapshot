import { describe, expect, it } from "vitest";

import { isActiveSiteNavHref, isActiveSiteNavItem } from "./site-nav-active";

describe("isActiveSiteNavHref", () => {
  it.each([
    ["/resources", "/resources"],
    ["/resources/", "/resources"],
    ["/resources/guides/grant-compliance-101", "/resources"],
    ["/resources/best/best-grant-management-software", "/resources"],
    ["/resources/topics/grant-compliance", "/resources"],
    ["/compare/pricing/bloomerang-pricing", "/compare"],
    ["/compare/alternatives/bloomerang", "/compare"],
    ["/compare/versus/grantpipe-vs-bloomerang", "/compare"],
    ["/pricing/#plans", "/pricing"],
    ["/pricing?plan=starter", "/pricing"],
  ])("marks %s active for parent nav href %s", (currentPath, href) => {
    expect(isActiveSiteNavHref(currentPath, href)).toBe(true);
  });

  it.each([
    ["/resourceship", "/resources"],
    ["/resources-old/guides", "/resources"],
    ["/compare-old/pricing", "/compare"],
    ["/comparison/pricing", "/compare"],
    ["/product", "/"],
    [undefined, "/resources"],
    ["/resources", undefined],
    ["", "/resources"],
    ["/resources", ""],
    ["#plans", "/pricing"],
    ["/pricing", "#plans"],
    ["?plan=starter", "/pricing"],
    ["/pricing", "?plan=starter"],
  ])("does not mark %s active for unrelated nav href %s", (currentPath, href) => {
    expect(isActiveSiteNavHref(currentPath, href)).toBe(false);
  });
});

describe("isActiveSiteNavItem", () => {
  const resourcesNavItem = {
    label: "Resources",
    href: "/resources",
    groups: [
      {
        heading: "Discover",
        links: [
          { label: "Workflows", href: "/workflows" },
          { label: "Free Resources", href: "/free" },
          { label: "Guides", href: "/resources/guides" },
        ],
      },
      {
        heading: "By Audience",
        links: [
          { label: "By Role", href: "/for" },
          { label: "Integrations", href: "/integrations" },
          { label: "Compare", href: "/compare" },
        ],
      },
    ],
  };
  const compareNavItem = {
    label: "Compare",
    href: "/compare",
  };
  const topLevelNavItems = [resourcesNavItem, compareNavItem];

  it.each([
    "/workflows",
    "/workflows/prepare-sefa-for-single-audit",
    "/free/grant-compliance-checklist",
    "/for/development-director",
    "/integrations/quickbooks",
    "/resources/guides/compliance-first-grant-management-system",
  ])("marks Resources active when %s belongs to its megamenu", (currentPath) => {
    expect(isActiveSiteNavItem(currentPath, resourcesNavItem, topLevelNavItems)).toBe(true);
  });

  it.each([
    "/workflow-old/foo",
    "/freebie/grant-checklist",
    "/forecasting",
    "/pricing",
    "/compare/alternatives/bloomerang",
  ])("does not mark Resources active for unrelated path %s", (currentPath) => {
    expect(isActiveSiteNavItem(currentPath, resourcesNavItem, topLevelNavItems)).toBe(false);
  });

  it("marks the dedicated top-level item active when a megamenu child duplicates another top-level href", () => {
    expect(
      isActiveSiteNavItem("/compare/alternatives/bloomerang", compareNavItem, topLevelNavItems),
    ).toBe(true);
  });

  it("returns false for an item with no groups when its own href does not match", () => {
    expect(isActiveSiteNavItem("/resources", compareNavItem, topLevelNavItems)).toBe(false);
  });

  it("uses explicit active paths as the ownership source when provided", () => {
    const productItem = {
      label: "Product",
      href: "/product",
      activePaths: ["/product", "/features"],
      groups: [
        {
          heading: "Proof paths",
          links: [{ label: "Workflows", href: "/workflows" }],
        },
      ],
    };
    const resourcesItem = {
      label: "Resources",
      href: "/resources",
      activePaths: ["/resources", "/workflows"],
      groups: [
        {
          heading: "Discover",
          links: [{ label: "Workflows", href: "/workflows" }],
        },
      ],
    };

    expect(isActiveSiteNavItem("/workflows/test", productItem, [productItem, resourcesItem])).toBe(
      false,
    );
    expect(
      isActiveSiteNavItem("/workflows/test", resourcesItem, [productItem, resourcesItem]),
    ).toBe(true);
    expect(isActiveSiteNavItem("/features/audit", productItem, [productItem, resourcesItem])).toBe(
      true,
    );
  });

  it("ignores empty grouped link hrefs when checking top-level collisions", () => {
    const navItemWithEmptyChildHref = {
      label: "Resources",
      href: "/resources",
      groups: [{ heading: "Broken", links: [{ label: "Empty", href: "" }] }],
    };

    expect(
      isActiveSiteNavItem("/free/grant-compliance-checklist", navItemWithEmptyChildHref, [
        navItemWithEmptyChildHref,
      ]),
    ).toBe(false);
  });
});
