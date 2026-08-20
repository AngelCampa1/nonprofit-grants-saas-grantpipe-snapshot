import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getPlanDisplayPrice } from "../../../packages/shared/src/pricing";
import { buildProductSchema } from "../../../packages/ui/src/site/lib/schema-builders";
import { getProductAnchorLinks } from "./lib/marketed-capabilities";

const productSource = readFileSync(new URL("./pages/product.astro", import.meta.url), "utf8");
const marketedCapabilitiesSource = readFileSync(
  new URL("./lib/marketed-capabilities.ts", import.meta.url),
  "utf8",
);
const productTourComposition = readFileSync(
  new URL("../../../media/product-tour-video/index.html", import.meta.url),
  "utf8",
);
const productTourScript = readFileSync(
  new URL("../../../media/product-tour-video/script.txt", import.meta.url),
  "utf8",
);
const productTourPackage = readFileSync(
  new URL("../../../media/product-tour-video/package.json", import.meta.url),
  "utf8",
);

describe("product page contract", () => {
  it("uses a labeled page navigation landmark with the preserved anchor ids", () => {
    expect(productSource).toContain("<nav");
    expect(productSource).toContain('aria-label="How GrantPipe works sections"');
    expect(productSource).toContain('data-section="page-nav"');
    expect(productSource).toContain("id={capability.slug}");
    expect(productSource).toContain('href={`#${link.href.split("#")[1]}`}');
    expect(productSource).toContain("getProductAnchorLinks");
  });

  it("hosts the canonical 5-minute product tour at the product-tour anchor", () => {
    expect(productSource).toContain('id="product-tour"');
    expect(productSource).toContain('productTourYoutubeId = "o-FVZeO3rjw"');
    expect(productSource).toContain("productTourEmbedUrl");
    expect(productSource).toContain("`${canonicalUrl}#product-tour`");
    expect(productSource).toContain("grantpipe-grants.png");
    expect(productSource.indexOf('id="product-tour"')).toBeGreaterThan(
      productSource.indexOf('data-section="page-nav"'),
    );
    expect(productSource.indexOf('id="product-tour"')).toBeLessThan(
      productSource.indexOf('data-section="os-modules"'),
    );
  });

  it("keeps product-tour source media and copy aligned with compliance-first positioning", () => {
    expect(productTourComposition).toContain("assets/video/01-dashboard.webm");
    expect(productTourComposition).not.toContain("assets/video/01-dashboard.mp4");
    expect(productTourComposition).toContain("Compliance-first grant management system.");
    expect(productTourComposition.replace(/\s+/g, " ")).toContain(
      "Compliance calendar, evidence trail, restricted funds, grant pipeline, donor CRM, multi-source opportunity tracking, fund accounting, and reporting context in one workspace.",
    );
    expect(productTourComposition).not.toContain("Donors, awards");
    expect(productTourScript).toContain("GrantPipe is a compliance-first grant management system");
    expect(productTourScript).not.toContain("operating layer around grant funded work: donors");
    expect(productTourPackage).not.toContain("&& mv ");
  });

  it("leads the product page and product navigation with grant management system positioning", () => {
    expect(productSource).toContain(
      "Compliance-first grant management system for post-award work.",
    );
    expect(productSource.replace(/\s+/g, " ")).toContain(
      "GrantPipe connects the records nonprofits need after an award is won. Track deadlines, restricted funds, evidence, reports, donor context, fund accounting support, and audit trails.",
    );
    expect(productSource).not.toMatch(/grant-funded nonprofits/i);
    expect(productSource).not.toMatch(/compliance-heavy nonprofits/i);
    expect(productSource).not.toContain(
      "One place to answer grant, donor, fund, and reporting questions.",
    );
    expect(productSource).not.toContain("GrantPipe keeps donors, the federal grants database");
    expect(productSource).not.toContain("One record for donors, grants, funds, and reporting.");

    expect(getProductAnchorLinks().slice(0, 2)).toEqual([
      { label: "Compliance calendar", href: "/product/#compliance" },
      { label: "Evidence and records", href: "/product/#fundraising" },
    ]);
    expect(marketedCapabilitiesSource).toContain('navLabel: "Compliance calendar"');
    expect(marketedCapabilitiesSource).toContain('navLabel: "Evidence and records"');
    expect(marketedCapabilitiesSource).not.toContain('navLabel: "Shared records"');
    expect(marketedCapabilitiesSource).not.toContain(
      'title: "Keep donor and grant work on the same record"',
    );
  });

  it("puts verified cold-visitor trust facts above the fold without public social proof", () => {
    expect(productSource).toContain('data-section="trust-strip"');
    expect(productSource).toContain("1-month free trial");
    expect(productSource).toContain("No credit card");
    expect(productSource).toContain("No setup fee");
    expect(productSource).toContain("Unlimited users");
    expect(productSource).toContain("Public pricing");
    expect(productSource).toContain("US mid-sized nonprofits");
    expect(productSource).not.toContain("Trusted by");
    expect(productSource).not.toContain("Join thousands");
    expect(productSource).not.toContain("customer logo");
    expect(productSource).not.toContain("testimonial");
  });

  it("keeps the trial CTA wiring while removing internal funnel-language blocks", () => {
    expect(productSource).toContain('data-cta-placement="product-primary"');
    expect(productSource).toContain('data-cta-placement="product-secondary"');
    expect(productSource).toContain('data-cta-section="hero"');
    expect(productSource).toContain('data-cta-section="objections"');
    expect(productSource).toContain('data-cta-section="closing"');
    expect(productSource).toContain('data-cta-target="/pricing/"');
    expect(productSource).toContain("See pricing and fit");
    expect(productSource).toContain("How GrantPipe works");
    expect(productSource).not.toContain("What this page is for");
    expect(productSource).not.toContain("Primary buying motion");
    expect(productSource).not.toContain("Support card");
    expect(productSource).not.toContain("Decision stage");
  });

  it("orders product proof for cold organic scanning from compliance to rollout", () => {
    expect(getProductAnchorLinks()).toEqual([
      { label: "Compliance calendar", href: "/product/#compliance" },
      { label: "Evidence and records", href: "/product/#fundraising" },
      {
        label: "Fund and accounting visibility",
        href: "/product/#accounting",
      },
      { label: "Guided rollout", href: "/product/#migration" },
    ]);

    expect(marketedCapabilitiesSource).toContain(
      'title: "Keep deadlines, evidence, and activity history ready for review"',
    );
    expect(marketedCapabilitiesSource).toContain(
      'title: "Keep restricted funds, grants, and donor records connected"',
    );
    expect(marketedCapabilitiesSource).toContain(
      'title: "Show finance the fund trail behind each record"',
    );
    expect(marketedCapabilitiesSource).toContain(
      'title: "Move onto GrantPipe with a bounded rollout"',
    );
  });

  it("answers replacement, migration, admin, and finance objections before pricing", () => {
    expect(productSource).toContain('data-section="objections"');
    expect(productSource.indexOf('data-section="objections"')).toBeLessThan(
      productSource.indexOf("<PricingSummaryBlock"),
    );
    expect(productSource).toContain("Will this replace our CRM?");
    expect(productSource).toContain("How hard is migration?");
    expect(productSource).toContain("Do we need an admin?");
    expect(productSource).toContain("Can finance trust the restricted-fund model?");
  });

  it("promotes Grants.gov search without overclaiming private prospecting", () => {
    expect(productSource).toContain("Grants.gov");
    expect(productSource).not.toContain("AI funder matching");
    expect(productSource).not.toContain("private foundation research database");
  });

  it("renders proof sections through a dedicated section component without slug ternaries", () => {
    expect(productSource).toContain("ProductProofSection");
    expect(productSource).not.toContain("section.slug ===");
    expect(productSource).not.toContain("capabilities.map((section) => (");
  });

  it("renders the eight-module OS structure without claiming every tier includes every module", () => {
    expect(productSource).toContain("GRANTPIPE_OS_MODULES");
    expect(productSource).toContain("GRANTPIPE_OS_PLAN_LANGUAGE");
    expect(productSource).not.toContain("all eight modules in every plan");
    expect(productSource).not.toContain("every plan includes all eight modules");
  });

  it("emits product-specific and sitewide schema metadata", () => {
    expect(productSource).toContain("buildProductSchema");
    expect(productSource).toContain("buildSoftwareApplicationSchema");
    expect(productSource).toContain("buildFaqPageSchema");
    expect(productSource).toContain("SchemaMarkup");
    expect(productSource).toContain("emitSchema={false}");
    expect(productSource).toContain("siteUrl={`https://${siteConfig.domain}`}");
    expect(productSource).toContain("siteLogo=");
    expect(productSource).toContain("siteFounder={siteConfig.author}");
    expect(productSource).toContain("siteSameAs={siteConfig.sameAs}");
  });

  it("derives product offer schema prices from shared list-price helpers", () => {
    expect(productSource).toContain("getPlanDisplayPrice");
    expect(productSource).toContain('(["starter", "growth", "audit_ready"] as const).map');
    expect(productSource).not.toContain("getPlanPromoDisplayPrice");
    expect(productSource).not.toContain("pricingCopy.schemaOfferLines");
    expect(productSource).not.toContain("price: tier.price");
    expect(productSource).not.toContain("price: pricingTiers[0]?.price");
  });

  it("emits numeric list-price product schema offers without Enterprise custom pricing", () => {
    const pricingUrl = "https://grantpipe.com/pricing/";
    const productOffers = (["starter", "growth", "audit_ready"] as const).map((tier) => ({
      price: getPlanDisplayPrice(tier, "monthly"),
      url: pricingUrl,
      availability: "https://schema.org/InStock",
    }));

    const schema = buildProductSchema({
      name: "GrantPipe",
      description: "Compliance-first grant management system.",
      url: "https://grantpipe.com/product/",
      category: "Nonprofit CRM and grant compliance software",
      brand: { name: "GrantPipe" },
      offers: productOffers,
    });

    expect(schema.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "49",
      highPrice: "199",
      priceCurrency: "USD",
      offerCount: 3,
    });
    expect(schema.offers).not.toMatchObject({ highPrice: "0" });
    expect(JSON.stringify(schema.offers)).not.toContain("Custom pricing");
    expect(JSON.stringify(schema.offers)).not.toContain('"price":"0"');
    expect(productOffers.map((offer) => offer.price)).toEqual([
      getPlanDisplayPrice("starter", "monthly"),
      getPlanDisplayPrice("growth", "monthly"),
      getPlanDisplayPrice("audit_ready", "monthly"),
    ]);
  });
});
