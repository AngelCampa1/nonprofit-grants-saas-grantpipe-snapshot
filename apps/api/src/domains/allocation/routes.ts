import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { requirePermission } from "../../middleware/require-role";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import { getIntegrations } from "../../lib/integrations";
import {
  ANALYTICS_EVENTS,
  canUseFunctionalExpenseAllocation,
  createAllocationBaseSchema,
  updateAllocationBaseSchema,
  setAllocationTargetsSchema,
  createAllocationRuleSchema,
  updateAllocationRuleSchema,
  functionalExpensesQuerySchema,
} from "@grantpipe/shared";
import {
  listAllocationBases,
  getAllocationBase,
  createAllocationBase,
  updateAllocationBase,
  softDeleteAllocationBase,
  getAllocationTargets,
  setAllocationTargets,
  listAllocationRules,
  createAllocationRule,
  updateAllocationRule,
  softDeleteAllocationRule,
  getAllocatedStatementOfFunctionalExpenses,
} from "./service";

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureAllocationEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");
  if (!orgId || !user) return;

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: { actorId: user.id, ...payload },
    }),
    { c, eventName },
  );
}

// ---------------------------------------------------------------------------
// Entitlement guard helper
// ---------------------------------------------------------------------------

function assertFunctionalExpenseAllocationEntitlement(planTier: string): Response | null {
  if (!canUseFunctionalExpenseAllocation(planTier)) {
    return Response.json(
      {
        error: "insufficient_plan",
        message:
          "The Functional Expense Allocation Studio is available on the Growth plan and above.",
      },
      { status: 403 },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const allocationRoutes = new Hono<AppEnv>()
  // ------------------------------------------------------------------
  // GET /bases — list allocation bases
  // ------------------------------------------------------------------
  .get("/bases", requirePermission("accounting", "view"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const result = await listAllocationBases(db, { orgId });
    return c.json(result, 200);
  })

  // ------------------------------------------------------------------
  // GET /bases/:id — get single allocation base
  // ------------------------------------------------------------------
  .get("/bases/:id", requirePermission("accounting", "view"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const baseId = c.req.param("id");
    const result = await getAllocationBase(db, { orgId, baseId });
    return c.json(result, 200);
  })

  // ------------------------------------------------------------------
  // POST /bases — create allocation base
  // ------------------------------------------------------------------
  .post(
    "/bases",
    requirePermission("accounting", "manage"),
    zValidator("json", createAllocationBaseSchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const input = c.req.valid("json");
      const result = await createAllocationBase(db, { orgId, input });
      captureAllocationEvent(c, ANALYTICS_EVENTS.allocationBaseCreated, {
        entity_type: "allocation_base",
        base_id: result.id,
      });
      return c.json(result, 201);
    },
  )

  // ------------------------------------------------------------------
  // PATCH /bases/:id — update allocation base
  // ------------------------------------------------------------------
  .patch(
    "/bases/:id",
    requirePermission("accounting", "manage"),
    zValidator("json", updateAllocationBaseSchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const baseId = c.req.param("id");
      const input = c.req.valid("json");
      const result = await updateAllocationBase(db, { orgId, baseId, input });
      captureAllocationEvent(c, ANALYTICS_EVENTS.allocationBaseUpdated, {
        entity_type: "allocation_base",
        base_id: baseId,
      });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // DELETE /bases/:id — soft-delete allocation base
  // ------------------------------------------------------------------
  .delete("/bases/:id", requirePermission("accounting", "manage"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const baseId = c.req.param("id");
    await softDeleteAllocationBase(db, { orgId, baseId });
    captureAllocationEvent(c, ANALYTICS_EVENTS.allocationBaseDeleted, {
      entity_type: "allocation_base",
      base_id: baseId,
    });
    return c.json({ success: true }, 200);
  })

  // ------------------------------------------------------------------
  // GET /bases/:id/targets — list targets for a base
  // ------------------------------------------------------------------
  .get("/bases/:id/targets", requirePermission("accounting", "view"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const baseId = c.req.param("id");
    const result = await getAllocationTargets(db, { orgId, baseId });
    return c.json(result, 200);
  })

  // ------------------------------------------------------------------
  // PUT /bases/:id/targets — replace all targets for a base
  // ------------------------------------------------------------------
  .put(
    "/bases/:id/targets",
    requirePermission("accounting", "manage"),
    zValidator("json", setAllocationTargetsSchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const baseId = c.req.param("id");
      const { targets } = c.req.valid("json");
      const result = await setAllocationTargets(db, { orgId, baseId, targets });
      captureAllocationEvent(c, ANALYTICS_EVENTS.allocationTargetsSet, {
        entity_type: "allocation_base",
        base_id: baseId,
        target_count: targets.length,
      });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // GET /rules — list allocation rules
  // ------------------------------------------------------------------
  .get("/rules", requirePermission("accounting", "view"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const result = await listAllocationRules(db, { orgId });
    return c.json(result, 200);
  })

  // ------------------------------------------------------------------
  // POST /rules — create allocation rule
  // ------------------------------------------------------------------
  .post(
    "/rules",
    requirePermission("accounting", "manage"),
    zValidator("json", createAllocationRuleSchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const input = c.req.valid("json");
      const result = await createAllocationRule(db, { orgId, input });
      captureAllocationEvent(c, ANALYTICS_EVENTS.allocationRuleCreated, {
        entity_type: "allocation_rule",
        rule_id: result.id,
      });
      return c.json(result, 201);
    },
  )

  // ------------------------------------------------------------------
  // PATCH /rules/:id — update allocation rule
  // ------------------------------------------------------------------
  .patch(
    "/rules/:id",
    requirePermission("accounting", "manage"),
    zValidator("json", updateAllocationRuleSchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const ruleId = c.req.param("id");
      const input = c.req.valid("json");
      const result = await updateAllocationRule(db, { orgId, ruleId, input });
      captureAllocationEvent(c, ANALYTICS_EVENTS.allocationRuleUpdated, {
        entity_type: "allocation_rule",
        rule_id: ruleId,
      });
      return c.json(result, 200);
    },
  )

  // ------------------------------------------------------------------
  // DELETE /rules/:id — soft-delete allocation rule
  // ------------------------------------------------------------------
  .delete("/rules/:id", requirePermission("accounting", "manage"), async (c) => {
    const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;

    const orgId = c.get("orgId")!;
    const db = c.get("db");
    const ruleId = c.req.param("id");
    await softDeleteAllocationRule(db, { orgId, ruleId });
    captureAllocationEvent(c, ANALYTICS_EVENTS.allocationRuleDeleted, {
      entity_type: "allocation_rule",
      rule_id: ruleId,
    });
    return c.json({ success: true }, 200);
  })

  // ------------------------------------------------------------------
  // GET /functional-expenses — allocated statement of functional expenses
  // ------------------------------------------------------------------
  .get(
    "/functional-expenses",
    requirePermission("accounting", "view"),
    zValidator("query", functionalExpensesQuerySchema),
    async (c) => {
      const guard = assertFunctionalExpenseAllocationEntitlement(getContextEffectivePlanTier(c));
      if (guard) return guard;

      const orgId = c.get("orgId")!;
      const db = c.get("db");
      const { from, to } = c.req.valid("query");
      const result = await getAllocatedStatementOfFunctionalExpenses(db, {
        orgId,
        startDate: new Date(from),
        endDate: new Date(to),
      });
      return c.json(result, 200);
    },
  );
