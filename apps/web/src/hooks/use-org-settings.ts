import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  ANALYTICS_EVENTS,
  type BillingCycle,
  type CreateEntityInput,
  type EntityAccessInput,
  type EntityKind,
  type EntityPermissionMap,
  type EntityRole,
  type EntityStatus,
  type FiscalSponsorModel,
  type PermissionOverrides,
  type Role,
  type SelfServePlanTier,
  type UpdateEntityAccessInput,
  type UpdateEntityInput,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { ApiError } from "../lib/http-response";
import { invalidateOverview } from "../lib/overview-invalidation";
import { captureAppException } from "../lib/sentry";

type OrgProfile = {
  id: string;
  name: string;
  slug?: string;
  ein?: string | null;
  fiscalYearStartMonth: number;
  timezone: string;
  logoUrl?: string | null;
  address?: string | null;
  planTier?: string;
  onboardingCompleted?: boolean;
  accountingEnabled?: boolean;
};

type EntityAccessSummary = {
  entityId: string;
  entityName: string;
  kind?: EntityKind;
  status?: EntityStatus;
  fiscalSponsorModel?: FiscalSponsorModel;
  parentEntityId?: string | null;
  role: EntityRole;
  permissions: EntityPermissionMap;
};

type OrgMember = {
  id: string;
  role: Role;
  permissions?: PermissionOverrides | null;
  deletedAt?: string | null;
  entityAccess?: EntityAccessSummary[];
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

type BillingSummary = {
  customerId?: string | null;
  subscriptionId?: string | null;
  planTier: string;
  effectivePlanTier?: string | null;
  billingCycle?: "monthly" | "annual";
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  trialEndsAt?: string | null;
  promoCodeApplied?: string | null;
  checkoutUrl?: string | null;
  portalUrl?: string | null;
};

type AuthSessionContextCache = {
  planSelectionCompleted?: boolean;
  orgSubscription?: {
    subscriptionStatus?: string | null;
    trialEndsAt?: string | null;
    planTier?: string | null;
    effectivePlanTier?: string | null;
    onboardingCompleted?: boolean;
    planSelectedAt?: string | null;
    stripeSubscriptionId?: string | null;
  } | null;
};

export type OrgEntity = {
  id: string;
  name: string;
  kind: EntityKind;
  status: EntityStatus;
  fiscalSponsorModel: FiscalSponsorModel;
  parentEntityId: string | null;
  isDefault: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type OrgEntitiesResponse = {
  defaultEntityId: string | null;
  data: OrgEntity[];
};

type PaginatedDebugResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

const org = api.api.org;

async function readResponseOrThrow<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;

  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = undefined;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new ApiError(record.error, response.status);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new ApiError(record.message, response.status);
      }
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      throw new ApiError(payload, response.status);
    }

    throw new ApiError("Request failed", response.status);
  }

  if (payload === undefined) {
    throw new Error("Request returned no data");
  }

  return payload as T;
}

type QueryOptions = {
  enabled?: boolean;
};

type BillingPlanMutationData = {
  planTier: SelfServePlanTier;
  billingCycle?: BillingCycle;
  promoCode?: string;
  surface?: BillingCheckoutSurface;
};

export type BillingCheckoutSurface = "settings" | "paywall" | "feature_gate";

type OrgProfileMutationData = {
  name: string;
  fiscalYearStartMonth: number;
  timezone: string;
  ein?: string | null;
  logoUrl?: string | null;
  address?: string | null;
};

type InviteMutationData = {
  mode?: "email" | "shareable";
  email?: string;
  role: Role;
  permissions?: PermissionOverrides;
  entityId?: string;
};

type MemberUpdateMutationData = {
  role?: Role;
  active?: boolean;
  permissions?: PermissionOverrides;
};

type EntityAccessMutationData = EntityAccessInput;

type EntityAccessUpdateMutationData = UpdateEntityAccessInput;

function getBillingFailureType(error: unknown): string {
  return error instanceof ApiError ? "api_error" : "unknown_error";
}

