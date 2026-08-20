import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  contacts,
  donations,
  customFieldDefinitions,
  customFieldValues,
  entities,
  entityMembers,
  inviteLinks,
  billingEvents,
  grants,
  orgMembers,
  organizations,
  type Database,
  type TransactionDatabase,
} from "@grantpipe/db";
import {
  billingLifecycleState,
  getDefaultPermissionsForEntityRole,
  type PermissionOverrides,
  type Role,
  type EntityKind,
  type EntityPermissionMap,
  type EntityPermissionOverrides,
  type EntityRole,
  type EntityStatus,
  type FiscalSponsorModel,
  BillingCheckoutParams,
  BillingSelectionParams,
  BillingPortalInput,
  CreateEntityParams,
  EntityAccessParams,
  CreateCustomFieldDefinitionInput,
  CustomFieldEntityType,
  DebugInspectionListParams,
  EntityListQueryParams,
  OrgTeamListParams,
  UpdateEntityAccessParams,
  UpdateEntityParams,
  UpdateOrgMemberInput,
  UpdateOrgProfileInput,
  UpdateCustomFieldDefinitionInput,
  UpdateOrgSettingsInput,
} from "@grantpipe/shared";
import { getIntegrations, getLocalMockIntegrationRecords } from "../../lib/integrations";
import { badRequest, notFound, serviceUnavailable } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { isMissingColumnError } from "../../lib/db-errors";
import type { Bindings } from "../../types";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const STRIPE_CHECKOUT_PRICE_BINDINGS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_ANNUAL",
  "STRIPE_PRICE_GROWTH_MONTHLY",
  "STRIPE_PRICE_GROWTH_ANNUAL",
  "STRIPE_PRICE_AUDIT_READY_MONTHLY",
  "STRIPE_PRICE_AUDIT_READY_ANNUAL",
] as const;

function hasStripeCheckoutConfiguration(bindings: Bindings): boolean {
  return Boolean(
    bindings.STRIPE_SECRET_KEY &&
    STRIPE_CHECKOUT_PRICE_BINDINGS.every((key) => Boolean(bindings[key])),
  );
}

type EntityAccessSummary = {
  id: string;
  entityId: string;
  entityName: string;
  kind: EntityKind;
  status: EntityStatus;
  fiscalSponsorModel: FiscalSponsorModel;
  parentEntityId: string | null;
  role: EntityRole;
  permissions: EntityPermissionMap;
};

function validateCustomFieldValue(fieldType: string, value: unknown, options: unknown): void {
  switch (fieldType) {
    case "text": {
      if (typeof value !== "string") {
        throw badRequest(`Custom field value must be a string for field type "${fieldType}"`);
      }
      break;
    }
    case "single_select": {
      if (typeof value !== "string") {
        throw badRequest(`Custom field value must be a string for field type "${fieldType}"`);
      }
      if (
        Array.isArray(options) &&
        options.length > 0 &&
        options.every((o) => typeof o === "string") &&
        !(options as string[]).includes(value)
      ) {
        throw badRequest(
          `Custom field value "${value}" is not one of the allowed options for field type "single_select"`,
        );
      }
      break;
    }
    case "number": {
      const asString = typeof value === "string" ? value : String(value);
      if (!Number.isFinite(Number(asString))) {
        throw badRequest(
          `Custom field value must be a finite number for field type "number", got: ${JSON.stringify(value)}`,
        );
      }
      break;
    }
    case "date": {
      if (typeof value !== "string" || !DATE_REGEX.test(value)) {
        throw badRequest(
          `Custom field value must be a date string in YYYY-MM-DD format for field type "date", got: ${JSON.stringify(value)}`,
        );
      }
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        throw badRequest(
          `Custom field value is not a valid calendar date for field type "date", got: ${JSON.stringify(value)}`,
        );
      }
      break;
    }
    case "multi_select": {
      if (!Array.isArray(value)) {
        throw badRequest(
          `Custom field value must be an array for field type "multi_select", got: ${JSON.stringify(value)}`,
        );
      }
      const hasNonString = value.some((item) => typeof item !== "string");
      if (hasNonString) {
        throw badRequest(
          `Custom field value array must contain only strings for field type "multi_select"`,
        );
      }
      if (
        Array.isArray(options) &&
        options.length > 0 &&
        options.every((o) => typeof o === "string")
      ) {
        const allowedOptions = options as string[];
        const invalidItem = value.find((item) => !allowedOptions.includes(item as string));
        if (invalidItem !== undefined) {
          throw badRequest(
            `Custom field value "${String(invalidItem)}" is not one of the allowed options for field type "multi_select"`,
          );
        }
      }
      break;
    }
    default:
      break;
  }
}

