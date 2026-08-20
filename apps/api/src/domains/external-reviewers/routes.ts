import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  buildAppUrl,
  createReviewerSchema,
  updateReviewerSchema,
  listReviewersSchema,
  createSessionSchema,
  extendSessionSchema,
  listSessionsSchema,
  addScopesSchema,
  removeScopeSchema,
  createBundleSchema,
  updateBundleSchema,
  listBundlesSchema,
  addBundleItemSchema,
  reorderBundleItemsSchema,
  listAuditEventsSchema,
  quickShareSchema,
  type CreateSessionInput,
} from "@grantpipe/shared";
import {
  documents,
  grants,
  funds,
  programs,
  generatedReports,
  restrictionTerms,
  externalReviewSessions,
  externalReviewers as externalReviewersTable,
} from "@grantpipe/db";
import { and, eq, isNull } from "drizzle-orm";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requirePermission, requireRole } from "../../middleware/require-role";
import { portalReviewerMiddleware } from "../../middleware/portal-reviewer";
import {
  createReviewer,
  updateReviewer,
  softDeleteReviewer,
  getReviewer,
  listReviewers,
} from "./reviewer.service";
import {
  createSession,
  getSession,
  listSessions,
  revokeSession,
  extendSession,
} from "./session.service";
import { addScopes, removeScope, listScopes, checkScope, publicPortalScope } from "./scope.service";
import {
  createBundle,
  updateBundle,
  softDeleteBundle,
  publishBundle,
  getBundle,
  listBundles,
  addBundleItem,
  removeBundleItem,
  reorderBundleItems,
} from "./bundle.service";
import { listAuditEvents, exportAuditEventsCSV, recordAuditEvent } from "./audit-event.service";
import {
  assertScopeTargetsBelongToOrg,
  isExternalReviewDocumentEntityType,
  isExternalReviewSubrecipientFileEntityType,
} from "./scope-targets";
import {
  signPortalToken,
  createPortalSessionCredential,
  hashPortalTokenForStorage,
  verifyPortalToken,
} from "./tokens";
import { dispatchInvitationDeliveryWithDedicatedHandle } from "./invitation-delivery.service";
import {
  authMemoryFallback,
  checkRateLimit,
  createDurableObjectRateLimitStore,
  _resetAuthRateLimit,
  type AtomicRateLimitStore,
  type RateLimitStore,
} from "../../lib/auth-rate-limit";
import { jsonBodyLimit } from "../../middleware/json-body-limit";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

// ---------------------------------------------------------------------------
// Portal auth-exchange rate limiting
//
// `POST /public/portal/auth` is unauthenticated and runs cryptographic work
// (two HMAC-SHA256 ops) plus a DB lookup on every call. Without a throttle it is
// a free amplification surface for an attacker hammering it with junk tokens.
// The portal token itself is unguessable (128-bit session id + HMAC), so this is
// abuse-prevention, not anti-brute-force, but the throttle keeps the cost of
// hammering this endpoint on the attacker. Mirrors the IP-keyed pattern used by
// the public feedback and leads endpoints.
// ---------------------------------------------------------------------------

export type { RateLimitStore } from "../../lib/auth-rate-limit";
type PortalRateLimitStore = RateLimitStore | AtomicRateLimitStore;

export function _resetPortalAuthRateLimit(): void {
  _resetAuthRateLimit();
}

export async function checkPortalAuthRateLimit(
  store: PortalRateLimitStore,
  ip: string,
): Promise<boolean> {
  return checkRateLimit(store, `portal-auth:${ip}`, "portal-auth");
}

function captureExternalReviewEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");
  if (!orgId || !user) return;

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: { actorId: user.id, ...payload },
    }),
    { c, eventName },
  );
}

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

function countBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "51+";
}

function ttlBucket(ttlMs: number): string {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (ttlMs <= hour) return "under_1h";
  if (ttlMs < day) return "1h_1d";
  if (ttlMs <= 7 * day) return "1d_7d";
  if (ttlMs <= 30 * day) return "7d_30d";
  return "30d_plus";
}

