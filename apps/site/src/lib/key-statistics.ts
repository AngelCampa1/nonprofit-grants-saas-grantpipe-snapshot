import { marketingKnowledge } from "@grantpipe/shared/public-kb";

export type KeyStatistic = {
  stat: string;
  source: string;
  sourceUrl: string;
};

export const KEY_STATISTICS: KeyStatistic[] = [
  {
    stat: "Nearly half of nonprofits are considering switching their CRM within 12 months, up from 10% the prior year",
    source: "Omatic, 2025 Nonprofit Technology Ecosystem Trends Report (n=600+)",
    sourceUrl:
      "https://omaticsoftware.com/blog/highlights-from-our-2025-nonprofit-technology-ecosystem-trends-report/",
  },
  {
    stat: "About one-third of nonprofits (33.3%) rate their CRM systems as effective",
    source: "Fifty & Fifty, 2025 Nonprofit Peer Report (n≈160), reported via Virtuous",
    sourceUrl: "https://virtuous.org/blog/2025-nonprofit-peer-report-with-javan-van-gronigen/",
  },
  {
    stat: "Salesforce nonprofit deployments commonly include implementation costs of $15K–$60K plus ongoing admin of $20K–$60K per year, with license fees often the smallest line item",
    source:
      "Salesforce nonprofit pricing (license fee structure); component breakdown synthesized from vendor pricing pages",
    sourceUrl: "https://www.salesforce.com/nonprofit/pricing/",
  },
  {
    stat: "Grantees spend roughly 8 hours per grant per year on reporting, and about 30+ hours across the lifetime of a grant",
    source:
      "CEP, 'Why Do We Bother? The Tragedy of Foundation Reporting Requirements' (Kevin Bolduc)",
    sourceUrl:
      "https://cep.org/blog/why-do-we-bother-the-tragedy-of-foundation-reporting-requirements/",
  },
  {
    stat: "36% of nonprofits ended FY2024 with an operating deficit — the highest in 10 years of NFF survey data",
    source: "Nonprofit Finance Fund, 2025 State of the Nonprofit Sector Survey (n=2,206)",
    sourceUrl:
      "https://nff.org/state-of-the-nonprofit-sector-survey/2025-state-of-the-survey-nonprofit-sector-survey/",
  },
  {
    stat: "42% of nonprofits report that their largest non-government funder allows an indirect/administrative cost allowance of 10% or less",
    source: "GrantStation, 2024 State of Grantseeking Report (n=2,306)",
    sourceUrl: "https://grantstation.com/state-of-grantseeking/key-findings-2024",
  },
  {
    stat: "79% of nonprofits use five or more third-party systems beyond their CRM, up from 62% the prior year",
    source: "Omatic, 2025 Nonprofit Technology Ecosystem Trends Report",
    sourceUrl:
      "https://omaticsoftware.com/blog/highlights-from-our-2025-nonprofit-technology-ecosystem-trends-report/",
  },
  {
    stat: "$1.17 trillion of $6.97 trillion in federal awards spent FY2017–FY2021 was linked to severe, persistent Single Audit findings",
    source:
      "U.S. Government Accountability Office, Single Audits Report GAO-24-106173 (April 2024)",
    sourceUrl: "https://www.gao.gov/products/gao-24-106173",
  },
];

export function renderKeyStatsMarkdown(): string {
  const bullets = KEY_STATISTICS.map((item) => `- ${item.stat} (${item.source})`).join("\n");
  return `## Key Statistics (with sources)\n\n${bullets}\n`;
}

const [starterPlan, growthPlan, auditReadyPlan] = marketingKnowledge.plans;

export const ABOUT_GRANTPIPE_MARKDOWN = `## About GrantPipe

GrantPipe is a unified donor CRM and grant compliance platform for ${marketingKnowledge.icp.primaryAudience}. It combines donor management, restricted fund tracking, and audit-ready grant compliance reporting in one system starting at ${starterPlan!.displayPrices.monthly}, with Growth at ${growthPlan!.displayPrices.monthly}, Audit-Ready at ${auditReadyPlan!.displayPrices.monthly}, and a direct founder contact path for larger cases.`;
