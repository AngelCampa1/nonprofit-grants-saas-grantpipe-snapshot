import { Hono } from "hono";
import { appKnowledge, canUseHelpArticle, FEATURE_KNOWLEDGE } from "@grantpipe/shared/knowledge";
import { FOUNDER_BOOKING_URLS, buildAppUrl } from "@grantpipe/shared";
import type { Role } from "@grantpipe/shared";
import type { AiSdrMeetingLink } from "@grantpipe/shared/public-kb";
import type { AppEnv } from "../../types.js";
import { captureBackgroundException } from "../../lib/sentry.js";
import {
  buildRoleCapabilityFaqs,
  buildTeachingFields,
  filterFeaturesByRole,
} from "./feature-teaching.js";

/**
 * Authenticated BFF for the Ventora AI-CS Worker.
 *
 * The browser SPA cannot hold HMAC secrets, so all requests come here first.
 * This BFF:
 *   1. Gates every call behind a valid better-auth session (enforced by the
 *      global session middleware in app.ts before this router is reached).
 *   2. Rewrites the body for session creation, injecting the authenticated
 *      userId and the fixed appId — the client never supplies identity.
 *   3. Signs each forward with AI_CS_CLIENT_ASSERTION_SECRET over the exact
 *      body sent, forwarding the app Origin.
 *   4. Passes chat responses through as a streaming SSE body — never buffered.
 *   5. Persists escalations to D1 before forwarding so a durable ticket
 *      survives even if the upstream Worker is temporarily unavailable.
 *
 * Route contract (matches what @ventora/ai-cs client calls):
 *   POST /api/ai-cs/v1/sessions
 *   POST /api/ai-cs/v1/chat        <- streaming SSE passthrough
 *   POST /api/ai-cs/v1/escalations
 *   GET  /api/ai-cs/context        <- worker-to-BFF signed context fetch
 *
 * Fails closed: 503 when secrets/origin are unset, 401 when unauthenticated,
 * 400 for malformed bodies, 502 when the Worker is unreachable.
 */

const APP_ID = "grantpipe";
const MAX_BODY_BYTES = 32_000;
const MAX_SKEW_MS = 5 * 60 * 1_000;
const CORE_AI_CS_HOWTO_KEYS = new Set(["grants", "funds", "import", "reports", "report_builder"]);

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { [key: string]: StableJsonValue | undefined };

type AiCsProxyRoute = "sessions" | "chat" | "escalations";

// ---------------------------------------------------------------------------
// HMAC / signing utilities (WebCrypto — no node:crypto)
// ---------------------------------------------------------------------------

function stableJson(value: StableJsonValue): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const sorted: { [key: string]: StableJsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortStable(child);
    }
  }
  return sorted;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildAssertionPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: StableJsonValue;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

// ---------------------------------------------------------------------------
// Request body helpers
// ---------------------------------------------------------------------------

function isJsonObject(value: unknown): value is { [key: string]: StableJsonValue | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(
  request: Request,
): Promise<{ [key: string]: StableJsonValue | undefined } | Response> {
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large" }, { status: 413 });
  }
  if (bodyText.trim().length === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!isJsonObject(parsed)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  return parsed as { [key: string]: StableJsonValue | undefined };
}

// ---------------------------------------------------------------------------
// Proxy routes: /v1/sessions, /v1/chat, /v1/escalations
// ---------------------------------------------------------------------------

/**
 * Build the body forwarded to the AI-CS Worker for each route. For session
 * creation the authenticated identity (userId, appId) is injected and any
 * client-supplied identity is dropped. Chat and escalation bodies preserve
 * client payload fields, but their app/user identity is rebound to the
 * authenticated GrantPipe user before signing.
 */
export function buildForwardBody(
  route: AiCsProxyRoute,
  requestBody: { [key: string]: StableJsonValue | undefined },
  userId: string,
  orgId?: string | null,
): StableJsonValue {
  const withAuthenticatedIdentity = {
    ...requestBody,
    appId: APP_ID,
    userId,
  };
  if (route === "sessions") {
    const forward: { [key: string]: StableJsonValue | undefined } = withAuthenticatedIdentity;
    if (requestBody.currentPath !== undefined) {
      forward.currentPath = requestBody.currentPath;
    }
    if (orgId) {
      forward.metadata = { orgId };
    }
    return forward;
  }
  return withAuthenticatedIdentity;
}

/**
 * Persist an escalation ticket to D1 before forwarding. Best-effort: if the
 * insert fails the escalation still forwards.
 */
export async function persistEscalation(
  db: AppEnv["Bindings"]["MARKETING_DB"] | undefined,
  ticket: {
    userId: string;
    sessionId: string;
    reason: string | null;
    message: string | null;
    contact: string | null;
  },
): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO ai_cs_escalations (id, user_id, session_id, reason, message, contact, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        ticket.userId,
        ticket.sessionId,
        ticket.reason,
        ticket.message,
        ticket.contact,
        new Date().toISOString(),
      )
      .run();
  } catch (err) {
    console.error("[ai-cs] escalation persist failed", err);
    // A failed insert silently loses a human-handoff request — capture it.
    captureBackgroundException(err, "ai-cs", { step: "escalation-persist" });
  }
}

