import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  activityLog,
  contacts,
  documents,
  evidenceBundleItems,
  evidenceBundles,
  grants,
  orgMembers,
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringLogs,
  subrecipientMonitoringTasks,
  subrecipientRiskAssessments,
  subrecipients,
  type Database,
} from "@grantpipe/db";
import {
  createCorrectiveActionSchema,
  createFindingSchema,
  createMonitoringLogSchema,
  createMonitoringTaskSchema,
  createRiskAssessmentSchema,
  createSubawardSchema,
  createSubrecipientSchema,
  formatMinimumPlanLabelForFeatures,
  generateMonitoringTasksSchema,
  hasSubrecipientMonitoring,
  SUBRECIPIENT_RISK_RATINGS,
  subrecipientListSchema,
  updateCorrectiveActionSchema,
  updateFindingSchema,
  updateMonitoringTaskSchema,
  updateSubawardSchema,
  updateSubrecipientSchema,
  type CreateCorrectiveActionInput,
  type CreateFindingInput,
  type CreateMonitoringLogInput,
  type CreateMonitoringTaskInput,
  type CreateRiskAssessmentInput,
  type CreateSubawardInput,
  type CreateSubrecipientInput,
  type ExternalReviewScopeType,
  type GenerateMonitoringTasksInput,
  type SubrecipientListParams,
  type SubrecipientRiskRating,
  type UpdateCorrectiveActionInput,
  type UpdateFindingInput,
  type UpdateMonitoringTaskInput,
  type UpdateSubawardInput,
  type UpdateSubrecipientInput,
} from "@grantpipe/shared";
import { badRequest, notFound, paymentRequired } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";

type ActorParams = {
  orgId: string;
  actorId: string;
  planTier: string | null | undefined;
};

type TransactionDb = Parameters<Parameters<Database["transaction"]>[0]>[0];

type MonitoringTaskTemplate = {
  title: string;
  description: string;
  dueInDays: number;
};

type PortfolioSubrecipient = {
  id: string;
  name: string;
  status: string;
  ownerId: string | null;
  primaryContactId: string | null;
};

type PortfolioSubaward = {
  id: string;
  status: string;
  riskRating: string | null;
};

type PortfolioTask = {
  status: string;
  dueDate: Date;
};

type PortfolioFinding = {
  status: string;
};

type EvidenceManifestInput = {
  subrecipient: { id: string; name: string };
  subaward: { id: string; title: string };
  riskAssessments: Array<{ id: string; finalRiskRating: string }>;
  tasks: Array<{ id: string; title: string; evidenceDocumentId?: string | null }>;
  logs: Array<{ id: string; title: string; documentId?: string | null }>;
  findings: Array<{ id: string; title: string }>;
  correctiveActions: Array<{ id: string; title: string }>;
  documents: Array<{ id: string; filename: string }>;
  activityEntries: Array<{
    id: string;
    action: string;
    entityType: string;
    entityLabel?: string | null;
  }>;
};

type EvidenceManifestItem = {
  itemType: ExternalReviewScopeType;
  itemId: string;
  caption: string;
  sortOrder: number;
};

type CreateCorrectiveActionDataInput = Omit<CreateCorrectiveActionInput, "findingId"> & {
  findingId?: string;
};

const riskRank: Record<SubrecipientRiskRating, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const openTaskStatuses = new Set(["open", "in_progress"]);
const openFindingStatuses = new Set(["open", "in_review"]);
const SUBRECIPIENT_MONITORING_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasSubrecipientMonitoring",
]);

function assertSubrecipientMonitoring(planTier: string | null | undefined) {
  if (!hasSubrecipientMonitoring(planTier)) {
    throw paymentRequired(
      `Subrecipient monitoring requires the ${SUBRECIPIENT_MONITORING_PLAN_LABEL} plan.`,
      "insufficient_plan",
    );
  }
}

function isRiskRating(value: string | null | undefined): value is SubrecipientRiskRating {
  return Boolean(value && (SUBRECIPIENT_RISK_RATINGS as readonly string[]).includes(value));
}

function assertSubawardDateRange(startDate: Date, endDate: Date) {
  if (startDate.getTime() > endDate.getTime()) {
    throw badRequest("Start date must be before or equal to end date");
  }
}

async function getActiveSubrecipient(
  db: Database | TransactionDb,
  orgId: string,
  subrecipientId: string,
) {
  const row = await db.query.subrecipients.findFirst({
    where: and(
      eq(subrecipients.id, subrecipientId),
      eq(subrecipients.orgId, orgId),
      isNull(subrecipients.deletedAt),
    ),
  });
  if (!row) throw notFound("Subrecipient not found");
  return row;
}

