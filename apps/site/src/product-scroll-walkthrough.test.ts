import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productSource = readFileSync(new URL("./pages/product.astro", import.meta.url), "utf8");

describe("product page scroll-reveal and OS-modules walkthrough", () => {
  it("wires scroll-in reveal targets across sections without touching the hero H1", () => {
    expect(productSource).toContain("scroll-in");
    // The hero heading itself must not carry the reveal class — only later
    // sections/cards should.
    expect(productSource).not.toMatch(/class="gp-page-title[^"]*scroll-in/);
    expect(productSource).not.toMatch(/class="scroll-in[^"]*gp-page-title/);
  });

  it("keeps every OS-modules walkthrough copy block as static, crawlable text", () => {
    expect(productSource).toContain("data-os-walkthrough");
    expect(productSource).toContain("data-os-step={index}");
    expect(productSource).toContain("Every deadline and every grant, one shared view.");
    expect(productSource).toContain("Documents and reviewer access stay on the record.");
    expect(productSource).toContain("Restricted balances and drawdowns, connected to the grant.");
    expect(productSource).toContain("Donor history and new opportunities, same workspace.");
    // All eight module names still render as static copy in the full grid,
    // independent of whichever step groups them in the walkthrough.
    expect(productSource).toContain("osModules.map((moduleName) => (");
  });

  it("guards the sticky visual rail and its highlight script for reduced motion and no-JS", () => {
    expect(productSource).toContain("prefers-reduced-motion: reduce");
    expect(productSource).toContain("prefersReducedMotion");
    expect(productSource).toContain("typeof IntersectionObserver === \"undefined\"");
    // Sticky is scoped behind a min-width media query, so narrow/no-JS
    // viewports get a plain stacked layout by default.
    expect(productSource).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*position: sticky;/);
  });

  it("keeps the os-modules section anchor ordering required by the product page contract", () => {
    expect(productSource.indexOf('id="product-tour"')).toBeLessThan(
      productSource.indexOf('data-section="os-modules"'),
    );
  });
});
