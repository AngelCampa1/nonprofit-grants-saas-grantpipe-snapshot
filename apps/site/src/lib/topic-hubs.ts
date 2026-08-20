import type { CollectionEntry } from "astro:content";
import { getContentEntrySlug } from "./content-entry-slug";
import type { BuyerStage, CategorySummary, ContentItem } from "@grantpipe/ui/site";
import { mapToContentItems } from "@grantpipe/ui/site/lib/collections";
import { grantCategoryPages } from "../config/grant-recipient-seo";

export interface TopicHubDefinition {
  slug:
    | "nonprofit-crm"
    | "donor-operations"
    | "grant-management"
    | "grant-compliance"
    | "restricted-fund-accounting";
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  itemCount: number;
  featuredHrefs?: string[];
}

type TopicHubSlug = TopicHubDefinition["slug"];
const TOPIC_HUB_SECTION_LIMIT = 9;

type TopicClusterEntry = {
  data: Record<string, unknown>;
};

export interface TopicHubSection {
  buyerStage: BuyerStage;
  stageLabel: string;
  title: string;
  description: string;
  browseHref: string;
  items: ContentItem[];
  overflowItems: ContentItem[];
  totalCount: number;
}

const TOPIC_HUB_SECTION_COPY: Record<
  BuyerStage,
  { stageLabel: string; title: string; description: string; browseHref: string }
> = {
  tofu: {
    stageLabel: "Learn",
    title: "Learn the problem",
    description: "Use these guides before the team picks a tool.",
    browseHref: "/resources/guides",
  },
  mofu: {
    stageLabel: "Compare",
    title: "Compare the options",
    description: "Use these pages when you judge fit, cost, and tradeoffs.",
    browseHref: "/compare",
  },
  bofu: {
    stageLabel: "Decide",
    title: "Decide the next step",
    description: "Use these pages when you are ready to check GrantPipe fit.",
    browseHref: "/pricing",
  },
};

export interface TopicHubCollections {
  alternatives: CollectionEntry<"alternatives">[];
  comparisons: CollectionEntry<"comparisons">[];
  pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
  listicles: CollectionEntry<"listicles">[];
  guides: CollectionEntry<"guides">[];
  statePages: CollectionEntry<"state-pages">[];
  cityPages?: CollectionEntry<"city-pages">[];
  verticalPages: CollectionEntry<"vertical-pages">[];
  leadMagnets: CollectionEntry<"lead-magnets">[];
  personas?: CollectionEntry<"personas">[];
  workflows?: CollectionEntry<"workflows">[];
  glossary?: CollectionEntry<"glossary">[];
  features?: CollectionEntry<"features">[];
  integrations?: CollectionEntry<"integrations">[];
  faqHubs?: CollectionEntry<"faq-hubs">[];
  benchmarks?: CollectionEntry<"benchmarks">[];
}

