import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(): string {
  return readFileSync(path.resolve(__dirname, "./promo-banner.astro"), "utf8");
}

describe("promo-banner source", () => {
  it("declares the documented prop surface", () => {
    const source = readSource();

    expect(source).toContain("interface Props");
    expect(source).toContain("eyebrow?:");
    expect(source).toContain("message:");
    expect(source).toContain("ctaText?:");
    expect(source).toContain("ctaHref?:");
    expect(source).toContain("endsAt?:");
    expect(source).toContain("dismissible?:");
    expect(source).toContain("storageKey?:");
    expect(source).toContain("ariaLabel?:");
  });

  it("guards rendering when the message is empty", () => {
    const source = readSource();

    expect(source).toMatch(/if\s*\(\s*!\s*message/);
  });

  it("renders an accessible region landmark for the banner", () => {
    const source = readSource();

    expect(source).toContain('role="region"');
    expect(source).toContain("aria-label=");
    expect(source).toContain("data-promo-banner");
  });

  it("uses the brand-primary surface tokens", () => {
    const source = readSource();

    expect(source).toContain("bg-brand-primary");
    expect(source).toContain("text-neutral-50");
  });

  it("hides the banner pre-paint to avoid a flash before the inline script runs", () => {
    const source = readSource();

    // hidden attribute should be present on the root element so it stays hidden
    // until the inline script decides whether it should be shown.
    expect(source).toMatch(/data-promo-banner[^>]*\bhidden\b/);
  });

  it("ships an inline script that handles dismissal and expiry", () => {
    const source = readSource();

    expect(source).toContain("<script is:inline");
    expect(source).toContain("localStorage");
    expect(source).toContain("dismissed");
    // expiry is checked by comparing Date.now() against an ISO timestamp
    expect(source).toContain("Date.now()");
    expect(source).toContain("Date.parse");
  });

  it("restores banner visibility when the offer is neither expired nor dismissed", () => {
    const source = readSource();

    // The happy-path assignment must exist outside the guard block so the
    // banner actually appears on a fresh visit before the expiry date.
    expect(source).toContain("node.hidden = false");
  });

  it("wires a dismiss control with an accessible label", () => {
    const source = readSource();

    expect(source).toContain("data-promo-banner-dismiss");
    expect(source).toMatch(/aria-label="Dismiss/);
  });

  it("renders the square dismiss icon button as a pill (circular) per the buttons-are-pills canon", () => {
    const source = readSource();

    // The dismiss control is a 48x48 square icon button with a hover surface;
    // canon requires square icon buttons to be circular (rounded-full), not
    // rounded-sm, so the hover background reads as a circle.
    const dismissClass =
      source.match(/data-promo-banner-dismiss[\s\S]*?class="([^"]+)"/)?.[1] ?? "";
    expect(dismissClass).toContain("rounded-full");
    expect(dismissClass).not.toContain("rounded-sm");
  });

  it("keeps the eyebrow visible across breakpoints", () => {
    const source = readSource();

    const eyebrowClass = source.match(/<span\s+class="([^"]+)"/)?.[1] ?? "";
    expect(eyebrowClass).toContain("inline-flex");
    expect(eyebrowClass).not.toContain("hidden");
  });

  it("derives a default storage key when none is provided so dismissals persist", () => {
    const source = readSource();

    expect(source).toContain("storageKey");
    expect(source).toMatch(/storageKey\s*\?\?/);
  });

  it("includes a noscript fallback so the banner is visible to no-JS visitors and crawlers", () => {
    const source = readSource();

    expect(source).toContain("<noscript>");
    expect(source).toContain("[data-promo-banner]");
    expect(source).toContain("display:block");
  });

  it("does not set a high z-index that would collide with fixed overlays", () => {
    const source = readSource();

    expect(source).not.toContain("z-[60]");
  });

  it("renders a countdown element when endsAt is set", () => {
    const source = readSource();
    // countdown span must be present in the template
    expect(source).toContain("data-promo-countdown");
  });

  it("ships countdown update logic in the inline script", () => {
    const source = readSource();
    expect(source).toContain("data-promo-countdown");
    // the script must set an interval or call a function to update countdown text
    expect(source).toMatch(/setInterval|setTimeout/);
    // it must render "Ends in" style text
    expect(source).toContain("Ends in");
  });

  it("stops the countdown interval when the promo expires", () => {
    const source = readSource();
    expect(source).toContain("clearInterval");
  });
});
