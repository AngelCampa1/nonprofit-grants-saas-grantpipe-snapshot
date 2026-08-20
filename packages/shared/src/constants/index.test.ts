import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  canApproveAndLockGrantBudget,
  canExportGrantBudgetActuals,
  canUseGrantBudgetAiExtraction,
  canUseGrantBudgetAlerts,
  canUseGrantBudgetAmendments,
  canUseGrantBudgetAuditViews,
  canUseGrantBudgetBasics,
  canUsePlannedExpenses,
  COMMUNICATION_TYPE_LABELS,
  CUSTOM_FIELD_ENTITY_TYPE_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  DONOR_PIPELINE_STAGE_LABELS,
  DONATION_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  FUND_TYPE_LABELS,
  FUNDER_TYPE_LABELS,
  GRANT_ACTIVE_STATUSES,
  GRANT_BILLING_CAP_STATUSES,
  GRANT_BUDGET_ALERT_TYPES,
  GRANT_BUDGET_LINE_COST_TYPES,
  GRANT_BUDGET_VERSION_SOURCES,
  GRANT_BUDGET_VERSION_STATUSES,
  ADJUSTMENT_KIND_LABELS,
  GRANT_CAP_OVERAGE_COPY,
  GRANT_CAP_OVERAGE_MONTHLY_CENTS,
  GRANT_CAP_SOFT_HEADROOM,
  MAX_DOCUMENT_BYTES,
  NOTIFICATION_TYPES,
  PLANNED_EXPENSE_STATUSES,
  PLAN_ENTITLEMENTS,
  PLAN_ENTITLEMENT_LABELS,
  PLAN_LABELS,
  PLAN_TIERS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  PORTAL_SESSION_EXTENSION_OPTIONS,
  PORTAL_SESSION_TTL_OPTIONS,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  REPORT_TYPES,
  SUBAWARD_STATUSES,
  SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES,
  SUBRECIPIENT_FINDING_SEVERITIES,
  SUBRECIPIENT_MONITORING_TASK_STATUSES,
  SUBRECIPIENT_RISK_RATINGS,
  SUBRECIPIENT_STATUSES,
  ACTIVITY_ENTITY_TYPES,
  DOCUMENT_ENTITY_TYPES,
  EXTERNAL_REVIEW_SCOPE_TYPES,
  GENERATED_REPORT_TYPES,
  INDIRECT_COST_BASE_LABELS,
  formatGrantSourceTypeDescription,
  formatGrantSourceTypeLabel,
  RESTRICTION_ALERT_TYPES,
  RESTRICTION_LIFECYCLE_TYPE_LABELS,
  RESTRICTION_LIFECYCLE_TYPES,
  RESTRICTION_TYPE_LABELS,
  getActiveGrantCap,
  getPlanEntitlements,
  hasAutomationEmails,
  hasAuditorFunderPortal,
  hasAwardDocumentIntake,
  hasComplianceReportPack,
  hasIndirectCostRules,
  hasPaymentEvidencePackage,
  hasPaymentRequests,
  hasProgramAllocations,
  hasProgramReportExport,
  hasRestrictionEvidencePackage,
  hasRestrictionLifecycle,
  hasMultiEntityConsolidation,
  hasSubrecipientMonitoring,
  canUseAccountingAnomalyDetector,
  canUseAskYourLedger,
  canUseCrossEntityReportBuilder,
  canUseFunctionalExpenseAllocation,
  canUseOutcomeImpactMeasurement,
  hasAccountingIntegrations,
  canUsePledgeTracker,
  isActiveGrantStatus,
  isBillingCapGrantStatus,
  getGrantCapWithSoftHeadroom,
  normalizePlanTier,
} from "./index";

describe("PLAN_TIERS", () => {
  it("contains exactly the current tier identifiers", () => {
    expect(PLAN_TIERS).toEqual(["starter", "growth", "audit_ready", "enterprise"]);
  });

  it("does not contain legacy tier identifiers", () => {
    expect(PLAN_TIERS).not.toContain("foundation");
  });
});

describe("REPORT_TYPES", () => {
  it("keeps report type labels in the shared constants package", () => {
    expect(REPORT_TYPES).toEqual(["quarterly", "annual", "final", "custom"]);
    expect(REPORT_TYPE_LABELS).toEqual({
      quarterly: "Quarterly",
      annual: "Annual",
      final: "Final",
      custom: "Custom",
    });
  });
});

