import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(new URL("./product-proof-section.astro", import.meta.url), "utf8");
}

describe("product-proof-section source regressions", () => {
  it("stages the record-variant proofColumns grid at sm/lg, not md", () => {
    const source = readSource();

    expect(source).toContain('class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"');
    expect(source).not.toContain('class="grid gap-4 md:grid-cols-3"');
  });

  it("uses the foundation card primitive for proofColumn surfaces with min-w-0 guards", () => {
    const source = readSource();

    // After B4 tokenization the proofColumn surface is wrapped in a dedicated
    // class. The class still carries the min-width guard so grid items do not
    // collapse, just expressed as a shared component class instead of an
    // ad-hoc Tailwind arbitrary value.
    expect(source).toContain('class="gp-proof-column"');
    expect(source).toContain("min-width: 0;");
  });

  it("allows long column items to break mid-word instead of laying out one word per line", () => {
    const source = readSource();

    expect(source).toContain('<li class="break-words">{item}</li>');
  });

  it("routes every surface radius through the canonical 5-value scale", () => {
    const source = readSource();

    // No ad-hoc rem-based radius values should survive B4 — they all map to
    // var(--radius-*) from the foundation scale.
    expect(source).not.toMatch(/rounded-\[[0-9.]+rem\]/);
    expect(source).toContain("var(--radius-md)");
    expect(source).toContain("var(--radius-lg)");
    expect(source).toContain("var(--radius-full)");
  });
});
