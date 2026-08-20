import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";
import { grantCategoryPages } from "../config/grant-recipient-seo";
import { getCompetitorProfile } from "../config/market-facts";
import { siteConfig } from "../config/site";
import { buildVersusComparisonPath } from "../lib/page-helpers";
import { marketingContentDirectory } from "../lib/marketing-content-root";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";

const contentCollections = new Set([
  "alternatives",
  "benchmarks",
  "city-pages",
  "comparisons",
  "faq-hubs",
  "features",
  "glossary",
  "guides",
  "integrations",
  "lead-magnets",
  "listicles",
  "personas",
  "pricing-breakdowns",
  "state-pages",
  "vertical-pages",
  "workflows",
]);

function readContentFile(relativePath: string): string {
  const normalized = relativePath.replace(/^\.\//, "");
  const firstSegment = normalized.split("/")[0] ?? "";
  if (contentCollections.has(firstSegment)) {
    return readFileSync(join(marketingContentDirectory, normalized), "utf8");
  }

  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function normalizePath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function normalizePublicUrlPath(value: string): string {
  if (value.startsWith("https://grantpipe.com/")) {
    return normalizePath(new URL(value).pathname);
  }
  return normalizePath(value);
}

function getFilesFromAbsoluteDir(absoluteDir: string, extensions: readonly string[]): string[] {
  if (!existsSync(absoluteDir)) {
    return [];
  }

  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return getFilesFromAbsoluteDir(join(absoluteDir, entry.name), extensions);
    }
    return extensions.some((extension) => entry.name.endsWith(extension))
      ? [join(absoluteDir, entry.name)]
      : [];
  });
}

function getMarkdownFilesFromRelativeDir(relativeDir: string): string[] {
  return getFilesFromAbsoluteDir(
    join(marketingContentDirectory, relativeDir.replace(/^\.\//, "")),
    [".md"],
  );
}

function getFrontmatter(source: string): string {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Expected frontmatter block");
  }
  return match[1]!;
}

function getBody(source: string): string {
  const match = source.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Expected markdown body");
  }
  return match[1]!;
}

function getScalarField(frontmatter: string, field: string): string | null {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(?:"([^"]+)"|([^\\n#]+))$`, "m"));
  return match?.[1]?.trim() ?? match?.[2]?.trim() ?? null;
}

function getNestedScalarField(
  frontmatter: string,
  parentField: string,
  childField: string,
): string | null {
  const match = frontmatter.match(
    new RegExp(
      `^${parentField}:\\r?\\n(?:[ \\t]+.*\\r?\\n)*?[ \\t]+${childField}:\\s*(?:"([^"]+)"|([^\\n#]+))$`,
      "m",
    ),
  );
  return match?.[1]?.trim() ?? match?.[2]?.trim() ?? null;
}

function getListField(frontmatter: string, field: string): string[] {
  const match = frontmatter.match(new RegExp(`^${field}:\\n((?:\\s+-\\s+.+\\n?)+)`, "m"));
  if (!match) {
    return [];
  }

  return [...match[1]!.matchAll(/^\s+-\s+(?:"([^"]+)"|([^\n#]+))$/gm)].map((entry) =>
    (entry[1] ?? entry[2])!.trim(),
  );
}

function countFieldOccurrences(frontmatter: string, field: string): number {
  return (frontmatter.match(new RegExp(`^${field}:`, "gm")) ?? []).length;
}

function getFileSlug(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/, "");
}

