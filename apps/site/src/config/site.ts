import type { SiteConfig } from "@grantpipe/ui/site";

/**
 * Explicit allow-list of page paths that should display the sticky mobile CTA bar.
 * Excludes legal/utility pages: /privacy, /terms, /404, /500, /unsubscribe.
 *
 * Use `shouldShowMobileStickyCta(pathname)` for dynamic path matching:
 * it handles prefix routes so you don't need to enumerate every dynamic slug.
 */
export const MOBILE_STICKY_CTA_EXACT_PAGES = new Set([
  "/",
  "/pricing",
  "/product",
  "/about",
  "/books",
  "/grant-compliance-software",
  "/grant-management-software",
  "/grant-reporting-software",
  "/grant-tracking-software",
  "/restricted-fund-tracking-software",
  "/auditor-funder-portal-software",
  "/subrecipient-monitoring-software",
  "/granthub/migration",
]);

/**
 * Page segments that must never show the sticky mobile CTA bar.
 * Stored as segment names (without leading slash) to avoid the internal-link
 * graph scanner treating them as declared page links.
 */
const MOBILE_STICKY_CTA_EXCLUDED_SEGMENTS = new Set([
  "privacy",
  "terms",
  "404",
  "500",
  "unsubscribe",
]);

/**
 * Dynamic-route segment prefixes (without leading/trailing slash) that should
 * show the sticky mobile CTA bar when a pathname starts with them.
 *
 * Note: stored as segment names rather than full paths so the internal-link
 * graph scanner does not misinterpret these as declared page links.
 */
const MOBILE_STICKY_CTA_PREFIX_SEGMENTS = [
  "compare",
  "features",
  "for",
  "solutions",
  "integrations",
  "free",
  "workflows",
  "nonprofit-software",
  "resources",
  "glossary",
  "lp",
];

/**
 * Returns true when the given pathname should render a sticky mobile CTA bar.
 *
 * Rules:
 * - Explicit exclusion set wins (legal/utility pages).
 * - Exact allow-list matches return true.
 * - Dynamic-route prefix matches return true.
 * - Everything else returns false.
 *
 * Trailing slashes are normalised before matching.
 */
export function shouldShowMobileStickyCta(pathname: string): boolean {
  const normalised =
    pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  // Check against excluded segment names (strip leading slash for comparison)
  const normalisedSegment = normalised.startsWith("/") ? normalised.slice(1) : normalised;
  if (MOBILE_STICKY_CTA_EXCLUDED_SEGMENTS.has(normalisedSegment)) {
    return false;
  }

  if (MOBILE_STICKY_CTA_EXACT_PAGES.has(normalised)) {
    return true;
  }

  for (const segment of MOBILE_STICKY_CTA_PREFIX_SEGMENTS) {
    const prefix = `/${segment}/`;
    const prefixNoTrail = `/${segment}`;
    if (pathname.startsWith(prefix) || normalised.startsWith(prefixNoTrail)) {
      return true;
    }
  }

  return false;
}
import {
  FEATURED_LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_FALLBACK_BY_FAMILY,
} from "../../../../packages/shared/src/constants/lead-magnets";
import {
  DEFAULT_BILLING_CYCLE,
  FEDERAL_EDITION_SKU,
  FOUNDER_CONTACT_EMAIL,
  FOUNDER_LINKEDIN_URL,
  GRANTPIPE_GUARANTEE_COPY,
  getSelfServePlans,
  getGrantPipePricingCopy,
  getPlanDisplayPrice,
  type PricingPlan,
} from "../../../../packages/shared/src/pricing";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { GRANTPIPE_OS_PLAN_LANGUAGE } from "../../../../packages/shared/src/positioning";
import { buildAppPath, buildSignupUrl } from "../lib/app-url";
import { getProductAnchorLinks } from "../lib/marketed-capabilities";
import { getResourcesMegamenuGroups } from "../lib/resource-hubs";
import { personas } from "./personas";

type Plan = "starter" | "growth" | "audit_ready" | "enterprise";
type Cycle = "monthly" | "annual";

