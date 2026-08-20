import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { activityLog, generatedReports, type Database } from "@grantpipe/db";
import { ANALYTICS_EVENTS, type PlanTier } from "@grantpipe/shared";
import type { Bindings } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { recordTrialFeatureUsage } from "../org/trial-usage";
import { runSettledWithConcurrency } from "../../lib/bounded-concurrency";

type ReadyEffectsEnv = Partial<Omit<Bindings, "R2">> & { R2?: unknown };

const CLAIM_LEASE_MS = 5 * 60_000;
const RETRY_BACKOFF_MS = 60 * 60_000;
const DELIVERY_CONCURRENCY = 5;
const TRACKED_TRIAL_TIERS = new Set<PlanTier>(["growth", "audit_ready", "enterprise"]);

function countBucket(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value <= 0) return "0";
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

function readMetadata(report: typeof generatedReports.$inferSelect) {
  return typeof report.metadata === "object" && report.metadata !== null
    ? (report.metadata as Record<string, unknown>)
    : {};
}

function canonicalEvents(report: typeof generatedReports.$inferSelect, isFirstReport: boolean) {
  const metadata = readMetadata(report);
  const recoveredEvent =
    metadata.recoveredFromPending === true
      ? [
          {
            eventName: "report_export_recovered",
            payload: {
              $insert_id: `${report.id}:recovered`,
              report_type: report.type,
            },
          },
        ]
      : [];
  if (report.type === "custom_report") {
    const reportBuilder =
      typeof metadata.reportBuilder === "object" && metadata.reportBuilder !== null
        ? (metadata.reportBuilder as Record<string, unknown>)
        : {};
    return [
      {
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: {
          $insert_id: `${report.id}:ready`,
          report_type: "custom_report",
          surface: "report_builder",
          file_format: "csv",
          operation: "export",
          total_rows_bucket: countBucket(reportBuilder.totalRows),
        },
      },
      ...recoveredEvent,
    ];
  }
  if (report.type === "restricted_rollforward") {
    return [
      {
        eventName: ANALYTICS_EVENTS.restrictedRollforwardGenerated,
        payload: {
          $insert_id: `${report.id}:ready`,
          actorId: report.generatedBy,
          report_type: "restricted_rollforward",
          entity_type: "restricted_rollforward",
          include_evidence_package: metadata.includeEvidencePackage === true,
          has_fund: Boolean(metadata.fundId),
          has_grant: Boolean(metadata.grantId),
        },
      },
      ...recoveredEvent,
    ];
  }
  const events: Array<{ eventName: string; payload: Record<string, unknown> }> = [
    {
      eventName: ANALYTICS_EVENTS.reportGenerated,
      payload: {
        $insert_id: `${report.id}:ready`,
        actorId: report.generatedBy,
        report_type: report.type,
      },
    },
  ];
  if (isFirstReport) {
    events.push({
      eventName: ANALYTICS_EVENTS.firstReportGenerated,
      payload: {
        $insert_id: `${report.id}:first-ready`,
        actorId: report.generatedBy,
        report_type: report.type,
      },
    });
  }
  events.push(...recoveredEvent);
  return events;
}

async function isFirstReportOfType(db: Database, report: typeof generatedReports.$inferSelect) {
  if (report.type === "custom_report" || report.type === "restricted_rollforward") return false;
  const first = await db.query?.generatedReports?.findFirst({
    where: and(
      eq(generatedReports.orgId, report.orgId),
      eq(generatedReports.type, report.type),
      eq(generatedReports.status, "ready"),
    ),
    orderBy: [asc(generatedReports.createdAt), asc(generatedReports.id)],
    columns: { id: true },
  });
  return first?.id === report.id;
}

function trackedTrialTier(value: string | null): PlanTier | null {
  return value && TRACKED_TRIAL_TIERS.has(value as PlanTier) ? (value as PlanTier) : null;
}

