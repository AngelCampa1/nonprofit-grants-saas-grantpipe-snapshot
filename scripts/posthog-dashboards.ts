import { fileURLToPath } from "node:url";
import { ANALYTICS_EVENTS } from "../packages/shared/src/constants/analytics";

type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

type InsightKind = "trends" | "funnel" | "retention";

type TrendsMath = "total" | "sum" | "dau" | "weekly_active" | "monthly_active";

type RetentionSpec = {
  targetEvent: AnalyticsEventName;
  returningEvent: AnalyticsEventName;
  period: "Week" | "Month";
};

export type PostHogInsightSpec = {
  name: string;
  description: string;
  kind: InsightKind;
  events: AnalyticsEventName[];
  breakdownProperty?: string;
  /** Trends aggregation. Defaults to "total" (event count). */
  math?: TrendsMath;
  /** Numeric event property to aggregate; required when math is "sum". */
  mathProperty?: string;
  /** Cohort retention configuration; required when kind is "retention". */
  retention?: RetentionSpec;
};

export type PostHogDashboardSpec = {
  name: string;
  description: string;
  insights: PostHogInsightSpec[];
};

export type ParsedArgs = {
  apply: boolean;
  host: string;
  environmentId?: string;
  apiKey?: string;
};

type PostHogDashboard = {
  id: number;
  name: string | null;
};

type PostHogInsight = {
  id: number;
  name: string | null;
};

type PostHogListResponse<T> = {
  results?: T[];
};

type PostHogQueryNode = {
  kind: "InsightVizNode";
  source: {
    kind: "TrendsQuery" | "FunnelsQuery" | "RetentionQuery";
    dateRange: { date_from: string };
    interval?: "day" | "week";
    series?: Array<{
      kind: "EventsNode";
      event: string;
      name: string;
      math: TrendsMath;
      math_property?: string;
    }>;
    steps?: Array<{
      kind: "EventsNode";
      event: string;
      name: string;
    }>;
    breakdownFilter?: {
      breakdown: string;
      breakdown_type: "event";
    };
    retentionFilter?: {
      retentionType: "retention_first_time";
      period: "Week" | "Month";
      totalIntervals: number;
      targetEntity: { id: string; name: string; type: "events" };
      returningEntity: { id: string; name: string; type: "events" };
    };
  };
};

const EVENT = ANALYTICS_EVENTS;

