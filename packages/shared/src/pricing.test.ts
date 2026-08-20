import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PLAN_ENTITLEMENTS, PLAN_TIERS, type PlanEntitlements } from "./constants";
import {
  DEFAULT_BILLING_CYCLE,
  FEDERAL_EDITION_SKU,
  FOUNDER_BOOKING_URLS,
  GRANTPIPE_GUARANTEE_COPY,
  GRANTPIPE_GUARANTEE_STACK,
  GRANTPIPE_TRIAL_COPY,
  LAUNCH_PROMO,
  LAUNCH_PROMO_PHASES,
  MARKETED_FEATURE_CATALOG,
  MARKETED_FEATURE_GROUPS,
  PLAN_CATALOG,
  PREMIUM_FEATURE_KEYS,
  TRIAL_EFFECTIVE_PLAN_TIER,
  UNIVERSAL_PLAN_INCLUSIONS,
  getActiveGrantCap,
  getBillingCycleLabel,
  getEffectivePlanTier,
  formatMinimumPlanLabelForFeatures,
  getFederalEditionSku,
  getLaunchPromoDisplayPrice,
  getLaunchPromoForBillingCycle,
  getLaunchPromoPriceCents,
  getGrantPipePricingCopy,
  getMarketedFeatureCellLabel,
  getMarketedFeatureRows,
  getMinimumPlanForFeatures,
  getPlanEntitlementLabelList,
  getPlanDisplayPrice,
  getPlanListDisplayPrice,
  getPlanLabelsWithEntitlement,
  getPlanPromoDisplayPrice,
  getPlanEntitlements,
  getPlanPriceCents,
  getPlanTierRank,
  getSelfServePlans,
  isLaunchPromoEligible,
  isPlanTierAtLeast,
  isPremiumFeatureKey,
  isSelfServePlan,
  normalizePlanTier,
  normalizePromoCode,
  pickActiveLaunchPhase,
} from "./pricing";

