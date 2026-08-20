import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-contract test for apps/site/src/pages/features/[slug].astro.
// Astro dynamic-route pages are not unit-rendered in this repo (see the sibling
// feature-pages-entitlement-contract.test.ts, which also asserts against source).
// This locks in the CRO branch behaviour: bofu feature pages with a convert
// intent must render the trial CTA (not the top-funnel lead-magnet download),
// and that primary trial CTA must carry the cta_clicked analytics attributes.

const featurePageSource = readFileSync(
  join(__dirname, "pages", "features", "[slug].astro"),
  "utf8",
);
const astroConfigSource = readFileSync(join(__dirname, "..", "astro.config.mjs"), "utf8");

describe("feature page CTA contract", () => {
  it("derives the trial-vs-lead-magnet branch from frontmatter primaryCta/ctaMode", () => {
    expect(featurePageSource).toMatch(
      /isTrialCta\s*=\s*primaryCta === "trial" \|\| ctaMode === "convert"/,
    );
  });

  it("renders the trial CTA block and falls back to LeadMagnetSignup", () => {
    expect(featurePageSource).toMatch(/\{isTrialCta \?/);
    expect(featurePageSource).toContain("data-feature-trial-cta");
    // The non-convert arm must still offer the lead-magnet download.
    expect(featurePageSource).toContain("<LeadMagnetSignup");
  });

  it("passes noindex frontmatter through to ArticleLayout", () => {
    expect(featurePageSource).toContain("noindex } = entry.data");
    expect(featurePageSource).toContain("noindex={noindex}");
  });

  it("excludes planned noindex feature pages from the sitemap", () => {
    expect(astroConfigSource).toContain('"/features/multi-entity-consolidation/"');
  });

  it("tracks the primary trial CTA with cta_clicked analytics attributes", () => {
    const trialBlock = featurePageSource.slice(
      featurePageSource.indexOf("data-feature-trial-cta"),
      featurePageSource.indexOf("See plans and pricing"),
    );
    expect(trialBlock).toContain('data-cta-button=""');
    expect(trialBlock).toContain('data-cta-page-family="feature-landing-page"');
    expect(trialBlock).toContain('data-cta-placement="feature-bottom-primary"');
    expect(trialBlock).toContain('data-cta-intent="convert"');
    expect(trialBlock).toContain("data-cta-target={siteConfig.funnel.bofu.ctaTarget}");
  });
});