export const POSTHOG_DASHBOARDS: PostHogDashboardSpec[] = [
  {
    name: "GrantPipe - Acquisition and Signup",
    description:
      "Public-content, CTA, lead, and signup conversion health for channel and positioning decisions.",
    insights: [
      {
        name: "Visitor to signup funnel",
        description: "Tracks public intent becoming a submitted and completed signup.",
        kind: "funnel",
        events: [
          EVENT.ctaClicked,
          EVENT.leadCreated,
          EVENT.outboundLandingViewed,
          EVENT.signupStarted,
          EVENT.signupSubmitted,
          EVENT.signupCompleted,
          EVENT.loginCompleted,
          EVENT.forgotPasswordSubmitted,
          EVENT.passwordResetCompleted,
        ],
      },
      {
        name: "Content demand signals by page family",
        description: "Shows which content paths create qualified demand.",
        kind: "trends",
        events: [
          EVENT.leadMagnetUnlocked,
          EVENT.leadMagnetDeliverySuppressed,
          EVENT.aiSdrSessionStarted,
          EVENT.aiSdrDraftGenerated,
          EVENT.aiSdrDraftSent,
          EVENT.aiSdrDraftDiscarded,
        ],
        breakdownProperty: "page_family",
      },
      {
        name: "Public discovery actions",
        description: "Search, assessment, calculator, and resource actions before signup.",
        kind: "trends",
        events: [
          EVENT.siteSearchClosed,
          EVENT.assessmentAbandoned,
          EVENT.assessmentResultLinkClicked,
          EVENT.calculatorResultViewed,
          EVENT.calculatorCtaClicked,
          EVENT.resourceFilterChanged,
          EVENT.resourceFiltersCleared,
          EVENT.resourceSortChanged,
          EVENT.resourceCardClicked,
        ],
        breakdownProperty: "source",
      },
      {
        name: "Marketing journey micro-conversions",
        description:
          "Captures public-site engagement, form friction, popups, gated content, and pricing intent.",
        kind: "trends",
        events: [
          "assessment_started",
          "assessment_question_answered",
          "assessment_completed",
          "assessment_retake_clicked",
          "assessment_submission_failed",
          "billing_toggle_switched",
          "cost_calculator_team_size_changed",
          "email_field_focused",
          "email_field_abandoned",
          "engaged_time_reached",
          "exit_popup_shown",
          "exit_popup_converted",
          "exit_popup_dismissed",
          "exit_popup_submission_failed",
          "exit_popup_resend_requested",
          "exit_popup_resend_completed",
          "exit_popup_resend_failed",
          "faq_expanded",
          "gated_content_submission_failed",
          "gated_content_resend_requested",
          "gated_content_resend_completed",
          "gated_content_resend_failed",
          "lead_magnet_offer_shown",
          "lead_magnet_alternative_selected",
          "lead_magnet_submission_failed",
          "lead_magnet_resend_requested",
          "lead_magnet_resend_completed",
          "lead_magnet_resend_failed",
          "mobile_nav_opened",
          "mobile_nav_closed",
          "mobile_nav_link_clicked",
          "pricebook_builder_inputs_changed",
          "pricebook_pdf_requested",
          "pricing_tier_clicked",
          "scroll_depth_reached",
          "section_viewed",
          "site_nav_link_clicked",
          "site_search_opened",
          "site_search_performed",
          "site_search_result_clicked",
          "site_search_failed",
          "survey_completed",
        ],
        breakdownProperty: "surface",
      },
    ],
  },
  {
    name: "GrantPipe - Activation and Onboarding",
    description:
      "First-value and onboarding movement that indicates whether new organizations reach setup value.",
    insights: [
      {
        name: "Onboarding completion funnel",
        description: "Measures onboarding step movement and completion.",
        kind: "funnel",
        events: [
          EVENT.onboardingStepViewed,
          EVENT.onboardingStepCompleted,
          EVENT.onboardingCompleted,
          EVENT.activationCompleted,
        ],
      },
      {
        name: "Onboarding friction",
        description: "Tracks where users back out, abandon, or fail in onboarding.",
        kind: "trends",
        events: [
          EVENT.onboardingStepFailed,
          EVENT.onboardingBackClicked,
          EVENT.onboardingAbandoned,
          EVENT.signupFailed,
        ],
        breakdownProperty: "step_name",
      },
      {
        name: "First value milestones",
        description: "Shows first contact, grant, fund, import, and report milestones.",
        kind: "trends",
        events: [
          EVENT.firstContactCreated,
          EVENT.firstGrantCreated,
          EVENT.firstFundCreated,
          EVENT.firstImportCompleted,
          EVENT.firstReportGenerated,
        ],
        breakdownProperty: "org_plan_tier",
      },
      {
        name: "Onboarding choices and sample data",
        description:
          "Tracks goal selection, first action, sample data, aha banner, and activation preview movement.",
        kind: "trends",
        events: [
          EVENT.onboardingFirstActionSelected,
          EVENT.onboardingGoalSelected,
          EVENT.onboardingSampleDataChosen,
          EVENT.sampleDataSeeded,
          EVENT.sampleDataCleared,
          EVENT.activationFirstValueViewed,
          EVENT.onboardingTimezoneAutodetected,
          EVENT.onboardingAhaBannerViewed,
          EVENT.onboardingAhaExamplesCleared,
          EVENT.promoBannerViewed,
        ],
        breakdownProperty: "surface",
      },
    ],
  },
  {
    name: "GrantPipe - Product Adoption",
    description:
      "Feature adoption across CRM, grants, funds, reporting, documents, command palette, and subrecipient workflows.",
    insights: [
      {
        name: "Core record creation",
        description: "Measures creation of the core operating records.",
        kind: "trends",
        events: [
          EVENT.contactCreated,
          EVENT.donorMailMergeSent,
          EVENT.grantCreated,
          EVENT.fundCreated,
          EVENT.funderCreated,
          EVENT.grantFundAllocationCreated,
        ],
        breakdownProperty: "entity_type",
      },
      {
        name: "Core record lifecycle",
        description:
          "Tracks donor, donation, grant, fund, funder, opportunity, and calendar lifecycle actions.",
        kind: "trends",
        events: [
          "contact_updated",
          "contact_deleted",
          "donor_stage_changed",
          "donation_recorded",
          "donation_updated",
          "donation_deleted",
          "communication_logged",
          "grant_updated",
          "grant_deleted",
          "grant_stage_changed",
          "grant_opportunity_created",
          "grant_opportunity_saved",
          "grant_opportunity_converted",
          "fund_updated",
          "fund_deleted",
          "funder_updated",
          "funder_deleted",
          "calendar_event_created",
          EVENT.pledgeCreated,
          EVENT.pledgePaymentRecorded,
          EVENT.pledgeAllowanceSet,
          EVENT.pledgeWrittenOff,
          EVENT.pledgePromoted,
          EVENT.pledgeOperationFailed,
        ],
        breakdownProperty: "entity_type",
      },
      {
        name: "Reporting and document workflows",
        description: "Tracks report and document engagement.",
        kind: "trends",
        events: [
          EVENT.reportGenerated,
          EVENT.reportBuilderDefinitionSaved,
          EVENT.reportBuilderPreviewGenerated,
          EVENT.ledgerAssistantAsked,
          EVENT.ledgerAssistantAnswered,
          EVENT.ledgerAssistantFailed,
          EVENT.draftingAssistantStarted,
          EVENT.draftingAssistantGenerated,
          EVENT.draftingAssistantFailed,
          EVENT.reportListFiltered,
          EVENT.reportOpened,
          EVENT.reportDownloadClicked,
          EVENT.reportShareStarted,
          EVENT.documentSelected,
          EVENT.documentUploaded,
          EVENT.documentDownloadClicked,
          EVENT.documentDeleted,
          EVENT.documentUploadFailed,
        ],
        breakdownProperty: "report_type",
      },
      {
        name: "Import and award intake workflows",
        description: "Tracks import preparation and AI award document intake journeys.",
        kind: "trends",
        events: [
          EVENT.migrationStudioPlanViewed,
          "import_file_selected",
          "import_template_downloaded",
          "import_preview_started",
          "award_intake_started",
          "award_intake_field_actioned",
          "award_intake_committed",
        ],
        breakdownProperty: "import_type",
      },
      {
        name: "Discovery and navigation workflows",
        description: "Shows whether users find records and use high-intent navigation.",
        kind: "trends",
        events: [
          EVENT.recordFilterChanged,
          EVENT.savedViewCreated,
          EVENT.savedViewApplied,
          EVENT.recordViewChanged,
          EVENT.detailTabViewed,
          EVENT.donorExportCompleted,
          EVENT.commandPaletteOpened,
          EVENT.commandPaletteCommandSelected,
        ],
        breakdownProperty: "surface",
      },
      {
        name: "Imports, accounting, and reconciliation",
        description: "Tracks operational workflows that indicate durable usage.",
        kind: "trends",
        events: [
          EVENT.importCompleted,
          EVENT.journalEntryCreated,
          EVENT.reconciliationStarted,
          EVENT.reconciliationCompleted,
        ],
        breakdownProperty: "accounting_system",
      },
      {
        name: "Accounting lifecycle",
        description:
          "Tracks chart of accounts, fiscal periods, bank transactions, recurring entries, and integrations.",
        kind: "trends",
        events: [
          "account_created",
          "account_updated",
          "chart_of_accounts_seeded",
          "fiscal_period_created",
          "fiscal_period_updated",
          "fiscal_period_closed",
          "journal_entry_reversed",
          "opening_balances_seeded",
          "bank_account_created",
          "bank_account_updated",
          "bank_account_deleted",
          "bank_transactions_imported",
          "bank_transaction_matched",
          "bank_transaction_ignored",
          "bank_transaction_unmatched",
          "reconciliation_cancelled",
          "recurring_template_created",
          "recurring_template_updated",
          "recurring_template_deleted",
          "recurring_template_run",
          "accounting_enabled",
          "accounting_integration_connect_started",
          "accounting_integration_sync_started",
        ],
        breakdownProperty: "accounting_system",
      },
      {
        name: "Payments, programs, and restrictions",
        description:
          "Tracks reimbursement/payment requests, program budgets, allocations, and restricted-fund lifecycle actions.",
        kind: "trends",
        events: [
          "payment_request_created",
          "payment_request_updated",
          "payment_request_deleted",
          "payment_request_transitioned",
          "payment_request_line_added",
          "payment_request_line_updated",
          "payment_request_line_removed",
          "payment_request_adjustment_created",
          "payment_request_payment_recorded",
          "payment_request_payment_removed",
          "payment_request_indirect_recomputed",
          "indirect_cost_rule_created",
          "indirect_cost_rule_updated",
          "indirect_cost_rule_deleted",
          "program_created",
          "program_updated",
          "program_archived",
          "program_budget_created",
          "program_budget_updated",
          "program_budget_vs_actual_exported",
          EVENT.outcomeGoalCreated,
          EVENT.outcomeIndicatorCreated,
          EVENT.outcomeOperationFailed,
          "grant_program_allocations_replaced",
          "expense_program_allocations_replaced",
          "restriction_term_created",
          "restriction_term_updated",
          "restriction_term_deleted",
          "restriction_addition_created",
          "restriction_release_created",
          "restriction_evidence_linked",
          "restricted_rollforward_generated",
        ],
        breakdownProperty: "status",
      },
      {
        name: "Budget Sentinel risk monitoring",
        description:
          "Tracks Sentinel views, filters, drill-ins, created alerts, and email sends for grant budget risk workflows.",
        kind: "trends",
        events: [
          EVENT.budgetSentinelViewed,
          EVENT.budgetSentinelFilterChanged,
          EVENT.budgetSentinelItemOpened,
          EVENT.budgetSentinelAlertCreated,
          EVENT.budgetSentinelEmailSent,
        ],
      },
      {
        name: "Accounting anomaly monitoring",
        description:
          "Tracks accounting anomaly feed usage, filtering, item review, alert creation, and email delivery.",
        kind: "trends",
        events: [
          EVENT.accountingAnomalyViewed,
          EVENT.accountingAnomalyFeedLoaded,
          EVENT.accountingAnomalyFilterChanged,
          EVENT.accountingAnomalyItemOpened,
          EVENT.accountingAnomalyAlertCreated,
          EVENT.accountingAnomalyEmailSent,
        ],
        breakdownProperty: "severity",
      },
      {
        name: "Allocation and restriction automation",
        description:
          "Tracks allocation rules, allocation bases, target setting, and restriction classification suggestions.",
        kind: "trends",
        events: [
          EVENT.allocationBaseCreated,
          EVENT.allocationBaseUpdated,
          EVENT.allocationBaseDeleted,
          EVENT.allocationRuleCreated,
          EVENT.allocationRuleUpdated,
          EVENT.allocationRuleDeleted,
          EVENT.allocationTargetsSet,
          EVENT.restrictionClassificationSuggested,
        ],
        breakdownProperty: "operation",
      },
      {
        name: "Cross-entity operations",
        description:
          "Tracks entity creation, updates, archiving, switching, dashboard customization, and rollup reports.",
        kind: "trends",
        events: [
          EVENT.entityCreated,
          EVENT.entityUpdated,
          EVENT.entityArchived,
          EVENT.entitySwitchCompleted,
          EVENT.entitySwitchDenied,
          EVENT.dashboardHomeCustomized,
          EVENT.rollupReportGenerated,
        ],
        breakdownProperty: "entity_type",
      },
      {
        name: "Donor lapse and reviewer scopes",
        description: "Tracks donor lapse review and external reviewer scope changes.",
        kind: "trends",
        events: [
          EVENT.donorLapseViewed,
          EVENT.donorLapseFilterChanged,
          EVENT.reviewerScopesUpdated,
        ],
        breakdownProperty: "surface",
      },
      {
        name: "Reimbursement, audit, and guardrail workflows",
        description:
          "Tracks cash-flow radar usage, audit readiness binders, and Uniform Guidance guardrails.",
        kind: "trends",
        events: [
          EVENT.reimbursementCashFlowRadarViewed,
          EVENT.auditReadinessBinderCreated,
          EVENT.uniformGuidanceGuardrailsBlocked,
          EVENT.uniformGuidanceGuardrailsPreviewed,
        ],
        breakdownProperty: "surface",
      },
      {
        name: "AI CS adoption",
        description:
          "Tracks AI customer-support sessions, answers, navigation suggestions, and escalation requests.",
        kind: "trends",
        events: [
          EVENT.aiCsSessionStarted,
          EVENT.aiCsAnswerCompleted,
          EVENT.aiCsNavigationSuggested,
          EVENT.aiCsEscalationRequested,
        ],
        breakdownProperty: "surface",
      },
      {
        name: "External review and evidence sharing",
        description:
          "Tracks reviewer access, review sessions, evidence bundles, and quick-share workflows.",
        kind: "trends",
        events: [
          "external_reviewer_created",
          "external_reviewer_updated",
          "external_reviewer_deleted",
          "reviewer_session_created",
          "reviewer_session_revoked",
          "reviewer_session_extended",
          "evidence_bundle_created",
          "evidence_bundle_updated",
          "evidence_bundle_deleted",
          "evidence_bundle_published",
          "evidence_bundle_item_added",
          "evidence_bundle_item_removed",
          "evidence_bundle_items_reordered",
          "quick_share_created",
        ],
        breakdownProperty: "access_level",
      },
      {
        name: "Subrecipient monitoring adoption",
        description: "Tracks subrecipient, subaward, monitoring, finding, and evidence workflows.",
        kind: "trends",
        events: [
          EVENT.subrecipientCreated,
          EVENT.subrecipientUpdated,
          EVENT.subrecipientDeleted,
          EVENT.subawardCreated,
          EVENT.subawardUpdated,
          EVENT.subawardRiskAssessmentCreated,
          EVENT.subawardMonitoringTasksGenerated,
          EVENT.subawardMonitoringLogCreated,
          EVENT.subawardFindingCreated,
          EVENT.subawardEvidenceBundleCreated,
          EVENT.monitoringTaskUpdated,
          EVENT.findingUpdated,
          EVENT.correctiveActionCreated,
          EVENT.correctiveActionUpdated,
        ],
        breakdownProperty: "risk_rating",
      },
    ],
  },
  {
    name: "GrantPipe - Billing and Retention",
    description:
      "Plan choice, checkout, subscription, payment, and retention signals for revenue decisions.",
    insights: [
      {
        name: "Trial and upgrade funnel",
        description: "Shows trial movement into upgrade and checkout intent.",
        kind: "funnel",
        events: [
          EVENT.trialStarted,
          EVENT.upgradePromptShown,
          EVENT.upgradeClicked,
          EVENT.checkoutStarted,
          EVENT.checkoutCompleted,
          EVENT.subscriptionStarted,
        ],
      },
      {
        name: "Plan and billing selections",
        description: "Tracks selected plans, saved billing choices, and portal opens.",
        kind: "trends",
        events: [
          EVENT.planSelected,
          EVENT.billingSelectionSaved,
          EVENT.aiUsageCapPromptViewed,
          EVENT.aiUsageCapPromptClicked,
          EVENT.billingPortalOpened,
          EVENT.cancellationStarted,
        ],
        breakdownProperty: "plan_tier",
      },
      {
        name: "Payment and churn health",
        description: "Tracks failed, recovered, expired, and canceled payment states.",
        kind: "trends",
        events: [
          EVENT.paymentFailed,
          EVENT.paymentRecovered,
          EVENT.trialEndingSoon,
          EVENT.trialExpired,
          EVENT.subscriptionCanceled,
        ],
        breakdownProperty: "billing_cycle",
      },
      {
        name: "Billing friction",
        description: "Tracks failed plan, checkout, billing portal, and payment-operation paths.",
        kind: "trends",
        events: [
          "checkout_start_failed",
          "billing_portal_failed",
          "plan_selection_failed",
          "payment_operation_failed",
        ],
        breakdownProperty: "failure_type",
      },
    ],
  },
  {
    name: "GrantPipe - Friction and Support",
    description:
      "Failure, help, feedback, org administration, and grant-opportunity signals that explain where users need help.",
    insights: [
      {
        name: "Failure events by surface",
        description: "Tracks workflow failures that can block adoption or revenue.",
        kind: "trends",
        events: [
          EVENT.importFailed,
          EVENT.reportGenerationFailed,
          EVENT.reportBuilderOperationFailed,
          EVENT.aiSdrSessionFailed,
          EVENT.errorBoundaryTriggered,
        ],
        breakdownProperty: "failure_type",
      },
      {
        name: "Product operation failures",
        description:
          "Tracks failed operations across product domains so friction can be prioritized.",
        kind: "trends",
        events: [
          "accounting_operation_failed",
          EVENT.accountingAnomalyOperationFailed,
          EVENT.aiCsFailed,
          EVENT.allocationOperationFailed,
          EVENT.auditReadinessBinderFailed,
          "award_intake_failed",
          "donor_operation_failed",
          "external_review_operation_failed",
          "grant_operation_failed",
          EVENT.budgetSentinelOperationFailed,
          "program_operation_failed",
          EVENT.reimbursementCashFlowRadarFailed,
          "restriction_operation_failed",
        ],
        breakdownProperty: "operation",
      },
      {
        name: "Navigation and shell behavior",
        description:
          "Tracks app-shell navigation actions that shape each authenticated user journey.",
        kind: "trends",
        events: ["app_mobile_nav_opened", "app_nav_item_clicked", "app_nav_section_toggled"],
        breakdownProperty: "surface",
      },
      {
        name: "Help and feedback demand",
        description: "Shows help intent, task clicks, guide completion, and submitted feedback.",
        kind: "trends",
        events: [
          EVENT.helpOpened,
          EVENT.helpSearched,
          EVENT.helpTaskClicked,
          EVENT.helpArticleCtaClicked,
          EVENT.helpGuideCompleted,
          EVENT.feedbackSubmitted,
        ],
        breakdownProperty: "surface",
      },
      {
        name: "Org administration activity",
        description: "Tracks profile, invite, member, and acknowledgment setup activity.",
        kind: "trends",
        events: [
          EVENT.orgProfileUpdated,
          EVENT.inviteCreated,
          EVENT.inviteAccepted,
          EVENT.orgMemberUpdated,
          EVENT.acknowledgmentTemplateUpdated,
        ],
        breakdownProperty: "target_role",
      },
      {
        name: "Grant opportunity intent",
        description: "Shows search and apply intent for grant opportunities.",
        kind: "trends",
        events: [
          EVENT.grantOpportunitySearchSubmitted,
          EVENT.grantOpportunityViewChanged,
          EVENT.grantOpportunityApplyClicked,
        ],
        breakdownProperty: "source",
      },
    ],
  },
  {
    name: "GrantPipe - Executive Decisions",
    description:
      "Cross-functional KPIs for marketing attribution, monetization, and retention decisions.",
    insights: [
      {
        // utm_source is present on lead_created (server) and signup_started (client) but NOT on
        // the server-side signup_completed capture, so attribution stays on the top-of-funnel
        // events that actually carry the source.
        name: "Leads and signup starts by UTM source",
        description:
          "Attributes leads and signup starts to acquisition source for channel-spend decisions.",
        kind: "trends",
        events: [EVENT.leadCreated, EVENT.signupStarted],
        breakdownProperty: "utm_source",
      },
      {
        name: "Trial to paid conversion",
        description: "Measures how trials move through checkout into a started paid subscription.",
        kind: "funnel",
        events: [
          EVENT.trialStarted,
          EVENT.checkoutStarted,
          EVENT.checkoutCompleted,
          EVENT.subscriptionStarted,
        ],
      },
      {
        name: "Subscription revenue trend",
        description: "Sums new subscription revenue per week, split by billing cycle.",
        kind: "trends",
        events: [EVENT.subscriptionStarted],
        math: "sum",
        mathProperty: "amount_cents",
        breakdownProperty: "billing_cycle",
      },
      {
        name: "AI SDR conversion funnel",
        description: "Tracks AI SDR sessions becoming generated and then sent drafts.",
        kind: "funnel",
        events: [EVENT.aiSdrSessionStarted, EVENT.aiSdrDraftGenerated, EVENT.aiSdrDraftSent],
      },
      {
        name: "Feature stickiness (weekly active users)",
        description:
          "Weekly active users per core feature. Org-level grouping is not configured, so this uses unique users as the stickiness proxy.",
        kind: "trends",
        math: "weekly_active",
        events: [
          EVENT.contactCreated,
          EVENT.grantCreated,
          EVENT.fundCreated,
          EVENT.reportGenerated,
          EVENT.importCompleted,
          EVENT.journalEntryCreated,
        ],
        // No breakdown: each event is its own weekly-active series (one per feature). An
        // entity_type breakdown would be inconsistent because report_generated carries
        // report_type, not entity_type, and would silently bucket as "(empty)".
      },
      {
        name: "New org retention by signup cohort",
        description:
          "Weekly retention of newly signed-up orgs returning to generate reports — the inverse of churn.",
        kind: "retention",
        events: [EVENT.signupCompleted, EVENT.reportGenerated],
        retention: {
          targetEvent: EVENT.signupCompleted,
          returningEvent: EVENT.reportGenerated,
          period: "Week",
        },
      },
    ],
  },
];

