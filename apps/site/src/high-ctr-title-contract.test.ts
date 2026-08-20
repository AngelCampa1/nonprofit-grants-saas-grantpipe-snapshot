import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { marketingContentDirectory } from "./lib/marketing-content-root";

/**
 * P1 regression guard: ensures the highest-impression pages keep
 * an seoTitle <= 60 chars and an seoDescription 140-160 chars.
 *
 * If any of these slugs drift back toward generic titles/descriptions,
 * this test fails so the CTR recovery work stays in place.
 */

interface Target {
  path: string;
  primaryToken: RegExp;
}

const TARGETS: Target[] = [
  {
    path: "guides/nonprofit-crm-pricing-guide.md",
    primaryToken: /nonprofit crm pricing/i,
  },
  {
    path: "guides/salesforce-nonprofit-cost.md",
    primaryToken: /salesforce nonprofit cost/i,
  },
  {
    path: "comparisons/salesforce-nonprofit-vs-blackbaud.md",
    primaryToken: /salesforce.*blackbaud|blackbaud.*salesforce/i,
  },
  {
    path: "pricing-breakdowns/bloomerang-pricing.md",
    primaryToken: /bloomerang pricing|bloomerang transaction fees/i,
  },
  {
    path: "guides/federal-procurement-thresholds-micro-small-large.md",
    primaryToken: /federal procurement thresholds|micro-purchase threshold/i,
  },
];

function extractField(source: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"([^"]+)"`, "m");
  const m = source.match(re);
  return m ? m[1]! : null;
}

describe("high-ctr title/description contract", () => {
  for (const target of TARGETS) {
    it(`${target.path} meta is tight and on-query`, () => {
      const source = readFileSync(join(marketingContentDirectory, target.path), "utf-8");

      const seoTitle = extractField(source, "seoTitle");
      const seoDescription = extractField(source, "seoDescription");

      expect(seoTitle, `${target.path}: missing seoTitle`).toBeTruthy();
      expect(seoDescription, `${target.path}: missing seoDescription`).toBeTruthy();

      expect(
        seoTitle!.length,
        `${target.path}: seoTitle is ${seoTitle!.length} chars (want <= 60). Got: ${seoTitle}`,
      ).toBeLessThanOrEqual(60);

      expect(
        seoDescription!.length,
        `${target.path}: seoDescription is ${seoDescription!.length} chars (want 140-160). Got: ${seoDescription}`,
      ).toBeGreaterThanOrEqual(140);
      expect(
        seoDescription!.length,
        `${target.path}: seoDescription is ${seoDescription!.length} chars (want 140-160). Got: ${seoDescription}`,
      ).toBeLessThanOrEqual(160);

      expect(
        target.primaryToken.test(seoTitle!) || target.primaryToken.test(seoDescription!),
        `${target.path}: neither seoTitle nor seoDescription contains the primary query token ${target.primaryToken}`,
      ).toBe(true);
    });
  }
});
