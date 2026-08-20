/**
 * Batch 09 — Utility & legal pages mobile-first contract tests.
 *
 * Verifies mobile-first invariants for the five utility/legal pages:
 * 404.astro, 500.astro, privacy.astro, terms.astro, unsubscribe.astro
 *
 * Also asserts that shouldShowMobileStickyCta correctly returns false for
 * all five paths (they are in MOBILE_STICKY_CTA_EXCLUDED_SEGMENTS).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldShowMobileStickyCta } from "./config/site";

const ROOT = resolve(import.meta.dirname);
const PAGES_DIR = `${ROOT}/pages`;

function readPage(path: string): string {
  return readFileSync(`${PAGES_DIR}/${path}`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. shouldShowMobileStickyCta returns false for all utility/legal paths
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta exclusions — utility & legal pages", () => {
  it("returns false for /404", () => {
    expect(shouldShowMobileStickyCta("/404")).toBe(false);
  });

  it("returns false for /500", () => {
    expect(shouldShowMobileStickyCta("/500")).toBe(false);
  });

  it("returns false for /privacy", () => {
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
  });

  it("returns false for /terms", () => {
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
  });

  it("returns false for /unsubscribe", () => {
    expect(shouldShowMobileStickyCta("/unsubscribe")).toBe(false);
  });

  it("returns false for trailing-slash variants", () => {
    expect(shouldShowMobileStickyCta("/404/")).toBe(false);
    expect(shouldShowMobileStickyCta("/500/")).toBe(false);
    expect(shouldShowMobileStickyCta("/privacy/")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms/")).toBe(false);
    expect(shouldShowMobileStickyCta("/unsubscribe/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. BaseLayout — all five pages use it (no forced showStickyMobileCta={true})
// ---------------------------------------------------------------------------

describe("utility/legal pages — BaseLayout usage and no forced sticky CTA", () => {
  const pages = ["404.astro", "500.astro", "privacy.astro", "terms.astro", "unsubscribe.astro"];

  for (const page of pages) {
    it(`${page} uses BaseLayout`, () => {
      const src = readPage(page);
      expect(src).toContain("BaseLayout");
    });

    it(`${page} does not force showStickyMobileCta={true}`, () => {
      const src = readPage(page);
      expect(src).not.toMatch(/showStickyMobileCta=\{true\}/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. 404 & 500 — single-column mobile-first layout, full-width CTAs on mobile
// ---------------------------------------------------------------------------

describe("404.astro mobile-first layout", () => {
  it("uses single-column flex layout (no grid-cols-2+ without prefix)", () => {
    const src = readPage("404.astro");
    // Must not have bare grid-cols-2 or higher
    expect(src).not.toMatch(/(?<![a-z]:)grid-cols-[2-6]/);
  });

  it("uses BaseLayout and Button component", () => {
    const src = readPage("404.astro");
    expect(src).toContain("BaseLayout");
    expect(src).toContain("Button");
  });

  it("CTA buttons use gp-mkt-btn--mobile-fw (via Button component default mobileFullWidth)", () => {
    const src = readPage("404.astro");
    // Button component with mobileFullWidth default=true produces gp-mkt-btn--mobile-fw.
    // The page must use <Button> (not raw <a> or <button> with no mobile-fw class).
    expect(src).toMatch(/<Button/);
    // Must NOT explicitly opt out of mobile full-width
    expect(src).not.toMatch(/mobileFullWidth=\{false\}/);
  });

  it("does not use raw text-5xl, text-6xl, or text-7xl without smaller-screen prefix", () => {
    const src = readPage("404.astro");
    // These classes are too large without a responsive prefix on mobile
    const bareHugeFontRe = /(?<![a-z]:)text-(?:5|6|7)xl/;
    expect(src).not.toMatch(bareHugeFontRe);
  });

  it("container uses mobile-safe width pattern (min(100% - ...) or equivalent padding)", () => {
    const src = readPage("404.astro");
    // px-4 provides 16px on each side — equivalent mobile-safe padding
    // OR a width: min(100% - 32px, ...) pattern
    const hasMobileSafeContainer =
      src.includes("px-4") ||
      src.includes("px-5") ||
      src.includes("min(100%") ||
      src.includes("safe-container");
    expect(hasMobileSafeContainer).toBe(true);
  });
});

describe("500.astro mobile-first layout", () => {
  it("uses single-column flex layout (no grid-cols-2+ without prefix)", () => {
    const src = readPage("500.astro");
    expect(src).not.toMatch(/(?<![a-z]:)grid-cols-[2-6]/);
  });

  it("uses BaseLayout and Button component", () => {
    const src = readPage("500.astro");
    expect(src).toContain("BaseLayout");
    expect(src).toContain("Button");
  });

  it("CTA buttons use Button component without opting out of mobile-fw", () => {
    const src = readPage("500.astro");
    expect(src).toMatch(/<Button/);
    expect(src).not.toMatch(/mobileFullWidth=\{false\}/);
  });

  it("does not use raw text-5xl, text-6xl, or text-7xl without smaller-screen prefix", () => {
    const src = readPage("500.astro");
    const bareHugeFontRe = /(?<![a-z]:)text-(?:5|6|7)xl/;
    expect(src).not.toMatch(bareHugeFontRe);
  });

  it("container uses mobile-safe padding", () => {
    const src = readPage("500.astro");
    const hasMobileSafeContainer =
      src.includes("px-4") ||
      src.includes("px-5") ||
      src.includes("min(100%") ||
      src.includes("safe-container");
    expect(hasMobileSafeContainer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. unsubscribe.astro — single-column, mobile-safe width
// ---------------------------------------------------------------------------

describe("unsubscribe.astro mobile-first layout", () => {
  it("uses single-column layout (no grid-cols-2+ without prefix)", () => {
    const src = readPage("unsubscribe.astro");
    expect(src).not.toMatch(/(?<![a-z]:)grid-cols-[2-6]/);
  });

  it("uses BaseLayout", () => {
    const src = readPage("unsubscribe.astro");
    expect(src).toContain("BaseLayout");
  });

  it("does not use raw text-5xl, text-6xl, or text-7xl without smaller-screen prefix", () => {
    const src = readPage("unsubscribe.astro");
    const bareHugeFontRe = /(?<![a-z]:)text-(?:5|6|7)xl/;
    expect(src).not.toMatch(bareHugeFontRe);
  });

  it("uses mobile-safe padding (px-4 or equivalent)", () => {
    const src = readPage("unsubscribe.astro");
    const hasMobileSafeContainer =
      src.includes("px-4") ||
      src.includes("px-5") ||
      src.includes("min(100%") ||
      src.includes("safe-container");
    expect(hasMobileSafeContainer).toBe(true);
  });

  it("content is centered and width-constrained for mobile", () => {
    const src = readPage("unsubscribe.astro");
    // Must have a max-width constraint on the content wrapper
    const hasMaxWidth =
      src.includes("max-w-") || src.includes("max-width") || src.includes("w-full");
    expect(hasMaxWidth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Legal pages (privacy, terms) — prose max-width and mobile font-size
// ---------------------------------------------------------------------------

describe("privacy.astro prose layout — mobile-first", () => {
  it("uses an article container with mobile-first max-width", () => {
    const src = readPage("privacy.astro");
    // Must use the gp-legal-prose class (which applies min(100% - 32px, 38rem))
    // OR equivalent inline width constraint
    const hasMobileProseWidth =
      src.includes("gp-legal-prose") ||
      src.includes("min(100%") ||
      src.includes("article-prose") ||
      // Fallback: has a max-w class and px padding for mobile-safe container
      (src.includes("max-w-") && (src.includes("px-4") || src.includes("px-5")));
    expect(hasMobileProseWidth).toBe(true);
  });

  it("scoped CSS sets mobile font-size to 18px (1.125rem) on body text", () => {
    const src = readPage("privacy.astro");
    // legal-page-body p must have font-size: 1.125rem or font-size: 18px for mobile readability
    // OR the gp-legal-prose class handles it in global CSS
    const hasMobileFontSize =
      src.includes("1.125rem") || src.includes("18px") || src.includes("gp-legal-prose");
    expect(hasMobileFontSize).toBe(true);
  });

  it("h1 heading uses clamp() or responsive class (not raw text-5xl+)", () => {
    const src = readPage("privacy.astro");
    const bareHugeFontRe = /(?<![a-z]:)text-(?:5|6|7)xl/;
    expect(src).not.toMatch(bareHugeFontRe);
  });

  it("uses BaseLayout", () => {
    const src = readPage("privacy.astro");
    expect(src).toContain("BaseLayout");
  });
});

describe("terms.astro prose layout — mobile-first", () => {
  it("uses an article container with mobile-first max-width", () => {
    const src = readPage("terms.astro");
    const hasMobileProseWidth =
      src.includes("gp-legal-prose") ||
      src.includes("min(100%") ||
      src.includes("article-prose") ||
      (src.includes("max-w-") && (src.includes("px-4") || src.includes("px-5")));
    expect(hasMobileProseWidth).toBe(true);
  });

  it("scoped CSS sets mobile font-size to 18px (1.125rem) on body text", () => {
    const src = readPage("terms.astro");
    const hasMobileFontSize =
      src.includes("1.125rem") || src.includes("18px") || src.includes("gp-legal-prose");
    expect(hasMobileFontSize).toBe(true);
  });

  it("h1 heading uses clamp() or responsive class (not raw text-5xl+)", () => {
    const src = readPage("terms.astro");
    const bareHugeFontRe = /(?<![a-z]:)text-(?:5|6|7)xl/;
    expect(src).not.toMatch(bareHugeFontRe);
  });

  it("uses BaseLayout", () => {
    const src = readPage("terms.astro");
    expect(src).toContain("BaseLayout");
  });

  it("scoped styles apply consistent prose styling as privacy.astro", () => {
    const termsSrc = readPage("terms.astro");
    const privacySrc = readPage("privacy.astro");
    // Both should reference legal-page-body styling
    const termsHasLegalStyles =
      termsSrc.includes("legal-page-body") || termsSrc.includes("gp-legal-prose");
    const privacyHasLegalStyles =
      privacySrc.includes("legal-page-body") || privacySrc.includes("gp-legal-prose");
    expect(termsHasLegalStyles).toBe(true);
    expect(privacyHasLegalStyles).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. No tables in any of these pages (confirm no overflow-x-auto needed)
//    If a table is ever added, it must have the overflow-x-auto wrapper.
// ---------------------------------------------------------------------------

describe("utility/legal pages — no unwrapped tables", () => {
  const pages = ["404.astro", "500.astro", "privacy.astro", "terms.astro", "unsubscribe.astro"];

  for (const page of pages) {
    it(`${page} has no unwrapped <table> elements`, () => {
      const src = readPage(page);
      const tableCount = (src.match(/<table/g) ?? []).length;
      const wrapperCount = (src.match(/overflow-x-auto/g) ?? []).length;
      if (tableCount > 0) {
        expect(
          wrapperCount,
          `${page} has ${tableCount} <table> element(s) but ${wrapperCount} overflow-x-auto wrapper(s). Every table must be wrapped.`,
        ).toBeGreaterThanOrEqual(tableCount);
      }
      // If no tables, test passes trivially
    });
  }
});
