import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { submitFeedbackSchema, publicSubmitFeedbackSchema } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";
import { sendFeedbackEmail, type FeedbackContext } from "./service";
import { getOrgProfile } from "../org/service";
import { verifyTurnstile } from "../../lib/turnstile";
import {
  authMemoryFallback,
  checkRateLimit as consumeRateLimit,
  createDurableObjectRateLimitStore,
  hashRateLimitIdentity,
  _resetAuthRateLimit,
  type RateLimitStore,
  type AtomicRateLimitStore,
} from "../../lib/auth-rate-limit";
import { captureBackgroundException } from "../../lib/sentry";
import { jsonBodyLimit } from "../../middleware/json-body-limit";

const publicFeedbackSchema = publicSubmitFeedbackSchema;

// -------- authenticated feedback (mounted under protected routes in app.ts) --------
export const feedbackRoutes = new Hono<AppEnv>().post(
  "/",
  requireRole("viewer"),
  zValidator("json", submitFeedbackSchema),
  async (c) => {
    const db = c.get("db");
    const user = c.get("user");
    const orgId = c.get("orgId");
    const data = c.req.valid("json");

    const context: FeedbackContext = {
      orgId: orgId ?? undefined,
      userId: user?.id,
    };

    if (orgId) {
      try {
        const profile = await getOrgProfile(db, { orgId });
        context.orgName = profile.name;
        if (profile.planTier) context.planTier = profile.planTier;
      } catch {
        // fall back to orgId only
      }
    }

    try {
      await sendFeedbackEmail(c.env, data, context, db);
      return c.json({ success: true });
    } catch (error) {
      console.error("[feedback] failed to send", error);
      throw error;
    }
  },
);

// -------- public feedback (mounted before session middleware in app.ts) --------
export type { RateLimitStore } from "../../lib/auth-rate-limit";
type FeedbackRateLimitStore = RateLimitStore | AtomicRateLimitStore;
const PUBLIC_FEEDBACK_MAX_BODY_BYTES = 16_384;

export function _resetPublicFeedbackRateLimit(): void {
  _resetAuthRateLimit();
}

export async function checkRateLimit(store: FeedbackRateLimitStore, ip: string): Promise<boolean> {
  return consumeRateLimit(store, `feedback-ip:${ip}`, "feedback-ip");
}

export async function checkFeedbackEmailRateLimit(
  store: FeedbackRateLimitStore,
  email: string,
  secret: string,
): Promise<boolean> {
  const identity = await hashRateLimitIdentity(email, secret);
  return consumeRateLimit(store, `feedback-email:${identity}`, "feedback-email");
}

export async function checkOptionalFeedbackEmailRateLimit(
  store: FeedbackRateLimitStore,
  email: string | undefined,
  secret: string,
  onError?: (error: unknown) => void,
): Promise<boolean> {
  if (!email) return true;
  const identity = await hashRateLimitIdentity(email, secret);
  return consumeRateLimit(store, `feedback-email:${identity}`, "feedback-email", onError);
}

export const publicFeedbackRoutes = new Hono<AppEnv>().post(
  "/",
  jsonBodyLimit(PUBLIC_FEEDBACK_MAX_BODY_BYTES),
  zValidator("json", publicFeedbackSchema),
  async (c) => {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
    const data = c.req.valid("json");

    // 1. Honeypot: silently succeed with no side effects
    if (data.companyWebsite && data.companyWebsite.trim().length > 0) {
      return c.json({ success: true });
    }

    // 2. Turnstile verification — runs before the stateful throttles so an
    //    unsolved challenge cannot consume a victim's per-email/IP budget.
    if (
      !(await verifyTurnstile(
        data.turnstileToken,
        c.env.TURNSTILE_SECRET_KEY,
        ip,
        c.env.INTEGRATION_MODE,
        c.env.SENTRY_ENVIRONMENT,
      ))
    ) {
      return c.json({ error: "Verification failed" }, 403);
    }

    const store: FeedbackRateLimitStore = c.env.AUTH_RATE_LIMITER
      ? createDurableObjectRateLimitStore(c.env.AUTH_RATE_LIMITER)
      : (c.env.RATE_LIMIT_KV ?? authMemoryFallback);
    const onRateLimitError = (error: unknown) =>
      captureBackgroundException(error, "public-feedback", { step: "rate_limit" });

    // 3. IP rate limit
    if (!(await consumeRateLimit(store, `feedback-ip:${ip}`, "feedback-ip", onRateLimitError))) {
      return c.json({ error: "Too many requests" }, 429);
    }

    // 4. Per-email throttle
    if (
      !(await checkOptionalFeedbackEmailRateLimit(
        store,
        data.reporterEmail,
        c.env.BETTER_AUTH_SECRET,
        onRateLimitError,
      ))
    ) {
      return c.json({ error: "Too many requests" }, 429);
    }

    try {
      await sendFeedbackEmail(c.env, data, undefined);
      return c.json({ success: true });
    } catch (error) {
      console.error("[feedback:public] failed to send", error);
      throw error;
    }
  },
);
