import { and, count, eq } from "drizzle-orm";
import { importHistory } from "@grantpipe/db";
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  importCommitSchema,
  importHistoryListSchema,
  importMigrationPlanQuerySchema,
  importPreviewSchema,
  type ImportEntityType,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { blockRole, requirePermission } from "../../middleware/require-role";
import { commitImport, getImportMigrationPlan, listImportHistory, previewImport } from "./service";

type ImportCommitResult = Awaited<ReturnType<typeof commitImport>>;

function swallowCapture(promise: Promise<unknown>, eventName: string): void {
  void promise.catch((error) => {
    captureBackgroundException(error, "import", {
      telemetry: "analytics_capture",
      analytics_event: eventName,
    });
  });
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function getRowCountBucket(count: number): string {
  if (count <= 0) {
    return "0";
  }

  if (count <= 10) {
    return "1-10";
  }

  if (count <= 100) {
    return "11-100";
  }

  if (count <= 1000) {
    return "101-1000";
  }

  return "1000+";
}

function captureImportEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");

  if (!orgId || !user) {
    return;
  }

  swallowCapture(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: {
        actorId: user.id,
        ...payload,
      },
    }),
    eventName,
  );
}

function importPreviewPayload(
  entityType: ImportEntityType,
  totalRows: number,
): Record<string, string> {
  return {
    entity_type: entityType,
    total_rows_bucket: getRowCountBucket(totalRows),
  };
}

function importCompletedPayload(
  result: ImportCommitResult,
  entityType: ImportEntityType,
): Record<string, string> {
  return {
    entity_type: entityType,
    total_rows_bucket: getRowCountBucket(result.totalRows),
    inserted_rows_bucket: getRowCountBucket(result.insertedRows),
    duplicate_rows_bucket: getRowCountBucket(result.duplicateRows),
    failed_rows_bucket: getRowCountBucket(result.failedRows),
    contacts_created_bucket: getRowCountBucket(result.createdCounts.contacts ?? 0),
    donations_created_bucket: getRowCountBucket(result.createdCounts.donations ?? 0),
    grants_created_bucket: getRowCountBucket(result.createdCounts.grants ?? 0),
    funders_created_bucket: getRowCountBucket(result.createdCounts.funders ?? 0),
    grant_opportunities_created_bucket: getRowCountBucket(
      result.createdCounts.grantOpportunities ?? 0,
    ),
    funds_created_bucket: getRowCountBucket(result.createdCounts.funds ?? 0),
    opening_balance_lines_created_bucket: getRowCountBucket(
      result.createdCounts.openingBalanceLines ?? 0,
    ),
    pledges_created_bucket: getRowCountBucket(result.createdCounts.pledges ?? 0),
    pledge_installments_created_bucket: getRowCountBucket(
      result.createdCounts.pledgeInstallments ?? 0,
    ),
  };
}

export const importRoutes = new Hono<AppEnv>()
  .use(blockRole("auditor"))
  .get(
    "/migration-plan",
    requirePermission("import", "edit"),
    zValidator("query", importMigrationPlanQuerySchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId") ?? null;
      const payload = c.req.valid("query");
      const plan = await getImportMigrationPlan(db, { orgId, entityId, source: payload.source });
      captureImportEvent(c, ANALYTICS_EVENTS.migrationStudioPlanViewed, {
        migration_source: plan.sourceId,
        migration_next_entity_type: plan.nextEntityType ?? "complete",
      });
      return c.json(plan);
    },
  )
  .get(
    "/",
    requirePermission("import", "edit"),
    zValidator("query", importHistoryListSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId") ?? null;
      const history = await listImportHistory(db, {
        orgId,
        entityId,
        ...c.req.valid("query"),
      });

      return c.json(history);
    },
  )
  .post(
    "/preview",
    requirePermission("import", "edit"),
    zValidator("json", importPreviewSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId") ?? null;
      const payload = c.req.valid("json");
      const preview = await previewImport(db, { ...payload, orgId, entityId });
      captureImportEvent(
        c,
        ANALYTICS_EVENTS.importPreviewStarted,
        importPreviewPayload(payload.entityType, preview.totalRows),
      );
      return c.json(preview);
    },
  )
  .post(
    "/commit",
    requirePermission("import", "edit"),
    zValidator("json", importCommitSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId") ?? null;
      const userId = c.get("user")!.id;
      const payload = c.req.valid("json");
      let result: ImportCommitResult;

      try {
        result = await commitImport(db, { ...payload, orgId, userId, entityId });
      } catch (error) {
        captureImportEvent(c, ANALYTICS_EVENTS.importFailed, {
          entity_type: payload.entityType,
          failure_type: error instanceof Error ? "api_error" : "unknown_error",
          total_rows_bucket: getRowCountBucket(payload.rows.length),
        });
        throw error;
      }

      captureImportEvent(
        c,
        ANALYTICS_EVENTS.importCompleted,
        importCompletedPayload(result, payload.entityType),
      );
      if (orgId) {
        const isFirstImport = await db
          .select({ value: count() })
          .from(importHistory)
          .where(
            entityId
              ? and(eq(importHistory.orgId, orgId), eq(importHistory.entityId, entityId))
              : eq(importHistory.orgId, orgId),
          )
          .then((rows) => rows[0]?.value === 1)
          .catch((error: unknown) => {
            captureBackgroundException(error, "import", {
              step: "first_import_count",
            });
            return false;
          });
        if (isFirstImport) {
          swallowCapture(
            analyticsForContext(c).capture({
              orgId,
              eventName: ANALYTICS_EVENTS.firstImportCompleted,
              payload: { actorId: userId },
            }),
            ANALYTICS_EVENTS.firstImportCompleted,
          );
        }
      }
      return c.json(result, 201);
    },
  );
