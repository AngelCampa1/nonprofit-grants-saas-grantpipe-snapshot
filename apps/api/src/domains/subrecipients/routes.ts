import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  createCorrectiveActionSchema,
  createFindingSchema,
  createMonitoringLogSchema,
  createRiskAssessmentSchema,
  createSubawardSchema,
  createSubrecipientSchema,
  generateMonitoringTasksSchema,
  subrecipientListSchema,
  updateCorrectiveActionSchema,
  updateFindingSchema,
  updateMonitoringTaskSchema,
  updateSubawardSchema,
  updateSubrecipientSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requirePermission, requireRole } from "../../middleware/require-role";
import { requirePlanTier } from "../../middleware/paywall";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import {
  createCorrectiveAction,
  createEvidenceBundle,
  createFinding,
  createMonitoringLog,
  createRiskAssessment,
  createSubaward,
  createSubrecipient,
  deleteSubrecipient,
  generateMonitoringTasks,
  getSubaward,
  getSubrecipient,
  listSubawards,
  listSubrecipients,
  updateCorrectiveAction,
  updateFinding,
  updateMonitoringTask,
  updateSubaward,
  updateSubrecipient,
} from "./service";

function context(c: Context<AppEnv>) {
  return {
    orgId: c.get("orgId")!,
    actorId: c.get("user")!.id,
    planTier: getContextEffectivePlanTier(c),
  };
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function enumProperty(key: string, value: unknown): Record<string, string> {
  return typeof value === "string" && value.trim().length > 0 ? { [key]: value } : {};
}

function riskRatingProperty(data: {
  riskRating?: unknown;
  finalRiskRating?: unknown;
  suggestedRiskRating?: unknown;
}) {
  return enumProperty(
    "risk_rating",
    data.riskRating ?? data.finalRiskRating ?? data.suggestedRiskRating,
  );
}

function captureSubrecipientEvent(
  c: Context<AppEnv>,
  eventName: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS],
  payload: Record<string, unknown> = {},
) {
  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId: c.get("orgId")!,
      eventName,
      payload: {
        actorId: c.get("user")!.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

const canViewCompliance = requirePermission("compliance", "view");
const canEditCompliance = requirePermission("compliance", "edit");
const canDeleteRecords = requireRole("admin");
const requireAuditReady = requirePlanTier("audit_ready");
const createCorrectiveActionBodySchema = createCorrectiveActionSchema.omit({ findingId: true });

export const subrecipientRoutes = new Hono<AppEnv>()
  .get(
    "/",
    canViewCompliance,
    requireAuditReady,
    zValidator("query", subrecipientListSchema),
    async (c) => {
      const result = await listSubrecipients(c.get("db"), {
        ...context(c),
        ...c.req.valid("query"),
      });
      return c.json({ data: result.rows, total: result.total, summary: result.summary });
    },
  )
  .post(
    "/",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createSubrecipientSchema),
    async (c) => {
      const row = await createSubrecipient(c.get("db"), {
        ...context(c),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(c, ANALYTICS_EVENTS.subrecipientCreated);
      return c.json(row, 201);
    },
  )
  .get("/subawards", canViewCompliance, requireAuditReady, async (c) => {
    const rows = await listSubawards(c.get("db"), {
      ...context(c),
      grantId: c.req.query("grantId"),
      subrecipientId: c.req.query("subrecipientId"),
    });
    return c.json({ data: rows });
  })
  .get("/:subrecipientId", canViewCompliance, requireAuditReady, async (c) => {
    const row = await getSubrecipient(c.get("db"), {
      ...context(c),
      subrecipientId: c.req.param("subrecipientId"),
    });
    return c.json(row);
  })
  .patch(
    "/:subrecipientId",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", updateSubrecipientSchema),
    async (c) => {
      const row = await updateSubrecipient(c.get("db"), {
        ...context(c),
        subrecipientId: c.req.param("subrecipientId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subrecipientUpdated,
        enumProperty("status", row.status),
      );
      return c.json(row);
    },
  )
  .delete("/:subrecipientId", canDeleteRecords, requireAuditReady, async (c) => {
    const row = await deleteSubrecipient(c.get("db"), {
      ...context(c),
      subrecipientId: c.req.param("subrecipientId"),
    });
    captureSubrecipientEvent(c, ANALYTICS_EVENTS.subrecipientDeleted);
    return c.json(row);
  })
  .post(
    "/:subrecipientId/subawards",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createSubawardSchema),
    async (c) => {
      const row = await createSubaward(c.get("db"), {
        ...context(c),
        subrecipientId: c.req.param("subrecipientId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(c, ANALYTICS_EVENTS.subawardCreated);
      return c.json(row, 201);
    },
  )
  .get("/subawards/:subawardId", canViewCompliance, requireAuditReady, async (c) => {
    const row = await getSubaward(c.get("db"), {
      ...context(c),
      subawardId: c.req.param("subawardId"),
    });
    return c.json(row);
  })
  .patch(
    "/subawards/:subawardId",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", updateSubawardSchema),
    async (c) => {
      const row = await updateSubaward(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subawardUpdated,
        enumProperty("status", row.status),
      );
      return c.json(row);
    },
  )
  .post(
    "/subawards/:subawardId/risk-assessments",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createRiskAssessmentSchema),
    async (c) => {
      const data = c.req.valid("json");
      const row = await createRiskAssessment(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
        data,
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subawardRiskAssessmentCreated,
        riskRatingProperty(data),
      );
      return c.json(row, 201);
    },
  )
  .post(
    "/subawards/:subawardId/monitoring-tasks/generate",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", generateMonitoringTasksSchema),
    async (c) => {
      const rows = await generateMonitoringTasks(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subawardMonitoringTasksGenerated,
        riskRatingProperty(c.req.valid("json")),
      );
      return c.json({ data: rows }, 201);
    },
  )
  .patch(
    "/monitoring-tasks/:taskId",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", updateMonitoringTaskSchema),
    async (c) => {
      const row = await updateMonitoringTask(c.get("db"), {
        ...context(c),
        taskId: c.req.param("taskId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.monitoringTaskUpdated,
        enumProperty("status", row.status),
      );
      return c.json(row);
    },
  )
  .post(
    "/subawards/:subawardId/monitoring-logs",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createMonitoringLogSchema),
    async (c) => {
      const data = c.req.valid("json");
      const row = await createMonitoringLog(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
        data,
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subawardMonitoringLogCreated,
        enumProperty("log_type", data.logType),
      );
      return c.json(row, 201);
    },
  )
  .post(
    "/subawards/:subawardId/findings",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createFindingSchema),
    async (c) => {
      const data = c.req.valid("json");
      const row = await createFinding(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
        data,
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.subawardFindingCreated,
        enumProperty("severity", data.severity),
      );
      return c.json(row, 201);
    },
  )
  .patch(
    "/findings/:findingId",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", updateFindingSchema),
    async (c) => {
      const row = await updateFinding(c.get("db"), {
        ...context(c),
        findingId: c.req.param("findingId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.findingUpdated,
        enumProperty("status", row.status),
      );
      return c.json(row);
    },
  )
  .post(
    "/findings/:findingId/corrective-actions",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", createCorrectiveActionBodySchema),
    async (c) => {
      const row = await createCorrectiveAction(c.get("db"), {
        ...context(c),
        findingId: c.req.param("findingId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(c, ANALYTICS_EVENTS.correctiveActionCreated);
      return c.json(row, 201);
    },
  )
  .patch(
    "/corrective-actions/:actionId",
    canEditCompliance,
    requireAuditReady,
    zValidator("json", updateCorrectiveActionSchema),
    async (c) => {
      const row = await updateCorrectiveAction(c.get("db"), {
        ...context(c),
        actionId: c.req.param("actionId"),
        data: c.req.valid("json"),
      });
      captureSubrecipientEvent(
        c,
        ANALYTICS_EVENTS.correctiveActionUpdated,
        enumProperty("status", row.status),
      );
      return c.json(row);
    },
  )
  .post(
    "/subawards/:subawardId/evidence-bundle",
    canEditCompliance,
    requireAuditReady,
    async (c) => {
      const bundle = await createEvidenceBundle(c.get("db"), {
        ...context(c),
        subawardId: c.req.param("subawardId"),
      });
      captureSubrecipientEvent(c, ANALYTICS_EVENTS.subawardEvidenceBundleCreated);
      return c.json(bundle, 201);
    },
  );