describe("GrantPipe pricing catalog", () => {
  it("uses annual billing as the default cycle", () => {
    expect(DEFAULT_BILLING_CYCLE).toBe("annual");
  });

  it("defines the four current commercial tiers in order", () => {
    expect(PLAN_CATALOG.map((plan) => plan.tier)).toEqual([
      "starter",
      "growth",
      "audit_ready",
      "enterprise",
    ]);
  });

  it("keeps Enterprise out of self-serve Stripe checkout", () => {
    expect(getSelfServePlans().map((plan) => plan.tier)).toEqual([
      "starter",
      "growth",
      "audit_ready",
    ]);
    expect(isSelfServePlan("audit_ready")).toBe(true);
    expect(isSelfServePlan("enterprise")).toBe(false);
    expect(isSelfServePlan("invalid" as never)).toBe(true);
  });

  it("stores exact monthly and annual prices for marketed plans", () => {
    expect(getPlanPriceCents("starter", "monthly")).toBe(4900);
    expect(getPlanPriceCents("starter", "annual")).toBe(46800);
    expect(getPlanPriceCents("growth", "monthly")).toBe(9900);
    expect(getPlanPriceCents("growth", "annual")).toBe(94800);
    expect(getPlanPriceCents("audit_ready", "monthly")).toBe(19900);
    expect(getPlanPriceCents("audit_ready", "annual")).toBe(190800);
    expect(getPlanPriceCents("enterprise", "monthly")).toBe(0);
    expect(getPlanPriceCents("enterprise", "annual")).toBe(0);
  });

  it("formats annual default display as monthly equivalent billed annually", () => {
    expect(getPlanDisplayPrice("starter", "annual")).toBe("$39/mo billed annually");
    expect(getPlanDisplayPrice("growth", "annual")).toBe("$79/mo billed annually");
    expect(getPlanDisplayPrice("audit_ready", "annual")).toBe("$159/mo billed annually");
    expect(getPlanDisplayPrice("enterprise", "annual")).toBe("Custom pricing");
  });

  it("formats monthly display prices for self-serve plans", () => {
    expect(getPlanDisplayPrice("starter", "monthly")).toBe("$49/mo");
    expect(getPlanDisplayPrice("growth", "monthly")).toBe("$99/mo");
    expect(getPlanDisplayPrice("audit_ready", "monthly")).toBe("$199/mo");
    expect(getPlanDisplayPrice("enterprise", "monthly")).toBe("Custom pricing");
  });

  it("keeps annual billing at least 20 percent below monthly billing", () => {
    for (const tier of ["starter", "growth", "audit_ready"] as const) {
      const monthlyAnnualizedCents = getPlanPriceCents(tier, "monthly") * 12;
      const annualCents = getPlanPriceCents(tier, "annual");

      expect(annualCents).toBeLessThanOrEqual(monthlyAnnualizedCents * 0.8);
    }
  });

  it("exposes active grant caps and additive entitlements", () => {
    expect(getActiveGrantCap("starter")).toBe(10);
    expect(getActiveGrantCap("growth")).toBe(50);
    expect(getActiveGrantCap("audit_ready")).toBe(100);
    expect(getActiveGrantCap("enterprise")).toBe(Number.POSITIVE_INFINITY);
    expect(getPlanEntitlements("starter").hasGrantOpportunitySearch).toBe(true);
    expect(getPlanEntitlements("growth").hasGuidedOnboarding).toBe(false);
    expect(getPlanEntitlements("audit_ready").hasGuidedOnboarding).toBe(true);
    expect(getPlanEntitlements("enterprise").hasGuidedOnboarding).toBe(true);
  });

  it("normalizes unknown tiers to Starter and recognizes Enterprise", () => {
    expect(normalizePlanTier("enterprise")).toBe("enterprise");
    expect(normalizePlanTier("unknown")).toBe("starter");
    expect(normalizePlanTier(null)).toBe("starter");
  });

  it("keeps launch promo definitions passive and ineligible for checkout", () => {
    expect(LAUNCH_PROMO.code).toBe("M80OFF");
    expect(LAUNCH_PROMO.name).toBe("Retired launch code - Monthly");
    expect(LAUNCH_PROMO.id).toBe("M80OFF");
    expect(LAUNCH_PROMO.description).toBe("Retired monthly launch code");
    expect(LAUNCH_PROMO.percentOff).toBe(80);
    expect(isLaunchPromoEligible("starter", "monthly", new Date("2026-06-23T12:00:00Z"))).toBe(
      false,
    );
    expect(isLaunchPromoEligible("growth", "annual", new Date("2026-06-23T12:00:00Z"))).toBe(false);
    expect(isLaunchPromoEligible("enterprise", "annual", new Date("2026-06-23T12:00:00Z"))).toBe(
      false,
    );
    expect(
      isLaunchPromoEligible("starter", "weekly" as never, new Date("2026-05-15T00:00:00Z")),
    ).toBe(false);
  });

  it("normalizes promo codes for the limited offer", () => {
    expect(normalizePromoCode(" m80off ")).toBe("M80OFF");
    expect(normalizePromoCode(" y80off ")).toBe("Y80OFF");
    expect(normalizePromoCode("")).toBeNull();
    expect(normalizePromoCode(undefined)).toBeNull();
  });

  it("does not derive live retired-launch-code marketing display prices", () => {
    expect(getLaunchPromoPriceCents("starter", "monthly")).toBeNull();
    expect(getLaunchPromoPriceCents("starter", "annual", LAUNCH_PROMO_PHASES[1])).toBeNull();
    expect(getLaunchPromoDisplayPrice("starter", "monthly")).toBeNull();
    expect(getLaunchPromoDisplayPrice("starter", "annual", LAUNCH_PROMO_PHASES[1])).toBeNull();
    expect(getLaunchPromoDisplayPrice("growth", "annual", LAUNCH_PROMO_PHASES[1])).toBeNull();
    expect(getLaunchPromoDisplayPrice("audit_ready", "annual", LAUNCH_PROMO_PHASES[1])).toBeNull();
    expect(getLaunchPromoDisplayPrice("enterprise", "annual")).toBeNull();
  });

  it("provides shared commercial display copy", () => {
    expect(getBillingCycleLabel("annual")).toBe("Annual");
    expect(getBillingCycleLabel("monthly")).toBe("Monthly");
    expect(GRANTPIPE_GUARANTEE_COPY).toContain("30-day money-back guarantee");
  });

  it("publishes the named guarantee stack from source-backed terms", () => {
    expect(GRANTPIPE_GUARANTEE_STACK).toMatchObject({
      name: "Stand-Behind-It Stack",
      headline: "Start with proof, not a long contract.",
      summary:
        "Start free. No card. No setup fee. If the first paid month is not a fit, contact us. Ask within 30 days for a refund.",
    });
    expect(GRANTPIPE_GUARANTEE_STACK.items.map((item) => item.title)).toEqual([
      "1-month free trial",
      "No card to start",
      "No setup fee",
      "30-day money-back",
    ]);
    expect(GRANTPIPE_GUARANTEE_STACK.items.map((item) => item.source)).toEqual([
      "GRANTPIPE_TRIAL_COPY",
      "UNIVERSAL_PLAN_INCLUSIONS",
      "UNIVERSAL_PLAN_INCLUSIONS",
      "GRANTPIPE_GUARANTEE_COPY",
    ]);
  });

  it("exposes list and promo display helpers for every self-serve tier", () => {
    expect(getPlanListDisplayPrice("starter", "annual")).toEqual({
      price: "$39/mo",
      billingContext: "$468/yr billed annually",
    });
    expect(getPlanListDisplayPrice("growth", "monthly")).toEqual({
      price: "$99/mo",
      billingContext: "monthly billing",
    });
    expect(getPlanPromoDisplayPrice("audit_ready", "annual")).toBeNull();
    expect(getPlanPromoDisplayPrice("enterprise", "annual")).toBeNull();
  });

  it("publishes reusable GrantPipe pricing copy derived from the catalog", () => {
    expect(getGrantPipePricingCopy()).toMatchObject({
      selfServeRange: "$49-$199/mo list price",
      selfServeListRange: "$49-$199/mo list price",
      limitedOffer: "",
      limitedOfferHeadline: "",
      limitedOfferTitle: "",
      limitedOfferBadge: "",
      limitedOfferTerms: "",
      limitedOfferDeadline: "",
      limitedOfferBannerMessage: "",
      annualDefault: "Annual saves 20%.",
      starterMonthly: "$49/mo",
      starterAnnual: "$39/mo",
      starterMonthlyPromo: "$49/mo",
      starterAnnualPromo: "$39/mo",
      growthMonthly: "$99/mo",
      growthAnnual: "$79/mo",
      growthMonthlyPromo: "$99/mo",
      growthAnnualPromo: "$79/mo",
      auditReadyMonthly: "$199/mo",
      auditReadyAnnual: "$159/mo",
      auditReadyMonthlyPromo: "$199/mo",
      auditReadyAnnualPromo: "$159/mo",
      starterLaunch: "$49/mo",
      growthLaunch: "$99/mo",
      auditReadyLaunch: "$199/mo",
      selfServeLaunchRange: "$49-$199/mo",
    });
    expect(getGrantPipePricingCopy().tierLines).toContain(
      "Starter: $49/mo, or $39/mo billed annually ($468/yr).",
    );
    expect(getGrantPipePricingCopy().annualTierLines).toContain(
      "Audit-Ready: $159/mo, $1,908/yr billed annually.",
    );
    expect(getGrantPipePricingCopy().tierLines).toContain(
      "Enterprise: contact founder at angel.campa@grantpipe.com or LinkedIn at https://www.linkedin.com/in/angelcampa1/.",
    );
  });

  it("publishes universal inclusions that apply to every plan", () => {
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain("Unlimited users");
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain(
      "Grants.gov search plus manual/imported non-federal opportunities",
    );
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain("Manual/imported non-federal opportunity tracking");
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain(
      "Foundation prospect context from public nonprofit filings where available",
    );
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain("No setup fee or annual contract requirement");
    expect(UNIVERSAL_PLAN_INCLUSIONS).toContain(
      "AI help on every paid plan, where you confirm each result",
    );
  });

  it("publishes Federal Edition as a contact-sales SKU above Audit-Ready", () => {
    expect(getFederalEditionSku()).toBe(FEDERAL_EDITION_SKU);
    expect(FEDERAL_EDITION_SKU).toMatchObject({
      id: "federal_edition",
      name: "Federal Edition",
      abovePlanTier: "audit_ready",
      ctaLabel: "Contact founder",
      ctaKind: "contact",
      selfServe: false,
      planningEstimateLabel: "Custom rollout plan",
    });
    expect(FEDERAL_EDITION_SKU.priceAnchor).toBe("Custom rollout plan. We set price after a call.");
    expect(FEDERAL_EDITION_SKU.priceAnchor).not.toMatch(/\$\d/);
    expect(FEDERAL_EDITION_SKU.planningEstimateLabel).not.toMatch(/\$\d/);
    expect(FEDERAL_EDITION_SKU.features).toEqual([
      "Everything in Audit-Ready",
      "SEFA draft and single-audit tripwire",
      "Uniform Guidance checks at expense entry",
      "Review queue for odd or misposted charges",
      "Federal rollout plan",
    ]);
  });

  it("publishes pricing page buying guidance from the catalog", () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan).toHaveProperty("pricingPageGuide");
      expect(plan).toHaveProperty("chooseThisIf");
    }
  });

  it("derives plan labels for entitlement-specific copy", () => {
    expect(getPlanLabelsWithEntitlement("hasAccountingIntegrations")).toEqual([]);
    expect(getPlanLabelsWithEntitlement("hasMultiEntityConsolidation")).toEqual(["Enterprise"]);
    expect(getPlanEntitlementLabelList("hasSubrecipientMonitoring")).toBe(
      "Audit-Ready or Enterprise",
    );
    expect(getPlanEntitlementLabelList("hasMultiEntityConsolidation")).toBe("Enterprise");
  });

  it("derives plan tier ranks and comparisons from the shared plan order", () => {
    expect(PLAN_TIERS.map((tier) => getPlanTierRank(tier))).toEqual([0, 1, 2, 3]);
    expect(isPlanTierAtLeast("audit_ready", "growth")).toBe(true);
    expect(isPlanTierAtLeast("growth", "audit_ready")).toBe(false);
  });

  it("uses the differential feature pattern with no per-plan duplication of universal inclusions", () => {
    const universalSet = new Set(UNIVERSAL_PLAN_INCLUSIONS);
    for (const plan of PLAN_CATALOG) {
      for (const feature of plan.features) {
        expect(universalSet.has(feature)).toBe(false);
      }
    }
  });

  it("uses 'Everything in <previous tier>' on each upgrade tier", () => {
    const growth = PLAN_CATALOG.find((plan) => plan.tier === "growth");
    const auditReady = PLAN_CATALOG.find((plan) => plan.tier === "audit_ready");
    const enterprise = PLAN_CATALOG.find((plan) => plan.tier === "enterprise");
    expect(growth?.features[0]).toBe("Everything in Starter");
    expect(auditReady?.features[0]).toBe("Everything in Growth");
    expect(enterprise?.features[0]).toBe("Everything in Audit-Ready");
  });

  it("assigns Auditor & Funder Portal to audit_ready and not to lower tiers", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;

    expect(auditReady.features.some((f) => f.includes("Auditor & Funder Portal"))).toBe(true);
    expect(starter.features.some((f) => f.includes("Auditor & Funder Portal"))).toBe(false);
    expect(growth.features.some((f) => f.includes("Auditor & Funder Portal"))).toBe(false);
    for (const plan of PLAN_CATALOG) {
      expect(plan.features.some((f) => f.includes("External auditor portal"))).toBe(false);
    }
  });

  it("does not assign accounting integrations to any plan until a real connector ships", () => {
    expect(getPlanEntitlements("starter").hasAccountingIntegrations).toBe(false);
    expect(getPlanEntitlements("growth").hasAccountingIntegrations).toBe(false);
    expect(getPlanEntitlements("audit_ready").hasAccountingIntegrations).toBe(false);
    expect(getPlanEntitlements("enterprise").hasAccountingIntegrations).toBe(false);

    const allPlanCopy = PLAN_CATALOG.flatMap((plan) => [
      plan.description,
      plan.pricingPageGuide,
      plan.chooseThisIf,
      ...plan.features,
    ]).join(" ");
    expect(PLAN_CATALOG.find((plan) => plan.tier === "starter")?.features).toContain(
      "Native accounting workspace with ledger and journal entries",
    );
    expect(allPlanCopy).toMatch(/Native accounting workspace/i);
    expect(allPlanCopy).not.toMatch(/QuickBooks|QBO/i);
    expect(getPlanLabelsWithEntitlement("hasAccountingIntegrations")).toEqual([]);
  });

  it("assigns AI Award Document Intake to Starter and above", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;

    expect(starter.features.join(" ")).toContain("AI Award Document Intake");
    expect(growth.features.join(" ")).toContain("AI Award Document Intake");
    // Audit-Ready inherits intake via its "Everything in Growth" rollup, so it
    // does not re-list the bullet; assert the entitlement instead.
    expect(auditReady.entitlements.hasAwardDocumentIntake).toBe(true);
    expect(growth.entitlements.hasAwardDocumentIntake).toBe(true);
    expect(starter.entitlements.hasAwardDocumentIntake).toBe(true);
  });

  it("assigns proposal and report drafting to Growth and above", () => {
    expect(PLAN_ENTITLEMENTS.starter.hasProposalReportDrafting).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth.hasProposalReportDrafting).toBe(true);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasProposalReportDrafting).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise.hasProposalReportDrafting).toBe(true);
    expect(
      MARKETED_FEATURE_CATALOG.find((row) => row.key === "hasProposalReportDrafting"),
    ).toMatchObject({
      group: "ai_automation",
      label: "Proposal and report drafting assistant",
    });
  });

  it("does not market the retired recurring gift engine", () => {
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.starter).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.growth).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.audit_ready).toBe(false);
    expect("hasRecurringGiftEngine" in PLAN_ENTITLEMENTS.enterprise).toBe(false);
    expect(
      MARKETED_FEATURE_CATALOG.find((row) => (row.key as string) === "hasRecurringGiftEngine"),
    ).toBe(undefined);
  });

  it("markets grant budget model capabilities in the tiers that include them", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;

    expect(starter.features.some((f) => f.includes("Grant budget lines"))).toBe(true);
    // Budget alerts now ship in Starter; Growth adds exports/planned expenses.
    expect(starter.features.some((f) => f.includes("Grant budget alerts"))).toBe(true);
    expect(growth.features.some((f) => f.includes("Budget exports"))).toBe(true);
    expect(auditReady.features.some((f) => f.includes("Budget amendment history"))).toBe(true);
  });

  it("assigns Subrecipient Monitoring to Audit-Ready and above only", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;
    const enterprise = PLAN_CATALOG.find((p) => p.tier === "enterprise")!;

    expect(starter.features.join(" ")).not.toContain("Subrecipient Monitoring");
    expect(growth.features.join(" ")).not.toContain("Subrecipient Monitoring");
    expect(auditReady.features.join(" ")).toContain("Subrecipient Monitoring");
    expect(enterprise.entitlements.hasSubrecipientMonitoring).toBe(true);
  });

  it("assigns Multi-entity consolidation to Enterprise only", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;
    const enterprise = PLAN_CATALOG.find((p) => p.tier === "enterprise")!;

    expect(starter.entitlements.hasMultiEntityConsolidation).toBe(false);
    expect(growth.entitlements.hasMultiEntityConsolidation).toBe(false);
    expect(auditReady.entitlements.hasMultiEntityConsolidation).toBe(false);
    expect(enterprise.entitlements.hasMultiEntityConsolidation).toBe(true);
    expect(enterprise.features.join(" ")).toContain("Multi-entity consolidation");
  });

  it("assigns Cross-entity report builder to Enterprise only", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const auditReady = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!;
    const enterprise = PLAN_CATALOG.find((p) => p.tier === "enterprise")!;

    expect(starter.entitlements.hasCrossEntityReportBuilder).toBe(false);
    expect(growth.entitlements.hasCrossEntityReportBuilder).toBe(false);
    expect(auditReady.entitlements.hasCrossEntityReportBuilder).toBe(false);
    expect(enterprise.entitlements.hasCrossEntityReportBuilder).toBe(true);
    expect(enterprise.features.join(" ")).toContain("Cross-entity report builder");
    for (const plan of [starter, growth, auditReady]) {
      expect(plan.features.join(" ")).not.toContain("Cross-entity report builder");
    }
    expect(getPlanLabelsWithEntitlement("hasCrossEntityReportBuilder")).toEqual(["Enterprise"]);
  });

  it("publishes a 'best fit' line for every tier", () => {
    expect(PLAN_CATALOG.find((p) => p.tier === "starter")?.bestFit).toBe("Stop missing deadlines");
    expect(PLAN_CATALOG.find((p) => p.tier === "growth")?.bestFit).toBe(
      "Run more grants with less stress",
    );
    expect(PLAN_CATALOG.find((p) => p.tier === "audit_ready")?.bestFit).toBe("Prove every dollar");
    expect(PLAN_CATALOG.find((p) => p.tier === "enterprise")?.bestFit).toBe(
      "Complex grant-funded teams that need founder guidance",
    );
  });

  it("communicates AI in the Starter and Growth identity copy", () => {
    const starter = PLAN_CATALOG.find((p) => p.tier === "starter")!;
    expect(`${starter.description} ${starter.pricingPageGuide} ${starter.chooseThisIf}`).toMatch(
      /\bAI\b/,
    );
    const growth = PLAN_CATALOG.find((p) => p.tier === "growth")!;
    const growthIdentityCopy = `${growth.description} ${growth.pricingPageGuide} ${growth.chooseThisIf}`;
    expect(growthIdentityCopy).toMatch(/\bAI\b/i);
    expect(growthIdentityCopy).toMatch(/unlimited award intake/i);
    expect(growthIdentityCopy).toMatch(/unlimited Ask-Your-Ledger reports/i);
    expect(growthIdentityCopy).not.toMatch(/unlimited AI|AI without limits/i);
  });

  it("keeps tier descriptions entitlement-safe and free of banned positioning", () => {
    const bannedPatterns = [
      /\bone operating system\b/i,
      /\bsame operating system\b/i,
      /\baudit-ready reporting\b/i,
      /\bno consultants required\b/i,
      /\b30-day trial\b/i,
    ];

    for (const plan of PLAN_CATALOG) {
      const copy = `${plan.description} ${plan.bestFit}`;
      for (const pattern of bannedPatterns) {
        expect(copy).not.toMatch(pattern);
      }
    }
  });

  it("does not duplicate features between consecutive tiers", () => {
    const starterDeltas = PLAN_CATALOG.find((p) => p.tier === "starter")!.features;
    const growthDeltas = PLAN_CATALOG.find((p) => p.tier === "growth")!.features.filter(
      (f) => f !== "Everything in Starter",
    );
    const auditDeltas = PLAN_CATALOG.find((p) => p.tier === "audit_ready")!.features.filter(
      (f) => f !== "Everything in Growth",
    );
    const enterpriseDeltas = PLAN_CATALOG.find((p) => p.tier === "enterprise")!.features.filter(
      (f) => f !== "Everything in Audit-Ready",
    );

    const starterSet = new Set(starterDeltas);
    for (const feature of growthDeltas) expect(starterSet.has(feature)).toBe(false);
    const growthSet = new Set([...starterDeltas, ...growthDeltas]);
    for (const feature of auditDeltas) expect(growthSet.has(feature)).toBe(false);
    const auditSet = new Set([...starterDeltas, ...growthDeltas, ...auditDeltas]);
    for (const feature of enterpriseDeltas) expect(auditSet.has(feature)).toBe(false);
  });
});

