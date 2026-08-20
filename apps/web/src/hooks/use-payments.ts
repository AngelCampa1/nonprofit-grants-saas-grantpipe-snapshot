import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type UseQueryResult,
} from "@tanstack/react-query";
import { captureEvent } from "../lib/analytics";
import { api } from "../lib/api-client";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";
import { invalidateAccountingBalanceViews } from "./use-accounting";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type {
  CreatePaymentRequestInput,
  UpdatePaymentRequestInput,
  PaymentRequestStatusTransitionInput,
  CreatePaymentRequestLineInput,
  UpdatePaymentRequestLineInput,
  CreatePaymentRequestAdjustmentInput,
  RecordPaymentInput,
  PaymentRequestListParams,
  EligibleExpenseQueryParams,
  CreateIndirectCostRuleInput,
  UpdateIndirectCostRuleInput,
  UniformGuidanceGuardrailPreviewInput,
  UniformGuidanceGuardrailResult,
} from "@grantpipe/shared";

const payments = api.api.payments;

export type ReimbursementCashFlowRadar = {
  totals: {
    eligibleExpenseCents?: number;
    unrequestedExpenseCents?: number;
    submittedCents?: number;
    approvedOutstandingCents?: number;
    totalCashGapCents: number;
    criticalCount?: number;
    warningCount?: number;
  };
  worklist: Array<{
    grantId: string;
    grantName: string;
    grantStatus: string | null;
    unrequestedExpenseCents: number;
    submittedCents: number;
    approvedOutstandingCents: number;
    totalCashGapCents: number;
    riskLevel: "critical" | "warning" | "watch";
    recommendedAction: string;
  }>;
};

function getAmountBucket(amountCents: number): string {
  const dollars = Math.abs(amountCents) / 100;
  if (dollars < 100) return "0-99";
  if (dollars < 1000) return "100-999";
  if (dollars < 10000) return "1000-9999";
  return "10000+";
}

function invalidatePaymentRequests(
  queryClient: ReturnType<typeof useQueryClient>,
  requestId?: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
  if (requestId) {
    void queryClient.invalidateQueries({ queryKey: ["payment-request", requestId] });
  }
  // The per-grant payment summary (requested/paid/outstanding totals on the grant detail
  // page) is derived from payment requests but keyed by grantId, which these mutations don't
  // carry. Invalidate the whole prefix so any open grant summary refreshes after a change.
  void queryClient.invalidateQueries({ queryKey: ["grant-payment-summary"] });
}

// Recording or removing a grant payment posts (or reverses) a journal entry on the
// backend (postGrantPayment / reverseGrantPayment) when accounting is enabled, which
// shifts the trial balance, account ledger, and the three financial reports — and adds
// or reverses a row in the journal entries list. Refresh those views too, mirroring the
// journal-entry and recurring-template mutations, or the Accounting pages stay stale
// after a payment is recorded or removed.
function invalidatePaymentAccountingViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
  invalidateAccountingBalanceViews(queryClient);
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return /required|invalid|missing|validation/i.test(error.message)
    ? "validation_error"
    : "request_error";
}

