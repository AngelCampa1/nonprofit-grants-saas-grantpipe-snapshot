import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CAPABILITY_CLAIMS,
  findCapabilityClaimByAlias,
  getCapabilityClaimByFeatureSlug,
} from "./capabilities";
import { PLAN_ENTITLEMENTS } from "./constants";

describe("GrantPipe capability claim registry", () => {
  const repoRoot = join(import.meta.dirname, "../../..");

  it("keeps capability claim keys and aliases unique", () => {
    const featureSlugs = new Set<string>();
    const keys = new Set<string>();
    const labels = new Set<string>();
    const aliases = new Set<string>();
    const failures: string[] = [];

    for (const claim of CAPABILITY_CLAIMS) {
      if (keys.has(claim.key)) {
        failures.push(`Duplicate capability key: ${claim.key}`);
      }
      keys.add(claim.key);

      if (featureSlugs.has(claim.featureSlug)) {
        failures.push(`Duplicate capability feature slug: ${claim.featureSlug}`);
      }
      featureSlugs.add(claim.featureSlug);

      const normalizedLabel = claim.label.trim().toLowerCase();
      if (labels.has(normalizedLabel)) {
        failures.push(`Duplicate capability label: ${claim.label}`);
      }
      labels.add(normalizedLabel);

      for (const alias of claim.aliases) {
        const normalizedAlias = alias.trim().toLowerCase();
        if (aliases.has(normalizedAlias)) {
          failures.push(`Duplicate capability alias: ${alias}`);
        }
        aliases.add(normalizedAlias);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("requires each claim to name commercial status, plan alignment, proof sources, and public surfaces", () => {
    const failures: string[] = [];

    for (const claim of CAPABILITY_CLAIMS) {
      if (!claim.status) {
        failures.push(`${claim.key} is missing status`);
      }
      if (!claim.entitlementKey && claim.includedEveryPlan !== true) {
        failures.push(`${claim.key} is missing plan alignment`);
      }
      if (
        claim.entitlementKey &&
        typeof PLAN_ENTITLEMENTS.starter[claim.entitlementKey] !== "boolean"
      ) {
        failures.push(`${claim.key} uses a non-boolean entitlement key`);
      }
      if (claim.proofRefs.marketingSourcePaths.length === 0) {
        failures.push(`${claim.key} is missing marketing source proof`);
      }
      if (claim.proofRefs.contractTestPaths.length === 0) {
        failures.push(`${claim.key} is missing contract test proof`);
      }
      if (claim.status === "shipped") {
        if (claim.proofRefs.implementationSourcePaths.length === 0) {
          failures.push(`${claim.key} is missing implementation source proof`);
        }
        if (claim.proofRefs.implementationTestPaths.length === 0) {
          failures.push(`${claim.key} is missing implementation test proof`);
        }
        if (
          !claim.proofRefs.implementationSourcePaths.some(
            (sourcePath) => !sourcePath.startsWith("apps/site/"),
          )
        ) {
          failures.push(`${claim.key} has no implementation proof outside apps/site`);
        }
      }
      if (
        claim.status === "planned" &&
        claim.allowedPublicSurfaces.some((surface) => surface !== "features")
      ) {
        failures.push(`${claim.key} is planned but allowed on public proof surfaces`);
      }
      if (claim.allowedPublicSurfaces.length === 0) {
        failures.push(`${claim.key} is missing allowed public surfaces`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("finds capability claims by alias and feature slug", () => {
    expect(findCapabilityClaimByAlias("Grant Budget Sentinel")?.featureSlug).toBe(
      "grant-budget-sentinel",
    );
    expect(findCapabilityClaimByAlias("grant budget sentinel")?.key).toBe("grant-budget-sentinel");
    expect(getCapabilityClaimByFeatureSlug("audit-trail-activity-log")?.aliases).toContain(
      "Activity log",
    );
  });

  it("points every proof reference at an existing repo file", () => {
    const failures: string[] = [];

    for (const claim of CAPABILITY_CLAIMS) {
      for (const [bucket, paths] of Object.entries(claim.proofRefs)) {
        for (const proofPath of paths) {
          if (!existsSync(join(repoRoot, proofPath))) {
            failures.push(`${claim.key} ${bucket} proof does not exist: ${proofPath}`);
          }
        }
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });
});
