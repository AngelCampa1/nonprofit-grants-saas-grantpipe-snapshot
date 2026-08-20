import { createMiddleware } from "hono/factory";
import {
  ENTITY_FEATURE_AREAS,
  getDefaultPermissionsForEntityRole,
  resolveEffectivePermissions,
  type EntityPermissionMap,
  type EntityRole,
  type FeatureArea,
  type PermissionLevel,
  type PermissionMap,
  type Role,
  ROLE_HIERARCHY,
} from "@grantpipe/shared";

const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

type AuthorizationVariables = {
  memberRole: Role | null;
  memberPermissions?: PermissionMap | null;
  entityRole?: EntityRole | null;
  entityPermissions?: EntityPermissionMap | null;
};

type AuthorizationScopeOptions = {
  scope: "entity";
};

function effectiveEntityRole(memberRole: Role, entityRole?: EntityRole | null): Role {
  if (!entityRole) return memberRole;
  if (memberRole === "auditor" || entityRole === "auditor") return "auditor";
  return ROLE_HIERARCHY[memberRole] <= ROLE_HIERARCHY[entityRole] ? memberRole : entityRole;
}

function entityPermissionLevel(
  feature: FeatureArea,
  entityRole?: EntityRole | null,
  entityPermissions?: EntityPermissionMap | null,
): PermissionLevel | null {
  if (!entityRole || !(ENTITY_FEATURE_AREAS as readonly string[]).includes(feature)) return null;
  const permissions = entityPermissions ?? getDefaultPermissionsForEntityRole(entityRole);
  return permissions[feature as keyof EntityPermissionMap] ?? "none";
}

export function requireRole(minimumRole: Role, options?: AuthorizationScopeOptions) {
  return createMiddleware<{ Variables: AuthorizationVariables }>(async (c, next) => {
    const userRole = c.get("memberRole");
    const effectiveRole =
      userRole && options?.scope === "entity"
        ? effectiveEntityRole(userRole, c.get("entityRole"))
        : userRole;
    if (!effectiveRole || ROLE_HIERARCHY[effectiveRole] < ROLE_HIERARCHY[minimumRole]) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}

export function requireEntityRole(minimumRole: Role) {
  return requireRole(minimumRole, { scope: "entity" });
}

// Denies access to users with exactly this role; allows all others.
export function blockRole(blockedRole: Role, options?: AuthorizationScopeOptions) {
  return createMiddleware<{ Variables: AuthorizationVariables }>(async (c, next) => {
    const userRole = c.get("memberRole");
    const effectiveRole =
      userRole && options?.scope === "entity"
        ? effectiveEntityRole(userRole, c.get("entityRole"))
        : userRole;
    if (!effectiveRole || effectiveRole === blockedRole) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}

export function blockEntityRole(blockedRole: Role) {
  return blockRole(blockedRole, { scope: "entity" });
}

export function requirePermission(
  feature: FeatureArea,
  minimumLevel: PermissionLevel,
  options?: AuthorizationScopeOptions,
) {
  return createMiddleware<{ Variables: AuthorizationVariables }>(async (c, next) => {
    const userRole = c.get("memberRole");
    if (!userRole) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const effective = resolveEffectivePermissions(userRole, c.get("memberPermissions"));
    const userLevel = effective[feature];
    const entityRole = c.get("entityRole");
    const selectedEntityLevel: PermissionLevel | null =
      options?.scope === "entity" && entityRole
        ? entityPermissionLevel(feature, entityRole, c.get("entityPermissions"))
        : null;
    if (
      PERMISSION_HIERARCHY[userLevel] < PERMISSION_HIERARCHY[minimumLevel] ||
      (options?.scope === "entity" &&
        entityRole &&
        (selectedEntityLevel === null ||
          PERMISSION_HIERARCHY[selectedEntityLevel] < PERMISSION_HIERARCHY[minimumLevel]))
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });
}

export function requireEntityPermission(feature: FeatureArea, minimumLevel: PermissionLevel) {
  return requirePermission(feature, minimumLevel, { scope: "entity" });
}

export function requireAllPermissions(
  requirements: Array<[FeatureArea, Exclude<PermissionLevel, "none">]>,
  options?: AuthorizationScopeOptions,
) {
  return createMiddleware<{ Variables: AuthorizationVariables }>(async (c, next) => {
    const userRole = c.get("memberRole");
    if (!userRole) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const effective = resolveEffectivePermissions(userRole, c.get("memberPermissions"));
    const entityRole = c.get("entityRole");
    const allowed = requirements.every(([feature, minimumLevel]) => {
      const userLevel = effective[feature];
      const selectedEntityLevel: PermissionLevel | null =
        options?.scope === "entity" && entityRole
          ? entityPermissionLevel(feature, entityRole, c.get("entityPermissions"))
          : null;
      return (
        PERMISSION_HIERARCHY[userLevel] >= PERMISSION_HIERARCHY[minimumLevel] &&
        (options?.scope !== "entity" ||
          !entityRole ||
          (selectedEntityLevel !== null &&
            PERMISSION_HIERARCHY[selectedEntityLevel] >= PERMISSION_HIERARCHY[minimumLevel]))
      );
    });

    if (!allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });
}

export function requireAllEntityPermissions(
  requirements: Array<[FeatureArea, Exclude<PermissionLevel, "none">]>,
) {
  return requireAllPermissions(requirements, { scope: "entity" });
}
