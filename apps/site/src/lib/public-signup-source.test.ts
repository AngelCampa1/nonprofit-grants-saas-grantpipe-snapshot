import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function collectAstroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectAstroFiles(fullPath);
    }

    return fullPath.endsWith(".astro") ? [fullPath] : [];
  });
}

describe("public signup source regressions", () => {
  it("keeps signup-flow payloads out of Astro page templates", () => {
    const astroFiles = collectAstroFiles(fileURLToPath(new URL("../pages", import.meta.url)));

    for (const file of astroFiles) {
      const source = readFileSync(file, "utf8");

      expect(source).not.toContain("surveyQuestions={siteConfig.survey.questions}");
      expect(source).not.toContain("discoveryCallUrl={siteConfig.discoveryCallUrl}");
      expect(source).not.toContain("surveyQualification={siteConfig.survey.qualification}");
      expect(source).not.toContain("qualification={siteConfig.survey.qualification}");
    }
  });

  it("routes homepage pricing CTAs directly into the product signup flow", () => {
    const homepage = readFileSync(new URL("../pages/index.astro", import.meta.url), "utf8");
    const pricingCards = readFileSync(
      new URL("../components/pricing-plan-cards.astro", import.meta.url),
      "utf8",
    );

    // Homepage now delegates pricing-card rendering to the shared component
    expect(homepage).toContain("PricingPlanCards");

    // The shared component owns the binding + CTA wiring
    expect(pricingCards).toContain("getPricingTierBindings");
    expect(pricingCards).toContain("const pricingTierBindings = getPricingTierBindings();");
    expect(pricingCards).toContain("pricingTierBindings[index]");
    expect(pricingCards).not.toContain("promo:");
    expect(pricingCards).toContain("data-annual-href={annualHref}");
    expect(pricingCards).toContain("data-monthly-href={monthlyHref}");
    expect(pricingCards).toContain("data-cta-target={annualHref}");
    expect(pricingCards).toContain("siteConfig.funnel.bofu.ctaText");

    expect(homepage).not.toContain("{`${siteConfig.funnel.bofu.ctaText} for ${tier.name}`}");
    expect(homepage).not.toContain("fetchActiveLaunchPromo");
    expect(homepage).toContain("<PricingPlanCards featureLimit={5} />");
    expect(homepage).not.toContain('emailCaptureConfigUrl="/signup-flow.json"');
    expect(homepage).not.toContain("emailCapture={{");
  });
});
