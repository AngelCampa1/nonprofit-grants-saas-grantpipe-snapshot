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

type GuideTopicSlug = TopicStageHubTopicSlug;

export type GuideHubEntry = TopicStageHubEntry;

export interface GuideHubItem extends TopicStageHubItem {
  topicCluster?: GuideTopicSlug;
}

export type GuideTopicSummary = TopicStageHubSummary<GuideHubItem>;
export type GuideStageSection = TopicStageHubSection<GuideHubItem>;

export interface GuideHubModel {
  items: GuideHubItem[];
  topicSummaries: GuideTopicSummary[];
  stageSections: GuideStageSection[];
}

export const guideStageCopy: Record<BuyerStage, TopicStageHubStageCopy> = {
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
};

const TOPIC_PREVIEW_LIMIT = 3;
const STAGE_PREVIEW_LIMIT = 6;

export function buildGuideHubModel<T extends GuideHubEntry>(
  entries: T[],
  hrefBuilder: (entry: T) => string,
): GuideHubModel {
  return buildTopicStageHubModel(entries, hrefBuilder, guideStageCopy, {
    topicPreview: TOPIC_PREVIEW_LIMIT,
    stagePreview: STAGE_PREVIEW_LIMIT,
  }) as GuideHubModel;
}