async function getActiveSubaward(db: Database | TransactionDb, orgId: string, subawardId: string) {
  const row = await db.query.subawards.findFirst({
    where: and(
      eq(subawards.id, subawardId),
      eq(subawards.orgId, orgId),
      isNull(subawards.deletedAt),
    ),
  });
  if (!row) throw notFound("Subaward not found");
  return row;
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string) {
  const grant = await db.query.grants.findFirst({
    where: and(eq(grants.id, grantId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
    columns: { id: true },
  });
  if (!grant) throw badRequest("Grant does not belong to this organization");
}

async function assertContactInOrg(db: Database, orgId: string, contactId: string) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
    columns: { id: true },
  });
  if (!contact) throw badRequest("Contact does not belong to this organization");
}

async function assertUserInOrg(db: Database, orgId: string, userId: string) {
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.userId, userId),
      eq(orgMembers.orgId, orgId),
      isNull(orgMembers.deletedAt),
    ),
    columns: { id: true },
  });
  if (!member) throw badRequest("Owner does not belong to this organization");
}

async function assertDocumentInOrg(db: Database, orgId: string, documentId: string) {
  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.orgId, orgId),
      isNull(documents.deletedAt),
    ),
    columns: { id: true },
  });
  if (!document) throw badRequest("Document does not belong to this organization");
}

async function assertMonitoringTaskInSubaward(
  db: Database,
  orgId: string,
  subawardId: string,
  monitoringTaskId: string,
) {
  const task = await db.query.subrecipientMonitoringTasks.findFirst({
    where: and(
      eq(subrecipientMonitoringTasks.id, monitoringTaskId),
      eq(subrecipientMonitoringTasks.orgId, orgId),
      eq(subrecipientMonitoringTasks.subawardId, subawardId),
      isNull(subrecipientMonitoringTasks.deletedAt),
    ),
    columns: { id: true },
  });
  if (!task) throw badRequest("Monitoring task does not belong to this subaward");
}

export function getMonitoringTaskTemplates(
  riskRating: SubrecipientRiskRating,
): MonitoringTaskTemplate[] {
  const low: MonitoringTaskTemplate[] = [
    {
      title: "Agreement document on file",
      description: "Confirm the signed subaward agreement and required terms are attached.",
      dueInDays: 7,
    },
    {
      title: "Annual report review",
      description: "Review annual financial and performance reporting for the subaward.",
      dueInDays: 365,
    },
    {
      title: "Closeout check",
      description: "Confirm final deliverables, spending, and evidence before closeout.",
      dueInDays: 30,
    },
  ];
  const medium: MonitoringTaskTemplate[] = [
    ...low,
    {
      title: "Quarterly financial and performance review",
      description: "Review quarterly spend, deliverables, and variance notes.",
      dueInDays: 90,
    },
    {
      title: "Evidence completeness check",
      description: "Confirm invoices, reports, and supporting documentation are complete.",
      dueInDays: 120,
    },
  ];
  if (riskRating === "low") return low;
  if (riskRating === "medium") return medium;
  return [
    ...medium,
    {
      title: "Site visit or desk review",
      description: "Perform a site visit or documented desk review based on monitoring scope.",
      dueInDays: 60,
    },
    {
      title: "Corrective-action follow-up",
      description: "Review open findings and corrective-action progress.",
      dueInDays: 45,
    },
    {
      title: "Payment-condition review note",
      description: "Document whether payment conditions or additional approvals are needed.",
      dueInDays: 30,
    },
  ];
}

export function summarizeSubrecipientPortfolio(
  subrecipient: PortfolioSubrecipient,
  subrecipientSubawards: PortfolioSubaward[],
  tasks: PortfolioTask[],
  findings: PortfolioFinding[],
  now = new Date(),
) {
  const highestRiskRating = subrecipientSubawards.reduce<SubrecipientRiskRating | null>(
    (highest, subaward) => {
      if (!isRiskRating(subaward.riskRating)) return highest;
      if (!highest || riskRank[subaward.riskRating] > riskRank[highest]) {
        return subaward.riskRating;
      }
      return highest;
    },
    null,
  );

  const openTasks = tasks.filter((task) => openTaskStatuses.has(task.status));

  return {
    ...subrecipient,
    subawardCount: subrecipientSubawards.length,
    activeSubawardCount: subrecipientSubawards.filter((subaward) => subaward.status === "active")
      .length,
    highestRiskRating,
    openTaskCount: openTasks.length,
    overdueTaskCount: openTasks.filter((task) => task.dueDate.getTime() < now.getTime()).length,
    openFindingCount: findings.filter((finding) => openFindingStatuses.has(finding.status)).length,
  };
}

