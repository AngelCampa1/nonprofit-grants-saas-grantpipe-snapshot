import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findCapabilityClaimByAlias } from "@grantpipe/shared";

import {
  getFeatureHrefForCapabilityItem,
  getMarketedCapabilities,
} from "./lib/marketed-capabilities";
import { marketingContentDirectory } from "./lib/marketing-content-root";

function readFeatureFrontmatter(featureSlug: string): string {
  const source = readFileSync(
    join(marketingContentDirectory, "features", `${featureSlug}.md`),
    "utf8",
  );
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);

  if (!match?.[1]) {
    throw new Error(`Expected frontmatter for feature: ${featureSlug}`);
  }

  return match[1];
}

function getScalarField(frontmatter: string, field: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*([^\\n#]+)`, "m"));
  return match?.[1]?.trim().replace(/^"|"$/g, "");
}

describe("capability claim registry contract", () => {
  it("registers every product proof item in the shared capability claim manifest", () => {
    const failures: string[] = [];

    for (const capability of getMarketedCapabilities()) {
      for (const item of capability.items) {
        const claim = findCapabilityClaimByAlias(item);
        const href = getFeatureHrefForCapabilityItem(item);

        if (!claim) {
          failures.push(`${capability.slug}: "${item}" has no shared capability claim`);
          continue;
        }

        if (!href) {
          failures.push(`${capability.slug}: "${item}" has no product feature href`);
          continue;
        }

        const expectedHref = `/features/${claim.featureSlug}`;
        if (href !== expectedHref) {
          failures.push(
            `${capability.slug}: "${item}" links to ${href}, but shared claim points to ${expectedHref}`,
          );
        }

        const frontmatter = readFeatureFrontmatter(claim.featureSlug);
        const featureStatus = getScalarField(frontmatter, "status");
        const noindex = getScalarField(frontmatter, "noindex") === "true";

        if (featureStatus && featureStatus !== claim.status) {
          failures.push(
            `${capability.slug}: "${item}" uses claim status ${claim.status}, but feature frontmatter says ${featureStatus}`,
          );
        }
        if (claim.status === "planned") {
          failures.push(`${capability.slug}: "${item}" maps product proof to a planned feature`);
        }
        if (noindex) {
          failures.push(`${capability.slug}: "${item}" maps product proof to a noindex feature`);
        }
        if (!claim.allowedPublicSurfaces.includes("product")) {
          failures.push(`${capability.slug}: "${item}" is not allowed on the product surface`);
        }
      }
    }

    expect(failures, `Capability claim failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
