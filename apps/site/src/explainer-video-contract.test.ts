import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const explainerComponent = source("./components/explainer-video.astro");
const videoEmbedComponent = source("./components/video-embed.astro");
const homepage = source("./pages/index.astro");
const product = source("./pages/product.astro");
const pricing = source("./pages/pricing.astro");
const paidLandingPage = source("./components/paid-search-landing-page.astro");
const categoryPage = source("./components/grant-recipient-category-page.astro");
const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

function listPublicMediaFiles(dir = new URL("../public/", import.meta.url)): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(fileURLToPath(dir), entry.name);
    const stats = lstatSync(path);

    if (stats.isSymbolicLink()) {
      return [];
    }

    if (stats.isDirectory()) {
      return listPublicMediaFiles(new URL(`${entry.name}/`, dir));
    }

    return path;
  });
}

describe("explainer video placement contract", () => {
  it("uses a click-to-load YouTube no-cookie facade instead of an eager iframe", () => {
    expect(existsSync(new URL("./components/explainer-video.astro", import.meta.url))).toBe(true);
    expect(videoEmbedComponent).toContain("youtube-nocookie.com/embed");
    // Default youtube ID resolves from registry, not a bare hardcoded literal
    expect(explainerComponent).toContain('getVideo("one-workspace-overview")');
    expect(explainerComponent).toContain("@grantpipe/shared");
    expect(explainerComponent).toContain("data-explainer-video");
    expect(videoEmbedComponent).toContain("data-iframe-title");
    // Play button and aria-label live in the extracted VideoEmbed component
    expect(videoEmbedComponent).toContain("button");
    expect(videoEmbedComponent).toContain("aria-label");
    expect(explainerComponent).not.toContain("<iframe");
    expect(videoEmbedComponent).not.toContain("<iframe");
  });

  it("does not default the explainer facade to the retired dashboard screenshot", () => {
    expect(explainerComponent).not.toContain('posterSrc = "/grantpipe-dashboard.png"');
  });

  it("sizes the dynamically inserted iframe to fill the facade frame", () => {
    // iframe sizing logic lives in the extracted VideoEmbed component
    expect(videoEmbedComponent).toContain('frame.className = "gp-explainer-video__iframe"');
    expect(videoEmbedComponent).toContain("frame.title = iframeTitle");
    expect(videoEmbedComponent).toContain('frame.style.width = "100%"');
    expect(videoEmbedComponent).toContain('frame.style.height = "100%"');
    expect(videoEmbedComponent).toContain(
      ".gp-explainer-video__media :global(.gp-explainer-video__iframe)",
    );
  });

  it("allows privacy-enhanced YouTube embeds in the site CSP", () => {
    expect(headers).toContain("https://www.youtube-nocookie.com");
    expect(headers).toContain("https://bat.bing.net");
    expect(headers).toContain("https://bat.bing.com");
  });

  it("allows the Cloudflare Turnstile script and challenge frame in the site CSP", () => {
    // The exit-intent popup loads Turnstile's api.js and renders its challenge
    // in an iframe. Both must be allow-listed or the widget never mints a token
    // and the (fail-closed) lead endpoint rejects every submission with a 403.
    const cspLine = headers.split("\n").find((line) => line.includes("Content-Security-Policy"));
    expect(cspLine).toBeDefined();
    const scriptSrc = cspLine!.match(/script-src ([^;]+)/)?.[1] ?? "";
    const frameSrc = cspLine!.match(/frame-src ([^;]+)/)?.[1] ?? "";
    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
    expect(frameSrc).toContain("https://challenges.cloudflare.com");
  });

  it("places the explainer on the conversion-critical pages", () => {
    expect(homepage).toContain("<ExplainerVideo");
    expect(homepage.indexOf("<ExplainerVideo")).toBeGreaterThan(
      homepage.indexOf('data-section="hero"'),
    );
    expect(homepage.indexOf("<ExplainerVideo")).toBeLessThan(
      homepage.indexOf('data-section="logo-strip"'),
    );

    expect(product).toContain("<ExplainerVideo");
    expect(product.indexOf("<ExplainerVideo")).toBeGreaterThan(
      product.indexOf('data-section="hero"'),
    );
    expect(product.indexOf("<ExplainerVideo")).toBeLessThan(
      product.indexOf('data-section="page-nav"'),
    );

    expect(pricing).toContain("<ExplainerVideo");
    expect(pricing.indexOf("<ExplainerVideo")).toBeGreaterThan(
      pricing.indexOf("<PricingPlanCards"),
    );
    expect(pricing.indexOf("<ExplainerVideo")).toBeLessThan(
      pricing.indexOf('data-section="plan-comparison-matrix"'),
    );

    expect(paidLandingPage).toContain("<ExplainerVideo");
    expect(paidLandingPage.indexOf("<ExplainerVideo")).toBeGreaterThan(
      paidLandingPage.indexOf('class="lp-hero"'),
    );
    expect(paidLandingPage.indexOf("<ExplainerVideo")).toBeLessThan(
      paidLandingPage.indexOf('aria-labelledby="problem-title"'),
    );
  });

  it("emits canonical product-page VideoObjects only from the product page", () => {
    const allPageSources = [homepage, product, pricing, paidLandingPage, categoryPage].join("\n");

    expect(product).toContain('"@type": "VideoObject"');
    expect(product).toContain("GrantPipe: One Workspace for Grants, Funds, Donors, and Compliance");
    expect(product).toContain("PT1M5S");
    expect(product).toContain("https://www.youtube-nocookie.com/embed/dd2pJ6ZdEHI");
    expect(product).toContain("2026-05-12");
    expect(product).toContain(
      "GrantPipe Product Tour: Grants, Restricted Funds, Compliance, and Reporting",
    );
    expect(product).toContain("product-tour");
    expect(product).toContain("o-FVZeO3rjw");
    expect(product).toContain("https://www.youtube-nocookie.com/embed/${productTourYoutubeId}");
    expect(product).toContain("PT5M");
    expect(allPageSources.match(/"@type": "VideoObject"/g)).toHaveLength(2);
  });

  it("limits category-page embeds to high-intent GrantPipe evaluation pages", () => {
    expect(categoryPage).toContain("highIntentVideoPages");
    expect(categoryPage).toContain('"/grant-management-software"');
    expect(categoryPage).toContain('"/grant-compliance-software"');
    expect(categoryPage).toContain('"/restricted-fund-tracking-software"');
    expect(categoryPage).toContain('"/grant-reporting-software"');
    expect(categoryPage).toContain('"/auditor-funder-portal-software"');
    expect(categoryPage).not.toContain('"/grant-tracking-software"');
  });

  it("does not copy final MP4 explainer assets into the public site bundle", () => {
    const publicMediaFiles = listPublicMediaFiles().filter((path) =>
      /\.(mp4|webm|mov)$/i.test(path),
    );

    expect(publicMediaFiles).toEqual([]);
  });
});
