import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  grantBudgetLines,
  grantBudgetAmendments,
  grantBudgetPeriods,
  grantBudgetVersions,
  documents,
  grants,
  funds,
  programs,
  type Database,
} from "@grantpipe/db";
import type {
  CreateGrantBudgetAmendmentInput,
  CreateGrantBudgetLineInput,
  CreateGrantBudgetPeriodInput,
  CreateGrantBudgetVersionInput,
} from "@grantpipe/shared";
import { createGrantBudgetLineSchema, createGrantBudgetPeriodSchema } from "@grantpipe/shared";
import { conflict, internalError, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";

type EntityScopedParams = { entityId?: string };

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isUniqueViolation(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  return code === "23505";
}

function entityScopeCondition(table: { entityId: Column }, entityId?: string) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string, entityId?: string) {
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      entityScopeCondition(grants, entityId),
      isNull(grants.deletedAt),
    ),
    columns: { id: true, name: true, entityId: true },
  });
  if (!grant) throw notFound("Grant not found");
  return grant;
}

async function getBudgetVersionInOrg(
  db: Database,
  params: { orgId: string; grantId: string; versionId: string } & EntityScopedParams,
) {
  const version = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.id, params.versionId),
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
  });
  if (!version) throw notFound("Budget version not found");
  return version;
}

function budgetVersionRelations() {
  return {
    periods: {
      where: isNull(grantBudgetPeriods.deletedAt),
      orderBy: [asc(grantBudgetPeriods.sortOrder), asc(grantBudgetPeriods.startDate)],
    },
    lines: {
      where: isNull(grantBudgetLines.deletedAt),
      orderBy: [asc(grantBudgetLines.sortOrder), asc(grantBudgetLines.category)],
    },
  };
}

function assertDraftVersion(version: { status: string }) {
  if (version.status !== "draft") {
    throw conflict("Approved budget versions are locked. Create an amendment to change lines.");
  }
}

async function assertBudgetPeriodInVersion(
  db: Database,
  params: { orgId: string; budgetVersionId: string; budgetPeriodId: string } & EntityScopedParams,
) {
  const period = await db.query.grantBudgetPeriods.findFirst({
    where: and(
      eq(grantBudgetPeriods.id, params.budgetPeriodId),
      eq(grantBudgetPeriods.orgId, params.orgId),
      eq(grantBudgetPeriods.budgetVersionId, params.budgetVersionId),
      entityScopeCondition(grantBudgetPeriods, params.entityId),
      isNull(grantBudgetPeriods.deletedAt),
    ),
    columns: { id: true },
  });
  if (!period) throw notFound("Budget period not found");
}

async function assertFundInOrg(
  db: Database,
  params: { orgId: string; fundId: string } & EntityScopedParams,
) {
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(funds.id, params.fundId),
      eq(funds.orgId, params.orgId),
      entityScopeCondition(funds, params.entityId),
      isNull(funds.deletedAt),
    ),
    columns: { id: true },
  });
  if (!fund) throw notFound("Fund not found");
}

async function assertProgramInOrg(db: Database, params: { orgId: string; programId: string }) {
  const program = await db.query.programs.findFirst({
    where: and(
      eq(programs.id, params.programId),
      eq(programs.orgId, params.orgId),
      isNull(programs.deletedAt),
    ),
    columns: { id: true },
  });
  if (!program) throw notFound("Program not found");
}

async function assertDocumentInOrg(db: Database, params: { orgId: string; documentId: string }) {
  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, params.documentId),
      eq(documents.orgId, params.orgId),
      isNull(documents.deletedAt),
    ),
    columns: { id: true },
  });
  if (!document) throw notFound("Document not found");
}

