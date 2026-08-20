import {
  DEFAULT_BILLING_CYCLE,
  GRANTPIPE_TRIAL_COPY,
  LAUNCH_PROMO,
  PLAN_CATALOG,
  FOUNDER_CONTACT_EMAIL,
  getPlanDisplayPrice,
} from "../../pricing";
import {
  GRANTPIPE_OS_BOILERPLATE,
  GRANTPIPE_OS_CATEGORY,
  GRANTPIPE_OS_MODULES,
} from "../../positioning";
import { getDirectCompetitorBattlecards } from "./market-facts";
import { MARKETING_KNOWLEDGE_INDEX } from "../generated/indexes";
import type { MarketingKnowledge } from "../types";
import { buildAppUrl } from "../../app-url";

const APP_URL = "https://app.grantpipe.com";
const SIGNUP_PATH = "/app/signup";

export {
  getMarketingContentCollectionBase,
  getMarketingContentRepositoryRoot,
} from "./content-root";
export {
  competitorProfiles,
  directCompetitorSlugs,
  getCompetitorProfile,
  getDirectCompetitorBattlecards,
  grantPipeMarketPosition,
  type CompetitorProfile,
} from "./market-facts";

export const marketingKnowledge: MarketingKnowledge = {
  brand: {
    name: "GrantPipe",
    domain: "grantpipe.com",
    siteUrl: "https://grantpipe.com",
    appUrl: APP_URL,
    signupPath: SIGNUP_PATH,
    signupUrl: buildAppUrl(APP_URL, SIGNUP_PATH),
    pricingPath: "/pricing",
    pricingUrl: "https://grantpipe.com/pricing",
    emailLogoUrl: "https://grantpipe.com/logo-email.png",
    lightLogoPath: "/logo-light.svg",
  },
  contact: {
    publicEmail: "angel.campa@grantpipe.com",
    supportEmail: "angel.campa@grantpipe.com",
    founderEmail: FOUNDER_CONTACT_EMAIL,
    transactionalSender: "GrantPipe <angel.campa@grantpipe.com>",
    feedbackSender: "GrantPipe Feedback <angel.campa@grantpipe.com>",
  },
  productPositioning: {
    category: GRANTPIPE_OS_CATEGORY,
    tagline: "Compliance-first grant management system.",
    boilerplate: GRANTPIPE_OS_BOILERPLATE,
    modules: [...GRANTPIPE_OS_MODULES],
  },
  icp: {
    primaryAudience:
      "Executive Directors and Development Directors at mid-sized nonprofits ($500K-$10M budgets)",
  },
  founder: {
    name: "Angel Campa",
    email: FOUNDER_CONTACT_EMAIL,
    title: "Founder & Principal SDET",
    url: "https://grantpipe.com/about/",
    sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
  },
  trial: {
    copy: GRANTPIPE_TRIAL_COPY,
    noCreditCardRequired: true,
  },
  billing: {
    defaultCycle: DEFAULT_BILLING_CYCLE,
  },
  promos: {
    launch: LAUNCH_PROMO,
  },
  emails: {
    signature: "Angel Campa\nFounder, GrantPipe",
    replyToBehavior: "Replies go to the founder inbox at angel.campa@grantpipe.com.",
    leadFooterCopy: "You're receiving this because you downloaded a resource from grantpipe.com.",
    trialOfferCopy: GRANTPIPE_TRIAL_COPY,
    enterprisePricingCopy: `For larger cases, contact founder Angel Campa at ${FOUNDER_CONTACT_EMAIL}.`,
  },
  ctas: {
    trial: {
      label: "Start your 1-month free trial",
      href: buildAppUrl(APP_URL, SIGNUP_PATH),
      message: "Start your 1-month free trial to see pricing details and next steps.",
      subtitle:
        "Start a 1-month free trial with no credit card required and see compliance deadlines, restricted funds, donor records, Grants.gov search, non-federal opportunity tracking, and reporting in one workspace.",
    },
    resources: {
      label: "Explore GrantPipe resources",
      href: "/resources",
    },
    productWalkthrough: {
      label: "See the product walkthrough",
      href: "/product",
    },
    headerMobileEyebrow: "Start free trial",
  },
  objections: [
    {
      id: "replace-crm",
      question: "Can GrantPipe replace our existing CRM?",
      answer:
        "Yes. GrantPipe is built to connect donor relationships with grant compliance, restricted funds, evidence, and reporting in the same workspace.",
    },
    {
      id: "migration",
      question: "What does migration support look like?",
      answer:
        "Starter and Growth use self-serve CSV import tools and docs. Audit-Ready and Enterprise add guided onboarding, import, and setup.",
    },
    {
      id: "salesforce-admin",
      question: "Do we need a Salesforce admin or consultant?",
      answer:
        "No. GrantPipe is designed for nonprofit staff-led setup, with pricing and workflows that do not require a separate platform admin.",
    },
  ],
  plans: PLAN_CATALOG.map((plan) => ({
    tier: plan.tier,
    name: plan.name,
    description: plan.description,
    bestFit: plan.bestFit,
    displayPrices: {
      monthly: getPlanDisplayPrice(plan.tier, "monthly"),
      annual: getPlanDisplayPrice(plan.tier, "annual"),
    },
    features: plan.features,
  })),
  competitorBattlecards: getDirectCompetitorBattlecards(),
  content: MARKETING_KNOWLEDGE_INDEX,
};
