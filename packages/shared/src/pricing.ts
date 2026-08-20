import {
  PLAN_ENTITLEMENTS,
  PLAN_LABELS,
  PLAN_TIERS,
  type BillingCycle,
  type PlanEntitlements,
  type PlanTier,
  type SubscriptionStatus,
} from "./constants";
import { formatCurrencyCents } from "./format";
import { LAUNCH_PROMO, type LaunchPromoCode, type LaunchPromo } from "./promos";
export type { LaunchPromoCode, LaunchPromo } from "./promos";
export {
  LAUNCH_PROMO,
  LAUNCH_PROMO_PHASES,
  getLaunchPromoForBillingCycle,
  pickActiveLaunchPhase,
} from "./promos";

export { formatCurrencyCents } from "./format";

export type SelfServePlanTier = Exclude<PlanTier, "enterprise">;

export const SELF_SERVE_PLAN_TIERS = [
  "starter",
  "growth",
  "audit_ready",
] as const satisfies readonly SelfServePlanTier[];

export type PlanPrice = {
  monthlyCents: number;
  annualCents: number;
  annualMonthlyEquivalentCents: number;
};

export type PricingPlan = {
  tier: PlanTier;
  name: string;
  description: string;
  bestFit: string;
  pricingPageGuide: string;
  chooseThisIf: string;
  prices: PlanPrice | null;
  highlighted: boolean;
  selfServe: boolean;
  ctaLabel: string;
  ctaKind: "checkout" | "contact";
  features: readonly string[];
  entitlements: PlanEntitlements;
};

export type FederalEditionSku = {
  id: "federal_edition";
  name: string;
  eyebrow: string;
  description: string;
  bestFit: string;
  abovePlanTier: "audit_ready";
  priceAnchor: string;
  planningEstimateLabel: string;
  selfServe: false;
  ctaLabel: string;
  ctaKind: "contact";
  features: readonly string[];
};

export type GrantPipeGuaranteeStackItem = {
  title: string;
  body: string;
  source: "GRANTPIPE_TRIAL_COPY" | "UNIVERSAL_PLAN_INCLUSIONS" | "GRANTPIPE_GUARANTEE_COPY";
};

export type GrantPipeGuaranteeStack = {
  name: string;
  headline: string;
  summary: string;
  items: readonly GrantPipeGuaranteeStackItem[];
};

export type LaunchPromoDisplayPrice = {
  listPrice: string;
  discountedPrice: string;
  billingContext: string;
  badge: string;
  /** The regular list price shown as the renewal rate after the first year. Equal to listPrice. */
  renewalPrice: string;
};

export type PlanListDisplayPrice = {
  price: string;
  billingContext: string;
};

export type PlanPromoDisplayPrice = LaunchPromoDisplayPrice & {
  promoCode: LaunchPromoCode;
  promoDescription: string;
};

export type GrantPipePricingCopy = {
  selfServeRange: string;
  selfServeListRange: string;
  limitedOffer: string;
  limitedOfferHeadline: string;
  limitedOfferTitle: string;
  limitedOfferBadge: string;
  limitedOfferTerms: string;
  limitedOfferDeadline: string;
  limitedOfferBannerMessage: string;
  annualDefault: string;
  starterMonthly: string;
  starterAnnual: string;
  starterMonthlyPromo: string;
  starterAnnualPromo: string;
  growthMonthly: string;
  growthAnnual: string;
  growthMonthlyPromo: string;
  growthAnnualPromo: string;
  auditReadyMonthly: string;
  auditReadyAnnual: string;
  auditReadyMonthlyPromo: string;
  auditReadyAnnualPromo: string;
  starterLaunch: string;
  growthLaunch: string;
  auditReadyLaunch: string;
  selfServeLaunchRange: string;
  tierLines: readonly string[];
  annualTierLines: readonly string[];
  schemaOfferLines: readonly string[];
};

export const FOUNDER_CONTACT_EMAIL = "angel.campa@grantpipe.com";
export const FOUNDER_LINKEDIN_URL = "https://www.linkedin.com/in/angelcampa1/";

