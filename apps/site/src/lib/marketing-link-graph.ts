import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { siteConfig } from "../config/site";
import { grantCategoryPages } from "../config/grant-recipient-seo";
import { marketingContentDirectory } from "./marketing-content-root";
import { topicHubs } from "./topic-hubs";

export interface MarketingLink {
  source: string;
  href: string;
}

export interface MarketingLinkGraph {
  routes: Set<string>;
  links: MarketingLink[];
  inboundCounts: Map<string, number>;
  crawlExcludedRoutes?: Set<string>;
}

const sourceDirectory = fileURLToPath(new URL("../", import.meta.url));
const pagesDirectory = join(sourceDirectory, "pages");
const contentDirectory = marketingContentDirectory;

const staticAssetRoutes = [
  "/AGENTS.md",
  "/compare/alternatives",
  "/compare/pricing",
  "/compare/versus",
  "/free",
  "/llms.txt",
  "/llms-full.txt",
  "/pricing.txt",
  "/resources/best",
  "/resources/guides",
  "/rss.xml",
  "/signup-flow.json",
];

const crawlExcludedRoutes = new Set([
  "/404",
  "/500",
  "/unsubscribe",
  "/llms-full.txt",
  "/llms.txt",
  "/rss.xml",
  "/signup-flow.json",
]);

const filenameSlugCollections: Array<{ dir: string; prefix: string; parent: string }> = [
  { dir: "benchmarks", prefix: "/resources/benchmarks/", parent: "/resources/benchmarks" },
  { dir: "faq-hubs", prefix: "/resources/faq/", parent: "/resources/faq" },
  { dir: "features", prefix: "/features/", parent: "/features" },
  { dir: "glossary", prefix: "/glossary/", parent: "/glossary" },
  { dir: "guides", prefix: "/resources/guides/", parent: "/resources/guides" },
  { dir: "integrations", prefix: "/integrations/", parent: "/integrations" },
  { dir: "lead-magnets", prefix: "/free/", parent: "/free" },
  { dir: "listicles", prefix: "/resources/best/", parent: "/resources/best" },
  { dir: "personas", prefix: "/for/", parent: "/for" },
  { dir: "state-pages", prefix: "/nonprofit-software/", parent: "/nonprofit-software" },
  { dir: "vertical-pages", prefix: "/solutions/", parent: "/solutions" },
  { dir: "workflows", prefix: "/workflows/", parent: "/workflows" },
];

const competitorSlugCollections: Array<{ dir: string; prefix: string; parent: string }> = [
  { dir: "alternatives", prefix: "/compare/alternatives/", parent: "/compare/alternatives" },
  { dir: "pricing-breakdowns", prefix: "/compare/pricing/", parent: "/compare/pricing" },
];

