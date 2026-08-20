import { loadRootDotEnv } from "../../../scripts/lib/local-env";

type EnvLike = Record<string, string | undefined>;

export interface AssertTurnstileOptions {
  nodeEnv?: string;
  skipGuard?: string;
  siteKey?: string;
}

export interface AssertTurnstileBuildOptions {
  env?: EnvLike;
  loadLocalEnv?: () => void;
}

export function assertTurnstileSiteKey(opts?: AssertTurnstileOptions): void {
  const nodeEnv = opts !== undefined ? opts.nodeEnv : process.env.NODE_ENV;
  const skipGuard = opts !== undefined ? opts.skipGuard : process.env.SKIP_TURNSTILE_GUARD;
  const siteKey = opts !== undefined ? opts.siteKey : process.env.PUBLIC_TURNSTILE_SITE_KEY;

  if (nodeEnv === "test" || skipGuard !== undefined) {
    return;
  }

  const trimmed = siteKey?.trim();
  if (!trimmed) {
    throw new Error(
      "Missing required environment variable: PUBLIC_TURNSTILE_SITE_KEY\n" +
        "Set this variable before running a production site build.\n" +
        "To skip this check in local/dev builds, set SKIP_TURNSTILE_GUARD=1.",
    );
  }
}

export function assertTurnstileSiteKeyForBuild(opts?: AssertTurnstileBuildOptions): void {
  const env = opts?.env ?? process.env;
  const loadLocalEnv = opts?.loadLocalEnv ?? (() => loadRootDotEnv({ env }));

  loadLocalEnv();
  assertTurnstileSiteKey({
    nodeEnv: env.NODE_ENV,
    skipGuard: env.SKIP_TURNSTILE_GUARD,
    siteKey: env.PUBLIC_TURNSTILE_SITE_KEY,
  });
}

// When run directly as a script, assert and exit
if (process.argv[1] && process.argv[1].includes("assert-turnstile-site-key")) {
  assertTurnstileSiteKeyForBuild();
  process.stdout.write("PUBLIC_TURNSTILE_SITE_KEY is set.\n");
}