describe("portal session duration options", () => {
  it("publishes the invite and extension duration options used by app surfaces", () => {
    expect(PORTAL_SESSION_TTL_OPTIONS).toEqual([
      { label: "7 days", value: 604800000 },
      { label: "14 days", value: 1209600000 },
      { label: "30 days", value: 2592000000 },
      { label: "60 days", value: 5184000000 },
      { label: "90 days", value: 7776000000 },
    ]);
    expect(PORTAL_SESSION_EXTENSION_OPTIONS).toEqual([
      { label: "+30 days", value: 2592000000 },
      { label: "+60 days", value: 5184000000 },
    ]);
  });
});

describe("PLAN_LABELS", () => {
  it("has a label for every plan tier", () => {
    expect(Object.keys(PLAN_LABELS).sort()).toEqual([...PLAN_TIERS].sort());
    for (const tier of PLAN_TIERS) {
      expect(typeof PLAN_LABELS[tier]).toBe("string");
      expect(PLAN_LABELS[tier].length).toBeGreaterThan(0);
    }
  });

  it("uses the marketing-approved audit_ready label", () => {
    expect(PLAN_LABELS.audit_ready).toBe("Audit-Ready");
  });
});

describe("shared enum label maps", () => {
  it("covers operational enum labels used by app surfaces", () => {
    expect(DONOR_PIPELINE_STAGE_LABELS).toMatchObject({
      prospect: "Prospect",
      cultivation: "Cultivation",
      solicitation: "Solicitation",
      stewardship: "Stewardship",
      donor: "Donor",
      lapsed: "Lapsed",
    });
    expect(FUND_TYPE_LABELS.temporarily_restricted).toBe("Temporarily restricted");
    expect(FUND_TYPE_LABELS.permanently_restricted).toBe("Permanently restricted");
    expect(FUNDER_TYPE_LABELS.foundation).toBe("Foundation");
    expect(FUNDER_TYPE_LABELS.government).toBe("Government");
    expect(COMMUNICATION_TYPE_LABELS.meeting).toBe("Meeting");
    expect(CUSTOM_FIELD_TYPE_LABELS.single_select).toBe("Single select");
    expect(CUSTOM_FIELD_ENTITY_TYPE_LABELS.donation).toBe("Donation");
    expect(DONATION_TYPE_LABELS.one_time).toBe("One-time");
    expect(DONATION_TYPE_LABELS.recurring).toBe("Recurring");
    expect(DONATION_TYPE_LABELS.pledge).toBe("Pledge");
    expect(RESTRICTION_TYPE_LABELS.unrestricted).toBe("Unrestricted");
    expect(RESTRICTION_TYPE_LABELS.restricted).toBe("Restricted");
    expect(EVENT_TYPE_LABELS.gala).toBe("Gala");
    expect(EVENT_TYPE_LABELS.fundraiser).toBe("Fundraiser");
    expect(REPORT_STATUS_LABELS.in_progress).toBe("In progress");
    expect(PAYMENT_METHOD_LABELS.ach).toBe("ACH");
    expect(ADJUSTMENT_KIND_LABELS.dedup_override).toBe("Dedup override");
    expect(RESTRICTION_LIFECYCLE_TYPE_LABELS.purpose_and_time).toBe("Purpose and time");
    expect(PAYMENT_REQUEST_STATUS_LABELS.partially_approved).toBe("Partially Approved");
    expect(PAYMENT_REQUEST_TYPE_LABELS.advance_liquidation).toBe("Advance Liquidation");
    expect(INDIRECT_COST_BASE_LABELS.modified_total_direct).toBe(
      "Modified total direct cost (MTDC)",
    );
  });

  it("formats grant source labels and descriptions", () => {
    expect(formatGrantSourceTypeLabel("federal")).toBe("Federal");
    expect(formatGrantSourceTypeDescription("federal")).toContain("Federal");
  });
});

