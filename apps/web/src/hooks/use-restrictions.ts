import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  CreateRestrictionAdditionInput,
  CreateRestrictionEvidenceLinkInput,
  CreateRestrictionReleaseInput,
  CreateRestrictionTermInput,
  RestrictedRollforwardExportInput,
  RestrictionAlertFilterParams,
  RestrictionTermListParams,
  UpdateRestrictionTermInput,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";
import { readResponseOrThrow } from "../lib/http-response";
import { createRetryAttemptRegistry } from "../lib/retry-attempt-registry";
import { ACTIVE_ENTITY_STORAGE_KEY } from "../lib/org-context";

const restrictions = api.api.restrictions;

export const restrictionKeys = {
  terms: (params: RestrictionTermListParams) => ["restrictions", "terms", params] as const,
  alerts: (params: RestrictionAlertFilterParams) => ["restrictions", "alerts", params] as const,
  reports: () => ["restrictions", "reports"] as const,
};

// Exported so the grants/expenses domain can reuse the canonical restriction key
// list rather than duplicating it: posting an expense against a restricted fund
// inserts (or reverses) a restriction-release row on the backend, the same data
// change every restriction-release mutation here already refreshes.
export function invalidateRestrictions(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["restrictions"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
}

function getAmountBucket(amountCents: number): string {
  const dollars = Math.abs(amountCents) / 100;
  if (dollars < 100) return "0-99";
  if (dollars < 1000) return "100-999";
  if (dollars < 10000) return "1000-9999";
  return "10000+";
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return /required|invalid|missing|validation/i.test(error.message)
    ? "validation_error"
    : "request_error";
}

function trackRestrictionOperationFailure(operation: string) {
  return (error: unknown) => {
    captureEvent("restriction_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
    // Surface the failure to the user with the same global toast every other domain uses.
    // Without this, restriction mutation errors were tracked but never shown.
    onMutationError(error);
  };
}

export function useRestrictionTerms(
  params: RestrictionTermListParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: restrictionKeys.terms(params),
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await restrictions.terms.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.donationId ? { donationId: params.donationId } : {}),
          ...(params.sourceDocumentId ? { sourceDocumentId: params.sourceDocumentId } : {}),
          ...(params.restrictionType ? { restrictionType: params.restrictionType } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateRestrictionTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRestrictionTermInput) => {
      const res = await restrictions.terms.$post({ json: data as never });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_term_created", {
        restriction_type: variables.restrictionType,
        source: variables.source,
        has_fund: Boolean(variables.fundId),
        has_grant: Boolean(variables.grantId),
        has_donation: Boolean(variables.donationId),
        has_source_document: Boolean(variables.sourceDocumentId),
        beginning_balance_bucket: getAmountBucket(variables.beginningBalanceCents ?? 0),
      });
    },
    onError: trackRestrictionOperationFailure("create_term"),
  });
}

export function useUpdateRestrictionTerm(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateRestrictionTermInput) => {
      const res = await restrictions.terms[":termId"].$patch({
        param: { termId },
        json: data as never,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_term_updated");
    },
    onError: trackRestrictionOperationFailure("update_term"),
  });
}

export function useDeleteRestrictionTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (termId: string) => {
      const res = await restrictions.terms[":termId"].$delete({ param: { termId } });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_term_deleted");
    },
    onError: trackRestrictionOperationFailure("delete_term"),
  });
}

export function useCreateRestrictionAddition(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRestrictionAdditionInput) => {
      const res = await restrictions.terms[":termId"].additions.$post({
        param: { termId },
        json: data as never,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_addition_created", {
        amount_bucket: getAmountBucket(variables.amountCents),
        has_donation: Boolean(variables.donationId),
        has_grant: Boolean(variables.grantId),
        has_journal_line: Boolean(variables.journalLineId),
      });
    },
    onError: trackRestrictionOperationFailure("create_addition"),
  });
}

export function useCreateRestrictionRelease(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRestrictionReleaseInput) => {
      const res = await restrictions.terms[":termId"].releases.$post({
        param: { termId },
        json: data as never,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_release_created", {
        amount_bucket: getAmountBucket(variables.amountCents),
        has_expense: Boolean(variables.expenseId),
        has_journal_line: Boolean(variables.journalLineId),
        has_program: Boolean(variables.program),
        has_category: Boolean(variables.category),
      });
    },
    onError: trackRestrictionOperationFailure("create_release"),
  });
}

export function useLinkRestrictionEvidence(releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRestrictionEvidenceLinkInput) => {
      const res = await restrictions.releases[":releaseId"].evidence.$post({
        param: { releaseId },
        json: data as never,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidateRestrictions(queryClient);
      captureEvent("restriction_evidence_linked", {
        evidence_type: variables.evidenceType,
        target_type: variables.documentId ? "document" : "generated_report",
      });
    },
    onError: trackRestrictionOperationFailure("link_evidence"),
  });
}

export function useRestrictionAlerts(
  params: RestrictionAlertFilterParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: restrictionKeys.alerts(params),
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await restrictions.alerts.$get({
        query: {
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.alertType ? { alertType: params.alertType } : {}),
          ...(params.periodStart ? { periodStart: params.periodStart } : {}),
          ...(params.periodEnd ? { periodEnd: params.periodEnd } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useGenerateRestrictedRollforward() {
  const queryClient = useQueryClient();
  const attemptsRef = useRef(createRetryAttemptRegistry());
  return useMutation({
    mutationFn: async (data: Omit<RestrictedRollforwardExportInput, "attemptId">) => {
      const activeEntityId =
        typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY);
      const payloadKey = JSON.stringify([
        activeEntityId,
        data.fundId ?? null,
        data.grantId ?? null,
        data.periodStart,
        data.periodEnd,
        data.includeEvidencePackage ?? false,
        data.title?.trim() || null,
      ]);
      const attemptId = attemptsRef.current.take(payloadKey);
      try {
        const res = await restrictions.reports.rollforward.$post({
          json: { ...data, attemptId } as never,
        });
        return await readResponseOrThrow<{ report: { id: string } }>(res);
      } catch (error) {
        attemptsRef.current.retain(payloadKey, attemptId);
        throw error;
      }
    },
    onSuccess: () => {
      invalidateRestrictions(queryClient);
    },
    onError: trackRestrictionOperationFailure("generate_rollforward"),
  });
}
