import {
  ADMIN_ONLY_ROLES,
  EDITOR_UP_ROLES,
  READ_ONLY_ROLES,
  STANDARD_ROLES,
  resolveEffectivePermissions,
  type FeatureArea,
  type PermissionLevel,
  type PermissionMap,
  type PermissionOverrides,
  type Role,
} from "@grantpipe/shared";

export type AppRole = Role;

export const readOnlyRoles: readonly AppRole[] = READ_ONLY_ROLES;
export const standardRoles: readonly AppRole[] = STANDARD_ROLES;
export const editorUpRoles: readonly AppRole[] = EDITOR_UP_ROLES;
export const adminOnlyRoles: readonly AppRole[] = ADMIN_ONLY_ROLES;

export function hasRoleAccess(
  role: AppRole | null | undefined,
  allowedRoles: readonly AppRole[],
): boolean {
  if (!role) {
    return false;
  }

  return allowedRoles.includes(role);
}

export function canCreateRecords(
  role: AppRole | null | undefined,
  permissions?: PermissionOverrides | PermissionMap | null,
): boolean {
  return canAccessFeature(role, permissions, "donors", "edit");
}

const permissionRank: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

export function canAccessFeature(
  role: AppRole | null | undefined,
  permissions: PermissionOverrides | PermissionMap | null | undefined,
  feature: FeatureArea,
  minimumLevel: Exclude<PermissionLevel, "none">,
): boolean {
  if (!role) {
    return false;
  }

  const effectivePermissions = resolveEffectivePermissions(role, permissions);
  const userLevel = effectivePermissions[feature] ?? "none";
  return permissionRank[userLevel] >= permissionRank[minimumLevel];
}

export function canAccessImport(
  role: AppRole | null | undefined,
  permissions?: PermissionOverrides | PermissionMap | null,
): boolean {
  return canAccessFeature(role, permissions, "import", "edit");
}

export function canAccessEvents(
  role: AppRole | null | undefined,
  permissions?: PermissionOverrides | PermissionMap | null,
): boolean {
  return canAccessFeature(role, permissions, "events", "view");
}