describe("PLAN_ENTITLEMENTS", () => {
  it("keeps downgrade labels beside the shared entitlement keys", () => {
    expect(Object.keys(PLAN_ENTITLEMENT_LABELS).sort()).toEqual(
      Object.keys(PLAN_ENTITLEMENTS.starter).sort(),
    );
    expect(PLAN_ENTITLEMENT_LABELS.hasPaymentRequests).toBe("Drawdowns and reimbursement requests");
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENT_LABELS).toBe(false);
  });

  it("keeps Starter aligned to the small-portfolio offer", () => {
    expect(PLAN_ENTITLEMENTS.starter).toMatchObject({
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
      hasAwardDocumentIntake: true,
    });
  });

  it("keeps Growth aligned to the automation offer", () => {
    expect(PLAN_ENTITLEMENTS.growth).toMatchObject({
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
      hasAccountingIntegrations: false,
      hasAwardDocumentIntake: true,
      hasOutcomeImpactMeasurement: true,
    });
  });

  it("keeps Audit-Ready capped at 100 active grants with guided setup", () => {
    expect(PLAN_ENTITLEMENTS.audit_ready).toMatchObject({
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
      hasAwardDocumentIntake: true,
    });
  });

  it("keeps Enterprise uncapped and fully enabled", () => {
    expect(PLAN_ENTITLEMENTS.enterprise).toMatchObject({
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
      hasAwardDocumentIntake: true,
    });
  });
});

