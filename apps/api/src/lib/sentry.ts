import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import type { AppEnv } from "../types";

type ApiCaptureContext = {
  status: number;
  sanitizedMessage?: string;
};

export function getSafeRoutePath(c: Context<AppEnv>): string {
  try {
    return c.req.routePath || redactPathValues(c.req.path);
  } catch {
    return "[unknown]";
  }
}

function redactPathValues(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^[A-Za-z0-9_-]{16,}$/.test(segment)) {
        return ":redacted";
      }
      return segment;
    })
    .join("/");
}

function getContextValue<T>(c: Context<AppEnv>, key: keyof AppEnv["Variables"]): T | undefined {
  try {
    return c.get(key) as T | undefined;
  } catch {
    return undefined;
  }
}

const SENSITIVE_TAG_KEY_PATTERN =
  /(?:name|label|ein|tax|amount|balance|financial|report_text|raw_text|document_text|content|token|email|secret|authorization|auth|payload|stripe_payload|customer|provider|sql|query|document)/i;

function sanitizeSentryTagValue(key: string, value: string): string {
  if (SENSITIVE_TAG_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }
  if (
    /\b\d{2}-\d{7}\b/.test(value) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /\b(?:whsec|sk|rk|pk|cus|sub|evt|cs|tok)_[A-Za-z0-9_=-]{8,}\b/.test(value) ||
    /^[A-Za-z0-9._~+/=-]{32,}$/.test(value)
  ) {
    return "[redacted]";
  }
  return value;
}

function sanitizeSentryTags(tags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [key, sanitizeSentryTagValue(key, value)]),
  );
}

function sanitizeCapturedError(error: unknown, message: string): Error {
  const sanitized = new Error(message);
  if (error instanceof Error) {
    sanitized.name = error.name;
  }
  return sanitized;
}

export function captureApiException(
  error: unknown,
  c: Context<AppEnv>,
  { status, sanitizedMessage }: ApiCaptureContext,
): void {
  const user = getContextValue<AppEnv["Variables"]["user"]>(c, "user");
  const orgId = getContextValue<string | null>(c, "orgId");
  const entityId = getContextValue<string | null>(c, "entityId");
  const entityScope = getContextValue<AppEnv["Variables"]["entityScope"]>(c, "entityScope");

  try {
    Sentry.captureException(sanitizeCapturedError(error, sanitizedMessage ?? "API exception"), {
      tags: {
        method: c.req.method,
        path: getSafeRoutePath(c),
        status: String(status),
        ...(orgId ? { org_id: orgId } : {}),
        ...(entityId ? { entity_id: entityId } : {}),
        ...(entityScope ? { entity_scope: entityScope } : {}),
      },
      user: user?.id ? { id: user.id } : undefined,
    });
  } catch {
    // Telemetry failures must not replace the API error response.
  }
}

export function captureQueueException(
  error: unknown,
  queue: string,
  tags: Record<string, string> = {},
): void {
  // Telemetry must never break the queue consumer's primary flow (a throw here
  // would escape the per-message try/catch and abort the rest of the batch).
  try {
    const safeError = sanitizeCapturedError(error, "Queue exception");
    Sentry.captureException(safeError, {
      tags: {
        queue,
        surface: "queue",
        ...sanitizeSentryTags(tags),
      },
    });
  } catch {
    // Swallow Sentry transport/serialization failures.
  }
}

export function captureAuthServerError(context: {
  path: string;
  method: string;
  status: number;
  code: string | null;
  requestId: string | null;
}): void {
  const error = new Error(
    context.code ? `Better Auth 5xx response: ${context.code}` : "Better Auth 5xx response",
  );
  // Telemetry must never break the auth response path (this runs between
  // computing the response and returning it).
  try {
    Sentry.captureException(error, {
      tags: {
        surface: "auth",
        // Better Auth token-bearing routes (reset-password/:token, verify-email/:token)
        // carry the secret in the path itself; redact high-entropy segments before tagging.
        path: redactPathValues(context.path),
        method: context.method,
        status: String(context.status),
        ...(context.code ? { code: context.code } : {}),
      },
      extra: { requestId: context.requestId },
    });
  } catch {
    // Swallow Sentry transport/serialization failures.
  }
}

export function captureScheduledException(error: unknown, job: string, cron: string): void {
  try {
    Sentry.captureException(sanitizeCapturedError(error, "Scheduled exception"), {
      tags: {
        job,
        cron,
        surface: "scheduled",
      },
    });
  } catch {
    // Swallow Sentry transport/serialization failures.
  }
}

/**
 * Captures an error from a best-effort / background path that would otherwise be
 * swallowed (audit-log writes, fire-and-forget email/sequencer calls, per-item
 * loop failures, analytics capture failures). These paths intentionally do not
 * propagate their error to the caller, so without an explicit capture the failure
 * never reaches Sentry. The `surface` tag groups them for dashboard filtering.
 *
 * Must never throw — telemetry failures cannot be allowed to break the very flow
 * whose error this is trying to report.
 */
export function captureBackgroundException(
  error: unknown,
  surface: string,
  tags: Record<string, string> = {},
): void {
  try {
    const safeError = sanitizeCapturedError(error, "Background exception");
    Sentry.captureException(safeError, {
      tags: {
        surface,
        ...sanitizeSentryTags(tags),
      },
    });
  } catch {
    // Swallow Sentry transport/serialization failures.
  }
}

export async function runScheduledJob(
  job: string,
  cron: string,
  task: () => Promise<void>,
): Promise<unknown | null> {
  Sentry.addBreadcrumb({
    category: "scheduled",
    message: job,
    data: { cron },
  });

  const startedAt = Date.now();

  try {
    await task();
    console.info("[scheduled] job complete", {
      job,
      cron,
      duration_ms: Date.now() - startedAt,
    });
    return null;
  } catch (error) {
    console.error("[scheduled] job failed", {
      job,
      cron,
      duration_ms: Date.now() - startedAt,
    });
    captureScheduledException(error, job, cron);
    return error;
  }
}

export function createSentryOptions(env: AppEnv["Bindings"]) {
  if (!env.SENTRY_DSN) return undefined;

  return {
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    release: env.CF_VERSION_METADATA?.id ?? env.SENTRY_RELEASE ?? "unknown",
    sendDefaultPii: false,
    enableLogs: true,
  };
}
