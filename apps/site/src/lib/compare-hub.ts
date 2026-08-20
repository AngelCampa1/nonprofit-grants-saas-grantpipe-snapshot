import type { BuyerStage, ContentItem } from "@grantpipe/ui/site";

import { getContentEntrySlug } from "./content-entry-slug";
import { buildVersusComparisonPath, normalizeVersusComparisonTitle } from "./page-helpers";
import { topicHubs, type TopicHubDefinition } from "./topic-hubs";
import type {
  TopicStageHubSection,
  TopicStageHubStageCopy,
  TopicStageHubSummary,
} from "./topic-stage-hub";

type CompareTopicSlug = TopicHubDefinition["slug"];
type CompareFamilySlug = "alternatives" | "versus" | "pricing" | "roundups";
type CompareSubject = { slug: string; name: string };

interface BaseCompareEntry {
  id: string;
  data: {
    title: string;
    description: string;
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
    targetPersona?: string[];
    relatedPages?: string[];
    topicCluster?: CompareTopicSlug;
    category?: string;
  };
}

export interface CompareAlternativeEntry extends BaseCompareEntry {
  data: BaseCompareEntry["data"] & {
    competitor: CompareSubject;
  };
}

export interface CompareVersusEntry extends BaseCompareEntry {
  data: BaseCompareEntry["data"] & {
    competitorA: CompareSubject;
    competitorB: CompareSubject;
  };
}

export interface ComparePricingEntry extends BaseCompareEntry {
  data: BaseCompareEntry["data"] & {
    competitor: CompareSubject;
  };
}

export type CompareListicleEntry = BaseCompareEntry;

export interface CompareHubItem extends ContentItem {
  family: CompareFamilySlug;
  topicCluster?: CompareTopicSlug;
}

export interface CompareFamilySection {
  slug: CompareFamilySlug;
  label: string;
  heading: string;
  description: string;
  href: string;
  totalCount: number;
  overflowCount: number;
  previewItems: CompareHubItem[];
}

export type CompareTopicSummary = TopicStageHubSummary<CompareHubItem>;
export type CompareStageSection = TopicStageHubSection<CompareHubItem>;

export interface CompareHubModel {
  items: CompareHubItem[];
  familySections: CompareFamilySection[];
  topicSummaries: CompareTopicSummary[];
  stageSections: CompareStageSection[];
}

export interface CompareHubCollections {
  alternatives: CompareAlternativeEntry[];
  comparisons: CompareVersusEntry[];
  pricingBreakdowns: ComparePricingEntry[];
  roundups: CompareListicleEntry[];
}

const FAMILY_PREVIEW_LIMIT = 4;
const TOPIC_PREVIEW_LIMIT = 3;
const STAGE_PREVIEW_LIMIT = 6;
const STAGE_ORDER: BuyerStage[] = ["tofu", "mofu", "bofu"];

const familyCopy: Record<
  CompareFamilySlug,
  Omit<CompareFamilySection, "totalCount" | "overflowCount" | "previewItems">
> = {
  alternatives: {
    slug: "alternatives",
    label: "Alternatives",
    heading: "Browse software alternatives",
    description: "Use these when you know the tool name and need the tradeoffs.",
    href: "/compare/alternatives",
  },
  versus: {
    slug: "versus",
    label: "Head-to-head",
    heading: "Compare two tools",
    description: "Use these when the shortlist is down to named products.",
    href: "/compare/versus",
  },
  pricing: {
    slug: "pricing",
    label: "Pricing",
    heading: "Check true cost",
    description: "Use these when renewal cost, setup, and add-ons matter.",
    href: "/compare/pricing",
  },
  roundups: {
    slug: "roundups",
    label: "Roundups",
    heading: "Build the shortlist",
    description: "Use these when you need the main options in one software area.",
    href: "/resources/best",
  },
};

export const compareStageCopy: Record<BuyerStage, TopicStageHubStageCopy> = {
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
};

