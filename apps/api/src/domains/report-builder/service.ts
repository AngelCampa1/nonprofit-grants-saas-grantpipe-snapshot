import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  contacts,
  customFieldDefinitions,
  customFieldValues,
  donations,
  expenses,
  funds,
  generatedReports,
  grantFundAllocations,
  grants,
  organizations,
  savedReportDefinitions,
  type Database,
} from "@grantpipe/db";
import {
  REPORT_BUILDER_COLUMNS,
  REPORT_BUILDER_ENTITIES,
  reportBuilderEntitySchema,
  reportBuilderFilterSchema,
  reportBuilderSortSchema,
  type GeneratedReportArtifact,
  type ParsedCreateReportDefinitionInput,
  type ParsedReportBuilderPreviewInput,
  type ParsedUpdateReportDefinitionInput,
  type ReportBuilderDefinition,
  type ReportBuilderEntity,
  type ReportBuilderFieldOption,
  type ReportBuilderListParams,
  type ReportBuilderMetadata,
  type ReportBuilderPreview,
  type ReportBuilderRunInput,
} from "@grantpipe/shared";
import type { Bindings } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { badRequest, notFound } from "../../lib/app-error";
import { escapeCsvCell } from "../../lib/csv";
import { captureBackgroundException } from "../../lib/sentry";
import { deliverReportReadyEffects } from "./ready-effects";

type PreviewRow = Record<string, string | number | boolean | null>;

type PersistedReportDefinition = typeof savedReportDefinitions.$inferSelect;
const persistedFiltersSchema = reportBuilderFilterSchema.array();
const persistedSortSchema = reportBuilderSortSchema.array();

const ENTITY_LABELS: Record<ReportBuilderEntity, string> = {
  donors: "Donors",
  donations: "Donations",
  grants: "Grants",
  funds: "Funds",
};

const CUSTOM_FIELD_ENTITY_TYPES: Record<ReportBuilderEntity, string> = {
  donors: "contact",
  donations: "donation",
  grants: "grant",
  funds: "fund",
};

async function resolveDefaultEntityId(db: Database, orgId: string) {
  if (!db.query?.organizations?.findFirst) return "entity-1";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (!org?.defaultEntityId) throw badRequest("Organization default entity is required.");
  return org.defaultEntityId;
}

const COLUMN_LABELS: Record<string, string> = {
  amountCents: "Amount",
  applicationDeadline: "Application deadline",
  balanceCents: "Balance",
  createdAt: "Created",
  date: "Date",
  displayName: "Name",
  donorName: "Donor",
  email: "Email",
  emailOptOut: "Email opt-out",
  endDate: "End date",
  fundName: "Fund",
  funderName: "Funder",
  grantName: "Grant",
  name: "Name",
  netAssetClass: "Net asset class",
  phone: "Phone",
  pipelineStage: "Pipeline stage",
  receiptSent: "Receipt sent",
  restriction: "Restriction",
  startDate: "Start date",
  status: "Status",
  type: "Type",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function getDonorName(contact: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  email?: string | null;
}) {
  const individual = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return contact.organizationName?.trim() || individual || contact.email || "Unnamed donor";
}

export function getReportBuilderColumnLabel(id: string, customFieldName?: string) {
  if (customFieldName) return customFieldName;
  return (
    COLUMN_LABELS[id] ??
    id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())
  );
}

export function buildReportBuilderCsv(preview: ReportBuilderPreview) {
  const header = preview.columns.map((column) => escapeCsvCell(column.label)).join(",");
  const rows = preview.rows.map((row) =>
    preview.columns.map((column) => escapeCsvCell(row[column.id])).join(","),
  );
  return [header, ...rows].join("\n");
}

