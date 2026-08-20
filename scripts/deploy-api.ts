import { execSync, type ExecSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditProdSecrets, formatAuditReport, listProdApiSecrets } from "./check-prod-secrets";
import { loadRootDotEnv } from "./lib/local-env";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API_WRANGLER_TOML = `${REPO_ROOT}/apps/api/wrangler.toml`;
const NEON_PRODUCTION_HYPERDRIVE_ID = "048a27bd483549d2b9def7cf44ce25c3";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);

export type DeployApiStep = {
  command: string;
};

export const DEPLOY_API_STEPS: DeployApiStep[] = [
  { command: "pnpm --filter @grantpipe/db run migrate" },
  {
    command:
      "pnpm --filter @grantpipe/api exec wrangler d1 migrations apply grantpipe-db --env production --remote",
  },
  { command: "pnpm --filter @grantpipe/api exec wrangler deploy --env production" },
];

type ExecCommand = (command: string, options: ExecSyncOptions) => void;

type RunDeployCommandOptions = {
  exec?: ExecCommand;
  loadEnv?: (env: NodeJS.ProcessEnv) => void;
  env?: NodeJS.ProcessEnv;
};

type DeployApiOptions = {
  exec?: (step: DeployApiStep) => void;
};

type RunCliOptions = {
  argv?: string[];
  scriptPath?: string;
  scriptUrl?: string;
  execute?: () => void;
  postDeploy?: () => void;
  exit?: (code: number) => void;
  logError?: (message: unknown) => void;
};

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

export function runDeployCommand(step: DeployApiStep, options: RunDeployCommandOptions = {}): void {
  const loadEnv = options.loadEnv ?? ((targetEnv) => loadRootDotEnv({ env: targetEnv }));
  const exec = options.exec ?? ((command, execOptions) => execSync(command, execOptions));
  const env = options.env ?? process.env;

  loadEnv(env);
  assertSupabaseHyperdrivePreflight(env);
  exec(step.command, {
    stdio: "inherit",
    env,
    cwd: REPO_ROOT,
  });
}

export function assertSupabaseHyperdrivePreflight(
  env: NodeJS.ProcessEnv,
  readConfig: () => string = () => readFileSync(API_WRANGLER_TOML, "utf8"),
): void {
  const databaseUrl = env.DATABASE_URL ?? "";
  const cutoverTarget = env.CUTOVER_DEPLOY_TARGET?.toLowerCase();
  const isSupabaseCutover = cutoverTarget === "supabase" || isSupabaseDatabaseUrl(databaseUrl);
  const wranglerToml = readConfig();

  if (!isSupabaseCutover) {
    if (databaseUrl && !wranglerToml.includes(`id = "${NEON_PRODUCTION_HYPERDRIVE_ID}"`)) {
      throw new Error(
        "DATABASE_URL is not Supabase, but apps/api/wrangler.toml no longer contains the old Neon Hyperdrive ID.",
      );
    }
    return;
  }

  const expectedHyperdriveId = env.SUPABASE_HYPERDRIVE_ID;
  if (!expectedHyperdriveId) {
    throw new Error("SUPABASE_HYPERDRIVE_ID is required for Supabase production deploys.");
  }
  if (expectedHyperdriveId === NEON_PRODUCTION_HYPERDRIVE_ID) {
    throw new Error("SUPABASE_HYPERDRIVE_ID must not be the old Neon Hyperdrive ID.");
  }

  if (!wranglerToml.includes(`id = "${expectedHyperdriveId}"`)) {
    throw new Error("apps/api/wrangler.toml does not contain SUPABASE_HYPERDRIVE_ID.");
  }
  if (wranglerToml.includes(`id = "${NEON_PRODUCTION_HYPERDRIVE_ID}"`)) {
    throw new Error("apps/api/wrangler.toml still contains the old Neon Hyperdrive ID.");
  }
}

export function isSupabaseDatabaseUrl(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  } catch {
    return false;
  }
}

export function deployApi(options: DeployApiOptions = {}): void {
  const exec = options.exec ?? runDeployCommand;

  for (const step of DEPLOY_API_STEPS) {
    exec(step);
  }
}

type WarnOnMissingProdSecretsOptions = {
  listSecrets?: () => string[];
  warn?: (message: unknown) => void;
};

/**
 * Advisory-only post-deploy check: prints any missing production API secrets so
 * a silent loss (like the wind-down that dropped SENTRY_DSN) is loud on every
 * deploy. Never throws — a deploy must not fail because this check couldn't run.
 */
export function warnOnMissingProdSecrets(options: WarnOnMissingProdSecretsOptions = {}): void {
  const listSecrets = options.listSecrets ?? listProdApiSecrets;
  const warn = options.warn ?? console.warn;

  try {
    const audit = auditProdSecrets(listSecrets());
    if (audit.missing.length > 0) {
      warn(`\n⚠️  ${formatAuditReport(audit)}`);
    }
  } catch {
    // Advisory only: never block a deploy because the audit couldn't run.
  }
}

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const scriptPath = options.scriptPath ?? SCRIPT_PATH;
  const scriptUrl = options.scriptUrl ?? pathToFileURL(scriptPath).href;
  const execute = options.execute ?? deployApi;
  const postDeploy = options.postDeploy ?? warnOnMissingProdSecrets;
  const exit = options.exit ?? process.exit;
  const logError = options.logError ?? console.error;

  if (!isEntrypoint(scriptUrl, argv[1])) {
    return;
  }

  try {
    execute();
    postDeploy();
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

runCli();