function walk(directory: string, extensions: string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function normalizeRoute(href: string): string {
  const sameDomainUrl = href.match(/^https:\/\/(?:www\.)?grantpipe\.com(\/[^#?]*)/);
  const localHref = sameDomainUrl?.[1] ?? href;
  const withoutHash = localHref.split("#")[0] ?? "";
  const pathname = withoutHash.split("?")[0] ?? "";
  if (pathname === "") return "/";
  return pathname.replace(/\/$/, "") || "/";
}

function pageRouteFromFile(filePath: string): string | null {
  const relativePath = relative(pagesDirectory, filePath).replace(/\\/g, "/");
  if (
    relativePath.includes("[") ||
    relativePath.startsWith("404.") ||
    relativePath.startsWith("500.")
  ) {
    return null;
  }

  const normalized = relativePath.replace(/\.(astro|ts)$/, "");
  const rawSegments = normalized.split("/").filter(Boolean);
  const segments = rawSegments.at(-1) === "index" ? rawSegments.slice(0, -1) : rawSegments;

  return normalizeRoute(`/${segments.join("/")}`);
}

function frontmatter(source: string): string {
  return source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

export function extractNestedSlug(source: string, field: string): string | null {
  const lines = frontmatter(source).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${field}:`);
  if (start === -1) return null;

  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) return null;
    const slugMatch = line.match(/^\s+slug:\s*"?([^"\r\n]+)"?\s*$/);
    if (slugMatch?.[1]) return slugMatch[1].trim();
  }

  return null;
}

export function comparisonPath(source: string): string | null {
  const slugA = extractNestedSlug(source, "competitorA");
  const slugB = extractNestedSlug(source, "competitorB");
  if (!slugA || !slugB) return null;
  const ordered = slugA === "grantpipe" || slugB !== "grantpipe" ? [slugA, slugB] : [slugB, slugA];
  return `/compare/versus/${ordered[0]}-vs-${ordered[1]}`;
}

function collectRoutes(): Set<string> {
  const routes = new Set<string>(staticAssetRoutes.map(normalizeRoute));

  for (const filePath of walk(pagesDirectory, [".astro", ".ts"])) {
    const route = pageRouteFromFile(filePath);
    if (route !== null) routes.add(route);
  }

  for (const { dir, prefix } of filenameSlugCollections) {
    for (const fileName of readdirSync(join(contentDirectory, dir))) {
      if (fileName.endsWith(".md")) {
        routes.add(normalizeRoute(`${prefix}${fileName.replace(/\.md$/, "")}`));
      }
    }
  }

  for (const { dir, prefix } of competitorSlugCollections) {
    for (const fileName of readdirSync(join(contentDirectory, dir))) {
      if (!fileName.endsWith(".md")) continue;
      const source = readFileSync(join(contentDirectory, dir, fileName), "utf8");
      const slug = extractNestedSlug(source, "competitor");
      if (slug !== null) routes.add(normalizeRoute(`${prefix}${slug}`));
    }
  }

  for (const fileName of readdirSync(join(contentDirectory, "comparisons"))) {
    if (!fileName.endsWith(".md")) continue;
    const source = readFileSync(join(contentDirectory, "comparisons", fileName), "utf8");
    const route = comparisonPath(source);
    /* v8 ignore next -- comparison content fixtures are expected to have complete slugs. */
    if (route !== null) routes.add(normalizeRoute(route));
  }

  /* v8 ignore start -- catch path covers missing city-pages dir at content init time. */
  try {
    for (const fileName of readdirSync(join(contentDirectory, "city-pages"))) {
      if (!fileName.endsWith(".md")) continue;
      const source = readFileSync(join(contentDirectory, "city-pages", fileName), "utf8");
      const stateMatch = frontmatter(source).match(/^stateSlug:\s*"?([^"\r\n]+)"?$/m);
      const cityMatch = frontmatter(source).match(/^citySlug:\s*"?([^"\r\n]+)"?$/m);
      if (stateMatch?.[1] && cityMatch?.[1]) {
        routes.add(
          normalizeRoute(`/nonprofit-software/${stateMatch[1].trim()}/${cityMatch[1].trim()}`),
        );
      }
    }
  } catch {
    // city-pages directory may not exist in all environments
  }
  /* v8 ignore stop */

  for (const page of grantCategoryPages) {
    routes.add(normalizeRoute(page.href));
  }

  for (const hub of topicHubs) {
    routes.add(normalizeRoute(`/resources/topics/${hub.slug}`));
  }

  return routes;
}

function isNoindexPageSource(source: string): boolean {
  if (/noindex\s*=\s*{\s*true\s*}/.test(source)) return true;

  const robotsMetaTags = source.match(/<meta\b[^>]*>/gi) ?? [];
  return robotsMetaTags.some((tag) => {
    const hasRobotsName = /\bname\s*=\s*["']robots["']/i.test(tag);
    const noindexContent = /\bcontent\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(tag);
    return hasRobotsName && noindexContent;
  });
}

function collectCrawlExcludedPageRoutes(): Set<string> {
  const routes = new Set<string>(crawlExcludedRoutes);

  for (const filePath of walk(pagesDirectory, [".astro", ".ts"])) {
    const route = pageRouteFromFile(filePath);
    if (route === null) continue;

    const source = readFileSync(filePath, "utf8");
    if (isNoindexPageSource(source)) routes.add(route);
  }

  return routes;
}

export function isLocalSourceFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function collectSourceFiles(): string[] {
  return [
    ...walk(contentDirectory, [".md"]),
    ...walk(pagesDirectory, [".astro", ".ts"]),
    join(sourceDirectory, "config", "site.ts"),
    join(sourceDirectory, "config", "grant-recipient-seo.ts"),
    join(sourceDirectory, "lib", "topic-hubs.ts"),
  ].filter(isLocalSourceFile);
}

export function extractLinks(source: string): string[] {
  const links: string[] = [];
  const markdownLinkPattern = /]\((\/[^)\s]+)\)/g;
  const markdownSameDomainLinkPattern = /]\((https:\/\/(?:www\.)?grantpipe\.com\/[^)\s]+)\)/g;
  const quotedPathPattern = /["'](\/[^"'`\s<>]+)["']/g;
  const quotedSameDomainPathPattern = /["'](https:\/\/(?:www\.)?grantpipe\.com\/[^"'`\s<>]+)["']/g;
  const hrefPattern = /href=\{?["'](\/[^"'}\s]+)["']\}?/g;
  const hrefSameDomainPattern =
    /href=\{?["'](https:\/\/(?:www\.)?grantpipe\.com\/[^"'}\s]+)["']\}?/g;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = markdownSameDomainLinkPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = quotedPathPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = quotedSameDomainPathPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = hrefPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = hrefSameDomainPattern.exec(source)) !== null) {
    if (match[1]) links.push(match[1]);
  }

  return links;
}

function sourceLabel(filePath: string): string {
  return relative(sourceDirectory, filePath).replace(/\\/g, "/");
}

function addNavLinks(links: MarketingLink[]): void {
  /* v8 ignore next -- marketing siteConfig always defines nav items in production. */
  for (const item of siteConfig.nav?.items ?? []) {
    links.push({ source: "siteConfig.nav", href: item.href });
    for (const group of item.groups ?? []) {
      for (const link of group.links) links.push({ source: "siteConfig.nav", href: link.href });
    }
  }

  /* v8 ignore next -- marketing siteConfig always defines footer link groups in production. */
  for (const group of siteConfig.footer?.linkGroups ?? []) {
    for (const link of group.links) links.push({ source: "siteConfig.footer", href: link.href });
  }

  /* v8 ignore next -- marketing siteConfig always defines footer legal links in production. */
  for (const link of siteConfig.footer?.legalLinks ?? []) {
    links.push({ source: "siteConfig.footer", href: link.href });
  }
}

function addImplicitHubLinks(links: MarketingLink[]): void {
  for (const { dir, prefix, parent } of filenameSlugCollections) {
    for (const fileName of readdirSync(join(contentDirectory, dir))) {
      if (fileName.endsWith(".md")) {
        links.push({
          source: parent,
          href: `${prefix}${fileName.replace(/\.md$/, "")}`,
        });
      }
    }
  }

  for (const { dir, prefix, parent } of competitorSlugCollections) {
    for (const fileName of readdirSync(join(contentDirectory, dir))) {
      /* v8 ignore next -- competitor slug content directories intentionally contain markdown only. */
      if (!fileName.endsWith(".md")) continue;
      const source = readFileSync(join(contentDirectory, dir, fileName), "utf8");
      const slug = extractNestedSlug(source, "competitor");
      if (slug !== null) links.push({ source: parent, href: `${prefix}${slug}` });
    }
  }

  for (const fileName of readdirSync(join(contentDirectory, "comparisons"))) {
    /* v8 ignore next -- the comparisons content directory intentionally contains markdown only. */
    if (!fileName.endsWith(".md")) continue;
    const source = readFileSync(join(contentDirectory, "comparisons", fileName), "utf8");
    const route = comparisonPath(source);
    if (route !== null) links.push({ source: "/compare/versus", href: route });
  }

  /* v8 ignore start -- catch path covers missing city-pages dir at content init time. */
  try {
    for (const fileName of readdirSync(join(contentDirectory, "city-pages"))) {
      if (!fileName.endsWith(".md")) continue;
      const source = readFileSync(join(contentDirectory, "city-pages", fileName), "utf8");
      const fm = frontmatter(source);
      const stateMatch = fm.match(/^stateSlug:\s*"?([^"\r\n]+)"?$/m);
      const cityMatch = fm.match(/^citySlug:\s*"?([^"\r\n]+)"?$/m);
      if (stateMatch?.[1] && cityMatch?.[1]) {
        links.push({
          source: "/nonprofit-software",
          href: `/nonprofit-software/${stateMatch[1].trim()}/${cityMatch[1].trim()}`,
        });
      }
    }
  } catch {
    // city-pages directory may not exist in all environments
  }
  /* v8 ignore stop */

  for (const page of grantCategoryPages) {
    links.push({ source: "/resources/topics", href: page.href });
  }

  for (const hub of topicHubs) {
    links.push({ source: "/resources/topics", href: `/resources/topics/${hub.slug}` });
  }
}