export const topicHubs: TopicHubDefinition[] = [
  {
    slug: "nonprofit-crm",
    title: "Nonprofit CRM",
    description:
      "CRM selection, switching economics, implementation scope, and the donor-plus-grant workflow gap that pushes mid-sized nonprofits out of generic systems.",
    eyebrow: "Topic hub",
    heroTitle: "Nonprofit CRM for grant-funded teams",
    heroDescription:
      "For executive directors, development leaders, and finance staff evaluating whether the next CRM can support donors, grants, and restricted-fund visibility without adding another admin layer.",
    itemCount: 0,
    featuredHrefs: [
      "/resources/guides/nonprofit-crm-pricing-guide",
      "/resources/guides/nonprofit-crm-implementation-plan",
      "/compare/versus/grantpipe-vs-salesforce-nonprofit",
    ],
  },
  {
    slug: "donor-operations",
    title: "Donor Operations",
    description:
      "Donor retention, stewardship, gift processing, development operations, and the workflows that keep fundraising data usable after the gift arrives.",
    eyebrow: "Topic hub",
    heroTitle: "Donor operations for grant-funded nonprofits",
    heroDescription:
      "For development teams that need clean donor records, stewardship follow-through, and reporting habits that do not break when grant and finance context enters the conversation.",
    itemCount: 0,
    featuredHrefs: [
      "/resources/guides/how-to-calculate-donor-retention-rate",
      "/workflows/how-to-reactivate-lapsed-donors",
      "/free/donor-retention-dashboard-template",
    ],
  },
  {
    slug: "grant-management",
    title: "Grant Management",
    description:
      "Pre-award workflow, award acceptance, budget amendments, and grant-operations software decisions for teams that need cleaner execution before and after funding arrives.",
    eyebrow: "Topic hub",
    heroTitle: "Grant management beyond the application tracker",
    heroDescription:
      "Covering the full grant lifecycle from prospecting to closeout - pre-award discovery, post-award workflow, or both.",
    itemCount: 0,
    featuredHrefs: [
      "/grant-management-software",
      "/resources/guides/grant-award-acceptance-checklist",
      "/resources/guides/grant-prospecting-workflow-for-mid-sized-nonprofits",
      "/compare/versus/grantpipe-vs-instrumentl",
    ],
  },
  {
    slug: "grant-compliance",
    title: "Grant Compliance",
    description:
      "Post-award compliance, reporting cadence, audit preparation, closeout, and the systems questions that show up once awards are active and deadlines become operational risk.",
    eyebrow: "Topic hub",
    heroTitle: "Grant compliance for grantee-side operations",
    heroDescription:
      "Written for nonprofits receiving grants, not foundations awarding them. The focus is operational control: documentation, deadlines, reporting readiness, and what your software stack has to prove under pressure.",
    itemCount: 0,
    featuredHrefs: [
      "/grant-compliance-software",
      "/resources/guides/grant-compliance-101-for-nonprofits",
      "/resources/guides/grant-compliance-audit-preparation",
      "/compare/versus/grantpipe-vs-blackbaud",
    ],
  },
  {
    slug: "restricted-fund-accounting",
    title: "Restricted Fund Accounting",
    description:
      "Restricted-fund tracking, month-end close, board reporting, and the difference between tagged transactions and a real cross-team fund workflow.",
    eyebrow: "Topic hub",
    heroTitle: "Restricted-fund accounting for nonprofits",
    heroDescription:
      "For finance, development, and leadership teams that need a shared answer on what is restricted, what has been spent, and what still has to be reported.",
    itemCount: 0,
    featuredHrefs: [
      "/restricted-fund-tracking-software",
      "/resources/guides/restricted-fund-accounting-software-for-nonprofits",
      "/resources/guides/restricted-fund-month-end-close-checklist",
      "/resources/guides/nonprofit-board-grant-reporting-dashboard",
    ],
  },
];

export function getTopicHubSummaries(collections?: TopicHubCollections): CategorySummary[] {
  const counts = collections
    ? buildTopicHubItems(collections)
    : new Map(topicHubs.map((hub) => [hub.slug, { length: hub.itemCount }]));

  return topicHubs.map((hub) => ({
    name: hub.title,
    description: hub.description,
    href: `/resources/topics/${hub.slug}`,
    count: counts.get(hub.slug)?.length ?? hub.itemCount,
  }));
}

