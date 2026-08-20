import { createMiddleware } from "hono/factory";
import { and, eq, isNull } from "drizzle-orm";
import {
  externalReviewSessions,
  externalReviewers,
  externalReviewAuditEvents,
} from "@grantpipe/db";
import type { AppEnv } from "../types";
import { captureBackgroundException } from "../lib/sentry";
import {
  verifyPortalSessionCredential,
  hashPortalTokenForStorage,
} from "../domains/external-reviewers/tokens";
import { hmacSha256Hex } from "../lib/hmac";

const COOKIE_NAME = "gp_portal_session";

/**
 * Writes a portal audit event to the DB. This is a fire-and-forget helper —
 * callers must not await it when they want non-blocking behaviour.
 */
async function recordPortalAuditEvent(
  db: AppEnv["Variables"]["db"],
  sessionId: string,
  reviewerId: string,
  orgId: string,
  eventType: string,
  ipHash: string | null,
  userAgentHash: string | null,
): Promise<void> {
  await db.insert(externalReviewAuditEvents).values({
    orgId,
    sessionId,
    reviewerId,
    eventType,
    ipHash,
    userAgentHash,
  });
}

/**
 * Middleware that authenticates external reviewers via rotated session credentials.
 *
 * Token sources (checked in order):
 *   1. `gp_portal_session` HttpOnly cookie (normal requests)
 *   2. `?token=` query parameter (legacy transport for an already-rotated credential)
 *
 * On success it sets the following context variables:
 *   - `portalSessionId`  — session UUID
 *   - `portalReviewerId` — reviewer UUID
 *   - `portalOrgId`      — org UUID
 *   - `portalSession`    — full session row
 *   - `portalReviewer`   — full reviewer row
 *
 * It also refreshes the cookie on every response (rolling session window)
 * and logs a `session_open` audit event as a fire-and-forget side-effect.
 */
export const portalReviewerMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // ------------------------------------------------------------------
  // 1. Extract the rotated credential from cookie or a legacy query transport.
  // ------------------------------------------------------------------
  const cookieHeader = c.req.header("cookie") ?? "";
  const cookieToken = parseCookieValue(cookieHeader, COOKIE_NAME);
  const rawToken = c.req.query("token") ?? cookieToken ?? null;

  if (!rawToken) {
    return c.json({ error: "Portal authentication required" }, 401);
  }

  // ------------------------------------------------------------------
  // 2. Verify the scoped session credential (also checks expiry).
  // ------------------------------------------------------------------
  const secret = c.env.PORTAL_TOKEN_SECRET ?? c.env.BETTER_AUTH_SECRET; // PORTAL_TOKEN_SECRET should be set in production; falls back to BETTER_AUTH_SECRET
  const verified = await verifyPortalSessionCredential(rawToken, secret);

  if (!verified) {
    return c.json({ error: "Invalid or expired portal session" }, 401);
  }

  const { sessionId } = verified;

  // ------------------------------------------------------------------
  // 3. Hash the raw token and look up the session row
  // ------------------------------------------------------------------
  const tokenHash = await hashPortalTokenForStorage(rawToken, secret);

  const db = c.get("db");

  const session = await db.query.externalReviewSessions.findFirst({
    where: eq(externalReviewSessions.id, sessionId),
  });

  if (
    !session ||
    session.tokenHash !== tokenHash ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date()
  ) {
    return c.json({ error: "Invalid or expired portal session" }, 401);
  }

  // ------------------------------------------------------------------
  // 4. Fetch the reviewer record
  // ------------------------------------------------------------------
  const reviewer = await db.query.externalReviewers.findFirst({
    where: and(
      eq(externalReviewers.id, session.reviewerId),
      eq(externalReviewers.orgId, session.orgId),
      isNull(externalReviewers.deletedAt),
    ),
  });

  if (!reviewer || reviewer.orgId !== session.orgId || reviewer.deletedAt !== null) {
    return c.json({ error: "Invalid or expired portal session" }, 401);
  }

  // ------------------------------------------------------------------
  // 5. Set context variables
  // ------------------------------------------------------------------
  c.set("portalSessionId", session.id);
  c.set("portalReviewerId", session.reviewerId);
  c.set("portalOrgId", session.orgId);
  c.set("portalSession", session);
  c.set("portalReviewer", reviewer);

  // ------------------------------------------------------------------
  // 6. Fire-and-forget: update lastAccessedAt + record audit event
  // ------------------------------------------------------------------
  const rawIp = c.req.header("cf-connecting-ip") ?? "";
  const rawUa = c.req.header("user-agent") ?? "";
  const ipHash = rawIp ? await hmacSha256Hex(secret, `ip:${rawIp}`) : null;
  const uaHash = rawUa ? await hmacSha256Hex(secret, `ua:${rawUa}`) : null;

  const lastAccessedWrite = db
    .update(externalReviewSessions)
    .set({ lastAccessedAt: new Date() })
    .where(eq(externalReviewSessions.id, session.id))
    .catch((error: unknown) => {
      captureBackgroundException(error, "external-reviewer-portal", {
        step: "last_accessed",
      });
    });

  const sessionOpenAuditWrite = recordPortalAuditEvent(
    db,
    session.id,
    session.reviewerId,
    session.orgId,
    "session_open",
    ipHash,
    uaHash,
  ).catch((error: unknown) => {
    captureBackgroundException(error, "external-reviewer-portal", {
      step: "session_open_audit",
    });
  });

  await Promise.all([lastAccessedWrite, sessionOpenAuditWrite]);

  // ------------------------------------------------------------------
  // 7. Continue to the handler
  // ------------------------------------------------------------------
  await next();

  // ------------------------------------------------------------------
  // 8. Set rolling session cookie on the response
  // ------------------------------------------------------------------
  const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/public/portal; Max-Age=${maxAge}`,
  );
});

/**
 * Parses a single named cookie from a raw `Cookie:` header value.
 * Returns the cookie value or null if not found.
 */
function parseCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === name) {
      return trimmed.slice(eqIdx + 1).trim();
    }
  }
  return null;
}
