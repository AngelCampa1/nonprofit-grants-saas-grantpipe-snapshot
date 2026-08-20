import { FEDERAL_EDITION_SKU, getPlanDisplayPrice } from "../../pricing";
import type { CompetitorBattlecard } from "../types";

export interface CompetitorProfile {
  slug: string;
  name: string;
  pricingSummary: string;
  contractSummary: string;
  setupSummary: string;
  donorCrmSummary: string;
  grantSummary: string;
  complianceSummary: string;
  bestFor: string;
  verifiedAt: string;
  sourceUrls: string[];
}

const grantPipePricingSummary = [
  `Starter ${getPlanDisplayPrice("starter", "monthly")}`,
  `Growth ${getPlanDisplayPrice("growth", "monthly")}`,
  `Audit-Ready ${getPlanDisplayPrice("audit_ready", "monthly")}`,
  `${FEDERAL_EDITION_SKU.name} ${FEDERAL_EDITION_SKU.planningEstimateLabel}`,
  "custom Enterprise path",
].join("; ");

export const grantPipeMarketPosition = {
  pricingSummary: grantPipePricingSummary,
  contractSummary: "Month-to-month or annual billing",
  setupSummary: "No setup fee",
  donorCrmSummary: "Built in",
  grantSummary: "Application through post-award workflow",
  complianceSummary: "Restricted-fund and reporting workflow built in",
  bestFor: "Mid-sized nonprofits managing donors, grants, and restricted funds in one system",
} as const;

