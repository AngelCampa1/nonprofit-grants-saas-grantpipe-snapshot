import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("breadcrumb nav source regressions", () => {
  it("keeps mobile horizontal scrolling available while hiding the visual scrollbar", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("[scrollbar-width:none]");
    expect(source).toContain("[&::-webkit-scrollbar]:hidden");
    expect(source).not.toContain("overflow-hidden sm:overflow-x-auto");
  });

  it("lets the current breadcrumb wrap on mobile instead of truncating it", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("max-sm:w-full");
    expect(source).toContain("max-sm:whitespace-normal");
    expect(source).toContain("break-words");
    expect(source).not.toContain("max-w-[220px] truncate");
  });

  it("gives breadcrumb links a mobile-safe minimum hit area", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("inline-flex min-h-12 min-w-12");
    expect(source).toContain("items-center");
  });

  it('wraps the trail in <nav aria-label="Breadcrumb"> with an ordered list', () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain('<nav aria-label="Breadcrumb"');
    expect(source).toContain("<ol");
    expect(source).toContain("<li");
  });

  it('marks the current crumb with aria-current="page"', () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain('aria-current="page"');
  });

  it("uses an SVG chevron separator instead of a literal '>' character", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("ChevronRightIcon");
    expect(source).toContain('aria-hidden="true"');
    // No bare ">" rendered as separator text content.
    expect(source).not.toMatch(/>\s*&gt;\s*</);
  });

  it("gives breadcrumb links a visible focus state", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-primary-500");
  });
});
