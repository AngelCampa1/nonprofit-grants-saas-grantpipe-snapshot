import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as Sentry from "@sentry/cloudflare";
import { sql } from "drizzle-orm";
import type { Database } from "@grantpipe/db";
import * as schema from "@grantpipe/db";
import type { Bindings } from "../types";
import { checkInvite, createOrgForUser } from "../domains/auth/service";
import { recordSignupCompleted } from "../domains/leads/sequencer";
import { sendPasswordResetEmail } from "./password-reset-email";
import { getIntegrations } from "./integrations";
import { captureBackgroundException } from "./sentry";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

function analyticsEnvironment(env: Bindings): string {
  if (env.SENTRY_ENVIRONMENT) return env.SENTRY_ENVIRONMENT;
  return env.APP_URL.includes("app.grantpipe.com") ? "production" : "development";
}

type AuthErrorMetadata = {
  stage?: string;
  userId?: string;
  path?: string;
  method?: string;
  cfRay?: string | null;
  requestId?: string | null;
  environment?: string;
  release?: string;
  status?: number;
  code?: string | null;
};

type HeaderReader = {
  get(name: string): string | null;
};

type AuthRequestLike = {
  headers?: HeaderReader;
  method?: string;
  url?: string;
};

const AUTH_ERROR_METADATA_KEY = "__grantpipeAuthErrorMetadata";
const AUTH_ERROR_CAPTURED_KEY = "__grantpipeAuthErrorCaptured";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (isObject(value)) {
    const message = getString(value.message);
    if (message) return new Error(message);
  }
  return new Error(typeof value === "string" ? value : "Unknown auth error");
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isObject(error)) return undefined;

  const directStatus = getNumber(error.status);
  if (directStatus !== undefined) return directStatus;

  const directStatusCode = getNumber(error.statusCode);
  if (directStatusCode !== undefined) return directStatusCode;

  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (!isObject(error)) return undefined;

  return getString(error.code) ?? getString(error.statusCode);
}

function shouldCaptureAuthError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);

  return status !== undefined ? status >= 500 : code === "INTERNAL_SERVER_ERROR";
}

function hasHeaderReader(value: unknown): value is HeaderReader {
  return isObject(value) && typeof value.get === "function";
}

function getRequestFromContext(context: unknown): AuthRequestLike | undefined {
  if (!isObject(context)) return undefined;

  const request = context.request;
  if (request instanceof Request) return request;
  if (!isObject(request)) return undefined;

  return {
    url: getString(request.url),
    method: getString(request.method),
    headers: hasHeaderReader(request.headers) ? request.headers : undefined,
  };
}

function getPathFromContext(
  context: unknown,
  request: AuthRequestLike | undefined,
): string | undefined {
  if (isObject(context)) {
    const path = getString(context.path);
    if (path) return path;
  }

  if (!request?.url) return undefined;

  try {
    return new URL(request.url).pathname;
  } catch {
    return undefined;
  }
}

function getMethodFromContext(
  context: unknown,
  request: AuthRequestLike | undefined,
): string | undefined {
  if (isObject(context)) {
    const method = getString(context.method);
    if (method) return method;
  }

  return request?.method;
}

function getHeader(request: AuthRequestLike | undefined, name: string): string | null {
  return request?.headers?.get(name) ?? null;
}

function getRequestId(request: AuthRequestLike | undefined): string | null {
  return (
    getHeader(request, "x-request-id") ??
    getHeader(request, "cf-request-id") ??
    getHeader(request, "x-correlation-id")
  );
}

function getStoredAuthErrorMetadata(error: unknown): Partial<AuthErrorMetadata> {
  if (!isObject(error)) return {};

  const metadata = error[AUTH_ERROR_METADATA_KEY];
  return isObject(metadata) ? (metadata as Partial<AuthErrorMetadata>) : {};
}

function getBodyValue(context: unknown, key: string): unknown {
  if (!isObject(context)) return undefined;

  const body = context.body;
  if (isObject(body)) return body[key];

  return undefined;
}

function getInviteTokenFromAuthContext(context: unknown): string | null {
  const callbackURL =
    getString(getBodyValue(context, "callbackURL")) ??
    getString(getBodyValue(context, "callbackUrl"));

  if (!callbackURL) return null;

  try {
    const parsed = new URL(callbackURL, "https://app.grantpipe.local");
    const prefix = parsed.pathname.startsWith("/app/invite/") ? "/app/invite/" : "/invite/";
    if (!parsed.pathname.startsWith(prefix)) return null;

    const token = parsed.pathname.slice(prefix.length).split("/")[0];
    return token ? decodeURIComponent(token) : null;
  } catch {
    return null;
  }
}

