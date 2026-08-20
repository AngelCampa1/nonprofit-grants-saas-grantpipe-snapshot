import {
  DEFAULT_BILLING_CYCLE,
  FEDERAL_EDITION_SKU,
  getGrantPipePricingCopy,
  getPlanDisplayPrice,
  getPricingPlan,
} from "../pricing";
import { marketingKnowledge } from "../knowledge/marketing";
import { TRIAL_DAYS, type BillingCycle, type PlanTier } from "../constants";

export type AiSdrProductSource = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
};

export type AiSdrProductPlan = {
  id: string;
  name: string;
  price: string;
  monthlyPrice: string;
  annualPrice: string;
  discount: string;
  defaultCadence: "year" | "month";
  trialDays: number;
  ctaUrl: string;
  features: string[];
};

export type AiSdrMeetingLink = {
  id: string;
  label: string;
  url: string;
  description?: string;
};

export type AiSdrContactSku = {
  id: string;
  name: string;
  description: string;
  priceAnchor: string;
  ctaUrl: string;
  ctaLabel: string;
  features: string[];
};

export type AiSdrProductContext = {
  productId: string;
  name: string;
  description: string;
  sources: AiSdrProductSource[];
  plans: AiSdrProductPlan[];
  contactSkus?: AiSdrContactSku[];
  meetingLinks?: AiSdrMeetingLink[];
};

export const GRANTPIPE_AI_SDR_PRODUCT_ID = "grantpipe";

const AI_SDR_CADENCE_BY_BILLING_CYCLE = {
  annual: "year",
  monthly: "month",
} as const satisfies Record<BillingCycle, AiSdrProductPlan["defaultCadence"]>;

const DEFAULT_AI_SDR_CADENCE = AI_SDR_CADENCE_BY_BILLING_CYCLE[DEFAULT_BILLING_CYCLE];
const AI_ASSISTANT_SIGNUP_ATTRIBUTION =
  "source_section=ai-assistant&cta_page_family=ai-assistant&cta_placement=assistant-answer";

function priceForTier(tier: PlanTier): string {
  return getPlanDisplayPrice(tier, marketingKnowledge.billing.defaultCycle);
}

function aiAssistantSignupUrl(): string {
  const url = new URL(marketingKnowledge.brand.signupUrl);
  const attribution = new URLSearchParams(AI_ASSISTANT_SIGNUP_ATTRIBUTION);
  attribution.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function founderContactUrl(): string {
  return `mailto:${marketingKnowledge.contact.founderEmail}`;
}

export function buildGrantPipeAiSdrProductContext(): AiSdrProductContext {
  const pricingCopy = getGrantPipePricingCopy();
  const signupUrl = aiAssistantSignupUrl();
  const contactUrl = founderContactUrl();

  return {
    productId: GRANTPIPE_AI_SDR_PRODUCT_ID,
    name: marketingKnowledge.brand.name,
    description: marketingKnowledge.productPositioning.boilerplate,
    sources: [
      {
        id: "positioning",
        title: "GrantPipe positioning",
        url: marketingKnowledge.brand.siteUrl,
        excerpt: `${marketingKnowledge.productPositioning.category}. ${marketingKnowledge.productPositioning.tagline}`,
      },
      {
        id: "pricing",
        title: "Pricing",
        url: marketingKnowledge.brand.pricingUrl,
        excerpt: `Self-serve plans use ${marketingKnowledge.billing.defaultCycle} billing by default. ${marketingKnowledge.trial.copy}`,
      },
      {
        id: "modules",
        title: "Product modules",
        url: `${marketingKnowledge.brand.siteUrl}/product/`,
        excerpt: marketingKnowledge.productPositioning.modules.join(", "),
      },
      {
        id: "founder-contact",
        title: "Founder contact",
        url: `${marketingKnowledge.brand.siteUrl}/about/`,
        excerpt: `Founder sales contact: ${marketingKnowledge.contact.founderEmail}.`,
      },
    ],
    meetingLinks: [],
    contactSkus: [
      {
        id: FEDERAL_EDITION_SKU.id,
        name: FEDERAL_EDITION_SKU.name,
        description: FEDERAL_EDITION_SKU.description,
        priceAnchor: FEDERAL_EDITION_SKU.priceAnchor,
        ctaUrl: contactUrl,
        ctaLabel: FEDERAL_EDITION_SKU.ctaLabel,
        features: [...FEDERAL_EDITION_SKU.features],
      },
    ],
    plans: (["starter", "growth", "audit_ready"] as const).map((tier) => {
      const plan = getPricingPlan(tier);
      return {
        id: tier,
        name: plan.name,
        price: priceForTier(tier),
        monthlyPrice: getPlanDisplayPrice(tier, "monthly"),
        annualPrice: getPlanDisplayPrice(tier, "annual"),
        discount: pricingCopy.limitedOffer,
        defaultCadence: DEFAULT_AI_SDR_CADENCE,
        trialDays: TRIAL_DAYS,
        ctaUrl: signupUrl,
        features: [...plan.features],
      };
    }),
  };
}
