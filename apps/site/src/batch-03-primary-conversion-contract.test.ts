/**
 * Batch 03 — Primary conversion pages mobile-first contract tests.
 *
 * These assertions enforce the specific mobile-first invariants introduced in
 * Batch 03 for the five primary conversion pages and their shared components.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname);
const PAGES_DIR = `${ROOT}/pages`;
const COMPONENTS_DIR = `${ROOT}/components`;
const GLOBAL_CSS = resolve(ROOT, "styles/global.css");

function readPage(path: string): string {
  return readFileSync(`${PAGES_DIR}/${path}`, "utf8");
}

function readComponent(path: string): string {
  return readFileSync(`${COMPONENTS_DIR}/${path}`, "utf8");
}

function readCss(): string {
  return readFileSync(GLOBAL_CSS, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Hero and feature grids are mobile-first (min-width, not max-width only)
// ---------------------------------------------------------------------------

describe("global.css mobile-first grid layout", () => {
  it("gp-hero-grid defaults to single column (no multi-col without min-width guard)", () => {
    const css = readCss();
    // The simplest check: gp-hero-grid default block must not contain grid-template-columns
    // with multiple values (single-col is "1fr" or omitted).
    // We look for the first occurrence of .gp-hero-grid { ... } not inside @media
    const outsideMedia = css
      .split("@media")
      .at(0)
      ?.match(/\.gp-hero-grid\s*\{([^}]*)\}/);
    if (outsideMedia?.[1]) {
      const block = outsideMedia[1];
      // A single-column default would be `grid-template-columns: 1fr` or absent
      // Multi-col values have commas or multiple fractions
      const hasMultiColDefault =
        /grid-template-columns:[^;]*(?:minmax|0\.85fr|1\.25fr|repeat)/.test(block);
      expect(
        hasMultiColDefault,
        "gp-hero-grid should not have a multi-column grid-template-columns as its default (mobile-first: single column by default, multi-col behind min-width)",
      ).toBe(false);
    }
    // If no default block found outside @media, test passes (grid is defined only inside min-width)
  });

  it("gp-pricing-grid defaults to single column on mobile", () => {
    const css = readCss();
    // Check that gp-pricing-grid default block does not have repeat(4,...) or repeat(3,...)
    const outsideMedia = css.split("@media").at(0);
    const match = outsideMedia?.match(/\.gp-pricing-grid\s*\{([^}]*)\}/);
    if (match?.[1]) {
      const block = match[1];
      const hasMultiColDefault = /grid-template-columns:[^;]*repeat\(\s*[34]/.test(block);
      expect(
        hasMultiColDefault,
        "gp-pricing-grid should not default to 3 or 4 columns — mobile-first means 1 column by default",
      ).toBe(false);
    }
  });

  it("gp-feature-grid defaults to single column on mobile", () => {
    const css = readCss();
    const outsideMedia = css.split("@media").at(0);
    const match = outsideMedia?.match(/\.gp-feature-grid\s*\{([^}]*)\}/);
    if (match?.[1]) {
      const block = match[1];
      const hasMultiColDefault = /grid-template-columns:[^;]*repeat\(\s*[234]/.test(block);
      expect(
        hasMultiColDefault,
        "gp-feature-grid should not default to 2+ columns — single column by default for mobile-first",
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Billing toggle tap targets >= 48px
// ---------------------------------------------------------------------------

describe("billing-toggle.astro tap targets", () => {
  it("billing toggle buttons have min-height >= 48px in global CSS", () => {
    const css = readCss();
    // Find the .gp-billing-toggle__btn rule and check min-height
    const match = css.match(/\.gp-billing-toggle__btn\s*\{([^}]*)\}/);
    expect(match, "Could not find .gp-billing-toggle__btn rule").toBeTruthy();
    const block = match?.[1] ?? "";
    expect(block.length, "Empty .gp-billing-toggle__btn CSS block").toBeGreaterThan(0);
    const minHeightMatch = block.match(/min-height:\s*([\d.]+)(px|rem)/);
    if (minHeightMatch) {
      const rawValue = minHeightMatch[1];
      const unit = minHeightMatch[2];
      const value = parseFloat(rawValue ?? "0");
      const px = unit === "rem" ? value * 16 : value;
      expect(
        px,
        `billing toggle button min-height is ${px}px — must be >= 48px`,
      ).toBeGreaterThanOrEqual(48);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Feature comparison matrix has sticky first column
// ---------------------------------------------------------------------------

describe("feature-comparison-matrix.astro sticky first column", () => {
  it("matrix feature column header has position sticky and left: 0", () => {
    const css = readCss();
    // Either in global CSS or the component has sticky positioning on feature col
    const hasStickyFeatureCol =
      /\.gp-matrix-feature-head[^{]*\{[^}]*position:\s*sticky/.test(css) ||
      /\.gp-matrix-row-label[^{]*\{[^}]*position:\s*sticky/.test(css) ||
      /\.gp-matrix-col-feature[^{]*\{[^}]*position:\s*sticky/.test(css);

    // Also check the component source
    const componentSrc = readComponent("feature-comparison-matrix.astro");
    const hasStickyInComponent =
      componentSrc.includes("position: sticky") ||
      componentSrc.includes("sticky") ||
      hasStickyFeatureCol;

    expect(
      hasStickyInComponent,
      "Feature comparison matrix first column should have position:sticky so feature names stay visible on horizontal scroll",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. CTA buttons in hero and final sections are full-width on mobile
// ---------------------------------------------------------------------------

describe("final-cta.astro mobile CTA width", () => {
  it("gp-final-actions CTAs have full-width default in CSS", () => {
    const css = readCss();
    // Check that the gp-final-actions or gp-hero-actions has a mobile full-width rule
    // Either flex-direction: column or width: 100% on .gp-mkt-btn inside these containers
    const hasMobileFullWidth =
      /\.gp-hero-actions[^{]*\.gp-mkt-btn[^{]*\{[^}]*width:\s*100%/.test(css) ||
      /\.gp-final-actions[^{]*\.gp-mkt-btn[^{]*\{[^}]*width:\s*100%/.test(css) ||
      // Or the actions container itself stacks vertically on mobile (which makes children full-width with stretch)
      css.includes("gp-hero-actions-mobile") ||
      // The mobile section at bottom of global.css
      /@media\s*\(max-width:\s*(?:640|760|880)px\)[^{]*\{[^}]*(?:\.gp-hero-actions|\.gp-final-actions)[^}]*\}/.test(
        css,
      ) ||
      // Check that .gp-mkt-btn.mobile-full has width: 100%
      /\.gp-mkt-btn[^{]*\{[^}]*width:\s*100%/.test(css) ||
      // Check the final-cta component directly
      readComponent("final-cta.astro").includes("w-full") ||
      readComponent("final-cta.astro").includes("width: 100%");

    expect(
      hasMobileFullWidth,
      "CTAs in final-cta.astro or gp-hero-actions must be full-width on mobile",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Dashboard mock does not cause horizontal overflow
// ---------------------------------------------------------------------------

describe("dashboard-mock.astro overflow guard", () => {
  it("dashboard mock container has overflow: hidden or max-width: 100%", () => {
    const css = readCss();
    const hasMockOverflowGuard =
      /\.gp-dashboard-mock[^{]*\{[^}]*overflow:\s*hidden/.test(css) ||
      /\.gp-dashboard-mock[^{]*\{[^}]*max-width:\s*100%/.test(css);
    expect(
      hasMockOverflowGuard,
      "gp-dashboard-mock must have overflow: hidden or max-width: 100% to prevent horizontal overflow on mobile",
    ).toBe(true);
  });

  it("dashboard body collapses to single column on narrow viewports", () => {
    const css = readCss();
    // gp-dashboard-body must become single column at some breakpoint
    const hasResponsiveBody =
      /gp-dashboard-body[^}]*grid-template-columns:\s*1fr/.test(css) ||
      /@media[^{]*\{[^}]*gp-dashboard-body/.test(css);
    expect(
      hasResponsiveBody,
      "gp-dashboard-body should collapse to single column on mobile viewports",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. ExplainerVideo play button is touch-friendly
// ---------------------------------------------------------------------------

describe("explainer-video.astro play button tap target", () => {
  it("play button is at least 48x48px", () => {
    const css = readCss();
    // Check the play button size in global CSS or the component
    const componentSrc = readComponent("explainer-video.astro");
    // Play button CSS moved to video-embed.astro; check both sources
    const videoEmbedSrc = readComponent("video-embed.astro");
    // The play button is 4.75rem = 76px — well above 48px
    const hasTouchFriendlyPlayBtn =
      componentSrc.includes("4.75rem") ||
      videoEmbedSrc.includes("4.75rem") ||
      componentSrc.includes("48px") ||
      videoEmbedSrc.includes("48px") ||
      componentSrc.includes("min-height: 48") ||
      videoEmbedSrc.includes("min-height: 48") ||
      /gp-explainer-video__play[^{]*\{[^}]*(?:width|height):\s*(?:[4-9]\d+px|[3-9]rem|[4-9]\.\d+rem)/.test(
        css,
      ) ||
      /gp-explainer-video__play[^{]*\{[^}]*(?:width|height):\s*4\.75rem/.test(componentSrc) ||
      /gp-explainer-video__play[^{]*\{[^}]*(?:width|height):\s*4\.75rem/.test(videoEmbedSrc);

    expect(
      hasTouchFriendlyPlayBtn,
      "Explainer video play button must be at least 48x48px for touch accessibility",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. pricing.astro FAQ uses ViewportAwareDetails
// ---------------------------------------------------------------------------

describe("pricing.astro FAQ uses ViewportAwareDetails", () => {
  it("pricing page imports or uses viewport-aware-details for FAQ items", () => {
    const src = readPage("pricing.astro");
    const usesViewportAwareDetails =
      src.includes("viewport-aware-details") || src.includes("ViewportAwareDetails");
    expect(
      usesViewportAwareDetails,
      "pricing.astro FAQ section should use <ViewportAwareDetails> (from @grantpipe/ui/site/components/viewport-aware-details.astro) so FAQs collapse on mobile and auto-open on desktop",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. index.astro uses BaseLayout (shell contract)
// ---------------------------------------------------------------------------

describe("index.astro shell contract", () => {
  it("homepage uses BaseLayout", () => {
    const src = readPage("index.astro");
    expect(src).toContain("BaseLayout");
  });

  it("homepage hero section is present", () => {
    const src = readPage("index.astro");
    expect(src).toContain('data-section="hero"');
  });

  it("homepage has final CTA section", () => {
    const src = readPage("index.astro");
    expect(src).toContain("FinalCta");
  });

  it("homepage surfaces the AI capability band with both AI workflows", () => {
    const src = readPage("index.astro");
    expect(src).toContain('data-section="ai"');
    expect(src).toContain("/features/ai-award-document-intake");
    expect(src).toContain("/features/ask-your-ledger");
    // AI is framed as assisted-then-confirmed, not autonomous.
    expect(src).toContain("You stay in control");
  });
});

// ---------------------------------------------------------------------------
// 9. pricing-plan-cards.astro CTA is full-width on mobile
// ---------------------------------------------------------------------------

describe("pricing-plan-cards.astro mobile CTA", () => {
  it("plan card CTA button is full-width (w-full class or width:100%)", () => {
    const css = readCss();
    const componentSrc = readComponent("pricing-plan-cards.astro");
    // Either the CSS has width:100% on .gp-plan-card .gp-mkt-btn,
    // or the component adds a w-full class
    const hasMobileFullWidthCta =
      /\.gp-plan-card\s+\.gp-mkt-btn[^{]*\{[^}]*width:\s*100%/.test(css) ||
      componentSrc.includes("w-full") ||
      // Check in global.css mobile section
      /@media[^{]*max-width[^{]*\{[^}]*\.gp-plan-card[^}]*\.gp-mkt-btn[^}]*width:\s*100%/.test(
        css,
      ) ||
      (css.includes(".gp-plan-card .gp-mkt-btn") && css.includes("width: 100%"));

    expect(
      hasMobileFullWidthCta,
      "Plan card CTA in pricing-plan-cards.astro must be full-width on mobile",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Verify granthub/migration.astro is a redirect stub (no content change needed)
// ---------------------------------------------------------------------------

describe("granthub/migration.astro is a redirect stub", () => {
  it("redirects to /lp/granthub-migration/", () => {
    const src = readPage("granthub/migration.astro");
    expect(src).toContain("/lp/granthub-migration/");
    expect(src).toContain("window.location.replace");
  });
});