export function getCoveredAnalyticsEvents(dashboards: PostHogDashboardSpec[]): Set<string> {
  return new Set(
    dashboards.flatMap((dashboard) => dashboard.insights.flatMap((insight) => insight.events)),
  );
}

function canonicalAnalyticsEvents(): string[] {
  return Object.values(ANALYTICS_EVENTS);
}

export function getUncoveredAnalyticsEvents(dashboards: PostHogDashboardSpec[]): string[] {
  const covered = getCoveredAnalyticsEvents(dashboards);
  return canonicalAnalyticsEvents()
    .filter((eventName) => !covered.has(eventName))
    .sort();
}

export function buildDashboardPlan(dashboards: PostHogDashboardSpec[]) {
  const coveredEvents = getCoveredAnalyticsEvents(dashboards);
  return {
    dashboardCount: dashboards.length,
    insightCount: dashboards.reduce((sum, dashboard) => sum + dashboard.insights.length, 0),
    coveredEventCount: coveredEvents.size,
    uncoveredEvents: getUncoveredAnalyticsEvents(dashboards),
    dashboards: dashboards.map((dashboard) => ({
      name: dashboard.name,
      insightCount: dashboard.insights.length,
      events: Array.from(getCoveredAnalyticsEvents([dashboard])).sort(),
    })),
  };
}

