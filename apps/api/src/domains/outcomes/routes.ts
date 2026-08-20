import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  createOutcomeIndicatorSchema,
  createOutcomeSchema,
  outcomeListQuerySchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requirePlanTier } from "../../middleware/paywall";
import { requirePermission } from "../../middleware/require-role";
import { createOutcome, createOutcomeIndicator, listOutcomes } from "./service";

async function captureOutcomeEvent(
  c: Context<AppEnv>,
  params: { eventName: string; operation: string; payload: Record<string, unknown> },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: { actorId: c.get("user")!.id, surface: "api", ...params.payload },
    });
  } catch (error) {
    captureBackgroundException(error, "outcomes", {
      telemetry: "analytics_capture",
      operation: params.operation,
    });
  }
}

export const outcomeRoutes = new Hono<AppEnv>()
  .use("*", requirePlanTier("growth"))
  .get(
    "/",
    requirePermission("programs", "view"),
    zValidator("query", outcomeListQuerySchema),
    async (c) => {
      const result = await listOutcomes(c.get("db"), {
        orgId: c.get("orgId")!,
        query: c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/",
    requirePermission("programs", "edit"),
    zValidator("json", createOutcomeSchema),
    async (c) => {
      const data = c.req.valid("json");
      const outcome = await createOutcome(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        data,
      });
      await captureOutcomeEvent(c, {
        eventName: ANALYTICS_EVENTS.outcomeGoalCreated,
        operation: "outcome_goal_created",
        payload: {
          has_program_link: Boolean(data.programId),
          has_grant_link: Boolean(data.grantId),
          status: data.status,
        },
      });
      return c.json(outcome, 201);
    },
  )
  .post(
    "/:outcomeId/indicators",
    requirePermission("programs", "edit"),
    zValidator("json", createOutcomeIndicatorSchema),
    async (c) => {
      const data = c.req.valid("json");
      const indicator = await createOutcomeIndicator(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        outcomeId: c.req.param("outcomeId"),
        data,
      });
      await captureOutcomeEvent(c, {
        eventName: ANALYTICS_EVENTS.outcomeIndicatorCreated,
        operation: "outcome_indicator_created",
        payload: {
          indicator_type: data.indicatorType,
          has_metric_link: Boolean(data.impactMetricId),
          funder_defined: data.funderDefined,
        },
      });
      return c.json(indicator, 201);
    },
  );
