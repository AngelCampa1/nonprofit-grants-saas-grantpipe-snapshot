export const LEAD_MAGNET_SLUGS = [
  // ── Existing (10) ───────────────────────────────────────────────────────────
  "grant-compliance-checklist",
  "grant-compliance-cost-audit",
  "grant-reporting-calendar-template",
  "fasb-asc-958-quick-reference",
  "grant-pipeline-forecasting-worksheet",
  "donor-retention-playbook",
  "major-donor-cultivation-playbook",
  "nonprofit-crm-cost-calculator",
  "nonprofit-crm-evaluation-scorecard",
  "nonprofit-crm-market-report-2026",
  // ── New — Grant Management & Lifecycle ──────────────────────────────────────
  "grant-closeout-checklist",
  "granthub-migration-checklist",
  "award-setup-worksheet",
  "grant-reporting-deadlines-tracker",
  "grant-kickoff-meeting-template",
  "no-cost-extension-request-template",
  "grant-budget-amendment-request-template",
  "funder-report-template",
  // ── New — Grant Compliance ───────────────────────────────────────────────────
  "2-cfr-200-audit-prep-checklist",
  "grant-file-audit-checklist",
  "single-audit-prep-timeline",
  // ── New — Federal Grant Operations ──────────────────────────────────────────
  "time-and-effort-certification-template",
  "subrecipient-monitoring-checklist",
  "sefa-prep-worksheet",
  "sf-425-reporting-checklist",
  "subrecipient-agreement-checklist",
  "grant-staff-time-tracking-template",
  // ── New — Restricted Fund Accounting ────────────────────────────────────────
  "restricted-fund-tracking-spreadsheet",
  "grant-spend-down-tracker",
  "grant-budget-tracking-template",
  "restricted-funds-release-calculator",
  "donor-to-grant-reconciliation-template",
  // ── New — CRM + Grants Alternatives ─────────────────────────────────────────
  "grant-software-roi-calculator",
  "board-approval-memo-software-template",
  "crm-migration-data-map-template",
  "salesforce-npsp-migration-map",
  // ── New — Fundraising & Development ─────────────────────────────────────────
  "donor-thank-you-letter-template-pack",
  "nonprofit-financial-report-template",
  "grant-proposal-budget-template",
  "nonprofit-development-plan-template",
  "monthly-giving-program-launch-checklist",
  "ai-tools-evaluation-scorecard-nonprofits",
  "501c3-application-checklist",
  "donor-stewardship-plan-template",
  // ── New — Grant Discovery & Development Strategy ──────────────────────────
  "grant-proposal-sample-pack",
  "development-operations-self-audit",
  "year-end-campaign-toolkit",
  "board-fundraising-toolkit",
  "funder-prospecting-research-template",
  "cdbg-compliance-worksheet",
  "federal-grant-application-checklist",
  "nonprofit-technology-evaluation-worksheet",
  "donor-retention-dashboard-template",
  "grant-narrative-template-pack",
  "new-development-director-90-day-checklist",
  "cost-allocation-plan-worksheet",
  "funder-stewardship-calendar-template",
  "indirect-cost-rate-negotiation-worksheet",
  "corporate-partnership-proposal-template",
  // ── City Lead Magnets (100-piece city content initiative) ──────────────────
  "nyc-foundation-funder-map-2026",
  "los-angeles-foundation-funder-map-2026",
  "chicago-foundation-funder-map-2026",
  "houston-grant-deadline-calendar-2026",
  "dc-federal-pass-through-pipeline-worksheet",
  "philadelphia-grant-deadline-calendar-2026",
  "phoenix-foundation-funder-map-2026",
  "san-antonio-grant-deadline-calendar-2026",
  "san-diego-foundation-funder-map-2026",
  "dallas-foundation-funder-map-2026",
  // ── City Lead Magnets — Batch 2 (5) ──────────────────────────────────────
  "boston-foundation-funder-map-2026",
  "seattle-foundation-funder-map-2026",
  "denver-foundation-funder-map-2026",
  "atlanta-grant-deadline-calendar-2026",
  "minneapolis-foundation-funder-map-2026",
  // -- City Lead Magnets - Batch 3 (2) -------------------------------------
  "jacksonville-grant-deadline-calendar-2026",
  "raleigh-foundation-funder-map-2026",
  // ── State Charitable Registration Compliance Checklists (10) ─────────────
  "california-compliance-checklist",
  "texas-compliance-checklist",
  "new-york-compliance-checklist",
  "florida-compliance-checklist",
  "illinois-compliance-checklist",
  "pennsylvania-compliance-checklist",
  "ohio-compliance-checklist",
  "georgia-compliance-checklist",
  "north-carolina-compliance-checklist",
  "massachusetts-compliance-checklist",
  // ── Net-New State Compliance Checklists (20) ─────────────────────────────
  "washington-compliance-checklist",
  "minnesota-compliance-checklist",
  "virginia-compliance-checklist",
  "new-jersey-compliance-checklist",
  "michigan-compliance-checklist",
  "maryland-compliance-checklist",
  "colorado-compliance-checklist",
  "arizona-compliance-checklist",
  "tennessee-compliance-checklist",
  "missouri-compliance-checklist",
  "indiana-compliance-checklist",
  "wisconsin-compliance-checklist",
  "oregon-compliance-checklist",
  "connecticut-compliance-checklist",
  "kentucky-compliance-checklist",
  "alabama-compliance-checklist",
  "south-carolina-compliance-checklist",
  "oklahoma-compliance-checklist",
  "louisiana-compliance-checklist",
  "iowa-compliance-checklist",
  // ── Interactive Questionnaires (5) ───────────────────────────────────────
  "nonprofit-audit-readiness-assessment",
  "grant-compliance-readiness-quiz",
  "nonprofit-software-needs-assessment",
  "donor-management-maturity-assessment",
  "nonprofit-financial-health-scorecard",
  // ── Auditor & Funder Portal ───────────────────────────────────────────────
  "auditor-evidence-checklist",
  "funder-monitoring-evidence-template",
  "audit-prep-week-by-week-checklist",
  "external-reviewer-access-policy-template",
  // ── Spreadsheet Deliverables (xlsx) ───────────────────────────────────────
  "grant-tracking-template",
  "grant-budget-template",
] as const;

