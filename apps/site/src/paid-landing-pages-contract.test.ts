import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "../../..");
const siteRoot = join(__dirname, "..");
const lpRoot = join(__dirname, "pages/lp");
const sharedLandingPageSource = readFileSync(
  join(__dirname, "components/paid-search-landing-page.astro"),
  "utf8",
);

const paidLandingPages = [
  {
    slug: "grant-management-software",
    displayPath: "/grant/management",
    headline: "Built for the SF-425, the drawdown, and the audit binder.",
    campaign: "BING_Search_Grant-Management_Trial_2026-05",
    exitLeadMagnetSlug: "award-setup-worksheet",
  },
  {
    slug: "granthub-migration",
    displayPath: "/granthub/migration",
    headline: "Replacing GrantHub? Keep the pipeline. Add the post-award record.",
    campaign: "BING_Search_GrantHub-Migration_Trial_2026-05",
    exitLeadMagnetSlug: "granthub-migration-checklist",
  },
  {
    slug: "restricted-fund-tracking",
    displayPath: "/restricted/funds",
    headline: "QuickBooks Classes label expenses. They don't track restricted balances.",
    campaign: "BING_Search_Restricted-Funds_Trial_2026-05",
    exitLeadMagnetSlug: "restricted-fund-tracking-spreadsheet",
  },
  {
    slug: "grant-compliance-software",
    displayPath: "/grant/compliance",
    headline: "Grant compliance software for deadlines, evidence, and audit readiness.",
    campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
    exitLeadMagnetSlug: "grant-file-audit-checklist",
  },
  {
    slug: "grant-reporting-software",
    displayPath: "/grant/reporting",
    headline: "Grant reporting software for SF-425, SEFA, and drawdown reconciliation.",
    campaign: "BING_Search_Grant-Reporting_Trial_2026-05",
    exitLeadMagnetSlug: "sf-425-reporting-checklist",
  },
  {
    slug: "run-grants-without-a-second-admin",
    displayPath: "/grant/solo",
    headline: "Run your whole grant portfolio without a second admin.",
    campaign: "BING_Search_Grants-Solo_Trial_2026-06",
    exitLeadMagnetSlug: "grant-reporting-deadlines-tracker",
  },
  {
    slug: "donor-grant-unified",
    displayPath: "/donor/unified",
    headline: "Donors, grants, and funds in one place.",
    campaign: "BING_Search_Dev-Director_Trial_2026-06",
    exitLeadMagnetSlug: "donor-to-grant-reconciliation-template",
  },
  {
    slug: "board-report-in-an-afternoon",
    displayPath: "/board/report",
    headline: "Build the board report in an afternoon.",
    campaign: "BING_Search_Dev-Director_Trial_2026-06",
    exitLeadMagnetSlug: "board-approval-memo-software-template",
  },
  {
    slug: "grant-pipeline-like-donors",
    displayPath: "/grant/pipeline",
    headline: "Run grants like you run major donors.",
    campaign: "BING_Search_Dev-Director_Trial_2026-06",
    exitLeadMagnetSlug: "major-donor-cultivation-playbook",
  },
  {
    slug: "donor-retention-rescue",
    displayPath: "/donor/retention",
    headline: "Catch the at-risk donor before they lapse.",
    campaign: "BING_Search_Dev-Director_Trial_2026-06",
    exitLeadMagnetSlug: "donor-retention-playbook",
  },
  {
    slug: "donor-crm-with-grants",
    displayPath: "/donor/crm-grants",
    headline: "A donor CRM that tracks grants too.",
    campaign: "BING_Search_Dev-Director_Trial_2026-06",
    exitLeadMagnetSlug: "nonprofit-crm-evaluation-scorecard",
  },
  {
    slug: "answer-any-board-question",
    displayPath: "/ed/board-questions",
    headline: "Answer board questions faster.",
    campaign: "BING_Search_Exec-Director_Trial_2026-06",
    exitLeadMagnetSlug: "board-approval-memo-software-template",
  },
  {
    slug: "nonprofit-crm-no-consultant",
    displayPath: "/ed/no-consultant",
    headline: "The nonprofit system you run yourself.",
    campaign: "BING_Search_Exec-Director_Trial_2026-06",
    exitLeadMagnetSlug: "nonprofit-crm-cost-calculator",
  },
  {
    slug: "keep-the-org-memory",
    displayPath: "/ed/key-person",
    headline: "When a staffer leaves, the memory stays.",
    campaign: "BING_Search_Exec-Director_Trial_2026-06",
    exitLeadMagnetSlug: "nonprofit-crm-evaluation-scorecard",
  },
  {
    slug: "salesforce-blackbaud-alternative",
    displayPath: "/ed/alternative",
    headline: "Leave Salesforce or Blackbaud behind.",
    campaign: "BING_Search_Exec-Director_Trial_2026-06",
    exitLeadMagnetSlug: "nonprofit-crm-cost-calculator",
  },
  {
    slug: "one-system-not-four",
    displayPath: "/ed/one-system",
    headline: "One system instead of four.",
    campaign: "BING_Search_Exec-Director_Trial_2026-06",
    exitLeadMagnetSlug: "nonprofit-crm-evaluation-scorecard",
  },
  {
    slug: "fund-accounting-without-the-price",
    displayPath: "/funds/affordable",
    headline: "Fund accounting without the big price.",
    campaign: "BING_Search_Finance-Ops_Trial_2026-06",
    exitLeadMagnetSlug: "grant-software-roi-calculator",
  },
  {
    slug: "audit-prep-in-days",
    displayPath: "/funds/audit",
    headline: "Audit prep in days, not weeks.",
    campaign: "BING_Search_Finance-Ops_Trial_2026-06",
    exitLeadMagnetSlug: "audit-prep-week-by-week-checklist",
  },
  {
    slug: "match-every-drawdown",
    displayPath: "/funds/drawdown",
    headline: "Match every drawdown to real spend.",
    campaign: "BING_Search_Finance-Ops_Trial_2026-06",
    exitLeadMagnetSlug: "grant-spend-down-tracker",
  },
  {
    slug: "split-payroll-across-grants",
    displayPath: "/funds/payroll",
    headline: "Split payroll across grants cleanly.",
    campaign: "BING_Search_Finance-Ops_Trial_2026-06",
    exitLeadMagnetSlug: "grant-staff-time-tracking-template",
  },
] as const;

