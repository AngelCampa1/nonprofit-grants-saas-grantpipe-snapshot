import type { BuyerStage, FaqItem, RelatedPage } from "@grantpipe/ui/site";
import {
  getGrantPipePricingCopy,
  getPlanLabelsWithEntitlement,
} from "../../../../packages/shared/src/pricing";

const pricingCopy = getGrantPipePricingCopy();
const auditorPortalPlanLabels = getPlanLabelsWithEntitlement("hasAuditorFunderPortal");
const auditorPortalPlanList = auditorPortalPlanLabels.join(" or ");

export type GrantTopicHubSlug =
  | "grant-management"
  | "grant-compliance"
  | "restricted-fund-accounting";

export interface GrantCategoryStatistic {
  stat: string;
  source: string;
  sourceUrl?: string;
}

export interface GrantCategoryAnswer {
  q: string;
  a: string;
}

export interface GrantCategorySection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface GrantCategoryPageDefinition {
  slug:
    | "grant-management-software"
    | "grant-compliance-software"
    | "grant-tracking-software"
    | "restricted-fund-tracking-software"
    | "grant-reporting-software"
    | "auditor-funder-portal-software"
    | "subrecipient-monitoring-software";
  href: `/${string}`;
  hubSlug: GrantTopicHubSlug;
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  bluf: string;
  publishedAt: string;
  updatedAt: string;
  lastReviewedAt: string;
  verifiedAt: string;
  buyerStage: BuyerStage;
  targetKeyword: string;
  primaryCta: "trial" | "pricing" | "compare";
  contentIntent: "category";
  topicCluster: "grant-management" | "grant-compliance" | "restricted-fund-accounting";
  definitionTerm: string;
  definition: string;
  heroTitle: string;
  heroDescription: string;
  whoItsFor: string[];
  notFor: string[];
  evaluationPoints: string[];
  statistics: GrantCategoryStatistic[];
  answers: GrantCategoryAnswer[];
  faqs: FaqItem[];
  relatedPages: RelatedPage[];
  sourceUrls: string[];
  sections: GrantCategorySection[];
}

