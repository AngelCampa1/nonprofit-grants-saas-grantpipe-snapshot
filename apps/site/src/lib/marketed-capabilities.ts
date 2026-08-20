export type ProductSectionVariant = "record" | "workflow" | "report" | "timeline";
export type PricingTierName = "Starter" | "Growth" | "Audit-Ready";
export type PricingPlan = "starter" | "growth" | "audit_ready" | "enterprise";

interface ProductProofMetric {
  label: string;
  value: string;
  detail: string;
}

interface ProductProofColumn {
  label: string;
  items: string[];
}

interface ProductProofStep {
  label: string;
  title: string;
  detail: string;
}

interface ProductProofRow {
  label: string;
  value: string;
  detail: string;
}

interface ProductProofPhase {
  label: string;
  title: string;
  detail: string;
}

interface BaseMarketedCapabilityNarrative {
  slug: "fundraising" | "compliance" | "accounting" | "migration";
  label: string;
  navLabel: string;
  title: string;
  summary: string;
  heading: string;
  supportingCopy: string;
  supportText: string;
  outcomes: string[];
  items: string[];
  proofIntro: string;
  pricingTier?: PricingTierName;
}

interface RecordCapabilityNarrative extends BaseMarketedCapabilityNarrative {
  slug: "fundraising";
  variant: "record";
  pricingTier: "Starter";
  proofMetrics: [ProductProofMetric, ProductProofMetric, ProductProofMetric];
  proofColumns: [ProductProofColumn, ProductProofColumn, ProductProofColumn];
}

interface WorkflowCapabilityNarrative extends BaseMarketedCapabilityNarrative {
  slug: "compliance";
  variant: "workflow";
  pricingTier: "Growth";
  proofSteps: [ProductProofStep, ProductProofStep, ProductProofStep, ProductProofStep];
  proofMetrics: [ProductProofMetric, ProductProofMetric];
}

interface ReportCapabilityNarrative extends BaseMarketedCapabilityNarrative {
  slug: "accounting";
  variant: "report";
  pricingTier: "Audit-Ready";
  proofRows: [ProductProofRow, ProductProofRow, ProductProofRow, ProductProofRow];
  proofMetrics: [ProductProofMetric, ProductProofMetric];
}

interface TimelineCapabilityNarrative extends BaseMarketedCapabilityNarrative {
  slug: "migration";
  variant: "timeline";
  proofTimeline: [ProductProofPhase, ProductProofPhase, ProductProofPhase, ProductProofPhase];
  proofMetrics: [ProductProofMetric, ProductProofMetric];
}

export type MarketedCapabilityNarrative =
  | RecordCapabilityNarrative
  | WorkflowCapabilityNarrative
  | ReportCapabilityNarrative
  | TimelineCapabilityNarrative;

export interface PricingTierBinding {
  plan: PricingPlan;
  proofHref: string;
}

const FEATURE_PAGE_BY_CAPABILITY_ITEM = {
  "Multi-source grant pipeline": "/features/grant-pipeline-management",
  "Grants.gov opportunity search": "/features/grant-pipeline-management",
  "Donor CRM": "/features/donor-segmentation",
  "Donor email": "/features/outbound-donor-email-mail-merge",
  "Donor pipeline": "/features/donor-retention-reporting",
  Grants: "/features/grant-pipeline-management",
  "Grant pipeline": "/features/grant-pipeline-management",
  Funders: "/features/funder-reporting-templates",
  Events: "/features/donor-segmentation",
  Calendar: "/features/grant-calendar-deadline-alerts",
  Funds: "/features/restricted-fund-tracking",
  "Grant Budget Sentinel": "/features/grant-budget-sentinel",
  "Spend-down tracking": "/features/grant-drawdowns-reimbursements",
  "Deadline reminders": "/features/grant-calendar-deadline-alerts",
  Notifications: "/features/grant-calendar-deadline-alerts",
  "Activity log": "/features/audit-trail-activity-log",
  "Document-backed report workflow": "/features/funder-reporting-templates",
  "Award Document Intake": "/features/ai-award-document-intake",
  "Ask-Your-Ledger grounded reporting": "/features/ask-your-ledger",
  "Outcome and impact measurement": "/features/outcome-impact-measurement-layer",
  "Proposal and report drafting": "/features/proposal-report-drafting-assistant",
  "Board Packet Composer": "/features/board-packet-composer",
  "Audit readiness score and binder starter": "/features/audit-readiness-score-binder-starter",
  "Year-End Statement Run": "/features/acknowledgment-year-end-statement-run",
  "Compliance, audit, 990, board, year-end, and acknowledgment outputs":
    "/features/acknowledgment-year-end-statement-run",
  "Evidence bundles": "/features/auditor-funder-portal",
  "Board member portal": "/features/board-member-portal",
  "Reviewer access control": "/features/role-based-permissions",
  "View and download audit trail": "/features/audit-trail-activity-log",
  "Chart of accounts": "/features/restricted-fund-tracking",
  Journal: "/features/audit-trail-activity-log",
  "Reimbursement Cash-Flow Radar": "/features/reimbursement-cash-flow-radar",
  "Pledge Tracker": "/features/pledge-multi-year-commitment-tracker",
  "Program Allocation": "/features/payroll-allocation",
  "Program budget vs actual": "/features/payroll-allocation",
  Ledger: "/features/audit-trail-activity-log",
  "Trial balance": "/features/multi-entity-consolidation",
  "Fiscal periods": "/features/multi-entity-consolidation",
  "Bank accounts": "/features/grant-drawdowns-reimbursements",
  "Recurring entries": "/features/payroll-allocation",
  "Financial position, activities, and functional expenses": "/features/multi-entity-consolidation",
  "Auditor & Funder Portal": "/features/auditor-funder-portal",
  "Scoped reviewer access": "/features/role-based-permissions",
  "Evidence bundle export": "/features/auditor-funder-portal",
  Onboarding: "/features/data-migration-onboarding-studio",
  "Guided import": "/features/guided-onboarding-import-setup",
  "Setup path": "/features/data-migration-onboarding-studio",
  "Import preview": "/features/data-migration-onboarding-studio",
  "Plan-fit setup": "/features/data-migration-onboarding-studio",
  "Plan-fit onboarding": "/features/role-based-permissions",
  "Bounded rollout path": "/features/custom-fields",
} as const satisfies Record<string, `/features/${string}`>;
const FEATURE_PAGE_BY_CAPABILITY_LOOKUP: Readonly<Record<string, `/features/${string}`>> =
  FEATURE_PAGE_BY_CAPABILITY_ITEM;