export function toReportBuilderDefinition(row: {
  id: string;
  name: string;
  description: string | null;
  entity: string;
  columns: string[];
  customFieldIds: string[];
  filters: unknown;
  sort: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): ReportBuilderDefinition {
  const entity = reportBuilderEntitySchema.parse(row.entity);
  const filters = persistedFiltersSchema.parse(row.filters);
  const sort = persistedSortSchema.parse(row.sort);

  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    entity,
    columns: row.columns,
    customFieldIds: row.customFieldIds,
    filters,
    sort,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function generatedReportArtifact(
  row: typeof generatedReports.$inferSelect,
): GeneratedReportArtifact {
  return {
    id: row.id,
    type: row.type as GeneratedReportArtifact["type"],
    format: row.format as GeneratedReportArtifact["format"],
    status: row.status as GeneratedReportArtifact["status"],
    title: row.title,
    fileName: row.fileName,
    downloadPath: `/api/compliance/reports/${row.id}/download`,
    previewPath: `/api/compliance/reports/${row.id}/preview`,
    internalPath: `/reports/${row.id}`,
    createdAt: row.createdAt.toISOString(),
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  };
}

function buildColumnOptions(entity: ReportBuilderEntity): ReportBuilderFieldOption[] {
  return REPORT_BUILDER_COLUMNS[entity].map((column) => ({
    id: column,
    label: getReportBuilderColumnLabel(column),
  }));
}

async function getCustomFieldOptions(db: Database, orgId: string) {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.orgId, orgId), isNull(customFieldDefinitions.deletedAt)))
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.name));

  return rows.map((row) => ({
    id: row.id,
    entity: REPORT_BUILDER_ENTITIES.find(
      (entity) => CUSTOM_FIELD_ENTITY_TYPES[entity] === row.entityType,
    ),
    name: row.name,
    fieldType: row.fieldType,
  }));
}

export async function getReportBuilderMetadata(
  db: Database,
  params: { orgId: string; allowedEntities?: readonly ReportBuilderEntity[] },
): Promise<ReportBuilderMetadata> {
  const customFields = await getCustomFieldOptions(db, params.orgId);
  const visibleEntities = params.allowedEntities ?? REPORT_BUILDER_ENTITIES;
  return {
    entities: Object.fromEntries(
      REPORT_BUILDER_ENTITIES.map((entity) => [
        entity,
        {
          label: ENTITY_LABELS[entity],
          columns: visibleEntities.includes(entity) ? buildColumnOptions(entity) : [],
          customFields: visibleEntities.includes(entity)
            ? customFields
                .filter((field) => field.entity === entity)
                .map(({ entity: _entity, ...field }) => ({ ...field, entity }))
            : [],
        },
      ]),
    ) as ReportBuilderMetadata["entities"],
  };
}

export async function listReportDefinitions(
  db: Database,
  params: {
    orgId: string;
    allowedEntities?: readonly ReportBuilderEntity[];
  } & ReportBuilderListParams,
): Promise<ReportBuilderDefinition[]> {
  const allowedEntities = params.allowedEntities ?? REPORT_BUILDER_ENTITIES;
  if (allowedEntities.length === 0) return [];
  const entityFilter = params.entity
    ? eq(savedReportDefinitions.entity, params.entity)
    : inArray(savedReportDefinitions.entity, [...allowedEntities]);
  const where = and(
    eq(savedReportDefinitions.orgId, params.orgId),
    entityFilter,
    isNull(savedReportDefinitions.deletedAt),
  );
  const rows = await db
    .select()
    .from(savedReportDefinitions)
    .where(where)
    .orderBy(desc(savedReportDefinitions.updatedAt));
  return rows.map((row) => toReportBuilderDefinition(row as PersistedReportDefinition));
}