export function buildMarketingLinkGraph(): MarketingLinkGraph {
  const routes = collectRoutes();
  const links: MarketingLink[] = [];
  const crawlExcludedPageRoutes = collectCrawlExcludedPageRoutes();

  for (const filePath of collectSourceFiles()) {
    for (const href of extractLinks(readFileSync(filePath, "utf8"))) {
      links.push({ source: sourceLabel(filePath), href });
    }
  }

  addNavLinks(links);
  addImplicitHubLinks(links);

  const inboundCounts = new Map<string, number>();
  for (const route of routes) inboundCounts.set(route, 0);

  for (const link of links) {
    const route = normalizeRoute(link.href);
    if (inboundCounts.has(route)) {
      /* v8 ignore next -- inboundCounts is initialized for every known route before links are counted. */
      inboundCounts.set(route, (inboundCounts.get(route) ?? 0) + 1);
    }
  }

  return { routes, links, inboundCounts, crawlExcludedRoutes: crawlExcludedPageRoutes };
}

export function getBrokenInternalLinks(graph: MarketingLinkGraph): MarketingLink[] {
  return graph.links.filter((link) => {
    const isInternal =
      link.href.startsWith("/") || /^https:\/\/(?:www\.)?grantpipe\.com\//.test(link.href);
    if (!isInternal) return false;
    if (isApprovedNonRoute(link.href)) return false;
    return !graph.routes.has(normalizeRoute(link.href));
  });
}

export function getOrphanedRoutes(graph: MarketingLinkGraph): string[] {
  const excludedRoutes = new Set([...crawlExcludedRoutes, ...(graph.crawlExcludedRoutes ?? [])]);

  return [...graph.routes]
    .filter((route) => route !== "/" && !excludedRoutes.has(route))
    .filter((route) => !route.startsWith("/lp/"))
    .filter((route) => !route.startsWith("/api/"))
    .filter((route) => (graph.inboundCounts.get(route) ?? 0) === 0)
    .sort();
}

function isApprovedNonRoute(href: string): boolean {
  const route = normalizeRoute(href);
  if (route === "/login") return true;
  if (route.startsWith("/api/")) return true;
  if (route.startsWith("/v1/")) return true;
  return /\.(avif|gif|ico|jpg|jpeg|pdf|png|svg|webp)$/i.test(route);
}