export function buildEvidenceBundleManifest(input: EvidenceManifestInput): EvidenceManifestItem[] {
  const documentIds = new Set<string>();
  const items: EvidenceManifestItem[] = [
    {
      itemType: "subrecipient",
      itemId: input.subrecipient.id,
      caption: `Subrecipient: ${input.subrecipient.name}`,
      sortOrder: 0,
    },
    {
      itemType: "subaward",
      itemId: input.subaward.id,
      caption: `Subaward: ${input.subaward.title}`,
      sortOrder: 1,
    },
  ];

  const addDocument = (documentId: string | null | undefined, caption: string) => {
    if (!documentId || documentIds.has(documentId)) return;
    documentIds.add(documentId);
    items.push({
      itemType: "document",
      itemId: documentId,
      caption,
      sortOrder: items.length,
    });
  };

  for (const assessment of input.riskAssessments) {
    items.push({
      itemType: "subrecipient_risk_assessment",
      itemId: assessment.id,
      caption: `Risk assessment: ${assessment.finalRiskRating}`,
      sortOrder: items.length,
    });
  }

  for (const task of input.tasks) {
    items.push({
      itemType: "subrecipient_monitoring_task",
      itemId: task.id,
      caption: `Task: ${task.title}`,
      sortOrder: items.length,
    });
    addDocument(task.evidenceDocumentId, `Task evidence: ${task.title}`);
  }

  for (const log of input.logs) {
    items.push({
      itemType: "subrecipient_monitoring_log",
      itemId: log.id,
      caption: `Monitoring log: ${log.title}`,
      sortOrder: items.length,
    });
    addDocument(log.documentId, `Log evidence: ${log.title}`);
  }

  for (const finding of input.findings) {
    items.push({
      itemType: "subrecipient_finding",
      itemId: finding.id,
      caption: `Finding: ${finding.title}`,
      sortOrder: items.length,
    });
  }

  for (const action of input.correctiveActions) {
    items.push({
      itemType: "subrecipient_corrective_action",
      itemId: action.id,
      caption: `Corrective action: ${action.title}`,
      sortOrder: items.length,
    });
  }

  for (const document of input.documents) {
    addDocument(document.id, `Linked document: ${document.filename}`);
  }

  for (const entry of input.activityEntries) {
    items.push({
      itemType: "activity_log",
      itemId: entry.id,
      caption: `Activity: ${entry.action} ${entry.entityLabel ?? entry.entityType}`,
      sortOrder: items.length,
    });
  }

  return items;
}

async function listSubawardsForSubrecipientIds(
  db: Database,
  orgId: string,
  subrecipientIds: string[],
) {
  if (subrecipientIds.length === 0) return [];
  return db
    .select()
    .from(subawards)
    .where(
      and(
        eq(subawards.orgId, orgId),
        inArray(subawards.subrecipientId, subrecipientIds),
        isNull(subawards.deletedAt),
      ),
    );
}

async function listTasksForSubawardIds(db: Database, orgId: string, subawardIds: string[]) {
  if (subawardIds.length === 0) return [];
  return db
    .select()
    .from(subrecipientMonitoringTasks)
    .where(
      and(
        eq(subrecipientMonitoringTasks.orgId, orgId),
        inArray(subrecipientMonitoringTasks.subawardId, subawardIds),
        isNull(subrecipientMonitoringTasks.deletedAt),
      ),
    );
}

async function listFindingsForSubawardIds(db: Database, orgId: string, subawardIds: string[]) {
  if (subawardIds.length === 0) return [];
  return db
    .select()
    .from(subrecipientFindings)
    .where(
      and(
        eq(subrecipientFindings.orgId, orgId),
        inArray(subrecipientFindings.subawardId, subawardIds),
        isNull(subrecipientFindings.deletedAt),
      ),
    );
}

