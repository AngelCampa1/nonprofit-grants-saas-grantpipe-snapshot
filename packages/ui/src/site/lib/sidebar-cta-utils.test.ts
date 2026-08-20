import { describe, it, expect } from "vitest";
import { buildBottomCtaProps, buildSidebarCtaProps } from "./sidebar-cta-utils";
import type { BuyerStage, FunnelStage, SiteConfig } from "../types";

const funnel: Record<BuyerStage, FunnelStage> & { ctaSubtitle: string } = {
  tofu: { ctaMode: "educate", ctaText: "Learn More", ctaTarget: "/guides" },
  mofu: {
    ctaMode: "evaluate",
    ctaText: "Compare Plans",
    ctaTarget: "/pricing",
  },
  bofu: {
    ctaMode: "convert",
    ctaText: "Start Free Trial",
    ctaTarget: "/signup",
  },
  ctaSubtitle: "No credit card required",
};

function makeConfig(overrides?: Partial<SiteConfig>): SiteConfig {
  return {
    name: "TestSite",
    domain: "testsite.com",
    tagline: "Test tagline",
    theme: {
      primary: "#000",
      accent: "#fff",
      fonts: { heading: "sans-serif", body: "sans-serif" },
    },
    product: {
      category: "SaaS",
      price: "$49/mo",
      targetAudience: "Developers",
      trustSignals: [],
    },
    competitors: [],
    funnel,
    survey: { questions: [] },
    faqs: [],
    discoveryCallUrl: "/call",
    discoveryCallIncentive: "Free 30-min call",
    problemAgitation: {
      heading: "The problem",
      closingLine: "We fix that",
      painPoints: [],
    },
    ...overrides,
  } satisfies SiteConfig;
}

describe("buildSidebarCtaProps", () => {
  it("returns correct ctaText and ctaTarget for tofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "tofu");
    expect(result.ctaText).toBe("Learn More");
    expect(result.ctaTarget).toBe("/guides");
  });

  it("returns correct ctaText and ctaTarget for mofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.ctaText).toBe("Compare Plans");
    expect(result.ctaTarget).toBe("/pricing");
  });

  it("returns correct ctaText and ctaTarget for bofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.ctaText).toBe("Start Free Trial");
    expect(result.ctaTarget).toBe("/signup");
  });

  it("returns subtitle from config.copy.funnelCta.subtitle when present", () => {
    const config = makeConfig({
      copy: { funnelCta: { subtitle: "No credit card needed" } },
    });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.subtitle).toBe("No credit card needed");
  });

  it("returns undefined for subtitle when config.copy is absent", () => {
    const config = makeConfig({ copy: undefined });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.subtitle).toBeUndefined();
  });

  it("returns bullets from config.copy.funnelCta.benefitBullets when present", () => {
    const config = makeConfig({
      copy: { funnelCta: { benefitBullets: ["Fast setup", "No contracts"] } },
    });
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.bullets).toEqual(["Fast setup", "No contracts"]);
  });

  it("returns undefined for bullets when not configured", () => {
    const config = makeConfig({ copy: undefined });
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.bullets).toBeUndefined();
  });

  it("returns trustNote from config.copy.funnelCta.trustNote when present", () => {
    const config = makeConfig({
      copy: { funnelCta: { trustNote: "SOC 2 compliant" } },
    });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.trustNote).toBe("SOC 2 compliant");
  });

  it("builds shared CTA analytics context from the selected funnel stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "bofu");

    expect(result.analytics).toEqual({
      buyerStage: "bofu",
      intent: "convert",
      placement: "sidebar",
    });
  });
});

describe("buildBottomCtaProps", () => {
  it("routes tofu article readers to the tofu funnel step", () => {
    const config = makeConfig();
    const result = buildBottomCtaProps(config, "tofu", "resource-article");

    expect(result.primaryCta).toEqual({
      text: "Learn More",
      target: "/guides",
    });
    expect(result.secondaryCta).toEqual({
      text: "Compare Plans",
      target: "/pricing",
    });
    expect(result.analytics).toEqual({
      buyerStage: "tofu",
      intent: "educate",
      pageFamily: "resource-article",
      placement: "bottom-primary",
      target: "/guides",
    });
  });

  it("routes mofu listicle readers to the mofu funnel step", () => {
    const config = makeConfig();
    const result = buildBottomCtaProps(config, "mofu", "resource-listicle");

    expect(result.primaryCta).toEqual({
      text: "Compare Plans",
      target: "/pricing",
    });
    expect(result.secondaryCta).toEqual({
      text: "Start Free Trial",
      target: "/signup",
    });
    expect(result.heading).toBe("Compare fit and cost.");
    expect(result.analytics.intent).toBe("evaluate");
  });

  it("keeps bofu comparison readers on the bofu funnel step", () => {
    const config = makeConfig();
    const result = buildBottomCtaProps(config, "bofu", "comparison");

    expect(result.primaryCta).toEqual({
      text: "Start Free Trial",
      target: "/signup",
    });
    expect(result.secondaryCta).toBeUndefined();
    expect(result.heading).toBe("Test the workflow.");
    expect(result.analytics).toMatchObject({
      buyerStage: "bofu",
      intent: "convert",
      pageFamily: "comparison",
    });
  });
});
