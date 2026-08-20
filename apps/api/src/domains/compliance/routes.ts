import { Hono, type Context } from "hono";
import { and, eq, count } from "drizzle-orm";
import { organizations, generatedReports } from "@grantpipe/db";
import { zValidator } from "@hono/zod-validator";
import {
  acknowledgmentTemplateSchema,
  ANALYTICS_EVENTS,
  generatedReportListSchema,
  generateAcknowledgmentLetterSchema,
  generateAuditReportSchema,
  generateBoardReportSchema,
  generateDonorYearEndStatementRunSchema,
  generateGrantComplianceReportSchema,
  generateIrs990ReportSchema,
  generateSefaReportSchema,
  generateSpendDownReportSchema,
  GENERATED_REPORT_TYPES,
  getMinimumPlanForFeatures,
  hasComplianceReportPack,
  isPlanTierAtLeast,
  type GeneratedReportArtifact,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requirePlanTier } from "../../middleware/paywall";
import {
  requireAllEntityPermissions,
  requireEntityPermission,
} from "../../middleware/require-role";
import {
  downloadReportArtifact,
  generateAcknowledgmentLetter,
  generateAuditReport,
  generateBoardReport,
  generateDonorYearEndStatementRun,
  generateGrantComplianceReport,
  generateIrs990Report,
  generateSpendDownReport,
  getAcknowledgmentTemplate,
  getGeneratedReportArtifact,
  getGeneratedReportPreview,
  listGeneratedReportArtifacts,
  updateAcknowledgmentTemplate,
} from "./service";
import { generateSefaReport, getSefaTripwire } from "./sefa.service";
import { getEffectiveOrgPlanTier } from "../../lib/effective-plan-tier";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";

