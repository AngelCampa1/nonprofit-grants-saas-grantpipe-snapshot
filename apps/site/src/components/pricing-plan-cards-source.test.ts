import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(): string {
  return readFileSync(path.resolve(__dirname, "./pricing-plan-cards.astro"), "utf8");
}

describe("pricing-plan-cards source", () => {
  it("does not render retired first-year promo renewal copy", () => {
    const source = readSource();

    expect(source).not.toContain("annualPromoDisplay");
    expect(source).not.toContain("monthlyPromoDisplay");
    expect(source).not.toContain("after the first year");
    expect(source).not.toMatch(/renewalPrice\s*\}\s*\/mo/);
  });

  it("renders both annual and monthly published-price views", () => {
    const source = readSource();

    expect(source).toContain('data-show="annual"');
    expect(source).toContain('data-show="monthly"');
    expect(source).toContain("tier.annualPriceOverride ?? tier.price");
    expect(source).toContain("tier.price");
  });

  it("keeps annual savings copy short and explicit", () => {
    const source = readSource();

    expect(source).toContain("20% off monthly");
    expect(source).toContain("billed monthly");
    expect(source).not.toContain("paid upfront annually");
  });
});