describe("Marketed feature catalog", () => {
  it("covers every entitlement key plus the active grant cap exactly once", () => {
    const sample = PLAN_ENTITLEMENTS.starter;
    const allKeys = (Object.keys(sample) as (keyof PlanEntitlements)[]).filter(
      (key) =>
        key !== "activeGrantCap" &&
        key !== "awardIntakeMonthlyCap" &&
        key !== "askYourLedgerMonthlyCap",
    );
    const expected = new Set<string>(["activeGrantCap", ...allKeys]);
    const seen = new Set<string>();
    for (const row of MARKETED_FEATURE_CATALOG) {
      expect(seen.has(row.key)).toBe(false);
      seen.add(row.key);
    }
    expect(seen).toEqual(expected);
  });

  it("returns the catalog through the getter", () => {
    expect(getMarketedFeatureRows()).toBe(MARKETED_FEATURE_CATALOG);
  });

  it("renders the active grant cap row using the live entitlements", () => {
    const row = MARKETED_FEATURE_CATALOG.find((r) => r.key === "activeGrantCap");
    expect(row).toBeDefined();
    expect(row?.byTier.starter).toBe("Up to 10");
    expect(row?.byTier.growth).toBe("Up to 50");
    expect(row?.byTier.audit_ready).toBe("Up to 100");
    expect(row?.byTier.enterprise).toBe("Unlimited");
  });

  it("derives boolean entitlement rows from PLAN_ENTITLEMENTS", () => {
    const portal = MARKETED_FEATURE_CATALOG.find((r) => r.key === "hasAuditorFunderPortal");
    expect(portal?.byTier.starter).toBe("not_included");
    expect(portal?.byTier.growth).toBe("not_included");
    expect(portal?.byTier.audit_ready).toBe("included");
    expect(portal?.byTier.enterprise).toBe("included");
  });

  it("marks program allocation visibility as included from Starter upward", () => {
    const program = MARKETED_FEATURE_CATALOG.find((r) => r.key === "canViewProgramContext");
    expect(program?.byTier.starter).toBe("included");
    expect(program?.byTier.growth).toBe("included");
    expect(program?.byTier.audit_ready).toBe("included");
  });

  it("markets AI Award Document Intake as fully included across all paid tiers", () => {
    const intake = MARKETED_FEATURE_CATALOG.find((r) => r.key === "hasAwardDocumentIntake");
    expect(intake?.byTier.starter).toBe("included");
    expect(intake?.byTier.growth).toBe("included");
    expect(intake?.byTier.audit_ready).toBe("included");
    expect(intake?.byTier.enterprise).toBe("included");
  });

  it("publishes labels for every catalog group used by rows", () => {
    const groupLabels = new Map(MARKETED_FEATURE_GROUPS.map((g) => [g.group, g.label]));
    for (const row of MARKETED_FEATURE_CATALOG) {
      expect(groupLabels.has(row.group)).toBe(true);
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("formats marketed feature cells for display", () => {
    expect(getMarketedFeatureCellLabel("included")).toBe("Included");
    expect(getMarketedFeatureCellLabel("not_included")).toBe("—");
    expect(getMarketedFeatureCellLabel("preview")).toBe("Preview");
    expect(getMarketedFeatureCellLabel("Up to 10")).toBe("Up to 10");
  });

  it("emits one cell per tier for every catalog row", () => {
    for (const row of MARKETED_FEATURE_CATALOG) {
      for (const tier of PLAN_TIERS) {
        expect(typeof row.byTier[tier]).toBe("string");
        expect(row.byTier[tier].length).toBeGreaterThan(0);
      }
    }
  });
});

describe("GRANTPIPE_TRIAL_COPY", () => {
  it("mentions the 1-month free trial and no credit card", () => {
    expect(GRANTPIPE_TRIAL_COPY).toMatch(/1-month free trial/i);
    expect(GRANTPIPE_TRIAL_COPY).toMatch(/no credit card/i);
  });
});

describe("getEffectivePlanTier", () => {
  const FUTURE = new Date("2099-01-01T00:00:00.000Z").toISOString();
  const PAST = new Date("2000-01-01T00:00:00.000Z").toISOString();

  it("keeps an active trial on the selected plan tier", () => {
    expect(
      getEffectivePlanTier({
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: FUTURE,
      }),
    ).toBe("starter");

    expect(
      getEffectivePlanTier({
        planTier: "growth",
        subscriptionStatus: "trialing",
        trialEndsAt: FUTURE,
      }),
    ).toBe("growth");
  });

  it("does not elevate the trial when subscription is trialing but trialEndsAt is missing", () => {
    expect(
      getEffectivePlanTier({
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: null,
      }),
    ).toBe("starter");
  });

  it("falls back to the stored plan once the trial has expired", () => {
    expect(
      getEffectivePlanTier({
        planTier: "growth",
        subscriptionStatus: "trialing",
        trialEndsAt: PAST,
      }),
    ).toBe("growth");
  });

  it("falls back to the stored plan at the exact trial expiration instant", () => {
    const endsAt = new Date("2026-05-01T00:00:00.000Z");

    expect(
      getEffectivePlanTier(
        {
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: endsAt,
        },
        endsAt,
      ),
    ).toBe("starter");
  });

  it("returns the stored plan for active subscriptions", () => {
    expect(
      getEffectivePlanTier({
        planTier: "audit_ready",
        subscriptionStatus: "active",
        trialEndsAt: null,
      }),
    ).toBe("audit_ready");
  });

  it("falls back to starter for unknown plan strings", () => {
    expect(
      getEffectivePlanTier({
        planTier: "garbage",
        subscriptionStatus: "active",
        trialEndsAt: null,
      }),
    ).toBe("starter");
  });

  it("accepts Date instances for trialEndsAt without changing the selected tier", () => {
    expect(
      getEffectivePlanTier({
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 86_400_000),
      }),
    ).toBe("starter");
  });

  it("keeps the trial default tier at Starter", () => {
    expect(TRIAL_EFFECTIVE_PLAN_TIER).toBe("starter");
    expect(
      getEffectivePlanTier({
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: FUTURE,
      }),
    ).toBe("starter");
  });

  it("does not unlock the Enterprise-only Cross-Entity Report Builder during a trial", () => {
    const trialTier = getEffectivePlanTier({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: FUTURE,
    });

    expect(getPlanEntitlements(trialTier).hasCrossEntityReportBuilder).toBe(false);
    expect(getPlanEntitlements("enterprise").hasCrossEntityReportBuilder).toBe(true);
  });
});

describe("PREMIUM_FEATURE_KEYS", () => {
  it("excludes features Starter already includes", () => {
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantOpportunitySearch");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantBudgetBasics");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasAwardDocumentIntake");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasAutomationEmails");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasRestrictionLifecycle");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantBudgetExports");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantBudgetAlerts");
  });

  it("includes flagship paid features", () => {
    expect(PREMIUM_FEATURE_KEYS).toContain("hasAskYourLedger");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasAccountingIntegrations");
    expect(PREMIUM_FEATURE_KEYS).toContain("hasComplianceReportPack");
    expect(PREMIUM_FEATURE_KEYS).toContain("hasProposalReportDrafting");
  });

  it("derives premium feature keys from the new starter matrix", () => {
    expect(PREMIUM_FEATURE_KEYS).toContain("hasAskYourLedger");
    expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantBudgetExports");
  });

  it("matches features Starter does not entitle", () => {
    for (const key of PREMIUM_FEATURE_KEYS) {
      expect(PLAN_ENTITLEMENTS.starter[key]).toBe(false);
    }
  });

  it("recognizes premium feature keys from arbitrary strings", () => {
    expect(isPremiumFeatureKey("hasAwardDocumentIntake")).toBe(false);
    expect(isPremiumFeatureKey("hasAccountingIntegrations")).toBe(false);
    expect(isPremiumFeatureKey("hasComplianceReportPack")).toBe(true);
    expect(isPremiumFeatureKey("activeGrantCap")).toBe(false);
    expect(isPremiumFeatureKey("madeUpFeature")).toBe(false);
  });
});

