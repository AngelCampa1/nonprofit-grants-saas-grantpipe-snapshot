import { neutralizeCsvFormula } from "../../lib/csv";
import { and, eq, gte, lte, desc, count } from "drizzle-orm";
import { externalReviewAuditEvents, type ExternalReviewAuditEvent } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import { type ExternalReviewEventType, type ListAuditEventsInput } from "@grantpipe/shared";
import { toJsonSafeCount } from "./list-utils";
import { captureBackgroundException } from "../../lib/sentry";

export async function recordAuditEvent(
  db: Database,
  params: {
    orgId: string;
    sessionId: string;
    reviewerId: string;
    eventType: ExternalReviewEventType;
    targetType?: string;
    targetId?: string;
    ipHash?: string;
    userAgentHash?: string;
  },
  options: { throwOnFailure?: boolean } = {},
): Promise<void> {
  try {
    await db.insert(externalReviewAuditEvents).values({
      orgId: params.orgId,
      sessionId: params.sessionId,
      reviewerId: params.reviewerId,
      eventType: params.eventType,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      ipHash: params.ipHash ?? null,
      userAgentHash: params.userAgentHash ?? null,
    });
  } catch (err) {
    // Audit events must never throw — suppress errors but log for Worker observability
    console.error("[audit-event] failed to record:", err);
    captureBackgroundException(err, "external-reviewer-portal", {
      step: "audit_event_record",
      audit_event_type: params.eventType,
    });
    if (options.throwOnFailure) {
      throw err;
    }
  }
}

export async function listAuditEvents(
  db: Database,
  orgId: string,
  params: ListAuditEventsInput,
): Promise<{ items: ExternalReviewAuditEvent[]; total: number }> {
  const conditions = [eq(externalReviewAuditEvents.orgId, orgId)];

  if (params.sessionId) {
    conditions.push(eq(externalReviewAuditEvents.sessionId, params.sessionId));
  }

  if (params.reviewerId) {
    conditions.push(eq(externalReviewAuditEvents.reviewerId, params.reviewerId));
  }

  if (params.eventType) {
    conditions.push(eq(externalReviewAuditEvents.eventType, params.eventType));
  }

  if (params.fromDate) {
    conditions.push(gte(externalReviewAuditEvents.createdAt, new Date(params.fromDate)));
  }

  if (params.toDate) {
    conditions.push(lte(externalReviewAuditEvents.createdAt, new Date(params.toDate)));
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ value: count() })
    .from(externalReviewAuditEvents)
    .where(whereClause);

  const total = toJsonSafeCount(countResult?.value);

  const items = await db
    .select()
    .from(externalReviewAuditEvents)
    .where(whereClause)
    .orderBy(desc(externalReviewAuditEvents.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return { items, total };
}

export async function exportAuditEventsCSV(
  db: Database,
  orgId: string,
  sessionId?: string,
): Promise<string> {
  const conditions = [eq(externalReviewAuditEvents.orgId, orgId)];

  if (sessionId) {
    conditions.push(eq(externalReviewAuditEvents.sessionId, sessionId));
  }

  const rows = await db
    .select()
    .from(externalReviewAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(externalReviewAuditEvents.createdAt));

  const headers = [
    "id",
    "session_id",
    "reviewer_id",
    "event_type",
    "target_type",
    "target_id",
    "created_at",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        csvCell(row.id),
        csvCell(row.sessionId),
        csvCell(row.reviewerId),
        csvCell(row.eventType),
        csvCell(row.targetType ?? ""),
        csvCell(row.targetId ?? ""),
        csvCell(row.createdAt.toISOString()),
      ].join(","),
    ),
  ];

  return lines.join("\n");
}

function csvCell(value: string): string {
  return `"${neutralizeCsvFormula(value).replaceAll('"', '""')}"`;
}