export async function createReportDefinition(
  db: Database,
  params: { orgId: string; userId: string; data: ParsedCreateReportDefinitionInput },
): Promise<ReportBuilderDefinition> {
  await assertSelectedCustomFieldsBelongToEntity(db, {
    orgId: params.orgId,
    entity: params.data.entity,
    customFieldIds: params.data.customFieldIds,
  });
  const [row] = await db
    .insert(savedReportDefinitions)
    .values({
      orgId: params.orgId,
      createdBy: params.userId,
      name: params.data.name,
      description: params.data.description,
      entity: params.data.entity,
      columns: params.data.columns,
      customFieldIds: params.data.customFieldIds,
      filters: params.data.filters,
      sort: params.data.sort,
    })
    .returning();
  return toReportBuilderDefinition(row as PersistedReportDefinition);
}

export async function updateReportDefinition(
  db: Database,
  params: {
    orgId: string;
    definitionId: string;
    data: ParsedUpdateReportDefinitionInput;
    allowedEntities?: readonly ReportBuilderEntity[];
  },
): Promise<ReportBuilderDefinition> {
  const current = await db.query.savedReportDefinitions.findFirst({
    where: and(
      eq(savedReportDefinitions.id, params.definitionId),
      eq(savedReportDefinitions.orgId, params.orgId),
      isNull(savedReportDefinitions.deletedAt),
    ),
  });
  if (!current) throw notFound("Report definition not found");
  const currentEntity = reportBuilderEntitySchema.parse(current.entity);
  if (params.allowedEntities && !params.allowedEntities.includes(currentEntity)) {
    throw notFound("Report definition not found");
  }
  const nextEntity = params.data.entity ?? currentEntity;
  const nextColumns = params.data.columns ?? current.columns;
  const invalidColumn = nextColumns.find(
    (column) => !(REPORT_BUILDER_COLUMNS[nextEntity] as readonly string[]).includes(column),
  );
  if (invalidColumn) {
    throw badRequest(`${invalidColumn} is not available for ${nextEntity} reports.`);
  }
  await assertSelectedCustomFieldsBelongToEntity(db, {
    orgId: params.orgId,
    entity: nextEntity,
    customFieldIds: params.data.customFieldIds ?? current.customFieldIds,
  });
  const [row] = await db
    .update(savedReportDefinitions)
    .set({
      ...params.data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(savedReportDefinitions.id, params.definitionId),
        eq(savedReportDefinitions.orgId, params.orgId),
        isNull(savedReportDefinitions.deletedAt),
      ),
    )
    .returning();
  if (!row) throw notFound("Report definition not found");
  return toReportBuilderDefinition(row as PersistedReportDefinition);
}

export async function deleteReportDefinition(
  db: Database,
  params: {
    orgId: string;
    definitionId: string;
    allowedEntities?: readonly ReportBuilderEntity[];
  },
): Promise<void> {
  const allowedEntities = params.allowedEntities ?? REPORT_BUILDER_ENTITIES;
  if (allowedEntities.length === 0) throw notFound("Report definition not found");
  const [row] = await db
    .update(savedReportDefinitions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(savedReportDefinitions.id, params.definitionId),
        eq(savedReportDefinitions.orgId, params.orgId),
        inArray(savedReportDefinitions.entity, [...allowedEntities]),
        isNull(savedReportDefinitions.deletedAt),
      ),
    )
    .returning({ id: savedReportDefinitions.id });
  if (!row) throw notFound("Report definition not found");
}

export async function previewReportDefinition(
  db: Database,
  params: { orgId: string; entityId?: string; data: ParsedReportBuilderPreviewInput },
): Promise<ReportBuilderPreview> {
  await assertSelectedCustomFieldsBelongToEntity(db, {
    orgId: params.orgId,
    entity: params.data.entity,
    customFieldIds: params.data.customFieldIds,
  });
  const entityId = params.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  return buildPreview(db, params.orgId, entityId, params.data, params.data.limit);
}

