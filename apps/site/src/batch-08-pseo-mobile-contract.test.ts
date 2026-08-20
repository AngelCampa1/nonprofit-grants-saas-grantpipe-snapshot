/**
 * Batch 08 — pSEO city/state pages mobile-first contract tests.
 *
 * Verifies mobile-first invariants for the three high-volume pSEO templates:
 *   - nonprofit-software/index.astro
 *   - nonprofit-software/[slug].astro
 *   - nonprofit-software/[state]/[city].astro
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
// 1. Sticky CTA allow-list covers /nonprofit-software/* routes
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta covers /nonprofit-software/* routes", () => {
  it("covers /nonprofit-software/ prefix route", () => {
    expect(shouldShowMobileStickyCta("/nonprofit-software/")).toBe(true);
    expect(shouldShowMobileStickyCta("/nonprofit-software")).toBe(true);
  });

  it("covers /nonprofit-software/[state] slug routes", () => {
    expect(shouldShowMobileStickyCta("/nonprofit-software/ca")).toBe(true);
    expect(shouldShowMobileStickyCta("/nonprofit-software/ny")).toBe(true);
    expect(shouldShowMobileStickyCta("/nonprofit-software/texas")).toBe(true);
  });

  it("covers /nonprofit-software/[state]/[city] routes", () => {
    expect(shouldShowMobileStickyCta("/nonprofit-software/ca/los-angeles")).toBe(true);
    expect(shouldShowMobileStickyCta("/nonprofit-software/ny/new-york-city")).toBe(true);
  });

  it("does not incorrectly enable sticky CTA on excluded pages", () => {
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
    expect(shouldShowMobileStickyCta("/unsubscribe")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. nonprofit-software/index.astro — sticky CTA wired to BaseLayout
// ---------------------------------------------------------------------------

describe("nonprofit-software/index.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("nonprofit-software/index.astro");
    expect(src).toContain("BaseLayout");
  });

  it("imports shouldShowMobileStickyCta", () => {
    const src = readPage("nonprofit-software/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("passes showStickyMobileCta to BaseLayout", () => {
    const src = readPage("nonprofit-software/index.astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("directory grid for states has no bare grid-cols-3 without responsive prefix", () => {
    const src = readPage("nonprofit-software/index.astro");
    // Must not have a bare grid-cols-3 class that is not prefixed with sm:/md:/lg:
    const bareGridCols3 = /(?<![a-z]:)grid-cols-3/g;
    expect(bareGridCols3.test(src)).toBe(false);
  });

  it("CTA button flex layout stacks on mobile (flex-col)", () => {
    const src = readPage("nonprofit-software/index.astro");
    expect(src).toContain("flex-col");
  });
});

// ---------------------------------------------------------------------------
// 3. nonprofit-software/[slug].astro — sticky CTA wired to ArticleLayout
// ---------------------------------------------------------------------------

describe("nonprofit-software/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("nonprofit-software/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("imports shouldShowMobileStickyCta", () => {
    const src = readPage("nonprofit-software/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("nonprofit-software/[slug].astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("tables are wrapped in overflow-x-auto containers", () => {
    const src = readPage("nonprofit-software/[slug].astro");
    // Every <table must be preceded by an overflow-x-auto wrapper in the same file
    expect(src).toContain("overflow-x-auto");
    // Confirm the pattern: overflow-x-auto div containing table
    expect(src).toMatch(/overflow-x-auto[\s\S]{0,200}<table/);
  });

  it("table scroll wrapper uses -mx-4 sm:mx-0 for edge-to-edge mobile scroll", () => {
    const src = readPage("nonprofit-software/[slug].astro");
    expect(src).toContain("-mx-4");
    expect(src).toContain("sm:mx-0");
  });
});

// ---------------------------------------------------------------------------
// 4. nonprofit-software/[state]/[city].astro — sticky CTA wired to ArticleLayout
// ---------------------------------------------------------------------------

describe("nonprofit-software/[state]/[city].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("nonprofit-software/[state]/[city].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("imports shouldShowMobileStickyCta", () => {
    const src = readPage("nonprofit-software/[state]/[city].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
  });

  it("passes showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("nonprofit-software/[state]/[city].astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("tables are wrapped in overflow-x-auto containers", () => {
    const src = readPage("nonprofit-software/[state]/[city].astro");
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/overflow-x-auto[\s\S]{0,200}<table/);
  });

  it("table scroll wrapper uses -mx-4 sm:mx-0 for edge-to-edge mobile scroll", () => {
    const src = readPage("nonprofit-software/[state]/[city].astro");
    expect(src).toContain("-mx-4");
    expect(src).toContain("sm:mx-0");
  });
});

// ---------------------------------------------------------------------------
// 5. No raw large typography classes without responsive prefix
// ---------------------------------------------------------------------------

describe("pSEO pages have no bare large text classes without responsive prefix", () => {
  const files = [
    "nonprofit-software/index.astro",
    "nonprofit-software/[slug].astro",
    "nonprofit-software/[state]/[city].astro",
  ];

  // Bare text-5xl/text-6xl/text-7xl: not prefixed with sm:, md:, lg:
  const bareTextLarge = /(?<![a-z]:)text-[5-7]xl/g;

  for (const file of files) {
    it(`${file} has no bare text-5xl/6xl/7xl`, () => {
      const src = readPage(file);
      expect(bareTextLarge.test(src)).toBe(false);
    });
  }
});