function readSiteFile(relativePath: string): string {
  return readFileSync(join(siteRoot, relativePath), "utf8");
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("paid search landing page contract", () => {
  it("keeps the registry aligned with every static paid LP route file", () => {
    const registeredSlugs = paidLandingPages.map((page) => page.slug).sort();
    const routeSlugs = readdirSync(lpRoot)
      .filter((fileName) => fileName.endsWith(".astro"))
      .map((fileName) => fileName.replace(/\.astro$/, ""))
      .sort();

    expect(routeSlugs).toEqual(registeredSlugs);
  });

  it("lets BaseLayout own the main content landmark", () => {
    expect(sharedLandingPageSource).not.toContain('<main id="main-content"');
    expect(sharedLandingPageSource).toContain('class="lp-page"');
    expect(sharedLandingPageSource).not.toContain("disableAiSdrWidget={true}");
    expect(sharedLandingPageSource).not.toContain("disableAiSdrWidget");
    expect(sharedLandingPageSource).toContain("--paid-lp-mobile-sticky-offset");
    expect(sharedLandingPageSource).toContain("#ventora-ai-sdr-root");
    expect(sharedLandingPageSource).toContain("body #ventora-ai-sdr-root");
    // The widget now renders a single self-contained panel; the paid LP only
    // lifts the launcher above the sticky mobile CTA via the root offset.
    expect(sharedLandingPageSource).toContain(
      "calc(var(--paid-lp-mobile-sticky-offset) + 0.75rem)",
    );
    expect(sharedLandingPageSource).toContain(
      '[data-cta-intent="convert"]:not([data-cta-section="header"])',
    );
  });

  it("mounts the shared exit-intent popup with site copy and the paid LP offer", () => {
    expect(sharedLandingPageSource).toContain(
      'import { ExitIntentPopup } from "@grantpipe/ui/site/components/exit-intent-popup"',
    );
    expect(sharedLandingPageSource).toContain(
      'import { resolveExitPopupProps } from "@grantpipe/ui/site/lib/exit-popup-props"',
    );
    expect(sharedLandingPageSource).toContain(
      'import { getPublicApiBaseUrl } from "@grantpipe/ui/site/lib/public-api-url"',
    );
    expect(sharedLandingPageSource).toContain("const exitPopupProps =");
    expect(sharedLandingPageSource).toContain(
      "siteConfig.exitPopup?.enabled !== false ? resolveExitPopupProps(siteConfig) : undefined",
    );
    expect(sharedLandingPageSource).toContain("const publicApiUrl = getPublicApiBaseUrl()");
    expect(sharedLandingPageSource).toContain("{exitPopupProps && (");
    expect(sharedLandingPageSource).toContain("<ExitIntentPopup");
    expect(sharedLandingPageSource).toContain("client:load");
    expect(sharedLandingPageSource).toContain("apiUrl={publicApiUrl}");
    expect(sharedLandingPageSource).toContain("leadMagnet={page.exitLeadMagnet}");
    expect(sharedLandingPageSource).toContain("{...exitPopupProps}");
  });

  for (const page of paidLandingPages) {
    it(`${page.slug} exists with paid-only conversion and exploration controls`, () => {
      const pagePath = join(lpRoot, `${page.slug}.astro`);

      expect(existsSync(pagePath), `${page.slug} route file is missing`).toBe(true);

      const source = readFileSync(pagePath, "utf8");
      const renderedSource = `${source}\n${sharedLandingPageSource}`;
      const exitLeadMagnetPattern = new RegExp(
        `exitLeadMagnet:\\s*{[\\s\\S]*?slug:\\s*"${page.exitLeadMagnetSlug}"`,
      );

      expect(source).toContain(`slug: "${page.slug}"`);
      expect(source).toContain("exitLeadMagnet: {");
      expect(source).toMatch(exitLeadMagnetPattern);
      expect(renderedSource).toContain(
        "const canonicalUrl = `https://${siteConfig.domain}/lp/${page.slug}/`;",
      );
      expect(renderedSource).toContain("noindex={true}");
      expect(renderedSource).toContain("showFooter={false}");
      expect(source).toContain(page.headline);
      expect(source).toContain('primaryCta: "Start 1-month free trial"');
      expect(source).not.toContain("secondaryCta");
      expect(renderedSource).toContain("data-mobile-sticky");
      expect(renderedSource).toContain("[data-preserve-utm]");
      expect(renderedSource).toContain("msclkid");
      expect(renderedSource).toContain("lp-product-section");
      expect(renderedSource).toContain("lp-dashboard-stage");
      expect(renderedSource).toContain("lp-proof-stack");
      expect(renderedSource).toContain("lp-product-modules");
      expect(renderedSource).toContain("grantpipe-grants.png");
      expect(renderedSource).toContain("Start 1-month free trial");
      // Secondary buttons (Explore product / Visit homepage) were removed in CRO overhaul.
      // Replaced by lightweight anchor scroll links with explore-anchor intent.
      expect(renderedSource).toContain('data-cta-intent="explore-anchor"');
      expect(renderedSource).not.toContain('data-cta-intent="explore-product"');
      expect(renderedSource).not.toContain('data-cta-intent="explore-home"');
      expect(renderedSource).not.toContain('data-cta-intent="lead-magnet"');
      expect(renderedSource).not.toContain("href={page.secondaryCta.href}");
      expect(renderedSource).not.toContain("Public roadmap");

      const preserveUtmCount = (renderedSource.match(/data-preserve-utm/g) ?? []).length;
      expect(preserveUtmCount).toBe(6);
    });

    it(`${page.slug} has redirect and registry entries`, () => {
      const redirects = readSiteFile("public/_redirects");
      const registry = readRepoFile("docs/paid-ads-landing-pages.md");

      expect(redirects).toContain(`/lp/${page.slug} /lp/${page.slug}/ 301`);
      expect(registry).toContain(`\`${page.slug}\``);
      expect(registry).toContain(`https://grantpipe.com/lp/${page.slug}/`);
      expect(registry).toContain(page.campaign);
    });

    it(`${page.slug} redirects the Microsoft Ads display path to the paid route`, () => {
      const redirects = readSiteFile("public/_redirects");

      expect(redirects).toContain(`${page.displayPath} /lp/${page.slug}/ 301`);
      expect(redirects).toContain(`${page.displayPath}/ /lp/${page.slug}/ 301`);
    });

    it(`${page.slug} has a static display-path fallback that preserves click params`, () => {
      const routeSource = readSiteFile(`src/pages${page.displayPath}.astro`);

      expect(routeSource).toContain(`/lp/${page.slug}/`);
      expect(routeSource).toContain("window.location.search");
      expect(routeSource).toContain("window.location.replace");
      expect(routeSource).not.toContain('http-equiv="refresh"');
    });

    it(`${page.slug} keeps paid LP source scoped to the shared route renderer`, () => {
      const pagePath = join(lpRoot, `${page.slug}.astro`);

      expect(existsSync(pagePath), `${page.slug} route file is missing`).toBe(true);
      expect(readFileSync(pagePath, "utf8")).toContain("<PaidSearchLandingPage page={page} />");
    });
  }

  it("uses homepage green CTA and typography markers instead of the old amber treatment", () => {
    expect(sharedLandingPageSource).toContain("var(--font-heading)");
    expect(sharedLandingPageSource).toContain("var(--font-sans");
    expect(sharedLandingPageSource).toContain("var(--color-primary-800)");
    expect(sharedLandingPageSource).toContain("var(--color-primary-700)");
    expect(sharedLandingPageSource).not.toContain("#c68c09");
    expect(sharedLandingPageSource).not.toContain("#a36c00");
  });

  it("does not claim a public roadmap without a public route", () => {
    expect(sharedLandingPageSource).not.toContain("Public roadmap");
  });

  it("keeps paid LP claims inside the current source-of-truth boundaries", () => {
    const combinedSource = readdirSync(lpRoot)
      .filter((fileName) => fileName.endsWith(".astro"))
      .map((fileName) => readFileSync(join(lpRoot, fileName), "utf8"))
      .join("\n");

    expect(combinedSource).not.toMatch(/trade the .*accounting file/i);
    expect(combinedSource).not.toMatch(/reconciliation hours["\s:,]+value:\s*"0"/i);
    expect(combinedSource).not.toMatch(/no reconciliation needed/i);
    expect(combinedSource).not.toMatch(/most\s+(?:teams|eds|executive directors|orgs|nonprofits)/i);
    expect(combinedSource).not.toMatch(/answer any board question in minutes/i);
    expect(combinedSource).not.toMatch(/pull .*today/i);
    expect(combinedSource).not.toMatch(/board packet writes itself/i);
  });
});