function getBillingPlanAnalyticsProperties(data: BillingPlanMutationData) {
  return {
    plan_tier: data.planTier,
    billing_cycle: data.billingCycle ?? "unspecified",
    billing_surface: data.surface ?? "settings",
    promo_code_applied: Boolean(data.promoCode?.trim()),
  };
}

function countPermissionOverrides(permissions?: PermissionOverrides): number {
  if (!permissions) return 0;
  return Object.values(permissions).filter((value) => value !== undefined).length;
}

function hasTrimmedValue(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function getOrgProfileAnalyticsProperties(data: OrgProfileMutationData) {
  return {
    fiscal_year_start_month_changed: Number.isInteger(data.fiscalYearStartMonth),
    has_address: hasTrimmedValue(data.address),
    has_ein: hasTrimmedValue(data.ein),
    has_logo: hasTrimmedValue(data.logoUrl),
    timezone_changed: hasTrimmedValue(data.timezone),
  };
}

function getInviteAnalyticsProperties(data: InviteMutationData) {
  return {
    invite_mode: data.mode ?? "shareable",
    ...(data.entityId ? { entity_scoped: true } : {}),
    permission_override_count: countPermissionOverrides(data.permissions),
    role: data.role,
  };
}

function getMemberUpdateAction(data: MemberUpdateMutationData): string {
  if (data.active === false) return "deactivated";
  if (data.active === true) return "reactivated";
  if (data.role) return "role_changed";
  if (data.permissions) return "permissions_changed";
  return "member_updated";
}

function getMemberUpdateAnalyticsProperties(data: MemberUpdateMutationData) {
  return {
    action: getMemberUpdateAction(data),
    ...(data.active !== undefined ? { active: data.active } : {}),
    permission_override_count: countPermissionOverrides(data.permissions),
    ...(data.role ? { role: data.role } : {}),
  };
}

function countEntityPermissionOverrides(permissions?: Partial<EntityPermissionMap>): number {
  if (!permissions) return 0;
  return Object.values(permissions).filter((value) => value !== undefined).length;
}

function getEntityAccessAnalyticsProperties(
  action: "entity_access_assigned" | "entity_access_updated" | "entity_access_revoked",
  entityId: string,
  data?: EntityAccessUpdateMutationData,
) {
  return {
    action,
    entity_id: entityId,
    permission_override_count: countEntityPermissionOverrides(data?.permissions),
    ...(data?.role ? { role: data.role } : {}),
  };
}

export function useOrgProfile(options?: QueryOptions) {
  return useQuery({
    queryKey: ["org-profile"],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.profile.$get();
      return readResponseOrThrow<OrgProfile>(response);
    },
  });
}

export function useOrgTeam(options?: QueryOptions) {
  return useQuery({
    queryKey: ["org-team"],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.team.$get({ query: { includeInactive: "false" } });
      return readResponseOrThrow<OrgMember[]>(response);
    },
  });
}

export function useOrgBilling(options?: QueryOptions) {
  return useQuery({
    queryKey: ["org-billing"],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.billing.$get();
      return readResponseOrThrow<BillingSummary>(response);
    },
  });
}

function useDebugQuery(
  path: "emails" | "storage" | "billing" | "analytics" | "errors",
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: ["org-debug", path],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.debug[path].$get({
        query: { page: "1", pageSize: "25", sortOrder: "desc" },
      });
      return readResponseOrThrow<PaginatedDebugResponse<Record<string, unknown>>>(response);
    },
  });
}

export function useOrgDebugData(options?: QueryOptions) {
  return {
    emails: useDebugQuery("emails", options),
    storage: useDebugQuery("storage", options),
    billing: useDebugQuery("billing", options),
    analytics: useDebugQuery("analytics", options),
    errors: useDebugQuery("errors", options),
  };
}

type UserMembership = {
  orgId: string;
  orgName: string;
  role: string;
  entityAccess: Array<{
    entityId: string;
    entityName: string;
    kind: EntityKind;
    status: EntityStatus;
    fiscalSponsorModel: FiscalSponsorModel;
    parentEntityId: string | null;
    role: EntityRole;
    permissions: EntityPermissionMap;
  }>;
};

