import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  canUseCrossEntityReportBuilder,
  resolveEffectivePermissions,
  type ParsedCreateReportDefinitionInput,
  type ParsedReportBuilderPreviewInput,
  type FeatureArea,
  type PermissionMap,
  type ReportBuilderPreview,
  type ReportBuilderEntity,
  type ReportBuilderRunInput,
  type Role,
  reportBuilderListSchema,
  reportBuilderPreviewSchema,
  reportBuilderRunSchema,
  createReportDefinitionSchema,
  updateReportDefinitionSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requireEntityPermission } from "../../middleware/require-role";
import {
  createReportDefinition,
  deleteReportDefinition,
  getReportBuilderMetadata,
  listReportDefinitions,
  previewReportDefinition,
  runReportDefinition,
  updateReportDefinition,
} from "./service";

function assertReportBuilderEntitlement(planTier: string): Response | null {
  if (!canUseCrossEntityReportBuilder(planTier)) {
    return Response.json(
      {
        error: "insufficient_plan",
        message: "The Cross-Entity Report Builder is available on the Enterprise plan.",
      },
      { status: 403 },
    );
  }
  return null;
}

type ReportBuilderOperation = "definition_save" | "preview" | "export";
const ENTITY_FEATURES: Record<ReportBuilderEntity, FeatureArea> = {
  donors: "donors",
  donations: "donors",
  grants: "grants",
  funds: "funds",
};
const PERMISSION_RANK = { none: 0, view: 1, edit: 2, manage: 3 } as const;

function countBucket(value: number): string {
  if (value <= 0) return "0";
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

function safeDefinitionProperties(
  data: ParsedCreateReportDefinitionInput | ParsedReportBuilderPreviewInput,
) {
  return {
    entity_type: data.entity,
    report_type: "custom_report",
    surface: "report_builder",
    column_count: data.columns.length,
    custom_field_count: data.customFieldIds.length,
    filter_count: data.filters.length,
    sort_count: data.sort.length,
    has_description: "description" in data && Boolean(data.description?.trim()),
  };
}

function getEffectivePermissions(c: Context<AppEnv>): PermissionMap {
  const role = c.get("memberRole") as Role;
  return resolveEffectivePermissions(role, c.get("memberPermissions"));
}

function getAllowedReportBuilderEntities(c: Context<AppEnv>): ReportBuilderEntity[] {
  const permissions = getEffectivePermissions(c);
  return (Object.keys(ENTITY_FEATURES) as ReportBuilderEntity[]).filter(
    (entity) => PERMISSION_RANK[permissions[ENTITY_FEATURES[entity]]] >= PERMISSION_RANK.view,
  );
}

function assertEntityAccess(c: Context<AppEnv>, entity: ReportBuilderEntity): Response | null {
  if (getAllowedReportBuilderEntities(c).includes(entity)) return null;
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

async function captureReportBuilderAnalytics(
  c: Context<AppEnv>,
  params: {
    eventName: string;
    operation: ReportBuilderOperation;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: {
        ...params.payload,
        operation: params.operation,
      },
    });
  } catch (error) {
    captureBackgroundException(error, "report_builder", {
      operation: params.operation,
      telemetry: "analytics_capture",
    });
  }
}

export const reportBuilderRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const guard = assertReportBuilderEntitlement(getContextEffectivePlanTier(c));
    if (guard) return guard;
    await next();
  })
  .get("/metadata", requireEntityPermission("reports", "view"), async (c) => {
    const result = await getReportBuilderMetadata(c.get("db"), {
      orgId: c.get("orgId")!,
      allowedEntities: getAllowedReportBuilderEntities(c),
    });
    return c.json(result);
  })
  .get(
    "/definitions",
    requireEntityPermission("reports", "view"),
    zValidator("query", reportBuilderListSchema),
    async (c) => {
      const query = c.req.valid("query");
      if (query.entity) {
        const guard = assertEntityAccess(c, query.entity);
        if (guard) return guard;
      }
      const result = await listReportDefinitions(c.get("db"), {
        orgId: c.get("orgId")!,
        allowedEntities: getAllowedReportBuilderEntities(c),
        ...query,
      });
      return c.json(result);
    },
  )
  .post(
    "/definitions",
    requireEntityPermission("reports", "view"),
    zValidator("json", createReportDefinitionSchema),
    async (c) => {
      const data = c.req.valid("json");
      const guard = assertEntityAccess(c, data.entity);
      if (guard) return guard;
      const result = await createReportDefinition(c.get("db"), {
        orgId: c.get("orgId")!,
        userId: c.get("user")!.id,
        data,
      });
      await captureReportBuilderAnalytics(c, {
        eventName: ANALYTICS_EVENTS.reportBuilderDefinitionSaved,
        operation: "definition_save",
        payload: safeDefinitionProperties(data),
      });
      return c.json(result, 201);
    },
  )
  .patch(
    "/definitions/:definitionId",
    requireEntityPermission("reports", "view"),
    zValidator("json", updateReportDefinitionSchema),
    async (c) => {
      const data = c.req.valid("json");
      if (data.entity) {
        const guard = assertEntityAccess(c, data.entity);
        if (guard) return guard;
      }
      const result = await updateReportDefinition(c.get("db"), {
        orgId: c.get("orgId")!,
        definitionId: c.req.param("definitionId"),
        data,
        allowedEntities: getAllowedReportBuilderEntities(c),
      });
      return c.json(result);
    },
  )
  .delete("/definitions/:definitionId", requireEntityPermission("reports", "view"), async (c) => {
    await deleteReportDefinition(c.get("db"), {
      orgId: c.get("orgId")!,
      definitionId: c.req.param("definitionId"),
      allowedEntities: getAllowedReportBuilderEntities(c),
    });
    return c.json({ success: true });
  })
  .post(
    "/preview",
    requireEntityPermission("reports", "view"),
    zValidator("json", reportBuilderPreviewSchema),
    async (c) => {
      const data = c.req.valid("json") as ParsedReportBuilderPreviewInput;
      const guard = assertEntityAccess(c, data.entity);
      if (guard) return guard;
      const result = await previewReportDefinition(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId") ?? undefined,
        data,
      });
      await captureReportBuilderAnalytics(c, {
        eventName: ANALYTICS_EVENTS.reportBuilderPreviewGenerated,
        operation: "preview",
        payload: {
          ...safeDefinitionProperties(data),
          limit_bucket: countBucket(data.limit),
          total_rows_bucket: countBucket((result as ReportBuilderPreview).totalRows),
        },
      });
      return c.json(result);
    },
  )
  .post(
    "/definitions/:definitionId/run",
    requireEntityPermission("reports", "view"),
    zValidator("json", reportBuilderRunSchema),
    async (c) => {
      const data = c.req.valid("json") as ReportBuilderRunInput;
      const result = await runReportDefinition(c.get("db"), c.env, {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId") ?? undefined,
        userId: c.get("user")!.id,
        definitionId: c.req.param("definitionId"),
        data,
        allowedEntities: getAllowedReportBuilderEntities(c),
      });
      return c.json(result, 201);
    },
  );
