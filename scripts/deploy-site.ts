import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadRootDotEnv } from "./lib/local-env";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;

export type DeploySiteStep = {
  command: string;
  env?: Record<string, string>;
  maxAttempts?: number;
  beforeRetry?: () => void;
};

export const DEPLOY_SITE_STEPS: DeploySiteStep[] = [
  {
    command: "pnpm exec tsx scripts/check-sentry-release-env.ts --app site",
  },
  {
    command: "pnpm --filter @grantpipe/site run build",
    env: { REQUIRE_LEAD_MAGNET_PDF_BUILD: "1" },
    maxAttempts: 2,
    beforeRetry: () => {
      rmSync("apps/site/dist", { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  },
  { command: "pnpm run sync:lead-magnets:r2" },
  { command: "pnpm run verify:lead-magnets:r2" },
  { command: "pnpm --filter @grantpipe/site run deploy" },
];

type DeploySiteOptions = {
  exec?: (step: DeploySiteStep, attempt: number) => void;
};

type RunCliOptions = {
  argv?: string[];
  scriptUrl?: string;
  execute?: () => void;
  exit?: (code: number) => void;
  logError?: (message: unknown) => void;
};

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

export function runDeployCommand(step: DeploySiteStep, attempt = 1): void {
  loadRootDotEnv();
  const total = step.maxAttempts ?? 1;
  if (total > 1) {
    console.log(`[deploy-site] attempt ${attempt}/${total}: ${step.command}`);
  }
  execSync(step.command, {
    stdio: "inherit",
    env: { ...process.env, ...step.env },
  });
}

export function deploySite(options: DeploySiteOptions = {}): void {
  const exec = options.exec ?? runDeployCommand;

  for (const step of DEPLOY_SITE_STEPS) {
    const maxAttempts = step.maxAttempts ?? 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        exec(step, attempt);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          step.beforeRetry?.();
        }
      }
    }
    if (lastError !== undefined) {
      throw lastError;
    }
  }
}

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const scriptUrl = options.scriptUrl ?? SCRIPT_URL;
  const execute = options.execute ?? deploySite;
  const exit = options.exit ?? process.exit;
  const logError = options.logError ?? console.error;

  if (!isEntrypoint(scriptUrl, argv[1])) {
    return;
  }

  try {
    execute();
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

runCli();
