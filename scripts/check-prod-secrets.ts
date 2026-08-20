import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Audit the production `grantpipe-api` Worker's secrets against the set the app
 * actually needs.
 *
 * Why this exists: a multi-product infra wind-down recreated the API Worker and
 * silently dropped every value stored *outside* committed config — all of its
 * `wrangler secret put` secrets. Nothing in the deploy pipeline noticed, so
 * error tracking (SENTRY_DSN), Google SSO, Stripe billing, and the in-app AI
 * assistant went dark with no signal. This script makes that gap loud: run it on
 * demand (`pnpm run check:prod-secrets`) or let `deploy:api` print an advisory
 * warning on every deploy.
 *
 * It only reads secret *names* via `wrangler secret list` — values are never
 * exposed by Cloudflare and are never read here.
 */

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;

export type SecretTier = "critical" | "feature" | "optional";

export interface SecretSpec {
  /** The Worker secret name, e.g. `SENTRY_DSN`. */
  readonly name: string;
  /** How badly its absence hurts. */
  readonly tier: SecretTier;
  /** One-line description of what breaks without it. */
  readonly impact: string;
}

/**
 * The secrets the production API Worker needs, by tier.
 *
 * - `critical`  — the app is broken for everyone without it.
 * - `feature`   — a user-facing capability is broken/degraded without it.
 * - `optional`  — has a safe runtime fallback (today it falls back to
 *                 `BETTER_AUTH_SECRET`); setting it is hardening, not a fix,
 *                 and regenerating it breaks already-issued signed links.
 *
 * Deliberately NOT included: `DATABASE_URL` — production connects through the
 * bound `HYPERDRIVE` resource, so the secret is not needed at runtime.
 */
export const PROD_API_SECRETS: readonly SecretSpec[] = [
  { name: "BETTER_AUTH_SECRET", tier: "critical", impact: "session signing — all auth breaks" },
  { name: "SENTRY_DSN", tier: "feature", impact: "API error tracking (fails open/silent)" },
  { name: "GOOGLE_CLIENT_ID", tier: "feature", impact: "Google SSO sign-in" },
  { name: "GOOGLE_CLIENT_SECRET", tier: "feature", impact: "Google SSO sign-in" },
  { name: "STRIPE_SECRET_KEY", tier: "feature", impact: "billing / checkout" },
  { name: "STRIPE_WEBHOOK_SECRET", tier: "feature", impact: "Stripe webhooks (503 without it)" },
  { name: "STRIPE_PRICE_STARTER_MONTHLY", tier: "feature", impact: "checkout can't resolve plan" },
  { name: "STRIPE_PRICE_STARTER_ANNUAL", tier: "feature", impact: "checkout can't resolve plan" },
  { name: "STRIPE_PRICE_GROWTH_MONTHLY", tier: "feature", impact: "checkout can't resolve plan" },
  { name: "STRIPE_PRICE_GROWTH_ANNUAL", tier: "feature", impact: "checkout can't resolve plan" },
  {
    name: "STRIPE_PRICE_AUDIT_READY_MONTHLY",
    tier: "feature",
    impact: "checkout can't resolve plan",
  },
  {
    name: "STRIPE_PRICE_AUDIT_READY_ANNUAL",
    tier: "feature",
    impact: "checkout can't resolve plan",
  },
  { name: "RESEND_API_KEY", tier: "feature", impact: "transactional email" },
  { name: "OPENROUTER_API_KEY", tier: "feature", impact: "AI award-document intake" },
  { name: "TURNSTILE_SECRET_KEY", tier: "feature", impact: "bot protection on public forms" },
  {
    name: "AI_CS_CLIENT_ASSERTION_SECRET",
    tier: "feature",
    impact: "in-app AI assistant handshake",
  },
  {
    name: "AI_CS_CONTEXT_SECRET",
    tier: "feature",
    impact: "in-app AI assistant context (401 without it)",
  },
  {
    name: "SEQUENCER_CLIENT_SECRET",
    tier: "feature",
    impact: "lead nurture / sequencer (silently off)",
  },
  {
    name: "DOWNLOAD_LINK_SECRET",
    tier: "optional",
    impact: "lead-magnet download links (falls back to BETTER_AUTH_SECRET)",
  },
  {
    name: "LEAD_UNSUBSCRIBE_SECRET",
    tier: "optional",
    impact: "unsubscribe links (falls back to BETTER_AUTH_SECRET)",
  },
];

