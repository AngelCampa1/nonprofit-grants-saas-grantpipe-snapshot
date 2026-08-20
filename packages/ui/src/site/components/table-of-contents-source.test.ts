import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("table of contents source regressions", () => {
  it("gives the mobile summary trigger a 48px minimum hit area", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain(
      '<summary class="flex min-h-12 list-none cursor-pointer items-center justify-between gap-3',
    );
  });

  it("uses the canonical Tailwind radius scale instead of arbitrary radii", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain("rounded-lg");
    expect(source).not.toContain("rounded-[1.35rem]");
    expect(source).not.toContain("rounded-[var(--radius-");
  });

  it("uses token-based neutral borders instead of color-mix arbitrary values", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).not.toContain("color-mix(in_srgb,var(--color-neutral-300)_42%,transparent)");
  });

  it("desktop nav is sticky with a top offset and overflow scrolling", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain("sticky top-24");
    expect(source).toContain("overflow-y-auto");
  });

  it('marks the active TOC link with aria-current="true"', () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain("setAttribute('aria-current', 'true')");
    expect(source).toContain("removeAttribute('aria-current')");
  });

  it("gives TOC links a visible focus state", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-primary-500");
  });
});
