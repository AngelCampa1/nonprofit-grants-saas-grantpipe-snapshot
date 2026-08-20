import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { siteConfig } from "@/config/site";
import { getContentEntrySlug } from "@/lib/content-entry-slug";
import { buildVersusComparisonPath } from "@/lib/page-helpers";
import { buildRssFeedOptions, contentItemToRssItem } from "@grantpipe/ui/site/lib/rss-utils";
import type { APIContext } from "astro";

export async function GET(_context: APIContext) {
  const [
    alternatives,
    comparisons,
    pricingBreakdowns,
    listicles,
    guides,
    statePages,
    verticalPages,
    leadMagnets,
    glossary,
  ] = await Promise.all([
    getCollection("alternatives"),
    getCollection("comparisons"),
    getCollection("pricing-breakdowns"),
    getCollection("listicles"),
    getCollection("guides"),
    getCollection("state-pages"),
    getCollection("vertical-pages"),
    getCollection("lead-magnets"),
    getCollection("glossary"),
  ]);

  const siteUrl = `https://${siteConfig.domain}`;
  const absoluteUrl = (path: string) => `${siteUrl}${path.endsWith("/") ? path : `${path}/`}`;

  const items = [
    ...alternatives.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/compare/alternatives/${e.data.competitor.slug}`),
      }),
    ),
    ...comparisons.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(buildVersusComparisonPath(e.data.competitorA, e.data.competitorB)),
      }),
    ),
    ...pricingBreakdowns.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/compare/pricing/${e.data.competitor.slug}`),
      }),
    ),
    ...listicles.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/resources/best/${getContentEntrySlug(e)}`),
      }),
    ),
    ...guides.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/resources/guides/${getContentEntrySlug(e)}`),
      }),
    ),
    ...statePages.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/nonprofit-software/${getContentEntrySlug(e)}`),
      }),
    ),
    ...verticalPages.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/solutions/${getContentEntrySlug(e)}`),
      }),
    ),
    ...leadMagnets.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/free/${getContentEntrySlug(e)}`),
      }),
    ),
    ...glossary.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: absoluteUrl(`/glossary/${getContentEntrySlug(e)}`),
      }),
    ),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss(buildRssFeedOptions(siteConfig, items));
}
