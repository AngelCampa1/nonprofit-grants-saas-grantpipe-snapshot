import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { siteConfig } from "../config/site";
import { buildRssFeedOptions } from "@grantpipe/ui/site/lib/rss-utils";

import { GET } from "../pages/rss.xml";

vi.mock("@astrojs/rss", () => ({
  default: vi.fn(() => new Response("rss")),
}));

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
}));

const collectionNames = [
  "alternatives",
  "comparisons",
  "pricing-breakdowns",
  "listicles",
  "guides",
  "state-pages",
  "vertical-pages",
  "lead-magnets",
  "glossary",
] as const;

const buildEntry = (collection: (typeof collectionNames)[number]) => ({
  id: `${collection}-slug.md`,
  data: {
    title: `${collection} title`,
    description: `${collection} description`,
    publishedAt: new Date(`2026-01-${collectionNames.indexOf(collection) + 1}`),
    competitor: { slug: `${collection}-competitor`, name: `${collection} competitor` },
    competitorA: { slug: "grantpipe", name: "GrantPipe" },
    competitorB: { slug: "other-crm", name: "Other CRM" },
  },
});

describe("rss.xml", () => {
  beforeEach(() => {
    vi.mocked(rss).mockClear();
    vi.mocked(getCollection).mockImplementation(
      async (collection) => [buildEntry(collection as (typeof collectionNames)[number])] as never,
    );
  });

  it("builds an RSS feed from every public content collection", async () => {
    await expect(GET({} as never)).resolves.toBeInstanceOf(Response);

    expect(getCollection).toHaveBeenCalledTimes(collectionNames.length);
    expect(getCollection).toHaveBeenNthCalledWith(1, "alternatives");
    expect(getCollection).toHaveBeenNthCalledWith(8, "lead-magnets");
    expect(getCollection).toHaveBeenNthCalledWith(9, "glossary");

    const siteUrl = `https://${siteConfig.domain}`;
    const expectedPathByCollection = {
      alternatives: "/compare/alternatives/alternatives-competitor/",
      comparisons: "/compare/versus/grantpipe-vs-other-crm/",
      "pricing-breakdowns": "/compare/pricing/pricing-breakdowns-competitor/",
      listicles: "/resources/best/listicles-slug/",
      guides: "/resources/guides/guides-slug/",
      "state-pages": "/nonprofit-software/state-pages-slug/",
      "vertical-pages": "/solutions/vertical-pages-slug/",
      "lead-magnets": "/free/lead-magnets-slug/",
      glossary: "/glossary/glossary-slug/",
    } satisfies Record<(typeof collectionNames)[number], string>;

    const expectedItems = collectionNames
      .map((collection) => ({
        title: `${collection} title`,
        description: `${collection} description`,
        pubDate: new Date(`2026-01-${collectionNames.indexOf(collection) + 1}`),
        link: `${siteUrl}${expectedPathByCollection[collection]}`,
      }))
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    expect(rss).toHaveBeenCalledWith(buildRssFeedOptions(siteConfig, expectedItems));
  });
});
