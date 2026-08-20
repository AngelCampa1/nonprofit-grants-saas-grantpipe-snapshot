import type { CollectionEntry } from "astro:content";
import { describe, expect, it } from "vitest";

import {
  buildTopicHubSections,
  buildTopicHubContentItems,
  buildTopicHubItems,
  getTopicHubSummaries,
  topicHubs,
} from "./topic-hubs";

function makeEntry(collection: string, slug: string, overrides = {}) {
  return {
    id: `${slug}.md`,
    body: "",
    collection,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/example"],
      targetPersona: ["Finance"],
      ...overrides,
    },
  };
}

function emptyCollections() {
  return {
    alternatives: [],
    comparisons: [],
    pricingBreakdowns: [],
    listicles: [],
    guides: [],
    statePages: [],
    verticalPages: [],
    leadMagnets: [],
    personas: [],
    workflows: [],
    glossary: [],
    features: [],
    integrations: [],
    faqHubs: [],
    benchmarks: [],
  };
}

describe("topic hub definitions", () => {
  it("defines the topic-only resource pillar hubs", () => {
    expect(topicHubs.map((hub) => hub.slug)).toEqual([
      "nonprofit-crm",
      "donor-operations",
      "grant-management",
      "grant-compliance",
      "restricted-fund-accounting",
    ]);
  });

  it("exposes category summaries for every topic hub", () => {
    expect(getTopicHubSummaries()).toEqual(
      topicHubs.map((hub) => ({
        name: hub.title,
        description: hub.description,
        href: `/resources/topics/${hub.slug}`,
        count: hub.itemCount,
      })),
    );
  });

  it("uses derived topicCluster counts when collections are provided", () => {
    const summaries = getTopicHubSummaries({
      ...emptyCollections(),
      guides: [
        makeEntry("guides", "crm-guide", {
          topicCluster: "nonprofit-crm",
        }) as CollectionEntry<"guides">,
        makeEntry("guides", "donor-guide", {
          topicCluster: "donor-operations",
        }) as CollectionEntry<"guides">,
      ],
    });

    expect(summaries.find((hub) => hub.href === "/resources/topics/nonprofit-crm")?.count).toBe(1);
    expect(summaries.find((hub) => hub.href === "/resources/topics/donor-operations")?.count).toBe(
      1,
    );
    expect(summaries.find((hub) => hub.href === "/resources/topics/grant-management")?.count).toBe(
      2,
    );
  });

  it("builds content items for every supported public collection", () => {
    const items = buildTopicHubContentItems({
      alternatives: [
        makeEntry("alternatives", "bloomerang", {
          competitor: { slug: "bloomerang", name: "Bloomerang" },
        }) as CollectionEntry<"alternatives">,
      ],
      comparisons: [
        makeEntry("comparisons", "grantpipe-vs-bloomerang") as CollectionEntry<"comparisons">,
      ],
      pricingBreakdowns: [
        makeEntry("pricing-breakdowns", "blackbaud", {
          competitor: { slug: "blackbaud", name: "Blackbaud" },
        }) as CollectionEntry<"pricing-breakdowns">,
      ],
      listicles: [makeEntry("listicles", "best-nonprofit-crm") as CollectionEntry<"listicles">],
      guides: [makeEntry("guides", "grant-compliance-101") as CollectionEntry<"guides">],
      statePages: [makeEntry("state-pages", "texas") as CollectionEntry<"state-pages">],
      verticalPages: [
        makeEntry("vertical-pages", "food-banks") as CollectionEntry<"vertical-pages">,
      ],
      leadMagnets: [
        makeEntry(
          "lead-magnets",
          "grant-compliance-checklist",
        ) as unknown as CollectionEntry<"lead-magnets">,
      ],
      personas: [makeEntry("personas", "grant-writers") as CollectionEntry<"personas">],
      workflows: [
        makeEntry("workflows", "monthly-giving", {
          timeEstimate: "45 minutes",
        }) as CollectionEntry<"workflows">,
      ],
      glossary: [makeEntry("glossary", "restricted-funds") as CollectionEntry<"glossary">],
      features: [makeEntry("features", "donor-segmentation") as CollectionEntry<"features">],
      integrations: [makeEntry("integrations", "zapier") as CollectionEntry<"integrations">],
      faqHubs: [makeEntry("faq-hubs", "california-nonprofit-faq") as CollectionEntry<"faq-hubs">],
      benchmarks: [
        makeEntry("benchmarks", "nonprofit-crm-satisfaction") as CollectionEntry<"benchmarks">,
      ],
    });

    expect(items.get("/compare/alternatives/bloomerang")?.title).toBe("bloomerang title");
    expect(items.get("/compare/versus/grantpipe-vs-bloomerang")?.title).toBe(
      "grantpipe-vs-bloomerang title",
    );
    expect(items.get("/compare/pricing/blackbaud")?.title).toBe("blackbaud title");
    expect(items.get("/resources/best/best-nonprofit-crm")?.title).toBe("best-nonprofit-crm title");
    expect(items.get("/resources/guides/grant-compliance-101")?.title).toBe(
      "grant-compliance-101 title",
    );
    expect(items.get("/nonprofit-software/texas")?.title).toBe("texas title");
    expect(items.get("/solutions/food-banks")?.title).toBe("food-banks title");
    expect(items.get("/free/grant-compliance-checklist")?.title).toBe(
      "grant-compliance-checklist title",
    );
    expect(items.get("/for/grant-writers")?.title).toBe("grant-writers title");
    expect(items.get("/workflows/monthly-giving")?.metadata?.timeEstimate).toBe("45 minutes");
    expect(items.get("/glossary/restricted-funds")?.title).toBe("restricted-funds title");
    expect(items.get("/features/donor-segmentation")?.title).toBe("donor-segmentation title");
    expect(items.get("/integrations/zapier")?.title).toBe("zapier title");
    expect(items.get("/resources/faq/california-nonprofit-faq")?.title).toBe(
      "california-nonprofit-faq title",
    );
    expect(items.get("/resources/benchmarks/nonprofit-crm-satisfaction")?.title).toBe(
      "nonprofit-crm-satisfaction title",
    );
    expect(items.get("/grant-management-software")?.title).toBe(
      "Grant Management Software for Nonprofits",
    );
  });

  it("derives hub items from topicCluster metadata", () => {
    const crmGuide = makeEntry("guides", "crm-guide", {
      topicCluster: "nonprofit-crm",
    }) as CollectionEntry<"guides">;
    const donorWorkflow = makeEntry("workflows", "donor-upgrade", {
      topicCluster: "donor-operations",
      timeEstimate: "2 hours",
    }) as CollectionEntry<"workflows">;
    const complianceChecklist = makeEntry("lead-magnets", "compliance-checklist", {
      topicCluster: "grant-compliance",
    }) as unknown as CollectionEntry<"lead-magnets">;

    const hubItems = buildTopicHubItems({
      ...emptyCollections(),
      guides: [crmGuide],
      workflows: [donorWorkflow],
      leadMagnets: [complianceChecklist],
    });

    expect(hubItems.get("nonprofit-crm")?.map((item) => item.href)).toContain(
      "/resources/guides/crm-guide",
    );
    expect(hubItems.get("donor-operations")?.map((item) => item.href)).toEqual([
      "/workflows/donor-upgrade",
    ]);
    expect(hubItems.get("grant-compliance")?.map((item) => item.href)).toContain(
      "/free/compliance-checklist",
    );
    expect(hubItems.get("grant-management")?.map((item) => item.href)).toEqual([
      "/grant-management-software",
      "/grant-tracking-software",
    ]);
  });

  it("returns the manual grant-category pages when collections are empty", () => {
    const items = buildTopicHubContentItems(emptyCollections());

    expect(items.has("/grant-management-software")).toBe(true);
    expect(items.has("/grant-compliance-software")).toBe(true);
    expect(items.has("/grant-tracking-software")).toBe(true);
    expect(items.has("/restricted-fund-tracking-software")).toBe(true);
    expect(items.has("/grant-reporting-software")).toBe(true);
  });

  it("handles omitted optional collections and ignores unsupported topic clusters", () => {
    const hubItems = buildTopicHubItems({
      alternatives: [
        makeEntry("alternatives", "bloomerang", {
          competitor: { slug: "bloomerang", name: "Bloomerang" },
          topicCluster: "not-a-topic",
        }) as CollectionEntry<"alternatives">,
      ],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [
        makeEntry("guides", "compliance-guide", {
          topicCluster: "grant-compliance",
        }) as CollectionEntry<"guides">,
      ],
      statePages: [],
      verticalPages: [],
      leadMagnets: [],
    });

    expect(hubItems.get("grant-compliance")?.map((item) => item.href)).toContain(
      "/resources/guides/compliance-guide",
    );
    expect([...hubItems.values()].flatMap((items) => items.map((item) => item.href))).not.toContain(
      "/compare/alternatives/bloomerang",
    );
  });

  it("groups large topic hubs by buyer stage instead of returning one flat article dump", () => {
    const items = [
      ...Array.from({ length: 20 }, (_, index) => ({
        title: `Guide ${index}`,
        description: "Guide description",
        href: `/resources/guides/guide-${index}`,
        buyerStage: "tofu" as const,
        publishedAt: "2026-01-01",
        updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
        relatedPages: [],
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        title: `Compare ${index}`,
        description: "Compare description",
        href: `/compare/versus/grantpipe-vs-tool-${index}`,
        buyerStage: "mofu" as const,
        publishedAt: "2026-01-01",
        updatedAt: `2026-02-${String(index + 1).padStart(2, "0")}`,
        relatedPages: [],
      })),
      {
        title: "Pricing",
        description: "Pricing description",
        href: "/pricing",
        buyerStage: "bofu" as const,
        publishedAt: "2026-01-01",
        updatedAt: "2026-03-01",
        relatedPages: [],
      },
    ];

    const sections = buildTopicHubSections(items);

    expect(sections.map((section) => section.buyerStage)).toEqual(["tofu", "mofu", "bofu"]);
    const tofuSection = sections.find((section) => section.buyerStage === "tofu");

    expect(tofuSection?.stageLabel).toBe("Learn");
    expect(tofuSection?.items).toHaveLength(9);
    expect(tofuSection?.overflowItems).toHaveLength(11);
    expect(tofuSection?.totalCount).toBe(20);
    expect(tofuSection?.overflowItems.map((item) => item.href)).toContain(
      "/resources/guides/guide-0",
    );
    expect(sections.find((section) => section.buyerStage === "mofu")?.items).toHaveLength(4);
    expect(sections.find((section) => section.buyerStage === "bofu")?.browseHref).toBe("/pricing");
  });
});
