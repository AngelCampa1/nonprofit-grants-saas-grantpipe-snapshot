import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readBottomCtaSource(relativePath: string): string {
  const source = readSource(relativePath);
  const start = source.indexOf("<section data-seo-bottom-cta");
  const end = source.indexOf("</section>", start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("editorial layout source regressions", () => {
  it("keeps public feedback out of base layout enhancements", () => {
    const baseLayoutSource = readSource("./base-layout.astro");

    expect(baseLayoutSource).not.toContain("showFeedbackWidget");
    expect(baseLayoutSource).not.toContain("PublicFeedbackWidget");
    expect(baseLayoutSource).not.toContain("feedback/public");
    expect(baseLayoutSource).toContain("enableScrollReveal");
    expect(baseLayoutSource).toContain("{enableScrollReveal && (");
  });

  it("removes footer email capture from long-form editorial layouts", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    for (const source of [
      articleLayoutSource,
      comparisonLayoutSource,
      contentLayoutSource,
      listicleLayoutSource,
      pricingLayoutSource,
    ]) {
      expect(source).toContain("enableScrollReveal={false}");
      expect(source).toContain('captureVariant="none"');
    }
  });

  it("allows editorial layouts to pass explicit seoTitle and seoDescription values", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    for (const source of [
      articleLayoutSource,
      comparisonLayoutSource,
      contentLayoutSource,
      listicleLayoutSource,
      pricingLayoutSource,
    ]) {
      expect(source).toContain("seoTitle?: string");
      expect(source).toContain("seoDescription?: string");
      expect(source).toContain("title={seoTitle ??");
      expect(source).toContain("description={seoDescription ?? description}");
    }
  });

  it("uses darker shared label treatments for TOC and footer scan text", () => {
    const tocSource = readSource("../components/table-of-contents.astro");
    const footerSource = readSource("../components/site-footer.astro");

    expect(tocSource).toContain('const { headings, label = "On this page" } = Astro.props');
    expect(tocSource).toContain("text-brand-primary");
    expect(tocSource).not.toContain("font-mono");
    expect(tocSource).not.toContain("uppercase");
    expect(footerSource).toContain("text-accent-800");
    expect(footerSource).toContain("text-neutral-800");
  });

  it("flattens repeated blur-heavy shared chrome surfaces", () => {
    const headerSource = readSource("../components/site-header.astro");
    const stickyMobileCtaSource = readSource("../components/sticky-mobile-cta.astro");

    expect(headerSource).not.toContain("backdrop-blur-sm");
    expect(headerSource).not.toContain("backdrop-blur-xl");
    expect(headerSource).not.toContain("backdrop-filter: blur(10px)");
    expect(stickyMobileCtaSource).not.toContain("backdrop-blur-lg");
  });

  it("uses a button-driven mobile nav instead of summary/details chrome", () => {
    const headerSource = readSource("../components/site-header.astro");

    expect(headerSource).toContain("data-mobile-nav-trigger");
    expect(headerSource).toContain("data-mobile-nav-overlay");
    expect(headerSource).toContain('data-mobile-nav-ready="true"');
    expect(headerSource).toContain('[data-mobile-nav-ready="true"] .mobile-nav-trigger');
    expect(headerSource).not.toContain("<summary");
    expect(headerSource).not.toContain("</summary>");
  });

  it("supports stacked comparison cells for editorial tables on small screens", () => {
    const comparisonTableSource = readSource("../components/comparison-table.astro");

    expect(comparisonTableSource).toContain("data-column-label={headers[i + 1]}");
    expect(comparisonTableSource).toContain("@media (max-width: 40rem)");
  });

  it("keeps editorial rails slimmer and tied to deliberate sidebar panels", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const tocSource = readSource("../components/table-of-contents.astro");
    const sidebarCtaSource = readSource("../components/sidebar-cta.astro");
    const sharedStyles = readSource("../styles/globals.css");

    expect(articleLayoutSource).toContain("lg:grid-cols-[minmax(0,1fr)_280px]");
    expect(articleLayoutSource).toContain("data-editorial-rail");
    expect(tocSource).toContain("text-brand-primary");
    expect(sidebarCtaSource).toContain("data-sidebar-cta-panel");
    expect(sidebarCtaSource).toContain("editorial-panel editorial-panel--soft");
    expect(sidebarCtaSource).toContain("editorial-kicker");
    expect(sidebarCtaSource).not.toContain("rounded-[1.35rem]");
    expect(sharedStyles).toContain('body[data-site-name="GrantPipe"] [data-editorial-rail] {');
    expect(sharedStyles).not.toContain('body[data-site-name="GrantPipe"] [data-editorial-rail],');
  });

  it("gives the comparison-layout intro the same accent hairline as article-layout, under the H1", () => {
    const comparisonLayoutSource = readSource("./comparison-layout.astro");

    const h1Index = comparisonLayoutSource.indexOf("<h1");
    const hairlineIndex = comparisonLayoutSource.indexOf("gp-hairline--accent");
    const articleMetaIndex = comparisonLayoutSource.indexOf("<ArticleMeta");

    expect(h1Index).toBeGreaterThan(-1);
    expect(hairlineIndex).toBeGreaterThan(h1Index);
    expect(articleMetaIndex).toBeGreaterThan(hairlineIndex);
  });

  it("uses the gp-kicker--accent treatment (not editorial-kicker) for the comparison bottom CTA so it reads gold on the emerald panel", () => {
    const comparisonLayoutSource = readSource("./comparison-layout.astro");

    expect(comparisonLayoutSource).toContain("gp-kicker--accent");
    expect(comparisonLayoutSource).not.toContain("editorial-kicker");
  });

  it("does not forward static promoBanner config through shared site layouts", () => {
    const layoutSources = [
      readSource("./article-layout.astro"),
      readSource("./comparison-layout.astro"),
      readSource("./content-layout.astro"),
      readSource("./landing-layout.astro"),
      readSource("./listicle-layout.astro"),
      readSource("./pricing-breakdown-layout.astro"),
    ];

    for (const source of layoutSources) {
      expect(source).not.toContain("promoBanner={config.promoBanner}");
    }
  });

  it("keeps shared site buttons on the token-driven radius with full-pill convergence", () => {
    const sharedStyles = readSource("../styles/globals.css");

    // Button radius stays token-driven (site-overridable), and the tier system
    // now converges on the full-pill radius vocabulary (.btn-ghost is literal).
    expect(sharedStyles).toContain(
      "--primary-button-radius: var(--site-primary-button-radius, var(--radius-full));",
    );
    expect(sharedStyles).toContain(
      "--secondary-button-radius: var(--site-secondary-button-radius, var(--radius-full));",
    );
    expect(sharedStyles).toContain("border-radius: var(--secondary-button-radius);");
    expect(sharedStyles).toContain("border-radius: var(--radius-full);");
  });

  it("builds bottom editorial CTAs from the page buyer stage instead of forcing every page to bofu", () => {
    const stagedLayouts = [
      {
        path: "./article-layout.astro",
        pageFamily: "resource-article",
      },
      {
        path: "./comparison-layout.astro",
        pageFamily: "comparison",
      },
      {
        path: "./listicle-layout.astro",
        pageFamily: "resource-listicle",
      },
      {
        path: "./pricing-breakdown-layout.astro",
        pageFamily: "pricing-breakdown",
      },
    ];

    for (const { path, pageFamily } of stagedLayouts) {
      const source = readSource(path);
      const bottomCtaSource = readBottomCtaSource(path);

      expect(source).toContain("buildBottomCtaProps");
      expect(source).toContain(
        `buildBottomCtaProps(config, buyerStage ?? "bofu", "${pageFamily}")`,
      );
      expect(bottomCtaSource).toContain("bottomCtaProps.primaryCta.target");
      expect(bottomCtaSource).not.toContain("config.funnel.bofu.ctaTarget");
      expect(bottomCtaSource).not.toContain("config.funnel.bofu.ctaText");
    }
  });

  it("lets listicle pages render a non-BOFU lead magnet in the sidebar", () => {
    const listicleLayoutSource = readSource("./listicle-layout.astro");

    expect(listicleLayoutSource).toContain("sidebarLeadMagnet?: LeadMagnetOffer");
    expect(listicleLayoutSource).toContain(
      'const showLeadMagnetInSidebar = !!sidebarLeadMagnet && buyerStage !== "bofu"',
    );
    expect(listicleLayoutSource).toContain(
      "const sidebarCtaProps = !showLeadMagnetInSidebar && buyerStage",
    );
    expect(listicleLayoutSource).toContain('data-section="sidebar-lead-magnet"');
    expect(listicleLayoutSource).toContain('data-cta-placement="sidebar-lead-magnet"');
    expect(listicleLayoutSource).toContain("href={`/free/${sidebarLeadMagnet.slug}/`}");
  });
});
