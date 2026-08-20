import { describe, expect, it } from "vitest";

import { buildGuideHubModel, guideStageCopy, type GuideHubEntry } from "./guide-hub";

function guideEntry(slug: string, overrides: Partial<GuideHubEntry["data"]> = {}): GuideHubEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/topics/grant-compliance"],
      topicCluster: "grant-compliance",
      timeEstimate: "20 minutes",
      targetPersona: ["grants-manager"],
      ...overrides,
    },
  };
}

describe("guide hub model", () => {
  it("groups guide previews by topic so the index does not start as one giant list", () => {
    const entries = [
      guideEntry("grant-compliance-1", { topicCluster: "grant-compliance" }),
      guideEntry("grant-compliance-2", { topicCluster: "grant-compliance" }),
      guideEntry("grant-compliance-3", { topicCluster: "grant-compliance" }),
      guideEntry("grant-compliance-4", { topicCluster: "grant-compliance" }),
      guideEntry("grant-management", { topicCluster: "grant-management" }),
      guideEntry("restricted-funds", { topicCluster: "restricted-fund-accounting" }),
      guideEntry("donor-ops", { topicCluster: "donor-operations" }),
      guideEntry("nonprofit-crm", { topicCluster: "nonprofit-crm" }),
    ];

    const model = buildGuideHubModel(
      entries,
      (entry) => `/resources/guides/${entry.id.replace(/\.md$/, "")}`,
    );
    const compliance = model.topicSummaries.find((topic) => topic.slug === "grant-compliance");

    expect(model.items).toHaveLength(entries.length);
    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual([
      "nonprofit-crm",
      "donor-operations",
      "grant-management",
      "grant-compliance",
      "restricted-fund-accounting",
    ]);
    expect(compliance?.totalCount).toBe(4);
    expect(compliance?.previewItems).toHaveLength(3);
    expect(compliance?.overflowCount).toBe(1);
    expect(compliance?.href).toBe("/resources/topics/grant-compliance");
  });

  it("groups guide previews by funnel stage with clear next-step routes", () => {
    const model = buildGuideHubModel(
      [
        guideEntry("learn-1", { buyerStage: "tofu", updatedAt: "2026-01-01" }),
        guideEntry("learn-2", { buyerStage: "tofu", updatedAt: "2026-01-02" }),
        guideEntry("learn-3", { buyerStage: "tofu", updatedAt: "2026-01-03" }),
        guideEntry("learn-4", { buyerStage: "tofu", updatedAt: "2026-01-04" }),
        guideEntry("learn-5", { buyerStage: "tofu", updatedAt: "2026-01-05" }),
        guideEntry("learn-6", { buyerStage: "tofu", updatedAt: "2026-01-06" }),
        guideEntry("learn-7", { buyerStage: "tofu", updatedAt: "2026-01-07" }),
        guideEntry("compare", { buyerStage: "mofu" }),
        guideEntry("decide", { buyerStage: "bofu" }),
      ],
      (entry) => `/resources/guides/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.stageSections.map((section) => section.buyerStage)).toEqual([
      "tofu",
      "mofu",
      "bofu",
    ]);
    expect(model.stageSections[0]?.items).toHaveLength(6);
    expect(model.stageSections[0]?.overflowCount).toBe(1);
    expect(model.stageSections[0]?.nextStepHref).toBe("/resources/topics");
    expect(model.stageSections[1]?.nextStepHref).toBe("/compare");
    expect(model.stageSections[2]?.nextStepHref).toBe("/pricing");
  });

  it("does not attach empty time metadata when a guide has no estimate", () => {
    const model = buildGuideHubModel(
      [
        guideEntry("no-estimate", {
          timeEstimate: undefined,
        }),
      ],
      (entry) => `/resources/guides/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.items[0]?.metadata).toBeUndefined();
  });

  it("keeps guide stage labels short and reader-facing", () => {
    expect(guideStageCopy).toEqual({
      tofu: {
        label: "Learn",
        heading: "Learn the problem",
        description: "Use these when you need a plain answer first.",
        nextStepHref: "/resources/topics",
        nextStepLabel: "See topic hubs",
      },
      mofu: {
        label: "Compare",
        heading: "Compare your options",
        description: "Use these when you need fit, cost, or tradeoffs.",
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
