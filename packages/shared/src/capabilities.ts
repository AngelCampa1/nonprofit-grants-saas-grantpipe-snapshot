import type { PlanEntitlements } from "./constants";

export type CapabilityEntitlementKey = {
  [Key in keyof PlanEntitlements]: PlanEntitlements[Key] extends boolean ? Key : never;
}[keyof PlanEntitlements];

export type CapabilityClaimStatus = "shipped" | "limited" | "planned";

export const CAPABILITY_PUBLIC_SURFACES = [
  "product",
  "features",
  "pricing",
  "machine-readable",
  "public-kb",
  "ai-sdr",
] as const;

export type CapabilityPublicSurface = (typeof CAPABILITY_PUBLIC_SURFACES)[number];

export interface CapabilityClaimProofRefs {
  marketingSourcePaths: readonly string[];
  implementationSourcePaths: readonly string[];
  contractTestPaths: readonly string[];
  implementationTestPaths: readonly string[];
}

export interface CapabilityClaim {
  key: string;
  label: string;
  aliases: readonly string[];
  featureSlug: string;
  status: CapabilityClaimStatus;
  entitlementKey?: CapabilityEntitlementKey;
  includedEveryPlan?: true;
  proofRefs: CapabilityClaimProofRefs;
  allowedPublicSurfaces: readonly CapabilityPublicSurface[];
}

const defaultSurfaces = [
  "product",
  "features",
  "pricing",
  "machine-readable",
  "public-kb",
  "ai-sdr",
] as const satisfies readonly CapabilityPublicSurface[];

const featureOnlySurfaces = ["features"] as const satisfies readonly CapabilityPublicSurface[];

function proofRefs(
  featureSlug: string,
  implementationSourcePaths: readonly string[],
  implementationTestPaths: readonly string[],
): CapabilityClaimProofRefs {
  return {
    marketingSourcePaths: [
      "apps/site/src/lib/marketed-capabilities.ts",
      `packages/shared/src/knowledge/marketing/content/features/${featureSlug}.md`,
      "packages/shared/src/pricing.ts",
      "packages/shared/src/constants/index.ts",
    ],
    implementationSourcePaths,
    contractTestPaths: [
      "apps/site/src/lib/marketed-capabilities.test.ts",
      "apps/site/src/feature-landing-pages-contract.test.ts",
      "packages/shared/src/pricing.test.ts",
    ],
    implementationTestPaths,
  };
}