describe("plan entitlement helpers", () => {
  it("normalizes unknown and missing plan values to starter", () => {
    expect(normalizePlanTier(undefined)).toBe("starter");
    expect(normalizePlanTier(null)).toBe("starter");
    expect(normalizePlanTier("enterprise")).toBe("enterprise");
  });

  it("returns the configured grant caps for each plan", () => {
    expect(getActiveGrantCap("starter")).toBe(10);
    expect(getActiveGrantCap("growth")).toBe(50);
    expect(getActiveGrantCap("audit_ready")).toBe(100);
    expect(getActiveGrantCap("enterprise")).toBe(Number.POSITIVE_INFINITY);
  });

  it("reports automation email eligibility from Starter upward", () => {
    expect(hasAutomationEmails("starter")).toBe(true);
    expect(hasAutomationEmails("growth")).toBe(true);
    expect(hasAutomationEmails("audit_ready")).toBe(true);
  });

  it("reports compliance report pack eligibility from the shared entitlement map", () => {
    expect(hasComplianceReportPack("starter")).toBe(false);
    expect(hasComplianceReportPack("growth")).toBe(true);
    expect(hasComplianceReportPack("audit_ready")).toBe(true);
  });

  it("reports restriction lifecycle eligibility from Starter upward", () => {
    expect(hasRestrictionLifecycle("starter")).toBe(true);
    expect(hasRestrictionLifecycle("growth")).toBe(true);
    expect(hasRestrictionLifecycle("audit_ready")).toBe(true);
    expect(hasRestrictionEvidencePackage("growth")).toBe(false);
    expect(hasRestrictionEvidencePackage("audit_ready")).toBe(true);
  });

  it("returns a normalized entitlement object for each plan", () => {
    expect(getPlanEntitlements("growth")).toEqual(PLAN_ENTITLEMENTS.growth);
    expect(getPlanEntitlements("bogus")).toEqual(PLAN_ENTITLEMENTS.starter);
  });

  it("reports program report export eligibility from Growth upward", () => {
    expect(hasProgramReportExport("starter")).toBe(false);
    expect(hasProgramReportExport("growth")).toBe(true);
    expect(hasProgramReportExport("audit_ready")).toBe(true);
    expect(hasProgramReportExport("enterprise")).toBe(true);
  });

  it("reports auditor funder portal eligibility from Audit-Ready upward", () => {
    expect(hasAuditorFunderPortal("starter")).toBe(false);
    expect(hasAuditorFunderPortal("growth")).toBe(false);
    expect(hasAuditorFunderPortal("audit_ready")).toBe(true);
    expect(hasAuditorFunderPortal("enterprise")).toBe(true);
    expect(hasAuditorFunderPortal(null)).toBe(false);
  });

  it("reports AI award document intake eligibility from Starter upward", () => {
    expect(hasAwardDocumentIntake("starter")).toBe(true);
    expect(hasAwardDocumentIntake("growth")).toBe(true);
    expect(hasAwardDocumentIntake("audit_ready")).toBe(true);
    expect(hasAwardDocumentIntake("enterprise")).toBe(true);
    expect(hasAwardDocumentIntake("unknown")).toBe(true);
  });

  it("reports subrecipient monitoring eligibility from Audit-Ready upward", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasSubrecipientMonitoring).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasSubrecipientMonitoring).toBe(false);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasSubrecipientMonitoring).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise.hasSubrecipientMonitoring).toBe(true);
    expect(hasSubrecipientMonitoring("starter")).toBe(false);
    expect(hasSubrecipientMonitoring("growth")).toBe(false);
    expect(hasSubrecipientMonitoring("audit_ready")).toBe(true);
    expect(hasSubrecipientMonitoring("enterprise")).toBe(true);
  });

  it("reports multi-entity consolidation eligibility on Enterprise only", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasMultiEntityConsolidation).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasMultiEntityConsolidation).toBe(false);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasMultiEntityConsolidation).toBe(false);
    expect(PLAN_ENTITLEMENTS.enterprise.hasMultiEntityConsolidation).toBe(true);
    expect(hasMultiEntityConsolidation("starter")).toBe(false);
    expect(hasMultiEntityConsolidation("growth")).toBe(false);
    expect(hasMultiEntityConsolidation("audit_ready")).toBe(false);
    expect(hasMultiEntityConsolidation("enterprise")).toBe(true);
    expect(hasMultiEntityConsolidation("unknown")).toBe(false);
  });

  it("reserves cross-entity report builder eligibility for Enterprise", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasCrossEntityReportBuilder).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasCrossEntityReportBuilder).toBe(false);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasCrossEntityReportBuilder).toBe(false);
    expect(PLAN_ENTITLEMENTS.enterprise.hasCrossEntityReportBuilder).toBe(true);
    expect(canUseCrossEntityReportBuilder("starter")).toBe(false);
    expect(canUseCrossEntityReportBuilder("growth")).toBe(false);
    expect(canUseCrossEntityReportBuilder("audit_ready")).toBe(false);
    expect(canUseCrossEntityReportBuilder("enterprise")).toBe(true);
    expect(canUseCrossEntityReportBuilder("unknown")).toBe(false);
  });

  it("keeps Starter credible while reserving day-to-day compliance depth for Growth", () => {
    expect(PLAN_ENTITLEMENTS.starter).toMatchObject({
      activeGrantCap: 10,
      hasAutomationEmails: true,
      hasRestrictionLifecycle: true,
      hasGrantBudgetBasics: true,
      hasGrantBudgetAlerts: true,
      hasAwardDocumentIntake: true,
      hasAskYourLedger: false,
      canViewProgramContext: true,
      canManagePrograms: true,
      canManageProgramAllocations: true,
      hasComplianceReportPack: false,
      hasGrantBudgetExports: true,
      hasPlannedExpenses: false,
      hasAccountingIntegrations: false,
      hasProposalReportDrafting: false,
    });

    expect(PLAN_ENTITLEMENTS.growth).toMatchObject({
      activeGrantCap: 50,
      hasComplianceReportPack: true,
      hasPaymentRequests: true,
      hasGrantBudgetExports: true,
      hasPlannedExpenses: true,
      hasAccountingIntegrations: false,
      hasProposalReportDrafting: true,
      hasOutcomeImpactMeasurement: true,
      hasAuditorFunderPortal: false,
      hasRestrictionEvidencePackage: false,
      hasSubrecipientMonitoring: false,
    });
  });

  it("keeps Audit-Ready for external review and Enterprise for cross-entity reporting", () => {
    expect(PLAN_ENTITLEMENTS.audit_ready).toMatchObject({
      hasAuditorFunderPortal: true,
      hasGuidedOnboarding: true,
      hasRestrictionEvidencePackage: true,
      hasPaymentEvidencePackage: true,
      hasIndirectCostRules: true,
      hasSubrecipientMonitoring: true,
      hasGrantBudgetAuditViews: true,
      hasMultiEntityConsolidation: false,
      hasCrossEntityReportBuilder: false,
    });

    expect(PLAN_ENTITLEMENTS.enterprise).toMatchObject({
      hasMultiEntityConsolidation: true,
      hasCrossEntityReportBuilder: true,
    });
  });

  it("reports Ask-Your-Ledger eligibility from Growth upward", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasAskYourLedger).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasAskYourLedger).toBe(true);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasAskYourLedger).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise.hasAskYourLedger).toBe(true);
    expect(canUseAskYourLedger("starter")).toBe(false);
    expect(canUseAskYourLedger("growth")).toBe(true);
    expect(canUseAskYourLedger("audit_ready")).toBe(true);
    expect(canUseAskYourLedger("enterprise")).toBe(true);
    expect(canUseAskYourLedger("unknown")).toBe(false);
  });

  it("reports outcome impact measurement eligibility from Growth upward", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasOutcomeImpactMeasurement).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasOutcomeImpactMeasurement).toBe(true);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasOutcomeImpactMeasurement).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise.hasOutcomeImpactMeasurement).toBe(true);
    expect(canUseOutcomeImpactMeasurement("starter")).toBe(false);
    expect(canUseOutcomeImpactMeasurement("growth")).toBe(true);
    expect(canUseOutcomeImpactMeasurement("audit_ready")).toBe(true);
    expect(canUseOutcomeImpactMeasurement("enterprise")).toBe(true);
    expect(canUseOutcomeImpactMeasurement("unknown")).toBe(false);
  });

  it("does not expose the retired recurring gift engine entitlement", () => {
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.starter).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.growth).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.audit_ready).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.enterprise).toBe(false);
  });

  it("reports advanced compliance and finance helper eligibility", () => {
    expect(hasPaymentRequests("starter")).toBe(false);
    expect(hasPaymentRequests("audit_ready")).toBe(true);
    expect(hasIndirectCostRules("growth")).toBe(true);
    expect(hasIndirectCostRules("audit_ready")).toBe(true);
    expect(hasPaymentEvidencePackage("growth")).toBe(true);
    expect(hasPaymentEvidencePackage("audit_ready")).toBe(true);
    expect(hasProgramAllocations("starter")).toBe(true);
    expect(hasProgramAllocations("growth")).toBe(true);
    expect(hasProgramAllocations("audit_ready")).toBe(true);
    expect(canUseFunctionalExpenseAllocation("growth")).toBe(true);
    expect(canUseFunctionalExpenseAllocation("audit_ready")).toBe(true);
  });
});

