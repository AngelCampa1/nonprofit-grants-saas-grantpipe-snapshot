import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { eq, isNull, and, desc } from "drizzle-orm";
import { orgMembers } from "@grantpipe/db";
import {
  ANALYTICS_EVENTS,
  billingCheckoutSchema,
  billingSelectionSchema,
  billingPortalSchema,
  createEntitySchema,
  createCustomFieldDefinitionSchema,
  createInviteSchema,
  debugInspectionListSchema,
  orgTeamListSchema,
  entityAccessSchema,
  entityListQuerySchema,
  updateEntityAccessSchema,
  upsertCustomFieldValueSchema,
  updateEntitySchema,
  updateOrgMemberSchema,
  updateOrgProfileSchema,
  updateCustomFieldDefinitionSchema,
  updateOrgSettingsSchema,
  CUSTOM_FIELD_ENTITY_TYPES,
  type FeatureArea,
  type PermissionOverrides,
  type PermissionLevel,
  type Role,
  resolveEffectivePermissions,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";
import { AppError } from "../../lib/app-error";
import { listEntityAccessForOrgMember, toOrgMembershipEntityAccess } from "../../lib/entity-access";
import {
  createCustomFieldDefinition,
  createEntity,
  assignEntityAccess,
  archiveEntity,
  createBillingCheckoutSession,
  createBillingPortalSession,
  createInviteLink,
  getOrgBillingSummary,
  getOrgProfile,
  listDebugAnalyticsEvents,
  listDebugBillingEvents,
  listDebugEmails,
  listDebugErrorEvents,
  listDebugStorageObjects,
  listEntities,
  listCustomFieldDefinitions,
  listCustomFieldValues,
  listOrgMembers,
  saveBillingSelection,
  softDeleteCustomFieldDefinition,
  updateOrgMember,
  updateEntity,
  updateEntityAccess,
  updateOrgProfile,
  updateOrgSettings,
  updateCustomFieldDefinition,
  revokeEntityAccess,
  upsertCustomFieldValue,
} from "./service";
import { getTrialFeatureUsage } from "./trial-usage";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";

const CHECKOUT_ANALYTICS_TIMEOUT_MS = 1500;

function swallowCapture(promise: Promise<unknown> | undefined, timeoutMs?: number): Promise<void> {
  const safePromise = Promise.resolve(promise)
    .then(() => undefined)
    .catch((error: unknown) => {
      captureBackgroundException(error, "org", {
        step: "telemetry_capture",
      });
    });
  if (timeoutMs === undefined) return safePromise;

  return Promise.race([
    safePromise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

function checkoutAnalyticsPayload(
  orgId: string,
  data: { planTier: string; billingCycle: string; surface: string },
) {
  return {
    org_id: orgId,
    plan_tier: data.planTier,
    billing_cycle: data.billingCycle,
    billing_surface: data.surface,
  };
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

function hasPermission(
  role: AppEnv["Variables"]["memberRole"],
  permissions: AppEnv["Variables"]["memberPermissions"],
  feature: FeatureArea,
  minimum: PermissionLevel,
) {
  if (!role) return false;
  const effectivePermissions = resolveEffectivePermissions(role, permissions);
  return (
    PERMISSION_HIERARCHY[effectivePermissions[feature] ?? "none"] >= PERMISSION_HIERARCHY[minimum]
  );
}

function customFieldFeatureForEntity(entityType: string): FeatureArea | null {
  if (entityType === "contact" || entityType === "donation") return "donors";
  if (entityType === "grant") return "grants";
  return null;
}

function hasCustomFieldEntityPermission(
  c: Context<AppEnv>,
  entityType: string,
  minimum: PermissionLevel,
) {
  if (
    c.get("memberRole") === "auditor" &&
    (entityType === "contact" || entityType === "donation")
  ) {
    return false;
  }
  const feature = customFieldFeatureForEntity(entityType);
  if (!feature) return true;
  return hasPermission(c.get("memberRole"), c.get("memberPermissions"), feature, minimum);
}

function present(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function permissionOverrideKeys(permissions?: PermissionOverrides): string[] {
  if (!permissions) return [];
  return Object.entries(permissions)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
}

function profileChangedFields(data: {
  name: string;
  fiscalYearStartMonth: number;
  timezone: string;
  ein?: string | null;
  logoUrl?: string | null;
  address?: string | null;
}): string[] {
  return [
    "name",
    "fiscal_year_start_month",
    "timezone",
    ...(data.ein !== undefined ? ["ein"] : []),
    ...(data.logoUrl !== undefined ? ["logo_url"] : []),
    ...(data.address !== undefined ? ["address"] : []),
  ].sort();
}

function orgProfileAnalyticsPayload(
  actorId: string,
  data: {
    name: string;
    fiscalYearStartMonth: number;
    timezone: string;
    ein?: string | null;
    logoUrl?: string | null;
    address?: string | null;
  },
) {
  return {
    actorId,
    changed_fields: profileChangedFields(data),
    address_present: present(data.address),
    ein_present: present(data.ein),
    fiscal_year_start_month_changed: true,
    logo_present: present(data.logoUrl),
    timezone_changed: true,
  };
}

function inviteAnalyticsPayload(
  actorId: string,
  inviteId: string,
  data: {
    mode?: "email" | "shareable";
    email?: string;
    role: Role;
    permissions?: PermissionOverrides;
    entityId?: string;
  },
) {
  const overrideKeys = permissionOverrideKeys(data.permissions);
  return {
    actorId,
    inviteId,
    invite_mode: data.mode ?? "shareable",
    has_email_invite: present(data.email),
    has_permission_overrides: overrideKeys.length > 0,
    permission_override_keys: overrideKeys,
    target_role: data.role,
    ...(data.entityId ? { entity_scoped: true, entityId: data.entityId } : {}),
  };
}

function memberUpdateAnalyticsPayload(
  actorId: string,
  memberId: string,
  data: { role?: Role; active?: boolean; permissions?: PermissionOverrides },
) {
  const overrideKeys = permissionOverrideKeys(data.permissions);
  return {
    actorId,
    memberId,
    permissions_changed: data.permissions !== undefined,
    role_changed: data.role !== undefined,
    status_changed: data.active !== undefined,
    ...(data.active !== undefined ? { target_active: data.active } : {}),
    ...(overrideKeys.length > 0 ? { permission_override_keys: overrideKeys } : {}),
    ...(data.role ? { target_role: data.role } : {}),
  };
}

function entityAccessAnalyticsPayload(
  actorId: string,
  memberId: string,
  entityId: string,
  data: {
    role?: string;
    permissions?: Record<string, unknown>;
    action: "assigned" | "updated" | "revoked";
  },
) {
  return {
    actorId,
    memberId,
    entityId,
    action: data.action,
    role_changed: data.role !== undefined,
    permissions_changed: data.permissions !== undefined,
    ...(data.role ? { target_role: data.role } : {}),
    ...(data.permissions
      ? {
          permission_override_keys: Object.entries(data.permissions)
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key)
            .sort(),
        }
      : {}),
  };
}

function hasEntityTeamManagePermission(c: Context<AppEnv>, entityId: string): boolean {
  const activeEntityId = c.get("entityId");
  const entityPermissions = c.get("entityPermissions");
  if (!activeEntityId || activeEntityId !== entityId || !entityPermissions) {
    return false;
  }

  return (
    PERMISSION_HIERARCHY[entityPermissions.entityTeam ?? "none"] >= PERMISSION_HIERARCHY.manage
  );
}

async function denyUnlessEntityAccessManager(
  c: Context<AppEnv>,
  route: string,
  action: "assign" | "update" | "revoke",
  memberId: string,
  entityId: string,
) {
  const memberRole = c.get("memberRole");
  if (memberRole === "admin" || hasEntityTeamManagePermission(c, entityId)) {
    return null;
  }

  await captureEntityAccessMutationFailure(c, {
    route,
    action,
    memberId,
    entityId,
  });
  return c.json({ error: "Forbidden" }, 403);
}

function entityCreateAnalyticsPayload(
  actorId: string,
  entityId: string,
  data: {
    kind: string;
    fiscalSponsorModel: string;
    parentEntityId?: string | null;
  },
) {
  return {
    actorId,
    entityId,
    entity_kind: data.kind,
    fiscal_sponsor_model: data.fiscalSponsorModel,
    has_parent_entity: present(data.parentEntityId),
  };
}

function entityUpdateAnalyticsPayload(
  actorId: string,
  entityId: string,
  data: Record<string, unknown>,
) {
  return {
    actorId,
    entityId,
    changed_fields: Object.keys(data).sort(),
  };
}

function serializeEntity(
  row: Awaited<ReturnType<typeof listEntities>>[number],
  defaultEntityId: string | null,
) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    fiscalSponsorModel: row.fiscalSponsorModel,
    parentEntityId: row.parentEntityId,
    isDefault: row.id === defaultEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function captureEntityMutationFailure(
  c: Context<AppEnv>,
  params: { route: string; action: "create" | "update" | "archive"; entityId?: string },
) {
  await swallowCapture(
    getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).errors.capture({
      orgId: c.get("orgId")!,
      message: "Entity settings mutation failed",
      payload: {
        feature: "entity_settings",
        route: params.route,
        action: params.action,
        userId: c.get("user")!.id,
        ...(params.entityId ? { entityId: params.entityId } : {}),
      },
    }),
  );
}

async function captureEntityAccessMutationFailure(
  c: Context<AppEnv>,
  params: {
    route: string;
    action: "assign" | "update" | "revoke";
    memberId: string;
    entityId: string;
  },
) {
  await swallowCapture(
    getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).errors.capture({
      orgId: c.get("orgId")!,
      message: "Entity access mutation failed",
      payload: {
        feature: "entity_access",
        route: params.route,
        action: params.action,
        userId: c.get("user")!.id,
        memberId: params.memberId,
        entityId: params.entityId,
      },
    }),
  );
}

const requireCustomFieldDefinitionReadPermission = createMiddleware<AppEnv>(async (c, next) => {
  const entityType = c.req.query("entityType") ?? "";
  if (!hasCustomFieldEntityPermission(c, entityType, "view")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const requireCustomFieldValueReadPermission = createMiddleware<AppEnv>(async (c, next) => {
  const entityType = c.req.param("entityType") ?? "";
  if (!hasCustomFieldEntityPermission(c, entityType, "view")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const requireCustomFieldValueWritePermission = createMiddleware<AppEnv>(async (c, next) => {
  const entityType = c.req.param("entityType") ?? "";
  if (!hasCustomFieldEntityPermission(c, entityType, "edit")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const requireOrgProfileReadPermission = createMiddleware<AppEnv>(async (c, next) => {
  const role = c.get("memberRole");
  const permissions = c.get("memberPermissions");
  const canViewSettings = hasPermission(role, permissions, "settings", "view");
  const canViewAccounting = hasPermission(role, permissions, "accounting", "view");
  if (!canViewSettings && !canViewAccounting) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

export const orgRoutes = new Hono<AppEnv>()
  .get("/profile", requireOrgProfileReadPermission, async (c) => {
    const result = await getOrgProfile(c.get("db"), { orgId: c.get("orgId")! });
    return c.json(result);
  })
  .patch(
    "/profile",
    requireRole("admin"),
    zValidator("json", updateOrgProfileSchema),
    async (c) => {
      const data = c.req.valid("json");
      const result = await updateOrgProfile(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        data,
      });
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.orgProfileUpdated,
          payload: orgProfileAnalyticsPayload(c.get("user")!.id, data),
        }),
      );
      return c.json(result);
    },
  )
  .patch(
    "/settings",
    requireRole("admin"),
    zValidator("json", updateOrgSettingsSchema),
    async (c) => {
      const data = c.req.valid("json");
      await updateOrgSettings(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...data,
      });
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.orgProfileUpdated,
          payload: {
            actorId: c.get("user")!.id,
            ...(data.accountingEnabled !== undefined
              ? {
                  accounting_enabled: data.accountingEnabled,
                  changed_fields: ["accounting_enabled"],
                }
              : { changed_fields: [] }),
          },
        }),
      );
      if (data.accountingEnabled === true) {
        swallowCapture(
          analyticsForContext(c).capture({
            orgId: c.get("orgId")!,
            eventName: ANALYTICS_EVENTS.accountingEnabled,
            payload: { actorId: c.get("user")!.id },
          }),
        );
      }
      return c.json({ success: true });
    },
  )
  .get("/team", requireRole("admin"), zValidator("query", orgTeamListSchema), async (c) => {
    const result = await listOrgMembers(c.get("db"), {
      orgId: c.get("orgId")!,
      ...c.req.valid("query"),
    });
    return c.json(result);
  })
  .post("/invites", requireRole("admin"), zValidator("json", createInviteSchema), async (c) => {
    const payload = c.req.valid("json");
    const result = await createInviteLink(c.get("db"), {
      orgId: c.get("orgId")!,
      userId: c.get("user")!.id,
      mode: payload.mode,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
      entityId: payload.entityId,
    });
    swallowCapture(
      analyticsForContext(c).capture({
        orgId: c.get("orgId")!,
        eventName: ANALYTICS_EVENTS.inviteCreated,
        payload: inviteAnalyticsPayload(c.get("user")!.id, result.id, payload),
      }),
    );
    return c.json(result, 201);
  })
  .post("/team/:memberId/entity-access", zValidator("json", entityAccessSchema), async (c) => {
    const data = c.req.valid("json");
    const memberId = c.req.param("memberId")!;
    const denied = await denyUnlessEntityAccessManager(
      c,
      "POST /org/team/:memberId/entity-access",
      "assign",
      memberId,
      data.entityId,
    );
    if (denied) return denied;
    let result: Awaited<ReturnType<typeof assignEntityAccess>>;
    try {
      result = await assignEntityAccess(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        memberId,
        ...data,
      });
    } catch (error) {
      await captureEntityAccessMutationFailure(c, {
        route: "POST /org/team/:memberId/entity-access",
        action: "assign",
        memberId,
        entityId: data.entityId,
      });
      throw error;
    }
    swallowCapture(
      analyticsForContext(c).capture({
        orgId: c.get("orgId")!,
        eventName: ANALYTICS_EVENTS.orgMemberUpdated,
        payload: entityAccessAnalyticsPayload(c.get("user")!.id, memberId, data.entityId, {
          role: data.role,
          permissions: data.permissions,
          action: "assigned",
        }),
      }),
    );
    return c.json(result, 201);
  })
  .patch(
    "/team/:memberId/entity-access/:entityId",
    zValidator("json", updateEntityAccessSchema),
    async (c) => {
      const data = c.req.valid("json");
      const memberId = c.req.param("memberId")!;
      const entityId = c.req.param("entityId")!;
      const denied = await denyUnlessEntityAccessManager(
        c,
        "PATCH /org/team/:memberId/entity-access/:entityId",
        "update",
        memberId,
        entityId,
      );
      if (denied) return denied;
      let result: Awaited<ReturnType<typeof updateEntityAccess>>;
      try {
        result = await updateEntityAccess(c.get("db"), {
          orgId: c.get("orgId")!,
          actorId: c.get("user")!.id,
          memberId,
          entityId,
          data,
        });
      } catch (error) {
        await captureEntityAccessMutationFailure(c, {
          route: "PATCH /org/team/:memberId/entity-access/:entityId",
          action: "update",
          memberId,
          entityId,
        });
        throw error;
      }
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.orgMemberUpdated,
          payload: entityAccessAnalyticsPayload(c.get("user")!.id, memberId, entityId, {
            role: data.role,
            permissions: data.permissions,
            action: "updated",
          }),
        }),
      );
      return c.json(result);
    },
  )
  .delete("/team/:memberId/entity-access/:entityId", async (c) => {
    const memberId = c.req.param("memberId")!;
    const entityId = c.req.param("entityId")!;
    const denied = await denyUnlessEntityAccessManager(
      c,
      "DELETE /org/team/:memberId/entity-access/:entityId",
      "revoke",
      memberId,
      entityId,
    );
    if (denied) return denied;
    let result: Awaited<ReturnType<typeof revokeEntityAccess>>;
    try {
      result = await revokeEntityAccess(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        memberId,
        entityId,
      });
    } catch (error) {
      await captureEntityAccessMutationFailure(c, {
        route: "DELETE /org/team/:memberId/entity-access/:entityId",
        action: "revoke",
        memberId,
        entityId,
      });
      throw error;
    }
    swallowCapture(
      analyticsForContext(c).capture({
        orgId: c.get("orgId")!,
        eventName: ANALYTICS_EVENTS.orgMemberUpdated,
        payload: entityAccessAnalyticsPayload(c.get("user")!.id, memberId, entityId, {
          action: "revoked",
        }),
      }),
    );
    return c.json(result);
  })
  .patch(
    "/team/:memberId",
    requireRole("admin"),
    zValidator("json", updateOrgMemberSchema),
    async (c) => {
      const data = c.req.valid("json");
      const result = await updateOrgMember(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        memberId: c.req.param("memberId"),
        data,
      });
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.orgMemberUpdated,
          payload: memberUpdateAnalyticsPayload(c.get("user")!.id, c.req.param("memberId"), data),
        }),
      );
      return c.json(result);
    },
  )
  .get("/entities", requireRole("admin"), zValidator("query", entityListQuerySchema), async (c) => {
    const defaultEntityId = c.get("orgSubscription")?.defaultEntityId ?? null;
    const rows = await listEntities(c.get("db"), {
      orgId: c.get("orgId")!,
      ...c.req.valid("query"),
    });
    return c.json({
      defaultEntityId,
      data: rows.map((row) => serializeEntity(row, defaultEntityId)),
    });
  })
  .post("/entities", requireRole("admin"), zValidator("json", createEntitySchema), async (c) => {
    const data = c.req.valid("json");
    let result: Awaited<ReturnType<typeof createEntity>>;
    try {
      result = await createEntity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...data,
      });
    } catch (error) {
      await captureEntityMutationFailure(c, {
        route: "POST /org/entities",
        action: "create",
      });
      throw error;
    }
    swallowCapture(
      analyticsForContext(c).capture({
        orgId: c.get("orgId")!,
        eventName: ANALYTICS_EVENTS.entityCreated,
        payload: entityCreateAnalyticsPayload(c.get("user")!.id, result.id, data),
      }),
    );
    return c.json(serializeEntity(result, c.get("orgSubscription")?.defaultEntityId ?? null), 201);
  })
  .patch(
    "/entities/:entityId",
    requireRole("admin"),
    zValidator("json", updateEntitySchema),
    async (c) => {
      const data = c.req.valid("json");
      const entityId = c.req.param("entityId");
      let result: Awaited<ReturnType<typeof updateEntity>>;
      try {
        result = await updateEntity(c.get("db"), {
          orgId: c.get("orgId")!,
          actorId: c.get("user")!.id,
          entityId,
          data,
        });
      } catch (error) {
        await captureEntityMutationFailure(c, {
          route: "PATCH /org/entities/:entityId",
          action: "update",
          entityId,
        });
        throw error;
      }
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.entityUpdated,
          payload: entityUpdateAnalyticsPayload(c.get("user")!.id, entityId, data),
        }),
      );
      return c.json(serializeEntity(result, c.get("orgSubscription")?.defaultEntityId ?? null));
    },
  )
  .post("/entities/:entityId/archive", requireRole("admin"), async (c) => {
    const entityId = c.req.param("entityId");
    let result: Awaited<ReturnType<typeof archiveEntity>>;
    try {
      result = await archiveEntity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        entityId,
      });
    } catch (error) {
      await captureEntityMutationFailure(c, {
        route: "POST /org/entities/:entityId/archive",
        action: "archive",
        entityId,
      });
      throw error;
    }
    swallowCapture(
      analyticsForContext(c).capture({
        orgId: c.get("orgId")!,
        eventName: ANALYTICS_EVENTS.entityArchived,
        payload: {
          actorId: c.get("user")!.id,
          entityId,
        },
      }),
    );
    return c.json(serializeEntity(result, c.get("orgSubscription")?.defaultEntityId ?? null));
  })
  .get("/billing", requireRole("admin"), async (c) => {
    const result = await getOrgBillingSummary(c.get("db"), c.env, { orgId: c.get("orgId")! });
    return c.json(result);
  })
  .post(
    "/billing/checkout",
    requireRole("admin"),
    zValidator("json", billingCheckoutSchema),
    async (c) => {
      const data = c.req.valid("json");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const analyticsData = data as typeof data & {
        surface: "settings" | "paywall" | "feature_gate";
      };
      let result: Awaited<ReturnType<typeof createBillingCheckoutSession>>;
      try {
        result = await createBillingCheckoutSession(c.get("db"), c.env, {
          orgId,
          userId,
          data,
        });
      } catch (error) {
        await swallowCapture(
          analyticsForContext(c).capture({
            orgId,
            eventName: ANALYTICS_EVENTS.checkoutStartFailed,
            payload: {
              ...checkoutAnalyticsPayload(orgId, analyticsData),
              failure_type: "checkout_session_creation_failed",
            },
          }),
          CHECKOUT_ANALYTICS_TIMEOUT_MS,
        );
        await swallowCapture(
          getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).errors.capture({
            orgId,
            message: "Billing checkout session creation failed",
            payload: {
              feature: "billing",
              operation: "checkout_start",
              userId,
              ...checkoutAnalyticsPayload(orgId, analyticsData),
            },
          }),
          CHECKOUT_ANALYTICS_TIMEOUT_MS,
        );
        if (
          error instanceof AppError &&
          error.status === 503 &&
          error.errorCode === "billing_unavailable"
        ) {
          captureBackgroundException(error, "billing", {
            step: "checkout_unavailable",
          });
          return c.json({ error: error.message, errorCode: error.errorCode }, 503);
        }
        throw error;
      }
      await swallowCapture(
        analyticsForContext(c).capture({
          orgId,
          eventName: ANALYTICS_EVENTS.checkoutStarted,
          payload: checkoutAnalyticsPayload(orgId, analyticsData),
        }),
        CHECKOUT_ANALYTICS_TIMEOUT_MS,
      );
      return c.json(result);
    },
  )
  .patch(
    "/billing/selection",
    requireRole("admin"),
    zValidator("json", billingSelectionSchema),
    async (c) => {
      const result = await saveBillingSelection(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        data: c.req.valid("json"),
      });
      swallowCapture(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.billingSelectionSaved,
          payload: {
            actorId: c.get("user")!.id,
            planTier: result.planTier,
            billingCycle: result.billingCycle,
          },
        }),
      );
      return c.json(result);
    },
  )
  .post(
    "/billing/portal",
    requireRole("admin"),
    zValidator("json", billingPortalSchema),
    async (c) => {
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      let result: Awaited<ReturnType<typeof createBillingPortalSession>>;
      try {
        result = await createBillingPortalSession(c.get("db"), c.env, {
          orgId,
          userId,
          data: c.req.valid("json"),
        });
      } catch (error) {
        await swallowCapture(
          getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).errors.capture({
            orgId,
            message: "Billing portal session creation failed",
            payload: {
              feature: "billing",
              operation: "portal_start",
              userId,
            },
          }),
          CHECKOUT_ANALYTICS_TIMEOUT_MS,
        );
        if (
          error instanceof AppError &&
          error.status === 503 &&
          error.errorCode === "billing_unavailable"
        ) {
          captureBackgroundException(error, "billing", {
            step: "portal_unavailable",
          });
          return c.json({ error: error.message, errorCode: error.errorCode }, 503);
        }
        throw error;
      }
      swallowCapture(
        analyticsForContext(c).capture({
          orgId,
          eventName: ANALYTICS_EVENTS.billingPortalOpened,
          payload: { actorId: userId },
        }),
      );
      return c.json(result);
    },
  )
  .get(
    "/debug/emails",
    requireRole("admin"),
    zValidator("query", debugInspectionListSchema),
    async (c) => {
      const result = await listDebugEmails(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/debug/storage",
    requireRole("admin"),
    zValidator("query", debugInspectionListSchema),
    async (c) => {
      const result = await listDebugStorageObjects(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/debug/billing",
    requireRole("admin"),
    zValidator("query", debugInspectionListSchema),
    async (c) => {
      const result = await listDebugBillingEvents(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/debug/analytics",
    requireRole("admin"),
    zValidator("query", debugInspectionListSchema),
    async (c) => {
      const result = await listDebugAnalyticsEvents(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/debug/errors",
    requireRole("admin"),
    zValidator("query", debugInspectionListSchema),
    async (c) => {
      const result = await listDebugErrorEvents(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get("/custom-fields", requireCustomFieldDefinitionReadPermission, async (c) => {
    const entityType = c.req.query("entityType");
    if (!entityType || !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType as never)) {
      return c.json({ error: "Invalid entityType" }, 400);
    }

    const result = await listCustomFieldDefinitions(c.get("db"), {
      orgId: c.get("orgId")!,
      entityType: entityType as (typeof CUSTOM_FIELD_ENTITY_TYPES)[number],
    });
    return c.json(result);
  })
  .get(
    "/custom-fields/:entityType/:entityId/values",
    requireCustomFieldValueReadPermission,
    async (c) => {
      const params = c.req.param();
      if (!CUSTOM_FIELD_ENTITY_TYPES.includes(params.entityType as never)) {
        return c.json({ error: "Invalid entityType" }, 400);
      }

      const result = await listCustomFieldValues(c.get("db"), {
        orgId: c.get("orgId")!,
        entityType: params.entityType as (typeof CUSTOM_FIELD_ENTITY_TYPES)[number],
        entityId: params.entityId,
      });
      return c.json(result);
    },
  )
  .post(
    "/custom-fields",
    requireRole("admin"),
    zValidator("json", createCustomFieldDefinitionSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const payload = c.req.valid("json");
      const result = await createCustomFieldDefinition(db, {
        orgId,
        actorId: userId,
        ...payload,
      });
      return c.json(result, 201);
    },
  )
  .patch(
    "/custom-fields/:definitionId",
    requireRole("admin"),
    zValidator("json", updateCustomFieldDefinitionSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const definitionId = c.req.param("definitionId");
      const payload = c.req.valid("json");
      const result = await updateCustomFieldDefinition(db, {
        orgId,
        actorId: userId,
        definitionId,
        data: payload,
      });
      return c.json(result);
    },
  )
  .delete("/custom-fields/:definitionId", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const userId = c.get("user")!.id;
    const definitionId = c.req.param("definitionId");
    await softDeleteCustomFieldDefinition(db, {
      orgId,
      actorId: userId,
      definitionId,
    });
    return c.body(null, 204);
  })
  .put(
    "/custom-fields/:entityType/:entityId/values/:fieldId",
    requireCustomFieldValueWritePermission,
    zValidator("json", upsertCustomFieldValueSchema),
    async (c) => {
      const params = c.req.param();
      if (!CUSTOM_FIELD_ENTITY_TYPES.includes(params.entityType as never)) {
        return c.json({ error: "Invalid entityType" }, 400);
      }
      const body = c.req.valid("json");
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const result = await upsertCustomFieldValue(db, {
        orgId,
        actorId: userId,
        entityType: params.entityType as (typeof CUSTOM_FIELD_ENTITY_TYPES)[number],
        fieldId: params.fieldId,
        entityId: params.entityId,
        value: body.value,
      });
      return c.json(result);
    },
  )
  // GET /org/trial-feature-usage — return the highest gated tier touched by
  // feature usage and the gated features used. The billing UI uses this for
  // downgrade warnings when a trialing org chooses or changes a plan. Any
  // authenticated org member may call this; no role gate beyond org membership.
  .get("/trial-feature-usage", requireRole("viewer"), async (c) => {
    const result = await getTrialFeatureUsage(c.get("db"), c.get("orgId")!);
    return c.json(result);
  })
  // GET /org/memberships — list all orgs the current user belongs to.
  // Used by the web UI org switcher to enumerate available organizations.
  .get("/memberships", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const userId = c.get("user")!.id;
    const activeOrgId = c.get("orgId");
    const defaultEntityId = c.get("orgSubscription")?.defaultEntityId ?? null;

    const memberships = await db.query.orgMembers.findMany({
      where: and(eq(orgMembers.userId, userId), isNull(orgMembers.deletedAt)),
      with: {
        organization: {
          columns: { id: true, name: true },
        },
      },
      orderBy: [desc(orgMembers.joinedAt)],
    });
    const activeMembership = activeOrgId
      ? memberships.find((membership) => membership.orgId === activeOrgId)
      : undefined;
    const activeEntityAccess =
      activeOrgId && activeMembership?.id
        ? toOrgMembershipEntityAccess(
            await listEntityAccessForOrgMember(db, {
              orgId: activeOrgId,
              orgMemberId: activeMembership.id,
              defaultEntityId,
            }),
          )
        : [];

    return c.json({
      data: memberships.map((m) => ({
        orgId: m.orgId,
        orgName: m.organization.name,
        role: m.role,
        entityAccess: m.orgId === activeOrgId ? activeEntityAccess : [],
      })),
    });
  });