const TIER_ORDER: readonly SecretTier[] = ["critical", "feature", "optional"];

export interface SecretAudit {
  readonly presentSpecNames: readonly string[];
  readonly missing: readonly SecretSpec[];
  readonly missingByTier: Record<SecretTier, SecretSpec[]>;
  readonly hasCriticalGap: boolean;
  readonly hasFeatureGap: boolean;
}

/**
 * Parse the output of `wrangler secret list` into secret names. Wrangler emits a
 * JSON array; a version/update banner is sometimes prepended, so we fall back to
 * slicing from the first `[` to the last `]`. The result is validated to be an
 * array of objects so a non-JSON error page can't masquerade as "no secrets".
 */
export function parseWranglerSecretList(stdout: string): string[] {
  const trimmed = stdout.trim();
  const jsonText = trimmed.startsWith("[") ? trimmed : sliceJsonArray(stdout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Could not parse wrangler secret list output: ${stdout.slice(0, 120)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array from wrangler, got: ${stdout.slice(0, 120)}`);
  }

  return parsed.map((entry) => String((entry as { name?: unknown }).name));
}

function sliceJsonArray(stdout: string): string {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find a JSON array in wrangler output: ${stdout.slice(0, 120)}`);
  }
  return stdout.slice(start, end + 1);
}

export function auditProdSecrets(
  presentNames: readonly string[],
  specs: readonly SecretSpec[] = PROD_API_SECRETS,
): SecretAudit {
  const present = new Set(presentNames);
  const missing = specs.filter((spec) => !present.has(spec.name));

  const missingByTier: Record<SecretTier, SecretSpec[]> = {
    critical: [],
    feature: [],
    optional: [],
  };
  for (const spec of missing) {
    missingByTier[spec.tier].push(spec);
  }

  return {
    presentSpecNames: specs.filter((spec) => present.has(spec.name)).map((spec) => spec.name),
    missing,
    missingByTier,
    hasCriticalGap: missingByTier.critical.length > 0,
    hasFeatureGap: missingByTier.feature.length > 0,
  };
}

export function formatAuditReport(audit: SecretAudit): string {
  const lines: string[] = ["Production grantpipe-api secret audit:"];

  if (audit.missing.length === 0) {
    lines.push("  ✓ All known secrets are present.");
    return lines.join("\n");
  }

  for (const tier of TIER_ORDER) {
    const entries = audit.missingByTier[tier];
    if (entries.length === 0) {
      continue;
    }
    lines.push(`  ${tier.toUpperCase()} missing:`);
    for (const spec of entries) {
      lines.push(`    - ${spec.name} — ${spec.impact}`);
    }
  }

  lines.push("");
  lines.push("  Restore each with:");
  for (const spec of audit.missing) {
    lines.push(`    wrangler secret put ${spec.name} --env production`);
  }
  return lines.join("\n");
}

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }
  return importMetaUrl === pathToFileURL(argvEntry).href;
}

/** Reads secret names (never values) from the live production Worker. */
export function listProdApiSecrets(): string[] {
  const repoRoot = dirname(dirname(SCRIPT_PATH));
  // Run through the shell (execSync) using the same pnpm/wrangler invocation the
  // deploy scripts use — avoids the Windows `spawn npx.cmd EINVAL` pitfall.
  // stderr is inherited so a wrangler auth/network failure is visible to the
  // operator instead of surfacing as an opaque "could not parse" error.
  const stdout = execSync(
    "pnpm --filter @grantpipe/api exec wrangler secret list --env production",
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return parseWranglerSecretList(stdout);
}

type RunCliOptions = {
  argv?: string[];
  listSecrets?: () => string[];
  exit?: (code: number) => void;
  log?: (message: unknown) => void;
  logError?: (message: unknown) => void;
};

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const exit = options.exit ?? process.exit;
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;
  const listSecrets = options.listSecrets ?? listProdApiSecrets;

  if (!isEntrypoint(SCRIPT_URL, argv[1])) {
    return;
  }

  const strict = argv.includes("--strict");

  let audit: SecretAudit;
  try {
    audit = auditProdSecrets(listSecrets());
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
    return;
  }

  const report = formatAuditReport(audit);
  const hasBlockingGap = audit.hasCriticalGap || audit.hasFeatureGap;

  if (strict && hasBlockingGap) {
    logError(report);
    exit(1);
    return;
  }

  log(report);
}

runCli();