export function buildTopicHubContentItems(
  collections: TopicHubCollections,
): Map<string, ContentItem> {
  const items = [
    ...grantCategoryPages.map(
      (page): ContentItem => ({
        title: page.title,
        description: page.description,
        href: page.href,
        buyerStage: page.buyerStage,
        publishedAt: page.publishedAt,
        updatedAt: page.updatedAt,
        relatedPages: page.relatedPages,
        targetPersona: [],
      }),
    ),
    ...mapToContentItems(collections.alternatives, (entry) => {
      return `/compare/alternatives/${entry.data.competitor.slug}`;
    }),
    ...mapToContentItems(collections.comparisons, (entry) => {
      return `/compare/versus/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.pricingBreakdowns, (entry) => {
      return `/compare/pricing/${entry.data.competitor.slug}`;
    }),
    ...mapToContentItems(collections.listicles, (entry) => {
      return `/resources/best/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.guides, (entry) => {
      return `/resources/guides/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.statePages, (entry) => {
      return `/nonprofit-software/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.verticalPages, (entry) => {
      return `/solutions/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.leadMagnets, (entry) => {
      return `/free/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.personas ?? [], (entry) => {
      return `/for/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(
      collections.workflows ?? [],
      (entry) => `/workflows/${getContentEntrySlug(entry)}`,
      (entry) => (entry.data.timeEstimate ? { timeEstimate: entry.data.timeEstimate } : undefined),
    ),
    ...mapToContentItems(collections.glossary ?? [], (entry) => {
      return `/glossary/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.features ?? [], (entry) => {
      return `/features/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.integrations ?? [], (entry) => {
      return `/integrations/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.faqHubs ?? [], (entry) => {
      return `/resources/faq/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.benchmarks ?? [], (entry) => {
      return `/resources/benchmarks/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(collections.cityPages ?? [], (entry) => {
      return `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`;
    }),
  ];

  return new Map(items.map((item) => [item.href, item]));
}

function isTopicHubSlug(value: string | undefined): value is TopicHubSlug {
  return topicHubs.some((hub) => hub.slug === value);
}

function getTopicCluster(entry: TopicClusterEntry): TopicHubSlug | undefined {
  const value = entry.data.topicCluster;
  return typeof value === "string" && isTopicHubSlug(value) ? value : undefined;
}

function addClusteredItems<T extends TopicClusterEntry>(
  map: Map<TopicHubSlug, ContentItem[]>,
  entries: T[],
  itemMap: Map<string, ContentItem>,
  hrefBuilder: (entry: T) => string,
): void {
  for (const entry of entries) {
    const topicCluster = getTopicCluster(entry);
    if (topicCluster === undefined) continue;
    const item = itemMap.get(hrefBuilder(entry));
    if (item === undefined) continue;
    map.get(topicCluster)?.push(item);
  }
}

export function buildTopicHubItems(
  collections: TopicHubCollections,
): Map<TopicHubSlug, ContentItem[]> {
  const itemMap = buildTopicHubContentItems(collections);
  const itemsByHub = new Map<TopicHubSlug, ContentItem[]>(topicHubs.map((hub) => [hub.slug, []]));

  for (const page of grantCategoryPages) {
    if (isTopicHubSlug(page.topicCluster)) {
      const item = itemMap.get(page.href);
      if (item !== undefined) itemsByHub.get(page.topicCluster)?.push(item);
    }
  }

  addClusteredItems(itemsByHub, collections.alternatives, itemMap, (entry) => {
    return `/compare/alternatives/${entry.data.competitor.slug}`;
  });
  addClusteredItems(itemsByHub, collections.comparisons, itemMap, (entry) => {
    return `/compare/versus/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.pricingBreakdowns, itemMap, (entry) => {
    return `/compare/pricing/${entry.data.competitor.slug}`;
  });
  addClusteredItems(itemsByHub, collections.listicles, itemMap, (entry) => {
    return `/resources/best/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.guides, itemMap, (entry) => {
    return `/resources/guides/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.statePages, itemMap, (entry) => {
    return `/nonprofit-software/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.cityPages ?? [], itemMap, (entry) => {
    return `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`;
  });
  addClusteredItems(itemsByHub, collections.verticalPages, itemMap, (entry) => {
    return `/solutions/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.leadMagnets, itemMap, (entry) => {
    return `/free/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.personas ?? [], itemMap, (entry) => {
    return `/for/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.workflows ?? [], itemMap, (entry) => {
    return `/workflows/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.glossary ?? [], itemMap, (entry) => {
    return `/glossary/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.features ?? [], itemMap, (entry) => {
    return `/features/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.integrations ?? [], itemMap, (entry) => {
    return `/integrations/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.faqHubs ?? [], itemMap, (entry) => {
    return `/resources/faq/${getContentEntrySlug(entry)}`;
  });
  addClusteredItems(itemsByHub, collections.benchmarks ?? [], itemMap, (entry) => {
    return `/resources/benchmarks/${getContentEntrySlug(entry)}`;
  });

  return itemsByHub;
}

export function buildTopicHubSections(items: ContentItem[]): TopicHubSection[] {
  const featuredFirst = [...items].sort((a, b) => {
    const featuredDelta = Number(b.featured === true) - Number(a.featured === true);
    if (featuredDelta !== 0) return featuredDelta;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return (["tofu", "mofu", "bofu"] as const)
    .map((buyerStage) => {
      const stageItems = featuredFirst.filter((item) => item.buyerStage === buyerStage);
      const copy = TOPIC_HUB_SECTION_COPY[buyerStage];

      return {
        buyerStage,
        stageLabel: copy.stageLabel,
        title: copy.title,
        description: copy.description,
        browseHref: copy.browseHref,
        items: stageItems.slice(0, TOPIC_HUB_SECTION_LIMIT),
        overflowItems: stageItems.slice(TOPIC_HUB_SECTION_LIMIT),
        totalCount: stageItems.length,
      };
    })
    .filter((section) => section.totalCount > 0);
}
