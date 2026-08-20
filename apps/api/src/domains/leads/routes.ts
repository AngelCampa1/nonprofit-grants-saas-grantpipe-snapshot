import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  LEAD_SIGNUP_ACCEPTED_RESPONSE,
  leadSignupSchema,
  leadUnsubscribeSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { captureApiException, captureBackgroundException } from "../../lib/sentry";
import { upsertLead, unsubscribeLead } from "./service";
import { createD1MarketingStore } from "./marketing-store";
import { getIntegrations } from "../../lib/integrations";
import { verifyTurnstile } from "../../lib/turnstile";
import {
  authMemoryFallback,
  checkRateLimit,
  createDurableObjectRateLimitStore,
  hashRateLimitIdentity,
  _resetAuthRateLimit,
  type AtomicRateLimitStore,
  type RateLimitStore,
} from "../../lib/auth-rate-limit";
import { jsonBodyLimit } from "../../middleware/json-body-limit";

// -------- rate limiting --------

export type { RateLimitStore } from "../../lib/auth-rate-limit";
export { MemoryRateLimitStore } from "../../lib/auth-rate-limit";
type LeadsRateLimitStore = RateLimitStore | AtomicRateLimitStore;
const PUBLIC_LEADS_MAX_BODY_BYTES = 16_384;

export function _resetLeadsRateLimit(): void {
  _resetAuthRateLimit();
}

function normalizeReferringDomain(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("@") || /[\s\r\n]/.test(trimmed)) return undefined;

  try {
    return new URL(trimmed).hostname.toLowerCase() || undefined;
  } catch {
    // Fall through to bare-domain validation.
  }

  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function getMarketingStore(c: { env: AppEnv["Bindings"] }) {
  if (!c.env.MARKETING_DB) {
    throw new Error("MARKETING_DB binding is not configured");
  }
  return createD1MarketingStore(c.env.MARKETING_DB);
}

export async function checkLeadsRateLimit(
  store: LeadsRateLimitStore,
  ip: string,
): Promise<boolean> {
  return checkRateLimit(store, `leads-ip:${ip}`, "leads-ip");
}

export async function checkLeadsEmailRateLimit(
  store: LeadsRateLimitStore,
  email: string,
  secret: string,
): Promise<boolean> {
  const identity = await hashRateLimitIdentity(email, secret);
  return checkRateLimit(store, `leads-email:${identity}`, "leads-email");
}

// -------- public routes --------

