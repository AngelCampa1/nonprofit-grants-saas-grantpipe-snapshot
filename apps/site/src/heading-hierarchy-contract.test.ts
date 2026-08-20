/**
 * Contract: page-level H1 headings must always render strictly larger than
 * the section H2 headings that appear on the same page, at every viewport
 * width the responsive clamp() ranges cover.
 *
 * Background: a live-build critique found /product/ (and other pages using
 * `.gp-page-title` for the H1 alongside `.gp-section-title` for H2s) had an
 * inverted hierarchy — the H1 resolved smaller than the page's own H2s at
 * common viewport widths. This test parses the clamp() definitions straight
 * out of the source CSS and asserts the H1 floor/ceiling both exceed the
 * paired H2 floor/ceiling, so nobody can silently reintroduce the inversion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

/** Extracts the raw `clamp(min, preferred, max)` string for a custom-property declaration, e.g. `--text-heading: clamp(...)`. */
function extractCustomPropertyClamp(css: string, declarationPrefix: string): string {
  const declIndex = css.indexOf(declarationPrefix);
  if (declIndex === -1) {
    throw new Error(`Custom property declaration not found: ${declarationPrefix}`);
  }
  const lineEnd = css.indexOf(";", declIndex);
  const line = css.slice(declIndex, lineEnd);
  const match = line.match(/clamp\(([^)]+)\)/);
  if (!match || match[1] === undefined) {
    throw new Error(`No clamp() value found for declaration: ${declarationPrefix}`);
  }
  return match[1];
}

/**
 * Extracts the raw `clamp(min, preferred, max)` string for a given selector's
 * font-size. The declaration may be a literal `clamp(...)` or a
 * `var(--token-name)` reference into the shared design-token sheet — in the
 * latter case this resolves the token's own clamp() from `tokenCss`.
 */
function extractClamp(css: string, selector: string, tokenCss: string): string {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex === -1) {
    throw new Error(`Selector not found: ${selector}`);
  }
  const blockEnd = css.indexOf("}", selectorIndex);
  const block = css.slice(selectorIndex, blockEnd);
  const literalMatch = block.match(/font-size:\s*clamp\(([^)]+)\)/);
  if (literalMatch && literalMatch[1] !== undefined) {
    return literalMatch[1];
  }
  const tokenMatch = block.match(/font-size:\s*var\((--[\w-]+)\)/);
  if (tokenMatch && tokenMatch[1] !== undefined) {
    return extractCustomPropertyClamp(tokenCss, `${tokenMatch[1]}:`);
  }
  throw new Error(
    `No clamp() font-size (literal or token-resolved) found for selector: ${selector}`,
  );
}

/** Converts a CSS length (rem or px) to px, assuming the repo's fixed 16px root. */
function toPx(length: string): number {
  const trimmed = length.trim();
  if (trimmed.endsWith("rem")) {
    return parseFloat(trimmed) * 16;
  }
  if (trimmed.endsWith("px")) {
    return parseFloat(trimmed);
  }
  throw new Error(`Unsupported unit in length: ${trimmed}`);
}

/** Parses `clamp(min, preferred, max)` into { min, max } in px (ignores the vw-based preferred term). */
function parseClampMinMax(clamp: string): { min: number; max: number } {
  const parts = clamp.split(",").map((p) => p.trim());
  if (parts.length !== 3) {
    throw new Error(`Expected exactly 3 clamp() arguments, got: ${clamp}`);
  }
  const [min, , max] = parts;
  if (min === undefined || max === undefined) {
    throw new Error(`Expected exactly 3 clamp() arguments, got: ${clamp}`);
  }
  return { min: toPx(min), max: toPx(max) };
}

describe("heading hierarchy contract (H1 must exceed page section H2 at every viewport)", () => {
  const siteCss = readFile("./styles/global.css");
  const uiCss = readFile("../../../packages/ui/src/site/styles/globals.css");

  it("`.gp-page-title` (H1) floor and ceiling both exceed `.gp-section-title` (H2)", () => {
    const pageTitle = parseClampMinMax(extractClamp(siteCss, ".gp-page-title {", uiCss));
    const sectionTitle = parseClampMinMax(extractClamp(siteCss, ".gp-section-title {", uiCss));

    expect(
      pageTitle.min,
      `gp-page-title min (${pageTitle.min}px) must exceed gp-section-title min (${sectionTitle.min}px)`,
    ).toBeGreaterThan(sectionTitle.min);
    expect(
      pageTitle.max,
      `gp-page-title max (${pageTitle.max}px) must exceed gp-section-title max (${sectionTitle.max}px)`,
    ).toBeGreaterThan(sectionTitle.max);
  });

  it("`.gp-page-title` (H1) floor and ceiling both exceed `.gp-section-heading` (H2)", () => {
    const pageTitle = parseClampMinMax(extractClamp(siteCss, ".gp-page-title {", uiCss));
    const sectionHeading = parseClampMinMax(extractClamp(siteCss, ".gp-section-heading {", uiCss));

    expect(pageTitle.min).toBeGreaterThan(sectionHeading.min);
    expect(pageTitle.max).toBeGreaterThan(sectionHeading.max);
  });

  it("shared `--text-heading` token (section H2 scale) stays below `.gp-page-title` (H1) at every bound", () => {
    const pageTitle = parseClampMinMax(extractClamp(siteCss, ".gp-page-title {", uiCss));
    const textHeadingClamp = extractCustomPropertyClamp(uiCss, "--text-heading:");
    const textHeading = parseClampMinMax(textHeadingClamp);

    expect(pageTitle.min).toBeGreaterThan(textHeading.min);
    expect(pageTitle.max).toBeGreaterThan(textHeading.max);
  });

  it("`.gp-page-title` stays responsive (uses clamp(), directly or via a shared design token)", () => {
    const block = siteCss.slice(
      siteCss.indexOf(".gp-page-title {"),
      siteCss.indexOf("}", siteCss.indexOf(".gp-page-title {")),
    );
    expect(block).toMatch(/font-size:\s*(clamp\(|var\(--[\w-]+\))/);
  });

  it("`.gp-section-head h1` (hero) floor and ceiling both exceed `.gp-section-head h2` (section)", () => {
    // .gp-section-head is reused as both a page hero (h1) and a mid-page
    // section lead-in (h2) across resources/index.astro, resources/videos.astro,
    // and pricing.astro. Both selectors previously shared one flat font-size,
    // so the hero H1 rendered the same size as its own section H2s. The H1
    // now resolves against --text-hero and the H2 against --text-editorial-title.
    const h1Clamp = extractCustomPropertyClamp(uiCss, "--text-hero:");
    const h2Clamp = extractCustomPropertyClamp(uiCss, "--text-editorial-title:");
    const h1 = parseClampMinMax(h1Clamp);
    const h2 = parseClampMinMax(h2Clamp);

    expect(siteCss).toContain(".gp-section-head h1 {");
    expect(siteCss).toContain(".gp-section-head h2 {");
    expect(
      h1.min,
      `.gp-section-head h1 min (${h1.min}px, via --text-hero) must exceed .gp-section-head h2 min (${h2.min}px, via --text-editorial-title)`,
    ).toBeGreaterThan(h2.min);
    expect(
      h1.max,
      `.gp-section-head h1 max (${h1.max}px, via --text-hero) must exceed .gp-section-head h2 max (${h2.max}px, via --text-editorial-title)`,
    ).toBeGreaterThan(h2.max);
  });
});
