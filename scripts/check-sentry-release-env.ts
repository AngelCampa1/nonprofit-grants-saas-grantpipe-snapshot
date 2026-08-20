import { fileURLToPath, pathToFileURL } from "node:url";
import { loadRootDotEnv } from "./lib/local-env";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;

export type SentryDeployApp = "web" | "site";

export const REQUIRED_SENTRY_RELEASE_ENV_VARS: Record<SentryDeployApp, readonly string[]> = {
  web: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT_WEB"],
  site: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT_SITE"],
};

type EnvLike = Record<string, string | undefined>;

type RunCliOptions = {
  argv?: string[];
  env?: EnvLike;
  exit?: (code: number) => void;
  loadLocalEnv?: (env: EnvLike) => void;
  logError?: (message: unknown) => void;
};

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

function parseSentryDeployApp(argv: string[]): SentryDeployApp {
  const appFlagIndex = argv.indexOf("--app");
  const value = appFlagIndex >= 0 ? argv[appFlagIndex + 1] : argv[2];

  if (value === "web" || value === "site") {
    return value;
  }

  throw new Error('Expected "--app web" or "--app site".');
}

export function ensureSentryReleaseEnv(app: SentryDeployApp, env: EnvLike = process.env): void {
  const missing = REQUIRED_SENTRY_RELEASE_ENV_VARS[app].filter((name) => !env[name]?.trim());

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing required Sentry release env vars for ${app} build: ${missing.join(", ")}.`,
  );
}

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const exit = options.exit ?? process.exit;
  const loadLocalEnv = options.loadLocalEnv ?? ((targetEnv) => loadRootDotEnv({ env: targetEnv }));
  const logError = options.logError ?? console.error;

  if (!isEntrypoint(SCRIPT_URL, argv[1])) {
    return;
  }

  try {
    loadLocalEnv(env);
    const app = parseSentryDeployApp(argv);
    ensureSentryReleaseEnv(app, env);
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

runCli();
