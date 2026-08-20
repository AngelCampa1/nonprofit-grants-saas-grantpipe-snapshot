export const DONOR_PIPELINE_STAGES = [
  "prospect",
  "cultivation",
  "solicitation",
  "stewardship",
  "donor",
  "lapsed",
] as const;
export type DonorPipelineStage = (typeof DONOR_PIPELINE_STAGES)[number];

export const DONOR_PIPELINE_STAGE_LABELS: Record<DonorPipelineStage, string> = {
  prospect: "Prospect",
  cultivation: "Cultivation",
  solicitation: "Solicitation",
  stewardship: "Stewardship",
  donor: "Donor",
  lapsed: "Lapsed",
};

export const GRANT_STATUSES = [
  "discovery",
  "application",
  "submitted",
  "awarded",
  "active",
  "reporting",
  "closeout",
  "renewal",
  "declined",
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/**
 * Statuses that represent in-flight grant work — either in the pipeline or actively managed.
 * "closeout" and "declined" are terminal and are excluded.
 */
export const GRANT_ACTIVE_STATUSES = [
  "discovery",
  "application",
  "submitted",
  "awarded",
  "active",
  "reporting",
  "renewal",
] as const satisfies ReadonlyArray<GrantStatus>;
export type ActiveGrantStatus = (typeof GRANT_ACTIVE_STATUSES)[number];

export function isActiveGrantStatus(status: string): status is ActiveGrantStatus {
  return (GRANT_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export const GRANT_BILLING_CAP_STATUSES = [
  "awarded",
  "active",
  "reporting",
  "renewal",
] as const satisfies ReadonlyArray<GrantStatus>;
export type BillingCapGrantStatus = (typeof GRANT_BILLING_CAP_STATUSES)[number];

export function isBillingCapGrantStatus(status: string): status is BillingCapGrantStatus {
  return (GRANT_BILLING_CAP_STATUSES as readonly string[]).includes(status);
}

export const DONATION_TYPES = ["one_time", "recurring", "pledge"] as const;
export type DonationType = (typeof DONATION_TYPES)[number];

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  one_time: "One-time",
  recurring: "Recurring",
  pledge: "Pledge",
};

export const RESTRICTION_TYPES = ["unrestricted", "restricted"] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export const RESTRICTION_TYPE_LABELS: Record<RestrictionType, string> = {
  unrestricted: "Unrestricted",
  restricted: "Restricted",
};

export const FUND_TYPES = [
  "temporarily_restricted",
  "permanently_restricted",
  "unrestricted",
] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  temporarily_restricted: "Temporarily restricted",
  permanently_restricted: "Permanently restricted",
  unrestricted: "Unrestricted",
};

export const FUND_STATUSES = ["active", "archived"] as const;
export type FundStatus = (typeof FUND_STATUSES)[number];

export const FUND_STATUS_LABELS: Record<FundStatus, string> = {
  active: "Active",
  archived: "Archived",
};

export const FUNDER_TYPES = ["foundation", "corporate", "government", "other"] as const;
export type FunderType = (typeof FUNDER_TYPES)[number];

export const FUNDER_TYPE_LABELS: Record<FunderType, string> = {
  foundation: "Foundation",
  corporate: "Corporate",
  government: "Government",
  other: "Other",
};

export const GRANT_SOURCE_TYPES = [
  "federal",
  "state_local",
  "private_foundation",
  "community_foundation",
  "corporate",
  "association",
  "other",
] as const;
export type GrantSourceType = (typeof GRANT_SOURCE_TYPES)[number];

export const GRANT_SOURCE_TYPE_LABELS: Record<GrantSourceType, string> = {
  federal: "Federal",
  state_local: "State/local",
  private_foundation: "Private foundation",
  community_foundation: "Community foundation",
  corporate: "Corporate",
  association: "Association",
  other: "Other",
};

export const GRANT_SOURCE_TYPE_DESCRIPTIONS: Record<GrantSourceType, string> = {
  federal: "Federal opportunities imported from Grants.gov search.",
  state_local: "State, county, city, and other local government opportunities.",
  private_foundation: "Track private foundation opportunities from public or funder sources.",
  community_foundation: "Community foundation opportunities and local grant cycles.",
  corporate: "Corporate giving, sponsorship, and community grant opportunities.",
  association: "Association, membership, or intermediary grant opportunities.",
  other: "Other manually tracked grant opportunity sources.",
};

export function formatGrantSourceTypeLabel(sourceType: GrantSourceType): string {
  return GRANT_SOURCE_TYPE_LABELS[sourceType];
}

export function formatGrantSourceTypeDescription(sourceType: GrantSourceType): string {
  return GRANT_SOURCE_TYPE_DESCRIPTIONS[sourceType];
}

export const GRANT_OPPORTUNITY_DEADLINE_SOURCES = [
  "grants_gov",
  "funder_website",
  "import",
  "manual",
  "unknown",
] as const;
export type GrantOpportunityDeadlineSource = (typeof GRANT_OPPORTUNITY_DEADLINE_SOURCES)[number];

export const CONTACT_TYPES = ["individual", "organization"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const REPORT_TYPES = ["quarterly", "annual", "final", "custom"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  quarterly: "Quarterly",
  annual: "Annual",
  final: "Final",
  custom: "Custom",
};

export const REPORT_STATUSES = ["upcoming", "in_progress", "submitted", "overdue"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  submitted: "Submitted",
  overdue: "Overdue",
};

export const GENERATED_REPORT_TYPES = [
  "compliance",
  "audit",
  "irs_990",
  "board",
  "acknowledgment",
  "donor_year_end_statement",
  "spend_down",
  "sefa",
  "restricted_rollforward",
  "grant_budget_actuals",
  "custom_report",
] as const;
export type GeneratedReportType = (typeof GENERATED_REPORT_TYPES)[number];

export const GENERATED_REPORT_FORMATS = ["pdf", "csv_bundle"] as const;
export type GeneratedReportFormat = (typeof GENERATED_REPORT_FORMATS)[number];

export const GENERATED_REPORT_ARTIFACT_STATUSES = ["pending", "ready", "failed"] as const;
export type GeneratedReportArtifactStatus = (typeof GENERATED_REPORT_ARTIFACT_STATUSES)[number];

export const EVENT_TYPES = ["gala", "fundraiser", "campaign", "meeting", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  gala: "Gala",
  fundraiser: "Fundraiser",
  campaign: "Campaign",
  meeting: "Meeting",
  other: "Other",
};

export const RSVP_STATUSES = ["invited", "confirmed", "attended", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const COMMUNICATION_TYPES = ["note", "email", "call", "meeting"] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

export const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
};

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "single_select",
  "multi_select",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  single_select: "Single select",
  multi_select: "Multi select",
};

export const CUSTOM_FIELD_ENTITY_TYPES = ["contact", "donation", "grant"] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_ENTITY_TYPE_LABELS: Record<CustomFieldEntityType, string> = {
  contact: "Contact",
  donation: "Donation",
  grant: "Grant",
};

export const DOCUMENT_ENTITY_TYPES = [
  "contact",
  "donation",
  "grant",
  "funder",
  "fund",
  "event",
  "generated_report",
  "payment_request",
  "award_intake",
  "subrecipient",
  "subaward",
  "subrecipient_monitoring_task",
  "subrecipient_finding",
  "subrecipient_corrective_action",
] as const;
export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export const ACTIVITY_ENTITY_TYPES = [
  "contact",
  "donation",
  "tag",
  "segment",
  "communication",
  "grant",
  "grant_opportunity",
  "fund",
  "entity",
  "entity_member",
  "funder",
  "funder_contact",
  "saved_segment",
  "communication_log",
  "allocation",
  "program",
  "program_budget",
  "program_allocation",
  "expense",
  "impact_metric",
  "impact_metric_entry",
  "reporting_requirement",
  "closeout_item",
  "event",
  "attendee",
  "volunteer_hour",
  "generated_report",
  "document",
  "custom_field_definition",
  "custom_field",
  "custom_field_value",
  "notification",
  "import_history",
  "acknowledgment_template",
  "feedback",
  "account",
  "fiscal_period",
  "journal_entry",
  "bank_reconciliation",
  "organization",
  "invite_link",
  "org_member",
  "restriction_term",
  "restriction_addition",
  "restriction_release",
  "restriction_evidence_link",
  "restriction_rollforward",
  "external_reviewer",
  "external_review_session",
  "evidence_bundle",
  "evidence_bundle_item",
  "payment_request",
  "payment_request_line",
  "payment_request_adjustment",
  "payment",
  "indirect_cost_rule",
  "document_extraction",
  "grant_budget_version",
  "grant_budget_period",
  "grant_budget_line",
  "grant_budget_allocation",
  "planned_expense",
  "grant_budget_amendment",
  "accounting_integration",
  "accounting_sync_run",
  "accounting_sync_event",
  "accounting_dimension_mapping",
  "accounting_sync_conflict",
  "subrecipient",
  "subaward",
  "subrecipient_risk_assessment",
  "subrecipient_monitoring_task",
  "subrecipient_monitoring_log",
  "subrecipient_finding",
  "subrecipient_corrective_action",
  "pledge",
  "outcome_goal",
  "outcome_indicator",
] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export const SUBRECIPIENT_STATUSES = ["active", "inactive", "watchlist"] as const;
export type SubrecipientStatus = (typeof SUBRECIPIENT_STATUSES)[number];

export const SUBAWARD_STATUSES = ["draft", "active", "closed", "suspended"] as const;
export type SubawardStatus = (typeof SUBAWARD_STATUSES)[number];

export const SUBRECIPIENT_RISK_RATINGS = ["low", "medium", "high"] as const;
export type SubrecipientRiskRating = (typeof SUBRECIPIENT_RISK_RATINGS)[number];

export const SUBRECIPIENT_RISK_CHECKLIST_ANSWERS = ["yes", "no", "unknown"] as const;
export type SubrecipientRiskChecklistAnswer = (typeof SUBRECIPIENT_RISK_CHECKLIST_ANSWERS)[number];

export const SUBRECIPIENT_MONITORING_TASK_STATUSES = [
  "open",
  "in_progress",
  "completed",
  "waived",
] as const;
export type SubrecipientMonitoringTaskStatus =
  (typeof SUBRECIPIENT_MONITORING_TASK_STATUSES)[number];

export const SUBRECIPIENT_MONITORING_LOG_TYPES = [
  "desk_review",
  "site_visit",
  "financial_review",
  "performance_review",
  "correspondence",
  "other",
] as const;
export type SubrecipientMonitoringLogType = (typeof SUBRECIPIENT_MONITORING_LOG_TYPES)[number];

export const SUBRECIPIENT_FINDING_SEVERITIES = ["low", "medium", "high", "material"] as const;
export type SubrecipientFindingSeverity = (typeof SUBRECIPIENT_FINDING_SEVERITIES)[number];

export const SUBRECIPIENT_FINDING_STATUSES = [
  "open",
  "in_review",
  "resolved",
  "accepted_risk",
] as const;
export type SubrecipientFindingStatus = (typeof SUBRECIPIENT_FINDING_STATUSES)[number];

export const SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES = [
  "open",
  "in_progress",
  "completed",
  "overdue",
] as const;
export type SubrecipientCorrectiveActionStatus =
  (typeof SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES)[number];

export const PAYMENT_REQUEST_TYPES = [
  "drawdown",
  "reimbursement",
  "invoice",
  "advance_liquidation",
  "other",
] as const;
export type PaymentRequestType = (typeof PAYMENT_REQUEST_TYPES)[number];
export const PAYMENT_REQUEST_TYPE_LABELS: Record<PaymentRequestType, string> = {
  drawdown: "Drawdown",
  reimbursement: "Reimbursement",
  invoice: "Invoice",
  advance_liquidation: "Advance Liquidation",
  other: "Other",
};

export const PAYMENT_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "partially_approved",
  "approved",
  "rejected",
  "paid",
  "closed",
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];
export const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  partially_approved: "Partially Approved",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  closed: "Closed",
};

