import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productSource = readFileSync(new URL("./pages/product.astro", import.meta.url), "utf8");
const guideTemplateSource = readFileSync(
  new URL("./pages/resources/guides/[slug].astro", import.meta.url),
  "utf8",
);

describe("positioning analytics contract", () => {
  it("captures the product page OS positioning view", () => {
    expect(productSource).toContain("buildOsPositioningViewScript");
    expect(productSource).toContain('buildOsPositioningViewScript("product", "/product/")');
  });

  it("captures the flagship guide OS positioning view only for that guide", () => {
    expect(guideTemplateSource).toContain("buildOsPositioningViewScript");
    expect(guideTemplateSource).toContain(
      'canonicalPath === "/resources/guides/grant-management-software-for-nonprofits"',
    );
    expect(guideTemplateSource).not.toContain("grant-funded-nonprofit-operating-system");
    expect(guideTemplateSource).toContain('buildOsPositioningViewScript("guide", canonicalPath)');
  });
});
