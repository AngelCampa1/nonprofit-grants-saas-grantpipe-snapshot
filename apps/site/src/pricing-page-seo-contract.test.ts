import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GRANT_CAP_OVERAGE_COPY,
  GRANT_CAP_SOFT_HEADROOM,
} from "../../../packages/shared/src/constants";
import { PLAN_CATALOG, getSelfServePlans } from "../../../packages/shared/src/pricing";

const pricingSource = readFileSync(
  fileURLToPath(new URL("./pages/pricing.astro", import.meta.url)),
  "utf8",
);

const pricingCardsSource = readFileSync(
  fileURLToPath(new URL("./components/pricing-plan-cards.astro", import.meta.url)),
  "utf8",
);

describe("pricing page SEO contract", () => {
  it("emits pricing-specific SoftwareApplication, Product, and FAQ schema", () => {
    expect(pricingSource).toContain("buildSoftwareApplicationSchema");
    expect(pricingSource).toContain("buildProductSchema");
    expect(pricingSource).toContain("buildFaqPageSchema");
    expect(pricingSource).toContain("<SchemaMarkup graph={pricingGraph} />");
  });

  it("keeps pricing schema tied to the canonical pricing URL and shared catalog", () => {
    expect(pricingSource).toContain("const pricingUrl = `https://${siteConfig.domain}/pricing/`");
    expect(pricingSource).toContain("PLAN_CATALOG");
    expect(pricingSource).toContain("schemaPriceFromCents");
    expect(pricingSource).toContain("siteConfig.faqs");
  });

  it("keeps FAQ schema aligned to visible FAQ content", () => {
    expect(pricingSource).toContain('data-section="pricing-faq"');
    expect(pricingSource).toContain("Pricing FAQ");
    expect(pricingSource).toContain("siteConfig.faqs.slice");
    // Batch 03: FAQ items now use <ViewportAwareDetails> (collapses on mobile,
    // auto-opens on desktop) instead of bare <details> elements.
    expect(pricingSource).toContain("ViewportAwareDetails");
  });

  it("renders best-fit guidance for each plan via the shared pricing cards component", () => {
    expect(pricingSource).toContain("PricingPlanCards");
    expect(pricingCardsSource).toContain("Best for {tier.bestFit}");
    for (const plan of PLAN_CATALOG) {
      expect(plan.bestFit.length).toBeGreaterThan(0);
    }
    const expectedBestFits = [
      "Stop missing deadlines",
      "Run more grants with less stress",
      "Prove every dollar",
      "Complex grant-funded teams that need founder guidance",
    ];
    for (const fit of expectedBestFits) {
      expect(PLAN_CATALOG.some((p) => p.bestFit === fit)).toBe(true);
    }
  });

  it("documents active-grant billing without promoting QuickBooks tiering", () => {
    expect(pricingSource).toContain("Active grant definition");
    expect(pricingSource).toContain("overage");
    expect(pricingSource).toContain("GRANT_CAP_OVERAGE_COPY");
    expect(pricingSource).toContain("GRANT_CAP_SOFT_HEADROOM");
    expect(GRANT_CAP_OVERAGE_COPY).toBe("$10/active grant/month");
    expect(GRANT_CAP_SOFT_HEADROOM).toBe(10);
    expect(pricingSource).not.toContain("QuickBooks Online");
    expect(pricingSource).not.toContain(
      'getPlanLabelsWithEntitlement("hasAccountingIntegrations")',
    );
    expect(pricingSource).not.toContain("not Starter or Growth");
  });

  it("keeps pricing schema anchored to shared catalog prices", () => {
    const starter = PLAN_CATALOG.find((plan) => plan.tier === "starter");
    const enterprise = PLAN_CATALOG.find((plan) => plan.tier === "enterprise");

    expect(starter?.prices?.monthlyCents).toBe(4900);
    expect(enterprise?.prices).toBeNull();
    // Schema offers quote shared catalog prices, never stale promotional prices.
    expect(pricingSource).toContain("schemaPlanPriceFromCents");
    expect(pricingSource).toContain("plan.prices.monthlyCents");
    expect(pricingSource).not.toContain("resolveActivePromoSchemaPriceCents");
    expect(pricingSource).toContain("getSelfServePlans().map");
    expect(pricingSource).not.toContain('price: "159"');
    expect(pricingSource).not.toContain('price: "1599"');
    expect(pricingCardsSource).toContain("Need a custom path?");
    expect(getSelfServePlans().map((plan) => plan.name)).toEqual([
      "Starter",
      "Growth",
      "Audit-Ready",
    ]);
  });

  it("renders full-price pricing without retired promo display or checkout codes", () => {
    expect(pricingCardsSource).not.toContain("resolvePromoPricingDisplay");
    expect(pricingCardsSource).not.toContain("gp-plan-promo-badge");
    expect(pricingCardsSource).not.toContain("activePromo");
    expect(pricingCardsSource).not.toContain("promo:");
    expect(pricingCardsSource).not.toContain("<s>");
    expect(pricingCardsSource).not.toContain("Limited price");
    expect(pricingCardsSource).toContain("data-annual-href={annualHref}");
    expect(pricingCardsSource).toContain("data-monthly-href={monthlyHref}");
    expect(pricingCardsSource).not.toContain('tier.name === "Enterprise"');
  });

  it("keeps pricing schema and offer stack free of retired promo copy", () => {
    const offerStackSource = readFileSync(
      fileURLToPath(new URL("./components/offer-stack.astro", import.meta.url)),
      "utf8",
    );

    expect(pricingSource).not.toContain("hasActivePromoDisplay");
    expect(pricingSource).not.toContain("activePromoBanner");
    expect(pricingSource).not.toContain("limitedOfferCopy");
    expect(pricingSource).not.toContain("launchCents");
    expect(offerStackSource).not.toContain("hasActivePromoDisplay");
    expect(offerStackSource).not.toContain("limitedOfferTitle");
  });

  it("publishes the named guarantee stack on the pricing offer stack", () => {
    const offerStackSource = readFileSync(
      fileURLToPath(new URL("./components/offer-stack.astro", import.meta.url)),
      "utf8",
    );

    expect(offerStackSource).toContain("GRANTPIPE_GUARANTEE_STACK");
    expect(offerStackSource).toContain("{GRANTPIPE_GUARANTEE_STACK.name}");
    expect(offerStackSource).toContain("{GRANTPIPE_GUARANTEE_STACK.headline}");
    expect(offerStackSource).toContain("GRANTPIPE_GUARANTEE_STACK.items.map");
  });

  it("frames pricing around fit without the retired limited offer", () => {
    expect(pricingSource).toContain("Compliance-first grant management system pricing.");
    expect(pricingSource).toContain("Pick your plan by grant load and proof needs");
    expect(pricingSource).toContain("/resources/guides/compliance-first-grant-management-system/");
    expect(pricingSource).toContain("evidence packages");
    expect(pricingSource).toContain("It adds reminders and built-in AI");
    expect(pricingSource).toContain("getSelfServePlans()");
    expect(pricingSource).toContain("plan.pricingPageGuide");
    expect(pricingSource).toContain("teams facing a");
    expect(pricingSource).not.toContain("limitedOfferCopy");
    expect(pricingSource).toContain("Choose billing after the plan makes sense");
    expect(pricingSource).toContain("Pick the plan that fits first");
    expect(pricingSource).toContain('data-section="plan-choice-guide"');
    expect(pricingSource).not.toContain("LaunchProgressBar");
  });

  it("makes Growth the recommended plan while keeping trial terms explicit", () => {
    expect(pricingCardsSource).toContain("Recommended for active grant teams");
    expect(pricingCardsSource).toContain("catalogPlan.chooseThisIf");
    expect(pricingCardsSource).toContain("Choose this if");
    expect(pricingCardsSource).not.toContain("Limited price");
    expect(pricingCardsSource).toContain("1-month free trial. No credit card.");
  });

  it("handles bottom-of-funnel pricing objections before the matrix", () => {
    expect(pricingSource).toContain('data-section="pricing-objections"');
    expect(pricingSource).toContain("Will this replace our CRM?");
    expect(pricingSource).toContain("What happens during the trial?");
    expect(pricingSource).toContain("What if we outgrow the grant cap?");
    expect(pricingSource).toContain("Do we need a consultant or admin?");
  });
});
