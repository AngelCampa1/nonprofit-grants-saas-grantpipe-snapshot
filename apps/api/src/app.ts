import { Hono } from "hono";
import { cors } from "hono/cors";
import { withSentry } from "@sentry/cloudflare";
import { createDbHandle, organizations } from "@grantpipe/db";
import { eq, sql } from "drizzle-orm";
import { createAuth } from "./lib/auth";
import {
  authMemoryFallback,
  checkAuthRateLimit,
  checkRateLimit,
  classifyAuthRateLimit,
  createDurableObjectAuthRateLimitStore,
  hashRateLimitIdentity,
  reportMissingAuthRateLimiter,
  shouldBypassAuthRateLimit,
} from "./lib/auth-rate-limit";
import {
  captureAuthServerError,
  captureBackgroundException,
  captureScheduledException,
  createSentryOptions,
  runScheduledJob,
} from "./lib/sentry";
import { errorHandler } from "./middleware/error-handler";
import { isReadOnlyMaintenanceMode, maintenanceMode } from "./middleware/maintenance-mode";
import { orgEntityContextMiddleware } from "./middleware/org-entity-context";
import { getSessionWithRetry } from "./middleware/session";
import { securityHeaders } from "./middleware/security-headers";
import { healthRoutes } from "./domains/health/routes";
import {
  accountRoutes,
  authRoutes,
  inviteAcceptanceRoutes,
  publicInviteRoutes,
} from "./domains/auth/routes";
import { activityRoutes } from "./domains/activity/routes";
import { onboardingRoutes } from "./domains/onboarding/routes";
import { donorRoutes } from "./domains/donors/routes";
import { eventRoutes } from "./domains/events/routes";
import { grantRoutes } from "./domains/grants/routes";
import { programRoutes } from "./domains/programs/routes";
import { complianceRoutes } from "./domains/compliance/routes";
import { recoverPendingComplianceArtifacts } from "./domains/compliance/recovery.service";
import { documentRoutes } from "./domains/documents/routes";
import { importRoutes } from "./domains/import/routes";
import { accountingRoutes } from "./domains/accounting/routes";
import { accountingIntegrationRoutes } from "./domains/accounting-integrations/routes";
import { notificationRoutes } from "./domains/notifications/routes";
import { overviewRoutes } from "./domains/overview/routes";
import { deadlineRoutes } from "./domains/deadlines/routes";
import { orgRoutes } from "./domains/org/routes";
import { feedbackRoutes, publicFeedbackRoutes } from "./domains/feedback/routes";
import { helpRoutes } from "./domains/help/routes";
import { publicLeadsRoutes } from "./domains/leads/routes";
import { downloadsRoutes } from "./domains/downloads/routes";
import { restrictionRoutes } from "./domains/restrictions/routes";
import { externalReviewersRoutes, portalRoutes } from "./domains/external-reviewers/routes";
import { paymentRoutes } from "./domains/payments/routes";
import { documentExtractionRoutes } from "./domains/document-extractions/routes";
import { subrecipientRoutes } from "./domains/subrecipients/routes";
import { pledgeRoutes } from "./domains/pledges/routes";
import { allocationRoutes } from "./domains/allocation/routes";
import { reportBuilderRoutes } from "./domains/report-builder/routes";
import { recoverPendingCustomReports } from "./domains/report-builder/service";
import { dispatchPendingReportReadyEffects } from "./domains/report-builder/ready-effects";
import { recoverPendingRestrictedRollforwards } from "./domains/restrictions/service";
import { ledgerAssistantRoutes } from "./domains/ledger-assistant/routes";
import { outcomeRoutes } from "./domains/outcomes/routes";
import { draftingAssistantRoutes } from "./domains/drafting-assistant/routes";
import { sampleDataRoutes } from "./domains/sample-data/routes";
import { processAwardIntakeQueue } from "./domains/document-extractions/queue";
import { redispatchPendingAwardIntakes } from "./domains/document-extractions/service";
import { runTrialEmailTick, runTrialWrapupDiscoveryTick } from "./domains/trial-emails/service";
import { runTrialExpiryTick } from "./domains/trial-emails/trial-expiry";
import { billingWebhookRoutes } from "./domains/billing/webhooks";
import { billingRoutes } from "./domains/billing/routes";
import { publicMarketingRoutes } from "./domains/public/routes";
import { aiCsRoutes } from "./domains/ai-cs/routes";
import { aiCsContextRoutes } from "./domains/ai-cs/context-routes";
import { requireActiveBilling, requirePlanTier } from "./middleware/paywall";
import {
  checkGrantSpendDownThresholds,
  sendScheduledGrantDeadlineReminders,
} from "./domains/notifications/reminders";
import { scanDonorLapseAlerts } from "./domains/notifications/lapse-alerts";
import { scanBudgetSentinelAlerts } from "./domains/notifications/sentinel-alerts";
import { scanAccountingAnomalies } from "./domains/notifications/anomaly-alerts";
import { dispatchPendingNotificationEmails } from "./domains/notifications/email-delivery";
import {
  scanPledgeInstallmentAlerts,
  PLEDGE_ALERT_JOB,
} from "./domains/notifications/pledge-alerts";
import { tickRecurring } from "./domains/accounting/recurringService";
import type { AppEnv } from "./types";
import { type OnboardingGoal } from "@grantpipe/shared";
import type { Database } from "@grantpipe/db";
import { isMissingColumnError } from "./lib/db-errors";
import { isRetryableScheduledDbError, withDbRetry } from "./lib/db-retry";
import { getEffectiveOrgPlanTier } from "./lib/effective-plan-tier";
import { redispatchPendingInvitations } from "./domains/external-reviewers/invitation-delivery.service";
import { redispatchPendingLeadDeliveries } from "./domains/leads/delivery.service";
import { jsonBodyLimit } from "./middleware/json-body-limit";

