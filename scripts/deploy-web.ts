import { execSync, type ExecSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { loadRootDotEnv } from "./lib/local-env";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;
const WEB_WRANGLER_CONFIG_PATH = `${REPO_ROOT}/apps/web/wrangler.jsonc`;

export type DeployWebStep = {
  command: string;
};

export const DEPLOY_WEB_STEPS: DeployWebStep[] = [
  { command: "pnpm run check:sentry-release:web" },
  { command: "pnpm --filter @grantpipe/web run build" },
  { command: "pnpm --filter @grantpipe/web run verify:headers" },
  { command: "pnpm --filter @grantpipe/web run deploy" },
];

type DeployWebOptions = {
  exec?: (step: DeployWebStep) => void;
};

type ExecCommand = (command: string, options: ExecSyncOptions) => void;

type RunDeployCommandOptions = {
  exec?: ExecCommand;
  loadEnv?: (env: NodeJS.ProcessEnv) => void;
  readWebWranglerConfig?: () => string;
  env?: NodeJS.ProcessEnv;
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

export function applyWebWranglerViteEnv(env: NodeJS.ProcessEnv, configText: string): void {
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", configText);
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }

  const vars = (parsed.config as { vars?: Record<string, unknown> }).vars ?? {};
  for (const key of ["VITE_POSTHOG_KEY", "VITE_POSTHOG_HOST"]) {
    const value = vars[key];
    if (typeof value === "string" && value.trim()) {
      if (!env[key]?.trim()) {
        env[key] = value;
      }
    }
  }
}

export function runDeployCommand(step: DeployWebStep, options: RunDeployCommandOptions = {}): void {
  const loadEnv = options.loadEnv ?? ((targetEnv) => loadRootDotEnv({ env: targetEnv }));
  const exec = options.exec ?? ((command, execOptions) => execSync(command, execOptions));
  const readWebWranglerConfig =
    options.readWebWranglerConfig ?? (() => readFileSync(WEB_WRANGLER_CONFIG_PATH, "utf8"));
  const env = options.env ?? process.env;

  loadEnv(env);
  applyWebWranglerViteEnv(env, readWebWranglerConfig());
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV ??= "false";

  exec(step.command, {
    stdio: "inherit",
    env,
    cwd: REPO_ROOT,
  });
}

export function deployWeb(options: DeployWebOptions = {}): void {
  const exec = options.exec ?? runDeployCommand;

  for (const step of DEPLOY_WEB_STEPS) {
    exec(step);
  }
}

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const scriptUrl = options.scriptUrl ?? SCRIPT_URL;
  const execute = options.execute ?? deployWeb;
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