describe("getMinimumPlanForFeatures", () => {
  it("returns starter when no features are needed", () => {
    expect(getMinimumPlanForFeatures([])).toBe("starter");
  });

  it("returns growth for a feature first available on growth", () => {
    expect(getMinimumPlanForFeatures(["hasComplianceReportPack"])).toBe("growth");
  });

  it("minimum plan for ask-your-ledger is growth; for budget exports is starter", () => {
    expect(getMinimumPlanForFeatures(["hasAskYourLedger"])).toBe("growth");
    expect(getMinimumPlanForFeatures(["hasGrantBudgetExports"])).toBe("starter");
  });

  it("does not accept unavailable accounting integrations for plan recommendations", () => {
    // @ts-expect-error retired integrations are not recommendable premium features
    expect(getMinimumPlanForFeatures(["hasAccountingIntegrations"])).toBe("enterprise");
  });

  it("returns enterprise for features only enterprise covers", () => {
    expect(getMinimumPlanForFeatures(["hasMultiEntityConsolidation"])).toBe("enterprise");
  });

  it("falls back to enterprise when no tier satisfies every requested feature", () => {
    expect(getMinimumPlanForFeatures(["unknownFeature" as never])).toBe("enterprise");
  });

  it("formats the minimum plan label from shared plan labels", () => {
    expect(formatMinimumPlanLabelForFeatures(["hasPaymentRequests"])).toBe("Growth");
    expect(formatMinimumPlanLabelForFeatures(["hasSubrecipientMonitoring"])).toBe("Audit-Ready");
    expect(formatMinimumPlanLabelForFeatures(["canManageProgramAllocations"])).toBe("Starter");
    expect(formatMinimumPlanLabelForFeatures(["hasOutcomeImpactMeasurement"])).toBe("Growth");
  });
});

