import type { CollectionEntry } from "astro:content";
import { getContentEntrySlug } from "./content-entry-slug";
import { grantCategoryPages } from "../config/grant-recipient-seo";

export type { ResolvedPageLink } from "@grantpipe/ui/site/lib/related-page-resolver";

type ContentEntry = { title: string; description: string };
type VersusSubject = { slug: string; name: string };

const GRANTPIPE_SLUG = "grantpipe";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function orderVersusSubjects<T extends VersusSubject>(a: T, b: T): [T, T] {
  if (a.slug === GRANTPIPE_SLUG || b.slug !== GRANTPIPE_SLUG) {
    return [a, b];
  }

  return [b, a];
}

export function orderListicleToolsGrantPipeFirst<T extends { name: string }>(tools: T[]): T[] {
  const grantPipeIndex = tools.findIndex((tool) => tool.name === "GrantPipe");

  if (grantPipeIndex <= 0) {
    return tools;
  }

  const ordered = [...tools];
  const [grantPipeTool] = ordered.splice(grantPipeIndex, 1);

  return [grantPipeTool!, ...ordered];
}

export function buildVersusComparisonPath(
  competitorA: VersusSubject,
  competitorB: VersusSubject,
): string {
  const [firstCompetitor, secondCompetitor] = orderVersusSubjects(competitorA, competitorB);
  return `/compare/versus/${firstCompetitor.slug}-vs-${secondCompetitor.slug}`;
}

export function buildVersusComparisonLabel(
  competitorA: VersusSubject,
  competitorB: VersusSubject,
): string {
  const [firstCompetitor, secondCompetitor] = orderVersusSubjects(competitorA, competitorB);
  return `${firstCompetitor.name} vs ${secondCompetitor.name}`;
}

export function normalizeVersusComparisonTitle(
  title: string,
  competitorA: VersusSubject,
  competitorB: VersusSubject,
): string {
  const originalLabel = `${competitorA.name} vs ${competitorB.name}`;
  const normalizedLabel = buildVersusComparisonLabel(competitorA, competitorB);

  if (originalLabel === normalizedLabel) {
    return title;
  }

  const normalizedTitle = title.replace(
    new RegExp(escapeRegExp(originalLabel), "i"),
    normalizedLabel,
  );

  return normalizedTitle;
}

export function buildContentMap(collections: {
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
}): Map<string, ContentEntry> {
  const map = new Map<string, ContentEntry>();

  map.set("/product", {
    title: "Product",
    description: "See how GrantPipe connects donors, grants, funds, and reports.",
  });
  map.set("/pricing", {
    title: "Pricing",
    description: "See plans, trial details, and fit.",
  });

  for (const entry of collections.alternatives) {
    map.set(`/compare/alternatives/${entry.data.competitor.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.comparisons) {
    const key = buildVersusComparisonPath(entry.data.competitorA, entry.data.competitorB);
    const normalizedTitle = normalizeVersusComparisonTitle(
      entry.data.title,
      entry.data.competitorA,
      entry.data.competitorB,
    );
    const value = {
      title: normalizedTitle,
      description: entry.data.description,
    };

    map.set(key, value);
    map.set(`/compare/versus/${getContentEntrySlug(entry)}`, value);
  }

  for (const entry of collections.pricingBreakdowns) {
    map.set(`/compare/pricing/${entry.data.competitor.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.listicles) {
    map.set(`/resources/best/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.guides) {
    map.set(`/resources/guides/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.statePages) {
    map.set(`/nonprofit-software/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.cityPages ?? []) {
    map.set(`/nonprofit-software/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.verticalPages) {
    map.set(`/solutions/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.leadMagnets) {
    map.set(`/free/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.personas ?? []) {
    map.set(`/for/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.workflows ?? []) {
    map.set(`/workflows/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.glossary ?? []) {
    map.set(`/glossary/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.features ?? []) {
    map.set(`/features/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.integrations ?? []) {
    map.set(`/integrations/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.faqHubs ?? []) {
    map.set(`/resources/faq/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.benchmarks ?? []) {
    map.set(`/resources/benchmarks/${getContentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const page of grantCategoryPages) {
    map.set(page.href, {
      title: page.title,
      description: page.description,
    });
  }

  return map;
}

export function padToolIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function buildOptionalHowToSchema(
  steps: Array<{ title: string; content: string }> | undefined,
  title: string,
  description: string,
): Record<string, unknown> | null {
  if (!steps || steps.length === 0) return null;
  return {
    "@type": "HowTo",
    name: title,
    description,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.content,
    })),
  };
}
