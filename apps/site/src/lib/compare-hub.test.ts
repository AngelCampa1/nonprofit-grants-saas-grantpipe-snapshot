import { describe, expect, it } from "vitest";

import {
  buildCompareAlternativeHubModel,
  buildCompareHubModel,
  buildComparePricingHubModel,
  buildCompareVersusHubModel,
  compareStageCopy,
  type CompareAlternativeEntry,
  type CompareListicleEntry,
  type ComparePricingEntry,
  type CompareVersusEntry,
} from "./compare-hub";

function competitor(slug: string, name = slug): { slug: string; name: string } {
  return { slug, name };
}

function alternativeEntry(
  slug: string,
  overrides: Partial<CompareAlternativeEntry["data"]> = {},
): CompareAlternativeEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} alternative`,
      description: `${slug} alternative description`,
      buyerStage: "mofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      competitor: competitor(slug, `${slug} name`),
      targetPersona: ["executive-director"],
      ...overrides,
    },
  };
}

function versusEntry(
  slug: string,
  overrides: Partial<CompareVersusEntry["data"]> = {},
): CompareVersusEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} comparison`,
      description: `${slug} comparison description`,
      buyerStage: "mofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      competitorA: competitor("bloomerang", "Bloomerang"),
      competitorB: competitor("grantpipe", "GrantPipe"),
      targetPersona: ["executive-director"],
      ...overrides,
    },
  };
}

function pricingEntry(
  slug: string,
  overrides: Partial<ComparePricingEntry["data"]> = {},
): ComparePricingEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} pricing`,
      description: `${slug} pricing description`,
      buyerStage: "bofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      competitor: competitor(slug, `${slug} name`),
      targetPersona: ["executive-director"],
      ...overrides,
    },
  };
}

function listicleEntry(
  slug: string,
  overrides: Partial<CompareListicleEntry["data"]> = {},
): CompareListicleEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} roundup`,
      description: `${slug} roundup description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      category: "Grant management software",
      targetPersona: ["executive-director"],
      ...overrides,
    },
  };
}

describe("compare hub model", () => {
  it("builds route-family sections with counts, previews, and child hub next steps", () => {
    const model = buildCompareHubModel({
      alternatives: [alternativeEntry("bloomerang"), alternativeEntry("donorperfect")],
      comparisons: [versusEntry("bloomerang-vs-grantpipe")],
      pricingBreakdowns: [pricingEntry("blackbaud")],
      roundups: [listicleEntry("best-grant-management-software")],
    });

    expect(model.familySections.map((section) => section.slug)).toEqual([
      "alternatives",
      "versus",
      "pricing",
      "roundups",
    ]);
    expect(model.familySections.map((section) => section.totalCount)).toEqual([2, 1, 1, 1]);
    expect(model.familySections[0]?.href).toBe("/compare/alternatives");
    expect(model.familySections[1]?.href).toBe("/compare/versus");
    expect(model.familySections[2]?.href).toBe("/compare/pricing");
    expect(model.familySections[3]?.href).toBe("/resources/best");
    expect(model.familySections[0]?.previewItems.map((item) => item.href)).toEqual([
      "/compare/alternatives/bloomerang",
      "/compare/alternatives/donorperfect",
    ]);
  });

  it("normalizes head-to-head links with GrantPipe first when present", () => {
    const model = buildCompareHubModel({
      alternatives: [],
      comparisons: [
        versusEntry("bloomerang-vs-grantpipe", {
          competitorA: competitor("bloomerang", "Bloomerang"),
          competitorB: competitor("grantpipe", "GrantPipe"),
        }),
        versusEntry("donorperfect-vs-neon", {
          competitorA: competitor("donorperfect", "DonorPerfect"),
          competitorB: competitor("neon", "Neon"),
        }),
      ],
      pricingBreakdowns: [],
      roundups: [],
    });

    expect(model.familySections[0]?.previewItems.map((item) => item.href)).toEqual([
      "/compare/versus/grantpipe-vs-bloomerang",
      "/compare/versus/donorperfect-vs-neon",
    ]);
  });

  it("groups comparison pages by topic and stage with clear next steps", () => {
    const model = buildCompareHubModel({
      alternatives: [
        alternativeEntry("crm-tool", {
          title: "CRM alternative",
          topicCluster: "nonprofit-crm",
        }),
      ],
      comparisons: [
        versusEntry("fund-accounting", {
          title: "Fund accounting comparison",
          topicCluster: "restricted-fund-accounting",
        }),
      ],
      pricingBreakdowns: [
        pricingEntry("audit-tool", {
          title: "Audit software pricing",
          buyerStage: "bofu",
        }),
      ],
      roundups: [listicleEntry("grant-tools", { buyerStage: "tofu" })],
    });

    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual([
      "nonprofit-crm",
      "grant-management",
      "grant-compliance",
      "restricted-fund-accounting",
    ]);
    expect(model.stageSections.map((section) => section.buyerStage)).toEqual([
      "tofu",
      "mofu",
      "bofu",
    ]);
    expect(model.stageSections[0]?.nextStepHref).toBe("/resources/topics");
    expect(model.stageSections[1]?.nextStepHref).toBe("/compare/versus");
    expect(model.stageSections[2]?.nextStepHref).toBe("/pricing");
  });

  it("limits long previews and reports overflow", () => {
    const model = buildCompareHubModel({
      alternatives: [
        alternativeEntry("alt-1"),
        alternativeEntry("alt-2"),
        alternativeEntry("alt-3"),
        alternativeEntry("alt-4"),
        alternativeEntry("alt-5"),
      ],
      comparisons: [],
      pricingBreakdowns: [],
      roundups: [],
    });

    expect(model.familySections[0]?.previewItems).toHaveLength(4);
    expect(model.familySections[0]?.overflowCount).toBe(1);
  });

  it("builds child hub models for each compare route family", () => {
    const alternatives = buildCompareAlternativeHubModel([alternativeEntry("bloomerang")]);
    const versus = buildCompareVersusHubModel([versusEntry("bloomerang-vs-grantpipe")]);
    const pricing = buildComparePricingHubModel([pricingEntry("blackbaud")]);

    expect(alternatives.items.map((item) => item.href)).toEqual([
      "/compare/alternatives/bloomerang",
    ]);
    expect(alternatives.familySections.map((section) => section.slug)).toEqual(["alternatives"]);
    expect(versus.items.map((item) => item.href)).toEqual([
      "/compare/versus/grantpipe-vs-bloomerang",
    ]);
    expect(versus.familySections.map((section) => section.slug)).toEqual(["versus"]);
    expect(pricing.items.map((item) => item.href)).toEqual(["/compare/pricing/blackbaud"]);
    expect(pricing.familySections.map((section) => section.slug)).toEqual(["pricing"]);
  });

  it("keeps compare stage labels short and reader-facing", () => {
    expect(compareStageCopy).toEqual({
      tofu: {
        label: "Learn",
        heading: "Map the market",
        description: "Use these when you need the main options first.",
        nextStepHref: "/resources/topics",
        nextStepLabel: "See topic hubs",
      },
      mofu: {
        label: "Compare",
        heading: "Narrow the shortlist",
        description: "Use these when you need tradeoffs, cost, and fit.",
        nextStepHref: "/compare/versus",
        nextStepLabel: "See head-to-heads",
      },
      bofu: {
        label: "Decide",
        heading: "Check price and fit",
        description: "Use these when you are ready to pick a path.",
        nextStepHref: "/pricing",
        nextStepLabel: "See pricing",
      },
    });
  });
});
