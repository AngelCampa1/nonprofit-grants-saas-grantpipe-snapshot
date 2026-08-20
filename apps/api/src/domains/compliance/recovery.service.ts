import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { generatedReports, type Database } from "@grantpipe/db";
import type { Bindings } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { deliverReportReadyEffects } from "../report-builder/ready-effects";

const RECOVERY_DELAY_MS = 5 * 60_000;
const RETRY_BACKOFF_MS = 60 * 60_000;
const SPECIALIZED_PENDING_LEASE_MS = 24 * 60 * 60_000;
const RECOVERY_BATCH_SIZE = 25;
const RECOVERABLE_TYPES = [
  "audit",
  "board",
  "compliance",
  "irs_990",
  "sefa",
  "spend_down",
] as const;
const CLEANUP_TYPES = ["acknowledgment", ...RECOVERABLE_TYPES, "donor_year_end_statement"] as const;
const SPECIALIZED_PENDING_TYPES = ["acknowledgment", "donor_year_end_statement"] as const;

export function isRecoverableComplianceReportType(type: string): boolean {
  return (RECOVERABLE_TYPES as readonly string[]).includes(type);
}

type RecoveryEnv = Pick<Bindings, "APP_URL" | "INTEGRATION_MODE" | "R2">;
type RecoveryRow = typeof generatedReports.$inferSelect;

async function stampRecoveryBackoff(db: Database, report: RecoveryRow, now: Date) {
  try {
    await db
      .update(generatedReports)
      .set({ recoveryAttemptedAt: now })
      .where(
        and(
          eq(generatedReports.id, report.id),
          eq(generatedReports.orgId, report.orgId),
          eq(generatedReports.status, report.status),
        ),
      )
      .returning({ id: generatedReports.id });
  } catch (error) {
    captureBackgroundException(error, "compliance_report_recovery", {
      operation: "backoff_stamp",
      report_type: report.type,
    });
  }
}

async function reconcilePendingArtifact(
  db: Database,
  env: RecoveryEnv,
  report: RecoveryRow,
  now: Date,
) {
  const storage = getIntegrations(db, env as Bindings).storage;
  const object = await storage.get(report.fileKey);
  if (!object) {
    const [failed] = await db
      .update(generatedReports)
      .set({ status: "failed", recoveryAttemptedAt: now })
      .where(
        and(
          eq(generatedReports.id, report.id),
          eq(generatedReports.orgId, report.orgId),
          eq(generatedReports.status, "pending"),
        ),
      )
      .returning({ id: generatedReports.id });
    return Boolean(failed);
  }

  const [ready] = await db
    .update(generatedReports)
    .set({
      status: "ready",
      readyEffectsStatus: "pending",
      metadata: sql`coalesce(${generatedReports.metadata}, '{}'::jsonb) || '{"recoveredFromPending":true}'::jsonb`,
    })
    .where(
      and(
        eq(generatedReports.id, report.id),
        eq(generatedReports.orgId, report.orgId),
        eq(generatedReports.status, "pending"),
      ),
    )
    .returning();
  if (!ready) return false;
  await deliverReportReadyEffects(db, env, ready.id, now);
  return true;
}

async function cleanupFailedArtifact(
  db: Database,
  env: RecoveryEnv,
  report: RecoveryRow,
  now: Date,
) {
  const previousAttempt = report.recoveryAttemptedAt;
  const [claimed] = await db
    .update(generatedReports)
    .set({ recoveryAttemptedAt: now })
    .where(
      and(
        eq(generatedReports.id, report.id),
        eq(generatedReports.orgId, report.orgId),
        eq(generatedReports.status, "failed"),
        previousAttempt
          ? eq(generatedReports.recoveryAttemptedAt, previousAttempt)
          : isNull(generatedReports.recoveryAttemptedAt),
        sql`coalesce(${generatedReports.metadata}->>'artifactCleanupCompleted', 'false') <> 'true'`,
      ),
    )
    .returning({ id: generatedReports.id });
  if (!claimed) return false;

  await getIntegrations(db, env as Bindings).storage.delete(report.fileKey);
  const cleanupMetadata = JSON.stringify({
    artifactCleanupCompleted: true,
    artifactCleanupCompletedAt: now.toISOString(),
  });
  const [cleaned] = await db
    .update(generatedReports)
    .set({
      recoveryAttemptedAt: now,
      metadata: sql`coalesce(${generatedReports.metadata}, '{}'::jsonb) || ${cleanupMetadata}::jsonb`,
    })
    .where(
      and(
        eq(generatedReports.id, report.id),
        eq(generatedReports.orgId, report.orgId),
        eq(generatedReports.status, "failed"),
        eq(generatedReports.recoveryAttemptedAt, now),
        sql`coalesce(${generatedReports.metadata}->>'artifactCleanupCompleted', 'false') <> 'true'`,
      ),
    )
    .returning({ id: generatedReports.id });
  return Boolean(cleaned);
}

