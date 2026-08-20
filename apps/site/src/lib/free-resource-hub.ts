import type { BuyerStage } from "@grantpipe/ui/site";
import { resolveLeadMagnetSequence } from "@grantpipe/shared";

import {
  buildTopicStageHubModel,
  type TopicStageHubEntry,
  type TopicStageHubItem,
  type TopicStageHubSection,
  type TopicStageHubStageCopy,
  type TopicStageHubSummary,
  type TopicStageHubTopicSlug,
} from "./topic-stage-hub";

type FreeResourceTopicSlug = TopicStageHubTopicSlug;

export type FreeResourceHubEntry = Omit<TopicStageHubEntry, "data"> & {
  data: Omit<TopicStageHubEntry["data"], "topicCluster"> & {
    topicCluster?: FreeResourceTopicSlug;
  };
};

export interface FreeResourceHubItem extends TopicStageHubItem {
  topicCluster?: FreeResourceTopicSlug;
}

export type FreeResourceTopicSummary = TopicStageHubSummary<FreeResourceHubItem>;
export type FreeResourceStageSection = TopicStageHubSection<FreeResourceHubItem>;

export interface FreeResourceHubModel {
  items: FreeResourceHubItem[];
  topicSummaries: FreeResourceTopicSummary[];
  stageSections: FreeResourceStageSection[];
}

export const freeResourceStageCopy: Record<BuyerStage, TopicStageHubStageCopy> = {
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
};

const TOPIC_PREVIEW_LIMIT = 3;
const STAGE_PREVIEW_LIMIT = 6;

function stripMarkdownExtension(id: string): string {
  return id.replace(/\.md$/, "");
}

function enrichEntry(entry: FreeResourceHubEntry): TopicStageHubEntry {
  const sequence = resolveLeadMagnetSequence(stripMarkdownExtension(entry.id));

  return {
    ...entry,
    data: {
      ...entry.data,
      buyerStage: sequence.buyerStage,
      topicCluster: sequence.topicCluster,
    },
  };
}

export function buildFreeResourceHubModel<T extends FreeResourceHubEntry>(
  entries: T[],
  hrefBuilder: (entry: T) => string,
): FreeResourceHubModel {
  const enrichedEntries = entries.map(enrichEntry);
  const hrefById = new Map(entries.map((entry) => [entry.id, hrefBuilder(entry)]));

  return buildTopicStageHubModel(
    enrichedEntries,
    (entry) => hrefById.get(entry.id) as string,
    freeResourceStageCopy,
    {
      topicPreview: TOPIC_PREVIEW_LIMIT,
      stagePreview: STAGE_PREVIEW_LIMIT,
    },
  ) as FreeResourceHubModel;
}
