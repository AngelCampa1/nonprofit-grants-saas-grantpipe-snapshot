import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

/**
 * P2 cannibalization guard: prevent two entries from targeting the
 * same primary keyword across alternatives/, comparisons/, and guides/.
 *
 * When the same head term lives at multiple URLs, Google splits authority
 * across them and none ranks. This test asserts that every entry's
 * normalized primary-keyword signature is unique across the three
 * commercial-intent collections.
 *
 * The conflict allowlists distinguish true redirects from intentional
 * niche/persona variants. New content that would introduce a new clash
 * fails the build.
 */

const COLLECTIONS = ["alternatives", "comparisons", "guides"] as const;

// Normalized keyword pairs that intentionally serve distinct niche/persona
// or comparison intents. Format: sorted token set joined with "|" so
// order-independent.
const INTENTIONAL_NICHE_CONFLICTS = new Set<string>([
  // bloomerang-alternative.md vs bloomerang-alternative-executive-directors.md
  "alternative|bloomerang",
  // blackbaud-alternative.md vs blackbaud-alternative-mid-size-nonprofits.md
  "alternative|blackbaud",
  // salesforce-nonprofit-alternative.md vs salesforce-nonprofit-alternative-no-consultants.md
  "alternative|salesforce",
  // keela-alternative.md vs keela-alternative-grant-compliance.md
  "alternative|keela",
  // instrumentl-alternative.md vs instrumentl-alternative-grant-compliance.md (compliance niche)
  "alternative|instrumentl",
  // neon-crm-alternative.md vs neon-crm-alternative-grant-compliance.md (compliance niche)
  "alternative|crm|neon",
  // virtuous-alternative.md vs virtuous-alternative-grant-compliance-needs.md (compliance niche)
  "alternative|virtuous",
  // grantpipe-vs-donorperfect.md vs grantpipe-vs-donorperfect-executive-directors.md (persona niche)
  "donorperfect|grantpipe",
  // grantpipe-vs-salesforce-nonprofit.md vs grantpipe-vs-salesforce-nonprofit-grant-funded-teams.md
  "grantpipe|salesforce",
  // grant-accounting-software-guide.md vs nonprofit-accounting-software-guide.md (different intent)
  "accounting|guide|software",
  // bloomerang-vs-keela-grant-reliant.md vs keela-vs-bloomerang.md (same product pair, different frames)
  "bloomerang|keela",
  // instrumentl-vs-foundant-mid-market.md vs instrumentl-vs-foundant.md (mid-market niche variant)
  "foundant|instrumentl",
]);

// Normalized keyword pairs we already shipped and are resolving via 301.
const REDIRECT_PENDING_CONFLICTS = new Set<string>([
  // grant-management-software-for-nonprofits.md vs grant-compliance-vs-grant-management-software.md
  // vs grant-management-software-vs-grant-compliance-software.md
  "management|software",
  // restricted-fund-tracking.md vs restricted-fund-tracking-for-nonprofits.md
  // vs nonprofit-restricted-fund-tracking-guide.md
  "fund|restricted|tracking",
]);

const KNOWN_CONFLICTS = new Set<string>([
  ...INTENTIONAL_NICHE_CONFLICTS,
  ...REDIRECT_PENDING_CONFLICTS,
]);

const REQUIRED_REDIRECT_CONFLICTS: Record<string, string[]> = {
  "management|software": [
    "/resources/guides/grant-compliance-vs-grant-management-software",
    "/resources/guides/grant-management-software-vs-grant-compliance-software",
  ],
  "fund|restricted|tracking": [
    "/resources/guides/restricted-fund-tracking",
    "/resources/guides/nonprofit-restricted-fund-tracking-guide",
  ],
};

// Stopwords stripped before comparing keyword sets.
const STOPWORDS = new Set<string>([
  "a",
  "an",
  "and",
  "for",
  "from",
  "how",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
  "your",
  "nonprofits",
  "nonprofit",
]);

// Suffix tokens that indicate a persona-/niche-scoped variant. If the
// remaining signature after removing these matches another entry's full
// signature, that is a cannibalization clash and should be allowlisted
// explicitly (via KNOWN_CONFLICTS) until the 301 redirect ships.
const NICHE_SUFFIX_TOKENS = new Set<string>([
  "compliance",
  "consultants",
  "directors",
  "executive",
  "grant",
  "mid",
  "size",
  "no",
]);

function readFrontmatter(source: string): string | null {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1]! : null;
}

function getField(frontmatter: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"([^"]+)"`, "m");
  const m = frontmatter.match(re);
  return m ? m[1]! : null;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function signature(slug: string): string {
  const tokens = tokenize(slug).filter((t) => !NICHE_SUFFIX_TOKENS.has(t));
  return [...new Set(tokens)].sort().join("|");
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

function readRedirectRules(): Set<string> {
  const redirects = readFileSync(join(process.cwd(), "public", "_redirects"), "utf-8");
  return new Set(
    redirects
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/\s+/)[0]!)
      .map((path) => path.replace(/\/$/, "")),
  );
}

describe("cannibalization guard", () => {
  test("no two entries across alternatives/comparisons/guides share a primary keyword signature", () => {
    const seen = new Map<string, string[]>();

    for (const collection of COLLECTIONS) {
      const dir = join(marketingContentDirectory, collection);
      for (const file of listMarkdown(dir)) {
        const source = readFileSync(file, "utf-8");
        const fm = readFrontmatter(source);
        if (!fm) continue;

        // Prefer explicit targetKeyword when present; otherwise derive
        // the signature from the file slug (the canonical URL segment).
        const targetKeyword = getField(fm, "targetKeyword");
        const slug = file.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/, "");
        const sig = signature(targetKeyword ?? slug);
        if (!sig) continue;

        const bucket = seen.get(sig) ?? [];
        bucket.push(`${collection}/${slug}`);
        seen.set(sig, bucket);
      }
    }

    const clashes: string[] = [];
    for (const [sig, entries] of seen) {
      if (entries.length > 1 && !KNOWN_CONFLICTS.has(sig)) {
        clashes.push(`${sig} -> ${entries.join(", ")}`);
      }
    }

    expect(
      clashes,
      `Cannibalization: multiple entries share the same primary keyword.\n` +
        `Resolve by picking one canonical page and 301-redirecting the other(s).\n` +
        `If intentional (e.g. comparison vs. alternative intent), add the ` +
        `signature to KNOWN_CONFLICTS with a comment.\n\n${clashes.join("\n")}`,
    ).toHaveLength(0);
  });

  test("redirect-pending cannibalization allowlists have real redirect coverage", () => {
    const redirectedSources = readRedirectRules();
    const missingRedirects = Object.entries(REQUIRED_REDIRECT_CONFLICTS).flatMap(
      ([signature, paths]) =>
        paths
          .filter((path) => !redirectedSources.has(path))
          .map((path) => `${signature}: missing 301 source ${path}`),
    );

    expect(
      missingRedirects,
      `Redirect-pending cannibalization entries must point at real _redirects rules.\n${missingRedirects.join("\n")}`,
    ).toEqual([]);
  });
});