export async function runReportDefinition(
  db: Database,
  env: Pick<Bindings, "R2" | "APP_URL" | "INTEGRATION_MODE">,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    definitionId: string;
    data: ReportBuilderRunInput;
    allowedEntities?: readonly ReportBuilderEntity[];
    onFirstReady?: (artifact: GeneratedReportArtifact) => void | Promise<void>;
  },
): Promise<GeneratedReportArtifact> {
  const requestedTitle = params.data.title?.trim() || null;
  const requestEntityId = params.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  const existing = await db.query.generatedReports.findFirst({
    where: and(
      eq(generatedReports.orgId, params.orgId),
      eq(generatedReports.entityId, requestEntityId),
      eq(generatedReports.type, "custom_report"),
      eq(generatedReports.attemptId, params.data.attemptId),
    ),
  });
  if (existing) {
    const identity = assertCustomReportAttemptMatches(existing, {
      definitionId: params.definitionId,
      requestedTitle,
    });
    if (params.allowedEntities && !params.allowedEntities.includes(identity.entity)) {
      throw notFound("Report definition not found");
    }
    if (existing.status === "ready") {
      await deliverReportReadyEffects(db, env, existing.id);
      return generatedReportArtifact(existing);
    }
    const completion = await finishPendingCustomReport(db, env, existing, identity.definitionId);
    if (completion.transitioned) await params.onFirstReady?.(completion.artifact);
    return completion.artifact;
  }

  const definition = await db.query.savedReportDefinitions.findFirst({
    where: and(
      eq(savedReportDefinitions.id, params.definitionId),
      eq(savedReportDefinitions.orgId, params.orgId),
      isNull(savedReportDefinitions.deletedAt),
    ),
  });
  if (!definition) throw notFound("Report definition not found");
  const entity = reportBuilderEntitySchema.parse(definition.entity);
  if (params.allowedEntities && !params.allowedEntities.includes(entity)) {
    throw notFound("Report definition not found");
  }
  const title = requestedTitle || definition.name;

  const preview = await buildPreview(
    db,
    params.orgId,
    requestEntityId,
    {
      entity,
      columns: definition.columns,
      customFieldIds: definition.customFieldIds,
      filters: persistedFiltersSchema.parse(definition.filters),
      sort: persistedSortSchema.parse(definition.sort),
      limit: 10_000,
    },
    10_000,
  );
  const csv = buildReportBuilderCsv(preview);
  const reportId = crypto.randomUUID();
  const fileName = `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "report"
  }.csv`;
  const fileKey = `${params.orgId}/custom_report/${reportId}/${fileName}`;
  const pendingValues = {
    id: reportId,
    orgId: params.orgId,
    entityId: requestEntityId,
    generatedBy: params.userId,
    type: "custom_report",
    attemptId: params.data.attemptId,
    format: "csv_bundle",
    status: "pending",
    readyEffectsStatus: "pending",
    title,
    fileName,
    fileKey,
    fileSizeBytes: null,
    metadata: {
      preview: { kind: "csv", title, content: csv },
      reportBuilder: {
        definitionId: definition.id,
        requestedTitle,
        entity: definition.entity,
        columns: definition.columns,
        customFieldIds: definition.customFieldIds,
        totalRows: preview.totalRows,
      },
    },
  };
  let inserted: typeof generatedReports.$inferSelect | undefined;
  try {
    [inserted] = await db.insert(generatedReports).values(pendingValues).returning();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await db.query.generatedReports.findFirst({
      where: and(
        eq(generatedReports.orgId, params.orgId),
        eq(generatedReports.entityId, requestEntityId),
        eq(generatedReports.type, "custom_report"),
        eq(generatedReports.attemptId, params.data.attemptId),
      ),
    });
    if (!winner) throw error;
    const winnerIdentity = assertCustomReportAttemptMatches(winner, {
      definitionId: definition.id,
      requestedTitle,
    });
    if (params.allowedEntities && !params.allowedEntities.includes(winnerIdentity.entity)) {
      throw notFound("Report definition not found");
    }
    if (winner.status === "ready") {
      await deliverReportReadyEffects(db, env, winner.id);
      return generatedReportArtifact(winner);
    }
    const completion = await finishPendingCustomReport(
      db,
      env,
      winner,
      winnerIdentity.definitionId,
    );
    if (completion.transitioned) await params.onFirstReady?.(completion.artifact);
    return completion.artifact;
  }

  if (!inserted) throw notFound("Generated report not found");
  const completion = await finishPendingCustomReport(
    db,
    env,
    {
      ...inserted,
      ...pendingValues,
      id: inserted.id,
      createdAt: inserted.createdAt,
      status: "pending",
    } as typeof generatedReports.$inferSelect,
    definition.id,
  );
  if (completion.transitioned) await params.onFirstReady?.(completion.artifact);
  return completion.artifact;
}

