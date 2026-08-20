import { existsSync, readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function countMarkdownFiles(relativePath: string): number {
  const root = new URL(relativePath, import.meta.url);
  const entries = readdirSync(root, { withFileTypes: true });

  return entries.reduce((count, entry) => {
    if (entry.isDirectory()) {
      return count + countMarkdownFiles(`${relativePath}${entry.name}/`);
    }

    return count + (entry.name.endsWith(".md") ? 1 : 0);
  }, 0);
}

describe("GrantPipe site template regressions", () => {
  it("includes a real free resources hub route for lead magnets", () => {
    expect(existsSync(new URL("./pages/free/[...page].astro", import.meta.url))).toBe(true);
  });

  it("does not render the retired promo banner on marketing pages", () => {
    const formerlyPromoPages = [
      readSource("./pages/index.astro"),
      readSource("./pages/pricing.astro"),
    ];
    const staticHeaderPages = [
      readSource("./pages/compare/index.astro"),
      readSource("./pages/compare/grantpipe-vs-bloomerang.astro"),
      readSource("./pages/compare/grantpipe-vs-submittable.astro"),
      readSource("./pages/resources/index.astro"),
      readSource("./pages/resources/videos.astro"),
    ];

    for (const source of formerlyPromoPages) {
      expect(source).not.toContain("activePromoBanner");
      expect(source).not.toContain("promoBanner={activePromoBanner}");
      expect(source).not.toContain("promoBanner={siteConfig.promoBanner}");
    }

    for (const source of staticHeaderPages) {
      expect(source).not.toContain("promoBanner={siteConfig.promoBanner}");
    }
  });

  it("keeps hub components and closing tags aligned", () => {
    const compareHub = readSource("./pages/compare/index.astro");
    const resourcesHub = readSource("./pages/resources/index.astro");
    const alternativesHub = readSource("./pages/compare/alternatives/[...page].astro");
    const versusHub = readSource("./pages/compare/versus/[...page].astro");
    const pricingHub = readSource("./pages/compare/pricing/[...page].astro");
    const bestHub = readSource("./pages/resources/best/[...page].astro");
    const guidesHub = readSource("./pages/resources/guides/[...page].astro");

    expect(compareHub).toContain("<BaseLayout");
    expect(compareHub).toContain("</BaseLayout>");
    expect(resourcesHub).toContain("<BaseLayout");
    expect(resourcesHub).toContain("</BaseLayout>");

    for (const template of [alternativesHub, versusHub, pricingHub, bestHub, guidesHub]) {
      expect(template).toContain("<CategoryHub");
      expect(template).toContain("</CategoryHub>");
      expect(template).not.toContain("</ContentHub>");
    }
  });

  it("keeps hub CTAs minimal", () => {
    const alternativesHub = readSource("./pages/compare/alternatives/[...page].astro");
    const versusHub = readSource("./pages/compare/versus/[...page].astro");
    const pricingHub = readSource("./pages/compare/pricing/[...page].astro");
    const bestHub = readSource("./pages/resources/best/[...page].astro");
    const guidesHub = readSource("./pages/resources/guides/[...page].astro");

    for (const template of [alternativesHub, versusHub, pricingHub, bestHub, guidesHub]) {
      expect(template).toContain("buttonText={siteConfig.funnel.bofu.ctaText}");
      expect(template).not.toContain("subtitle={siteConfig.copy?.emailCapture?.subtitle}");
      expect(template).not.toContain(
        "whatHappensNext={siteConfig.copy?.emailCapture?.whatHappensNext}",
      );
      expect(template).not.toContain(
        "qualifiedHeading={siteConfig.copy?.survey?.qualifiedHeading}",
      );
      expect(template).not.toContain("qualifiedBody={siteConfig.copy?.survey?.qualifiedBody}");
      expect(template).not.toContain(
        "qualifiedCtaText={siteConfig.copy?.survey?.qualifiedCtaText}",
      );
      expect(template).not.toContain(
        "unqualifiedCtaText={siteConfig.copy?.survey?.unqualifiedCtaText}",
      );
      expect(template).not.toContain(
        "unqualifiedCtaTarget={siteConfig.copy?.survey?.unqualifiedCtaTarget}",
      );
    }
  });

  it("keeps the guides hub on the editorial variant so it matches guide templates", () => {
    const guidesHub = readSource("./pages/resources/guides/[...page].astro");

    expect(guidesHub).toContain('variant="editorial"');
  });

  it("AGENTS.md directs AI crawlers to app signup, not the homepage pricing anchor", () => {
    const agents = readSource("../public/AGENTS.md");
    expect(agents).not.toContain("grantpipe.com/#pricing");
    expect(agents).toContain("app.grantpipe.com/app/signup");
  });

  it("site-header ctaHref has no dead /#signup default", () => {
    const siteHeader = readFileSync(
      new URL("../../../packages/ui/src/site/components/site-header.astro", import.meta.url),
      "utf8",
    );

    expect(siteHeader).not.toContain('ctaHref = "/#signup"');
  });

  it("landing-layout JSON-LD offer URLs use ctaTarget directly without siteUrl prefix", () => {
    const landingLayout = readFileSync(
      new URL("../../../packages/ui/src/site/layouts/landing-layout.astro", import.meta.url),
      "utf8",
    );

    expect(landingLayout).not.toMatch(/url:\s*`\$\{siteUrl\}\$\{.*ctaTarget.*\}`/);
    expect(landingLayout).toContain("url: config.funnel.bofu.ctaTarget");
  });

  it("uses siteConfig.contactEmail in legal pages instead of hardcoded mailto links", () => {
    const privacy = readSource("./pages/privacy.astro");
    const terms = readSource("./pages/terms.astro");

    for (const template of [privacy, terms]) {
      expect(template).toContain("siteConfig.contactEmail");
      expect(template).not.toContain("hello@grantpipe.com");
    }
  });

  it("has a 500.astro error page with the expected branded copy", () => {
    expect(existsSync(new URL("./pages/500.astro", import.meta.url))).toBe(true);

    const page500 = readSource("./pages/500.astro");
    expect(page500).toContain("Something went wrong");
    expect(page500).toContain("We hit an unexpected error");
    expect(page500).toContain("noindex={true}");
    expect(page500).toContain("theme={siteConfig.theme}");
    expect(page500).toContain("fonts={siteConfig.theme.fonts}");
    expect(page500).toContain("themeColor={siteConfig.theme.primary}");
    expect(page500).toContain('href="/"');
    expect(page500).toContain("Back to home");
  });

  it("renders utility pages on the configured site theme instead of base-layout defaults", () => {
    const page404 = readSource("./pages/404.astro");
    const page500 = readSource("./pages/500.astro");

    for (const template of [page404, page500]) {
      expect(template).toContain("theme={siteConfig.theme}");
      expect(template).toContain("fonts={siteConfig.theme.fonts}");
      expect(template).toContain("themeColor={siteConfig.theme.primary}");
      expect(template).toContain("logoLight={siteConfig.logo?.light}");
      expect(template).not.toContain(["logo", "Dark="].join(""));
    }
  });

  it("rebuilds the homepage around the clarity-first SaaS structure", () => {
    const homepage = readSource("./pages/index.astro");
    const pricingCards = readSource("./components/pricing-plan-cards.astro");

    expect(homepage).not.toContain("export const prerender = false");
    expect(homepage).toContain('data-marketing-page="home"');
    expect(homepage).toContain('data-hero-variant="split"');
    expect(homepage).toContain('data-section="logo-strip"');
    expect(homepage).toContain('data-section="features"');
    expect(homepage).toContain('data-section="pricing"');
    expect(homepage).toContain('data-section="final-cta"');
    expect(homepage).toContain("<DashboardMock />");
    expect(homepage).toContain('href="#product-tour"');
    expect(homepage).toContain("Watch the product tour");
    expect(homepage).toContain("Start 1-month free trial");
    expect(homepage).toContain("PricingPlanCards");
    expect(pricingCards).toContain("getPricingTierBindings");
    expect(homepage).not.toContain("md:py-22");
    expect(homepage).not.toContain("Editorial field guide");
    expect(homepage).not.toContain("A finance-safe operating model");
    expect(homepage).not.toContain("Review pricing");
    expect(homepage).not.toContain("Compare full pricing");
    expect(homepage).not.toContain("Create account for");
    expect(homepage).not.toContain("Open page");
  });

  it("keeps the homepage CRO path focused on free-trial starts", () => {
    const homepage = readSource("./pages/index.astro");
    const normalizedHomepage = homepage.replace(/\s+/g, " ");
    const dashboardMock = readSource("./components/dashboard-mock.astro");
    const styles = readSource("./styles/global.css");
    const heroHeadings = homepage.match(/<h1[\s>]/g) ?? [];
    const objectionSectionIndex = homepage.indexOf('data-section="objections"');
    const pricingSectionIndex = homepage.indexOf('data-section="pricing"');

    expect(heroHeadings).toHaveLength(1);
    expect(homepage).toContain(
      "Keep awards, restrictions, deadlines, and evidence ready for review.",
    );
    expect(homepage).toContain("Compliance-first grant management system");
    expect(normalizedHomepage).toContain("awards, restricted funds, and donor context");
    expect(homepage).not.toContain("grant management software for grant-funded nonprofits");
    expect(homepage).toContain("Start 1-month free trial");
    expect(homepage).toContain("href={trialHref}");
    expect(homepage).toContain("Watch product tour");
    expect(homepage).toContain('href="#product-tour"');
    expect(homepage).toContain("No credit card");
    expect(homepage).toContain("Unlimited users");
    expect(homepage).toContain("Use your tracker");
    expect(homepage).toContain("Export anytime");
    expect(homepage).not.toContain("data-persona-copy");
    expect(homepage).not.toContain("heroPersonas");
    expect(homepage).not.toContain("new URLSearchParams(window.location.search)");

    expect(homepage).toContain('data-section="fit"');
    expect(homepage).toContain("gp-fit-band");
    expect(styles).toContain(".gp-fit-band");
    expect(homepage).toContain("Built for mid-sized US nonprofits");
    expect(homepage).toContain("shared finance and development workflows");
    expect(homepage).toContain("Not for fundraising-only teams");

    expect(homepage).toContain('data-section="objections"');
    expect(homepage).toContain("gp-objection-grid");
    expect(styles).toContain(".gp-objection-grid");
    expect(objectionSectionIndex).toBeGreaterThan(-1);
    expect(pricingSectionIndex).toBeGreaterThan(-1);
    expect(objectionSectionIndex).toBeLessThan(pricingSectionIndex);
    expect(homepage).toContain("Can this replace spreadsheets?");
    expect(homepage).toContain("Do we need a Salesforce admin?");
    expect(homepage).toContain("What happens to our existing tracker?");
    expect(homepage).toContain("Can finance trust the restricted-fund model?");

    expect(homepage).toContain("Pricing is the next decision after the trial");
    expect(homepage).toContain("Bring your current tracker");
    expect(homepage).toContain("see real grants in the workspace during the trial");
    expect(homepage).toContain("Add billing only if GrantPipe fits");

    expect(dashboardMock).toContain("$125,000 award");
    expect(dashboardMock).toContain("SF-425 due Jun 20");
    expect(dashboardMock).toContain("$84,200 restricted");
    expect(dashboardMock).toContain("Evidence ready");
    expect(dashboardMock).not.toContain("<main");
    expect(dashboardMock).not.toContain("award amount");
    expect(styles).toContain(".gp-dashboard-list .stage-awarded");
  });

  it("rebuilds pricing around decision-stage plan comparison", () => {
    const pricing = readSource("./pages/pricing.astro");
    const pricingCards = readSource("./components/pricing-plan-cards.astro");
    const matrix = readSource("./components/feature-comparison-matrix.astro");

    expect(pricing).toContain("Compliance-first grant management system pricing.");
    expect(pricing).toContain("Pick your plan by grant load and proof needs");
    expect(pricing).toContain("/resources/guides/compliance-first-grant-management-system/");
    expect(pricing).toContain("getSelfServePlans()");
    expect(pricing).toContain("plan.pricingPageGuide");
    expect(pricing).toContain('data-section="pricing-objections"');

    expect(pricingCards).toContain("getPricingTierBindings");
    expect(pricingCards).toContain("Missing pricing tier binding");
    expect(pricingCards).toContain("const plan = binding.plan");
    expect(pricingCards).toContain("FOUNDER_CONTACT_EMAIL");
    expect(pricingCards).toContain("FOUNDER_LINKEDIN_URL");
    expect(pricingCards).toContain("Contact founder");
    expect(pricingCards).toContain("Need a custom path?");
    expect(pricingCards).not.toContain('tier.name === "Enterprise"');
    expect(pricingCards).toContain("gp-pricing-grid");
    expect(pricingCards).toContain("gp-plan-badge");
    expect(pricingCards).toContain("data-annual-href={annualHref}");
    expect(pricingCards).toContain("data-monthly-href={monthlyHref}");

    expect(matrix).toContain("MARKETED_FEATURE_CATALOG");

    expect(pricing).toContain('data-section="plan-comparison-matrix"');
    expect(pricing).toContain("data-billing-controller");
    expect(pricing).toContain("<BillingToggle");
    expect(pricing).not.toContain("limitedOfferCopy");
    expect(pricing).not.toContain("Start {tier.name} free trial (monthly)");
    expect(pricing).not.toContain("Start {tier.name} free trial (annual billing after trial)");
    expect(pricing).toContain("Pricing FAQ");
    expect(pricing).not.toContain("xl:grid-cols-3");
    expect(pricing).toContain("<BaseLayout");
    expect(pricing).toContain('data-marketing-page="pricing"');
    expect(pricing).not.toContain("Have a promo code?");
    expect(pricing).not.toContain("grantPipeTrialCopy");
  });

  it("adds a dedicated product overview page with anchor navigation and CTA analytics context", () => {
    const product = readSource("./pages/product.astro");

    expect(product).toContain("getProductAnchorLinks");
    expect(product).toContain("getMarketedCapabilities");
    expect(product).toContain("ProductProofSection");
    expect(product).toContain("id={capability.slug}");
    expect(product).toContain('data-section="page-nav"');
    expect(product).toContain('aria-label="How GrantPipe works sections"');
    expect(product).toContain('data-cta-placement="product-primary"');
    expect(product).toContain('data-cta-placement="product-secondary"');
    expect(product).toContain('data-cta-section="hero"');
    expect(product).toContain('data-cta-section="closing"');
    expect(product).toContain("See pricing and fit");
    expect(product).toContain("How GrantPipe works");
    expect(product).not.toContain("What this page is for");
    expect(product).not.toContain("Primary buying motion");
    expect(product).not.toContain("Support card");
    expect(product).not.toContain("Decision stage");
    expect(product).not.toContain("External auditor portal");
    expect(product).not.toContain("Multi-program allocation");
    expect(product).not.toContain("platform presets");
    expect(product).not.toContain("plan-fit rollout");
  });

  it("keeps the about page clear and builder-positioned", () => {
    const about = readSource("./pages/about.astro");

    expect(about).toContain("A founder's note");
    expect(about).toContain("solo-operated, bootstrapped business");
    expect(about).toContain("https://www.linkedin.com/in/angelcampa1/");
    expect(about).not.toContain("get burned");
    expect(about).not.toContain("six-figure rollouts");
    expect(about).not.toContain("$500K");
  });

  it("keeps pricing actionable on mobile and wires the full shared footer shell", () => {
    const pricing = readSource("./pages/pricing.astro");
    const pricingCards = readSource("./components/pricing-plan-cards.astro");

    expect(pricing).toContain("<BaseLayout");
    expect(pricing).toContain("data-billing-controller");
    expect(pricingCards).toContain("data-annual-href");
    expect(pricingCards).toContain("data-monthly-href");
  });

  it("frames homepage product visuals with the redesign dashboard mock", () => {
    const homepage = readSource("./pages/index.astro");

    expect(homepage).toContain("<DashboardMock />");
  });

  it("renders homepage product visuals instead of screenshot PNG assets", () => {
    const homepage = readSource("./pages/index.astro");
    const dashboardMock = readSource("./components/dashboard-mock.astro");

    expect(homepage).toContain('import DashboardMock from "@/components/dashboard-mock.astro"');
    expect(homepage).toContain("<DashboardMock />");
    expect(homepage).not.toContain("grantpipe-dashboard.png");
    expect(homepage).not.toContain("grantpipe-grants.png");
    expect(homepage).not.toContain("grantpipe-dashboard-mobile.png");
    expect(dashboardMock).not.toContain("<img");
    expect(dashboardMock).toContain("gp-dashboard-mock");
    expect(dashboardMock).toContain('role="img"');
  });

  it("keeps retired homepage screenshot assets available for separate cleanup decisions", () => {
    expect(existsSync(new URL("../public/grantpipe-dashboard.png", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../public/grantpipe-grants.png", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../public/grantpipe-dashboard-mobile.png", import.meta.url))).toBe(
      true,
    );
  });

  it("keeps generated homepage product visuals out of the keyboard order and concise for assistive tech", () => {
    const generatedProductStage = readSource("./components/generated-product-stage.astro");

    expect(generatedProductStage).toContain('role="img"');
    expect(generatedProductStage).toContain(
      'aria-label="Generated GrantPipe product visual showing operations dashboard, grant pipeline, and mobile check views"',
    );
    expect(generatedProductStage).toContain('aria-hidden="true"');
    expect(generatedProductStage).not.toContain("<button");
    expect(generatedProductStage).not.toContain("<a ");
    expect(generatedProductStage).not.toContain("<input");
    expect(generatedProductStage).not.toContain("<select");
    expect(generatedProductStage).not.toContain("<textarea");
    expect(generatedProductStage).not.toContain('tabindex="0"');
    expect(generatedProductStage).not.toContain("tabindex={0}");
  });

  it("keeps generated homepage product visuals responsive on narrow screens", () => {
    const styles = readSource("./styles/global.css");

    expect(styles).toContain("@media (max-width: 1023px)");
    expect(styles).toContain(".gp-stage-shell");
    expect(styles).toContain("grid-template-columns: 1fr;");
    expect(styles).toContain("@media (max-width: 767px)");
    expect(styles).toContain(".gp-generated-metrics,");
    expect(styles).toContain(".gp-generated-dashboard-grid");
    expect(styles).toContain("grid-template-columns: 1fr 1fr;");
    expect(styles).toContain("table-layout: fixed;");
    expect(styles).toContain("overflow-wrap: break-word;");
  });

  it("upgrades state and solution templates away from generic neutral callout sections", () => {
    const statePage = readSource("./pages/nonprofit-software/[slug].astro");
    const solutionPage = readSource("./pages/solutions/[slug].astro");

    expect(statePage).toContain("editorial-panel");
    expect(solutionPage).toContain("editorial-panel");
    expect(statePage).toContain("data-reading-frame");
    expect(solutionPage).toContain("data-reading-frame");
    expect(statePage).toContain(
      '<caption class="sr-only">Top {state} markets by nonprofit count</caption>',
    );
    expect(statePage).toContain(
      '<caption class="sr-only">Top {state} metros by nonprofit count</caption>',
    );
    expect(statePage).toContain('scope="col"');
    expect(statePage).toContain("overflow-x-auto");
    expect(statePage).not.toContain("rounded-lg border border-neutral-200 bg-neutral-50");
    expect(solutionPage).not.toContain("rounded-lg border border-neutral-200 bg-neutral-50");
  });

  it("upgrades hubs and editorial templates with stronger navigation rails and calmer CTA motion", () => {
    const compareHub = readSource("./pages/compare/index.astro");
    const resourcesHub = readSource("./pages/resources/index.astro");
    const topicsHub = readSource("./pages/resources/topics/index.astro");
    const solutionsHub = readSource("./pages/solutions/index.astro");
    const stateHub = readSource("./pages/nonprofit-software/index.astro");
    const funnelCta = readFileSync(
      new URL("../../../packages/ui/src/site/components/funnel-cta.astro", import.meta.url),
      "utf8",
    );
    const articleLayout = readFileSync(
      new URL("../../../packages/ui/src/site/layouts/article-layout.astro", import.meta.url),
      "utf8",
    );

    expect(compareHub).toContain('data-section="alternative-cards"');
    expect(resourcesHub).toContain('data-section="resource-paths"');
    expect(resourcesHub).toContain("buildResourceHubSummaries");
    expect(topicsHub).toContain("data-hub-command-bar");
    expect(topicsHub).toContain('data-cta-page-family="topics"');
    expect(solutionsHub).toContain('data-cta-page-family="solutions"');
    expect(stateHub).toContain('data-cta-page-family="nonprofit-software"');
    expect(topicsHub).toContain('data-cta-intent="evaluate"');
    expect(solutionsHub).toContain('data-cta-intent="evaluate"');
    expect(stateHub).toContain('data-cta-intent="evaluate"');
    expect(compareHub).not.toContain("gp-compact-cta");
    expect(resourcesHub).not.toContain("gp-compact-cta");
    expect(topicsHub).not.toContain("gp-compact-cta");
    expect(compareHub).toContain("<BaseLayout");
    expect(resourcesHub).toContain("<BaseLayout");
    expect(topicsHub).toContain("editorial-panel");
    expect(compareHub).toContain("Compare pricing");
    expect(resourcesHub).toContain('data-section="newsletter"');
    expect(topicsHub).toContain("See the product walkthrough");
    expect(articleLayout).toContain("data-editorial-rail");
    expect(articleLayout).toContain("data-reading-frame");
    expect(funnelCta).toContain('data-cta-motion="settled"');
    expect(funnelCta).not.toContain("btn-primary--pulse");
    expect(funnelCta).not.toContain("btn-shimmer");
  });

  it("builds resource article and listicle bottom CTAs from buyer stage without replacing lead magnets", () => {
    const articleLayout = readFileSync(
      new URL("../../../packages/ui/src/site/layouts/article-layout.astro", import.meta.url),
      "utf8",
    );
    const listicleLayout = readFileSync(
      new URL("../../../packages/ui/src/site/layouts/listicle-layout.astro", import.meta.url),
      "utf8",
    );
    const guideTemplate = readSource("./pages/resources/guides/[slug].astro");
    const listicleTemplate = readSource("./pages/resources/best/[slug].astro");

    expect(articleLayout).toContain("buildBottomCtaProps");
    expect(articleLayout).toContain('"resource-article"');
    expect(articleLayout).toContain("bottomCtaProps.primaryCta.target");
    expect(articleLayout).toContain("bottomCtaProps.secondaryAnalytics.intent");
    expect(listicleLayout).toContain("buildBottomCtaProps");
    expect(listicleLayout).toContain('"resource-listicle"');
    expect(listicleLayout).toContain("bottomCtaProps.primaryCta.target");
    expect(listicleLayout).toContain("bottomCtaProps.secondaryAnalytics.intent");
    expect(guideTemplate).toContain("<LeadMagnetSignup");
    expect(listicleTemplate).toContain("<LeadMagnetSignup");
    expect(guideTemplate).toContain("trialCtaHref={siteConfig.funnel.bofu.ctaTarget}");
    expect(listicleTemplate).toContain("trialCtaHref={siteConfig.funnel.bofu.ctaTarget}");
  });

  it("makes GrantPipe listicle placement explicit without fake proof", () => {
    const listicleTemplate = readSource("./pages/resources/best/[slug].astro");

    expect(listicleTemplate).toContain("GrantPipe fit");
    expect(listicleTemplate).toContain("Built for grant-funded nonprofits");
    expect(listicleTemplate).not.toMatch(/best overall/i);
    expect(listicleTemplate).not.toContain("customers trust");
    expect(listicleTemplate).not.toContain("used by thousands");
  });

  it("keeps the compare hub wired to the real comparison library", () => {
    const compareHub = readSource("./pages/compare/index.astro");

    const alternativeCount = countMarkdownFiles(
      "../../../packages/shared/src/knowledge/marketing/content/alternatives/",
    );
    const comparisonCount = countMarkdownFiles(
      "../../../packages/shared/src/knowledge/marketing/content/comparisons/",
    );
    const pricingBreakdownCount = countMarkdownFiles(
      "../../../packages/shared/src/knowledge/marketing/content/pricing-breakdowns/",
    );

    expect(alternativeCount).toBeGreaterThan(0);
    expect(comparisonCount).toBeGreaterThan(0);
    expect(pricingBreakdownCount).toBeGreaterThan(0);

    expect(compareHub).toContain("buildCompareHubModel(");
    expect(compareHub).toContain('getCollection("alternatives")');
    expect(compareHub).toContain('getCollection("comparisons")');
    expect(compareHub).toContain('getCollection("pricing-breakdowns")');
    expect(compareHub).toContain('getCollection("listicles")');
    expect(compareHub).toContain("data-compare-family-grid");
    expect(compareHub).toContain("data-compare-topic-grid");
    expect(compareHub).toContain("data-compare-stage-grid");
    expect(compareHub).toContain("{card.totalCount} pages");
    expect(compareHub).not.toContain('from "node:fs"');
    expect(compareHub).not.toContain("0 pages");
    expect(compareHub).not.toContain("Generic work management");
    expect(compareHub).not.toContain("Consultant-led builds");
  });

  it("positions the compare hub around SEO browsing and trial evaluation", () => {
    const compareHub = readSource("./pages/compare/index.astro");

    expect(compareHub).toContain("<BaseLayout");
    expect(compareHub).toContain("canonicalUrl={canonicalUrl}");
    expect(compareHub).toContain('data-marketing-page="compare"');
    expect(compareHub).toContain('data-section="alternative-cards"');
    expect(compareHub).toContain('data-section="start-here"');
    expect(compareHub).toContain('data-section="evaluation-cta"');
    expect(compareHub).toContain('data-section="final-cta"');
    expect(compareHub).toContain('class="gp-seo-bottom-cta gp-compare-evaluation-cta"');
    expect(compareHub).toContain('class="gp-path-matrix"');
    expect(compareHub).not.toContain('class="gp-matrix" role="table"');
    expect(compareHub).toContain("Compare nonprofit software paths");
    expect(compareHub).toContain("Start 1-month free trial");
    expect(compareHub).toContain("Compare pricing");
    expect(compareHub).toContain("See product walkthrough");
    expect(compareHub).toContain("replacing a donor CRM");
    expect(compareHub).toContain("comparing two named tools");
    expect(compareHub).toContain("validating pricing and total cost");
    expect(compareHub).toContain("checking whether GrantPipe fits");
    expect(compareHub).not.toContain("testimonials");
    expect(compareHub).not.toContain("user counts");
  });

  it("replaces compact CTA boxes on lead-magnet and category pages with the shared editorial shell", () => {
    const grantRecipientPage = readSource("./components/grant-recipient-category-page.astro");
    const topicPage = readSource("./pages/resources/topics/[slug].astro");

    for (const template of [grantRecipientPage, topicPage]) {
      expect(template).toContain("editorial-panel");
      expect(template).not.toContain("gp-compact-cta");
    }
  });

  it("keeps the GrantPipe landing shell from layering a full-height right-side wash", () => {
    const landingLayout = readFileSync(
      new URL("../../../packages/ui/src/site/layouts/landing-layout.astro", import.meta.url),
      "utf8",
    );

    expect(landingLayout).not.toContain("absolute inset-y-0 right-[-8rem]");
    expect(landingLayout).not.toContain("w-[22rem]");
    expect(landingLayout).not.toContain(
      "color-mix(in_srgb,var(--color-accent-100)_38%,transparent)",
    );
  });

  it("removes the GrantPipe reading-frame pseudo-line from shared site styles", () => {
    const sharedStyles = readFileSync(
      new URL("../../../packages/ui/src/site/styles/globals.css", import.meta.url),
      "utf8",
    );

    expect(sharedStyles).toContain('body[data-site-name="GrantPipe"] [data-reading-frame] {');
    expect(sharedStyles).not.toContain(
      'body[data-site-name="GrantPipe"] [data-reading-frame]::before',
    );
  });

  it("keeps the logo wordmark on loaded site fonts instead of the retired Sora family", () => {
    const lightLogo = readSource("../public/logo-light.svg");

    expect(lightLogo).toContain("data-logo-mark");
    expect(lightLogo).toContain("data-ledger-row");
    expect(lightLogo).toContain("GrantPipe");
    expect(lightLogo).not.toContain("M5.6 11 L30.4 11");
    expect(lightLogo).not.toContain("Sora");
    expect(lightLogo).not.toContain("<text");
    expect(lightLogo).not.toContain("font-family");
  });
});