export const grantCategoryPages: GrantCategoryPageDefinition[] = [
  {
    slug: "grant-management-software",
    href: "/grant-management-software",
    hubSlug: "grant-management",
    title: "Grant Management Software for Nonprofits",
    description:
      "Grant management software for nonprofits should cover multi-source opportunity tracking, post-award operations, and reporting control. This page explains what grantee-side teams should expect from the category and how to compare tools without buying the wrong workflow.",
    seoTitle: "Grant Management Software for Nonprofits | GrantPipe",
    seoDescription:
      "What grant management software should do for nonprofits receiving grants: search Grants.gov, track awards, restricted funds, deadlines, reporting, and closeout without another spreadsheet layer.",
    bluf: "For grant-receiving nonprofits, grant management software should cover the work after an award is active: deadlines, documentation, restricted funds, reporting, and closeout. If a product only helps you find grants, it solves a different problem.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-22",
    lastReviewedAt: "2026-04-22",
    verifiedAt: "2026-04-22",
    buyerStage: "mofu",
    targetKeyword: "grant management software for nonprofits",
    primaryCta: "compare",
    contentIntent: "category",
    topicCluster: "grant-management",
    definitionTerm: "Grant management software",
    definition:
      "Software used by grant recipients to manage awards after they are submitted or awarded. For nonprofits, that usually means grant tracking, restricted fund visibility, reporting deadlines, documentation, and closeout workflow rather than only grant discovery.",
    heroTitle: "Grant management software for nonprofits receiving grants",
    heroDescription:
      "This category matters once the organization has more than a couple of active awards and staff need one operating view of grant status, deadlines, supporting documents, and the money attached to each award.",
    whoItsFor: [
      "Mid-sized nonprofits managing several active grants at once",
      "Development and finance teams that need the same grant status view",
      "Organizations trying to replace spreadsheet-led post-award operations",
    ],
    notFor: [
      "Foundations choosing a grantmaker portal",
      "Teams whose only problem is prospect research before applying",
      "Organizations with one simple annual grant and no reporting pressure",
    ],
    evaluationPoints: [
      "Can the software separate pre-award and post-award work clearly?",
      "Does it keep award terms, deadlines, documentation, and reporting status on the same record?",
      "Can finance and development use the same operating picture without rebuilding the answer in spreadsheets?",
    ],
    statistics: [],
    answers: [
      {
        q: "What should grant management software include for nonprofits?",
        a: "For grant recipients, the category should include award tracking, deadline management, restricted-fund visibility, reporting workflow, supporting documents, and closeout controls. Discovery-only software is a different category.",
      },
      {
        q: "What is the difference between grant management software and grant discovery software?",
        a: "Grant discovery software helps teams find and apply for funding. Grant management software should help them operate after awards are active: track requirements, documents, spend, reporting cadence, and closeout.",
      },
    ],
    faqs: [
      {
        q: "Is grant management software the same thing as grant writing software?",
        a: "No. Grant writing software supports prospecting, application drafting, and submission workflow. Grant management software should take over after the award, when deadlines, restricted funding, and reporting become operational risk.",
      },
      {
        q: "Do nonprofits need a separate donor CRM and grant management system?",
        a: "Sometimes, but that depends on where the workflow breaks. Many teams outgrow separate systems because donor context, grant status, and reporting obligations end up affecting the same decisions each month.",
      },
    ],
    relatedPages: [
      {
        title: "5 Best Grant Management Software [2026 Ranked]",
        href: "/resources/best/best-grant-management-software",
        description:
          "A ranked shortlist focused on grantee-side fit rather than grantmaker software.",
      },
      {
        title: "Grant Management Software for Nonprofits: What It Does and What to Look For",
        href: "/resources/guides/grant-management-software-for-nonprofits",
        description: "A deeper buyer guide for nonprofit teams sorting category boundaries.",
      },
      {
        title: "GrantPipe vs Instrumentl",
        href: "/compare/versus/grantpipe-vs-instrumentl",
        description: "See where discovery software ends and post-award operations begin.",
      },
      {
        title: "Instrumentl Pricing Breakdown",
        href: "/compare/pricing/instrumentl",
        description: "Map discovery software pricing against the workflow it actually replaces.",
      },
    ],
    sourceUrls: [
      "https://www.instrumentl.com/grant-management-software",
      "https://bloomerang.com/nonprofit-grant-management-software/",
      "https://www.grantprofessionals.org/",
    ],
    sections: [
      {
        heading: "What grant management software should mean for grantee-side teams",
        body: [
          "Many search results for grant management software are written for grantmakers or for teams whose hardest problem is finding opportunities. That is not the same buying job as managing active awards. Once a nonprofit receives grants, the category shifts from pipeline organization into operational control.",
          "That is why mid-sized nonprofits need to define the category on their own terms. A real grantee-side system should hold award requirements, timelines, supporting documents, and reporting status together so the organization does not rebuild the same story every month.",
        ],
      },
      {
        heading: "How to shortlist the category without buying the wrong workflow",
        body: [
          "The fastest way to make a bad software decision in this market is to compare every product as if they solve the same problem. They do not. Some tools are strongest before award. Some are broad donor CRMs with light grant fields. A smaller set gets closer to post-award operating work.",
        ],
        bullets: [
          "Check whether the product treats grants as active operating records, not just pipeline entries.",
          "Ask to see reporting preparation, not just dashboards and task lists.",
          "Verify that restricted-fund context and documentation stay close to the grant record.",
        ],
      },
      {
        heading: "Where GrantPipe fits in the category",
        body: [
          "GrantPipe is strongest for teams that want Grants.gov search, manual/imported non-federal opportunities, grant work, donor context, restricted-fund visibility, and reporting rhythm on one shared record. It is not an AI funder matching tool or proprietary private foundation database; the opportunity workflow is there so strong fits can move into the same operating workflow as awards, deadlines, and reporting.",
          "That makes it a better fit when the organization needs multi-source opportunity tracking plus recurring execution control: deadline management, documentation, leadership visibility, and clean reporting across fundraising and finance.",
        ],
      },
    ],
  },
  {
    slug: "grant-compliance-software",
    href: "/grant-compliance-software",
    hubSlug: "grant-compliance",
    title: "Grant Compliance Software for Nonprofits",
    description:
      "Grant compliance software should help nonprofits stay audit-ready after awards are active. This page defines the category for grant recipients and shows what to verify before buying.",
    seoTitle: "Grant Compliance Software for Nonprofits | GrantPipe",
    seoDescription:
      "How nonprofits should evaluate grant compliance software: restricted funds, documentation, reporting deadlines, audit readiness, and post-award workflow.",
    bluf: "Grant compliance software is about staying audit-ready after a grant is active. For nonprofits, that means deadlines, allowable-cost documentation, restricted-fund controls, reporting workflow, and a record the team can defend under scrutiny.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-22",
    lastReviewedAt: "2026-04-22",
    verifiedAt: "2026-04-22",
    buyerStage: "mofu",
    targetKeyword: "grant compliance software for nonprofits",
    primaryCta: "compare",
    contentIntent: "category",
    topicCluster: "grant-compliance",
    definitionTerm: "Grant compliance software",
    definition:
      "Software that helps grant recipients stay compliant after funding is awarded. The core job is operational proof: showing that money was spent correctly, deadlines were met, and the supporting record can survive monitoring, audit, or renewal review.",
    heroTitle: "Grant compliance software for the work after the award",
    heroDescription:
      "This category is for nonprofits receiving grants, especially those managing federal, state, and foundation awards with different reporting schedules and documentation requirements.",
    whoItsFor: [
      "Grant-funded nonprofits with quarterly or annual reporting pressure",
      "Teams that need cleaner documentation before audit or closeout",
      "Organizations where compliance work still lives in side files and shared drives",
    ],
    notFor: [
      "Foundations evaluating applicant review systems",
      "Teams looking only for prospect research or grant writing support",
      "Organizations treating compliance as a one-time year-end exercise",
    ],
    evaluationPoints: [
      "Does the system keep source documents attached to the grant workflow?",
      "Can it support reporting cadence and closeout without manual rebuilds?",
      "Can multiple staff explain grant status and compliance readiness from the same record?",
    ],
    statistics: [
      {
        stat: "$1.17 trillion in federal awards were linked to severe audit findings over five years.",
        source: "GAO-24-106173, April 2024",
        sourceUrl: "https://www.gao.gov/products/gao-24-106173",
      },
      {
        stat: "42% of funders cap indirect costs at 10% or less.",
        source: "GrantStation, 2024 State of Grantseeking Report",
        sourceUrl: "https://grantstation.com/state-of-grantseeking/key-findings-2024",
      },
    ],
    answers: [
      {
        q: "What should grant compliance software do?",
        a: "It should keep deadlines, documentation, restricted-fund controls, reporting prep, and closeout on a defensible operating record. If the team still needs a spreadsheet just to explain status, the software is not doing enough.",
      },
      {
        q: "Who needs grant compliance software first?",
        a: "Usually organizations already receiving grants and feeling pressure after award: missed deadlines, fragile documentation, manual reporting prep, or a finance-development handoff that keeps breaking.",
      },
    ],
    faqs: [
      {
        q: "Is grant compliance software only for federal grant recipients?",
        a: "No. Federal grants raise the stakes, but foundation and state awards also create reporting and documentation obligations. The category matters whenever compliance work is recurring and operational, not occasional.",
      },
      {
        q: "Can accounting software handle grant compliance on its own?",
        a: "General accounting tools help with the ledger, but they usually do not manage the full post-award record: report cadence, supporting documents, funder-specific requirements, and closeout workflow.",
      },
    ],
    relatedPages: [
      {
        title: "Best Grant Compliance Software for Nonprofits [2026]",
        href: "/resources/best/best-grant-compliance-software",
        description: "A commercial shortlist focused on compliance fit for recipients.",
      },
      {
        title: "Nonprofit Grant Compliance Requirements",
        href: "/resources/guides/nonprofit-grant-compliance-guide",
        description: "A deeper guide to the operating requirements behind the category.",
      },
      {
        title: "Grant Compliance Audit Prep for Nonprofits",
        href: "/resources/guides/grant-compliance-audit-preparation",
        description: "See the records and workflows teams need before audit pressure lands.",
      },
      {
        title: "Grant Reporting 101",
        href: "/resources/guides/grant-reporting-101",
        description: "Map reporting workflow to the software controls that support it.",
      },
    ],
    sourceUrls: [
      "https://www.gao.gov/products/gao-24-106173",
      "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200",
      "https://www.grantprofessionals.org/",
    ],
    sections: [
      {
        heading: "The category exists because post-award work is where systems break",
        body: [
          "The buying mistake in this category is assuming compliance is mostly a policy question. It is an operating question. The team needs to know what is due, what has supporting documentation, what still needs review, and which restricted dollars are tied to each report.",
          "That is why grant compliance software should be judged by how well it reduces recurring operational fragility, not by how many general features appear in the menu.",
        ],
      },
      {
        heading: "What to verify before calling a product compliance-ready",
        body: [
          "A product can claim compliance coverage and still leave the hardest work outside the system. Buyers should push past marketing language and ask for the reporting and evidence workflow directly.",
        ],
        bullets: [
          "Show the path from award terms to deadline calendar to reporting prep.",
          "Show how source documents stay attached to the grant record.",
          "Show how the team handles closeout and post-submission retention.",
        ],
      },
      {
        heading: "How GrantPipe approaches the category",
        body: [
          "GrantPipe treats compliance as part of the operating record rather than a year-end add-on. Donor context, active grant work, restricted funds, and reporting rhythm stay connected so teams do not rebuild status in separate systems.",
          "That makes the product stronger when the constraint is monthly coordination and reporting confidence, not just grant prospecting before the award.",
        ],
      },
    ],
  },
  {
    slug: "grant-tracking-software",
    href: "/grant-tracking-software",
    hubSlug: "grant-management",
    title: "Grant Tracking Software for Nonprofits",
    description:
      "Grant tracking software should help nonprofits keep awards, deadlines, status, and supporting context visible without turning every update into spreadsheet maintenance.",
    seoTitle: "Grant Tracking Software for Nonprofits | GrantPipe",
    seoDescription:
      "How to evaluate grant tracking software for nonprofits: active awards, deadlines, documentation, reporting rhythm, and when simple tracking is no longer enough.",
    bluf: "Grant tracking software is the lighter-weight side of the category: it should make deadlines, status, and ownership visible. But for grant-funded nonprofits, tracking alone stops being enough once reports, restricted funds, and closeout work start piling up.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-22",
    lastReviewedAt: "2026-04-22",
    verifiedAt: "2026-04-22",
    buyerStage: "mofu",
    targetKeyword: "grant tracking software for nonprofits",
    primaryCta: "compare",
    contentIntent: "category",
    topicCluster: "grant-management",
    definitionTerm: "Grant tracking software",
    definition:
      "Software used to monitor grant status, ownership, deadlines, and next actions across a portfolio of opportunities or active awards. It becomes grant management software when it also supports reporting, documentation, restricted funds, and closeout.",
    heroTitle: "Grant tracking software when spreadsheets stop being trustworthy",
    heroDescription:
      "Teams search this term when status spreadsheets stop working. They may need post-award grant management software. They may only need lighter tracking.",
    whoItsFor: [
      "Nonprofits replacing grant-status spreadsheets",
      "Teams that need clearer ownership and deadline control",
      "Buyers deciding whether tracking alone will solve the problem",
    ],
    notFor: [
      "Organizations that already know reporting and fund controls are the main issue",
      "Foundations evaluating reviewer workflow tools",
      "Teams that only need prospect research",
    ],
    evaluationPoints: [
      "Does the software track both opportunity-stage and active-award work cleanly?",
      "Can it show next actions, owners, deadlines, and supporting notes without spreadsheet cleanup?",
      "What happens when the team needs reporting prep or restricted-fund visibility later?",
    ],
    statistics: [],
    answers: [
      {
        q: "What is grant tracking software best for?",
        a: "It is best for visibility into deadlines, owners, pipeline stage, and active-award status. It is not enough on its own when the team also needs reporting workflow, documentation, and restricted-fund controls.",
      },
      {
        q: "When does grant tracking software stop being enough?",
        a: "Usually when active grants create recurring reporting work, closeout steps, or finance-development coordination that the tracking layer cannot hold.",
      },
    ],
    faqs: [
      {
        q: "Is grant tracking software cheaper than grant management software?",
        a: "Often yes, because it handles a narrower job. The risk is buying something that looks cheaper up front but still leaves reporting and compliance work in side systems.",
      },
      {
        q: "Can a nonprofit start with tracking software and add more later?",
        a: "Yes, but buyers should be honest about their current bottleneck. If reporting and documentation pain already exists, starting with tracking software may delay a more complete decision.",
      },
    ],
    relatedPages: [
      {
        title: "Best Grant Tracking Software for Executive Directors in 2026",
        href: "/resources/best/best-grant-tracking-software-eds",
        description: "See which products make status and ownership visible for leadership.",
      },
      {
        title: "Grant Prospecting Workflow for Mid-Sized Nonprofits",
        href: "/resources/guides/grant-prospecting-workflow-for-mid-sized-nonprofits",
        description: "Understand where pre-award tracking fits before the award arrives.",
      },
      {
        title: "Grant Management Software vs Grant Compliance Software",
        href: "/resources/guides/grant-management-software-vs-grant-compliance-software",
        description: "Decide whether tracking is enough or the workflow already needs more.",
      },
      {
        title: "Best Instrumentl Alternative for Grant Compliance",
        href: "/compare/alternatives/instrumentl",
        description:
          "Compare lighter tracking and discovery workflow against post-award operations.",
      },
    ],
    sourceUrls: [
      "https://www.instrumentl.com/grant-management-software",
      "https://www.instrumentl.com/pricing",
      "https://bloomerang.com/nonprofit-grant-management-software/",
    ],
    sections: [
      {
        heading: "Why teams search for grant tracking software first",
        body: [
          "This term usually appears when the team knows the spreadsheet is no longer working but has not yet defined the replacement category precisely. They want visibility first: where each grant stands, who owns the next step, and what is due next.",
          "That makes grant tracking software a legitimate category term, but buyers should treat it as an entry point. The real question is whether tracking is the whole job or only the first layer of a heavier operating problem.",
        ],
      },
      {
        heading: "The moment tracking becomes management",
        body: [
          "The category boundary moves fast once awards are active. If the tool has to support reporting, documentation, or restricted-fund visibility, the buyer is no longer evaluating a lightweight tracker. They are evaluating grant management or compliance software, whether the vendor calls it that or not.",
        ],
        bullets: [
          "Tracking software answers status questions.",
          "Management software answers execution questions.",
          "Compliance software answers defensibility questions.",
        ],
      },
    ],
  },
  {
    slug: "restricted-fund-tracking-software",
    href: "/restricted-fund-tracking-software",
    hubSlug: "restricted-fund-accounting",
    title: "Restricted Fund Tracking Software for Nonprofits",
    description:
      "Restricted fund tracking software helps nonprofits keep grant and donor restrictions visible without relying on side spreadsheets. This page explains what the category should do and what buyers should verify.",
    seoTitle: "Restricted Fund Tracking Software for Nonprofits | GrantPipe",
    seoDescription:
      "How nonprofits should evaluate restricted fund tracking software: grant-linked balances, reporting visibility, finance-development alignment, and why tags alone are not enough.",
    bluf: "Restricted fund tracking software should help a nonprofit answer three questions quickly: what is restricted, what has been spent, and what still has to be reported. Tags alone are not the same thing as a usable fund workflow.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-22",
    lastReviewedAt: "2026-04-22",
    verifiedAt: "2026-04-22",
    buyerStage: "mofu",
    targetKeyword: "restricted fund tracking software for nonprofits",
    primaryCta: "pricing",
    contentIntent: "category",
    topicCluster: "restricted-fund-accounting",
    definitionTerm: "Restricted fund tracking software",
    definition:
      "Software that keeps restricted balances, linked spending, and reporting obligations visible at the fund or award level. The category matters when donor or grant restrictions affect day-to-day decisions across development, finance, and leadership.",
    heroTitle: "Restricted fund tracking software for cross-team clarity",
    heroDescription:
      "The category is useful for nonprofits whose grant and donor restrictions have outgrown spreadsheet logic and now need a real workflow shared by finance and development.",
    whoItsFor: [
      "Nonprofits managing grant-linked restricted funds",
      "Finance and development teams that need the same balance story",
      "Organizations where board or audit reporting depends on side reconciliations",
    ],
    notFor: [
      "Teams with only unrestricted revenue",
      "Organizations that only need a basic donor database",
      "Buyers assuming classes or tags automatically solve the workflow",
    ],
    evaluationPoints: [
      "Can the system show restricted balances without manual rebuilds?",
      "Does it connect spending and reporting status back to each restricted fund or award?",
      "Can non-accountants still understand the answer without exporting raw ledger data?",
    ],
    statistics: [],
    answers: [
      {
        q: "What should restricted fund tracking software do?",
        a: "It should show restricted balances, linked spending, and reporting status in a way that finance, development, and leadership can all use without rebuilding the answer in spreadsheets.",
      },
      {
        q: "Why are tags or classes not enough?",
        a: "Because tags can label a transaction without giving the team a usable workflow for balances, reporting readiness, and linked documentation across the rest of the grant record.",
      },
    ],
    faqs: [
      {
        q: "Is restricted fund tracking the same as full nonprofit accounting software?",
        a: "Not always. Some products cover only visibility and reporting at the fund level. Others, including GrantPipe, pair fund tracking with the broader grant and accounting workflow.",
      },
      {
        q: "Who usually feels this problem first?",
        a: "Usually finance and development leaders who keep being asked for the same balance story from different angles: by leadership, funders, auditors, or the board.",
      },
    ],
    relatedPages: [
      {
        title: "Restricted Fund Accounting Software for Nonprofits",
        href: "/resources/guides/restricted-fund-accounting-software-for-nonprofits",
        description: "A buyer guide for the accounting-heavy side of the same problem.",
      },
      {
        title: "Restricted Fund Tracking for Nonprofits",
        href: "/resources/guides/restricted-fund-tracking-for-nonprofits",
        description:
          "See how the workflow breaks when restricted balances live outside the system.",
      },
      {
        title: "GrantPipe vs QuickBooks for Nonprofits",
        href: "/compare/grantpipe-vs-quickbooks",
        description: "Compare general-ledger workflow against fund-aware operating software.",
      },
      {
        title: "Best Nonprofit Accounting Tools for Finance Staff",
        href: "/resources/best/best-nonprofit-accounting-tools-finance-staff",
        description: "Evaluate where restricted-fund workflow fits into the broader finance stack.",
      },
    ],
    sourceUrls: [
      "https://www.gao.gov/products/gao-24-106173",
      "https://www.fasb.org/page/PageContent?pageId=/standards/accounting-standards-updates.html",
      "https://nff.org/",
    ],
    sections: [
      {
        heading: "Restricted fund tracking is a workflow problem before it is a reporting problem",
        body: [
          "Teams usually notice the category when month-end or board reporting becomes painful. The deeper issue starts earlier. Staff cannot see what is still restricted, what has been spent, and what narrative still needs to be attached to each fund without rebuilding the answer outside the system.",
          "That is why the category should be judged by clarity, not just accounting vocabulary. If the software cannot help multiple teams use the same answer, it has not solved the operating problem.",
        ],
      },
      {
        heading: "What to verify in the product demo",
        body: [
          "The key mistake here is being impressed by labels. Buyers should ask to see a real balance question, a linked spending question, and a reporting question on the same workflow.",
        ],
        bullets: [
          "Show current restricted balance by award or fund.",
          "Show the spending record connected to that balance.",
          "Show what still has to be reported before the fund can be considered cleanly managed.",
        ],
      },
    ],
  },
  {
    slug: "grant-reporting-software",
    href: "/grant-reporting-software",
    hubSlug: "grant-compliance",
    title: "Grant Reporting Software for Nonprofits",
    description:
      "Grant reporting software should help nonprofits produce recurring funder reports without rebuilding the same numbers and narrative every cycle. This page defines what the category should handle.",
    seoTitle: "Grant Reporting Software for Nonprofits | GrantPipe",
    seoDescription:
      "How to evaluate grant reporting software for nonprofits: recurring deadlines, supporting documentation, funder-ready outputs, and post-award reporting workflow.",
    bluf: "Grant reporting software should shorten the path from active award to funder-ready report. If the team still exports raw data, cleans it in spreadsheets, and reconstructs supporting context each cycle, the reporting layer is still manual.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-22",
    lastReviewedAt: "2026-04-22",
    verifiedAt: "2026-04-22",
    buyerStage: "mofu",
    targetKeyword: "grant reporting software for nonprofits",
    primaryCta: "compare",
    contentIntent: "category",
    topicCluster: "grant-compliance",
    definitionTerm: "Grant reporting software",
    definition:
      "Software that helps grant recipients prepare recurring financial and narrative reports tied to each award. The category overlaps with grant compliance software because deadlines, supporting documents, and closeout usually depend on the same underlying record.",
    heroTitle: "Grant reporting software for recurring, high-stakes reporting cycles",
    heroDescription:
      "This category is useful when reporting is no longer occasional admin work and has become part of the nonprofit's monthly or quarterly operating rhythm.",
    whoItsFor: [
      "Grant-funded nonprofits with recurring reporting obligations",
      "Teams spending hours every cycle reformatting the same information",
      "Organizations that need better visibility into what is still due before submission",
    ],
    notFor: [
      "Teams with only occasional one-off updates to funders",
      "Organizations looking only for grant discovery or prospecting tools",
      "Buyers who are satisfied exporting and cleaning every report by hand",
    ],
    evaluationPoints: [
      "Does the system support reporting prep from the live grant record?",
      "Can it reduce reformatting and spreadsheet cleanup every cycle?",
      "Does the reporting view stay connected to deadlines, documentation, and closeout?",
    ],
    statistics: [],
    answers: [
      {
        q: "What should grant reporting software replace?",
        a: "It should replace the recurring manual work of exporting data, rebuilding supporting context, checking deadlines, and reassembling the same report package each cycle.",
      },
      {
        q: "How is grant reporting software different from general reporting tools?",
        a: "General reporting tools can display numbers. Grant reporting software should keep those outputs tied to award terms, deadlines, supporting documents, and closeout obligations.",
      },
    ],
    faqs: [
      {
        q: "Can grant reporting software help with closeout too?",
        a: "It should. The same reporting trail usually feeds final deliverables, closeout packets, and retention workflow. A product that handles only one report view may still leave closeout manual.",
      },
      {
        q: "What makes reporting software useful to executive directors?",
        a: "Confidence. Leaders want to know what is due, what is blocked, and what is already defensible without waiting for a spreadsheet rebuild from the team.",
      },
    ],
    relatedPages: [
      {
        title: "Grant Reporting 101: What Nonprofits Need to Know",
        href: "/resources/guides/grant-reporting-101",
        description: "A foundational guide to the reporting workload behind the category.",
      },
      {
        title: "Grant Reporting Examples: What a Real Report Looks Like",
        href: "/resources/guides/grant-reporting-examples",
        description:
          "See the actual structure of recurring grant reports before comparing software.",
      },
      {
        title: "Grant Reporting Calendar",
        href: "/resources/guides/grant-reporting-calendar-template",
        description: "Map recurring deadlines and dependencies before choosing tooling.",
      },
      {
        title: "Best Grant Compliance Software for Nonprofits",
        href: "/resources/best/best-grant-compliance-software",
        description: "Compare reporting workflow inside the wider compliance category.",
      },
    ],
    sourceUrls: [
      "https://cep.org/portfolio/reporting-matters/",
      "https://www.grantprofessionals.org/",
      "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200",
    ],
    sections: [
      {
        heading: "Why grant reporting deserves its own category page",
        body: [
          "Teams often search this term when the pain feels narrower than full compliance. The report is late, the numbers need another pass, supporting context lives in too many places, and no one wants another quarter of spreadsheet assembly.",
          "That is a valid entry point. But buyers should remember that reporting quality depends on the rest of the record. If the software cannot connect outputs back to deadlines, documents, and award terms, the report will still be fragile.",
        ],
      },
      {
        heading: "What a better reporting workflow should feel like",
        body: [
          "The right system reduces repeated assembly work. The team should not have to remember where the latest version lives, who owns the next section, or whether the supporting documents still match the financial view.",
        ],
        bullets: [
          "Funder-ready reporting should start from the live grant record.",
          "Deadline visibility should live next to report preparation.",
          "Closeout should not require a second rebuild after the final report.",
        ],
      },
    ],
  },
  {
    slug: "auditor-funder-portal-software",
    href: "/auditor-funder-portal-software",
    hubSlug: "grant-compliance",
    title: "Auditor & Funder Portal Software for Nonprofits",
    description:
      "Auditor and funder portal software gives external reviewers scoped, time-limited access to grants, funds, and documents. Every view is logged and nothing outside the defined scope is visible.",
    seoTitle: "Auditor & Funder Portal Software for Nonprofits | GrantPipe",
    seoDescription:
      "Give auditors and funders a secure, scoped portal. Share grants, funds, and reports without email attachments. Every view logged. Access expires automatically.",
    bluf: "The problem with emailing audit files is not the files. There is no record of what was shared, when it was opened, or who else received it. An auditor portal fixes that by keeping sharing inside a controlled system with automatic expiry and a permanent view log.",
    publishedAt: "2026-05-04",
    updatedAt: "2026-05-04",
    lastReviewedAt: "2026-05-04",
    verifiedAt: "2026-05-04",
    buyerStage: "bofu",
    targetKeyword: "auditor portal software nonprofit",
    primaryCta: "trial",
    contentIntent: "category",
    topicCluster: "grant-compliance",
    definitionTerm: "Auditor & Funder portal software",
    definition:
      "Software that lets a nonprofit invite an external reviewer (an auditor, a funder program officer, or a board committee member) to a scoped, time-limited portal showing only the grants, funds, and documents the organization selected. Access expires automatically, and every document view is logged in the organization's audit trail.",
    heroTitle: "Auditor and funder portal software for controlled external access",
    heroDescription:
      "The category is useful for nonprofits that need to share grant evidence with external reviewers without using email attachments, shared drives with no expiry, or ZIP files with no view log.",
    whoItsFor: [
      "Nonprofits preparing for annual financial or single audits",
      "Grant-funded organizations subject to funder compliance monitoring visits",
      "Finance and development teams that need a controlled, logged way to share evidence",
    ],
    notFor: [
      "Teams whose only reviewers are internal staff with full account access",
      "Organizations that don't yet have grant documents in a centralized system",
      "Teams looking for a funder CRM or grantmaker portal (this category is for grant recipients, not grantmakers)",
    ],
    evaluationPoints: [
      "Does the portal limit scope to specific grants, funds, and documents, not the full account?",
      "Is every document view and download logged with the reviewer's name and timestamp?",
      "Does access expire automatically, and can it be revoked immediately before expiry?",
    ],
    statistics: [
      {
        stat: "AICPA SAS 145 requires auditors to evaluate IT general controls including access controls for systems processing financial data",
        source: "AICPA SAS No. 145",
        sourceUrl: "https://www.aicpa-cima.com/professional-insights/download/sas-no-145",
      },
      {
        stat: "GAO High Risk Series identifies weak grantee documentation and inadequate access controls as recurring findings in federal grant audits",
        source: "U.S. GAO 2024 High Risk Series",
        sourceUrl: "https://www.gao.gov/highrisk/overview",
      },
    ],
    answers: [
      {
        q: "What should auditor portal software do for nonprofits?",
        a: "It should let the organization define exactly what the auditor can see, set an expiry date, deliver access through a signed link (no account required), and log every document view with the reviewer's name and a timestamp. If any of those elements are missing, the 'portal' is just a shared folder with extra steps.",
      },
      {
        q: "Why is a dedicated portal better than a shared drive for audit evidence?",
        a: "Three reasons: scope control (the reviewer only sees what you selected), automatic expiry (the link stops working on the date you set), and a view log (you know what was accessed, when, and by whom). Shared drives offer none of the three by default.",
      },
    ],
    faqs: [
      {
        q: "How do auditors access the portal?",
        a: "Auditors receive a signed link by email. They follow the link and see the scoped portal view. No account creation or GrantPipe login is required. The link works until the expiry date you set, or until you revoke it.",
      },
      {
        q: "Can I revoke access before the expiry date?",
        a: "Yes. Go to Settings → Portal access and revoke the session. The link stops working immediately. Revocation is logged in the audit trail alongside all other reviewer activity.",
      },
      {
        q: "What does the portal activity log capture?",
        a: "Every document view and file download during the session is recorded with the reviewer's name from the invitation, the specific item accessed, and a UTC timestamp. The log is append-only and cannot be modified.",
      },
      {
        q: "Which GrantPipe plan includes the Auditor & Funder Portal?",
        a: `The portal is on ${auditorPortalPlanList}. Audit-Ready starts at ${pricingCopy.auditReadyMonthly}. Annual billing is ${pricingCopy.auditReadyAnnual}, billed annually at $1,908/yr. Larger cases can contact founder Angel Campa directly.`,
      },
    ],
    relatedPages: [
      {
        title: "Auditor & Funder Portal feature",
        href: "/features/auditor-funder-portal",
        description: "The detailed feature page covering invite flow, scope, and logging.",
      },
      {
        title: "How to prepare for an audit using the GrantPipe portal",
        href: "/workflows/how-to-prepare-for-audit-with-grantpipe-portal",
        description: "A step-by-step workflow from evidence bundle to revoked access.",
      },
      {
        title: "Free Auditor Evidence Checklist",
        href: "/free/auditor-evidence-checklist",
        description: "What auditors request from nonprofit grantees, organized by section.",
      },
      {
        title: "Grant Compliance Software for Nonprofits",
        href: "/grant-compliance-software",
        description: "The broader compliance category the auditor portal fits within.",
      },
    ],
    sourceUrls: [
      "https://www.aicpa-cima.com/professional-insights/download/sas-no-145",
      "https://www.gao.gov/highrisk/overview",
      "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR4acc10e7e3b676f/section-200.334",
    ],
    sections: [
      {
        heading: "The access-without-accountability problem",
        body: [
          "When an auditor or program officer asks to review grant records, the default response is to email files or share a folder. Both approaches have the same underlying flaw: no one can show what was shared, when it was opened, or whether the reviewer's copy was the current version.",
          "That gap matters during an audit. Auditors sampling an organization's internal controls will ask how the team manages access to sensitive financial records. If the answer is 'we emailed a ZIP file,' the follow-up question is about the controls around that decision. A portal with scope controls, automatic expiry, and a view log answers that follow-up before it's asked.",
        ],
      },
      {
        heading: "What to verify when evaluating portal software",
        body: [
          "The portal category has a wide range of implementations. Some products call a shared link a 'portal.' Others provide genuine scope controls with logging. Buyers should test the product against the three questions that auditors and funders will eventually ask.",
        ],
        bullets: [
          "Can you restrict the reviewer to specific grants, funds, and documents, not a general org view?",
          "Is there a permanent, append-only log of every document the reviewer accessed?",
          "Can you revoke access immediately, and is that revocation itself logged?",
        ],
      },
      {
        heading: "Where GrantPipe fits in the category",
        body: [
          "GrantPipe's Auditor & Funder Portal is available on the Audit-Ready plan. It is built around the same grant records your team already uses. When you scope a portal session, you are selecting from your live grant data, not uploading files to a separate system.",
          "That means the evidence bundle stays connected to the actual award record, the restricted fund record, and the activity log. When the auditor finishes the review, the portal log becomes part of your permanent compliance documentation alongside the underlying records.",
        ],
      },
    ],
  },
  {
    slug: "subrecipient-monitoring-software",
    href: "/subrecipient-monitoring-software",
    hubSlug: "grant-compliance",
    title: "Subrecipient Monitoring Software for Nonprofits",
    description:
      "Subrecipient monitoring software helps pass-through nonprofits document risk assessments, monitoring tasks, findings, corrective actions, and evidence for subawards.",
    seoTitle: "Subrecipient Monitoring Software for Nonprofits | GrantPipe",
    seoDescription:
      "How to evaluate subrecipient monitoring software for nonprofits: subawards, risk assessments, monitoring tasks, findings, corrective actions, and audit evidence.",
    bluf: "Subrecipient monitoring software matters when a nonprofit passes grant funds through to partner organizations and needs a defensible record of risk review, monitoring, findings, corrective actions, and evidence.",
    publishedAt: "2026-05-06",
    updatedAt: "2026-05-06",
    lastReviewedAt: "2026-05-06",
    verifiedAt: "2026-05-06",
    buyerStage: "bofu",
    targetKeyword: "subrecipient monitoring software",
    primaryCta: "pricing",
    contentIntent: "category",
    topicCluster: "grant-compliance",
    definitionTerm: "Subrecipient monitoring software",
    definition:
      "Software used by pass-through entities to track subrecipients, subawards, risk assessments, monitoring work, findings, corrective actions, and supporting evidence tied to grant compliance obligations.",
    heroTitle: "Subrecipient monitoring software for pass-through grant work",
    heroDescription:
      "The category is useful when partner oversight has become too sensitive for spreadsheets, shared folders, and one-off reminder lists.",
    whoItsFor: [
      "Nonprofits issuing subawards to partner organizations",
      "Teams managing federal or state pass-through funding",
      "Finance and program leaders preparing evidence for monitoring or audit review",
    ],
    notFor: [
      "Organizations that do not make subawards",
      "Foundations looking for applicant review software",
      "Teams that only need grant prospect research",
    ],
    evaluationPoints: [
      "Can the system connect each subaward to the source grant and partner record?",
      "Does it document risk assessment, monitoring tasks, findings, and corrective actions?",
      "Can the team export a reviewer-ready evidence bundle without rebuilding the record?",
    ],
    statistics: [],
    answers: [
      {
        q: "What should subrecipient monitoring software track?",
        a: "It should track subrecipients, subawards, risk assessments, monitoring tasks, monitoring logs, findings, corrective actions, linked documents, and evidence bundles.",
      },
      {
        q: "Is subrecipient monitoring only a federal grant issue?",
        a: "Federal awards create explicit pass-through requirements, but state and foundation funding can also require partner oversight. The workflow matters whenever the organization must prove how it monitored a partner receiving funds.",
      },
    ],
    faqs: [
      {
        q: "Which GrantPipe plans include subrecipient monitoring?",
        a: "Subrecipient monitoring is included on Audit-Ready and Enterprise. Starter and Growth do not include the executable monitoring workflow.",
      },
      {
        q: "Does subrecipient monitoring replace legal review of subaward terms?",
        a: "No. It organizes the operating record around subawards, monitoring, evidence, and follow-up work; it does not replace legal or grant counsel.",
      },
    ],
    relatedPages: [
      {
        title: "Grant Compliance Software for Nonprofits",
        href: "/grant-compliance-software",
        description: "The broader compliance category for post-award evidence and controls.",
      },
      {
        title: "Auditor & Funder Portal Software",
        href: "/auditor-funder-portal-software",
        description: "Share scoped evidence bundles with external reviewers.",
      },
      {
        title: "Subrecipient Monitoring feature",
        href: "/features/subrecipient-monitoring",
        description: "See how GrantPipe packages subrecipient monitoring in the product.",
      },
    ],
    sourceUrls: [
      "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.332",
      "https://www.ojp.gov/funding/financialguidedoj/iii-postaward-requirements",
      "https://www.ovc.ojp.gov/program/victims-crime-act-voca-administrators/victim-assistance/subrecipient-monitoring",
    ],
    sections: [
      {
        heading: "The category exists because pass-through oversight needs a record",
        body: [
          "When a nonprofit passes funding to another organization, the risk is no longer only whether the primary grant is on track. The team also needs to show how it assessed the partner, what monitoring work happened, what findings were identified, and how follow-up was handled.",
          "That is why the category should be judged by the quality of the monitoring record, not by whether a generic task list can hold partner names.",
        ],
      },
      {
        heading: "Where GrantPipe fits",
        body: [
          "GrantPipe treats subrecipient monitoring as part of the compliance workflow. Subawards stay tied to the source grant, monitoring work stays tied to the partner record, and evidence can be packaged for external review through the same audit-ready surfaces.",
        ],
      },
    ],
  },
];

export function getGrantCategoryPage(
  slug: GrantCategoryPageDefinition["slug"],
): GrantCategoryPageDefinition {
  const match = grantCategoryPages.find((page) => page.slug === slug);
  if (!match) {
    throw new Error(`Unknown grant category page: ${slug}`);
  }
  return match;
}

export function getGrantCategoryPagesForHub(
  hubSlug: GrantTopicHubSlug,
): GrantCategoryPageDefinition[] {
  return grantCategoryPages.filter((page) => page.hubSlug === hubSlug);
}
