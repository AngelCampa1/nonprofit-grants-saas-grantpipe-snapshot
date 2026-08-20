import * as Sentry from "@sentry/browser";

export const IGNORED_ERRORS: Array<string | RegExp> = [
  /Failed to fetch dynamically imported module/,
  "ChunkLoadError",
  /Loading chunk \d+ failed/,
  /^Load failed(?: \([^)]+\))?$/,
  /^Failed to fetch$/,
  /(?:jsxDEV|jsx|jsxs) is not a function/,
  /evaluating '.*\.pluginConfig'/,
  /Invalid call to runtime\.sendMessage\(\)/,
  /^options is not defined$/,
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:update, ParamCount:\d+$/,
];

export const DENY_URLS: Array<string | RegExp> = [
  /webkit-masked-url:\/\/hidden/,
  /extensions\//,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-extension:\/\//,
  // Cloudflare Web Analytics beacon (served at /beacon.min.js/v<hash>). It calls
  // Array.prototype.at(), which throws in legacy browsers and bots (e.g. Chrome 79),
  // surfacing as unhandled global-onerror noise we cannot fix in third-party code.
  /\/beacon\.min\.js\//,
];

export function initSentry(siteName: string): void {
  const dsn = import.meta.env.PUBLIC_SENTRY_DSN as string | undefined;
  if (!import.meta.env.PROD || !dsn) return;
  const release = import.meta.env.PUBLIC_SENTRY_RELEASE as string | undefined;

  Sentry.init({
    dsn,
    environment:
      (import.meta.env.PUBLIC_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    release: release || undefined,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    denyUrls: DENY_URLS,
    initialScope: {
      tags: { site: siteName },
    },
  });
}

export function captureException(
  error: unknown,
  context?: Parameters<typeof Sentry.captureException>[1],
): void {
  if (context === undefined) {
    Sentry.captureException(error);
    return;
  }
  Sentry.captureException(error, context);
}

type SiteFetchFailureContext = {
  source: string;
  status?: number;
};

const CONVERSION_FETCH_FAILURE_SOURCES = new Set([
  "email-capture",
  "email-capture-config",
  "exit-intent-popup",
  "exit-intent-resend",
  "fake-door-pricing-config",
  "fake-door-pricing-click",
  "gated-content",
  "gated-content-resend",
  "lead-magnet-resend",
  "lead-magnet-signup",
  "pricebook-builder",
  "questionnaire-shell",
]);

function isExpectedBrowserFetchFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;

  return /^(Load failed|Failed to fetch)$/.test(error.message);
}

export function captureSiteFetchFailure(error: unknown, context: SiteFetchFailureContext): void {
  if (context.status !== undefined && context.status < 500) return;
  if (
    context.status === undefined &&
    isExpectedBrowserFetchFailure(error) &&
    !CONVERSION_FETCH_FAILURE_SOURCES.has(context.source)
  ) {
    return;
  }

  if (context.status === undefined && isExpectedBrowserFetchFailure(error)) {
    try {
      Sentry.captureException(new Error(`${context.source} browser request failed`), {
        tags: { source: context.source },
        extra: { status: context.status, browserFetchFailure: true },
      });
    } catch {
      // Telemetry failures must never block form recovery UI.
    }
    return;
  }

  const capturedError = new Error(
    context.status === undefined
      ? `${context.source} request failed`
      : `${context.source} request failed with status ${String(context.status)}`,
  );

  try {
    Sentry.captureException(capturedError, {
      tags: { source: context.source },
      extra: { status: context.status },
    });
  } catch {
    // Telemetry failures must never block form recovery UI.
  }
}
