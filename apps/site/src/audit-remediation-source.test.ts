import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { siteConfig } from "./config/site";
import { marketingContentFile } from "./lib/marketing-content-root";

function readFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readMarketingContent(relativePath: string): string {
  return readFileSync(marketingContentFile(relativePath), "utf8");
}

describe("GrantPipe audit remediation regressions", () => {
  it("keeps robots.txt limited to valid directives", () => {
    const robotsSource = readFile("../public/robots.txt");

    expect(robotsSource).not.toContain("Llms-Txt:");
    expect(robotsSource).not.toContain("Pricing-Txt:");
    expect(robotsSource).toContain("Sitemap: https://grantpipe.com/sitemap-index.xml");
    expect(robotsSource).toContain("User-agent: Bingbot");
  });

  it("removes the sticky mobile CTA from the homepage", () => {
    const homepageSource = readFile("./pages/index.astro");

    expect(homepageSource).not.toContain("StickyMobileCta");
  });

  it("suppresses the homepage footer email capture to avoid duplicate conversion blocks", () => {
    const homepageSource = readFile("./pages/index.astro");

    expect(homepageSource).toContain("<BaseLayout");
    expect(homepageSource).toContain('captureVariant="none"');
  });

  it("places the comparison lead magnet signup after the main content on alternatives pages", () => {
    const alternativeSource = readFile("./pages/compare/alternatives/[slug].astro");

    const contentIndex = alternativeSource.indexOf("<Content />");
    const signupIndex = alternativeSource.indexOf("<LeadMagnetSignup");

    expect(contentIndex).toBeGreaterThan(-1);
    expect(signupIndex).toBeGreaterThan(contentIndex);
  });

  it("darkens GrantPipe scan labels for better legibility", () => {
    const styles = readFile("./styles/global.css");

    const kickerBlock = styles.slice(
      styles.indexOf(".gp-page-kicker {"),
      styles.indexOf(".gp-page-title {"),
    );
    const proofLabelBlock = styles.slice(
      styles.indexOf(".gp-proof-label {"),
      styles.indexOf(".gp-proof-value {"),
    );
    const linkCardMetaBlock = styles.slice(
      styles.indexOf(".gp-link-card-meta {"),
      styles.indexOf(".gp-directory-grid {"),
    );

    expect(kickerBlock).toContain("color: var(--color-brand-primary);");
    expect(proofLabelBlock).toContain("color: var(--color-brand-primary);");
    expect(linkCardMetaBlock).toContain("color: var(--color-brand-primary);");
  });

  it("keeps shared CTA kicker labels from being reset to body-copy styling", () => {
    const styles = readFile("./styles/global.css");

    const sharedCtaBlock = styles.slice(
      styles.indexOf(".gp-shared-cta-shell > p:not(.gp-proof-label) {"),
      styles.indexOf(".gp-shared-cta-actions {"),
    );

    expect(sharedCtaBlock).toContain(".gp-shared-cta-shell > p:not(.gp-proof-label) {");
    expect(sharedCtaBlock).not.toContain(".gp-shared-cta-shell p {");
  });

  it("makes links inside link-card copy visibly identifiable", () => {
    const styles = readFile("./styles/global.css");

    expect(styles).toContain(".gp-link-card-copy a {");
    expect(styles).toContain("text-decoration: underline;");
    expect(styles).toContain("text-underline-offset:");
    expect(styles).toContain(".gp-link-card-copy a:hover");
  });

  it("uses an internal-navigation arrow for gp-link-row affordances", () => {
    const styles = readFile("./styles/global.css");

    expect(styles).toMatch(/\.gp-link-row::after\s*\{\s*content:\s*"→";\s*\}/u);
    expect(styles).not.toMatch(/\.gp-link-row::after\s*\{\s*content:\s*"↗";\s*\}/u);
  });

  it("routes audited page families through the GrantPipe OG resolver", () => {
    const guideSource = readFile("./pages/resources/guides/[slug].astro");
    const alternativeSource = readFile("./pages/compare/alternatives/[slug].astro");
    const pricingSource = readFile("./pages/compare/pricing/[slug].astro");
    const stateSource = readFile("./pages/nonprofit-software/[slug].astro");
    const solutionsSource = readFile("./pages/solutions/[slug].astro");

    for (const source of [
      guideSource,
      alternativeSource,
      pricingSource,
      stateSource,
      solutionsSource,
    ]) {
      expect(source).toContain('import { resolveGrantPipeOgImage } from "@/lib/og-image"');
      expect(source).toContain("ogImage={resolveGrantPipeOgImage(canonicalPath)}");
    }
  });

  it("shows published, reviewed, verified, and linked source labels in article metadata", () => {
    const articleMetaSource = readFile(
      "../../../packages/ui/src/site/components/article-meta.astro",
    );

    expect(articleMetaSource).toContain("Published:");
    expect(articleMetaSource).toContain("Reviewed:");
    expect(articleMetaSource).toContain("Verified:");
    expect(articleMetaSource).toContain("Sources:");
    expect(articleMetaSource).toContain("new URL(sourceUrl).hostname");
    expect(articleMetaSource).not.toContain("Sources: {sourceUrls.length}");
  });

  it("uses descriptive TOFU CTA text on editorial guide pages", () => {
    expect(siteConfig.funnel.tofu.ctaText).toBe("Explore GrantPipe resources");
    expect(siteConfig.funnel.tofu.ctaText).not.toBe("Learn More");
  });

  it("presents fund accounting as an included feature on the marketing surfaces", () => {
    const homepageSource = readFile("./pages/index.astro");
    const pricingSource = readFile("./pages/pricing.astro");
    const matrixSource = readFile("./components/feature-comparison-matrix.astro");
    const sharedPricing = readFile("../../../packages/shared/src/pricing.ts");

    expect(homepageSource).toContain("Compliance-first grant management system");
    expect(homepageSource).not.toContain(
      "compliance-first operating system for grant-funded nonprofits",
    );
    expect(homepageSource).toContain("FASB ASC 958");
    // Pricing surfaces fund accounting through the shared comparison matrix component.
    expect(pricingSource).toContain("FeatureComparisonMatrix");
    expect(matrixSource).toContain("MARKETED_FEATURE_CATALOG");
    // Catalog still markets fund-accounting capabilities (program allocation,
    // restriction lifecycle, restricted evidence, indirect cost rules, etc.).
    expect(sharedPricing).toContain("Fund accounting & program allocation");
    expect(sharedPricing).toContain("Functional expense allocation studio");
    expect(sharedPricing).toContain("Restriction lifecycle");
    expect(sharedPricing.toLowerCase()).not.toContain("fund accounting coming soon");
  });

  it("publishes an exact-match compliance-first grant management system guide", () => {
    const guideSource = readMarketingContent("guides/compliance-first-grant-management-system.md");

    expect(guideSource).toContain('targetKeyword: "compliance-first grant management system"');
    expect(guideSource).toContain('title: "Compliance-First Grant Management System"');
    expect(guideSource).toContain('schema: "Article"');
    expect(guideSource).toContain("GrantPipe is a compliance-first grant management system");
    expect(guideSource).toContain("definitions:");
    expect(guideSource).toContain("answers:");
    expect(guideSource).toContain("tableData:");
    expect(guideSource).toContain("sourceUrls:");
    expect(guideSource).toContain("https://www.ecfr.gov/current/title-2/section-200.302");
    expect(guideSource).toContain("https://www.ecfr.gov/current/title-2/section-200.303");
    expect(guideSource).toContain("/grant-compliance-software/");
    expect(guideSource).toContain("/resources/best/best-grant-management-software-for-compliance/");
    expect(guideSource).toContain("/resources/guides/audit-trail-requirements-for-grant-software/");
  });

  it("keeps the exact-match guide body from duplicating the template H1", () => {
    const guideSource = readMarketingContent("guides/compliance-first-grant-management-system.md");
    const bodySource = guideSource.replace(/^---[\s\S]*?---\s*/, "");

    expect(bodySource).not.toMatch(/^#\s+/m);
  });

  it("promotes the exact-match guide from AI-readable and category surfaces", () => {
    const llmsSource = readFile("./pages/llms.txt.ts");
    const llmsFullSource = readFile("./pages/llms-full.txt.ts");
    const grantManagementSource = readFile("./pages/grant-management-software.astro");
    const complianceSource = readFile("./pages/grant-compliance-software.astro");
    const productSource = readFile("./pages/product.astro");
    const pricingSource = readFile("./pages/pricing.astro");
    const homepageSource = readFile("./pages/index.astro");
    const resourcesSource = readFile("./pages/resources/index.astro");
    const guidesHubSource = readFile("./pages/resources/guides/[...page].astro");

    for (const source of [llmsSource, llmsFullSource]) {
      expect(source).toContain("/resources/guides/compliance-first-grant-management-system/");
      expect(source).toContain("Compliance-first grant management system guide");
    }

    for (const source of [
      grantManagementSource,
      complianceSource,
      productSource,
      pricingSource,
      homepageSource,
      resourcesSource,
    ]) {
      expect(source).toContain("/resources/guides/compliance-first-grant-management-system/");
    }

    expect(homepageSource).toContain("compliance-first grant management system guide");
    expect(resourcesSource).toContain("Compliance-first grant management system");
    expect(guidesHubSource).toContain(
      "/resources/guides/compliance-first-grant-management-system/",
    );
    expect(guidesHubSource).toContain("compliance-first grant management system guide");
  });

  it("publishes redirect rules for restrictedbooks migration", () => {
    const redirectsSource = readFile("../public/_redirects");
    const grantFundedSolutionSource = readMarketingContent(
      "vertical-pages/grant-funded-nonprofits.md",
    );
    const fundAccountingGuideSource = readMarketingContent(
      "guides/restricted-fund-accounting-basics.md",
    );

    // Compare slug pages serve canonically — wildcard redirects were removed in 9f87f62
    // because they were collapsing slug-based comparison pages and destroying their SEO.
    expect(redirectsSource).not.toContain("/compare/alternatives/*");
    expect(redirectsSource).not.toContain("/compare/pricing/*");
    expect(redirectsSource).not.toContain("/compare/versus/*");
    expect(redirectsSource).toContain(
      "/resources/guides/how-to-track-restricted-funds https://grantpipe.com/resources/guides/restricted-fund-tracking-for-nonprofits/ 301",
    );
    expect(redirectsSource).toContain(
      "/resources/guides/what-is-fund-accounting https://grantpipe.com/resources/guides/restricted-fund-accounting-basics/ 301",
    );
    expect(redirectsSource).not.toContain(
      "/resources/guides/what-is-fund-accounting https://grantpipe.com/resources/guides/what-is-fund-accounting 301",
    );
    expect(redirectsSource).toContain(
      "/resources/guides/how-to-prepare-form-990 https://grantpipe.com/resources/guides/grant-compliance-101-for-nonprofits/ 301",
    );
    expect(redirectsSource).toContain(
      "/resources/guides/grant-funded-nonprofit-operating-system https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/ 301",
    );
    expect(redirectsSource).toContain(
      "/resources/guides/grant-funded-nonprofit-operating-system/ https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/ 301",
    );
    expect(redirectsSource).toContain(
      "/glossary/grant-funded-nonprofit-operating-system https://grantpipe.com/glossary/grant-compliance/ 301",
    );
    expect(redirectsSource).toContain(
      "/glossary/grant-funded-nonprofit-operating-system/ https://grantpipe.com/glossary/grant-compliance/ 301",
    );
    expect(redirectsSource).toContain(
      "/nonprofit-software/states/*/ https://grantpipe.com/nonprofit-software/:splat/ 301",
    );
    expect(redirectsSource).toContain(
      "/nonprofit-software/states/* https://grantpipe.com/nonprofit-software/:splat/ 301",
    );
    expect(redirectsSource).toContain(
      "/nonprofit-software/types/grant-funded-nonprofits https://grantpipe.com/solutions/grant-funded-nonprofits/ 301",
    );
    expect(grantFundedSolutionSource).toContain(
      'title: "Grant Management for Grant-Funded Nonprofits"',
    );
    expect(fundAccountingGuideSource).toContain(
      'title: "Restricted Fund Accounting Basics for Nonprofits"',
    );
  });

  it("keeps internal 301 redirect targets at final trailing-slash canonical URLs", () => {
    const redirectsSource = readFile("../public/_redirects");
    const redirectLines = redirectsSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    for (const line of redirectLines) {
      const [, target, status] = line.split(/\s+/);
      if (status !== "301" || !target?.startsWith("https://grantpipe.com/")) {
        continue;
      }

      expect(target, line).toMatch(/(?:\/|\.xml|\.txt)$/);
    }
  });

  it("normalizes legacy state redirect variants without a double-slash target", () => {
    const redirectsSource = readFile("../public/_redirects");

    expect(redirectsSource).toContain(
      "/nonprofit-software/states/*/ https://grantpipe.com/nonprofit-software/:splat/ 301",
    );
    expect(redirectsSource).toContain(
      "/nonprofit-software/states/* https://grantpipe.com/nonprofit-software/:splat/ 301",
    );
    expect(redirectsSource).not.toContain("https://grantpipe.com/nonprofit-software/:splat//");
  });
});
