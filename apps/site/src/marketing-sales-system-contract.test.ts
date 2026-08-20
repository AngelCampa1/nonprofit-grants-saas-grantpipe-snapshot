import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "..", "..");
const operatingSystemPath = join(repoRoot, "docs", "offers", "marketing-sales-operating-system.md");
const unsupportedAggregateClaimPattern = /\bmost\s+(teams|orgs|organizations|nonprofits|eds)\b/i;
const claimGuardRoots = [
  join(repoRoot, "apps", "site", "src", "pages"),
  join(repoRoot, "apps", "site", "src", "components"),
  join(repoRoot, "apps", "site", "src", "config"),
  join(repoRoot, "content", "social", "linkedin"),
];

function listTextFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return listTextFiles(path);
      return /\.(astro|md|mdx|ts|tsx|txt)$/.test(entry) ? [path] : [];
    })
    .sort();
}

describe("marketing and sales operating system", () => {
  it("documents the funnel spine, source truth, and drift-prevention gates", () => {
    expect(existsSync(operatingSystemPath)).toBe(true);

    const doc = readFileSync(operatingSystemPath, "utf8");
    expect(doc).toContain("## Funnel Spine");
    expect(doc).toContain("## System Source Map");
    expect(doc).toContain("## Drift-Prevention Gates");
    expect(doc).toContain("Acquisition -> activation -> first value -> paid conversion");
    expect(doc).toContain("GrantPipe includes native accounting records");
    expect(doc).toContain("does not sync with QuickBooks right now");
    expect(doc).toContain("No self-serve claim may promise a completed setup without user review");
    expect(doc).toContain(
      "No onboarding path may complete into a blank app without a chosen setup action",
    );
    expect(doc).toContain("Do not mark onboarding complete on an import or scratch click alone");
    expect(doc).toContain("packages/shared/src/pricing.ts");
    expect(doc).toContain("scripts/linkedin-post-review-gate.mjs");
  });

  it("prevents unsupported aggregate claims across public site and scheduled LinkedIn copy", () => {
    const offenders = claimGuardRoots
      .flatMap(listTextFiles)
      .filter((file) => unsupportedAggregateClaimPattern.test(readFileSync(file, "utf8")));

    expect(offenders.map((file) => file.replace(`${repoRoot}\\`, ""))).toEqual([]);
  });
});
