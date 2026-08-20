import { execSync } from "child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  COVERAGE_THRESHOLD,
  isCoverageEligibleFile,
  normalizePath,
  verifyTouchedFileCoverage,
} from "./lib/coverage-gates";

function formatFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function readGitFileList(command: string, repoRoot: string): string[] {
  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function collectCoverageAuditFiles(repoRoot: string): string[] {
  const changedFiles = [
    ...readGitFileList("git diff --name-only --diff-filter=ACMR upstream/master...HEAD", repoRoot),
    ...readGitFileList("git diff --name-only --diff-filter=ACMR", repoRoot),
    ...readGitFileList("git diff --cached --name-only --diff-filter=ACMR", repoRoot),
    ...readGitFileList("git ls-files --others --exclude-standard", repoRoot),
  ];

  return [...new Set(changedFiles.map(normalizePath))].filter(isCoverageEligibleFile).sort();
}

export function main() {
  const repoRoot = path.resolve(process.cwd());
  const eligibleFiles = collectCoverageAuditFiles(repoRoot);

  if (eligibleFiles.length === 0) {
    console.log("No changed coverage-eligible files found for coverage audit.");
    return;
  }

  try {
    verifyTouchedFileCoverage(repoRoot, eligibleFiles, COVERAGE_THRESHOLD);
    console.log(
      `Coverage audit passed for ${eligibleFiles.length} changed eligible files at ${COVERAGE_THRESHOLD}%+.`,
    );
  } catch (error) {
    console.error(formatFailure(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
