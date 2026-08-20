import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENTS,
  MEANINGFUL_PRODUCT_EVENTS,
  isAnalyticsEventName,
  isMeaningfulProductEvent,
} from "./analytics";

describe("ANALYTICS_EVENTS", () => {
  it("keeps canonical lifecycle event names in snake_case", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      signupStarted: "signup_started",
      signupSubmitted: "signup_submitted",
      signupCompleted: "signup_completed",
      signupFailed: "signup_failed",
      leadCreated: "lead_created",
      planSelected: "plan_selected",
      trialStarted: "trial_started",
      trialWrapupDiscovered: "trial_wrapup_discovered",
      trialWrapupDelivered: "trial_wrapup_delivered",
      checkoutStarted: "checkout_started",
      checkoutCompleted: "checkout_completed",
      subscriptionStarted: "subscription_started",
      onboardingStepViewed: "onboarding_step_viewed",
      onboardingStepCompleted: "onboarding_step_completed",
      onboardingCompleted: "onboarding_completed",
      activationCompleted: "activation_completed",
    });
  });

  it("keeps canonical product and churn events available for dashboards", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      contactCreated: "contact_created",
      grantCreated: "grant_created",
      fundCreated: "fund_created",
      funderCreated: "funder_created",
      grantFundAllocationCreated: "grant_fund_allocation_created",
      importCompleted: "import_completed",
      importFailed: "import_failed",
      reportGenerated: "report_generated",
      reportGenerationFailed: "report_generation_failed",
      reportBuilderDefinitionSaved: "report_builder_definition_saved",
      reportBuilderPreviewGenerated: "report_builder_preview_generated",
      reportBuilderOperationFailed: "report_builder_operation_failed",
      ledgerAssistantGateBlocked: "ledger_assistant_gate_blocked",
      reconciliationStarted: "reconciliation_started",
      reconciliationCompleted: "reconciliation_completed",
      orgProfileUpdated: "org_profile_updated",
      inviteCreated: "invite_created",
      orgMemberUpdated: "org_member_updated",
      billingPortalOpened: "billing_portal_opened",
      billingSelectionSaved: "billing_selection_saved",
      cancellationStarted: "cancellation_started",
      feedbackSubmitted: "feedback_submitted",
      helpOpened: "help_opened",
    });
  });

  it("reserves multi-entity event names for entity setup, switching, and roll-up proof", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      entityCreated: "entity_created",
      entityUpdated: "entity_updated",
      entityArchived: "entity_archived",
      entitySwitchCompleted: "entity_switch_completed",
      entitySwitchDenied: "entity_switch_denied",
      rollupReportGenerated: "rollup_report_generated",
    });
    expect(isAnalyticsEventName("entity_created")).toBe(true);
    expect(isAnalyticsEventName("entity_updated")).toBe(true);
    expect(isAnalyticsEventName("entity_archived")).toBe(true);
    expect(isAnalyticsEventName("entity_switch_completed")).toBe(true);
    expect(isAnalyticsEventName("entity_switch_denied")).toBe(true);
    expect(isAnalyticsEventName("rollup_report_generated")).toBe(true);
  });

  it("exposes paymentRecovered for subscription renewal and recovery tracking", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      paymentFailed: "payment_failed",
      paymentRecovered: "payment_recovered",
    });
  });

  it("does not expose retired donor-side Stripe Connect tracking events", () => {
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("recurring_gift_connect_started");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("recurring_gift_checkout_started");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("recurring_gift_payment_failed");
    expect(isAnalyticsEventName("recurring_gift_connect_started")).toBe(false);
    expect(isAnalyticsEventName("recurring_gift_checkout_started")).toBe(false);
  });

  it("reserves reimbursement cash-flow radar events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      reimbursementCashFlowRadarViewed: "reimbursement_cash_flow_radar_viewed",
      reimbursementCashFlowRadarFailed: "reimbursement_cash_flow_radar_failed",
    });
    expect(isAnalyticsEventName("reimbursement_cash_flow_radar_viewed")).toBe(true);
    expect(isAnalyticsEventName("reimbursement_cash_flow_radar_failed")).toBe(true);
  });

  it("reserves accounting anomaly detector events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      accountingAnomalyViewed: "accounting_anomaly_viewed",
      accountingAnomalyFeedLoaded: "accounting_anomaly_feed_loaded",
      accountingAnomalyFilterChanged: "accounting_anomaly_filter_changed",
      accountingAnomalyItemOpened: "accounting_anomaly_item_opened",
      accountingAnomalyAlertCreated: "accounting_anomaly_alert_created",
      accountingAnomalyEmailSent: "accounting_anomaly_email_sent",
      accountingAnomalyOperationFailed: "accounting_anomaly_operation_failed",
    });
    expect(isAnalyticsEventName("accounting_anomaly_viewed")).toBe(true);
    expect(isAnalyticsEventName("accounting_anomaly_filter_changed")).toBe(true);
    expect(isAnalyticsEventName("accounting_anomaly_item_opened")).toBe(true);
    expect(isAnalyticsEventName("accounting_anomaly_alert_created")).toBe(true);
    expect(isAnalyticsEventName("accounting_anomaly_email_sent")).toBe(true);
    expect(isAnalyticsEventName("accounting_anomaly_operation_failed")).toBe(true);
  });

  it("reserves Uniform Guidance cost guardrail events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      uniformGuidanceGuardrailsBlocked: "uniform_guidance_guardrails_blocked",
      uniformGuidanceGuardrailsPreviewed: "uniform_guidance_guardrails_previewed",
    });
    expect(isAnalyticsEventName("uniform_guidance_guardrails_blocked")).toBe(true);
    expect(isAnalyticsEventName("uniform_guidance_guardrails_previewed")).toBe(true);
  });

  it("reserves audit-readiness score and binder events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      auditReadinessBinderCreated: "audit_readiness_binder_created",
      auditReadinessBinderFailed: "audit_readiness_binder_failed",
    });
    expect(isAnalyticsEventName("audit_readiness_binder_created")).toBe(true);
    expect(isAnalyticsEventName("audit_readiness_binder_failed")).toBe(true);
  });

  it("exposes trial lifecycle and upgrade-intent events for conversion tracking", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      trialStarted: "trial_started",
      trialEndingSoon: "trial_ending_soon",
      trialWrapupScheduled: "trial_wrapup_scheduled",
      trialExpired: "trial_expired",
      upgradePromptShown: "upgrade_prompt_shown",
      upgradeClicked: "upgrade_clicked",
    });
    expect(isAnalyticsEventName("trial_ending_soon")).toBe(true);
    expect(isAnalyticsEventName("trial_expired")).toBe(true);
    expect(isAnalyticsEventName("upgrade_prompt_shown")).toBe(true);
    expect(isAnalyticsEventName("upgrade_clicked")).toBe(true);
  });

  it("reserves the canonical ai_sdr event surface", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      aiSdrSessionStarted: "ai_sdr_session_started",
      aiSdrDraftGenerated: "ai_sdr_draft_generated",
      aiSdrDraftSent: "ai_sdr_draft_sent",
      aiSdrDraftDiscarded: "ai_sdr_draft_discarded",
      aiSdrSessionFailed: "ai_sdr_session_failed",
    });
  });

  it("reserves the canonical ai_cs support-assistant event surface", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      aiCsSessionStarted: "ai_cs_session_started",
      aiCsAnswerCompleted: "ai_cs_answer_completed",
      aiCsNavigationSuggested: "ai_cs_navigation_suggested",
      aiCsEscalationRequested: "ai_cs_escalation_requested",
      aiCsFailed: "ai_cs_failed",
    });
    expect(isAnalyticsEventName("ai_cs_session_started")).toBe(true);
    expect(isAnalyticsEventName("ai_cs_answer_completed")).toBe(true);
    expect(isAnalyticsEventName("ai_cs_navigation_suggested")).toBe(true);
    expect(isAnalyticsEventName("ai_cs_escalation_requested")).toBe(true);
    expect(isAnalyticsEventName("ai_cs_failed")).toBe(true);
  });

  it("reserves proposal and report drafting assistant events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      draftingAssistantStarted: "drafting_assistant_started",
      draftingAssistantGenerated: "drafting_assistant_generated",
      draftingAssistantFailed: "drafting_assistant_failed",
    });
    expect(isAnalyticsEventName("drafting_assistant_started")).toBe(true);
    expect(isAnalyticsEventName("drafting_assistant_generated")).toBe(true);
    expect(isAnalyticsEventName("drafting_assistant_failed")).toBe(true);
  });

  it("exposes client navigation, auth-funnel, and reliability events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      detailTabViewed: "detail_tab_viewed",
      forgotPasswordSubmitted: "forgot_password_submitted",
      passwordResetCompleted: "password_reset_completed",
      errorBoundaryTriggered: "error_boundary_triggered",
    });
    expect(isAnalyticsEventName("detail_tab_viewed")).toBe(true);
    expect(isAnalyticsEventName("forgot_password_submitted")).toBe(true);
    expect(isAnalyticsEventName("password_reset_completed")).toBe(true);
    expect(isAnalyticsEventName("error_boundary_triggered")).toBe(true);
  });

  it("reserves public CTA and product-discovery event names for dashboards", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      acknowledgmentTemplateUpdated: "acknowledgment_template_updated",
      assessmentAbandoned: "assessment_abandoned",
      calculatorResultViewed: "calculator_result_viewed",
      documentDownloadClicked: "document_download_clicked",
      documentDeleted: "document_deleted",
      documentSelected: "document_selected",
      documentUploaded: "document_uploaded",
      grantOpportunityApplyClicked: "grant_opportunity_apply_clicked",
      grantOpportunitySearchSubmitted: "grant_opportunity_search_submitted",
      grantOpportunityViewChanged: "grant_opportunity_view_changed",
      helpArticleCtaClicked: "help_article_cta_clicked",
      helpGuideCompleted: "help_guide_completed",
      helpSearched: "help_searched",
      helpTaskClicked: "help_task_clicked",
      leadMagnetDeliverySuppressed: "lead_magnet_delivery_suppressed",
      recordFilterChanged: "record_filter_changed",
      recordViewChanged: "record_view_changed",
      reportListFiltered: "report_list_filtered",
      resourceCardClicked: "resource_card_clicked",
      savedViewCreated: "saved_view_created",
      savedViewApplied: "saved_view_applied",
      siteSearchClosed: "site_search_closed",
      assessmentResultLinkClicked: "assessment_result_link_clicked",
      calculatorCtaClicked: "calculator_cta_clicked",
      resourceFilterChanged: "resource_filter_changed",
      resourceFiltersCleared: "resource_filters_cleared",
      resourceSortChanged: "resource_sort_changed",
      commandPaletteOpened: "command_palette_opened",
      commandPaletteCommandSelected: "command_palette_command_selected",
      donorExportCompleted: "donor_export_completed",
      reportOpened: "report_opened",
      reportDownloadClicked: "report_download_clicked",
      reportShareStarted: "report_share_started",
      onboardingStepFailed: "onboarding_step_failed",
      onboardingBackClicked: "onboarding_back_clicked",
      onboardingAbandoned: "onboarding_abandoned",
      subrecipientCreated: "subrecipient_created",
      subrecipientUpdated: "subrecipient_updated",
      subrecipientDeleted: "subrecipient_deleted",
      subawardCreated: "subaward_created",
      subawardUpdated: "subaward_updated",
      subawardRiskAssessmentCreated: "subaward_risk_assessment_created",
      subawardMonitoringTasksGenerated: "subaward_monitoring_tasks_generated",
      subawardMonitoringLogCreated: "subaward_monitoring_log_created",
      subawardFindingCreated: "subaward_finding_created",
      subawardEvidenceBundleCreated: "subaward_evidence_bundle_created",
      monitoringTaskUpdated: "monitoring_task_updated",
      findingUpdated: "finding_updated",
      correctiveActionCreated: "corrective_action_created",
      correctiveActionUpdated: "corrective_action_updated",
    });
    expect(isAnalyticsEventName("document_download_clicked")).toBe(true);
    expect(isAnalyticsEventName("document_deleted")).toBe(true);
    expect(isAnalyticsEventName("saved_view_applied")).toBe(true);
    expect(isAnalyticsEventName("record_filter_changed")).toBe(true);
    expect(isAnalyticsEventName("site_search_closed")).toBe(true);
    expect(isAnalyticsEventName("command_palette_opened")).toBe(true);
    expect(isAnalyticsEventName("onboarding_abandoned")).toBe(true);
    expect(isAnalyticsEventName("subaward_monitoring_tasks_generated")).toBe(true);
    expect(isAnalyticsEventName("corrective_action_updated")).toBe(true);
  });

  it("reserves functional-expense allocation, dashboard, classifier, donor lapse, and reviewer-scope events", () => {
    expect(ANALYTICS_EVENTS).toMatchObject({
      allocationBaseCreated: "allocation_base_created",
      allocationBaseUpdated: "allocation_base_updated",
      allocationBaseDeleted: "allocation_base_deleted",
      allocationRuleCreated: "allocation_rule_created",
      allocationRuleUpdated: "allocation_rule_updated",
      allocationRuleDeleted: "allocation_rule_deleted",
      allocationTargetsSet: "allocation_targets_set",
      allocationOperationFailed: "allocation_operation_failed",
      dashboardHomeCustomized: "dashboard_home_customized",
      restrictionClassificationSuggested: "restriction_classification_suggested",
      donorLapseViewed: "donor_lapse_viewed",
      donorLapseFilterChanged: "donor_lapse_filter_changed",
      reviewerScopesUpdated: "reviewer_scopes_updated",
    });
    expect(isAnalyticsEventName("allocation_base_created")).toBe(true);
    expect(isAnalyticsEventName("allocation_rule_deleted")).toBe(true);
    expect(isAnalyticsEventName("allocation_targets_set")).toBe(true);
    expect(isAnalyticsEventName("dashboard_home_customized")).toBe(true);
    expect(isAnalyticsEventName("restriction_classification_suggested")).toBe(true);
    expect(isAnalyticsEventName("donor_lapse_viewed")).toBe(true);
    expect(isAnalyticsEventName("donor_lapse_filter_changed")).toBe(true);
    expect(isAnalyticsEventName("reviewer_scopes_updated")).toBe(true);
  });

  it("does not reintroduce legacy or dotted event names", () => {
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("sign_up");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("org.profile.updated");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("org.invite.created");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("org.member.updated");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("billing.selection.saved");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("billing.portal.opened");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("auth.invite.accepted");
  });
});

