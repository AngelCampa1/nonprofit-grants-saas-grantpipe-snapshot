import type { ContentItem } from "@grantpipe/ui/site/types";

export interface PathwaySection {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  items: ContentItem[];
}

type SectionDefinition = Omit<PathwaySection, "items"> & {
  matches: (item: ContentItem) => boolean;
};

function textFor(item: ContentItem): string {
  return `${item.title} ${item.description} ${item.href}`.toLowerCase();
}

function normalizeSearchText(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/\bgrantpipe\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function titleAndHrefFor(item: ContentItem): string {
  return `${item.title} ${item.href}`;
}

function includesAny(item: ContentItem, terms: string[]): boolean {
  const text = normalizeSearchText(textFor(item));
  return terms.some((term) => {
    const normalizedTerm = normalizeSearchText(term).trim();
    return text.includes(` ${normalizedTerm} `) || text.includes(` ${normalizedTerm}s `);
  });
}

function includesAnyInTitleOrHref(item: ContentItem, terms: string[]): boolean {
  const text = normalizeSearchText(titleAndHrefFor(item));
  return terms.some((term) => {
    const normalizedTerm = normalizeSearchText(term).trim();
    return text.includes(` ${normalizedTerm} `) || text.includes(` ${normalizedTerm}s `);
  });
}

export function buildPathwaySections(
  items: ContentItem[],
  definitions: SectionDefinition[],
): PathwaySection[] {
  const claimed = new Set<string>();

  const sections = definitions.map((definition) => {
    const sectionItems = items.filter((item) => {
      if (claimed.has(item.href)) {
        return false;
      }

      const matched = definition.matches(item);
      if (matched) {
        claimed.add(item.href);
      }
      return matched;
    });

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      ctaLabel: definition.ctaLabel,
      ctaHref: definition.ctaHref,
      items: sectionItems,
    };
  });

  const uncategorized = items.filter((item) => !claimed.has(item.href));
  if (uncategorized.length === 0 || sections.length === 0) {
    return sections.filter((section) => section.items.length > 0);
  }

  const lastSection = sections[sections.length - 1]!;
  lastSection.items = [...lastSection.items, ...uncategorized];

  return sections.filter((section) => section.items.length > 0);
}

export function buildFaqPathSections(items: ContentItem[]): PathwaySection[] {
  return buildPathwaySections(items, [
    {
      id: "state-rules",
      title: "Check state rules",
      description: "Use these FAQ hubs when a filing or state rule is unclear.",
      ctaLabel: "See state FAQ hubs",
      ctaHref: "/resources/faq/#state-rules",
      matches: (item) =>
        includesAny(item, [
          "california",
          "florida",
          "illinois",
          "massachusetts",
          "new york",
          "north carolina",
          "ohio",
          "pennsylvania",
          "texas",
        ]),
    },
    {
      id: "grant-questions",
      title: "Answer grant questions",
      description: "Use these when grant rules, awards, or reports slow the team down.",
      ctaLabel: "See grant FAQ hubs",
      ctaHref: "/resources/faq/#grant-questions",
      matches: (item) => includesAny(item, ["grant", "compliance", "award", "report"]),
    },
    {
      id: "donor-work",
      title: "Sort donor work",
      description: "Use these when CRM, donor, or gift records are the blocker.",
      ctaLabel: "See donor FAQ hubs",
      ctaHref: "/resources/faq/#donor-work",
      matches: (item) => includesAny(item, ["donor", "crm", "gift", "fundraising"]),
    },
  ]);
}

export function buildBenchmarkPathSections(items: ContentItem[]): PathwaySection[] {
  return buildPathwaySections(items, [
    {
      id: "audit-risk",
      title: "Size audit risk",
      description: "Use these numbers when audit prep or compliance risk needs context.",
      ctaLabel: "See audit benchmarks",
      ctaHref: "/resources/benchmarks/#audit-risk",
      matches: (item) => includesAny(item, ["audit", "compliance", "single audit"]),
    },
    {
      id: "donor-health",
      title: "Check donor health",
      description: "Use these benchmarks to compare donor and CRM work.",
      ctaLabel: "See donor benchmarks",
      ctaHref: "/resources/benchmarks/#donor-health",
      matches: (item) => includesAny(item, ["donor", "crm", "retention", "fundraising"]),
    },
    {
      id: "local-context",
      title: "Compare local context",
      description: "Use these city and sector pages when location changes the answer.",
      ctaLabel: "See local benchmarks",
      ctaHref: "/resources/benchmarks/#local-context",
      matches: (item) =>
        includesAny(item, ["jacksonville", "memphis", "raleigh", "nyc", "washington dc", "sector"]),
    },
  ]);
}

export function buildFeaturePathSections(items: ContentItem[]): PathwaySection[] {
  return buildPathwaySections(items, [
    {
      id: "run-grants",
      title: "Run grants",
      description: "Track awards, budgets, deadlines, reports, and grant files.",
      ctaLabel: "See grant features",
      ctaHref: "/features/#run-grants",
      matches: (item) => includesAny(item, ["grant", "award", "funder", "subrecipient"]),
    },
    {
      id: "donor-work",
      title: "Clean up donor work",
      description: "Use these features when donor records or gifts need order.",
      ctaLabel: "See donor features",
      ctaHref: "/features/#donor-work",
      matches: (item) => includesAny(item, ["donor", "pledge", "acknowledgment", "email"]),
    },
    {
      id: "review-work",
      title: "Prepare for review",
      description: "Use these features for audits, reports, controls, and evidence.",
      ctaLabel: "See review features",
      ctaHref: "/features/#review-work",
      matches: (item) =>
        includesAny(item, ["audit", "report", "board", "evidence", "accounting", "ledger"]),
    },
  ]);
}

export function buildIntegrationPathSections(items: ContentItem[]): PathwaySection[] {
  return buildPathwaySections(items, [
    {
      id: "gift-tools",
      title: "Bring in gifts",
      description: "Connect donation and event tools to GrantPipe records.",
      ctaLabel: "See gift integrations",
      ctaHref: "/integrations/#gift-tools",
      matches: (item) =>
        includesAnyInTitleOrHref(item, ["donorbox", "classy", "eventbrite", "donation", "payment"]),
    },
    {
      id: "email-tools",
      title: "Keep email lists in sync",
      description: "Connect email and CRM tools so contact work stays cleaner.",
      ctaLabel: "See email integrations",
      ctaHref: "/integrations/#email-tools",
      matches: (item) =>
        includesAnyInTitleOrHref(item, [
          "mailchimp",
          "constant contact",
          "hubspot",
          "salesforce",
          "email",
        ]),
    },
    {
      id: "automation-links",
      title: "Move routine data",
      description: "Use automation links when exports are taking too much time.",
      ctaLabel: "See automation links",
      ctaHref: "/integrations/#automation-links",
      matches: (item) => includesAnyInTitleOrHref(item, ["zapier", "automation", "sync"]),
    },
  ]);
}
