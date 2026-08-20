import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockBetterAuth, mockBetterAuthInstance, mockDrizzleAdapter } = vi.hoisted(() => {
  const mockBetterAuthInstance = { handler: vi.fn(), api: {} };
  const mockBetterAuth = vi.fn((_config: unknown) => mockBetterAuthInstance);
  const mockDrizzleAdapter = vi.fn((_db: unknown, _opts: unknown) => ({ type: "drizzle" }));
  return { mockBetterAuth, mockBetterAuthInstance, mockDrizzleAdapter };
});

const { mockCreateOrgForUser, mockCheckInvite } = vi.hoisted(() => ({
  mockCreateOrgForUser: vi.fn().mockResolvedValue({ id: "org-1" }),
  mockCheckInvite: vi.fn(),
}));
const mockSendPasswordResetEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const { mockAnalyticsCapture, mockGetIntegrations } = vi.hoisted(() => {
  const mockAnalyticsCapture = vi.fn().mockResolvedValue({ id: "evt-1" });
  const mockGetIntegrations = vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  }));
  return { mockAnalyticsCapture, mockGetIntegrations };
});
const mockRecordSignupCompleted = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCaptureBackgroundException = vi.hoisted(() => vi.fn());
const { mockCaptureException, mockWithScope, mockScopeSetTag, mockScopeSetContext } = vi.hoisted(
  () => {
    const mockCaptureException = vi.fn();
    const mockScopeSetTag = vi.fn();
    const mockScopeSetContext = vi.fn();
    const mockWithScope = vi.fn((callback: (scope: unknown) => unknown) =>
      callback({
        setTag: mockScopeSetTag,
        setContext: mockScopeSetContext,
      }),
    );

    return {
      mockCaptureException,
      mockWithScope,
      mockScopeSetTag,
      mockScopeSetContext,
    };
  },
);

vi.mock("better-auth", () => ({
  betterAuth: mockBetterAuth,
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: mockDrizzleAdapter,
}));

vi.mock("@grantpipe/db", () => ({
  // schema exports — empty object is sufficient for the adapter mock
}));

vi.mock("../domains/auth/service", () => ({
  createOrgForUser: mockCreateOrgForUser,
  checkInvite: mockCheckInvite,
}));

vi.mock("../domains/leads/sequencer", () => ({
  recordSignupCompleted: mockRecordSignupCompleted,
}));

vi.mock("./password-reset-email", () => ({
  sendPasswordResetEmail: mockSendPasswordResetEmail,
}));

vi.mock("./integrations", () => ({
  getIntegrations: mockGetIntegrations,
}));

vi.mock("./sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("@sentry/cloudflare", () => ({
  captureException: mockCaptureException,
  withScope: mockWithScope,
}));

import { createAuth, type Auth } from "./auth";
import type { Database } from "@grantpipe/db";
import type { Bindings } from "../types";

const fakeDb = {} as unknown as Database;

const fakeEnv: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "super-secret",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  APP_URL: "https://app.grantpipe.com",
};

function makeBootstrapCleanupDb() {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const tx = { execute };
  const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );

  return { db: { transaction } as unknown as Database, execute, transaction };
}

function getBetterAuthConfig(): Record<string, unknown> {
  const call = mockBetterAuth.mock.calls[0];
  if (!call) throw new Error("betterAuth was not called");
  return call[0] as unknown as Record<string, unknown>;
}

function getDrizzleAdapterArgs(): [unknown, Record<string, unknown>] {
  const call = mockDrizzleAdapter.mock.calls[0];
  if (!call) throw new Error("drizzleAdapter was not called");
  return [call[0], call[1] as unknown as Record<string, unknown>];
}

