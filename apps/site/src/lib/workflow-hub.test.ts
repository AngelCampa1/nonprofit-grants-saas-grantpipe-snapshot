import { describe, expect, it } from "vitest";

import { buildWorkflowHubModel, workflowStageCopy, type WorkflowHubEntry } from "./workflow-hub";

function workflowEntry(
  slug: string,
  overrides: Partial<WorkflowHubEntry["data"]> = {},
): WorkflowHubEntry {
  return {
    id: `${slug}.md`,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/example"],
      topicCluster: "grant-compliance",
      timeEstimate: "30 minutes",
      targetPersona: ["grants-manager"],
      ...overrides,
    },
  };
}

describe("workflow hub model", () => {
  it("groups workflow previews by topic so the index is not one flat article dump", () => {
    const entries = [
      workflowEntry("grant-compliance-1", { topicCluster: "grant-compliance" }),
      workflowEntry("grant-compliance-2", { topicCluster: "grant-compliance" }),
      workflowEntry("grant-compliance-3", { topicCluster: "grant-compliance" }),
      workflowEntry("grant-compliance-4", { topicCluster: "grant-compliance" }),
      workflowEntry("grant-management", { topicCluster: "grant-management" }),
      workflowEntry("restricted-funds", { topicCluster: "restricted-fund-accounting" }),
      workflowEntry("donor-ops", { topicCluster: "donor-operations" }),
    ];

    const model = buildWorkflowHubModel(
      entries,
      (entry) => `/workflows/${entry.id.replace(/\.md$/, "")}`,
    );
    const compliance = model.topicSummaries.find((topic) => topic.slug === "grant-compliance");

    expect(model.items).toHaveLength(entries.length);
    expect(model.topicSummaries.map((topic) => topic.slug)).toEqual([
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

  it("groups workflow previews by funnel stage with clear next-step routes", () => {
    const model = buildWorkflowHubModel(
      [
        workflowEntry("learn-1", { buyerStage: "tofu", updatedAt: "2026-01-01" }),
        workflowEntry("learn-2", { buyerStage: "tofu", updatedAt: "2026-01-02" }),
        workflowEntry("learn-3", { buyerStage: "tofu", updatedAt: "2026-01-03" }),
        workflowEntry("learn-4", { buyerStage: "tofu", updatedAt: "2026-01-04" }),
        workflowEntry("learn-5", { buyerStage: "tofu", updatedAt: "2026-01-05" }),
        workflowEntry("learn-6", { buyerStage: "tofu", updatedAt: "2026-01-06" }),
        workflowEntry("learn-7", { buyerStage: "tofu", updatedAt: "2026-01-07" }),
        workflowEntry("compare", { buyerStage: "mofu" }),
        workflowEntry("decide", { buyerStage: "bofu" }),
      ],
      (entry) => `/workflows/${entry.id.replace(/\.md$/, "")}`,
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

  it("does not attach empty time metadata when a workflow has no estimate", () => {
    const model = buildWorkflowHubModel(
      [
        workflowEntry("no-estimate", {
          timeEstimate: undefined,
        }),
      ],
      (entry) => `/workflows/${entry.id.replace(/\.md$/, "")}`,
    );

    expect(model.items[0]?.metadata).toBeUndefined();
  });

  it("keeps workflow stage labels short and reader-facing", () => {
    expect(workflowStageCopy).toEqual({
      tofu: {
        label: "Learn",
        heading: "Learn the task",
        description: "Use these when the work is new or unclear.",
        nextStepHref: "/resources/topics",
        nextStepLabel: "See topic hubs",
      },
      mofu: {
        label: "Compare",
        heading: "Pick the right path",
        description: "Use these when you need a better way to work.",
        nextStepHref: "/compare",
        nextStepLabel: "See options",
      },
      bofu: {
        label: "Decide",
        heading: "Check GrantPipe fit",
        description: "Use these when you are ready to test the tool.",
        nextStepHref: "/pricing",
        nextStepLabel: "See pricing",
      },
    });
  });
});
