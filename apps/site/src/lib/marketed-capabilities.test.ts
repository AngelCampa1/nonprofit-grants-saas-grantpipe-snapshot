import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { PLAN_ENTITLEMENTS } from "../../../../packages/shared/src/constants";
import {
  findCapabilityClaimByAlias,
  type CapabilityEntitlementKey,
} from "../../../../packages/shared/src/capabilities";
import {
  getFeatureHrefForCapabilityItem,
  getMarketedCapabilities,
  getProductAnchorLinks,
  getPricingTierBindings,
  getProductProofHrefForPricingTier,
} from "./marketed-capabilities";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const featuresDir = join(repoRoot, "packages/shared/src/knowledge/marketing/content/features");

function extractFrontmatterValue(content: string, key: string): string | undefined {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!fmMatch) return undefined;
  const line = (fmMatch[1] ?? "").split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  if (!line) return undefined;
  return line
    .split(":")
    .slice(1)
    .join(":")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function entitlementIsIncludedOnEveryPlan(entitlement: string): boolean {
  return Object.values(PLAN_ENTITLEMENTS).every(
    (plan) => plan[entitlement as CapabilityEntitlementKey] === true,
  );
}

describe("marketed capabilities", () => {
  it("publishes four product narratives with stable anchors", () => {
    const capabilities = getMarketedCapabilities();

    expect(capabilities.map((entry) => entry.slug)).toEqual([
      "compliance",
      "fundraising",
      "accounting",
      "migration",
    ]);
    expect(capabilities.every((entry) => entry.items.length >= 4)).toBe(true);
    expect(capabilities.map((entry) => entry.variant)).toEqual([
      "workflow",
      "record",
      "report",
      "timeline",
    ]);
    expect(capabilities.every((entry) => entry.heading.length > 0)).toBe(true);
    expect(capabilities.every((entry) => entry.supportingCopy.length > 0)).toBe(true);
    expect(capabilities.every((entry) => entry.supportText.length > 0)).toBe(true);
    expect(getProductAnchorLinks()).toEqual([
      { label: "Compliance calendar", href: "/product/#compliance" },
      { label: "Evidence and records", href: "/product/#fundraising" },
      { label: "Fund and accounting visibility", href: "/product/#accounting" },
      { label: "Guided rollout", href: "/product/#migration" },
    ]);
  });

  it("limits marketed capabilities to shipped functionality", () => {
    const flattened = getMarketedCapabilities()
      .flatMap((entry) => entry.items)
      .join(" ")
      .toLowerCase();

    expect(flattened).toContain("multi-source grant pipeline");
    expect(flattened).toContain("grants.gov");
    expect(flattened).toContain("donor pipeline");
    expect(flattened).toContain("spend-down");
    expect(flattened).toContain("award document intake");
    expect(flattened).toContain("ask-your-ledger grounded reporting");
    expect(flattened).toContain("board packet composer");
    expect(flattened).toContain("proposal and report drafting");
    expect(flattened).toContain("program allocation");
    expect(flattened).toContain("program budget vs actual");
    expect(flattened).toContain("import preview");
    expect(flattened).not.toContain("trial balance");
    expect(flattened).not.toContain("quickbooks online read-only ingestion");
    expect(flattened).not.toContain("multi-entity");
    expect(flattened).not.toContain("ai funder matching");
    expect(flattened).not.toContain("private foundation database");
    expect(flattened).not.toContain("external auditor portal");
    expect(flattened).not.toContain("custom report builder");
    expect(flattened).not.toContain("advanced reporting");
  });

  it("stores section support copy in the content model instead of template-only branches", () => {
    const capabilities = getMarketedCapabilities();

    expect(capabilities[0]).toMatchObject({
      slug: "compliance",
      variant: "workflow",
      heading: expect.stringContaining(
        "Keep deadlines, evidence, and activity history ready for review",
      ),
      supportText: expect.stringContaining("audit"),
    });
    expect(capabilities[1]).toMatchObject({
      slug: "fundraising",
      variant: "record",
      heading: expect.stringContaining(
        "Keep restricted funds, grants, and donor records connected",
      ),
      supportText: expect.stringContaining("fundraising"),
    });
    expect(capabilities[2]).toMatchObject({
      slug: "accounting",
      variant: "report",
      heading: expect.stringContaining("Show finance the fund trail behind each record"),
      supportText: expect.stringContaining("cash"),
    });
    expect(capabilities[3]).toMatchObject({
      slug: "migration",
      variant: "timeline",
      heading: expect.stringContaining("Move onto GrantPipe with a bounded rollout"),
      supportText: expect.stringContaining("bounded"),
    });
  });

  it("links Board Packet Composer directly from the product capability map", () => {
    const compliance = getMarketedCapabilities().find((entry) => entry.slug === "compliance");

    expect(compliance?.items).toContain("Board Packet Composer");
  });

  it("keeps product proof items aligned with the shared capability claim catalog", () => {
    const violations: string[] = [];

    for (const item of getMarketedCapabilities().flatMap((entry) => entry.items)) {
      const claim = findCapabilityClaimByAlias(item);
      if (!claim) {
        violations.push(`${item}: missing CAPABILITY_CLAIMS alias`);
        continue;
      }

      const expectedHref = `/features/${claim.featureSlug}`;
      const actualHref = getFeatureHrefForCapabilityItem(item);
      if (actualHref !== expectedHref) {
        violations.push(`${item}: links to ${actualHref ?? "nothing"} instead of ${expectedHref}`);
        continue;
      }

      const featureContent = readFileSync(join(featuresDir, `${claim.featureSlug}.md`), "utf8");
      const entitlement = extractFrontmatterValue(featureContent, "entitlement");
      if (claim.entitlementKey && entitlement !== claim.entitlementKey) {
        violations.push(
          `${item}: ${claim.featureSlug}.md uses entitlement ${entitlement ?? "none"} instead of ${claim.entitlementKey}`,
        );
      }
      if (
        claim.includedEveryPlan &&
        entitlement &&
        !entitlementIsIncludedOnEveryPlan(entitlement)
      ) {
        violations.push(
          `${item}: ${claim.featureSlug}.md is cataloged as included on every plan but declares ${entitlement}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires proof data that matches each section variant", () => {
    for (const capability of getMarketedCapabilities()) {
      if (capability.variant === "record") {
        expect(capability.proofMetrics).toHaveLength(3);
        expect(capability.proofColumns).toHaveLength(3);
      }

      if (capability.variant === "workflow") {
        expect(capability.proofSteps).toHaveLength(4);
        expect(capability.proofMetrics).toHaveLength(2);
      }

      if (capability.variant === "report") {
        expect(capability.proofRows).toHaveLength(4);
        expect(capability.proofMetrics).toHaveLength(2);
      }

      if (capability.variant === "timeline") {
        expect(capability.proofTimeline).toHaveLength(4);
        expect(capability.proofMetrics).toHaveLength(2);
      }
    }
  });

  it("attributes full guided onboarding to Audit-Ready and Enterprise, not Growth", () => {
    const migration = getMarketedCapabilities().find((entry) => entry.slug === "migration");
    const importMetric = migration?.proofMetrics?.find(
      (metric) => metric.label === "Import support",
    );
    expect(importMetric?.detail).toMatch(/Audit-Ready and Enterprise/);
    expect(importMetric?.detail).not.toMatch(/Growth and Audit-Ready/);
    // Guided onboarding/import/setup is hasGuidedOnboarding, which is false on
    // Growth. The copy must not credit Growth with guided import in any phrasing.
    expect(importMetric?.detail).not.toMatch(/Growth/i);
  });

  it("does not describe migration support as unscoped guided help", () => {
    const migration = getMarketedCapabilities().find((entry) => entry.slug === "migration");
    expect(migration).toBeDefined();

    const unscopedCopy = [
      migration?.summary,
      migration?.supportingCopy,
      migration?.supportText,
      ...(migration?.outcomes ?? []),
      ...(migration?.items ?? []),
      ...(migration?.proofTimeline?.map((item) => `${item.title} ${item.detail}`) ?? []),
    ].join(" ");

    expect(unscopedCopy).not.toMatch(/guided import support/i);
    expect(unscopedCopy).not.toMatch(/onboarding support/i);
    expect(unscopedCopy).not.toMatch(/Move with guided import/i);
    expect(unscopedCopy).not.toMatch(/guided import flow/i);
  });

  it("derives pricing proof links from the shared content model", () => {
    expect(getProductProofHrefForPricingTier("Starter")).toBe("/product/#fundraising");
    expect(getProductProofHrefForPricingTier("Growth")).toBe("/product/#compliance");
    expect(getProductProofHrefForPricingTier("Audit-Ready")).toBe("/product/#accounting");
    expect(() => getProductProofHrefForPricingTier("Enterprise" as never)).toThrow(
      "No product proof section configured for pricing tier: Enterprise",
    );

    expect(getPricingTierBindings()).toEqual([
      { plan: "starter", proofHref: "/product/#fundraising" },
      { plan: "growth", proofHref: "/product/#compliance" },
      { plan: "audit_ready", proofHref: "/product/#accounting" },
    ]);
  });
});