export const PAYMENT_REQUEST_LINE_CATEGORIES = [
  "direct",
  "indirect",
  "adjustment",
  "other",
] as const;
export type PaymentRequestLineCategory = (typeof PAYMENT_REQUEST_LINE_CATEGORIES)[number];

export const PAYMENT_METHODS = ["ach", "wire", "check", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ach: "ACH",
  wire: "Wire",
  check: "Check",
  card: "Card",
  other: "Other",
};

export const INDIRECT_COST_BASES = [
  "direct_costs",
  "salaries_only",
  "modified_total_direct",
] as const;
export type IndirectCostBase = (typeof INDIRECT_COST_BASES)[number];
export const INDIRECT_COST_BASE_LABELS: Record<IndirectCostBase, string> = {
  direct_costs: "Total direct costs",
  salaries_only: "Salaries & wages only",
  modified_total_direct: "Modified total direct cost (MTDC)",
};

export const ADJUSTMENT_KINDS = ["reduction", "increase", "note", "dedup_override"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export const ADJUSTMENT_KIND_LABELS: Record<AdjustmentKind, string> = {
  reduction: "Reduction",
  increase: "Increase",
  note: "Note",
  dedup_override: "Dedup override",
};

export const RESTRICTION_LIFECYCLE_TYPES = [
  "purpose",
  "time",
  "purpose_and_time",
  "board_designated",
  "unrestricted",
] as const;
export type RestrictionLifecycleType = (typeof RESTRICTION_LIFECYCLE_TYPES)[number];
export const RESTRICTION_LIFECYCLE_TYPE_LABELS: Record<RestrictionLifecycleType, string> = {
  purpose: "Purpose",
  time: "Time",
  purpose_and_time: "Purpose and time",
  board_designated: "Board-designated",
  unrestricted: "Unrestricted",
};

export const RESTRICTION_SOURCES = ["donor", "funder", "board", "internal", "other"] as const;
export type RestrictionSource = (typeof RESTRICTION_SOURCES)[number];

export const RESTRICTION_EVIDENCE_TYPES = [
  "award_letter",
  "grant_agreement",
  "invoice",
  "receipt",
  "journal_entry",
  "board_minutes",
  "report",
  "other",
] as const;
export type RestrictionEvidenceType = (typeof RESTRICTION_EVIDENCE_TYPES)[number];

export const RESTRICTION_ALERT_TYPES = [
  "missing_evidence",
  "expired_time_restriction",
  "release_without_support",
  "release_term_conflict",
  "expense_term_conflict",
  "negative_restricted_balance",
] as const;
export type RestrictionAlertType = (typeof RESTRICTION_ALERT_TYPES)[number];

export const GRANT_BUDGET_VERSION_STATUSES = ["draft", "approved", "superseded"] as const;
export type GrantBudgetVersionStatus = (typeof GRANT_BUDGET_VERSION_STATUSES)[number];

export const GRANT_BUDGET_VERSION_SOURCES = ["manual", "document_intake", "amendment"] as const;
export type GrantBudgetVersionSource = (typeof GRANT_BUDGET_VERSION_SOURCES)[number];

export const GRANT_BUDGET_LINE_COST_TYPES = ["direct", "indirect"] as const;
export type GrantBudgetLineCostType = (typeof GRANT_BUDGET_LINE_COST_TYPES)[number];

export const PLANNED_EXPENSE_STATUSES = ["planned", "committed", "cancelled", "converted"] as const;
export type PlannedExpenseStatus = (typeof PLANNED_EXPENSE_STATUSES)[number];

export const GRANT_BUDGET_ALERT_TYPES = [
  "over_budget",
  "underspend",
  "unallowable_category",
  "upcoming_period_deadline",
] as const;
export type GrantBudgetAlertType = (typeof GRANT_BUDGET_ALERT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "grant_deadline",
  "reporting_deadline",
  "closeout_deadline",
  "spend_down_threshold",
  "report_due",
  "import_complete",
  "document_uploaded",
  "activity_digest",
  "donor_lapse_alert",
  "grant_overspend_alert",
  "fund_underspend_alert",
  "accounting_anomaly",
  "pledge_installment_due",
  "trial_lifecycle",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const IMPORT_ENTITY_TYPES = [
  "contacts",
  "donations",
  "grants",
  "grant_opportunities",
  "funds",
  "opening_balances",
  "pledges",
] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const IMPORT_HISTORY_STATUSES = [
  "previewed",
  "completed",
  "completed_with_duplicates",
  "failed",
] as const;
export type ImportHistoryStatus = (typeof IMPORT_HISTORY_STATUSES)[number];

export const PLAN_TIERS = ["starter", "growth", "audit_ready", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  audit_ready: "Audit-Ready",
  enterprise: "Enterprise",
};

export type PlanEntitlements = {
  activeGrantCap: number;
  hasAutomationEmails: boolean;
  hasComplianceReportPack: boolean;
  hasGuidedOnboarding: boolean;
  hasGrantOpportunitySearch: boolean;
  canViewProgramContext: boolean;
  canManagePrograms: boolean;
  canManageProgramAllocations: boolean;
  canExportProgramReports: boolean;
  hasRestrictionLifecycle: boolean;
  hasRestrictionEvidencePackage: boolean;
  hasAuditorFunderPortal: boolean;
  hasPaymentRequests: boolean;
  hasIndirectCostRules: boolean;
  hasPaymentEvidencePackage: boolean;
  hasAwardDocumentIntake: boolean;
  hasGrantBudgetBasics: boolean;
  hasGrantBudgetAlerts: boolean;
  hasGrantBudgetExports: boolean;
  hasPlannedExpenses: boolean;
  hasGrantBudgetAiExtraction: boolean;
  hasGrantBudgetAmendments: boolean;
  hasGrantBudgetAuditViews: boolean;
  hasAccountingIntegrations: boolean;
  hasSubrecipientMonitoring: boolean;
  hasAccountingAnomalyDetector: boolean;
  hasMultiEntityConsolidation: boolean;
  hasPledgeTracker: boolean;
  hasFunctionalExpenseAllocation: boolean;
  hasCrossEntityReportBuilder: boolean;
  hasAskYourLedger: boolean;
  hasOutcomeImpactMeasurement: boolean;
  hasProposalReportDrafting: boolean;
  awardIntakeMonthlyCap: number;
  askYourLedgerMonthlyCap: number;
};

export const PLAN_ENTITLEMENT_LABELS: Record<keyof PlanEntitlements, string> = {
  activeGrantCap: "Active grants cap",
  hasAutomationEmails: "Automated reminder and spend-down emails",
  hasComplianceReportPack: "Compliance report pack",
  hasGuidedOnboarding: "Guided onboarding, import, and setup",
  hasGrantOpportunitySearch: "Grants.gov search plus non-federal opportunity tracking",
  canViewProgramContext: "Program allocation visibility",
  canManagePrograms: "Manage programs",
  canManageProgramAllocations: "Manage program allocations",
  canExportProgramReports: "Program budget-vs-actual exports",
  hasRestrictionLifecycle: "Restriction lifecycle (terms, additions, releases)",
  hasRestrictionEvidencePackage: "Restriction evidence package output",
  hasAuditorFunderPortal: "Auditor & Funder Portal",
  hasPaymentRequests: "Drawdowns and reimbursement requests",
  hasIndirectCostRules: "Indirect cost rate rules",
  hasPaymentEvidencePackage: "Reimbursement evidence packets",
  hasAwardDocumentIntake: "AI Award Document Intake",
  hasGrantBudgetBasics: "Grant budget lines and budget-vs-actual views",
  hasGrantBudgetAlerts: "Grant budget alerts",
  hasGrantBudgetExports: "Grant budget exports (PDF/CSV/JSON)",
  hasPlannedExpenses: "Planned expenses",
  hasGrantBudgetAiExtraction: "AI grant budget extraction",
  hasGrantBudgetAmendments: "Grant budget amendment history",
  hasGrantBudgetAuditViews: "Grant budget audit views",
  hasAccountingIntegrations: "External accounting integrations",
  hasSubrecipientMonitoring: "Subrecipient monitoring",
  hasAccountingAnomalyDetector: "Anomaly and misallocation detector",
  hasMultiEntityConsolidation: "Multi-entity consolidation",
  hasPledgeTracker: "Pledge & multi-year commitment tracker",
  hasFunctionalExpenseAllocation: "Functional expense allocation studio",
  hasCrossEntityReportBuilder: "Cross-entity report builder",
  hasAskYourLedger: "Ask-Your-Ledger grounded reporting",
  hasOutcomeImpactMeasurement: "Outcome and impact measurement",
  hasProposalReportDrafting: "Proposal and report drafting assistant",
  awardIntakeMonthlyCap: "AI Award Document Intake (per month)",
  askYourLedgerMonthlyCap: "Ask-Your-Ledger questions (per month)",
};

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  starter: {
    activeGrantCap: 10,
    hasAutomationEmails: true,
    hasComplianceReportPack: false,
    hasGuidedOnboarding: false,
    hasGrantOpportunitySearch: true,
    canViewProgramContext: true,
    canManagePrograms: true,
    canManageProgramAllocations: true,
    canExportProgramReports: false,
    hasRestrictionLifecycle: true,
    hasRestrictionEvidencePackage: false,
    hasAuditorFunderPortal: false,
    hasPaymentRequests: false,
    hasIndirectCostRules: false,
    hasPaymentEvidencePackage: false,
    hasAwardDocumentIntake: true,
    hasGrantBudgetBasics: true,
    hasGrantBudgetAlerts: true,
    hasGrantBudgetExports: true,
    hasPlannedExpenses: false,
    hasGrantBudgetAiExtraction: false,
    hasGrantBudgetAmendments: false,
    hasGrantBudgetAuditViews: false,
    hasAccountingIntegrations: false,
    hasSubrecipientMonitoring: false,
    hasAccountingAnomalyDetector: false,
    hasMultiEntityConsolidation: false,
    hasPledgeTracker: false,
    hasFunctionalExpenseAllocation: false,
    hasCrossEntityReportBuilder: false,
    hasAskYourLedger: false,
    hasOutcomeImpactMeasurement: false,
    hasProposalReportDrafting: false,
    awardIntakeMonthlyCap: 5,
    askYourLedgerMonthlyCap: 0,
  },
  growth: {
    activeGrantCap: 50,
    hasAutomationEmails: true,
    hasComplianceReportPack: true,
    hasGuidedOnboarding: false,
    hasGrantOpportunitySearch: true,
    canViewProgramContext: true,
    canManagePrograms: true,
    canManageProgramAllocations: true,
    canExportProgramReports: true,
    hasRestrictionLifecycle: true,
    hasRestrictionEvidencePackage: false,
    hasAuditorFunderPortal: false,
    hasPaymentRequests: true,
    hasIndirectCostRules: true,
    hasPaymentEvidencePackage: true,
    hasAwardDocumentIntake: true,
    hasGrantBudgetBasics: true,
    hasGrantBudgetAlerts: true,
    hasGrantBudgetExports: true,
    hasPlannedExpenses: true,
    hasGrantBudgetAiExtraction: true,
    hasGrantBudgetAmendments: false,
    hasGrantBudgetAuditViews: false,
    hasAccountingIntegrations: false,
    hasSubrecipientMonitoring: false,
    hasAccountingAnomalyDetector: false,
    hasMultiEntityConsolidation: false,
    hasPledgeTracker: true,
    hasFunctionalExpenseAllocation: true,
    hasCrossEntityReportBuilder: false,
    hasAskYourLedger: true,
    hasOutcomeImpactMeasurement: true,
    hasProposalReportDrafting: true,
    awardIntakeMonthlyCap: Number.POSITIVE_INFINITY,
    askYourLedgerMonthlyCap: Number.POSITIVE_INFINITY,
  },
  audit_ready: {
    activeGrantCap: 100,
    hasAutomationEmails: true,
    hasComplianceReportPack: true,
    hasGuidedOnboarding: true,
    hasGrantOpportunitySearch: true,
    canViewProgramContext: true,
    canManagePrograms: true,
    canManageProgramAllocations: true,
    canExportProgramReports: true,
    hasRestrictionLifecycle: true,
    hasRestrictionEvidencePackage: true,
    hasAuditorFunderPortal: true,
    hasPaymentRequests: true,
    hasIndirectCostRules: true,
    hasPaymentEvidencePackage: true,
    hasAwardDocumentIntake: true,
    hasGrantBudgetBasics: true,
    hasGrantBudgetAlerts: true,
    hasGrantBudgetExports: true,
    hasPlannedExpenses: true,
    hasGrantBudgetAiExtraction: true,
    hasGrantBudgetAmendments: true,
    hasGrantBudgetAuditViews: true,
    hasAccountingIntegrations: false,
    hasSubrecipientMonitoring: true,
    hasAccountingAnomalyDetector: true,
    hasMultiEntityConsolidation: false,
    hasPledgeTracker: true,
    hasFunctionalExpenseAllocation: true,
    hasCrossEntityReportBuilder: false,
    hasAskYourLedger: true,
    hasOutcomeImpactMeasurement: true,
    hasProposalReportDrafting: true,
    awardIntakeMonthlyCap: Number.POSITIVE_INFINITY,
    askYourLedgerMonthlyCap: Number.POSITIVE_INFINITY,
  },
  enterprise: {
    activeGrantCap: Number.POSITIVE_INFINITY,
    hasAutomationEmails: true,
    hasComplianceReportPack: true,
    hasGuidedOnboarding: true,
    hasGrantOpportunitySearch: true,
    canViewProgramContext: true,
    canManagePrograms: true,
    canManageProgramAllocations: true,
    canExportProgramReports: true,
    hasRestrictionLifecycle: true,
    hasRestrictionEvidencePackage: true,
    hasAuditorFunderPortal: true,
    hasPaymentRequests: true,
    hasIndirectCostRules: true,
    hasPaymentEvidencePackage: true,
    hasAwardDocumentIntake: true,
    hasGrantBudgetBasics: true,
    hasGrantBudgetAlerts: true,
    hasGrantBudgetExports: true,
    hasPlannedExpenses: true,
    hasGrantBudgetAiExtraction: true,
    hasGrantBudgetAmendments: true,
    hasGrantBudgetAuditViews: true,
    hasAccountingIntegrations: false,
    hasSubrecipientMonitoring: true,
    hasAccountingAnomalyDetector: true,
    hasMultiEntityConsolidation: true,
    hasPledgeTracker: true,
    hasFunctionalExpenseAllocation: true,
    hasCrossEntityReportBuilder: true,
    hasAskYourLedger: true,
    hasOutcomeImpactMeasurement: true,
    hasProposalReportDrafting: true,
    awardIntakeMonthlyCap: Number.POSITIVE_INFINITY,
    askYourLedgerMonthlyCap: Number.POSITIVE_INFINITY,
  },
};

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  if (value && (PLAN_TIERS as readonly string[]).includes(value)) {
    return value as PlanTier;
  }

  return "starter";
}