describe("document intake constants", () => {
  it("allows pre-grant award intake documents and extraction audit activity", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("document_extraction");
    expect(DOCUMENT_ENTITY_TYPES).toContain("award_intake");
  });
});

describe("grant budget constants and entitlements", () => {
  it("exports budget lifecycle constants", () => {
    expect(GRANT_BUDGET_VERSION_STATUSES).toEqual(["draft", "approved", "superseded"]);
    expect(GRANT_BUDGET_VERSION_SOURCES).toEqual(["manual", "document_intake", "amendment"]);
    expect(GRANT_BUDGET_LINE_COST_TYPES).toEqual(["direct", "indirect"]);
    expect(PLANNED_EXPENSE_STATUSES).toEqual(["planned", "committed", "cancelled", "converted"]);
    expect(GRANT_BUDGET_ALERT_TYPES).toEqual([
      "over_budget",
      "underspend",
      "unallowable_category",
      "upcoming_period_deadline",
    ]);
  });

  it("packages grant budget capabilities by tier", () => {
    expect(canUseGrantBudgetBasics("starter")).toBe(true);
    expect(canApproveAndLockGrantBudget("starter")).toBe(true);
    expect(canUseGrantBudgetAlerts("starter")).toBe(true);
    expect(canExportGrantBudgetActuals("starter")).toBe(true);
    expect(canUsePlannedExpenses("starter")).toBe(false);
    expect(canUseGrantBudgetAiExtraction("starter")).toBe(false);
    expect(canUseGrantBudgetAmendments("starter")).toBe(false);

    expect(canUseGrantBudgetBasics("growth")).toBe(true);
    expect(canUseGrantBudgetAlerts("growth")).toBe(true);
    expect(canExportGrantBudgetActuals("growth")).toBe(true);
    expect(canUsePlannedExpenses("growth")).toBe(true);
    expect(canUseGrantBudgetAiExtraction("growth")).toBe(true);
    expect(canUseGrantBudgetAmendments("growth")).toBe(false);
    expect(canUseGrantBudgetAuditViews("growth")).toBe(false);

    expect(canUseGrantBudgetAmendments("audit_ready")).toBe(true);
    expect(canUseGrantBudgetAuditViews("audit_ready")).toBe(true);
    expect(canUseGrantBudgetAiExtraction("enterprise")).toBe(true);
  });
});