describe("app page tabs analytics events", () => {
  it("exposes the app_page_tab_clicked event alongside the existing nav-click events", () => {
    expect(ANALYTICS_EVENTS.appNavItemClicked).toBe("app_nav_item_clicked");
    expect(ANALYTICS_EVENTS.appNavSectionToggled).toBe("app_nav_section_toggled");
    expect(ANALYTICS_EVENTS.appPageTabClicked).toBe("app_page_tab_clicked");
    expect(isAnalyticsEventName("app_page_tab_clicked")).toBe(true);
  });
});

describe("ai usage cap analytics events", () => {
  it("exposes ai_usage_cap prompt viewed and clicked events", () => {
    expect(ANALYTICS_EVENTS.aiUsageCapPromptViewed).toBe("ai_usage_cap_prompt_viewed");
    expect(ANALYTICS_EVENTS.aiUsageCapPromptClicked).toBe("ai_usage_cap_prompt_clicked");
    expect(isAnalyticsEventName("ai_usage_cap_prompt_viewed")).toBe(true);
    expect(isAnalyticsEventName("ai_usage_cap_prompt_clicked")).toBe(true);
  });
});

describe("activation analytics events", () => {
  it("exposes First Light onboarding aha events", () => {
    expect(ANALYTICS_EVENTS.onboardingTimezoneAutodetected).toBe(
      "onboarding_timezone_autodetected",
    );
    expect(ANALYTICS_EVENTS.onboardingAhaBannerViewed).toBe("onboarding_aha_banner_viewed");
    expect(ANALYTICS_EVENTS.onboardingAhaExamplesCleared).toBe("onboarding_aha_examples_cleared");
    expect(ANALYTICS_EVENTS.onboardingAhaExamplesClearFailed).toBe(
      "onboarding_aha_examples_clear_failed",
    );
    expect(isAnalyticsEventName("onboarding_aha_examples_clear_failed")).toBe(true);
  });

  it("exposes the onboarding activation event names", () => {
    expect(ANALYTICS_EVENTS.onboardingGoalSelected).toBe("onboarding_goal_selected");
    expect(ANALYTICS_EVENTS.onboardingSampleDataChosen).toBe("onboarding_sample_data_chosen");
    expect(ANALYTICS_EVENTS.sampleDataSeeded).toBe("sample_data_seeded");
    expect(ANALYTICS_EVENTS.sampleDataCleared).toBe("sample_data_cleared");
    expect(ANALYTICS_EVENTS.activationFirstValueViewed).toBe("activation_first_value_viewed");
  });
});

describe("meaningful product events", () => {
  it("defines the first-value actions that can complete activation", () => {
    expect(MEANINGFUL_PRODUCT_EVENTS).toEqual([
      "contact_created",
      "grant_created",
      "fund_created",
      "import_completed",
      "report_generated",
      "journal_entry_created",
      "reconciliation_completed",
    ]);
  });

  it("narrows known analytics and meaningful product event names", () => {
    expect(isAnalyticsEventName("signup_completed")).toBe(true);
    expect(isAnalyticsEventName("sign_up")).toBe(false);
    expect(isMeaningfulProductEvent("grant_created")).toBe(true);
    expect(isMeaningfulProductEvent("login_completed")).toBe(false);
  });
});