function resolveWorkerOrigin(env: AppEnv["Bindings"]): string | null {
  const raw = env.AI_CS_WORKER_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const PROXY_ROUTES: readonly AiCsProxyRoute[] = ["sessions", "chat", "escalations"];

const aiCsRouter = new Hono<AppEnv>();

for (const route of PROXY_ROUTES) {
  aiCsRouter.post(`/v1/${route}`, async (c) => {
    const workerOrigin = resolveWorkerOrigin(c.env);
    const secret = c.env.AI_CS_CLIENT_ASSERTION_SECRET?.trim();
    if (!workerOrigin || !secret) {
      return c.json({ error: "AI support unavailable" }, 503);
    }

    const bodyResult = await readJsonObject(c.req.raw);
    if (bodyResult instanceof Response) return bodyResult;

    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (route === "escalations") {
      const sessionId = bodyResult.sessionId;
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return c.json({ error: "Invalid request" }, 400);
      }
      await persistEscalation(c.env.MARKETING_DB, {
        userId: user.id,
        sessionId,
        reason: typeof bodyResult.reason === "string" ? bodyResult.reason : null,
        message: typeof bodyResult.message === "string" ? bodyResult.message : null,
        contact:
          bodyResult.contact == null
            ? null
            : typeof bodyResult.contact === "string"
              ? bodyResult.contact
              : JSON.stringify(bodyResult.contact),
      });
    }

    const forwardBody = buildForwardBody(route, bodyResult, user.id, c.get("orgId"));
    const workerPath = `/v1/${route}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const assertionPayload = await buildAssertionPayload({
      timestamp,
      nonce,
      method: "POST",
      path: workerPath,
      body: forwardBody,
    });

    const origin = c.req.raw.headers.get("Origin") ?? c.env.APP_URL ?? "";

    const upstream = await fetch(`${workerOrigin}${workerPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Ventora-Timestamp": timestamp,
        "X-Ventora-Nonce": nonce,
        "X-Ventora-Signature": await hmacHex(assertionPayload, secret),
      },
      body: JSON.stringify(forwardBody),
    }).catch((err: unknown) => {
      // A worker we cannot even reach is an actionable outage. Report the thrown
      // fetch error, tagged to the surface and route only — never the body.
      captureBackgroundException(err, "ai-cs", { step: "worker-proxy", route });
      return null;
    });

    if (!upstream) {
      return c.json({ error: "AI support unavailable" }, 502);
    }

    // Chat responses are Server-Sent Events. Stream the body through unbuffered
    // so token deltas reach the browser as they arrive.
    if (route === "chat") {
      // 404 must be passed through so the @ventora/ai-cs widget can detect a
      // stale/expired session and trigger its session-recovery flow. All other
      // non-2xx statuses collapse to 502.
      if (upstream.status === 404) {
        return c.json({ error: "Session not found" }, 404);
      }
      if (!upstream.ok || !upstream.body) {
        captureBackgroundException(
          new Error(`AI-CS worker returned ${upstream.status} for ${route}`),
          "ai-cs",
          { step: "worker-proxy", route, status: String(upstream.status) },
        );
        return c.json({ error: "AI support unavailable" }, 502);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (!upstream.ok) {
      captureBackgroundException(
        new Error(`AI-CS worker returned ${upstream.status} for ${route}`),
        "ai-cs",
        { step: "worker-proxy", route, status: String(upstream.status) },
      );
      return c.json({ error: "AI support unavailable" }, 502);
    }

    const responseText = await upstream.text();
    return new Response(responseText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ---------------------------------------------------------------------------
// Context data, consumeNonce, and buildGrantpipeAppContext are exported for
// use by context-routes.ts (the public HMAC-authenticated context endpoint).
// ---------------------------------------------------------------------------

export async function consumeNonce(
  nonce: string,
  timestamp: string,
  db: NonNullable<AppEnv["Bindings"]["MARKETING_DB"]>,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) return false;
  const expiresAt = timestampMs + MAX_SKEW_MS;

  try {
    await db.prepare("DELETE FROM ai_cs_nonces WHERE expires_at <= ?").bind(nowMs).run();

    const result = (await db
      .prepare("INSERT OR IGNORE INTO ai_cs_nonces (nonce, expires_at) VALUES (?, ?)")
      .bind(nonce, expiresAt)
      .run()) as { success: boolean; meta: { changes: number } };

    if (!result.success) return false;
    return result.meta.changes === 1;
  } catch {
    return false;
  }
}

function resolveWorkflowPath(article: (typeof appKnowledge.helpArticles)[number]): string {
  return article.cta.hash ? `${article.cta.to}#${article.cta.hash}` : article.cta.to;
}

type GrantpipeAppContextOptions = {
  currentPath?: string;
};

function normalizeCurrentPath(currentPath: string | undefined): string | undefined {
  if (!currentPath) return undefined;

  let pathname: string;
  try {
    pathname = new URL(currentPath, "https://app.grantpipe.com").pathname;
  } catch {
    pathname = currentPath;
  }

  const withoutAppPrefix = pathname.startsWith("/app/") ? pathname.slice(4) : pathname;
  if (withoutAppPrefix.length > 1 && withoutAppPrefix.endsWith("/")) {
    return withoutAppPrefix.slice(0, -1);
  }
  return withoutAppPrefix;
}

function routeMatchesPath(route: string, currentPath: string): boolean {
  const routeParts = route.split("/").filter(Boolean);
  const pathParts = currentPath.split("/").filter(Boolean);
  if (routeParts.length !== pathParts.length) return false;

  return routeParts.every((part, index) => {
    const pathPart = pathParts[index];
    return part.startsWith("$") || part === pathPart;
  });
}

function selectScopedHowtoKeys(
  features: typeof FEATURE_KNOWLEDGE,
  currentPath: string | undefined,
): Set<string> | undefined {
  const normalizedPath = normalizeCurrentPath(currentPath);
  if (!normalizedPath) return undefined;

  const keys = new Set(CORE_AI_CS_HOWTO_KEYS);
  const currentFeature = features.find((feature) =>
    routeMatchesPath(feature.route, normalizedPath),
  );
  if (currentFeature) {
    keys.add(currentFeature.key);
    for (const relatedKey of currentFeature.related ?? []) {
      keys.add(relatedKey);
    }
  }
  return keys;
}

export function buildGrantpipeAppContext(
  memberRole?: Role | null,
  options: GrantpipeAppContextOptions = {},
) {
  const helpArticles =
    memberRole === undefined
      ? appKnowledge.helpArticles
      : appKnowledge.helpArticles.filter((article) => canUseHelpArticle(article, memberRole));
  const routes =
    memberRole === undefined
      ? appKnowledge.routes
      : appKnowledge.routes.filter(
          (route) => memberRole !== null && route.roles.includes(memberRole),
        );

  const sources = helpArticles.map((article) => ({
    id: article.key,
    title: article.title,
    url: buildAppUrl("https://app.grantpipe.com", `/help#${article.key}`),
    excerpt: `${article.summary} ${article.steps.join(" ")}`,
  }));

  const navigation = routes.map((route) => ({
    label: route.label,
    path: route.path,
    // Screen-reach only: who can OPEN the screen, not who can change things on
    // it. Action permission lives in the how-to prerequisites and the role
    // capability FAQs, derived from the permission map.
    description: `Roles that can open the ${route.label} screen: ${route.roles.join(", ")}.`,
  }));

  const workflow = helpArticles.map((article) => ({
    id: article.key,
    label: article.title,
    status: "next" as const,
    path: resolveWorkflowPath(article),
  }));

  const knownFeatures = filterFeaturesByRole(FEATURE_KNOWLEDGE, memberRole);
  const { concepts, howtos: allHowtos, faqs } = buildTeachingFields(knownFeatures);
  const scopedHowtoKeys = selectScopedHowtoKeys(knownFeatures, options.currentPath);
  const howtos =
    scopedHowtoKeys === undefined
      ? allHowtos
      : allHowtos.filter((howto) => scopedHowtoKeys.has(howto.id));
  // Prepend the role capability FAQs so they survive the worker's 40-FAQ slice
  // and answer "what can a viewer/auditor do?" from the authoritative map.
  const teachingFaqs = [...buildRoleCapabilityFaqs(), ...faqs];

  return {
    assistantId: "ai-cs" as const,
    appId: APP_ID,
    appName: "GrantPipe",
    authenticatedOnly: true as const,
    description:
      "Authenticated in-app support for GrantPipe, the unified donor management, native accounting, and grant compliance platform for mid-sized nonprofits. Helps staff with donor tracking, grant lifecycle management, restricted fund accounting, native accounting records, federal compliance (2 CFR Part 200 Uniform Guidance), and onboarding. GrantPipe does not connect to QuickBooks Online right now. Answer directly in user-facing language. Do not reveal internal reasoning, context selection, source-matching steps, or hidden analysis.",
    sources,
    navigation,
    workflow,
    concepts,
    howtos,
    faqs: teachingFaqs,
    meetingLinks: [
      {
        id: "quick-call",
        label: "15-min quick call",
        url: FOUNDER_BOOKING_URLS.quickCall,
        description: "Short call with the founder for account questions or escalated support.",
      },
      {
        id: "onboarding-call",
        label: "60-min onboarding call",
        url: FOUNDER_BOOKING_URLS.onboardingCall,
        description: "Guided setup session to get your organization fully configured.",
      },
    ] satisfies AiSdrMeetingLink[],
  };
}

/**
 * Proxy router — POST /v1/sessions, /v1/chat, /v1/escalations.
 * Must be mounted AFTER the session middleware so user identity is available.
 */
export const aiCsRoutes = aiCsRouter;
