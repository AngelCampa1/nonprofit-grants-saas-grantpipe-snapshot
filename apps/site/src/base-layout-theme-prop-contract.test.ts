import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guardrail: the shared BaseLayout only injects the gp-* design-token layer
 * (the CSS custom properties --gp-pill, --gp-emerald-*, --gp-rad-*, gp shadows)
 * when it receives a `theme` prop:
 *
 *   const themeCss = theme ? generateThemeCSS(theme) : ""
 *
 * A page that renders <BaseLayout> WITHOUT `theme={...}` ships square, colorless
 * `.gp-mkt-btn` marketing buttons because --gp-pill / --gp-emerald-* resolve to
 * nothing. (`themeColor={...}` is a different prop and does NOT count.)
 *
 * Template-group layouts (article-layout, listicle-layout) and the
 * paid-search-landing-page component forward `theme` for the pages they wrap, so
 * pages that route through them are covered. This test guards the pages that
 * render BaseLayout DIRECTLY.
 */
function collectAstroPages(dir: URL): URL[] {
  const out: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) {
      out.push(...collectAstroPages(child));
    } else if (entry.name.endsWith(".astro")) {
      out.push(child);
    }
  }
  return out;
}

const pagesDir = new URL("./pages/", import.meta.url);
const directBaseLayoutPages = collectAstroPages(pagesDir).filter((url) =>
  readFileSync(url, "utf8").includes("<BaseLayout"),
);

describe("BaseLayout theme prop contract", () => {
  it("finds pages that render BaseLayout directly", () => {
    // Sanity: the scan must actually discover pages, otherwise the per-page
    // assertions below would vacuously pass.
    expect(directBaseLayoutPages.length).toBeGreaterThan(5);
  });

  it.each(directBaseLayoutPages.map((url) => [fileURLToPath(url), url] as const))(
    "%s passes a theme prop to BaseLayout (else gp-* tokens vanish and buttons go square/colorless)",
    (_label, url) => {
      const source = readFileSync(url, "utf8");
      expect(source).toMatch(/theme=\{/);
    },
  );
});
