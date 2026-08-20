import { getCollection } from "astro:content";
import { getContentEntrySlug } from "@/lib/content-entry-slug";
import { grantPipeTrialCopy, siteConfig } from "@/config/site";
import { buildLlmsTxt, buildLlmsTxtSections } from "@grantpipe/ui/site/lib/llms-txt";
import { normalizeHubCanonicalUrl } from "@grantpipe/ui/site/lib/hub-utils";
import { renderKeyStatsMarkdown, ABOUT_GRANTPIPE_MARKDOWN } from "@/lib/key-statistics";
import { buildMachineReadableFacts } from "@/lib/machine-readable";
import type { APIContext } from "astro";
import { getTopicHubSummaries } from "@/lib/topic-hubs";
import { grantCategoryPages } from "@/config/grant-recipient-seo";

export const prerender = true;

export async function GET(_context: APIContext) {
  const siteUrl = `https://${siteConfig.domain}`;

  const [
    alternatives,
    comparisons,
    pricingBreakdowns,
    listicles,
    guides,
    statePages,
    verticalPages,
    leadMagnets,
    personas,
    workflows,
    features,
    glossary,
    integrations,
    faqHubs,
  ] = await Promise.all([
    getCollection("alternatives"),
    getCollection("comparisons"),
    getCollection("pricing-breakdowns"),
    getCollection("listicles"),
    getCollection("guides"),
    getCollection("state-pages"),
    getCollection("vertical-pages"),
    getCollection("lead-magnets"),
    getCollection("personas"),
    getCollection("workflows"),
    getCollection("features"),
    getCollection("glossary"),
    getCollection("integrations"),
    getCollection("faq-hubs"),
  ]);

  const keyStats = renderKeyStatsMarkdown() + "\n" + ABOUT_GRANTPIPE_MARKDOWN + "\n\n";

  const contentSections = [
    {
      heading: "Grant Recipient Category Pages",
      items: grantCategoryPages.map((page) => ({
        title: page.title,
        url: `${siteUrl}${page.href}/`,
        description: page.description,
      })),
    },
    {
      heading: "Topic Hubs",
      items: getTopicHubSummaries().map((hub) => ({
        title: hub.name,
        url: normalizeHubCanonicalUrl(`${siteUrl}${hub.href}`),
        description: hub.description,
      })),
    },
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Guides",
        entries: guides,
        path: (entry) => `/resources/guides/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Comparisons",
        entries: comparisons,
        path: (entry) => `/compare/versus/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Alternatives",
        entries: alternatives,
        path: (entry) => `/compare/alternatives/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Pricing Breakdowns",
        entries: pricingBreakdowns,
        path: (entry) => `/compare/pricing/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Listicles",
        entries: listicles,
        path: (entry) => `/resources/best/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "State Pages",
        entries: statePages,
        path: (entry) => `/nonprofit-software/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Solutions",
        entries: verticalPages,
        path: (entry) => `/solutions/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Free Resources",
        entries: leadMagnets,
        path: (entry) => `/free/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Solutions for Your Role",
        entries: personas,
        path: (entry) => `/for/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "How-To Workflows",
        entries: workflows,
        path: (entry) => `/workflows/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Product Features",
        entries: features,
        path: (entry) => `/features/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Glossary",
        entries: glossary,
        path: (entry) => `/glossary/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "Integrations",
        entries: integrations,
        path: (entry) => `/integrations/${getContentEntrySlug(entry)}`,
      },
    ]),
    ...buildLlmsTxtSections(siteUrl, [
      {
        heading: "FAQ Hubs",
        entries: faqHubs,
        path: (entry) => `/resources/faq/${getContentEntrySlug(entry)}`,
      },
    ]),
  ];

  const generatedBody = buildLlmsTxt({
    name: siteConfig.name,
    description: siteConfig.metaDescription ?? siteConfig.tagline,
    overview: siteConfig.tagline,
    facts: buildMachineReadableFacts(siteConfig, grantPipeTrialCopy),
    sections: [
      {
        heading: "Machine-Readable Resources",
        items: [
          {
            title: "Pricing",
            url: `${siteUrl}/pricing.txt`,
            description: "Plain-text pricing, limits, and competitor comparison for AI agents.",
          },
          {
            title: "Website",
            url: `${siteUrl}/`,
            description: "Canonical product overview and conversion entry point for GrantPipe.",
          },
          {
            title: "Grant management category",
            url: `${siteUrl}/grant-management-software/`,
            description:
              "Commercial category landing page for grantee-side grant management evaluation.",
          },
          {
            title: "Compliance-first grant management system guide",
            url: `${siteUrl}/resources/guides/compliance-first-grant-management-system/`,
            description:
              "Exact category guide defining compliance-first grant management systems, post-award records, proof requirements, and vendor evaluation checks.",
          },
          {
            title: "Grant management software for nonprofits guide",
            url: `${siteUrl}/resources/guides/grant-management-software-for-nonprofits/`,
            description:
              "Guide to GrantPipe's compliance-first grant management system, eight modules, and plan-specific feature boundaries.",
          },
          {
            title: "Grant compliance glossary",
            url: `${siteUrl}/glossary/grant-compliance/`,
            description:
              "Defined-term page for grant compliance and the records nonprofits keep connected after award.",
          },
        ],
      },
      ...contentSections,
    ],
  });

  const body = keyStats + generatedBody;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
