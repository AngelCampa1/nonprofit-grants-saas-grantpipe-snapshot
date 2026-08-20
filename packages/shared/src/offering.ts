import {
  GRANTPIPE_OS_BOILERPLATE,
  GRANTPIPE_OS_CATEGORY,
  GRANTPIPE_OS_MODULES,
  GRANTPIPE_OS_PLAN_LANGUAGE,
} from "./positioning";
import {
  DEFAULT_BILLING_CYCLE,
  GRANTPIPE_GUARANTEE_COPY,
  LAUNCH_PROMO,
  PLAN_CATALOG,
  UNIVERSAL_PLAN_INCLUSIONS,
  getLaunchPromoDisplayPrice,
  getPlanDisplayPrice,
} from "./pricing";
import { marketingKnowledge } from "./knowledge/marketing";

export const OFFERING = {
  positioning: {
    category: GRANTPIPE_OS_CATEGORY,
    boilerplate: GRANTPIPE_OS_BOILERPLATE,
    tagline: marketingKnowledge.productPositioning.tagline,
    modules: GRANTPIPE_OS_MODULES,
    planLanguage: GRANTPIPE_OS_PLAN_LANGUAGE,
  },
  icp: marketingKnowledge.icp,
  plans: PLAN_CATALOG,
  universalInclusions: UNIVERSAL_PLAN_INCLUSIONS,
  billing: { defaultCycle: DEFAULT_BILLING_CYCLE },
  promo: LAUNCH_PROMO,
  guarantee: GRANTPIPE_GUARANTEE_COPY,
  trial: marketingKnowledge.trial,
  display: { getPlanDisplayPrice, getLaunchPromoDisplayPrice },
} as const;

export type Offering = typeof OFFERING;