export async function listSubrecipients(
  db: Database,
  params: ActorParams & SubrecipientListParams,
) {
  assertSubrecipientMonitoring(params.planTier);
  const filters = subrecipientListSchema.parse(params);
  const conditions = [eq(subrecipients.orgId, params.orgId), isNull(subrecipients.deletedAt)];
  if (filters.status) conditions.push(eq(subrecipients.status, filters.status));
  if (filters.ownerId) conditions.push(eq(subrecipients.ownerId, filters.ownerId));
  if (filters.search) {
    conditions.push(sql`${subrecipients.name} ilike ${`%${filters.search}%`}`);
  }

  const rows = await db
    .select()
    .from(subrecipients)
    .where(and(...conditions))
    .orderBy(desc(subrecipients.updatedAt));

  const subrecipientIds = rows.map((row) => row.id);
  const relatedSubawards = await listSubawardsForSubrecipientIds(db, params.orgId, subrecipientIds);
  const subawardIds = relatedSubawards.map((subaward) => subaward.id);
  const [tasks, findings] = await Promise.all([
    listTasksForSubawardIds(db, params.orgId, subawardIds),
    listFindingsForSubawardIds(db, params.orgId, subawardIds),
  ]);

  const filteredRows = rows
    .map((row) => {
      const rowSubawards = relatedSubawards.filter(
        (subaward) => subaward.subrecipientId === row.id,
      );
      const rowSubawardIds = new Set(rowSubawards.map((subaward) => subaward.id));
      return summarizeSubrecipientPortfolio(
        row,
        rowSubawards,
        tasks.filter((task) => rowSubawardIds.has(task.subawardId)),
        findings.filter((finding) => rowSubawardIds.has(finding.subawardId)),
      );
    })
    .filter((row) => !filters.riskRating || row.highestRiskRating === filters.riskRating)
    .filter((row) => {
      if (!filters.grantId) return true;
      return relatedSubawards.some(
        (subaward) => subaward.subrecipientId === row.id && subaward.grantId === filters.grantId,
      );
    })
    .filter((row) => filters.overdueTasks !== true || row.overdueTaskCount > 0)
    .filter((row) => filters.openFindings !== true || row.openFindingCount > 0);

  const start = (filters.page - 1) * filters.pageSize;
  const summary = {
    subrecipients: filteredRows.length,
    overdueTasks: filteredRows.reduce((sum, row) => sum + row.overdueTaskCount, 0),
    openFindings: filteredRows.reduce((sum, row) => sum + row.openFindingCount, 0),
    highRisk: filteredRows.filter((row) => row.highestRiskRating === "high").length,
  };
  return {
    rows: filteredRows.slice(start, start + filters.pageSize),
    total: filteredRows.length,
    summary,
  };
}

export async function getSubrecipient(
  db: Database,
  params: ActorParams & { subrecipientId: string },
) {
  assertSubrecipientMonitoring(params.planTier);
  const subrecipient = await getActiveSubrecipient(db, params.orgId, params.subrecipientId);
  const subrecipientSubawards = await listSubawardsForSubrecipientIds(db, params.orgId, [
    params.subrecipientId,
  ]);
  const subawardIds = subrecipientSubawards.map((subaward) => subaward.id);
  const [riskAssessments, monitoringTasks, monitoringLogs, findings, documentsRows] =
    await Promise.all([
      subawardIds.length === 0
        ? []
        : db
            .select()
            .from(subrecipientRiskAssessments)
            .where(
              and(
                eq(subrecipientRiskAssessments.orgId, params.orgId),
                inArray(subrecipientRiskAssessments.subawardId, subawardIds),
                isNull(subrecipientRiskAssessments.deletedAt),
              ),
            ),
      listTasksForSubawardIds(db, params.orgId, subawardIds),
      subawardIds.length === 0
        ? []
        : db
            .select()
            .from(subrecipientMonitoringLogs)
            .where(
              and(
                eq(subrecipientMonitoringLogs.orgId, params.orgId),
                inArray(subrecipientMonitoringLogs.subawardId, subawardIds),
                isNull(subrecipientMonitoringLogs.deletedAt),
              ),
            ),
      listFindingsForSubawardIds(db, params.orgId, subawardIds),
      db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.orgId, params.orgId),
            eq(documents.entityType, "subrecipient"),
            eq(documents.entityId, params.subrecipientId),
            isNull(documents.deletedAt),
          ),
        ),
    ]);
  const findingIds = findings.map((finding) => finding.id);
  const correctiveActions =
    findingIds.length === 0
      ? []
      : await db
          .select()
          .from(subrecipientCorrectiveActions)
          .where(
            and(
              eq(subrecipientCorrectiveActions.orgId, params.orgId),
              inArray(subrecipientCorrectiveActions.findingId, findingIds),
              isNull(subrecipientCorrectiveActions.deletedAt),
            ),
          );

  return {
    subrecipient,
    subawards: subrecipientSubawards,
    riskAssessments,
    monitoringTasks,
    monitoringLogs,
    findings,
    correctiveActions,
    documents: documentsRows,
  };
}

export async function listSubawards(
  db: Database,
  params: ActorParams & { grantId?: string | undefined; subrecipientId?: string | undefined },
) {
  assertSubrecipientMonitoring(params.planTier);
  const conditions = [eq(subawards.orgId, params.orgId), isNull(subawards.deletedAt)];
  if (params.grantId) conditions.push(eq(subawards.grantId, params.grantId));
  if (params.subrecipientId) conditions.push(eq(subawards.subrecipientId, params.subrecipientId));
  const rows = await db
    .select()
    .from(subawards)
    .where(and(...conditions))
    .orderBy(desc(subawards.updatedAt));
  const subawardIds = rows.map((row) => row.id);
  const [tasks, findings] = await Promise.all([
    listTasksForSubawardIds(db, params.orgId, subawardIds),
    listFindingsForSubawardIds(db, params.orgId, subawardIds),
  ]);

  return rows.map((row) => ({
    ...row,
    openTaskCount: tasks.filter(
      (task) => task.subawardId === row.id && openTaskStatuses.has(task.status),
    ).length,
    overdueTaskCount: tasks.filter(
      (task) =>
        task.subawardId === row.id &&
        openTaskStatuses.has(task.status) &&
        task.dueDate.getTime() < Date.now(),
    ).length,
    openFindingCount: findings.filter(
      (finding) => finding.subawardId === row.id && openFindingStatuses.has(finding.status),
    ).length,
  }));
}

