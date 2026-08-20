import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "../../../packages/shared/src/pricing";
import { siteConfig } from "./config/site";
import { buildPricingTxt } from "./lib/pricing-txt";
import { getMarketedCapabilities } from "./lib/marketed-capabilities";
import { marketingContentDirectory } from "./lib/marketing-content-root";

function readContent(path: string) {
  return readFileSync(join(marketingContentDirectory, path), "utf8");
}

const marketedContentPaths = [
  "alternatives/donorperfect-alternative.md",
  "alternatives/hubspot-nonprofit-alternative.md",
  "alternatives/neon-crm-alternative.md",
  "alternatives/network-for-good-alternative.md",
  "alternatives/zoho-nonprofit-alternative.md",
  "listicles/best-nonprofit-software-2026.md",
  "lead-magnets/grant-software-roi-calculator.md",
  "pricing-breakdowns/blackbaud-pricing.md",
  "pricing-breakdowns/bloomerang-pricing.md",
  "pricing-breakdowns/charityengine-pricing.md",
  "pricing-breakdowns/donorperfect-pricing.md",
  "pricing-breakdowns/little-green-light-pricing.md",
  "pricing-breakdowns/neon-crm-pricing.md",
  "pricing-breakdowns/network-for-good-pricing.md",
  "pricing-breakdowns/virtuous-pricing.md",
];

describe("Program Allocation marketing contract", () => {
  it("positions Program Allocation management on Starter and exports on Growth", () => {
    const starterFeatures = PLAN_CATALOG.find((plan) => plan.tier === "starter")?.features ?? [];
    const growthFeatures = PLAN_CATALOG.find((plan) => plan.tier === "growth")?.features ?? [];
    const auditReadyFeatures =
      PLAN_CATALOG.find((plan) => plan.tier === "audit_ready")?.features ?? [];
    const pricingTxt = buildPricingTxt(siteConfig);
    const accountingNarrative = getMarketedCapabilities().find(
      (capability) => capability.slug === "accounting",
    );

    expect(starterFeatures.join(" ")).toContain("Program management and allocation tracking");
    expect(growthFeatures.join(" ")).toContain("Program budget-vs-actual exports");
    expect(auditReadyFeatures.join(" ")).not.toContain("Program Allocation management");
    expect(accountingNarrative?.items).toContain("Program Allocation");
    expect(pricingTxt).toContain("Program management and allocation tracking");
    expect(pricingTxt).toContain("Program budget-vs-actual exports");
  });

  it.each(marketedContentPaths)("%s does not place Program Allocation on old tiers", (path) => {
    const source = readContent(path);
    const lines = source.split(/\r?\n/);

    expect(source).not.toContain("read-only Program Allocation previews");
    expect(lines).not.toContainEqual(
      expect.stringMatching(/Audit-Ready (adds|includes|covers).*Program Allocation/),
    );
    expect(lines).not.toContainEqual(
      expect.stringMatching(/Audit-Ready (adds|includes|covers).*budget-vs-actual/),
    );
    expect(source).not.toContain(
      "Audit-Ready ($799/month): Everything in Growth, plus advanced fund accounting",
    );
    expect(source).not.toContain("Audit-Ready ($799/mo) adds advanced fund accounting");
  });
});
