import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  expenseProgramAllocationReplaceSchema,
  grantProgramAllocationReplaceSchema,
  programBudgetCreateSchema,
  programBudgetUpdateSchema,
  programBudgetVsActualExportQuerySchema,
  programBudgetVsActualQuerySchema,
  programCreateSchema,
  programListQuerySchema,
  programUpdateSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import { requirePermission } from "../../middleware/require-role";
import { requirePlanTier } from "../../middleware/paywall";
import {
  replaceExpenseProgramAllocations,
  replaceGrantProgramAllocations,
} from "./allocation.service";
import { createProgramBudget, updateProgramBudget } from "./budget.service";
import {
  archiveProgram,
  createProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "./program.service";
import { exportProgramBudgetVsActual, getProgramBudgetVsActual } from "./report.service";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureProgramEvent(
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

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

function countBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "51+";
}

export const programRoutes = new Hono<AppEnv>()
  .get(
    "/",
    requirePermission("programs", "view"),
    requirePlanTier("starter"),
    zValidator("query", programListQuerySchema),
    async (c) => {
      const result = await listPrograms(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", programCreateSchema),
    async (c) => {
      const program = await createProgram(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programCreated, {
        entity_type: "program",
      });
      return c.json(program, 201);
    },
  )
  .get(
    "/budget-vs-actual",
    requirePermission("programs", "view"),
    requirePlanTier("starter"),
    zValidator("query", programBudgetVsActualQuerySchema),
    async (c) => {
      const result = await getProgramBudgetVsActual(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/budget-vs-actual/export",
    requirePermission("programs", "view"),
    requirePlanTier("growth"),
    zValidator("query", programBudgetVsActualExportQuerySchema),
    async (c) => {
      const csv = await exportProgramBudgetVsActual(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programBudgetVsActualExported, {
        entity_type: "program_budget_vs_actual",
        file_format: "csv",
      });
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="program-budget-vs-actual.csv"',
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex, nofollow, noarchive",
        },
      });
    },
  )
  .get(
    "/:programId",
    requirePermission("programs", "view"),
    requirePlanTier("starter"),
    async (c) => {
      const program = await getProgram(c.get("db"), {
        orgId: c.get("orgId")!,
        programId: c.req.param("programId"),
      });
      return c.json(program);
    },
  )
  .patch(
    "/:programId",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", programUpdateSchema),
    async (c) => {
      const data = c.req.valid("json");
      const program = await updateProgram(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        programId: c.req.param("programId"),
        data,
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programUpdated, {
        entity_type: "program",
        changed_fields: changedFields(data),
      });
      return c.json(program);
    },
  )
  .delete(
    "/:programId",
    requirePermission("programs", "manage"),
    requirePlanTier("starter"),
    async (c) => {
      await archiveProgram(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        programId: c.req.param("programId"),
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programArchived, {
        entity_type: "program",
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/budgets",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", programBudgetCreateSchema),
    async (c) => {
      const budget = await createProgramBudget(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programBudgetCreated, {
        entity_type: "program_budget",
      });
      return c.json(budget, 201);
    },
  )
  .patch(
    "/budgets/:budgetId",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", programBudgetUpdateSchema),
    async (c) => {
      const data = c.req.valid("json");
      const budget = await updateProgramBudget(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        budgetId: c.req.param("budgetId"),
        data,
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.programBudgetUpdated, {
        entity_type: "program_budget",
        changed_fields: changedFields(data),
      });
      return c.json(budget);
    },
  )
  .put(
    "/grants/:grantId/allocations",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", grantProgramAllocationReplaceSchema),
    async (c) => {
      const grantId = c.req.param("grantId");
      const input = c.req.valid("json");
      if (input.grantId !== grantId) {
        return c.json({ error: "grant_id_mismatch" }, 400);
      }
      const result = await replaceGrantProgramAllocations(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...input,
        grantId,
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.grantProgramAllocationsReplaced, {
        entity_type: "grant_program_allocation",
        allocation_count_bucket: countBucket(input.allocations.length),
      });
      return c.json(result);
    },
  )
  .put(
    "/expenses/:expenseId/allocations",
    requirePermission("programs", "edit"),
    requirePlanTier("starter"),
    zValidator("json", expenseProgramAllocationReplaceSchema),
    async (c) => {
      const expenseId = c.req.param("expenseId");
      const input = c.req.valid("json");
      if (input.expenseId !== expenseId) {
        return c.json({ error: "expense_id_mismatch" }, 400);
      }
      const result = await replaceExpenseProgramAllocations(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...input,
        expenseId,
      });
      captureProgramEvent(c, ANALYTICS_EVENTS.expenseProgramAllocationsReplaced, {
        entity_type: "expense_program_allocation",
        allocation_count_bucket: countBucket(input.allocations.length),
        balance_mode: input.balanceMode,
      });
      return c.json(result);
    },
  );
