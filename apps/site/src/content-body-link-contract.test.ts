import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const pagesDirectory = fileURLToPath(new URL("./pages", import.meta.url));
const contentDirectory = marketingContentDirectory;

const STATIC_ASSET_PATHS = new Set([
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/rss.xml",
  "/pricing.txt",
  "/sitemap-index.xml",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/signup-flow.json",
]);

// Paths generated from non-content-collection sources (topicHubs config, paginated hubs).
// These are valid rendered routes that cannot be auto-discovered by file-scanning alone.
const KNOWN_CONFIG_ROUTE_PATHS = new Set([
  "/resources/topics/grant-compliance",
  "/resources/topics/grant-management",
  "/resources/topics/restricted-fund-accounting",
  "/resources/topics/nonprofit-crm",
  "/compare/alternatives",
]);

const EXTERNAL_DOMAIN_PATHS_TO_CHECK = new Set(["grantpipe.com"]);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walk(directory: string, extensions: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, extensions));
      continue;
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectStaticRoutePatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const file of walk(pagesDirectory, [".astro", ".ts"])) {
    const relativePath = relative(pagesDirectory, file).replace(/\\/g, "/");
    // Skip dynamic routes entirely. Their valid slugs must come from content collections
    // (see dynamicPaths below) â€” otherwise the catch-all `[^/]+` pattern would silently
    // accept broken slugs like `/compare/alternatives/instrumentl-alternative`.
    if (relativePath.includes("[")) continue;
    const normalized = relativePath.replace(/\.(astro|ts)$/, "");
    const rawSegments = normalized.split("/").filter(Boolean);
    const segments = rawSegments.at(-1) === "index" ? rawSegments.slice(0, -1) : rawSegments;

    if (segments.length === 0) {
      patterns.push(/^\/?$/);
      continue;
    }

    let pattern = "^";
    for (const segment of segments) {
      pattern += `/${escapeRegex(segment)}`;
    }
    pattern += "/?$";
    patterns.push(new RegExp(pattern));
  }
  return patterns;
}

// Collections whose route slug comes from the file name (entry.id in Astro). Each
// file produces one path: `${prefix}${filename}`.
const FILENAME_SLUG_COLLECTIONS: Array<{ dir: string; prefix: string }> = [
  { dir: "benchmarks", prefix: "/resources/benchmarks/" },
  { dir: "faq-hubs", prefix: "/resources/faq/" },
  { dir: "listicles", prefix: "/resources/best/" },
  { dir: "guides", prefix: "/resources/guides/" },
  { dir: "state-pages", prefix: "/nonprofit-software/" },
  { dir: "vertical-pages", prefix: "/solutions/" },
  { dir: "lead-magnets", prefix: "/free/" },
  { dir: "personas", prefix: "/for/" },
  { dir: "workflows", prefix: "/workflows/" },
  { dir: "glossary", prefix: "/glossary/" },
  { dir: "features", prefix: "/features/" },
  { dir: "integrations", prefix: "/integrations/" },
];

// Collections whose route slug is pulled from a frontmatter field rather than the
// filename â€” see the corresponding [slug].astro pages in src/pages for the field name.
const COMPETITOR_SLUG_COLLECTIONS: Array<{ dir: string; prefix: string }> = [
  { dir: "alternatives", prefix: "/compare/alternatives/" },
  { dir: "pricing-breakdowns", prefix: "/compare/pricing/" },
];

function extractFrontmatterField(source: string, field: string): string | null {
  const fmMatch = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const pattern = new RegExp(`${field}:[\\s\\S]*?slug:\\s*"([^"]+)"`);
  const frontmatter = fmMatch[1];
  if (!frontmatter) return null;
  const match = frontmatter.match(pattern);
  return match?.[1] ?? null;
}

function extractScalarField(source: string, field: string): string | null {
  const fmMatch = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch?.[1]) return null;
  const pattern = new RegExp(`^${field}:\\s*"?([^"\\r\\n]+)"?$`, "m");
  const match = fmMatch[1].match(pattern);
  return match?.[1]?.trim() ?? null;
}