describe("LAUNCH_PROMO_PHASES", () => {
  it("contains the monthly and annual retired launch codes", () => {
    expect(LAUNCH_PROMO_PHASES.map((p) => p.code)).toEqual(["M80OFF", "Y80OFF"]);
  });

  it("has correct terms and redemption limits per code", () => {
    expect(LAUNCH_PROMO_PHASES[0]).toMatchObject({
      code: "M80OFF",
      id: "M80OFF",
      name: "Retired launch code - Monthly",
      description: "Retired monthly launch code",
      percentOff: 80,
      maxRedemptions: 100,
      eligibleBillingCycles: ["monthly"],
    });
    expect(LAUNCH_PROMO_PHASES[1]).toMatchObject({
      code: "Y80OFF",
      id: "Y80OFF",
      name: "Retired launch code - Yearly",
      description: "Retired annual launch code",
      percentOff: 80,
      maxRedemptions: 200,
      eligibleBillingCycles: ["annual"],
    });
  });

  it("backward-compat LAUNCH_PROMO alias points to monthly limited offer", () => {
    expect(LAUNCH_PROMO.code).toBe("M80OFF");
    expect(LAUNCH_PROMO.percentOff).toBe(80);
  });
});

describe("getLaunchPromoForBillingCycle", () => {
  it("returns M80OFF for monthly and Y80OFF for annual billing", () => {
    expect(getLaunchPromoForBillingCycle("monthly").code).toBe("M80OFF");
    expect(getLaunchPromoForBillingCycle("annual").code).toBe("Y80OFF");
  });
});