type OrgSubscriptionContext = Omit<
  NonNullable<AppEnv["Variables"]["orgSubscription"]>,
  "defaultEntityId"
> & {
  defaultEntityId: string | null;
};

const SCHEDULED_PRE_WARM_BACKOFF_MS = [250, 750, 2_000, 4_000, 8_000];
const PUBLIC_AUTH_MAX_BODY_BYTES = 16_384;

async function preWarmPostgresHandle(db: Database): Promise<void> {
  await withDbRetry(() => db.execute(sql`select 1`), {
    backoffMs: SCHEDULED_PRE_WARM_BACKOFF_MS,
    isRetryable: isRetryableScheduledDbError,
  });
}

function parseDbDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type LegacyOrgSubscriptionRow = Omit<
  OrgSubscriptionContext,
  "trialEndsAt" | "planSelectedAt" | "effectivePlanTier"
> & {
  trialEndsAt: Date | string | null;
  planSelectedAt: Date | string | null;
};

async function findLegacyOrgSubscription(
  db: Database,
  orgId: string,
): Promise<LegacyOrgSubscriptionRow | null> {
  try {
    const result = await db.execute<LegacyOrgSubscriptionRow>(sql`
      SELECT
        "subscription_status" as "subscriptionStatus",
        "trial_ends_at" as "trialEndsAt",
        "plan_tier" as "planTier",
        "onboarding_completed" as "onboardingCompleted",
        "stripe_subscription_id" as "stripeSubscriptionId",
        "default_entity_id" as "defaultEntityId",
        COALESCE("updated_at", "created_at", now()) as "planSelectedAt"
      FROM "organizations"
      WHERE "id" = ${orgId}
      LIMIT 1
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingColumnError(error, "default_entity_id")) {
      throw error;
    }
  }

  const result = await db.execute<Omit<LegacyOrgSubscriptionRow, "defaultEntityId">>(sql`
    SELECT
      "subscription_status" as "subscriptionStatus",
      "trial_ends_at" as "trialEndsAt",
      "plan_tier" as "planTier",
      "onboarding_completed" as "onboardingCompleted",
      "stripe_subscription_id" as "stripeSubscriptionId",
      COALESCE("updated_at", "created_at", now()) as "planSelectedAt"
    FROM "organizations"
    WHERE "id" = ${orgId}
    LIMIT 1
  `);
  const rows = Array.isArray(result) ? result : result.rows;
  const row = rows[0];

  return row ? { ...row, defaultEntityId: null } : null;
}

async function findOrgSubscription(
  db: Database,
  orgId: string,
): Promise<OrgSubscriptionContext | null> {
  try {
    const org =
      (await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          subscriptionStatus: true,
          trialEndsAt: true,
          planTier: true,
          onboardingCompleted: true,
          onboardingGoal: true,
          planSelectedAt: true,
          stripeSubscriptionId: true,
          defaultEntityId: true,
        },
      })) ?? null;

    return org
      ? {
          ...org,
          effectivePlanTier: getEffectiveOrgPlanTier(org),
          // onboarding_goal is a plain text column; values are written only
          // through the Zod-validated onboarding PATCH, so narrowing the
          // stored string to the OnboardingGoal union here is safe.
          onboardingGoal: (org.onboardingGoal ?? null) as OnboardingGoal | null,
        }
      : null;
  } catch (error) {
    if (!isMissingColumnError(error, "plan_selected_at")) {
      throw error;
    }

    console.error("[org] Falling back without plan_selected_at", { orgId });
    const row = await findLegacyOrgSubscription(db, orgId);

    if (!row) {
      return null;
    }

    return {
      subscriptionStatus: row.subscriptionStatus,
      trialEndsAt: parseDbDate(row.trialEndsAt),
      planTier: row.planTier,
      effectivePlanTier: getEffectiveOrgPlanTier({
        subscriptionStatus: row.subscriptionStatus,
        trialEndsAt: parseDbDate(row.trialEndsAt),
        planTier: row.planTier,
      }),
      onboardingCompleted: row.onboardingCompleted,
      stripeSubscriptionId: row.stripeSubscriptionId,
      planSelectedAt: parseDbDate(row.planSelectedAt),
      defaultEntityId: row.defaultEntityId,
    };
  }
}

function getAuthResponseRequestId(request: Request): string | null {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("cf-request-id") ??
    request.headers.get("x-correlation-id")
  );
}

// A malformed JSON request body is a client error (400), not a server outage.
// Better Auth surfaces an unparseable JSON body as an unhandled SyntaxError and
// returns a 500, which then trips `captureAuthServerError` and pages Sentry with
// a false "auth outage". Curl-based probes and scanners hit the public
// `/auth/better/*` endpoints with garbage bodies constantly, so we validate the
// JSON ourselves and short-circuit before the Better Auth handler ever sees it.
async function hasMalformedJsonBody(request: Request): Promise<boolean> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return false;

  let raw: string;
  try {
    // Clone so the original request stream stays intact for the auth handler.
    raw = await request.clone().text();
  } catch {
    return false;
  }

  // An empty/whitespace body with an application/json content-type is itself
  // malformed: `JSON.parse("")` throws "Unexpected end of JSON input", which
  // Better Auth surfaces as a 500. The Better Auth client always sends a real
  // JSON body for its POST actions (sign-out posts `{}`), so a json-typed
  // empty body only ever comes from a scanner/probe — reject it as a 400.
  try {
    JSON.parse(raw);
    return false;
  } catch {
    return true;
  }
}

async function getAuthRequestEmail(request: Request): Promise<string | null> {
  try {
    const input = (await request.clone().json()) as { email?: unknown };
    return typeof input.email === "string" && input.email.trim() ? input.email : null;
  } catch {
    return null;
  }
}

async function logAuthServerResponse(
  request: Request,
  response: Response,
  env: AppEnv["Bindings"],
) {
  if (response.status < 500) return;

  let code: string | null = null;

  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.clone().json()) as { code?: string };
      code = typeof body.code === "string" ? body.code : null;
    }
  } catch {
    code = null;
  }

  const path = new URL(request.url).pathname;
  const requestId = getAuthResponseRequestId(request);

  console.error("[auth] Better Auth 5xx response", {
    path,
    method: request.method,
    cfRay: request.headers.get("cf-ray"),
    requestId,
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    release: env.SENTRY_RELEASE ?? "unknown",
    status: response.status,
    code,
  });

  // Surface auth 5xx failures to Sentry so sign-up/sign-in outages are not
  // confined to console logs that no one watches.
  captureAuthServerError({
    path,
    method: request.method,
    status: response.status,
    code,
    requestId,
  });
}

const app = new Hono<AppEnv>()
  .basePath("/api")
  .onError(errorHandler)
  .use("*", securityHeaders())
  // CORS — allow the web app and marketing site origins, credentials required for cookies
  .use("*", async (c, next) => {
    const origins = [c.env.APP_URL, c.env.MARKETING_URL].filter(Boolean) as string[];
    if (c.env.MARKETING_URL) {
      try {
        const parsed = new URL(c.env.MARKETING_URL);
        origins.push(`${parsed.protocol}//www.${parsed.hostname}`);
      } catch {
        // ignore malformed MARKETING_URL
      }
    }
    const corsMiddleware = cors({ origin: origins, credentials: true });
    return corsMiddleware(c, next);
  })
  .use("*", maintenanceMode())
  // DB init — create db from DATABASE_URL and attach to context.
  // Skip connection setup for public paths that never touch the DB so they
  // do not pay the TLS + Postgres handshake on every request. These paths
  // are explicitly DB-free: the health probe and the signed R2 download
  // handler (which only checks the HMAC token and streams from R2).
  .use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (
      path === "/api/health" ||
      path.startsWith("/api/public/downloads/") ||
      path.startsWith("/api/public/leads") ||
      path.startsWith("/api/public/marketing")
    ) {
      return next();
    }

    const dbHandle = await createDbHandle(c.env.DATABASE_URL, c.env.HYPERDRIVE);
    c.set("db", dbHandle.db);
    try {
      await next();
    } finally {
      await dbHandle.close();
    }
  })
  // Public routes (no auth required)
  .route("/health", healthRoutes)
  .on(["POST", "GET"], "/auth/better/*", jsonBodyLimit(PUBLIC_AUTH_MAX_BODY_BYTES), async (c) => {
    // IP-keyed throttle in front of the public Better Auth handler. Better Auth's
    // built-in rate limiter uses in-memory storage that does not survive across
    // Cloudflare Worker isolates. Production uses one strongly consistent
    // Durable Object per counter; local development keeps the in-memory fallback.
    const kind = classifyAuthRateLimit(c.req.method, c.req.path);
    if (kind && !shouldBypassAuthRateLimit(c.env)) {
      const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
      if (!c.env.AUTH_RATE_LIMITER && c.env.INTEGRATION_MODE === "real") {
        reportMissingAuthRateLimiter(() => {
          captureBackgroundException(
            new Error("AUTH_RATE_LIMITER is missing in production"),
            "auth-rate-limit",
            { kind, reason: "missing_production_binding" },
          );
        });
      }
      const store = c.env.AUTH_RATE_LIMITER
        ? createDurableObjectAuthRateLimitStore(c.env.AUTH_RATE_LIMITER)
        : authMemoryFallback;
      if (
        !(await checkAuthRateLimit(store, ip, kind, (error) => {
          captureBackgroundException(error, "auth-rate-limit", { kind });
        }))
      ) {
        return c.json({ error: "Too many requests" }, 429);
      }
      if (kind === "sign-up") {
        const email = await getAuthRequestEmail(c.req.raw);
        if (email) {
          const emailIdentity = await hashRateLimitIdentity(email, c.env.BETTER_AUTH_SECRET);
          if (
            !(await checkRateLimit(store, `auth:sign-up-email:${emailIdentity}`, kind, (error) => {
              captureBackgroundException(error, "auth-rate-limit", {
                kind,
                identity: "email",
              });
            }))
          ) {
            return c.json({ error: "Too many requests" }, 429);
          }
        }
      }
    }
    // Reject malformed JSON bodies as a 400 before invoking Better Auth, which
    // would otherwise throw an unhandled SyntaxError and return a noisy 500.
    if (c.req.method === "POST" && (await hasMalformedJsonBody(c.req.raw))) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    const response = await auth.handler(c.req.raw);
    await logAuthServerResponse(c.req.raw, response, c.env);
    return response;
  })
  // Public invite verification — allows unauthenticated invitees to open the
  // invite link and confirm it is valid before signing up / logging in.
  // The accept POST remains authenticated, but it cannot require org membership
  // because first-time invitees have not joined the org yet.
  .route("/auth", publicInviteRoutes)
  // Stripe webhooks — public, signature-verified inside the handler.
  .route("/billing", billingWebhookRoutes)
  // Public feedback endpoint — no auth, IP-rate-limited inside the handler.
  .route("/feedback/public", publicFeedbackRoutes)
  // Public lead-magnet signup + unsubscribe endpoints — no auth, IP-rate-limited.
  .route("/public/leads", publicLeadsRoutes)
  // Public marketing data endpoints — no auth, short-TTL Cache-Control headers.
  .route("/public/marketing", publicMarketingRoutes)
  // AI-CS context endpoint — public but HMAC-verified. The Ventora AI-CS Worker
  // calls this server-to-server before answering support questions. It must be
  // mounted before the session middleware so it is not gated by a user cookie.
  .route("/ai-cs", aiCsContextRoutes)
  // Public signed download links for lead magnet PDFs stored in R2.
  .route("/public/downloads", downloadsRoutes)
  // Public portal routes — external reviewer access via HMAC token cookie.
  // MUST be mounted before sessionMiddleware so they are NOT behind Better Auth.
  .route("/public/portal", portalRoutes)
  // Session middleware — validate Better Auth session cookie.
  // Note: middleware/session.ts contains the same logic with injectable dependencies
  // for unit testing. This inline version is used here for direct Hono context access
  // (c.env, c.get/set), which the standalone module cannot replicate without wrapping.
  .use("*", async (c, next) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    const noStoreHeaders = new Headers(c.req.raw.headers);
    noStoreHeaders.set("cache-control", "no-store");
    const session = await getSessionWithRetry(
      (headers) => auth.api.getSession({ headers }),
      noStoreHeaders,
    );
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", session.user);
    c.set("session", {
      id: session.session.id,
      userId: session.session.userId,
    });
    await next();
  })
  // Session-only auth routes — invite acceptance must work before org membership
  // exists, so mount it before the org/entity context middleware below.
  .route("/auth", inviteAcceptanceRoutes)
  .route("/auth", accountRoutes)
  // Org + entity context middleware for authenticated user data routes.
  // X-Org-Id selects the account boundary; X-Entity-Id selects the data boundary.
  .use("*", orgEntityContextMiddleware({ findOrgSubscription }))
  // Protected routes (require valid session + org membership)
  .route("/activity", activityRoutes)
  .route("/auth", authRoutes)
  .route("/onboarding", onboardingRoutes)
  .route("/notifications", notificationRoutes)
  .route("/overview", overviewRoutes)
  .route("/org", orgRoutes)
  .route("/feedback", feedbackRoutes)
  .route("/help", helpRoutes)
  .route("/ai-cs", aiCsRoutes)
  // Billing (trial checkout) — requires session + org but is intentionally
  // NOT behind requireActiveBilling: orgs without a subscription must be
  // able to start the checkout that creates one.
  .route("/billing", billingRoutes)
  // Paywalled routes (require active subscription or trial in addition to session + org)
  // Both the bare collection path and wildcard sub-paths are registered explicitly
  // because Hono's wildcard pattern behaviour can differ across versions.
  .use("/donors", requireActiveBilling())
  .use("/donors/*", requireActiveBilling())
  .use("/events", requireActiveBilling())
  .use("/events/*", requireActiveBilling())
  .use("/grants", requireActiveBilling())
  .use("/grants/*", requireActiveBilling())
  .use("/programs", requireActiveBilling())
  .use("/programs/*", requireActiveBilling())
  .use("/compliance", requireActiveBilling())
  .use("/compliance/*", requireActiveBilling())
  .use("/documents", requireActiveBilling())
  .use("/documents/*", requireActiveBilling())
  .use("/document-extractions", requireActiveBilling())
  .use("/document-extractions/*", requireActiveBilling())
  .use("/import", requireActiveBilling())
  .use("/import/*", requireActiveBilling())
  .use("/accounting", requireActiveBilling())
  .use("/accounting/*", requireActiveBilling())
  .use("/restrictions", requireActiveBilling())
  .use("/restrictions/*", requireActiveBilling())
  .use("/deadlines", requireActiveBilling())
  .use("/deadlines/*", requireActiveBilling())
  // External reviewers (audit_ready plan required)
  .use("/external-reviewers", requireActiveBilling())
  .use("/external-reviewers/*", requireActiveBilling())
  .use("/external-reviewers", requirePlanTier("audit_ready"))
  .use("/external-reviewers/*", requirePlanTier("audit_ready"))
  .use("/payments", requireActiveBilling())
  .use("/payments/*", requireActiveBilling())
  .use("/subrecipients", requireActiveBilling())
  .use("/subrecipients/*", requireActiveBilling())
  .use("/pledges", requireActiveBilling())
  .use("/pledges/*", requireActiveBilling())
  .use("/allocation", requireActiveBilling())
  .use("/allocation/*", requireActiveBilling())
  .use("/report-builder", requireActiveBilling())
  .use("/report-builder/*", requireActiveBilling())
  .use("/ask-ledger", requireActiveBilling())
  .use("/ask-ledger/*", requireActiveBilling())
  .use("/outcomes", requireActiveBilling())
  .use("/outcomes/*", requireActiveBilling())
  .use("/drafting-assistant", requireActiveBilling())
  .use("/drafting-assistant/*", requireActiveBilling())
  .use("/sample-data", requireActiveBilling())
  .use("/sample-data/*", requireActiveBilling())
  .route("/donors", donorRoutes)
  .route("/events", eventRoutes)
  .route("/grants", grantRoutes)
  .route("/programs", programRoutes)
  .route("/compliance", complianceRoutes)
  .route("/documents", documentRoutes)
  .route("/document-extractions", documentExtractionRoutes)
  .route("/import", importRoutes)
  .route("/accounting/integrations", accountingIntegrationRoutes)
  .route("/accounting", accountingRoutes)
  .route("/restrictions", restrictionRoutes)
  .route("/deadlines", deadlineRoutes)
  .route("/external-reviewers", externalReviewersRoutes)
  .route("/payments", paymentRoutes)
  .route("/subrecipients", subrecipientRoutes)
  .route("/pledges", pledgeRoutes)
  .route("/allocation", allocationRoutes)
  .route("/report-builder", reportBuilderRoutes)
  .route("/ask-ledger", ledgerAssistantRoutes)
  .route("/outcomes", outcomeRoutes)
  .route("/drafting-assistant", draftingAssistantRoutes)
  .route("/sample-data", sampleDataRoutes);

export type AppType = typeof app;
export { app };
export { AuthRateLimiter } from "./lib/auth-rate-limit";

const handler = {
  fetch: app.fetch,
  async queue(batch: Parameters<typeof processAwardIntakeQueue>[0], env: AppEnv["Bindings"]) {
    if (isReadOnlyMaintenanceMode(env)) {
      console.warn("[queue] skipped during read-only database maintenance", {
        queue: "award-intake",
      });
      const retryAll =
        "retryAll" in batch && typeof batch.retryAll === "function"
          ? batch.retryAll.bind(batch)
          : undefined;
      if (retryAll) {
        retryAll({ delaySeconds: 300 });
        return;
      }
      throw new Error("Award intake queue is paused for database maintenance.");
    }
    await processAwardIntakeQueue(batch, env);
  },
  async scheduled(controller: { cron: string }, env: AppEnv["Bindings"]) {
    if (isReadOnlyMaintenanceMode(env)) {
      console.warn("[scheduled] skipped during read-only database maintenance", {
        cron: controller.cron,
      });
      return;
    }

    const errors: unknown[] = [];

    // Lead delivery recovery is D1/provider-only. Run it outside the Postgres
    // lifecycle so a Postgres outage cannot strand otherwise deliverable lead
    // magnets. runScheduledJob isolates and reports its own failure while the
    // Postgres-backed jobs continue independently.
    const leadDeliveryResult = runScheduledJob("leads.magnet-delivery", controller.cron, () =>
      redispatchPendingLeadDeliveries(env),
    );

    // One shared DB handle per scheduled invocation. When the production
    // Hyperdrive binding is present, scheduled jobs use the same provider-neutral
    // Postgres path as HTTP requests.
    //
    // The pre-warm below issues one explicit round-trip before the fan-out so
    // connection setup is paid once, not raced. A pre-warm failure is tagged
    // with `job: "pre-warm"` in Sentry to distinguish it from per-job failures.
    // Per-job retry is opt-in via `retryTransient`: only tasks whose entire
    // body is safe to re-execute on a transient Postgres blip set it to true (their
    // writes are guarded by dedupe keys or per-row transactions). Tasks that
    // perform non-idempotent side effects before writing — such as sending
    // email via Resend — must set it to false so a transient DB error after
    // the send does not trigger a duplicate delivery on retry.
    let handle: Awaited<ReturnType<typeof createDbHandle>>;
    try {
      handle = await createDbHandle(env.DATABASE_URL, env.HYPERDRIVE);
    } catch (error) {
      captureScheduledException(error, "database.handle", controller.cron);
      const leadDeliveryError = await leadDeliveryResult;
      if (leadDeliveryError !== null) {
        throw new AggregateError(
          [error, leadDeliveryError],
          "One or more scheduled GrantPipe jobs failed",
          { cause: error },
        );
      }
      throw error;
    }
    try {
      try {
        await preWarmPostgresHandle(handle.db);
      } catch (error) {
        const leadDeliveryError = await leadDeliveryResult;
        if (leadDeliveryError !== null) errors.push(leadDeliveryError);
        captureScheduledException(error, "pre-warm", controller.cron);
        console.error("[scheduled] database.pre-warm failed", {
          cron: controller.cron,
          error: error instanceof Error ? error.message : String(error),
        });
        if (errors.length > 0) {
          throw new AggregateError(
            [...errors, error],
            "One or more scheduled GrantPipe jobs failed",
            { cause: error },
          );
        }
        throw error;
      }

      const scheduledJobs: Array<{
        name: string;
        task: (db: Database) => Promise<void>;
        // When true, the task body is wrapped in withDbRetry so a transient
        // Postgres infrastructure blip on a per-task DB call is absorbed without
        // failing the cron tick. Only safe for tasks whose retryable
        // surface is idempotent (read-only discovery + writes guarded by
        // dedupe keys or per-row transactions).
        retryTransient: boolean;
      }> = [
        {
          name: "notifications.email-delivery",
          task: (db) => dispatchPendingNotificationEmails(db, env),
          retryTransient: true,
        },
        {
          name: "notifications.deadlines",
          task: (db) => sendScheduledGrantDeadlineReminders(db, env, controller.cron),
          retryTransient: true, // notification inserts use dedupeKey + onConflictDoNothing
        },
        {
          name: "notifications.spend-down",
          task: (db) => checkGrantSpendDownThresholds(db, env, controller.cron),
          retryTransient: true, // same dedupeKey + onConflictDoNothing path
        },
        {
          name: "accounting.recurring",
          task: async (db) => {
            await tickRecurring(db);
          },
          retryTransient: true, // discovery select is side-effect-free; per-template work runs in a transaction inside a caught loop
        },
        {
          name: "award-intake.dispatch",
          task: async (db) => {
            await redispatchPendingAwardIntakes(db, env);
          },
          retryTransient: true, // pending discovery is read-only; duplicate queue messages are safely claim-guarded
        },
        {
          name: "report-exports.custom-recovery",
          task: async (db) => {
            await recoverPendingCustomReports(db, env);
          },
          retryTransient: true,
        },
        {
          name: "report-exports.restricted-recovery",
          task: async (db) => {
            await recoverPendingRestrictedRollforwards(db, env);
          },
          retryTransient: true,
        },
        {
          name: "report-exports.compliance-recovery",
          task: async (db) => {
            await recoverPendingComplianceArtifacts(db, env);
          },
          retryTransient: true,
        },
        {
          name: "report-exports.ready-effects",
          task: async (db) => {
            await dispatchPendingReportReadyEffects(db, env);
          },
          retryTransient: true, // deterministic object keys and guarded ready transitions make retries safe
        },
        {
          name: "external-reviewers.invitation-delivery",
          task: (db) => redispatchPendingInvitations(db, env),
          retryTransient: true,
        },
        {
          name: "trial-emails.wrapup-discovery",
          task: async (db) => {
            await runTrialWrapupDiscoveryTick(db, undefined, env);
          },
          retryTransient: true,
        },
        {
          name: "trial-emails.delivery",
          task: (db) => runTrialEmailTick(db, env),
          retryTransient: true, // stable per-row Resend idempotency keys make sentAt recovery safe
        },
        {
          name: "trial.expiry",
          task: (db) => runTrialExpiryTick(db, env),
          retryTransient: false, // emits trial_expired before stamping the marker; retrying the whole task would re-emit
        },
        {
          name: "notifications.donor_lapse",
          task: (db) => scanDonorLapseAlerts(db, env),
          retryTransient: true, // notification inserts use dedupeKey + onConflictDoNothing
        },
        {
          name: "notifications.budget_sentinel",
          task: (db) => scanBudgetSentinelAlerts(db, env),
          retryTransient: true, // notification inserts use dedupeKey + onConflictDoNothing
        },
        {
          name: "notifications.accounting_anomaly",
          task: (db) => scanAccountingAnomalies(db, env),
          retryTransient: true, // notification inserts use dedupeKey + onConflictDoNothing
        },
        {
          name: PLEDGE_ALERT_JOB,
          task: (db) => scanPledgeInstallmentAlerts(db, env),
          retryTransient: true, // notification inserts use dedupeKey + onConflictDoNothing
        },
      ];

      const results = await Promise.allSettled(
        scheduledJobs.map((job) =>
          runScheduledJob(job.name, controller.cron, () =>
            job.retryTransient
              ? withDbRetry(() => job.task(handle.db), {
                  isRetryable: isRetryableScheduledDbError,
                })
              : job.task(handle.db),
          ),
        ),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(result.reason);
        } else if (result.value !== null) {
          errors.push(result.value);
        }
      }

      const leadDeliveryError = await leadDeliveryResult;
      if (leadDeliveryError !== null) errors.push(leadDeliveryError);

      if (errors.length > 0) {
        throw new AggregateError(errors, "One or more scheduled GrantPipe jobs failed");
      }
    } finally {
      // If close() rejects while an AggregateError is mid-flight, JS try/finally
      // semantics mean the teardown error clobbers the job errors. That tradeoff
      // is acceptable: teardown failure is rare, surfaces distinctly in Sentry,
      // and Cloudflare retries the cron on any throw.
      await handle.close();
    }
  },
};

export default withSentry(createSentryOptions, handler);
