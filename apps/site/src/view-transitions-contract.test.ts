import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guardrail for the ViewTransitions rollout: Astro's <ClientRouter /> makes
 * page-to-page navigation feel app-like (cross-fade instead of a hard
 * reload), but that only works safely if every client script that mutates
 * the DOM re-initializes itself on `astro:page-load` (fired on the initial
 * hard load AND after every soft navigation) with an idempotency guard so
 * repeat navigations never double-bind listeners/observers.
 */

function readUiSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../packages/ui/src/site/${relativePath}`, import.meta.url)),
    "utf8",
  );
}

function readSiteSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`./${relativePath}`, import.meta.url)), "utf8");
}

describe("ViewTransitions rollout contract", () => {
  it("adds <ClientRouter /> to the shared base layout", () => {
    const source = readUiSource("layouts/base-layout.astro");

    expect(source).toContain('import { ClientRouter } from "astro:transitions"');
    expect(source).toContain("<ClientRouter />");
  });

  it("gives the persistent header a stable transition name so it cross-fades without flashing", () => {
    const source = readUiSource("components/site-header.astro");

    expect(source).toContain("transition:name=");
  });

  it("re-runs scroll-reveal on astro:page-load with an idempotency guard", () => {
    const source = readUiSource("lib/base-layout-scripts.ts");

    expect(source).toContain('document.addEventListener("astro:page-load"');
    expect(source).toContain("data-scroll-in-bound");
    expect(source).toContain('document.addEventListener("astro:before-swap"');
  });

  it("re-inits the billing toggle on astro:page-load without double-binding", () => {
    const callerSource = readSiteSource("components/billing-toggle.astro");
    const implSource = readSiteSource("lib/billing-toggle.ts");

    expect(callerSource).toContain('document.addEventListener("astro:page-load"');
    expect(implSource).toContain("billingToggleBound");
  });

  it("re-inits the feature comparison matrix swipe affordance on astro:page-load", () => {
    const source = readSiteSource("components/feature-comparison-matrix.astro");

    expect(source).toContain('document.addEventListener("astro:page-load", initMatrixScrollAffordance)');
    expect(source).toContain("data-matrix-affordance-bound");
  });

  it("re-inits the product OS-modules walkthrough on astro:page-load and disconnects observers before swap", () => {
    const source = readSiteSource("pages/product.astro");

    expect(source).toContain('document.addEventListener("astro:page-load", initOsWalkthrough)');
    expect(source).toContain('document.addEventListener("astro:before-swap", disconnectObservers)');
    expect(source).toContain("data-os-walkthrough-bound");
  });

  it("re-inits the table of contents active-heading tracking on astro:page-load and tears it down before swap", () => {
    const source = readUiSource("components/table-of-contents.astro");

    expect(source).toContain('document.addEventListener("astro:page-load", initTableOfContents)');
    expect(source).toContain('document.addEventListener("astro:before-swap"');
    expect(source).toContain("data-toc-js-bound");
  });

  it("re-inits the data table scroll-fade affordance on astro:page-load without double-binding", () => {
    const source = readUiSource("seo/data-table-block.astro");

    expect(source).toContain('document.addEventListener("astro:page-load", initAllTableScrollFades)');
    expect(source).toContain("tableScrollFadeBound");
  });

  it("keeps data table horizontal scroll inside the content column on mobile", () => {
    const source = readUiSource("seo/data-table-block.astro");

    expect(source).toContain(":global(.table-scroll-wrapper)");
    expect(source).toContain(":global(.table-scroll-container)");
    expect(source).toMatch(/\.table-scroll-wrapper\)[\s\S]{0,90}max-width:\s*100%/);
    expect(source).toMatch(/\.table-scroll-container\)[\s\S]{0,120}width:\s*100%/);
  });

  it("keeps the already-correct FaqSection and SiteHeader astro:page-load wiring intact", () => {
    const faqSource = readUiSource("components/faq-section.astro");
    const headerSource = readUiSource("components/site-header.astro");

    expect(faqSource).toContain('document.addEventListener("astro:page-load", initFaqAccordions)');
    expect(headerSource).toContain('document.addEventListener("astro:page-load", init)');
    expect(headerSource).toContain('document.addEventListener("astro:before-swap", cleanupBeforeSwap)');
  });

  it("captures a PostHog $pageview on astro:page-load without double-counting the first load", () => {
    const source = readUiSource("lib/analytics.ts");

    expect(source).toContain('document.addEventListener("astro:page-load"');
    expect(source).toContain('posthog.capture("$pageview")');
    expect(source).toContain("hasCapturedInitialPageview");
  });
});