async function shouldSkipBootstrapForInviteSignup(
  db: Database,
  context: unknown,
  userEmail: string,
) {
  const token = getInviteTokenFromAuthContext(context);
  if (!token) return false;

  const invite = await checkInvite(db, { token });
  if (!invite.valid) return false;

  const inviteEmail = invite.email?.trim().toLowerCase();
  if (!inviteEmail) return true;

  return inviteEmail === userEmail.trim().toLowerCase();
}

function storeAuthErrorMetadata(error: Error, metadata: Partial<AuthErrorMetadata>) {
  const target = error as Error & {
    [AUTH_ERROR_METADATA_KEY]?: Partial<AuthErrorMetadata>;
  };
  target[AUTH_ERROR_METADATA_KEY] = {
    ...target[AUTH_ERROR_METADATA_KEY],
    ...metadata,
  };
}

function wasAuthErrorCaptured(error: unknown): boolean {
  if (!isObject(error)) return false;

  return error[AUTH_ERROR_CAPTURED_KEY] === true;
}

function markAuthErrorCaptured(error: Error) {
  const target = error as Error & {
    [AUTH_ERROR_CAPTURED_KEY]?: boolean;
  };
  target[AUTH_ERROR_CAPTURED_KEY] = true;
}

function buildAuthErrorMetadata(
  error: unknown,
  context: unknown,
  env: Bindings,
): AuthErrorMetadata {
  const request = getRequestFromContext(context);
  const storedMetadata = getStoredAuthErrorMetadata(error);

  return {
    ...storedMetadata,
    path: storedMetadata.path ?? getPathFromContext(context, request),
    method: storedMetadata.method ?? getMethodFromContext(context, request),
    cfRay: storedMetadata.cfRay ?? getHeader(request, "cf-ray"),
    requestId: storedMetadata.requestId ?? getRequestId(request),
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    release: env.SENTRY_RELEASE ?? "unknown",
    status: storedMetadata.status ?? getErrorStatus(error),
    code: storedMetadata.code ?? getErrorCode(error) ?? null,
  };
}

function captureAuthException(error: Error, metadata: AuthErrorMetadata, mechanismType: string) {
  Sentry.withScope((scope) => {
    if (metadata.stage) scope.setTag("auth.stage", metadata.stage);
    if (metadata.userId) scope.setTag("auth.user_id", metadata.userId);
    if (metadata.path) scope.setTag("auth.path", metadata.path);
    if (metadata.method) scope.setTag("auth.method", metadata.method);
    if (metadata.status !== undefined) scope.setTag("auth.status", String(metadata.status));
    if (metadata.code) scope.setTag("auth.code", metadata.code);
    scope.setContext("auth_request", metadata);
    Sentry.captureException(error, {
      mechanism: {
        handled: true,
        type: mechanismType,
      },
    });
  });
}

function reportSequencerSignupFailure(error: unknown, env: Bindings, userId: string) {
  const normalizedError = toError(error);
  const metadata: AuthErrorMetadata = {
    stage: "user.create.after.sequencer-signup",
    userId,
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    release: env.SENTRY_RELEASE ?? "unknown",
  };

  console.error("[auth] sequencer signup event failed", {
    ...metadata,
    error: "Sequencer signup event failed",
  });

  const sanitizedError = new Error("Sequencer signup event failed");
  sanitizedError.name = normalizedError.name;
  try {
    captureBackgroundException(sanitizedError, "auth", {
      stage: "user.create.after.sequencer-signup",
      user_id: userId,
    });
  } catch {
    // Telemetry failures must not break signup.
  }
}

function reportAuthApiError(error: unknown, context: unknown, env: Bindings) {
  if (!shouldCaptureAuthError(error)) return;

  const normalizedError = toError(error);
  const metadata = buildAuthErrorMetadata(error, context, env);
  storeAuthErrorMetadata(normalizedError, metadata);

  console.error("[auth] Better Auth internal error", metadata);

  if (wasAuthErrorCaptured(normalizedError)) return;

  captureAuthException(normalizedError, metadata, "better-auth.onAPIError");
}

