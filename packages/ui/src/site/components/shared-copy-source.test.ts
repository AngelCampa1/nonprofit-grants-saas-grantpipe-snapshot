import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared copy source regressions", () => {
  it("does not hardcode the old B2B eyebrow into ProblemAgitation", () => {
    const source = readSource("./problem-agitation.astro");

    expect(source).not.toContain("The Planning Problem");
    expect(source).toContain("config.eyebrow");
  });

  it("hardens ProblemAgitation against long-copy overflow in the pain-point grid", () => {
    const source = readSource("./problem-agitation.astro");

    expect(source).toContain("min-w-0");
    expect(source).toContain("overflow-wrap:anywhere");
  });

  it("does not default FAQ headings to team-evaluation language", () => {
    const source = readSource("./faq-section.astro");

    expect(source).not.toContain("Answers for teams evaluating the fit");
    expect(source).toContain("resolveFaqHeading");
  });

  it("keeps shared marketing CTAs on the calmer primary button without shimmer", () => {
    const astroCta = readSource("./public-signup-cta.astro");
    const reactCta = readSource("./public-signup-cta.tsx");
    const emailCapture = readSource("./email-capture.tsx");
    const exitPopup = readSource("./exit-intent-popup.tsx");

    // The Astro wrapper renders through the marketing pill primitive class API.
    expect(astroCta).toContain("gp-mkt-btn primary");
    expect(astroCta).not.toContain("btn-shimmer");

    // React islands still emit the shared `.btn-primary` tier class.
    for (const source of [reactCta, emailCapture, exitPopup]) {
      expect(source).toContain("btn-primary");
      expect(source).not.toContain("btn-shimmer");
    }
  });

  it("uses sentence-case shared rail labels instead of mono uppercase scan text", () => {
    const problemAgitation = readSource("./problem-agitation.astro");
    const sidebarCta = readSource("./sidebar-cta.astro");

    expect(problemAgitation).toContain("text-brand-primary");
    expect(problemAgitation).not.toContain("font-mono");
    expect(problemAgitation).not.toContain("uppercase");
    expect(problemAgitation).not.toContain("text-error-600");

    expect(sidebarCta).toContain("editorial-panel editorial-panel--soft");
    expect(sidebarCta).toContain("editorial-kicker");
    expect(sidebarCta).not.toContain("rounded-[1.35rem]");
  });

  it("keeps PublicSignupCta focused on CTA-only props in the React island", () => {
    const source = readSource("./public-signup-cta.tsx");

    expect(source).not.toContain("surveyQuestions");
    expect(source).not.toContain("discoveryCallUrl");
    expect(source).toContain("sourcePage: string;");
    expect(source).toContain("ctaTarget?: string;");
  });

  it("keeps PublicSignupCta focused on CTA-only props in the Astro wrapper", () => {
    const source = readSource("./public-signup-cta.astro");

    expect(source).not.toContain("surveyQuestions");
    expect(source).not.toContain("discoveryCallUrl");
    expect(source).toContain("sourcePage: string;");
    expect(source).toContain("ctaTarget?: string;");
  });
});
