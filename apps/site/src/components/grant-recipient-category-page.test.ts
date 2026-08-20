import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource() {
  return readFileSync(new URL("./grant-recipient-category-page.astro", import.meta.url), "utf8");
}

describe("grant recipient category page component", () => {
  it("uses page primaryCta to choose the primary action", () => {
    const source = readSource();

    expect(source).toContain('page.primaryCta === "pricing"');
    expect(source).toContain('page.primaryCta === "compare"');
    expect(source).toContain("href: getSignupCtaTarget()");
    expect(source).toContain("const primaryCta =");
    expect(source).toContain("const secondaryCta =");
    expect(source).toContain("href={primaryCta.href}");
    expect(source).toContain("href={secondaryCta.href}");
  });

  it("keeps breadcrumbs aligned to the root-level routes", () => {
    const source = readSource();

    expect(source).toContain('{ label: "Home", href: "/" }');
    expect(source).toContain("{ label: page.title, href: page.href }");
    expect(source).not.toContain('{ label: "Resources", href: "/resources" }');
  });

  it("lifts the GrantPipe fit section near the category overview", () => {
    const source = readSource();

    expect(source).toContain("const grantPipeFitSection =");
    expect(source).toContain('section.heading.toLowerCase().includes("grantpipe fits")');
    expect(source).toContain("{grantPipeFitSection && (");
    expect(source).toContain("{grantPipeFitSection.body.map((paragraph) => (");
    expect(source).toContain("{page.sections");
    expect(source).toContain(".filter((section) => section !== grantPipeFitSection)");

    expect(source.indexOf("{grantPipeFitSection && (")).toBeLessThan(
      source.indexOf('<section class="grid gap-5 md:grid-cols-3">'),
    );
  });
});
