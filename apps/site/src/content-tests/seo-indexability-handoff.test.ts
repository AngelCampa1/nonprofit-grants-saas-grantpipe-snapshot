import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { isSitemapPageIncluded } from "../../astro.config.mjs";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const seoSystemPath = join(repoRoot, "docs", "seo", "marketing-funnel-content-system.md");
const prodUrlArtifactPath = join(repoRoot, "docs", "seo", "icp-seo-prod-urls-2026-06-29.txt");

function readRequiredFile(path: string): string {
  expect(existsSync(path), `${path} should exist`).toBe(true);
  return readFileSync(path, "utf8");
}

function productionUrlLines(): string[] {
  const lines = readRequiredFile(prodUrlArtifactPath).split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

describe("SEO indexability and production URL handoff", () => {
  test("documents that route existence is not indexability", () => {
    const doc = readRequiredFile(seoSystemPath);

    for (const requiredPhrase of [
      "Route existence is not indexability",
      "apps/site/astro.config.mjs",
      "noindexPages",
      "paidLandingPagePattern",
      "paginatedHubPattern",
      "apps/site/src/lib/marketing-link-graph.ts",
      "crawlExcludedRoutes",
      "https://grantpipe.com/sitemap-index.xml",
      "https://grantpipe.com/sitemap.xml",
      "curl.exe -I",
    ]) {
      expect(doc).toContain(requiredPhrase);
    }

    expect(doc).toMatch(
      /Do not add paid landing pages, noindex pages, paginated hubs, or redirected\s+legacy URLs/i,
    );
  });

  test("documents the production URL artifact convention for indexer handoff", () => {
    const doc = readRequiredFile(seoSystemPath);

    for (const requiredPhrase of [
      "one production URL per line",
      "production host only",
      "trailing slash normalized",
      "no blank lines",
      "no duplicates",
      "after deploy",
      "after live checks",
      "docs/seo/icp-seo-prod-urls-2026-06-29.txt",
      "apps/site/public/new-pages-2026-04-24.txt",
      "apps/site/public/new-pages-2026-04-25.txt",
      "marketing-indexing-urls.txt",
      "historical inventories",
      "not handoff-ready",
    ]) {
      expect(doc).toContain(requiredPhrase);
    }
  });

  test("keeps the existing ICP production URL handoff indexer-ready", () => {
    const urls = productionUrlLines();

    expect(urls).toHaveLength(200);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toEqual([...urls].sort());

    for (const url of urls) {
      expect(url).toBe(url.trim());
      expect(url).not.toBe("");
      expect(url).toMatch(/^https:\/\/grantpipe\.com\/.+\/$/);
      expect(url).not.toContain("www.");
      expect(url).not.toMatch(/\/(?:lp|signup|404|500)\//);
      expect(url).not.toMatch(
        /\/(?:free|resources\/(?:page|guides|best)|compare\/(?:alternatives|pricing|versus))\/\d+\/$/,
      );
      expect(isSitemapPageIncluded(url), `${url} should be included in sitemap`).toBe(true);
    }
  });
});