/** Cal.com booking links for scheduling time with the founder. Single source of truth. */
export const FOUNDER_BOOKING_URLS = {
  /** 15 min — quick questions / support */
  quickCall: "https://cal.com/angel-campa-grantpipe/15min",
  /** 30 min — discovery / sales conversations */
  discoveryCall: "https://cal.com/angel-campa-grantpipe/30min",
  /** 60 min — onboarding / guided setup */
  onboardingCall: "https://cal.com/angel-campa-grantpipe/onboarding",
} as const;

export const DEFAULT_BILLING_CYCLE: BillingCycle = "annual";

export const GRANTPIPE_GUARANTEE_COPY =
  "30-day money-back guarantee. If GrantPipe is not the right fit in your first month, contact us for a refund.";

export const GRANTPIPE_GUARANTEE_STACK = {
  name: "Stand-Behind-It Stack",
  headline: "Start with proof, not a long contract.",
  summary:
    "Start free. No card. No setup fee. If the first paid month is not a fit, contact us. Ask within 30 days for a refund.",
  items: [
    {
      title: "1-month free trial",
      body: "Try GrantPipe with your real tracker first.",
      source: "GRANTPIPE_TRIAL_COPY",
    },
    {
      title: "No card to start",
      body: "Start the trial before you add billing.",
      source: "UNIVERSAL_PLAN_INCLUSIONS",
    },
    {
      title: "No setup fee",
      body: "Self-serve plans do not add a setup fee.",
      source: "UNIVERSAL_PLAN_INCLUSIONS",
    },
    {
      title: "30-day money-back",
      body: "If the first paid month is not a fit, contact us for a refund.",
      source: "GRANTPIPE_GUARANTEE_COPY",
    },
  ],
} as const satisfies GrantPipeGuaranteeStack;

export const UNIVERSAL_PLAN_INCLUSIONS: readonly string[] = [
  "Unlimited users",
  "Grants.gov search plus manual/imported non-federal opportunities",
  "Manual/imported non-federal opportunity tracking",
  "Foundation prospect context from public nonprofit filings where available",
  "1-month free trial on every plan",
  "No credit card required to start",
  "No setup fee or annual contract requirement",
  "In-product onboarding after signup",
  "AI help on every paid plan, where you confirm each result",
] as const;

