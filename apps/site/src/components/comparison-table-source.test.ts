import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("comparison-table.astro source regressions", () => {
  const source = readSource("./comparison-table.astro");

  it("renders a semantic table with a caption slot and scoped headers", () => {
    expect(source).toMatch(/<table[\s>]/);
    expect(source).toContain('<caption class="sr-only">');
    expect(source).toContain('scope="col"');
    expect(source).toContain('scope="row"');
  });

  it("wraps the table in an overflow-x-auto scroller with a mobile scroll hint", () => {
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("sm:hidden");
  });

  it("labels the GrantPipe column distinctly from the competitor column", () => {
    expect(source).toContain("gp-comparison-table__col--winner");
    expect(source).toContain("{competitorName}");
  });

  it("exposes boolean cells with a screen-reader label instead of only a glyph", () => {
    expect(source).toContain("gp-comparison-cell--yes");
    expect(source).toContain("gp-comparison-cell--no");
    expect(source).toContain('class="sr-only"');
  });

  it("gives hover state via transform/opacity-safe background only (no layout shift)", () => {
    const hoverBlock = source.match(/tbody tr:hover[\s\S]{0,200}?\}/g) ?? [];
    for (const block of hoverBlock) {
      expect(block).not.toMatch(/width|height|margin|padding|top:|left:|right:|bottom:/);
    }
  });
});

describe("compare vs-pages wire the shared comparison table", () => {
  it("grantpipe-vs-bloomerang.astro uses ComparisonTable with real feature rows", () => {
    const page = readSource("../pages/compare/grantpipe-vs-bloomerang.astro");
    expect(page).toContain('import ComparisonTable, { type ComparisonRow } from "@/components/comparison-table.astro"');
    expect(page).toContain("<ComparisonTable");
    expect(page).toContain('competitorName="Bloomerang"');
    expect(page).toContain("scroll-in");
  });

  it("grantpipe-vs-submittable.astro uses ComparisonTable with real feature rows", () => {
    const page = readSource("../pages/compare/grantpipe-vs-submittable.astro");
    expect(page).toContain('import ComparisonTable, { type ComparisonRow } from "@/components/comparison-table.astro"');
    expect(page).toContain("<ComparisonTable");
    expect(page).toContain('competitorName="Submittable"');
    expect(page).toContain("scroll-in");
  });

  it("grantpipe-vs-quickbooks.astro keeps its existing semantic matrix table and adds scroll-in", () => {
    const page = readSource("../pages/compare/grantpipe-vs-quickbooks.astro");
    expect(page).toMatch(/<table[\s>]/);
    expect(page).toContain("scroll-in");
  });
});