describe("createAuth", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckInvite.mockResolvedValue({ valid: false });
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it("returns a Better Auth instance", () => {
    const auth = createAuth(fakeDb, fakeEnv);
    expect(auth).toBe(mockBetterAuthInstance);
  });

  it("calls betterAuth with correct secret and the browser-facing auth base path", () => {
    createAuth(fakeDb, fakeEnv);

    expect(mockBetterAuth).toHaveBeenCalledOnce();
    const config = getBetterAuthConfig();
    expect(config.secret).toBe(fakeEnv.BETTER_AUTH_SECRET);
    expect(config.baseURL).toBe(fakeEnv.APP_URL);
    expect(config.basePath).toBe("/api/auth/better");
  });

  it("enables email and password auth", () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const emailAndPassword = config.emailAndPassword as { enabled: boolean };
    expect(emailAndPassword.enabled).toBe(true);
  });

  it("configures Google social provider with env credentials", () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const google = (
      config.socialProviders as { google: { clientId: string; clientSecret: string } }
    ).google;
    expect(google.clientId).toBe(fakeEnv.GOOGLE_CLIENT_ID);
    expect(google.clientSecret).toBe(fakeEnv.GOOGLE_CLIENT_SECRET);
  });

  it("stores OAuth state in cookies so Google sign-in can start before a database write", () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const account = config.account as { storeStateStrategy: string };
    expect(account.storeStateStrategy).toBe("cookie");
  });

  it("enables session cookie cache with 5-minute maxAge", () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const cookieCache = (config.session as { cookieCache: { enabled: boolean; maxAge: number } })
      .cookieCache;
    expect(cookieCache.enabled).toBe(true);
    expect(cookieCache.maxAge).toBe(5 * 60);
  });

  it("passes drizzle adapter to betterAuth database config", () => {
    createAuth(fakeDb, fakeEnv);

    expect(mockDrizzleAdapter).toHaveBeenCalledOnce();
    const [adapterDb, adapterOpts] = getDrizzleAdapterArgs();
    expect(adapterDb).toBe(fakeDb);
    expect(adapterOpts.provider).toBe("pg");

    const config = getBetterAuthConfig();
    expect(config.database).toEqual({ type: "drizzle" });
  });

  it("Auth type is the return type of createAuth", () => {
    // Type-level test: Auth must be assignable from createAuth return value
    const auth: Auth = createAuth(fakeDb, fakeEnv);
    expect(auth).toBeDefined();
  });

  it("adds the localhost trusted origins when INTEGRATION_MODE is mock", () => {
    createAuth(fakeDb, { ...fakeEnv, INTEGRATION_MODE: "mock" } as Bindings);

    const config = getBetterAuthConfig();
    const trustedOrigins = config.trustedOrigins as string[];
    expect(trustedOrigins).toContain(fakeEnv.APP_URL);
    expect(trustedOrigins).toContain("http://localhost:5173");
    expect(trustedOrigins.length).toBeGreaterThan(1);
  });

  it("omits localhost trusted origins when INTEGRATION_MODE is real", () => {
    createAuth(fakeDb, { ...fakeEnv, INTEGRATION_MODE: "real" } as Bindings);

    const config = getBetterAuthConfig();
    const trustedOrigins = config.trustedOrigins as string[];
    expect(trustedOrigins).toEqual([fakeEnv.APP_URL]);
  });

  it("sets useSecureCookies to false when APP_URL is http (local dev)", () => {
    createAuth(fakeDb, { ...fakeEnv, APP_URL: "http://localhost:3050" });

    const config = getBetterAuthConfig();
    const advanced = config.advanced as { useSecureCookies: boolean };
    expect(advanced.useSecureCookies).toBe(false);
  });

  it("sets useSecureCookies to true when APP_URL is https (production)", () => {
    createAuth(fakeDb, { ...fakeEnv, APP_URL: "https://app.grantpipe.com" });

    const config = getBetterAuthConfig();
    const advanced = config.advanced as { useSecureCookies: boolean };
    expect(advanced.useSecureCookies).toBe(true);
  });

  it("sets useSecureCookies to true even when INTEGRATION_MODE is mock but APP_URL is https", () => {
    // Prevents accidental insecure cookies if prod is deployed with wrong INTEGRATION_MODE
    createAuth(fakeDb, {
      ...fakeEnv,
      APP_URL: "https://app.grantpipe.com",
      INTEGRATION_MODE: "mock",
    } as Bindings);

    const config = getBetterAuthConfig();
    const advanced = config.advanced as { useSecureCookies: boolean };
    expect(advanced.useSecureCookies).toBe(true);
  });

  it("sets defaultCookieAttributes to undefined when APP_URL is http", () => {
    createAuth(fakeDb, { ...fakeEnv, APP_URL: "http://localhost:3050" });

    const config = getBetterAuthConfig();
    const advanced = config.advanced as { defaultCookieAttributes: unknown };
    expect(advanced.defaultCookieAttributes).toBeUndefined();
  });

  it("sets defaultCookieAttributes with sameSite lax, secure, and httpOnly when APP_URL is https", () => {
    createAuth(fakeDb, { ...fakeEnv, APP_URL: "https://app.grantpipe.com" });

    const config = getBetterAuthConfig();
    const advanced = config.advanced as {
      defaultCookieAttributes: { sameSite: string; httpOnly: boolean };
    };
    // sameSite must be "lax" (not "none") — same-site deploy, cross-site not needed
    expect(advanced.defaultCookieAttributes).toEqual({
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    });
  });

  it("includes port 3050 in trustedOrigins in mock mode", () => {
    createAuth(fakeDb, { ...fakeEnv, INTEGRATION_MODE: "mock" } as Bindings);

    const config = getBetterAuthConfig();
    const trustedOrigins = config.trustedOrigins as string[];
    expect(trustedOrigins).toContain("http://localhost:3050");
  });

  it("configures databaseHooks.user.create.after that calls createOrgForUser", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;
    expect(typeof afterHook).toBe("function");

    await afterHook({ id: "user-1", name: "Alice" });

    expect(mockCreateOrgForUser).toHaveBeenCalledOnce();
    expect(mockCreateOrgForUser).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      userName: "Alice",
    });
  });

  it("emits a trial_started analytics event after bootstrapping the personal org", async () => {
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-99" });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await afterHook({ id: "user-1", name: "Alice" });

    expect(mockGetIntegrations).toHaveBeenCalledWith(fakeDb, fakeEnv);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-99",
        eventName: "trial_started",
        payload: expect.objectContaining({ subscription_status: "trialing" }),
      }),
    );
  });

  it("reports trial_started analytics failures without failing signup bootstrap", async () => {
    const analyticsError = new Error("PostHog unavailable");
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-99" });
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await expect(afterHook({ id: "user-1", name: "Alice" })).resolves.toBeUndefined();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "auth",
      expect.objectContaining({
        step: "trial_started_analytics",
        analytics_event: "trial_started",
      }),
    );
  });

  it("records signup completion in Sequencer after bootstrapping the personal org", async () => {
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-99" });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (user: { id: string; name: string; email: string }) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" });

    expect(mockRecordSignupCompleted).toHaveBeenCalledWith(fakeEnv, {
      email: "alice@example.org",
      userId: "user-1",
      orgId: "org-99",
    });
  });

  it("does not break signup when Sequencer signup event capture fails", async () => {
    mockRecordSignupCompleted.mockRejectedValueOnce(new Error("sequencer down"));
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (user: { id: string; name: string; email: string }) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await expect(
      afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }),
    ).resolves.toBeUndefined();
    expect(mockCreateOrgForUser).toHaveBeenCalledOnce();
  });

  it("captures Sequencer signup failures without logging upstream response bodies", async () => {
    mockRecordSignupCompleted.mockRejectedValueOnce(
      new Error('Sequencer signup_completed failed: {"email":"alice@example.org"}'),
    );
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (user: { id: string; name: string; email: string }) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await expect(
      afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] sequencer signup event failed",
      expect.objectContaining({
        userId: "user-1",
        stage: "user.create.after.sequencer-signup",
        error: "Sequencer signup event failed",
      }),
    );
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain("alice@example.org");
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sequencer signup event failed",
      }),
      "auth",
      {
        stage: "user.create.after.sequencer-signup",
        user_id: "user-1",
      },
    );
    expect(JSON.stringify(mockCaptureBackgroundException.mock.calls)).not.toContain(
      "alice@example.org",
    );
  });

  it("does not break signup when Sequencer failure telemetry capture throws", async () => {
    mockRecordSignupCompleted.mockRejectedValueOnce(new Error("sequencer down"));
    mockCaptureBackgroundException.mockImplementationOnce(() => {
      throw new Error("sentry down");
    });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (user: { id: string; name: string; email: string }) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await expect(
      afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }),
    ).resolves.toBeUndefined();
    expect(mockCreateOrgForUser).toHaveBeenCalledOnce();
  });

  it("tags the trial_started event with an explicit SENTRY_ENVIRONMENT when set", async () => {
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-99" });
    createAuth(fakeDb, { ...fakeEnv, SENTRY_ENVIRONMENT: "staging" });

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await afterHook({ id: "user-1", name: "Alice" });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ environment: "staging" }),
      }),
    );
  });

  it("tags the trial_started event as development outside the production host", async () => {
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-99" });
    createAuth(fakeDb, { ...fakeEnv, APP_URL: "http://localhost:3050" });

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await afterHook({ id: "user-1", name: "Alice" });

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ environment: "development" }),
      }),
    );
  });

  it("does not break signup when trial_started analytics capture fails", async () => {
    mockAnalyticsCapture.mockRejectedValueOnce(new Error("posthog down"));
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await expect(afterHook({ id: "user-1", name: "Alice" })).resolves.toBeUndefined();
    expect(mockCreateOrgForUser).toHaveBeenCalledOnce();
  });

  it("does not emit trial_started on the invite-signup bootstrap-skip path", async () => {
    mockCheckInvite.mockResolvedValueOnce({ valid: true, role: "viewer", email: null });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: { body: { callbackURL: string } },
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await afterHook(
      { id: "user-1", name: "Alice", email: "alice@example.org" },
      { body: { callbackURL: "/invite/invite-token-1" } },
    );

    expect(mockCreateOrgForUser).not.toHaveBeenCalled();
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
  });

  it("skips personal org bootstrap when signup has a valid shareable invite callback", async () => {
    mockCheckInvite.mockResolvedValueOnce({
      valid: true,
      role: "viewer",
      email: null,
    });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: { body: { callbackURL: string } },
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await afterHook(
      { id: "user-1", name: "Alice", email: "alice@example.org" },
      { body: { callbackURL: "/invite/invite-token-1" } },
    );

    expect(mockCheckInvite).toHaveBeenCalledWith(fakeDb, { token: "invite-token-1" });
    expect(mockCreateOrgForUser).not.toHaveBeenCalled();
  });

  it("skips personal org bootstrap when signup callback uses the app invite route", async () => {
    mockCheckInvite.mockResolvedValueOnce({
      valid: true,
      role: "viewer",
      email: null,
    });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: { body: { callbackURL: string } },
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await afterHook(
      { id: "user-1", name: "Alice", email: "alice@example.org" },
      { body: { callbackURL: "/app/invite/app-invite-token-1" } },
    );

    expect(mockCheckInvite).toHaveBeenCalledWith(fakeDb, { token: "app-invite-token-1" });
    expect(mockCreateOrgForUser).not.toHaveBeenCalled();
  });

  it("creates a personal org when an email invite callback belongs to another email", async () => {
    mockCheckInvite.mockResolvedValueOnce({
      valid: true,
      role: "viewer",
      email: "other@example.org",
    });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: { body: { callbackURL: string } },
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    await afterHook(
      { id: "user-1", name: "Alice", email: "alice@example.org" },
      { body: { callbackURL: "/invite/invite-token-1" } },
    );

    expect(mockCreateOrgForUser).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      userName: "Alice",
    });
  });

  it("creates a personal org when the hook context body is not an object", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: unknown,
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    // body is null — getBodyValue returns undefined, no invite token extracted
    await afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }, { body: null });

    expect(mockCreateOrgForUser).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      userName: "Alice",
    });
  });

  it("creates a personal org when callbackURL cannot be parsed as a URL", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: {
            after: (
              user: { id: string; name: string; email: string },
              ctx: { body: { callbackURL: string } },
            ) => Promise<void>;
          };
        };
      }
    ).user.create.after;

    // callbackURL that causes URL parsing to throw (invalid IPv6 literal)
    await afterHook(
      { id: "user-1", name: "Alice", email: "alice@example.org" },
      { body: { callbackURL: "http://[invalid" } },
    );

    expect(mockCreateOrgForUser).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      userName: "Alice",
    });
  });

  it("captures internal Better Auth API errors in Sentry with correlation metadata", async () => {
    createAuth(fakeDb, {
      ...fakeEnv,
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "2026.04.22",
    });

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { status: number; code: string; message: string },
          ctx: { path: string; request: Request },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "boom",
      },
      {
        path: "/sign-up/email",
        request: new Request("https://app.grantpipe.com/api/auth/better/sign-up/email", {
          method: "POST",
          headers: {
            "cf-ray": "ray-123",
            "x-request-id": "req-123",
          },
        }),
      },
    );

    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.path", "/sign-up/email");
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.method", "POST");
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.status", "500");
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.code", "INTERNAL_SERVER_ERROR");
    expect(mockScopeSetContext).toHaveBeenCalledWith(
      "auth_request",
      expect.objectContaining({
        path: "/sign-up/email",
        method: "POST",
        cfRay: "ray-123",
        requestId: "req-123",
        environment: "production",
        release: "2026.04.22",
      }),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: "better-auth.onAPIError" }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: "/sign-up/email",
        method: "POST",
        cfRay: "ray-123",
        requestId: "req-123",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("does not capture expected 4xx Better Auth errors in Sentry", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { status: number; code: string; message: string },
          ctx: { path: string; request: Request },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        status: 409,
        code: "USER_ALREADY_EXISTS",
        message: "duplicate",
      },
      {
        path: "/sign-up/email",
        request: new Request("https://app.grantpipe.com/api/auth/better/sign-up/email", {
          method: "POST",
        }),
      },
    );

    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("ignores primitive auth errors that do not map to internal auth failures", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (error: string, ctx: { path: string }) => Promise<void>;
      }
    ).onError;

    await onApiError("boom", { path: "/sign-up/email" });

    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("captures internal auth errors identified by statusCode using request fallbacks", async () => {
    createAuth(fakeDb, {
      ...fakeEnv,
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "2026.04.22",
    });

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { statusCode: number; code: string; message: string },
          ctx: { request: Request },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "status code boom",
      },
      {
        request: new Request("https://app.grantpipe.com/api/auth/better/verify-email", {
          method: "GET",
          headers: {
            "cf-request-id": "cf-req-123",
          },
        }),
      },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "status code boom" }),
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: "better-auth.onAPIError" }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: "/api/auth/better/verify-email",
        method: "GET",
        requestId: "cf-req-123",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("captures internal auth errors when Better Auth only provides a string statusCode", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { statusCode: string; message: string },
          ctx: { path: string; method: string },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        statusCode: "INTERNAL_SERVER_ERROR",
        message: "string status code boom",
      },
      {
        path: "/sign-up/email",
        method: "POST",
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: "/sign-up/email",
        method: "POST",
        status: undefined,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("logs internal auth errors when request URL parsing fails and x-correlation-id is used", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (error: { code: string }, ctx: { request: Request }) => Promise<void>;
      }
    ).onError;
    const request = new Request("https://app.grantpipe.com/api/auth/better/sign-up/email", {
      method: "POST",
      headers: {
        "x-correlation-id": "corr-123",
      },
    });
    Object.defineProperty(request, "url", { value: "://bad-url" });

    await onApiError(
      {
        code: "INTERNAL_SERVER_ERROR",
      },
      {
        request,
      },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Unknown auth error" }),
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: "better-auth.onAPIError" }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: undefined,
        method: "POST",
        requestId: "corr-123",
        status: undefined,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("captures internal auth errors when Better Auth exposes a non-Request request object", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { status: number; code: string; message: string },
          ctx: {
            path: string;
            method: string;
            request: { headers: Headers; method: string; url: string };
          },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "plain request object",
      },
      {
        path: "/sign-up/email",
        method: "POST",
        request: {
          url: "https://app.grantpipe.com/api/auth/better/sign-up/email",
          method: "POST",
          headers: new Headers({
            "cf-ray": "ray-like-123",
            "x-correlation-id": "corr-like-123",
          }),
        },
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: "/sign-up/email",
        method: "POST",
        cfRay: "ray-like-123",
        requestId: "corr-like-123",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("captures internal auth errors even when Better Auth omits request context", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { status: number; code: string; message: string },
          ctx: unknown,
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "missing ctx",
      },
      null,
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: undefined,
        method: undefined,
        cfRay: null,
        requestId: null,
        status: 500,
      }),
    );
  });

  it("captures internal auth errors with a null auth code when Better Auth only returns a 5xx status", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: { status: number; message: string },
          ctx: { path: string; request: Request },
        ) => Promise<void>;
      }
    ).onError;

    await onApiError(
      {
        status: 500,
        message: "missing code",
      },
      {
        path: "/sign-up/email",
        request: new Request("https://app.grantpipe.com/api/auth/better/sign-up/email", {
          method: "POST",
        }),
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] Better Auth internal error",
      expect.objectContaining({
        path: "/sign-up/email",
        method: "POST",
        status: 500,
        code: null,
      }),
    );
  });

  it("logs, captures, and rethrows bootstrap failures from createOrgForUser", async () => {
    const bootstrapError = new Error("organization insert failed");
    mockCreateOrgForUser.mockRejectedValueOnce(bootstrapError);
    const { db, execute, transaction } = makeBootstrapCleanupDb();

    createAuth(db, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await expect(afterHook({ id: "user-1", name: "Alice" })).rejects.toThrow(
      "organization insert failed",
    );

    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.stage", "user.create.after");
    expect(mockScopeSetTag).toHaveBeenCalledWith("auth.user_id", "user-1");
    expect(mockCaptureException).toHaveBeenCalledWith(
      bootstrapError,
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: "better-auth.databaseHooks.user.create.after" }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] user bootstrap failed",
      expect.objectContaining({
        userId: "user-1",
        stage: "user.create.after",
      }),
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("reports signup_failed analytics failures while preserving the bootstrap error", async () => {
    const bootstrapError = new Error("organization insert failed");
    const analyticsError = new Error("PostHog unavailable");
    mockCreateOrgForUser.mockRejectedValueOnce(bootstrapError);
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);
    const { db } = makeBootstrapCleanupDb();

    createAuth(db, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await expect(afterHook({ id: "user-1", name: "Alice" })).rejects.toThrow(
      "organization insert failed",
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "auth",
      expect.objectContaining({
        step: "signup_failed_analytics",
        analytics_event: "signup_failed",
      }),
    );
  });

  it("normalizes string bootstrap failures and avoids double-capturing them in onAPIError", async () => {
    mockCreateOrgForUser.mockRejectedValueOnce("organization insert failed");
    const { db } = makeBootstrapCleanupDb();

    createAuth(db, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;
    const onApiError = (
      config.onAPIError as {
        onError: (
          error: Error & { status?: number; code?: string },
          ctx: { path: string; method: string; request: Request },
        ) => Promise<void>;
      }
    ).onError;

    let thrownError: (Error & { status?: number; code?: string }) | undefined;
    try {
      await afterHook({ id: "user-1", name: "Alice" });
    } catch (error) {
      thrownError = error as Error & { status?: number; code?: string };
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError?.message).toBe("organization insert failed");

    if (!thrownError) {
      throw new Error("Expected bootstrap error");
    }

    thrownError.status = 500;
    thrownError.code = "INTERNAL_SERVER_ERROR";

    await onApiError(thrownError, {
      path: "/sign-up/email",
      method: "POST",
      request: new Request("https://app.grantpipe.com/api/auth/better/sign-up/email", {
        method: "POST",
        headers: {
          "x-request-id": "req-456",
        },
      }),
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      "[auth] Better Auth internal error",
      expect.objectContaining({
        stage: "user.create.after",
        userId: "user-1",
        path: "/sign-up/email",
        method: "POST",
        requestId: "req-456",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  it("logs and captures cleanup failures without hiding the original bootstrap error", async () => {
    const bootstrapError = new Error("organization insert failed");
    const cleanupError = new Error("cleanup failed");
    mockCreateOrgForUser.mockRejectedValueOnce(bootstrapError);
    const transaction = vi.fn(async () => {
      throw cleanupError;
    });

    createAuth({ transaction } as unknown as Database, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: { create: { after: (user: { id: string; name: string }) => Promise<void> } };
      }
    ).user.create.after;

    await expect(afterHook({ id: "user-1", name: "Alice" })).rejects.toThrow(
      "organization insert failed",
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      cleanupError,
      expect.objectContaining({
        mechanism: expect.objectContaining({
          type: "better-auth.databaseHooks.user.create.after.cleanup",
        }),
      }),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      bootstrapError,
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: "better-auth.databaseHooks.user.create.after" }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] user bootstrap cleanup failed",
      expect.objectContaining({
        userId: "user-1",
        stage: "user.create.after.cleanup",
      }),
    );
  });

  it("does not emit a server-side signup_completed analytics event on the success path", async () => {
    // signup_completed is emitted client-side (user-keyed, with method + UTM
    // attribution). The server hook must not duplicate it with an org-keyed,
    // attribution-less copy. trial_started and the Sequencer call stay.
    mockCreateOrgForUser.mockResolvedValueOnce({ id: "org-42" });
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: { after: (user: { id: string; name: string; email: string }) => Promise<void> };
        };
      }
    ).user.create.after;

    await afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" });

    expect(mockAnalyticsCapture).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "signup_completed" }),
    );
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-42", eventName: "trial_started" }),
    );
    expect(mockRecordSignupCompleted).toHaveBeenCalledWith(fakeEnv, {
      email: "alice@example.org",
      userId: "user-1",
      orgId: "org-42",
    });
  });

  it("emits a signup_failed analytics event in the bootstrap catch block", async () => {
    const bootstrapError = new Error("org insert failed");
    mockCreateOrgForUser.mockRejectedValueOnce(bootstrapError);
    const { db } = makeBootstrapCleanupDb();

    createAuth(db, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: { after: (user: { id: string; name: string; email: string }) => Promise<void> };
        };
      }
    ).user.create.after;

    await expect(
      afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }),
    ).rejects.toThrow("org insert failed");

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "signup_failed",
        payload: expect.objectContaining({ environment: "production" }),
      }),
    );
  });

  it("does not break bootstrap failure handling when signup_failed capture rejects", async () => {
    const bootstrapError = new Error("org insert failed");
    mockCreateOrgForUser.mockRejectedValueOnce(bootstrapError);
    mockAnalyticsCapture.mockRejectedValueOnce(new Error("posthog down"));
    const { db } = makeBootstrapCleanupDb();

    createAuth(db, fakeEnv);

    const config = getBetterAuthConfig();
    const afterHook = (
      config.databaseHooks as {
        user: {
          create: { after: (user: { id: string; name: string; email: string }) => Promise<void> };
        };
      }
    ).user.create.after;

    await expect(
      afterHook({ id: "user-1", name: "Alice", email: "alice@example.org" }),
    ).rejects.toThrow("org insert failed");
  });

  it("configures emailAndPassword.sendResetPassword that calls sendPasswordResetEmail", async () => {
    createAuth(fakeDb, fakeEnv);

    const config = getBetterAuthConfig();
    const emailAndPassword = config.emailAndPassword as {
      sendResetPassword: (
        params: { user: { email: string; name: string }; token: string },
        request: unknown,
      ) => Promise<void>;
    };
    expect(typeof emailAndPassword.sendResetPassword).toBe("function");

    await emailAndPassword.sendResetPassword(
      { user: { email: "user@example.com", name: "Alice" }, token: "tok-xyz" },
      undefined,
    );

    expect(mockSendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({
      env: fakeEnv,
      userEmail: "user@example.com",
      userName: "Alice",
      token: "tok-xyz",
      appUrl: fakeEnv.APP_URL,
    });
  });
});