export async function createBudgetVersion(
  db: Database,
  params: { orgId: string; grantId: string; actorId?: string } & EntityScopedParams &
    CreateGrantBudgetVersionInput,
) {
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId = params.entityId ?? grant.entityId;
  const latest = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, activeEntityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
    orderBy: [desc(grantBudgetVersions.versionNumber)],
    columns: { versionNumber: true },
  });

  return db.transaction(async (tx) => {
    let version: typeof grantBudgetVersions.$inferSelect | undefined;
    try {
      [version] = await tx
        .insert(grantBudgetVersions)
        .values({
          orgId: params.orgId,
          entityId: activeEntityId,
          grantId: params.grantId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: "draft",
          source: params.source ?? "manual",
          sourceDocumentId: null,
          notes: params.notes ?? null,
          createdByUserId: params.actorId ?? null,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict("Budget version number already exists. Retry budget version creation.");
      }
      throw error;
    }
    if (!version) throw internalError("Failed to create budget version");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "grant_budget_version",
        entityId: version.id,
        activeEntityId,
        entityLabel: grant.name,
        changes: { after: version },
      });
    }
    return version;
  });
}

export async function listBudgetVersions(
  db: Database,
  params: { orgId: string; grantId: string } & EntityScopedParams,
) {
  await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  return db.query.grantBudgetVersions.findMany({
    where: and(
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
    with: budgetVersionRelations(),
    orderBy: [desc(grantBudgetVersions.versionNumber)],
  });
}

export async function getBudgetVersion(
  db: Database,
  params: { orgId: string; grantId: string; versionId: string } & EntityScopedParams,
) {
  const version = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.id, params.versionId),
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
    with: budgetVersionRelations(),
  });
  if (!version) throw notFound("Budget version not found");
  return version;
}

export async function getCurrentBudgetVersion(
  db: Database,
  params: { orgId: string; grantId: string } & EntityScopedParams,
) {
  await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  return db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      eq(grantBudgetVersions.status, "approved"),
      isNull(grantBudgetVersions.deletedAt),
    ),
    with: budgetVersionRelations(),
    orderBy: [desc(grantBudgetVersions.approvedAt), desc(grantBudgetVersions.versionNumber)],
  });
}

export async function listBudgetAmendments(
  db: Database,
  params: { orgId: string; grantId: string } & EntityScopedParams,
) {
  await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  return db.query.grantBudgetAmendments.findMany({
    where: and(
      eq(grantBudgetAmendments.orgId, params.orgId),
      eq(grantBudgetAmendments.grantId, params.grantId),
      entityScopeCondition(grantBudgetAmendments, params.entityId),
      isNull(grantBudgetAmendments.deletedAt),
    ),
    with: {
      previousBudgetVersion: true,
      newBudgetVersion: true,
    },
    orderBy: [desc(grantBudgetAmendments.effectiveDate), desc(grantBudgetAmendments.createdAt)],
  });
}

type CopyablePeriod = typeof grantBudgetPeriods.$inferSelect;
type CopyableLine = typeof grantBudgetLines.$inferSelect;