async function deliverReportReadyEffectsUnsafe(
  db: Database,
  env: ReadyEffectsEnv,
  reportId: string,
  now = new Date(),
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  const retryBefore = new Date(now.getTime() - RETRY_BACKOFF_MS);
  const [claimed] = await db
    .update(generatedReports)
    .set({
      readyEffectsStatus: "sending",
      readyEffectsClaimedAt: now,
      readyEffectsLastAttemptedAt: now,
      readyEffectsAttemptCount: sql`${generatedReports.readyEffectsAttemptCount} + 1`,
    })
    .where(
      and(
        eq(generatedReports.id, reportId),
        eq(generatedReports.status, "ready"),
        isNull(generatedReports.readyEffectsAnalyticsDeliveredAt),
        or(
          and(
            eq(generatedReports.readyEffectsStatus, "pending"),
            or(
              isNull(generatedReports.readyEffectsLastAttemptedAt),
              lt(generatedReports.readyEffectsLastAttemptedAt, retryBefore),
            ),
          ),
          and(
            eq(generatedReports.readyEffectsStatus, "sending"),
            or(
              isNull(generatedReports.readyEffectsClaimedAt),
              lt(generatedReports.readyEffectsClaimedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning();
  if (!claimed) return false;

  try {
    await db
      .insert(activityLog)
      .values({
        id: `report-ready:${claimed.id}`,
        orgId: claimed.orgId,
        activeEntityId: claimed.entityId,
        actorId: claimed.generatedBy,
        action: "exported",
        entityType: "generated_report",
        entityId: claimed.id,
        changes: { type: claimed.type, title: claimed.title },
      })
      .onConflictDoNothing({ target: activityLog.id });

    const trialTier = trackedTrialTier(claimed.readyEffectsTrialTier);
    if (trialTier && !claimed.readyEffectsTrialUsageRecordedAt) {
      await db.transaction(async (tx) => {
        const [marked] = await tx
          .update(generatedReports)
          .set({ readyEffectsTrialUsageRecordedAt: now })
          .where(
            and(
              eq(generatedReports.id, claimed.id),
              eq(generatedReports.readyEffectsStatus, "sending"),
              eq(generatedReports.readyEffectsClaimedAt, now),
              isNull(generatedReports.readyEffectsTrialUsageRecordedAt),
            ),
          )
          .returning({ id: generatedReports.id });
        if (marked) {
          await recordTrialFeatureUsage(tx as unknown as Database, {
            orgId: claimed.orgId,
            requiredTier: trialTier,
          });
        }
      });
    }

    const events = canonicalEvents(claimed, await isFirstReportOfType(db, claimed));
    for (const event of events) {
      await getIntegrations(db, env as Bindings).analytics.capture({
        orgId: claimed.orgId,
        eventName: event.eventName,
        payload: event.payload,
      });
    }
    await db
      .update(generatedReports)
      .set({
        readyEffectsStatus: "delivered",
        readyEffectsAnalyticsDeliveredAt: now,
      })
      .where(
        and(
          eq(generatedReports.id, claimed.id),
          eq(generatedReports.readyEffectsStatus, "sending"),
          eq(generatedReports.readyEffectsClaimedAt, now),
          isNull(generatedReports.readyEffectsAnalyticsDeliveredAt),
        ),
      );
    return true;
  } catch (error) {
    captureBackgroundException(error, "report_ready_effects", {
      report_type: claimed.type,
      operation: "deliver",
    });
    await db
      .update(generatedReports)
      .set({ readyEffectsStatus: "pending", readyEffectsClaimedAt: null })
      .where(
        and(
          eq(generatedReports.id, claimed.id),
          eq(generatedReports.readyEffectsStatus, "sending"),
          eq(generatedReports.readyEffectsClaimedAt, now),
          isNull(generatedReports.readyEffectsAnalyticsDeliveredAt),
        ),
      );
    return false;
  }
}

export async function deliverReportReadyEffects(
  db: Database,
  env: ReadyEffectsEnv,
  reportId: string,
  now = new Date(),
): Promise<boolean> {
  try {
    return await deliverReportReadyEffectsUnsafe(db, env, reportId, now);
  } catch (error) {
    captureBackgroundException(error, "report_ready_effects", {
      operation: "claim_or_persist",
    });
    return false;
  }
}

export async function dispatchPendingReportReadyEffects(
  db: Database,
  env: ReadyEffectsEnv,
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  const retryBefore = new Date(now.getTime() - RETRY_BACKOFF_MS);
  const reportQuery = db.query?.generatedReports;
  if (!reportQuery?.findMany) return 0;
  const reports = await reportQuery.findMany({
    where: and(
      eq(generatedReports.status, "ready"),
      isNotNull(generatedReports.readyEffectsStatus),
      isNull(generatedReports.readyEffectsAnalyticsDeliveredAt),
      or(
        and(
          eq(generatedReports.readyEffectsStatus, "pending"),
          or(
            isNull(generatedReports.readyEffectsLastAttemptedAt),
            lt(generatedReports.readyEffectsLastAttemptedAt, retryBefore),
          ),
        ),
        and(
          eq(generatedReports.readyEffectsStatus, "sending"),
          or(
            isNull(generatedReports.readyEffectsClaimedAt),
            lt(generatedReports.readyEffectsClaimedAt, staleBefore),
          ),
        ),
      ),
    ),
    orderBy: [
      sql`${generatedReports.readyEffectsLastAttemptedAt} asc nulls first`,
      asc(generatedReports.createdAt),
      asc(generatedReports.id),
    ],
    limit: 50,
  });
  let delivered = 0;
  await runSettledWithConcurrency(reports, DELIVERY_CONCURRENCY, async (report) => {
    if (await deliverReportReadyEffects(db, env, report.id, now)) delivered += 1;
  });
  return delivered;
}