export async function createSubrecipient(
  db: Database,
  params: ActorParams & { data: CreateSubrecipientInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createSubrecipientSchema.parse(params.data);
  if (data.primaryContactId) await assertContactInOrg(db, params.orgId, data.primaryContactId);
  if (data.ownerId) await assertUserInOrg(db, params.orgId, data.ownerId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subrecipients)
      .values({ orgId: params.orgId, createdBy: params.actorId, ...data })
      .returning();
    if (!row) throw badRequest("Failed to create subrecipient");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subrecipient",
      entityId: row.id,
      entityLabel: row.name,
      changes: { after: row },
    });
    return row;
  });
}

export async function updateSubrecipient(
  db: Database,
  params: ActorParams & { subrecipientId: string; data: UpdateSubrecipientInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const before = await getActiveSubrecipient(db, params.orgId, params.subrecipientId);
  const data = updateSubrecipientSchema.parse(params.data);
  if (data.primaryContactId) await assertContactInOrg(db, params.orgId, data.primaryContactId);
  if (data.ownerId) await assertUserInOrg(db, params.orgId, data.ownerId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subrecipients)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(subrecipients.id, params.subrecipientId),
          eq(subrecipients.orgId, params.orgId),
          isNull(subrecipients.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Subrecipient not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "subrecipient",
      entityId: row.id,
      entityLabel: row.name,
      changes: { before, after: row },
    });
    return row;
  });
}

export async function deleteSubrecipient(
  db: Database,
  params: ActorParams & { subrecipientId: string },
) {
  assertSubrecipientMonitoring(params.planTier);
  const before = await getActiveSubrecipient(db, params.orgId, params.subrecipientId);
  const activeSubaward = await db.query.subawards.findFirst({
    where: and(
      eq(subawards.subrecipientId, params.subrecipientId),
      eq(subawards.orgId, params.orgId),
      isNull(subawards.deletedAt),
    ),
    columns: { id: true },
  });
  if (activeSubaward) {
    throw badRequest("Cannot delete a subrecipient that still has active subawards");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subrecipients)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(subrecipients.id, params.subrecipientId),
          eq(subrecipients.orgId, params.orgId),
          isNull(subrecipients.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Subrecipient not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "subrecipient",
      entityId: before.id,
      entityLabel: before.name,
      changes: { before, after: row },
    });
    return row;
  });
}

export async function createSubaward(
  db: Database,
  params: ActorParams & { subrecipientId: string; data: CreateSubawardInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createSubawardSchema.parse(params.data);
  await getActiveSubrecipient(db, params.orgId, params.subrecipientId);
  await assertGrantInOrg(db, params.orgId, data.grantId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subawards)
      .values({
        orgId: params.orgId,
        subrecipientId: params.subrecipientId,
        createdBy: params.actorId,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      })
      .returning();
    if (!row) throw badRequest("Failed to create subaward");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subaward",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function getSubaward(db: Database, params: ActorParams & { subawardId: string }) {
  assertSubrecipientMonitoring(params.planTier);
  return getActiveSubaward(db, params.orgId, params.subawardId);
}

export async function updateSubaward(
  db: Database,
  params: ActorParams & { subawardId: string; data: UpdateSubawardInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = updateSubawardSchema.parse(params.data);
  const before = await getActiveSubaward(db, params.orgId, params.subawardId);
  if (data.grantId) await assertGrantInOrg(db, params.orgId, data.grantId);
  const startDate = data.startDate ? new Date(data.startDate) : new Date(before.startDate);
  const endDate = data.endDate ? new Date(data.endDate) : new Date(before.endDate);
  assertSubawardDateRange(startDate, endDate);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subawards)
      .set({
        ...data,
        startDate: data.startDate ? startDate : undefined,
        endDate: data.endDate ? endDate : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subawards.id, params.subawardId),
          eq(subawards.orgId, params.orgId),
          isNull(subawards.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Subaward not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "subaward",
      entityId: row.id,
      entityLabel: row.title,
      changes: { before, after: row },
    });
    return row;
  });
}