export function buildPostHogApiUrl(host: string, environmentId: string, path: string): string {
  const normalizedHost = host.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedHost}/api/environments/${environmentId}${normalizedPath}`;
}

function buildQuery(insight: PostHogInsightSpec): PostHogQueryNode {
  const dateRange = { date_from: "-90d" };
  if (insight.kind === "funnel") {
    return {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange,
        steps: insight.events.map((eventName) => ({
          kind: "EventsNode",
          event: eventName,
          name: eventName,
        })),
      },
    };
  }

  if (insight.kind === "retention") {
    if (!insight.retention) {
      throw new Error(`Retention insight "${insight.name}" is missing a retention spec.`);
    }
    const { targetEvent, returningEvent, period } = insight.retention;
    return {
      kind: "InsightVizNode",
      source: {
        kind: "RetentionQuery",
        dateRange,
        retentionFilter: {
          retentionType: "retention_first_time",
          period,
          totalIntervals: period === "Week" ? 8 : 6,
          targetEntity: { id: targetEvent, name: targetEvent, type: "events" },
          returningEntity: { id: returningEvent, name: returningEvent, type: "events" },
        },
      },
    };
  }

  const math: TrendsMath = insight.math ?? "total";
  if (math === "sum" && !insight.mathProperty) {
    throw new Error(`Trends insight "${insight.name}" uses sum math without a mathProperty.`);
  }
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange,
      interval: "week",
      series: insight.events.map((eventName) => ({
        kind: "EventsNode",
        event: eventName,
        name: eventName,
        math,
        ...(math === "sum" && insight.mathProperty ? { math_property: insight.mathProperty } : {}),
      })),
      ...(insight.breakdownProperty
        ? {
            breakdownFilter: {
              breakdown: insight.breakdownProperty,
              breakdown_type: "event",
            },
          }
        : {}),
    },
  };
}

export function buildInsightPayload(dashboardId: number, insight: PostHogInsightSpec) {
  return {
    name: insight.name,
    description: insight.description,
    dashboards: [dashboardId],
    tags: ["grantpipe", "analytics-as-code"],
    query: buildQuery(insight),
  };
}

export function parseArgs(args: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
  const parsed: ParsedArgs = {
    apply: false,
    host: env.POSTHOG_APP_HOST?.trim() || "https://us.posthog.com",
    environmentId: env.POSTHOG_ENVIRONMENT_ID?.trim() || env.POSTHOG_PROJECT_ID?.trim(),
    apiKey: env.POSTHOG_PERSONAL_API_KEY?.trim(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.apply = false;
      continue;
    }
    if (arg === "--host" || arg === "--environment-id" || arg === "--api-key") {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      index += 1;
      if (arg === "--host") parsed.host = value;
      if (arg === "--environment-id") parsed.environmentId = value;
      if (arg === "--api-key") parsed.apiKey = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function isEntrypoint(metaUrl: string, argvEntry = process.argv[1]): boolean {
  return argvEntry !== undefined && fileURLToPath(metaUrl) === argvEntry;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function postHogRequest<T>(
  args: ParsedArgs,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!args.environmentId) throw new Error("POSTHOG_ENVIRONMENT_ID is required for --apply.");
  if (!args.apiKey) throw new Error("POSTHOG_PERSONAL_API_KEY is required for --apply.");

  const response = await fetch(buildPostHogApiUrl(args.host, args.environmentId, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`PostHog API ${response.status} for ${path}: ${await response.text()}`);
  }
  return readJson<T>(response);
}

async function findDashboard(
  args: ParsedArgs,
  name: string,
): Promise<PostHogDashboard | undefined> {
  const response = await postHogRequest<PostHogListResponse<PostHogDashboard>>(
    args,
    `/dashboards/?search=${encodeURIComponent(name)}`,
  );
  return response.results?.find((dashboard) => dashboard.name === name);
}

async function upsertDashboard(
  args: ParsedArgs,
  dashboard: PostHogDashboardSpec,
): Promise<PostHogDashboard> {
  const existing = await findDashboard(args, dashboard.name);
  const payload = {
    name: dashboard.name,
    description: dashboard.description,
    pinned: true,
    tags: ["grantpipe", "analytics-as-code"],
  };
  if (existing) {
    return postHogRequest<PostHogDashboard>(args, `/dashboards/${existing.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return postHogRequest<PostHogDashboard>(args, "/dashboards/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function findInsight(args: ParsedArgs, name: string): Promise<PostHogInsight | undefined> {
  const response = await postHogRequest<PostHogListResponse<PostHogInsight>>(
    args,
    `/insights/?search=${encodeURIComponent(name)}`,
  );
  return response.results?.find((insight) => insight.name === name);
}

async function upsertInsight(
  args: ParsedArgs,
  dashboardId: number,
  insight: PostHogInsightSpec,
): Promise<PostHogInsight> {
  const existing = await findInsight(args, insight.name);
  const payload = buildInsightPayload(dashboardId, insight);
  if (existing) {
    return postHogRequest<PostHogInsight>(args, `/insights/${existing.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return postHogRequest<PostHogInsight>(args, "/insights/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function syncPostHogDashboards(args: ParsedArgs): Promise<void> {
  const plan = buildDashboardPlan(POSTHOG_DASHBOARDS);
  if (plan.uncoveredEvents.length > 0) {
    throw new Error(`Dashboard manifest misses events: ${plan.uncoveredEvents.join(", ")}`);
  }

  if (!args.apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  for (const dashboard of POSTHOG_DASHBOARDS) {
    const syncedDashboard = await upsertDashboard(args, dashboard);
    for (const insight of dashboard.insights) {
      await upsertInsight(args, syncedDashboard.id, insight);
    }
    console.log(`Synced ${dashboard.name} (${dashboard.insights.length} insights)`);
  }
}

if (isEntrypoint(import.meta.url)) {
  syncPostHogDashboards(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