export const PLAN_CATALOG: readonly PricingPlan[] = [
  {
    tier: "starter",
    name: PLAN_LABELS.starter,
    description:
      "Get grants, donors, deadlines, and funds out of spreadsheets. Reminders and basic AI come built in.",
    bestFit: "Stop missing deadlines",
    pricingPageGuide:
      "Starter gets a small team out of spreadsheets. You get one shared record for grants, donors, deadlines, budgets, and funds. Reminders and basic AI help you keep up.",
    chooseThisIf:
      "you want one place for grants, donors, deadlines, budgets, and funds. You also get reminders and basic AI, without spending much.",
    prices: {
      monthlyCents: 4900,
      annualCents: 46800,
      annualMonthlyEquivalentCents: 3900,
    },
    highlighted: false,
    selfServe: true,
    ctaLabel: "Start Starter",
    ctaKind: "checkout",
    features: [
      "Up to 10 active grants",
      "Donor CRM and donor pipeline",
      "Grant pipeline tracking",
      "Grant budget lines and budget-vs-actual views",
      "Program management and allocation tracking",
      "Native accounting workspace with ledger and journal entries",
      "Basic restricted fund visibility",
      "Compliance calendar",
      "Spend-down tracking",
      "990 export templates",
      "Automated deadline reminder emails",
      "Restriction lifecycle: terms, additions, releases",
      "Grant budget alerts",
      "AI Award Document Intake reads award documents (5/month)",
      "Budget-vs-actual exports (PDF/CSV)",
      "Email support",
    ],
    entitlements: PLAN_ENTITLEMENTS.starter,
  },
  {
    tier: "growth",
    name: PLAN_LABELS.growth,
    description:
      "Run more grants with less stress. Draft proposals and reports, lift the AI caps, and track more active grants.",
    bestFit: "Run more grants with less stress",
    pricingPageGuide:
      "Growth fits most grant-funded nonprofits. You get proposal and report drafting, unlimited award intake, and unlimited Ask-Your-Ledger reports.",
    chooseThisIf:
      "you run several grants at once. You want drafting help, more active grants, and higher AI limits.",
    prices: {
      monthlyCents: 9900,
      annualCents: 94800,
      annualMonthlyEquivalentCents: 7900,
    },
    highlighted: true,
    selfServe: true,
    ctaLabel: "Start Growth",
    ctaKind: "checkout",
    features: [
      "Everything in Starter",
      "Up to 50 active grants",
      "Spend-down threshold email alerts",
      "Restriction evidence links and alerts",
      "Restricted rollforward reports",
      "Budget exports and planned expenses",
      "Compliance report pack",
      "Program budget-vs-actual exports",
      "Drawdowns & reimbursement requests",
      "Indirect cost rules",
      "Reimbursement evidence packets",
      "Outcome and impact tracking",
      "Proposal and report drafting assistant",
      "Unlimited AI Award Document Intake",
      "Unlimited Ask-Your-Ledger reporting",
    ],
    entitlements: PLAN_ENTITLEMENTS.growth,
  },
  {
    tier: "audit_ready",
    name: PLAN_LABELS.audit_ready,
    description:
      "Give auditors, funders, and your board the proof they ask for. Evidence packs, portals, and audit trails are built in.",
    bestFit: "Prove every dollar",
    pricingPageGuide:
      "Audit-Ready is for teams facing a real review. You get evidence packages, an auditor portal, SEFA support, subrecipient monitoring, and audit trails.",
    chooseThisIf:
      "you face an audit, funder review, or board review. You need evidence packages, a portal, and audit trails.",
    prices: {
      monthlyCents: 19900,
      annualCents: 190800,
      annualMonthlyEquivalentCents: 15900,
    },
    highlighted: false,
    selfServe: true,
    ctaLabel: "Start Audit-Ready",
    ctaKind: "checkout",
    features: [
      "Everything in Growth",
      "Up to 100 active grants",
      "Restriction evidence package output",
      "Auditor & Funder Portal",
      "SEFA and single-audit support",
      "Subrecipient Monitoring",
      "Budget amendment history and audit views",
      "Financial statements and board-ready outputs",
      "Guided onboarding, import, and setup",
    ],
    entitlements: PLAN_ENTITLEMENTS.audit_ready,
  },
  {
    tier: "enterprise",
    name: PLAN_LABELS.enterprise,
    description:
      "For complex grant-funded nonprofits that need a direct conversation before choosing a path",
    bestFit: "Complex grant-funded teams that need founder guidance",
    pricingPageGuide:
      "Enterprise is for larger or unusual grant operations that need a direct founder conversation before choosing a path.",
    chooseThisIf:
      "you want to talk through a larger grant operation with the founder before choosing a path.",
    prices: null,
    highlighted: false,
    selfServe: false,
    ctaLabel: "Contact founder",
    ctaKind: "contact",
    features: [
      "Everything in Audit-Ready",
      "Unlimited active grants",
      "Multi-entity consolidation",
      "Cross-entity report builder",
      "Custom implementation planning",
      "Priority support",
    ],
    entitlements: PLAN_ENTITLEMENTS.enterprise,
  },
] as const;

export const FEDERAL_EDITION_SKU = {
  id: "federal_edition",
  name: "Federal Edition",
  eyebrow: "Federal compliance SKU",
  description:
    "For teams with federal awards. Plan SEFA prep, Uniform Guidance checks, and charge review in one rollout.",
  bestFit: "Teams with federal awards and a close review ahead",
  abovePlanTier: "audit_ready",
  priceAnchor: "Custom rollout plan. We set price after a call.",
  planningEstimateLabel: "Custom rollout plan",
  selfServe: false,
  ctaLabel: "Contact founder",
  ctaKind: "contact",
  features: [
    "Everything in Audit-Ready",
    "SEFA draft and single-audit tripwire",
    "Uniform Guidance checks at expense entry",
    "Review queue for odd or misposted charges",
    "Federal rollout plan",
  ],
} as const satisfies FederalEditionSku;

export function getFederalEditionSku(): FederalEditionSku {
  return FEDERAL_EDITION_SKU;
}

