import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { marketingContentDirectory } from "./lib/marketing-content-root";
import {
  getFeatureHrefForCapabilityItem,
  getMarketedCapabilities,
} from "./lib/marketed-capabilities";

const featuresDirectory = join(marketingContentDirectory, "features");
const featureFiles = readdirSync(featuresDirectory)
  .filter((file) => file.endsWith(".md"))
  .sort();

function getFrontmatter(source: string): string {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    throw new Error("Expected frontmatter block");
  }
  return match[1];
}

function getBody(source: string): string {
  const match = source.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (!match?.[1]) {
    throw new Error("Expected markdown body");
  }
  return match[1];
}

function getListField(frontmatter: string, field: string): string[] {
  const match = frontmatter.match(
    new RegExp(`^${field}:\\n([\\s\\S]*?)(?=^[A-Za-z][\\w-]*:|(?![\\s\\S]))`, "m"),
  );
  if (!match?.[1]) return [];

  return [...match[1].matchAll(/^\s+-\s+(?:"([^"]+)"|([^\n#]+))$/gm)].map((entry) =>
    (entry[1] ?? entry[2])!.trim(),
  );
}

function countYamlItems(frontmatter: string, field: string): number {
  const match = frontmatter.match(
    new RegExp(`^${field}:\\n([\\s\\S]*?)(?=^[A-Za-z][\\w-]*:|(?![\\s\\S]))`, "m"),
  );
  if (!match?.[1]) return 0;
  return [...match[1].matchAll(/^\s+-\s+/gm)].length;
}

