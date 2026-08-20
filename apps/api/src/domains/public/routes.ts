import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { captureSanitizedPostHogEvent } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import {
  authMemoryFallback,
  checkRateLimit,
  createDurableObjectRateLimitStore,
  type AtomicRateLimitStore,
  type RateLimitStore,
} from "../../lib/auth-rate-limit";
import { jsonBodyLimit } from "../../middleware/json-body-limit";

const ANALYTICS_MAX_BODY_BYTES = 8_192;
const MAX_ATTRIBUTION_VALUE_LENGTH = 200;
const MAX_URL_VALUE_LENGTH = 500;

const attributionValue = z.string().trim().max(MAX_ATTRIBUTION_VALUE_LENGTH);
const urlValue = z.string().trim().max(MAX_URL_VALUE_LENGTH);
const outboundAnalyticsSchema = z.object({
  event: z.enum(["outbound_landing_viewed", "outbound_signup_completed"]),
  properties: z
    .object({
      method: attributionValue.optional(),
      auto_signin: z.boolean().optional(),
      has_invite: z.boolean().optional(),
      ref: attributionValue.optional(),
      landing_path: urlValue.optional(),
      landing_page: urlValue.optional(),
      utm_source: attributionValue.optional(),
      utm_medium: attributionValue.optional(),
      utm_campaign: attributionValue.optional(),
      utm_content: attributionValue.optional(),
      utm_term: attributionValue.optional(),
      msclkid: attributionValue.optional(),
      gclid: attributionValue.optional(),
      source_section: attributionValue.optional(),
      cta_page_family: attributionValue.optional(),
      cta_buyer_stage: attributionValue.optional(),
      cta_placement: attributionValue.optional(),
      cta_intent: attributionValue.optional(),
      ve_product: attributionValue.optional(),
      ve_icp: attributionValue.optional(),
      ve_campaign_id: attributionValue.optional(),
      ve_variant: attributionValue.optional(),
      ve_step: attributionValue.optional(),
      ve_offer: attributionValue.optional(),
      ve_instantly_campaign_id: attributionValue.optional(),
      ve_lead_list_id: attributionValue.optional(),
      ve_sender_pool: attributionValue.optional(),
      ve_sequence_day: attributionValue.optional(),
      ve_branding: attributionValue.optional(),
    })
    .strict()
    .optional(),
});

type OutboundAnalyticsInput = z.infer<typeof outboundAnalyticsSchema>;

function buildOutboundDistinctId(campaignId: string, variant: unknown) {
  if (typeof variant === "string" && variant) {
    return `outbound:${campaignId}:${variant}`;
  }
  return `outbound:${campaignId}`;
}

async function parseOutboundAnalyticsRequest(c: {
  req: { text: () => Promise<string>; header: (name: string) => string | undefined };
}): Promise<
  { ok: true; input: OutboundAnalyticsInput } | { ok: false; status: 400 | 413; error: string }
> {
  const rawBody = await c.req.text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const parsed = outboundAnalyticsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid analytics payload" };
  }

  return { ok: true, input: parsed.data };
}

async function checkAnalyticsRateLimit(
  store: RateLimitStore | AtomicRateLimitStore,
  ip: string,
): Promise<boolean> {
  const key = `public-marketing:analytics:${ip}`;
  return checkRateLimit(store, key, "public-analytics", (error) =>
    captureBackgroundException(error, "public-marketing", {
      step: "analytics_rate_limit",
    }),
  );
}

export const publicMarketingRoutes = new Hono<AppEnv>()
  .get("/launch-promo", async (c) => {
    return c.json(
      {
        activeCode: null,
        percentOff: 0,
        remaining: 0,
        total: 0,
        redemptions: {},
        totalRedemptions: 0,
        phaseIndex: 0,
        phaseCount: 0,
        updatedAt: new Date().toISOString(),
        active: false,
        endsAt: null,
        deadlineLabel: "",
      },
      200,
      {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    );
  })
  .post(
    "/analytics",
    jsonBodyLimit(ANALYTICS_MAX_BODY_BYTES),
    async (c, next) => {
      const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
      const store = c.env.AUTH_RATE_LIMITER
        ? createDurableObjectRateLimitStore(c.env.AUTH_RATE_LIMITER)
        : (c.env.RATE_LIMIT_KV ?? authMemoryFallback);
      if (!(await checkAnalyticsRateLimit(store, ip))) {
        return c.json({ error: "Too many requests" }, 429);
      }
      await next();
    },
    async (c) => {
      const parsed = await parseOutboundAnalyticsRequest(c);
      if (!parsed.ok) {
        return c.json({ error: parsed.error }, parsed.status);
      }

      const input = parsed.input;
      if (!input.properties?.ve_campaign_id) {
        return c.json({ error: "Campaign attribution is required" }, 400);
      }
      const properties = {
        ...input.properties,
        source_app: "signup_api",
        app_surface: "app",
        environment: c.env.SENTRY_ENVIRONMENT ?? "production",
      };

      if (!c.env.POSTHOG_API_KEY) {
        return c.json({ ok: true, skipped: "posthog_not_configured" });
      }

      try {
        await captureSanitizedPostHogEvent(c.env, {
          distinctId: buildOutboundDistinctId(
            input.properties.ve_campaign_id,
            properties.ve_variant,
          ),
          eventName: input.event,
          payload: properties,
        });
      } catch (error) {
        console.error("[public-marketing] analytics capture failed", error);
        captureBackgroundException(error, "public-marketing", {
          step: "outbound_analytics",
          analytics_event: input.event,
        });
      }

      return c.json({ ok: true });
    },
  );
