import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readTemplate(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("GrantPipe content entry funnel templates", () => {
  const guideTemplate = readTemplate("./pages/resources/guides/[slug].astro");
  const listicleTemplate = readTemplate("./pages/resources/best/[slug].astro");
  const stateTemplate = readTemplate("./pages/nonprofit-software/[slug].astro");
  const solutionTemplate = readTemplate("./pages/solutions/[slug].astro");
  const alternativeTemplate = readTemplate("./pages/compare/alternatives/[slug].astro");

  it("routes editorial lead magnet signup blocks through the shared BOFU free-trial CTA", () => {
    for (const template of [guideTemplate, listicleTemplate, stateTemplate, solutionTemplate]) {
      expect(template).toContain("<LeadMagnetSignup");
      expect(template).toContain("trialCtaText={siteConfig.funnel.bofu.ctaText}");
      expect(template).toContain("trialCtaHref={siteConfig.funnel.bofu.ctaTarget}");
    }
  });

  it("passes lead magnet delivery props into editorial signup blocks", () => {
    for (const template of [guideTemplate, listicleTemplate, stateTemplate, solutionTemplate]) {
      expect(template).toContain("leadMagnet={leadMagnet}");
      expect(template).toContain(
        'privacyNote="We\'ll email the resource and a short follow-up sequence. Unsubscribe any time."',
      );
      expect(template).toContain("sourcePage={canonicalPath}");
      expect(template).toContain("apiUrl={publicApiUrl}");
    }
  });

  it("passes resolved lead magnets into ArticleLayout sidebars", () => {
    const templates = [
      "./pages/resources/best/[slug].astro",
      "./pages/solutions/[slug].astro",
      "./pages/workflows/[slug].astro",
      "./pages/features/[slug].astro",
      "./pages/integrations/[slug].astro",
      "./pages/glossary/[slug].astro",
      "./pages/for/[slug].astro",
      "./pages/nonprofit-software/[slug].astro",
      "./pages/nonprofit-software/[state]/[city].astro",
      "./pages/resources/faq/[slug].astro",
      "./pages/resources/benchmarks/[slug].astro",
    ];

    for (const path of templates) {
      const template = readTemplate(path);

      expect(template, `${path} should resolve a page-specific lead magnet`).toContain(
        "const leadMagnet = resolveLeadMagnetOffer",
      );
      expect(
        template,
        `${path} should pass the page-specific lead magnet to ArticleLayout`,
      ).toContain("sidebarLeadMagnet={leadMagnet}");
    }
  });

  it("loads all related-page families before resolving related links", () => {
    const templates = [
      "./components/grant-recipient-category-page.astro",
      "./pages/compare/alternatives/[slug].astro",
      "./pages/compare/pricing/[slug].astro",
      "./pages/compare/versus/[slugA]-vs-[slugB].astro",
      "./pages/features/[slug].astro",
      "./pages/for/[slug].astro",
      "./pages/free/[slug].astro",
      "./pages/glossary/[slug].astro",
      "./pages/integrations/[slug].astro",
      "./pages/nonprofit-software/[slug].astro",
      "./pages/nonprofit-software/[state]/[city].astro",
      "./pages/resources/benchmarks/[slug].astro",
      "./pages/resources/best/[slug].astro",
      "./pages/resources/faq/[slug].astro",
      "./pages/resources/guides/[slug].astro",
      "./pages/solutions/[slug].astro",
      "./pages/workflows/[slug].astro",
    ];

    for (const path of templates) {
      const template = readTemplate(path);

      expect(template, `${path} should load city pages for related cards`).toContain(
        'getCollection("city-pages")',
      );
      expect(template, `${path} should load FAQ hubs for related cards`).toContain(
        'getCollection("faq-hubs")',
      );
      expect(template, `${path} should load benchmark pages for related cards`).toContain(
        'getCollection("benchmarks")',
      );
      expect(template, `${path} should pass city pages into buildContentMap`).toContain(
        "cityPages",
      );
      expect(template, `${path} should pass FAQ hubs into buildContentMap`).toContain("faqHubs");
      expect(template, `${path} should pass benchmarks into buildContentMap`).toContain(
        "benchmarks",
      );
    }
  });

  it("resolves lead magnets through the correct editorial family mapping", () => {
    expect(guideTemplate).toContain('family: "guide"');
    expect(listicleTemplate).toContain('family: "listicle"');
  });

  it("resolves lead magnets through the correct state and solution family mapping", () => {
    expect(stateTemplate).toContain('family: "state-page"');
    expect(solutionTemplate).toContain('family: "solution"');
  });

  it("adds a post-comparison lead magnet signup block to alternative pages", () => {
    expect(alternativeTemplate).toContain("<LeadMagnetSignup");
    expect(alternativeTemplate).toContain("siteConfig.funnel.bofu.ctaText");
    expect(alternativeTemplate).toContain("getSignupCtaTarget()");
    expect(alternativeTemplate).toContain('family: "comparison"');
    expect(alternativeTemplate).toMatch(/competitor\.name/);

    expect(alternativeTemplate.indexOf("<ComparisonTable")).toBeLessThan(
      alternativeTemplate.indexOf("<LeadMagnetSignup"),
    );
  });
});