// ---------------------------------------------------------------------------
// Admin router (authenticated + paywalled — gates applied at mount point)
// ---------------------------------------------------------------------------

export const externalReviewersRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Reviewers
  // -------------------------------------------------------------------------

  .get(
    "/reviewers",
    requirePermission("compliance", "view"),
    zValidator("query", listReviewersSchema),
    async (c) => {
      const result = await listReviewers(c.get("db"), c.get("orgId")!, c.req.valid("query"));
      return c.json(result);
    },
  )

  .post("/reviewers", requireRole("admin"), zValidator("json", createReviewerSchema), async (c) => {
    const input = c.req.valid("json");
    const reviewer = await createReviewer(c.get("db"), c.get("orgId")!, c.get("user")!.id, input);
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.externalReviewerCreated, {
      entity_type: "external_reviewer",
      reviewer_type: input.reviewerType,
    });
    return c.json(reviewer, 201);
  })

  .get("/reviewers/:id", requirePermission("compliance", "view"), async (c) => {
    const reviewer = await getReviewer(c.get("db"), c.get("orgId")!, c.req.param("id"));
    if (!reviewer) return c.json({ error: "Reviewer not found" }, 404);
    return c.json(reviewer);
  })

  .patch(
    "/reviewers/:id",
    requireRole("admin"),
    zValidator("json", updateReviewerSchema),
    async (c) => {
      const input = c.req.valid("json");
      const reviewer = await updateReviewer(
        c.get("db"),
        c.get("orgId")!,
        c.req.param("id"),
        c.get("user")!.id,
        input,
      );
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.externalReviewerUpdated, {
        entity_type: "external_reviewer",
        ...(input.reviewerType ? { reviewer_type: input.reviewerType } : {}),
        changed_fields: changedFields(input),
      });
      return c.json(reviewer);
    },
  )

  .delete("/reviewers/:id", requireRole("admin"), async (c) => {
    await softDeleteReviewer(c.get("db"), c.get("orgId")!, c.req.param("id"), c.get("user")!.id);
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.externalReviewerDeleted, {
      entity_type: "external_reviewer",
    });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  .get(
    "/sessions",
    requirePermission("compliance", "view"),
    zValidator("query", listSessionsSchema),
    async (c) => {
      const result = await listSessions(c.get("db"), c.get("orgId")!, c.req.valid("query"));
      return c.json(result);
    },
  )

  .post("/sessions", requireRole("admin"), zValidator("json", createSessionSchema), async (c) => {
    const input = c.req.valid("json");
    const secret = c.env.PORTAL_TOKEN_SECRET ?? c.env.BETTER_AUTH_SECRET; // PORTAL_TOKEN_SECRET should be set in production; falls back to BETTER_AUTH_SECRET

    // We need the session id before we sign, so we create a temporary UUID
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + input.ttlMs;
    const rawToken = await signPortalToken(sessionId, expiresAt, secret);
    const tokenHash = await hashPortalTokenForStorage(rawToken, secret);

    const session = await createSession(
      c.get("db"),
      c.get("orgId")!,
      c.get("user")!.id,
      { ...input, reviewerId: input.reviewerId },
      rawToken,
      tokenHash,
      sessionId,
      "email",
      new Date(expiresAt),
    );
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.reviewerSessionCreated, {
      entity_type: "external_review_session",
      scope_count_bucket: countBucket(input.scopes.length),
      ttl_bucket: ttlBucket(input.ttlMs),
    });

    const portalUrl = buildAppUrl(c.env.APP_URL, `/portal/${rawToken}`);

    // The session row is also the durable delivery intent. Start delivery now,
    // while the hourly dispatcher remains responsible for recovery.
    const delivery = dispatchInvitationDeliveryWithDedicatedHandle(c.env, session.id);
    try {
      c.executionCtx.waitUntil(delivery);
    } catch {
      await delivery;
    }

    return c.json({ session, rawToken, portalUrl }, 201);
  })

  .get("/sessions/:id", requirePermission("compliance", "view"), async (c) => {
    const session = await getSession(c.get("db"), c.get("orgId")!, c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  })

  .post("/sessions/:id/revoke", requireRole("admin"), async (c) => {
    await revokeSession(c.get("db"), c.get("orgId")!, c.req.param("id"), c.get("user")!.id);
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.reviewerSessionRevoked, {
      entity_type: "external_review_session",
    });
    return c.body(null, 204);
  })

  .post(
    "/sessions/:id/extend",
    requireRole("admin"),
    zValidator("json", extendSessionSchema),
    async (c) => {
      const sessionId = c.req.param("id");
      const input = c.req.valid("json");
      const secret = c.env.PORTAL_TOKEN_SECRET ?? c.env.BETTER_AUTH_SECRET;
      let rawToken = "";
      const session = await extendSession(
        c.get("db"),
        c.get("orgId")!,
        sessionId,
        c.get("user")!.id,
        input,
        async (expiresAt) => {
          rawToken = await signPortalToken(sessionId, expiresAt.getTime(), secret);
          return hashPortalTokenForStorage(rawToken, secret);
        },
      );
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.reviewerSessionExtended, {
        entity_type: "external_review_session",
        ttl_bucket: ttlBucket(input.extensionMs),
      });
      const portalUrl = buildAppUrl(c.env.APP_URL, `/portal/${rawToken}`);

      if (session.invitationDeliveryStatus !== "not_requested") {
        const delivery = dispatchInvitationDeliveryWithDedicatedHandle(c.env, session.id);
        try {
          c.executionCtx.waitUntil(delivery);
        } catch {
          await delivery;
        }
      }

      return c.json({ session, rawToken, portalUrl });
    },
  )

  .get("/sessions/:id/scopes", requirePermission("compliance", "view"), async (c) => {
    const sessionId = c.req.param("id");
    // Verify session belongs to org
    const session = await getSession(c.get("db"), c.get("orgId")!, sessionId);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const scopes = await listScopes(c.get("db"), c.get("orgId")!, sessionId);
    return c.json({ data: scopes });
  })

  .post(
    "/sessions/:id/scopes",
    requireRole("admin"),
    zValidator("json", addScopesSchema),
    async (c) => {
      const sessionId = c.req.param("id");
      const { scopes } = c.req.valid("json");
      await addScopes(c.get("db"), c.get("orgId")!, sessionId, c.get("user")!.id, scopes);
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.reviewerScopesUpdated, {
        entity_type: "external_review_session",
        action: "add",
        scope_count_bucket: countBucket(scopes.length),
      });
      return c.body(null, 204);
    },
  )

  .delete(
    "/sessions/:id/scopes",
    requireRole("admin"),
    zValidator("json", removeScopeSchema),
    async (c) => {
      const { scopeType, scopeId } = c.req.valid("json");
      await removeScope(
        c.get("db"),
        c.get("orgId")!,
        c.req.param("id"),
        c.get("user")!.id,
        scopeType,
        scopeId,
      );
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.reviewerScopesUpdated, {
        entity_type: "external_review_session",
        action: "remove",
        scope_type: scopeType,
      });
      return c.body(null, 204);
    },
  )

  // -------------------------------------------------------------------------
  // Evidence bundles
  // -------------------------------------------------------------------------

  .get(
    "/bundles",
    requirePermission("compliance", "view"),
    zValidator("query", listBundlesSchema),
    async (c) => {
      const result = await listBundles(c.get("db"), c.get("orgId")!, c.req.valid("query"));
      return c.json(result);
    },
  )

  .post(
    "/bundles",
    requirePermission("compliance", "edit"),
    zValidator("json", createBundleSchema),
    async (c) => {
      const input = c.req.valid("json");
      const bundle = await createBundle(c.get("db"), c.get("orgId")!, c.get("user")!.id, input);
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleCreated, {
        entity_type: "evidence_bundle",
        evidence_bundle_purpose: input.purpose,
      });
      return c.json(bundle, 201);
    },
  )

  .get("/bundles/:id", requirePermission("compliance", "view"), async (c) => {
    const result = await getBundle(c.get("db"), c.get("orgId")!, c.req.param("id"));
    if (!result) return c.json({ error: "Bundle not found" }, 404);
    return c.json(result);
  })

  .patch(
    "/bundles/:id",
    requirePermission("compliance", "edit"),
    zValidator("json", updateBundleSchema),
    async (c) => {
      const input = c.req.valid("json");
      const bundle = await updateBundle(
        c.get("db"),
        c.get("orgId")!,
        c.req.param("id"),
        c.get("user")!.id,
        input,
      );
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleUpdated, {
        entity_type: "evidence_bundle",
        ...(input.purpose ? { evidence_bundle_purpose: input.purpose } : {}),
        changed_fields: changedFields(input),
      });
      return c.json(bundle);
    },
  )

  .delete("/bundles/:id", requirePermission("compliance", "manage"), async (c) => {
    await softDeleteBundle(c.get("db"), c.get("orgId")!, c.req.param("id"), c.get("user")!.id);
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleDeleted, {
      entity_type: "evidence_bundle",
    });
    return c.body(null, 204);
  })

  .post("/bundles/:id/publish", requirePermission("compliance", "manage"), async (c) => {
    const bundle = await publishBundle(
      c.get("db"),
      c.get("orgId")!,
      c.req.param("id"),
      c.get("user")!.id,
    );
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundlePublished, {
      entity_type: "evidence_bundle",
    });
    return c.json(bundle);
  })

  .post(
    "/bundles/:id/items",
    requirePermission("compliance", "edit"),
    zValidator("json", addBundleItemSchema),
    async (c) => {
      const input = c.req.valid("json");
      const item = await addBundleItem(c.get("db"), c.get("orgId")!, c.req.param("id"), input);
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleItemAdded, {
        entity_type: "evidence_bundle_item",
        item_type: input.itemType,
      });
      return c.json(item, 201);
    },
  )

  .delete("/bundles/:id/items/:itemId", requirePermission("compliance", "manage"), async (c) => {
    await removeBundleItem(
      c.get("db"),
      c.get("orgId")!,
      c.req.param("id"),
      c.req.param("itemId"),
      c.get("user")!.id,
    );
    captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleItemRemoved, {
      entity_type: "evidence_bundle_item",
    });
    return c.body(null, 204);
  })

  .post(
    "/bundles/:id/reorder",
    requirePermission("compliance", "edit"),
    zValidator("json", reorderBundleItemsSchema),
    async (c) => {
      const input = c.req.valid("json");
      await reorderBundleItems(c.get("db"), c.get("orgId")!, c.req.param("id"), input);
      captureExternalReviewEvent(c, ANALYTICS_EVENTS.evidenceBundleItemsReordered, {
        entity_type: "evidence_bundle_item",
        item_count_bucket: countBucket(input.itemIds.length),
      });
      return c.body(null, 204);
    },
  )

  // -------------------------------------------------------------------------
  // Audit events
  // -------------------------------------------------------------------------

  .get(
    "/audit-events",
    requirePermission("compliance", "view"),
    zValidator("query", listAuditEventsSchema),
    async (c) => {
      const result = await listAuditEvents(c.get("db"), c.get("orgId")!, c.req.valid("query"));
      return c.json(result);
    },
  )

  .get("/audit-events/export.csv", requirePermission("compliance", "view"), async (c) => {
    const url = new URL(c.req.url);
    const sessionId = url.searchParams.get("sessionId") ?? undefined;
    const csv = await exportAuditEventsCSV(c.get("db"), c.get("orgId")!, sessionId);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-events.csv"`,
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store",
      },
    });
  })

  // -------------------------------------------------------------------------
  // Quick-share
  // -------------------------------------------------------------------------

  .post("/quick-share", requireRole("admin"), zValidator("json", quickShareSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const secret = c.env.PORTAL_TOKEN_SECRET ?? c.env.BETTER_AUTH_SECRET; // PORTAL_TOKEN_SECRET should be set in production; falls back to BETTER_AUTH_SECRET
    const scopes = [
      { scopeType: input.scopeType, scopeId: input.scopeId },
    ] satisfies CreateSessionInput["scopes"];

    await assertScopeTargetsBelongToOrg(db, orgId, scopes);

    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + input.ttlMs;
    const rawToken = await signPortalToken(sessionId, expiresAt, secret);
    const tokenHash = await hashPortalTokenForStorage(rawToken, secret);
    let quickShareScopeCount = scopes.length;

    const { bundle, session } = await db.transaction(async (tx) => {
      let bundle: Awaited<ReturnType<typeof createBundle>> | { id: string; title: string };
      if (input.bundleId) {
        const existing = await getBundle(tx, orgId, input.bundleId);
        if (!existing) return { bundle: null, session: null };
        bundle = existing.bundle;
      } else {
        bundle = await createBundle(tx, orgId, actorId, {
          title: input.bundleTitle ?? `Quick share — ${input.purpose}`,
          purpose: "audit",
          description: undefined,
          periodStart: undefined,
          periodEnd: undefined,
        });
      }

      await addBundleItem(tx, orgId, bundle.id, {
        itemType: input.scopeType,
        itemId: input.scopeId,
        sortOrder: 0,
      });

      const sessionScopes: CreateSessionInput["scopes"] = [...scopes];
      if (
        !sessionScopes.some(
          (scope) => scope.scopeType === "evidence_bundle" && scope.scopeId === bundle.id,
        )
      ) {
        sessionScopes.push({ scopeType: "evidence_bundle", scopeId: bundle.id });
      }
      quickShareScopeCount = sessionScopes.length;

      const session = await createSession(
        tx,
        orgId,
        actorId,
        {
          reviewerId: input.reviewerId,
          purpose: input.purpose,
          ttlMs: input.ttlMs,
          scopes: sessionScopes,
        },
        rawToken,
        tokenHash,
        sessionId,
        "link_only",
        new Date(expiresAt),
      );

      return { bundle, session };
    });

    if (!bundle || !session) return c.json({ error: "Bundle not found" }, 404);

    const portalUrl = buildAppUrl(c.env.APP_URL, `/portal/${rawToken}`);

    captureExternalReviewEvent(c, ANALYTICS_EVENTS.quickShareCreated, {
      entity_type: "external_review_quick_share",
      scope_type: input.scopeType,
      scope_count_bucket: countBucket(quickShareScopeCount),
      ttl_bucket: ttlBucket(input.ttlMs),
      bundle_reused: Boolean(input.bundleId),
    });

    return c.json({ session, rawToken, portalUrl, bundle }, 201);
  });

