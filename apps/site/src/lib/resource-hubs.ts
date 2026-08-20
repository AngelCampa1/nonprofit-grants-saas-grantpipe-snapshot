import type { CollectionEntry } from "astro:content";
import type { BuyerStage, CategorySummary, ContentItem, NavMenuGroup } from "@grantpipe/ui/site";
import { mapToContentItems, sortByUpdatedAtDesc } from "@grantpipe/ui/site/lib/collections";

import { grantCategoryPages } from "../config/grant-recipient-seo";
import { getContentEntrySlug } from "./content-entry-slug";
import { topicHubs } from "./topic-hubs";

export interface ResourceHubCollections {
  alternatives: CollectionEntry<"alternatives">[];
  comparisons: CollectionEntry<"comparisons">[];
  pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
  listicles: CollectionEntry<"listicles">[];
  guides: CollectionEntry<"guides">[];
  statePages: CollectionEntry<"state-pages">[];
  cityPages: CollectionEntry<"city-pages">[];
  verticalPages: CollectionEntry<"vertical-pages">[];
  leadMagnets: CollectionEntry<"lead-magnets">[];
  personas: CollectionEntry<"personas">[];
  workflows: CollectionEntry<"workflows">[];
  glossary: CollectionEntry<"glossary">[];
  features: CollectionEntry<"features">[];
  integrations: CollectionEntry<"integrations">[];
  faqHubs: CollectionEntry<"faq-hubs">[];
  benchmarks: CollectionEntry<"benchmarks">[];
}

export type ResourceHubMenuGroup = "discover" | "compare" | "audience" | "reference";
export type ResourceHubPrimaryCta = "trial" | "lead-magnet" | "compare" | "pricing" | "contact";
export const resourceHubStageLabels: Record<BuyerStage, string> = {
  tofu: "Learn",
  mofu: "Compare",
  bofu: "Decide",
};

export interface ResourceHubDefinition {
  title: string;
  href: string;
  description: string;
  menuDescription: string;
  menuGroup: ResourceHubMenuGroup;
  buyerStage: BuyerStage;
  primaryCta: ResourceHubPrimaryCta;
  nextStepHref: string;
  nextStepLabel: string;
}

export const resourceHubs: ResourceHubDefinition[] = [
  {
    title: "Topic Hubs",
    href: "/resources/topics",
    description:
      "Clustered reading paths across nonprofit CRM, donor operations, grant management, compliance, and restricted-fund accounting.",
    menuDescription: "Start with the problem area.",
    menuGroup: "discover",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "Guides",
    href: "/resources/guides",
    description: "How-to guides, explainers, and implementation playbooks for nonprofit operators.",
    menuDescription: "How-to guides and explainers.",
    menuGroup: "discover",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "Compare",
    href: "/compare",
    description:
      "Alternatives, head-to-head comparisons, pricing breakdowns, and software roundups.",
    menuDescription: "Alternatives, pricing, and roundups.",
    menuGroup: "compare",
    buyerStage: "mofu",
    primaryCta: "pricing",
    nextStepHref: "/pricing",
    nextStepLabel: "See pricing",
  },
  {
    title: "Free Resources",
    href: "/free",
    description: "Checklists, templates, calculators, worksheets, and gated resource pages.",
    menuDescription: "Templates, checklists, and calculators.",
    menuGroup: "discover",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "By State",
    href: "/nonprofit-software",
    description:
      "State and city nonprofit software pages for local compliance and operating context.",
    menuDescription: "State and city resource hubs.",
    menuGroup: "audience",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "By Organization Type",
    href: "/solutions",
    description: "Resource paths organized by nonprofit vertical and operating model.",
    menuDescription: "Vertical nonprofit paths.",
    menuGroup: "audience",
    buyerStage: "mofu",
    primaryCta: "trial",
    nextStepHref: "/product",
    nextStepLabel: "See the product",
  },
  {
    title: "By Role",
    href: "/for",
    description: "Role-based paths for executive, development, finance, and grants teams.",
    menuDescription: "Executive, finance, and grants roles.",
    menuGroup: "audience",
    buyerStage: "mofu",
    primaryCta: "trial",
    nextStepHref: "/product",
    nextStepLabel: "See the product",
  },
  {
    title: "Workflows",
    href: "/workflows",
    description: "Step-by-step operating workflows for donor, grant, and restricted-fund work.",
    menuDescription: "Step-by-step operating playbooks.",
    menuGroup: "discover",
    buyerStage: "mofu",
    primaryCta: "trial",
    nextStepHref: "/product",
    nextStepLabel: "See the product",
  },
  {
    title: "Integrations",
    href: "/integrations",
    description:
      "Email, payments, automation, and donor-platform integrations for connected nonprofit operations.",
    menuDescription: "Email, payments, automation, and donor-platform connectors.",
    menuGroup: "reference",
    buyerStage: "mofu",
    primaryCta: "pricing",
    nextStepHref: "/pricing",
    nextStepLabel: "See pricing",
  },
  {
    title: "Reference Library",
    href: "/resources/reference",
    description: "FAQ hubs, glossary definitions, benchmarks, features, and integrations.",
    menuDescription: "FAQ, glossary, benchmarks, and integrations.",
    menuGroup: "reference",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "FAQ Hubs",
    href: "/resources/faq",
    description:
      "Question-and-answer hubs for nonprofit CRM, grant compliance, donor operations, restricted funds, and local nonprofit requirements.",
    menuDescription: "Focused question-and-answer hubs.",
    menuGroup: "reference",
    buyerStage: "tofu",
    primaryCta: "lead-magnet",
    nextStepHref: "/free/grant-compliance-checklist",
    nextStepLabel: "Get the grant checklist",
  },
  {
    title: "Benchmarks",
    href: "/resources/benchmarks",
    description:
      "Benchmark pages for nonprofit grant compliance, donor retention, audit exposure, accounting, and sector operating context.",
    menuDescription: "Sector, audit, CRM, and compliance benchmarks.",
    menuGroup: "compare",
    buyerStage: "mofu",
    primaryCta: "compare",
    nextStepHref: "/compare",
    nextStepLabel: "See options",
  },
];

