import type { BuyerStage, ContentItem } from "@grantpipe/ui/site";
import { mapToContentItems } from "@grantpipe/ui/site/lib/collections";

import { topicHubs, type TopicHubDefinition } from "./topic-hubs";

export type TopicStageHubTopicSlug = TopicHubDefinition["slug"];

export interface TopicStageHubEntry {
  id: string;
  data: {
    title: string;
    description: string;
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
    relatedPages?: string[];
    targetPersona?: string[];
    topicCluster?: TopicStageHubTopicSlug;
    timeEstimate?: string;
  };
}

export interface TopicStageHubItem extends ContentItem {
  topicCluster?: TopicStageHubTopicSlug;
}

export interface TopicStageHubSummary<TItem extends TopicStageHubItem> {
  slug: TopicStageHubTopicSlug;
  title: string;
  description: string;
  href: string;
  totalCount: number;
  overflowCount: number;
  previewItems: TItem[];
}

export interface TopicStageHubSection<TItem extends TopicStageHubItem> {
  buyerStage: BuyerStage;
  label: string;
  heading: string;
  description: string;
  nextStepHref: string;
  nextStepLabel: string;
  totalCount: number;
  overflowCount: number;
  items: TItem[];
}

export interface TopicStageHubStageCopy {
  label: string;
  heading: string;
  description: string;
  nextStepHref: string;
  nextStepLabel: string;
}

export interface TopicStageHubModel<TItem extends TopicStageHubItem> {
  items: TItem[];
  topicSummaries: TopicStageHubSummary<TItem>[];
  stageSections: TopicStageHubSection<TItem>[];
}

const STAGE_ORDER: BuyerStage[] = ["tofu", "mofu", "bofu"];

function countOverflow(totalCount: number, previewLimit: number): number {
  return Math.max(0, totalCount - previewLimit);
}

export function buildTopicStageHubModel<TEntry extends TopicStageHubEntry>(
  entries: TEntry[],
  hrefBuilder: (entry: TEntry) => string,
  stageCopy: Record<BuyerStage, TopicStageHubStageCopy>,
  limits: {
    topicPreview: number;
    stagePreview: number;
  },
): TopicStageHubModel<TopicStageHubItem> {
  const items = mapToContentItems(entries, hrefBuilder, (entry) =>
    entry.data.timeEstimate
      ? {
          timeEstimate: entry.data.timeEstimate,
        }
      : undefined,
  ).map((item, index) => ({
    ...item,
    topicCluster: entries[index]?.data.topicCluster,
  }));

  const topicSummaries = topicHubs
    .map((topic): TopicStageHubSummary<TopicStageHubItem> => {
      const topicItems = items.filter((item) => item.topicCluster === topic.slug);

      return {
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
        href: `/resources/topics/${topic.slug}`,
        totalCount: topicItems.length,
        overflowCount: countOverflow(topicItems.length, limits.topicPreview),
        previewItems: topicItems.slice(0, limits.topicPreview),
      };
    })
    .filter((topic) => topic.totalCount > 0);

  const stageSections = STAGE_ORDER.map((buyerStage): TopicStageHubSection<TopicStageHubItem> => {
    const stageItems = items.filter((item) => item.buyerStage === buyerStage);
    const copy = stageCopy[buyerStage];

    return {
      buyerStage,
      ...copy,
      totalCount: stageItems.length,
      overflowCount: countOverflow(stageItems.length, limits.stagePreview),
      items: stageItems.slice(0, limits.stagePreview),
    };
  }).filter((section) => section.totalCount > 0);

  return {
    items,
    topicSummaries,
    stageSections,
  };
}
