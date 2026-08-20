import { describe, expect, it } from "vitest";

import { buildListicleHubModel, listicleStageCopy, type ListicleHubEntry } from "./listicle-hub";

function listicleEntry(
  slug: string,
  overrides: Partial<ListicleHubEntry["data"]> = {},
): ListicleHubEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "mofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/compare"],
      category: "Grant management software",
      targetPersona: ["executive-director"],
      ...overrides,
    },
  };
}

describe("listicle hub model", () => {
  it("groups roundups by explicit topic metadata before category fallback", () => {
    const model = buildListicleHubModel(
      [
        listicleEntry("explicit-crm", {
          topicCluster: "nonprofit-crm",
          category: "Grant management software",
        }),
        listicleEntry("category-crm", { category: "Nonprofit CRM" }),
        listicleEntry("category-grants", { category: "Foundation Grants" }),
        listicleEntry("category-accounting", { category: "Fund accounting software" }),
        listicleEntry("category-donor", { category: "Donor Management Software" }),
      ],
      (entry) => `/resources/best/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.items).toHaveLength(5);
    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual([
      "nonprofit-crm",
      "donor-operations",
      "grant-management",
      "restricted-fund-accounting",
    ]);
    expect(model.topicSummaries.find((topic) => topic.slug === "nonprofit-crm")).toMatchObject({
      totalCount: 2,
      href: "/resources/topics/nonprofit-crm",
    });
  });

  it("groups roundups by funnel stage with compare and pricing next steps", () => {
    const model = buildListicleHubModel(
      [
        listicleEntry("learn", { buyerStage: "tofu" }),
        listicleEntry("compare-1", { buyerStage: "mofu" }),
        listicleEntry("compare-2", { buyerStage: "mofu" }),
        listicleEntry("decide", { buyerStage: "bofu" }),
      ],
      (entry) => `/resources/best/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.stageSections.map((section) => section.buyerStage)).toEqual([
      "tofu",
      "mofu",
      "bofu",
    ]);
    expect(model.stageSections[0]?.nextStepHref).toBe("/resources/topics");
    expect(model.stageSections[1]?.nextStepHref).toBe("/compare");
    expect(model.stageSections[2]?.nextStepHref).toBe("/pricing");
    expect(model.stageSections[1]?.items.map((item) => item.href)).toEqual([
      "/resources/best/compare-1",
      "/resources/best/compare-2",
    ]);
  });

  it("keeps category metadata and omits unsupported topic groups", () => {
    const model = buildListicleHubModel(
      [
        listicleEntry("compliance-title", {
          category: undefined,
          title: "Best audit prep software",
        }),
        listicleEntry("unknown", {
          category: undefined,
          title: "Best board packet tools",
        }),
      ],
      (entry) => `/resources/best/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.items[0]?.metadata).toBeUndefined();
    expect(model.items[0]?.topicCluster).toBe("grant-compliance");
    expect(model.items[1]?.topicCluster).toBeUndefined();
    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual(["grant-compliance"]);
  });

  it("limits long stage previews and reports overflow", () => {
    const model = buildListicleHubModel(
      [
        listicleEntry("compare-1", { buyerStage: "mofu" }),
        listicleEntry("compare-2", { buyerStage: "mofu" }),
        listicleEntry("compare-3", { buyerStage: "mofu" }),
        listicleEntry("compare-4", { buyerStage: "mofu" }),
        listicleEntry("compare-5", { buyerStage: "mofu" }),
        listicleEntry("compare-6", { buyerStage: "mofu" }),
        listicleEntry("compare-7", { buyerStage: "mofu" }),
      ],
      (entry) => `/resources/best/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.stageSections[0]?.buyerStage).toBe("mofu");
    expect(model.stageSections[0]?.items).toHaveLength(6);
    expect(model.stageSections[0]?.overflowCount).toBe(1);
  });

  it("keeps roundup stage labels short and reader-facing", () => {
    expect(listicleStageCopy).toEqual({
      tofu: {
        label: "Learn",
        heading: "Learn the market",
        description: "Use these when you need the plain list first.",
        nextStepHref: "/resources/topics",
        nextStepLabel: "See topic hubs",
      },
      mofu: {
        label: "Compare",
        heading: "Narrow the shortlist",
        description: "Use these when you need fit, cost, and tradeoffs.",
        nextStepHref: "/compare",
        nextStepLabel: "See options",
      },
      bofu: {
        label: "Decide",
        heading: "Check GrantPipe fit",
        description: "Use these when you are close to a tool decision.",
        nextStepHref: "/pricing",
        nextStepLabel: "See pricing",
      },
    });
  });
});
