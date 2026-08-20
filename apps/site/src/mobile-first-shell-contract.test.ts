/**
 * Contract: every marketing page must use BaseLayout (or a component that
 * wraps it transitively). This guarantees the shared mobile-first primitives —
 * viewport-fit=cover meta, safe-area CSS vars, StickyMobileCta — are present
 * on every page.
 *
 * Batch 02 completed: all MarketingShell pages have been migrated to BaseLayout.
 * KNOWN_VIOLATIONS is intentionally empty.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = resolve(import.meta.dirname, "pages");

/**
 * No remaining violations — all pages use BaseLayout or a known wrapper.
 * This set is kept as the extension point for future batches that add new
 * pages before they are fully migrated.
 */
const KNOWN_VIOLATIONS: Set<string> = new Set([]);

/** Files excluded from the shell check (non-page Astro files, sitemap, feeds, etc.). */
const EXCLUDED_FILES = new Set(["404.astro", "500.astro"]);

/**
 * Component names / import path fragments that directly wrap or are
 * BaseLayout. If a page imports any of these, it passes the shell contract.
 * Add new known wrappers here as they are created.
 */
const BASE_LAYOUT_WRAPPERS = [
  "BaseLayout",
  "base-layout",
  "PaidSearchLandingPage",
  "paid-search-landing-page",
  // layouts in packages/ui that wrap BaseLayout
  "ArticleLayout",
  "article-layout",
  "ComparisonLayout",
  "comparison-layout",
  "ContentLayout",
  "content-layout",
  "LandingLayout",
  "landing-layout",
  "ListicleLayout",
  "listicle-layout",
  // hubs in packages/ui that wrap BaseLayout
  "CategoryHub",
  "category-hub",
  "ContentHub",
  "content-hub",
  // site components that wrap BaseLayout
  "GrantRecipientCategoryPage",
  "grant-recipient-category-page",
  "LeadMagnetPage",
  "lead-magnet-page",
  // pricing breakdown layout
  "PricingBreakdownLayout",
  "pricing-breakdown-layout",
];

/**
 * Pages that are pure server-side redirects — they render a thin HTML
 * redirect stub rather than actual marketing content. Not subject to the
 * BaseLayout shell contract.
 */
const REDIRECT_ONLY_PAGES = new Set([
  "signup.astro",
  "grant/compliance.astro",
  "grant/management.astro",
  "grant/reporting.astro",
  "grant/solo.astro",
  "grant/pipeline.astro",
  "granthub/migration.astro",
  "restricted/funds.astro",
  "donor/unified.astro",
  "donor/retention.astro",
  "donor/crm-grants.astro",
  "board/report.astro",
  "ed/board-questions.astro",
  "ed/no-consultant.astro",
  "ed/key-person.astro",
  "ed/alternative.astro",
  "ed/one-system.astro",
  "funds/affordable.astro",
  "funds/audit.astro",
  "funds/drawdown.astro",
  "funds/payroll.astro",
]);

/** File extensions or name patterns that are not Astro page components. */
function isExcludedByPattern(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, "/");
  if (rel.startsWith("lp/")) return true;
  const filename = rel.split("/").pop() ?? "";
  if (EXCLUDED_FILES.has(filename)) return true;
  // API endpoint files (*.json.ts, *.txt.ts, *.xml.ts)
  if (/\.(json|txt|xml)\.ts$/.test(filename)) return true;
  // Pure redirect stubs — no user-facing content
  if (REDIRECT_ONLY_PAGES.has(rel)) return true;
  return false;
}

function collectAstroPages(dir: string, base = ""): string[] {
  const entries = readdirSync(dir);
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = base ? `${base}/${entry}` : entry;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...collectAstroPages(fullPath, relativePath));
    } else if (entry.endsWith(".astro")) {
      result.push(relativePath);
    }
  }
  return result;
}

function pageUsesBaseLayout(source: string): boolean {
  return BASE_LAYOUT_WRAPPERS.some((wrapper) => source.includes(wrapper));
}

describe("mobile-first shell contract", () => {
  const allPages = collectAstroPages(PAGES_DIR).filter((p) => !isExcludedByPattern(p));

  it("all pages must use BaseLayout (or a known wrapper) — violations tracked in KNOWN_VIOLATIONS", () => {
    const actualViolations: string[] = [];

    for (const page of allPages) {
      const source = readFileSync(join(PAGES_DIR, page), "utf8");
      const pageKey = page.replace(/\\/g, "/");

      if (!pageUsesBaseLayout(source) && !KNOWN_VIOLATIONS.has(pageKey)) {
        actualViolations.push(page);
      }
    }

    expect(
      actualViolations,
      `Pages not using BaseLayout or a known wrapper and not in KNOWN_VIOLATIONS:\n${actualViolations.join("\n")}`,
    ).toHaveLength(0);
  });

  it("KNOWN_VIOLATIONS set only contains pages that exist", () => {
    const allPageSet = new Set(allPages.map((p) => p.replace(/\\/g, "/")));
    for (const violation of KNOWN_VIOLATIONS) {
      expect(
        allPageSet.has(violation),
        `KNOWN_VIOLATIONS contains '${violation}' but no such page exists in the scoped set. Remove it.`,
      ).toBe(true);
    }
  });

  it("no page in the scanned set uses MarketingShell (Batch 02 complete)", () => {
    const violations: string[] = [];
    for (const page of allPages) {
      const source = readFileSync(join(PAGES_DIR, page), "utf8");
      if (source.includes("MarketingShell")) {
        violations.push(page.replace(/\\/g, "/"));
      }
    }
    expect(
      violations,
      `Pages still importing or using MarketingShell (should be zero after Batch 02):\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