async function failAndCleanupSpecializedPendingArtifact(
  db: Database,
  env: RecoveryEnv,
  report: RecoveryRow,
  now: Date,
) {
  const previousAttempt = report.recoveryAttemptedAt;
  const safeRecoveryMetadata = JSON.stringify({
    recoveryFailure: {
      stage: "specialized_pending_expired",
      errorName: "InterruptedGeneration",
    },
  });
  const [failed] = await db
    .update(generatedReports)
    .set({
      status: "failed",
      recoveryAttemptedAt: now,
      metadata: sql`coalesce(${generatedReports.metadata}, '{}'::jsonb) || ${safeRecoveryMetadata}::jsonb`,
    })
    .where(
      and(
        eq(generatedReports.id, report.id),
        eq(generatedReports.orgId, report.orgId),
        eq(generatedReports.type, report.type),
        eq(generatedReports.status, "pending"),
        lt(generatedReports.createdAt, new Date(now.getTime() - SPECIALIZED_PENDING_LEASE_MS)),
        previousAttempt
          ? eq(generatedReports.recoveryAttemptedAt, previousAttempt)
          : isNull(generatedReports.recoveryAttemptedAt),
      ),
    )
    .returning();
  if (!failed) return false;

  return cleanupFailedArtifact(
    db,
    env,
    { ...report, ...failed, status: "failed", recoveryAttemptedAt: now },
    now,
  );
}

export async function recoverPendingComplianceArtifacts(
  db: Database,
  env: RecoveryEnv,
  now = new Date(),
): Promise<number> {
  const reportQuery = db.query?.generatedReports;
  if (!reportQuery?.findMany) return 0;
  const candidates = await reportQuery.findMany({
    where: and(
      or(
        and(
          inArray(generatedReports.type, [...RECOVERABLE_TYPES]),
          eq(generatedReports.status, "pending"),
          lt(generatedReports.createdAt, new Date(now.getTime() - RECOVERY_DELAY_MS)),
          or(
            isNull(generatedReports.recoveryAttemptedAt),
            lt(generatedReports.recoveryAttemptedAt, new Date(now.getTime() - RETRY_BACKOFF_MS)),
          ),
        ),
        and(
          inArray(generatedReports.type, [...CLEANUP_TYPES]),
          eq(generatedReports.status, "failed"),
          sql`coalesce(${generatedReports.metadata}->>'artifactCleanupCompleted', 'false') <> 'true'`,
          or(
            isNull(generatedReports.recoveryAttemptedAt),
            lt(generatedReports.recoveryAttemptedAt, new Date(now.getTime() - RETRY_BACKOFF_MS)),
          ),
        ),
        and(
          inArray(generatedReports.type, [...SPECIALIZED_PENDING_TYPES]),
          eq(generatedReports.status, "pending"),
          lt(generatedReports.createdAt, new Date(now.getTime() - SPECIALIZED_PENDING_LEASE_MS)),
          or(
            isNull(generatedReports.recoveryAttemptedAt),
            lt(generatedReports.recoveryAttemptedAt, new Date(now.getTime() - RETRY_BACKOFF_MS)),
          ),
        ),
      ),
    ),
    orderBy: [
      sql`${generatedReports.recoveryAttemptedAt} asc nulls first`,
      asc(generatedReports.createdAt),
      asc(generatedReports.id),
    ],
    limit: RECOVERY_BATCH_SIZE,
  });

  let completed = 0;
  for (const report of candidates) {
    if (report.status === "pending" && !isRecoverableComplianceReportType(report.type)) {
      if (
        !(SPECIALIZED_PENDING_TYPES as readonly string[]).includes(report.type) ||
        report.createdAt >= new Date(now.getTime() - SPECIALIZED_PENDING_LEASE_MS)
      ) {
        continue;
      }
    }
    if (report.status === "failed" && !(CLEANUP_TYPES as readonly string[]).includes(report.type)) {
      continue;
    }
    try {
      const didComplete =
        report.status === "failed"
          ? await cleanupFailedArtifact(db, env, report, now)
          : (SPECIALIZED_PENDING_TYPES as readonly string[]).includes(report.type)
            ? await failAndCleanupSpecializedPendingArtifact(db, env, report, now)
            : await reconcilePendingArtifact(db, env, report, now);
      if (didComplete) completed += 1;
    } catch (error) {
      captureBackgroundException(error, "compliance_report_recovery", {
        operation:
          report.status === "failed"
            ? "cleanup_failed"
            : (SPECIALIZED_PENDING_TYPES as readonly string[]).includes(report.type)
              ? "expire_specialized_pending"
              : "reconcile_pending",
        report_type: report.type,
      });
      await stampRecoveryBackoff(db, report, now);
    }
  }
  return completed;
}
