import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sectionSource = readFileSync(
  new URL("./components/product-proof-section.astro", import.meta.url),
  "utf8",
);

describe("product proof section contract", () => {
  it("renders accounting output with semantic table markup", () => {
    expect(sectionSource).toContain("<table");
    expect(sectionSource).toContain("<thead>");
    expect(sectionSource).toContain("<tbody>");
    expect(sectionSource).toContain('scope="col"');
    expect(sectionSource).toContain('scope="row"');
  });

  it("renders support copy from shared section fields instead of slug branches", () => {
    expect(sectionSource).toContain("{section.supportingCopy}");
    expect(sectionSource).toContain("{section.supportText}");
    expect(sectionSource).not.toContain("section.slug ===");
  });

  it("renders included-surface collections as accessible chip lists (list semantics, no text wall)", () => {
    // The included-surface capabilities render as a wrapped row of chips, not a
    // vertical wall of plain text lines. We keep real list semantics (<ul>/<li>)
    // for assistive tech while presenting the chips via flex-wrap.
    expect(sectionSource).toContain('<ul class="mt-3 flex list-none flex-wrap gap-2">');
    expect(sectionSource).toContain("{capabilityItems.map((item) => (");
    expect(sectionSource).toContain("<li>");
    expect(sectionSource).toContain('class="gp-proof-chip">');
    // The old stacked-text list treatment must be gone.
    expect(sectionSource).not.toContain(
      '<ul class="mt-3 grid gap-2 text-sm leading-6 text-[color:var(--gp-ink-700)]">',
    );
  });
});