export const competitorProfiles: Record<string, CompetitorProfile> = {
  blackbaud: {
    slug: "blackbaud",
    name: "Blackbaud",
    pricingSummary: "Custom quote / annual contract",
    contractSummary: "Annual contract common",
    setupSummary: "Implementation services commonly required",
    donorCrmSummary: "Strong fundraising CRM depth",
    grantSummary: "Grant and fund workflows spread across products/modules",
    complianceSummary:
      "Accounting/compliance depth lives primarily in Financial Edge NXT, not a light mid-market donor workflow",
    bestFor: "Larger organizations already committed to the Blackbaud ecosystem",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.blackbaud.com/industry/nonprofit",
      "https://www.blackbaud.com/products/raisers-edge-nxt",
      "https://www.blackbaud.com/products/financial-edge-nxt",
    ],
  },
  "blackbaud-hidden-costs": {
    slug: "blackbaud-hidden-costs",
    name: "Blackbaud",
    pricingSummary: "Custom quote / annual contract",
    contractSummary: "Annual contract common",
    setupSummary: "Implementation services commonly required",
    donorCrmSummary: "Strong fundraising CRM depth",
    grantSummary: "Grant and fund workflows spread across products/modules",
    complianceSummary:
      "Accounting/compliance depth lives primarily in Financial Edge NXT, not a light mid-market donor workflow",
    bestFor: "Larger organizations already committed to the Blackbaud ecosystem",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.blackbaud.com/industry/nonprofit",
      "https://www.blackbaud.com/products/raisers-edge-nxt",
      "https://www.blackbaud.com/products/financial-edge-nxt",
    ],
  },
  "blackbaud-mid-size-nonprofits": {
    slug: "blackbaud-mid-size-nonprofits",
    name: "Blackbaud",
    pricingSummary: "Custom quote / annual contract",
    contractSummary: "Annual contract common",
    setupSummary: "Implementation services commonly required",
    donorCrmSummary: "Strong fundraising CRM depth",
    grantSummary: "Grant and fund workflows spread across products/modules",
    complianceSummary:
      "Accounting/compliance depth lives primarily in Financial Edge NXT, not a light mid-market donor workflow",
    bestFor: "Larger organizations already committed to the Blackbaud ecosystem",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.blackbaud.com/industry/nonprofit",
      "https://www.blackbaud.com/products/raisers-edge-nxt",
      "https://www.blackbaud.com/products/financial-edge-nxt",
    ],
  },
  "blackbaud-nonprofit-crm": {
    slug: "blackbaud-nonprofit-crm",
    name: "Blackbaud",
    pricingSummary: "Custom quote / annual contract",
    contractSummary: "Annual contract common",
    setupSummary: "Implementation services commonly required",
    donorCrmSummary: "Strong fundraising CRM depth",
    grantSummary: "Grant and fund workflows spread across products/modules",
    complianceSummary:
      "Accounting/compliance depth lives primarily in Financial Edge NXT, not a light mid-market donor workflow",
    bestFor: "Larger organizations already committed to the Blackbaud ecosystem",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.blackbaud.com/industry/nonprofit",
      "https://www.blackbaud.com/products/raisers-edge-nxt",
      "https://www.blackbaud.com/products/financial-edge-nxt",
    ],
  },
  bloomerang: {
    slug: "bloomerang",
    name: "Bloomerang",
    pricingSummary: "Starts at $125/month",
    contractSummary: "Annual SaaS pricing / contact-based growth",
    setupSummary: "Self-serve onboarding plus optional services",
    donorCrmSummary: "Core strength",
    grantSummary:
      "Published grant tracking / grant management coverage, but not a compliance-first post-award system",
    complianceSummary:
      "Limited compared with purpose-built restricted-fund and audit workflow software",
    bestFor: "Teams prioritizing donor CRM, retention, and fundraising workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://bloomerang.com/pricing/",
      "https://bloomerang.com/nonprofit-crm/",
      "https://bloomerang.com/nonprofit-grant-management-software/",
    ],
  },
  "bloomerang-executive-directors": {
    slug: "bloomerang-executive-directors",
    name: "Bloomerang",
    pricingSummary: "Starts at $125/month",
    contractSummary: "Annual SaaS pricing / contact-based growth",
    setupSummary: "Self-serve onboarding plus optional services",
    donorCrmSummary: "Core strength",
    grantSummary:
      "Published grant tracking / grant management coverage, but not a compliance-first post-award system",
    complianceSummary:
      "Limited compared with purpose-built restricted-fund and audit workflow software",
    bestFor: "Teams prioritizing donor CRM, retention, and fundraising workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://bloomerang.com/pricing/",
      "https://bloomerang.com/nonprofit-crm/",
      "https://bloomerang.com/nonprofit-grant-management-software/",
    ],
  },
  "bloomerang-for-mid-size": {
    slug: "bloomerang-for-mid-size",
    name: "Bloomerang",
    pricingSummary: "Starts at $125/month",
    contractSummary: "Annual SaaS pricing / contact-based growth",
    setupSummary: "Self-serve onboarding plus optional services",
    donorCrmSummary: "Core strength",
    grantSummary:
      "Published grant tracking / grant management coverage, but not a compliance-first post-award system",
    complianceSummary:
      "Limited compared with purpose-built restricted-fund and audit workflow software",
    bestFor: "Teams prioritizing donor CRM, retention, and fundraising workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://bloomerang.com/pricing/",
      "https://bloomerang.com/nonprofit-crm/",
      "https://bloomerang.com/nonprofit-grant-management-software/",
    ],
  },
  "salesforce-nonprofit": {
    slug: "salesforce-nonprofit",
    name: "Salesforce Nonprofit",
    pricingSummary: "$60/user/month Enterprise plus implementation scope",
    contractSummary: "Annual SaaS / ecosystem-led implementation",
    setupSummary: "Implementation or admin capacity usually required",
    donorCrmSummary: "Very strong when configured well",
    grantSummary: "Broadly configurable, but depth depends on implementation scope",
    complianceSummary:
      "Can be extended, but restricted-fund and grant compliance workflows are not a light out-of-the-box experience for mid-market teams",
    bestFor:
      "Organizations with admin capacity, consulting budget, or complex enterprise workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.salesforce.com/nonprofit/pricing/",
      "https://www.salesforce.com/nonprofit/",
      "https://www.salesforce.com/products/nonprofit-cloud/overview/",
    ],
  },
  "salesforce-nonprofit-no-consultants": {
    slug: "salesforce-nonprofit-no-consultants",
    name: "Salesforce Nonprofit",
    pricingSummary: "$60/user/month Enterprise plus implementation scope",
    contractSummary: "Annual SaaS / ecosystem-led implementation",
    setupSummary: "Implementation or admin capacity usually required",
    donorCrmSummary: "Very strong when configured well",
    grantSummary: "Broadly configurable, but depth depends on implementation scope",
    complianceSummary:
      "Can be extended, but restricted-fund and grant compliance workflows are not a light out-of-the-box experience for mid-market teams",
    bestFor:
      "Organizations with admin capacity, consulting budget, or complex enterprise workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.salesforce.com/nonprofit/pricing/",
      "https://www.salesforce.com/nonprofit/",
      "https://www.salesforce.com/products/nonprofit-cloud/overview/",
    ],
  },
  "salesforce-nonprofit-true-cost": {
    slug: "salesforce-nonprofit-true-cost",
    name: "Salesforce Nonprofit",
    pricingSummary: "$60/user/month Enterprise plus implementation scope",
    contractSummary: "Annual SaaS / ecosystem-led implementation",
    setupSummary: "Implementation or admin capacity usually required",
    donorCrmSummary: "Very strong when configured well",
    grantSummary: "Broadly configurable, but depth depends on implementation scope",
    complianceSummary:
      "Can be extended, but restricted-fund and grant compliance workflows are not a light out-of-the-box experience for mid-market teams",
    bestFor:
      "Organizations with admin capacity, consulting budget, or complex enterprise workflows",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.salesforce.com/nonprofit/pricing/",
      "https://www.salesforce.com/nonprofit/",
      "https://www.salesforce.com/products/nonprofit-cloud/overview/",
    ],
  },
  instrumentl: {
    slug: "instrumentl",
    name: "Instrumentl",
    pricingSummary: "$299-$999/month plus enterprise pricing",
    contractSummary: "Annual or monthly billing by plan; enterprise pricing on request",
    setupSummary: "Low setup for discovery workflow",
    donorCrmSummary: "Not a donor CRM",
    grantSummary: "Strong pre-award workflow plus newer post-award spend tracking on higher tiers",
    complianceSummary:
      "Adds spend tracking on Full Lifecycle, but not a donor CRM or finance-grade restricted-fund compliance system",
    bestFor:
      "Teams whose main constraint is prospecting, applications, and award tracking rather than unified donor-plus-finance operations",
    verifiedAt: "2026-04-21",
    sourceUrls: [
      "https://www.instrumentl.com/pricing",
      "https://www.instrumentl.com/grant-management-software",
    ],
  },
  granthub: {
    slug: "granthub",
    name: "GrantHub",
    pricingSummary: "Custom quote / grant-management-focused pricing",
    contractSummary: "Subscription pricing oriented around grant workflow needs",
    setupSummary: "Moderate setup for grant-only teams",
    donorCrmSummary: "Not a donor CRM",
    grantSummary: "Grant workflow focus without unified donor CRM coverage",
    complianceSummary:
      "Helps with grant tracking, but not a full donor-plus-restricted-fund platform",
    bestFor: "Teams that want standalone grant workflow software without donor CRM replacement",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://www.granthub.com/", "https://www.granthub.com/features/"],
  },
  "network-for-good": {
    slug: "network-for-good",
    name: "Network for Good",
    pricingSummary: "Custom quote / package pricing",
    contractSummary: "Sales-led fundraising platform purchase",
    setupSummary: "Onboarding and coaching positioned as part of the offer",
    donorCrmSummary: "Fundraising and donor management coverage",
    grantSummary: "Not grant-compliance centered",
    complianceSummary: "Not built around restricted-fund and post-award reporting rigor",
    bestFor: "Fundraising-led organizations wanting bundled coaching and giving tools",
    verifiedAt: "2026-04-21",
    sourceUrls: ["https://www.networkforgood.com/", "https://www.bonterratech.com/"],
  },
  donorperfect: {
    slug: "donorperfect",
    name: "DonorPerfect",
    pricingSummary: "Sales-led / module-based pricing",
    contractSummary: "Annual SaaS / module expansion",
    setupSummary: "Moderate setup depending on modules",
    donorCrmSummary: "Strong donor management depth",
    grantSummary: "Some grant workflow coverage, but not a unified compliance-first platform",
    complianceSummary:
      "Restricted-fund and grant compliance usually require additional process or tooling",
    bestFor: "Teams wanting mature donor CRM and reporting depth",
    verifiedAt: "2026-04-21",
    sourceUrls: ["https://www.donorperfect.com/", "https://www.donorperfect.com/nonprofit-crm/"],
  },
  "neon-crm": {
    slug: "neon-crm",
    name: "Neon CRM",
    pricingSummary: "Starts at $139/month",
    contractSummary: "Tiered SaaS pricing",
    setupSummary: "Self-serve plus onboarding services",
    donorCrmSummary: "Broad nonprofit CRM coverage",
    grantSummary:
      "Breadth across nonprofit operations, but not a deeply specialized grant compliance position",
    complianceSummary: "Better breadth than depth for grant-heavy finance/compliance use cases",
    bestFor: "Organizations needing one broad nonprofit operations suite",
    verifiedAt: "2026-04-21",
    sourceUrls: ["https://neonone.com/pricing/", "https://neonone.com/products/neon-crm/"],
  },
  charityengine: {
    slug: "charityengine",
    name: "CharityEngine",
    pricingSummary: "Custom quote / enterprise-led pricing",
    contractSummary: "Sales-led subscription with implementation scope",
    setupSummary: "Onboarding and migration services typically involved",
    donorCrmSummary: "Broad fundraising and donor operations coverage",
    grantSummary: "Not positioned around grant lifecycle depth",
    complianceSummary:
      "Covers broad nonprofit operations, but grant-heavy compliance teams still need to confirm restricted-fund and post-award workflow depth",
    bestFor:
      "Larger fundraising programs consolidating payments, events, and CRM into one platform",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://charityengine.com/", "https://charityengine.com/nonprofit-crm/"],
  },
  givebutter: {
    slug: "givebutter",
    name: "Givebutter",
    pricingSummary: "Free platform with optional tips and paid add-ons",
    contractSummary: "Self-serve fundraising pricing with add-on expansion",
    setupSummary: "Low setup for campaign-led fundraising teams",
    donorCrmSummary: "Light donor and campaign management compared with full CRMs",
    grantSummary: "Not a grant lifecycle or compliance platform",
    complianceSummary: "Does not center restricted-fund accounting or post-award grant reporting",
    bestFor: "Small teams focused on online giving, peer-to-peer, and campaign fundraising",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://givebutter.com/", "https://givebutter.com/pricing"],
  },
  "hubspot-nonprofit": {
    slug: "hubspot-nonprofit",
    name: "HubSpot",
    pricingSummary: "Free CRM plus paid marketing, sales, and service hubs",
    contractSummary: "Product-led entry with sales-assisted upgrades",
    setupSummary: "Low setup for core CRM, more work as hubs and workflows expand",
    donorCrmSummary: "General-purpose CRM rather than nonprofit-native donor operations",
    grantSummary: "No nonprofit-native grant workflow depth out of the box",
    complianceSummary:
      "Requires customization and adjacent tooling for restricted funds and grant compliance operations",
    bestFor:
      "Teams that prioritize general CRM and marketing automation over nonprofit-native workflows",
    verifiedAt: "2026-04-22",
    sourceUrls: [
      "https://www.hubspot.com/pricing",
      "https://www.hubspot.com/products/crm",
      "https://www.hubspot.com/nonprofits",
    ],
  },
  keela: {
    slug: "keela",
    name: "Keela",
    pricingSummary: "Tiered SaaS / quote-assisted pricing",
    contractSummary: "Subscription pricing with growth by plan",
    setupSummary: "Light-to-moderate onboarding",
    donorCrmSummary: "Fundraising CRM focus",
    grantSummary: "Basic grant workflow coverage",
    complianceSummary: "Not a deep restricted-fund or audit workflow position",
    bestFor: "Smaller teams wanting all-in-one fundraising operations",
    verifiedAt: "2026-04-21",
    sourceUrls: ["https://www.keela.co/", "https://www.keela.co/nonprofit-crm"],
  },
  "keela-grant-compliance": {
    slug: "keela-grant-compliance",
    name: "Keela",
    pricingSummary: "Tiered SaaS / quote-assisted pricing",
    contractSummary: "Subscription pricing with growth by plan",
    setupSummary: "Light-to-moderate onboarding",
    donorCrmSummary: "Fundraising CRM focus",
    grantSummary: "Basic grant workflow coverage",
    complianceSummary: "Not a deep restricted-fund or audit workflow position",
    bestFor: "Smaller teams wanting all-in-one fundraising operations",
    verifiedAt: "2026-04-21",
    sourceUrls: ["https://www.keela.co/", "https://www.keela.co/nonprofit-crm"],
  },
  "little-green-light": {
    slug: "little-green-light",
    name: "Little Green Light",
    pricingSummary: "$45-$90/month depending on contact volume",
    contractSummary: "Simple monthly or annual subscription pricing",
    setupSummary: "Low setup for donor-focused teams",
    donorCrmSummary: "Strong value donor CRM for smaller organizations",
    grantSummary: "Limited grant workflow depth",
    complianceSummary: "Not a dedicated restricted-fund or audit workflow platform",
    bestFor: "Smaller nonprofits prioritizing affordable donor CRM coverage",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://www.littlegreenlight.com/pricing/", "https://www.littlegreenlight.com/"],
  },
  virtuous: {
    slug: "virtuous",
    name: "Virtuous",
    pricingSummary: "Custom quote / sales-led contract",
    contractSummary: "Annual contract with onboarding and implementation scope",
    setupSummary: "Moderate-to-heavy onboarding depending on integrations",
    donorCrmSummary: "Strong fundraising automation and responsive fundraising positioning",
    grantSummary: "Not a grant compliance-first platform",
    complianceSummary:
      "Requires adjacent process or tooling for restricted-fund and grant reporting rigor",
    bestFor: "Fundraising teams prioritizing segmentation, journeys, and automation depth",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://www.virtuous.org/pricing/", "https://www.virtuous.org/crm/"],
  },
  "zoho-nonprofit": {
    slug: "zoho-nonprofit",
    name: "Zoho",
    pricingSummary: "Free and paid tiers across Zoho CRM and adjacent apps",
    contractSummary: "Tiered SaaS pricing across multiple modules",
    setupSummary: "Moderate setup because nonprofit workflows require customization",
    donorCrmSummary: "General CRM breadth with nonprofit workflows built through customization",
    grantSummary: "No grant-native lifecycle depth out of the box",
    complianceSummary:
      "Restricted-fund and grant compliance workflows depend on custom configuration and external process discipline",
    bestFor:
      "Organizations comfortable tailoring a broad business software stack to nonprofit needs",
    verifiedAt: "2026-04-22",
    sourceUrls: ["https://www.zoho.com/crm/pricing.html", "https://www.zoho.com/us/nonprofits/"],
  },
};

