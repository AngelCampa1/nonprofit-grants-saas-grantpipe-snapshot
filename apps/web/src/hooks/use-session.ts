import { useBetterAuthSession } from "../lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import {
  getEffectivePlanTier,
  type BillingLifecycleState,
  type EntityKind,
  type EntityPermissionMap,
  type EntityRole,
  type EntityStatus,
  type FiscalSponsorModel,
  type OnboardingGoal,
  type PermissionMap,
  type PlanTier,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";

type EntityScope = "entity" | "rollup";

type SessionEntityAccess = {
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

type AuthSessionContext = {
  orgId: string | null;
  memberRole: "admin" | "editor" | "viewer" | "auditor" | null;
  memberPermissions: PermissionMap | null;
  entityScope: EntityScope | null;
  entityRole: EntityRole | null;
  entityPermissions: EntityPermissionMap | null;
  activeEntity: SessionEntityAccess | null;
  availableEntities: SessionEntityAccess[];
  onboardingCompleted: boolean;
  planSelectionCompleted: boolean;
  onboardingGoal: OnboardingGoal | null;
  orgSubscription: {
    subscriptionStatus: string | null;
    billingLifecycleState: BillingLifecycleState;
    trialEndsAt: string | null;
    planTier: string | null;
    effectivePlanTier?: string | null;
    onboardingCompleted: boolean;
    planSelectedAt: string | null;
    stripeSubscriptionId: string | null;
  } | null;
};

export function useSession() {
  const { data, isPending, error, refetch } = useBetterAuthSession();
  const contextQuery = useQuery({
    queryKey: ["auth-session-context", data?.user?.id ?? null],
    enabled: data?.session != null,
    retry: 2,
    queryFn: async (): Promise<AuthSessionContext> => {
      const response = await api.api.auth.session.$get();
      if (!response.ok) {
        throw new Error(`Session context fetch failed: ${response.status.toString()}`);
      }
      const payload = (await response.json()) as Partial<AuthSessionContext>;
      return {
        orgId: payload.orgId ?? null,
        memberRole: payload.memberRole ?? null,
        memberPermissions: payload.memberPermissions ?? null,
        entityScope: payload.entityScope ?? null,
        entityRole: payload.entityRole ?? null,
        entityPermissions: payload.entityPermissions ?? null,
        activeEntity: payload.activeEntity ?? null,
        availableEntities: payload.availableEntities ?? [],
        onboardingCompleted: payload.onboardingCompleted ?? false,
        planSelectionCompleted: payload.planSelectionCompleted ?? false,
        onboardingGoal: payload.onboardingGoal ?? null,
        orgSubscription: payload.orgSubscription ?? null,
      };
    },
  });
  const hasLoadedContext = data?.session == null || contextQuery.isSuccess;
  const orgSubscription = contextQuery.data?.orgSubscription ?? null;
  const effectivePlanTier: PlanTier = getEffectivePlanTier({
    planTier: orgSubscription?.planTier ?? orgSubscription?.effectivePlanTier,
    subscriptionStatus: orgSubscription?.subscriptionStatus,
    trialEndsAt: orgSubscription?.trialEndsAt,
  });

  return {
    user: data?.user ?? null,
    session: data?.session ?? null,
    orgId: contextQuery.data?.orgId ?? null,
    memberRole: contextQuery.data?.memberRole ?? null,
    memberPermissions: contextQuery.data?.memberPermissions ?? null,
    entityScope: contextQuery.data?.entityScope ?? null,
    entityRole: contextQuery.data?.entityRole ?? null,
    entityPermissions: contextQuery.data?.entityPermissions ?? null,
    activeEntity: contextQuery.data?.activeEntity ?? null,
    availableEntities: contextQuery.data?.availableEntities ?? [],
    onboardingCompleted: contextQuery.data?.onboardingCompleted ?? false,
    planSelectionCompleted: contextQuery.data?.planSelectionCompleted ?? false,
    onboardingGoal: contextQuery.data?.onboardingGoal ?? null,
    orgSubscription,
    effectivePlanTier,
    hasLoadedContext,
    isLoading: isPending || (data?.session != null && contextQuery.isPending),
    error,
    refetchSession: refetch,
    contextError: contextQuery.isError ? contextQuery.error : null,
  };
}
