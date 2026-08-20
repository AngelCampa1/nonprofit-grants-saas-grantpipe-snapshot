import { and, eq, isNull } from "drizzle-orm";
import {
  activityLog,
  documents,
  evidenceBundles,
  funds,
  generatedReports,
  grantPaymentRequests,
  grants,
  programs,
  restrictionTerms,
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringLogs,
  subrecipientMonitoringTasks,
  subrecipientRiskAssessments,
  subrecipients,
} from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import type { DocumentEntityType, ExternalReviewScopeType } from "@grantpipe/shared";
import { notFound } from "../../lib/app-error";

type ScopeTarget = {
  scopeType: ExternalReviewScopeType;
  scopeId: string;
};

type ScopeTargetRecord =
  | {
      id: string;
      entityType?: string;
    }
  | null
  | undefined;

const EXTERNAL_REVIEW_DOCUMENT_ENTITY_TYPES = new Set<DocumentEntityType>([
  "grant",
  "fund",
  "generated_report",
  "payment_request",
  "award_intake",
  "subrecipient",
  "subaward",
  "subrecipient_monitoring_task",
  "subrecipient_finding",
  "subrecipient_corrective_action",
]);

const EXTERNAL_REVIEW_SUBRECIPIENT_FILE_ENTITY_TYPES = new Set<DocumentEntityType>([
  "subrecipient",
  "subaward",
  "subrecipient_monitoring_task",
  "subrecipient_finding",
  "subrecipient_corrective_action",
]);

export function isExternalReviewDocumentEntityType(entityType: string): boolean {
  return EXTERNAL_REVIEW_DOCUMENT_ENTITY_TYPES.has(entityType as DocumentEntityType);
}

export function isExternalReviewSubrecipientFileEntityType(entityType: string): boolean {
  return EXTERNAL_REVIEW_SUBRECIPIENT_FILE_ENTITY_TYPES.has(entityType as DocumentEntityType);
}