export const directCompetitorSlugs = [
  "bloomerang",
  "blackbaud",
  "salesforce-nonprofit",
  "keela",
  "little-green-light",
  "virtuous",
  "hubspot-nonprofit",
  "zoho-nonprofit",
  "givebutter",
] as const;

export function getDirectCompetitorBattlecards(): CompetitorBattlecard[] {
  return directCompetitorSlugs.map((slug) => {
    const profile = competitorProfiles[slug];
    if (!profile) {
      throw new Error(`Missing direct competitor profile: ${slug}`);
    }

    return {
      slug: profile.slug,
      name: profile.name,
      pricing: profile.pricingSummary,
      pricingSummary: profile.pricingSummary,
      contractSummary: profile.contractSummary,
      setupSummary: profile.setupSummary,
      donorCrmSummary: profile.donorCrmSummary,
      grantSummary: profile.grantSummary,
      complianceSummary: profile.complianceSummary,
      bestFor: profile.bestFor,
      weakness: profile.complianceSummary,
      verifiedAt: profile.verifiedAt,
      sources: profile.sourceUrls.map((url, index) => ({
        label: `${profile.name} source ${index + 1}`,
        url,
      })),
    };
  });
}

export function getCompetitorProfile(slug: string): CompetitorProfile | undefined {
  return competitorProfiles[slug];
}
