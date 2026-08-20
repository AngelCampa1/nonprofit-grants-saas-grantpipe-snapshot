/**
 * Batch 05 — Compare + Integrations pages mobile-first contract tests.
 *
 * Verifies the specific mobile-first invariants enforced across the 12 pages
 * in scope for this batch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldShowMobileStickyCta } from "./config/site";

const ROOT = resolve(import.meta.dirname);
const PAGES_DIR = `${ROOT}/pages`;
const PACKAGES_UI_DIR = resolve(ROOT, "../../../packages/ui/src/site");

function readPage(path: string): string {
  return readFileSync(`${PAGES_DIR}/${path}`, "utf8");
}

function readUiLayout(path: string): string {
  return readFileSync(`${PACKAGES_UI_DIR}/layouts/${path}`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Sticky CTA allow-list covers /compare/* and /integrations/* prefixes
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta covers Batch 05 page families", () => {
  it("covers /compare/ prefix routes", () => {
    expect(shouldShowMobileStickyCta("/compare/")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/grantpipe-vs-bloomerang")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/grantpipe-vs-quickbooks")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/grantpipe-vs-submittable")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/alternatives/bloomerang")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/pricing/bloomerang")).toBe(true);
    expect(shouldShowMobileStickyCta("/compare/versus/grantpipe-vs-salesforce")).toBe(true);
  });

  it("covers /integrations/ prefix routes", () => {
    expect(shouldShowMobileStickyCta("/integrations/")).toBe(true);
    expect(shouldShowMobileStickyCta("/integrations")).toBe(true);
    expect(shouldShowMobileStickyCta("/integrations/quickbooks")).toBe(true);
    expect(shouldShowMobileStickyCta("/integrations/zapier")).toBe(true);
  });

  it("does not incorrectly enable sticky CTA on excluded pages", () => {
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. compare/index.astro — matrix scroll wrapper + sticky CTA wired
// ---------------------------------------------------------------------------

describe("compare/index.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("compare/index.astro");
    expect(src).toContain("BaseLayout");
  });

  it("comparison matrix has overflow-x-auto wrapper", () => {
    const src = readPage("compare/index.astro");
    // The path-matrix-scroll class must contain overflow-x-auto
    expect(src).toContain("overflow-x-auto");
  });

  it("comparison matrix has sticky first column class", () => {
    const src = readPage("compare/index.astro");
    // First column must have sticky left-0 or position: sticky; left: 0
    expect(src).toMatch(/sticky.*left-0|position:\s*sticky[\s\S]{0,60}left:\s*0/);
  });

  it("matrix scroll hint shown on mobile only", () => {
    const src = readPage("compare/index.astro");
    // There must be a scroll hint element visible only on mobile (sm:hidden or display: none at sm+)
    expect(src).toMatch(/sm:hidden|scroll-hint/);
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("compare/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 3. grantpipe-vs-bloomerang.astro — comparison matrix mobile patterns
// ---------------------------------------------------------------------------

describe("compare/grantpipe-vs-bloomerang.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("compare/grantpipe-vs-bloomerang.astro");
    expect(src).toContain("BaseLayout");
  });

  it("comparison matrix wrapper has overflow-x-auto", () => {
    const src = readPage("compare/grantpipe-vs-bloomerang.astro");
    expect(src).toContain("overflow-x-auto");
  });

  it("first column cell has sticky positioning", () => {
    const src = readPage("compare/grantpipe-vs-bloomerang.astro");
    expect(src).toMatch(/sticky.*left-0|position:\s*sticky[\s\S]{0,60}left:\s*0/);
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("compare/grantpipe-vs-bloomerang.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 4. grantpipe-vs-submittable.astro — comparison matrix mobile patterns
// ---------------------------------------------------------------------------

describe("compare/grantpipe-vs-submittable.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("compare/grantpipe-vs-submittable.astro");
    expect(src).toContain("BaseLayout");
  });

  it("comparison matrix wrapper has overflow-x-auto", () => {
    const src = readPage("compare/grantpipe-vs-submittable.astro");
    expect(src).toContain("overflow-x-auto");
  });

  it("first column cell has sticky positioning", () => {
    const src = readPage("compare/grantpipe-vs-submittable.astro");
    expect(src).toMatch(/sticky.*left-0|position:\s*sticky[\s\S]{0,60}left:\s*0/);
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("compare/grantpipe-vs-submittable.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 5. grantpipe-vs-quickbooks.astro — qb-matrix-scroll uses overflow-x-auto
// ---------------------------------------------------------------------------

describe("compare/grantpipe-vs-quickbooks.astro mobile-first patterns", () => {
  it("qb-matrix-scroll uses overflow-x-auto", () => {
    const src = readPage("compare/grantpipe-vs-quickbooks.astro");
    // The scroll container must have overflow-x-auto on mobile (not just hidden at md+)
    expect(src).toContain("overflow-x-auto");
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("compare/grantpipe-vs-quickbooks.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 6. Hub index pages (compare/alternatives, compare/pricing, compare/versus)
//    pass showStickyMobileCta to CategoryHub
// ---------------------------------------------------------------------------

describe("compare hub [...page].astro pages wire showStickyMobileCta", () => {
  it("compare/alternatives/[...page].astro passes showStickyMobileCta", () => {
    const src = readPage("compare/alternatives/[...page].astro");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("compare/pricing/[...page].astro passes showStickyMobileCta", () => {
    const src = readPage("compare/pricing/[...page].astro");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("compare/versus/[...page].astro passes showStickyMobileCta", () => {
    const src = readPage("compare/versus/[...page].astro");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });
});

// ---------------------------------------------------------------------------
// 7. Slug pages (alternatives/[slug], pricing/[slug], versus/[slugA]-vs-[slugB])
//    pass showStickyMobileCta to ComparisonLayout or PricingBreakdownLayout
// ---------------------------------------------------------------------------

describe("compare slug pages wire showStickyMobileCta", () => {
  it("compare/alternatives/[slug].astro passes showStickyMobileCta to ComparisonLayout", () => {
    const src = readPage("compare/alternatives/[slug].astro");
    expect(src).toContain("ComparisonLayout");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("compare/pricing/[slug].astro passes showStickyMobileCta to PricingBreakdownLayout", () => {
    const src = readPage("compare/pricing/[slug].astro");
    expect(src).toContain("PricingBreakdownLayout");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("compare/versus/[slugA]-vs-[slugB].astro passes showStickyMobileCta to ComparisonLayout", () => {
    const src = readPage("compare/versus/[slugA]-vs-[slugB].astro");
    expect(src).toContain("ComparisonLayout");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });
});

// ---------------------------------------------------------------------------
// 8. ComparisonLayout accepts and forwards showStickyMobileCta to BaseLayout
// ---------------------------------------------------------------------------

describe("ComparisonLayout accepts showStickyMobileCta prop", () => {
  it("comparison-layout.astro declares showStickyMobileCta in Props interface", () => {
    const src = readUiLayout("comparison-layout.astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("comparison-layout.astro passes showStickyMobileCta to BaseLayout", () => {
    const src = readUiLayout("comparison-layout.astro");
    // Should pass it forward: showStickyMobileCta={showStickyMobileCta}
    expect(src).toMatch(/showStickyMobileCta=\{showStickyMobileCta\}/);
  });
});

// ---------------------------------------------------------------------------
// 9. PricingBreakdownLayout accepts and forwards showStickyMobileCta
// ---------------------------------------------------------------------------

describe("PricingBreakdownLayout accepts showStickyMobileCta prop", () => {
  it("pricing-breakdown-layout.astro declares showStickyMobileCta in Props interface", () => {
    const src = readUiLayout("pricing-breakdown-layout.astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("pricing-breakdown-layout.astro passes showStickyMobileCta to BaseLayout", () => {
    const src = readUiLayout("pricing-breakdown-layout.astro");
    expect(src).toMatch(/showStickyMobileCta=\{showStickyMobileCta\}/);
  });
});

// ---------------------------------------------------------------------------
// 10. integrations/index.astro — CategoryHub with showStickyMobileCta
// ---------------------------------------------------------------------------

describe("integrations/index.astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("integrations/index.astro");
    expect(src).toContain("CategoryHub");
  });

  it("passes showStickyMobileCta to CategoryHub", () => {
    const src = readPage("integrations/index.astro");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });
});

// ---------------------------------------------------------------------------
// 11. integrations/[slug].astro — ArticleLayout with showStickyMobileCta
// ---------------------------------------------------------------------------

describe("integrations/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("integrations/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("integrations/[slug].astro");
    expect(src).toContain("showStickyMobileCta");
    expect(src).toContain("shouldShowMobileStickyCta");
  });
});

// ---------------------------------------------------------------------------
// 12. comparison-table.astro (shared) already has overflow-x-auto + sticky
// ---------------------------------------------------------------------------

describe("comparison-table.astro mobile patterns (shared component)", () => {
  it("comparison-table.astro wraps table in overflow-x-auto", () => {
    const src = readFileSync(resolve(PACKAGES_UI_DIR, "components/comparison-table.astro"), "utf8");
    expect(src).toContain("overflow-x-auto");
  });

  it("comparison-table.astro uses sticky left-0 on first column", () => {
    const src = readFileSync(resolve(PACKAGES_UI_DIR, "components/comparison-table.astro"), "utf8");
    expect(src).toMatch(/sticky.*left-0/);
  });
});

// ---------------------------------------------------------------------------
// 13. FaqSection uses <details> for viewport-aware accordion behaviour
// ---------------------------------------------------------------------------

describe("faq-section.astro uses <details> for accordion", () => {
  it("faq-section uses <details> elements (viewport-aware behaviour)", () => {
    const src = readFileSync(resolve(PACKAGES_UI_DIR, "components/faq-section.astro"), "utf8");
    expect(src).toContain("<details");
  });

  it("faq-section summary triggers have 48px+ tap target classes", () => {
    const src = readFileSync(resolve(PACKAGES_UI_DIR, "components/faq-section.astro"), "utf8");
    // py-4 = 1rem padding-y = 16px each side on 1.5rem line-height = min ~56px total
    expect(src).toContain("py-4");
  });
});
