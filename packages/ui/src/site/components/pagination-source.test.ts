import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("pagination source regressions", () => {
  it('wraps controls in <nav aria-label="Pagination">', () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain('aria-label="Pagination"');
    expect(source).toContain("<nav");
  });

  it("uses the pill (rounded-full) radius for every page tile", () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain("rounded-full");
    // The old non-pill rounding should be gone.
    expect(source).not.toContain("rounded-sm");
  });

  it('marks the current page with aria-current="page"', () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain('aria-current="page"');
  });

  it("gives every interactive tile a 44px minimum hit area", () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain("min-h-11");
    expect(source).toContain("min-w-11");
  });

  it("declares a visible focus ring for keyboard users", () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-primary-500");
  });

  it('emits rel="prev" and rel="next" on the prev/next links', () => {
    const source = readSource("./pagination.astro");

    expect(source).toContain('rel="prev"');
    expect(source).toContain('rel="next"');
  });
});