describe("pickActiveLaunchPhase", () => {
  it("returns M80OFF when there are no redemptions", () => {
    expect(pickActiveLaunchPhase({}).code).toBe("M80OFF");
  });

  it("returns M80OFF when M80OFF has 99 redemptions (below max)", () => {
    expect(pickActiveLaunchPhase({ M80OFF: 99 }).code).toBe("M80OFF");
  });

  it("returns Y80OFF when M80OFF is at 100 (fully redeemed)", () => {
    expect(pickActiveLaunchPhase({ M80OFF: 100 }).code).toBe("Y80OFF");
  });

  it("falls back to Y80OFF (last offer) when all codes are fully redeemed", () => {
    expect(pickActiveLaunchPhase({ M80OFF: 100, Y80OFF: 200 }).code).toBe("Y80OFF");
  });
});

describe("isLaunchPromoEligible with explicit promo param", () => {
  it("keeps yearly code inactive even when tied to annual billing", () => {
    const yearlyOffer = LAUNCH_PROMO_PHASES[1];
    expect(
      isLaunchPromoEligible("growth", "annual", new Date("2026-06-23T12:00:00Z"), yearlyOffer),
    ).toBe(false);
    expect(
      isLaunchPromoEligible("starter", "monthly", new Date("2026-06-23T12:00:00Z"), yearlyOffer),
    ).toBe(false);
  });

  it("returns false for enterprise with the yearly retired launch code", () => {
    const yearlyOffer = LAUNCH_PROMO_PHASES[1];
    expect(
      isLaunchPromoEligible("enterprise", "annual", new Date("2026-06-23T12:00:00Z"), yearlyOffer),
    ).toBe(false);
  });

  it("keeps monthly code inactive even when tied to monthly billing", () => {
    const monthlyOffer = LAUNCH_PROMO_PHASES[0];
    expect(
      isLaunchPromoEligible(
        "audit_ready",
        "monthly",
        new Date("2026-06-23T12:00:00Z"),
        monthlyOffer,
      ),
    ).toBe(false);
    expect(
      isLaunchPromoEligible(
        "audit_ready",
        "annual",
        new Date("2026-06-23T12:00:00Z"),
        monthlyOffer,
      ),
    ).toBe(false);
  });
});

