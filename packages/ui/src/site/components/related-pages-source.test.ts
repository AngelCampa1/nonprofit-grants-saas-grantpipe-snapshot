import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("related pages source regressions", () => {
  it("uses the gp-card-base interactive variant for default/editorial cards", () => {
    const source = readSource("./related-pages.astro");

    expect(source).toContain("gp-card-base interactive");
  });

  it("renders list items as a semantic <ul>/<li> instead of bare anchors", () => {
    const source = readSource("./related-pages.astro");

    expect(source).toContain("<ul");
    expect(source).toContain("<li");
  });

  it("labels the section by the rendered heading", () => {
    const source = readSource("./related-pages.astro");

    expect(source).toContain('aria-labelledby="related-pages-heading"');
    expect(source).toContain('id="related-pages-heading"');
  });

  it("drops the ad-hoc color-mix borders in favor of token-based borders", () => {
    const source = readSource("./related-pages.astro");

    expect(source).not.toContain("color-mix(in_srgb,var(--color-neutral-300)_60%,transparent)");
    expect(source).not.toContain("color-mix(in_srgb,var(--color-neutral-300)_82%,transparent)");
  });

  it("gives compact-variant links a visible focus state", () => {
    const source = readSource("./related-pages.astro");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-primary-500");
  });
});