export type LeadMagnetSlug = (typeof LEAD_MAGNET_SLUGS)[number];

export const ACTIVE_LEAD_MAGNET_SLUGS = [
  "grant-compliance-checklist",
  "grant-compliance-cost-audit",
  "grant-reporting-calendar-template",
  "nonprofit-crm-cost-calculator",
  "grant-closeout-checklist",
  "granthub-migration-checklist",
  "award-setup-worksheet",
  "grant-kickoff-meeting-template",
  "2-cfr-200-audit-prep-checklist",
  "grant-file-audit-checklist",
  "single-audit-prep-timeline",
  "time-and-effort-certification-template",
  "subrecipient-monitoring-checklist",
  "sefa-prep-worksheet",
  "restricted-fund-tracking-spreadsheet",
  "grant-spend-down-tracker",
  "donor-to-grant-reconciliation-template",
  "grant-software-roi-calculator",
  "board-approval-memo-software-template",
  "crm-migration-data-map-template",
  "audit-prep-week-by-week-checklist",
  "external-reviewer-access-policy-template",
  "grant-tracking-template",
  "grant-budget-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

export const FEATURED_LEAD_MAGNET_SLUGS = [
  "nonprofit-crm-cost-calculator",
  "grant-compliance-checklist",
  "audit-prep-week-by-week-checklist",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

export const LEAD_MAGNET_FALLBACK_BY_FAMILY = {
  guide: "grant-compliance-checklist",
  "state-page": "grant-compliance-checklist",
  solution: "grant-compliance-checklist",
  comparison: "crm-migration-data-map-template",
  "pricing-breakdown": "grant-software-roi-calculator",
  listicle: "grant-software-roi-calculator",
} as const satisfies Record<string, LeadMagnetSlug>;

/** The deliverable asset type for each lead magnet. */
export type LeadMagnetAssetType = "pdf" | "xlsx";

/**
 * Slugs whose deliverable is NOT a generated PDF. These are excluded from the
 * PDF build, the PDF promotion list, and the PDF-specific R2 validation path.
 */
export const NON_PDF_LEAD_MAGNET_SLUGS = [
  "restricted-fund-tracking-spreadsheet",
  "grant-tracking-template",
  "grant-budget-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const NON_PDF_SLUG_SET = new Set<string>(NON_PDF_LEAD_MAGNET_SLUGS);

/**
 * Maps every supported slug to its deliverable asset type. Slugs default to
 * "pdf"; only the slugs listed in NON_PDF_LEAD_MAGNET_SLUGS deviate.
 */
export const LEAD_MAGNET_ASSET_TYPES: Record<LeadMagnetSlug, LeadMagnetAssetType> =
  LEAD_MAGNET_SLUGS.reduce(
    (acc, slug) => {
      acc[slug] = NON_PDF_SLUG_SET.has(slug) ? "xlsx" : "pdf";
      return acc;
    },
    {} as Record<LeadMagnetSlug, LeadMagnetAssetType>,
  );

const ASSET_TYPE_CONTENT_TYPES: Record<LeadMagnetAssetType, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** A resolved description of a lead magnet's deliverable asset. */
export interface LeadMagnetAsset {
  extension: LeadMagnetAssetType;
  contentType: string;
  r2Key: string;
}

/**
 * Resolves the deliverable asset descriptor for a slug. Unknown slugs (for
 * example, slugs carried in a download token that predate a content change)
 * default to the PDF deliverable to preserve backwards compatibility.
 */
export function leadMagnetAsset(slug: string): LeadMagnetAsset {
  const extension =
    (LEAD_MAGNET_ASSET_TYPES as Record<string, LeadMagnetAssetType | undefined>)[slug] ?? "pdf";
  return {
    extension,
    contentType: ASSET_TYPE_CONTENT_TYPES[extension],
    r2Key: `lead-magnets/${slug}.${extension}`,
  };
}

export const PROMOTED_PDF_LEAD_MAGNET_SLUGS = ACTIVE_LEAD_MAGNET_SLUGS.filter(
  (slug) => !NON_PDF_SLUG_SET.has(slug),
) as LeadMagnetSlug[];

export const LEAD_MAGNET_TITLES: Record<LeadMagnetSlug, string> = {
  // Existing
  "grant-compliance-checklist": "Grant Compliance Checklist",
  "grant-compliance-cost-audit": "Grant Compliance Cost Audit",
  "grant-reporting-calendar-template": "Grant Reporting Calendar Template",
  "fasb-asc-958-quick-reference": "FASB ASC 958 Quick Reference",
  "grant-pipeline-forecasting-worksheet": "Grant Pipeline Forecasting Worksheet",
  "donor-retention-playbook": "Donor Retention Playbook",
  "major-donor-cultivation-playbook": "Major Donor Cultivation Playbook",
  "nonprofit-crm-cost-calculator": "Nonprofit CRM Cost Calculator",
  "nonprofit-crm-evaluation-scorecard": "CRM Evaluation Scorecard",
  "nonprofit-crm-market-report-2026": "Nonprofit CRM Market Report 2026",
  // Grant Management & Lifecycle
  "grant-closeout-checklist": "Grant Closeout Checklist",
  "granthub-migration-checklist": "GrantHub Migration Checklist",
  "award-setup-worksheet": "Award Setup Worksheet",
  "grant-reporting-deadlines-tracker": "Grant Reporting Deadlines Tracker",
  "grant-kickoff-meeting-template": "Grant Kickoff Meeting Template",
  "no-cost-extension-request-template": "No-Cost Extension Request Template",
  "grant-budget-amendment-request-template": "Grant Budget Amendment Request Template",
  "funder-report-template": "Funder Report Template",
  // Grant Compliance
  "2-cfr-200-audit-prep-checklist": "2 CFR 200 Audit Prep Checklist",
  "grant-file-audit-checklist": "Grant File Audit Checklist",
  "single-audit-prep-timeline": "Single Audit Prep Timeline",
  // Federal Grant Operations
  "time-and-effort-certification-template": "Time and Effort Certification Template",
  "subrecipient-monitoring-checklist": "Subrecipient Monitoring Checklist",
  "sefa-prep-worksheet": "SEFA Prep Worksheet",
  "sf-425-reporting-checklist": "SF-425 Reporting Checklist",
  "subrecipient-agreement-checklist": "Subrecipient Agreement Checklist",
  "grant-staff-time-tracking-template": "Grant Staff Time Tracking Template",
  // Restricted Fund Accounting
  "restricted-fund-tracking-spreadsheet": "Restricted Fund Tracking Spreadsheet",
  "grant-spend-down-tracker": "Grant Spend-Down Tracker",
  "grant-budget-tracking-template": "Grant Budget Tracking Template",
  "restricted-funds-release-calculator": "Restricted Funds Release Calculator",
  "donor-to-grant-reconciliation-template": "Donor-to-Grant Reconciliation Template",
  // CRM + Grants Alternatives
  "grant-software-roi-calculator": "Grant Software ROI Calculator",
  "board-approval-memo-software-template": "Board Approval Memo Template",
  "crm-migration-data-map-template": "CRM Migration Data Map Template",
  "salesforce-npsp-migration-map": "Salesforce NPSP Migration Map",
  // Fundraising & Development
  "donor-thank-you-letter-template-pack": "Donor Thank-You Letter Template Pack",
  "nonprofit-financial-report-template": "Nonprofit Financial Report Template",
  "grant-proposal-budget-template": "Grant Proposal Budget Template",
  "nonprofit-development-plan-template": "Nonprofit Development Plan Template",
  "monthly-giving-program-launch-checklist": "Monthly Giving Program Launch Checklist",
  "ai-tools-evaluation-scorecard-nonprofits": "AI Tools Evaluation Scorecard for Nonprofits",
  "501c3-application-checklist": "501(c)(3) Application Checklist",
  "donor-stewardship-plan-template": "Donor Stewardship Plan Template",
  // Grant Discovery & Development Strategy
  "grant-proposal-sample-pack": "Grant Proposal Sample Pack: 3 Annotated Examples",
  "development-operations-self-audit": "Development Operations Self-Audit: 50-Point Assessment",
  "year-end-campaign-toolkit": "Year-End Giving Campaign Toolkit",
  "board-fundraising-toolkit": "Board Fundraising Toolkit: Give-or-Get Policy + Training Guide",
  "funder-prospecting-research-template": "Funder Prospecting Research Template",
  "cdbg-compliance-worksheet": "CDBG Compliance Worksheet",
  "federal-grant-application-checklist": "Federal Grant Application Pre-Submission Checklist",
  "nonprofit-technology-evaluation-worksheet": "Nonprofit Technology Evaluation Worksheet",
  "donor-retention-dashboard-template": "Donor Retention Dashboard Template: 8 Key Metrics",
  "grant-narrative-template-pack": "Grant Narrative Template Pack: 5 Core Sections",
  "new-development-director-90-day-checklist":
    "New Development Director 90-Day Onboarding Checklist",
  "cost-allocation-plan-worksheet": "Cost Allocation Plan Worksheet for Federal Grantees",
  "funder-stewardship-calendar-template": "Annual Funder Stewardship Calendar Template",
  "indirect-cost-rate-negotiation-worksheet": "Indirect Cost Rate Negotiation Worksheet",
  "corporate-partnership-proposal-template": "Corporate Partnership Proposal Template",
  // City Lead Magnets
  "nyc-foundation-funder-map-2026": "NYC Foundation Funder Map 2026",
  "los-angeles-foundation-funder-map-2026": "Los Angeles Foundation Funder Map 2026",
  "chicago-foundation-funder-map-2026": "Chicago Foundation Funder Map 2026",
  "houston-grant-deadline-calendar-2026": "Houston Grant Deadline Calendar 2026",
  "dc-federal-pass-through-pipeline-worksheet": "DC Federal Pass-Through Pipeline Worksheet",
  "philadelphia-grant-deadline-calendar-2026": "Philadelphia Grant Deadline Calendar 2026",
  "phoenix-foundation-funder-map-2026": "Phoenix Foundation Funder Map 2026",
  "san-antonio-grant-deadline-calendar-2026": "San Antonio Grant Deadline Calendar 2026",
  "san-diego-foundation-funder-map-2026": "San Diego Foundation Funder Map 2026",
  "dallas-foundation-funder-map-2026": "Dallas Foundation Funder Map 2026",
  // City Lead Magnets — Batch 2
  "boston-foundation-funder-map-2026": "Boston Foundation Funder Map 2026",
  "seattle-foundation-funder-map-2026": "Seattle Foundation Funder Map 2026",
  "denver-foundation-funder-map-2026": "Denver Foundation Funder Map 2026",
  "atlanta-grant-deadline-calendar-2026": "Atlanta Grant Deadline Calendar 2026",
  "minneapolis-foundation-funder-map-2026": "Minneapolis Foundation Funder Map 2026",
  "jacksonville-grant-deadline-calendar-2026": "Jacksonville Grant Deadline Calendar 2026",
  "raleigh-foundation-funder-map-2026": "Raleigh Foundation Funder Map 2026",
  // State Charitable Registration Compliance Checklists
  "california-compliance-checklist": "California Charitable Registration Compliance Checklist",
  "texas-compliance-checklist": "Texas Nonprofit Compliance Checklist",
  "new-york-compliance-checklist": "New York CHAR500 Compliance Checklist",
  "florida-compliance-checklist": "Florida Charitable Registration Compliance Checklist",
  "illinois-compliance-checklist": "Illinois Charitable Registration Compliance Checklist",
  "pennsylvania-compliance-checklist": "Pennsylvania BCO-10 Compliance Checklist",
  "ohio-compliance-checklist": "Ohio Charitable Registration Compliance Checklist",
  "georgia-compliance-checklist": "Georgia Charitable Registration Compliance Checklist",
  "north-carolina-compliance-checklist": "North Carolina CSL Compliance Checklist",
  "massachusetts-compliance-checklist": "Massachusetts Form PC Compliance Checklist",
  // Net-New State Compliance Checklists
  "washington-compliance-checklist": "Washington Charitable Trust Renewal Compliance Checklist",
  "minnesota-compliance-checklist":
    "Minnesota Charitable Organization Annual Report Compliance Checklist",
  "virginia-compliance-checklist": "Virginia Form 102 Compliance Checklist",
  "new-jersey-compliance-checklist": "New Jersey CRI-300R Compliance Checklist",
  "michigan-compliance-checklist": "Michigan CTS-02 Compliance Checklist",
  "maryland-compliance-checklist": "Maryland COF-85 Compliance Checklist",
  "colorado-compliance-checklist":
    "Colorado Charitable Solicitations Annual Renewal Compliance Checklist",
  "arizona-compliance-checklist": "Arizona Annual Corporation Report Compliance Checklist",
  "tennessee-compliance-checklist": "Tennessee SS-6001 Compliance Checklist",
  "missouri-compliance-checklist":
    "Missouri Charitable Organization Annual Renewal Compliance Checklist",
  "indiana-compliance-checklist": "Indiana Business Entity Report Compliance Checklist",
  "wisconsin-compliance-checklist": "Wisconsin Form 1952 Compliance Checklist",
  "oregon-compliance-checklist": "Oregon CT-12 Compliance Checklist",
  "connecticut-compliance-checklist": "Connecticut CPC-63 Compliance Checklist",
  "kentucky-compliance-checklist": "Kentucky Annual Report Compliance Checklist",
  "alabama-compliance-checklist":
    "Alabama Charitable Organization Annual Renewal Compliance Checklist",
  "south-carolina-compliance-checklist":
    "South Carolina Annual Financial Report Compliance Checklist",
  "oklahoma-compliance-checklist":
    "Oklahoma Charitable Organization Annual Renewal Compliance Checklist",
  "louisiana-compliance-checklist":
    "Louisiana Charitable Organization Annual Renewal Compliance Checklist",
  "iowa-compliance-checklist": "Iowa Biennial Report Compliance Checklist",
  // Interactive Questionnaires
  "nonprofit-audit-readiness-assessment": "Nonprofit Audit Readiness Assessment",
  "grant-compliance-readiness-quiz": "Grant Compliance Readiness Quiz",
  "nonprofit-software-needs-assessment": "Nonprofit Software Needs Assessment",
  "donor-management-maturity-assessment": "Donor Management Maturity Assessment",
  "nonprofit-financial-health-scorecard": "Nonprofit Financial Health Scorecard",
  // Auditor & Funder Portal
  "auditor-evidence-checklist": "Auditor Evidence Checklist",
  "funder-monitoring-evidence-template": "Funder Monitoring Evidence Template",
  "audit-prep-week-by-week-checklist": "4-Week Audit Preparation Checklist",
  "external-reviewer-access-policy-template": "External Reviewer Access Policy Template",
  // Spreadsheet Deliverables
  "grant-tracking-template": "Grant Tracking Spreadsheet",
  "grant-budget-template": "Grant Budget Template",
};

export function isLeadMagnetSlug(value: string | null | undefined): value is LeadMagnetSlug {
  if (!value) {
    return false;
  }

  return (LEAD_MAGNET_SLUGS as readonly string[]).includes(value);
}

export const LEAD_MAGNET_SEQUENCE_FAMILIES = [
  "grant-compliance",
  "federal-grant-ops",
  "restricted-fund-accounting",
  "grant-management",
  "crm-evaluation",
  "fundraising-development",
  "state-compliance",
  "city-funder-research",
  "audit-readiness",
  "interactive-assessment",
] as const;

export type LeadMagnetSequenceFamily = (typeof LEAD_MAGNET_SEQUENCE_FAMILIES)[number];

export const LEAD_MAGNET_SEQUENCE_SLUGS = [
  "grantpipe-nurture-value-1",
  "grantpipe-lead-magnet-nurture",
] as const;

export type LeadMagnetSequenceSlug = (typeof LEAD_MAGNET_SEQUENCE_SLUGS)[number];

export const LEAD_MAGNET_PROVISIONED_SEQUENCE_SLUGS = [
  "grantpipe-nurture-value-1",
  "grantpipe-lead-magnet-nurture",
] as const;

export type LeadMagnetProvisionedSequenceSlug =
  (typeof LEAD_MAGNET_PROVISIONED_SEQUENCE_SLUGS)[number];

export type LeadMagnetBuyerStage = "tofu" | "mofu" | "bofu";

export interface LeadMagnetSequenceMetadata {
  family: LeadMagnetSequenceFamily;
  sequenceSlug: LeadMagnetSequenceSlug;
  enrollmentSequenceSlug: LeadMagnetProvisionedSequenceSlug;
  buyerStage: LeadMagnetBuyerStage;
  topicCluster:
    | "nonprofit-crm"
    | "grant-management"
    | "grant-compliance"
    | "restricted-fund-accounting"
    | "donor-operations";
  firstFollowUpAngle: string;
  cadence: "daily";
  nextStepGoal: "start_trial";
  stopCondition: "signup_completed";
}

const DAILY_TRIAL_SEQUENCE_CONTRACT = {
  cadence: "daily",
  nextStepGoal: "start_trial",
  stopCondition: "signup_completed",
} as const;

const SEQUENCE_BY_FAMILY: Record<LeadMagnetSequenceFamily, LeadMagnetSequenceMetadata> = {
  "grant-compliance": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "grant-compliance",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "grant-compliance",
    firstFollowUpAngle:
      "Help the prospect turn the checklist into a recurring grant compliance control rhythm.",
  },
  "federal-grant-ops": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "federal-grant-ops",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "grant-compliance",
    firstFollowUpAngle:
      "Help the prospect connect federal reporting, time tracking, and subrecipient evidence.",
  },
  "restricted-fund-accounting": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "restricted-fund-accounting",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "restricted-fund-accounting",
    firstFollowUpAngle:
      "Help the prospect reconcile restricted funds, grant budgets, releases, and reporting.",
  },
  "grant-management": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "grant-management",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "grant-management",
    firstFollowUpAngle:
      "Help the prospect move from spreadsheet grant tracking to a controlled award workflow.",
  },
  "crm-evaluation": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "crm-evaluation",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "nonprofit-crm",
    firstFollowUpAngle:
      "Help the prospect compare CRM cost, migration effort, and grant workflow fit before a trial.",
  },
  "fundraising-development": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "fundraising-development",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "donor-operations",
    firstFollowUpAngle:
      "Help the prospect connect donor development work to cleaner grants and funder follow-up.",
  },
  "state-compliance": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "state-compliance",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "bofu",
    topicCluster: "grant-compliance",
    firstFollowUpAngle:
      "Help the prospect turn state registration deadlines into an annual compliance calendar.",
  },
  "city-funder-research": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "city-funder-research",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "grant-management",
    firstFollowUpAngle:
      "Help the prospect qualify local funders and convert research into a managed grant pipeline.",
  },
  "audit-readiness": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "audit-readiness",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "mofu",
    topicCluster: "grant-compliance",
    firstFollowUpAngle:
      "Help the prospect collect audit evidence before auditor requests become a deadline scramble.",
  },
  "interactive-assessment": {
    ...DAILY_TRIAL_SEQUENCE_CONTRACT,
    family: "interactive-assessment",
    sequenceSlug: "grantpipe-lead-magnet-nurture",
    enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    buyerStage: "tofu",
    topicCluster: "grant-management",
    firstFollowUpAngle:
      "Help the prospect convert the assessment result into a short grant management improvement plan.",
  },
};

