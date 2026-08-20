import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("base layout source regressions", () => {
  it("does not hardcode a global apple touch icon path", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("appleTouchIcon");
    expect(source).not.toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  });

  it("threads the optional appleTouchIcon prop from the shared site config", () => {
    const typesSource = readSource("../types.ts");

    expect(typesSource).toContain("appleTouchIcon?: string;");
  });

  it("supports site-level metadata preservation without changing the global default", () => {
    const layoutSource = readSource("./base-layout.astro");
    const typesSource = readSource("../types.ts");

    expect(layoutSource).toContain("preserveMetaTagCopy?: boolean");
    expect(layoutSource).toContain("preserveAuthoredMetadata={preserveMetaTagCopy}");
    expect(typesSource).toContain("preserveMetaTagCopy?: boolean;");
  });

  it("lets the landing layout override faq schema and authored seo copy", () => {
    const landingLayoutSource = readSource("./landing-layout.astro");

    expect(landingLayoutSource).toContain("seoTitle?: string");
    expect(landingLayoutSource).toContain("seoDescription?: string");
    expect(landingLayoutSource).toContain("faqs?: FaqItem[]");
    expect(landingLayoutSource).toContain("const resolvedFaqs = faqs ?? config.faqs");
    expect(landingLayoutSource).toContain("title={seoTitle ??");
    expect(landingLayoutSource).toContain("description={seoDescription ??");
  });

  it("emits sitewide Organization+WebSite JSON-LD when siteUrl is provided and not suppressed", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("buildSitewideSchemas");
    expect(source).toContain("buildGraph");
    expect(source).toContain("suppressSitewideSchema");
    expect(source).toContain("siteLogo");
    expect(source).toContain("sitewideGraph");
    expect(source).toContain("{sitewideGraph && <SchemaMarkup graph={sitewideGraph} />}");
  });

  it("normalizes root-relative RSS alternate URLs to absolute URLs", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("const resolvedRssUrl");
    expect(source).toContain("new URL(rssUrl, siteUrl).toString()");
    expect(source).toContain("href={resolvedRssUrl}");
    expect(source).not.toContain("href={rssUrl}");
  });

  it("does not render or ship the public feedback widget from the base layout", () => {
    const source = readSource("./base-layout.astro");

    expect(source).not.toContain("PublicFeedbackWidget");
    expect(source).not.toContain("showFeedbackWidget");
    expect(source).not.toContain("feedback/public");
  });

  it("lets paid landing pages disable the AI SDR widget instead of hiding it", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("disableAiSdrWidget?: boolean");
    expect(source).toContain("disableAiSdrWidget = false");
    expect(source).toContain("{!disableAiSdrWidget && (");
    expect(source).toContain("ventora-ai-sdr-root");
  });

  it("handles AI SDR widget open failures without unhandled promise rejections", () => {
    const source = readSource("./base-layout.astro");

    // The widget's open() is always wrapped so a rejected session-create surfaces
    // an inline error instead of an unhandled rejection.
    expect(source).toContain("function openWidget()");
    expect(source).toContain("Promise.resolve(widget.open())");
    expect(source).toContain(".catch(function () {");
    expect(source).toContain("showError();");
    // open() must never be called bare (outside the Promise wrapper).
    expect(source).not.toContain("widget.open();");
  });

  it("toggles the AI SDR widget open and closed from the launcher button", () => {
    const source = readSource("./base-layout.astro");

    // The launcher click handler must toggle, not only open — closing is driven
    // through the widget handle rather than a site-owned panel.
    expect(source).toContain('toggle.addEventListener("click", onToggle)');
    expect(source).toContain("function onToggle()");
    expect(source).toContain("if (isOpen()) {");
    expect(source).toContain("widget.close()");
  });

  it("closes the AI SDR widget on Escape and manages focus", () => {
    const source = readSource("./base-layout.astro");

    // Escape closes the widget when it is open.
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("widget.close()");
    // Closing returns focus to the launcher.
    expect(source).toContain("toggle.focus()");
    // Keydown listener is registered on the document for Escape handling.
    expect(source).toContain('document.addEventListener("keydown"');
  });

  it("observes the worker panel to keep aria-expanded and focus correct on worker-driven close", () => {
    const source = readSource("./base-layout.astro");

    // A MutationObserver on the worker's panel syncs state when the user closes
    // via the worker's own close button / Escape (no callback is exposed).
    expect(source).toContain("new MutationObserver");
    expect(source).toContain('root.querySelector("[data-ai-sdr-panel]")');
    expect(source).toContain('attributeFilter: ["hidden", "data-state"]');
    // On a worker-driven close the worker refocuses its own (CSS-hidden) launcher,
    // so the embed must pull focus back to the visible toggle.
    expect(source).toContain("document.activeElement");
  });

  it("reflects open intent on aria-expanded immediately, before open() resolves", () => {
    const source = readSource("./base-layout.astro");

    // openWidget optimistically marks the launcher expanded so aria-expanded does
    // not lag the visible panel by the session-create round-trip; the reject path
    // resets it. The synchronous set must sit inside openWidget, before open().
    const openWidgetIdx = source.indexOf("function openWidget()");
    const openCallIdx = source.indexOf("Promise.resolve(widget.open())");
    const optimisticIdx = source.indexOf('toggle.setAttribute("aria-expanded", "true")');
    expect(openWidgetIdx).toBeGreaterThan(-1);
    expect(optimisticIdx).toBeGreaterThan(openWidgetIdx);
    expect(optimisticIdx).toBeLessThan(openCallIdx);
  });

  it("captures widget load/open failures to PostHog for observability", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("function trackWidgetError(");
    expect(source).toContain("window.posthog.capture");
    expect(source).toContain('"ai_sdr_widget_error"');
    expect(source).toContain('trackWidgetError("load")');
    expect(source).toContain('trackWidgetError("open")');
  });

  it("initializes Sentry before PostHog on production marketing pages", () => {
    const source = readSource("./base-layout.astro");

    expect(source.indexOf("initSentry(siteName);")).toBeGreaterThan(-1);
    expect(source.indexOf("initSentry(siteName);")).toBeLessThan(
      source.indexOf("set:html={postHogBootstrapScript}"),
    );
  });

  it("threads PUBLIC_POSTHOG env vars into the bootstrap config before rendering", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("resolvePostHogBootstrapConfig");
    expect(source).toContain("import.meta.env.PUBLIC_POSTHOG_KEY");
    expect(source).toContain("import.meta.env.PUBLIC_POSTHOG_HOST");
    expect(source).toContain("buildPostHogBootstrapScript(");
  });

  it("only emits the PostHog init script when a real key is resolved", () => {
    const source = readSource("./base-layout.astro");

    // The layout must gate the posthog script on a non-null resolved apiKey.
    expect(source).toContain("postHogBootstrapConfig.apiKey");
    // The posthog script tag must sit inside a block that checks apiKey is truthy.
    expect(source).toContain("postHogBootstrapConfig.apiKey && postHogBootstrapScript");
  });

  it("landing layout suppresses sitewide schema because it emits its own full graph", () => {
    const landingSource = readSource("./landing-layout.astro");

    expect(landingSource).toContain("suppressSitewideSchema={true}");
  });

  it("landing layout disables footer capture and reveal motion", () => {
    const landingSource = readSource("./landing-layout.astro");

    expect(landingSource).toContain("enableScrollReveal={false}");
    expect(landingSource).toContain('captureVariant="none"');
  });

  it("pricing breakdown layout also suppresses footer capture and reveal motion", () => {
    const pricingSource = readSource("./pricing-breakdown-layout.astro");

    expect(pricingSource).toContain("enableScrollReveal={false}");
    expect(pricingSource).toContain('captureVariant="none"');
  });

  it("inline signup defaults to the canonical one-month trial CTA copy", () => {
    const inlineSignupSource = readSource("../components/inline-signup.astro");

    expect(inlineSignupSource).toContain("buttonText = marketingKnowledge.ctas.trial.label");
    expect(inlineSignupSource).not.toContain('buttonText = "Start Your Free Trial"');
  });

  it("accepts showStickyMobileCta, stickyCtaText, and stickyCtaTarget props with safe defaults", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("showStickyMobileCta?: boolean");
    expect(source).toContain("stickyCtaText?: string");
    expect(source).toContain("stickyCtaTarget?: string");
    expect(source).toContain("showStickyMobileCta = false");
    expect(source).toContain('stickyCtaText = "Start free trial"');
    expect(source).toContain('stickyCtaTarget = "/signup"');
    expect(source).toContain("{showStickyMobileCta && (");
    expect(source).toContain("StickyMobileCta");
  });

  it("article-type layouts pass siteLogo to base layout", () => {
    const articleSource = readSource("./article-layout.astro");
    const comparisonSource = readSource("./comparison-layout.astro");
    const contentSource = readSource("./content-layout.astro");
    const listicleSource = readSource("./listicle-layout.astro");
    const pricingSource = readSource("./pricing-breakdown-layout.astro");

    for (const [name, src] of [
      ["article", articleSource],
      ["comparison", comparisonSource],
      ["content", contentSource],
      ["listicle", listicleSource],
      ["pricing-breakdown", pricingSource],
    ] as [string, string][]) {
      expect(src, `${name}-layout.astro should pass siteLogo`).toContain("siteLogo=");
    }
  });
});
