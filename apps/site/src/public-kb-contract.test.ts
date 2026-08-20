import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { siteConfig } from "./config/site";

describe("marketing public knowledge contract", () => {
  it("derives reusable marketing facts from the canonical public KB", () => {
    expect(siteConfig.product.targetAudience).toBe(marketingKnowledge.icp.primaryAudience);
    expect(siteConfig.author?.email).toBe(marketingKnowledge.founder.email);
    expect(siteConfig.product.category).toBe(marketingKnowledge.productPositioning.category);
    expect(siteConfig.tagline).toBe(marketingKnowledge.productPositioning.tagline);
    expect(siteConfig.metaDescription).toBe(marketingKnowledge.productPositioning.boilerplate);
    expect(siteConfig.heroCopy?.subheadline).toContain("prove what is awarded");
    expect(siteConfig.funnel.bofu.ctaText).toBe(marketingKnowledge.ctas.trial.label);
    expect(siteConfig.funnel.bofu.ctaTarget).toBe("/pricing/#plans");
    expect(siteConfig.appLoginUrl).toBe(`${marketingKnowledge.brand.appUrl}/app/login`);
    expect(siteConfig.funnel.ctaSubtitle).toBe(marketingKnowledge.ctas.trial.subtitle);
    expect(siteConfig.footer?.emailCapture?.buttonText).toBe(marketingKnowledge.ctas.trial.label);
    expect(siteConfig.competitors.map((competitor) => competitor.slug)).toEqual(
      marketingKnowledge.competitorBattlecards.map((battlecard) => battlecard.slug),
    );
  });

  it("imports market facts through the shared public KB package export", () => {
    const marketFactsSource = readFileSync(
      new URL("./config/market-facts.ts", import.meta.url),
      "utf8",
    );

    expect(marketFactsSource).toContain("@grantpipe/shared/public-kb");
    expect(marketFactsSource).not.toContain("../../../../packages/shared/src/public-kb");
  });

  it("loads public markdown collections through the public KB facade", () => {
    const contentConfigSource = readFileSync(
      new URL("./content.config.ts", import.meta.url),
      "utf8",
    );
    const loaderContractSource = readFileSync(
      new URL("./content-config-loader-contract.test.ts", import.meta.url),
      "utf8",
    );

    expect(contentConfigSource).toContain("@grantpipe/shared/public-kb");
    expect(contentConfigSource).not.toContain('from "@grantpipe/shared"');
    expect(loaderContractSource).toContain("@grantpipe/shared/public-kb");
    expect(loaderContractSource).not.toContain('from "@grantpipe/shared"');
  });

  it("keeps site signup targets plan-aware while centralizing labels", () => {
    const siteConfigSource = readFileSync(new URL("./config/site.ts", import.meta.url), "utf8");

    expect(siteConfigSource).toContain('export const planChoiceCtaTarget = "/pricing/#plans"');
    expect(siteConfigSource).toContain("return buildSignupUrl(opts)");
    expect(siteConfigSource).not.toContain("ctaTarget: trialCta.href");
  });

  it("keeps the public KB separate from SEO bot files", () => {
    const machineReadableSource = readFileSync(
      new URL("./lib/machine-readable.ts", import.meta.url),
      "utf8",
    );

    expect(machineReadableSource).not.toContain("public-kb");
    expect(machineReadableSource).not.toContain("marketingKnowledge");
  });
});
