import { describe, expect, it, vi } from "vitest";
import type { Context } from "hono";
import {
  captureApiException,
  captureAuthServerError,
  captureBackgroundException,
  captureQueueException,
  captureScheduledException,
  createSentryOptions,
  getSafeRoutePath,
  runScheduledJob,
} from "./sentry";
import type { AppEnv } from "../types";

const { mockCaptureException, mockAddBreadcrumb } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockAddBreadcrumb: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
  captureException: mockCaptureException,
  addBreadcrumb: mockAddBreadcrumb,
}));

function makeContext(values: Partial<AppEnv["Variables"]> = {}): Context<AppEnv> {
  return {
    get: (key: keyof AppEnv["Variables"]) => values[key],
    req: {
      method: "POST",
      path: "/api/test",
    },
  } as unknown as Context<AppEnv>;
}

describe("API Sentry helpers", () => {
  it("captures API exceptions with safe error messages and request metadata", () => {
    const error = new Error("raw sql relation failed for jane@example.com");

    captureApiException(
      error,
      makeContext({
        orgId: "org-1",
        user: { id: "user-1", email: "user@example.com", name: "User One" },
      }),
      {
        status: 500,
      },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "API exception",
      }),
      expect.objectContaining({
        tags: {
          method: "POST",
          path: "/api/test",
          status: "500",
          org_id: "org-1",
        },
        user: { id: "user-1" },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("raw sql relation");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("jane@example.com");
  });

  it("captures API exceptions with sanitized entity context", () => {
    const error = new Error("entity route failed");

    captureApiException(
      error,
      makeContext({
        orgId: "org-1",
        entityId: "entity-client",
        entityScope: "entity",
        user: { id: "user-1", email: "user@example.com", name: "User One" },
      }),
      { status: 500 },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "API exception",
      }),
      expect.objectContaining({
        tags: {
          method: "POST",
          path: "/api/test",
          status: "500",
          org_id: "org-1",
          entity_id: "entity-client",
          entity_scope: "entity",
        },
        user: { id: "user-1" },
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("entity route failed");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Client Project");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("12-3456789");
  });

  it("still captures API exceptions when context values are unavailable", () => {
    const error = new Error("context failed");
    const context = {
      get: () => {
        throw new Error("missing context");
      },
      req: { method: "GET", path: "/api/public" },
    } as unknown as Context<AppEnv>;

    captureApiException(error, context, { status: 500 });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "API exception",
      }),
      expect.objectContaining({
        tags: {
          method: "GET",
          path: "/api/public",
          status: "500",
        },
        user: undefined,
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("context failed");
  });

  it("never throws when Sentry capture fails for an API exception", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });

    expect(() =>
      captureApiException(new Error("database failed"), makeContext(), { status: 500 }),
    ).not.toThrow();
  });

  it("uses registered route paths instead of raw tokenized request paths", () => {
    const values: Partial<AppEnv["Variables"]> = { orgId: "org-1" };
    const context = {
      get: (key: keyof AppEnv["Variables"]) => values[key],
      req: {
        method: "GET",
        path: "/api/downloads/secret-download-token",
        routePath: "/api/downloads/:token",
      },
    } as unknown as Context<AppEnv>;

    captureApiException(new Error("download failed"), context, { status: 500 });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ path: "/api/downloads/:token" }),
      }),
    );
  });

  it("redacts opaque path segments when no registered route path is available", () => {
    const context = {
      req: {
        path: "/api/downloads/secret-download-token",
      },
    } as unknown as Context<AppEnv>;

    expect(getSafeRoutePath(context)).toBe("/api/downloads/:redacted");
  });

  it("falls back to a safe placeholder when the request path cannot be read", () => {
    const context = {
      req: {
        get routePath(): string {
          throw new Error("route path unavailable");
        },
      },
    } as unknown as Context<AppEnv>;

    expect(getSafeRoutePath(context)).toBe("[unknown]");
  });

  it("captures background exceptions with sanitized error messages by default", () => {
    const error = new Error("activity log write failed");

    captureBackgroundException(error, "activity-log", {
      action: "donor.created",
      entity_type: "contact",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Background exception",
      }),
      {
        tags: {
          surface: "activity-log",
          action: "donor.created",
          entity_type: "contact",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("activity log write");
  });

  it("redacts sensitive background exception tag values and error messages", () => {
    const error = new Error("Client Project Alpha access failed for EIN 12-3456789");

    captureBackgroundException(error, "entity-access", {
      action: "assign",
      entity_name: "Client Project Alpha",
      ein: "12-3456789",
      report_text: "Board report says cash balance is $12,345",
      amount_cents: "1234500",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Background exception",
      }),
      {
        tags: {
          surface: "entity-access",
          action: "assign",
          entity_name: "[redacted]",
          ein: "[redacted]",
          report_text: "[redacted]",
          amount_cents: "[redacted]",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Client Project Alpha");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("12-3456789");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("$12,345");
    const capturedError = mockCaptureException.mock.calls.find(
      ([captured]) => captured instanceof Error && captured.message === "Background exception",
    )?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).not.toBe(error);
  });

  it("redacts sensitive tag keys and values in background exceptions", () => {
    captureBackgroundException(new Error("transport failed"), "privacy-test", {
      token: "tok_super_secret_value",
      email: "admin@example.org",
      stripe_payload: '{"customer":"cus_123","email":"admin@example.org"}',
      sql: 'select * from "donations"',
      customer: "Jane Donor",
      provider: "OpenRouter raw provider text",
      authorization: "Bearer abc123",
      request_id: "req_safe",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Background exception" }),
      {
        tags: {
          surface: "privacy-test",
          token: "[redacted]",
          email: "[redacted]",
          stripe_payload: "[redacted]",
          sql: "[redacted]",
          customer: "[redacted]",
          provider: "[redacted]",
          authorization: "[redacted]",
          request_id: "req_safe",
        },
      },
    );
    const calls = JSON.stringify(mockCaptureException.mock.calls);
    expect(calls).not.toContain("tok_super_secret_value");
    expect(calls).not.toContain("admin@example.org");
    expect(calls).not.toContain("cus_123");
    expect(calls).not.toContain("select *");
    expect(calls).not.toContain("Jane Donor");
  });

  it("keeps analytics event tags visible while redacting true name tags", () => {
    const error = new Error("analytics transport failed");

    captureBackgroundException(error, "api.analytics", {
      analytics_event: "checkout_completed",
      event_name: "checkout_completed",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Background exception",
      }),
      {
        tags: {
          surface: "api.analytics",
          analytics_event: "checkout_completed",
          event_name: "[redacted]",
        },
      },
    );
  });

  it("captures background exceptions without extra tags using a safe message", () => {
    const error = new Error("background boom");

    captureBackgroundException(error, "paywall");

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Background exception",
      }),
      {
        tags: { surface: "paywall" },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("background boom");
  });

  it("never throws when Sentry capture fails for a background exception", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });

    expect(() => captureBackgroundException(new Error("boom"), "leads")).not.toThrow();
  });

  it("captures scheduled exceptions with safe error messages and job metadata", () => {
    const error = new Error("job failed for donor@example.org");

    captureScheduledException(error, "job.name", "0 * * * *");

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Scheduled exception",
      }),
      {
        tags: {
          job: "job.name",
          cron: "0 * * * *",
          surface: "scheduled",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("donor@example.org");
  });

  it("never throws when Sentry capture fails for a scheduled exception", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });

    expect(() =>
      captureScheduledException(new Error("scheduled boom"), "job.name", "0 * * * *"),
    ).not.toThrow();
  });

  it("returns null when scheduled jobs succeed", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await expect(runScheduledJob("ok", "* * * * *", async () => {})).resolves.toBeNull();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: "scheduled",
        message: "ok",
        data: { cron: "* * * * *" },
      });
      expect(infoSpy).toHaveBeenCalledWith(
        "[scheduled] job complete",
        expect.objectContaining({
          job: "ok",
          cron: "* * * * *",
          duration_ms: expect.any(Number),
        }),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("returns and captures errors when scheduled jobs fail", async () => {
    const error = new Error("nope");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        runScheduledJob("bad", "* * * * *", async () => {
          throw error;
        }),
      ).resolves.toBe(error);

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Error",
          message: "Scheduled exception",
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ job: "bad" }),
        }),
      );
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: "scheduled",
        message: "bad",
        data: { cron: "* * * * *" },
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "[scheduled] job failed",
        expect.objectContaining({
          job: "bad",
          cron: "* * * * *",
          duration_ms: expect.any(Number),
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("captures queue exceptions with queue metadata and a safe message", () => {
    const error = new Error("queue boom");

    captureQueueException(error, "award-intake", { org_id: "org-1" });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Queue exception",
      }),
      {
        tags: {
          queue: "award-intake",
          surface: "queue",
          org_id: "org-1",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("queue boom");
  });

  it("redacts sensitive queue exception tag values and error messages", () => {
    const error = new Error("Client Project Alpha queue failed for EIN 12-3456789");

    captureQueueException(error, "award-intake", {
      org_id: "org-1",
      entity_name: "Client Project Alpha",
      ein: "12-3456789",
      amount_cents: "999999",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Queue exception",
      }),
      {
        tags: {
          queue: "award-intake",
          surface: "queue",
          org_id: "org-1",
          entity_name: "[redacted]",
          ein: "[redacted]",
          amount_cents: "[redacted]",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Client Project Alpha");
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("12-3456789");
    const capturedError = mockCaptureException.mock.calls.find(
      ([captured]) => captured instanceof Error && captured.message === "Queue exception",
    )?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).not.toBe(error);
  });

  it("captures queue exceptions without extra tags using a safe message", () => {
    const error = new Error("queue boom");

    captureQueueException(error, "accounting-sync");

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Queue exception",
      }),
      {
        tags: {
          queue: "accounting-sync",
          surface: "queue",
        },
      },
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("queue boom");
  });

  it("never throws when Sentry capture fails for a queue exception", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });

    expect(() => captureQueueException(new Error("queue boom"), "award-intake")).not.toThrow();
  });

  it("never throws when Sentry capture fails for an auth server error", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });

    expect(() =>
      captureAuthServerError({
        path: "/api/auth/better/sign-in/email",
        method: "POST",
        status: 500,
        code: null,
        requestId: null,
      }),
    ).not.toThrow();
  });

  it("redacts high-entropy token segments from the auth path tag", () => {
    captureAuthServerError({
      path: "/api/auth/better/reset-password/aVeryLongResetTokenValue1234567890",
      method: "POST",
      status: 500,
      code: null,
      requestId: null,
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          path: "/api/auth/better/reset-password/:redacted",
        }),
      }),
    );
  });

  it("captures auth server errors with correlation metadata", () => {
    captureAuthServerError({
      path: "/api/auth/better/sign-up/email",
      method: "POST",
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      requestId: "req-500",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Better Auth 5xx response: INTERNAL_SERVER_ERROR" }),
      {
        tags: {
          surface: "auth",
          path: "/api/auth/better/sign-up/email",
          method: "POST",
          status: "500",
          code: "INTERNAL_SERVER_ERROR",
        },
        extra: { requestId: "req-500" },
      },
    );
  });

  it("captures auth server errors when the auth code is unknown", () => {
    captureAuthServerError({
      path: "/api/auth/better/sign-in/email",
      method: "POST",
      status: 502,
      code: null,
      requestId: null,
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Better Auth 5xx response" }),
      {
        tags: {
          surface: "auth",
          path: "/api/auth/better/sign-in/email",
          method: "POST",
          status: "502",
        },
        extra: { requestId: null },
      },
    );
  });

  it("creates Sentry options with Cloudflare metadata release precedence", () => {
    expect(
      createSentryOptions({
        DATABASE_URL: "postgres://test",
        BETTER_AUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        APP_URL: "http://localhost:5173",
        SENTRY_DSN: "https://public@sentry.io/1",
        SENTRY_RELEASE: "manual",
        CF_VERSION_METADATA: { id: "worker-version" },
      }),
    ).toMatchObject({
      dsn: "https://public@sentry.io/1",
      release: "worker-version",
      enableLogs: true,
      sendDefaultPii: false,
    });
  });

  it("returns undefined Sentry options when no DSN is configured", () => {
    expect(
      createSentryOptions({
        DATABASE_URL: "postgres://test",
        BETTER_AUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        APP_URL: "http://localhost:5173",
      } as unknown as AppEnv["Bindings"]),
    ).toBeUndefined();
  });

  it("falls back to the manual release and default environment when Cloudflare metadata is absent", () => {
    expect(
      createSentryOptions({
        DATABASE_URL: "postgres://test",
        BETTER_AUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        APP_URL: "http://localhost:5173",
        SENTRY_DSN: "https://public@sentry.io/1",
        SENTRY_RELEASE: "manual",
      } as unknown as AppEnv["Bindings"]),
    ).toMatchObject({
      environment: "development",
      release: "manual",
    });
  });

  it("uses the configured environment and falls back to an unknown release when nothing is set", () => {
    expect(
      createSentryOptions({
        DATABASE_URL: "postgres://test",
        BETTER_AUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        APP_URL: "http://localhost:5173",
        SENTRY_DSN: "https://public@sentry.io/1",
        SENTRY_ENVIRONMENT: "production",
      } as unknown as AppEnv["Bindings"]),
    ).toMatchObject({
      environment: "production",
      release: "unknown",
    });
  });
});