export const grantPipeTrialCopy = marketingKnowledge.trial.copy;
const trialCta = marketingKnowledge.ctas.trial;
export const planChoiceCtaTarget = "/pricing/#plans";

export function getSignupCtaTarget(opts?: { plan?: Plan; cycle?: Cycle; promo?: string }): string {
  if (!opts?.plan) {
    return planChoiceCtaTarget;
  }

  return buildSignupUrl(opts);
}

/**
 * Maps a PricingPlan to the shape expected by siteConfig.pricingTiers.
 * Exported so tests can exercise the falsy-branch paths (null prices, no promo).
 */
export function mapPricingPlanToTierConfig(plan: PricingPlan) {
  return {
    name: plan.name,
    price: plan.prices ? getPlanDisplayPrice(plan.tier, "monthly") : "Contact founder",
    ...(plan.prices ? { monthlyPriceCents: plan.prices.monthlyCents } : {}),
    ...(plan.prices ? { annualPriceCents: plan.prices.annualCents } : {}),
    ...(plan.prices
      ? { annualPriceOverride: getPlanDisplayPrice(plan.tier, DEFAULT_BILLING_CYCLE) }
      : {}),
    highlighted: plan.highlighted,
    description: plan.description,
    bestFit: plan.bestFit,
    features: [...plan.features],
  };
}

const productAnchorLinks = getProductAnchorLinks();
const signupCtaTarget = planChoiceCtaTarget;
const canonicalFounderLinkedInUrl = "https://www.linkedin.com/in/angelcampa1/";
// Shared pricing copy for public pages and machine-readable artifacts.
const pricingCopy = getGrantPipePricingCopy();

const productMegamenuGroups = [
  {
    heading: "See the product",
    links: [
      {
        label: "Product overview",
        href: "/product",
        description: "See the full workspace.",
        mobilePriority: true,
      },
      {
        label: "Features",
        href: "/features",
        description: "Browse what GrantPipe includes.",
        mobilePriority: true,
      },
      {
        label: "Integrations",
        href: "/integrations",
        description: "See email, payment, and donor links.",
      },
    ],
  },
  {
    heading: "Core work",
    links: [
      {
        label: "Grant management",
        href: "/grant-management-software",
        description: "Track awards, dates, and reports.",
        mobilePriority: true,
      },
      {
        label: "Grant compliance",
        href: "/grant-compliance-software",
        description: "Keep proof ready for review.",
      },
      {
        label: "Restricted funds",
        href: "/restricted-fund-tracking-software",
        description: "See rules, releases, and balances.",
      },
    ],
  },
  {
    heading: "Proof paths",
    links: [
      {
        label: "Work steps",
        href: "/workflows",
        description: "Follow the work path.",
        mobilePriority: true,
      },
      {
        label: "Glossary",
        href: "/glossary",
        description: "Look up nonprofit grant terms.",
      },
      {
        label: "FAQ hubs",
        href: "/resources/faq",
        description: "Answer common buyer questions.",
      },
    ],
  },
];

const solutionsMegamenuGroups = [
  {
    heading: "By team",
    links: [
      {
        label: "All roles",
        href: "/for",
        description: "Pick the view for your job.",
        mobilePriority: true,
      },
      ...personas.map((persona) => ({
        label: persona.label,
        href: `/for/${persona.slug}`,
        description: persona.description,
      })),
    ],
  },
  {
    heading: "By organization",
    links: [
      {
        label: "Org types",
        href: "/solutions",
        description: "Find your nonprofit path.",
        mobilePriority: true,
      },
      {
        label: "Work steps",
        href: "/workflows",
        description: "Find the handoff to fix.",
      },
    ],
  },
  {
    heading: "By location",
    links: [
      {
        label: "State and city pages",
        href: "/nonprofit-software",
        description: "Use local context.",
        mobilePriority: true,
      },
      {
        label: "Benchmarks",
        href: "/resources/benchmarks",
        description: "See risk with numbers.",
      },
    ],
  },
];