describe("restriction constants", () => {
  it("contains restriction lifecycle enums and alert types", () => {
    expect(RESTRICTION_LIFECYCLE_TYPES).toEqual([
      "purpose",
      "time",
      "purpose_and_time",
      "board_designated",
      "unrestricted",
    ]);
    expect(RESTRICTION_ALERT_TYPES).toContain("release_term_conflict");
    expect(RESTRICTION_ALERT_TYPES).toContain("expense_term_conflict");
  });

  it("extends report and activity constants for restriction lifecycle", () => {
    expect(GENERATED_REPORT_TYPES).toContain("restricted_rollforward");
    expect(GENERATED_REPORT_TYPES).toContain("donor_year_end_statement");
    expect(ACTIVITY_ENTITY_TYPES).toContain("restriction_term");
    expect(ACTIVITY_ENTITY_TYPES).toContain("restriction_addition");
    expect(ACTIVITY_ENTITY_TYPES).toContain("restriction_release");
    expect(ACTIVITY_ENTITY_TYPES).toContain("restriction_evidence_link");
  });
});

describe("subrecipient monitoring constants", () => {
  it("exports workflow status and risk enums", () => {
    expect(SUBRECIPIENT_STATUSES).toEqual(["active", "inactive", "watchlist"]);
    expect(SUBAWARD_STATUSES).toEqual(["draft", "active", "closed", "suspended"]);
    expect(SUBRECIPIENT_RISK_RATINGS).toEqual(["low", "medium", "high"]);
    expect(SUBRECIPIENT_MONITORING_TASK_STATUSES).toEqual([
      "open",
      "in_progress",
      "completed",
      "waived",
    ]);
    expect(SUBRECIPIENT_FINDING_SEVERITIES).toEqual(["low", "medium", "high", "material"]);
    expect(SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES).toEqual([
      "open",
      "in_progress",
      "completed",
      "overdue",
    ]);
  });

  it("extends document and activity entity constants", () => {
    expect(DOCUMENT_ENTITY_TYPES).toEqual(
      expect.arrayContaining([
        "subrecipient",
        "subaward",
        "subrecipient_monitoring_task",
        "subrecipient_finding",
        "subrecipient_corrective_action",
      ]),
    );
    expect(ACTIVITY_ENTITY_TYPES).toEqual(
      expect.arrayContaining([
        "subrecipient",
        "subaward",
        "subrecipient_risk_assessment",
        "subrecipient_monitoring_task",
        "subrecipient_monitoring_log",
        "subrecipient_finding",
        "subrecipient_corrective_action",
      ]),
    );
  });

  it("includes organization entities in activity entity constants", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("entity");
    expect(ACTIVITY_ENTITY_TYPES).toContain("entity_member");
  });

  it("extends external review scope constants for evidence bundles", () => {
    expect(EXTERNAL_REVIEW_SCOPE_TYPES).toEqual(
      expect.arrayContaining([
        "subrecipient",
        "subaward",
        "subrecipient_risk_assessment",
        "subrecipient_monitoring_task",
        "subrecipient_monitoring_log",
        "subrecipient_finding",
        "subrecipient_corrective_action",
        "activity_log",
      ]),
    );
  });
});

describe("accounting anomaly detector", () => {
  it("includes accounting_anomaly in NOTIFICATION_TYPES", () => {
    expect(NOTIFICATION_TYPES).toContain("accounting_anomaly");
  });

  it("gates hasAccountingAnomalyDetector on audit_ready and enterprise only", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasAccountingAnomalyDetector).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasAccountingAnomalyDetector).toBe(false);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasAccountingAnomalyDetector).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise.hasAccountingAnomalyDetector).toBe(true);
  });

  it("canUseAccountingAnomalyDetector returns correct value per tier", () => {
    expect(canUseAccountingAnomalyDetector("starter")).toBe(false);
    expect(canUseAccountingAnomalyDetector("growth")).toBe(false);
    expect(canUseAccountingAnomalyDetector("audit_ready")).toBe(true);
    expect(canUseAccountingAnomalyDetector("enterprise")).toBe(true);
    expect(canUseAccountingAnomalyDetector(null)).toBe(false);
    expect(canUseAccountingAnomalyDetector(undefined)).toBe(false);
    expect(canUseAccountingAnomalyDetector("unknown")).toBe(false);
  });
});

