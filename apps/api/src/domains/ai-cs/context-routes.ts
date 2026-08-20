import { Hono } from "hono";
import { orgMembers } from "@grantpipe/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Role } from "@grantpipe/shared";
import type { AppEnv } from "../../types.js";
import { buildAssertionPayload, buildGrantpipeAppContext, consumeNonce } from "./routes.js";

/**
 * Public AI-CS context endpoint — called server-to-server by the Ventora
 * AI-CS Worker to fetch GrantPipe app context before answering support
 * questions. Authenticated by HMAC (AI_CS_CONTEXT_SECRET) not user cookies.
 * Must be mounted BEFORE the session middleware in app.ts.
 */

const MAX_SKEW_MS = 5 * 60 * 1_000;

type HmacHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

function readHmacHeaders(headers: Headers): HmacHeaders | null {
  const timestamp = headers.get("X-Ventora-Timestamp");
  const nonce = headers.get("X-Ventora-Nonce");
  const signature = headers.get("X-Ventora-Signature");
  return timestamp && nonce && signature ? { timestamp, nonce, signature } : null;
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
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyHmac(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacHex(payload, secret);
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(signature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: length-guarded above
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

const APP_ID = "grantpipe";

async function resolveContextMembership(c: {
  get: <K extends keyof AppEnv["Variables"]>(key: K) => AppEnv["Variables"][K];
  req: { query: (key: string) => string | undefined };
}): Promise<{ orgId: string; role: Role } | null> {
  const db = c.get("db");
  const userId = c.req.query("userId");
  if (!db || !userId) return null;

  const requestedOrgId = c.req.query("orgId");
  const member = requestedOrgId
    ? await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, requestedOrgId),
          isNull(orgMembers.deletedAt),
        ),
      })
    : await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.userId, userId), isNull(orgMembers.deletedAt)),
        orderBy: [desc(orgMembers.joinedAt)],
      });

  return member ? { orgId: member.orgId, role: member.role as Role } : null;
}

export const aiCsContextRoutes = new Hono<AppEnv>();

aiCsContextRoutes.get("/context", async (c) => {
  const appId = c.req.query("appId");
  if (appId !== APP_ID) {
    return c.json({ error: "Unknown app" }, 404);
  }

  const secret = c.env.AI_CS_CONTEXT_SECRET?.trim();
  if (!secret || !c.env.MARKETING_DB) {
    return c.json({ error: "App context unavailable" }, 503);
  }

  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const headers = readHmacHeaders(c.req.raw.headers);
  if (!headers) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const requestUrl = new URL(c.req.url);
  const path = `${requestUrl.pathname}${requestUrl.search}`;

  // The AI-CS worker signs only { appId, userId } for context requests.
  // currentPath and orgId travel in the query string so the path+search still
  // binds them into the signature without changing the canonical body.
  const currentPath = c.req.query("currentPath");
  const requestBody = { appId, userId };

  const requestPayload = await buildAssertionPayload({
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    method: "GET",
    path,
    body: requestBody,
  });

  const verified = await verifyHmac(requestPayload, headers.signature, secret);
  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const timestampMs = Date.parse(headers.timestamp);
  if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const nonceAccepted = await consumeNonce(headers.nonce, headers.timestamp, c.env.MARKETING_DB);
  if (!nonceAccepted) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const membership = await resolveContextMembership(c);
  if (!membership) {
    return c.json({ error: "No organization membership" }, 403);
  }

  const body = buildGrantpipeAppContext(membership.role, {
    currentPath: currentPath ?? "/dashboard",
  });
  const responseTimestamp = new Date().toISOString();
  const responseNonce = crypto.randomUUID();
  const responsePayload = await buildAssertionPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path,
    body,
  });

  return c.json(body, 200, {
    "Cache-Control": "private, max-age=300",
    "X-Ventora-Timestamp": responseTimestamp,
    "X-Ventora-Nonce": responseNonce,
    "X-Ventora-Signature": await hmacHex(responsePayload, secret),
  });
});