export function getPricingPlan(tier: PlanTier): PricingPlan {
  return PLAN_CATALOG.find((plan) => plan.tier === tier) ?? PLAN_CATALOG[0]!;
}

export function getSelfServePlans(): PricingPlan[] {
  return PLAN_CATALOG.filter((plan) => plan.selfServe);
}

export function getPlanLabelsWithEntitlement(
  entitlement: keyof PlanEntitlements,
): readonly string[] {
  return PLAN_CATALOG.filter((plan) => plan.entitlements[entitlement] === true).map(
    (plan) => plan.name,
  );
}

export function formatPlanLabelList(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

export function getPlanEntitlementLabelList(entitlement: keyof PlanEntitlements): string {
  return formatPlanLabelList(getPlanLabelsWithEntitlement(entitlement));
}

export function getPlanTierRank(tier: PlanTier): number {
  return PLAN_TIERS.indexOf(tier);
}

export function isPlanTierAtLeast(tier: PlanTier, minimum: PlanTier): boolean {
  return getPlanTierRank(tier) >= getPlanTierRank(minimum);
}

export function isSelfServePlan(tier: PlanTier): tier is SelfServePlanTier {
  return getPricingPlan(tier).selfServe;
}

export function getPlanPriceCents(tier: PlanTier, cycle: BillingCycle): number {
  const prices = getPricingPlan(tier).prices;
  if (!prices) return 0;
  return cycle === "annual" ? prices.annualCents : prices.monthlyCents;
}

// formatCurrencyCents now lives in ./format and is re-exported above for back-compat.

export function getPlanDisplayPrice(tier: PlanTier, cycle: BillingCycle): string {
  const prices = getPricingPlan(tier).prices;
  if (!prices) return "Custom pricing";
  if (cycle === "annual") {
    return `${formatCurrencyCents(prices.annualMonthlyEquivalentCents)}/mo billed annually`;
  }
  return `${formatCurrencyCents(prices.monthlyCents)}/mo`;
}

function getRoundedMonthlyDisplay(cents: number): string {
  return `${formatCurrencyCents(cents)}/mo`;
}

export function getPlanListDisplayPrice(tier: PlanTier, cycle: BillingCycle): PlanListDisplayPrice {
  const prices = getPricingPlan(tier).prices;
  if (!prices) {
    return {
      price: "Custom pricing",
      billingContext: "custom terms",
    };
  }

  if (cycle === "annual") {
    return {
      price: getRoundedMonthlyDisplay(prices.annualMonthlyEquivalentCents),
      billingContext: `${formatCurrencyCents(prices.annualCents)}/yr billed annually`,
    };
  }

  return {
    price: getRoundedMonthlyDisplay(prices.monthlyCents),
    billingContext: "monthly billing",
  };
}

export function getLaunchPromoPriceCents(
  _tier: PlanTier,
  _cycle: BillingCycle,
  _promo: LaunchPromo = LAUNCH_PROMO,
): number | null {
  return null;
}

export function getLaunchPromoDisplayPrice(
  _tier: PlanTier,
  _cycle: BillingCycle,
  _promo: LaunchPromo = LAUNCH_PROMO,
): LaunchPromoDisplayPrice | null {
  return null;
}

export function getPlanPromoDisplayPrice(
  _tier: PlanTier,
  _cycle: BillingCycle,
  _promo: LaunchPromo = LAUNCH_PROMO,
): PlanPromoDisplayPrice | null {
  return null;
}

function getSelfServeMonthlyRange(
  selector: (tier: SelfServePlanTier) => string,
  suffix: string,
): string {
  const prices = SELF_SERVE_PLAN_TIERS.map(selector);
  const first = prices[0]!.replace(/\/mo$/, "");
  const last = prices[prices.length - 1]!;
  return `${first}-${last} ${suffix}`;
}

export function getGrantPipePricingCopy(): GrantPipePricingCopy {
  const starterMonthly = getPlanListDisplayPrice("starter", "monthly");
  const starterAnnual = getPlanListDisplayPrice("starter", "annual");
  const growthMonthly = getPlanListDisplayPrice("growth", "monthly");
  const growthAnnual = getPlanListDisplayPrice("growth", "annual");
  const auditReadyMonthly = getPlanListDisplayPrice("audit_ready", "monthly");
  const auditReadyAnnual = getPlanListDisplayPrice("audit_ready", "annual");
  const starterMonthlyPromo = starterMonthly;
  const starterAnnualPromo = starterAnnual;
  const growthMonthlyPromo = growthMonthly;
  const growthAnnualPromo = growthAnnual;
  const auditReadyMonthlyPromo = auditReadyMonthly;
  const auditReadyAnnualPromo = auditReadyAnnual;
  const selfServeListRange = getSelfServeMonthlyRange(
    (tier) => getPlanListDisplayPrice(tier, "monthly").price,
    "list price",
  );
  const selfServeRange = selfServeListRange;
  return {
    selfServeRange,
    selfServeListRange,
    limitedOffer: "",
    limitedOfferHeadline: "",
    limitedOfferTitle: "",
    limitedOfferBadge: "",
    limitedOfferTerms: "",
    limitedOfferDeadline: "",
    limitedOfferBannerMessage: "",
    annualDefault: "Annual saves 20%.",
    starterMonthly: starterMonthly.price,
    starterAnnual: starterAnnual.price,
    starterMonthlyPromo: starterMonthlyPromo.price,
    starterAnnualPromo: starterAnnualPromo.price,
    growthMonthly: growthMonthly.price,
    growthAnnual: growthAnnual.price,
    growthMonthlyPromo: growthMonthlyPromo.price,
    growthAnnualPromo: growthAnnualPromo.price,
    auditReadyMonthly: auditReadyMonthly.price,
    auditReadyAnnual: auditReadyAnnual.price,
    auditReadyMonthlyPromo: auditReadyMonthlyPromo.price,
    auditReadyAnnualPromo: auditReadyAnnualPromo.price,
    starterLaunch: starterMonthly.price,
    growthLaunch: growthMonthly.price,
    auditReadyLaunch: auditReadyMonthly.price,
    selfServeLaunchRange: selfServeListRange.replace(/ list price$/, ""),
    tierLines: [
      `Starter: ${starterMonthly.price}, or ${starterAnnual.price} billed annually (${starterAnnual.billingContext.replace(" billed annually", "")}).`,
      `Growth: ${growthMonthly.price}, or ${growthAnnual.price} billed annually (${growthAnnual.billingContext.replace(" billed annually", "")}).`,
      `Audit-Ready: ${auditReadyMonthly.price}, or ${auditReadyAnnual.price} billed annually (${auditReadyAnnual.billingContext.replace(" billed annually", "")}).`,
      `Enterprise: contact founder at ${FOUNDER_CONTACT_EMAIL} or LinkedIn at ${FOUNDER_LINKEDIN_URL}.`,
    ],
    annualTierLines: [
      `Starter: ${starterAnnual.price}, ${starterAnnualPromo.billingContext}.`,
      `Growth: ${growthAnnual.price}, ${growthAnnualPromo.billingContext}.`,
      `Audit-Ready: ${auditReadyAnnual.price}, ${auditReadyAnnualPromo.billingContext}.`,
      `Enterprise: contact founder at ${FOUNDER_CONTACT_EMAIL} or LinkedIn at ${FOUNDER_LINKEDIN_URL}.`,
    ],
    schemaOfferLines: [
      starterMonthlyPromo.price,
      growthMonthlyPromo.price,
      auditReadyMonthlyPromo.price,
      "Custom pricing",
    ],
  };
}

export function getBillingCycleLabel(cycle: BillingCycle): string {
  return cycle === "annual" ? "Annual" : "Monthly";
}

export function isLaunchPromoEligible(
  _tier: PlanTier,
  _cycle: BillingCycle,
  _now: Date = new Date(),
  _promo: LaunchPromo = LAUNCH_PROMO,
): boolean {
  return false;
}

export function normalizePromoCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return normalized;
}