export function getPlanEntitlements(value: string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlanTier(value)];
}

export function getActiveGrantCap(value: string | null | undefined): number {
  return getPlanEntitlements(value).activeGrantCap;
}

export const GRANT_CAP_OVERAGE_MONTHLY_CENTS = 1000;
export const GRANT_CAP_OVERAGE_COPY = "$10/active grant/month";
export const GRANT_CAP_SOFT_HEADROOM = 10;

export function getGrantCapWithSoftHeadroom(activeGrantCap: number): number {
  return Number.isFinite(activeGrantCap)
    ? activeGrantCap + GRANT_CAP_SOFT_HEADROOM
    : activeGrantCap;
}

export function hasAutomationEmails(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAutomationEmails;
}

export function hasComplianceReportPack(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasComplianceReportPack;
}

export function hasProgramReportExport(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).canExportProgramReports;
}

export function hasRestrictionLifecycle(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasRestrictionLifecycle;
}

export function hasRestrictionEvidencePackage(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasRestrictionEvidencePackage;
}

export function hasAuditorFunderPortal(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAuditorFunderPortal;
}

export function hasPaymentRequests(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasPaymentRequests;
}

export function hasIndirectCostRules(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasIndirectCostRules;
}

export function hasPaymentEvidencePackage(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasPaymentEvidencePackage;
}

