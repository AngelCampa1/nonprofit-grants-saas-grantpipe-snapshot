import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MARKETING_CONTENT_COLLECTIONS } from "@grantpipe/shared/public-kb";
import { describe, expect, test } from "vitest";
import { CAPABILITY_PUBLIC_SURFACES } from "../../../../packages/shared/src/capabilities";
import { grantCategoryPages } from "../config/grant-recipient-seo";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const seoSystemPath = join(repoRoot, "docs", "seo", "marketing-funnel-content-system.md");
const operatingSystemPath = join(repoRoot, "docs", "offers", "marketing-sales-operating-system.md");
const contentCollectionPublicRoutes = {
  alternatives: "/compare/alternatives/",
  benchmarks: "/resources/benchmarks/",
  "city-pages": "/nonprofit-software/",
  comparisons: "/compare/versus/",
  "faq-hubs": "/resources/faq/",
  features: "/features/",
  glossary: "/glossary/",
  guides: "/resources/guides/",
  integrations: "/integrations/",
  "lead-magnets": "/free/",
  listicles: "/resources/best/",
  personas: "/for/",
  "pricing-breakdowns": "/compare/pricing/",
  "state-pages": "/nonprofit-software/",
  "vertical-pages": "/solutions/",
  workflows: "/workflows/",
} as const satisfies Record<(typeof MARKETING_CONTENT_COLLECTIONS)[number], string>;

function readDoc(path: string): string {
  expect(existsSync(path), `${path} should exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("marketing funnel and SEO system map", () => {
  test("documents where new SEO pages belong and how they move buyers forward", () => {
    const doc = readDoc(seoSystemPath);

    expect(doc).toContain("packages/shared/src/knowledge/marketing/content");
    expect(doc).toContain("packages/shared/src/knowledge/marketing/content-root.ts");
    expect(doc).toContain("packages/shared/src/knowledge/types.ts");
    expect(doc).toContain("apps/site/src/content.config.ts");
    expect(doc).toContain("apps/site/src/lib/page-helpers.ts");
    expect(doc).toContain("apps/site/src/content-tests");
    expect(doc).toContain("docs/seo/icp-seo-prod-urls-2026-06-29.txt");
    expect(doc).toContain("apps/site/src/lib/topic-hubs.ts");
    expect(doc).toContain("pnpm run knowledge:generate");
    expect(doc).toContain("pnpm run knowledge:check");

    const grantCategoryRoutes = grantCategoryPages.map((page) =>
      page.href.endsWith("/") ? page.href : `${page.href}/`,
    );

    for (const urlFamily of [
      "/resources/guides/",
      "/resources/best/",
      "/resources/faq/",
      "/resources/topics/",
      "/resources/comparisons/",
      "/resources/alternatives/",
      "/resources/lead-magnets/",
      "/workflows/",
      "/glossary/",
      "/free/",
      "/for/",
      "/compare/",
      "/integrations/",
      "/nonprofit-software/",
      ...grantCategoryRoutes,
      "/books",
      "/lp/",
      "/solutions/",
      "/features/",
      "/pricing",
    ]) {
      expect(doc).toContain(urlFamily);
    }

    for (const collection of MARKETING_CONTENT_COLLECTIONS) {
      expect(doc).toContain(`packages/shared/src/knowledge/marketing/content/${collection}`);
      expect(doc).toContain(contentCollectionPublicRoutes[collection]);
    }

    expect(doc).toMatch(
      /source collection names\s+come from `MARKETING_CONTENT_COLLECTIONS`; public prefixes come from/i,
    );
    expect(doc).toContain("some are mapped in `apps/site/src/lib/page-helpers.ts`");
    expect(doc).toMatch(/some are\s+defined by Astro page files/i);
    expect(doc).toContain("apps/site/src/config/grant-recipient-seo.ts");
    expect(doc).toContain("grantCategoryPages");
    expect(doc).toContain("root commercial SEO pages");
    expect(doc).toContain("public rendering uses `/compare/`");
    expect(doc).toContain("source content tied to `/free/` routes");

    for (const sourceOfTruth of [
      ".agents/product-marketing.md",
      "packages/shared/src/pricing.ts",
      "packages/shared/src/promos.ts",
      "docs/offers/wave0-messaging-claims-ledger.md",
      "packages/shared/src/capabilities.ts",
      "apps/site/src/lib/marketed-capabilities.ts",
    ]) {
      expect(doc).toContain(sourceOfTruth);
    }

    expect(doc).toMatch(/primaryCta/i);
    expect(doc).toMatch(/relatedPages/i);
    expect(doc).toMatch(/301 redirect/i);
    expect(doc).toMatch(/no orphan/i);
    expect(doc).not.toContain("/resources/state-pages/");
    expect(doc).not.toContain("/resources/city-pages/");
  });

  test("ties the funnel operating system to the SEO content system", () => {
    const doc = readDoc(operatingSystemPath);

    expect(doc).toContain("docs/seo/marketing-funnel-content-system.md");
    expect(doc).toContain("SEO and content URL system");
    expect(doc).toContain("Every new public page must have one next step");
  });

  test("ties public capability claims in the operating system to the shared registry", () => {
    const doc = readDoc(operatingSystemPath);

    for (const requiredPhrase of [
      "packages/shared/src/capabilities.ts",
      "CAPABILITY_CLAIMS",
      "allowedPublicSurfaces",
      "apps/site/src/lib/marketed-capabilities.ts",
      "Every public capability claim must trace back to `CAPABILITY_CLAIMS`",
    ]) {
      expect(doc).toContain(requiredPhrase);
    }

    for (const publicSurface of CAPABILITY_PUBLIC_SURFACES) {
      expect(doc).toContain(publicSurface);
    }
  });

  test("documents the capability claim proof ladder for product-marketing alignment", () => {
    const doc = readDoc(seoSystemPath);

    for (const requiredPhrase of [
      "Capability claim proof ladder",
      ".agents/product-marketing-context.md",
      "PLAN_CATALOG",
      "PLAN_ENTITLEMENTS",
      "packages/shared/src/constants/index.ts",
      "packages/shared/src/capabilities.ts",
      "CAPABILITY_CLAIMS",
      "apps/site/src/lib/marketed-capabilities.ts",
      "FEATURE_PAGE_BY_CAPABILITY_ITEM",
      "packages/shared/src/knowledge/marketing/content/features",
      "entitlement:",
      "sourceUrls",
    ]) {
      expect(doc).toContain(requiredPhrase);
    }

    expect(doc).toMatch(/Do not\s+market a capability from a feature landing page alone/i);
    expect(doc).toMatch(
      /implemented code under\s+`apps\/web`, `apps\/api`, `packages\/shared`, and `packages\/db`/i,
    );
  });

  test("keeps the trial-plan documentation cleanup queue current", () => {
    const seoSystem = readDoc(seoSystemPath);
    const productizationSystem = readDoc(
      join(repoRoot, "docs", "offers", "productization-system.md"),
    );

    expect(productizationSystem).toContain(
      'Trial access follows the plan selected at signup; legacy or missing-plan trial records fall back to `TRIAL_EFFECTIVE_PLAN_TIER = "starter"` in `pricing.ts`',
    );
    expect(seoSystem).not.toContain(
      "`docs/offers/productization-system.md` still says the free trial gets",
    );
  });
});
