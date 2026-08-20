/**
 * Utilities for building Schema.org @graph structures.
 * A single @graph wrapper lets search engines and AI crawlers understand
 * how multiple entities on a page relate to each other.
 */
import type { SiteAuthor } from "../types";

/**
 * Strips @context from each schema, returns a single @graph wrapper.
 * Does not mutate the input array or any of its items.
 */
export function buildGraph(schemas: Record<string, unknown>[]): Record<string, unknown> {
  if (schemas.length === 0) {
    throw new Error("buildGraph: schemas array must not be empty");
  }
  const graph = schemas.map((schema) => {
    const rest = { ...schema };
    delete rest["@context"];
    return rest;
  });
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/**
 * Returns a new object = spread of schema + "@id" property set.
 * Does NOT mutate the input.
 */
export function withId(schema: Record<string, unknown>, id: string): Record<string, unknown> {
  return { ...schema, "@id": id };
}

/**
 * Returns a minimal @id reference object { "@id": id }.
 * Used to cross-reference entities within a @graph.
 */
export function refId(id: string): { "@id": string } {
  return { "@id": id };
}

export interface SitewideSchemaOpts {
  siteName: string;
  siteUrl: string;
  logoUrl?: string;
  sameAs?: string[];
  founder?: SiteAuthor;
}

/**
 * Builds the two sitewide nodes — Organization and WebSite — as plain objects
 * (no @context) ready to merge into any @graph via buildGraph.
 *
 * Returns [organizationNode, websiteNode]. Both carry @id so they can be
 * cross-referenced by per-page schemas (e.g. Article publisher: { "@id": orgId }).
 */
export function buildSitewideSchemas(opts: SitewideSchemaOpts): Record<string, unknown>[] {
  const { siteName, siteUrl, logoUrl, sameAs, founder } = opts;
  const orgId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;

  const organizationNode: Record<string, unknown> = {
    "@type": "Organization",
    "@id": orgId,
    name: siteName,
    url: siteUrl,
    ...(logoUrl && { logo: { "@type": "ImageObject", url: logoUrl } }),
    ...(sameAs && { sameAs }),
    ...(founder && {
      founder: {
        "@type": "Person",
        name: founder.name,
        ...(founder.url && { url: founder.url }),
        ...(founder.jobTitle && { jobTitle: founder.jobTitle }),
        ...(founder.sameAs && { sameAs: founder.sameAs }),
        ...(founder.credentials && { hasCredential: founder.credentials }),
      },
    }),
  };

  const websiteNode: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": websiteId,
    name: siteName,
    url: siteUrl,
    publisher: { "@id": orgId },
  };

  return [organizationNode, websiteNode];
}
