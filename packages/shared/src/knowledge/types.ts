import type { GuideKey } from "../validators/help";
import type { BillingCycle, PlanTier } from "../constants";
import type { Role } from "../types";

export type KnowledgeConsumer =
  | "public-marketing"
  | "authenticated-help"
  | "ai-sdr"
  | "customer-support-ai";

export type KnowledgeVisibility = "public" | "authenticated";
export type KnowledgeSafety = "public-safe" | "authenticated-user-safe";
export type KnowledgeAppRole = Role;
export type HelpCategory = "Start here" | "Daily work" | "Reports" | "Admin";

export type KnowledgeRoutePath =
  | "/help"
  | "/settings"
  | "/import"
  | "/donors"
  | "/donors/pledges"
  | "/grants"
  | "/grants/sentinel"
  | "/funds"
  | "/reports"
  | "/accounting/reports/activities"
  | "/accounting/reports/functional-expenses";

export type AppHelpRoute = Exclude<KnowledgeRoutePath, "/help">;

type KnowledgeCtaBase = {
  label: string;
  roles?: readonly KnowledgeAppRole[];
};

export type KnowledgeCta = KnowledgeCtaBase & {
  to: AppHelpRoute;
  hash?: string;
};

export type KnowledgeHelpArticle = {
  key: GuideKey;
  title: string;
  summary: string;
  category: HelpCategory;
  aliases?: readonly string[];
  steps: readonly string[];
  cta: KnowledgeCta;
  searchText: string;
  consumers: readonly KnowledgeConsumer[];
  visibility: Extract<KnowledgeVisibility, "authenticated">;
  safety: Extract<KnowledgeSafety, "authenticated-user-safe">;
};

export type AppHelpArticle = KnowledgeHelpArticle;

export type AppRouteKnowledge = {
  path: KnowledgeRoutePath;
  label: string;
  roles: readonly KnowledgeAppRole[];
  supportSafe: true;
};

export type AppKnowledgeIndex = {
  generatedAt: string;
  helpCategories: readonly HelpCategory[];
  helpArticles: KnowledgeHelpArticle[];
  routes: readonly AppRouteKnowledge[];
};

export const MARKETING_CONTENT_COLLECTIONS = [
  "alternatives",
  "benchmarks",
  "city-pages",
  "comparisons",
  "faq-hubs",
  "features",
  "glossary",
  "guides",
  "integrations",
  "lead-magnets",
  "listicles",
  "personas",
  "pricing-breakdowns",
  "state-pages",
  "vertical-pages",
  "workflows",
] as const;

export type MarketingContentCollection = (typeof MARKETING_CONTENT_COLLECTIONS)[number];

export type MarketingKnowledgeEntry = {
  id: string;
  title: string;
  collection: string;
  slug: string;
  path: string;
  consumers: readonly string[];
  visibility: string;
  safety: string;
};

export type MarketingKnowledgeIndex = {
  generatedAt: string;
  entries: readonly MarketingKnowledgeEntry[];
};

export type PublicKnowledgeIndex = MarketingKnowledgeIndex;

export type SourceReference = {
  label: string;
  url: string;
};

export type CompetitorBattlecard = {
  slug: string;
  name: string;
  pricing: string;
  pricingSummary: string;
  contractSummary: string;
  setupSummary: string;
  donorCrmSummary: string;
  grantSummary: string;
  complianceSummary: string;
  bestFor: string;
  weakness: string;
  setupFee?: string;
  verifiedAt: string;
  sources: readonly SourceReference[];
};

export type MarketingPlanKnowledge = {
  tier: PlanTier;
  name: string;
  description: string;
  bestFit: string;
  displayPrices: Record<BillingCycle, string>;
  features: readonly string[];
};

export type MarketingCtaKnowledge = {
  label: string;
  href: string;
  message?: string;
  subtitle?: string;
};

export type MarketingObjection = {
  id: string;
  question: string;
  answer: string;
};

export type MarketingKnowledge = {
  brand: {
    name: string;
    domain: string;
    siteUrl: string;
    appUrl: string;
    signupPath: string;
    signupUrl: string;
    pricingPath: string;
    pricingUrl: string;
    emailLogoUrl: string;
    lightLogoPath: string;
  };
  contact: {
    publicEmail: string;
    supportEmail: string;
    founderEmail: string;
    transactionalSender: string;
    feedbackSender: string;
  };
  productPositioning: {
    category: string;
    tagline: string;
    boilerplate: string;
    modules: readonly string[];
  };
  icp: {
    primaryAudience: string;
  };
  founder: {
    name: string;
    email: string;
    title: string;
    url: string;
    sameAs: readonly string[];
  };
  trial: {
    copy: string;
    noCreditCardRequired: boolean;
  };
  billing: {
    defaultCycle: BillingCycle;
  };
  promos: {
    launch: {
      code: string;
      label: string;
      description: string;
      percentOff: number;
      eligibleBillingCycles: readonly BillingCycle[];
    };
  };
  emails: {
    signature: string;
    replyToBehavior: string;
    leadFooterCopy: string;
    trialOfferCopy: string;
    enterprisePricingCopy: string;
  };
  ctas: {
    trial: MarketingCtaKnowledge;
    resources: MarketingCtaKnowledge;
    productWalkthrough: MarketingCtaKnowledge;
    headerMobileEyebrow: string;
  };
  objections: readonly MarketingObjection[];
  plans: readonly MarketingPlanKnowledge[];
  competitorBattlecards: readonly CompetitorBattlecard[];
  content: MarketingKnowledgeIndex;
};

export type KnowledgeConsumerJson = "marketing_ai_sdr" | "customer_support_ai" | "combined";
