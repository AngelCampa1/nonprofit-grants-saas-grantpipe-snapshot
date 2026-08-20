import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http-response";

const mockCaptureException = vi.fn();
const mockInit = vi.fn();
const mockReactErrorHandler = vi.fn(() => "react-error-handler");
const mockPosthogCaptureException = vi.fn();

vi.mock("@sentry/react", () => ({
  captureException: mockCaptureException,
  init: mockInit,
  reactErrorHandler: mockReactErrorHandler,
}));

vi.mock("posthog-js", () => ({
  default: {
    captureException: mockPosthogCaptureException,
  },
}));

describe("web Sentry helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not initialize Sentry when VITE_SENTRY_DSN is unset", async () => {
    const { initSentry } = await import("./sentry");

    initSentry();

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initializes Sentry with env config and PII disabled", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("VITE_SENTRY_RELEASE", "web-release");
    const { initSentry } = await import("./sentry");

    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "production",
        release: "web-release",
        sendDefaultPii: false,
        tracesSampleRate: 0,
      }),
    );
  });

  it("denyUrls filters the Cloudflare Web Analytics beacon script", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    const { initSentry } = await import("./sentry");

    initSentry();

    const call = mockInit.mock.calls[0]![0] as { denyUrls?: Array<string | RegExp> };
    const denyUrls = call.denyUrls ?? [];
    const matchesBeacon = denyUrls.some((pattern) =>
      pattern instanceof RegExp
        ? pattern.test(
            "https://app.grantpipe.com/beacon.min.js/v4513226cdae34746b4dedf0b4dfa099e1781791509496",
          )
        : false,
    );
    expect(matchesBeacon).toBe(true);

    const matchesFirstPartyChunk = denyUrls.some((pattern) =>
      pattern instanceof RegExp
        ? pattern.test("https://app.grantpipe.com/assets/index-a1b2c3d4.js")
        : false,
    );
    expect(matchesFirstPartyChunk).toBe(false);
  });

  it("falls back to mode and omits blank releases", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_RELEASE", "");
    // No VITE_SENTRY_ENVIRONMENT set, so sentry.ts falls back to import.meta.env.MODE.
    // Stub MODE explicitly so the assertion is deterministic regardless of the test
    // runner's default mode (vitest defaults MODE to "test", not "development").
    vi.stubEnv("MODE", "development");
    const { initSentry } = await import("./sentry");

    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
        release: undefined,
      }),
    );
  });

  it("captures reportable errors in Sentry and PostHog", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new Error("boom");

    captureAppException(error, { tags: { source: "test" }, extra: { id: "x" } });

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { source: "test" },
        extra: { id: "x" },
      }),
    );
    expect(mockPosthogCaptureException).toHaveBeenCalledWith(error, {
      extra: { id: "x" },
    });
  });

  it("normalizes non-Error values before capture", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException("plain failure");

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plain failure" }),
      expect.anything(),
    );
  });

  it("does not throw when Sentry capture fails", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new Error("sentry offline");
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("capture failed");
    });

    expect(() => captureAppException(error)).not.toThrow();
    expect(mockPosthogCaptureException).toHaveBeenCalledWith(error, {
      extra: undefined,
    });
  });

  it("does not throw when PostHog capture fails", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new Error("posthog offline");
    mockPosthogCaptureException.mockImplementationOnce(() => {
      throw new Error("capture failed");
    });

    expect(() => captureAppException(error)).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it("skips expected 4xx ApiErrors", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(new ApiError("Not found", 404));

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockPosthogCaptureException).not.toHaveBeenCalled();
  });

  it("skips expected status-bearing 4xx errors", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(Object.assign(new Error("Forbidden"), { status: 403 }));

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockPosthogCaptureException).not.toHaveBeenCalled();
  });

  it("skips expected statusCode-bearing 4xx errors", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(Object.assign(new Error("Unauthorized"), { statusCode: 401 }));

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockPosthogCaptureException).not.toHaveBeenCalled();
  });

  it("reports 5xx ApiErrors", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new ApiError("Server error", 500);

    captureAppException(error);

    expect(mockCaptureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it("can capture handled 4xx ApiErrors with a sanitized message", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new ApiError("raw donor name from response", 403, "forbidden");

    captureAppException(
      error,
      {
        tags: { feature: "pledge_tracker", operation: "create_pledge" },
        extra: { failure_type: "permission", status: 403, error_code: "forbidden" },
      },
      { includeExpected: true, sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ApiError",
        message: "Handled API error: 403",
      }),
      expect.objectContaining({
        tags: { feature: "pledge_tracker", operation: "create_pledge" },
        extra: { failure_type: "permission", status: 403, error_code: "forbidden" },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("raw donor name");
  });

  it("redacts entity names from sanitized expected failure context", async () => {
    const { captureAppException } = await import("./sentry");
    const error = new ApiError("Client Project name should not leak", 403, "forbidden");

    captureAppException(
      error,
      {
        tags: { feature: "entity_switcher", operation: "switch_entity" },
        extra: {
          active_entity_id: "entity-1",
          requested_entity_id: "entity-2",
          active_entity_name: "Main Organization",
          requested_entity_name: "Client Project",
        },
      },
      { includeExpected: true, sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ApiError",
        message: "Handled API error: 403",
      }),
      expect.objectContaining({
        tags: { feature: "entity_switcher", operation: "switch_entity" },
        extra: {
          active_entity_id: "entity-1",
          requested_entity_id: "entity-2",
          active_entity_name: "[redacted]",
          requested_entity_name: "[redacted]",
        },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Client Project");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Main Organization");
  });

  it("redacts nested names and labels from sanitized failure context", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(
      new Error("Local storage denied for Client Project"),
      {
        tags: { feature: "entity_switcher" },
        extra: {
          requested_entity_id: "entity-client",
          entities: [
            { entity_id: "entity-root", entity_name: "Main Organization" },
            { entity_id: "entity-client", display_label: "Client Project" },
          ],
          selection: {
            label: "Client Project",
            nested: { name: "Main Organization", id: "entity-root" },
          },
        },
      },
      { includeExpected: true, sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Handled application error" }),
      expect.objectContaining({
        extra: {
          requested_entity_id: "entity-client",
          entities: [
            { entity_id: "entity-root", entity_name: "[redacted]" },
            { entity_id: "entity-client", display_label: "[redacted]" },
          ],
          selection: {
            label: "[redacted]",
            nested: { name: "[redacted]", id: "entity-root" },
          },
        },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Client Project");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Main Organization");
  });

  it("sanitizes unexpected Error messages before reporting", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(
      new Error("Network error for jane@example.com token=secret-token"),
      { tags: { source: "signup" }, extra: { stage: "post_account_create" } },
      { sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Handled application error" }),
      expect.objectContaining({
        tags: { source: "signup" },
        extra: { stage: "post_account_create" },
      }),
    );
    expect(mockPosthogCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Handled application error" }),
      { extra: { stage: "post_account_create" } },
    );
    const sentryCalls = JSON.stringify(mockCaptureException.mock.calls);
    const posthogCalls = JSON.stringify(mockPosthogCaptureException.mock.calls);
    expect(sentryCalls).not.toContain("jane@example.com");
    expect(sentryCalls).not.toContain("secret-token");
    expect(posthogCalls).not.toContain("jane@example.com");
    expect(posthogCalls).not.toContain("secret-token");
  });

  it("can capture handled status-bearing errors with a sanitized message", async () => {
    const { captureAppException } = await import("./sentry");
    const error = Object.assign(new Error("raw funder name from response"), { status: 429 });

    captureAppException(
      error,
      { tags: { feature: "pledge_tracker" }, extra: { failure_type: "rate_limited" } },
      { includeExpected: true, sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "HttpError",
        message: "Handled HTTP error: 429",
      }),
      expect.objectContaining({
        tags: { feature: "pledge_tracker" },
        extra: { failure_type: "rate_limited" },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("raw funder name");
  });

  it("can capture handled unknown values with a sanitized message", async () => {
    const { captureAppException } = await import("./sentry");

    captureAppException(
      "raw donor note from response",
      { tags: { feature: "pledge_tracker" }, extra: { failure_type: "unknown" } },
      { includeExpected: true, sanitize: true },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Handled application error",
      }),
      expect.objectContaining({
        tags: { feature: "pledge_tracker" },
        extra: { failure_type: "unknown" },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("raw donor note");
  });

  it("shows specific expected API errors to users", async () => {
    const { getUserFacingErrorMessage } = await import("./sentry");

    expect(getUserFacingErrorMessage(new ApiError("Grant not found", 404))).toBe("Grant not found");
  });

  it("shows generic Error messages when no status is present", async () => {
    const { getUserFacingErrorMessage } = await import("./sentry");

    expect(getUserFacingErrorMessage(new Error("Browser storage unavailable"))).toBe(
      "Browser storage unavailable",
    );
  });

  it("hides internal API error details from users", async () => {
    const { getUserFacingErrorMessage } = await import("./sentry");

    expect(getUserFacingErrorMessage(new ApiError("database password leaked", 500))).toBe(
      "Something went wrong. Try again, or contact support if it keeps happening.",
    );
  });

  it("uses fallback copy for non-Error failures", async () => {
    const { getUserFacingErrorMessage } = await import("./sentry");

    expect(getUserFacingErrorMessage(null)).toBe(
      "Something went wrong. Try again, or contact support if it keeps happening.",
    );
  });

  it("summarizes query keys without user-provided values", async () => {
    const { summarizeQueryKey } = await import("./sentry");

    expect(summarizeQueryKey(["donors", "alice@example.com", 2, { search: "major" }])).toEqual([
      "donors",
      "string",
      "number",
      "object",
    ]);
  });

  it("returns undefined for absent query keys", async () => {
    const { summarizeQueryKey } = await import("./sentry");

    expect(summarizeQueryKey(undefined)).toBeUndefined();
  });

  it("summarizes boolean, null, and array query key parts by shape", async () => {
    const { summarizeQueryKey } = await import("./sentry");

    expect(summarizeQueryKey(["filters", true, null, ["nested"]])).toEqual([
      "filters",
      "boolean",
      "null",
      "array",
    ]);
  });

  it("captures React boundary errors with component stack metadata", async () => {
    const { captureReactBoundaryError } = await import("./sentry");
    const error = new Error("render failed");

    captureReactBoundaryError(error, { componentStack: "Stack" }, "boundary");

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { source: "boundary" },
        extra: { componentStack: "Stack" },
      }),
    );
  });

  it("captures TanStack Query errors with operation metadata", async () => {
    const { captureQueryError } = await import("./sentry");
    const error = new Error("query failed");

    captureQueryError(error, "mutation", { mutationKey: ["save"] });

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: {
          source: "tanstack-query",
          operation: "mutation",
        },
        extra: { mutationKey: ["save"] },
      }),
    );
  });

  it("creates React 19 root error handlers through Sentry", async () => {
    const { createReactRootOptions } = await import("./sentry");

    expect(createReactRootOptions()).toEqual({
      onUncaughtError: "react-error-handler",
      onCaughtError: "react-error-handler",
      onRecoverableError: "react-error-handler",
    });
    expect(mockReactErrorHandler).toHaveBeenCalledTimes(3);
  });
});
