import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readPage(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("resource hub index page source regressions", () => {
  it("resources page leads with decision-stage trial language and keeps email secondary", () => {
    const source = readPage("./pages/resources/index.astro");

    expect(source).toMatch(/what is funded, restricted, due,\s+and ready for review/);
    expect(source).toContain("Grant compliance");
    expect(source).toContain("Restricted funds");
    expect(source).toContain("CRM replacement");
    expect(source).toContain("Software comparison");
    expect(source).toContain("Templates");
    expect(source).toContain("Start 1-month free trial");
    expect(source).toContain("See pricing and fit");
    expect(source).toContain('data-section="newsletter"');
    expect(source.indexOf("Start 1-month free trial")).toBeLessThan(
      source.indexOf('data-section="newsletter"'),
    );
  });

  it("category hub pages add decision-path intros and product-led CTAs", () => {
    const hubPages = [
      "./pages/resources/guides/[...page].astro",
      "./pages/resources/best/[...page].astro",
      "./pages/resources/reference.astro",
      "./pages/resources/faq/index.astro",
      "./pages/resources/benchmarks/index.astro",
    ];

    for (const page of hubPages) {
      const source = readPage(page);

      expect(source).toContain('slot="intro"');
      expect(source).toContain("gp-resource-decision-panel");
      expect(source).toMatch(/Start a? 1-month free trial/);
      expect(source).toMatch(/href="\/(product|pricing)\/"/);
      expect(source).not.toContain("customers trust");
      expect(source).not.toContain("used by thousands");
      expect(source).not.toContain("proven by nonprofits");
    }
  });

  it("topic hubs keep trial as primary and product walkthrough as secondary", () => {
    const indexSource = readPage("./pages/resources/topics/index.astro");
    const detailSource = readPage("./pages/resources/topics/[slug].astro");

    for (const source of [indexSource, detailSource]) {
      expect(source).toMatch(/Start a? 1-month free trial/);
      expect(source).toContain("See the product walkthrough");
      expect(source).toContain('data-cta-intent="convert"');
      expect(source).toContain('data-cta-intent="evaluate"');
      expect(source).not.toContain("customers trust");
      expect(source).not.toContain("used by thousands");
    }
  });

  it("topic detail pages pass current path context to the shared header", () => {
    const source = readPage("./pages/resources/topics/[slug].astro");

    expect(source).toContain("currentPath={Astro.url.pathname}");
  });

  it("benchmarks index page wires the benchmarks hub key and correct meta", () => {
    const source = readPage("./pages/resources/benchmarks/index.astro");

    expect(source).toContain("buildResourceHubItems(");
    expect(source).toContain('.get("/resources/benchmarks")');
    expect(source).toContain('title="Benchmarks"');
    expect(source).toContain('basePath="/resources/benchmarks"');
    expect(source).toContain('{ label: "Benchmarks", href: "/resources/benchmarks" }');
    expect(source).toContain('variant="editorial"');
  });

  it("faq index page wires the faq hub key and correct meta", () => {
    const source = readPage("./pages/resources/faq/index.astro");

    expect(source).toContain("buildResourceHubItems(");
    expect(source).toContain('.get("/resources/faq")');
    expect(source).toContain('title="FAQ Hubs"');
    expect(source).toContain('basePath="/resources/faq"');
    expect(source).toContain('{ label: "FAQ Hubs", href: "/resources/faq" }');
    expect(source).toContain('variant="editorial"');
  });

  it("reference library page wires the reference hub key and correct meta", () => {
    const source = readPage("./pages/resources/reference.astro");

    expect(source).toContain("buildResourceHubItems(");
    expect(source).toContain('.get("/resources/reference")');
    expect(source).toContain('title="Reference Library"');
    expect(source).toContain('basePath="/resources/reference"');
    expect(source).toContain('{ label: "Reference Library", href: "/resources/reference" }');
    expect(source).toContain('variant="editorial"');
  });

  it("reference library renders grouped paths instead of one flat list", () => {
    const source = readPage("./pages/resources/reference.astro");

    expect(source).toContain("referenceSections");
    expect(source).toContain("renderListing={false}");
    expect(source).toContain("data-reference-path-grid");
    expect(source).toContain('aria-label="Reference paths"');
    expect(source).toContain("FAQ hubs");
    expect(source).toContain("Glossary terms");
    expect(source).toContain("Benchmarks");
    expect(source).toContain("Feature pages");
    expect(source).toContain("Integrations");
  });

  it("glossary index renders real letter sections for the A-Z strip", () => {
    const source = readPage("./pages/glossary/index.astro");

    expect(source).toContain("glossarySections");
    expect(source).toContain("renderListing={false}");
    expect(source).toContain("data-glossary-letter-section");
    expect(source).toContain("id={`glossary-${section.letter.toLowerCase()}`}");
    expect(source).toContain("sort((a, b) => a.data.title.localeCompare(b.data.title))");
  });

  it("faq and benchmark hubs render grouped pathway sections instead of flat lists", () => {
    const componentSource = readPage("./components/site/pathway-sections.astro");

    expect(componentSource).toContain("data-pathway-section-grid");

    const hubPages = [
      {
        path: "./pages/resources/faq/index.astro",
        sections: "faqPathSections",
        label: 'ariaLabel="FAQ paths"',
      },
      {
        path: "./pages/resources/benchmarks/index.astro",
        sections: "benchmarkPathSections",
        label: 'ariaLabel="Benchmark paths"',
      },
    ];

    for (const hub of hubPages) {
      const source = readPage(hub.path);

      expect(source).toContain("PathwaySections");
      expect(source).toContain(hub.sections);
      expect(source).toContain(hub.label);
      expect(source).toContain("renderListing={false}");
    }
  });

  it("feature and integration hubs render grouped pathway sections instead of flat lists", () => {
    const helperSource = readPage("./lib/hub-path-sections.ts");

    expect(helperSource).toContain("buildPathwaySections");

    const hubPages = [
      {
        path: "./pages/features/index.astro",
        sections: "featurePathSections",
        label: 'ariaLabel="Feature paths"',
      },
      {
        path: "./pages/integrations/index.astro",
        sections: "integrationPathSections",
        label: 'ariaLabel="Integration paths"',
      },
    ];

    for (const hub of hubPages) {
      const source = readPage(hub.path);

      expect(source).toContain("PathwaySections");
      expect(source).toContain(hub.sections);
      expect(source).toContain(hub.label);
      expect(source).toContain("renderListing={false}");
    }
  });

  it("workflows index renders live workflow entries without placeholder copy", () => {
    const source = readPage("./pages/workflows/index.astro");

    expect(source).toContain('getCollection("workflows")');
    expect(source).toContain("buildWorkflowHubModel(");
    expect(source).toContain('basePath="/workflows"');
    expect(source).toContain("data-workflow-topic-grid");
    expect(source).toContain("data-workflow-stage-grid");
    expect(source).toContain('aria-label="Workflow topics"');
    expect(source).toContain('aria-label="Workflow stages"');
    expect(source).not.toContain("More content coming soon");
  });

  it("workflows index uses path sections and a product next step instead of one flat list", () => {
    const source = readPage("./pages/workflows/index.astro");

    expect(source).toContain("renderListing={false}");
    expect(source).toContain('slot="cta"');
    expect(source).toContain("data-workflow-next-step");
    expect(source).toContain('href="/product/"');
    expect(source).toMatch(/Start a? 1-month free trial/);
  });

  it("persona hub groups roles and gives a clear next step", () => {
    const source = readPage("./pages/for/index.astro");

    expect(source).toContain('slot="intro"');
    expect(source).toContain("personaRoleGroups");
    expect(source).toContain("renderListing={false}");
    expect(source).toContain("data-persona-role-grid");
    expect(source).toContain('aria-label="Role paths"');
    expect(source).toContain('slot="cta"');
    expect(source).toContain("data-persona-next-step");
    expect(source).toContain('href="/product/"');
    expect(source).toContain('href="/pricing/"');
    expect(source).toContain('"/for/executive-directors"');
    expect(source).toContain('"/for/development-directors"');
    expect(source).toContain('"/for/finance-operations-staff"');
  });

  it("guides index renders topic and funnel-stage navigation before the paginated list", () => {
    const source = readPage("./pages/resources/guides/[...page].astro");

    expect(source).toContain('getCollection("guides")');
    expect(source).toContain("buildGuideHubModel(");
    expect(source).toContain('basePath="/resources/guides"');
    expect(source).toContain("data-guide-topic-grid");
    expect(source).toContain("data-guide-stage-grid");
    expect(source).toContain('aria-label="Guide topics"');
    expect(source).toContain('aria-label="Guide stages"');
    expect(source).not.toContain("More content coming soon");
  });

  it("integrations index renders live integration entries without placeholder copy", () => {
    const source = readPage("./pages/integrations/index.astro");

    expect(source).toContain('getCollection("integrations")');
    expect(source).toContain("mapToContentItems(");
    expect(source).toContain('basePath="/integrations"');
    expect(source).not.toContain("More content coming soon");
  });

  it("software roundups index renders topic and funnel-stage navigation before the paginated list", () => {
    const source = readPage("./pages/resources/best/[...page].astro");

    expect(source).toContain('getCollection("listicles")');
    expect(source).toContain("buildListicleHubModel(");
    expect(source).toContain('basePath="/resources/best"');
    expect(source).toContain("data-listicle-topic-grid");
    expect(source).toContain("data-listicle-stage-grid");
    expect(source).toContain('aria-label="Software roundup topics"');
    expect(source).toContain('aria-label="Software roundup stages"');
    expect(source).not.toContain("More content coming soon");
  });

  it("free resources index renders live lead magnet entries without placeholder copy", () => {
    const source = readPage("./pages/free/[...page].astro");

    expect(source).toContain('getCollection("lead-magnets")');
    expect(source).toContain("buildFreeResourceHubModel(");
    expect(source).toContain('basePath="/free"');
    expect(source).toContain("data-free-topic-grid");
    expect(source).toContain("data-free-stage-grid");
    expect(source).toContain('aria-label="Free resource topics"');
    expect(source).toContain('aria-label="Free resource stages"');
    expect(source).not.toContain("More content coming soon");
  });

  it("nonprofit software index renders regional and metro navigation before the directory lists", () => {
    const source = readPage("./pages/nonprofit-software/index.astro");

    expect(source).toContain('getCollection("state-pages")');
    expect(source).toContain('getCollection("city-pages")');
    expect(source).toContain("buildNonprofitSoftwareHubModel(");
    expect(source).toContain("data-state-region-grid");
    expect(source).toContain("data-metro-highlight-grid");
    expect(source).toContain("data-city-state-directory");
    expect(source).toContain('aria-label="State regions"');
    expect(source).toContain('aria-label="Major metro guides"');
    expect(source).not.toContain("More content coming soon");
  });

  it("compare index renders family, topic, and funnel-stage navigation before decision CTAs", () => {
    const source = readPage("./pages/compare/index.astro");

    expect(source).toContain('getCollection("alternatives")');
    expect(source).toContain('getCollection("comparisons")');
    expect(source).toContain('getCollection("pricing-breakdowns")');
    expect(source).toContain('getCollection("listicles")');
    expect(source).toContain("buildCompareHubModel(");
    expect(source).toContain("data-compare-family-grid");
    expect(source).toContain("data-compare-topic-grid");
    expect(source).toContain("data-compare-stage-grid");
    expect(source).toContain('aria-label="Compare paths"');
    expect(source).toContain('aria-label="Compare topics"');
    expect(source).toContain('aria-label="Compare stages"');
    expect(source).not.toContain("More content coming soon");
  });

  it("compare child hubs render decision-path intros before the paginated lists", () => {
    const childHubs = [
      {
        path: "./pages/compare/alternatives/[...page].astro",
        builder: "buildCompareAlternativeHubModel(",
        grid: "data-compare-child-alternatives-grid",
        label: 'aria-label="Alternative paths"',
      },
      {
        path: "./pages/compare/versus/[...page].astro",
        builder: "buildCompareVersusHubModel(",
        grid: "data-compare-child-versus-grid",
        label: 'aria-label="Head-to-head paths"',
      },
      {
        path: "./pages/compare/pricing/[...page].astro",
        builder: "buildComparePricingHubModel(",
        grid: "data-compare-child-pricing-grid",
        label: 'aria-label="Pricing paths"',
      },
    ];

    for (const hub of childHubs) {
      const source = readPage(hub.path);

      expect(source).toContain('slot="intro"');
      expect(source).toContain(hub.builder);
      expect(source).toContain(hub.grid);
      expect(source).toContain(hub.label);
      expect(source).not.toContain("More content coming soon");
    }
  });

  it("compare child hubs use grouped path cards instead of flat paginated lists", () => {
    const childHubs = [
      "./pages/compare/alternatives/[...page].astro",
      "./pages/compare/versus/[...page].astro",
      "./pages/compare/pricing/[...page].astro",
    ];

    for (const page of childHubs) {
      const source = readPage(page);

      expect(source).toContain("renderListing={false}");
      expect(source).not.toContain("paginate(");
      expect(source).toContain("topicSummaries.map");
      expect(source).toContain("topic.overflowCount");
      expect(source).toContain("See topic path");
      expect(source).toContain("more");
    }
  });

  it("no CategoryHub caller page contains the legacy 'More content coming soon' placeholder", () => {
    const callerPages = [
      "./pages/workflows/index.astro",
      "./pages/resources/reference.astro",
      "./pages/resources/guides/[...page].astro",
      "./pages/resources/faq/index.astro",
      "./pages/resources/best/[...page].astro",
      "./pages/resources/benchmarks/index.astro",
      "./pages/integrations/index.astro",
      "./pages/glossary/index.astro",
      "./pages/free/[...page].astro",
      "./pages/for/index.astro",
      "./pages/features/index.astro",
      "./pages/compare/versus/[...page].astro",
      "./pages/compare/pricing/[...page].astro",
      "./pages/compare/alternatives/[...page].astro",
    ];

    for (const page of callerPages) {
      const source = readPage(page);
      expect(source, `${page} must not contain placeholder copy`).not.toContain(
        "More content coming soon",
      );
      expect(source, `${page} must not promise email follow-up via the hub`).not.toContain(
        "we'll let you know when we publish",
      );
    }
  });

  it("every CategoryHub caller explicitly passes emptyStateHeading and emptyStateBody", () => {
    const callerPages = [
      "./pages/workflows/index.astro",
      "./pages/resources/reference.astro",
      "./pages/resources/guides/[...page].astro",
      "./pages/resources/faq/index.astro",
      "./pages/resources/best/[...page].astro",
      "./pages/resources/benchmarks/index.astro",
      "./pages/integrations/index.astro",
      "./pages/glossary/index.astro",
      "./pages/free/[...page].astro",
      "./pages/for/index.astro",
      "./pages/features/index.astro",
      "./pages/compare/versus/[...page].astro",
      "./pages/compare/pricing/[...page].astro",
      "./pages/compare/alternatives/[...page].astro",
    ];

    for (const page of callerPages) {
      const source = readPage(page);
      expect(source, `${page} must pass emptyStateHeading explicitly`).toContain(
        "emptyStateHeading=",
      );
      expect(source, `${page} must pass emptyStateBody explicitly`).toContain("emptyStateBody=");
    }
  });

  it("reference library description matches the canonical hub definition", () => {
    const source = readPage("./pages/resources/reference.astro");
    const hubsSource = readPage("./lib/resource-hubs.ts");

    const descMatch = source.match(/description="([^"]+)"/);
    expect(descMatch).not.toBeNull();
    const pageDesc = descMatch![1]!;

    // The page description must appear verbatim in the hub definition so there is one source of truth.
    expect(hubsSource).toContain(pageDesc);
  });
});