function collectDynamicRoutePaths(): Set<string> {
  const paths = new Set<string>();

  for (const { dir, prefix } of FILENAME_SLUG_COLLECTIONS) {
    let entries: string[];
    try {
      entries = readdirSync(join(contentDirectory, dir));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      paths.add(`${prefix}${entry.replace(/\.md$/, "")}`);
    }
  }

  for (const { dir, prefix } of COMPETITOR_SLUG_COLLECTIONS) {
    let entries: string[];
    try {
      entries = readdirSync(join(contentDirectory, dir));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const source = readFileSync(join(contentDirectory, dir, entry), "utf8");
      const competitorSlug = extractFrontmatterField(source, "competitor");
      if (!competitorSlug) continue;
      paths.add(`${prefix}${competitorSlug}`);
    }
  }

  try {
    const cityPagesDir = join(contentDirectory, "city-pages");
    for (const entry of readdirSync(cityPagesDir)) {
      if (!entry.endsWith(".md")) continue;
      const source = readFileSync(join(cityPagesDir, entry), "utf8");
      const stateSlug = extractScalarField(source, "stateSlug");
      const citySlug = extractScalarField(source, "citySlug");
      if (!stateSlug || !citySlug) continue;
      paths.add(`/nonprofit-software/${stateSlug}/${citySlug}`);
    }
  } catch {
    // city-pages directory may not exist yet
  }

  try {
    const comparisonsDir = join(contentDirectory, "comparisons");
    for (const entry of readdirSync(comparisonsDir)) {
      if (!entry.endsWith(".md")) continue;
      const source = readFileSync(join(comparisonsDir, entry), "utf8");
      const slugA = extractFrontmatterField(source, "competitorA");
      const slugB = extractFrontmatterField(source, "competitorB");
      if (!slugA || !slugB) continue;
      const [first, second] =
        slugA === "grantpipe" || slugB !== "grantpipe" ? [slugA, slugB] : [slugB, slugA];
      paths.add(`/compare/versus/${first}-vs-${second}`);
      paths.add(`/compare/versus/${entry.replace(/\.md$/, "")}`);
    }
  } catch {
    // comparisons directory missing â€” no paths to add
  }

  return paths;
}

const staticPatterns = collectStaticRoutePatterns();
const dynamicPaths = collectDynamicRoutePaths();

function pathResolves(path: string): boolean {
  const normalized = path.replace(/\/$/, "") || "/";
  if (STATIC_ASSET_PATHS.has(normalized)) return true;
  if (KNOWN_CONFIG_ROUTE_PATHS.has(normalized)) return true;
  if (dynamicPaths.has(normalized)) return true;
  if (staticPatterns.some((pattern) => pattern.test(normalized))) return true;
  return false;
}

function extractInternalLinksFromMarkdown(source: string): string[] {
  const links: string[] = [];
  // markdown body links: [text](/path) or [text](https://grantpipe.com/path)
  const mdLinkRe = /]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRe.exec(source)) !== null) {
    const href = match[1]?.trim();
    if (!href) continue;
    if (href.startsWith("/")) {
      links.push(href);
    } else {
      try {
        const url = new URL(href);
        if (EXTERNAL_DOMAIN_PATHS_TO_CHECK.has(url.hostname)) {
          links.push(url.pathname + url.search + url.hash);
        }
      } catch {
        // Ignore malformed URLs
      }
    }
  }
  // frontmatter-style relatedPages/relatedSlugs YAML list items: - "/path"
  const frontmatterListRe = /^\s*-\s*"(\/[^"]+)"\s*$/gm;
  while ((match = frontmatterListRe.exec(source)) !== null) {
    const href = match[1];
    if (href) links.push(href);
  }
  return links;
}

function stripHashAndQuery(href: string): string {
  return href.split("#")[0]?.split("?")[0] ?? href;
}

describe("content internal link contract", () => {
  const contentFiles = walk(contentDirectory, [".md"]);
  const corpusScanTimeoutMs = 60_000;

  it("discovers content files", () => {
    expect(contentFiles.length).toBeGreaterThan(50);
  });

  it(
    "every internal link in every content markdown file resolves to a real route",
    () => {
      const failures: string[] = [];

      for (const filePath of contentFiles) {
        const source = readFileSync(filePath, "utf8");
        const rawLinks = extractInternalLinksFromMarkdown(source);
        const uniqueLinks = [...new Set(rawLinks)];

        for (const href of uniqueLinks) {
          const pathname = stripHashAndQuery(href);
          if (!pathname.startsWith("/")) continue;
          if (!pathResolves(pathname)) {
            failures.push(`${relative(contentDirectory, filePath)}: ${href}`);
          }
        }
      }

      expect(failures, `Broken internal links:\n${failures.join("\n")}`).toEqual([]);
    },
    corpusScanTimeoutMs,
  );
});
