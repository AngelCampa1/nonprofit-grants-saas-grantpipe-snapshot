// Transient infrastructure failures we want to retry inside scheduled jobs.
// This helper is scoped to DB query closures. Do not wrap general HTTP
// `fetch()` callers with `withDbRetry`; `"fetch failed"` here means a database
// driver transport failure, and a broader caller would silently retry unrelated
// transport blips.
//
// Sourced from production Sentry issues:
// - "Control plane request failed" - managed Postgres control-plane blip
//   (GRANTPIPE-API-Y, GRANTPIPE-API-Z)
// - "Connection terminated unexpectedly" - pg socket drop mid-query
// - "fetch failed" - Workers or driver transport failure
// - "Timed out while creating a new server connection." - connection startup
//   exceeded pg's connect deadline (GRANTPIPE-API-7/H lineage)
const TRANSIENT_DB_ERROR_PATTERNS = [
  "control plane request failed",
  "connection terminated unexpectedly",
  "fetch failed",
  "timed out while creating a new server connection",
];

// pg SQLSTATE class 08 = connection exceptions. Always recoverable on retry.
// Node socket codes here are the transient TCP/DNS failures pg surfaces via
// `error.code` when the message itself doesn't carry one of the patterns above.
const TRANSIENT_DB_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

const MAX_CAUSE_DEPTH = 4;

// SQLSTATE classes that will never succeed on retry. They describe a bug in
// the query or data, not a transient infrastructure failure. A scheduled job
// that hits one of these should fail fast and surface in Sentry rather than
// burn its retry budget. Matched on the two-character SQLSTATE class prefix.
// - 22: data exception, for example invalid_text_representation
// - 23: integrity constraint violation
// - 42: syntax error or access rule violation
// - 0A: feature not supported
// - 3D / 3F: invalid catalog / schema name
const DETERMINISTIC_SQLSTATE_CLASS_PREFIXES = ["22", "23", "42", "0A", "3D", "3F"];

function hasDeterministicSqlState(error: unknown): boolean {
  let cursor: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor != null; depth += 1) {
    const code = (cursor as { code?: unknown } | null)?.code;
    if (
      typeof code === "string" &&
      DETERMINISTIC_SQLSTATE_CLASS_PREFIXES.some((prefix) => code.startsWith(prefix))
    ) {
      return true;
    }
    cursor = (cursor as { cause?: unknown } | null)?.cause;
  }
  return false;
}

export function isTransientDbError(error: unknown): boolean {
  let cursor: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor != null; depth += 1) {
    const message =
      cursor instanceof Error ? cursor.message : typeof cursor === "string" ? cursor : null;
    if (message) {
      const lower = message.toLowerCase();
      if (TRANSIENT_DB_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))) {
        return true;
      }
    }
    const code = (cursor as { code?: unknown } | null)?.code;
    if (typeof code === "string" && TRANSIENT_DB_ERROR_CODES.has(code)) {
      return true;
    }
    cursor = (cursor as { cause?: unknown } | null)?.cause;
  }
  return false;
}

// drizzle-orm's PgPreparedQuery.queryWithCache wraps every driver failure as
// `new DrizzleQueryError(query, params, cause)`, which always sets `.cause` to
// the original pg error. So the real runtime wrapper never has `cause == null`.
// Gating on that made this predicate dead in production (GRANTPIPE-API-17).
//
// For scheduled jobs the wrapped query is an idempotent read or a
// dedupe-guarded write, so the safe default is to retry any Drizzle
// "Failed query:" wrapper unless its cause is a deterministic SQL error.
export function isDrizzleFailedQueryWrapperError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message.startsWith("Failed query:")) {
    return false;
  }

  return !hasDeterministicSqlState(error);
}

export function isRetryableScheduledDbError(error: unknown): boolean {
  return isTransientDbError(error) || isDrizzleFailedQueryWrapperError(error);
}

export const DEFAULT_DB_RETRY_BACKOFF_MS = [250, 750] as const;

export interface WithDbRetryOptions {
  backoffMs?: readonly number[];
  delay?: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options?: WithDbRetryOptions,
): Promise<T> {
  const backoff = options?.backoffMs ?? DEFAULT_DB_RETRY_BACKOFF_MS;
  const sleep = options?.delay ?? defaultDelay;
  const isRetryable = options?.isRetryable ?? isTransientDbError;
  let lastError: unknown;

  for (let attempt = 0; attempt <= backoff.length; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }
      lastError = error;
      const backoffMs = backoff[attempt];
      if (backoffMs !== undefined) {
        await sleep(backoffMs);
      }
    }
  }

  throw lastError;
}
