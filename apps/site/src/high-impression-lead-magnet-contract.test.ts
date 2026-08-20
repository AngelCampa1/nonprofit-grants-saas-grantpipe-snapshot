import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { highImpressionPages } from "./high-impression-pages.fixture";
import { marketingContentDirectory } from "./lib/marketing-content-root";

/**
 * P7 internal-linking guard: each high-impression page must surface a
 * lead magnet (a `/free/…` URL) in its `relatedPages` frontmatter. The
 * site layout converts relatedPages into sidebar/footer links, so this
 * is the cheapest hub→spoke→commercial lift we have until we build
 * explicit sidebar CTAs per page.
 *
 * The list below matches current high-impression commercial and guide
 * pages from GSC Search Analytics so CTR recovery work stays tied to
 * observed search demand.
 */

const CONTENT_ROOT = marketingContentDirectory;

describe("P7: high-impression pages surface a lead magnet", () => {
  test("fixture rows carry GSC source metadata", () => {
    expect(highImpressionPages.length).toBeGreaterThan(0);

    for (const page of highImpressionPages) {
      expect(page.source).toBe("gsc-search-analytics");
      expect(page.date).toBe("2026-05-20");
      expect(page.impressions).toBeGreaterThan(0);
      expect(page.clicks).toBeGreaterThanOrEqual(0);
      expect(page.ctr).toBeGreaterThanOrEqual(0);
      expect(page.position).toBeGreaterThan(0);
    }
  });

  test("locks the current GSC nonprofit CRM pricing CTR opportunity", () => {
    expect(
      highImpressionPages.find(
        (page) => page.collection === "guides" && page.slug === "nonprofit-crm-pricing-guide",
      ),
    ).toMatchObject({
      source: "gsc-search-analytics",
      date: "2026-05-20",
      impressions: 8088,
      clicks: 1,
      ctr: 0.0001,
      position: 9.2,
    });
  });

  for (const { collection, slug } of highImpressionPages) {
    test(`${collection}/${slug} links to a /free/ lead magnet in relatedPages`, () => {
      const path = join(CONTENT_ROOT, collection, `${slug}.md`);
      const source = readFileSync(path, "utf-8");
      const fmMatch = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
      expect(fmMatch, `${slug}: frontmatter not found`).not.toBeNull();
      const fm = fmMatch![1]!;

      const related = fm.match(/^relatedPages:[ \t]*\n((?:[ \t]+-[ \t]*"[^"]*"[ \t]*\n?)+)/m);
      expect(related, `${slug}: relatedPages block not found`).not.toBeNull();

      const freeLinks = (related![1]!.match(/"\/free\/[^"]+"/g) ?? []) as string[];
      expect(
        freeLinks.length,
        `${slug} should link to at least one /free/ lead magnet in relatedPages, ` +
          `found: ${freeLinks.join(", ") || "(none)"}`,
      ).toBeGreaterThanOrEqual(1);
    });
  }
});