export async function createRiskAssessment(
  db: Database,
  params: ActorParams & { subawardId: string; data: CreateRiskAssessmentInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createRiskAssessmentSchema.parse(params.data);
  const before = await getActiveSubaward(db, params.orgId, params.subawardId);
  const assessedAt = data.assessedAt ? new Date(data.assessedAt) : new Date();
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .insert(subrecipientRiskAssessments)
      .values({
        orgId: params.orgId,
        subawardId: params.subawardId,
        checklist: data.checklist,
        suggestedRiskRating: data.suggestedRiskRating,
        finalRiskRating: data.finalRiskRating,
        overrideReason: data.overrideReason ?? null,
        assessedBy: params.actorId,
        assessedAt,
      })
      .returning();
    if (!assessment) throw badRequest("Failed to create risk assessment");
    const [after] = await tx
      .update(subawards)
      .set({ riskRating: data.finalRiskRating, updatedAt: new Date() })
      .where(
        and(
          eq(subawards.id, params.subawardId),
          eq(subawards.orgId, params.orgId),
          // Guard against a concurrent soft-delete between getActiveSubaward
          // (read outside the tx) and this write. Without it the riskRating
          // would be stamped onto a deleted subaward and the assessment insert
          // above would be orphaned; throwing rolls the whole transaction back.
          isNull(subawards.deletedAt),
        ),
      )
      .returning();
    if (!after) throw notFound("Subaward not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "risk_assessed",
      entityType: "subrecipient_risk_assessment",
      entityId: assessment.id,
      entityLabel: before.title,
      changes: { before: { riskRating: before.riskRating }, after },
    });
    return assessment;
  });
}

