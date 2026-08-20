import { and, eq, isNull } from "drizzle-orm";
import { entityMembers, orgMembers } from "@grantpipe/db";
import {
  getDefaultPermissionsForEntityRole,
  type EntityKind,
  type EntityPermissionMap,
  type EntityPermissionOverrides,
  type EntityRole,
  type EntityStatus,
  type FiscalSponsorModel,
} from "@grantpipe/shared";
import type { AppEnv } from "../types";

type EntityRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  fiscalSponsorModel: string;
  parentEntityId: string | null;
  deletedAt?: Date | null;
};

type EntityMemberWithEntity = {
  entityId: string;
  role: string;
  permissions?: EntityPermissionOverrides | null;
  entity?: EntityRow | null;
};

type OrgMemberLookup = {
  id: string;
};

export type SessionEntityAccess = {
  id: string;
  name: string;
  kind: EntityKind;
  status: EntityStatus;
  fiscalSponsorModel: FiscalSponsorModel;
  parentEntityId: string | null;
  role: EntityRole;
  permissions: EntityPermissionMap;
  isDefault: boolean;
};

export type OrgMembershipEntityAccess = {
  entityId: string;
  entityName: string;
  kind: EntityKind;
  status: EntityStatus;
  fiscalSponsorModel: FiscalSponsorModel;
  parentEntityId: string | null;
  role: EntityRole;
  permissions: EntityPermissionMap;
};

function resolveEffectiveEntityPermissions(
  role: EntityRole,
  overrides?: EntityPermissionOverrides | null,
): EntityPermissionMap {
  if (role === "admin" || role === "auditor") {
    return getDefaultPermissionsForEntityRole(role);
  }

  return {
    ...getDefaultPermissionsForEntityRole(role),
    ...(overrides ?? {}),
  };
}

function serializeEntityAccess(
  row: EntityMemberWithEntity,
  defaultEntityId: string | null | undefined,
): SessionEntityAccess | null {
  const entity = row.entity;
  if (!entity || entity.status !== "active" || entity.deletedAt != null) {
    return null;
  }

  const role = row.role as EntityRole;
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind as EntityKind,
    status: entity.status as EntityStatus,
    fiscalSponsorModel: entity.fiscalSponsorModel as FiscalSponsorModel,
    parentEntityId: entity.parentEntityId,
    role,
    permissions: resolveEffectiveEntityPermissions(role, row.permissions),
    isDefault: entity.id === defaultEntityId,
  };
}

export async function listEntityAccessForOrgMember(
  db: AppEnv["Variables"]["db"],
  params: {
    orgId: string;
    orgMemberId: string;
    defaultEntityId?: string | null;
  },
): Promise<SessionEntityAccess[]> {
  const rows = (await db.query.entityMembers.findMany({
    where: and(
      eq(entityMembers.orgId, params.orgId),
      eq(entityMembers.orgMemberId, params.orgMemberId),
      isNull(entityMembers.deletedAt),
    ),
    with: {
      entity: true,
    },
  })) as EntityMemberWithEntity[];

  return rows
    .map((row) => serializeEntityAccess(row, params.defaultEntityId))
    .filter((entity): entity is SessionEntityAccess => entity != null);
}

export async function listEntityAccessForUser(
  db: AppEnv["Variables"]["db"],
  params: {
    orgId: string;
    userId: string;
    defaultEntityId?: string | null;
  },
): Promise<SessionEntityAccess[]> {
  const member = (await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.userId, params.userId),
      eq(orgMembers.orgId, params.orgId),
      isNull(orgMembers.deletedAt),
    ),
  })) as OrgMemberLookup | undefined;

  if (!member) {
    return [];
  }

  return listEntityAccessForOrgMember(db, {
    orgId: params.orgId,
    orgMemberId: member.id,
    defaultEntityId: params.defaultEntityId,
  });
}

export function toOrgMembershipEntityAccess(
  entityAccess: SessionEntityAccess[],
): OrgMembershipEntityAccess[] {
  return entityAccess.map((entity) => ({
    entityId: entity.id,
    entityName: entity.name,
    kind: entity.kind,
    status: entity.status,
    fiscalSponsorModel: entity.fiscalSponsorModel,
    parentEntityId: entity.parentEntityId,
    role: entity.role,
    permissions: entity.permissions,
  }));
}