async function findScopeTarget(
  db: TransactionDatabase,
  orgId: string,
  scope: ScopeTarget,
): Promise<ScopeTargetRecord> {
  switch (scope.scopeType) {
    case "grant":
      return db.query.grants.findFirst({
        where: and(eq(grants.id, scope.scopeId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
        columns: { id: true },
      });
    case "fund":
      return db.query.funds.findFirst({
        where: and(eq(funds.id, scope.scopeId), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
        columns: { id: true },
      });
    case "program":
      return db.query.programs.findFirst({
        where: and(
          eq(programs.id, scope.scopeId),
          eq(programs.orgId, orgId),
          isNull(programs.deletedAt),
        ),
        columns: { id: true },
      });
    case "document":
    case "subrecipient_file":
      return db.query.documents.findFirst({
        where: and(
          eq(documents.id, scope.scopeId),
          eq(documents.orgId, orgId),
          isNull(documents.deletedAt),
        ),
        columns: { id: true, entityType: true },
      });
    case "generated_report":
      return db.query.generatedReports.findFirst({
        where: and(
          eq(generatedReports.id, scope.scopeId),
          eq(generatedReports.orgId, orgId),
          eq(generatedReports.status, "ready"),
        ),
        columns: { id: true },
      });
    case "evidence_bundle":
      return db.query.evidenceBundles.findFirst({
        where: and(
          eq(evidenceBundles.id, scope.scopeId),
          eq(evidenceBundles.orgId, orgId),
          isNull(evidenceBundles.deletedAt),
        ),
        columns: { id: true },
      });
    case "restriction_term":
      return db.query.restrictionTerms.findFirst({
        where: and(
          eq(restrictionTerms.id, scope.scopeId),
          eq(restrictionTerms.orgId, orgId),
          isNull(restrictionTerms.deletedAt),
        ),
        columns: { id: true },
      });
    case "reimbursement_request":
      return db.query.grantPaymentRequests.findFirst({
        where: and(
          eq(grantPaymentRequests.id, scope.scopeId),
          eq(grantPaymentRequests.orgId, orgId),
          isNull(grantPaymentRequests.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient":
      return db.query.subrecipients.findFirst({
        where: and(
          eq(subrecipients.id, scope.scopeId),
          eq(subrecipients.orgId, orgId),
          isNull(subrecipients.deletedAt),
        ),
        columns: { id: true },
      });
    case "subaward":
      return db.query.subawards.findFirst({
        where: and(
          eq(subawards.id, scope.scopeId),
          eq(subawards.orgId, orgId),
          isNull(subawards.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient_risk_assessment":
      return db.query.subrecipientRiskAssessments.findFirst({
        where: and(
          eq(subrecipientRiskAssessments.id, scope.scopeId),
          eq(subrecipientRiskAssessments.orgId, orgId),
          isNull(subrecipientRiskAssessments.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient_monitoring_task":
      return db.query.subrecipientMonitoringTasks.findFirst({
        where: and(
          eq(subrecipientMonitoringTasks.id, scope.scopeId),
          eq(subrecipientMonitoringTasks.orgId, orgId),
          isNull(subrecipientMonitoringTasks.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient_monitoring_log":
      return db.query.subrecipientMonitoringLogs.findFirst({
        where: and(
          eq(subrecipientMonitoringLogs.id, scope.scopeId),
          eq(subrecipientMonitoringLogs.orgId, orgId),
          isNull(subrecipientMonitoringLogs.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient_finding":
      return db.query.subrecipientFindings.findFirst({
        where: and(
          eq(subrecipientFindings.id, scope.scopeId),
          eq(subrecipientFindings.orgId, orgId),
          isNull(subrecipientFindings.deletedAt),
        ),
        columns: { id: true },
      });
    case "subrecipient_corrective_action":
      return db.query.subrecipientCorrectiveActions.findFirst({
        where: and(
          eq(subrecipientCorrectiveActions.id, scope.scopeId),
          eq(subrecipientCorrectiveActions.orgId, orgId),
          isNull(subrecipientCorrectiveActions.deletedAt),
        ),
        columns: { id: true },
      });
    case "activity_log":
      return db.query.activityLog.findFirst({
        where: and(eq(activityLog.id, scope.scopeId), eq(activityLog.orgId, orgId)),
        columns: { id: true },
      });
  }

  throw notFound("Review scope target not found");
}

/**
 * Resolve a human-readable display name for a review scope target so the
 * external reviewer portal can show "Annual Operating Grant" instead of a
 * meaningless truncated UUID. Returns null for scope types that have no
 * single obvious name column (the portal falls back to the humanized type).
 */
export async function resolveScopeName(
  db: TransactionDatabase,
  orgId: string,
  scope: ScopeTarget,
): Promise<string | null> {
  switch (scope.scopeType) {
    case "grant": {
      const row = await db.query.grants.findFirst({
        where: and(eq(grants.id, scope.scopeId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
        columns: { name: true },
      });
      return row?.name ?? null;
    }
    case "fund": {
      const row = await db.query.funds.findFirst({
        where: and(eq(funds.id, scope.scopeId), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
        columns: { name: true },
      });
      return row?.name ?? null;
    }
    case "program": {
      const row = await db.query.programs.findFirst({
        where: and(
          eq(programs.id, scope.scopeId),
          eq(programs.orgId, orgId),
          isNull(programs.deletedAt),
        ),
        columns: { name: true },
      });
      return row?.name ?? null;
    }
    case "document":
    case "subrecipient_file": {
      const row = await db.query.documents.findFirst({
        where: and(
          eq(documents.id, scope.scopeId),
          eq(documents.orgId, orgId),
          isNull(documents.deletedAt),
        ),
        columns: { filename: true },
      });
      return row?.filename ?? null;
    }
    case "generated_report": {
      const row = await db.query.generatedReports.findFirst({
        where: and(eq(generatedReports.id, scope.scopeId), eq(generatedReports.orgId, orgId)),
        columns: { title: true },
      });
      return row?.title ?? null;
    }
    case "evidence_bundle": {
      const row = await db.query.evidenceBundles.findFirst({
        where: and(
          eq(evidenceBundles.id, scope.scopeId),
          eq(evidenceBundles.orgId, orgId),
          isNull(evidenceBundles.deletedAt),
        ),
        columns: { title: true },
      });
      return row?.title ?? null;
    }
    case "restriction_term": {
      const row = await db.query.restrictionTerms.findFirst({
        where: and(
          eq(restrictionTerms.id, scope.scopeId),
          eq(restrictionTerms.orgId, orgId),
          isNull(restrictionTerms.deletedAt),
        ),
        columns: { title: true },
      });
      return row?.title ?? null;
    }
    default:
      return null;
  }
}

function assertScopeTargetAllowed(scope: ScopeTarget, target: ScopeTargetRecord, message: string) {
  if (!target) {
    throw notFound(message);
  }

  if (
    scope.scopeType === "document" &&
    !isExternalReviewDocumentEntityType(target.entityType ?? "")
  ) {
    throw notFound(message);
  }

  if (
    scope.scopeType === "subrecipient_file" &&
    !isExternalReviewSubrecipientFileEntityType(target.entityType ?? "")
  ) {
    throw notFound(message);
  }
}

export async function assertScopeTargetsBelongToOrg(
  db: TransactionDatabase,
  orgId: string,
  scopes: ScopeTarget[],
): Promise<void> {
  for (const scope of scopes) {
    const target = await findScopeTarget(db, orgId, scope);
    assertScopeTargetAllowed(scope, target, "Review scope target not found");
  }
}

export async function assertScopeTargetBelongsToOrg(
  db: TransactionDatabase,
  orgId: string,
  scope: ScopeTarget,
  message = "Review scope target not found",
): Promise<void> {
  const target = await findScopeTarget(db, orgId, scope);
  assertScopeTargetAllowed(scope, target, message);
}
