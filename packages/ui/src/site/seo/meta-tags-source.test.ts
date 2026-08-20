import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("meta tags source regressions", () => {
  it("preserves shared truncation by default and only bypasses it when explicitly requested", () => {
    const source = readSource("./meta-tags.astro");

    expect(source).toContain("truncateMetaTitle");
    expect(source).toContain("truncateMetaDescription");
    expect(source).toContain(
      "const metaTitle = preserveAuthoredMetadata ? title : truncateMetaTitle(title)",
    );
    expect(source).toContain(
      "const metaDescription = preserveAuthoredMetadata ? description : truncateMetaDescription(description)",
    );
  });

  it("canonical always points to the current page URL (self-referencing), never a hardcoded page-1 URL", () => {
    const source = readSource("./meta-tags.astro");

    // Canonical must use the canonicalUrl prop directly — never a derived or stripped URL
    expect(source).toContain('<link rel="canonical" href={canonicalUrl} />');
    // Must NOT do any URL manipulation on the canonical before emitting it
    expect(source).not.toMatch(/canonical.*replace|canonical.*slice|canonical.*split/);
  });
});

describe("seoTitle override bypass — layout contract", () => {
  function readLayout(name: string): string {
    return readFileSync(path.resolve(__dirname, `../layouts/${name}.astro`), "utf8");
  }

  const editorialLayouts = [
    "article-layout",
    "comparison-layout",
    "content-layout",
    "listicle-layout",
    "pricing-breakdown-layout",
  ];

  for (const layoutName of editorialLayouts) {
    it(`${layoutName} passes seoTitle directly (bypassing | siteName suffix) and sets preserveMetaTagCopy`, () => {
      const source = readLayout(layoutName);

      // seoTitle is declared as a prop
      expect(source).toContain("seoTitle?: string");
      // When seoTitle is provided, it's used as-is as the title (no suffix appended)
      expect(source).toContain("title={seoTitle ??");
      // preserveMetaTagCopy is set to true when seoTitle is present (bypasses truncation)
      expect(source).toContain("preserveMetaTagCopy={seoTitle !== undefined");
    });
  }

  it("landing-layout passes seoTitle and sets preserveMetaTagCopy when provided", () => {
    const source = readLayout("landing-layout");

    expect(source).toContain("seoTitle?: string");
    expect(source).toContain("title={seoTitle ??");
    expect(source).toContain("preserveMetaTagCopy={seoTitle !== undefined");
  });
});
