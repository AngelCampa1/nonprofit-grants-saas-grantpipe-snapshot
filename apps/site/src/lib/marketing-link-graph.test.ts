import { describe, expect, it } from "vitest";

import {
  comparisonPath,
  extractLinks,
  extractNestedSlug,
  getBrokenInternalLinks,
  getOrphanedRoutes,
  isLocalSourceFile,
  normalizeRoute,
  type MarketingLinkGraph,
} from "./marketing-link-graph";

describe("marketing link graph helpers", () => {
  it("normalizes local and grantpipe.com routes", () => {
    expect(normalizeRoute("https://www.grantpipe.com/resources/?utm=1#top")).toBe("/resources");
    expect(normalizeRoute("/resources/guides/#intro")).toBe("/resources/guides");
    expect(normalizeRoute("")).toBe("/");
    expect(normalizeRoute("/")).toBe("/");
  });

  it("extracts nested frontmatter slugs", () => {
    const source = `---
competitor:
  name: Bloomerang
  slug: bloomerang
title: Example
---`;

    expect(extractNestedSlug(source, "competitor")).toBe("bloomerang");
    expect(extractNestedSlug(source, "missing")).toBeNull();
    expect(extractNestedSlug("title: no frontmatter", "competitor")).toBeNull();
  });

  it("returns null when a nested slug block ends before a slug is found", () => {
    const source = `---
competitor:
  name: Bloomerang
---`;

    expect(extractNestedSlug(source, "competitor")).toBeNull();
  });

  it("returns null when a nested slug block is immediately closed by a root field", () => {
    const source = `---
competitor:
title: Example
---`;

    expect(extractNestedSlug(source, "competitor")).toBeNull();
  });

  it("detects missing local source files", () => {
    expect(isLocalSourceFile("/tmp/grantpipe-source-file-that-does-not-exist.md")).toBe(false);
  });

  it("builds comparison paths with GrantPipe first when present", () => {
    const grantpipeFirst = `---
competitorA:
  slug: grantpipe
competitorB:
  slug: bloomerang
---`;
    const grantpipeSecond = `---
competitorA:
  slug: bloomerang
competitorB:
  slug: grantpipe
---`;
    const peerComparison = `---
competitorA:
  slug: bloomerang
competitorB:
  slug: donorperfect
---`;

    expect(comparisonPath(grantpipeFirst)).toBe("/compare/versus/grantpipe-vs-bloomerang");
    expect(comparisonPath(grantpipeSecond)).toBe("/compare/versus/grantpipe-vs-bloomerang");
    expect(comparisonPath(peerComparison)).toBe("/compare/versus/bloomerang-vs-donorperfect");
    expect(comparisonPath("---\ncompetitorA:\n  slug: bloomerang\n---")).toBeNull();
  });

  it("extracts markdown, quoted, and href internal links", () => {
    const links = extractLinks(`
[local](/resources/guides/grant-reporting-101)
[absolute](https://grantpipe.com/resources)
const local = "/pricing";
const absolute = "https://www.grantpipe.com/free";
<a href="/compare">Compare</a>
<a href={"https://grantpipe.com/product"}>Product</a>
`);

    expect(links).toEqual([
      "/resources/guides/grant-reporting-101",
      "https://grantpipe.com/resources",
      "/pricing",
      "/compare",
      "https://www.grantpipe.com/free",
      "https://grantpipe.com/product",
      "/compare",
      "https://grantpipe.com/product",
    ]);
  });

  it("filters broken links while allowing external URLs and approved non-routes", () => {
    const graph: MarketingLinkGraph = {
      routes: new Set(["/", "/resources", "/product"]),
      links: [
        { source: "ok", href: "/resources" },
        { source: "external", href: "https://example.com/nope" },
        { source: "login", href: "/login" },
        { source: "download", href: "/downloads/grant-compliance-checklist.pdf" },
        { source: "asset", href: "/social-card.png" },
        { source: "absolute-ok", href: "https://grantpipe.com/product/" },
        { source: "broken", href: "/missing" },
      ],
      inboundCounts: new Map(),
    };

    expect(getBrokenInternalLinks(graph)).toEqual([{ source: "broken", href: "/missing" }]);
  });

  it("ignores root and crawl-excluded routes when finding orphaned routes", () => {
    const graph: MarketingLinkGraph = {
      routes: new Set([
        "/",
        "/404",
        "/llms.txt",
        "/resources",
        "/product",
        "/missing-count",
        "/noindex-alias",
      ]),
      links: [],
      inboundCounts: new Map([
        ["/resources", 1],
        ["/product", 0],
      ]),
      crawlExcludedRoutes: new Set(["/noindex-alias"]),
    };

    expect(getOrphanedRoutes(graph)).toEqual(["/missing-count", "/product"]);
  });

  it("registers nested city-page routes as discoverable from the nonprofit-software hub", async () => {
    const { buildMarketingLinkGraph } = await import("./marketing-link-graph");
    const graph = buildMarketingLinkGraph();
    expect(graph.routes).toContain("/nonprofit-software/illinois/chicago");
    expect(graph.routes).toContain("/nonprofit-software/california/los-angeles");
    expect(graph.routes).toContain("/nonprofit-software/new-york/new-york-city");
    expect(graph.inboundCounts.get("/nonprofit-software/illinois/chicago")).toBeGreaterThan(0);
  });

  it("detects noindex static page sources as crawl-excluded routes", async () => {
    const { buildMarketingLinkGraph } = await import("./marketing-link-graph");
    const graph = buildMarketingLinkGraph();

    expect([...(graph.crawlExcludedRoutes ?? [])]).toEqual(
      expect.arrayContaining([
        "/grant/compliance",
        "/grant/management",
        "/grant/reporting",
        "/granthub/migration",
        "/restricted/funds",
      ]),
    );
    expect(getOrphanedRoutes(graph)).not.toEqual(
      expect.arrayContaining([
        "/grant/compliance",
        "/grant/management",
        "/grant/reporting",
        "/granthub/migration",
        "/restricted/funds",
      ]),
    );
  });
});
