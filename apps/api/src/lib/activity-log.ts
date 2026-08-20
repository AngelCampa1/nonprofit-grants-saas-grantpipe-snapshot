import { activityLog, type TransactionDatabase } from "@grantpipe/db";
import type { ActivityEntityType } from "@grantpipe/shared";
import { captureBackgroundException } from "./sentry";

type ActivityLogChanges = Record<string, unknown> | null;

export async function recordActivityLog(
  db: TransactionDatabase,
  params: {
    orgId: string;
    activeEntityId?: string | null;
    actorId: string;
    action: string;
    entityType: ActivityEntityType;
    entityId: string;
    entityLabel?: string | null;
    changes?: ActivityLogChanges;
  },
) {
  await db.insert(activityLog).values({
    orgId: params.orgId,
    activeEntityId: params.activeEntityId ?? null,
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel ?? null,
    changes: params.changes ?? null,
  });
}

/**
 * Records an activity-log entry without letting a logging failure propagate.
 *
 * Use this for the audit-trail write that trails an already-committed,
 * irreversible side effect (a queue enqueue, an R2 object write, a sync run
 * marked complete). In those cases the user-visible operation has already
 * succeeded, so a failed audit insert must not surface as an error or — worse,
 * in a queue consumer — trigger a retry that duplicates the work. The failure
 * is logged to the console for observability and otherwise swallowed.
 */
export async function recordActivityLogBestEffort(
  db: TransactionDatabase,
  params: {
    orgId: string;
    activeEntityId?: string | null;
    actorId: string;
    action: string;
    entityType: ActivityEntityType;
    entityId: string;
    entityLabel?: string | null;
    changes?: ActivityLogChanges;
  },
): Promise<void> {
  try {
    await recordActivityLog(db, params);
  } catch (error) {
    console.error("Failed to record activity log (best-effort)", {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    // The audit trail is written across dozens of routes; a systematic failure
    // here would silently break it. Surface it to Sentry without propagating.
    captureBackgroundException(error, "activity-log", {
      action: params.action,
      entity_type: params.entityType,
    });
  }
}