export function getPlanEntitlements(value: string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlanTier(value)];
}

export function getActiveGrantCap(value: string | null | undefined): number {
  return getPlanEntitlements(value).activeGrantCap;
}

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  if (value && (PLAN_TIERS as readonly string[]).includes(value)) {
    return value as PlanTier;
  }

  return "starter";
}

export type MarketedFeatureKey = keyof PlanEntitlements | "activeGrantCap";

export const PLAN_ENTITLEMENT_KEYS = [
  "activeGrantCap",
  "hasAutomationEmails",
  "hasComplianceReportPack",
  "hasGuidedOnboarding",
  "hasGrantOpportunitySearch",
  "canViewProgramContext",
  "canManagePrograms",
  "canManageProgramAllocations",
  "canExportProgramReports",
  "hasRestrictionLifecycle",
  "hasRestrictionEvidencePackage",
  "hasAuditorFunderPortal",
  "hasPaymentRequests",
  "hasIndirectCostRules",
  "hasPaymentEvidencePackage",
  "hasAwardDocumentIntake",
  "hasGrantBudgetBasics",
  "hasGrantBudgetAlerts",
  "hasGrantBudgetExports",
  "hasPlannedExpenses",
  "hasGrantBudgetAiExtraction",
  "hasGrantBudgetAmendments",
  "hasGrantBudgetAuditViews",
  "hasAccountingIntegrations",
  "hasSubrecipientMonitoring",
  "hasMultiEntityConsolidation",
  "hasAccountingAnomalyDetector",
  "hasPledgeTracker",
  "hasFunctionalExpenseAllocation",
  "hasCrossEntityReportBuilder",
  "hasAskYourLedger",
  "hasOutcomeImpactMeasurement",
  "hasProposalReportDrafting",
] as const satisfies readonly MarketedFeatureKey[];

