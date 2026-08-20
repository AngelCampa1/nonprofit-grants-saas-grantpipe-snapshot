import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("pricing sticky CTA source", () => {
  const source = readFileSync(resolve(import.meta.dirname, "./pages/pricing.astro"), "utf8");

  it("marks the pricing hero for sticky CTA visibility tracking", () => {
    expect(source).toContain('<section class="gp-section" data-hero data-section="hero">');
  });

  it("derives plan guidance and accounting-entitlement copy from shared pricing data", () => {
    expect(source).not.toContain("const planChoiceGuides = [");
    expect(source).not.toContain("const chooseThisIfByPlan = {");
    expect(source).not.toMatch(/QuickBooks Online read-only accounting integrations/i);
  });
});
