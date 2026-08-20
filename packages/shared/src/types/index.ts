/** User roles within an organization */
export const ROLES = ["admin", "editor", "viewer", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  auditor: "Auditor",
};

export const READ_ONLY_ROLES = ROLES;
export const STANDARD_ROLES = ["admin", "editor", "viewer"] as const satisfies readonly Role[];
export const EDITOR_UP_ROLES = ["admin", "editor"] as const satisfies readonly Role[];
export const ADMIN_ONLY_ROLES = ["admin"] as const satisfies readonly Role[];
export const INVITABLE_ROLES = ["viewer", "editor", "auditor"] as const satisfies readonly Role[];

export const ENTITY_KINDS = [
  "root",
  "legal_entity",
  "sponsored_project",
  "agency_client",
  "consolidation_group",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const FISCAL_SPONSOR_MODELS = ["none", "model_a", "model_c"] as const;
export type FiscalSponsorModel = (typeof FISCAL_SPONSOR_MODELS)[number];

export const ENTITY_ROLES = ROLES;
export type EntityRole = (typeof ENTITY_ROLES)[number];

export const ENTITY_STATUSES = ["active", "archived"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const ENTITY_ROLE_LABELS: Record<EntityRole, string> = {
  admin: "Entity admin",
  editor: "Entity editor",
  viewer: "Entity viewer",
  auditor: "Entity auditor",
};

export const ENTITY_FEATURE_AREAS = [
  "entitySettings",
  "entityTeam",
  "grants",
  "funds",
  "documents",
  "compliance",
  "accounting",
  "reports",
] as const;

export type EntityFeatureArea = (typeof ENTITY_FEATURE_AREAS)[number];
export type EntityPermissionMap = Record<EntityFeatureArea, PermissionLevel>;
export type EntityPermissionOverrides = Partial<EntityPermissionMap>;

/** Role hierarchy for permission checks. Higher number = more access. */
export const ROLE_HIERARCHY: Record<Role, number> = {
  auditor: 1,
  viewer: 1,
  editor: 2,
  admin: 3,
} as const;

export const FEATURE_AREAS = [
  "donors",
  "grants",
  "funds",
  "events",
  "documents",
  "compliance",
  "programs",
  "accounting",
  "import",
  "reports",
  "payments",
  "settings",
  "billing",
  "team",
] as const;

export const PERMISSION_LEVELS = ["none", "view", "edit", "manage"] as const;

export type FeatureArea = (typeof FEATURE_AREAS)[number];
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type PermissionMap = Record<FeatureArea, PermissionLevel>;
export type PermissionOverrides = Partial<PermissionMap>;

const ADMIN_PERMISSIONS = Object.fromEntries(
  FEATURE_AREAS.map((feature) => [feature, "manage"]),
) as PermissionMap;

const EDITOR_PERMISSIONS: PermissionMap = {
  donors: "edit",
  grants: "edit",
  funds: "edit",
  events: "edit",
  documents: "edit",
  compliance: "edit",
  programs: "edit",
  accounting: "edit",
  import: "edit",
  reports: "edit",
  payments: "edit",
  settings: "view",
  billing: "none",
  team: "none",
};

const VIEWER_PERMISSIONS: PermissionMap = {
  donors: "view",
  grants: "view",
  funds: "view",
  events: "view",
  documents: "view",
  compliance: "view",
  programs: "view",
  accounting: "view",
  import: "none",
  reports: "view",
  payments: "view",
  settings: "view",
  billing: "none",
  team: "none",
};

const AUDITOR_PERMISSIONS: PermissionMap = {
  donors: "none",
  grants: "view",
  funds: "view",
  events: "none",
  documents: "view",
  compliance: "view",
  programs: "none",
  accounting: "view",
  import: "none",
  reports: "view",
  payments: "none",
  settings: "none",
  billing: "none",
  team: "none",
};

const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionMap> = {
  admin: ADMIN_PERMISSIONS,
  editor: EDITOR_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
  auditor: AUDITOR_PERMISSIONS,
};

const ENTITY_ADMIN_PERMISSIONS = Object.fromEntries(
  ENTITY_FEATURE_AREAS.map((feature) => [feature, "manage"]),
) as EntityPermissionMap;

const ENTITY_EDITOR_PERMISSIONS: EntityPermissionMap = {
  entitySettings: "view",
  entityTeam: "none",
  grants: "edit",
  funds: "edit",
  documents: "edit",
  compliance: "edit",
  accounting: "edit",
  reports: "edit",
};

const ENTITY_VIEWER_PERMISSIONS: EntityPermissionMap = {
  entitySettings: "view",
  entityTeam: "none",
  grants: "view",
  funds: "view",
  documents: "view",
  compliance: "view",
  accounting: "view",
  reports: "view",
};

const ENTITY_AUDITOR_PERMISSIONS: EntityPermissionMap = {
  entitySettings: "none",
  entityTeam: "none",
  grants: "view",
  funds: "view",
  documents: "view",
  compliance: "view",
  accounting: "view",
  reports: "view",
};

const ENTITY_ROLE_DEFAULT_PERMISSIONS: Record<EntityRole, EntityPermissionMap> = {
  admin: ENTITY_ADMIN_PERMISSIONS,
  editor: ENTITY_EDITOR_PERMISSIONS,
  viewer: ENTITY_VIEWER_PERMISSIONS,
  auditor: ENTITY_AUDITOR_PERMISSIONS,
};

export function getDefaultPermissionsForRole(role: Role): PermissionMap {
  return { ...ROLE_DEFAULT_PERMISSIONS[role] };
}

export function getDefaultPermissionsForEntityRole(role: EntityRole): EntityPermissionMap {
  return { ...ENTITY_ROLE_DEFAULT_PERMISSIONS[role] };
}

export function resolveEffectivePermissions(
  role: Role,
  overrides?: PermissionOverrides | null,
): PermissionMap {
  if (role === "admin" || role === "auditor") {
    return getDefaultPermissionsForRole(role);
  }

  return {
    ...getDefaultPermissionsForRole(role),
    ...(overrides ?? {}),
  };
}