export type MarketedFeatureGroup =
  | "capacity"
  | "donor_grant_ops"
  | "compliance"
  | "fund_accounting"
  | "ai_automation"
  | "onboarding_support";

export type MarketedFeatureCell = "included" | "not_included" | "preview" | string;

export type MarketedFeatureRow = {
  key: MarketedFeatureKey;
  group: MarketedFeatureGroup;
  label: string;
  byTier: Record<PlanTier, MarketedFeatureCell>;
};

function activeGrantCapLabel(cap: number): string {
  return Number.isFinite(cap) ? `Up to ${cap.toLocaleString("en-US")}` : "Unlimited";
}

function entitlementCells(key: keyof PlanEntitlements): Record<PlanTier, MarketedFeatureCell> {
  const cells = {} as Record<PlanTier, MarketedFeatureCell>;
  for (const tier of PLAN_TIERS) {
    const value = PLAN_ENTITLEMENTS[tier][key];
    cells[tier] = value === true ? "included" : "not_included";
  }
  return cells;
}

export const MARKETED_FEATURE_CATALOG: readonly MarketedFeatureRow[] = [
  {
    key: "activeGrantCap",
    group: "capacity",
    label: "Active grants",
    byTier: {
      starter: activeGrantCapLabel(PLAN_ENTITLEMENTS.starter.activeGrantCap),
      growth: activeGrantCapLabel(PLAN_ENTITLEMENTS.growth.activeGrantCap),
      audit_ready: activeGrantCapLabel(PLAN_ENTITLEMENTS.audit_ready.activeGrantCap),
      enterprise: activeGrantCapLabel(PLAN_ENTITLEMENTS.enterprise.activeGrantCap),
    },
  },
  {
    key: "hasGrantOpportunitySearch",
    group: "donor_grant_ops",
    label: "Multi-source grant pipeline with Grants.gov search",
    byTier: entitlementCells("hasGrantOpportunitySearch"),
  },
  {
    key: "hasGrantBudgetBasics",
    group: "donor_grant_ops",
    label: "Grant budget lines and budget-vs-actual views",
    byTier: entitlementCells("hasGrantBudgetBasics"),
  },
  {
    key: "hasPlannedExpenses",
    group: "donor_grant_ops",
    label: "Planned expenses",
    byTier: entitlementCells("hasPlannedExpenses"),
  },
  {
    key: "hasGrantBudgetAlerts",
    group: "compliance",
    label: "Budget alerts (over-budget, underspend, deadline)",
    byTier: entitlementCells("hasGrantBudgetAlerts"),
  },
  {
    key: "hasGrantBudgetExports",
    group: "compliance",
    label: "Budget exports (PDF/CSV/JSON)",
    byTier: entitlementCells("hasGrantBudgetExports"),
  },
  {
    key: "hasAutomationEmails",
    group: "compliance",
    label: "Automated deadline and spend-down emails",
    byTier: entitlementCells("hasAutomationEmails"),
  },
  {
    key: "hasComplianceReportPack",
    group: "compliance",
    label: "Compliance report pack",
    byTier: entitlementCells("hasComplianceReportPack"),
  },
  {
    key: "hasRestrictionLifecycle",
    group: "compliance",
    label: "Restriction lifecycle (terms, additions, releases)",
    byTier: entitlementCells("hasRestrictionLifecycle"),
  },
  {
    key: "hasRestrictionEvidencePackage",
    group: "compliance",
    label: "Restriction evidence package output",
    byTier: entitlementCells("hasRestrictionEvidencePackage"),
  },
  {
    key: "hasAuditorFunderPortal",
    group: "compliance",
    label: "Auditor & Funder Portal",
    byTier: entitlementCells("hasAuditorFunderPortal"),
  },
  {
    key: "hasPaymentRequests",
    group: "fund_accounting",
    label: "Drawdowns & reimbursement requests",
    byTier: entitlementCells("hasPaymentRequests"),
  },
  {
    key: "hasPaymentEvidencePackage",
    group: "fund_accounting",
    label: "Reimbursement evidence packets",
    byTier: entitlementCells("hasPaymentEvidencePackage"),
  },
  {
    key: "hasIndirectCostRules",
    group: "fund_accounting",
    label: "Indirect cost rate rules",
    byTier: entitlementCells("hasIndirectCostRules"),
  },
  {
    key: "canViewProgramContext",
    group: "fund_accounting",
    label: "Program allocation visibility",
    byTier: entitlementCells("canViewProgramContext"),
  },
  {
    key: "canManagePrograms",
    group: "fund_accounting",
    label: "Manage programs",
    byTier: entitlementCells("canManagePrograms"),
  },
  {
    key: "canManageProgramAllocations",
    group: "fund_accounting",
    label: "Manage program allocations",
    byTier: entitlementCells("canManageProgramAllocations"),
  },
  {
    key: "canExportProgramReports",
    group: "fund_accounting",
    label: "Program budget-vs-actual exports",
    byTier: entitlementCells("canExportProgramReports"),
  },
  {
    key: "hasGrantBudgetAmendments",
    group: "fund_accounting",
    label: "Budget amendment history",
    byTier: entitlementCells("hasGrantBudgetAmendments"),
  },
  {
    key: "hasGrantBudgetAuditViews",
    group: "fund_accounting",
    label: "Budget audit views",
    byTier: entitlementCells("hasGrantBudgetAuditViews"),
  },
  {
    key: "hasAccountingIntegrations",
    group: "fund_accounting",
    label: "External accounting integrations",
    byTier: entitlementCells("hasAccountingIntegrations"),
  },
  {
    key: "hasSubrecipientMonitoring",
    group: "compliance",
    label: "Subrecipient monitoring",
    byTier: entitlementCells("hasSubrecipientMonitoring"),
  },
  {
    key: "hasMultiEntityConsolidation",
    group: "fund_accounting",
    label: "Multi-entity consolidation",
    byTier: entitlementCells("hasMultiEntityConsolidation"),
  },
  {
    key: "hasAccountingAnomalyDetector",
    group: "fund_accounting",
    label: "Anomaly and misallocation detector",
    byTier: entitlementCells("hasAccountingAnomalyDetector"),
  },
  {
    key: "hasGrantBudgetAiExtraction",
    group: "ai_automation",
    label: "AI grant budget extraction",
    byTier: entitlementCells("hasGrantBudgetAiExtraction"),
  },
  {
    key: "hasAwardDocumentIntake",
    group: "ai_automation",
    label: "AI Award Document Intake",
    byTier: entitlementCells("hasAwardDocumentIntake"),
  },
  {
    key: "hasGuidedOnboarding",
    group: "onboarding_support",
    label: "Guided onboarding, import, and setup",
    byTier: entitlementCells("hasGuidedOnboarding"),
  },
  {
    key: "hasPledgeTracker",
    group: "donor_grant_ops",
    label: "Pledge & multi-year commitment tracker",
    byTier: entitlementCells("hasPledgeTracker"),
  },
  {
    key: "hasFunctionalExpenseAllocation",
    group: "fund_accounting",
    label: "Functional expense allocation studio",
    byTier: entitlementCells("hasFunctionalExpenseAllocation"),
  },
  {
    key: "hasCrossEntityReportBuilder",
    group: "compliance",
    label: "Cross-entity report builder",
    byTier: entitlementCells("hasCrossEntityReportBuilder"),
  },
  {
    key: "hasOutcomeImpactMeasurement",
    group: "compliance",
    label: "Outcome and impact measurement",
    byTier: entitlementCells("hasOutcomeImpactMeasurement"),
  },
  {
    key: "hasAskYourLedger",
    group: "ai_automation",
    label: "Ask-Your-Ledger grounded reporting",
    byTier: entitlementCells("hasAskYourLedger"),
  },
  {
    key: "hasProposalReportDrafting",
    group: "ai_automation",
    label: "Proposal and report drafting assistant",
    byTier: entitlementCells("hasProposalReportDrafting"),
  },
];