function getMarkdownLinks(body: string): string[] {
  return [...body.matchAll(/\[[^\]]+\]\((\/[^)#?]+)\/?[#?)]/g)].map((match) =>
    (match[1] ?? "").replace(/\/$/, ""),
  );
}

function countWords(body: string): number {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function getButtonLikeClasses(source: string): string[] {
  return [...source.matchAll(/<(?:a|button)\b[^>]*class(?::list)?="([^"]*)"/gm)].map(
    (match) => match[1] ?? "",
  );
}

describe("feature landing page contracts", () => {
  it("keeps the product page wired to every feature landing page", () => {
    const productPage = readFileSync(join(import.meta.dirname, "pages/product.astro"), "utf8");
    const productProofSection = readFileSync(
      join(import.meta.dirname, "components/product-proof-section.astro"),
      "utf8",
    );
    const marketedCapabilities = readFileSync(
      join(import.meta.dirname, "lib/marketed-capabilities.ts"),
      "utf8",
    );

    expect(productPage).toContain('getCollection("features")');
    expect(productPage).toContain("href={`/features/${getContentEntrySlug(feature.entry)}`}");
    expect(productPage).toContain('data-section="feature-directory"');
    expect(productPage).toContain("rounded-full");
    expect(marketedCapabilities).toContain("FEATURE_PAGE_BY_CAPABILITY_ITEM");
    expect(marketedCapabilities).toContain("satisfies Record<string, `/features/${string}`>");
    expect(productProofSection).toContain("getFeatureHrefForCapabilityItem");
    expect(productProofSection).toContain("href={item.href}");
  });

  it("maps every marketed capability item to a feature landing page", () => {
    const featurePaths = new Set(
      featureFiles.map((file) => `/features/${file.replace(/\.md$/, "")}`),
    );
    const failures: string[] = [];

    for (const capability of getMarketedCapabilities()) {
      for (const item of capability.items) {
        const href = getFeatureHrefForCapabilityItem(item);

        if (!href) {
          failures.push(`${capability.slug}: "${item}" has no feature landing page`);
          continue;
        }
        if (!featurePaths.has(href)) {
          failures.push(`${capability.slug}: "${item}" links to missing page ${href}`);
        }
      }
    }

    expect(failures, `Capability feature-link failures:\n${failures.join("\n")}`).toEqual([]);
  });

  it("renders the features hub as clickable feature cards", () => {
    const hubPage = readFileSync(join(import.meta.dirname, "pages/features/index.astro"), "utf8");

    expect(hubPage).toContain("CategoryHub");
    expect(hubPage).toContain("mapToContentItems");
    expect(hubPage).toContain("`/features/${getContentEntrySlug(e)}`");
  });

  it("gives every feature a problem-first landing page body", () => {
    const failures: string[] = [];

    for (const file of featureFiles) {
      const source = readFileSync(join(featuresDirectory, file), "utf8");
      const frontmatter = getFrontmatter(source);
      const body = getBody(source);
      const firstProblem = body.search(/^## The problem$/m);
      const isPlanned = /^status:\s*"?planned"?$/m.test(frontmatter);
      const solutionHeading = isPlanned
        ? /^## How GrantPipe plans to solve it$/m
        : /^## How GrantPipe solves it$/m;
      const firstSolution = body.search(solutionHeading);

      if (firstProblem === -1) {
        failures.push(`${file}: missing "## The problem"`);
      }
      if (firstSolution === -1) {
        failures.push(
          `${file}: missing "${
            isPlanned ? "## How GrantPipe plans to solve it" : "## How GrantPipe solves it"
          }"`,
        );
      }
      if (firstProblem > firstSolution || firstProblem > 500) {
        failures.push(`${file}: must lead with the problem before the solution`);
      }
      if (countWords(body) < 600) {
        failures.push(`${file}: needs at least 600 body words to explain the feature in depth`);
      }
    }

    expect(failures, `Feature landing page structure failures:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps feature pages AI-search extractable and internally linked", () => {
    const failures: string[] = [];

    for (const file of featureFiles) {
      const source = readFileSync(join(featuresDirectory, file), "utf8");
      const frontmatter = getFrontmatter(source);
      const body = getBody(source);
      const relatedPages = getListField(frontmatter, "relatedPages").map((path) =>
        path.replace(/\/$/, ""),
      );
      const bodyLinks = getMarkdownLinks(body);
      const featureLinks = new Set(
        [...relatedPages, ...bodyLinks].filter(
          (path) => path.startsWith("/features/") && !path.endsWith(file.replace(/\.md$/, "")),
        ),
      );

      if (!/^schema:\s*"?SoftwareApplication"?$/m.test(frontmatter)) {
        failures.push(`${file}: schema must be SoftwareApplication`);
      }
      if (!/^targetKeyword:/m.test(frontmatter)) {
        failures.push(`${file}: missing targetKeyword`);
      }
      if (countYamlItems(frontmatter, "answers") < 2) {
        failures.push(`${file}: needs at least two answer blocks`);
      }
      if (countYamlItems(frontmatter, "faqs") < 3) {
        failures.push(`${file}: needs at least three FAQs`);
      }
      if (countYamlItems(frontmatter, "sourceUrls") < 1) {
        failures.push(`${file}: needs at least one source URL`);
      }
      if (!relatedPages.includes("/product")) {
        failures.push(`${file}: relatedPages must link to /product`);
      }
      if (!relatedPages.includes("/pricing")) {
        failures.push(`${file}: relatedPages must link to /pricing`);
      }
      if (featureLinks.size < 2) {
        failures.push(`${file}: needs at least two links to adjacent feature pages`);
      }
    }

    expect(failures, `Feature AI-search/internal-link failures:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps feature copy humanized and free of em dashes", () => {
    const failures: string[] = [];
    const aiPatterns = [
      /\bstands as\b/i,
      /\bserves as\b/i,
      /\bseamless\b/i,
      /\bempower\b/i,
      /\btransform\b/i,
      /\bunlock\b/i,
      /\bdelve\b/i,
      /\bever-changing landscape\b/i,
      /\bno guessing\b/i,
      /\bno wasted motion\b/i,
      /\bnot just\b/i,
    ];

    for (const file of featureFiles) {
      const source = readFileSync(join(featuresDirectory, file), "utf8");
      if (source.includes("\u2014")) {
        failures.push(`${file}: contains an em dash`);
      }
      if (source.includes("grantpipe:signup")) {
        failures.push(`${file}: contains a grantpipe:signup pseudo-link`);
      }
      for (const pattern of aiPatterns) {
        const match = source.match(pattern);
        if (match) {
          failures.push(`${file}: matched ${pattern} with "${match[0]}"`);
        }
      }
    }

    expect(failures, `Feature humanizer failures:\n${failures.join("\n")}`).toEqual([]);
  });

  it("keeps Grant Budget Sentinel plan copy aligned with pricing entitlements", () => {
    const source = readFileSync(join(featuresDirectory, "grant-budget-sentinel.md"), "utf8");

    expect(source).toContain("entitlement: hasGrantBudgetAlerts");
    expect(source).toContain("Every paid plan has Budget Sentinel.");
    expect(source).toContain("Near-limit items show in the Sentinel view but do not send email.");
    expect(source).not.toContain("Starter plan does not include this feature.");
    expect(source).not.toContain("Gated to Growth plan and above");
  });

  it("keeps feature template mobile-first and landing-page specific", () => {
    const template = readFileSync(join(import.meta.dirname, "pages/features/[slug].astro"), "utf8");
    const articleLayout = readFileSync(
      join(import.meta.dirname, "../../../packages/ui/src/site/layouts/article-layout.astro"),
      "utf8",
    );
    const siteHeader = readFileSync(
      join(import.meta.dirname, "../../../packages/ui/src/site/components/site-header.astro"),
      "utf8",
    );

    expect(template).toContain("data-feature-landing-page");
    expect(template).toContain("markIntroAsHero");
    expect(articleLayout).toContain("data-hero={markIntroAsHero ? true : undefined}");
    expect(template).toContain("showStickyMobileCta");
    expect(template).not.toContain('price: "0"');
    expect(template).not.toMatch(/(?<![a-z]:)grid-cols-[2-6]/);
    expect(siteHeader).toMatch(/data-mobile-nav-trigger[\s\S]*?rounded-full/);
    expect(
      getButtonLikeClasses(siteHeader).filter((className) =>
        /\brounded-(?:sm|md)\b/.test(className),
      ),
    ).toEqual([]);
  });

  it("keeps every feature content file represented", () => {
    expect(
      featureFiles.map((file) => relative(featuresDirectory, join(featuresDirectory, file))),
    ).toEqual([
      "accounting-anomaly-detector.md",
      "acknowledgment-year-end-statement-run.md",
      "ai-award-document-intake.md",
      "ask-your-ledger.md",
      "audit-readiness-score-binder-starter.md",
      "audit-trail-activity-log.md",
      "auditor-funder-portal.md",
      "board-member-portal.md",
      "board-packet-composer.md",
      "compliance-deadline-radar.md",
      "configurable-dashboard-role-home.md",
      "cross-entity-report-builder.md",
      "csv-donor-import.md",
      "custom-fields.md",
      "data-migration-onboarding-studio.md",
      "donor-lapse-early-warning.md",
      "donor-retention-reporting.md",
      "donor-segmentation.md",
      "functional-expense-allocation-studio.md",
      "funder-reporting-templates.md",
      "grant-budget-sentinel.md",
      "grant-calendar-deadline-alerts.md",
      "grant-drawdowns-reimbursements.md",
      "grant-pipeline-management.md",
      "guided-onboarding-import-setup.md",
      "multi-entity-consolidation.md",
      "outbound-donor-email-mail-merge.md",
      "outcome-impact-measurement-layer.md",
      "payroll-allocation.md",
      "pledge-multi-year-commitment-tracker.md",
      "proposal-report-drafting-assistant.md",
      "reimbursement-cash-flow-radar.md",
      "restricted-fund-tracking.md",
      "restriction-auto-classifier.md",
      "restriction-aware-gl-classification.md",
      "role-based-permissions.md",
      "sefa-builder-single-audit-tripwire.md",
      "soft-credit-tracking.md",
      "subrecipient-monitoring.md",
    ]);
  });
});
