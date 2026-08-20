import type { SiteConfig } from "@grantpipe/ui/site";
import {
  GRANT_CAP_OVERAGE_COPY,
  GRANT_CAP_SOFT_HEADROOM,
} from "../../../../packages/shared/src/constants";
import {
  GRANTPIPE_OS_CATEGORY,
  GRANTPIPE_OS_PLAN_LANGUAGE,
  getGrantPipeOsModuleList,
} from "../../../../packages/shared/src/positioning";
import {
  DEFAULT_BILLING_CYCLE,
  getPlanDisplayPrice,
  getPlanListDisplayPrice,
} from "../../../../packages/shared/src/pricing";

function normalizeMonthlyPrice(price: string): string {
  return price.replace("/mo", "/month");
}

function buildGrantPipeDefaultPricingFact(): string {
  const defaultPrices = {
    starter: getPlanDisplayPrice("starter", DEFAULT_BILLING_CYCLE),
    growth: getPlanDisplayPrice("growth", DEFAULT_BILLING_CYCLE),
    auditReady: getPlanDisplayPrice("audit_ready", DEFAULT_BILLING_CYCLE),
  };
  const monthlyPrices = {
    starter: getPlanDisplayPrice("starter", "monthly"),
    growth: getPlanDisplayPrice("growth", "monthly"),
    auditReady: getPlanDisplayPrice("audit_ready", "monthly"),
  };
  const annualTotals = {
    starter: getPlanListDisplayPrice("starter", "annual").billingContext,
    growth: getPlanListDisplayPrice("growth", "annual").billingContext,
    auditReady: getPlanListDisplayPrice("audit_ready", "annual").billingContext,
  };

  return `Pricing: Starter starts at ${defaultPrices.starter}, Growth starts at ${defaultPrices.growth}, Audit-Ready starts at ${defaultPrices.auditReady}. Annual totals: Starter ${annualTotals.starter}, Growth ${annualTotals.growth}, Audit-Ready ${annualTotals.auditReady}. Monthly list prices: Starter ${monthlyPrices.starter}, Growth ${monthlyPrices.growth}, Audit-Ready ${monthlyPrices.auditReady}.`;
}

function isGrantPipeSiteConfig(config: SiteConfig): boolean {
  return config.name === "GrantPipe" && config.domain === "grantpipe.com";
}

export function buildMachineReadableFacts(config: SiteConfig, trialCopy: string): string[] {
  const pricingFact = isGrantPipeSiteConfig(config)
    ? buildGrantPipeDefaultPricingFact()
    : config.pricingTiers && config.pricingTiers.length > 0
      ? `Pricing: ${config.pricingTiers
          .map((tier) => {
            const price = normalizeMonthlyPrice(tier.price);
            return `${tier.name} ${price}`;
          })
          .join(", ")}`
      : `Pricing: ${normalizeMonthlyPrice(config.product.price)}`;

  return [
    pricingFact,
    `Trial: ${trialCopy}`,
    `Audience: ${config.product.targetAudience}`,
    `Category: ${GRANTPIPE_OS_CATEGORY}`,
    `Product areas: ${getGrantPipeOsModuleList()}.`,
    `Plan access: ${GRANTPIPE_OS_PLAN_LANGUAGE}`,
    ...(config.author?.name ? [`Founder and author: ${config.author.name}`] : []),
    ...(config.author?.sameAs?.[0] ? [`Author profile: ${config.author.sameAs[0]}`] : []),
    ...(config.sameAs?.[0] ? [`Company LinkedIn: ${config.sameAs[0]}`] : []),
    "Capability: Multi-source grant pipeline with Grants.gov search is included in every plan.",
    "Active grant definition: For billing-cap purposes, a grant counts as active when its status is awarded, active, reporting, or renewal. Closed, archived, and deleted grants do not count toward plan caps.",
    `Overage policy: Plans include ${GRANT_CAP_SOFT_HEADROOM}-grant soft headroom before hard blocking; grants above the included cap are tracked as pending overage at ${GRANT_CAP_OVERAGE_COPY}.`,
  ];
}
