import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requirePermission } from "../../middleware/require-role";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import {
  ANALYTICS_EVENTS,
  canUsePledgeTracker,
  createPledgeSchema,
  recordPledgePaymentSchema,
  setPledgeAllowanceSchema,
  writeOffPledgeSchema,
  promotePledgeSchema,
  pledgeQuerySchema,
} from "@grantpipe/shared";
import {
  createPledge,
  listPledges,
  getPledge,
  recordPayment,
  setAllowance,
  writeOff,
  promotePledge,
} from "./service";

// ---------------------------------------------------------------------------
// Entitlement guard helper
// ---------------------------------------------------------------------------

function assertPledgeTrackerEntitlement(planTier: string): Response | null {
  if (!canUsePledgeTracker(planTier)) {
    return Response.json(
      {
        error: "insufficient_plan",
        message: "The Pledge Tracker is available on the Growth plan and above.",
      },
      { status: 403 },
    );
  }
  return null;
}

function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 5) return "1_5";
  if (count <= 10) return "6_10";
  if (count <= 25) return "11_25";
  return "25_plus";
}

function centsBucket(cents: number): string {
  const dollars = Math.max(0, Math.round(cents / 100));
  if (dollars === 0) return "0";
  if (dollars <= 100) return "1_100";
  if (dollars <= 1_000) return "101_1000";
  if (dollars <= 10_000) return "1001_10000";
  return "10000_plus";
}

function discountRateBucket(basisPoints: number): string {
  if (basisPoints <= 0) return "0_bp";
  if (basisPoints <= 500) return "1_500_bp";
  if (basisPoints <= 1_000) return "501_1000_bp";
  return "1000_plus_bp";
}

async function capturePledgeEvent(
  c: Context<AppEnv>,
  params: { eventName: string; operation: string; payload: Record<string, unknown> },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: {
        surface: "api",
        ...params.payload,
      },
    });
  } catch (error) {
    captureBackgroundException(error, "pledges", {
      telemetry: "analytics_capture",
      operation: params.operation,
    });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const pledgeRoutes = new Hono<AppEnv>()
  // ------------------------------------------------------------------
  // GET / — list pledges
  // ------------------------------------------------------------------
  .get(
    "/",
    requirePermission("donors", "view"),
    zValidator("query", pledgeQuerySchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const { status, limit } = c.req.valid("query");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const db = c.get("db");

      const result = await listPledges(db, { orgId, entityId, status, limit });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // GET /:id — pledge detail
  // ------------------------------------------------------------------
  .get("/:id", requirePermission("donors", "view"), async (c) => {
    const planTier = getContextEffectivePlanTier(c);
    const guard = assertPledgeTrackerEntitlement(planTier);
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const entityId = c.get("entityId")!;
    const db = c.get("db");
    const pledgeId = c.req.param("id");

    const result = await getPledge(db, { orgId, entityId, pledgeId });
    return c.json(result, 200);
  })

  // ------------------------------------------------------------------
  // POST / — create pledge
  // ------------------------------------------------------------------
  .post(
    "/",
    requirePermission("accounting", "manage"),
    zValidator("json", createPledgeSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const actorId = c.get("user")!.id;
      const db = c.get("db");
      const input = c.req.valid("json");

      const result = await createPledge(db, { orgId, entityId, actorId, input });
      await capturePledgeEvent(c, {
        eventName: ANALYTICS_EVENTS.pledgeCreated,
        operation: "pledge_created",
        payload: {
          has_fund: Boolean(input.fundId),
          has_grant: Boolean(input.grantId),
          is_conditional: input.hasBarrier && input.hasRightOfReturn,
          installment_count_bucket: countBucket(input.installments.length),
          discount_rate_bucket: discountRateBucket(input.discountRateBasisPoints),
          net_asset_class: input.netAssetClass,
        },
      });
      return c.json(result, 201);
    },
  )

  // ------------------------------------------------------------------
  // POST /:id/payments — record payment
  // ------------------------------------------------------------------
  .post(
    "/:id/payments",
    requirePermission("accounting", "manage"),
    zValidator("json", recordPledgePaymentSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const actorId = c.get("user")!.id;
      const db = c.get("db");
      const pledgeId = c.req.param("id");
      const input = c.req.valid("json");

      const result = await recordPayment(db, { orgId, entityId, actorId, pledgeId, input });
      await capturePledgeEvent(c, {
        eventName: ANALYTICS_EVENTS.pledgePaymentRecorded,
        operation: "pledge_payment_recorded",
        payload: {
          has_installment: Boolean(input.installmentId),
          amount_bucket: centsBucket(input.amountCents),
        },
      });
      return c.json(result, 201);
    },
  )

  // ------------------------------------------------------------------
  // POST /:id/allowance — set allowance
  // ------------------------------------------------------------------
  .post(
    "/:id/allowance",
    requirePermission("accounting", "manage"),
    zValidator("json", setPledgeAllowanceSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const actorId = c.get("user")!.id;
      const db = c.get("db");
      const pledgeId = c.req.param("id");
      const input = c.req.valid("json");

      const result = await setAllowance(db, { orgId, entityId, actorId, pledgeId, input });
      await capturePledgeEvent(c, {
        eventName: ANALYTICS_EVENTS.pledgeAllowanceSet,
        operation: "pledge_allowance_set",
        payload: {
          allowance_bucket: centsBucket(input.allowanceCents),
        },
      });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // POST /:id/write-off
  // ------------------------------------------------------------------
  .post(
    "/:id/write-off",
    requirePermission("accounting", "manage"),
    zValidator("json", writeOffPledgeSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const actorId = c.get("user")!.id;
      const db = c.get("db");
      const pledgeId = c.req.param("id");
      const input = c.req.valid("json");

      const result = await writeOff(db, { orgId, entityId, actorId, pledgeId, input });
      await capturePledgeEvent(c, {
        eventName: ANALYTICS_EVENTS.pledgeWrittenOff,
        operation: "pledge_written_off",
        payload: {
          has_reason: Boolean(input.reason),
        },
      });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // POST /:id/promote — promote a conditional pledge to active
  // ------------------------------------------------------------------
  .post(
    "/:id/promote",
    requirePermission("accounting", "manage"),
    zValidator("json", promotePledgeSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      const guard = assertPledgeTrackerEntitlement(planTier);
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const actorId = c.get("user")!.id;
      const db = c.get("db");
      const pledgeId = c.req.param("id");
      const { promotionDate } = c.req.valid("json");

      const result = await promotePledge(db, {
        orgId,
        entityId,
        actorId,
        pledgeId,
        promotionDate: promotionDate ?? new Date(),
      });
      await capturePledgeEvent(c, {
        eventName: ANALYTICS_EVENTS.pledgePromoted,
        operation: "pledge_promoted",
        payload: {
          has_explicit_promotion_date: Boolean(promotionDate),
        },
      });
      return c.json(result, 200);
    },
  );