describe("GRANT_ACTIVE_STATUSES", () => {
  it("includes the in-flight pipeline statuses", () => {
    expect(GRANT_ACTIVE_STATUSES).toContain("discovery");
    expect(GRANT_ACTIVE_STATUSES).toContain("application");
    expect(GRANT_ACTIVE_STATUSES).toContain("awarded");
    expect(GRANT_ACTIVE_STATUSES).toContain("active");
    expect(GRANT_ACTIVE_STATUSES).toContain("reporting");
    expect(GRANT_ACTIVE_STATUSES).toContain("renewal");
  });

  it("excludes terminal statuses", () => {
    expect(GRANT_ACTIVE_STATUSES).not.toContain("closeout");
    expect(GRANT_ACTIVE_STATUSES).not.toContain("declined");
  });
});

describe("GRANT_BILLING_CAP_STATUSES", () => {
  it("contains only statuses counted toward billing grant caps", () => {
    expect(GRANT_BILLING_CAP_STATUSES).toEqual(["awarded", "active", "reporting", "renewal"]);
  });

  it("does not change the broader active grant status helper", () => {
    expect(isActiveGrantStatus("discovery")).toBe(true);
    expect(isActiveGrantStatus("application")).toBe(true);
    expect(isBillingCapGrantStatus("discovery")).toBe(false);
    expect(isBillingCapGrantStatus("application")).toBe(false);
    expect(isBillingCapGrantStatus("submitted")).toBe(false);
    expect(isBillingCapGrantStatus("awarded")).toBe(true);
    expect(isBillingCapGrantStatus("active")).toBe(true);
    expect(isBillingCapGrantStatus("reporting")).toBe(true);
    expect(isBillingCapGrantStatus("renewal")).toBe(true);
    expect(isBillingCapGrantStatus("closeout")).toBe(false);
  });
});

