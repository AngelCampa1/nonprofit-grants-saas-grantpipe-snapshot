import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  approveGrantBudgetVersionSchema,
  budgetExportQuerySchema,
  budgetVarianceQuerySchema,
  canExportGrantBudgetActuals,
  canUseGrantBudgetAmendments,
  canUseGrantBudgetAiExtraction,
  canUsePlannedExpenses,
  convertPlannedExpenseSchema,
  createGrantBudgetAmendmentSchema,
  createGrantBudgetLineSchema,
  createGrantBudgetPeriodSchema,
  createGrantBudgetVersionSchema,
  createPlannedExpenseSchema,
  expenseBudgetAllocationSchema,
  extractGrantBudgetDocumentSchema,
  formatMinimumPlanLabelForFeatures,
  updatePlannedExpenseSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireEntityPermission } from "../../middleware/require-role";
import { badRequest, paymentRequired } from "../../lib/app-error";
import { resolvePlanTier } from "./grant.service";
import {
  approveBudgetVersion,
  createBudgetAmendment,
  createBudgetLine,
  createBudgetPeriod,
  createBudgetVersion,
  getBudgetVersion,
  getCurrentBudgetVersion,
  listBudgetAmendments,
  listBudgetVersions,
} from "./budget.service";
import {
  setExpenseBudgetAllocations,
  setJournalLineBudgetAllocations,
} from "./budget-allocations.service";
import { exportGrantBudgetActualsCsv, getBudgetVarianceRows } from "./budget-reporting.service";
import { extractBudgetRowsWithOpenRouter } from "./budget-intake.service";
import {
  convertPlannedExpense,
  createPlannedExpense,
  deletePlannedExpense,
  listPlannedExpenses,
  updatePlannedExpense,
} from "./planned-expenses.service";

function requiredParam(value: string | undefined, name: string) {
  if (!value) throw badRequest(`${name} is required`);
  return value;
}

function entityIdForContext(c: { get(name: "entityId"): string | null }) {
  return c.get("entityId") ?? undefined;
}

const BUDGET_AMENDMENTS_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasGrantBudgetAmendments",
]);
const PLANNED_EXPENSES_PLAN_LABEL = formatMinimumPlanLabelForFeatures(["hasPlannedExpenses"]);
const BUDGET_EXPORTS_PLAN_LABEL = formatMinimumPlanLabelForFeatures(["hasGrantBudgetExports"]);
const BUDGET_AI_EXTRACTION_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasGrantBudgetAiExtraction",
]);

async function resolveGrantBudgetPlan(
  db: AppEnv["Variables"]["db"],
  orgId: string,
  predicate: (tier: string) => boolean,
  message: string,
) {
  const planTier = await resolvePlanTier(db, orgId);
  if (!predicate(planTier)) {
    throw paymentRequired(message);
  }
}

