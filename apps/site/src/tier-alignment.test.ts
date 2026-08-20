import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FEDERAL_EDITION_SKU,
  MARKETED_FEATURE_CATALOG,
  PLAN_CATALOG,
  PLAN_ENTITLEMENT_KEYS,
} from "../../../packages/shared/src/pricing";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const componentsDir = fileURLToPath(new URL("./components", import.meta.url));
const pagesDir = fileURLToPath(new URL("./pages", import.meta.url));
const featuresContentDir = join(marketingContentDirectory, "features");

function readPage(relativePath: string): string {
  return readFileSync(join(pagesDir, relativePath), "utf8");
}

function readComponent(relativePath: string): string {
  return readFileSync(join(componentsDir, relativePath), "utf8");
}

describe("tier-alignment marketing surfaces", () => {
  it("PricingSummaryBlock reads from self-serve plans and keeps Enterprise below the cards", () => {
    const source = readComponent("pricing-summary-block.astro");
    expect(source).toContain("getSelfServePlans");
    expect(source).toContain("getPlanListDisplayPrice");
    expect(source).not.toContain("getPlanPromoDisplayPrice");
    expect(source).toContain('href="/pricing/"');
    expect(source).toContain("Need a custom path?");
    expect(source).toContain("gp-pricing-summary__enterprise");
    expect(source).not.toContain("PLAN_CATALOG");
    expect(source).not.toContain('data-plan={"enterprise"}');
    expect(source).not.toContain("formatCurrencyCents");
  });

  it("FeatureComparisonMatrix defaults to self-serve plan columns on public surfaces", () => {
    const source = readComponent("feature-comparison-matrix.astro");
    expect(source).toContain("SELF_SERVE_PLAN_TIERS");
    expect(source).toContain("includeEnterprise = false");
    expect(source).not.toContain("const tiers = PLAN_TIERS");
  });

  it("RecommendedPlanCard reads from getPricingPlan and renders price + CTA", () => {
    const source = readComponent("recommended-plan-card.astro");
    expect(source).toContain("getPricingPlan");
    expect(source).toContain("getPlanListDisplayPrice");
    expect(source).not.toContain("getPlanPromoDisplayPrice");
    expect(source).toContain("getSignupCtaTarget");
    expect(source).not.toContain("formatCurrencyCents");
  });

  it("TierAvailabilityBadge supports a baseline variant", () => {
    const source = readComponent("tier-availability-badge.astro");
    expect(source).toContain('"baseline"');
    expect(source).toContain("All plans");
  });

  it("category SEO hub embeds PricingSummaryBlock", () => {
    const source = readComponent("grant-recipient-category-page.astro");
    expect(source).toContain("PricingSummaryBlock");
  });

  it("solutions/[slug] renders RecommendedPlanCard and PricingSummaryBlock", () => {
    const source = readPage("solutions/[slug].astro");
    expect(source).toContain("RecommendedPlanCard");
    expect(source).toContain("PricingSummaryBlock");
  });

  it("for/[slug] renders RecommendedPlanCard and PricingSummaryBlock", () => {
    const source = readPage("for/[slug].astro");
    expect(source).toContain("RecommendedPlanCard");
    expect(source).toContain("PricingSummaryBlock");
  });

  it("compare templates embed PricingSummaryBlock", () => {
    expect(readPage("compare/grantpipe-vs-quickbooks.astro")).toContain("PricingSummaryBlock");
    expect(readPage("compare/alternatives/[slug].astro")).toContain("PricingSummaryBlock");
    expect(readPage("compare/versus/[slugA]-vs-[slugB].astro")).toContain("PricingSummaryBlock");
    expect(readPage("compare/pricing/[slug].astro")).toContain("PricingSummaryBlock");
  });

  it("product page embeds PricingSummaryBlock", () => {
    const source = readPage("product.astro");
    expect(source).toContain("PricingSummaryBlock");
  });

  it("integrations/[slug] and workflows/[slug] render TierAvailabilityBadge when entitlement is set", () => {
    expect(readPage("integrations/[slug].astro")).toContain("TierAvailabilityBadge");
    expect(readPage("workflows/[slug].astro")).toContain("TierAvailabilityBadge");
  });

  it("features/[slug] renders TierAvailabilityBadge unconditionally (matrix or baseline)", () => {
    const source = readPage("features/[slug].astro");
    expect(source).toContain("TierAvailabilityBadge");
    expect(source).toContain('variant="baseline"');
  });

  it("every feature content file declares a title and any entitlement uses a known key", () => {
    const featureFiles = readdirSync(featuresContentDir).filter((f) => f.endsWith(".md"));
    expect(featureFiles.length).toBeGreaterThan(0);
    const knownKeys = new Set<string>(PLAN_ENTITLEMENT_KEYS as readonly string[]);
    for (const file of featureFiles) {
      const content = readFileSync(join(featuresContentDir, file), "utf8");
      expect(/^title:/m.test(content), `${file} missing title`).toBe(true);
      const match = /^entitlement:\s*"([a-zA-Z]+)"/m.exec(content);
      if (match) {
        expect(knownKeys.has(match[1]!), `${file} declares unknown entitlement: ${match[1]}`).toBe(
          true,
        );
      }
    }
  });

  it("templates that consume entitlement / recommendedTier destructure them from entry.data", () => {
    expect(readPage("solutions/[slug].astro")).toContain("entitlement");
    expect(readPage("solutions/[slug].astro")).toContain("recommendedTier");
    expect(readPage("for/[slug].astro")).toContain("entitlement");
    expect(readPage("for/[slug].astro")).toContain("recommendedTier");
    expect(readPage("workflows/[slug].astro")).toContain("entitlement");
    expect(readPage("integrations/[slug].astro")).toContain("entitlement");
  });

  it('recommendedTier fallback ("growth") matches a tier in PLAN_CATALOG', () => {
    const tiers = new Set(PLAN_CATALOG.map((p) => p.tier));
    expect(tiers.has("growth")).toBe(true);
    for (const page of ["solutions/[slug].astro", "for/[slug].astro"]) {
      expect(readPage(page)).toContain('recommendedTier ?? "growth"');
    }
  });

  it("multi-entity-consolidation feature is gated to Enterprise via the catalog", () => {
    const file = readFileSync(join(featuresContentDir, "multi-entity-consolidation.md"), "utf8");
    expect(file).toMatch(/^entitlement:\s*"?hasMultiEntityConsolidation"?$/m);
    const row = MARKETED_FEATURE_CATALOG.find((r) => r.key === "hasMultiEntityConsolidation");
    expect(row).toBeDefined();
    expect(row?.byTier.starter).toBe("not_included");
    expect(row?.byTier.growth).toBe("not_included");
    expect(row?.byTier.audit_ready).toBe("not_included");
    expect(row?.byTier.enterprise).toBe("included");
  });

  it("PLAN_CATALOG remains the source of truth for the marketing site", () => {
    expect(PLAN_CATALOG.map((p) => p.tier)).toEqual([
      "starter",
      "growth",
      "audit_ready",
      "enterprise",
    ]);
  });

  it("pricing page renders Federal Edition as a contact SKU, not a checkout card", () => {
    const pricing = readPage("pricing.astro");
    const pricingCards = readComponent("pricing-plan-cards.astro");

    expect(FEDERAL_EDITION_SKU.selfServe).toBe(false);
    expect(FEDERAL_EDITION_SKU.abovePlanTier).toBe("audit_ready");
    expect(FEDERAL_EDITION_SKU.priceAnchor).toBe("Custom rollout plan. We set price after a call.");
    expect(FEDERAL_EDITION_SKU.priceAnchor).not.toMatch(/\$\d/);
    expect(pricing).toContain("FEDERAL_EDITION_SKU");
    expect(pricing).toContain('data-section="federal-edition"');
    expect(pricing).toContain("federalSku.name");
    expect(pricing).toContain("federalSku.priceAnchor");
    expect(pricingCards).not.toContain(FEDERAL_EDITION_SKU.id);
  });
});