describe("grant cap overage constants", () => {
  it("publishes the monthly active grant overage price and copy", () => {
    expect(GRANT_CAP_OVERAGE_MONTHLY_CENTS).toBe(1000);
    expect(GRANT_CAP_OVERAGE_COPY).toBe("$10/active grant/month");
  });

  it("publishes the shared soft headroom and cap helper", () => {
    expect(GRANT_CAP_SOFT_HEADROOM).toBe(10);
    expect(getGrantCapWithSoftHeadroom(30)).toBe(40);
    expect(getGrantCapWithSoftHeadroom(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("MAX_DOCUMENT_BYTES", () => {
  it("is set to 25 MiB to match the upload cap", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("ALLOWED_DOCUMENT_MIME_TYPES", () => {
  it("is a Set of mime type strings", () => {
    expect(ALLOWED_DOCUMENT_MIME_TYPES).toBeInstanceOf(Set);
  });

  it("includes common nonprofit document types", () => {
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/pdf")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/gif")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/webp")).toBe(true);
    expect(
      ALLOWED_DOCUMENT_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/vnd.ms-excel")).toBe(true);
    expect(
      ALLOWED_DOCUMENT_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/msword")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("text/csv")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("text/plain")).toBe(true);
  });

  it("excludes disallowed executable types", () => {
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/x-msdownload")).toBe(false);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/octet-stream")).toBe(false);
  });
});

describe("isActiveGrantStatus", () => {
  it("returns true for each active status", () => {
    for (const status of GRANT_ACTIVE_STATUSES) {
      expect(isActiveGrantStatus(status)).toBe(true);
    }
  });

  it("returns false for terminal statuses", () => {
    expect(isActiveGrantStatus("closeout")).toBe(false);
    expect(isActiveGrantStatus("declined")).toBe(false);
  });

  it("returns false for unknown values", () => {
    expect(isActiveGrantStatus("bogus")).toBe(false);
  });
});

describe("hasAccountingIntegrations", () => {
  it("keeps accounting integrations unavailable until a real connector ships", () => {
    expect(hasAccountingIntegrations("starter")).toBe(false);
    expect(hasAccountingIntegrations("growth")).toBe(false);
    expect(hasAccountingIntegrations("audit_ready")).toBe(false);
    expect(hasAccountingIntegrations("enterprise")).toBe(false);
    expect(hasAccountingIntegrations(null)).toBe(false);
  });
});

describe("canUsePledgeTracker", () => {
  it("gates pledge tracker on growth and above", () => {
    expect(canUsePledgeTracker("starter")).toBe(false);
    expect(canUsePledgeTracker("growth")).toBe(true);
    expect(canUsePledgeTracker("audit_ready")).toBe(true);
    expect(canUsePledgeTracker("enterprise")).toBe(true);
    expect(canUsePledgeTracker(null)).toBe(false);
    expect(canUsePledgeTracker(undefined)).toBe(false);
    expect(canUsePledgeTracker("unknown")).toBe(false);
  });
});

describe("pledge tracker notification and activity constants", () => {
  it("includes pledge_installment_due in NOTIFICATION_TYPES", () => {
    expect(NOTIFICATION_TYPES).toContain("pledge_installment_due");
  });

  it("includes trial_lifecycle in NOTIFICATION_TYPES", () => {
    expect(NOTIFICATION_TYPES).toContain("trial_lifecycle");
  });

  it("includes pledge in ACTIVITY_ENTITY_TYPES", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("pledge");
  });
});

describe("AI monthly caps", () => {
  it("ladders award intake cap: starter finite, growth+ unlimited", () => {
    expect(PLAN_ENTITLEMENTS.starter.awardIntakeMonthlyCap).toBe(5);
    expect(PLAN_ENTITLEMENTS.growth.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.audit_ready.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.enterprise.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
  });
  it("ask-your-ledger is gated off Starter (cap 0), growth+ unlimited", () => {
    expect(PLAN_ENTITLEMENTS.starter.askYourLedgerMonthlyCap).toBe(0);
    expect(PLAN_ENTITLEMENTS.growth.askYourLedgerMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.audit_ready.askYourLedgerMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.enterprise.askYourLedgerMonthlyCap).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("repackaged entitlements", () => {
  it("starter is workable: reminders, restriction lifecycle, alerts, entry AI", () => {
    const s = PLAN_ENTITLEMENTS.starter;
    expect(s.hasAutomationEmails).toBe(true);
    expect(s.hasRestrictionLifecycle).toBe(true);
    expect(s.hasGrantBudgetAlerts).toBe(true);
    expect(s.hasAwardDocumentIntake).toBe(true);
    expect(s.hasAskYourLedger).toBe(false);
    // fences still closed
    expect(s.hasComplianceReportPack).toBe(false);
    expect(s.hasGrantBudgetExports).toBe(true);
    expect(s.hasPlannedExpenses).toBe(false);
    expect(s.hasGrantBudgetAiExtraction).toBe(false);
    expect(s.hasAccountingIntegrations).toBe(false);
    expect(s.hasProposalReportDrafting).toBe(false);
    expect(s.activeGrantCap).toBe(10);
  });
  it("growth adds drafting and uncapped AI without external accounting sync", () => {
    const g = PLAN_ENTITLEMENTS.growth;
    expect(g.hasAccountingIntegrations).toBe(false);
    expect(g.hasProposalReportDrafting).toBe(true);
    expect(g.activeGrantCap).toBe(50);
    // audit fences still closed at growth
    expect(g.hasRestrictionEvidencePackage).toBe(false);
    expect(g.hasAuditorFunderPortal).toBe(false);
    expect(g.hasSubrecipientMonitoring).toBe(false);
    expect(g.hasAccountingAnomalyDetector).toBe(false);
  });

  it("2026-07 repackaging: exports down to Starter, indirect+evidence down to Growth, ask-ledger off Starter, growth cap 50", () => {
    const s = PLAN_ENTITLEMENTS.starter;
    const g = PLAN_ENTITLEMENTS.growth;
    const a = PLAN_ENTITLEMENTS.audit_ready;
    expect(s.hasAskYourLedger).toBe(false);
    expect(s.askYourLedgerMonthlyCap).toBe(0);
    expect(s.hasGrantBudgetExports).toBe(true);
    expect(s.awardIntakeMonthlyCap).toBe(5);
    expect(g.hasIndirectCostRules).toBe(true);
    expect(g.hasPaymentEvidencePackage).toBe(true);
    expect(g.activeGrantCap).toBe(50);
    expect(a.hasIndirectCostRules).toBe(true);
    expect(a.hasPaymentEvidencePackage).toBe(true);
    expect(a.hasCrossEntityReportBuilder).toBe(false);
  });
});
