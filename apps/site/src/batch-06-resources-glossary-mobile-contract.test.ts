/**
 * Batch 06 — Resources / Glossary / Books pages mobile-first contract tests.
 *
 * Verifies the specific mobile-first invariants enforced across the 15 pages
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

function readUiHub(path: string): string {
  return readFileSync(`${PACKAGES_UI_DIR}/hubs/${path}`, "utf8");
}

function readUiGlobalsCss(): string {
  return readFileSync(`${PACKAGES_UI_DIR}/styles/globals.css`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Sticky CTA allow-list covers /resources/*, /glossary/*, and /books
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta covers Batch 06 page families", () => {
  it("covers /resources/ prefix routes", () => {
    expect(shouldShowMobileStickyCta("/resources/")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/guides/some-guide")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/glossary/some-term")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/benchmarks/some-benchmark")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/faq/some-faq")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/best/some-roundup")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/topics/grant-compliance")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/reference")).toBe(true);
  });

  it("covers /glossary/ prefix routes", () => {
    expect(shouldShowMobileStickyCta("/glossary/")).toBe(true);
    expect(shouldShowMobileStickyCta("/glossary")).toBe(true);
    expect(shouldShowMobileStickyCta("/glossary/restricted-fund")).toBe(true);
    expect(shouldShowMobileStickyCta("/glossary/grant-compliance")).toBe(true);
  });

  it("covers /books exact page", () => {
    expect(shouldShowMobileStickyCta("/books")).toBe(true);
    expect(shouldShowMobileStickyCta("/books/")).toBe(true);
  });

  it("does not incorrectly enable sticky CTA on excluded pages", () => {
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
    expect(shouldShowMobileStickyCta("/unsubscribe")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. resources/index.astro — wired with sticky CTA
// ---------------------------------------------------------------------------

describe("resources/index.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("resources/index.astro");
    expect(src).toContain("BaseLayout");
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("resources/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 3. resources/reference.astro — CategoryHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/reference.astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("resources/reference.astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("resources/reference.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 4. resources/benchmarks/index.astro — CategoryHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/benchmarks/index.astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("resources/benchmarks/index.astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("resources/benchmarks/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 5. resources/benchmarks/[slug].astro — ArticleLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/benchmarks/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("resources/benchmarks/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("wires showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("resources/benchmarks/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 6. resources/best/[slug].astro — ListicleLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/best/[slug].astro mobile-first patterns", () => {
  it("uses ListicleLayout", () => {
    const src = readPage("resources/best/[slug].astro");
    expect(src).toContain("ListicleLayout");
  });

  it("wires showStickyMobileCta to ListicleLayout", () => {
    const src = readPage("resources/best/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("pros/cons grid is responsive (md: prefix)", () => {
    const src = readPage("resources/best/[slug].astro");
    expect(src).toContain("md:grid-cols-2");
  });
});

// ---------------------------------------------------------------------------
// 7. resources/best/[...page].astro — CategoryHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/best/[...page].astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("resources/best/[...page].astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("resources/best/[...page].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 8. resources/faq/index.astro — CategoryHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/faq/index.astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("resources/faq/index.astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("resources/faq/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 9. resources/faq/[slug].astro — ArticleLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/faq/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("resources/faq/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("wires showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("resources/faq/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 10. resources/guides/[slug].astro — ArticleLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/guides/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("resources/guides/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("wires showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("resources/guides/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 11. resources/guides/[...page].astro — CategoryHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/guides/[...page].astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("resources/guides/[...page].astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("resources/guides/[...page].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 12. resources/topics/index.astro — ContentHub + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/topics/index.astro mobile-first patterns", () => {
  it("uses ContentHub", () => {
    const src = readPage("resources/topics/index.astro");
    expect(src).toContain("ContentHub");
  });

  it("wires showStickyMobileCta to ContentHub", () => {
    const src = readPage("resources/topics/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 13. resources/topics/[slug].astro — BaseLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("resources/topics/[slug].astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("resources/topics/[slug].astro");
    expect(src).toContain("BaseLayout");
  });

  it("wires showStickyMobileCta to BaseLayout", () => {
    const src = readPage("resources/topics/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("card grid is responsive (sm:grid-cols-2 lg:grid-cols-3)", () => {
    const src = readPage("resources/topics/[slug].astro");
    expect(src).toContain("sm:grid-cols-2");
    expect(src).toContain("lg:grid-cols-3");
  });
});

// ---------------------------------------------------------------------------
// 14. glossary/index.astro — CategoryHub + A-Z strip + sticky CTA
// ---------------------------------------------------------------------------

describe("glossary/index.astro mobile-first patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("glossary/index.astro");
    expect(src).toContain("CategoryHub");
  });

  it("wires showStickyMobileCta to CategoryHub", () => {
    const src = readPage("glossary/index.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("renders an A-Z jumplink strip (data-glossary-az-strip)", () => {
    const src = readPage("glossary/index.astro");
    expect(src).toContain("data-glossary-az-strip");
  });
});

// ---------------------------------------------------------------------------
// 15. glossary/[slug].astro — ArticleLayout + sticky CTA
// ---------------------------------------------------------------------------

describe("glossary/[slug].astro mobile-first patterns", () => {
  it("uses ArticleLayout", () => {
    const src = readPage("glossary/[slug].astro");
    expect(src).toContain("ArticleLayout");
  });

  it("wires showStickyMobileCta to ArticleLayout", () => {
    const src = readPage("glossary/[slug].astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });
});

// ---------------------------------------------------------------------------
// 16. books.astro — BaseLayout + sticky CTA + table scroll wrapper
// ---------------------------------------------------------------------------

describe("books.astro mobile-first patterns", () => {
  it("uses BaseLayout", () => {
    const src = readPage("books.astro");
    expect(src).toContain("BaseLayout");
  });

  it("wires shouldShowMobileStickyCta to BaseLayout", () => {
    const src = readPage("books.astro");
    expect(src).toContain("shouldShowMobileStickyCta");
    expect(src).toContain("showStickyMobileCta");
  });

  it("COA table has overflow-x-auto wrapper", () => {
    const src = readPage("books.astro");
    expect(src).toContain("overflow-x");
  });
});

// ---------------------------------------------------------------------------
// 17. Shared layouts — ListicleLayout and ContentHub expose showStickyMobileCta
// ---------------------------------------------------------------------------

describe("listicle-layout.astro exposes showStickyMobileCta", () => {
  it("declares showStickyMobileCta prop", () => {
    const src = readUiLayout("listicle-layout.astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("passes showStickyMobileCta to BaseLayout", () => {
    const src = readUiLayout("listicle-layout.astro");
    expect(src).toMatch(/showStickyMobileCta=\{showStickyMobileCta\}/);
  });
});

describe("content-hub.astro exposes showStickyMobileCta", () => {
  it("declares showStickyMobileCta prop", () => {
    const src = readUiHub("content-hub.astro");
    expect(src).toContain("showStickyMobileCta");
  });

  it("passes showStickyMobileCta to BaseLayout", () => {
    const src = readUiHub("content-hub.astro");
    expect(src).toMatch(/showStickyMobileCta=\{showStickyMobileCta\}/);
  });
});

// ---------------------------------------------------------------------------
// 18. CSS — mobile-first grid patterns for resource page grids
// ---------------------------------------------------------------------------

describe("globals.css resource grid mobile-first patterns", () => {
  it("gp-resource-grid defaults to single column (no bare repeat(3,...) outside @media)", () => {
    const css = readUiGlobalsCss();
    const outsideMedia = css.split("@media").at(0) ?? "";
    expect(outsideMedia).not.toMatch(/\.gp-resource-grid[\s\S]{0,60}repeat\(3/);
  });

  it("gp-templates-strip defaults to single column (no bare repeat(4,...) outside @media)", () => {
    const css = readUiGlobalsCss();
    const outsideMedia = css.split("@media").at(0) ?? "";
    expect(outsideMedia).not.toMatch(/\.gp-templates-strip[\s\S]{0,60}repeat\(4/);
  });

  it("gp-glossary-az-strip is defined with overflow-x: auto", () => {
    const css = readUiGlobalsCss();
    expect(css).toContain("gp-glossary-az-strip");
    expect(css).toContain("overflow-x: auto");
  });

  it("gp-glossary-az-strip is sticky on mobile", () => {
    const css = readUiGlobalsCss();
    expect(css).toMatch(/gp-glossary-az-strip[\s\S]{0,200}position:\s*sticky/);
  });

  it("gp-glossary-az-link has min-height 3rem for 48px tap target", () => {
    const css = readUiGlobalsCss();
    expect(css).toMatch(/gp-glossary-az-link[\s\S]{0,400}min-height:\s*3rem/);
  });

  it("article-prose has 1.125rem font-size for mobile readability", () => {
    const css = readUiGlobalsCss();
    expect(css).toMatch(/\.article-prose[\s\S]{0,60}font-size:\s*1\.125rem/);
  });

  it("article-prose table has overflow-x: auto for mobile scroll", () => {
    const css = readUiGlobalsCss();
    expect(css).toMatch(/\.article-prose\s+table[\s\S]{0,80}overflow-x:\s*auto/);
  });
});

// ---------------------------------------------------------------------------
// 19. site.ts — /books in MOBILE_STICKY_CTA_EXACT_PAGES
// ---------------------------------------------------------------------------

describe("site config MOBILE_STICKY_CTA_EXACT_PAGES includes /books", () => {
  it("returns true for /books path", () => {
    expect(shouldShowMobileStickyCta("/books")).toBe(true);
  });

  it("returns true for /books/ (trailing slash)", () => {
    expect(shouldShowMobileStickyCta("/books/")).toBe(true);
  });
});