export function useUserMemberships(options?: QueryOptions) {
  return useQuery({
    queryKey: ["user-memberships"],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.memberships.$get();
      return readResponseOrThrow<{ data: UserMembership[] }>(response);
    },
  });
}

export function useOrgEntities(options?: QueryOptions & { includeArchived?: boolean }) {
  return useQuery({
    queryKey: ["org-entities", options?.includeArchived ?? false],
    enabled: options?.enabled,
    queryFn: async () => {
      const response = await org.entities.$get({
        query: { includeArchived: String(options?.includeArchived ?? false) as "true" | "false" },
      });
      return readResponseOrThrow<OrgEntitiesResponse>(response);
    },
  });
}

function captureEntityMutationError(
  error: unknown,
  params:
    | { operation: "create"; data: CreateEntityInput }
    | { operation: "update"; entityId: string; data: UpdateEntityInput }
    | { operation: "archive"; entityId: string },
) {
  const extra =
    params.operation === "create"
      ? {
          entity_kind: params.data.kind ?? "legal_entity",
          fiscal_sponsor_model: params.data.fiscalSponsorModel ?? "none",
          has_parent_entity: Boolean(params.data.parentEntityId),
        }
      : params.operation === "update"
        ? {
            entity_id: params.entityId,
            changed_fields: Object.keys(params.data).sort(),
          }
        : {
            entity_id: params.entityId,
          };

  captureAppException(
    error,
    {
      tags: {
        feature: "entity_settings",
        operation: params.operation,
      },
      extra,
    },
    { sanitize: true },
  );
}