describe("getLaunchPromoDisplayPrice with retired launch codes", () => {
  it("returns null for retired starter monthly launch code", () => {
    const monthlyOffer = LAUNCH_PROMO_PHASES[0];
    const result = getLaunchPromoDisplayPrice("starter", "monthly", monthlyOffer);
    expect(result).toBeNull();
  });

  it("returns null for retired starter annual launch code", () => {
    const yearlyOffer = LAUNCH_PROMO_PHASES[1];
    const result = getLaunchPromoDisplayPrice("starter", "annual", yearlyOffer);
    expect(result).toBeNull();
  });
});

describe("FOUNDER_BOOKING_URLS", () => {
  it("has the correct quickCall URL", () => {
    expect(FOUNDER_BOOKING_URLS.quickCall).toBe("https://cal.com/angel-campa-grantpipe/15min");
  });

  it("has the correct discoveryCall URL", () => {
    expect(FOUNDER_BOOKING_URLS.discoveryCall).toBe("https://cal.com/angel-campa-grantpipe/30min");
  });

  it("has the correct onboardingCall URL", () => {
    expect(FOUNDER_BOOKING_URLS.onboardingCall).toBe(
      "https://cal.com/angel-campa-grantpipe/onboarding",
    );
  });

  it("all URLs are https cal.com angel-campa-grantpipe links", () => {
    const prefix = "https://cal.com/angel-campa-grantpipe/";
    expect(FOUNDER_BOOKING_URLS.quickCall.startsWith(prefix)).toBe(true);
    expect(FOUNDER_BOOKING_URLS.discoveryCall.startsWith(prefix)).toBe(true);
    expect(FOUNDER_BOOKING_URLS.onboardingCall.startsWith(prefix)).toBe(true);
  });
});

