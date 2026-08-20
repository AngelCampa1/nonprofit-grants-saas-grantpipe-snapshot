import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import { requirePermission, requireRole } from "../../middleware/require-role";
import { requirePlanTier } from "../../middleware/paywall";
import {
  ANALYTICS_EVENTS,
  createPaymentRequestSchema,
  updatePaymentRequestSchema,
  paymentRequestStatusTransitionSchema,
  paymentRequestListSchema,
  createPaymentRequestLineSchema,
  updatePaymentRequestLineSchema,
  createPaymentRequestAdjustmentSchema,
  recordPaymentSchema,
  createIndirectCostRuleSchema,
  updateIndirectCostRuleSchema,
  listIndirectCostRulesQuerySchema,
  eligibleExpenseQuerySchema,
  uniformGuidanceGuardrailPreviewSchema,
} from "@grantpipe/shared";
import {
  listPaymentRequests,
  getOutstandingSummary,
  getPaymentRequest,
  createPaymentRequest,
  updatePaymentRequest,
  deletePaymentRequest,
  transitionPaymentRequest,
} from "./request.service";
import {
  addLine,
  updateLine,
  removeLine,
  listEligibleExpenses,
  createAdjustment,
} from "./line.service";
import { listPayments, recordPayment, removePayment } from "./payment.service";
import {
  listIndirectCostRules,
  createIndirectCostRule,
  updateIndirectCostRule,
  deleteIndirectCostRule,
  computeIndirectLine,
} from "./indirect.service";
import {
  getEvidenceManifest,
  getGrantPaymentSummary,
  renderEvidencePacketPdf,
} from "./evidence.service";
import { getReimbursementCashFlowRadar } from "./cash-flow.service";
import { captureBackgroundException } from "../../lib/sentry";
import { evaluateUniformGuidanceCostGuardrails } from "./ug-guardrails.service";
import { AppError } from "../../lib/app-error";

function context(c: Context<AppEnv>) {
  return {
    orgId: c.get("orgId")!,
    entityId: c.get("entityId")!,
    actorId: c.get("user")!.id,
  };
}

