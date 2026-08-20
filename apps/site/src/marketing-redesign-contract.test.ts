import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { grantCategoryPages } from "./config/grant-recipient-seo";

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("marketing redesign handoff contracts", () => {
  const osPositioningPagePaths = [
    "./pages/index.astro",
    "./pages/pricing.astro",
    "./pages/compare/index.astro",
    ...grantCategoryPages.map((page) => `./pages/${page.slug}.astro`),
    "./pages/about.astro",
    "./pages/books.astro",
  ];
  const publicMachineReadablePaths = [
    "../public/AGENTS.md",
    "../../../docs/apollo/templates/os-pitch.md",
    "../../../docs/manual/os-positioning-offsite-checklist.md",
  ];

  it("keeps hand-authored public pages on plan-safe OS positioning", () => {
    const scopedSources = osPositioningPagePaths.map((path) => readSource(path));
    const combinedSource = scopedSources.join("\n");
    const bannedPhrases = [
      ["one", "operating system"].join(" "),
      ["same", "operating system"].join(" "),
      ["audit-ready", "reporting"].join(" "),
      ["no consultants", "required"].join(" "),
      ["30-day", "trial"].join(" "),
    ];

    expect(readSource("./pages/index.astro")).toContain("Compliance-first grant management system");
    expect(readSource("./pages/grant-management-software.astro")).toContain(
      "grant management software built for compliance",
    );
    expect(combinedSource).toContain("spans eight modules");
    expect(combinedSource).toContain("what each plan includes");
    expect(combinedSource.toLowerCase()).not.toContain("plan entitlements");
    expect(combinedSource.toLowerCase()).not.toContain("entitlement rules");
    expect(combinedSource).not.toMatch(/compliance-first operating system/i);
    expect(combinedSource).not.toMatch(/operating system for grant-funded nonprofits/i);

    for (const phrase of bannedPhrases) {
      expect(combinedSource.toLowerCase()).not.toContain(phrase);
    }
  });

  it("keeps public machine-readable and outbound prep copy buyer-facing", () => {
    const combinedSource = publicMachineReadablePaths
      .map((path) => readSource(path))
      .join("\n")
      .toLowerCase();

    expect(combinedSource).toContain("what each plan includes");
    expect(combinedSource).not.toContain("plan entitlements");
    expect(combinedSource).not.toContain("entitlement rules");
    expect(combinedSource).not.toContain("exact feature access");
    expect(combinedSource).not.toContain("os modules");
    expect(combinedSource).not.toContain("operating system positioning");
    expect(combinedSource).not.toContain("compliance-first operating system");
    expect(combinedSource).not.toContain("operating system for grant-funded nonprofits");
    expect(combinedSource).not.toContain("sub-agent");
    expect(combinedSource).not.toContain("codex sessions");
  });

  it("rebuilds the homepage around the approved dashboard split hero and section order", () => {
    const homepage = readSource("./pages/index.astro");
    const normalizedHomepage = homepage.replace(/\s+/g, " ");
    const canonicalModuleOrder = [
      "Compliance calendar",
      "Evidence trail",
      "Restricted funds",
      "Grant pipeline",
      "Donor CRM",
      "Multi-source grant pipeline",
      "Fund accounting",
      "Auditor and funder portal",
    ];

    expect(homepage).toContain("BaseLayout");
    expect(homepage).toContain('data-marketing-page="home"');
    expect(homepage).toContain('data-hero-variant="split"');
    expect(homepage).not.toContain("data-persona-copy");
    expect(homepage).not.toContain("heroPersonas");
    expect(homepage).toContain("DashboardMock");
    expect(homepage).toContain("Compliance-first grant management system");
    expect(homepage).toContain(
      "Keep awards, restrictions, deadlines, and evidence ready for review.",
    );
    expect(homepage).toContain("GrantPipe helps nonprofits manage post-award grant work.");
    expect(normalizedHomepage).toContain("awards, restricted funds, and donor context");
    expect(homepage).toContain('data-section="fit"');
    expect(homepage).toContain('data-section="logo-strip"');
    expect(homepage).toContain("Designed around");
    let lastModuleIndex = -1;
    for (const moduleName of canonicalModuleOrder) {
      const moduleIndex = homepage.indexOf(`"${moduleName}"`);
      expect(moduleIndex).toBeGreaterThan(lastModuleIndex);
      lastModuleIndex = moduleIndex;
    }
    expect(homepage).toContain("GrantPipe spans compliance calendar work, evidence");
    expect(homepage).toContain("multi-source grant pipeline, fund accounting");
    expect(homepage).toContain("auditor and funder portal");
    expect(homepage.indexOf('title: "Compliance calendar"')).toBeLessThan(
      homepage.indexOf('title: "Evidence trail"'),
    );
    expect(homepage.indexOf('title: "Evidence trail"')).toBeLessThan(
      homepage.indexOf('title: "Restricted funds"'),
    );
    expect(homepage.indexOf('title: "Restricted funds"')).toBeLessThan(
      homepage.indexOf('title: "Pipeline"'),
    );
    expect(homepage).not.toContain('"Board-ready reports"');
    expect(homepage).not.toContain('"Books"');
    expect(homepage).not.toContain("Built for nonprofits like");
    expect(homepage).not.toContain("Community Clinic");
    expect(homepage).toContain('data-section="features"');
    expect(homepage).toContain('data-section="pricing"');
    expect(homepage).toContain('data-section="final-cta"');
    expect(homepage).toContain("FinalCta");
    expect(homepage).toContain("Bring your current tracker. See real grants in GrantPipe.");
    expect(homepage).toContain("finalCtaBody");
    expect(homepage).toContain("Start a 1-month free trial with the plan you choose.");
    expect(homepage).toContain("add billing only if GrantPipe fits");
    expect(homepage).toContain("marketingKnowledge.ctas.trial.label");
    expect(homepage).toContain("primaryHref={trialHref}");
    expect(homepage).toContain('secondaryHref="/product/"');
    expect(homepage).toContain("1-month free trial. No credit card.");
    expect(homepage).toContain("Use your current tracker during setup.");
    expect(homepage).toContain("Export anytime if you decide not to continue.");
    expect(homepage).toContain("Add billing only if GrantPipe fits.");
    expect(homepage).toContain("Start 1-month free trial");
    expect(homepage).toContain("See product walkthrough");
    expect(homepage).not.toContain("See whether GrantPipe can replace the spreadsheet chain.");
    expect(homepage).not.toContain("$48M");
    expect(homepage).not.toContain("9 hrs");
  });

  it("keeps about metadata and explainer script compliance-first", () => {
    const about = readSource("./pages/about.astro");
    const explainerScript = readSource("../../../media/explainer-video/script.txt");

    expect(about).toContain(
      "nonprofits need a compliance-first grant management system for awards, deadlines, restricted funds, donor records, evidence, reporting, and finance context.",
    );
    expect(about).toContain("GrantPipe is a compliance-first grant management system");
    expect(about).not.toContain("operating system for donors, grants");

    expect(explainerScript).toContain("GrantPipe is a compliance-first grant management system.");
    expect(explainerScript).toContain(
      "compliance deadlines, evidence, restricted funds, grant pipelines, donor records, federal search, fund accounting, and reviewer access",
    );
    expect(explainerScript).not.toContain(
      "GrantPipe is the operating system for grant-funded nonprofits.",
    );
  });

  it("renders pricing from the approved three-plan handoff with Enterprise as a custom path", async () => {
    const pricing = readSource("./pages/pricing.astro");
    const cards = readSource("./components/pricing-plan-cards.astro");
    const billingToggle = readSource("./components/billing-toggle.astro");
    const { getSelfServePlans, getPlanDisplayPrice } =
      await import("../../../packages/shared/src/pricing");

    expect(pricing).toContain('data-marketing-page="pricing"');
    expect(pricing).toContain("BillingToggle");
    expect(pricing).toContain("PricingPlanCards");
    expect(pricing).toContain('data-section="plan-comparison-matrix"');
    expect(pricing).toContain("Pricing FAQ");
    expect(pricing).toContain("FinalCta");
    expect(pricing).toContain("Bring your tracker. Walk out with a working pipeline.");
    expect(pricing).toContain(
      "Start a 1-month free trial. Use the import flow to bring in a small tracker slice",
    );
    expect(pricing).toContain("no credit card, no setup fees.");
    expect(pricing).toContain("Compare alternatives");
    expect(pricing).toContain("primaryHref={trialHref}");
    expect(pricing).toContain('secondaryHref="/compare/"');
    expect(pricing).toContain("1-month free trial. No credit card.");
    expect(pricing).toContain("Cancel anytime. Export your data.");
    expect(pricing).toContain("Start 1-month free trial");
    expect(billingToggle).not.toContain("resolvePromoForCycle");
    expect(billingToggle).not.toContain("activePromo");
    expect(cards).toContain("Recommended for active grant teams");
    expect(cards).toContain("Choose this if");

    for (const plan of getSelfServePlans()) {
      expect(plan.name.length).toBeGreaterThan(0);
    }
    const planNames = getSelfServePlans().map((p) => p.name);
    expect(planNames).toEqual(["Starter", "Growth", "Audit-Ready"]);
    expect(cards).toContain("Need a custom path?");
    expect(cards).toContain("Contact founder");
    expect(cards).not.toContain("data-testid={`pricing-cta-enterprise`}");
    for (const tier of ["starter", "growth", "audit_ready"] as const) {
      expect(getPlanDisplayPrice(tier, "monthly")).toMatch(/^\$[\d,]+\/mo$/);
      expect(getPlanDisplayPrice(tier, "annual")).toMatch(/^\$[\d,]+\/mo billed annually$/);
    }
  });

  it("renders resources and compare pages with the approved hub section markers", () => {
    const resources = readSource("./pages/resources/index.astro");
    const compare = readSource("./pages/compare/index.astro");

    expect(resources).toContain('data-marketing-page="resources"');
    expect(resources).toContain('data-section="resource-paths"');
    expect(resources).toContain("buildResourceHubSummaries");
    expect(resources).toContain('data-section="featured-resources"');
    expect(resources).toContain('data-section="resource-grid"');
    expect(resources).toContain('data-section="templates-strip"');
    expect(resources).toContain('data-section="newsletter"');
    expect(resources).toContain("GUIDE");
    expect(resources).toContain("NOTE");
    expect(resources).toContain("TMPL");
    expect(resources).toContain("VIDEO");
    expect(resources).toContain("Free templates");
    expect(resources).toContain("<h2>One email a month. Real practice, no fluff.</h2>");
    expect(resources).toContain("What I'm learning while building GrantPipe");
    expect(resources).toContain("Unsubscribe anytime.");
    expect(resources).toContain('placeholder="you@nonprofit.org"');
    expect(resources).toContain('class="gp-newsletter-form"');
    expect(resources).toContain("EmailCapture");
    expect(resources).toContain("getPublicApiBaseUrl");
    expect(resources).toContain('sourcePage="/resources/"');
    expect(resources).toContain("resourceHubSummaries");
    expect(resources).toContain("resourceHubByHref");
    expect(resources).toContain("See this path");
    expect(resources).toContain("href={`/free/${getLeadMagnetEntrySlug(entry)}/`}");
    expect(resources).not.toContain('href: "/resources/topics"');
    expect(resources).not.toContain("href={`/free/${getLeadMagnetEntrySlug(entry)}`}");
    expect(resources).not.toContain("<form>");
    expect(resources).not.toContain("emoji");

    expect(compare).toContain('data-marketing-page="compare"');
    expect(compare).toContain('data-section="alternative-cards"');
    expect(compare).toContain('data-section="full-feature-matrix"');
    expect(compare).toContain('data-section="head-to-head"');
    expect(compare).toContain("Where GrantPipe fits");
    expect(compare).toContain("FinalCta");
    expect(compare).toContain("Not sure which side you're on?");
    expect(compare).toContain("Start with the trial if GrantPipe looks close.");
    expect(compare).toContain("See product walkthrough");
    expect(compare).toContain("primaryHref={signupHref}");
    expect(compare).toContain('secondaryHref="/product/#product-tour"');
    expect(compare).toContain("1-month free trial. No credit card.");
    expect(compare).toContain("Public pricing and plan coverage before you commit.");
  });

  it("keeps the final CTA component aligned to the approved handoff tokens", () => {
    const finalCta = readSource("./components/final-cta.astro");
    const sharedStyles = readSource("./styles/global.css");

    expect(finalCta).toContain('class="gp-final-cta"');
    expect(finalCta).toContain('class="gp-final-quick"');
    expect(finalCta).toContain("gp-final-check-icon");
    expect(finalCta).toContain("items.map");
    expect(finalCta).not.toMatch(/\u00e2/);

    expect(sharedStyles).toContain(".gp-final-cta {");
    expect(sharedStyles).toContain("background: var(--gp-paper-2);");
    expect(sharedStyles).toContain("border: 1px solid var(--gp-ink-100);");
    // Card radius unified onto the canonical --card-radius token (D8 fix);
    // .gp-final-cta no longer hard-codes a divergent 14px literal.
    expect(sharedStyles).toContain("border-radius: var(--card-radius, var(--radius-lg));");
    expect(sharedStyles).toContain("padding: 56px 48px;");
    expect(sharedStyles).toContain("grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);");
    expect(sharedStyles).toContain("@media (max-width: 880px)");
    expect(sharedStyles).toContain(".gp-newsletter,");
    expect(sharedStyles).toContain("grid-template-columns: 1fr;");
    expect(sharedStyles).toContain("padding: 36px 28px;");
  });

  it("applies the SEO template shell to shared editorial layouts", () => {
    const articleLayout = readSource("../../../packages/ui/src/site/layouts/article-layout.astro");
    const comparisonLayout = readSource(
      "../../../packages/ui/src/site/layouts/comparison-layout.astro",
    );
    const contentLayout = readSource("../../../packages/ui/src/site/layouts/content-layout.astro");
    const listicleLayout = readSource(
      "../../../packages/ui/src/site/layouts/listicle-layout.astro",
    );

    for (const layout of [articleLayout, comparisonLayout, contentLayout, listicleLayout]) {
      expect(layout).toContain("data-seo-template-shell");
      expect(layout).toContain("data-seo-sidebar-cta");
      expect(layout).toContain("data-seo-bottom-cta");
      expect(layout).toContain("SidebarCta");
      expect(layout).toContain("SchemaMarkup");
      expect(layout).toContain("BreadcrumbNav");
    }
  });
});