describe("promo deadline reversion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isLaunchPromoEligible returns false after the deadline", () => {
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    expect(isLaunchPromoEligible("growth", "annual")).toBe(false);
    expect(isLaunchPromoEligible("starter", "monthly")).toBe(false);
  });

  it("getLaunchPromoPriceCents returns null after the deadline", () => {
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    expect(getLaunchPromoPriceCents("growth", "annual")).toBeNull();
    expect(getLaunchPromoPriceCents("starter", "monthly")).toBeNull();
  });

  it("getLaunchPromoDisplayPrice returns null after the deadline", () => {
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    expect(getLaunchPromoDisplayPrice("growth", "annual")).toBeNull();
    expect(getLaunchPromoDisplayPrice("starter", "monthly")).toBeNull();
  });

  it("isLaunchPromoEligible returns false before the retired deadline", () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
    expect(isLaunchPromoEligible("growth", "annual", new Date(), LAUNCH_PROMO_PHASES[1])).toBe(
      false,
    );
    expect(isLaunchPromoEligible("starter", "monthly")).toBe(false);
  });

  it("getGrantPipePricingCopy does not throw and reverts to full price after the deadline", () => {
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    const copy = getGrantPipePricingCopy();
    // No promo marketing copy once the offer is over.
    expect(copy.limitedOffer).toBe("");
    expect(copy.limitedOfferBadge).toBe("");
    expect(copy.limitedOfferDeadline).toBe("");
    expect(copy.limitedOfferBannerMessage).toBe("");
    // Promo price fields fall back to the full list price.
    expect(copy.starterMonthlyPromo).toBe(copy.starterMonthly);
    expect(copy.growthAnnualPromo).toBe(copy.growthAnnual);
    expect(copy.auditReadyMonthlyPromo).toBe(copy.auditReadyMonthly);
    const retiredDiscountPhrase = ["80%", "off"].join(" ");
    expect(copy.starterLaunch).toBe(copy.starterMonthly);
    expect(copy.tierLines.join(" ")).not.toContain(retiredDiscountPhrase);
    expect(copy.annualTierLines.join(" ")).not.toContain(retiredDiscountPhrase);
  });

  it("getGrantPipePricingCopy keeps full-price copy before the retired deadline", () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
    const copy = getGrantPipePricingCopy();
    expect(copy.limitedOffer).toBe("");
    expect(copy.limitedOfferDeadline).toBe("");
    expect(copy.limitedOfferBannerMessage).toBe("");
    expect(copy.tierLines.join(" ")).not.toContain(["80%", "off"].join(" "));
  });
});