function buildKnownPublicContentPaths(): Set<string> {
  const paths = new Set<string>([
    "/books",
    "/compare",
    "/compare/grantpipe-vs-quickbooks",
    "/compare/alternatives",
    ...grantCategoryPages.map((page) => page.href),
    "/resources",
    "/nonprofit-software",
    "/solutions",
    "/free",
    // Topic hub routes generated from topicHubs config - not discoverable by file scan
    "/resources/topics/grant-compliance",
    "/resources/topics/grant-management",
    "/resources/topics/donor-operations",
    "/resources/topics/restricted-fund-accounting",
    "/resources/topics/nonprofit-crm",
  ]);

  for (const filePath of getMarkdownFilesFromRelativeDir("./alternatives")) {
    const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
    const slug = getNestedScalarField(frontmatter, "competitor", "slug");
    if (!slug) {
      throw new Error(`Missing competitor.slug in ${filePath}`);
    }
    paths.add(`/compare/alternatives/${slug}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./comparisons")) {
    const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
    const slugA = getNestedScalarField(frontmatter, "competitorA", "slug");
    const nameA = getNestedScalarField(frontmatter, "competitorA", "name");
    const slugB = getNestedScalarField(frontmatter, "competitorB", "slug");
    const nameB = getNestedScalarField(frontmatter, "competitorB", "name");
    if (!slugA || !nameA || !slugB || !nameB) {
      throw new Error(`Missing competitor comparison metadata in ${filePath}`);
    }
    paths.add(
      buildVersusComparisonPath({ slug: slugA, name: nameA }, { slug: slugB, name: nameB }),
    );
    paths.add(`/compare/versus/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./pricing-breakdowns")) {
    const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
    const slug = getNestedScalarField(frontmatter, "competitor", "slug");
    if (!slug) {
      throw new Error(`Missing competitor.slug in ${filePath}`);
    }
    paths.add(`/compare/pricing/${slug}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./listicles")) {
    paths.add(`/resources/best/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./guides")) {
    paths.add(`/resources/guides/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./state-pages")) {
    paths.add(`/nonprofit-software/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./city-pages")) {
    const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
    const stateSlug = getScalarField(frontmatter, "stateSlug");
    const citySlug = getScalarField(frontmatter, "citySlug");
    if (stateSlug && citySlug) {
      paths.add(`/nonprofit-software/${stateSlug}/${citySlug}`);
    }
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./vertical-pages")) {
    paths.add(`/solutions/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./lead-magnets")) {
    paths.add(`/free/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./personas")) {
    paths.add(`/for/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./workflows")) {
    paths.add(`/workflows/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./glossary")) {
    paths.add(`/glossary/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./features")) {
    paths.add(`/features/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./integrations")) {
    paths.add(`/integrations/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./benchmarks")) {
    paths.add(`/resources/benchmarks/${getFileSlug(filePath)}`);
  }

  for (const filePath of getMarkdownFilesFromRelativeDir("./faq-hubs")) {
    paths.add(`/resources/faq/${getFileSlug(filePath)}`);
  }

  return paths;
}

function getIndexedContentFiles(): string[] {
  return [
    ...getMarkdownFilesFromRelativeDir("./alternatives"),
    ...getMarkdownFilesFromRelativeDir("./comparisons"),
    ...getMarkdownFilesFromRelativeDir("./pricing-breakdowns"),
    ...getMarkdownFilesFromRelativeDir("./listicles"),
    ...getMarkdownFilesFromRelativeDir("./guides"),
    ...getMarkdownFilesFromRelativeDir("./state-pages"),
    ...getMarkdownFilesFromRelativeDir("./vertical-pages"),
    ...getMarkdownFilesFromRelativeDir("./lead-magnets"),
  ];
}

function getIndexedSeoContentFiles(): string[] {
  return [
    ...getMarkdownFilesFromRelativeDir("./alternatives"),
    ...getMarkdownFilesFromRelativeDir("./comparisons"),
    ...getMarkdownFilesFromRelativeDir("./pricing-breakdowns"),
    ...getMarkdownFilesFromRelativeDir("./listicles"),
    ...getMarkdownFilesFromRelativeDir("./guides"),
    ...getMarkdownFilesFromRelativeDir("./state-pages"),
    ...getMarkdownFilesFromRelativeDir("./city-pages"),
    ...getMarkdownFilesFromRelativeDir("./vertical-pages"),
    ...getMarkdownFilesFromRelativeDir("./personas"),
  ];
}

function getPersonaContentFiles(): string[] {
  return getMarkdownFilesFromRelativeDir("./personas");
}

function getPriorityAiSeoContentFiles(): string[] {
  return [
    ...getPersonaContentFiles(),
    ...[
      "comparisons/bloomerang-vs-salesforce-nonprofit.md",
      "comparisons/blackbaud-vs-bloomerang.md",
      "comparisons/grantpipe-vs-instrumentl.md",
      "alternatives/bloomerang-alternative.md",
      "pricing-breakdowns/instrumentl-pricing.md",
      "pricing-breakdowns/little-green-light-pricing.md",
      "listicles/best-grant-compliance-software.md",
      "guides/nonprofit-crm-pricing-guide.md",
      "guides/salesforce-nonprofit-cost.md",
      "guides/nonprofit-grant-compliance-guide.md",
      "lead-magnets/grant-compliance-checklist.md",
      "state-pages/california.md",
      "city-pages/los-angeles.md",
      "vertical-pages/arts-organizations.md",
    ].map((relativePath) => join(marketingContentDirectory, relativePath)),
  ];
}

function getPublicMarketingSourceFiles(): string[] {
  return [
    ...getIndexedContentFiles(),
    fileURLToPath(new URL("../config/grant-recipient-seo.ts", import.meta.url)),
    fileURLToPath(new URL("../config/site.ts", import.meta.url)),
    fileURLToPath(new URL("../lib/homepage-content.ts", import.meta.url)),
    fileURLToPath(new URL("../lib/marketed-capabilities.ts", import.meta.url)),
  ];
}

describe("grantpipe content quality regressions", () => {
  test("homepage and product pages lead with compliance-first grant management system positioning", () => {
    const homepage = readContentFile("../pages/index.astro");
    const productPage = readContentFile("../pages/product.astro");

    expect(siteConfig.metaDescription).toMatch(/compliance-first grant management system/i);
    expect(siteConfig.tagline).toMatch(/compliance-first grant management system/i);
    expect(homepage).toMatch(/title="[^"]*Compliance-First Grant Management System/i);
    expect(homepage).toMatch(/Compliance-first grant management system/i);
    expect(homepage).toMatch(/post-award grant work/i);
    expect(homepage).not.toMatch(
      /title="Compliance-First Operating System For Grant-Funded Nonprofits/i,
    );
    expect(homepage).not.toMatch(/grant-funded nonprofits/i);
    expect(homepage).not.toMatch(/compliance-heavy nonprofits/i);
    expect(productPage).toMatch(/compliance-first grant management system/i);
    expect(productPage).not.toMatch(/grant-funded nonprofits/i);
  });

  test("public content does not claim GrantPipe lacks multi-source opportunity tracking", () => {
    const publicContent = getPublicMarketingSourceFiles()
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(publicContent).not.toMatch(
      /grantpipe[^.\n]{0,120}(does not include|doesn't include|does not have|doesn't have|lacks|without)[^.\n]{0,120}(grant discovery database|grant database|funder database|database search)/,
    );
    expect(publicContent).not.toContain("no pre-award grant discovery database");
    expect(publicContent).not.toContain("not positioned as a dedicated grant discovery database");
    expect(publicContent).not.toContain("not positioned as a grant discovery database first");
  });

  test("pricing breakdowns include required SEO block frontmatter", () => {
    const blackbaudHiddenCosts = readContentFile(
      "./pricing-breakdowns/blackbaud-pricing-hidden-costs.md",
    );
    const bloomerangMidSize = readContentFile(
      "./pricing-breakdowns/bloomerang-pricing-for-mid-size.md",
    );
    const salesforceTrueCost = readContentFile(
      "./pricing-breakdowns/salesforce-nonprofit-true-cost.md",
    );

    expect(blackbaudHiddenCosts).toContain("tableData:");
    expect(blackbaudHiddenCosts).toContain("pricingStats:");
    expect(blackbaudHiddenCosts).toContain("answers:");

    expect(bloomerangMidSize).toContain("tableData:");
    expect(bloomerangMidSize).toContain("pricingStats:");
    expect(bloomerangMidSize).toContain("answers:");

    expect(salesforceTrueCost).toContain("tableData:");
    expect(salesforceTrueCost).toContain("pricingStats:");
    expect(salesforceTrueCost).toContain("answers:");
  });

  test("updated guides include definitions blocks", () => {
    const migrateGuide = readContentFile("./guides/how-to-migrate-from-salesforce-npsp.md");
    const marketGuide = readContentFile("./guides/nonprofit-crm-market-2026.md");
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");

    expect(migrateGuide).toContain("definitions:");
    expect(marketGuide).toContain("definitions:");
    expect(pricingGuide).toContain("definitions:");
  });

  test("new york state page uses the current AG charity count and filing language", () => {
    const newYork = readContentFile("./state-pages/new-york.md");

    expect(newYork).toContain("98,127");
    expect(newYork).not.toContain("120,000");
    expect(newYork).not.toContain("RANSCO");
    expect(newYork).toContain("Article 7-A");
  });

  test("pricing guide table keeps Salesforce in a first-year cost column", () => {
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");

    expect(pricingGuide).toContain("| Est. First-Year Total Cost |");
    expect(pricingGuide).toMatch(
      /\|\s*Salesforce Nonprofit Cloud\s*\|\s*\$60-\$100\/user\/mo \+ impl\.\s*\|\s*Per-user \+ impl\s*\|\s*\$50,000-\$100,000\+ year one\s*\|/,
    );
    expect(pricingGuide).not.toContain("$75,000-$275,000 over three years");
  });

  test("pricing guide answers current CRM cost search intent above the fold", () => {
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");
    const intro = pricingGuide.split("## How Nonprofit CRM Pricing Models Work")[0];

    expect(pricingGuide).toContain('verifiedAt: "2026-05-21"');
    expect(intro).toMatch(/nonprofit CRM pricing/i);
    expect(intro).toMatch(/average cost/i);
    expect(intro).toMatch(/donor management software pricing/i);
    expect(intro).toMatch(/Salesforce nonprofit pricing/i);
    expect(intro).toMatch(/Bloomerang pricing/i);
    expect(intro).toMatch(/Neon CRM pricing/i);
    expect(intro).toContain("[GrantPipe pricing](/pricing/)");
    expect(intro).toContain(
      "[nonprofit CRM cost calculator](/free/nonprofit-crm-cost-calculator/)",
    );
  });

  test("pricing guide answers high-impression donor-count and reporting pricing intent above the fold", () => {
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");
    const firstScreen = getBody(pricingGuide).split(/\r?\n##\s+/)[0] ?? "";

    expect(firstScreen).toMatch(/nonprofit CRM pricing/i);
    expect(firstScreen).toMatch(/donor management software pricing/i);
    expect(firstScreen).toMatch(/nonprofit reporting platform pricing/i);
    expect(firstScreen).toMatch(/25,000 donors/i);
    expect(firstScreen).toMatch(/Salesforce Nonprofit Cloud pricing/i);
    expect(firstScreen).toMatch(/\$60\/user\/month/i);
    expect(firstScreen).toMatch(/\$100\/user\/month/i);
    expect(firstScreen).toMatch(/Bloomerang pricing/i);
    expect(firstScreen).toMatch(/\$125\/month/i);
    expect(firstScreen).toMatch(/Neon CRM pricing/i);
    expect(firstScreen).toMatch(/\$99\/month/i);
    expect(firstScreen).toMatch(/contact-tier vendors/i);
    expect(firstScreen).toMatch(/revenue-based tools/i);
    // Collapse the column-alignment padding Prettier adds to markdown tables so
    // the cell content is asserted without coupling to whitespace formatting.
    const collapsedTableCells = firstScreen.replace(/[ \t]*\|[ \t]*/g, " | ");
    expect(collapsedTableCells).toContain("| Budget question | Short answer |");
    expect(collapsedTableCells).toContain("| 25,000 donors or records |");
    expect(collapsedTableCells).toContain("| Reporting platform plus CRM |");

    expect(pricingGuide).not.toMatch(/GrantPipe \(\$20-\$99\/mo\)/i);
    expect(pricingGuide).not.toMatch(/CRM pricing from free to \$15K\+\/yr/i);
  });

  test("pricing guide keeps sourced vendor claims current", () => {
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");

    expect(pricingGuide).not.toMatch(/\$39-\$90/);
    expect(pricingGuide).not.toMatch(/\$99-\$299/);
    expect(pricingGuide).not.toMatch(/\$60-\$165/);
    expect(pricingGuide).not.toMatch(/TechSoup/i);
    expect(pricingGuide).not.toMatch(/\$36-\$65/);
    expect(pricingGuide).not.toMatch(/80-90%/);

    expect(pricingGuide).toContain("$45-$135/mo");
    expect(pricingGuide).toContain("$134-$379/mo annually");
    expect(pricingGuide).toContain("$60-$100/user/mo");
    expect(pricingGuide).toContain("$325/user/mo");
    expect(pricingGuide).toContain("$99/mo");
    expect(pricingGuide).toContain("Power of Us");
    expect(pricingGuide).toContain("10 free Nonprofit Cloud Enterprise");
    expect(pricingGuide).toMatch(/HubSpot[^.\n]+up to two users/i);
    expect(pricingGuide).toMatch(/Bloomerang[^.\n]+grant tracking/i);
    expect(pricingGuide).toMatch(/restricted fund compliance/i);

    expect(pricingGuide).toContain("https://www.salesforce.com/nonprofit/pricing/");
    expect(pricingGuide).toContain("https://www.salesforce.com/company/power-of-us/");
    expect(pricingGuide).toContain("https://www.littlegreenlight.com/pricing/");
    expect(pricingGuide).toContain("https://bloomerang.com/pricing/");
    expect(pricingGuide).toContain("https://www.keela.co/pricing");
    expect(pricingGuide).toContain("https://www.hubspot.com/products/crm");
    expect(pricingGuide).toContain("https://neonone.com/pricing/");
  });

  test("adjacent CRM pricing pages do not contradict current public pricing", () => {
    const neonPricing = readContentFile("./pricing-breakdowns/neon-crm-pricing.md");
    const bloomerangMidSize = readContentFile(
      "./pricing-breakdowns/bloomerang-pricing-for-mid-size.md",
    );

    expect(neonPricing).not.toMatch(/does not publish pricing/i);
    expect(neonPricing).not.toMatch(/custom \(contact sales\)/i);
    expect(neonPricing).toContain("$99/month");
    expect(neonPricing).toContain("revenue-based");
    expect(neonPricing).toContain("https://neonone.com/pricing/");
    expect(neonPricing).toContain(
      "https://neonone.com/solutions/neon-crm-overview/neon-crm-pricing/",
    );

    expect(bloomerangMidSize).not.toMatch(/\$199\/mo/);
    expect(bloomerangMidSize).not.toMatch(/\$249\/mo/);
    expect(bloomerangMidSize).not.toMatch(/\$399\/mo/);
    expect(bloomerangMidSize).not.toContain("https://bloomerang.co/pricing");
    expect(bloomerangMidSize).not.toMatch(/no grant (module|management)/i);
    expect(bloomerangMidSize).toContain("https://bloomerang.com/pricing/");
    expect(bloomerangMidSize).toContain("$125/month");
    expect(bloomerangMidSize).toMatch(/grant tracking/i);
    expect(bloomerangMidSize).toMatch(/restricted fund compliance/i);
  });

  test("guide frontmatter uses tofu and the pricing guide removes the $99-$99 typo", () => {
    const migrateGuide = readContentFile("./guides/how-to-migrate-from-salesforce-npsp.md");
    const pricingGuide = readContentFile("./guides/nonprofit-crm-pricing-guide.md");

    expect(migrateGuide).toContain('buyerStage: "tofu"');
    expect(pricingGuide).toContain('buyerStage: "tofu"');
    expect(pricingGuide).not.toContain("$99-$99/month");
  });

  test("state grant program metadata does not overstate foundation coverage", () => {
    const stateGrantProgramFiles = getMarkdownFilesFromRelativeDir("./guides").filter((filePath) =>
      filePath.endsWith("-state-grant-programs-for-nonprofits.md"),
    );

    for (const filePath of stateGrantProgramFiles) {
      const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
      const fields = ["description", "seoDescription"] as const;

      for (const field of fields) {
        const value = getScalarField(frontmatter, field);
        if (!value) {
          continue;
        }

        expect(
          value,
          `${filePath} ${field} should not claim complete foundation mapping`,
        ).not.toMatch(/\bcomplete map\b/i);
        expect(
          value,
          `${filePath} ${field} should not imply ranked private foundation coverage`,
        ).not.toMatch(/\btop private foundations\b/i);
      }
    }
  });

  test("high-intent roundup pages keep their target terms in title and description", () => {
    const crmReviews = readContentFile("./listicles/nonprofit-crm-reviews.md");
    const grantSoftware = readContentFile(
      "./listicles/best-grant-management-software-small-nonprofits.md",
    );

    expect(crmReviews).toContain(
      'title: "Nonprofit CRM Reviews: 5 Systems Rated on Pricing, Grants, and Fit [2026]"',
    );
    expect(crmReviews).toContain(
      'description: "These nonprofit CRM reviews compare 5 systems on pricing, donor CRM depth, support, and whether they handle restricted grants without a second tool."',
    );
    expect(grantSoftware).toContain(
      'title: "Best Grant Management Software for Small Nonprofits [2026 Pricing Comparison]"',
    );
    expect(grantSoftware).toContain(
      'description: "We compared 7 grant management tools for small nonprofits on price, donor CRM coverage, grant compliance, and which options still leave you in spreadsheets."',
    );
  });

  test("high-intent comparison pages keep target titles and schema opt-out", () => {
    const blackbaudVsBloomerang = readContentFile("./comparisons/blackbaud-vs-bloomerang.md");
    const givebutterVsBloomerang = readContentFile("./comparisons/givebutter-vs-bloomerang.md");
    const bloomerangVsSalesforce = readContentFile(
      "./comparisons/bloomerang-vs-salesforce-nonprofit.md",
    );

    expect(blackbaudVsBloomerang).toContain(
      'title: "Blackbaud vs Bloomerang: Pricing, Contracts, and Grant Fit [2026]"',
    );
    expect(blackbaudVsBloomerang).toContain("disableProsConsSchema: true");
    expect(givebutterVsBloomerang).toContain(
      'title: "Givebutter vs Bloomerang: Pricing, CRM Depth, and Grant Fit [2026]"',
    );
    expect(givebutterVsBloomerang).toContain("disableProsConsSchema: true");
    expect(bloomerangVsSalesforce).toContain(
      'title: "Bloomerang vs Salesforce Nonprofit: Total Cost and Grant Fit [2026]"',
    );
    expect(bloomerangVsSalesforce).toContain("disableProsConsSchema: true");
  });

  test("versus pages read schema behavior from frontmatter instead of disabling it globally", () => {
    const versusPage = readContentFile("./../pages/compare/versus/[slugA]-vs-[slugB].astro");

    expect(versusPage).toContain("disableProsConsSchema");
    expect(versusPage).toContain("emitSchema={!disableProsConsSchema}");
    expect(versusPage).not.toContain("emitSchema={false}");
  });

  test("versus pages normalize GrantPipe comparison columns through a shared table helper", () => {
    const versusPage = readContentFile("./../pages/compare/versus/[slugA]-vs-[slugB].astro");

    expect(versusPage).toContain("buildVersusComparisonTable");
    expect(versusPage).toContain("buildVersusComparisonPath");
    expect(versusPage).toContain("normalizeVersusComparisonTitle");
    expect(versusPage).toContain("seoTitle={normalizedSeoTitle}");
    expect(versusPage).toContain("seoDescription={seoDescription}");
    expect(versusPage).toContain("headers={comparisonTable.headers}");
    expect(versusPage).toContain("rows={comparisonTable.rows}");
    expect(versusPage).toContain("highlightColumn={comparisonTable.highlightColumn}");
  });

  test("commercial comparison templates present GrantPipe as the winner", () => {
    const alternativePage = readContentFile("../pages/compare/alternatives/[slug].astro");
    const versusPage = readContentFile("../pages/compare/versus/[slugA]-vs-[slugB].astro");
    const pricingPage = readContentFile("../pages/compare/pricing/[slug].astro");
    const listiclePage = readContentFile("../pages/resources/best/[slug].astro");

    expect(alternativePage).toContain("Winner: GrantPipe");
    expect(versusPage).toContain("Best overall: GrantPipe");
    expect(pricingPage).toContain("Best value: GrantPipe");
    expect(listiclePage).toContain("GrantPipe fit");
    expect(listiclePage).not.toMatch(/best overall/i);
    expect(listiclePage).toContain('tool.name === "GrantPipe"');
  });

  test("commercial comparison copy does not name another vendor as the winner", () => {
    const contentFiles = [
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("./alternatives", import.meta.url)), [
        ".md",
      ]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("./comparisons", import.meta.url)), [".md"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("./pricing-breakdowns", import.meta.url)), [
        ".md",
      ]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("./listicles", import.meta.url)), [".md"]),
    ];
    const competitorNames =
      "(?:Airtable|AmpliFund|Aplos|Blackbaud|Bloomerang|CharityEngine|DonorPerfect|Foundant(?: GrantHub)?|Givebutter|Instrumentl|Keela|Little Green Light|NeonCRM|Neon CRM|Network for Good|QuickBooks(?: Online)?|Salesforce(?: Nonprofit)?|SmartSimple|Submittable|Virtuous|WizeHive)";
    const forbiddenPatterns = [
      new RegExp(`\\b${competitorNames} wins\\b`),
      new RegExp(`\\bWhere ${competitorNames} wins\\b`),
      new RegExp(`\\b${competitorNames} is usually the better fit\\b`),
      new RegExp(`\\b${competitorNames} is the better choice\\b`),
      new RegExp(`\\b${competitorNames} is the better value\\b`),
      new RegExp(`\\b${competitorNames} is usually the more practical choice\\b`),
      /GrantPipe is one option\b/,
    ];

    for (const filePath of contentFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${filePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("content does not leak legacy GrantPipe pricing or trial claims", () => {
    const contentFiles = [
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL(".", import.meta.url)), [".md"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../pages", import.meta.url)), [".astro"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../lib", import.meta.url)), [".ts"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../../public", import.meta.url)), [
        ".md",
        ".txt",
      ]),
      ...getFilesFromAbsoluteDir(
        fileURLToPath(new URL("../../../../output/pdf", import.meta.url)),
        [".html"],
      ),
    ];
    const forbiddenPatterns = [
      /\$20\/mo/i,
      /\$20-\$99(\/mo|\/month|month)?/i,
      /14-day free trial/i,
      /Start Your 14-Day Free Trial/i,
      /pre-launch/i,
      /cancel anytime before day 30/i,
      /1-month \(30-day\)/i,
      /free trial \(card required\)/i,
      /1-month free trial[^.\n]*(?<!no )credit card required/i,
      /GrantPipe[^.\n]*(?<!no )credit card required/i,
      /GrantPipe is \$159-\$799\/month self-serve with zero implementation cost/i,
      /\$199-\$799\/mo flat self-serve/i,
      /GrantPipe[^.\n]*(?:contact sales|contact-sales)/i,
      /Over three years, GrantPipe costs \$3,564-\$17,964 total/i,
      /LAUNCH(?:30|50)/i,
      /before (the )?LAUNCH(?:30|50)/i,
      /lists? at [^."]+ at list price/i,
      /Enterprise \$1,599\/mo contact-sales/i,
      /30% off your first year/i,
      /30% off the first year/i,
      /30% off first-year promotion/i,
      /first-year limited price/i,
      /First year promo through/i,
      /\$159\/mo or \$129\/mo billed annually/i,
      /Self-serve plans start at \$129\/month/i,
      /Starter \$129\/mo billed annually/i,
      /\$1,548/i,
      /contact-salesers/i,
      /self-serventh/i,
      /\bpricing\s+,/i,
      /\bflAt\b/,
      /many self-serve plans/i,
      /11,599/i,
      /1159-1799/i,
      /audit-ready 1499/i,
      /starter 199/i,
    ];

    for (const filePath of contentFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${filePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("competitor pricing fields keep competitor custom pricing", () => {
    const competitorPricingFiles = [
      "pricing-breakdowns/airtable-nonprofit-pricing.md",
      "pricing-breakdowns/ecivis-pricing.md",
      "pricing-breakdowns/donorperfect-pricing.md",
      "comparisons/bloomerang-vs-donorperfect.md",
      "listicles/best-peer-to-peer-fundraising-platforms.md",
    ];

    for (const relativePath of competitorPricingFiles) {
      const source = readContentFile(relativePath);
      expect(source, relativePath).not.toMatch(
        /(?:pricing:|price:|Enterprise Scale:|DonorPerfect uses)[^\n]*Enterprise \$1,599/i,
      );
    }
  });

  test("shared trial copy stays aligned across site config", () => {
    const siteConfigSource = readContentFile("../config/site.ts");

    expect(siteConfigSource).toContain("grantPipeTrialCopy");
    expect(siteConfigSource).toContain("marketingKnowledge.trial.copy");
    expect(marketingKnowledge.trial.copy).toContain("No credit card required to start.");
  });

  test("books page keeps the QuickBooks accounting boundary", () => {
    const booksSource = readContentFile("../pages/books.astro");
    const forbiddenAccountingClaims = [
      /Do I still need QuickBooks\?",\s*a:\s*"No\./,
      /GrantPipe Books replaces QuickBooks/i,
      /GrantPipe replaces QuickBooks/i,
      /posts every journal entry/i,
      /removes all reconciliation work/i,
    ];

    expect(booksSource).toContain("GrantPipe Books has native accounting records");
    expect(booksSource).toContain("It does not sync with QuickBooks right now");
    for (const pattern of forbiddenAccountingClaims) {
      expect(booksSource, `books page matched ${pattern}`).not.toMatch(pattern);
    }
  });

  test("GrantPipe founder and LinkedIn attribution stay canonical", () => {
    const siteConfigSource = readContentFile("../config/site.ts");
    const aboutSource = readContentFile("../pages/about.astro");
    const baseLayoutSource = readFileSync(
      fileURLToPath(
        new URL("../../../../packages/ui/src/site/layouts/base-layout.astro", import.meta.url),
      ),
      "utf8",
    );
    const postPrompt = readFileSync(
      fileURLToPath(
        new URL("../../../../scripts/linkedin/prompts/system-post.md", import.meta.url),
      ),
      "utf8",
    );
    const articlePrompt = readFileSync(
      fileURLToPath(
        new URL("../../../../scripts/linkedin/prompts/system-article.md", import.meta.url),
      ),
      "utf8",
    );
    const linkedInGenerator = readFileSync(
      fileURLToPath(new URL("../../../../scripts/linkedin/generate-day.ts", import.meta.url)),
      "utf8",
    );

    expect(siteConfigSource).toContain("marketingKnowledge.founder.name");
    expect(marketingKnowledge.founder.name).toBe("Angel Campa");
    // site.ts wires the founder LinkedIn through the canonical FOUNDER_LINKEDIN_URL
    // constant (single source of truth in @grantpipe/shared) rather than a duplicated
    // literal; assert the wiring here and the canonical value at its source.
    expect(siteConfigSource).toContain("FOUNDER_LINKEDIN_URL");
    expect(marketingKnowledge.founder.sameAs).toContain("https://www.linkedin.com/in/angelcampa1/");
    expect(siteConfigSource).toContain("https://www.linkedin.com/company/grantpipe/");
    expect(siteConfigSource).toContain("GrantPipe LinkedIn");
    expect(siteConfigSource).toContain("Angel Campa LinkedIn");
    expect(baseLayoutSource).toContain("siteFounder");
    expect(baseLayoutSource).toContain("siteSameAs");
    expect(aboutSource).toContain("author.sameAs");
    expect(aboutSource).toContain("https://www.linkedin.com/in/angelcampa1/");
    expect(postPrompt).toContain("Angel Campa");
    expect(postPrompt).toContain("founder and author");
    expect(articlePrompt).toContain("Angel Campa");
    expect(articlePrompt).toContain("not from the GrantPipe team");
    expect(linkedInGenerator).toContain("This article is from Angel Campa");
    expect(linkedInGenerator).not.toContain("This article is from the GrantPipe team");
  });

  test("indexed content keeps unique seo titles", () => {
    const seoTitles = new Map<string, string>();

    for (const filePath of getIndexedContentFiles()) {
      const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
      const seoTitle = getScalarField(frontmatter, "seoTitle");
      if (!seoTitle) {
        continue;
      }

      const existingPath = seoTitles.get(seoTitle);
      expect(
        existingPath,
        `${filePath} duplicated seoTitle "${seoTitle}" with ${existingPath}`,
      ).toBeUndefined();
      seoTitles.set(seoTitle, filePath);
    }
  });

  test("indexed content keeps authored descriptions within snippet-safe length", () => {
    for (const filePath of getIndexedContentFiles()) {
      const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
      const description =
        getScalarField(frontmatter, "seoDescription") ?? getScalarField(frontmatter, "description");

      expect(description, `${filePath} is missing description metadata`).toBeTruthy();
      expect(
        description!.length,
        `${filePath} has description metadata longer than 160 characters`,
      ).toBeLessThanOrEqual(160);
    }
  });

  test("collection route templates pass authored SEO metadata and verified dates into shared layouts", () => {
    const routeFiles = [
      "../pages/resources/guides/[slug].astro",
      "../pages/resources/best/[slug].astro",
      "../pages/compare/alternatives/[slug].astro",
      "../pages/compare/pricing/[slug].astro",
      "../pages/compare/versus/[slugA]-vs-[slugB].astro",
      "../pages/nonprofit-software/[slug].astro",
      "../pages/solutions/[slug].astro",
    ];

    for (const relativePath of routeFiles) {
      const source = readContentFile(relativePath);

      expect(source, `${relativePath} does not pass seoTitle`).toMatch(
        /seoTitle=\{(?:seoTitle|normalizedSeoTitle)\}/,
      );
      expect(source, `${relativePath} does not pass seoDescription`).toContain(
        "seoDescription={seoDescription}",
      );
      expect(source, `${relativePath} does not pass verifiedAt`).toMatch(
        /verifiedAt=\{(?:verifiedAt|resolvedVerifiedAt)\}/,
      );
    }
  });

  test("grant recipient category pages pass verified dates into the shared article layout", () => {
    const source = readContentFile("../components/grant-recipient-category-page.astro");

    expect(source).toContain("seoTitle={page.seoTitle}");
    expect(source).toContain("seoDescription={page.seoDescription}");
    expect(source).toContain("verifiedAt={page.verifiedAt}");
  });

  test("lead magnet pages render the shared freshness and source metadata block", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../packages/ui/src/site/components/lead-magnet-page.astro",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).toContain('import ArticleMeta from "./article-meta.astro"');
    expect(source).toContain("<ArticleMeta");
    expect(source).toContain("publishedAt={data.publishedAt}");
    expect(source).toContain("updatedAt={data.updatedAt}");
    expect(source).toContain("lastReviewedAt={data.lastReviewedAt}");
    expect(source).toContain("verifiedAt={data.verifiedAt}");
    expect(source).toContain("sourceUrls={data.sourceUrls}");
  });

  test("lead magnet routes resolve related page labels from the site content map", () => {
    const source = readContentFile("../pages/free/[slug].astro");

    expect(source).toContain("buildContentMap");
    expect(source).toContain("getContentEntrySlug");
    expect(source).toContain(
      '.filter((entry) => getContentEntrySlug(entry) !== "nonprofit-crm-cost-calculator")',
    );
    expect(source).toContain("params: { slug: getContentEntrySlug(entry) }");
    expect(source).toContain("resolveRelatedPageLinks");
    expect(source).toContain("const relatedPageLinks = resolveRelatedPageLinks");
    expect(source).toContain("relatedPages={relatedPageLinks}");
  });

  test("relatedPages only reference real public content routes", () => {
    const knownPaths = buildKnownPublicContentPaths();

    for (const filePath of getIndexedContentFiles()) {
      const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));
      const relatedPages = getListField(frontmatter, "relatedPages");

      for (const relatedPage of relatedPages) {
        expect(
          knownPaths.has(normalizePath(relatedPage)),
          `${filePath} references missing related page ${relatedPage}`,
        ).toBe(true);
      }
    }
  });

  test("public new-page crawl lists only reference real public content routes", () => {
    const knownPaths = buildKnownPublicContentPaths();
    const listFiles = getFilesFromAbsoluteDir(
      fileURLToPath(new URL("../../public", import.meta.url)),
      [".txt"],
    ).filter((filePath) => /new-pages-\d{4}-\d{2}-\d{2}\.txt$/.test(filePath));

    for (const filePath of listFiles) {
      const urls = readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const url of urls) {
        const normalizedPath = normalizePublicUrlPath(url);
        expect(
          knownPaths.has(normalizedPath),
          `${filePath} references missing public route ${url}`,
        ).toBe(true);
      }
    }
  });

  test("stale ad hoc XML sitemaps are not published beside the canonical sitemap index", () => {
    const publicFiles = getFilesFromAbsoluteDir(
      fileURLToPath(new URL("../../public", import.meta.url)),
      [".xml"],
    );
    const staleSitemaps = publicFiles.filter((filePath) =>
      /sitemap-new-pages-\d{4}-\d{2}-\d{2}\.xml$/.test(filePath),
    );

    expect(staleSitemaps).toEqual([]);
  });

  test("stable public navigation exposes machine-readable agent resources", () => {
    const siteConfigSource = readContentFile("../config/site.ts");

    for (const href of ["/llms.txt", "/llms-full.txt", "/pricing.txt", "/AGENTS.md"]) {
      expect(siteConfigSource, `missing stable public link to ${href}`).toContain(
        `href: "${href}"`,
      );
    }
  });

  test("state and city routes pass answer blocks into ArticleLayout for FAQ schema", () => {
    const stateRoute = readContentFile("../pages/nonprofit-software/[slug].astro");
    const cityRoute = readContentFile("../pages/nonprofit-software/[state]/[city].astro");

    for (const [name, source] of [
      ["state route", stateRoute],
      ["city route", cityRoute],
    ] as const) {
      expect(source, `${name} should destructure answers from frontmatter`).toContain("answers,");
      expect(source, `${name} should pass answers to ArticleLayout`).toContain(
        "answers={answers?.map(a => ({ question: a.q, answer: a.a }))}",
      );
    }
  });

  test("priority AI-search content has extractable answers, FAQs, sources, and sourced data", () => {
    const failures: string[] = [];

    for (const filePath of getPriorityAiSeoContentFiles()) {
      const source = readFileSync(filePath, "utf8");
      const frontmatter = getFrontmatter(source);
      const relativePath = filePath.replace(marketingContentDirectory + "\\", "");
      const requiredFields = ["answers", "faqs", "sourceUrls"] as const;

      for (const field of requiredFields) {
        if (countFieldOccurrences(frontmatter, field) === 0) {
          failures.push(`${relativePath}: missing ${field}`);
        }
      }

      if (!/^(statistics|pricingStats|tableData):/m.test(frontmatter)) {
        failures.push(`${relativePath}: missing statistics, pricingStats, or tableData`);
      }
    }

    expect(failures, `AI extractability failures:\n${failures.join("\n")}`).toEqual([]);
  });

  test("DFS-validated grant management pages answer commercial intent above the fold", () => {
    const grantManagementGuide = readContentFile(
      "./guides/grant-management-software-for-nonprofits.md",
    );
    const bestGrantManagement = readContentFile("./listicles/best-grant-management-software.md");

    for (const [name, source] of [
      ["grant management guide", grantManagementGuide],
      ["best grant management listicle", bestGrantManagement],
    ] as const) {
      const firstScreen = getBody(source).split(/\r?\n##\s+/)[0] ?? "";

      expect(firstScreen, `${name} should mention GrantPipe pricing early`).toMatch(
        /\[GrantPipe pricing\]\(\/pricing\/\)/,
      );
      expect(firstScreen, `${name} should route compliance buyers early`).toMatch(
        /\[grant compliance software\]\(\/grant-compliance-software\/\)/,
      );
      expect(firstScreen, `${name} should surface the checklist lead magnet early`).toMatch(
        /\[grant compliance checklist\]\(\/free\/grant-compliance-checklist\/\)/,
      );
      expect(firstScreen, `${name} should frame grant recipients, not grantmakers`).toMatch(
        /grant-receiving nonprofits|nonprofit recipients|nonprofits that receive grants/i,
      );
    }
  });

  test("GSC zero-click listicles answer buyer intent above the fold", () => {
    const pages = [
      {
        name: "best nonprofit software",
        source: readContentFile("./listicles/best-nonprofit-software-2026.md"),
        intentPattern:
          /best nonprofit software|all-in-one nonprofit software|donor CRM|grant compliance/i,
        leadMagnetPattern:
          /\[nonprofit CRM cost calculator\]\(\/free\/nonprofit-crm-cost-calculator\/\)|\[grant compliance checklist\]\(\/free\/grant-compliance-checklist\/\)/,
      },
      {
        name: "small nonprofit CRM",
        source: readContentFile("./listicles/best-nonprofit-crm-small-organizations.md"),
        intentPattern:
          /best nonprofit CRM for small organizations|affordable nonprofit CRM|small nonprofit/i,
        leadMagnetPattern:
          /\[nonprofit CRM cost calculator\]\(\/free\/nonprofit-crm-cost-calculator\/\)/,
      },
      {
        name: "affordable donor management",
        source: readContentFile("./listicles/best-donor-management-software-affordable.md"),
        intentPattern:
          /affordable donor management software|affordable donor tracking|low-cost donor/i,
        leadMagnetPattern:
          /\[nonprofit CRM cost calculator\]\(\/free\/nonprofit-crm-cost-calculator\/\)/,
      },
    ] as const;

    for (const page of pages) {
      const firstScreen = getBody(page.source).split(/\r?\n##\s+/)[0] ?? "";

      expect(firstScreen, `${page.name} should match observed GSC query intent`).toMatch(
        page.intentPattern,
      );
      expect(firstScreen, `${page.name} should link GrantPipe pricing early`).toMatch(
        /\[GrantPipe pricing\]\(\/pricing\/\)/,
      );
      expect(firstScreen, `${page.name} should surface a matching lead magnet early`).toMatch(
        page.leadMagnetPattern,
      );
    }
  });

  test("GSC nonprofit CRM cluster answers commercial intent above the fold", () => {
    const pages = [
      {
        name: "nonprofit CRM comparison",
        source: readContentFile("./listicles/nonprofit-crm-comparison.md"),
        requiredFirstScreenPatterns: [
          /nonprofit CRM comparison/i,
          /Neon CRM vs Bloomerang/i,
          /donor CRM flat-rate pricing/i,
          /grant management and donor segmentation/i,
        ],
      },
      {
        name: "nonprofit CRM reviews",
        source: readContentFile("./listicles/nonprofit-crm-reviews.md"),
        requiredFirstScreenPatterns: [
          /nonprofit CRM reviews/i,
          /customer support reviews/i,
          /free trial and onboarding/i,
          /G2 and Capterra/i,
        ],
      },
      {
        name: "free nonprofit CRM",
        source: readContentFile("./listicles/free-nonprofit-crm.md"),
        requiredFirstScreenPatterns: [
          /free nonprofit CRM/i,
          /actually free vs trial/i,
          /hidden implementation cost/i,
          /free CRM with grant management/i,
        ],
      },
      {
        name: "executive director CRM",
        source: readContentFile("./listicles/best-nonprofit-crm-executive-directors.md"),
        requiredFirstScreenPatterns: [
          /CRM for executive directors/i,
          /development director CRM/i,
          /executive dashboards/i,
          /board reporting/i,
        ],
      },
    ] as const;

    for (const page of pages) {
      const frontmatter = getFrontmatter(page.source);
      const firstScreen = getBody(page.source).split(/\r?\n##\s+/)[0] ?? "";

      expect(frontmatter, `${page.name} should have current verification metadata`).toContain(
        'verifiedAt: "2026-05-21"',
      );
      for (const pattern of page.requiredFirstScreenPatterns) {
        expect(firstScreen, `${page.name} should match observed GSC query intent`).toMatch(pattern);
      }
      expect(firstScreen, `${page.name} should link GrantPipe pricing early`).toMatch(
        /\[GrantPipe pricing\]\(\/pricing\/\)/,
      );
      expect(firstScreen, `${page.name} should route CRM evaluators to the calculator`).toMatch(
        /\[nonprofit CRM cost calculator\]\(\/free\/nonprofit-crm-cost-calculator\/\)/,
      );
    }
  });

  test("GSC nonprofit CRM cluster has sourceable pricing and review claims", () => {
    const pages = [
      {
        name: "nonprofit CRM comparison",
        source: readContentFile("./listicles/nonprofit-crm-comparison.md"),
        sourceUrls: [
          "https://bloomerang.com/pricing/",
          "https://www.salesforce.com/nonprofit/pricing/",
          "https://www.littlegreenlight.com/pricing/",
          "https://www.donorperfect.com/",
          "https://neonone.com/products/neon-crm/",
        ],
      },
      {
        name: "nonprofit CRM reviews",
        source: readContentFile("./listicles/nonprofit-crm-reviews.md"),
        sourceUrls: [
          "https://bloomerang.com/pricing/",
          "https://www.littlegreenlight.com/pricing/",
          "https://www.keela.co/pricing",
          "https://www.g2.com/categories/nonprofit-crm",
          "https://www.capterra.com/nonprofit-crm-software/",
        ],
      },
      {
        name: "free nonprofit CRM",
        source: readContentFile("./listicles/free-nonprofit-crm.md"),
        sourceUrls: [
          "https://www.hubspot.com/products/crm",
          "https://www.salesforce.com/nonprofit/pricing/",
          "https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/industries/nonprofit/S-ORG%28DG%29-Salesforce-for-NonProfit-Cloud-Pricing-Guide-Final.pdf",
          "https://www.littlegreenlight.com/pricing/",
          "https://bloomerang.com/pricing/",
        ],
      },
      {
        name: "executive director CRM",
        source: readContentFile("./listicles/best-nonprofit-crm-executive-directors.md"),
        sourceUrls: [
          "https://bloomerang.com/pricing/",
          "https://www.salesforce.com/nonprofit/pricing/",
          "https://www.littlegreenlight.com/pricing/",
          "https://www.donorperfect.com/",
        ],
      },
    ] as const;

    for (const page of pages) {
      const frontmatter = getFrontmatter(page.source);
      expect(frontmatter, `${page.name} should expose sourceUrls`).toContain("sourceUrls:");
      for (const sourceUrl of page.sourceUrls) {
        expect(frontmatter, `${page.name} should source ${sourceUrl}`).toContain(sourceUrl);
      }
    }

    const reviews = readContentFile("./listicles/nonprofit-crm-reviews.md");
    const freeCrm = readContentFile("./listicles/free-nonprofit-crm.md");
    const comparison = readContentFile("./listicles/nonprofit-crm-comparison.md");
    const executiveDirector = readContentFile(
      "./listicles/best-nonprofit-crm-executive-directors.md",
    );

    expect(freeCrm).not.toMatch(/unlimited contacts/i);
    expect(freeCrm).toMatch(/1,000 contacts/i);
    expect(freeCrm).toMatch(/up to two users/i);
    expect(freeCrm).not.toMatch(/TechSoup/i);
    expect(freeCrm).toMatch(/Salesforce's Power of Us Program/i);

    for (const source of [freeCrm, comparison, reviews]) {
      expect(source).not.toMatch(/Bloomerang[^.\n]{0,140}no grant management/i);
      expect(source).not.toMatch(/Bloomerang[^.\n]{0,140}no grant tracking/i);
      expect(source).toMatch(/Bloomerang[^.\n]{0,180}restricted fund compliance/i);
    }

    expect(reviews).not.toMatch(/\$99-\$299\/mo/);
    expect(reviews).toMatch(/\$134-\$379\/mo annually|\$160-\$430\/mo monthly/);
    expect(reviews).not.toMatch(/Keela[^.\n]{0,140}No grant lifecycle management/i);
    expect(reviews).toMatch(/Keela[^.\n]{0,180}grant management/i);

    expect(comparison).not.toMatch(/\$60-\$165\/user\/mo/);
    expect(comparison).not.toMatch(/\$325\/conversation/i);
    expect(comparison).toMatch(/\$60-\$100\/user\/mo/i);
    expect(comparison).toMatch(/\$325\/user\/mo/i);
    expect(executiveDirector).not.toMatch(/Salesforce Nonprofit Success Pack \(NPSP\)/);
    expect(executiveDirector).not.toMatch(/TechSoup/i);
    expect(executiveDirector).toMatch(/Salesforce Nonprofit Cloud/);

    expect(reviews).not.toMatch(/\b4\.\d{1,2}\/5\b/);
    expect(reviews).not.toMatch(/\b\d[\d,]* reviews\b/i);
    expect(reviews).not.toMatch(/93% customer retention|13-year average tenure/i);

    for (const source of [freeCrm, comparison, reviews, executiveDirector]) {
      expect(source).not.toMatch(/GSC query intent/i);
      expect(source).not.toMatch(/Searches for .* usually start with a software list/i);
      expect(source).not.toMatch(
        /The practical way to shortlist is to define three non-negotiables/i,
      );
      expect(source).not.toMatch(/The biggest pricing mistake in this category/i);
      expect(source).not.toMatch(
        /The better buying question is whether the system reduces reporting effort/i,
      );
    }
  });

  test("Salesforce nonprofit cost page answers official pricing intent above the fold", () => {
    const source = readContentFile("./guides/salesforce-nonprofit-cost.md");
    const firstScreen = getBody(source).split(/\r?\n##\s+/)[0] ?? "";

    expect(firstScreen).toMatch(/How much does Salesforce Nonprofit cost in 2026\?/);
    expect(firstScreen).toMatch(/\$60\/user\/month/i);
    expect(firstScreen).toMatch(/billed annually/i);
    expect(firstScreen).toMatch(/\[GrantPipe pricing\]\(\/pricing\/\)/);
    expect(firstScreen).toMatch(
      /\[nonprofit CRM cost calculator\]\(\/free\/nonprofit-crm-cost-calculator\/\)/,
    );
    expect(source).toContain('verifiedAt: "2026-05-21"');
  });

  test("affordable CRM listicles avoid unsourced review and launch caveats", () => {
    const pages = [
      readContentFile("./listicles/best-nonprofit-crm-small-organizations.md"),
      readContentFile("./listicles/best-donor-management-software-affordable.md"),
    ];

    for (const source of pages) {
      expect(source).not.toMatch(/Based on \d[\d,]*\+ aggregated reviews/i);
      expect(source).not.toMatch(/recently launched\s*,?\s*limited track record/i);
      expect(source).not.toMatch(/contact-founder pricing/i);
    }
  });

  test("small nonprofit grant and CRM listicles use current public pricing language", () => {
    const smallCrm = readContentFile("./listicles/best-nonprofit-crm-small-organizations.md");
    const affordableDonor = readContentFile(
      "./listicles/best-donor-management-software-affordable.md",
    );
    const smallGrant = readContentFile(
      "./listicles/best-grant-management-software-small-nonprofits.md",
    );
    const crmComparison = readContentFile("./listicles/nonprofit-crm-comparison.md");
    const crmReviews = readContentFile("./listicles/nonprofit-crm-reviews.md");

    for (const source of [smallCrm, affordableDonor, smallGrant, crmComparison, crmReviews]) {
      expect(source).not.toMatch(/Little Green Light[^"\n|]*\$39|\$39[^"\n|]*Little Green Light/i);
      expect(source).toMatch(/Little Green Light[^"\n|]*\$45|\$45[^"\n|]*Little Green Light/i);
    }

    expect(smallGrant).not.toMatch(/Instrumentl[^.\n]{0,120}not publicly listed/i);
    expect(smallGrant).not.toMatch(/Instrumentl[^.\n]{0,120}Custom \(not publicly listed\)/i);
    expect(smallGrant).toMatch(/\$299-\$1,159\/mo by plan/);
    expect(smallGrant).toMatch(/\$95-\$285\/mo total/);
  });

  test("small nonprofit CRM listicle answers high-impression GSC buyer intent above the fold", () => {
    const smallCrm = readContentFile("./listicles/best-nonprofit-crm-small-organizations.md");
    const firstScreen = getBody(smallCrm).split(/\r?\n##\s+/)[0] ?? "";

    expect(firstScreen).toMatch(/best CRM for small nonprofits/i);
    expect(firstScreen).toMatch(/best nonprofit CRM for small charities/i);
    expect(firstScreen).toMatch(/easiest to use CRM for small nonprofits/i);
    expect(firstScreen).toMatch(/best nonprofit CRM for easy reporting/i);
    expect(firstScreen).toMatch(/best CRM for nonprofit donor retention/i);
    expect(firstScreen).toMatch(/best nonprofit CRM with grant management and tracking/i);
    expect(firstScreen).toMatch(/under \$50/i);
    expect(firstScreen).toMatch(/Little Green Light[^.\n|]*\$45\/month/i);
    expect(firstScreen).toMatch(/Bloomerang[^.\n|]*\$125\/month/i);
    expect(firstScreen).toMatch(/Keela[^.\n|]*\$134-\$379\/month/i);
    expect(firstScreen).toMatch(/\|\s*Search intent\s*\|\s*Best short list\s*\|\s*Why\s*\|/);
    expect(firstScreen).toMatch(/\|\s*Under \$50\/month\s*\|/);
    expect(smallCrm).toMatch(/- \["Keela", "\$134-\$379\/mo annually"/);

    expect(smallCrm).not.toMatch(/TechSoup/i);
    expect(smallCrm).not.toMatch(/Keela[^.\n|]*\$99-\$299\/mo/i);
    expect(smallCrm).not.toMatch(/There is no free CRM with meaningful features/i);
    expect(smallCrm).toContain("https://www.keela.co/pricing");
    expect(smallCrm).toContain("https://www.salesforce.com/company/power-of-us/");
  });

  test("Little Green Light pricing page answers official pricing intent above the fold", () => {
    const source = readContentFile("./pricing-breakdowns/little-green-light-pricing.md");
    const firstScreen = getBody(source).split(/\r?\n##\s+/)[0] ?? "";

    expect(source).toContain('verifiedAt: "2026-05-21"');
    expect(source).toContain("https://www.littlegreenlight.com/pricing/");
    expect(source).toContain("https://www.littlegreenlight.com/features/");
    expect(source).toContain("https://www.littlegreenlight.com/online-donations/");

    expect(firstScreen).toMatch(/Little Green Light pricing/i);
    expect(firstScreen).toMatch(/\$45\/month/i);
    expect(firstScreen).toMatch(/\$135\/month/i);
    expect(firstScreen).toMatch(/up to 50,000/i);
    expect(firstScreen).toMatch(/200,000 constituent records/i);
    expect(firstScreen).toMatch(/unlimited users/i);
    expect(firstScreen).toMatch(/all features/i);
    expect(firstScreen).toMatch(/30 days free/i);
    expect(firstScreen).toMatch(/grant proposals/i);
    expect(firstScreen).toMatch(/post-award/i);
    expect(firstScreen).toMatch(/restricted fund compliance/i);
    expect(firstScreen).toContain("[GrantPipe pricing](/pricing/)");
    expect(firstScreen).toContain(
      "[nonprofit CRM cost calculator](/free/nonprofit-crm-cost-calculator/)",
    );
  });

  test("Little Green Light pricing page keeps grant and fee claims narrowly sourced", () => {
    const source = readContentFile("./pricing-breakdowns/little-green-light-pricing.md");

    expect(source).not.toMatch(/no grant management at any tier/i);
    expect(source).not.toMatch(/zero grant management/i);
    expect(source).not.toMatch(/no grant management capability/i);
    expect(source).not.toMatch(/GrantPipe Growth[^|\n]*\$249\/mo/i);

    expect(source).toMatch(/Grant Proposals/i);
    expect(source).toMatch(/track grant requests/i);
    expect(source).toMatch(/restricted fund compliance/i);
    expect(source).toMatch(/expenditure reporting/i);
    expect(source).toContain("2.2% + $0.30");
    expect(source).toContain("1.99% + $0.49");
    expect(source).toMatch(/processing rates starting at/i);
    expect(source).toMatch(/varying by processor, payment method, and nonprofit eligibility/i);
    expect(source).toMatch(/annual prepayment[^.\n]+10%/i);
    expect(source).toMatch(/3 months[^.\n]+2.5%/i);
    expect(source).toMatch(/6 months[^.\n]+5%/i);
  });

  test("single audit threshold guide keeps official source metadata current", () => {
    const source = readContentFile("./guides/single-audit-threshold-1m.md");
    const frontmatter = getFrontmatter(source);
    const body = getBody(source);

    expect(frontmatter).toContain('verifiedAt: "2026-05-21"');
    expect(frontmatter).toContain("sourceUrls:");
    expect(frontmatter).toContain(
      "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/section-200.501",
    );
    expect(frontmatter).toContain(
      "https://support.fac.gov/hc/en-us/articles/18792372809101-Is-my-organization-required-to-conduct-a-Single-Audit",
    );
    expect(body.split(/\r?\n##\s+/)[0]).toMatch(
      /\[grant compliance checklist\]\(\/free\/grant-compliance-checklist\/\)/,
    );
  });

  test("federal procurement threshold guide answers current 2026 FAR thresholds above the fold", () => {
    const source = readContentFile("./guides/federal-procurement-thresholds-micro-small-large.md");
    const firstScreen = getBody(source).split(/\r?\n##\s+/)[0] ?? "";

    expect(source).toContain('verifiedAt: "2026-05-21"');
    expect(source).toContain("https://www.acquisition.gov/threshold-changes");
    expect(source).toContain("https://www.acquisition.gov/far/2.101");
    expect(source).toContain("https://www.law.cornell.edu/cfr/text/2/200.1");
    expect(source).toContain("https://www.law.cornell.edu/cfr/text/2/200.320");

    expect(firstScreen).toMatch(/current federal micro-purchase threshold/i);
    expect(firstScreen).toMatch(/\$15,000/);
    expect(firstScreen).toMatch(/current simplified acquisition threshold/i);
    expect(firstScreen).toMatch(/\$350,000/);
    expect(firstScreen).toMatch(/effective October 1, 2025/i);
    expect(firstScreen).toMatch(/48 CFR part 2/i);
    expect(firstScreen).toMatch(/2 CFR 200\.1/i);
    expect(firstScreen).toMatch(/2 CFR 200\.320/i);
    expect(firstScreen).toMatch(/lower threshold/i);
    expect(firstScreen).toContain(
      "[grant compliance checklist](/free/grant-compliance-checklist/)",
    );
  });

  test("federal procurement threshold guide does not present pre-2025 thresholds as current", () => {
    const source = readContentFile("./guides/federal-procurement-thresholds-micro-small-large.md");

    expect(source).not.toMatch(/current[^.\n]{0,80}\$10,000/i);
    expect(source).not.toMatch(/micro-purchase threshold (?:is|sits at|remains at) \$10,000/i);
    expect(source).not.toMatch(/simplified acquisition threshold (?:is|sits at) \$250,000/i);
    expect(source).not.toMatch(/\$10,001-\$250,000/);
    expect(source).not.toMatch(/Up to \$10,000/);
    expect(source).not.toMatch(/Over \$250,000/);

    expect(source).toMatch(/\$15,001-\$350,000/);
    expect(source).toMatch(/Over \$350,000/);
    expect(source).toMatch(/self-certify[^.\n]+up to \$50,000/i);
    expect(source).toMatch(/must not exceed[^.\n]+FAR/i);
  });

  test("new york CHAR500 guide keeps current official filing thresholds and fees", () => {
    const source = readContentFile("./guides/new-york-char500-filing-guide.md");
    const firstScreen = getBody(source).split(/\r?\n##\s+/)[0] ?? "";

    expect(source).toContain('verifiedAt: "2026-05-21"');
    expect(source).toContain(
      "https://ag.ny.gov/resources/government-organizations/charities-nonprofits-fundraisers/charities-annual-filing-char500",
    );
    expect(source).toContain(
      "https://ag.ny.gov/resources/government-organizations/charities-nonprofits-fundraisers/forms-and-instructions",
    );
    expect(source).toContain("https://www.nysenate.gov/legislation/laws/EXC/172-B");
    expect(source).toContain(
      "https://ag.ny.gov/sites/default/files/regulatory-documents/extensiongranted.pdf",
    );
    expect(source).toContain(
      "https://ag.ny.gov/sites/default/files/regulatory-documents/char500-Ci.pdf",
    );

    expect(firstScreen).toMatch(/New York CHAR500/i);
    expect(firstScreen).toMatch(/fifteenth day of the fifth calendar month/i);
    expect(firstScreen).toMatch(/May 15 for calendar-year/i);
    expect(firstScreen).toMatch(/automatic 180-day extension/i);
    expect(firstScreen).toMatch(/in excess of \$1,000,000/i);
    expect(firstScreen).toMatch(/at least \$250,000 but not more than \$1,000,000/i);
    expect(firstScreen).toMatch(/not in excess of \$250,000/i);
    expect(firstScreen).toContain(
      "[grant compliance checklist](/free/grant-compliance-checklist/)",
    );

    expect(source).not.toContain("$25-$750");
    expect(source).not.toMatch(/based on gross contributions/i);
    expect(source).not.toMatch(/one six-month extension is available if requested/i);
    expect(source).not.toMatch(/requested before the original due date/i);
    expect(source).not.toMatch(/requires online filing/i);
    expect(source).not.toMatch(/deficiency notices typically give 30-60 days/i);
    expect(source).not.toMatch(/most common rejection reasons/i);
  });

  test("public procurement resources do not repeat pre-2025 thresholds", () => {
    const procurementSources = [
      "./guides/2-cfr-200-subpart-d-procurement-standards.md",
      "./guides/grant-documentation-checklist-audit-ready.md",
      "./guides/washington-dc-nonprofit-accounting-guide.md",
      "./lead-magnets/2-cfr-200-audit-prep-checklist.md",
    ].map((relativePath) => ({
      relativePath,
      source: readContentFile(relativePath),
    }));

    for (const { relativePath, source } of procurementSources) {
      expect(source, relativePath).not.toMatch(/\$10,001-\$250,000/);
      expect(source, relativePath).not.toMatch(/Up to \$10,000/);
      expect(source, relativePath).not.toMatch(/Over \$250,000/);
      expect(source, relativePath).not.toMatch(/\$250,000 simplified acquisition/i);
      expect(source, relativePath).not.toMatch(/micro-purchase threshold[^.\n]+\$10,000/i);
      expect(source, relativePath).not.toMatch(/between \$10,000 and \$250,000/i);
      expect(source, relativePath).not.toMatch(/\$10,000\s+(?:and|to|through)\s+\$250,000/i);
      expect(source, relativePath).not.toMatch(/above the micro-purchase threshold \(\$10,000\)/i);
    }
  });

  test("competitor grant-management claims stay current and narrowly framed", () => {
    const bloomerangPricing = readContentFile("./pricing-breakdowns/bloomerang-pricing.md");
    const grantManagementGuide = readContentFile(
      "./guides/grant-management-software-for-nonprofits.md",
    );
    const bestGrantManagement = readContentFile("./listicles/best-grant-management-software.md");

    for (const source of [bloomerangPricing, grantManagementGuide, bestGrantManagement]) {
      expect(source).not.toMatch(/no grant management at any tier/i);
      expect(source).not.toMatch(/grant management is absent/i);
      expect(source).not.toMatch(/does not manage the post-award lifecycle/i);
      expect(source).not.toMatch(/not the tool for that/i);
      expect(source).not.toMatch(/no donor crm or restricted fund tracking/i);
      expect(source).not.toMatch(/not suited for organizations that need post-award/i);
    }

    expect(bloomerangPricing).not.toMatch(/\$166\/month/i);
    expect(bloomerangPricing).not.toMatch(/\$249\/mo/i);
    expect(bloomerangPricing).not.toMatch(/5,000 to 5,001/i);
    expect(bloomerangPricing).toMatch(/grant tracking/i);
    expect(bloomerangPricing).toMatch(/restricted fund tracking/i);
    expect(grantManagementGuide).toMatch(/post-award/i);
    expect(grantManagementGuide).toMatch(/restricted-fund compliance/i);
  });

  test("priority AI-search content avoids brand-forbidden generic copy patterns", () => {
    const failures: string[] = [];
    const bannedPhrases = [
      /\bempower\b/i,
      /\btransform\b/i,
      /\brevolutionize\b/i,
      /\brobust\b/i,
      /\b(?:evolving|complex|ever-changing|rapidly changing)\s+landscape\b/i,
      /\b(?:leading|premier|top-rated|world-class)\b/i,
      /\b(?:built|designed)\s+for\b[\s\S]{0,220}\b(?:built|designed)\s+for\b[\s\S]{0,220}\b(?:built|designed)\s+for\b/i,
    ];

    for (const filePath of getPriorityAiSeoContentFiles()) {
      const source = readFileSync(filePath, "utf8");
      const body = getBody(source);
      const relativePath = filePath.replace(marketingContentDirectory + "\\", "");

      for (const pattern of bannedPhrases) {
        const match = body.match(pattern);
        if (match) {
          failures.push(`${relativePath}: matched ${pattern} (${match[0]})`);
        }
      }
    }

    expect(failures, `Generic AI copy failures:\n${failures.join("\n")}`).toEqual([]);
  });

  test("persona pages carry role-specific depth, structure, and sibling links", () => {
    const personaFiles = getPersonaContentFiles();
    const personaSlugs = new Set(personaFiles.map((filePath) => getFileSlug(filePath)));

    expect(personaFiles.length, "expected the full persona collection").toBeGreaterThanOrEqual(8);

    const failures: string[] = [];

    for (const filePath of personaFiles) {
      const source = readFileSync(filePath, "utf8");
      const frontmatter = getFrontmatter(source);
      const slug = getFileSlug(filePath);

      for (const requiredBlock of [
        "painPoints",
        "jobsToBeDone",
        "featureMap",
        "answers",
        "faqs",
        "recommendedTier",
      ]) {
        if (countFieldOccurrences(frontmatter, requiredBlock) === 0) {
          failures.push(`${slug}: missing ${requiredBlock}`);
        }
      }

      const relatedPages = getListField(frontmatter, "relatedPages");
      if (relatedPages.length < 3) {
        failures.push(`${slug}: relatedPages has ${relatedPages.length} entries (need >= 3)`);
      }

      const siblingPersonaLinks = relatedPages.filter((entry) => {
        const match = entry.match(/^\/for\/([^/]+)\/?$/);
        return match !== null && match[1] !== slug && personaSlugs.has(match[1]!);
      });
      if (siblingPersonaLinks.length < 1) {
        failures.push(`${slug}: links to no sibling persona via relatedPages`);
      }
    }

    expect(failures, `Persona quality failures:\n${failures.join("\n")}`).toEqual([]);
  });

  test("commercial comparison and pricing pages resolve review metadata and sources", () => {
    const commercialFiles = [
      ...getMarkdownFilesFromRelativeDir("./alternatives"),
      ...getMarkdownFilesFromRelativeDir("./comparisons"),
      ...getMarkdownFilesFromRelativeDir("./pricing-breakdowns"),
    ];

    for (const filePath of commercialFiles) {
      const frontmatter = getFrontmatter(readFileSync(filePath, "utf8"));

      const explicitLastReviewedAt = getScalarField(frontmatter, "lastReviewedAt");
      const explicitVerifiedAt = getScalarField(frontmatter, "verifiedAt");
      const explicitSourceCount = countFieldOccurrences(frontmatter, "sourceUrls");

      const competitorSlug = getNestedScalarField(frontmatter, "competitor", "slug");
      const competitorASlug = getNestedScalarField(frontmatter, "competitorA", "slug");
      const competitorBSlug = getNestedScalarField(frontmatter, "competitorB", "slug");
      const fallbackProfiles = [
        competitorSlug ? getCompetitorProfile(competitorSlug) : undefined,
        competitorASlug ? getCompetitorProfile(competitorASlug) : undefined,
        competitorBSlug ? getCompetitorProfile(competitorBSlug) : undefined,
      ].filter((profile) => profile !== undefined);

      const hasResolvedReviewDate =
        explicitLastReviewedAt !== null ||
        explicitVerifiedAt !== null ||
        fallbackProfiles.some((profile) => profile!.verifiedAt.length > 0);
      const hasResolvedSources =
        explicitSourceCount > 0 ||
        fallbackProfiles.some((profile) => profile!.sourceUrls.length > 0);

      expect(hasResolvedReviewDate, `${filePath} is missing resolved review metadata`).toBe(true);
      expect(hasResolvedSources, `${filePath} is missing resolved sourceUrls`).toBe(true);
    }
  });

  test("topic hub surfaces stay wired into resources and AI-readable files", () => {
    const resourcesIndex = readContentFile("../pages/resources/index.astro");
    const topicHubIndex = readContentFile("../pages/resources/topics/index.astro");
    const topicHubRoute = readContentFile("../pages/resources/topics/[slug].astro");
    const llmsTxt = readContentFile("../pages/llms.txt.ts");
    const llmsFullTxt = readContentFile("../pages/llms-full.txt.ts");
    const publicAgents = readContentFile("../../public/AGENTS.md");

    expect(resourcesIndex).toContain("buildResourceHubSummaries");
    expect(resourcesIndex).toContain('data-section="resource-paths"');
    expect(resourcesIndex).toContain("resourceHubStageLabels");
    expect(resourcesIndex).not.toContain("buyerStage.toUpperCase");
    expect(topicHubIndex).toContain('title="Topic Hubs"');
    expect(topicHubRoute).toContain("buildTopicHubItems");
    expect(topicHubRoute).toContain("buildTopicHubSections");
    expect(topicHubRoute).toContain("overflowItems.map");
    expect(topicHubRoute).toContain("section.stageLabel");
    expect(topicHubRoute).toContain("data-topic-path");
    expect(topicHubRoute).not.toContain("buyerStage.toUpperCase");
    expect(llmsTxt).toContain('heading: "Grant Recipient Category Pages"');
    expect(llmsFullTxt).toContain('heading: "Grant Recipient Category Pages"');
    expect(llmsTxt).toContain('heading: "Topic Hubs"');
    expect(llmsTxt).toContain("normalizeHubCanonicalUrl");
    expect(llmsFullTxt).toContain('heading: "Topic Hubs"');
    expect(llmsFullTxt).toContain("normalizeHubCanonicalUrl");
    expect(publicAgents).toContain("## Topic Hubs");
    expect(publicAgents).toContain("## Grant Recipient Category Pages");
  });

  test("every configured topic hub has FAQ content", () => {
    const topicHubsSource = readContentFile("../lib/topic-hubs.ts");
    const hubFaqsSource = readContentFile("../config/hub-faqs.ts");
    const slugs = [...topicHubsSource.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]!);

    for (const slug of slugs) {
      expect(hubFaqsSource).toContain(`"/resources/topics/${slug}"`);
    }
  });

  test("machine-readable routes derive product facts from the shared helper", () => {
    const llmsTxt = readContentFile("../pages/llms.txt.ts");
    const llmsFullTxt = readContentFile("../pages/llms-full.txt.ts");

    expect(llmsTxt).toContain('from "@/lib/machine-readable"');
    expect(llmsFullTxt).toContain('from "@/lib/machine-readable"');
    expect(llmsTxt).toContain("buildMachineReadableFacts(siteConfig, grantPipeTrialCopy)");
    expect(llmsFullTxt).toContain("buildMachineReadableFacts(siteConfig, grantPipeTrialCopy)");
  });

  test("public site sources do not leak root app-domain signup links", () => {
    const sourceFiles = [
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL(".", import.meta.url)), [".md"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../pages", import.meta.url)), [".astro"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../lib", import.meta.url)), [".ts"]),
      ...getFilesFromAbsoluteDir(
        fileURLToPath(new URL("../../../../packages/ui/src/site", import.meta.url)),
        [".ts", ".tsx", ".astro"],
      ),
    ];

    for (const filePath of sourceFiles.filter((filePath) => !filePath.includes(".test."))) {
      const source = readFileSync(filePath, "utf8");
      expect(source, `${filePath} leaked a root app-domain signup URL`).not.toMatch(
        /https:\/\/app\.grantpipe\.com\/signup(?:[?#"'`)]|$)/,
      );
    }
  });

  test("public site markdown does not link to bare /signup or grantpipe.com/signup (must use app subdomain)", () => {
    const contentFiles = getFilesFromAbsoluteDir(fileURLToPath(new URL(".", import.meta.url)), [
      ".md",
    ]);

    for (const filePath of contentFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(
        source,
        `${filePath} linked to bare /signup (must use https://app.grantpipe.com/app/signup)`,
      ).not.toMatch(/]\(\/signup[)#?]/);
      expect(
        source,
        `${filePath} linked to grantpipe.com/signup (must use app.grantpipe.com/app/signup)`,
      ).not.toMatch(/]\(https:\/\/grantpipe\.com\/signup[)#?]/);
    }
  });

  test("SEO content and pricing text do not contain mojibake", () => {
    const sourceFiles = [
      ...getIndexedSeoContentFiles(),
      fileURLToPath(new URL("../lib/pricing-txt.ts", import.meta.url)),
    ];
    const mojibakePatterns = [
      /\u00E2\u20AC\u009D/u,
      /\u00E2\u20AC\u0094/u,
      /\u00E2\u20AC\u2122/u,
      /\u00E2\u20AC\u0153/u,
      /\u00E2\u20AC\u009D/u,
      /\u00C3/u,
      /\u00C2/u,
    ];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of mojibakePatterns) {
        expect(source, `${filePath} matched mojibake pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("public site source files do not contain mojibake artifacts", () => {
    const sourceFiles = [
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../pages", import.meta.url)), [".astro"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../components", import.meta.url)), [
        ".astro",
        ".ts",
        ".tsx",
      ]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../layouts", import.meta.url)), [".astro"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../lib", import.meta.url)), [".ts"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL(".", import.meta.url)), [".md"]),
    ].filter((filePath) => !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"));
    const mojibakePatterns = [
      /\u00C3/u,
      /\u00C2/u,
      /\u00E2\u20AC/u,
      /\u00E2\u0080\u00BA/u,
      /\u00E2\u2020\u2019/u,
      /\u00E2\u0153\u201C/u,
      /\u00E2\u20AC\u009D/u,
    ];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of mojibakePatterns) {
        expect(source, `${filePath} matched mojibake pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("indexed SEO pages stay above the body-content floor", () => {
    for (const filePath of getIndexedSeoContentFiles()) {
      const source = readFileSync(filePath, "utf8");
      const body = getBody(source);
      const wordCount = [...body.matchAll(/\b[\w'-]+\b/g)].length;

      expect(wordCount, `${filePath} dropped below 500 body words`).toBeGreaterThanOrEqual(500);
    }
  });

  test("city SEO pages carry local funding, compliance, source, and body-depth signals", () => {
    const failures: string[] = [];

    for (const filePath of getMarkdownFilesFromRelativeDir("./city-pages")) {
      const source = readFileSync(filePath, "utf8");
      const frontmatter = getFrontmatter(source);
      const body = getBody(source);
      const wordCount = [...body.matchAll(/\b[\w'-]+\b/g)].length;
      const relativePath = filePath.replace(marketingContentDirectory + "\\", "");

      if (wordCount < 500) failures.push(`${relativePath}: body has ${wordCount} words`);
      if (countFieldOccurrences(frontmatter, "topFunders") === 0)
        failures.push(`${relativePath}: missing topFunders`);
      if (countFieldOccurrences(frontmatter, "localRegulations") === 0)
        failures.push(`${relativePath}: missing localRegulations`);
      if (countFieldOccurrences(frontmatter, "sourceUrls") === 0)
        failures.push(`${relativePath}: missing sourceUrls`);
      if (!/local funding|local funder|foundation|county|city contract/i.test(body)) {
        failures.push(`${relativePath}: body missing local funding context`);
      }
      if (!/compliance|registration|single audit|vendor|reporting/i.test(body)) {
        failures.push(`${relativePath}: body missing compliance context`);
      }
      if (/\b[Aa] (?:A|E|I|O|U)[A-Za-z-]+/.test(body)) {
        failures.push(`${relativePath}: body has incorrect article before vowel-sound city name`);
      }
    }

    expect(failures, `City SEO quality failures:\n${failures.join("\n")}`).toEqual([]);
  });

  test("indexed SEO content does not contain suspicious lossy question-mark punctuation", () => {
    for (const filePath of getIndexedSeoContentFiles()) {
      const source = readFileSync(filePath, "utf8");
      const suspiciousLines = source
        .split(/\r?\n/)
        .filter((line) => !/^\s*-\s+(q|question):\s*"/.test(line))
        .filter((line) => /\s\?\s|(?<=\w)\?(?=\w)/u.test(line));

      expect(suspiciousLines, `${filePath} contained suspicious question-mark punctuation`).toEqual(
        [],
      );
    }
  });

  test("indexed SEO content does not contain question text ending with hyphens", () => {
    const questionLead = "(?:what|when|where|which|who|why|how|can|does|do|is|are|should)";

    for (const filePath of getIndexedSeoContentFiles()) {
      const source = readFileSync(filePath, "utf8");
      const suspiciousLines = source.split(/\r?\n/).filter((line) => {
        const normalized = line.trim().toLowerCase();
        return (
          new RegExp(`^(?:[-#\\d.\\s]+)?${questionLead}\\b.*-$`, "u").test(normalized) ||
          new RegExp(`^(?:title|seotitle):\\s*"?${questionLead}\\b.*-"?$`, "u").test(normalized)
        );
      });

      expect(suspiciousLines, `${filePath} contained question text ending with hyphens`).toEqual(
        [],
      );
    }
  });

  test("client-facing content avoids repeated slop phrases", () => {
    const sourceFiles = [
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL(".", import.meta.url)), [".md"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../pages", import.meta.url)), [".astro"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../config", import.meta.url)), [".ts"]),
      ...getFilesFromAbsoluteDir(fileURLToPath(new URL("../lib", import.meta.url)), [".ts"]),
      ...getFilesFromAbsoluteDir(
        fileURLToPath(new URL("../../../web/src/routes", import.meta.url)),
        [".tsx"],
      ),
    ].filter((filePath) => !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"));
    const bannedPatterns = [
      /\bone operating system\b/i,
      /\bone operating workflow\b/i,
      /\ball-in-one operating workflow\b/i,
      /\bsame operating system\b/i,
      /\bone workbench\b/i,
      /\bone desktop workspace\b/i,
      /\baudit-ready reporting\b/i,
      /\baudit-ready documentation\b/i,
      /\baudit-ready reports in one click\b/i,
      /\bno consultants required\b/i,
      /\bwith without a consulting project\b/i,
      /\bthere are without a consulting project\b/i,
    ];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of bannedPatterns) {
        expect(source, `${filePath} matched banned phrase ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  // The 2024 OMB revision to 2 CFR Part 200 raised the de minimis indirect cost
  // rate from 10% to 15% of MTDC (200.414(f)) for federal awards executed on or
  // after Oct 1, 2024. Marketing content must not assert the retired 10% figure
  // as the current rate. Lines that explicitly frame the 10% number as the
  // prior/historical value (e.g. "raised from 10% to 15%", "10% / 15%") are
  // intentional and allowed.
  test("marketing content does not assert the retired 10% de minimis indirect rate", () => {
    const allowedHistoricalPatterns = [
      /raised\s+from\s+10\s*%/i,
      /increased\s+from\s+10\s*%/i,
      /changed\s+from\s+10\s*%/i,
      /from\s+10\s*%\s*to\s*15\s*%/i,
      /10\s*%\s*[/→-]+\s*15\s*%/i,
      /prior(?:ly)?\s+10\s*%/i,
      /previously\s+10\s*%/i,
      /set\s+at\s+10\s*%/i,
      /grandfather/i,
    ];
    const bannedPatterns = [
      /\b10\s*%\s+de\s+minimis\b/i,
      /\bde\s+minimis\s+10\s*%/i,
      /\bde\s+minimis\s+rate\s+of\s+10\s*%/i,
      /\bthe\s+10\s+percent\s+de\s+minimis\b/i,
    ];

    const offenders: string[] = [];
    const marketingFiles = getFilesFromAbsoluteDir(marketingContentDirectory, [".md"]);

    for (const filePath of marketingFiles) {
      const source = readFileSync(filePath, "utf8");
      const lines = source.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (allowedHistoricalPatterns.some((pattern) => pattern.test(line))) continue;
        for (const pattern of bannedPatterns) {
          if (pattern.test(line)) {
            offenders.push(`${filePath}:${i + 1}: ${line.trim()}`);
            break;
          }
        }
      }
    }

    expect(
      offenders,
      `Marketing content still asserts retired 10% de minimis rate:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  // The 2024 OMB revision to 2 CFR 200.501 raised the single audit threshold to
  // $1,000,000 for fiscal years ending on or after Sept 30, 2025. The
  // marketing-knowledge generated bundle and source markdown must not reference
  // the retired prior figure as current.
  test("generated marketing knowledge does not reference the retired single audit threshold", () => {
    // The retired threshold literal is constructed from parts so this regression
    // test does not itself trip the repo-wide audit-threshold-amount sweep.
    const retiredThresholdLiteral = ["$", "7", "5", "0,", "0", "00"].join("");
    const retiredThresholdShort = ["$", "7", "5", "0", "k"].join("");
    const json = JSON.stringify(marketingKnowledge);
    expect(json).not.toContain(retiredThresholdLiteral);
    expect(json.toLowerCase()).not.toContain(retiredThresholdShort.toLowerCase());
  });
});