const GRANT_MANAGEMENT_SLUGS = [
  "grant-reporting-calendar-template",
  "grant-pipeline-forecasting-worksheet",
  "grant-closeout-checklist",
  "granthub-migration-checklist",
  "award-setup-worksheet",
  "grant-reporting-deadlines-tracker",
  "grant-kickoff-meeting-template",
  "no-cost-extension-request-template",
  "grant-budget-amendment-request-template",
  "funder-report-template",
  "grant-tracking-template",
  "grant-budget-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const GRANT_COMPLIANCE_SLUGS = [
  "grant-compliance-checklist",
  "grant-compliance-cost-audit",
  "fasb-asc-958-quick-reference",
  "grant-file-audit-checklist",
  "single-audit-prep-timeline",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const FEDERAL_GRANT_OPS_SLUGS = [
  "2-cfr-200-audit-prep-checklist",
  "time-and-effort-certification-template",
  "subrecipient-monitoring-checklist",
  "sefa-prep-worksheet",
  "sf-425-reporting-checklist",
  "subrecipient-agreement-checklist",
  "grant-staff-time-tracking-template",
  "cdbg-compliance-worksheet",
  "federal-grant-application-checklist",
  "cost-allocation-plan-worksheet",
  "indirect-cost-rate-negotiation-worksheet",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const RESTRICTED_FUND_SLUGS = [
  "restricted-fund-tracking-spreadsheet",
  "grant-spend-down-tracker",
  "grant-budget-tracking-template",
  "restricted-funds-release-calculator",
  "donor-to-grant-reconciliation-template",
  "nonprofit-financial-report-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const CRM_EVALUATION_SLUGS = [
  "nonprofit-crm-cost-calculator",
  "nonprofit-crm-evaluation-scorecard",
  "nonprofit-crm-market-report-2026",
  "grant-software-roi-calculator",
  "board-approval-memo-software-template",
  "crm-migration-data-map-template",
  "salesforce-npsp-migration-map",
  "ai-tools-evaluation-scorecard-nonprofits",
  "nonprofit-technology-evaluation-worksheet",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const FUNDRAISING_DEVELOPMENT_SLUGS = [
  "donor-retention-playbook",
  "major-donor-cultivation-playbook",
  "donor-thank-you-letter-template-pack",
  "grant-proposal-budget-template",
  "nonprofit-development-plan-template",
  "monthly-giving-program-launch-checklist",
  "501c3-application-checklist",
  "donor-stewardship-plan-template",
  "grant-proposal-sample-pack",
  "development-operations-self-audit",
  "year-end-campaign-toolkit",
  "board-fundraising-toolkit",
  "funder-prospecting-research-template",
  "donor-retention-dashboard-template",
  "grant-narrative-template-pack",
  "new-development-director-90-day-checklist",
  "funder-stewardship-calendar-template",
  "corporate-partnership-proposal-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const CITY_FUNDER_RESEARCH_SLUGS = [
  "nyc-foundation-funder-map-2026",
  "los-angeles-foundation-funder-map-2026",
  "chicago-foundation-funder-map-2026",
  "houston-grant-deadline-calendar-2026",
  "dc-federal-pass-through-pipeline-worksheet",
  "philadelphia-grant-deadline-calendar-2026",
  "phoenix-foundation-funder-map-2026",
  "san-antonio-grant-deadline-calendar-2026",
  "san-diego-foundation-funder-map-2026",
  "dallas-foundation-funder-map-2026",
  "boston-foundation-funder-map-2026",
  "seattle-foundation-funder-map-2026",
  "denver-foundation-funder-map-2026",
  "atlanta-grant-deadline-calendar-2026",
  "minneapolis-foundation-funder-map-2026",
  "jacksonville-grant-deadline-calendar-2026",
  "raleigh-foundation-funder-map-2026",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const STATE_COMPLIANCE_SLUGS = [
  "california-compliance-checklist",
  "texas-compliance-checklist",
  "new-york-compliance-checklist",
  "florida-compliance-checklist",
  "illinois-compliance-checklist",
  "pennsylvania-compliance-checklist",
  "ohio-compliance-checklist",
  "georgia-compliance-checklist",
  "north-carolina-compliance-checklist",
  "massachusetts-compliance-checklist",
  "washington-compliance-checklist",
  "minnesota-compliance-checklist",
  "virginia-compliance-checklist",
  "new-jersey-compliance-checklist",
  "michigan-compliance-checklist",
  "maryland-compliance-checklist",
  "colorado-compliance-checklist",
  "arizona-compliance-checklist",
  "tennessee-compliance-checklist",
  "missouri-compliance-checklist",
  "indiana-compliance-checklist",
  "wisconsin-compliance-checklist",
  "oregon-compliance-checklist",
  "connecticut-compliance-checklist",
  "kentucky-compliance-checklist",
  "alabama-compliance-checklist",
  "south-carolina-compliance-checklist",
  "oklahoma-compliance-checklist",
  "louisiana-compliance-checklist",
  "iowa-compliance-checklist",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const INTERACTIVE_ASSESSMENT_SLUGS = [
  "nonprofit-audit-readiness-assessment",
  "grant-compliance-readiness-quiz",
  "nonprofit-software-needs-assessment",
  "donor-management-maturity-assessment",
  "nonprofit-financial-health-scorecard",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

const AUDIT_READINESS_SLUGS = [
  "auditor-evidence-checklist",
  "funder-monitoring-evidence-template",
  "audit-prep-week-by-week-checklist",
  "external-reviewer-access-policy-template",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;

function metadataFor<const Slugs extends ReadonlyArray<LeadMagnetSlug>>(
  family: LeadMagnetSequenceFamily,
  slugs: Slugs,
): Record<Slugs[number], LeadMagnetSequenceMetadata> {
  return Object.fromEntries(slugs.map((slug) => [slug, SEQUENCE_BY_FAMILY[family]])) as Record<
    Slugs[number],
    LeadMagnetSequenceMetadata
  >;
}

function withBuyerStage(
  metadata: LeadMagnetSequenceMetadata,
  buyerStage: LeadMagnetBuyerStage,
): LeadMagnetSequenceMetadata {
  return {
    ...metadata,
    buyerStage,
  };
}

export const LEAD_MAGNET_SEQUENCE_METADATA = {
  ...metadataFor("grant-management", GRANT_MANAGEMENT_SLUGS),
  ...metadataFor("grant-compliance", GRANT_COMPLIANCE_SLUGS),
  ...metadataFor("federal-grant-ops", FEDERAL_GRANT_OPS_SLUGS),
  ...metadataFor("restricted-fund-accounting", RESTRICTED_FUND_SLUGS),
  ...metadataFor("crm-evaluation", CRM_EVALUATION_SLUGS),
  ...metadataFor("fundraising-development", FUNDRAISING_DEVELOPMENT_SLUGS),
  ...metadataFor("city-funder-research", CITY_FUNDER_RESEARCH_SLUGS),
  ...metadataFor("state-compliance", STATE_COMPLIANCE_SLUGS),
  ...metadataFor("interactive-assessment", INTERACTIVE_ASSESSMENT_SLUGS),
  ...metadataFor("audit-readiness", AUDIT_READINESS_SLUGS),
  "grant-software-roi-calculator": withBuyerStage(SEQUENCE_BY_FAMILY["crm-evaluation"], "bofu"),
  "board-approval-memo-software-template": withBuyerStage(
    SEQUENCE_BY_FAMILY["crm-evaluation"],
    "bofu",
  ),
  "crm-migration-data-map-template": withBuyerStage(SEQUENCE_BY_FAMILY["crm-evaluation"], "bofu"),
  "salesforce-npsp-migration-map": withBuyerStage(SEQUENCE_BY_FAMILY["crm-evaluation"], "bofu"),
  "board-fundraising-toolkit": withBuyerStage(
    SEQUENCE_BY_FAMILY["fundraising-development"],
    "tofu",
  ),
  "new-development-director-90-day-checklist": withBuyerStage(
    SEQUENCE_BY_FAMILY["fundraising-development"],
    "tofu",
  ),
  "nonprofit-software-needs-assessment": withBuyerStage(
    SEQUENCE_BY_FAMILY["interactive-assessment"],
    "mofu",
  ),
} as const satisfies Record<LeadMagnetSlug, LeadMagnetSequenceMetadata>;

export const FALLBACK_LEAD_MAGNET_SEQUENCE = {
  ...SEQUENCE_BY_FAMILY["grant-compliance"],
  sequenceSlug: "grantpipe-nurture-value-1",
  enrollmentSequenceSlug: "grantpipe-nurture-value-1",
  firstFollowUpAngle:
    "Help the prospect connect the downloaded resource to GrantPipe's compliance-first grant management system.",
} as const satisfies LeadMagnetSequenceMetadata;

export function resolveLeadMagnetSequence(slug: string): LeadMagnetSequenceMetadata {
  if (isLeadMagnetSlug(slug)) {
    return LEAD_MAGNET_SEQUENCE_METADATA[slug];
  }

  return FALLBACK_LEAD_MAGNET_SEQUENCE;
}
