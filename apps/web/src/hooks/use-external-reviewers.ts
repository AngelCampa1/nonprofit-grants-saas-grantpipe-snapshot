import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXTERNAL_REVIEW_SCOPE_TYPES,
  EVIDENCE_BUNDLE_PURPOSES,
  REVIEWER_TYPES,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { isApiErrorStatus } from "../lib/api-errors";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";

type ExternalReviewScopeType = (typeof EXTERNAL_REVIEW_SCOPE_TYPES)[number];
type EvidenceBundlePurpose = (typeof EVIDENCE_BUNDLE_PURPOSES)[number];
type ReviewerType = (typeof REVIEWER_TYPES)[number];

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const reviewerKeys = {
  all: ["external-reviewers"] as const,
  list: (params?: Record<string, unknown>) => [...reviewerKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...reviewerKeys.all, "detail", id] as const,
};

const sessionKeys = {
  all: ["reviewer-sessions"] as const,
  list: (params?: Record<string, unknown>) => [...sessionKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...sessionKeys.all, "detail", id] as const,
  scopes: (id: string) => [...sessionKeys.all, "scopes", id] as const,
};

const bundleKeys = {
  all: ["evidence-bundles"] as const,
  list: (params?: Record<string, unknown>) => [...bundleKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...bundleKeys.all, "detail", id] as const,
};

const auditEventKeys = {
  all: ["reviewer-audit-events"] as const,
  list: (params?: Record<string, unknown>) =>
    [...auditEventKeys.all, "list", params ?? {}] as const,
};

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

type QueryOptions = {
  enabled?: boolean;
};

const expectedPlanGateRetry = (failureCount: number, error: unknown) => {
  if (isApiErrorStatus(error, 402)) {
    return false;
  }

  return failureCount < 1;
};

function getDurationBucket(durationMs: number): string {
  const days = durationMs / 86_400_000;
  if (days < 1) return "under_1_day";
  if (days <= 7) return "1-7_days";
  if (days <= 30) return "8-30_days";
  return "30+_days";
}

function getCountBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "50+";
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return /required|invalid|missing|validation/i.test(error.message)
    ? "validation_error"
    : "request_error";
}

function trackExternalReviewOperationFailure(operation: string) {
  return (error: unknown) => {
    captureEvent("external_review_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
  };
}

// ---------------------------------------------------------------------------
// Reviewers
// ---------------------------------------------------------------------------

export function useReviewers(
  params?: { reviewerType?: string; search?: string },
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: reviewerKeys.list(params),
    enabled: options?.enabled,
    retry: expectedPlanGateRetry,
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.reviewerType) query.reviewerType = params.reviewerType;
      if (params?.search) query.search = params.search;
      const response = await api.api["external-reviewers"].reviewers.$get({
        query,
      });
      return readResponseOrThrow<unknown>(response);
    },
  });
}

export function useReviewerMutations() {
  const queryClient = useQueryClient();

  const createReviewer = useMutation({
    mutationFn: async (data: {
      email: string;
      name: string;
      reviewerType: ReviewerType;
      organizationName?: string;
      notes?: string | null;
    }) => {
      const response = await api.api["external-reviewers"].reviewers.$post({
        json: data,
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: reviewerKeys.all });
      captureEvent("external_reviewer_created", {
        reviewer_type: variables.reviewerType,
        has_organization: Boolean(variables.organizationName),
      });
    },
    onError: trackExternalReviewOperationFailure("create_reviewer"),
  });

  const updateReviewer = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        email?: string;
        name?: string;
        reviewerType?: ReviewerType;
        organizationName?: string;
        notes?: string | null;
      };
    }) => {
      const response = await api.api["external-reviewers"].reviewers[":id"].$patch({
        param: { id },
        json: data,
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: reviewerKeys.all });
      void queryClient.invalidateQueries({ queryKey: reviewerKeys.detail(variables.id) });
      captureEvent("external_reviewer_updated", {
        reviewer_type_changed: Boolean(variables.data.reviewerType),
      });
    },
    onError: trackExternalReviewOperationFailure("update_reviewer"),
  });

  const deleteReviewer = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api["external-reviewers"].reviewers[":id"].$delete({
        param: { id },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewerKeys.all });
      captureEvent("external_reviewer_deleted");
    },
    onError: trackExternalReviewOperationFailure("delete_reviewer"),
  });

  return { createReviewer, updateReviewer, deleteReviewer, getErrorMessage };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function useSessions(
  params?: {
    reviewerId?: string;
    includeExpired?: boolean;
    includeRevoked?: boolean;
  },
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: sessionKeys.list(params),
    enabled: options?.enabled,
    retry: expectedPlanGateRetry,
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.reviewerId) query.reviewerId = params.reviewerId;
      if (params?.includeExpired) query.includeExpired = "true";
      if (params?.includeRevoked) query.includeRevoked = "true";
      const response = await api.api["external-reviewers"].sessions.$get({ query });
      return readResponseOrThrow<unknown>(response);
    },
  });
}