export const grantBudgetRoutes = new Hono<AppEnv>({ strict: false })
  .get("/versions", requireEntityPermission("grants", "view"), async (c) => {
    const versions = await listBudgetVersions(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      grantId: requiredParam(c.req.param("grantId"), "grantId"),
    });
    return c.json({ versions });
  })
  .get("/current", requireEntityPermission("grants", "view"), async (c) =>
    c.json(
      await getCurrentBudgetVersion(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
      }),
    ),
  )
  .get("/versions/:versionId", requireEntityPermission("grants", "view"), async (c) =>
    c.json(
      await getBudgetVersion(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        versionId: requiredParam(c.req.param("versionId"), "versionId"),
      }),
    ),
  )
  .post(
    "/versions",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantBudgetVersionSchema),
    async (c) => {
      const version = await createBudgetVersion(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(version, 201);
    },
  )
  .post(
    "/versions/:versionId/approve",
    requireEntityPermission("grants", "manage"),
    zValidator("json", approveGrantBudgetVersionSchema),
    async (c) => {
      const version = await approveBudgetVersion(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        versionId: requiredParam(c.req.param("versionId"), "versionId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(version);
    },
  )
  .get("/amendments", requireEntityPermission("grants", "view"), async (c) => {
    await resolveGrantBudgetPlan(
      c.get("db"),
      c.get("orgId")!,
      canUseGrantBudgetAmendments,
      `Budget amendments require the ${BUDGET_AMENDMENTS_PLAN_LABEL} plan.`,
    );
    return c.json({
      amendments: await listBudgetAmendments(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
      }),
    });
  })
  .post(
    "/amendments",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantBudgetAmendmentSchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUseGrantBudgetAmendments,
        `Budget amendments require the ${BUDGET_AMENDMENTS_PLAN_LABEL} plan.`,
      );
      const amendment = await createBudgetAmendment(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(amendment, 201);
    },
  )
  .post(
    "/periods",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantBudgetPeriodSchema),
    async (c) => {
      const period = await createBudgetPeriod(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(period, 201);
    },
  )
  .post(
    "/lines",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantBudgetLineSchema),
    async (c) => {
      const line = await createBudgetLine(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(line, 201);
    },
  )
  .post(
    "/expenses/:expenseId/allocations",
    requireEntityPermission("grants", "edit"),
    zValidator("json", expenseBudgetAllocationSchema),
    async (c) => {
      const result = await setExpenseBudgetAllocations(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        expenseId: requiredParam(c.req.param("expenseId"), "expenseId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .post(
    "/journal-lines/:journalLineId/allocations",
    requireEntityPermission("grants", "edit"),
    zValidator("json", expenseBudgetAllocationSchema),
    async (c) => {
      const result = await setJournalLineBudgetAllocations(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        journalLineId: requiredParam(c.req.param("journalLineId"), "journalLineId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .get("/planned-expenses", requireEntityPermission("grants", "view"), async (c) => {
    await resolveGrantBudgetPlan(
      c.get("db"),
      c.get("orgId")!,
      canUsePlannedExpenses,
      `Planned expenses require the ${PLANNED_EXPENSES_PLAN_LABEL} plan.`,
    );
    return c.json({
      plannedExpenses: await listPlannedExpenses(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
      }),
    });
  })
  .post(
    "/planned-expenses",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createPlannedExpenseSchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUsePlannedExpenses,
        `Planned expenses require the ${PLANNED_EXPENSES_PLAN_LABEL} plan.`,
      );
      const planned = await createPlannedExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(planned, 201);
    },
  )
  .patch(
    "/planned-expenses/:plannedExpenseId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updatePlannedExpenseSchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUsePlannedExpenses,
        `Planned expenses require the ${PLANNED_EXPENSES_PLAN_LABEL} plan.`,
      );
      return c.json(
        await updatePlannedExpense(c.get("db"), {
          orgId: c.get("orgId")!,
          entityId: entityIdForContext(c),
          grantId: requiredParam(c.req.param("grantId"), "grantId"),
          actorId: c.get("user")!.id,
          plannedExpenseId: requiredParam(c.req.param("plannedExpenseId"), "plannedExpenseId"),
          data: c.req.valid("json"),
        }),
      );
    },
  )
  .post(
    "/planned-expenses/:plannedExpenseId/convert",
    requireEntityPermission("grants", "edit"),
    zValidator("json", convertPlannedExpenseSchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUsePlannedExpenses,
        `Planned expenses require the ${PLANNED_EXPENSES_PLAN_LABEL} plan.`,
      );
      const result = await convertPlannedExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        plannedExpenseId: requiredParam(c.req.param("plannedExpenseId"), "plannedExpenseId"),
        data: c.req.valid("json"),
      });
      return c.json(result, 201);
    },
  )
  .delete(
    "/planned-expenses/:plannedExpenseId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUsePlannedExpenses,
        `Planned expenses require the ${PLANNED_EXPENSES_PLAN_LABEL} plan.`,
      );
      await deletePlannedExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        actorId: c.get("user")!.id,
        plannedExpenseId: requiredParam(c.req.param("plannedExpenseId"), "plannedExpenseId"),
      });
      return c.body(null, 204);
    },
  )
  .get(
    "/variance",
    requireEntityPermission("grants", "view"),
    zValidator("query", budgetVarianceQuerySchema),
    async (c) =>
      c.json({
        rows: await getBudgetVarianceRows(c.get("db"), {
          orgId: c.get("orgId")!,
          entityId: entityIdForContext(c),
          grantId: requiredParam(c.req.param("grantId"), "grantId"),
          query: c.req.valid("query"),
        }),
      }),
  )
  .post(
    "/export",
    requireEntityPermission("grants", "view"),
    zValidator("json", budgetExportQuerySchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canExportGrantBudgetActuals,
        `Budget-vs-actual exports require the ${BUDGET_EXPORTS_PLAN_LABEL} plan.`,
      );
      const query = c.req.valid("json");
      const rows = await getBudgetVarianceRows(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: requiredParam(c.req.param("grantId"), "grantId"),
        query,
      });
      return c.json({
        format: "csv",
        content: exportGrantBudgetActualsCsv(rows),
      });
    },
  )
  .post(
    "/intake/extract",
    requireEntityPermission("grants", "edit"),
    zValidator("json", extractGrantBudgetDocumentSchema),
    async (c) => {
      await resolveGrantBudgetPlan(
        c.get("db"),
        c.get("orgId")!,
        canUseGrantBudgetAiExtraction,
        `Grant budget AI extraction requires the ${BUDGET_AI_EXTRACTION_PLAN_LABEL} plan.`,
      );
      const body = c.req.valid("json");
      if (!c.env.OPENROUTER_API_KEY) {
        throw badRequest("OPENROUTER_API_KEY is required for budget extraction.");
      }
      const rows = await extractBudgetRowsWithOpenRouter({
        apiKey: c.env.OPENROUTER_API_KEY,
        model: "google/gemini-3.1-flash-lite",
        documentText: body.documentText,
      });
      return c.json({
        rows,
        sourceDocumentId: body.documentId,
        reviewRequired: true,
      });
    },
  );