async function assertCustomFieldEntityInOrg(
  db: TransactionDatabase,
  params: { orgId: string; entityType: CustomFieldEntityType; entityId: string },
) {
  if (!db.query) return;

  switch (params.entityType) {
    case "contact": {
      if (!db.query.contacts?.findFirst) return;
      const row = await db.query.contacts.findFirst({
        where: and(
          eq(contacts.id, params.entityId),
          eq(contacts.orgId, params.orgId),
          isNull(contacts.deletedAt),
        ),
        columns: { id: true },
      });
      if (!row) throw notFound("Contact not found");
      return;
    }
    case "donation": {
      if (!db.query.donations?.findFirst) return;
      const row = await db.query.donations.findFirst({
        where: and(
          eq(donations.id, params.entityId),
          eq(donations.orgId, params.orgId),
          isNull(donations.deletedAt),
        ),
        columns: { id: true },
      });
      if (!row) throw notFound("Donation not found");
      return;
    }
    case "grant": {
      if (!db.query.grants?.findFirst) return;
      const row = await db.query.grants.findFirst({
        where: and(
          eq(grants.id, params.entityId),
          eq(grants.orgId, params.orgId),
          isNull(grants.deletedAt),
        ),
        columns: { id: true },
      });
      if (!row) throw notFound("Grant not found");
      return;
    }
  }
}

export async function listCustomFieldDefinitions(
  db: Database,
  params: { orgId: string; entityType: CustomFieldEntityType },
) {
  const rows = (await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.orgId, params.orgId),
        eq(customFieldDefinitions.entityType, params.entityType),
        isNull(customFieldDefinitions.deletedAt),
      ),
    )
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.name))) as Array<
    typeof customFieldDefinitions.$inferSelect
  >;

  return rows.filter((definition) => definition.deletedAt == null);
}

export async function createCustomFieldDefinition(
  db: TransactionDatabase,
  params: { orgId: string; actorId: string } & CreateCustomFieldDefinitionInput,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(customFieldDefinitions)
      .values({
        orgId: params.orgId,
        entityType: params.entityType,
        name: params.name,
        fieldType: params.fieldType,
        options: params.options ?? null,
        sortOrder: params.sortOrder ?? 0,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create custom field definition");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "custom_field",
      entityId: row.id,
      changes: { name: params.name, fieldType: params.fieldType, entityType: params.entityType },
    });

    return row;
  });
}

export async function updateCustomFieldDefinition(
  db: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    definitionId: string;
    data: UpdateCustomFieldDefinitionInput;
  },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(customFieldDefinitions)
      .set(params.data)
      .where(
        and(
          eq(customFieldDefinitions.id, params.definitionId),
          eq(customFieldDefinitions.orgId, params.orgId),
          isNull(customFieldDefinitions.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Custom field definition not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "custom_field",
      entityId: params.definitionId,
      changes: params.data,
    });

    return row;
  });
}

export async function softDeleteCustomFieldDefinition(
  db: TransactionDatabase,
  params: { orgId: string; actorId: string; definitionId: string },
) {
  const definition = await db.query.customFieldDefinitions.findFirst({
    where: and(
      eq(customFieldDefinitions.id, params.definitionId),
      eq(customFieldDefinitions.orgId, params.orgId),
      isNull(customFieldDefinitions.deletedAt),
    ),
    columns: {
      id: true,
    },
  });

  if (!definition) {
    throw notFound("Custom field definition not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(customFieldDefinitions.id, params.definitionId),
          eq(customFieldDefinitions.orgId, params.orgId),
          isNull(customFieldDefinitions.deletedAt),
        ),
      );

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "custom_field",
      entityId: params.definitionId,
      changes: null,
    });
  });
}

function serializeValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function upsertCustomFieldValue(
  db: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    entityType: CustomFieldEntityType;
    fieldId: string;
    entityId: string;
    value: unknown;
  },
) {
  const definition = await db.query.customFieldDefinitions.findFirst({
    where: and(
      eq(customFieldDefinitions.id, params.fieldId),
      eq(customFieldDefinitions.orgId, params.orgId),
      eq(customFieldDefinitions.entityType, params.entityType),
      isNull(customFieldDefinitions.deletedAt),
    ),
    columns: {
      id: true,
      fieldType: true,
      options: true,
    },
  });

  if (!definition) {
    throw notFound("Custom field definition not found");
  }

  validateCustomFieldValue(definition.fieldType, params.value, definition.options);

  await assertCustomFieldEntityInOrg(db, {
    orgId: params.orgId,
    entityType: params.entityType,
    entityId: params.entityId,
  });

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(customFieldValues)
      .values({
        fieldId: params.fieldId,
        entityId: params.entityId,
        value: serializeValue(params.value),
      })
      .onConflictDoUpdate({
        target: [customFieldValues.fieldId, customFieldValues.entityId],
        set: {
          value: serializeValue(params.value),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert custom field value");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "upserted",
      entityType: "custom_field_value",
      entityId: `${params.fieldId}:${params.entityId}`,
      changes: { value: params.value },
    });

    return row;
  });
}

