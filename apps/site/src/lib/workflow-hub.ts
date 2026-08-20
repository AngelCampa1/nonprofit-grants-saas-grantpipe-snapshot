import type { BuyerStage } from "@grantpipe/ui/site";

import {
  buildTopicStageHubModel,
  type TopicStageHubEntry,
  type TopicStageHubItem,
  type TopicStageHubSection,
  type TopicStageHubStageCopy,
  type TopicStageHubSummary,
  type TopicStageHubTopicSlug,
} from "./topic-stage-hub";

type WorkflowTopicSlug = TopicStageHubTopicSlug;

export type WorkflowHubEntry = TopicStageHubEntry;

export interface WorkflowHubItem extends TopicStageHubItem {
  topicCluster?: WorkflowTopicSlug;
}

export type WorkflowTopicSummary = TopicStageHubSummary<WorkflowHubItem>;
export type WorkflowStageSection = TopicStageHubSection<WorkflowHubItem>;

export interface WorkflowHubModel {
  items: WorkflowHubItem[];
  topicSummaries: WorkflowTopicSummary[];
  stageSections: WorkflowStageSection[];
}

export const workflowStageCopy: Record<BuyerStage, TopicStageHubStageCopy> = {
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
};

const TOPIC_PREVIEW_LIMIT = 3;
const STAGE_PREVIEW_LIMIT = 6;

export function buildWorkflowHubModel<T extends WorkflowHubEntry>(
  entries: T[],
  hrefBuilder: (entry: T) => string,
): WorkflowHubModel {
  return buildTopicStageHubModel(entries, hrefBuilder, workflowStageCopy, {
    topicPreview: TOPIC_PREVIEW_LIMIT,
    stagePreview: STAGE_PREVIEW_LIMIT,
  }) as WorkflowHubModel;
}
