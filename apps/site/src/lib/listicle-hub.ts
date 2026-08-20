import type { BuyerStage, ContentItem } from "@grantpipe/ui/site";
import { mapToContentItems } from "@grantpipe/ui/site/lib/collections";

import { topicHubs, type TopicHubDefinition } from "./topic-hubs";
import type {
  TopicStageHubSection,
  TopicStageHubStageCopy,
  TopicStageHubSummary,
} from "./topic-stage-hub";

type ListicleTopicSlug = TopicHubDefinition["slug"];

export interface ListicleHubEntry {
  id: string;
  data: {
    title: string;
    description: string;
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
    relatedPages?: string[];
    targetPersona?: string[];
    topicCluster?: ListicleTopicSlug;
    category?: string;
  };
}

export interface ListicleHubItem extends ContentItem {
  topicCluster?: ListicleTopicSlug;
}

export type ListicleTopicSummary = TopicStageHubSummary<ListicleHubItem>;
export type ListicleStageSection = TopicStageHubSection<ListicleHubItem>;

export interface ListicleHubModel {
  items: ListicleHubItem[];
  topicSummaries: ListicleTopicSummary[];
  stageSections: ListicleStageSection[];
}

export const listicleStageCopy: Record<BuyerStage, TopicStageHubStageCopy> = {
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
};

const TOPIC_PREVIEW_LIMIT = 3;
const STAGE_PREVIEW_LIMIT = 6;
const STAGE_ORDER: BuyerStage[] = ["tofu", "mofu", "bofu"];
const TOPIC_FALLBACKS: Array<{ topic: ListicleTopicSlug; pattern: RegExp }> = [
  { topic: "nonprofit-crm", pattern: /\b(crm|database)\b/ },
  {
    topic: "donor-operations",
    pattern: /\b(donor|fundraising|donation|email marketing)\b/,
  },
  {
    topic: "restricted-fund-accounting",
    pattern: /\b(accounting|fund accounting|restricted fund|financial management|budget)\b/,
  },
  { topic: "grant-compliance", pattern: /\b(compliance|audit)\b/ },
  {
    topic: "grant-management",
    pattern: /\b(grant|foundation|funder|prospect research|funding management)\b/,
  },
];

function countOverflow(totalCount: number, previewLimit: number): number {
  return Math.max(0, totalCount - previewLimit);
}

function normalize(value: string | undefined): string {
  return value?.toLowerCase() ?? "";
}

function inferTopicCluster(entry: ListicleHubEntry): ListicleTopicSlug | undefined {
  if (entry.data.topicCluster) {
    return entry.data.topicCluster;
  }

  const text = `${normalize(entry.data.category)} ${normalize(entry.data.title)}`;
  const match = TOPIC_FALLBACKS.find(({ pattern }) => pattern.test(text));

  return match?.topic;
}

function buildMetadata(entry: ListicleHubEntry): Record<string, string> | undefined {
  return entry.data.category ? { category: entry.data.category } : undefined;
}

export function buildListicleHubModel<T extends ListicleHubEntry>(
  entries: T[],
  hrefBuilder: (entry: T) => string,
): ListicleHubModel {
  const items = mapToContentItems(entries, hrefBuilder, buildMetadata).map((item, index) => ({
    ...item,
    topicCluster: inferTopicCluster(entries[index] as T),
  }));

  const topicSummaries = topicHubs
    .map((topic): ListicleTopicSummary => {
      const topicItems = items.filter((item) => item.topicCluster === topic.slug);

      return {
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
        href: `/resources/topics/${topic.slug}`,
        totalCount: topicItems.length,
        overflowCount: countOverflow(topicItems.length, TOPIC_PREVIEW_LIMIT),
        previewItems: topicItems.slice(0, TOPIC_PREVIEW_LIMIT),
      };
    })
    .filter((topic) => topic.totalCount > 0);

  const stageSections = STAGE_ORDER.map((buyerStage): ListicleStageSection => {
    const stageItems = items.filter((item) => item.buyerStage === buyerStage);
    const copy = listicleStageCopy[buyerStage];

    return {
      buyerStage,
      ...copy,
      totalCount: stageItems.length,
      overflowCount: countOverflow(stageItems.length, STAGE_PREVIEW_LIMIT),
      items: stageItems.slice(0, STAGE_PREVIEW_LIMIT),
    };
  }).filter((section) => section.totalCount > 0);

  return {
    items,
    topicSummaries,
    stageSections,
  };
}