export const CAPABILITY_CLAIMS: readonly CapabilityClaim[] = [
  {
    key: "grant-pipeline-management",
    label: "Grant pipeline management",
    aliases: [
      "Multi-source grant pipeline",
      "Grants.gov opportunity search",
      "Grants",
      "Grant pipeline",
    ],
    featureSlug: "grant-pipeline-management",
    status: "shipped",
    entitlementKey: "hasGrantOpportunitySearch",
    proofRefs: proofRefs(
      "grant-pipeline-management",
      [
        "apps/web/src/routes/_authenticated/grants/pipeline.tsx",
        "packages/shared/src/validators/grants.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/grants/pipeline.test.tsx",
        "packages/shared/src/validators/grants.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "donor-segmentation",
    label: "Donor CRM and segmentation",
    aliases: ["Donor CRM", "Events"],
    featureSlug: "donor-segmentation",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "donor-segmentation",
      [
        "apps/web/src/routes/_authenticated/donors/index.tsx",
        "packages/shared/src/validators/donors.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/donors/index.test.tsx",
        "packages/shared/src/validators/donors.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "outbound-donor-email-mail-merge",
    label: "Outbound donor email",
    aliases: ["Donor email"],
    featureSlug: "outbound-donor-email-mail-merge",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "outbound-donor-email-mail-merge",
      [
        "apps/web/src/routes/_authenticated/donors/email.tsx",
        "apps/api/src/domains/leads/emails.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/donors/email.test.tsx",
        "apps/api/src/domains/leads/emails.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "donor-retention-reporting",
    label: "Donor pipeline and retention reporting",
    aliases: ["Donor pipeline"],
    featureSlug: "donor-retention-reporting",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "donor-retention-reporting",
      [
        "apps/web/src/routes/_authenticated/donors/at-risk.tsx",
        "apps/web/src/hooks/use-at-risk-donors.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/donors/at-risk.test.tsx",
        "apps/web/src/hooks/use-at-risk-donors.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "funder-reporting-templates",
    label: "Funder reporting templates",
    aliases: ["Funders", "Document-backed report workflow"],
    featureSlug: "funder-reporting-templates",
    status: "shipped",
    entitlementKey: "hasComplianceReportPack",
    proofRefs: proofRefs(
      "funder-reporting-templates",
      [
        "apps/web/src/routes/_authenticated/reports/index.tsx",
        "packages/shared/src/validators/compliance.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/reports/index.test.tsx",
        "packages/shared/src/validators/compliance.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "grant-calendar-deadline-alerts",
    label: "Grant calendar and deadline alerts",
    aliases: ["Calendar", "Deadline reminders", "Notifications"],
    featureSlug: "grant-calendar-deadline-alerts",
    status: "shipped",
    entitlementKey: "hasAutomationEmails",
    proofRefs: proofRefs(
      "grant-calendar-deadline-alerts",
      [
        "apps/web/src/routes/_authenticated/calendar.tsx",
        "apps/web/src/hooks/use-notifications.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/calendar.test.tsx",
        "apps/web/src/hooks/use-notifications.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "restricted-fund-tracking",
    label: "Restricted fund tracking",
    aliases: ["Funds", "Chart of accounts"],
    featureSlug: "restricted-fund-tracking",
    status: "shipped",
    entitlementKey: "hasRestrictionLifecycle",
    proofRefs: proofRefs(
      "restricted-fund-tracking",
      ["apps/web/src/hooks/use-restrictions.ts", "packages/db/src/schema/restrictions.ts"],
      [
        "apps/web/src/hooks/use-restrictions.test.tsx",
        "packages/db/src/schema/restrictions.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "grant-budget-sentinel",
    label: "Grant Budget Sentinel",
    aliases: ["Grant Budget Sentinel"],
    featureSlug: "grant-budget-sentinel",
    status: "shipped",
    entitlementKey: "hasGrantBudgetAlerts",
    proofRefs: proofRefs(
      "grant-budget-sentinel",
      [
        "apps/web/src/routes/_authenticated/grants/sentinel.tsx",
        "packages/shared/src/validators/budget-sentinel.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/grants/sentinel.test.tsx",
        "packages/shared/src/validators/budget-sentinel.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "grant-drawdowns-reimbursements",
    label: "Grant drawdowns and reimbursements",
    aliases: ["Spend-down tracking", "Bank accounts"],
    featureSlug: "grant-drawdowns-reimbursements",
    status: "shipped",
    entitlementKey: "hasPaymentRequests",
    proofRefs: proofRefs(
      "grant-drawdowns-reimbursements",
      [
        "apps/web/src/routes/_authenticated/accounting/bank/index.tsx",
        "packages/shared/src/validators/grant-budgets.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/accounting/bank/index.test.tsx",
        "packages/shared/src/validators/grant-budgets.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "audit-trail-activity-log",
    label: "Audit trail activity log",
    aliases: ["Activity log", "View and download audit trail", "Journal", "Ledger"],
    featureSlug: "audit-trail-activity-log",
    status: "shipped",
    entitlementKey: "hasComplianceReportPack",
    proofRefs: proofRefs(
      "audit-trail-activity-log",
      ["apps/api/src/lib/activity-log.ts", "apps/api/src/domains/activity/service.ts"],
      ["apps/api/src/lib/activity-log.test.ts", "apps/api/src/domains/activity/service.test.ts"],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "ai-award-document-intake",
    label: "AI Award Document Intake",
    aliases: ["Award Document Intake"],
    featureSlug: "ai-award-document-intake",
    status: "shipped",
    entitlementKey: "hasAwardDocumentIntake",
    proofRefs: proofRefs(
      "ai-award-document-intake",
      [
        "apps/web/src/components/document-extractions/award-intake-entry.tsx",
        "packages/shared/src/validators/federal-awards.ts",
      ],
      [
        "apps/web/src/components/document-extractions/award-intake-entry.test.tsx",
        "packages/shared/src/validators/federal-awards.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "ask-your-ledger",
    label: "Ask-Your-Ledger grounded reporting",
    aliases: ["Ask-Your-Ledger grounded reporting"],
    featureSlug: "ask-your-ledger",
    status: "shipped",
    entitlementKey: "hasAskYourLedger",
    proofRefs: proofRefs(
      "ask-your-ledger",
      [
        "apps/web/src/hooks/use-ask-ledger.ts",
        "packages/shared/src/validators/ledger-assistant.ts",
      ],
      [
        "apps/web/src/hooks/use-ask-ledger.test.tsx",
        "packages/shared/src/validators/ledger-assistant.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "outcome-impact-measurement-layer",
    label: "Outcome and impact measurement",
    aliases: ["Outcome and impact measurement"],
    featureSlug: "outcome-impact-measurement-layer",
    status: "shipped",
    entitlementKey: "hasOutcomeImpactMeasurement",
    proofRefs: proofRefs(
      "outcome-impact-measurement-layer",
      ["apps/web/src/hooks/use-outcomes.ts", "packages/db/src/schema/outcomes.ts"],
      ["apps/web/src/hooks/use-outcomes.test.ts", "packages/db/src/schema/outcomes.test.ts"],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "proposal-report-drafting-assistant",
    label: "Proposal and report drafting assistant",
    aliases: ["Proposal and report drafting"],
    featureSlug: "proposal-report-drafting-assistant",
    status: "shipped",
    entitlementKey: "hasProposalReportDrafting",
    proofRefs: proofRefs(
      "proposal-report-drafting-assistant",
      [
        "apps/web/src/routes/_authenticated/reports/drafts.tsx",
        "apps/web/src/hooks/use-reports.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/reports/drafts.test.tsx",
        "apps/web/src/hooks/use-reports.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "board-packet-composer",
    label: "Board Packet Composer",
    aliases: ["Board Packet Composer"],
    featureSlug: "board-packet-composer",
    status: "shipped",
    entitlementKey: "hasComplianceReportPack",
    proofRefs: proofRefs(
      "board-packet-composer",
      [
        "apps/web/src/routes/_authenticated/reports/builder.tsx",
        "apps/web/src/routes/_authenticated/reports/index.tsx",
      ],
      [
        "apps/web/src/routes/_authenticated/reports/builder.test.tsx",
        "apps/web/src/routes/_authenticated/reports/index.test.tsx",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "audit-readiness-score-binder-starter",
    label: "Audit readiness score and binder starter",
    aliases: ["Audit readiness score and binder starter"],
    featureSlug: "audit-readiness-score-binder-starter",
    status: "shipped",
    entitlementKey: "hasAuditorFunderPortal",
    proofRefs: proofRefs(
      "audit-readiness-score-binder-starter",
      [
        "apps/web/src/routes/_authenticated/grants/sentinel.tsx",
        "packages/shared/src/validators/budget-sentinel.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/grants/sentinel.test.tsx",
        "packages/shared/src/validators/budget-sentinel.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "acknowledgment-year-end-statement-run",
    label: "Acknowledgment and year-end statement run",
    aliases: [
      "Year-End Statement Run",
      "Compliance, audit, 990, board, year-end, and acknowledgment outputs",
    ],
    featureSlug: "acknowledgment-year-end-statement-run",
    status: "shipped",
    entitlementKey: "hasComplianceReportPack",
    proofRefs: proofRefs(
      "acknowledgment-year-end-statement-run",
      [
        "apps/web/src/routes/_authenticated/reports/index.tsx",
        "apps/api/src/domains/compliance/templates/report-template.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/reports/index.test.tsx",
        "apps/api/src/domains/compliance/templates/report-template.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "auditor-funder-portal",
    label: "Auditor and funder portal",
    aliases: ["Evidence bundles", "Auditor & Funder Portal", "Evidence bundle export"],
    featureSlug: "auditor-funder-portal",
    status: "shipped",
    entitlementKey: "hasAuditorFunderPortal",
    proofRefs: proofRefs(
      "auditor-funder-portal",
      ["apps/web/src/routes/portal.tsx", "apps/api/src/middleware/portal-reviewer.ts"],
      ["apps/web/src/routes/portal.test.tsx", "apps/api/src/middleware/portal-reviewer.test.ts"],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "board-member-portal",
    label: "Board member portal",
    aliases: ["Board member portal"],
    featureSlug: "board-member-portal",
    status: "shipped",
    entitlementKey: "hasAuditorFunderPortal",
    proofRefs: proofRefs(
      "board-member-portal",
      ["apps/web/src/routes/portal/home.tsx", "apps/web/src/routes/portal.tsx"],
      ["apps/web/src/routes/portal/home.test.tsx", "apps/web/src/routes/portal.test.tsx"],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "role-based-permissions",
    label: "Role-based permissions",
    aliases: ["Reviewer access control", "Scoped reviewer access", "Plan-fit onboarding"],
    featureSlug: "role-based-permissions",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "role-based-permissions",
      [
        "apps/api/src/middleware/require-role.ts",
        "apps/web/src/routes/_authenticated/settings.portal-access.tsx",
      ],
      [
        "apps/api/src/middleware/require-role.test.ts",
        "apps/web/src/routes/_authenticated/settings.portal-access.test.tsx",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "reimbursement-cash-flow-radar",
    label: "Reimbursement Cash-Flow Radar",
    aliases: ["Reimbursement Cash-Flow Radar"],
    featureSlug: "reimbursement-cash-flow-radar",
    status: "shipped",
    entitlementKey: "hasPaymentRequests",
    proofRefs: proofRefs(
      "reimbursement-cash-flow-radar",
      [
        "apps/web/src/routes/_authenticated/accounting/bank/index.tsx",
        "apps/api/src/domains/accounting/bankService.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/accounting/bank/index.test.tsx",
        "apps/api/src/domains/accounting/bankService.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "pledge-multi-year-commitment-tracker",
    label: "Pledge and multi-year commitment tracker",
    aliases: ["Pledge Tracker"],
    featureSlug: "pledge-multi-year-commitment-tracker",
    status: "shipped",
    entitlementKey: "hasPledgeTracker",
    proofRefs: proofRefs(
      "pledge-multi-year-commitment-tracker",
      [
        "apps/web/src/routes/_authenticated/donors/pledges.tsx",
        "packages/shared/src/validators/pledge-tracker.ts",
      ],
      [
        "apps/web/src/routes/_authenticated/donors/pledges.test.tsx",
        "packages/shared/src/validators/pledge-tracker.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "payroll-allocation",
    label: "Program allocation",
    aliases: ["Program Allocation", "Program budget vs actual", "Recurring entries"],
    featureSlug: "payroll-allocation",
    status: "shipped",
    entitlementKey: "canManageProgramAllocations",
    proofRefs: proofRefs(
      "payroll-allocation",
      [
        "apps/web/src/hooks/use-allocation.ts",
        "packages/shared/src/validators/allocation-studio.ts",
      ],
      [
        "apps/web/src/hooks/use-allocation.test.ts",
        "packages/shared/src/validators/allocation-studio.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "multi-entity-consolidation",
    label: "Multi-entity consolidation",
    aliases: [
      "Trial balance",
      "Fiscal periods",
      "Financial position, activities, and functional expenses",
    ],
    featureSlug: "multi-entity-consolidation",
    status: "planned",
    entitlementKey: "hasMultiEntityConsolidation",
    proofRefs: proofRefs(
      "multi-entity-consolidation",
      ["packages/db/src/migrations/0072_multi_entity_foundation.sql"],
      ["packages/db/src/migrations.test.ts"],
    ),
    allowedPublicSurfaces: featureOnlySurfaces,
  },
  {
    key: "cross-entity-report-builder",
    label: "Cross-entity report builder",
    aliases: ["Report builder", "Custom report builder", "Saved report builder"],
    featureSlug: "cross-entity-report-builder",
    status: "shipped",
    entitlementKey: "hasCrossEntityReportBuilder",
    proofRefs: proofRefs(
      "cross-entity-report-builder",
      [
        "apps/api/src/domains/report-builder/routes.ts",
        "apps/web/src/routes/_authenticated/reports/builder.tsx",
      ],
      [
        "apps/api/src/domains/report-builder/routes.test.ts",
        "apps/web/src/routes/_authenticated/reports/builder.test.tsx",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "data-migration-onboarding-studio",
    label: "Self-serve data migration studio",
    aliases: ["Onboarding", "Setup path", "Import preview", "Plan-fit setup"],
    featureSlug: "data-migration-onboarding-studio",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "data-migration-onboarding-studio",
      [
        "packages/shared/src/migration-studio.ts",
        "apps/web/src/routes/_authenticated/onboarding.tsx",
      ],
      [
        "packages/shared/src/migration-studio.test.ts",
        "apps/web/src/routes/_authenticated/onboarding.test.tsx",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "guided-import-onboarding",
    label: "Guided onboarding, import, and setup",
    aliases: ["Guided import"],
    featureSlug: "guided-onboarding-import-setup",
    status: "shipped",
    entitlementKey: "hasGuidedOnboarding",
    proofRefs: proofRefs(
      "guided-onboarding-import-setup",
      [
        "packages/shared/src/migration-studio.ts",
        "apps/web/src/routes/_authenticated/onboarding.tsx",
      ],
      [
        "packages/shared/src/migration-studio.test.ts",
        "apps/web/src/routes/_authenticated/onboarding.test.tsx",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
  {
    key: "custom-fields",
    label: "Custom fields",
    aliases: ["Bounded rollout path"],
    featureSlug: "custom-fields",
    status: "shipped",
    includedEveryPlan: true,
    proofRefs: proofRefs(
      "custom-fields",
      [
        "apps/web/src/components/entity-custom-fields-section.tsx",
        "apps/web/src/hooks/use-custom-fields.ts",
      ],
      [
        "apps/web/src/components/entity-custom-fields-section.test.tsx",
        "apps/web/src/hooks/use-custom-fields.test.ts",
      ],
    ),
    allowedPublicSurfaces: defaultSurfaces,
  },
] as const;

function normalizeClaimLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

const capabilityClaimsByAlias = new Map<string, CapabilityClaim>(
  CAPABILITY_CLAIMS.flatMap((claim) =>
    claim.aliases.map((alias) => [normalizeClaimLookupValue(alias), claim]),
  ),
);

const capabilityClaimsByFeatureSlug = new Map<string, CapabilityClaim>(
  CAPABILITY_CLAIMS.map((claim) => [claim.featureSlug, claim]),
);

export function findCapabilityClaimByAlias(alias: string): CapabilityClaim | undefined {
  return capabilityClaimsByAlias.get(normalizeClaimLookupValue(alias));
}

export function getCapabilityClaimByFeatureSlug(featureSlug: string): CapabilityClaim | undefined {
  return capabilityClaimsByFeatureSlug.get(featureSlug);
}