function assertCustomReportAttemptMatches(
  report: typeof generatedReports.$inferSelect,
  expected: { definitionId: string; requestedTitle: string | null },
): { definitionId: string; entity: ReportBuilderEntity } {
  const metadata =
    typeof report.metadata === "object" && report.metadata !== null
      ? (report.metadata as {
          reportBuilder?: {
            definitionId?: unknown;
            requestedTitle?: unknown;
            entity?: unknown;
          };
        })
      : undefined;
  if (
    metadata?.reportBuilder?.definitionId !== expected.definitionId ||
    metadata.reportBuilder.requestedTitle !== expected.requestedTitle
  ) {
    throw badRequest("Export attempt does not match this request");
  }
  const entity = reportBuilderEntitySchema.safeParse(metadata.reportBuilder.entity);
  if (!entity.success) throw badRequest("Export attempt does not match this request");
  return { definitionId: expected.definitionId, entity: entity.data };
}

function isUniqueViolation(error: unknown): error is Error & { code: "23505" } {
  return error instanceof Error && "code" in error && error.code === "23505";
}

async function finishPendingCustomReport(
  db: Database,
  env: Pick<Bindings, "R2" | "APP_URL" | "INTEGRATION_MODE">,
  report: typeof generatedReports.$inferSelect,
  definitionId: string,
  options: { recoveredFromPending?: boolean } = {},
): Promise<{ artifact: GeneratedReportArtifact; transitioned: boolean }> {
  const preview =
    typeof report.metadata === "object" && report.metadata !== null
      ? (report.metadata as { preview?: { content?: unknown } }).preview
      : undefined;
  if (typeof preview?.content !== "string") {
    throw badRequest("Pending report cannot be resumed");
  }
  await getIntegrations(db, env as Bindings).storage.put({
    key: report.fileKey,
    body: preview.content,
    contentType: "text/csv; charset=utf-8",
    fileName: report.fileName,
    source: {
      orgId: report.orgId,
      entityType: "saved_report_definition",
      entityId: definitionId,
    },
  });
  const fileSizeBytes = new TextEncoder().encode(preview.content).byteLength;
  const nextMetadata = options.recoveredFromPending
    ? { ...readMetadataRecord(report.metadata), recoveredFromPending: true }
    : report.metadata;
  const [updated] = await db
    .update(generatedReports)
    .set({
      status: "ready",
      fileSizeBytes,
      readyEffectsStatus: "pending",
      metadata: nextMetadata,
    })
    .where(
      and(
        eq(generatedReports.id, report.id),
        eq(generatedReports.orgId, report.orgId),
        eq(generatedReports.status, "pending"),
      ),
    )
    .returning();
  if (updated) await deliverReportReadyEffects(db, env, report.id);
  return {
    artifact: generatedReportArtifact({
      ...report,
      ...updated,
      status: "ready",
      fileSizeBytes,
    }),
    transitioned: Boolean(updated),
  };
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function recoverPendingCustomReports(
  db: Database,
  env: Pick<Bindings, "R2" | "APP_URL" | "INTEGRATION_MODE">,
  now = new Date(),
): Promise<number> {
  const reports = await db.query.generatedReports.findMany({
    where: and(
      eq(generatedReports.type, "custom_report"),
      eq(generatedReports.status, "pending"),
      isNotNull(generatedReports.attemptId),
      lt(generatedReports.createdAt, new Date(now.getTime() - 5 * 60_000)),
      or(
        isNull(generatedReports.recoveryAttemptedAt),
        lt(generatedReports.recoveryAttemptedAt, new Date(now.getTime() - 60 * 60_000)),
      ),
    ),
    orderBy: [
      sql`${generatedReports.recoveryAttemptedAt} asc nulls first`,
      asc(generatedReports.createdAt),
      asc(generatedReports.id),
    ],
    limit: 25,
  });
  let recovered = 0;
  for (const report of reports) {
    if (!report.attemptId) continue;
    const reportBuilder =
      typeof report.metadata === "object" && report.metadata !== null
        ? (report.metadata as { reportBuilder?: { definitionId?: unknown } }).reportBuilder
        : undefined;
    try {
      if (typeof reportBuilder?.definitionId !== "string") {
        throw badRequest("Pending report cannot be resumed");
      }
      const result = await finishPendingCustomReport(db, env, report, reportBuilder.definitionId, {
        recoveredFromPending: true,
      });
      if (!result.transitioned) continue;
      recovered += 1;
    } catch (error) {
      captureBackgroundException(error, "report_export_recovery", {
        report_type: "custom_report",
        operation: "resume_pending",
      });
      try {
        await db
          .update(generatedReports)
          .set({ recoveryAttemptedAt: now })
          .where(
            and(
              eq(generatedReports.id, report.id),
              eq(generatedReports.status, "pending"),
              isNotNull(generatedReports.attemptId),
            ),
          );
      } catch (stampError) {
        captureBackgroundException(stampError, "report_export_recovery", {
          report_type: "custom_report",
          operation: "backoff_stamp",
        });
      }
    }
  }
  return recovered;
}

async function buildPreview(
  db: Database,
  orgId: string,
  entityId: string,
  input: Omit<ParsedReportBuilderPreviewInput, "limit"> & { limit?: number },
  limit: number,
): Promise<ReportBuilderPreview> {
  const baseRows = await getEntityRows(db, orgId, entityId, input.entity);
  const filteredRows = applySort(applyFilters(baseRows, input.filters ?? []), input.sort ?? []);
  const selectedRows = filteredRows.slice(0, limit);
  const customFieldMap = await getSelectedCustomFieldValues(db, {
    orgId,
    entity: input.entity,
    ids: input.customFieldIds,
    rows: selectedRows,
  });
  const customMetadata = await getSelectedCustomFieldMetadata(db, {
    orgId,
    entity: input.entity,
    ids: input.customFieldIds,
  });
  const columns = [
    ...input.columns.map((column) => ({ id: column, label: getReportBuilderColumnLabel(column) })),
    ...customMetadata.map((field) => ({
      id: `custom:${field.id}`,
      label: getReportBuilderColumnLabel(`custom:${field.id}`, field.name),
    })),
  ];
  return {
    columns,
    rows: selectedRows.map((row) => {
      const output: PreviewRow = {};
      for (const column of input.columns) output[column] = row[column] ?? null;
      for (const field of customMetadata) {
        output[`custom:${field.id}`] = customFieldMap.get(row.id)?.get(field.id) ?? null;
      }
      return output;
    }),
    totalRows: filteredRows.length,
  };
}

async function getEntityRows(
  db: Database,
  orgId: string,
  entityId: string,
  entity: ReportBuilderEntity,
): Promise<Array<PreviewRow & { id: string }>> {
  if (entity === "donors") {
    const rows = await db.query.contacts.findMany({
      where: and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
      orderBy: [asc(contacts.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      displayName: getDonorName(row),
      type: row.type,
      email: row.email,
      phone: row.phone,
      pipelineStage: row.pipelineStage,
      emailOptOut: row.emailOptOut,
      createdAt: formatDate(row.createdAt),
    }));
  }
  if (entity === "grants") {
    const rows = await db.query.grants.findMany({
      where: and(eq(grants.orgId, orgId), eq(grants.entityId, entityId), isNull(grants.deletedAt)),
      with: { funder: true },
      orderBy: [asc(grants.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      funderName: row.funder?.name ?? null,
      amountCents: row.amountCents,
      startDate: formatDate(row.startDate),
      endDate: formatDate(row.endDate),
      applicationDeadline: formatDate(row.applicationDeadline),
    }));
  }
  if (entity === "funds") {
    const rows = await db.query.funds.findMany({
      where: and(eq(funds.orgId, orgId), eq(funds.entityId, entityId), isNull(funds.deletedAt)),
      with: {
        grantAllocations: {
          where: and(
            eq(grantFundAllocations.entityId, entityId),
            isNull(grantFundAllocations.deletedAt),
          ),
        },
        expenses: {
          where: and(eq(expenses.entityId, entityId), isNull(expenses.deletedAt)),
        },
      },
      orderBy: [asc(funds.createdAt)],
    });
    return rows.map((row) => {
      const allocated = (row.grantAllocations ?? []).reduce(
        (sum, allocation) => sum + (allocation.deletedAt ? 0 : allocation.allocatedAmountCents),
        0,
      );
      const spent = (row.expenses ?? []).reduce(
        (sum, expense) => sum + (expense.deletedAt ? 0 : expense.amountCents),
        0,
      );
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        restriction: row.type,
        balanceCents: allocated - spent,
        createdAt: formatDate(row.createdAt),
      };
    });
  }

  const donationEntityScope = and(
    or(
      isNull(donations.fundId),
      sql`EXISTS (
        SELECT 1 FROM ${funds}
        WHERE ${funds.id} = ${donations.fundId}
          AND ${funds.orgId} = ${orgId}
          AND ${funds.entityId} = ${entityId}
      )`,
    ),
    or(
      isNull(donations.grantId),
      sql`EXISTS (
        SELECT 1 FROM ${grants}
        WHERE ${grants.id} = ${donations.grantId}
          AND ${grants.orgId} = ${orgId}
          AND ${grants.entityId} = ${entityId}
      )`,
    ),
    or(
      isNotNull(donations.fundId),
      isNotNull(donations.grantId),
      sql`EXISTS (
        SELECT 1 FROM ${organizations}
        WHERE ${organizations.id} = ${orgId}
          AND ${organizations.defaultEntityId} = ${entityId}
      )`,
    ),
  );
  const rows = await db.query.donations.findMany({
    where: and(eq(donations.orgId, orgId), donationEntityScope, isNull(donations.deletedAt)),
    with: { contact: true },
    orderBy: [asc(donations.date)],
  });
  const fundRows = await db
    .select({ id: funds.id, name: funds.name })
    .from(funds)
    .where(and(eq(funds.orgId, orgId), eq(funds.entityId, entityId), isNull(funds.deletedAt)));
  const grantRows = await db
    .select({ id: grants.id, name: grants.name })
    .from(grants)
    .where(and(eq(grants.orgId, orgId), eq(grants.entityId, entityId), isNull(grants.deletedAt)));
  const fundNames = new Map(fundRows.map((row) => [row.id, row.name]));
  const grantNames = new Map(grantRows.map((row) => [row.id, row.name]));
  const defaultEntityId = await resolveDefaultEntityId(db, orgId);
  return rows
    .filter((row) => {
      const hasEntityLink = Boolean(row.fundId || row.grantId);
      return (
        (!row.fundId || fundNames.has(row.fundId)) &&
        (!row.grantId || grantNames.has(row.grantId)) &&
        (hasEntityLink || entityId === defaultEntityId)
      );
    })
    .map((row) => ({
      id: row.id,
      donorName: row.contact ? getDonorName(row.contact) : "Donor",
      amountCents: row.amountCents,
      date: formatDate(row.date),
      type: row.type,
      restriction: row.restriction,
      netAssetClass: row.netAssetClass,
      fundName: row.fundId ? fundNames.get(row.fundId)! : null,
      grantName: row.grantId ? grantNames.get(row.grantId)! : null,
      receiptSent: row.receiptSent,
    }));
}

function applyFilters(
  rows: Array<PreviewRow & { id: string }>,
  filters: ParsedReportBuilderPreviewInput["filters"],
) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.field];
      const text = value == null ? "" : String(value).toLowerCase();
      const needle = filter.value?.toLowerCase() ?? "";
      if (filter.operator === "equals") return text === needle;
      if (filter.operator === "contains") return text.includes(needle);
      if (filter.operator === "is_empty") return value == null || text.trim() === "";
      if (filter.operator === "is_not_empty") return value != null && text.trim() !== "";
      if (filter.operator === "gte") return Number(value) >= Number(filter.value);
      return Number(value) <= Number(filter.value);
    }),
  );
}

