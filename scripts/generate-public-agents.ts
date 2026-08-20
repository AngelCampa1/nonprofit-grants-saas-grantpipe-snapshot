import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAPABILITY_CLAIMS, type CapabilityClaim } from "../packages/shared/src/capabilities";
import {
  PLAN_ENTITLEMENT_LABELS,
  PLAN_ENTITLEMENTS,
  PLAN_LABELS,
  PLAN_TIERS,
} from "../packages/shared/src/constants";
import { marketingKnowledge } from "../packages/shared/src/public-kb/index";
import {
  DEFAULT_BILLING_CYCLE,
  getGrantPipePricingCopy,
  getPlanDisplayPrice,
  getPlanListDisplayPrice,
} from "../packages/shared/src/pricing";

function planLine(): string {
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

  return `Starter starts at ${defaultPrices.starter}, Growth starts at ${defaultPrices.growth}, and Audit-Ready starts at ${defaultPrices.auditReady}. Annual totals: Starter ${annualTotals.starter}, Growth ${annualTotals.growth}, Audit-Ready ${annualTotals.auditReady}. Monthly list prices: Starter ${monthlyPrices.starter}, Growth ${monthlyPrices.growth}, Audit-Ready ${monthlyPrices.auditReady}. Enterprise teams can contact founder Angel Campa at angel.campa@grantpipe.com or LinkedIn at https://www.linkedin.com/in/angelcampa1/.`;
}

function publicPageUrl(path: string): string {
  return `${marketingKnowledge.brand.siteUrl}${path.endsWith("/") ? path : `${path}/`}`;
}

function planAccessLine(claim: CapabilityClaim): string {
  if (claim.includedEveryPlan === true) {
    return "Every plan";
  }

  if (!claim.entitlementKey) {
    return "See pricing page";
  }

  const entitlementKey = claim.entitlementKey;
  const planLabels = PLAN_TIERS.filter((tier) => PLAN_ENTITLEMENTS[tier][entitlementKey] === true)
    .map((tier) => PLAN_LABELS[tier])
    .join(", ");

  return `${planLabels} (${PLAN_ENTITLEMENT_LABELS[entitlementKey]})`;
}

function renderCapabilityMap(): string {
  const claims = CAPABILITY_CLAIMS.filter(
    (claim) =>
      claim.status === "shipped" && claim.allowedPublicSurfaces.includes("machine-readable"),
  );

  return claims
    .map((claim) =>
      [
        `- ${claim.label}:`,
        `  Feature page: ${publicPageUrl(`/features/${claim.featureSlug}`)}`,
        `  Plan access: ${planAccessLine(claim)}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderPublicAgents(): string {
  const modules = marketingKnowledge.productPositioning.modules.join(", ");
  const pricingCopy = getGrantPipePricingCopy();
  const trialUrl = marketingKnowledge.brand.signupUrl;

  return `# ${marketingKnowledge.brand.name}

## What is ${marketingKnowledge.brand.name}?

${marketingKnowledge.productPositioning.boilerplate} It spans ${modules}. The pricing page shows what each plan includes.

## Who is it for?

${marketingKnowledge.icp.primaryAudience}. Organizations that manage multiple active grants alongside donor fundraising and need compliance evidence, restricted fund tracking, and accounting handoffs without a dedicated Salesforce admin.

## Pricing

Three self-serve tiers: ${planLine()} ${pricingCopy.annualDefault} ${marketingKnowledge.trial.copy} The pricing page is the source for what each plan includes.

Full machine-readable pricing: ${marketingKnowledge.brand.siteUrl}/pricing.txt

## Key differentiators

${marketingKnowledge.productPositioning.modules.map((module) => `- ${module}`).join("\n")}
- Self-serve setup, no setup fee, and no contract lock-in

## Capability Map

${renderCapabilityMap()}

## How to get started

Sign up for a free trial at ${trialUrl}. ${marketingKnowledge.trial.copy}

## Full pricing data

See: ${marketingKnowledge.brand.siteUrl}/pricing.txt

## Grant Management Positioning

- Category: ${marketingKnowledge.productPositioning.tagline}
- Product areas: ${modules}.
- Plan language: ${marketingKnowledge.productPositioning.boilerplate}
- Guide: ${publicPageUrl("/resources/guides/grant-management-software-for-nonprofits")}
- Compliance-first guide: ${publicPageUrl("/resources/guides/compliance-first-grant-management-system")}
- Glossary: ${publicPageUrl("/glossary/grant-compliance")}

## Homepage

${publicPageUrl("/")}

## Topic Hubs

- Nonprofit CRM: ${publicPageUrl("/resources/topics/nonprofit-crm")}
- Grant Management: ${publicPageUrl("/resources/topics/grant-management")}
- Grant Compliance: ${publicPageUrl("/resources/topics/grant-compliance")}
- Restricted Fund Accounting: ${publicPageUrl("/resources/topics/restricted-fund-accounting")}

## Grant Recipient Category Pages

- Grant Management Software: ${publicPageUrl("/grant-management-software")}
- Grant Compliance Software: ${publicPageUrl("/grant-compliance-software")}
- Grant Tracking Software: ${publicPageUrl("/grant-tracking-software")}
- Restricted Fund Tracking Software: ${publicPageUrl("/restricted-fund-tracking-software")}
- Grant Reporting Software: ${publicPageUrl("/grant-reporting-software")}
`;
}

export const PUBLIC_AGENTS_PATH = resolve("apps/site/public/AGENTS.md");

export function generatePublicAgentsMarkdown(): string {
  return renderPublicAgents();
}

if (process.argv[1]?.endsWith("generate-public-agents.ts")) {
  writeFileSync(PUBLIC_AGENTS_PATH, generatePublicAgentsMarkdown(), "utf8");
}