export async function createBudgetAmendment(
  db: Database,
  params: {
    orgId: string;
    grantId: string;
    actorId?: string;
  } & EntityScopedParams &
    CreateGrantBudgetAmendmentInput,
) {
  const data = {
    ...params,
    reason: params.reason.trim(),
  };
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId = params.entityId ?? grant.entityId;
  const previous = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.id, data.previousBudgetVersionId),
      eq(grantBudgetVersions.orgId, data.orgId),
      eq(grantBudgetVersions.grantId, data.grantId),
      entityScopeCondition(grantBudgetVersions, activeEntityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
    with: budgetVersionRelations(),
  });
  if (!previous) throw notFound("Budget version not found");
  if (previous.status !== "approved") {
    throw conflict("Budget amendments must start from an approved budget version.");
  }
  if (data.supportingDocumentId) {
    await assertDocumentInOrg(db, {
      orgId: data.orgId,
      documentId: data.supportingDocumentId,
    });
  }

  const latest = await db.query.grantBudgetVersions.findFirst({
    where: and(
      eq(grantBudgetVersions.orgId, data.orgId),
      eq(grantBudgetVersions.grantId, data.grantId),
      entityScopeCondition(grantBudgetVersions, activeEntityId),
      isNull(grantBudgetVersions.deletedAt),
    ),
    orderBy: [desc(grantBudgetVersions.versionNumber)],
    columns: { versionNumber: true },
  });

  const result = await db.transaction(async (tx) => {
    const [budgetVersion] = await tx
      .insert(grantBudgetVersions)
      .values({
        orgId: data.orgId,
        entityId: activeEntityId,
        grantId: data.grantId,
        versionNumber: (latest?.versionNumber ?? previous.versionNumber) + 1,
        status: "draft",
        source: "amendment",
        sourceDocumentId: data.supportingDocumentId ?? null,
        notes: data.reason,
        createdByUserId: data.actorId ?? null,
      })
      .returning();
    if (!budgetVersion) throw internalError("Failed to create amendment budget version");

    const previousPeriods = (previous.periods ?? []) as CopyablePeriod[];
    const periods =
      previousPeriods.length === 0
        ? []
        : await tx
            .insert(grantBudgetPeriods)
            .values(
              previousPeriods.map((period) => ({
                orgId: data.orgId,
                entityId: activeEntityId,
                budgetVersionId: budgetVersion.id,
                label: period.label,
                startDate: period.startDate,
                endDate: period.endDate,
                dueDate: period.dueDate,
                sortOrder: period.sortOrder,
              })),
            )
            .returning();

    const periodIdMap = new Map(
      previousPeriods.map((period, index) => [period.id, periods[index]?.id ?? null]),
    );
    const previousLines = (previous.lines ?? []) as CopyableLine[];
    const lines =
      previousLines.length === 0
        ? []
        : await tx
            .insert(grantBudgetLines)
            .values(
              previousLines.map((line) => ({
                orgId: data.orgId,
                entityId: activeEntityId,
                budgetVersionId: budgetVersion.id,
                budgetPeriodId: line.budgetPeriodId
                  ? (periodIdMap.get(line.budgetPeriodId) ?? null)
                  : null,
                category: line.category,
                description: line.description,
                approvedAmountCents: line.approvedAmountCents,
                allowable: line.allowable,
                costType: line.costType,
                programId: line.programId,
                fundId: line.fundId,
                accountingDimensionCode: line.accountingDimensionCode,
                notes: line.notes,
                sortOrder: line.sortOrder,
              })),
            )
            .returning();

    const [amendment] = await tx
      .insert(grantBudgetAmendments)
      .values({
        orgId: data.orgId,
        entityId: activeEntityId,
        grantId: data.grantId,
        previousBudgetVersionId: previous.id,
        newBudgetVersionId: budgetVersion.id,
        reason: data.reason,
        effectiveDate: parseDate(data.effectiveDate),
        supportingDocumentId: data.supportingDocumentId ?? null,
        requestedByUserId: data.actorId ?? null,
      })
      .returning();
    if (!amendment) throw internalError("Failed to create budget amendment");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "grant_budget_amendment",
        entityId: amendment.id,
        activeEntityId,
        entityLabel: grant.name,
        changes: {
          after: amendment,
          newBudgetVersionId: budgetVersion.id,
        },
      });
    }

    return { amendment, budgetVersion, periods, lines };
  });

  return result;
}