function reportBootstrapFailure(error: unknown, env: Bindings, userId: string): Error {
  const normalizedError = toError(error);
  const metadata: AuthErrorMetadata = {
    stage: "user.create.after",
    userId,
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    release: env.SENTRY_RELEASE ?? "unknown",
  };

  storeAuthErrorMetadata(normalizedError, metadata);

  console.error("[auth] user bootstrap failed", metadata);

  captureAuthException(normalizedError, metadata, "better-auth.databaseHooks.user.create.after");
  markAuthErrorCaptured(normalizedError);

  return normalizedError;
}

async function cleanupBootstrapUserArtifacts(db: Database, env: Bindings, userId: string) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from "session" where "user_id" = ${userId}`);
      await tx.execute(sql`delete from "account" where "user_id" = ${userId}`);
      await tx.execute(sql`delete from "user" where "id" = ${userId}`);
    });
  } catch (error) {
    const normalizedError = toError(error);
    const metadata: AuthErrorMetadata = {
      stage: "user.create.after.cleanup",
      userId,
      environment: env.SENTRY_ENVIRONMENT ?? "development",
      release: env.SENTRY_RELEASE ?? "unknown",
    };

    console.error("[auth] user bootstrap cleanup failed", metadata);
    captureAuthException(
      normalizedError,
      metadata,
      "better-auth.databaseHooks.user.create.after.cleanup",
    );
  }
}

export function createAuth(db: Database, env: Bindings) {
  // In mock/dev mode accept any localhost port so the Vite dev server port
  // doesn't have to exactly match APP_URL (which is fixed in wrangler.toml).
  const extraTrustedOrigins =
    env.INTEGRATION_MODE === "mock"
      ? [
          ...Array.from({ length: 20 }, (_, i) => `http://localhost:${5173 + i}`),
          "http://localhost:3050",
        ]
      : [];

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    basePath: "/api/auth/better",
    trustedOrigins: [env.APP_URL, ...extraTrustedOrigins],
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, token }, _request) => {
        await sendPasswordResetEmail({
          env,
          userEmail: user.email,
          userName: user.name,
          token,
          appUrl: env.APP_URL,
        });
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: {
      storeStateStrategy: "cookie",
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https://"),
      defaultCookieAttributes: env.APP_URL.startsWith("https://")
        ? { sameSite: "lax" as const, secure: true, httpOnly: true }
        : undefined,
    },
    onAPIError: {
      onError: async (error, ctx) => {
        reportAuthApiError(error, ctx, env);
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
            try {
              if (
                await shouldSkipBootstrapForInviteSignup(
                  db,
                  ctx,
                  typeof user.email === "string" ? user.email : "",
                )
              ) {
                return;
              }
              const createdOrg = await createOrgForUser(db, {
                userId: user.id,
                userName: user.name,
              });
              await getIntegrations(db, env)
                .analytics.capture({
                  orgId: createdOrg.id,
                  eventName: ANALYTICS_EVENTS.trialStarted,
                  payload: {
                    subscription_status: "trialing",
                    environment: analyticsEnvironment(env),
                  },
                })
                .catch((error: unknown) => {
                  captureBackgroundException(error, "auth", {
                    step: "trial_started_analytics",
                    analytics_event: ANALYTICS_EVENTS.trialStarted,
                  });
                });
              // signup_completed is emitted client-side only (apps/web signup
              // flow), where it is user-keyed and carries the signup method plus
              // UTM / first-touch attribution. Emitting it here too would
              // double-count it and pollute attribution with an org-keyed,
              // method-less copy, so the server hook deliberately does not fire it.
              if (typeof user.email === "string" && user.email.trim().length > 0) {
                await recordSignupCompleted(env, {
                  email: user.email,
                  userId: user.id,
                  orgId: createdOrg.id,
                }).catch((error: unknown) => reportSequencerSignupFailure(error, env, user.id));
              }
            } catch (error) {
              await getIntegrations(db, env)
                .analytics.capture({
                  eventName: ANALYTICS_EVENTS.signupFailed,
                  payload: {
                    environment: analyticsEnvironment(env),
                  },
                })
                .catch((captureError: unknown) => {
                  captureBackgroundException(captureError, "auth", {
                    step: "signup_failed_analytics",
                    analytics_event: ANALYTICS_EVENTS.signupFailed,
                  });
                });
              await cleanupBootstrapUserArtifacts(db, env, user.id);
              throw reportBootstrapFailure(error, env, user.id);
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