const compareMegamenuGroups = [
  {
    heading: "Compare paths",
    links: [
      {
        label: "Compare overview",
        href: "/compare",
        description: "Pick a compare path.",
        mobilePriority: true,
      },
      {
        label: "Other options",
        href: "/compare/alternatives",
        description: "Find other tools.",
        mobilePriority: true,
      },
      {
        label: "Head-to-head",
        href: "/compare/versus",
        description: "Compare tools side by side.",
      },
      {
        label: "Price checks",
        href: "/compare/pricing",
        description: "Check cost and plan fit.",
        mobilePriority: true,
      },
    ],
  },
  {
    heading: "Decision help",
    links: [
      {
        label: "Tool shortlists",
        href: "/resources/best",
        description: "Review shortlists.",
      },
      {
        label: "Pricing",
        href: "/pricing",
        description: "Check GrantPipe plans.",
        mobilePriority: true,
      },
    ],
  },
  {
    heading: "Final check",
    links: [
      {
        label: "Free resources",
        href: "/free",
        description: "Use a checklist or worksheet first.",
      },
    ],
  },
];

if (canonicalFounderLinkedInUrl !== FOUNDER_LINKEDIN_URL) {
  throw new Error("Founder LinkedIn URL drifted from shared pricing.");
}

export const siteConfig: SiteConfig = {
  name: marketingKnowledge.brand.name,
  domain: marketingKnowledge.brand.domain,
  metaDescription: marketingKnowledge.productPositioning.boilerplate,
  contactEmail: marketingKnowledge.contact.publicEmail,
  areaServed: "United States",
  tagline: marketingKnowledge.productPositioning.tagline,
  author: {
    name: marketingKnowledge.founder.name,
    title: marketingKnowledge.founder.title,
    jobTitle: marketingKnowledge.founder.title,
    email: marketingKnowledge.founder.email,
    url: marketingKnowledge.founder.url,
    sameAs: [...marketingKnowledge.founder.sameAs],
  },
  sameAs: ["https://www.linkedin.com/company/grantpipe/"],
  defaultOgImage: "/og-default.png",
  appleTouchIcon: "/apple-touch-icon.png",
  social: {
    twitterHandle: "@grantpipe",
  },

  logo: {
    light: marketingKnowledge.brand.lightLogoPath,
  },

  theme: {
    // These hex values seed generate-theme-css.ts (packages/ui/src/site/lib)
    // which derives the runtime --site-primary / --site-accent scales. Keep
    // as raw hex - the generator reads them directly for OKLCH conversion.
    primary: "#065f46",
    accent: "#b88928",
    surface: "#fbfaf6",
    text: "#0e1a16",
    muted: "#5b6e66",
    categoryColors: {
      feature: { iconColor: "text-neutral-500" },
      roi: { iconColor: "text-success-600" },
      compliance: { iconColor: "text-accent-500" },
      integration: { iconColor: "text-neutral-500" },
    },
    fonts: {
      heading: "Spectral",
      body: "Manrope",
      mono: "JetBrains Mono",
    },
  },
  product: {
    category: marketingKnowledge.productPositioning.category,
    price: `${pricingCopy.selfServeListRange.replace(/ list price$/, "")}; ${FEDERAL_EDITION_SKU.name} and Enterprise are contact paths`,
    targetAudience: marketingKnowledge.icp.primaryAudience,
    trustSignals: [
      { text: "Built for staff-led setup", category: "roi" },
      {
        text: "Restricted-fund and compliance workflow built in",
        category: "compliance",
      },
      { text: "Multi-source grant pipeline with Grants.gov search", category: "feature" },
      { text: "Compliance, funds, and donor records connected", category: "feature" },
      {
        text: "Designed for mid-sized nonprofits with active grant pressure",
        category: "roi",
      },
    ],
  },
  competitors: marketingKnowledge.competitorBattlecards.map((competitor) => ({
    slug: competitor.slug,
    name: competitor.name,
    pricing: competitor.pricing,
    weakness: competitor.weakness,
  })),
  funnel: {
    tofu: {
      ctaMode: "educate",
      ctaText: marketingKnowledge.ctas.resources.label,
      ctaTarget: marketingKnowledge.ctas.resources.href,
    },
    mofu: {
      ctaMode: "evaluate",
      ctaText: marketingKnowledge.ctas.productWalkthrough.label,
      ctaTarget: marketingKnowledge.ctas.productWalkthrough.href,
    },
    bofu: {
      ctaMode: "convert",
      ctaText: trialCta.label,
      ctaTarget: signupCtaTarget,
    },
    ctaSubtitle: trialCta.subtitle!,
  },
  survey: {
    questions: [
      {
        id: "budget",
        text: "What is your organization's annual budget?",
        options: ["Under $500K", "$500K-$1M", "$1M-$5M", "$5M-$10M", "Over $10M"],
      },
      {
        id: "grants",
        text: "How many active grants are you currently managing?",
        options: ["0-2", "3-10", "11-25", "25+"],
      },
      {
        id: "current_tool",
        text: "What tools are you currently using?",
        options: ["Salesforce", "Bloomerang", "DonorPerfect", "Spreadsheets", "Other"],
      },
    ],
  },
  faqs: [
    {
      q: "How much does GrantPipe cost?",
      a: `GrantPipe has three self-serve plans. Starter starts at ${pricingCopy.starterMonthly}. Growth starts at ${pricingCopy.growthMonthly}. Audit-Ready starts at ${pricingCopy.auditReadyMonthly}. ${FEDERAL_EDITION_SKU.name} is a contact path for teams with federal awards. For larger cases, contact founder Angel Campa at ${FOUNDER_CONTACT_EMAIL} or LinkedIn.`,
    },
    {
      q: "Can GrantPipe replace our existing CRM?",
      a: "Yes. GrantPipe is built to connect donor relationships with grant compliance, restricted funds, evidence, and reporting. You can import donor and grant history from Bloomerang, DonorPerfect, Salesforce, or spreadsheets using CSV exports from your current system. The guided import wizard maps your columns and previews the data before committing.",
    },
    {
      q: "Does GrantPipe include grant opportunity search?",
      a: "Yes. GrantPipe includes Grants.gov search in every plan. Teams can also manually add or import state/local, foundation, corporate, association, and other non-federal opportunities, with foundation prospect context from public nonprofit filings where available. GrantPipe does not claim a proprietary private foundation or corporate opportunity database.",
    },
    {
      q: "Does GrantPipe include AI?",
      a: "Yes. Every paid plan includes AI Award Document Intake. It reads an award letter and prepares the grant setup. You check the source before any record is created. Starter includes up to 5 award intakes each month. Ask-Your-Ledger answers grant budget and fund balance questions from your records on Growth plans and up. Each answer links to the source.",
    },
    {
      q: "How does GrantPipe compare to Salesforce Nonprofit?",
      a: `Salesforce Nonprofit usually costs more once you add licenses, setup, and admin help. GrantPipe publishes ${pricingCopy.selfServeListRange.replace(/ list price$/, "")} for self-serve plans, includes unlimited users, and is built for nonprofit staff rather than Salesforce admins.`,
    },
    {
      q: "What does migration support look like?",
      a: "We provide guided data import tools and documentation to move your data from Bloomerang, DonorPerfect, Salesforce exports, spreadsheets, or other systems. Audit-Ready and Enterprise customers get guided onboarding, import, and setup.",
    },
    {
      q: "Does GrantPipe handle restricted fund tracking?",
      a: "Yes. Starter includes basic restricted fund visibility. Growth adds terms, additions, releases, evidence links, alerts, and restricted rollforwards. Audit-Ready adds evidence package output and the Auditor & Funder Portal. GrantPipe includes native accounting records, FASB ASC 958 double-entry ledger context, and a review trail. It does not sync with QuickBooks right now.",
    },
    {
      q: "Why are so many nonprofits switching CRMs right now?",
      a: "Many nonprofits are re-evaluating their CRM because feature gaps keep compliance deadlines, restricted funds, donor records, and grant reporting spread across separate systems. GrantPipe was built to close that gap in one workspace.",
    },
    {
      q: "How do auditors access GrantPipe?",
      a: "GrantPipe offers two access paths for auditors. Inside the workspace, you can grant the Auditor user role, which provides read-only access to grants, funds, documents, compliance, accounting, and reports (and intentionally excludes donor, event, import, settings, billing, and team areas). For outside reviewers without a GrantPipe account, Audit-Ready and Enterprise plans include the Auditor & Funder Portal: invite an external reviewer by email, choose which grants, funds, and documents they can see, and set an expiry date. They receive a time-limited secure link with no GrantPipe account required. Every document view and download is logged in the portal audit trail.",
    },
    {
      q: "Can I revoke external reviewer access?",
      a: "Yes. You can revoke a portal session at any time from Settings → Portal access. The link immediately stops working. Revocation is logged in the audit trail alongside all other reviewer activity.",
    },
  ],
  discoveryCallUrl: `mailto:${FOUNDER_CONTACT_EMAIL}`,
  discoveryCallIncentive: "Contact founder",
  appLoginUrl: buildAppPath("/login"),
  problemAgitation: {
    heading: "Still tracking grant deadlines in a spreadsheet? Many nonprofits still are.",
    closingLine: "Here's how GrantPipe fixes it.",
    painPoints: [
      "You track donors in one tool. You track grants in another. Those systems do not sync cleanly. Each grant takes about 8 hours a year to report on.",
      "Compliance work pulls your team away from the mission, and 42% of funders cap indirect costs at 10%. The math does not work without help.",
      "At audit time you scramble to pull records from three systems at once. A 2024 GAO review tied $1.17 trillion in federal spending to severe audit findings.",
    ],
  },
  leadMagnets: {
    featuredSlugs: [...FEATURED_LEAD_MAGNET_SLUGS],
    fallbackByFamily: { ...LEAD_MAGNET_FALLBACK_BY_FAMILY },
  },
  exitPopup: {
    enabled: true,
  },
  socialProof: [
    { icon: "clock", value: "Plan-first", label: "pricing flow" },
    { icon: "check", value: "0", label: "setup fees" },
    { icon: "users", value: "1", label: "workspace for compliance and funds" },
    { icon: "check", value: "Included", label: "multi-source grant pipeline" },
    { icon: "shield", value: "Built-in", label: "compliance reporting" },
  ],
  heroBenefits: [
    "Funder, board, audit, and finance answers from the same record",
    "Donor context, grant deadlines, restricted funds, and reports connected",
    "Built for nonprofit staff to run without a system admin",
    "Start with a 1-month free trial and no credit card",
  ],
  copy: {
    emailCapture: {
      subtitle: `Pick a plan to start your ${grantPipeTrialCopy.toLowerCase()}`,
      whatHappensNext:
        "We’ll save your spot, open the 3-question setup survey, and follow up with next steps.",
      surveyPreview: "Quick 3 questions to help shape the product. Takes 30 seconds.",
    },
    homepage: {
      proofBody: `GrantPipe brings compliance deadlines, evidence, restricted funds, donor history, grant workflows, reporting, and fund accounting into eight connected modules; ${GRANTPIPE_OS_PLAN_LANGUAGE}`,
    },
    survey: {
      qualifiedHeading: "You're exactly who we built this for",
      qualifiedBody:
        "We built GrantPipe for teams that manage grants and donors. Start a free trial. See if it fits your work.",
      qualifiedCtaText: trialCta.label,
      qualifiedCtaTarget: signupCtaTarget,
      unqualifiedCtaText: "Explore our guides",
      unqualifiedCtaTarget: "/resources",
    },
    funnelCta: {
      trustNote: "No credit card required. Add billing later if the trial is a fit.",
      benefitBullets: [
        "No setup fees",
        "Grants.gov search plus manual/imported non-federal opportunities",
        "Compliance deadlines, restricted funds, and donor records connected",
        "Built-in compliance reporting",
      ],
    },
    faq: {
      bottomCtaHeading: "Still have questions?",
      bottomCtaText: trialCta.label,
      bottomCtaTarget: signupCtaTarget,
    },
    exitPopup: {
      headline: "Before you go: get a free GrantPipe resource",
      description:
        "Get a practical PDF checklist or worksheet by email before you choose a donor, grant, or compliance workflow.",
      ctaText: "Email Me the Free Resource",
      declineText: "No thanks",
      leftPanelLabel: "Free resource",
      privacyNote: "Get the resource in your inbox.",
      successMessage: "Check your email",
      successSubMessage: "We're sending the resource now. It usually arrives within a minute.",
      showLeadMagnetContent: true,
    },
  },
  heroCopy: {
    subheadline:
      "GrantPipe connects awards, deadlines, restricted funds, donor records, documents, and reports so your team can prove what is awarded, restricted, due, and ready for review without rebuilding the story across spreadsheets.",
  },
  heroTrustSignal: "Eight connected modules for the grant-funded operating week",
  pricingTiers: getSelfServePlans().map(mapPricingPlanToTierConfig),

  pricingConfig: {
    trialBannerText: `Pick a plan to start your ${grantPipeTrialCopy.toLowerCase()}`,
    annualSavingsText: "Annual saves 20%.",
    monthlyToggleLabel: "Monthly",
    annualToggleLabel: "Annual",
    guaranteeText: GRANTPIPE_GUARANTEE_COPY,
  },

  nav: {
    items: [
      {
        label: "Product",
        href: "/product",
        activePaths: [
          "/product",
          "/features",
          "/integrations",
          "/grant-management-software",
          "/grant-compliance-software",
          "/restricted-fund-tracking-software",
        ],
        groups: productMegamenuGroups,
      },
      {
        label: "Solutions",
        href: "/solutions",
        activePaths: ["/solutions", "/for", "/nonprofit-software"],
        groups: solutionsMegamenuGroups,
      },
      {
        label: "Resources",
        href: "/resources",
        activePaths: ["/resources", "/free", "/glossary", "/workflows"],
        groups: getResourcesMegamenuGroups(),
      },
      {
        label: "Compare",
        href: "/compare",
        activePaths: ["/compare"],
        groups: compareMegamenuGroups,
      },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  footer: {
    emailCapture: {
      heading: "Start your GrantPipe free trial",
      buttonText: trialCta.label,
    },
    linkGroups: [
      {
        heading: "Product",
        links: [
          { label: "Product overview", href: "/product" },
          productAnchorLinks[0]!,
          productAnchorLinks[2]!,
          { label: "Pricing", href: "/pricing" },
          { label: trialCta.label, href: signupCtaTarget },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Resources hub", href: "/resources" },
          { label: "Topic Hubs", href: "/resources/topics" },
          { label: "Guides", href: "/resources/guides" },
          { label: "Software Roundups", href: "/resources/best" },
          { label: "Free Resources", href: "/free" },
          { label: "Glossary", href: "/glossary" },
          { label: "Workflows", href: "/workflows" },
          { label: "Compare hub", href: "/compare" },
          { label: "Compare Alternatives", href: "/compare/alternatives" },
          { label: "Pricing Breakdowns", href: "/compare/pricing" },
          { label: "By State", href: "/nonprofit-software" },
          { label: "By Org Type", href: "/solutions" },
          { label: "By Role", href: "/for" },
          { label: "Integrations", href: "/integrations" },
          {
            label: "Free Grant Checklist",
            href: "/free/grant-compliance-checklist",
          },
        ],
      },
      {
        heading: "For AI agents",
        links: [
          { label: "AI-Readable Overview", href: "/llms.txt" },
          { label: "Full AI Context", href: "/llms-full.txt" },
          { label: "AI-Readable Pricing", href: "/pricing.txt" },
          { label: "Agent Instructions", href: "/AGENTS.md" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About", href: "/about" },
          { label: "GrantPipe Books", href: "/books" },
          {
            label: "GrantPipe LinkedIn",
            href: "https://www.linkedin.com/company/grantpipe/",
          },
          {
            label: "Angel Campa LinkedIn",
            href: canonicalFounderLinkedInUrl,
          },
        ],
      },
    ],
    legalLinks: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
};