// ---------------------------------------------------------------------------
// Portal router (public — NOT behind Better Auth)
// ---------------------------------------------------------------------------

const COOKIE_NAME = "gp_portal_session";
const PORTAL_AUTH_MAX_BODY_BYTES = 16_384;

function publicPortalReviewer(reviewer: typeof externalReviewersTable.$inferSelect) {
  return {
    id: reviewer.id,
    email: reviewer.email,
    name: reviewer.name,
    reviewerType: reviewer.reviewerType,
    organizationName: reviewer.organizationName,
  };
}

function publicPortalSession(session: typeof externalReviewSessions.$inferSelect) {
  return {
    id: session.id,
    orgId: session.orgId,
    purpose: session.purpose,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  };
}

function publicPortalScopes(scopes: Parameters<typeof publicPortalScope>[0][]) {
  return scopes.map(publicPortalScope);
}

function publicPortalGrant(grant: typeof grants.$inferSelect) {
  return {
    id: grant.id,
    name: grant.name,
    status: grant.status,
    amountCents: grant.amountCents,
    startDate: grant.startDate,
    endDate: grant.endDate,
    applicationDeadline: grant.applicationDeadline,
    description: grant.description,
  };
}

function publicPortalFund(fund: typeof funds.$inferSelect) {
  return {
    id: fund.id,
    name: fund.name,
    fundType: fund.type,
    description: fund.description,
  };
}