const TOPIC_FALLBACKS: Array<{ topic: CompareTopicSlug; pattern: RegExp }> = [
  { topic: "nonprofit-crm", pattern: /\b(crm|database|donor management)\b/ },
  {
    topic: "donor-operations",
    pattern: /\b(donor|fundraising|donation|email marketing)\b/,
  },
  {
    topic: "restricted-fund-accounting",
    pattern: /\b(accounting|fund accounting|restricted fund|financial management|budget)\b/,
  },
  { topic: "grant-compliance", pattern: /\b(compliance|audit|reporting)\b/ },
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

function inferTopicCluster(entry: BaseCompareEntry): CompareTopicSlug | undefined {
  if (entry.data.topicCluster) {
    return entry.data.topicCluster;
  }

  const text = `${normalize(entry.data.category)} ${normalize(entry.data.title)} ${normalize(
    entry.data.description,
  )}`;

  return TOPIC_FALLBACKS.find(({ pattern }) => pattern.test(text))?.topic;
}

function compareByUpdatedAtDesc(a: BaseCompareEntry, b: BaseCompareEntry): number {
  return b.data.updatedAt.localeCompare(a.data.updatedAt);
}

function buildItem(
  entry: BaseCompareEntry,
  href: string,
  family: CompareFamilySlug,
  metadata?: Record<string, string>,
  title = entry.data.title,
): CompareHubItem {
  return {
    title,
    description: entry.data.description,
    href,
    buyerStage: entry.data.buyerStage,
    publishedAt: entry.data.publishedAt,
    updatedAt: entry.data.updatedAt,
    relatedPages: [],
    metadata,
    family,
    topicCluster: inferTopicCluster(entry),
  };
}

function buildAlternativeItems(entries: CompareAlternativeEntry[]): CompareHubItem[] {
  return [...entries].sort(compareByUpdatedAtDesc).map((entry) =>
    buildItem(entry, `/compare/alternatives/${entry.data.competitor.slug}`, "alternatives", {
      competitor: entry.data.competitor.name,
    }),
  );
}

function buildVersusItems(entries: CompareVersusEntry[]): CompareHubItem[] {
  return [...entries]
    .sort(compareByUpdatedAtDesc)
    .map((entry) =>
      buildItem(
        entry,
        buildVersusComparisonPath(entry.data.competitorA, entry.data.competitorB),
        "versus",
        undefined,
        normalizeVersusComparisonTitle(
          entry.data.title,
          entry.data.competitorA,
          entry.data.competitorB,
        ),
      ),
    );
}

function buildPricingItems(entries: ComparePricingEntry[]): CompareHubItem[] {
  return [...entries].sort(compareByUpdatedAtDesc).map((entry) =>
    buildItem(entry, `/compare/pricing/${entry.data.competitor.slug}`, "pricing", {
      competitor: entry.data.competitor.name,
    }),
  );
}

function buildRoundupItems(entries: CompareListicleEntry[]): CompareHubItem[] {
  return [...entries].sort(compareByUpdatedAtDesc).map((entry) =>
    buildItem(entry, `/resources/best/${getContentEntrySlug(entry)}`, "roundups", {
      category: entry.data.category ?? "Software roundup",
    }),
  );
}

function buildFamilySections(items: CompareHubItem[]): CompareFamilySection[] {
  return (Object.keys(familyCopy) as CompareFamilySlug[])
    .map((slug): CompareFamilySection => {
      const familyItems = items.filter((item) => item.family === slug);
      return {
        ...familyCopy[slug],
        totalCount: familyItems.length,
        overflowCount: countOverflow(familyItems.length, FAMILY_PREVIEW_LIMIT),
        previewItems: familyItems.slice(0, FAMILY_PREVIEW_LIMIT),
      };
    })
    .filter((section) => section.totalCount > 0);
}

function buildTopicSummaries(items: CompareHubItem[]): CompareTopicSummary[] {
  return topicHubs
    .map((topic): CompareTopicSummary => {
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
}

function buildStageSections(items: CompareHubItem[]): CompareStageSection[] {
  return STAGE_ORDER.map((buyerStage): CompareStageSection => {
    const stageItems = items.filter((item) => item.buyerStage === buyerStage);
    const copy = compareStageCopy[buyerStage];

    return {
      buyerStage,
      ...copy,
      totalCount: stageItems.length,
      overflowCount: countOverflow(stageItems.length, STAGE_PREVIEW_LIMIT),
      items: stageItems.slice(0, STAGE_PREVIEW_LIMIT),
    };
  }).filter((section) => section.totalCount > 0);
}

function buildModelFromItems(items: CompareHubItem[]): CompareHubModel {
  return {
    items,
    familySections: buildFamilySections(items),
    topicSummaries: buildTopicSummaries(items),
    stageSections: buildStageSections(items),
  };
}

export function buildCompareHubModel(collections: CompareHubCollections): CompareHubModel {
  return buildModelFromItems([
    ...buildAlternativeItems(collections.alternatives),
    ...buildVersusItems(collections.comparisons),
    ...buildPricingItems(collections.pricingBreakdowns),
    ...buildRoundupItems(collections.roundups),
  ]);
}

export function buildCompareAlternativeHubModel(
  entries: CompareAlternativeEntry[],
): CompareHubModel {
  return buildModelFromItems(buildAlternativeItems(entries));
}

export function buildCompareVersusHubModel(entries: CompareVersusEntry[]): CompareHubModel {
  return buildModelFromItems(buildVersusItems(entries));
}

export function buildComparePricingHubModel(entries: ComparePricingEntry[]): CompareHubModel {
  return buildModelFromItems(buildPricingItems(entries));
}
