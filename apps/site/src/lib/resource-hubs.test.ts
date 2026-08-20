import { describe, expect, it } from "vitest";

import { personas } from "../config/personas";
import {
  buildResourceHubSummaries,
  buildResourceHubItems,
  getResourcesMegamenuGroups,
  resourceHubStageLabels,
  resourceHubs,
  type ResourceHubCollections,
} from "./resource-hubs";
import { topicHubs } from "./topic-hubs";

function makeEntry(collection: string, slug: string, overrides = {}) {
  return {
    id: `${slug}.md`,
    collection,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/example"],
      ...overrides,
    },
  };
}

const fixtureCollections: ResourceHubCollections = {
  alternatives: [
    makeEntry("alternatives", "bloomerang-alternative", {
      competitor: { slug: "bloomerang" },
    }) as unknown as ResourceHubCollections["alternatives"][number],
  ],
  comparisons: [
    makeEntry("comparisons", "grantpipe-vs-bloomerang", {
      competitorA: { slug: "grantpipe" },
      competitorB: { slug: "bloomerang" },
    }) as unknown as ResourceHubCollections["comparisons"][number],
    makeEntry("comparisons", "instrumentl-vs-grantpipe", {
      competitorA: { slug: "instrumentl" },
      competitorB: { slug: "grantpipe" },
    }) as unknown as ResourceHubCollections["comparisons"][number],
    makeEntry("comparisons", "blackbaud-vs-bloomerang", {
      competitorA: { slug: "blackbaud" },
      competitorB: { slug: "bloomerang" },
    }) as unknown as ResourceHubCollections["comparisons"][number],
  ],
  pricingBreakdowns: [
    makeEntry("pricing-breakdowns", "blackbaud-pricing", {
      competitor: { slug: "blackbaud" },
    }) as unknown as ResourceHubCollections["pricingBreakdowns"][number],
  ],
  listicles: [
    makeEntry(
      "listicles",
      "best-nonprofit-crm",
    ) as unknown as ResourceHubCollections["listicles"][number],
  ],
  guides: [
    makeEntry(
      "guides",
      "grant-compliance-101",
    ) as unknown as ResourceHubCollections["guides"][number],
  ],
  statePages: [
    makeEntry("state-pages", "texas") as unknown as ResourceHubCollections["statePages"][number],
  ],
  cityPages: [
    makeEntry("city-pages", "chicago", {
      stateSlug: "illinois",
      citySlug: "chicago",
    }) as unknown as NonNullable<ResourceHubCollections["cityPages"]>[number],
  ],
  verticalPages: [
    makeEntry(
      "vertical-pages",
      "food-banks",
    ) as unknown as ResourceHubCollections["verticalPages"][number],
  ],
  leadMagnets: [
    makeEntry(
      "lead-magnets",
      "grant-compliance-checklist",
    ) as unknown as ResourceHubCollections["leadMagnets"][number],
  ],
  personas: [
    makeEntry("personas", "executive-directors") as unknown as NonNullable<
      ResourceHubCollections["personas"]
    >[number],
  ],
  workflows: [
    makeEntry("workflows", "grant-closeout", {
      timeEstimate: "45 minutes",
    }) as unknown as NonNullable<ResourceHubCollections["workflows"]>[number],
    makeEntry("workflows", "board-reporting") as unknown as NonNullable<
      ResourceHubCollections["workflows"]
    >[number],
  ],
  glossary: [
    makeEntry("glossary", "restricted-funds") as unknown as NonNullable<
      ResourceHubCollections["glossary"]
    >[number],
  ],
  features: [
    makeEntry("features", "restricted-fund-tracking") as unknown as NonNullable<
      ResourceHubCollections["features"]
    >[number],
  ],
  integrations: [
    makeEntry("integrations", "quickbooks") as unknown as NonNullable<
      ResourceHubCollections["integrations"]
    >[number],
  ],
  faqHubs: [
    makeEntry("faq-hubs", "faq-grant-compliance") as unknown as NonNullable<
      ResourceHubCollections["faqHubs"]
    >[number],
  ],
  benchmarks: [
    makeEntry("benchmarks", "grant-compliance-benchmarks-2026") as unknown as NonNullable<
      ResourceHubCollections["benchmarks"]
    >[number],
  ],
};