const MARKETED_CAPABILITIES = [
  {
    slug: "fundraising",
    label: "Fundraising",
    navLabel: "Evidence and records",
    title: "Keep restricted funds, grants, and donor records connected",
    summary:
      "Search Grants.gov, track non-federal opportunities, keep donor history, manage grant pursuit, and preserve restricted-fund context behind the same record.",
    heading: "Keep restricted funds, grants, and donor records connected",
    supportingCopy:
      "Compliance reviews need relationship history, award terms, and restriction context to stay readable. GrantPipe keeps Grants.gov opportunities, tracked non-federal opportunities, donor CRM notes, grant pipeline stages, deadlines, and restricted-fund trails attached to one shared record.",
    supportText:
      "Use this when fundraising work starts with Grants.gov search, a funder website, or a CSV prospect list and needs strong fits to move into the GrantPipe pipeline without disappearing into another tracker.",
    outcomes: [
      "Federal opportunities from Grants.gov can be searched, opened, saved, and moved into the pipeline.",
      "Non-federal opportunities can be manually added or imported from CSV.",
      "Donor records and giving history stay attached to grant work.",
      "Pipeline reviews cover both fundraising and grant activity.",
      "Events and calendar context stay visible to the same team.",
    ],
    items: [
      "Multi-source grant pipeline",
      "Grants.gov opportunity search",
      "Donor CRM",
      "Donor email",
      "Donor pipeline",
      "Grants",
      "Grant pipeline",
      "Funders",
      "Events",
      "Calendar",
    ],
    variant: "record",
    pricingTier: "Starter",
    proofIntro:
      "A single operating record keeps the handoff between donor CRM, grant pursuit, award work, and reporting legible.",
    proofMetrics: [
      {
        label: "Open asks",
        value: "4 live asks",
        detail:
          "Development sees the current donor, federal opportunity, and funder motion without leaving the record.",
      },
      {
        label: "Next deadline",
        value: "May 14",
        detail:
          "Grant reporting dates stay attached to the same account history the team already works from.",
      },
      {
        label: "Restricted balance",
        value: "$186,240",
        detail: "Finance can see the fund posture without waiting for a spreadsheet handoff.",
      },
    ],
    proofColumns: [
      {
        label: "Development sees",
        items: [
          "Grants.gov opportunities that can be saved or converted",
          "Last gift, campaign context, and pledge notes",
          "Upcoming touchpoints and event attendance",
          "Open asks across donor and grant relationships",
        ],
      },
      {
        label: "Grants sees",
        items: [
          "Submission stage, funder rules, and program owner",
          "Attached documents and award terms",
          "Reporting dates tied to the same history",
        ],
      },
      {
        label: "Finance sees",
        items: [
          "Restricted-fund status and allocation trail",
          "Revenue mapping back to the same record",
          "Ready link into statements and audit history",
        ],
      },
    ],
  },
  {
    slug: "compliance",
    label: "Compliance",
    navLabel: "Compliance calendar",
    title: "Keep deadlines, evidence, and activity history ready for review",
    summary:
      "Keep grant deadlines, supporting documents, reminder logic, and the activity trail in the workflow staff already use.",
    heading: "Keep deadlines, evidence, and activity history ready for review",
    supportingCopy:
      "Compliance work breaks down when the deadline list, the supporting files, and the audit trail live in separate places. GrantPipe keeps those steps on the same workflow instead of turning reporting week into a scavenger hunt.",
    supportText:
      "Use this when the audit question is not whether the deadline existed, but whether the team can still show the document trail and the action that changed it.",
    outcomes: [
      "Spend-down and deadline pressure stay visible before reporting week.",
      "Grant Budget Sentinel flags budget risk and restricted-fund lapse states before close.",
      "Notifications and activity history stay attached to the same grant record.",
      "Teams can produce board, 990, compliance, audit, year-end, and acknowledgment outputs from the shipped report pack.",
      "Evidence bundles package grant documents, reports, and restriction terms for auditors and funders without emailing files.",
    ],
    items: [
      "Funds",
      "Grant Budget Sentinel",
      "Spend-down tracking",
      "Deadline reminders",
      "Notifications",
      "Activity log",
      "Document-backed report workflow",
      "Award Document Intake",
      "Ask-Your-Ledger grounded reporting",
      "Outcome and impact measurement",
      "Proposal and report drafting",
      "Board Packet Composer",
      "Year-End Statement Run",
      "Compliance, audit, 990, board, year-end, and acknowledgment outputs",
      "Evidence bundles",
      "Board member portal",
      "Reviewer access control",
      "View and download audit trail",
    ],
    variant: "workflow",
    pricingTier: "Growth",
    proofIntro:
      "The workflow carries the record from deadline setup through the audit trail instead of leaving teams with disconnected reminders.",
    proofSteps: [
      {
        label: "01",
        title: "Deadline is scheduled on the grant",
        detail:
          "The due date, owner, and reporting requirement stay on the same grant record as the award terms.",
      },
      {
        label: "02",
        title: "Supporting files collect in one place",
        detail:
          "Budget notes, attachments, and reminder history stay attached to the reporting cycle.",
      },
      {
        label: "03",
        title: "Activity log records each change",
        detail:
          "Status moves, reminders, and document updates create an audit-facing trail without another manual log.",
      },
      {
        label: "04",
        title: "Report output is assembled from the same record",
        detail:
          "Board, 990, compliance, audit, year-end, and acknowledgment outputs pull from the workflow that created them.",
      },
    ],
    proofMetrics: [
      {
        label: "Due this month",
        value: "7 reports",
        detail: "The queue is visible before reporting week starts.",
      },
      {
        label: "Audit trail",
        value: "Captured",
        detail:
          "Every document view, download, and session expiry is logged in the portal audit trail, available for your next examination.",
      },
    ],
  },
  {
    slug: "accounting",
    label: "Accounting",
    navLabel: "Fund and accounting visibility",
    title: "Show finance the fund trail behind each record",
    summary:
      "Keep funds, journal notes, reimbursements, pledges, and program budgets near grant and donor records.",
    heading: "Show finance the fund trail behind each record",
    supportingCopy:
      "Finance should not rebuild each grant story. GrantPipe keeps fund status near each record. Bank work, pledges, and budgets stay close too.",
    supportText:
      "Use this when finance needs the record trail before cash, pledge, or budget work.",
    outcomes: [
      "Finance can review fund status next to grant and donor history.",
      "Reimbursement Cash-Flow Radar shows grant costs that still need cash work.",
      "Pledge Tracker keeps multi-year promises, due balances, and posting controls visible for finance follow-up.",
      "Audit prep gets a visible readiness score and an audit-purpose evidence bundle starter.",
      "Program Allocation connects budgets, expenses, grants, and outcome ownership without double-counting fund or grant dimensions.",
      "Auditor and funder reviews happen in a scoped portal, not via emailed spreadsheets or shared drives.",
    ],
    items: [
      "Chart of accounts",
      "Journal",
      "Program Allocation",
      "Program budget vs actual",
      "Ledger",
      "Bank accounts",
      "Reimbursement Cash-Flow Radar",
      "Pledge Tracker",
      "Audit readiness score and binder starter",
      "Recurring entries",
      "Auditor & Funder Portal",
      "Scoped reviewer access",
      "Evidence bundle export",
    ],
    variant: "report",
    pricingTier: "Audit-Ready",
    proofIntro:
      "The accounting layer is part of the product surface, so the report output can point back to the operating record that created it.",
    proofRows: [
      {
        label: "Fund posture",
        value: "Linked to source records",
        detail: "Finance sees the fund context beside the grant or donor record.",
      },
      {
        label: "Reimbursement queue",
        value: "Cash work visible",
        detail: "Posted costs show what still needs request, approval, or cash receipt work.",
      },
      {
        label: "Pledge follow-up",
        value: "Due balances tracked",
        detail: "Multi-year promises stay tied to finance follow-up.",
      },
      {
        label: "Program budget vs actual",
        value: "Allocation-aware",
        detail: "Program budgets, grants, and expense splits stay tied to the same audit trail.",
      },
    ],
    proofMetrics: [
      {
        label: "Cash status",
        value: "Needs review",
        detail: "The queue shows which reimbursement work still needs action.",
      },
      {
        label: "Fund trail",
        value: "Linked",
        detail:
          "Restricted activity ties back to grant and donor records and can be shared through a scoped portal.",
      },
    ],
  },
  {
    slug: "migration",
    label: "Migration",
    navLabel: "Guided rollout",
    title: "Move onto GrantPipe with a bounded rollout",
    summary:
      "Move with a self-serve import flow, plan-fit setup, and a rollout shape tied to the product surface that already ships.",
    heading: "Move onto GrantPipe with a bounded rollout",
    supportingCopy:
      "Mid-sized nonprofit teams do not need a consultant-defined future state to switch systems. They need a clear import path, a short training sequence, and confidence that the rollout will stop expanding.",
    supportText:
      "Use this when the migration has to stay bounded around the team you already have, the quarter you are already in, and the workflows that ship today.",
    outcomes: [
      "Import previews keep existing records legible during the switch.",
      "A short setup path points staff to the shipped workflows.",
      "The migration stays scoped to the product surface that already ships.",
    ],
    items: ["Setup path", "Import preview", "Plan-fit setup", "Bounded rollout path"],
    variant: "timeline",
    proofIntro:
      "The rollout is framed as a short sequence with clear deliverables, not an open-ended redesign of how your team works.",
    proofTimeline: [
      {
        label: "Week 1",
        title: "Import and map the current record set",
        detail:
          "Bring donor, grant, and fund history into an import preview that stays tied to the shipped data model.",
      },
      {
        label: "Week 2",
        title: "Validate operating workflows with staff",
        detail:
          "Confirm fundraising, compliance, and accounting paths in the product your team will actually use.",
      },
      {
        label: "Week 3",
        title: "Train against live reporting work",
        detail:
          "Onboarding focuses on the real deadlines, fund tracking, and close motion your team already owns.",
      },
      {
        label: "Week 4",
        title: "Cut over on a bounded scope",
        detail:
          "The switch stays limited to the shipped workflows instead of expanding into a consulting backlog.",
      },
    ],
    proofMetrics: [
      {
        label: "Import support",
        value: "Guided",
        detail: "Audit-Ready and Enterprise include guided onboarding, import, and setup.",
      },
      {
        label: "Scope control",
        value: "Bounded",
        detail: "The rollout stays attached to what ships today rather than a future-state deck.",
      },
    ],
  },
] satisfies MarketedCapabilityNarrative[];