export function useSessionMutations() {
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: async (data: {
      reviewerId: string;
      purpose: string;
      ttlMs?: number;
      scopes?: Array<{ scopeType: ExternalReviewScopeType; scopeId: string }>;
    }) => {
      const response = await api.api["external-reviewers"].sessions.$post({ json: data });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      captureEvent("reviewer_session_created", {
        scope_count_bucket: getCountBucket(variables.scopes?.length ?? 0),
        has_ttl: typeof variables.ttlMs === "number",
      });
    },
    onError: trackExternalReviewOperationFailure("create_session"),
  });

  const revokeSession = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api["external-reviewers"].sessions[":id"].revoke.$post({
        param: { id },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      captureEvent("reviewer_session_revoked");
    },
    onError: trackExternalReviewOperationFailure("revoke_session"),
  });

  const extendSession = useMutation({
    mutationFn: async ({ id, extensionMs }: { id: string; extensionMs: number }) => {
      const response = await api.api["external-reviewers"].sessions[":id"].extend.$post({
        param: { id },
        json: { extensionMs },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      captureEvent("reviewer_session_extended", {
        extension_bucket: getDurationBucket(variables.extensionMs),
      });
    },
    onError: trackExternalReviewOperationFailure("extend_session"),
  });

  return { createSession, revokeSession, extendSession, getErrorMessage };
}

// ---------------------------------------------------------------------------
// Evidence bundles
// ---------------------------------------------------------------------------

export function useBundles(
  params?: { purpose?: string; page?: number; pageSize?: number },
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: bundleKeys.list(params),
    enabled: options?.enabled,
    retry: expectedPlanGateRetry,
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.purpose) query.purpose = params.purpose;
      if (params?.page !== undefined) query.page = String(params.page);
      if (params?.pageSize !== undefined) query.pageSize = String(params.pageSize);
      const response = await api.api["external-reviewers"].bundles.$get({ query });
      return readResponseOrThrow<unknown>(response);
    },
  });
}

export function useBundle(id: string) {
  return useQuery({
    queryKey: bundleKeys.detail(id),
    queryFn: async () => {
      const response = await api.api["external-reviewers"].bundles[":id"].$get({
        param: { id },
      });
      return readResponseOrThrow<unknown>(response);
    },
  });
}

