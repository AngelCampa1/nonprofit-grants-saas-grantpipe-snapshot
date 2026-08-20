import { describe, expect, it } from "vitest";

import { buildCtaAnalyticsAttributes, buildCtaClickEventProperties } from "./cta-analytics";

describe("buildCtaAnalyticsAttributes", () => {
  it("maps shared CTA analytics context into data attributes", () => {
    expect(
      buildCtaAnalyticsAttributes({
        id: "pricing-demo-primary",
        pageFamily: "comparison",
        buyerStage: "mofu",
        placement: "mid-article-routing",
        intent: "evaluate",
        target: "/compare/vendors",
      }),
    ).toEqual({
      "data-cta-button": "",
      "data-cta-id": "pricing-demo-primary",
      "data-cta-page-family": "comparison",
      "data-cta-buyer-stage": "mofu",
      "data-cta-placement": "mid-article-routing",
      "data-cta-intent": "evaluate",
      "data-cta-target": "/compare/vendors",
    });
  });

  it("omits undefined analytics fields while keeping CTA tracking enabled", () => {
    expect(buildCtaAnalyticsAttributes()).toEqual({
      "data-cta-button": "",
    });
  });
});

describe("buildCtaClickEventProperties", () => {
  it("merges CTA analytics context from the clicked element", () => {
    document.body.innerHTML = `
      <a
        href="/book-demo"
        data-cta-button
        data-cta-id="pricing-demo-primary"
        data-cta-page-family="pricing"
        data-cta-buyer-stage="bofu"
        data-cta-placement="inline-routing"
        data-cta-intent="convert"
        data-cta-target="/book-demo"
      >
        Book a demo
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Book a demo",
        href: "/book-demo",
        section: "decision-cta-card",
        pagePath: "/pricing",
      }),
    ).toEqual({
      cta_id: "pricing-demo-primary",
      destination_path: "/book-demo",
      section: "decision-cta-card",
      page_path: "/pricing",
      page_family: "pricing",
      buyer_stage: "bofu",
      placement: "inline-routing",
      intent: "convert",
    });
    const rawFieldCheck = buildCtaClickEventProperties(ctaElement, {
      buttonText: "Book a demo",
      href: "/book-demo?contactId=raw-id",
      section: "decision-cta-card",
      pagePath: "/pricing",
    });

    expect(rawFieldCheck).not.toHaveProperty("button_text");
    expect(rawFieldCheck).not.toHaveProperty("href");
    expect(rawFieldCheck).not.toHaveProperty("target");
  });

  it("falls back to the closest ancestor for shared analytics attributes", () => {
    document.body.innerHTML = `
      <section
        data-cta-page-family="guide"
        data-cta-buyer-stage="tofu"
        data-cta-placement="sidebar"
      >
        <a href="/guides" data-cta-button>Explore guides</a>
      </section>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Explore guides",
        href: "/guides",
        section: "sidebar-cta",
        pagePath: "/resources",
      }),
    ).toEqual({
      cta_id: "sidebar-cta:cta-0",
      destination_path: "/guides",
      section: "sidebar-cta",
      page_path: "/resources",
      page_family: "guide",
      buyer_stage: "tofu",
      placement: "sidebar",
    });
  });

  it("buckets malformed CTA destinations without emitting the raw href", () => {
    document.body.innerHTML = `
      <a href="http://[bad" data-cta-button>Broken CTA</a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Broken CTA",
        href: "http://[bad",
        section: "hero",
        pagePath: "/",
      }),
    ).toEqual({
      cta_id: "hero:cta-0",
      destination_path: "invalid",
      section: "hero",
      page_path: "/",
    });
  });

  it("buckets non-http CTA schemes without emitting addresses", () => {
    document.body.innerHTML = `
      <a href="mailto:support@grantpipe.com" data-cta-button>Email us</a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Email us",
        href: "mailto:support@grantpipe.com",
        section: "footer",
        pagePath: "/",
      }),
    ).toEqual({
      cta_id: "footer:cta-0",
      destination_path: "non_http",
      section: "footer",
      page_path: "/",
    });
  });
});