function applySort(
  rows: Array<PreviewRow & { id: string }>,
  sort: ParsedReportBuilderPreviewInput["sort"],
) {
  return [...rows].sort((left, right) => {
    for (const sortRule of sort) {
      const leftValue = left[sortRule.field];
      const rightValue = right[sortRule.field];
      const comparison = String(leftValue ?? "").localeCompare(
        String(rightValue ?? ""),
        undefined,
        {
          numeric: true,
        },
      );
      if (comparison !== 0) return sortRule.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
}

async function assertSelectedCustomFieldsBelongToEntity(
  db: Database,
  params: { orgId: string; entity: ReportBuilderEntity; customFieldIds: string[] },
) {
  if (params.customFieldIds.length === 0) return;
  const fields = await getSelectedCustomFieldMetadata(db, {
    orgId: params.orgId,
    entity: params.entity,
    ids: params.customFieldIds,
  });
  if (fields.length !== params.customFieldIds.length) {
    throw badRequest("One or more custom fields are not available for this report.");
  }
}

async function getSelectedCustomFieldMetadata(
  db: Database,
  params: { orgId: string; entity: ReportBuilderEntity; ids: string[] },
) {
  const ids = params.ids;
  if (ids.length === 0) return [];
  return db
    .select({
      id: customFieldDefinitions.id,
      name: customFieldDefinitions.name,
    })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.orgId, params.orgId),
        eq(customFieldDefinitions.entityType, CUSTOM_FIELD_ENTITY_TYPES[params.entity]),
        inArray(customFieldDefinitions.id, ids),
        isNull(customFieldDefinitions.deletedAt),
      ),
    );
}

