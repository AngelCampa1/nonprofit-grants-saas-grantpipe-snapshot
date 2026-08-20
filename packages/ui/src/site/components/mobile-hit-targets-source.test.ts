import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared mobile hit target regressions", () => {
  it("keeps the mobile header brand and nav trigger at 48px minimum targets", () => {
    const source = readSource("./site-header.astro");

    expect(source).toContain("min-h-12");
    expect(source).toContain("min-w-12");
    expect(source).toContain("site-header-brand");
  });

  it("keeps footer links large enough for touch interaction", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("min-h-12");
    expect(source).toContain("min-w-12");
    expect(source).toContain("inline-flex");
  });

  it("keeps breadcrumb links at a minimum mobile tap target", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("min-h-12");
    expect(source).toContain("min-w-12");
    expect(source).toContain("inline-flex");
  });

  it("uses the shared site theme/fonts contract on the books page and avoids nested main landmarks", () => {
    const source = readSource("../../../../../apps/site/src/pages/books.astro");

    expect(source).toContain("theme={siteConfig.theme}");
    expect(source).toContain("fonts={siteConfig.theme.fonts}");
    expect(source).not.toContain("<main>");
    expect(source).not.toContain("</main>");
  });
});
