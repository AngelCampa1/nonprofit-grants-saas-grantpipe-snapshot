import { describe, expect, it } from "vitest";

import {
  buildFreeResourceHubModel,
  freeResourceStageCopy,
  type FreeResourceHubEntry,
} from "./free-resource-hub";

function freeResourceEntry(
  slug: string,
  overrides: Partial<FreeResourceHubEntry["data"]> = {},
): FreeResourceHubEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "mofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/example"],
      timeEstimate: "15 minutes",
      targetPersona: ["grants-manager"],
      ...overrides,
    },
  };
}

describe("free resource hub model", () => {
  it("groups active downloads by the lead magnet sequence topic", () => {
    const model = buildFreeResourceHubModel(
      [
        freeResourceEntry("grant-compliance-checklist"),
        freeResourceEntry("grant-file-audit-checklist"),
        freeResourceEntry("grant-closeout-checklist"),
        freeResourceEntry("nonprofit-crm-cost-calculator"),
        freeResourceEntry("restricted-fund-tracking-spreadsheet"),
      ],
      (entry) => `/free/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual([
      "nonprofit-crm",
      "grant-management",
      "grant-compliance",
      "restricted-fund-accounting",
    ]);
    expect(model.topicSummaries.find((topic) => topic.slug === "grant-compliance")).toMatchObject({
      totalCount: 2,
      href: "/resources/topics/grant-compliance",
    });
  });

  it("groups downloads by funnel stage using sequence metadata before frontmatter fallback", () => {
    const model = buildFreeResourceHubModel(
      [
        freeResourceEntry("nonprofit-audit-readiness-assessment"),
        freeResourceEntry("grant-compliance-checklist", { buyerStage: "tofu" }),
        freeResourceEntry("grant-software-roi-calculator", { buyerStage: "mofu" }),
      ],
      (entry) => `/free/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.stageSections.map((section) => section.buyerStage)).toEqual([
      "tofu",
      "mofu",
      "bofu",
    ]);
    expect(model.stageSections[0]?.items.map((item) => item.href)).toEqual([
      "/free/nonprofit-audit-readiness-assessment",
    ]);
    expect(model.stageSections[1]?.items.map((item) => item.href)).toEqual([
      "/free/grant-compliance-checklist",
    ]);
    expect(model.stageSections[2]?.items.map((item) => item.href)).toEqual([
      "/free/grant-software-roi-calculator",
    ]);
  });

  it("keeps free resource stage labels short and reader-facing", () => {
    expect(freeResourceStageCopy).toEqual({
      tofu: {
        label: "Learn",
        heading: "Find the gap",
        description: "Use these when you need a quick check first.",
        nextStepHref: "/resources/topics",
        nextStepLabel: "See topic hubs",
      },
      mofu: {
        label: "Compare",
        heading: "Fix the work step",
        description: "Use these to fix one step. Pick a better way.",
        nextStepHref: "/compare",
        nextStepLabel: "See options",
      },
      bofu: {
        label: "Decide",
        heading: "Check GrantPipe fit",
        description: "Use these when you are ready to test GrantPipe.",
        nextStepHref: "/pricing",
        nextStepLabel: "See pricing",
      },
    });
  });
});
