import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectCoverageEligibleFiles,
  COVERAGE_THRESHOLD,
  evaluateTouchedFileCoverage,
  isCoverageEligibleFile,
  normalizePath,
  verifyTouchedFileCoverage,
} from "./coverage-gates";

const repoRoot = path.resolve("C:/repo/grantpipe");

describe("coverage-gates", () => {
  it("normalizes path separators for comparisons", () => {
    expect(normalizePath("C:\\repo\\grantpipe\\apps\\web\\src\\hooks\\use-activity.ts")).toBe(
      "c:/repo/grantpipe/apps/web/src/hooks/use-activity.ts",
    );
  });

  it("filters out excluded files from coverage enforcement", () => {
    expect(isCoverageEligibleFile("packages/db/src/schema/auth.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/ui/src/test-setup.ts")).toBe(false);
    expect(isCoverageEligibleFile("apps/web/src/routeTree.gen.ts")).toBe(false);
    expect(isCoverageEligibleFile("apps/web/src/vite-env.d.ts")).toBe(false);
    expect(isCoverageEligibleFile("apps/web/vitest.config.ts")).toBe(false);
    expect(isCoverageEligibleFile("apps/api/src/types.ts")).toBe(false);
    expect(isCoverageEligibleFile("apps/site/src/high-impression-pages.fixture.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/db/src/seed-demo.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/shared/src/index.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/shared/src/validators/index.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/shared/src/utils/index.ts")).toBe(false);
    expect(isCoverageEligibleFile("packages/shared/src/constants/index.ts")).toBe(true);
    expect(isCoverageEligibleFile("packages/shared/src/types/index.ts")).toBe(true);
    expect(isCoverageEligibleFile("apps/api/src/domains/donors/routes.ts")).toBe(true);
  });

  it("reports touched files that are missing from coverage summaries", () => {
    const result = evaluateTouchedFileCoverage({
      repoRoot,
      stagedFiles: ["apps/web/src/hooks/use-activity.ts"],
      coverageSummaries: {
        "@grantpipe/web": {
          total: { lines: { pct: 100 } },
        },
      },
      threshold: COVERAGE_THRESHOLD,
    });

    expect(result.missingFiles).toEqual(["apps/web/src/hooks/use-activity.ts"]);
    expect(result.failures).toEqual([]);
  });

  it("reports touched files that miss one or more thresholds", () => {
    const filePath = path.join(repoRoot, "apps/web/src/hooks/use-activity.ts");

    const result = evaluateTouchedFileCoverage({
      repoRoot,
      stagedFiles: ["apps/web/src/hooks/use-activity.ts"],
      coverageSummaries: {
        "@grantpipe/web": {
          total: { lines: { pct: 100 } },
          [filePath]: {
            lines: { pct: 94.5 },
            statements: { pct: 96 },
            functions: { pct: 95 },
            branches: { pct: 80 },
          },
        },
      },
      threshold: COVERAGE_THRESHOLD,
    });

    expect(result.missingFiles).toEqual([]);
    expect(result.failures).toEqual([
      {
        file: "apps/web/src/hooks/use-activity.ts",
        metrics: [
          { name: "lines", pct: 94.5 },
          { name: "branches", pct: 80 },
        ],
        packageName: "@grantpipe/web",
      },
    ]);
  });

  it("passes when touched files meet every threshold", () => {
    const filePath = path.join(repoRoot, "packages/ui/src/components/button.tsx");

    const result = evaluateTouchedFileCoverage({
      repoRoot,
      stagedFiles: ["packages/ui/src/components/button.tsx", "README.md"],
      coverageSummaries: {
        "@grantpipe/ui": {
          total: { lines: { pct: 100 } },
          [filePath]: {
            lines: { pct: 100 },
            statements: { pct: 100 },
            functions: { pct: 100 },
            branches: { pct: 100 },
          },
        },
      },
      threshold: COVERAGE_THRESHOLD,
    });

    expect(result.failures).toEqual([]);
    expect(result.missingFiles).toEqual([]);
  });

  it("skips deleted touched files when enforcing coverage from generated summaries", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "grantpipe-coverage-gate-"));
    const summaryDir = path.join(tempRoot, "apps/api/coverage");
    fs.mkdirSync(summaryDir, { recursive: true });
    fs.writeFileSync(
      path.join(summaryDir, "coverage-summary.json"),
      JSON.stringify({
        total: {
          lines: { pct: 100 },
          statements: { pct: 100 },
          functions: { pct: 100 },
          branches: { pct: 100 },
        },
      }),
    );

    expect(() =>
      verifyTouchedFileCoverage(tempRoot, ["apps/api/src/domains/org/referral.service.ts"]),
    ).not.toThrow();
  });

  it("passes a legacy-baseline file whose metrics sit at (not below) their per-file floor", () => {
    // apps/web/src/routes/_authenticated.tsx has a legacy floor of
    // lines=93.03, statements=93.03, functions=83.33 (branches defaults to 95).
    // A file exactly at those floors must NOT appear in failures.
    const filePath = path.join(repoRoot, "apps/web/src/routes/_authenticated.tsx");

    const result = evaluateTouchedFileCoverage({
      repoRoot,
      stagedFiles: ["apps/web/src/routes/_authenticated.tsx"],
      coverageSummaries: {
        "@grantpipe/web": {
          total: { lines: { pct: 100 } },
          [filePath]: {
            lines: { pct: 93.03 },
            statements: { pct: 93.03 },
            functions: { pct: 83.33 },
            branches: { pct: 95 },
          },
        },
      },
      threshold: COVERAGE_THRESHOLD,
    });

    expect(result.failures).toEqual([]);
    expect(result.missingFiles).toEqual([]);
  });

  it("fails a legacy-baseline file whose metrics drop below the per-file floor", () => {
    // Even though _authenticated.tsx has a legacy floor, a drop *below* that
    // floor must still be caught.
    const filePath = path.join(repoRoot, "apps/web/src/routes/_authenticated.tsx");

    const result = evaluateTouchedFileCoverage({
      repoRoot,
      stagedFiles: ["apps/web/src/routes/_authenticated.tsx"],
      coverageSummaries: {
        "@grantpipe/web": {
          total: { lines: { pct: 100 } },
          [filePath]: {
            lines: { pct: 90.0 },
            statements: { pct: 93.03 },
            functions: { pct: 80.0 },
            branches: { pct: 95 },
          },
        },
      },
      threshold: COVERAGE_THRESHOLD,
    });

    expect(result.failures).toEqual([
      {
        file: "apps/web/src/routes/_authenticated.tsx",
        metrics: [
          { name: "lines", pct: 90.0 },
          { name: "functions", pct: 80.0 },
        ],
        packageName: "@grantpipe/web",
      },
    ]);
    expect(result.missingFiles).toEqual([]);
  });

  it("collects repo-wide eligible files and excludes generated, tests, and schema files", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "grantpipe-coverage-audit-"));

    fs.mkdirSync(path.join(tempRoot, "apps/web/src/routes"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "packages/db/src/schema"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "packages/shared/src/validators"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "apps/web/src/routes/index.tsx"), "export const x = 1;\n");
    fs.writeFileSync(
      path.join(tempRoot, "apps/web/src/routes/index.test.tsx"),
      "export const x = 1;\n",
    );
    fs.writeFileSync(
      path.join(tempRoot, "apps/web/src/routes/routeTree.gen.ts"),
      "export const x = 1;\n",
    );
    fs.writeFileSync(
      path.join(tempRoot, "packages/db/src/schema/auth.ts"),
      "export const x = 1;\n",
    );
    fs.writeFileSync(
      path.join(tempRoot, "packages/shared/src/validators/grants.ts"),
      "export const x = 1;\n",
    );
    fs.writeFileSync(
      path.join(tempRoot, "packages/shared/src/validators/index.ts"),
      "export const x = 1;\n",
    );

    const files = collectCoverageEligibleFiles(tempRoot);

    expect(files).toEqual([
      "apps/web/src/routes/index.tsx",
      "packages/shared/src/validators/grants.ts",
    ]);
  });
});