export async function createMonitoringTask(
  db: Database | TransactionDb,
  params: ActorParams & { subawardId: string; data: CreateMonitoringTaskInput },
) {
  const data = createMonitoringTaskSchema.parse(params.data);
  if (data.ownerId) await assertUserInOrg(db as Database, params.orgId, data.ownerId);
  if (data.evidenceDocumentId) {
    await assertDocumentInOrg(db as Database, params.orgId, data.evidenceDocumentId);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subrecipientMonitoringTasks)
      .values({
        orgId: params.orgId,
        subawardId: params.subawardId,
        createdBy: params.actorId,
        ...data,
        dueDate: new Date(data.dueDate),
      })
      .returning();
    if (!row) throw badRequest("Failed to create monitoring task");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subrecipient_monitoring_task",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function generateMonitoringTasks(
  db: Database,
  params: ActorParams & { subawardId: string; data: GenerateMonitoringTasksInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = generateMonitoringTasksSchema.parse(params.data);
  const subaward = await getActiveSubaward(db, params.orgId, params.subawardId);
  const riskRating =
    data.riskRating ?? (isRiskRating(subaward.riskRating) ? subaward.riskRating : "low");
  const now = new Date();
  return db.transaction(async (tx) =>
    Promise.all(
      getMonitoringTaskTemplates(riskRating).map((template) =>
        createMonitoringTask(tx, {
          ...params,
          data: {
            title: template.title,
            description: template.description,
            dueDate: new Date(
              now.getTime() + template.dueInDays * 24 * 60 * 60 * 1000,
            ).toISOString(),
            status: "open",
          },
        }),
      ),
    ),
  );
}

export async function updateMonitoringTask(
  db: Database,
  params: ActorParams & { taskId: string; data: UpdateMonitoringTaskInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = updateMonitoringTaskSchema.parse(params.data);
  if (data.evidenceDocumentId) await assertDocumentInOrg(db, params.orgId, data.evidenceDocumentId);
  if (data.ownerId) await assertUserInOrg(db, params.orgId, data.ownerId);
  const completionFields =
    data.status === "completed"
      ? {
          completedAt:
            data.completedAt === undefined || data.completedAt === null
              ? new Date()
              : new Date(data.completedAt),
          completedBy: params.actorId,
        }
      : data.status
        ? { completedAt: null, completedBy: null }
        : {
            completedAt:
              data.completedAt === undefined
                ? undefined
                : data.completedAt === null
                  ? null
                  : new Date(data.completedAt),
          };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subrecipientMonitoringTasks)
      .set({
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        ...completionFields,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subrecipientMonitoringTasks.id, params.taskId),
          eq(subrecipientMonitoringTasks.orgId, params.orgId),
          isNull(subrecipientMonitoringTasks.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Monitoring task not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: row.status === "completed" ? "completed" : "updated",
      entityType: "subrecipient_monitoring_task",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function createMonitoringLog(
  db: Database,
  params: ActorParams & { subawardId: string; data: CreateMonitoringLogInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createMonitoringLogSchema.parse(params.data);
  await getActiveSubaward(db, params.orgId, params.subawardId);
  if (data.documentId) await assertDocumentInOrg(db, params.orgId, data.documentId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subrecipientMonitoringLogs)
      .values({
        orgId: params.orgId,
        subawardId: params.subawardId,
        createdBy: params.actorId,
        ...data,
        occurredAt: new Date(data.occurredAt),
      })
      .returning();
    if (!row) throw badRequest("Failed to create monitoring log");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subrecipient_monitoring_log",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function createFinding(
  db: Database,
  params: ActorParams & { subawardId: string; data: CreateFindingInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createFindingSchema.parse(params.data);
  await getActiveSubaward(db, params.orgId, params.subawardId);
  if (data.monitoringTaskId) {
    await assertMonitoringTaskInSubaward(
      db,
      params.orgId,
      params.subawardId,
      data.monitoringTaskId,
    );
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subrecipientFindings)
      .values({
        orgId: params.orgId,
        subawardId: params.subawardId,
        createdBy: params.actorId,
        ...data,
      })
      .returning();
    if (!row) throw badRequest("Failed to create finding");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subrecipient_finding",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function updateFinding(
  db: Database,
  params: ActorParams & { findingId: string; data: UpdateFindingInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = updateFindingSchema.parse(params.data);
  const before = await db.query.subrecipientFindings.findFirst({
    where: and(
      eq(subrecipientFindings.id, params.findingId),
      eq(subrecipientFindings.orgId, params.orgId),
      isNull(subrecipientFindings.deletedAt),
    ),
  });
  if (!before) throw notFound("Finding not found");
  if (data.monitoringTaskId) {
    await assertMonitoringTaskInSubaward(
      db,
      params.orgId,
      before.subawardId,
      data.monitoringTaskId,
    );
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subrecipientFindings)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(subrecipientFindings.id, params.findingId),
          eq(subrecipientFindings.orgId, params.orgId),
          isNull(subrecipientFindings.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Finding not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "subrecipient_finding",
      entityId: row.id,
      entityLabel: row.title,
      changes: { before, after: row },
    });
    return row;
  });
}

export async function createCorrectiveAction(
  db: Database,
  params: ActorParams & { findingId: string; data: CreateCorrectiveActionDataInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = createCorrectiveActionSchema.parse({ ...params.data, findingId: params.findingId });
  const finding = await db.query.subrecipientFindings.findFirst({
    where: and(
      eq(subrecipientFindings.id, params.findingId),
      eq(subrecipientFindings.orgId, params.orgId),
      isNull(subrecipientFindings.deletedAt),
    ),
  });
  if (!finding) throw notFound("Finding not found");
  if (data.ownerId) await assertUserInOrg(db, params.orgId, data.ownerId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subrecipientCorrectiveActions)
      .values({
        orgId: params.orgId,
        createdBy: params.actorId,
        ...data,
        findingId: params.findingId,
        dueDate: new Date(data.dueDate),
      })
      .returning();
    if (!row) throw badRequest("Failed to create corrective action");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "subrecipient_corrective_action",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function updateCorrectiveAction(
  db: Database,
  params: ActorParams & { actionId: string; data: UpdateCorrectiveActionInput },
) {
  assertSubrecipientMonitoring(params.planTier);
  const data = updateCorrectiveActionSchema.parse(params.data);
  if (data.ownerId) await assertUserInOrg(db, params.orgId, data.ownerId);
  const completionFields =
    data.status === "completed"
      ? { completedAt: new Date() }
      : data.status
        ? { completedAt: null }
        : {};
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(subrecipientCorrectiveActions)
      .set({
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        ...completionFields,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subrecipientCorrectiveActions.id, params.actionId),
          eq(subrecipientCorrectiveActions.orgId, params.orgId),
          isNull(subrecipientCorrectiveActions.deletedAt),
        ),
      )
      .returning();
    if (!row) throw notFound("Corrective action not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: row.status === "completed" ? "completed" : "updated",
      entityType: "subrecipient_corrective_action",
      entityId: row.id,
      entityLabel: row.title,
      changes: { after: row },
    });
    return row;
  });
}

export async function createEvidenceBundle(
  db: Database,
  params: ActorParams & { subawardId: string },
) {
  assertSubrecipientMonitoring(params.planTier);
  const subaward = await getActiveSubaward(db, params.orgId, params.subawardId);
  const subrecipient = await getActiveSubrecipient(db, params.orgId, subaward.subrecipientId);
  const [riskAssessments, tasks, logs, findings] = await Promise.all([
    db
      .select()
      .from(subrecipientRiskAssessments)
      .where(
        and(
          eq(subrecipientRiskAssessments.orgId, params.orgId),
          eq(subrecipientRiskAssessments.subawardId, params.subawardId),
          isNull(subrecipientRiskAssessments.deletedAt),
        ),
      ),
    db
      .select()
      .from(subrecipientMonitoringTasks)
      .where(
        and(
          eq(subrecipientMonitoringTasks.orgId, params.orgId),
          eq(subrecipientMonitoringTasks.subawardId, params.subawardId),
          isNull(subrecipientMonitoringTasks.deletedAt),
        ),
      ),
    db
      .select()
      .from(subrecipientMonitoringLogs)
      .where(
        and(
          eq(subrecipientMonitoringLogs.orgId, params.orgId),
          eq(subrecipientMonitoringLogs.subawardId, params.subawardId),
          isNull(subrecipientMonitoringLogs.deletedAt),
        ),
      ),
    db
      .select()
      .from(subrecipientFindings)
      .where(
        and(
          eq(subrecipientFindings.orgId, params.orgId),
          eq(subrecipientFindings.subawardId, params.subawardId),
          isNull(subrecipientFindings.deletedAt),
        ),
      ),
  ]);

  const findingIds = findings.map((finding) => finding.id);
  const correctiveActions =
    findingIds.length === 0
      ? []
      : await db
          .select()
          .from(subrecipientCorrectiveActions)
          .where(
            and(
              eq(subrecipientCorrectiveActions.orgId, params.orgId),
              inArray(subrecipientCorrectiveActions.findingId, findingIds),
              isNull(subrecipientCorrectiveActions.deletedAt),
            ),
          );

  const actionIds = correctiveActions.map((action) => action.id);
  const entityScopes = [
    { entityType: "subrecipient", entityId: subrecipient.id },
    { entityType: "subaward", entityId: subaward.id },
    ...riskAssessments.map((row) => ({
      entityType: "subrecipient_risk_assessment",
      entityId: row.id,
    })),
    ...tasks.map((row) => ({ entityType: "subrecipient_monitoring_task", entityId: row.id })),
    ...logs.map((row) => ({ entityType: "subrecipient_monitoring_log", entityId: row.id })),
    ...findings.map((row) => ({ entityType: "subrecipient_finding", entityId: row.id })),
    ...actionIds.map((id) => ({ entityType: "subrecipient_corrective_action", entityId: id })),
  ];

  const entityConditions = entityScopes.map((scope) =>
    and(eq(documents.entityType, scope.entityType), eq(documents.entityId, scope.entityId)),
  );
  const activityConditions = entityScopes.map((scope) =>
    and(eq(activityLog.entityType, scope.entityType), eq(activityLog.entityId, scope.entityId)),
  );

  const [documentsRows, activityEntries] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.orgId, params.orgId),
          isNull(documents.deletedAt),
          or(...entityConditions),
        ),
      ),
    db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.orgId, params.orgId), or(...activityConditions)))
      .orderBy(desc(activityLog.createdAt)),
  ]);

  const manifest = buildEvidenceBundleManifest({
    subrecipient,
    subaward,
    riskAssessments,
    tasks,
    logs,
    findings,
    correctiveActions,
    documents: documentsRows,
    activityEntries,
  });

  const { bundle, items } = await db.transaction(async (tx) => {
    const [existingSubawardItem] = await tx
      .select()
      .from(evidenceBundleItems)
      .where(
        and(
          eq(evidenceBundleItems.itemType, "subaward"),
          eq(evidenceBundleItems.itemId, subaward.id),
        ),
      )
      .limit(1);

    let txBundle =
      existingSubawardItem &&
      (await tx.query.evidenceBundles.findFirst({
        where: and(
          eq(evidenceBundles.id, existingSubawardItem.bundleId),
          eq(evidenceBundles.orgId, params.orgId),
          isNull(evidenceBundles.deletedAt),
        ),
      }));

    if (!txBundle) {
      const [created] = await tx
        .insert(evidenceBundles)
        .values({
          orgId: params.orgId,
          title: `${subaward.title} subrecipient evidence bundle`,
          description: `Monitoring evidence for ${subrecipient.name}.`,
          purpose: "audit",
          periodStart: subaward.startDate,
          periodEnd: subaward.endDate,
          createdBy: params.actorId,
        })
        .returning();
      if (!created) throw badRequest("Failed to create evidence bundle");
      txBundle = created;
    }

    await tx.delete(evidenceBundleItems).where(eq(evidenceBundleItems.bundleId, txBundle.id));
    const txItems = await tx
      .insert(evidenceBundleItems)
      .values(manifest.map((item) => ({ ...item, bundleId: txBundle.id })))
      .returning();

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "evidence_bundle_created",
      entityType: "subaward",
      entityId: subaward.id,
      entityLabel: subaward.title,
      changes: { bundleId: txBundle.id, itemCount: txItems.length },
    });

    return { bundle: txBundle, items: txItems };
  });
  return {
    bundle,
    items,
    riskAssessments,
    tasks,
    logs,
    findings,
    correctiveActions,
    documents: documentsRows,
    activityEntries,
  };
}
