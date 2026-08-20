import { describe, expect, it } from "vitest";

import {
  buildMarketingLinkGraph,
  getBrokenInternalLinks,
  getOrphanedRoutes,
} from "./lib/marketing-link-graph";

describe("marketing internal link graph", () => {
  const graph = buildMarketingLinkGraph();

  function expectLink(sourceSuffix: string, href: string): void {
    expect(
      graph.links.some((link) => link.source.endsWith(sourceSuffix) && link.href === href),
      `${sourceSuffix} should link to ${href}`,
    ).toBe(true);
  }

  it("discovers the public marketing route inventory", () => {
    expect(graph.routes.size).toBeGreaterThan(350);
    expect(graph.routes).toContain("/resources/topics/nonprofit-crm");
    expect(graph.routes).toContain("/resources/topics/donor-operations");
    expect(graph.routes).toContain("/compare/alternatives/bloomerang");
    expect(graph.routes).toContain("/compare/grantpipe-vs-bloomerang");
    expect(graph.routes).toContain("/compare/grantpipe-vs-submittable");
    expect(graph.routes).toContain("/free");
    expect(graph.routes).toContain("/free/grant-compliance-checklist");
    expect(graph.routes).toContain("/free/nonprofit-crm-cost-calculator");
    expect(graph.routes).toContain("/workflows/payroll-allocation-across-grants");
    expect(graph.routes).toContain("/AGENTS.md");
    expect(graph.routes).toContain("/pricing.txt");
  });

  it("keeps every declared internal link pointed at a real route or approved external app URL", () => {
    const brokenLinks = getBrokenInternalLinks(graph);

    expect(
      brokenLinks.map((link) => `${link.source}: ${link.href}`),
      "Broken internal marketing links",
    ).toEqual([]);
  });

  it("treats absolute grantpipe.com URLs as internal routes", () => {
    const brokenLinks = getBrokenInternalLinks({
      ...graph,
      links: [
        { source: "absolute-url-ok", href: "https://grantpipe.com/resources" },
        {
          source: "absolute-url-broken",
          href: "https://grantpipe.com/resources/not-a-real-page",
        },
      ],
    });

    expect(brokenLinks).toEqual([
      {
        source: "absolute-url-broken",
        href: "https://grantpipe.com/resources/not-a-real-page",
      },
    ]);
  });

  it("keeps every crawlable marketing route reachable from at least one other page", () => {
    const orphanedRoutes = getOrphanedRoutes(graph);

    expect(orphanedRoutes, "Orphaned public marketing routes").toEqual([]);
  });

  it("links dedicated Bloomerang and Submittable comparison pages from the compare hub", () => {
    expect(graph.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "pages/compare/index.astro",
          href: "/compare/grantpipe-vs-bloomerang/",
        }),
        expect.objectContaining({
          source: "pages/compare/index.astro",
          href: "/compare/grantpipe-vs-submittable/",
        }),
      ]),
    );
  });

  it("routes high-impression SEO pages toward trial-oriented next steps", () => {
    expectLink("guides/nonprofit-crm-pricing-guide.md", "/pricing/");
    expectLink("guides/salesforce-nonprofit-cost.md", "/pricing/");
    expectLink("comparisons/salesforce-nonprofit-vs-blackbaud.md", "/pricing/");
    expectLink("pricing-breakdowns/bloomerang-pricing.md", "/pricing/");
    expectLink(
      "guides/federal-procurement-thresholds-micro-small-large.md",
      "/grant-compliance-software/",
    );
  });

  it("routes DFS-validated grant management resources toward lead magnets and BOFU pages", () => {
    expect(graph.routes).toContain("/grant-management-software");
    expect(graph.routes).toContain("/resources/guides/grant-management-software-for-nonprofits");
    expect(graph.routes).toContain("/resources/best/best-grant-management-software");

    expectLink(
      "config/grant-recipient-seo.ts",
      "/resources/guides/grant-management-software-for-nonprofits",
    );
    expectLink("config/grant-recipient-seo.ts", "/resources/best/best-grant-management-software");
    expectLink("config/grant-recipient-seo.ts", "/compare/pricing/instrumentl");

    expectLink("guides/grant-management-software-for-nonprofits.md", "/pricing/");
    expectLink("guides/grant-management-software-for-nonprofits.md", "/grant-compliance-software/");
    expectLink(
      "guides/grant-management-software-for-nonprofits.md",
      "/free/grant-compliance-checklist/",
    );

    expectLink("listicles/best-grant-management-software.md", "/pricing/");
    expectLink("listicles/best-grant-management-software.md", "/grant-compliance-software/");
    expectLink("listicles/best-grant-management-software.md", "/free/grant-compliance-checklist/");
  });
});