function publicPortalProgram(program: typeof programs.$inferSelect) {
  return {
    id: program.id,
    name: program.name,
    code: program.code,
    description: program.description,
    status: program.status,
  };
}

function publicPortalDocument(document: typeof documents.$inferSelect) {
  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    fileSizeBytes: document.sizeBytes,
  };
}

function publicPortalGeneratedReport(report: typeof generatedReports.$inferSelect) {
  return {
    id: report.id,
    type: report.type,
    format: report.format,
    status: report.status,
    title: report.title,
    fileName: report.fileName,
    fileSizeBytes: report.fileSizeBytes,
    createdAt: report.createdAt,
  };
}

function publicPortalRestrictionTerm(term: typeof restrictionTerms.$inferSelect) {
  return {
    id: term.id,
    restrictionType: term.restrictionType,
    source: term.source,
    title: term.title,
    purposeStatement: term.purposeStatement,
    releaseRule: term.releaseRule,
    startDate: term.startDate,
    endDate: term.endDate,
    beginningBalanceCents: term.beginningBalanceCents,
    currency: term.currency,
    evidenceRequirement: term.evidenceRequirement,
  };
}

function publicPortalBundle(result: NonNullable<Awaited<ReturnType<typeof getBundle>>>) {
  return {
    bundle: {
      id: result.bundle.id,
      title: result.bundle.title,
      description: result.bundle.description,
      purpose: result.bundle.purpose,
      periodStart: result.bundle.periodStart,
      periodEnd: result.bundle.periodEnd,
    },
    items: result.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      itemId: item.itemId,
      caption: item.caption,
      sortOrder: item.sortOrder,
    })),
  };
}