function handlePaymentOperationError(operation: string) {
  return (error: unknown) => {
    captureEvent("payment_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
    onMutationError(error);
  };
}

export function usePaymentRequests(
  params: PaymentRequestListParams & { grantId?: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [
      "payment-requests",
      params.page,
      params.pageSize,
      params.status ?? "",
      params.type ?? "",
      params.grantId ?? "",
    ],
    queryFn: async () => {
      const query: Record<string, string> = {
        page: String(params.page),
        pageSize: String(params.pageSize),
      };
      if (params.status) query.status = params.status;
      if (params.type) query.type = params.type;
      if (params.grantId) query.grantId = params.grantId;
      const res = await payments.$get({ query });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export function useOutstandingSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["payment-requests", "outstanding-summary"],
    queryFn: async () => {
      const res = await payments["outstanding-summary"].$get();
      return readResponseOrThrow(res);
    },
    enabled: options?.enabled,
  });
}

export function useReimbursementCashFlowRadar(options?: {
  enabled?: boolean;
}): UseQueryResult<ReimbursementCashFlowRadar, Error> {
  return useQuery({
    queryKey: ["payment-requests", "cash-flow-radar"],
    queryFn: async () => {
      const res = await payments["cash-flow-radar"].$get();
      const radar = (await readResponseOrThrow(res)) as ReimbursementCashFlowRadar;
      captureEvent(ANALYTICS_EVENTS.reimbursementCashFlowRadarViewed, {
        total_gap_bucket: getAmountBucket(radar.totals.totalCashGapCents),
        work_item_count: radar.worklist.length,
        critical_count: radar.totals.criticalCount ?? 0,
        warning_count: radar.totals.warningCount ?? 0,
      });
      return radar;
    },
    retry: (failureCount, error) => {
      if (failureCount >= 1) {
        captureEvent(ANALYTICS_EVENTS.reimbursementCashFlowRadarFailed, {
          failure_type: getFailureType(error),
        });
        return false;
      }
      return true;
    },
    enabled: options?.enabled,
  });
}

export function usePaymentRequest(requestId: string) {
  return useQuery({
    queryKey: ["payment-request", requestId],
    queryFn: async () => {
      const res = await payments[":id"].$get({ param: { id: requestId } });
      return readResponseOrThrow(res);
    },
    enabled: Boolean(requestId),
  });
}

export function useEligibleExpenses(requestId: string, params: EligibleExpenseQueryParams) {
  return useQuery({
    queryKey: [
      "payment-request",
      requestId,
      "eligible-expenses",
      params.periodStart ?? "",
      params.periodEnd ?? "",
      params.category ?? "",
      params.search ?? "",
    ],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params.periodStart) query.periodStart = params.periodStart;
      if (params.periodEnd) query.periodEnd = params.periodEnd;
      if (params.category) query.category = params.category;
      if (params.search) query.search = params.search;
      const res = await payments[":id"]["eligible-expenses"].$get({
        param: { id: requestId },
        query,
      });
      return readResponseOrThrow(res);
    },
    enabled: Boolean(requestId),
  });
}

export function useGrantPaymentSummary(grantId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["grant-payment-summary", grantId],
    queryFn: async () => {
      const res = await payments.grants[":grantId"].summary.$get({
        param: { grantId },
      });
      return readResponseOrThrow(res);
    },
    enabled: options?.enabled !== false && Boolean(grantId),
  });
}

export function useIndirectCostRules(params?: { grantId?: string }) {
  return useQuery({
    queryKey: ["indirect-cost-rules", params?.grantId ?? ""],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.grantId) query.grantId = params.grantId;
      const res = await payments["indirect-rules"].$get({ query });
      return readResponseOrThrow(res);
    },
  });
}

export function useEvidenceManifest(requestId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["payment-request", requestId, "evidence-manifest"],
    queryFn: async () => {
      const res = await payments[":id"].packet.$get({ param: { id: requestId } });
      return readResponseOrThrow(res);
    },
    enabled: options?.enabled !== false && Boolean(requestId),
  });
}