describe("resource hubs", () => {
  it("defines a compact strategic hub set for the Resources megamenu", () => {
    expect(resourceHubs.map((hub) => hub.href)).toEqual([
      "/resources/topics",
      "/resources/guides",
      "/compare",
      "/free",
      "/nonprofit-software",
      "/solutions",
      "/for",
      "/workflows",
      "/integrations",
      "/resources/reference",
      "/resources/faq",
      "/resources/benchmarks",
    ]);
  });

  it("assigns every strategic hub a buyer stage and next funnel step", () => {
    const expectedByHref = new Map([
      ["/resources/topics", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/resources/guides", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/compare", { buyerStage: "mofu", primaryCta: "pricing" }],
      ["/free", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/nonprofit-software", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/solutions", { buyerStage: "mofu", primaryCta: "trial" }],
      ["/for", { buyerStage: "mofu", primaryCta: "trial" }],
      ["/workflows", { buyerStage: "mofu", primaryCta: "trial" }],
      ["/integrations", { buyerStage: "mofu", primaryCta: "pricing" }],
      ["/resources/reference", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/resources/faq", { buyerStage: "tofu", primaryCta: "lead-magnet" }],
      ["/resources/benchmarks", { buyerStage: "mofu", primaryCta: "compare" }],
    ]);

    for (const hub of resourceHubs) {
      expect({
        buyerStage: hub.buyerStage,
        primaryCta: hub.primaryCta,
      }).toEqual(expectedByHref.get(hub.href));
      expect(hub.nextStepHref).toMatch(/^\/(free|pricing|product|compare)/);
    }
  });

  it("uses reader-facing labels for resource hub buyer stages", () => {
    expect(resourceHubStageLabels).toEqual({
      tofu: "Learn",
      mofu: "Compare",
      bofu: "Decide",
    });
  });

  it("keeps every Resources megamenu link pointed at a strategic hub or persona route", () => {
    const hubHrefs = new Set(resourceHubs.map((hub) => hub.href));
    const personaHrefs = new Set(personas.map((persona) => `/for/${persona.slug}`));
    const menuHrefs = getResourcesMegamenuGroups().flatMap((group) =>
      group.links.map((link) => link.href),
    );

    expect(menuHrefs.length).toBeGreaterThan(0);
    expect(menuHrefs.every((href) => hubHrefs.has(href) || personaHrefs.has(href))).toBe(true);
  });

  it("splits the Resources megamenu into five scannable groups ending with By Role", () => {
    const groups = getResourcesMegamenuGroups();

    expect(groups.map((g) => g.heading)).toEqual([
      "Discover",
      "Compare",
      "By Audience",
      "Reference",
    ]);
    for (const group of groups) {
      expect(group.links.length).toBeGreaterThan(0);
    }

    const hubGroupLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
    expect(hubGroupLinks).toBe(resourceHubs.length);
  });

  it("keeps role navigation compact by linking the By Role hub once", () => {
    const hrefs = getResourcesMegamenuGroups().flatMap((group) =>
      group.links.map((link) => link.href),
    );

    expect(hrefs).toContain("/for");
    for (const persona of personas) {
      expect(hrefs).not.toContain(`/for/${persona.slug}`);
    }
    expect(hrefs).toHaveLength(resourceHubs.length);
  });

  it("places every resource hub in exactly one hub megamenu group", () => {
    const allHrefs = getResourcesMegamenuGroups().flatMap((group) =>
      group.links.map((link) => link.href),
    );
    const uniqueHrefs = new Set(allHrefs);

    expect(uniqueHrefs.size).toBe(allHrefs.length);
    expect(uniqueHrefs).toEqual(new Set(resourceHubs.map((hub) => hub.href)));
  });

  it("builds exhaustive hub item lists across all public content collections", () => {
    const itemsByHub = buildResourceHubItems(fixtureCollections);

    expect(itemsByHub.get("/resources/guides")?.map((item) => item.href)).toContain(
      "/resources/guides/grant-compliance-101",
    );
    expect(itemsByHub.get("/compare")?.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        "/compare/alternatives/bloomerang",
        "/compare/versus/grantpipe-vs-bloomerang",
        "/compare/versus/grantpipe-vs-instrumentl",
        "/compare/versus/blackbaud-vs-bloomerang",
        "/compare/pricing/blackbaud",
        "/resources/best/best-nonprofit-crm",
      ]),
    );
    expect(itemsByHub.get("/nonprofit-software")?.map((item) => item.href)).toEqual(
      expect.arrayContaining(["/nonprofit-software/texas", "/nonprofit-software/illinois/chicago"]),
    );
    expect(itemsByHub.get("/resources/reference")?.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        "/glossary/restricted-funds",
        "/features/restricted-fund-tracking",
        "/integrations/quickbooks",
        "/resources/faq/faq-grant-compliance",
        "/resources/benchmarks/grant-compliance-benchmarks-2026",
      ]),
    );
    expect(itemsByHub.get("/integrations")?.map((item) => item.href)).toEqual([
      "/integrations/quickbooks",
    ]);
    expect(itemsByHub.get("/resources/faq")?.map((item) => item.href)).toEqual([
      "/resources/faq/faq-grant-compliance",
    ]);
    expect(itemsByHub.get("/resources/benchmarks")?.map((item) => item.href)).toEqual([
      "/resources/benchmarks/grant-compliance-benchmarks-2026",
    ]);
  });

  it("builds homepage summaries with live counts for each strategic hub", () => {
    const summaries = buildResourceHubSummaries(fixtureCollections);

    expect(summaries).toHaveLength(resourceHubs.length);
    expect(summaries.find((summary) => summary.href === "/resources/guides")?.count).toBe(1);
    expect(summaries.find((summary) => summary.href === "/compare")?.count).toBe(6);
    expect(summaries.find((summary) => summary.href === "/resources/reference")?.count).toBe(5);
    expect(summaries.map((summary) => summary.href)).toEqual(resourceHubs.map((hub) => hub.href));
  });

  it("attaches every fixture content route to at least one strategic hub", () => {
    const itemsByHub = buildResourceHubItems(fixtureCollections);
    const attachedHrefs = [
      ...new Set([...itemsByHub.values()].flatMap((items) => items.map((i) => i.href))),
    ];

    expect(attachedHrefs).toEqual(
      expect.arrayContaining([
        "/compare/alternatives/bloomerang",
        "/compare/versus/grantpipe-vs-bloomerang",
        "/compare/pricing/blackbaud",
        "/resources/best/best-nonprofit-crm",
        "/resources/guides/grant-compliance-101",
        "/nonprofit-software/texas",
        "/nonprofit-software/illinois/chicago",
        "/solutions/food-banks",
        "/free/grant-compliance-checklist",
        "/for/executive-directors",
        "/workflows/grant-closeout",
        "/workflows/board-reporting",
        "/glossary/restricted-funds",
        "/features/restricted-fund-tracking",
        "/integrations/quickbooks",
        "/resources/faq/faq-grant-compliance",
        "/resources/benchmarks/grant-compliance-benchmarks-2026",
      ]),
    );
  });

  it("keeps each topic hub reachable from the topic hub index rather than the megamenu", () => {
    const topicIndexItems =
      buildResourceHubItems(fixtureCollections).get("/resources/topics") ?? [];
    const topicIndexHrefs = topicIndexItems.map((item) => item.href);

    for (const hub of topicHubs) {
      expect(topicIndexHrefs).toContain(`/resources/topics/${hub.slug}`);
    }
  });

  it("sorts hub items newest-first by updatedAt within each hub", () => {
    const newerGuide = makeEntry("guides", "newer-guide", {
      updatedAt: "2026-06-01",
    }) as unknown as ResourceHubCollections["guides"][number];
    const olderGuide = makeEntry("guides", "older-guide", {
      updatedAt: "2025-01-01",
    }) as unknown as ResourceHubCollections["guides"][number];
    const collections: ResourceHubCollections = {
      ...fixtureCollections,
      guides: [olderGuide, newerGuide],
    };

    const items = buildResourceHubItems(collections).get("/resources/guides") ?? [];
    const hrefs = items.map((i) => i.href);

    expect(hrefs.indexOf("/resources/guides/newer-guide")).toBeLessThan(
      hrefs.indexOf("/resources/guides/older-guide"),
    );
  });

  it("sorts topics hub items newest-first including grantCategoryPages", () => {
    const items = buildResourceHubItems(fixtureCollections).get("/resources/topics") ?? [];
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.updatedAt >= items[i]!.updatedAt).toBe(true);
    }
  });
});