const MARKETED_CAPABILITY_ORDER: Array<MarketedCapabilityNarrative["slug"]> = [
  "compliance",
  "fundraising",
  "accounting",
  "migration",
];

const ORDERED_MARKETED_CAPABILITIES = MARKETED_CAPABILITY_ORDER.map(
  (slug) => MARKETED_CAPABILITIES.find((entry) => entry.slug === slug)!,
);

export function getMarketedCapabilities(): MarketedCapabilityNarrative[] {
  return ORDERED_MARKETED_CAPABILITIES;
}

export function getFeatureHrefForCapabilityItem(item: string): string | undefined {
  return FEATURE_PAGE_BY_CAPABILITY_LOOKUP[item];
}

export function getProductAnchorLinks(): Array<{ label: string; href: string }> {
  return getMarketedCapabilities().map((entry) => ({
    label: entry.navLabel,
    href: `/product/#${entry.slug}`,
  }));
}

export function getProductProofHrefForPricingTier(tierName: PricingTierName): string {
  const matchedSection = MARKETED_CAPABILITIES.find((entry) => entry.pricingTier === tierName);

  if (!matchedSection) {
    throw new Error(`No product proof section configured for pricing tier: ${tierName}`);
  }

  return `/product/#${matchedSection.slug}`;
}

export function getPricingTierBindings(): [
  PricingTierBinding,
  PricingTierBinding,
  PricingTierBinding,
] {
  return [
    {
      plan: "starter",
      proofHref: getProductProofHrefForPricingTier("Starter"),
    },
    {
      plan: "growth",
      proofHref: getProductProofHrefForPricingTier("Growth"),
    },
    {
      plan: "audit_ready",
      proofHref: getProductProofHrefForPricingTier("Audit-Ready"),
    },
  ];
}
