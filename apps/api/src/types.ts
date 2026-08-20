import type { DurableObjectNamespace, KVNamespace } from "@cloudflare/workers-types";
import type { Database, ExternalReviewer, ExternalReviewSession } from "@grantpipe/db";
import type {
  EntityPermissionMap,
  EntityRole,
  OnboardingGoal,
  PermissionMap,
  Role,
} from "@grantpipe/shared";
import type { EntityScope } from "./middleware/org-entity-context";

/**
 * Minimal R2 bucket interface. Matches the subset of the Cloudflare Workers
 * `R2Bucket` type used by this codebase. Kept as a local alias rather than
 * importing from `@cloudflare/workers-types` to avoid forcing that dependency
 * on every consumer of this types file.
 */
type R2Binding = {
  put: (
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<{ body: BodyInit | null } | null>;
  delete?: (key: string) => Promise<unknown>;
};

type BrowserRenderingBinding = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type QueueBinding<T> = {
  send: (message: T) => Promise<void>;
};

export type D1PreparedStatementBinding = {
  bind(...values: unknown[]): D1PreparedStatementBinding;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  raw<T = unknown>(): Promise<T[]>;
};

export type D1DatabaseBinding = {
  prepare(query: string): D1PreparedStatementBinding;
  batch(statements: D1PreparedStatementBinding[]): Promise<unknown[]>;
};

export type Bindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
  MARKETING_URL?: string;
  MAINTENANCE_MODE?: "off" | "read_only";
  INTEGRATION_MODE?: "mock" | "real";
  DEBUG_MODE?: "true" | "false";
  RESEND_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  FEEDBACK_RECIPIENT_EMAIL?: string;
  LEAD_UNSUBSCRIBE_SECRET?: string;
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
  SEQUENCER_CLIENT_SECRET?: string;
  DOWNLOAD_LINK_SECRET?: string;
  AI_CS_WORKER_ORIGIN?: string;
  AI_CS_CLIENT_ASSERTION_SECRET?: string;
  AI_CS_CONTEXT_SECRET?: string;
  PORTAL_TOKEN_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  STRIPE_PRICE_STARTER_MONTHLY?: string;
  STRIPE_PRICE_STARTER_ANNUAL?: string;
  STRIPE_PRICE_GROWTH_MONTHLY?: string;
  STRIPE_PRICE_GROWTH_ANNUAL?: string;
  STRIPE_PRICE_AUDIT_READY_MONTHLY?: string;
  STRIPE_PRICE_AUDIT_READY_ANNUAL?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  R2?: R2Binding;
  AWARD_INTAKE_QUEUE?: QueueBinding<{ extractionId: string; orgId: string }>;
  BROWSER_RENDERING?: BrowserRenderingBinding;
  AUTH_RATE_LIMITER?: DurableObjectNamespace;
  RATE_LIMIT_KV?: KVNamespace;
  MARKETING_DB?: D1DatabaseBinding;
  HYPERDRIVE?: { connectionString: string };
  CUTOVER_DB_HEALTH_ENABLED?: string;
  CUTOVER_DB_HEALTH_SECRET?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
};

export type Variables = {
  db: Database;
  user: { id: string; email: string; name: string } | null;
  session: { id: string; userId: string } | null;
  orgId: string | null;
  orgMemberId: string | null;
  memberRole: Role | null;
  memberPermissions: PermissionMap | null;
  entityId: string | null;
  entityScope: EntityScope | null;
  entityRole: EntityRole | null;
  entityPermissions: EntityPermissionMap | null;
  orgSubscription: {
    subscriptionStatus: string | null;
    trialEndsAt: Date | null;
    planTier: string | null;
    effectivePlanTier?: string | null;
    onboardingCompleted: boolean;
    onboardingGoal?: OnboardingGoal | null;
    planSelectedAt: Date | null;
    stripeSubscriptionId: string | null;
    defaultEntityId?: string | null;
  } | null;
  // Portal reviewer context — set by portalReviewerMiddleware
  portalSessionId: string | null;
  portalReviewerId: string | null;
  portalOrgId: string | null;
  portalSession: ExternalReviewSession | null;
  portalReviewer: ExternalReviewer | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