export function hasProgramAllocations(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).canManageProgramAllocations;
}

export function hasAwardDocumentIntake(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAwardDocumentIntake;
}

export function canUseGrantBudgetBasics(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetBasics;
}

export function canApproveAndLockGrantBudget(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetBasics;
}

export function canUseGrantBudgetAlerts(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetAlerts;
}

export function canExportGrantBudgetActuals(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetExports;
}

export function canUsePlannedExpenses(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasPlannedExpenses;
}

export function canUseGrantBudgetAiExtraction(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetAiExtraction;
}

export function canUseGrantBudgetAmendments(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetAmendments;
}

export function canUseGrantBudgetAuditViews(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasGrantBudgetAuditViews;
}

export function hasAccountingIntegrations(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAccountingIntegrations;
}

export function hasSubrecipientMonitoring(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasSubrecipientMonitoring;
}

export function hasMultiEntityConsolidation(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasMultiEntityConsolidation;
}

export function canUseAccountingAnomalyDetector(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAccountingAnomalyDetector;
}

export function canUsePledgeTracker(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasPledgeTracker;
}

export function canUseFunctionalExpenseAllocation(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasFunctionalExpenseAllocation;
}

export function canUseCrossEntityReportBuilder(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasCrossEntityReportBuilder;
}

export function canUseAskYourLedger(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasAskYourLedger;
}

