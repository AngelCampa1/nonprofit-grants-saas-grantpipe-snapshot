import {
  and,
  count,
  desc,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  getTableColumns,
  or,
  sql,
} from "drizzle-orm";
import { activityLog, user, type Database } from "@grantpipe/db";
import type { ActivityEntityType, ActivityListParams } from "@grantpipe/shared";

export function activityEntityScope(orgId: string, activeEntityId: string) {
  const organizationAlias = sql.identifier("activity_scope_org");

  return or(
    eq(activityLog.activeEntityId, activeEntityId),
    and(
      isNull(activityLog.activeEntityId),
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("organizations")} ${organizationAlias}
        WHERE ${organizationAlias}.${sql.identifier("id")} = ${orgId}
          AND ${organizationAlias}.${sql.identifier("default_entity_id")} = ${activeEntityId}
          AND ${organizationAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
  );
}

export async function listActivity(
  db: Database,
  params: {
    orgId: string;
    activeEntityId: string;
    entityType: ActivityEntityType;
    entityId: string;
  } & ActivityListParams,
) {
  const offset = (params.page - 1) * params.pageSize;

  const whereClause = and(
    eq(activityLog.orgId, params.orgId),
    activityEntityScope(params.orgId, params.activeEntityId),
    eq(activityLog.entityType, params.entityType),
    eq(activityLog.entityId, params.entityId),
  );

  const rows = await db
    .select({ ...getTableColumns(activityLog), actorName: user.name })
    .from(activityLog)
    .leftJoin(user, eq(activityLog.actorId, user.id))
    .where(whereClause)
    .orderBy(params.sortOrder === "asc" ? asc(activityLog.createdAt) : desc(activityLog.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  const [totalRow] = await db.select({ count: count() }).from(activityLog).where(whereClause);

  return {
    data: rows,
    total: totalRow?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listOrgActivity(
  db: Database,
  params: {
    orgId: string;
    activeEntityId: string;
    entityType?: ActivityEntityType;
    allowedEntityTypes?: readonly ActivityEntityType[];
    actorId?: string;
    fromDate?: Date;
    toDate?: Date;
    page: number;
    pageSize: number;
    sortOrder?: "asc" | "desc";
  },
) {
  const offset = (params.page - 1) * params.pageSize;

  const conditions = [
    eq(activityLog.orgId, params.orgId),
    activityEntityScope(params.orgId, params.activeEntityId),
  ];

  if (params.entityType !== undefined) {
    conditions.push(eq(activityLog.entityType, params.entityType));
  } else if (params.allowedEntityTypes !== undefined) {
    conditions.push(inArray(activityLog.entityType, [...params.allowedEntityTypes]));
  }

  if (params.actorId !== undefined) {
    conditions.push(eq(activityLog.actorId, params.actorId));
  }

  if (params.fromDate !== undefined) {
    conditions.push(gte(activityLog.createdAt, params.fromDate));
  }

  if (params.toDate !== undefined) {
    conditions.push(lte(activityLog.createdAt, params.toDate));
  }

  const whereClause = and(...conditions);
  const orderClause =
    params.sortOrder === "asc" ? asc(activityLog.createdAt) : desc(activityLog.createdAt);

  const rows = await db
    .select({ ...getTableColumns(activityLog), actorName: user.name })
    .from(activityLog)
    .leftJoin(user, eq(activityLog.actorId, user.id))
    .where(whereClause)
    .orderBy(orderClause)
    .limit(params.pageSize)
    .offset(offset);

  const [totalRow] = await db.select({ count: count() }).from(activityLog).where(whereClause);

  return {
    data: rows,
    total: totalRow?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