function swallowCapture(promise: Promise<unknown> | undefined): Promise<void> {
  if (!promise || typeof promise.then !== "function") return Promise.resolve();
  return promise
    .then(() => undefined)
    .catch((error: unknown) => {
      captureBackgroundException(error, "compliance", {
        step: "analytics_capture",
      });
    });
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

async function countOrgReportsOfType(c: Context<AppEnv>, reportType: string): Promise<number> {
  const db = c.get("db");
  return db
    .select({ n: count() })
    .from(generatedReports)
    .where(
      and(
        eq(generatedReports.orgId, c.get("orgId")!),
        eq(generatedReports.type, reportType),
        eq(generatedReports.status, "ready"),
      ),
    )
    .then((rows) => Number(rows[0]?.n ?? 0))
    .catch((error: unknown) => {
      captureBackgroundException(error, "compliance", {
        step: "report_count",
        report_type: reportType,
      });
      return -1;
    });
}

const COMPLIANCE_REPORT_PACK_TYPES = new Set<GeneratedReportArtifact["type"]>([
  "compliance",
  "audit",
  "board",
  "sefa",
  "spend_down",
  "donor_year_end_statement",
  "restricted_rollforward",
  "grant_budget_actuals",
]);

function isComplianceReportPackArtifact(type: GeneratedReportArtifact["type"]) {
  return COMPLIANCE_REPORT_PACK_TYPES.has(type);
}

const STARTER_VISIBLE_REPORT_TYPES = GENERATED_REPORT_TYPES.filter(
  (type) => !isComplianceReportPackArtifact(type),
);
const AUDIT_READY_REPORT_TYPES = new Set<GeneratedReportArtifact["type"]>(["sefa"]);
const COMPLIANCE_REPORT_PACK_REQUIRED_PLAN = getMinimumPlanForFeatures(["hasComplianceReportPack"]);

type ComplianceContext = Context<AppEnv>;

function getActiveEntityId(c: ComplianceContext) {
  return c.get("entityId") ?? undefined;
}

function allowedReportTypesForPlan(planTier: Awaited<ReturnType<typeof getEffectiveOrgPlanTier>>) {
  if (!hasComplianceReportPack(planTier)) return STARTER_VISIBLE_REPORT_TYPES;
  if (!isPlanTierAtLeast(planTier, "audit_ready")) {
    return GENERATED_REPORT_TYPES.filter((type) => !AUDIT_READY_REPORT_TYPES.has(type));
  }
  return undefined;
}

async function getCurrentPlanTier(c: ComplianceContext) {
  const cached = c.get("orgSubscription");
  if (cached) {
    return getEffectiveOrgPlanTier(cached);
  }

  const org = await c.get("db").query.organizations.findFirst({
    where: eq(organizations.id, c.get("orgId")!),
    columns: { planTier: true, subscriptionStatus: true, trialEndsAt: true },
  });

  return getEffectiveOrgPlanTier(org);
}

async function assertArtifactAccess(c: ComplianceContext, artifact: GeneratedReportArtifact) {
  const planTier = await getCurrentPlanTier(c);

  if (!hasComplianceReportPack(planTier) && isComplianceReportPackArtifact(artifact.type)) {
    return c.json(
      {
        error: "insufficient_plan",
        required: COMPLIANCE_REPORT_PACK_REQUIRED_PLAN,
        current: planTier,
      },
      402,
    );
  }

  if (AUDIT_READY_REPORT_TYPES.has(artifact.type) && !isPlanTierAtLeast(planTier, "audit_ready")) {
    return c.json(
      {
        error: "insufficient_plan",
        required: "audit_ready",
        current: planTier,
      },
      402,
    );
  }

  return null;
}

export const complianceRoutes = new Hono<AppEnv>()
  .get(
    "/reports",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", generatedReportListSchema),
    async (c) => {
      const planTier = await getCurrentPlanTier(c);
      const result = await listGeneratedReportArtifacts(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        ...c.req.valid("query"),
        allowedTypes: allowedReportTypesForPlan(planTier),
      });
      return c.json(result);
    },
  )
  .get(
    "/reports/sefa/preview",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("audit_ready"),
    async (c) => {
      const fiscalYear = c.req.query("fiscalYear")?.trim();
      if (!fiscalYear) {
        return c.json({ error: "invalid_request", message: "fiscalYear is required" }, 400);
      }

      const result = await getSefaTripwire(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        fiscalYear,
      });
      return c.json(result);
    },
  )
  .post(
    "/reports/sefa",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("audit_ready"),
    zValidator("json", generateSefaReportSchema),
    async (c) => {
      const reportType = "sefa";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateSefaReport(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .get(
    "/reports/:reportId",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    async (c) => {
      const result = await getGeneratedReportArtifact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        reportId: c.req.param("reportId"),
      });

      const accessError = await assertArtifactAccess(c, result);
      if (accessError) {
        return accessError;
      }

      return c.json(result);
    },
  )
  .get(
    "/reports/:reportId/preview",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    async (c) => {
      const artifact = await getGeneratedReportArtifact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        reportId: c.req.param("reportId"),
      });
      const accessError = await assertArtifactAccess(c, artifact);
      if (accessError) {
        return accessError;
      }

      const preview = await getGeneratedReportPreview(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        reportId: c.req.param("reportId"),
      });
      return c.json(preview);
    },
  )
  .get(
    "/reports/:reportId/download",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    async (c) => {
      const artifact = await getGeneratedReportArtifact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        reportId: c.req.param("reportId"),
      });
      const accessError = await assertArtifactAccess(c, artifact);
      if (accessError) {
        return accessError;
      }

      return downloadReportArtifact(c.get("db"), c.env, {
        orgId: c.get("orgId")!,
        entityId: getActiveEntityId(c),
        reportId: c.req.param("reportId"),
      });
    },
  )
  .post(
    "/reports/compliance/grants/:grantId",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("growth"),
    zValidator("json", generateGrantComplianceReportSchema),
    async (c) => {
      const reportType = "compliance";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateGrantComplianceReport(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          grantId: c.req.param("grantId"),
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/audit/fiscal-years/:fiscalYear",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("growth"),
    zValidator("json", generateAuditReportSchema),
    async (c) => {
      const reportType = "audit";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateAuditReport(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          fiscalYear: c.req.param("fiscalYear"),
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/irs-990",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    zValidator("json", generateIrs990ReportSchema),
    async (c) => {
      const reportType = "irs_990";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateIrs990Report(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/board",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("growth"),
    zValidator("json", generateBoardReportSchema),
    async (c) => {
      const reportType = "board";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateBoardReport(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c)!,
          userId: actorId,
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/acknowledgments/donations/:donationId",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
      ["donors", "view"],
    ]),
    zValidator("json", generateAcknowledgmentLetterSchema),
    async (c) => {
      const reportType = "acknowledgment";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateAcknowledgmentLetter(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          donationId: c.req.param("donationId"),
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/donor-year-end-statements",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
      ["donors", "view"],
    ]),
    requirePlanTier("growth"),
    zValidator("json", generateDonorYearEndStatementRunSchema),
    async (c) => {
      const reportType = "donor_year_end_statement";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateDonorYearEndStatementRun(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .post(
    "/reports/spend-down",
    requireAllEntityPermissions([
      ["compliance", "view"],
      ["reports", "view"],
    ]),
    requirePlanTier("growth"),
    zValidator("json", generateSpendDownReportSchema),
    async (c) => {
      const reportType = "spend_down";
      const actorId = c.get("user")!.id;
      let report: GeneratedReportArtifact;
      try {
        report = await generateSpendDownReport(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          entityId: getActiveEntityId(c),
          userId: actorId,
          data: c.req.valid("json"),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("unknown");
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.reportGenerationFailed,
            payload: { report_type: reportType, failure_type: error.name },
          }),
        );
        throw err;
      }
      const reportCount = await countOrgReportsOfType(c, reportType);
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.reportGenerated,
          payload: { $insert_id: `${report.id}:ready`, report_type: reportType, actorId },
        }),
      );
      if (reportCount === 1) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.firstReportGenerated,
            payload: {
              $insert_id: `${report.id}:first-ready`,
              report_type: reportType,
              actorId,
            },
          }),
        );
      }
      return c.json(report, 201);
    },
  )
  .get("/templates/acknowledgment", requireEntityPermission("compliance", "view"), async (c) => {
    const template = await getAcknowledgmentTemplate(c.get("db"), {
      orgId: c.get("orgId")!,
    });
    return c.json(template);
  })
  .patch(
    "/templates/acknowledgment",
    requireEntityPermission("compliance", "manage"),
    zValidator("json", acknowledgmentTemplateSchema),
    async (c) => {
      const template = await updateAcknowledgmentTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        userId: c.get("user")!.id,
        data: c.req.valid("json"),
      });
      return c.json(template);
    },
  );
