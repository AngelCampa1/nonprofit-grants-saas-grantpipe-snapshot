import { and, eq, isNull, sql } from "drizzle-orm";
import { grantCloseoutItems, grantReportingRequirements, grants } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type {
  CreateCloseoutItemInput,
  CreateReportingRequirementInput,
  UpdateCloseoutItemInput,
  UpdateReportingRequirementInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";

function parseDateValue(value: string | Date | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function parseRequiredDateValue(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

type EntityScopedParams = { entityId?: string };

function grantEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(grants.entityId, entityId) : undefined;
}

function requirementEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(grantReportingRequirements.entityId, entityId) : undefined;
}

function closeoutEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(grantCloseoutItems.entityId, entityId) : undefined;
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string, entityId?: string) {
  if (!db.query?.grants?.findFirst) return undefined;
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      grantEntityScopeCondition(entityId),
      isNull(grants.deletedAt),
    ),
  });

  if (!grant) throw notFound("Grant not found");
  return grant;
}

export async function createReportingRequirement(
  db: Database,
  params: { orgId: string; actorId?: string; grantId: string } & EntityScopedParams &
    CreateReportingRequirementInput,
) {
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId = params.entityId ?? grant?.entityId ?? "entity-1";
  return db.transaction(async (tx) => {
    const [requirement] = await tx
      .insert(grantReportingRequirements)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        grantId: params.grantId,
        reportType: params.reportType,
        status: params.status ?? "upcoming",
        dueDate: parseRequiredDateValue(params.dueDate),
        ...(params.submittedAt === undefined
          ? {}
          : {
              submittedAt:
                params.submittedAt === null
                  ? sql`null`
                  : parseRequiredDateValue(params.submittedAt),
            }),
        ...(params.notes !== undefined ? { notes: params.notes } : {}),
      })
      .returning();
    if (!requirement) throw internalError("Failed to create reporting requirement");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "reporting_requirement",
        entityId: requirement.id,
        changes: { grantId: params.grantId, reportType: requirement.reportType },
      });
    }
    return requirement;
  });
}

export async function updateReportingRequirement(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    requirementId: string;
    data: UpdateReportingRequirementInput;
  } & EntityScopedParams,
) {
  const payload: Partial<typeof grantReportingRequirements.$inferInsert> = {};
  if (params.data.reportType !== undefined) payload.reportType = params.data.reportType;
  if (params.data.dueDate !== undefined)
    payload.dueDate = parseRequiredDateValue(params.data.dueDate);
  if (params.data.status !== undefined) payload.status = params.data.status;
  if (params.data.notes !== undefined) payload.notes = params.data.notes;
  const submittedAt =
    params.data.submittedAt === undefined
      ? undefined
      : params.data.submittedAt === null
        ? sql`null`
        : parseRequiredDateValue(params.data.submittedAt);

  return db.transaction(async (tx) => {
    const [requirement] = await tx
      .update(grantReportingRequirements)
      .set({
        ...payload,
        ...(submittedAt === undefined ? {} : { submittedAt }),
      })
      .where(
        and(
          eq(grantReportingRequirements.id, params.requirementId),
          eq(grantReportingRequirements.grantId, params.grantId),
          eq(grantReportingRequirements.orgId, params.orgId),
          requirementEntityScopeCondition(params.entityId),
          isNull(grantReportingRequirements.deletedAt),
        ),
      )
      .returning();
    if (!requirement) throw notFound("Reporting requirement not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "reporting_requirement",
        entityId: requirement.id,
        changes: params.data,
      });
    }
    return requirement;
  });
}

export async function deleteReportingRequirement(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    requirementId: string;
  } & EntityScopedParams,
) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(grantReportingRequirements)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantReportingRequirements.id, params.requirementId),
          eq(grantReportingRequirements.grantId, params.grantId),
          eq(grantReportingRequirements.orgId, params.orgId),
          requirementEntityScopeCondition(params.entityId),
          isNull(grantReportingRequirements.deletedAt),
        ),
      )
      .returning();
    if (!deleted) throw notFound("Reporting requirement not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "reporting_requirement",
        entityId: params.requirementId,
        changes: null,
      });
    }
  });
}

export async function createCloseoutItem(
  db: Database,
  params: { orgId: string; actorId?: string; grantId: string } & EntityScopedParams &
    CreateCloseoutItemInput,
) {
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId = params.entityId ?? grant?.entityId ?? "entity-1";
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(grantCloseoutItems)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        grantId: params.grantId,
        label: params.label,
        dueDate: parseDateValue(params.dueDate),
      })
      .returning();
    if (!item) throw internalError("Failed to create closeout item");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "closeout_item",
        entityId: item.id,
        changes: { grantId: params.grantId, label: item.label },
      });
    }
    return item;
  });
}

export async function updateCloseoutItem(
  db: Database,
  params: {
    orgId: string;
    grantId: string;
    itemId: string;
    userId: string;
    actorId?: string;
    data: UpdateCloseoutItemInput;
  } & EntityScopedParams,
) {
  const isCompleting = params.data.completed === true;
  const isReopening = params.data.completed === false;
  const payload: Partial<typeof grantCloseoutItems.$inferInsert> = {};
  if (params.data.label !== undefined) payload.label = params.data.label;
  if (params.data.dueDate !== undefined) payload.dueDate = parseDateValue(params.data.dueDate);
  if (params.data.completed !== undefined) payload.completed = params.data.completed;

  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(grantCloseoutItems)
      .set({
        ...payload,
        ...(isCompleting ? { completedAt: new Date(), completedBy: params.userId } : {}),
        ...(isReopening ? { completedAt: null, completedBy: null } : {}),
      })
      .where(
        and(
          eq(grantCloseoutItems.id, params.itemId),
          eq(grantCloseoutItems.grantId, params.grantId),
          eq(grantCloseoutItems.orgId, params.orgId),
          closeoutEntityScopeCondition(params.entityId),
          isNull(grantCloseoutItems.deletedAt),
        ),
      )
      .returning();
    if (!item) throw notFound("Closeout item not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "closeout_item",
        entityId: item.id,
        changes: params.data,
      });
    }
    return item;
  });
}

export async function deleteCloseoutItem(
  db: Database,
  params: { orgId: string; actorId?: string; grantId: string; itemId: string } & EntityScopedParams,
) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(grantCloseoutItems)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantCloseoutItems.id, params.itemId),
          eq(grantCloseoutItems.grantId, params.grantId),
          eq(grantCloseoutItems.orgId, params.orgId),
          closeoutEntityScopeCondition(params.entityId),
          isNull(grantCloseoutItems.deletedAt),
        ),
      )
      .returning();
    if (!deleted) throw notFound("Closeout item not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "closeout_item",
        entityId: params.itemId,
        changes: null,
      });
    }
  });
}