export async function listCustomFieldValues(
  db: Database,
  params: { orgId: string; entityType: CustomFieldEntityType; entityId: string },
) {
  await assertCustomFieldEntityInOrg(db, {
    orgId: params.orgId,
    entityType: params.entityType,
    entityId: params.entityId,
  });

  const definitions = await listCustomFieldDefinitions(db, {
    orgId: params.orgId,
    entityType: params.entityType,
  });

  const values = await db
    .select()
    .from(customFieldValues)
    .where(eq(customFieldValues.entityId, params.entityId));

  const valueMap = new Map(values.map((value) => [value.fieldId, value]));

  return definitions.map((definition) => ({
    definition,
    value: valueMap.get(definition.id) ?? null,
  }));
}

// The settings profile is readable by anyone with settings:view OR accounting:view
// (Editor, Viewer, Auditor) — all of whom have billing:none. Project to a safe
// allowlist so Stripe identifiers, subscription state, promo codes, and trial
// timestamps never leak through this endpoint. Billing data is served separately
// by the admin-only GET /org/billing route.
function toSafeOrgProfile(row: typeof organizations.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ein: row.ein,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    timezone: row.timezone,
    logoUrl: row.logoUrl,
    address: row.address,
    // planTier is the plan name (e.g. "starter"/"growth"), used for client-side
    // feature gating — not sensitive billing data.
    planTier: row.planTier,
    onboardingCompleted: row.onboardingCompleted,
    accountingEnabled: row.accountingEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function getOrgProfile(db: Database, params: { orgId: string }) {
  let row: typeof organizations.$inferSelect | undefined;

  try {
    row = await db.query.organizations.findFirst({
      where: eq(organizations.id, params.orgId),
    });
  } catch (error) {
    if (!isMissingColumnError(error, "plan_selected_at")) {
      throw error;
    }

    console.error("[org] Falling back for getOrgProfile without plan_selected_at", {
      orgId: params.orgId,
    });
    const result = await db.execute<typeof organizations.$inferSelect>(sql`
      SELECT
        "id",
        "name",
        "slug",
        "ein",
        "fiscal_year_start_month" as "fiscalYearStartMonth",
        "timezone",
        "logo_url" as "logoUrl",
        "address",
        "stripe_customer_id" as "stripeCustomerId",
        "stripe_subscription_id" as "stripeSubscriptionId",
        "plan_tier" as "planTier",
        "billing_cycle" as "billingCycle",
        "subscription_status" as "subscriptionStatus",
        "trial_started_at" as "trialStartedAt",
        "trial_ends_at" as "trialEndsAt",
        "trial_will_end_notified_at" as "trialWillEndNotifiedAt",
        "promo_code_applied" as "promoCodeApplied",
        NULL::timestamptz as "planSelectedAt",
        "onboarding_completed" as "onboardingCompleted",
        "accounting_enabled" as "accountingEnabled",
        "created_at" as "createdAt",
        "updated_at" as "updatedAt",
        "deleted_at" as "deletedAt"
      FROM "organizations"
      WHERE "id" = ${params.orgId}
      LIMIT 1
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    [row] = rows;
  }

  if (!row) {
    throw new Error("Organization not found");
  }

  return toSafeOrgProfile(row);
}

export async function updateOrgProfile(
  db: Database,
  params: { orgId: string; actorId: string; data: UpdateOrgProfileInput },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(organizations)
      .set({
        name: params.data.name,
        ein: params.data.ein ?? null,
        fiscalYearStartMonth: params.data.fiscalYearStartMonth,
        timezone: params.data.timezone,
        logoUrl: params.data.logoUrl ?? null,
        address: params.data.address ?? null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, params.orgId))
      .returning();

    if (!row) {
      throw new Error("Organization not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "organization",
      entityId: params.orgId,
      changes: params.data,
    });

    return toSafeOrgProfile(row);
  });
}

export async function listOrgMembers(db: Database, params: { orgId: string } & OrgTeamListParams) {
  const rows = await db.query.orgMembers.findMany({
    where: params.includeInactive
      ? eq(orgMembers.orgId, params.orgId)
      : and(eq(orgMembers.orgId, params.orgId), isNull(orgMembers.deletedAt)),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: [asc(orgMembers.joinedAt)],
  });

  const entityAccess = await listEntityAccessSummariesForMembers(db, {
    orgId: params.orgId,
    memberIds: rows.map((row) => row.id),
  });

  return rows.map((row) => ({
    ...row,
    entityAccess: entityAccess
      .filter((access) => access.orgMemberId === row.id)
      .map(({ orgMemberId: _orgMemberId, ...access }) => access),
  }));
}

export async function createInviteLink(
  db: Database,
  params: {
    orgId: string;
    userId: string;
    mode?: "email" | "shareable";
    email?: string;
    role: Role;
    permissions?: PermissionOverrides;
    entityId?: string;
  },
) {
  const token = crypto.randomUUID();
  const mode = params.mode ?? "shareable";
  const email = mode === "email" ? params.email?.trim().toLowerCase() : undefined;

  if (params.entityId) {
    await assertActiveEntityInOrg(db, {
      orgId: params.orgId,
      entityId: params.entityId,
    });
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(inviteLinks)
      .values({
        orgId: params.orgId,
        entityId: params.entityId,
        createdBy: params.userId,
        mode,
        email,
        role: params.role,
        permissions: params.permissions ?? null,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create invite");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.userId,
      action: "created",
      entityType: "invite_link",
      entityId: row.id,
      changes: {
        mode,
        ...(email ? { email } : {}),
        role: params.role,
        ...(params.entityId ? { entityId: params.entityId } : {}),
        ...(params.permissions ? { permissions: params.permissions } : {}),
      },
    });

    return row;
  });
}

async function assertActiveEntityInOrg(
  db: Database | TransactionDatabase,
  params: { orgId: string; entityId: string },
) {
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.orgId, params.orgId),
      eq(entities.status, "active"),
      isNull(entities.deletedAt),
    ),
    columns: { id: true },
  });

  if (!entity) {
    throw badRequest("Entity must be active");
  }
}

async function assertOrgMemberInOrg(
  db: Database | TransactionDatabase,
  params: { orgId: string; memberId: string },
) {
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.id, params.memberId),
      eq(orgMembers.orgId, params.orgId),
      isNull(orgMembers.deletedAt),
    ),
    columns: { id: true },
  });

  if (!member) {
    throw notFound("Org member not found");
  }
}

function permissionKeys(permissions?: Record<string, unknown> | null): string[] {
  if (!permissions) return [];
  return Object.entries(permissions)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
}

function normalizePermissionRecord(permissions?: Record<string, string | undefined> | null) {
  if (!permissions) return permissions ?? null;
  return Object.fromEntries(
    Object.entries(permissions).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}

function resolveEffectiveEntityPermissions(
  role: EntityRole,
  permissions?: Record<string, string | undefined> | null,
): EntityPermissionMap {
  if (role === "admin" || role === "auditor") {
    return getDefaultPermissionsForEntityRole(role);
  }

  return {
    ...getDefaultPermissionsForEntityRole(role),
    ...((normalizePermissionRecord(permissions) ?? {}) as EntityPermissionOverrides),
  };
}

async function listEntityAccessSummariesForMembers(
  db: Database | TransactionDatabase,
  params: { orgId: string; memberIds: string[] },
): Promise<Array<EntityAccessSummary & { orgMemberId: string }>> {
  if (params.memberIds.length === 0) return [];

  const rows = await db
    .select({
      id: entityMembers.id,
      orgMemberId: entityMembers.orgMemberId,
      entityId: entityMembers.entityId,
      entityName: entities.name,
      kind: entities.kind,
      status: entities.status,
      fiscalSponsorModel: entities.fiscalSponsorModel,
      parentEntityId: entities.parentEntityId,
      role: entityMembers.role,
      permissions: entityMembers.permissions,
    })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(
      and(
        eq(entityMembers.orgId, params.orgId),
        inArray(entityMembers.orgMemberId, params.memberIds),
        isNull(entityMembers.deletedAt),
        isNull(entities.deletedAt),
      ),
    )
    .orderBy(asc(entities.name));

  return rows.map((row) => ({
    id: row.id,
    orgMemberId: row.orgMemberId,
    entityId: row.entityId,
    entityName: row.entityName,
    kind: row.kind as EntityKind,
    status: row.status as EntityStatus,
    fiscalSponsorModel: row.fiscalSponsorModel as FiscalSponsorModel,
    parentEntityId: row.parentEntityId,
    role: row.role as EntityRole,
    permissions: resolveEffectiveEntityPermissions(row.role as EntityRole, row.permissions),
  }));
}

async function getEntityAccessSummary(
  db: Database | TransactionDatabase,
  params: { orgId: string; memberId: string; entityId: string },
): Promise<EntityAccessSummary> {
  const summaries = await listEntityAccessSummariesForMembers(db, {
    orgId: params.orgId,
    memberIds: [params.memberId],
  });
  const summary = summaries.find((access) => access.entityId === params.entityId);

  if (!summary) {
    throw notFound("Entity access not found");
  }

  return {
    id: summary.id,
    entityId: summary.entityId,
    entityName: summary.entityName,
    kind: summary.kind,
    status: summary.status,
    fiscalSponsorModel: summary.fiscalSponsorModel,
    parentEntityId: summary.parentEntityId,
    role: summary.role,
    permissions: summary.permissions,
  };
}

async function assertRemainingEntityAdmin(
  db: Database | TransactionDatabase,
  params: { orgId: string; entityId: string; excludingEntityMemberId?: string },
) {
  const activeAdmins = await db.query.entityMembers.findMany({
    where: and(
      eq(entityMembers.orgId, params.orgId),
      eq(entityMembers.entityId, params.entityId),
      eq(entityMembers.role, "admin"),
      isNull(entityMembers.deletedAt),
    ),
    columns: { id: true, role: true },
  });

  const remainingAdmins = activeAdmins.filter((row) => row.id !== params.excludingEntityMemberId);
  if (remainingAdmins.length === 0) {
    throw badRequest("At least one active entity admin is required");
  }
}

export async function assignEntityAccess(
  db: Database,
  params: { orgId: string; actorId: string; memberId: string } & EntityAccessParams,
) {
  return db.transaction(async (tx) => {
    await assertActiveEntityInOrg(tx, params);
    await assertOrgMemberInOrg(tx, params);

    const existing = await tx.query.entityMembers.findFirst({
      where: and(
        eq(entityMembers.orgId, params.orgId),
        eq(entityMembers.orgMemberId, params.memberId),
        eq(entityMembers.entityId, params.entityId),
      ),
      columns: { id: true, deletedAt: true },
    });

    const [row] =
      existing && existing.deletedAt === null
        ? await tx
            .update(entityMembers)
            .set({
              role: params.role,
              permissions: normalizePermissionRecord(params.permissions),
              updatedAt: new Date(),
            })
            .where(eq(entityMembers.id, existing.id))
            .returning()
        : existing
          ? await tx
              .update(entityMembers)
              .set({
                role: params.role,
                permissions: normalizePermissionRecord(params.permissions),
                deletedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(entityMembers.id, existing.id))
              .returning()
          : await tx
              .insert(entityMembers)
              .values({
                orgId: params.orgId,
                orgMemberId: params.memberId,
                entityId: params.entityId,
                role: params.role,
                permissions: normalizePermissionRecord(params.permissions),
              })
              .returning();

    if (!row) {
      throw new Error("Failed to assign entity access");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "entity_member",
      entityId: row.id,
      changes: {
        entityId: params.entityId,
        memberId: params.memberId,
        role: params.role,
        permissionKeys: permissionKeys(params.permissions),
      },
    });

    return getEntityAccessSummary(tx, params);
  });
}

export async function updateEntityAccess(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    memberId: string;
    entityId: string;
    data: UpdateEntityAccessParams;
  },
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.entityMembers.findFirst({
      where: and(
        eq(entityMembers.orgId, params.orgId),
        eq(entityMembers.orgMemberId, params.memberId),
        eq(entityMembers.entityId, params.entityId),
        isNull(entityMembers.deletedAt),
      ),
      columns: { id: true, role: true },
    });

    if (!current) {
      throw notFound("Entity access not found");
    }

    if (
      current.role === "admin" &&
      params.data.role !== undefined &&
      params.data.role !== "admin"
    ) {
      await assertRemainingEntityAdmin(tx, {
        orgId: params.orgId,
        entityId: params.entityId,
        excludingEntityMemberId: current.id,
      });
    }

    const [row] = await tx
      .update(entityMembers)
      .set({
        role: params.data.role,
        permissions:
          params.data.permissions === undefined
            ? undefined
            : normalizePermissionRecord(params.data.permissions),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(entityMembers.orgId, params.orgId),
          eq(entityMembers.orgMemberId, params.memberId),
          eq(entityMembers.entityId, params.entityId),
          isNull(entityMembers.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Entity access not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "entity_member",
      entityId: current.id,
      changes: {
        entityId: params.entityId,
        memberId: params.memberId,
        changedFields: Object.keys(params.data).sort(),
        permissionKeys: permissionKeys(params.data.permissions),
      },
    });

    return getEntityAccessSummary(tx, params);
  });
}

export async function revokeEntityAccess(
  db: Database,
  params: { orgId: string; actorId: string; memberId: string; entityId: string },
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.entityMembers.findFirst({
      where: and(
        eq(entityMembers.orgId, params.orgId),
        eq(entityMembers.orgMemberId, params.memberId),
        eq(entityMembers.entityId, params.entityId),
        isNull(entityMembers.deletedAt),
      ),
      columns: { id: true, role: true },
    });

    if (!current) {
      throw notFound("Entity access not found");
    }

    if (current.role === "admin") {
      await assertRemainingEntityAdmin(tx, {
        orgId: params.orgId,
        entityId: params.entityId,
        excludingEntityMemberId: current.id,
      });
    }

    const summary = await getEntityAccessSummary(tx, params);

    const [row] = await tx
      .update(entityMembers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(entityMembers.orgId, params.orgId),
          eq(entityMembers.orgMemberId, params.memberId),
          eq(entityMembers.entityId, params.entityId),
          isNull(entityMembers.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Entity access not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "revoked",
      entityType: "entity_member",
      entityId: current.id,
      changes: {
        entityId: params.entityId,
        memberId: params.memberId,
      },
    });

    return summary;
  });
}

async function assertNotRemovingLastAdmin(
  db: Database,
  params: { orgId: string; memberId: string; data: UpdateOrgMemberInput },
) {
  if (
    params.data.active !== false &&
    (params.data.role === undefined || params.data.role === "admin")
  ) {
    return;
  }

  if (!db.query?.orgMembers?.findFirst || !db.query.orgMembers.findMany) {
    return;
  }

  const member = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.id, params.memberId), eq(orgMembers.orgId, params.orgId)),
    columns: { id: true, role: true },
  });

  if (member?.role !== "admin") {
    return;
  }

  const activeAdmins = await db.query.orgMembers.findMany({
    where: and(
      eq(orgMembers.orgId, params.orgId),
      eq(orgMembers.role, "admin"),
      isNull(orgMembers.deletedAt),
    ),
    columns: { id: true },
  });

  if (activeAdmins.length <= 1) {
    throw badRequest("At least one active admin is required");
  }
}

export async function updateOrgMember(
  db: Database,
  params: { orgId: string; actorId: string; memberId: string; data: UpdateOrgMemberInput },
) {
  await assertNotRemovingLastAdmin(db, params);

  const normalizedPermissions =
    params.data.permissions != null
      ? (Object.fromEntries(
          Object.entries(params.data.permissions).filter(([, v]) => v !== undefined),
        ) as Record<string, string>)
      : params.data.permissions;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(orgMembers)
      .set({
        role: params.data.role,
        permissions: normalizedPermissions,
        deletedAt:
          params.data.active === false
            ? new Date()
            : params.data.active === true
              ? null
              : undefined,
      })
      .where(and(eq(orgMembers.id, params.memberId), eq(orgMembers.orgId, params.orgId)))
      .returning();

    if (!row) {
      throw new Error("Org member not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "org_member",
      entityId: params.memberId,
      changes: params.data,
    });

    return row;
  });
}

export async function getOrgBillingSummary(
  db: Database,
  bindings: Bindings,
  params: { orgId: string },
) {
  const summary = await getIntegrations(db, bindings).billing.getSummary(params.orgId);
  return {
    ...summary,
    billingLifecycleState: billingLifecycleState({
      subscriptionStatus: summary.status,
      trialEndsAt: summary.trialEndsAt ?? null,
    }),
  };
}

export async function createBillingCheckoutSession(
  db: Database,
  bindings: Bindings,
  params: { orgId: string; userId: string; data: BillingCheckoutParams },
) {
  if (bindings.INTEGRATION_MODE === "real" && !hasStripeCheckoutConfiguration(bindings)) {
    throw serviceUnavailable("Billing is temporarily unavailable", "billing_unavailable");
  }

  const current = await db.query?.organizations?.findFirst?.({
    where: eq(organizations.id, params.orgId),
    columns: {
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      planTier: true,
      billingCycle: true,
      promoCodeApplied: true,
    },
  });
  const hasStripeSubscription =
    current?.stripeSubscriptionId != null && current.subscriptionStatus !== "canceled";
  const hasActiveStripeSubscription =
    hasStripeSubscription && current.subscriptionStatus === "active";
  const changesPlanOrCycle =
    current != null &&
    (current.planTier !== params.data.planTier ||
      current.billingCycle !== params.data.billingCycle);

  if (hasActiveStripeSubscription) {
    if (!changesPlanOrCycle) {
      throw badRequest("Use the Stripe billing portal to manage an active subscription");
    }
    throw badRequest("Use the Stripe billing portal to change an active subscription plan");
  }
  if (hasStripeSubscription) {
    throw badRequest("Use the Stripe billing portal to manage an existing subscription");
  }

  return getIntegrations(db, bindings).billing.createCheckoutSession({
    orgId: params.orgId,
    initiatedBy: params.userId,
    planTier: params.data.planTier,
    billingCycle: params.data.billingCycle,
    promoCode: params.data.promoCode,
    checkoutAttemptId: params.data.checkoutAttemptId,
  });
}

export async function createBillingPortalSession(
  db: Database,
  bindings: Bindings,
  params: { orgId: string; userId: string; data: BillingPortalInput },
) {
  if (bindings.INTEGRATION_MODE === "real" && !bindings.STRIPE_SECRET_KEY) {
    throw serviceUnavailable("Billing is temporarily unavailable", "billing_unavailable");
  }

  return getIntegrations(db, bindings).billing.createPortalSession({
    orgId: params.orgId,
    initiatedBy: params.userId,
    returnPath: params.data.returnPath,
  });
}

export async function saveBillingSelection(
  db: Database,
  params: { orgId: string; actorId: string; data: BillingSelectionParams },
) {
  const now = new Date();
  let row: typeof organizations.$inferSelect | undefined;

  const current = await db.query?.organizations?.findFirst?.({
    where: eq(organizations.id, params.orgId),
    columns: {
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      planTier: true,
      billingCycle: true,
    },
  });
  const hasStripeSubscription =
    current?.stripeSubscriptionId != null && current.subscriptionStatus !== "canceled";
  const hasActiveStripeSubscription =
    hasStripeSubscription && current.subscriptionStatus === "active";
  const changesPlanOrCycle =
    current != null &&
    (current.planTier !== params.data.planTier ||
      current.billingCycle !== params.data.billingCycle);
  if (hasActiveStripeSubscription && changesPlanOrCycle) {
    throw badRequest("Use the Stripe billing portal to change an active subscription plan");
  }
  if (hasStripeSubscription && changesPlanOrCycle) {
    throw badRequest("Use the Stripe billing portal to change an existing subscription plan");
  }

  return db.transaction(async (tx) => {
    try {
      [row] = await tx
        .update(organizations)
        .set({
          planTier: params.data.planTier,
          billingCycle: params.data.billingCycle,
          planSelectedAt: now,
          updatedAt: now,
        })
        .where(eq(organizations.id, params.orgId))
        .returning();
    } catch (error) {
      if (!isMissingColumnError(error, "plan_selected_at")) {
        throw error;
      }

      console.error("[org] Falling back for billing selection without plan_selected_at", {
        orgId: params.orgId,
      });
      const result = await tx.execute<typeof organizations.$inferSelect>(sql`
        UPDATE "organizations"
        SET
          "plan_tier" = ${params.data.planTier},
          "billing_cycle" = ${params.data.billingCycle},
          "updated_at" = ${now}
        WHERE "id" = ${params.orgId}
        RETURNING
          "id",
          "name",
          "slug",
          "ein",
          "fiscal_year_start_month" as "fiscalYearStartMonth",
          "timezone",
          "logo_url" as "logoUrl",
          "address",
          "stripe_customer_id" as "stripeCustomerId",
          "stripe_subscription_id" as "stripeSubscriptionId",
          "plan_tier" as "planTier",
          "billing_cycle" as "billingCycle",
          "subscription_status" as "subscriptionStatus",
          "trial_started_at" as "trialStartedAt",
          "trial_ends_at" as "trialEndsAt",
          "trial_will_end_notified_at" as "trialWillEndNotifiedAt",
          "promo_code_applied" as "promoCodeApplied",
          ${now}::timestamptz as "planSelectedAt",
          "onboarding_completed" as "onboardingCompleted",
          "accounting_enabled" as "accountingEnabled",
          "created_at" as "createdAt",
          "updated_at" as "updatedAt",
          "deleted_at" as "deletedAt"
      `);
      const rows = Array.isArray(result) ? result : result.rows;
      [row] = rows;
    }

    if (!row) {
      throw new Error("Organization not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "organization",
      entityId: params.orgId,
      changes: {
        planTier: params.data.planTier,
        billingCycle: params.data.billingCycle,
        planSelectedAt: now.toISOString(),
      },
    });

    return row;
  });
}

async function listDebugRecords<T extends { createdAt: Date }>(
  data: T[],
  params: DebugInspectionListParams,
) {
  const offset = (params.page - 1) * params.pageSize;
  const sorted = [...data].sort((left, right) =>
    params.sortOrder === "asc"
      ? left.createdAt.getTime() - right.createdAt.getTime()
      : right.createdAt.getTime() - left.createdAt.getTime(),
  );
  return {
    data: sorted.slice(offset, offset + params.pageSize),
    total: sorted.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listDebugEmails(
  db: Database,
  params: { orgId: string } & DebugInspectionListParams,
) {
  const { emails } = getLocalMockIntegrationRecords(db);
  return listDebugRecords(
    emails.filter((record) => record.orgId === params.orgId),
    params,
  );
}

export async function listDebugStorageObjects(
  db: Database,
  params: { orgId: string } & DebugInspectionListParams,
) {
  const { storageObjects } = getLocalMockIntegrationRecords(db);
  return listDebugRecords(
    storageObjects.filter((record) => record.orgId === params.orgId),
    params,
  );
}

export async function listDebugBillingEvents(
  db: Database,
  params: { orgId: string } & DebugInspectionListParams,
) {
  const data = await db.query.billingEvents.findMany({
    where: eq(billingEvents.orgId, params.orgId),
    orderBy: [desc(billingEvents.createdAt)],
  });
  return listDebugRecords(data, params);
}

export async function listDebugAnalyticsEvents(
  db: Database,
  params: { orgId: string } & DebugInspectionListParams,
) {
  const { analyticsEvents } = getLocalMockIntegrationRecords(db);
  return listDebugRecords(
    analyticsEvents.filter((record) => record.orgId === params.orgId),
    params,
  );
}

export async function listDebugErrorEvents(
  db: Database,
  params: { orgId: string } & DebugInspectionListParams,
) {
  const { errorEvents } = getLocalMockIntegrationRecords(db);
  return listDebugRecords(
    errorEvents.filter((record) => record.orgId === params.orgId),
    params,
  );
}

export async function updateOrgSettings(
  db: Database,
  params: { orgId: string; actorId: string } & UpdateOrgSettingsInput,
) {
  const payload: Record<string, unknown> = {};
  if (params.accountingEnabled !== undefined) payload.accountingEnabled = params.accountingEnabled;

  if (Object.keys(payload).length === 0) return;

  await db.transaction(async (tx) => {
    await tx.update(organizations).set(payload).where(eq(organizations.id, params.orgId));

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "organization",
      entityId: params.orgId,
      changes: payload,
    });
  });
}

async function assertActiveParentEntity(
  db: Database | TransactionDatabase,
  params: { orgId: string; parentEntityId: string | null | undefined },
) {
  if (!params.parentEntityId) {
    return;
  }

  const parent = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.parentEntityId),
      eq(entities.orgId, params.orgId),
      eq(entities.status, "active"),
      isNull(entities.deletedAt),
    ),
    columns: { id: true },
  });

  if (!parent) {
    throw badRequest("Parent entity must be active");
  }
}

async function assertEntityParentUpdateAllowed(
  db: Database | TransactionDatabase,
  params: { orgId: string; entityId: string; parentEntityId: string | null | undefined },
) {
  if (params.parentEntityId === undefined || params.parentEntityId === null) {
    return;
  }

  if (params.parentEntityId === params.entityId) {
    throw badRequest("Entity cannot be its own parent");
  }

  await assertActiveParentEntity(db, params);

  const rows = await db.query.entities.findMany({
    where: and(eq(entities.orgId, params.orgId), isNull(entities.deletedAt)),
    columns: { id: true, parentEntityId: true },
  });
  const parentById = new Map(rows.map((row) => [row.id, row.parentEntityId]));
  const seen = new Set<string>();
  let cursor: string | null | undefined = params.parentEntityId;

  while (cursor) {
    if (cursor === params.entityId || seen.has(cursor)) {
      throw badRequest("Entity parent cannot create a cycle");
    }
    seen.add(cursor);
    cursor = parentById.get(cursor);
  }
}

export async function listEntities(
  db: Database,
  params: { orgId: string } & EntityListQueryParams,
) {
  return db.query.entities.findMany({
    where: params.includeArchived
      ? and(eq(entities.orgId, params.orgId), isNull(entities.deletedAt))
      : and(
          eq(entities.orgId, params.orgId),
          eq(entities.status, "active"),
          isNull(entities.deletedAt),
        ),
    orderBy: [asc(entities.name)],
  });
}

export async function createEntity(
  db: Database,
  params: { orgId: string; actorId: string } & CreateEntityParams,
) {
  return db.transaction(async (tx) => {
    await assertActiveParentEntity(tx, {
      orgId: params.orgId,
      parentEntityId: params.parentEntityId,
    });

    const [row] = await tx
      .insert(entities)
      .values({
        orgId: params.orgId,
        name: params.name,
        kind: params.kind,
        fiscalSponsorModel: params.fiscalSponsorModel,
        parentEntityId: params.parentEntityId,
        status: "active",
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create entity");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "entity",
      entityId: row.id,
      changes: {
        kind: params.kind,
        fiscalSponsorModel: params.fiscalSponsorModel,
        parentEntityId: params.parentEntityId,
      },
    });

    return row;
  });
}

export async function updateEntity(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    entityId: string;
    data: UpdateEntityParams;
  },
) {
  if (params.data.status !== undefined) {
    throw badRequest("Use dedicated entity status endpoints to change status");
  }

  return db.transaction(async (tx) => {
    await assertEntityParentUpdateAllowed(tx, {
      orgId: params.orgId,
      entityId: params.entityId,
      parentEntityId: params.data.parentEntityId,
    });

    const [row] = await tx
      .update(entities)
      .set({ ...params.data, updatedAt: new Date() })
      .where(
        and(
          eq(entities.id, params.entityId),
          eq(entities.orgId, params.orgId),
          isNull(entities.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Entity not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "entity",
      entityId: params.entityId,
      changes: {
        changedFields: Object.keys(params.data).sort(),
      },
    });

    return row;
  });
}

export async function archiveEntity(
  db: Database,
  params: { orgId: string; actorId: string; entityId: string },
) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: { defaultEntityId: true },
  });

  if (org?.defaultEntityId === params.entityId) {
    throw badRequest("The default entity cannot be archived");
  }

  const activeEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.orgId, params.orgId),
      eq(entities.status, "active"),
      isNull(entities.deletedAt),
    ),
    columns: { id: true },
  });

  if (activeEntities.length <= 1) {
    throw badRequest("At least one active entity is required");
  }

  const activeChildren = await db.query.entities.findMany({
    where: and(
      eq(entities.orgId, params.orgId),
      eq(entities.parentEntityId, params.entityId),
      eq(entities.status, "active"),
      isNull(entities.deletedAt),
    ),
    columns: { id: true },
  });

  if (activeChildren.length > 0) {
    throw badRequest("Archive child entities first");
  }

  await assertRemainingEntityAdmin(db, {
    orgId: params.orgId,
    entityId: params.entityId,
  });

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(entities)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(entities.id, params.entityId),
          eq(entities.orgId, params.orgId),
          eq(entities.status, "active"),
          isNull(entities.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Entity not found");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "archived",
      entityType: "entity",
      entityId: params.entityId,
      changes: { status: "archived" },
    });

    return row;
  });
}
