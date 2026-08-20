import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

/**
 * P3b freshness guard: every indexed content entry must carry a
 * `lastReviewedAt` within the last 180 days. This forces a quarterly
 * refresh cadence so article:modified_time never stalls next to
 * article:published_time (a negative freshness signal to Google).
 */

const COLLECTIONS = [
  "guides",
  "alternatives",
  "comparisons",
  "listicles",
  "state-pages",
  "vertical-pages",
  "pricing-breakdowns",
  "lead-magnets",
  "city-pages",
  "personas",
  "workflows",
  "glossary",
  "features",
  "integrations",
  "faq-hubs",
  "benchmarks",
] as const;

const MAX_AGE_DAYS = 180;
const CORPUS_SCAN_TIMEOUT_MS = 60_000;
function getTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function readFrontmatter(source: string): string | null {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1]! : null;
}

function getField(frontmatter: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"([^"]+)"`, "m");
  const m = frontmatter.match(re);
  return m ? m[1]! : null;
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

describe("content freshness guard", () => {
  for (const collection of COLLECTIONS) {
    const dir = join(marketingContentDirectory, collection);
    const files = listMarkdown(dir);

    if (files.length === 0) continue;

    test(
      `${collection}: every entry has a lastReviewedAt within ${MAX_AGE_DAYS} days`,
      () => {
        const stale: string[] = [];
        const missing: string[] = [];

        for (const file of files) {
          const source = readFileSync(file, "utf-8");
          const fm = readFrontmatter(source);
          if (!fm) continue;

          const raw = getField(fm, "lastReviewedAt");
          if (!raw) {
            missing.push(file);
            continue;
          }

          const date = new Date(`${raw}T00:00:00Z`);
          if (Number.isNaN(date.getTime())) {
            missing.push(`${file} (invalid date: ${raw})`);
            continue;
          }

          const age = daysBetween(getTodayUtc(), date);
          if (age > MAX_AGE_DAYS) {
            stale.push(`${file} (${age}d)`);
          }
        }

        expect(missing, `Missing lastReviewedAt in:\n${missing.join("\n")}`).toHaveLength(0);
        expect(stale, `Stale (>180d) lastReviewedAt in:\n${stale.join("\n")}`).toHaveLength(0);
      },
      CORPUS_SCAN_TIMEOUT_MS,
    );
  }
});
