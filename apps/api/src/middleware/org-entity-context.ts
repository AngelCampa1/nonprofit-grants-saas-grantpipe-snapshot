import { createMiddleware } from "hono/factory";
import { and, desc, eq, isNull } from "drizzle-orm";
import { entities, entityMembers, orgMembers } from "@grantpipe/db";
import {
  getDefaultPermissionsForEntityRole,
  resolveEffectivePermissions,
  type EntityPermissionMap,
  type EntityPermissionOverrides,
  type EntityRole,
  type PermissionOverrides,
  type Role,
} from "@grantpipe/shared";
import type { AppEnv } from "../types";
import { captureBackgroundException } from "../lib/sentry";

export type EntityScope = "entity" | "rollup";

type OrgMemberRow = {
  id: string;
  orgId: string;
  role: string;
  permissions?: PermissionOverrides | null;
  deletedAt: Date | null;
};

type EntityMemberRow = {
  entityId: string;
  role: string;
  permissions?: EntityPermissionOverrides | null;
  deletedAt: Date | null;
};

export type OrgSubscriptionWithDefaultEntity = NonNullable<
  AppEnv["Variables"]["orgSubscription"]
> & {
  defaultEntityId: string | null;
};

export type FindOrgSubscription = (
  db: AppEnv["Variables"]["db"],
  orgId: string,
) => Promise<OrgSubscriptionWithDefaultEntity | null>;

type ContextFailureReason =
  | "entity_switch_denied"
  | "missing_default_entity"
  | "inactive_or_missing_entity";

type ContextFailure = {
  reason: ContextFailureReason;
  orgId: string;
  requestedEntityId?: string;
  selectedEntityId?: string;
  entityScope: EntityScope;
};

type CaptureContextFailure = (error: Error, context: ContextFailure) => void;

type OrgEntityContextMiddlewareOptions = {
  findOrgSubscription: FindOrgSubscription;
  captureContextFailure?: CaptureContextFailure;
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

function captureOrgEntityContextFailure(error: Error, context: ContextFailure): void {
  captureBackgroundException(error, "org-entity-context", {
    reason: context.reason,
    org_id: context.orgId,
    entity_scope: context.entityScope,
    ...(context.requestedEntityId ? { requested_entity_id: context.requestedEntityId } : {}),
    ...(context.selectedEntityId ? { selected_entity_id: context.selectedEntityId } : {}),
  });
}

function denyEntityAccess(captureContextFailure: CaptureContextFailure, context: ContextFailure) {
  captureContextFailure(new Error(`Org/entity context denied: ${context.reason}`), context);
}

export function orgEntityContextMiddleware({
  findOrgSubscription,
  captureContextFailure = captureOrgEntityContextFailure,
}: OrgEntityContextMiddlewareOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const db = c.get("db");
    const user = c.get("user");
    const userId = user?.id;

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const requestedOrgHeader = c.req.header("X-Org-Id");
    const requestedEntityHeader = c.req.header("X-Entity-Id");
    const requestedOrgId = requestedOrgHeader?.trim();
    const requestedEntityId = requestedEntityHeader?.trim();
    const hasRequestedOrgId = requestedOrgHeader !== undefined;
    const hasRequestedEntityId = requestedEntityHeader !== undefined;
    const entityScope: EntityScope = "entity";

    let member: OrgMemberRow | undefined;

    if (hasRequestedOrgId) {
      if (!requestedOrgId) {
        return c.json({ error: "No organization membership" }, 403);
      }

      member = (await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, requestedOrgId),
          isNull(orgMembers.deletedAt),
        ),
      })) as OrgMemberRow | undefined;

      if (!member) {
        return c.json({ error: "No organization membership" }, 403);
      }
    } else {
      member = (await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.userId, userId), isNull(orgMembers.deletedAt)),
        orderBy: [desc(orgMembers.joinedAt)],
      })) as OrgMemberRow | undefined;
    }

    if (!member || member.deletedAt !== null) {
      return c.json({ error: "No organization membership" }, 403);
    }

    const orgSubscription = await findOrgSubscription(db, member.orgId);
    const selectedEntityId = hasRequestedEntityId
      ? (requestedEntityId ?? "")
      : (orgSubscription?.defaultEntityId ?? null);

    if (!selectedEntityId) {
      denyEntityAccess(captureContextFailure, {
        reason: hasRequestedEntityId ? "entity_switch_denied" : "missing_default_entity",
        orgId: member.orgId,
        requestedEntityId: requestedEntityId || undefined,
        entityScope,
      });
      return c.json({ error: "No entity access" }, 403);
    }

    const entity = await db.query.entities.findFirst({
      where: and(
        eq(entities.orgId, member.orgId),
        eq(entities.id, selectedEntityId),
        eq(entities.status, "active"),
        isNull(entities.deletedAt),
      ),
    });

    if (!entity) {
      denyEntityAccess(captureContextFailure, {
        reason: requestedEntityId ? "entity_switch_denied" : "inactive_or_missing_entity",
        orgId: member.orgId,
        requestedEntityId: requestedEntityId ?? undefined,
        selectedEntityId,
        entityScope,
      });
      return c.json({ error: "No entity access" }, 403);
    }

    const entityMember = (await db.query.entityMembers.findFirst({
      where: and(
        eq(entityMembers.orgId, member.orgId),
        eq(entityMembers.entityId, selectedEntityId),
        eq(entityMembers.orgMemberId, member.id),
        isNull(entityMembers.deletedAt),
      ),
    })) as EntityMemberRow | undefined;

    if (!entityMember || entityMember.deletedAt !== null) {
      denyEntityAccess(captureContextFailure, {
        reason: "entity_switch_denied",
        orgId: member.orgId,
        requestedEntityId: requestedEntityId ?? selectedEntityId,
        entityScope,
      });
      return c.json({ error: "No entity access" }, 403);
    }

    const memberRole = member.role as Role;
    const entityRole = entityMember.role as EntityRole;

    c.set("orgId", member.orgId);
    c.set("orgMemberId", member.id);
    c.set("memberRole", memberRole);
    c.set("memberPermissions", resolveEffectivePermissions(memberRole, member.permissions));
    c.set("orgSubscription", orgSubscription);
    c.set("entityId", selectedEntityId);
    c.set("entityScope", entityScope);
    c.set("entityRole", entityRole);
    c.set(
      "entityPermissions",
      resolveEffectiveEntityPermissions(entityRole, entityMember.permissions),
    );

    await next();
  });
}