export function useOrgSettingsMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["org-team"] });
    void queryClient.invalidateQueries({ queryKey: ["org-billing"] });
    void queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
    void queryClient.invalidateQueries({ queryKey: ["org-debug"] });
    // Editing the org profile can change fiscalYearStartMonth, which the dashboard
    // overview uses to compute this-FY / prior-FY donor metrics (current-FY giving,
    // new-donor count). Refresh the dashboard so those figures don't show the old
    // fiscal-year boundary after a profile save.
    invalidateOverview(queryClient);
  }

  function invalidateEntities() {
    void queryClient.invalidateQueries({ queryKey: ["org-entities"] });
    void queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
    void queryClient.invalidateQueries({ queryKey: ["user-memberships"] });
  }

  function invalidateEntityAccess() {
    void queryClient.invalidateQueries({ queryKey: ["org-team"] });
    void queryClient.invalidateQueries({ queryKey: ["org-entities"] });
    void queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
    void queryClient.invalidateQueries({ queryKey: ["user-memberships"] });
  }

  function patchPlanSelectionCache(data: {
    planTier: SelfServePlanTier;
    billingCycle?: BillingCycle;
  }) {
    const selectedAt = new Date().toISOString();
    queryClient.setQueryData<BillingSummary | undefined>(["org-billing"], (current) => {
      if (!current) return current;
      return {
        ...current,
        planTier: data.planTier,
        billingCycle: data.billingCycle ?? current.billingCycle,
      };
    });
    queryClient.setQueriesData<AuthSessionContextCache | undefined>(
      { queryKey: ["auth-session-context"] },
      (current) => {
        if (!current) return current;
        return {
          ...current,
          planSelectionCompleted: true,
          orgSubscription: {
            subscriptionStatus: current.orgSubscription?.subscriptionStatus ?? "trialing",
            trialEndsAt: current.orgSubscription?.trialEndsAt ?? null,
            onboardingCompleted: current.orgSubscription?.onboardingCompleted ?? false,
            stripeSubscriptionId: current.orgSubscription?.stripeSubscriptionId ?? null,
            ...current.orgSubscription,
            planTier: data.planTier,
            effectivePlanTier: current.orgSubscription?.effectivePlanTier ?? data.planTier,
            planSelectedAt: current.orgSubscription?.planSelectedAt ?? selectedAt,
          },
        };
      },
    );
  }

  const startCheckout = useBillingCheckoutMutation({ onSuccess: invalidate });

  return {
    updateProfile: useMutation({
      mutationFn: async (data: OrgProfileMutationData) => {
        const response = await org.profile.$patch({ json: data as never });
        return readResponseOrThrow<OrgProfile>(response);
      },
      onSuccess: (_profile, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.orgProfileUpdated,
          getOrgProfileAnalyticsProperties(variables),
        );
        invalidate();
      },
    }),
    createInvite: useMutation({
      mutationFn: async (data: InviteMutationData) => {
        const response = await org.invites.$post({ json: data });
        return readResponseOrThrow<{ id: string; token: string }>(response);
      },
      onSuccess: (_invite, variables) => {
        captureEvent(ANALYTICS_EVENTS.inviteCreated, getInviteAnalyticsProperties(variables));
        invalidate();
      },
    }),
    updateMember: useMutation({
      mutationFn: async (params: { memberId: string; data: MemberUpdateMutationData }) => {
        const response = await org.team[":memberId"].$patch({
          param: { memberId: params.memberId },
          json: params.data as never,
        });
        return readResponseOrThrow<OrgMember>(response);
      },
      onSuccess: (_member, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.orgMemberUpdated,
          getMemberUpdateAnalyticsProperties(variables.data),
        );
        invalidate();
      },
    }),
    assignEntityAccess: useMutation({
      mutationFn: async (params: { memberId: string; data: EntityAccessMutationData }) => {
        const response = await org.team[":memberId"]["entity-access"].$post({
          param: { memberId: params.memberId },
          json: params.data,
        });
        return readResponseOrThrow<EntityAccessSummary>(response);
      },
      onSuccess: (_entityAccess, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.orgMemberUpdated,
          getEntityAccessAnalyticsProperties(
            "entity_access_assigned",
            variables.data.entityId,
            variables.data,
          ),
        );
        invalidateEntityAccess();
      },
    }),
    updateEntityAccess: useMutation({
      mutationFn: async (params: {
        memberId: string;
        entityId: string;
        data: EntityAccessUpdateMutationData;
      }) => {
        const response = await org.team[":memberId"]["entity-access"][":entityId"].$patch({
          param: { memberId: params.memberId, entityId: params.entityId },
          json: params.data,
        });
        return readResponseOrThrow<EntityAccessSummary>(response);
      },
      onSuccess: (_entityAccess, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.orgMemberUpdated,
          getEntityAccessAnalyticsProperties(
            "entity_access_updated",
            variables.entityId,
            variables.data,
          ),
        );
        invalidateEntityAccess();
      },
    }),
    revokeEntityAccess: useMutation({
      mutationFn: async (params: { memberId: string; entityId: string }) => {
        const response = await org.team[":memberId"]["entity-access"][":entityId"].$delete({
          param: { memberId: params.memberId, entityId: params.entityId },
        });
        return readResponseOrThrow<EntityAccessSummary>(response);
      },
      onSuccess: (_entityAccess, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.orgMemberUpdated,
          getEntityAccessAnalyticsProperties("entity_access_revoked", variables.entityId),
        );
        invalidateEntityAccess();
      },
    }),
    createEntity: useMutation({
      mutationFn: async (data: CreateEntityInput) => {
        const response = await org.entities.$post({ json: data });
        return readResponseOrThrow<OrgEntity>(response);
      },
      onSuccess: (entity, variables) => {
        captureEvent(ANALYTICS_EVENTS.entityCreated, {
          entity_id: entity.id,
          entity_kind: variables.kind ?? "legal_entity",
          fiscal_sponsor_model: variables.fiscalSponsorModel ?? "none",
          has_parent_entity: Boolean(variables.parentEntityId),
        });
        invalidateEntities();
      },
      onError: (error, variables) => {
        captureEntityMutationError(error, { operation: "create", data: variables });
      },
    }),
    updateEntity: useMutation({
      mutationFn: async (params: { entityId: string; data: UpdateEntityInput }) => {
        const response = await org.entities[":entityId"].$patch({
          param: { entityId: params.entityId },
          json: params.data,
        });
        return readResponseOrThrow<OrgEntity>(response);
      },
      onSuccess: (_entity, variables) => {
        captureEvent(ANALYTICS_EVENTS.entityUpdated, {
          entity_id: variables.entityId,
          changed_fields: Object.keys(variables.data).sort(),
        });
        invalidateEntities();
      },
      onError: (error, variables) => {
        captureEntityMutationError(error, {
          operation: "update",
          entityId: variables.entityId,
          data: variables.data,
        });
      },
    }),
    archiveEntity: useMutation({
      mutationFn: async (params: { entityId: string }) => {
        const response = await org.entities[":entityId"].archive.$post({
          param: { entityId: params.entityId },
        });
        return readResponseOrThrow<OrgEntity>(response);
      },
      onSuccess: (_entity, variables) => {
        captureEvent(ANALYTICS_EVENTS.entityArchived, {
          entity_id: variables.entityId,
        });
        invalidateEntities();
      },
      onError: (error, variables) => {
        captureEntityMutationError(error, {
          operation: "archive",
          entityId: variables.entityId,
        });
      },
    }),
    startCheckout,
    saveBillingSelection: useMutation({
      mutationFn: async (data: BillingPlanMutationData) => {
        const analyticsProperties = getBillingPlanAnalyticsProperties(data);
        try {
          const response = await org.billing.selection.$patch({ json: data });
          const result = await readResponseOrThrow<OrgProfile>(response);
          captureEvent(ANALYTICS_EVENTS.planSelected, analyticsProperties);
          return result;
        } catch (error) {
          captureEvent("plan_selection_failed", {
            ...analyticsProperties,
            failure_type: getBillingFailureType(error),
          });
          throw error;
        }
      },
      onSuccess: (_profile, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.billingSelectionSaved,
          getBillingPlanAnalyticsProperties(variables),
        );
        patchPlanSelectionCache(variables);
        invalidate();
      },
    }),
    openPortal: useMutation({
      mutationFn: async (data: { returnPath: string }) => {
        try {
          const response = await org.billing.portal.$post({ json: data });
          const result = await readResponseOrThrow<{ sessionId?: string; url: string }>(response);
          captureEvent("billing_portal_opened", {
            return_path: data.returnPath,
            has_portal_url: result.url.trim().length > 0,
          });
          return result;
        } catch (error) {
          captureEvent("billing_portal_failed", {
            return_path: data.returnPath,
            failure_type: getBillingFailureType(error),
          });
          throw error;
        }
      },
      onSuccess: invalidate,
    }),
  };
}

