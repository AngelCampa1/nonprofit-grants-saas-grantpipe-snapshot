import { readFileSync } from "node:fs";
import { CAPABILITY_CLAIMS, type CapabilityClaim } from "../../../packages/shared/src/capabilities";
import {
  PLAN_ENTITLEMENT_LABELS,
  PLAN_ENTITLEMENTS,
  PLAN_LABELS,
  PLAN_TIERS,
} from "../../../packages/shared/src/constants";
import {
  DEFAULT_BILLING_CYCLE,
  getPlanDisplayPrice,
  getPlanListDisplayPrice,
} from "../../../packages/shared/src/pricing";
import { describe, expect, it } from "vitest";
import { generatePublicAgentsMarkdown } from "../../../scripts/generate-public-agents";

function expectedPlanAccess(claim: CapabilityClaim): string {
  if (claim.includedEveryPlan === true) {
    return "Every plan";
  }

  if (!claim.entitlementKey) {
    throw new Error(`${claim.key} is missing an entitlement key`);
  }

  const entitlementKey = claim.entitlementKey;
  const tiers = PLAN_TIERS.filter((tier) => PLAN_ENTITLEMENTS[tier][entitlementKey] === true)
    .map((tier) => PLAN_LABELS[tier])
    .join(", ");

  return `${tiers} (${PLAN_ENTITLEMENT_LABELS[entitlementKey]})`;
}

describe("public AGENTS.md", () => {
  it("is generated from the public knowledge base", () => {
    const committed = readFileSync(new URL("../public/AGENTS.md", import.meta.url), "utf8");

    expect(committed).toBe(generatePublicAgentsMarkdown());
  });

  it("uses canonical trailing-slash URLs for public HTML pages", () => {
    const markdown = generatePublicAgentsMarkdown();
    const htmlUrls = [...markdown.matchAll(/https:\/\/grantpipe\.com\/[^\s)]+/g)]
      .map((match) => match[0])
      .filter((url) => !url.endsWith(".txt"));

    expect(htmlUrls.length).toBeGreaterThan(0);
    expect(htmlUrls.every((url) => url.endsWith("/"))).toBe(true);
  });

  it("exports shipped machine-readable capability claims with feature URLs and plan access", () => {
    const markdown = generatePublicAgentsMarkdown();
    const claims = CAPABILITY_CLAIMS.filter(
      (claim) =>
        claim.status === "shipped" && claim.allowedPublicSurfaces.includes("machine-readable"),
    );

    expect(markdown).toContain("## Capability Map");
    for (const claim of claims) {
      expect(markdown).toContain(`- ${claim.label}:`);
      expect(markdown).toContain(
        `Feature page: https://grantpipe.com/features/${claim.featureSlug}/`,
      );
      expect(markdown).toContain(`Plan access: ${expectedPlanAccess(claim)}`);
    }
  });

  it("states default annual pricing separately from monthly list pricing", () => {
    const markdown = generatePublicAgentsMarkdown();
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

    expect(DEFAULT_BILLING_CYCLE).toBe("annual");
    expect(markdown).toContain("Annual saves 20%.");
    expect(markdown).toContain(`Starter starts at ${defaultPrices.starter}`);
    expect(markdown).toContain(`Growth starts at ${defaultPrices.growth}`);
    expect(markdown).toContain(`Audit-Ready starts at ${defaultPrices.auditReady}`);
    expect(markdown).toContain(`Starter ${annualTotals.starter}`);
    expect(markdown).toContain(`Growth ${annualTotals.growth}`);
    expect(markdown).toContain(`Audit-Ready ${annualTotals.auditReady}`);
    expect(markdown).toContain(
      `Monthly list prices: Starter ${monthlyPrices.starter}, Growth ${monthlyPrices.growth}, Audit-Ready ${monthlyPrices.auditReady}.`,
    );
    expect(markdown).not.toContain(`Starter starts at ${monthlyPrices.starter}`);
    expect(markdown).not.toContain(`Growth starts at ${monthlyPrices.growth}`);
    expect(markdown).not.toContain(`Audit-Ready starts at ${monthlyPrices.auditReady}`);
  });
});