export function useBundleMutations() {
  const queryClient = useQueryClient();

  const createBundle = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      purpose: EvidenceBundlePurpose;
      periodStart?: string;
      periodEnd?: string;
    }) => {
      const response = await api.api["external-reviewers"].bundles.$post({ json: data });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.all });
      captureEvent("evidence_bundle_created", {
        purpose: variables.purpose,
        has_period: Boolean(variables.periodStart || variables.periodEnd),
      });
    },
    onError: trackExternalReviewOperationFailure("create_bundle"),
  });

  const updateBundle = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        description?: string;
        purpose?: EvidenceBundlePurpose;
        periodStart?: string;
        periodEnd?: string;
      };
    }) => {
      const response = await api.api["external-reviewers"].bundles[":id"].$patch({
        param: { id },
        json: data,
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.all });
      void queryClient.invalidateQueries({ queryKey: bundleKeys.detail(variables.id) });
      captureEvent("evidence_bundle_updated", {
        purpose_changed: Boolean(variables.data.purpose),
      });
    },
    onError: trackExternalReviewOperationFailure("update_bundle"),
  });

  const deleteBundle = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api["external-reviewers"].bundles[":id"].$delete({
        param: { id },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.all });
      captureEvent("evidence_bundle_deleted");
    },
    onError: trackExternalReviewOperationFailure("delete_bundle"),
  });

  const publishBundle = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api["external-reviewers"].bundles[":id"].publish.$post({
        param: { id },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.all });
      void queryClient.invalidateQueries({ queryKey: bundleKeys.detail(id) });
      captureEvent("evidence_bundle_published");
    },
    onError: trackExternalReviewOperationFailure("publish_bundle"),
  });

  const addBundleItem = useMutation({
    mutationFn: async ({
      bundleId,
      data,
    }: {
      bundleId: string;
      data: {
        itemType: ExternalReviewScopeType;
        itemId: string;
        caption?: string;
        sortOrder?: number;
      };
    }) => {
      const response = await api.api["external-reviewers"].bundles[":id"].items.$post({
        param: { id: bundleId },
        json: data,
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.detail(variables.bundleId) });
      captureEvent("evidence_bundle_item_added", {
        item_type: variables.data.itemType,
      });
    },
    onError: trackExternalReviewOperationFailure("add_bundle_item"),
  });

  const removeBundleItem = useMutation({
    mutationFn: async ({ bundleId, itemId }: { bundleId: string; itemId: string }) => {
      const response = await api.api["external-reviewers"].bundles[":id"].items[":itemId"].$delete({
        param: { id: bundleId, itemId },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.detail(variables.bundleId) });
      captureEvent("evidence_bundle_item_removed");
    },
    onError: trackExternalReviewOperationFailure("remove_bundle_item"),
  });

  const reorderBundleItems = useMutation({
    mutationFn: async ({ bundleId, itemIds }: { bundleId: string; itemIds: string[] }) => {
      const response = await api.api["external-reviewers"].bundles[":id"].reorder.$post({
        param: { id: bundleId },
        json: { itemIds },
      });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: bundleKeys.detail(variables.bundleId) });
      captureEvent("evidence_bundle_items_reordered", {
        item_count_bucket: getCountBucket(variables.itemIds.length),
      });
    },
    onError: trackExternalReviewOperationFailure("reorder_bundle_items"),
  });

  return {
    createBundle,
    updateBundle,
    deleteBundle,
    publishBundle,
    addBundleItem,
    removeBundleItem,
    reorderBundleItems,
    getErrorMessage,
  };
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export function useAuditEvents(
  params?: {
    sessionId?: string;
    reviewerId?: string;
    eventType?: string;
  },
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: auditEventKeys.list(params),
    enabled: options?.enabled,
    retry: expectedPlanGateRetry,
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.sessionId) query.sessionId = params.sessionId;
      if (params?.reviewerId) query.reviewerId = params.reviewerId;
      if (params?.eventType) query.eventType = params.eventType;
      const response = await api.api["external-reviewers"]["audit-events"].$get({ query });
      return readResponseOrThrow<unknown>(response);
    },
  });
}

// ---------------------------------------------------------------------------
// Quick share
// ---------------------------------------------------------------------------

export function useQuickShare() {
  const queryClient = useQueryClient();

  const quickShare = useMutation({
    mutationFn: async (data: {
      reviewerId: string;
      purpose: string;
      ttlMs?: number;
      scopeType: ExternalReviewScopeType;
      scopeId: string;
      bundleId?: string;
      bundleTitle?: string;
    }) => {
      const response = await api.api["external-reviewers"]["quick-share"].$post({ json: data });
      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: bundleKeys.all });
      captureEvent("quick_share_created", {
        scope_type: variables.scopeType,
        has_bundle: Boolean(variables.bundleId),
        has_ttl: typeof variables.ttlMs === "number",
      });
    },
    onError: trackExternalReviewOperationFailure("create_quick_share"),
  });

  return { quickShare, getErrorMessage };
}