async function getSelectedCustomFieldValues(
  db: Database,
  params: {
    orgId: string;
    entity: ReportBuilderEntity;
    ids: string[];
    rows: Array<PreviewRow & { id: string }>;
  },
) {
  const result = new Map<string, Map<string, string | null>>();
  if (params.ids.length === 0 || params.rows.length === 0) return result;
  const values = await db
    .select({
      entityId: customFieldValues.entityId,
      fieldId: customFieldValues.fieldId,
      value: customFieldValues.value,
    })
    .from(customFieldValues)
    .innerJoin(customFieldDefinitions, eq(customFieldValues.fieldId, customFieldDefinitions.id))
    .where(
      and(
        eq(customFieldDefinitions.orgId, params.orgId),
        eq(customFieldDefinitions.entityType, CUSTOM_FIELD_ENTITY_TYPES[params.entity]),
        inArray(customFieldValues.fieldId, params.ids),
        inArray(
          customFieldValues.entityId,
          params.rows.map((row) => row.id),
        ),
        isNull(customFieldDefinitions.deletedAt),
      ),
    );
  for (const value of values) {
    const entityValues = result.get(value.entityId) ?? new Map<string, string | null>();
    entityValues.set(value.fieldId, value.value);
    result.set(value.entityId, entityValues);
  }
  return result;
}