export const publicLeadsRoutes = new Hono<AppEnv>()
  .post(
    "/",
    jsonBodyLimit(PUBLIC_LEADS_MAX_BODY_BYTES),
    zValidator("json", leadSignupSchema),
    async (c) => {
      const ip =
        c.req.header("cf-connecting-ip") ||
        (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
        "unknown";

      const input = c.req.valid("json");

      // 1. Honeypot: silently succeed with no side effects
      if (input.companyWebsite && input.companyWebsite.trim().length > 0) {
        return c.json(LEAD_SIGNUP_ACCEPTED_RESPONSE);
      }

      // 2. Turnstile verification — runs before the stateful throttles so an
      //    unsolved challenge cannot consume a victim's per-email/IP budget.
      if (
        !(await verifyTurnstile(
          input.turnstileToken,
          c.env.TURNSTILE_SECRET_KEY,
          ip,
          c.env.INTEGRATION_MODE,
          c.env.SENTRY_ENVIRONMENT,
        ))
      ) {
        return c.json({ error: "Verification failed" }, 403);
      }

      const store: LeadsRateLimitStore = c.env.AUTH_RATE_LIMITER
        ? createDurableObjectRateLimitStore(c.env.AUTH_RATE_LIMITER)
        : (c.env.RATE_LIMIT_KV ?? authMemoryFallback);
      const onRateLimitError = (error: unknown) =>
        captureBackgroundException(error, "leads", { step: "rate_limit" });

      // 3. IP rate limit
      if (!(await checkRateLimit(store, `leads-ip:${ip}`, "leads-ip", onRateLimitError))) {
        return c.json({ error: "Too many requests" }, 429);
      }

      // 4. Per-email throttle
      const emailIdentity = await hashRateLimitIdentity(input.email, c.env.BETTER_AUTH_SECRET);
      if (
        !(await checkRateLimit(
          store,
          `leads-email:${emailIdentity}`,
          "leads-email",
          onRateLimitError,
        ))
      ) {
        return c.json({ error: "Too many requests" }, 429);
      }

      try {
        const marketingStore = getMarketingStore(c);
        const { lead, deliveryState } = await upsertLead(
          marketingStore,
          c.env,
          input,
          (delivery) => {
            try {
              c.executionCtx.waitUntil(delivery);
            } catch {
              void delivery.catch((error) =>
                captureBackgroundException(error, "leads", {
                  step: "lead-magnet-delivery-dispatch",
                }),
              );
            }
          },
        );
        const analytics = getIntegrations(c.get("db"), c.env).analytics;
        const leadPayload = {
          source_app: "api",
          lead_type: input.magnetSlug ? "lead_magnet" : "waitlist",
          page_path: input.sourcePage,
          landing_page: input.sourcePage,
          utm_source: input.utm?.utmSource,
          utm_medium: input.utm?.utmMedium,
          utm_campaign: input.utm?.utmCampaign,
          referring_domain: normalizeReferringDomain(input.utm?.referredBy),
          activation_type: input.magnetSlug,
        };
        await analytics
          .capture({
            orgId: `lead:${lead.id}`,
            eventName: ANALYTICS_EVENTS.leadCreated,
            payload: leadPayload,
          })
          .catch((error: unknown) => {
            captureBackgroundException(error, "leads", {
              step: "lead_created_analytics",
              analytics_event: ANALYTICS_EVENTS.leadCreated,
            });
          });
        if (input.magnetSlug) {
          await analytics
            .capture({
              orgId: `lead:${lead.id}`,
              eventName: ANALYTICS_EVENTS.leadMagnetUnlocked,
              payload: leadPayload,
            })
            .catch((error: unknown) => {
              captureBackgroundException(error, "leads", {
                step: "lead_magnet_unlocked_analytics",
                analytics_event: ANALYTICS_EVENTS.leadMagnetUnlocked,
              });
            });
        }
        if (deliveryState === "unsubscribed" || deliveryState === "resend_unavailable") {
          await analytics
            .capture({
              orgId: `lead:${lead.id}`,
              eventName: ANALYTICS_EVENTS.leadMagnetDeliverySuppressed,
              payload: leadPayload,
            })
            .catch((error: unknown) => {
              captureBackgroundException(error, "leads", {
                step: "lead_magnet_delivery_suppressed_analytics",
                analytics_event: ANALYTICS_EVENTS.leadMagnetDeliverySuppressed,
              });
            });
        }
        return c.json(LEAD_SIGNUP_ACCEPTED_RESPONSE);
      } catch (err) {
        console.error("[leads] signup failed", err);
        captureApiException(err, c, { status: 500 });
        return c.json({ error: "Failed to save lead" }, 500);
      }
    },
  )
  .post(
    "/unsubscribe",
    jsonBodyLimit(PUBLIC_LEADS_MAX_BODY_BYTES),
    zValidator("json", leadUnsubscribeSchema),
    async (c) => {
      const ip =
        c.req.header("cf-connecting-ip") ||
        (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
        "unknown";
      const store: LeadsRateLimitStore = c.env.AUTH_RATE_LIMITER
        ? createDurableObjectRateLimitStore(c.env.AUTH_RATE_LIMITER)
        : (c.env.RATE_LIMIT_KV ?? authMemoryFallback);
      if (!(await checkRateLimit(store, `leads-ip:${ip}`, "leads-ip"))) {
        return c.json({ error: "Too many requests" }, 429);
      }

      try {
        const marketingStore = getMarketingStore(c);
        const { token } = c.req.valid("json");
        const secret = c.env.LEAD_UNSUBSCRIBE_SECRET ?? c.env.BETTER_AUTH_SECRET;
        const result = await unsubscribeLead(marketingStore, token, secret, c.env);
        return c.json(result);
      } catch (err) {
        console.error("[leads] unsubscribe failed", err);
        captureApiException(err, c, { status: 500 });
        return c.json({ error: "Failed to unsubscribe" }, 500);
      }
    },
  );