export function usePaymentRequestMutations(requestId?: string) {
  const queryClient = useQueryClient();

  const createRequest = useMutation({
    mutationFn: async (data: CreatePaymentRequestInput) => {
      const res = await payments.$post({ json: data });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidatePaymentRequests(queryClient);
      captureEvent("payment_request_created", {
        request_type: variables.type,
        auto_post_journal_entry: variables.autoPostJournalEntry,
      });
    },
    onError: handlePaymentOperationError("create_request"),
  });

  const updateRequest = useMutation({
    mutationFn: async (data: UpdatePaymentRequestInput) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].$patch({ param: { id: requestId }, json: data });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_updated");
    },
    onError: handlePaymentOperationError("update_request"),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const res = await payments[":id"].$delete({ param: { id } });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_deleted");
    },
    onError: handlePaymentOperationError("delete_request"),
  });

  const transitionRequest = useMutation({
    mutationFn: async (data: PaymentRequestStatusTransitionInput) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].transitions.$post({
        param: { id: requestId },
        json: data,
      });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_transitioned", {
        from_status: variables.fromStatus,
        to_status: variables.toStatus,
      });
    },
    onError: handlePaymentOperationError("transition_request"),
  });

  const addLine = useMutation({
    mutationFn: async (data: CreatePaymentRequestLineInput) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].lines.$post({ param: { id: requestId }, json: data });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_line_added", {
        category: variables.category,
      });
    },
    onError: handlePaymentOperationError("add_line"),
  });

  const updateLine = useMutation({
    mutationFn: async ({
      lineId,
      data,
    }: {
      lineId: string;
      data: UpdatePaymentRequestLineInput;
    }) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].lines[":lineId"].$patch({
        param: { id: requestId, lineId },
        json: data,
      });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_line_updated");
    },
    onError: handlePaymentOperationError("update_line"),
  });

  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].lines[":lineId"].$delete({
        param: { id: requestId, lineId },
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_line_removed");
    },
    onError: handlePaymentOperationError("remove_line"),
  });

  const createAdjustment = useMutation({
    mutationFn: async (data: CreatePaymentRequestAdjustmentInput) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].adjustments.$post({
        param: { id: requestId },
        json: data,
      });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_adjustment_created", {
        adjustment_kind: variables.kind,
      });
    },
    onError: handlePaymentOperationError("create_adjustment"),
  });

  const recordPayment = useMutation({
    mutationFn: async (data: RecordPaymentInput) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].payments.$post({ param: { id: requestId }, json: data });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      invalidatePaymentRequests(queryClient, requestId);
      invalidatePaymentAccountingViews(queryClient);
      captureEvent("payment_request_payment_recorded", {
        amount_bucket: getAmountBucket(variables.amountCents),
      });
    },
    onError: handlePaymentOperationError("record_payment"),
  });

  const removePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"].payments[":paymentId"].$delete({
        param: { id: requestId, paymentId },
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      invalidatePaymentAccountingViews(queryClient);
      captureEvent("payment_request_payment_removed");
    },
    onError: handlePaymentOperationError("remove_payment"),
  });

  const recomputeIndirect = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"]["indirect"].recompute.$post({ param: { id: requestId } });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidatePaymentRequests(queryClient, requestId);
      captureEvent("payment_request_indirect_recomputed");
    },
    onError: handlePaymentOperationError("recompute_indirect"),
  });

  const previewUniformGuidanceGuardrails = useMutation({
    mutationFn: async (
      data: UniformGuidanceGuardrailPreviewInput,
    ): Promise<UniformGuidanceGuardrailResult> => {
      if (!requestId) throw new Error("requestId is required");
      const res = await payments[":id"]["ug-guardrails"].preview.$post({
        param: { id: requestId },
        json: data,
      });
      await throwIfNotOk(res);
      return (await readResponseOrThrow(res)) as UniformGuidanceGuardrailResult;
    },
    onSuccess: (data) => {
      captureEvent(ANALYTICS_EVENTS.uniformGuidanceGuardrailsPreviewed, {
        result_status: data.status,
        finding_count: data.findingCount,
      });
      if (data.status === "blocked") {
        captureEvent(ANALYTICS_EVENTS.uniformGuidanceGuardrailsBlocked, {
          finding_count: data.findingCount,
        });
      }
    },
    onError: handlePaymentOperationError("preview_uniform_guidance_guardrails"),
  });

  const createIndirectRule = useMutation({
    mutationFn: async (data: CreateIndirectCostRuleInput) => {
      const res = await payments["indirect-rules"].$post({ json: data });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["indirect-cost-rules"] });
      captureEvent("indirect_cost_rule_created", {
        rule_base: variables.base,
      });
    },
    onError: handlePaymentOperationError("create_indirect_rule"),
  });

  const updateIndirectRule = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: UpdateIndirectCostRuleInput }) => {
      const res = await payments["indirect-rules"][":ruleId"].$patch({
        param: { ruleId },
        json: data,
      });
      await throwIfNotOk(res);
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["indirect-cost-rules"] });
      captureEvent("indirect_cost_rule_updated");
    },
    onError: handlePaymentOperationError("update_indirect_rule"),
  });

  const deleteIndirectRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await payments["indirect-rules"][":ruleId"].$delete({ param: { ruleId } });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["indirect-cost-rules"] });
      captureEvent("indirect_cost_rule_deleted");
    },
    onError: handlePaymentOperationError("delete_indirect_rule"),
  });

  return {
    createRequest,
    updateRequest,
    deleteRequest,
    transitionRequest,
    addLine,
    updateLine,
    removeLine,
    createAdjustment,
    recordPayment,
    removePayment,
    recomputeIndirect,
    previewUniformGuidanceGuardrails,
    createIndirectRule,
    updateIndirectRule,
    deleteIndirectRule,
  };
}
