import { execSync } from "child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAffectedPackages } from "./lib/affected-packages";
import { verifyTouchedFileCoverage } from "./lib/coverage-gates";

function getStagedFiles(): string[] {
  const output = execSync("git diff --cached --name-only --diff-filter=ACMRD", {
    encoding: "utf-8",
  });
  return output.trim().split("\n").filter(Boolean);
}

export function formatFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

export function main() {
  const stagedFiles = getStagedFiles();
  const affected = getAffectedPackages(stagedFiles);

  if (affected.length === 0) {
    console.log("No workspace packages affected by staged changes.");
    return;
  }

  console.log(`Affected packages: ${affected.join(", ")}`);

  try {
    if (
      affected.includes("@grantpipe/shared") ||
      affected.includes("@grantpipe/site") ||
      affected.includes("@grantpipe/web")
    ) {
      console.log("Running knowledge:check");
      execSync("pnpm knowledge:check", {
        stdio: "inherit",
      });
    }

    if (affected.includes("@grantpipe/shared") || affected.includes("@grantpipe/web")) {
      console.log("Running ai-cs:validate-knowledge");
      execSync("pnpm ai-cs:validate-knowledge", {
        stdio: "inherit",
      });
    }

    for (const pkg of affected) {
      console.log(`Running typecheck for ${pkg}`);
      execSync(`pnpm turbo typecheck --filter=${pkg}`, {
        stdio: "inherit",
      });

      console.log(`Running test:coverage for ${pkg}`);
      execSync(`pnpm turbo test:coverage --filter=${pkg}`, {
        stdio: "inherit",
      });
    }

    verifyTouchedFileCoverage(path.resolve(process.cwd()), stagedFiles);
  } catch (error) {
    console.error(formatFailure(error));
    process.exit(1);
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  main();
}