function sanitizePortalDownloadFilename(fileName: string) {
  return fileName.replace(/["\\/\r\n;]/g, "-") || "download";
}

function generatedReportContentType(format: string) {
  return format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8";
}

export const portalRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store");
  })

  // -------------------------------------------------------------------------
  // Auth exchange — no middleware
  // -------------------------------------------------------------------------

  .post("/auth", jsonBodyLimit(PORTAL_AUTH_MAX_BODY_BYTES), async (c) => {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
    const rateLimitStore: PortalRateLimitStore = c.env.AUTH_RATE_LIMITER
      ? createDurableObjectRateLimitStore(c.env.AUTH_RATE_LIMITER)
      : (c.env.RATE_LIMIT_KV ?? authMemoryFallback);
    if (
      !(await checkRateLimit(rateLimitStore, `portal-auth:${ip}`, "portal-auth", (error) => {
        captureBackgroundException(error, "external-reviewers", {
          step: "portal_auth_rate_limit",
        });
      }))
    ) {
      return c.json({ error: "Too many requests" }, 429);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const token =
      typeof body === "object" && body !== null && "token" in body ? body.token : undefined;
    if (typeof token !== "string" || !token) {
      return c.json({ error: "token is required" }, 400);
    }
    const secret = c.env.PORTAL_TOKEN_SECRET ?? c.env.BETTER_AUTH_SECRET; // PORTAL_TOKEN_SECRET should be set in production; falls back to BETTER_AUTH_SECRET

    const verified = await verifyPortalToken(token, secret);
    if (!verified) {
      return c.json({ error: "Invalid or expired portal token" }, 401);
    }

    const tokenHash = await hashPortalTokenForStorage(token, secret);
    const db = c.get("db");

    const session = await db.query.externalReviewSessions.findFirst({
      where: eq(externalReviewSessions.id, verified.sessionId),
    });

    if (
      !session ||
      session.tokenHash !== tokenHash ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      return c.json({ error: "Invalid or expired portal session" }, 401);
    }

    const reviewer = await db.query.externalReviewers.findFirst({
      where: and(
        eq(externalReviewersTable.id, session.reviewerId),
        eq(externalReviewersTable.orgId, session.orgId),
        isNull(externalReviewersTable.deletedAt),
      ),
    });

    if (!reviewer || reviewer.orgId !== session.orgId || reviewer.deletedAt !== null) {
      return c.json({ error: "Invalid or expired portal session" }, 401);
    }

    // Load all response data before consuming the emailed bearer. If this read
    // fails, the caller can safely retry the same one-time link.
    const scopes = await listScopes(db, session.orgId, session.id);

    const cookieToken = await createPortalSessionCredential(
      session.id,
      session.expiresAt.getTime(),
      secret,
    );
    const cookieTokenHash = await hashPortalTokenForStorage(cookieToken, secret);
    const [consumed] = await db
      .update(externalReviewSessions)
      .set({ tokenHash: cookieTokenHash })
      .where(
        and(
          eq(externalReviewSessions.id, session.id),
          eq(externalReviewSessions.tokenHash, tokenHash),
          eq(externalReviewSessions.expiresAt, session.expiresAt),
          isNull(externalReviewSessions.revokedAt),
        ),
      )
      .returning({ id: externalReviewSessions.id });
    if (!consumed) {
      return c.json({ error: "Invalid or expired portal session" }, 401);
    }

    const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=${cookieToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/public/portal; Max-Age=${maxAge}`,
    );

    return c.json({
      reviewer: publicPortalReviewer(reviewer),
      session: publicPortalSession(session),
      scopes: publicPortalScopes(scopes),
    });
  })

  // -------------------------------------------------------------------------
  // Me
  // -------------------------------------------------------------------------

  .get("/me", portalReviewerMiddleware, async (c) => {
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const scopes = await listScopes(db, c.get("portalOrgId")!, sessionId);
    return c.json({
      reviewer: publicPortalReviewer(c.get("portalReviewer")!),
      session: publicPortalSession(c.get("portalSession")!),
      scopes: publicPortalScopes(scopes),
    });
  })

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  .post("/logout", async (c) => {
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/api/public/portal; Max-Age=0`,
    );
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Scoped reads
  // -------------------------------------------------------------------------

  .get("/grants/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "grant", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const entity = await db.query.grants.findFirst({
      where: and(eq(grants.id, id), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "grant",
      targetId: id,
    });

    return c.json(publicPortalGrant(entity));
  })

  .get("/funds/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "fund", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const entity = await db.query.funds.findFirst({
      where: and(eq(funds.id, id), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "fund",
      targetId: id,
    });

    return c.json(publicPortalFund(entity));
  })

  .get("/programs/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "program", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const entity = await db.query.programs.findFirst({
      where: and(eq(programs.id, id), eq(programs.orgId, orgId), isNull(programs.deletedAt)),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "program",
      targetId: id,
    });

    return c.json(publicPortalProgram(entity));
  })

  .get("/documents/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowedDocumentScope = await checkScope(db, sessionId, "document", id);
    if (!allowedDocumentScope && !db.query.documents?.findFirst) {
      return c.json({ error: "Access denied" }, 403);
    }

    const entity = await db.query.documents.findFirst({
      where: and(eq(documents.id, id), eq(documents.orgId, orgId), isNull(documents.deletedAt)),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);

    const allowedAsDocument =
      isExternalReviewDocumentEntityType(entity.entityType) && allowedDocumentScope;
    const allowedAsSubrecipientFile =
      isExternalReviewSubrecipientFileEntityType(entity.entityType) &&
      (await checkScope(db, sessionId, "subrecipient_file", id));
    if (!allowedAsDocument && !allowedAsSubrecipientFile) {
      return c.json({ error: "Access denied" }, 403);
    }

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "document",
      targetId: id,
    });

    return c.json(publicPortalDocument(entity));
  })

  .get("/documents/:id/download", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowedDocumentScope = await checkScope(db, sessionId, "document", id);
    if (!allowedDocumentScope && !db.query.documents?.findFirst) {
      return c.json({ error: "Access denied" }, 403);
    }

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, id), eq(documents.orgId, orgId), isNull(documents.deletedAt)),
    });

    if (!doc) return c.json({ error: "Not found" }, 404);

    const allowedAsDocument =
      isExternalReviewDocumentEntityType(doc.entityType) && allowedDocumentScope;
    const allowedAsSubrecipientFile =
      isExternalReviewSubrecipientFileEntityType(doc.entityType) &&
      (await checkScope(db, sessionId, "subrecipient_file", id));
    if (!allowedAsDocument && !allowedAsSubrecipientFile) {
      return c.json({ error: "Access denied" }, 403);
    }

    try {
      await recordAuditEvent(
        db,
        {
          orgId,
          sessionId,
          reviewerId: c.get("portalReviewerId")!,
          eventType: "download",
          targetType: "document",
          targetId: id,
        },
        { throwOnFailure: true },
      );
    } catch {
      return c.json({ error: "Audit log unavailable" }, 503);
    }

    const r2 = c.env.R2;
    const object = r2 ? await r2.get(doc.fileKey) : null;

    if (!object) return c.json({ error: "File not found" }, 404);

    const safeFilename = doc.filename.replace(/["\\/\r\n;]/g, "-");

    return new Response(object.body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store",
      },
    });
  })

  .get("/generated-reports/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "generated_report", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const entity = await db.query.generatedReports.findFirst({
      where: and(eq(generatedReports.id, id), eq(generatedReports.orgId, orgId)),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);
    if (entity.status !== "ready") {
      return c.json({ error: "Generated report is not ready" }, 409);
    }

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "generated_report",
      targetId: id,
    });

    return c.json(publicPortalGeneratedReport(entity));
  })

  .get("/generated-reports/:id/download", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "generated_report", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const report = await db.query.generatedReports.findFirst({
      where: and(eq(generatedReports.id, id), eq(generatedReports.orgId, orgId)),
      columns: {
        id: true,
        fileKey: true,
        fileName: true,
        format: true,
        status: true,
      },
    });

    if (!report) return c.json({ error: "Not found" }, 404);
    if (report.status !== "ready") {
      return c.json({ error: "Generated report is not ready" }, 409);
    }

    try {
      await recordAuditEvent(
        db,
        {
          orgId,
          sessionId,
          reviewerId: c.get("portalReviewerId")!,
          eventType: "download",
          targetType: "generated_report",
          targetId: id,
        },
        { throwOnFailure: true },
      );
    } catch {
      return c.json({ error: "Audit log unavailable" }, 503);
    }

    const r2 = c.env.R2;
    const object = r2 ? await r2.get(report.fileKey) : null;

    if (!object) return c.json({ error: "File not found" }, 404);

    return new Response(object.body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": generatedReportContentType(report.format),
        "Content-Disposition": `attachment; filename="${sanitizePortalDownloadFilename(
          report.fileName,
        )}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store",
      },
    });
  })

  .get("/restriction-terms/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "restriction_term", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const entity = await db.query.restrictionTerms.findFirst({
      where: and(
        eq(restrictionTerms.id, id),
        eq(restrictionTerms.orgId, orgId),
        isNull(restrictionTerms.deletedAt),
      ),
    });

    if (!entity) return c.json({ error: "Not found" }, 404);

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "view",
      targetType: "restriction_term",
      targetId: id,
    });

    return c.json(publicPortalRestrictionTerm(entity));
  })

  .get("/evidence-bundles/:id", portalReviewerMiddleware, async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const sessionId = c.get("portalSessionId")!;
    const orgId = c.get("portalOrgId")!;

    const allowed = await checkScope(db, sessionId, "evidence_bundle", id);
    if (!allowed) return c.json({ error: "Access denied" }, 403);

    const result = await getBundle(db, orgId, id);
    if (!result) return c.json({ error: "Not found" }, 404);

    await recordAuditEvent(db, {
      orgId,
      sessionId,
      reviewerId: c.get("portalReviewerId")!,
      eventType: "bundle_view",
      targetType: "evidence_bundle",
      targetId: id,
    });

    return c.json(publicPortalBundle(result));
  });