export function canUseOutcomeImpactMeasurement(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasOutcomeImpactMeasurement;
}

export function canUseProposalReportDrafting(value: string | null | undefined): boolean {
  return getPlanEntitlements(value).hasProposalReportDrafting;
}

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "expired",
  "active",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const TRIAL_DAYS = 30;

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
]);

// ---------------------------------------------------------------------------
// Auditor & Funder Portal constants
// ---------------------------------------------------------------------------

export const REVIEWER_TYPES = ["auditor", "funder", "board", "other"] as const;
export type ReviewerType = (typeof REVIEWER_TYPES)[number];

export const EVIDENCE_BUNDLE_PURPOSES = [
  "audit",
  "funder_review",
  "closeout",
  "board_review",
  "other",
] as const;
export type EvidenceBundlePurpose = (typeof EVIDENCE_BUNDLE_PURPOSES)[number];

/** Polymorphic entity types that can be scoped to a reviewer session */
export const EXTERNAL_REVIEW_SCOPE_TYPES = [
  "grant",
  "fund",
  "program",
  "document",
  "generated_report",
  "evidence_bundle",
  "restriction_term",
  "reimbursement_request",
  "subrecipient_file",
  "subrecipient",
  "subaward",
  "subrecipient_risk_assessment",
  "subrecipient_monitoring_task",
  "subrecipient_monitoring_log",
  "subrecipient_finding",
  "subrecipient_corrective_action",
  "activity_log",
] as const;
export type ExternalReviewScopeType = (typeof EXTERNAL_REVIEW_SCOPE_TYPES)[number];