function shouldDefaultAutoPostJournalEntry(c: Context<AppEnv>) {
  const subscription = c.get("orgSubscription");
  const tier = subscription?.effectivePlanTier ?? subscription?.planTier;
  return tier === "audit_ready" || tier === "enterprise";
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function capturePaymentEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");

  if (!orgId || !user) {
    return;
  }

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: {
        actorId: user.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

const canDeleteRecords = requireRole("admin");

export const paymentRoutes = new Hono<AppEnv>()
  .get(
    "/",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    zValidator("query", paymentRequestListSchema),
    async (c) => {
      const result = await listPaymentRequests(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/outstanding-summary",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const summary = await getOutstandingSummary(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
      });
      return c.json(summary);
    },
  )
  .get(
    "/cash-flow-radar",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const radar = await getReimbursementCashFlowRadar(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
      });
      return c.json(radar);
    },
  )
  .post(
    "/",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", createPaymentRequestSchema),
    async (c) => {
      const payload = c.req.valid("json");
      const request = await createPaymentRequest(c.get("db"), {
        ...context(c),
        ...payload,
        autoPostJournalEntry: payload.autoPostJournalEntry ?? shouldDefaultAutoPostJournalEntry(c),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestCreated, {
        entity_type: "payment_request",
        request_type: payload.type,
        auto_post_journal_entry:
          payload.autoPostJournalEntry ?? shouldDefaultAutoPostJournalEntry(c),
      });
      return c.json(request, 201);
    },
  )
  .get(
    "/grants/:grantId/summary",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const summary = await getGrantPaymentSummary(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        grantId: c.req.param("grantId"),
      });
      return c.json(summary);
    },
  )
  .get(
    "/indirect-rules",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    zValidator("query", listIndirectCostRulesQuerySchema),
    async (c) => {
      const { grantId } = c.req.valid("query");
      const rules = await listIndirectCostRules(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        grantId,
      });
      return c.json({ data: rules });
    },
  )
  .post(
    "/indirect-rules",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", createIndirectCostRuleSchema),
    async (c) => {
      const rule = await createIndirectCostRule(c.get("db"), {
        ...context(c),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.indirectCostRuleCreated, {
        entity_type: "indirect_cost_rule",
        base: c.req.valid("json").base,
      });
      return c.json(rule, 201);
    },
  )
  .patch(
    "/indirect-rules/:ruleId",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", updateIndirectCostRuleSchema),
    async (c) => {
      const rule = await updateIndirectCostRule(c.get("db"), {
        ...context(c),
        ruleId: c.req.param("ruleId"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.indirectCostRuleUpdated, {
        entity_type: "indirect_cost_rule",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(rule);
    },
  )
  .delete("/indirect-rules/:ruleId", requirePlanTier("growth"), canDeleteRecords, async (c) => {
    await deleteIndirectCostRule(c.get("db"), {
      ...context(c),
      ruleId: c.req.param("ruleId"),
    });
    capturePaymentEvent(c, ANALYTICS_EVENTS.indirectCostRuleDeleted, {
      entity_type: "indirect_cost_rule",
    });
    return c.json({ success: true });
  })
  .get("/:id", requirePlanTier("growth"), requirePermission("payments", "view"), async (c) => {
    const request = await getPaymentRequest(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      requestId: c.req.param("id"),
    });
    return c.json(request);
  })
  .patch(
    "/:id",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", updatePaymentRequestSchema),
    async (c) => {
      const request = await updatePaymentRequest(c.get("db"), {
        ...context(c),
        requestId: c.req.param("id"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestUpdated, {
        entity_type: "payment_request",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(request);
    },
  )
  .delete("/:id", requirePlanTier("growth"), canDeleteRecords, async (c) => {
    await deletePaymentRequest(c.get("db"), {
      ...context(c),
      requestId: c.req.param("id"),
    });
    capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestDeleted, {
      entity_type: "payment_request",
    });
    return c.json({ success: true });
  })
  .post(
    "/:id/transitions",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", paymentRequestStatusTransitionSchema),
    async (c) => {
      const request = await transitionPaymentRequest(c.get("db"), {
        ...context(c),
        requestId: c.req.param("id"),
        transition: c.req.valid("json"),
      });
      const transition = c.req.valid("json");
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestTransitioned, {
        entity_type: "payment_request",
        from_status: transition.fromStatus,
        to_status: transition.toStatus,
      });
      return c.json(request);
    },
  )
  .post(
    "/:id/lines",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", createPaymentRequestLineSchema),
    async (c) => {
      const line = await addLine(c.get("db"), {
        ...context(c),
        requestId: c.req.param("id"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestLineAdded, {
        entity_type: "payment_request_line",
      });
      return c.json(line, 201);
    },
  )
  .patch(
    "/:id/lines/:lineId",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", updatePaymentRequestLineSchema),
    async (c) => {
      const line = await updateLine(c.get("db"), {
        ...context(c),
        requestId: c.req.param("id"),
        lineId: c.req.param("lineId"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestLineUpdated, {
        entity_type: "payment_request_line",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(line);
    },
  )
  .delete("/:id/lines/:lineId", requirePlanTier("growth"), canDeleteRecords, async (c) => {
    await removeLine(c.get("db"), {
      ...context(c),
      requestId: c.req.param("id"),
      lineId: c.req.param("lineId"),
    });
    capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestLineRemoved, {
      entity_type: "payment_request_line",
    });
    return c.json({ success: true });
  })
  .get(
    "/:id/eligible-expenses",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    zValidator("query", eligibleExpenseQuerySchema),
    async (c) => {
      const req = await getPaymentRequest(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        requestId: c.req.param("id"),
      });
      const expenses = await listEligibleExpenses(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        grantId: req.grantId,
        requestId: c.req.param("id"),
        queryParams: c.req.valid("query"),
      });
      return c.json({ data: expenses });
    },
  )
  .post(
    "/:id/ug-guardrails/preview",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", uniformGuidanceGuardrailPreviewSchema),
    async (c) => {
      try {
        const result = await evaluateUniformGuidanceCostGuardrails(c.get("db"), {
          orgId: c.get("orgId")!,
          entityId: c.get("entityId")!,
          requestId: c.req.param("id"),
          data: c.req.valid("json"),
        });
        capturePaymentEvent(c, ANALYTICS_EVENTS.uniformGuidanceGuardrailsPreviewed, {
          entity_type: "payment_request_line",
          result_status: result.status,
          finding_count: result.findingCount,
        });
        if (result.status === "blocked") {
          capturePaymentEvent(c, ANALYTICS_EVENTS.uniformGuidanceGuardrailsBlocked, {
            entity_type: "payment_request_line",
            finding_count: result.findingCount,
          });
        }
        return c.json(result);
      } catch (error) {
        capturePaymentEvent(c, ANALYTICS_EVENTS.paymentOperationFailed, {
          entity_type: "payment_request_line",
          operation: "uniform_guidance_guardrail_preview",
        });
        if (!(error instanceof AppError) || error.status >= 500) {
          captureBackgroundException(error, "uniform_guidance_guardrail_preview", {
            feature: "ug_cost_rule_guardrails",
          });
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/adjustments",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", createPaymentRequestAdjustmentSchema),
    async (c) => {
      const adjustment = await createAdjustment(c.get("db"), {
        ...context(c),
        requestId: c.req.param("id"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestAdjustmentCreated, {
        entity_type: "payment_request_adjustment",
      });
      return c.json(adjustment, 201);
    },
  )
  .get(
    "/:id/payments",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const payments = await listPayments(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        requestId: c.req.param("id"),
      });
      return c.json({ data: payments });
    },
  )
  .post(
    "/:id/payments",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    zValidator("json", recordPaymentSchema),
    async (c) => {
      const payment = await recordPayment(c.get("db"), c.env, {
        ...context(c),
        requestId: c.req.param("id"),
        data: c.req.valid("json"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestPaymentRecorded, {
        entity_type: "payment_request_payment",
      });
      return c.json(payment, 201);
    },
  )
  .delete("/:id/payments/:paymentId", requirePlanTier("growth"), canDeleteRecords, async (c) => {
    await removePayment(c.get("db"), {
      ...context(c),
      requestId: c.req.param("id"),
      paymentId: c.req.param("paymentId"),
    });
    capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestPaymentRemoved, {
      entity_type: "payment_request_payment",
    });
    return c.json({ success: true });
  })
  .post(
    "/:id/indirect/recompute",
    requirePlanTier("growth"),
    requirePermission("payments", "edit"),
    async (c) => {
      const result = await computeIndirectLine(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        requestId: c.req.param("id"),
      });
      capturePaymentEvent(c, ANALYTICS_EVENTS.paymentRequestIndirectRecomputed, {
        entity_type: "payment_request",
      });
      return c.json(result);
    },
  )
  .get(
    "/:id/packet",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const manifest = await getEvidenceManifest(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        requestId: c.req.param("id"),
      });
      return c.json(manifest);
    },
  )
  .get(
    "/:id/packet.pdf",
    requirePlanTier("growth"),
    requirePermission("payments", "view"),
    async (c) => {
      const manifest = await getEvidenceManifest(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        requestId: c.req.param("id"),
      });
      const pdf = renderEvidencePacketPdf(manifest);
      const requestNumber = String(manifest.request.requestNumber ?? manifest.request.id)
        .replaceAll(/[^a-zA-Z0-9-]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");
      const filename = `payment-request-${requestNumber || "packet"}-evidence-packet.pdf`;
      return c.body(pdf, 200, {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      });
    },
  );
