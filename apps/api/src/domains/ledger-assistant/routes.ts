import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  canUseAskYourLedger,
  ledgerAssistantAnswerSchema,
  ledgerAssistantAskSchema,
  resolveEffectivePermissions,
  type FeatureArea,
  type PermissionMap,
  type ReportBuilderEntity,
  type Role,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import { getIntegrations } from "../../lib/integrations";
import { AppError } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import { requireAllEntityPermissions } from "../../middleware/require-role";
import { requirePlanTier } from "../../middleware/paywall";
import { askLedger } from "./service";

const ENTITY_FEATURES: Record<ReportBuilderEntity, FeatureArea> = {
  donors: "donors",
  donations: "donors",
  grants: "grants",
  funds: "funds",
};
const PERMISSION_RANK = { none: 0, view: 1, edit: 2, manage: 3 } as const;

function countBucket(value: number): string {
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

function inferIntentType(question: string): string {
  const normalized = question.toLowerCase();
  if (
    ["over budget", "overspend", "over spend", "budget risk"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return "grant_budget_risk";
  }
  if (
    [
      "restricted fund",
      "fund balance",
      "restricted balance",
      "funds with balances",
      "money left",
      "funds still have money left",
    ].some((term) => normalized.includes(term))
  ) {
    return "restricted_fund_balance";
  }
  return "unsupported";
}

function failureTypeFromError(error: unknown): string {
  // Prefer the structured errorCode (e.g. ai_usage_cap_reached) so cap-reached
  // upgrade prompts are distinguishable in analytics from generic AppErrors.
  if (error instanceof AppError && error.errorCode) return error.errorCode;
  if (error instanceof Error) return error.name;
  return "unknown";
}

function getEffectivePermissions(c: Context<AppEnv>): PermissionMap {
  const role = c.get("memberRole") as Role;
  return resolveEffectivePermissions(role, c.get("memberPermissions"));
}

function getAllowedLedgerEntities(c: Context<AppEnv>): ReportBuilderEntity[] {
  const permissions = getEffectivePermissions(c);
  return (Object.keys(ENTITY_FEATURES) as ReportBuilderEntity[]).filter(
    (entity) => PERMISSION_RANK[permissions[ENTITY_FEATURES[entity]]] >= PERMISSION_RANK.view,
  );
}

async function captureLedgerAssistantEvent(
  c: Context<AppEnv>,
  params: {
    eventName: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: params.payload,
    });
  } catch (error) {
    captureBackgroundException(error, "ledger_assistant", {
      telemetry: "analytics_capture",
      operation: String(params.payload.operation ?? "unknown"),
    });
  }
}

export const ledgerAssistantRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const planTier = getContextEffectivePlanTier(c);
    if (!canUseAskYourLedger(planTier)) {
      await captureLedgerAssistantEvent(c, {
        eventName: ANALYTICS_EVENTS.ledgerAssistantGateBlocked,
        payload: {
          operation: "gate_blocked",
          surface: "ask_ledger",
          plan_tier: planTier,
        },
      });
    }
    await next();
  })
  .use("*", requirePlanTier("growth"))
  .post(
    "/ask",
    requireAllEntityPermissions([
      ["reports", "view"],
      ["accounting", "view"],
    ]),
    zValidator("json", ledgerAssistantAskSchema),
    async (c) => {
      const input = c.req.valid("json");
      const intentType = inferIntentType(input.question);
      await captureLedgerAssistantEvent(c, {
        eventName: ANALYTICS_EVENTS.ledgerAssistantAsked,
        payload: {
          operation: "ask",
          surface: "ask_ledger",
          mode: input.mode,
          intent_type: intentType,
          date_range_present: /\b(?:today|yesterday|month|quarter|year|fy|fiscal|20\d{2})\b/i.test(
            input.question,
          ),
          query_length_bucket: countBucket(input.question.length),
        },
      });

      try {
        const answer = ledgerAssistantAnswerSchema.parse(
          await askLedger(c.get("db"), {
            orgId: c.get("orgId")!,
            entityId: c.get("entityId") ?? undefined,
            planTier: getContextEffectivePlanTier(c),
            input,
            allowedEntities: getAllowedLedgerEntities(c),
          }),
        );
        await captureLedgerAssistantEvent(c, {
          eventName: ANALYTICS_EVENTS.ledgerAssistantAnswered,
          payload: {
            operation: "answer",
            surface: "ask_ledger",
            mode: answer.mode,
            intent_type: intentType,
            result_count_bucket: countBucket(answer.citations.length),
            citation_count_bucket: countBucket(answer.citations.length),
            confidence: answer.confidence,
          },
        });
        return c.json(answer);
      } catch (error) {
        await captureLedgerAssistantEvent(c, {
          eventName: ANALYTICS_EVENTS.ledgerAssistantFailed,
          payload: {
            operation: "answer",
            surface: "ask_ledger",
            failure_type: failureTypeFromError(error),
          },
        });
        throw error;
      }
    },
  );