export const EXTERNAL_REVIEW_EVENT_TYPES = [
  "session_open",
  "view",
  "download",
  "expired",
  "revoked",
  "extended",
  "bundle_view",
] as const;
export type ExternalReviewEventType = (typeof EXTERNAL_REVIEW_EVENT_TYPES)[number];

export const PORTAL_SESSION_DAY_MS = 24 * 60 * 60 * 1000;
/** Default session duration in milliseconds (30 days) */
export const PORTAL_SESSION_DEFAULT_TTL_MS = 30 * PORTAL_SESSION_DAY_MS;
/** Maximum session duration in milliseconds (90 days) */
export const PORTAL_SESSION_MAX_TTL_MS = 90 * PORTAL_SESSION_DAY_MS;

export const PORTAL_SESSION_TTL_OPTIONS = [
  { label: "7 days", value: 7 * PORTAL_SESSION_DAY_MS },
  { label: "14 days", value: 14 * PORTAL_SESSION_DAY_MS },
  { label: "30 days", value: PORTAL_SESSION_DEFAULT_TTL_MS },
  { label: "60 days", value: 60 * PORTAL_SESSION_DAY_MS },
  { label: "90 days", value: PORTAL_SESSION_MAX_TTL_MS },
] as const;

export const PORTAL_SESSION_EXTENSION_OPTIONS = [
  { label: "+30 days", value: 30 * PORTAL_SESSION_DAY_MS },
  { label: "+60 days", value: 60 * PORTAL_SESSION_DAY_MS },
] as const;

export * from "./lead-magnets";
export * from "./import-presets";
export * from "./analytics";
export * from "./videos";
