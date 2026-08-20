import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { siteConfig } from "./config/site";
import { buildGrantPipeHomepageContent } from "./lib/homepage-content";
import { getMarketedCapabilities } from "./lib/marketed-capabilities";

const pagesDirectory = fileURLToPath(new URL("./pages", import.meta.url));
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const homepageSource = readFileSync(new URL("./pages/index.astro", import.meta.url), "utf8");
const productSource = readFileSync(new URL("./pages/product.astro", import.meta.url), "utf8");
const pricingSource = readFileSync(new URL("./pages/pricing.astro", import.meta.url), "utf8");
const routePatterns = [
  ...collectPageRoutePatterns(pagesDirectory),
  ...collectPublicStaticRoutePatterns(publicDirectory),
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectPageRoutePatterns(directory: string): RegExp[] {
  const patterns: RegExp[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      patterns.push(...collectPageRoutePatterns(fullPath));
      continue;
    }

    if (!/\.(astro|ts)$/.test(entry.name)) {
      continue;
    }

    const relativePath = relative(pagesDirectory, fullPath).replace(/\\/g, "/");
    patterns.push(buildRoutePattern(relativePath));
  }

  return patterns;
}

function collectPublicStaticRoutePatterns(directory: string): RegExp[] {
  const patterns: RegExp[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      patterns.push(...collectPublicStaticRoutePatterns(fullPath));
      continue;
    }

    if (!/\.(json|md|txt|xml)$/.test(entry.name)) {
      continue;
    }

    const route = `/${relative(publicDirectory, fullPath).replace(/\\/g, "/")}`;
    patterns.push(new RegExp(`^${escapeRegex(route)}$`));
  }

  return patterns;
}

function buildRoutePattern(pageFile: string): RegExp {
  const normalizedFile = pageFile.replace(/\.(astro|ts)$/, "");
  const rawSegments = normalizedFile.split("/").filter(Boolean);
  const segments = rawSegments.at(-1) === "index" ? rawSegments.slice(0, -1) : rawSegments;

  if (segments.length === 0) {
    return /^\/?$/;
  }

  let pattern = "^";
  for (const segment of segments) {
    if (/^\[\.\.\.[^\]]+\]$/.test(segment)) {
      pattern += "(?:/[^/]+)*";
      continue;
    }

    const segmentPattern = escapeRegex(segment).replace(/\\\[[^\]]+\\\]/g, "[^/]+");
    pattern += `/${segmentPattern}`;
  }

  pattern += "/?$";
  return new RegExp(pattern);
}

function assertInternalHrefResolves(href: string) {
  const [pathname, hash] = href.split("#");

  if (pathname && pathname !== "/") {
    const normalizedPathname = pathname.replace(/\/$/, "") || "/";

    expect(
      routePatterns.some((pattern) => pattern.test(normalizedPathname)),
      `Expected route for ${href}`,
    ).toBe(true);
  }

  if (hash) {
    const normalizedHashPathname = (pathname ?? "").replace(/\/$/, "") || "/";
    if (normalizedHashPathname === "/product") {
      expect(["product-tour", ...getMarketedCapabilities().map((entry) => entry.slug)]).toContain(
        hash,
      );
      expect(productSource).toContain("getMarketedCapabilities");
      return;
    }

    const hashSource = normalizedHashPathname === "/pricing" ? pricingSource : homepageSource;
    expect(
      hashSource.includes(`id="${hash}"`) || hashSource.includes(`sectionId="${hash}"`),
      `Expected ${href} to resolve to an id or sectionId in its page source`,
    ).toBe(true);
  }
}

describe("marketing link contract", () => {
  it("keeps primary nav, footer, homepage resource links, and product anchors tied to real destinations", () => {
    const homepageContent = buildGrantPipeHomepageContent(siteConfig);
    const internalHrefs = [
      ...(siteConfig.nav?.items ?? []).map((item) => item.href),
      ...(siteConfig.footer?.linkGroups ?? []).flatMap((group) =>
        group.links.map((link) => link.href),
      ),
      ...homepageContent.resourceLinks.map((link) => link.href),
      "/product/#fundraising",
      "/product/#compliance",
      "/product/#accounting",
      "/product/#migration",
    ].filter((href): href is string => typeof href === "string" && href.startsWith("/"));

    expect(internalHrefs.length).toBeGreaterThan(0);

    for (const href of internalHrefs) {
      assertInternalHrefResolves(href);
    }
  });

  it("keeps external marketing CTAs explicit and usable", () => {
    expect(siteConfig.funnel.bofu.ctaTarget).toBe("/pricing/#plans");
    expect(siteConfig.appLoginUrl).toBe("https://app.grantpipe.com/app/login");
    expect(siteConfig.discoveryCallUrl).toBe("mailto:angel.campa@grantpipe.com");
    expect(JSON.stringify(siteConfig)).not.toMatch(/cal\.com|calendly/i);
    expect(siteConfig.contactEmail).toBe("angel.campa@grantpipe.com");
    expect(pricingSource).toContain("stickyCtaTarget={trialHref}");
    expect(pricingSource).not.toContain("FOUNDER_BOOKING_URLS");
  });
});
