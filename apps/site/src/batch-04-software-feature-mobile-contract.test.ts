/**
 * Batch 04 — Software / feature / for / solutions pages mobile-first contract.
 *
 * Verifies the specific mobile-first invariants enforced across the 18 pages
 * in scope for this batch, plus the shared components they rely on.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { grantCategoryPages } from "./config/grant-recipient-seo";
import { shouldShowMobileStickyCta, MOBILE_STICKY_CTA_EXACT_PAGES } from "./config/site";

const ROOT = resolve(import.meta.dirname);
const PAGES_DIR = `${ROOT}/pages`;
const COMPONENTS_DIR = `${ROOT}/components`;

function readPage(path: string): string {
  return readFileSync(`${PAGES_DIR}/${path}`, "utf8");
}

function readComponent(path: string): string {
  return readFileSync(`${COMPONENTS_DIR}/${path}`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Sticky CTA allow-list covers all Batch 04 page families
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta covers Batch 04 page families", () => {
  it("covers /features/* prefix", () => {
    expect(shouldShowMobileStickyCta("/features/grant-deadline-tracking")).toBe(true);
    expect(shouldShowMobileStickyCta("/features/")).toBe(true);
    expect(shouldShowMobileStickyCta("/features")).toBe(true);
  });

  it("covers /for/* prefix", () => {
    expect(shouldShowMobileStickyCta("/for/development-director")).toBe(true);
    expect(shouldShowMobileStickyCta("/for/")).toBe(true);
    expect(shouldShowMobileStickyCta("/for")).toBe(true);
  });

  it("covers /solutions/* prefix", () => {
    expect(shouldShowMobileStickyCta("/solutions/food-banks")).toBe(true);
    expect(shouldShowMobileStickyCta("/solutions/")).toBe(true);
    expect(shouldShowMobileStickyCta("/solutions")).toBe(true);
  });

  it("covers /workflows/* prefix", () => {
    expect(shouldShowMobileStickyCta("/workflows/grant-report-checklist")).toBe(true);
    expect(shouldShowMobileStickyCta("/workflows/")).toBe(true);
    expect(shouldShowMobileStickyCta("/workflows")).toBe(true);
  });

  it("covers all grant category software pages in the exact allow-list", () => {
    for (const page of grantCategoryPages.map((page) => page.href)) {
      expect(shouldShowMobileStickyCta(page), `Expected sticky CTA for ${page}`).toBe(true);
    }
  });

  it("all grant category software pages are present in MOBILE_STICKY_CTA_EXACT_PAGES", () => {
    for (const page of grantCategoryPages.map((page) => page.href)) {
      expect(
        MOBILE_STICKY_CTA_EXACT_PAGES.has(page),
        `Expected ${page} in MOBILE_STICKY_CTA_EXACT_PAGES`,
      ).toBe(true);
    }
  });

  it("does not enable sticky CTA on redirect stub pages", () => {
    // These are server-side redirects with no content — sticky CTA not needed.
    // They don't appear in any prefix group, so the default returns false.
    // This test ensures a hypothetical future change doesn't accidentally enable it.
    expect(shouldShowMobileStickyCta("/grant/compliance")).toBe(false);
    expect(shouldShowMobileStickyCta("/grant/management")).toBe(false);
    expect(shouldShowMobileStickyCta("/grant/reporting")).toBe(false);
    expect(shouldShowMobileStickyCta("/restricted/funds")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Software pages delegate to GrantRecipientCategoryPage
// ---------------------------------------------------------------------------

describe("software pages delegate to GrantRecipientCategoryPage", () => {
  const softwarePageFiles = grantCategoryPages.map((page) => `${page.slug}.astro`);

  it("every grant category registry entry has a page file", () => {
    for (const file of softwarePageFiles) {
      expect(existsSync(`${PAGES_DIR}/${file}`), `${file} should exist`).toBe(true);
    }
  });

  it("all software pages use GrantRecipientCategoryPage component", () => {
    for (const file of softwarePageFiles) {
      const src = readPage(file);
      expect(src, `${file} should use GrantRecipientCategoryPage`).toContain(
        "GrantRecipientCategoryPage",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. grant-recipient-category-page uses mobile-first grid
// ---------------------------------------------------------------------------

describe("grant-recipient-category-page.astro mobile-first grid", () => {
  it("three-panel section uses md: or sm: prefix on grid-cols (not bare grid-cols-3)", () => {
    const src = readComponent("grant-recipient-category-page.astro");
    // The three-panel section must NOT have a bare grid-cols-3 without a responsive prefix.
    // A bare grid-cols-3 would look like: class="grid gap-5 grid-cols-3"
    // The acceptable form is: class="grid gap-5 md:grid-cols-3" (or sm:grid-cols-3 etc.)
    const hasBareGridCols3 = /(?<![a-z]:)grid-cols-3/.test(src);
    expect(
      hasBareGridCols3,
      "grant-recipient-category-page.astro must not have bare grid-cols-3 — use md:grid-cols-3 or sm:grid-cols-2 md:grid-cols-3",
    ).toBe(false);
  });

  it("section heading typography does not use bare text-5xl or larger", () => {
    const src = readComponent("grant-recipient-category-page.astro");
    const hasBareXL = /(?<![a-z]:)text-(?:5xl|6xl|7xl)/.test(src);
    const hasPrefixedXL = /(?:sm|md|lg):text-(?:5xl|6xl|7xl)/.test(src);
    // If there are bare large text classes, there must also be prefixed companions
    if (hasBareXL) {
      expect(
        hasPrefixedXL,
        "bare text-5xl/6xl/7xl in grant-recipient-category-page.astro must be paired with sm:/md: prefixed companion",
      ).toBe(true);
    }
  });

  it("CTA buttons are wrapped in gp-shared-cta-actions for mobile stacking", () => {
    const src = readComponent("grant-recipient-category-page.astro");
    expect(
      src,
      "grant-recipient-category-page must use .gp-shared-cta-actions to stack CTAs on mobile",
    ).toContain("gp-shared-cta-actions");
  });
});

// ---------------------------------------------------------------------------
// 4. offer-stack uses responsive layout
// ---------------------------------------------------------------------------

describe("offer-stack.astro responsive layout", () => {
  it("uses grid with auto-fit or explicit responsive columns (not bare fixed-column grid)", () => {
    const src = readComponent("offer-stack.astro");
    // Must use auto-fit or a responsive approach — not a fixed multi-col grid
    const hasAutoFit = src.includes("auto-fit");
    const hasBareGridCols = /(?<![a-z]:)grid-cols-[2-6]/.test(src);
    // Either uses auto-fit (CSS) or uses responsive Tailwind prefixes — both pass
    // Bare grid-cols-2+ without either is a violation
    if (hasBareGridCols) {
      const hasPrefixedGridCols = /(?:sm|md|lg):grid-cols-\d/.test(src);
      expect(
        hasPrefixedGridCols || hasAutoFit,
        "offer-stack.astro bare grid-cols-2+ must have responsive prefix or use auto-fit",
      ).toBe(true);
    }
  });

  it("offer card tap targets are comfortable (padding at least 1rem)", () => {
    const src = readComponent("offer-stack.astro");
    // The gp-offer-card uses 1.25rem/1.5rem padding — verify the class or style exists
    const hasCardPadding =
      src.includes("gp-offer-card") &&
      (src.includes("padding: 1.25rem") ||
        src.includes("padding: 1rem") ||
        src.includes("p-5") ||
        src.includes("p-4"));
    expect(
      hasCardPadding,
      "offer-stack cards must have comfortable padding for touch interaction",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. tier-availability-badge does not cause horizontal overflow
// ---------------------------------------------------------------------------

describe("tier-availability-badge.astro overflow safety", () => {
  it("chip list uses flex-wrap to prevent overflow on narrow viewports", () => {
    const src = readComponent("tier-availability-badge.astro");
    expect(
      src,
      "tier badge chip list must use flex-wrap to prevent overflow on narrow screens",
    ).toContain("flex-wrap");
  });
});

// ---------------------------------------------------------------------------
// 6. Category hub index pages delegate to CategoryHub (which wraps BaseLayout)
// ---------------------------------------------------------------------------

describe("category hub index pages use CategoryHub", () => {
  const hubIndexPages = [
    { file: "features/index.astro", hub: "CategoryHub" },
    { file: "for/index.astro", hub: "CategoryHub" },
    { file: "workflows/index.astro", hub: "CategoryHub" },
  ];

  for (const { file, hub } of hubIndexPages) {
    it(`${file} uses ${hub}`, () => {
      const src = readPage(file);
      expect(src).toContain(hub);
    });
  }

  it("solutions/index.astro uses BaseLayout directly (custom layout page)", () => {
    const src = readPage("solutions/index.astro");
    expect(src).toContain("BaseLayout");
  });
});

// ---------------------------------------------------------------------------
// 7. Slug pages use ArticleLayout (which wraps BaseLayout)
// ---------------------------------------------------------------------------

describe("slug pages use ArticleLayout", () => {
  const slugPages = [
    "features/[slug].astro",
    "for/[slug].astro",
    "solutions/[slug].astro",
    "workflows/[slug].astro",
  ];

  for (const file of slugPages) {
    it(`${file} uses ArticleLayout`, () => {
      const src = readPage(file);
      expect(src).toContain("ArticleLayout");
    });
  }
});

// ---------------------------------------------------------------------------
// 8. Sticky CTA is wired in the layout-consumer pages
// ---------------------------------------------------------------------------

describe("sticky CTA prop wired in Batch 04 pages", () => {
  it("features/index.astro passes showStickyMobileCta to CategoryHub", () => {
    const src = readPage("features/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("for/index.astro passes showStickyMobileCta to CategoryHub", () => {
    const src = readPage("for/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("workflows/index.astro passes showStickyMobileCta to CategoryHub", () => {
    const src = readPage("workflows/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("solutions/index.astro passes showStickyMobileCta to BaseLayout", () => {
    const src = readPage("solutions/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("features/[slug].astro passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("features/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("for/[slug].astro passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("for/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("solutions/[slug].astro passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("solutions/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("workflows/[slug].astro passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("workflows/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("grant-recipient-category-page wires showStickyMobileCta to ArticleLayout", () => {
    const src = readComponent("grant-recipient-category-page.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 10. solutions/index.astro mobile-first CTA actions
// ---------------------------------------------------------------------------

describe("solutions/index.astro mobile-first layout", () => {
  it("CTA actions container stacks vertically on mobile by default", () => {
    const src = readPage("solutions/index.astro");
    // solutions-cta-actions must have flex-direction: column as default
    // and row at min-width 640px
    const hasColumnDefault = src.includes("flex-direction: column") || src.includes("flex-col");
    const hasRowAtSm =
      src.includes("min-width: 640px") ||
      src.includes("sm:flex-row") ||
      // The component may use sm: breakpoint in a different way
      (src.includes("640px") && src.includes("flex-direction: row"));
    expect(
      hasColumnDefault,
      "solutions/index.astro CTA actions must default to flex-direction: column for mobile stacking",
    ).toBe(true);
    expect(
      hasRowAtSm,
      "solutions/index.astro CTA actions must switch to row layout at 640px+",
    ).toBe(true);
  });

  it("hero grid defaults to single column on mobile", () => {
    const src = readPage("solutions/index.astro");
    // The solutions-hero-grid must be single column by default, two column at 1024px
    // Check that no multi-column layout appears outside a media query in the CSS
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    // Outside @media, solutions-hero-grid must not have grid-template-columns with multiple values
    const outsideMedia = styleBlock.split("@media")[0] ?? "";
    const heroGridDefault = outsideMedia.match(/\.solutions-hero-grid\s*\{([^}]*)\}/);
    if (heroGridDefault?.[1]) {
      const block = heroGridDefault[1];
      const hasMultiColDefault =
        /grid-template-columns:[^;]*(?:minmax|0\.8fr|1\.2fr|repeat\s*\(\s*[2-9])/.test(block);
      expect(
        hasMultiColDefault,
        "solutions-hero-grid must not have multi-column grid-template-columns as default (mobile-first: single column outside @media)",
      ).toBe(false);
    }
  });

  it("no bare grid-cols-3 or grid-cols-2 Tailwind class without responsive prefix", () => {
    const src = readPage("solutions/index.astro");
    // The gp-directory-grid uses data-attribute based CSS for responsiveness,
    // not bare Tailwind grid-cols classes. Verify no bare grid-cols-N Tailwind.
    const hasBareGridCols = /(?<![a-z]:)grid-cols-[2-6]/.test(src);
    if (hasBareGridCols) {
      const hasPrefixedGridCols = /(?:sm|md|lg|xl):grid-cols-\d/.test(src);
      expect(
        hasPrefixedGridCols,
        "solutions/index.astro bare grid-cols-N must have responsive prefix",
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. generated-product-stage.astro is acknowledged (in table contract KNOWN_VIOLATIONS)
// ---------------------------------------------------------------------------

describe("generated-product-stage.astro overflow protection", () => {
  it("component renders a data-generated-product-stage wrapper", () => {
    const src = readComponent("generated-product-stage.astro");
    expect(src).toContain("data-generated-product-stage");
  });

  it("stage shell has overflow guard in component or global CSS via gp-stage-shell", () => {
    const src = readComponent("generated-product-stage.astro");
    // The stage uses CSS custom class gp-stage-shell which has overflow: hidden
    // defined in global.css — verify the class is referenced in the component
    expect(src).toContain("gp-stage-shell");
  });
});