export function getMarketedFeatureRows(): readonly MarketedFeatureRow[] {
  return MARKETED_FEATURE_CATALOG;
}

export const MARKETED_FEATURE_GROUPS: readonly {
  group: MarketedFeatureGroup;
  label: string;
}[] = [
  { group: "capacity", label: "Plan capacity" },
  { group: "donor_grant_ops", label: "Donor & grant operations" },
  { group: "compliance", label: "Compliance & evidence" },
  { group: "fund_accounting", label: "Fund accounting & program allocation" },
  { group: "ai_automation", label: "AI & automation" },
  { group: "onboarding_support", label: "Onboarding & support" },
];

export function getMarketedFeatureCellLabel(cell: MarketedFeatureCell): string {
  if (cell === "included") return "Included";
  if (cell === "not_included") return "—";
  if (cell === "preview") return "Preview";
  return cell;
}

export const GRANTPIPE_TRIAL_COPY =
  "1-month free trial. No credit card required to start. Add billing later if the trial is a fit.";

export type EffectivePlanTierInput = {
  planTier: string | null | undefined;
  subscriptionStatus: SubscriptionStatus | string | null | undefined;
  trialEndsAt: string | Date | null | undefined;
};

/**
 * Default plan tier for legacy trial records that predate explicit plan choice.
 * New trials keep the plan selected during signup.
 */