const RESOURCE_HUB_MENU_GROUP_ORDER: { key: ResourceHubMenuGroup; heading: string }[] = [
  { key: "discover", heading: "Discover" },
  { key: "compare", heading: "Compare" },
  { key: "audience", heading: "By Audience" },
  { key: "reference", heading: "Reference" },
];

export function getResourcesMegamenuGroups(): NavMenuGroup[] {
  return RESOURCE_HUB_MENU_GROUP_ORDER.map(({ key, heading }) => ({
    heading,
    links: resourceHubs
      .filter((hub) => hub.menuGroup === key)
      .map((hub) => ({
        label: hub.title,
        href: hub.href,
        description: hub.menuDescription,
      })),
  }));
}

function topicHubItems(): ContentItem[] {
  return topicHubs.map((hub) => ({
    title: hub.title,
    description: hub.description,
    href: `/resources/topics/${hub.slug}`,
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    relatedPages: [],
    targetPersona: [],
  }));
}

function comparisonHref(entry: CollectionEntry<"comparisons">): string {
  const slugA = entry.data.competitorA.slug;
  const slugB = entry.data.competitorB.slug;
  // Put grantpipe first; if neither is grantpipe, preserve original order.
  const [first, second] =
    slugA === "grantpipe" || slugB !== "grantpipe" ? [slugA, slugB] : [slugB, slugA];

  return `/compare/versus/${first}-vs-${second}`;
}

export function buildResourceHubItems(
  collections: ResourceHubCollections,
): Map<string, ContentItem[]> {
  const itemsByHub = new Map<string, ContentItem[]>(
    resourceHubs.map((hub) => [hub.href, [] as ContentItem[]]),
  );

  const topicsItems: ContentItem[] = [
    ...topicHubItems(),
    ...grantCategoryPages.map((page) => ({
      title: page.title,
      description: page.description,
      href: page.href,
      buyerStage: page.buyerStage,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      relatedPages: page.relatedPages,
      targetPersona: [] as string[],
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  itemsByHub.get("/resources/topics")?.push(...topicsItems);

  itemsByHub.get("/resources/guides")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.guides), (entry) => {
      return `/resources/guides/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/compare")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.alternatives), (entry) => {
      return `/compare/alternatives/${entry.data.competitor.slug}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.comparisons), comparisonHref),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.pricingBreakdowns), (entry) => {
      return `/compare/pricing/${entry.data.competitor.slug}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.listicles), (entry) => {
      return `/resources/best/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/free")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.leadMagnets), (entry) => {
      return `/free/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/nonprofit-software")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.statePages), (entry) => {
      return `/nonprofit-software/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.cityPages), (entry) => {
      return `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`;
    }),
  );

  itemsByHub.get("/solutions")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.verticalPages), (entry) => {
      return `/solutions/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/for")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.personas), (entry) => {
      return `/for/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/workflows")?.push(
    ...mapToContentItems(
      sortByUpdatedAtDesc(collections.workflows),
      (entry) => `/workflows/${getContentEntrySlug(entry)}`,
      (entry) => (entry.data.timeEstimate ? { timeEstimate: entry.data.timeEstimate } : undefined),
    ),
  );

  itemsByHub.get("/resources/reference")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.faqHubs), (entry) => {
      return `/resources/faq/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.glossary), (entry) => {
      return `/glossary/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.benchmarks), (entry) => {
      return `/resources/benchmarks/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.features), (entry) => {
      return `/features/${getContentEntrySlug(entry)}`;
    }),
    ...mapToContentItems(sortByUpdatedAtDesc(collections.integrations), (entry) => {
      return `/integrations/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/integrations")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.integrations), (entry) => {
      return `/integrations/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/resources/faq")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.faqHubs), (entry) => {
      return `/resources/faq/${getContentEntrySlug(entry)}`;
    }),
  );

  itemsByHub.get("/resources/benchmarks")?.push(
    ...mapToContentItems(sortByUpdatedAtDesc(collections.benchmarks), (entry) => {
      return `/resources/benchmarks/${getContentEntrySlug(entry)}`;
    }),
  );

  return itemsByHub;
}

export function buildResourceHubSummaries(collections: ResourceHubCollections): CategorySummary[] {
  const itemsByHub = buildResourceHubItems(collections);

  return resourceHubs.map((hub) => ({
    name: hub.title,
    description: hub.description,
    href: hub.href,
    count: itemsByHub.get(hub.href)?.length ?? 0,
  }));
}
