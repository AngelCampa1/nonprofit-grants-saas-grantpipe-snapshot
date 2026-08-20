import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import type { ErrorInfo } from "react";
import { ApiError } from "./http-response";

const DEFAULT_IGNORED_ERRORS: Array<string | RegExp> = [
  /Failed to fetch dynamically imported module/,
  "ChunkLoadError",
  /Loading chunk \d+ failed/,
  /^Load failed$/,
  /Invalid call to runtime\.sendMessage\(\)/,
];

const DEFAULT_DENY_URLS: Array<string | RegExp> = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-extension:\/\//,
  /extensions\//,
  /webkit-masked-url:\/\/hidden/,
  // Cloudflare Web Analytics beacon (served at /beacon.min.js/v<hash>). It calls
  // Array.prototype.at(), which throws in legacy browsers and bots (e.g. Chrome 79),
  // surfacing as unhandled global-onerror noise we cannot fix in third-party code.
  /\/beacon\.min\.js\//,
];

type CaptureContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

type CaptureOptions = {
  includeExpected?: boolean;
  sanitize?: boolean;
};

export const DEFAULT_USER_ERROR_MESSAGE =
  "Something went wrong. Try again, or contact support if it keeps happening.";

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const release = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;

  Sentry.init({
    dsn,
    environment:
      (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    release: release || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ignoreErrors: DEFAULT_IGNORED_ERRORS,
    denyUrls: DEFAULT_DENY_URLS,
  });
}

export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeSafeError(error: unknown): Error {
  if (error instanceof ApiError) {
    const normalized = new Error(`Handled API error: ${error.status}`);
    normalized.name = "ApiError";
    return normalized;
  }

  const status = getErrorStatus(error);
  if (status !== undefined) {
    const normalized = new Error(`Handled HTTP error: ${status}`);
    normalized.name = "HttpError";
    return normalized;
  }

  return new Error("Handled application error");
}

function sanitizeExtraValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey.includes("name") || normalizedKey.includes("label")) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExtraValue(item, key));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeExtraValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function sanitizeExtra(
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  return Object.fromEntries(
    Object.entries(extra).map(([key, value]) => [key, sanitizeExtraValue(value, key)]),
  );
}

export function shouldReportError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === undefined || status >= 500;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown; statusCode?: unknown }).status;
  if (typeof status === "number") return status;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export function getUserFacingErrorMessage(error: unknown): string {
  const status = getErrorStatus(error);

  if (status !== undefined && status < 500 && error instanceof Error && error.message) {
    return error.message;
  }

  if (status === undefined && error instanceof Error && error.message) {
    return error.message;
  }

  return DEFAULT_USER_ERROR_MESSAGE;
}

export function summarizeQueryKey(queryKey: readonly unknown[] | undefined): string[] | undefined {
  if (!queryKey) return undefined;
  return queryKey.map((part, index) => {
    if (typeof part === "string") return index === 0 ? part : "string";
    if (typeof part === "number" || typeof part === "boolean") return typeof part;
    if (part === null) return "null";
    if (Array.isArray(part)) return "array";
    return typeof part;
  });
}

export function captureAppException(
  error: unknown,
  context: CaptureContext = {},
  options: CaptureOptions = {},
): void {
  if (!options.includeExpected && !shouldReportError(error)) return;

  const normalized = options.sanitize ? normalizeSafeError(error) : normalizeError(error);
  const extra = options.sanitize ? sanitizeExtra(context.extra) : context.extra;
  try {
    Sentry.captureException(normalized, {
      tags: context.tags,
      extra,
    });
  } catch {
    // Best-effort error telemetry must never break the user flow.
  }

  try {
    posthog.captureException(normalized, { extra });
  } catch {
    // Best-effort secondary telemetry.
  }
}

export function createReactRootOptions() {
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}

export function captureReactBoundaryError(error: unknown, info: ErrorInfo, source: string): void {
  captureAppException(error, {
    tags: { source },
    extra: { componentStack: info.componentStack },
  });
}

export function captureQueryError(
  error: unknown,
  operation: "query" | "mutation",
  extra: Record<string, unknown> = {},
): void {
  captureAppException(error, {
    tags: {
      source: "tanstack-query",
      operation,
    },
    extra,
  });
}