export const TRIAL_EFFECTIVE_PLAN_TIER: PlanTier = "starter";

export function getEffectivePlanTier(
  input: EffectivePlanTierInput,
  _now: Date = new Date(),
): PlanTier {
  return normalizePlanTier(input.planTier);
}

export type PremiumFeatureKey = Exclude<
  keyof PlanEntitlements,
  "activeGrantCap" | "hasAccountingIntegrations"
>;

export const PREMIUM_FEATURE_KEYS: readonly PremiumFeatureKey[] = (
  Object.keys(PLAN_ENTITLEMENTS.starter) as (keyof PlanEntitlements)[]
).filter(
  (key): key is PremiumFeatureKey =>
    key !== "activeGrantCap" &&
    key !== "hasAccountingIntegrations" &&
    PLAN_ENTITLEMENTS.starter[key] === false,
);

export function isPremiumFeatureKey(value: string): value is PremiumFeatureKey {
  return (PREMIUM_FEATURE_KEYS as readonly string[]).includes(value);
}

export function getMinimumPlanForFeatures(features: readonly PremiumFeatureKey[]): PlanTier {
  for (const tier of PLAN_TIERS) {
    const entitlements = PLAN_ENTITLEMENTS[tier];
    if (features.every((key) => entitlements[key] === true)) {
      return tier;
    }
  }
  return "enterprise";
}

export function formatMinimumPlanLabelForFeatures(features: readonly PremiumFeatureKey[]): string {
  return PLAN_LABELS[getMinimumPlanForFeatures(features)];
}