export async function createBudgetPeriod(
  db: Database,
  params: { orgId: string; grantId: string; actorId?: string } & EntityScopedParams &
    CreateGrantBudgetPeriodInput,
) {
  const data = createGrantBudgetPeriodSchema.parse(params);
  const version = await getBudgetVersionInOrg(db, {
    orgId: params.orgId,
    grantId: params.grantId,
    versionId: data.budgetVersionId,
    entityId: params.entityId,
  });
  assertDraftVersion(version);

  const [period] = await db
    .insert(grantBudgetPeriods)
    .values({
      orgId: params.orgId,
      entityId: version.entityId,
      budgetVersionId: data.budgetVersionId,
      label: data.label,
      startDate: parseDate(data.startDate),
      endDate: parseDate(data.endDate),
      dueDate: data.dueDate ? parseDate(data.dueDate) : null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  if (!period) throw internalError("Failed to create budget period");
  return period;
}

export async function createBudgetLine(
  db: Database,
  params: { orgId: string; grantId: string; actorId?: string } & EntityScopedParams &
    CreateGrantBudgetLineInput,
) {
  const data = createGrantBudgetLineSchema.parse(params);
  const version = await getBudgetVersionInOrg(db, {
    orgId: params.orgId,
    grantId: params.grantId,
    versionId: data.budgetVersionId,
    entityId: params.entityId,
  });
  assertDraftVersion(version);
  if (data.budgetPeriodId) {
    await assertBudgetPeriodInVersion(db, {
      orgId: params.orgId,
      budgetVersionId: data.budgetVersionId,
      budgetPeriodId: data.budgetPeriodId,
      entityId: version.entityId,
    });
  }
  if (data.fundId) {
    await assertFundInOrg(db, {
      orgId: params.orgId,
      fundId: data.fundId,
      entityId: version.entityId,
    });
  }
  if (data.programId) {
    await assertProgramInOrg(db, { orgId: params.orgId, programId: data.programId });
  }
  if (params.programId) {
    await assertProgramInOrg(db, { orgId: params.orgId, programId: params.programId });
  }

  const [line] = await db
    .insert(grantBudgetLines)
    .values({
      orgId: params.orgId,
      entityId: version.entityId,
      budgetVersionId: data.budgetVersionId,
      budgetPeriodId: data.budgetPeriodId ?? null,
      category: data.category,
      description: data.description ?? null,
      approvedAmountCents: data.approvedAmountCents,
      allowable: data.allowable,
      costType: data.costType,
      programId: data.programId ?? null,
      fundId: data.fundId ?? null,
      accountingDimensionCode: data.accountingDimensionCode ?? null,
      notes: data.notes ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  if (!line) throw internalError("Failed to create budget line");
  return line;
}

export async function approveBudgetVersion(
  db: Database,
  params: {
    orgId: string;
    grantId: string;
    versionId: string;
    actorId: string;
    approvedAt?: string;
  } & EntityScopedParams,
) {
  const version = await getBudgetVersionInOrg(db, params);
  assertDraftVersion(version);
  const previousApproved = await db.query.grantBudgetVersions.findMany({
    where: and(
      eq(grantBudgetVersions.orgId, params.orgId),
      eq(grantBudgetVersions.grantId, params.grantId),
      entityScopeCondition(grantBudgetVersions, version.entityId),
      eq(grantBudgetVersions.status, "approved"),
      isNull(grantBudgetVersions.deletedAt),
    ),
  });

  try {
    return await db.transaction(async (tx) => {
      if (previousApproved.length > 0) {
        await tx
          .update(grantBudgetVersions)
          .set({
            status: "superseded",
            supersededAt: new Date(),
            supersededByVersionId: params.versionId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(grantBudgetVersions.orgId, params.orgId),
              eq(grantBudgetVersions.grantId, params.grantId),
              entityScopeCondition(grantBudgetVersions, version.entityId),
              eq(grantBudgetVersions.status, "approved"),
              isNull(grantBudgetVersions.deletedAt),
            ),
          )
          .returning();
      }

      const [approved] = await tx
        .update(grantBudgetVersions)
        .set({
          status: "approved",
          approvedAt: params.approvedAt ? parseDate(params.approvedAt) : new Date(),
          approvedByUserId: params.actorId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(grantBudgetVersions.id, params.versionId),
            entityScopeCondition(grantBudgetVersions, version.entityId),
          ),
        )
        .returning();
      if (!approved) throw internalError("Failed to approve budget version");

      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "approved",
        entityType: "grant_budget_version",
        entityId: approved.id,
        activeEntityId: version.entityId,
        changes: { before: { version, previousApproved }, after: approved },
      });
      return approved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("Another budget version is already approved for this grant. Retry approval.");
    }
    throw error;
  }
}
