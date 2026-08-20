import type { SiteConfig, PricingTier } from "@grantpipe/ui/site";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
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
  FEDERAL_EDITION_SKU,
  GRANTPIPE_GUARANTEE_STACK,
  UNIVERSAL_PLAN_INCLUSIONS,
} from "../../../../packages/shared/src/pricing";
import { grantCategoryPages } from "../config/grant-recipient-seo";

export const PRICING_TXT_LAST_UPDATED = "2026-07-03";

/** Computes the annual monthly price in cents using a 20% annual discount. */
function annualMonthlyDollars(monthlyPriceCents: number): number {
  return Math.floor((monthlyPriceCents * 0.8) / 100);
}

function annualTotalMonthlyDollars(annualPriceCents: number): number {
  return Math.ceil(annualPriceCents / 12 / 100);
}

function annualTotalLabel(annualPriceCents: number): string {
  return `$${Math.round(annualPriceCents / 100).toLocaleString("en-US")}/year`;
}

function sentenceCaseKnownTrialCopy(text: string): string {
  return text.replace(/\. no credit/g, ". No credit").replace(/\. add billing/g, ". Add billing");
}

function formatTierSection(tier: PricingTier): string {
  const monthlyLabel = tier.price.replace(/\/mo\b/, "/month");
  const annualOverrideLabel = tier.annualPriceOverride?.replace(/\/mo\b/, "/month");
  const popularMarker = tier.highlighted === true ? " [Most Popular]" : "";

  let heading: string;
  if (annualOverrideLabel !== undefined) {
    const annualTotal =
      tier.annualPriceCents !== undefined ? `${annualTotalLabel(tier.annualPriceCents)}; ` : "";
    heading = `### ${tier.name} - ${annualOverrideLabel} (${annualTotal}${monthlyLabel} monthly list price)${popularMarker}`;
  } else if (tier.monthlyPriceCents !== undefined) {
    const annualDollars =
      tier.annualPriceCents !== undefined
        ? annualTotalMonthlyDollars(tier.annualPriceCents)
        : annualMonthlyDollars(tier.monthlyPriceCents);
    const annualTotal =
      tier.annualPriceCents !== undefined ? `${annualTotalLabel(tier.annualPriceCents)}; ` : "";
    heading = `### ${tier.name} - $${annualDollars}/month billed annually (${annualTotal}${monthlyLabel} monthly list price)${popularMarker}`;
  } else {
    heading = `### ${tier.name} - ${monthlyLabel}${popularMarker}`;
  }

  const lines: string[] = [heading];

  if (tier.name === "Enterprise") {
    lines.push("Purchase path: custom path.");
  }

  if (tier.description) {
    lines.push(`Limits: ${tier.description}`);
  }

  if (tier.bestFit) {
    lines.push(`Best for: ${tier.bestFit}`);
  }

  if (tier.features.length > 0) {
    lines.push("Features:");
    for (const feature of tier.features) {
      lines.push(`- ${feature}`);
    }
  }

  return lines.join("\n");
}

function formatFederalEditionSection(): string {
  return [
    "## Federal Edition",
    "",
    `Purchase path: contact founder.`,
    `Position: above Audit-Ready; not a self-serve checkout plan.`,
    `Best for: ${FEDERAL_EDITION_SKU.bestFit}.`,
    FEDERAL_EDITION_SKU.description,
    FEDERAL_EDITION_SKU.priceAnchor,
    "Features:",
    ...FEDERAL_EDITION_SKU.features.map((feature) => `- ${feature}`),
  ].join("\n");
}

function formatCompetitorTable(config: SiteConfig): string {
  const rows = config.competitors.map((competitor) => {
    return `| ${competitor.name} | ${competitor.pricing} | ${competitor.weakness} |`;
  });

  return [
    "## Competitor Pricing Comparison",
    "",
    "| Competitor | Price | Key Gap |",
    "|---|---|---|",
    ...rows,
  ].join("\n");
}

function formatGrantCategoryLinks(config: SiteConfig): string {
  const lines = ["## Grant Recipient Buying Paths", ""];

  for (const page of grantCategoryPages) {
    lines.push(`- ${page.title}: https://${config.domain}${page.href}/`);
  }

  return lines.join("\n");
}

/**
 * Builds a structured plain-text pricing document for AI shopping agents.
 * The output is derived entirely from SiteConfig with no hardcoded values.
 */
export function buildPricingTxt(config: SiteConfig): string {
  const sections: string[] = [];
  const pricingUrl = `https://${config.domain}/pricing/`;

  sections.push(`# ${config.name} Pricing`);
  sections.push("");
  sections.push(`Category: ${config.product.category}`);
  sections.push(`Target audience: ${config.product.targetAudience}`);
  sections.push(`Last updated: ${PRICING_TXT_LAST_UPDATED}`);
  sections.push(`Canonical pricing URL: ${pricingUrl}`);
  sections.push(`Contact: ${config.discoveryCallUrl}`);

  const trialText =
    config.pricingConfig?.trialBannerText ??
    `Pick a plan to start your ${marketingKnowledge.trial.copy.toLowerCase()}`;
  sections.push(`Trial: ${sentenceCaseKnownTrialCopy(trialText)}`);

  sections.push("Annual billing: billed annually and shown as a monthly price. Saves 20%.");

  sections.push("");
  sections.push(`## ${GRANTPIPE_GUARANTEE_STACK.name}`);
  sections.push("");
  sections.push(GRANTPIPE_GUARANTEE_STACK.headline);
  sections.push(GRANTPIPE_GUARANTEE_STACK.summary);
  for (const item of GRANTPIPE_GUARANTEE_STACK.items) {
    sections.push(`- ${item.title}: ${item.body}`);
  }

  sections.push("");
  sections.push("## Plans");
  sections.push("");
  sections.push(`Grant management category: ${GRANTPIPE_OS_CATEGORY}`);
  sections.push("SEO phrase: grant management software built for compliance.");
  sections.push(`Product areas: ${getGrantPipeOsModuleList()}.`);
  sections.push(`Plan access: ${GRANTPIPE_OS_PLAN_LANGUAGE}`);
  sections.push("");
  sections.push("Included on every plan:");
  for (const inclusion of UNIVERSAL_PLAN_INCLUSIONS) {
    sections.push(`- ${inclusion}`);
  }
  sections.push("");
  sections.push(
    "Each tier below lists what is added on top of the universal inclusions above; upgrade tiers also build on the previous tier.",
  );
  sections.push(
    "Active grant definition: For billing-cap purposes, a grant counts as active when its status is awarded, active, reporting, or renewal. Closed, archived, and deleted grants do not count toward plan caps.",
  );
  sections.push(
    `Overage policy: Plans include ${GRANT_CAP_SOFT_HEADROOM}-grant soft headroom before hard blocking; grants above the included cap are tracked as pending overage at ${GRANT_CAP_OVERAGE_COPY}.`,
  );

  const tiers = config.pricingTiers ?? [];
  for (const tier of tiers) {
    sections.push("");
    sections.push(formatTierSection(tier));
  }

  sections.push("");
  sections.push(formatFederalEditionSection());

  sections.push("");
  sections.push(formatCompetitorTable(config));

  sections.push("");
  sections.push("## Pricing URL");
  sections.push(pricingUrl);

  sections.push("");
  sections.push(formatGrantCategoryLinks(config));

  return sections.join("\n");
}
