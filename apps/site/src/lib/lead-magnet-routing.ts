import type { CollectionEntry } from "astro:content";
import {
  LEAD_MAGNET_TITLES,
  isLeadMagnetSlug,
  type LeadMagnetSlug,
} from "../../../../packages/shared/src/constants/lead-magnets";
import type { LeadMagnetOffer, LeadMagnetRouteFamily, SiteConfig } from "@grantpipe/ui/site";
import { getContentEntrySlug } from "./content-entry-slug";

export type { LeadMagnetRouteFamily };

type ResolvedLeadMagnetOffer = LeadMagnetOffer & { slug: LeadMagnetSlug };

interface ResolveLeadMagnetSlugOptions {
  family: LeadMagnetRouteFamily;
  explicitSlug?: LeadMagnetSlug;
  relatedPages?: string[];
  /** Guide tags from frontmatter; used for topic-aware fallback when no explicit or related-page slug is found. */
  tags?: string[];
}

/**
 * Maps guide tags to a more relevant lead magnet slug when the generic family
 * fallback would otherwise apply. Only maps to slugs that are known to exist.
 * Returns undefined when no topic match is found (caller uses the family default).
 */
export function resolveTopicAwareLeadMagnetSlug(tags: string[]): LeadMagnetSlug | undefined {
  const normalized = tags.map((t) => t.toLowerCase());

  const has = (keyword: string) => normalized.some((t) => t.includes(keyword));

  // Donor / fundraising / retention topics
  if (
    has("donor retention") ||
    has("donor-retention") ||
    has("donor-cadence") ||
    has("annual-fund") ||
    has("fundraising") ||
    has("major donor") ||
    has("recurring gift") ||
    has("stewardship")
  ) {
    return "donor-retention-playbook";
  }

  // CRM / software evaluation topics
  if (
    has("crm") ||
    has("nonprofit-crm") ||
    has("nonprofit software") ||
    has("software evaluation") ||
    has("nonprofit-software") ||
    has("donor management")
  ) {
    return "nonprofit-crm-evaluation-scorecard";
  }

  // Restricted fund / fund accounting topics
  if (
    has("restricted fund") ||
    has("restricted-fund") ||
    has("fund accounting") ||
    has("fasb") ||
    has("net asset")
  ) {
    return "restricted-fund-tracking-spreadsheet";
  }

  // Audit / single audit / audit prep topics
  if (
    has("single audit") ||
    has("audit prep") ||
    has("audit-prep") ||
    has("audit requirements") ||
    has("audit readiness")
  ) {
    return "audit-prep-week-by-week-checklist";
  }

  // Grant reporting topics
  if (
    has("grant-reporting") ||
    has("grant reporting") ||
    has("funder report") ||
    has("reporting template")
  ) {
    return "grant-reporting-calendar-template";
  }

  // Grant budget / cost topics
  if (
    has("grant budget") ||
    has("cost allocation") ||
    has("indirect cost") ||
    has("allowable costs") ||
    has("cost-principles")
  ) {
    return "cost-allocation-plan-worksheet";
  }

  return undefined;
}

function buildLeadMagnetOffer(
  slug: LeadMagnetSlug,
  title: string,
  description: string,
): ResolvedLeadMagnetOffer {
  return {
    slug,
    title,
    description: `${description} Delivered by email.`,
    teaser: description,
    headline: `Get the ${title}`,
    ctaText: `Email Me the ${title}`,
    successMessage: "Check your email",
    successSubMessage: `We're sending ${title} now. It usually arrives within a minute.`,
  };
}

function resolveSingleLeadMagnetOffer(
  slug: LeadMagnetSlug,
  entries: CollectionEntry<"lead-magnets">[],
): ResolvedLeadMagnetOffer {
  const entry = entries.find((candidate) => getLeadMagnetEntrySlug(candidate) === slug);

  if (!entry) {
    const title = LEAD_MAGNET_TITLES[slug];
    return buildLeadMagnetOffer(
      slug,
      title,
      "A practical GrantPipe PDF resource for evaluating donor, grant, and compliance workflows.",
    );
  }

  return buildLeadMagnetOffer(slug, entry.data.title, entry.data.description);
}

export function resolveLeadMagnetSlug(
  config: SiteConfig,
  options: ResolveLeadMagnetSlugOptions,
): LeadMagnetSlug {
  if (options.explicitSlug) {
    return options.explicitSlug;
  }

  const relatedLeadMagnetSlug = options.relatedPages
    ?.map((page) => page.match(/^\/free\/([^/]+)\/?$/)?.[1])
    .find((slug): slug is LeadMagnetSlug => isLeadMagnetSlug(slug));

  if (relatedLeadMagnetSlug) {
    return relatedLeadMagnetSlug;
  }

  if (options.tags && options.tags.length > 0) {
    const topicSlug = resolveTopicAwareLeadMagnetSlug(options.tags);
    if (topicSlug) {
      return topicSlug;
    }
  }

  return config.leadMagnets.fallbackByFamily[options.family];
}

export function resolveFeaturedLeadMagnetSlugs(config: SiteConfig): LeadMagnetSlug[] {
  return [...config.leadMagnets.featuredSlugs];
}

export function getLeadMagnetEntrySlug(entry: CollectionEntry<"lead-magnets">): string {
  return getContentEntrySlug(entry);
}

export function resolveLeadMagnetOffer(
  config: SiteConfig,
  entries: CollectionEntry<"lead-magnets">[],
  options: ResolveLeadMagnetSlugOptions,
): ResolvedLeadMagnetOffer {
  const slug = resolveLeadMagnetSlug(config, options);
  const primary = resolveSingleLeadMagnetOffer(slug, entries);
  const alternatives = resolveFeaturedLeadMagnetSlugs(config)
    .filter((candidateSlug) => candidateSlug !== slug)
    .slice(0, 2)
    .map((candidateSlug) => resolveSingleLeadMagnetOffer(candidateSlug, entries));

  return { ...primary, alternatives };
}

interface ResolveExitLeadMagnetOfferOptions {
  family: LeadMagnetRouteFamily;
  exitSlug?: LeadMagnetSlug;
  leadMagnetSlug?: LeadMagnetSlug;
  relatedPages?: string[];
}

export function resolveExitLeadMagnetOffer(
  config: SiteConfig,
  entries: CollectionEntry<"lead-magnets">[],
  options: ResolveExitLeadMagnetOfferOptions,
): ResolvedLeadMagnetOffer {
  const explicitSlug = options.exitSlug ?? options.leadMagnetSlug;
  return resolveLeadMagnetOffer(config, entries, {
    family: options.family,
    explicitSlug,
    relatedPages: options.relatedPages,
  });
}