export function useBillingCheckoutMutation(options: { onSuccess?: () => void } = {}) {
  const org = api.api.org;
  const checkoutAttemptRef = useRef<{ payloadKey: string; checkoutAttemptId: string } | undefined>(
    undefined,
  );

  return useMutation({
    mutationFn: async (data: BillingPlanMutationData) => {
      const analyticsProperties = getBillingPlanAnalyticsProperties(data);
      try {
        const payloadKey = JSON.stringify({
          planTier: data.planTier,
          billingCycle: data.billingCycle ?? null,
          promoCode: data.promoCode ?? null,
          surface: data.surface ?? null,
        });
        const checkoutAttemptId =
          checkoutAttemptRef.current?.payloadKey === payloadKey
            ? checkoutAttemptRef.current.checkoutAttemptId
            : crypto.randomUUID();
        checkoutAttemptRef.current = { payloadKey, checkoutAttemptId };
        const response = await org.billing.checkout.$post({
          json: { ...data, checkoutAttemptId },
        });
        const result = await readResponseOrThrow<{ sessionId?: string; url: string }>(response);
        if (checkoutAttemptRef.current?.checkoutAttemptId === checkoutAttemptId) {
          checkoutAttemptRef.current = undefined;
        }
        captureEvent(ANALYTICS_EVENTS.checkoutStarted, {
          ...analyticsProperties,
          has_checkout_url: result.url.trim().length > 0,
        });
        return result;
      } catch (error) {
        captureEvent(ANALYTICS_EVENTS.checkoutStartFailed, {
          ...analyticsProperties,
          failure_type: getBillingFailureType(error),
        });
        captureAppException(
          error,
          {
            tags: {
              feature: "billing",
              operation: "checkout_start",
              surface: data.surface ?? "settings",
            },
            extra: analyticsProperties,
          },
          { sanitize: true },
        );
        throw error;
      }
    },
    onSuccess: options.onSuccess,
  });
}
