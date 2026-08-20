import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  canUseProposalReportDrafting,
  draftingAssistantGenerateSchema,
  draftingAssistantResponseSchema,
  getEffectivePlanTier,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requireAllPermissions } from "../../middleware/require-role";
import { generateDraft } from "./service";

function countBucket(value: number): string {
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

async function captureDraftingAssistantEvent(
  c: Context<AppEnv>,
  params: {
    eventName: string;
    operation: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: {
        actorId: c.get("user")!.id,
        surface: "api",
        operation: params.operation,
        ...params.payload,
      },
    });
  } catch (error) {
    captureBackgroundException(error, "drafting_assistant", {
      telemetry: "analytics_capture",
      operation: params.operation,
    });
  }
}

export const draftingAssistantRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const orgSubscription = c.get("orgSubscription");
    const tier = getEffectivePlanTier({
      planTier: orgSubscription?.planTier,
      subscriptionStatus: orgSubscription?.subscriptionStatus,
      trialEndsAt: orgSubscription?.trialEndsAt,
    });
    if (!canUseProposalReportDrafting(tier)) {
      return c.json({ error: "insufficient_plan", required: "growth", current: tier }, 402);
    }
    await next();
  })
  .post(
    "/generate",
    requireAllPermissions([
      ["grants", "edit"],
      ["reports", "view"],
    ]),
    zValidator("json", draftingAssistantGenerateSchema),
    async (c) => {
      const input = c.req.valid("json");
      const bindings = c.env ?? {};
      await captureDraftingAssistantEvent(c, {
        eventName: ANALYTICS_EVENTS.draftingAssistantStarted,
        operation: "generate",
        payload: {
          draft_type: input.draftType,
          prompt_length_bucket: countBucket(input.userPrompt.length),
          period_present: Boolean(input.reportPeriodStart || input.reportPeriodEnd),
        },
      });

      try {
        const response = draftingAssistantResponseSchema.parse(
          await generateDraft(c.get("db"), {
            orgId: c.get("orgId")!,
            actorId: c.get("user")!.id,
            appUrl: bindings.APP_URL,
            openRouterApiKey: bindings.OPENROUTER_API_KEY,
            input,
          }),
        );
        await captureDraftingAssistantEvent(c, {
          eventName: ANALYTICS_EVENTS.draftingAssistantGenerated,
          operation: "generate",
          payload: {
            draft_type: response.draftType,
            citation_count_bucket: countBucket(response.citations.length),
            section_count_bucket: countBucket(response.sections.length),
            model_id: response.modelId,
            prompt_version: response.promptVersion,
          },
        });
        return c.json(response);
      } catch (error) {
        await captureDraftingAssistantEvent(c, {
          eventName: ANALYTICS_EVENTS.draftingAssistantFailed,
          operation: "generate",
          payload: {
            draft_type: input.draftType,
            failure_type: error instanceof Error ? error.name : "unknown",
          },
        });
        throw error;
      }
    },
  );
