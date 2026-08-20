import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CreatePledgeInput,
  RecordPledgePaymentInput,
  SetPledgeAllowanceInput,
  WriteOffPledgeInput,
  PledgeStatus,
  PledgeInstallmentStatus,
  InstallmentAgingBucket,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { isApiErrorStatus } from "../lib/api-errors";
import { ApiError, readResponseOrThrow } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

const pledgesApi = api.api.pledges;

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const pledgeKeys = {
  all: () => ["pledges"] as const,
  list: (params: PledgeListFilters) => ["pledges", "list", params] as const,
  detail: (id: string) => ["pledges", "detail", id] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PledgeWithComputedFields = {
  id: string;
  orgId: string;
  contactId: string;
  fundId: string | null;
  grantId: string | null;
  status: PledgeStatus;
  isConditional: boolean;
  conditionNote: string | null;
  hasBarrier: boolean;
  hasRightOfReturn: boolean;
  faceAmountCents: number;
  pledgeDate: string;
  discountRateBasisPoints: number;
  presentValueCents: number;
  discountCents: number;
  netAssetClass: string;
  allowanceCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  outstandingCents: number;
  agingBuckets: Record<InstallmentAgingBucket, number>;
};

export type PledgeListTotals = {
  totalFaceCents: number;
  totalPVCents: number;
  totalOutstandingCents: number;
  totalWrittenOffCents: number;
  totalAllowanceCents: number;
};

export type PledgeListResponse = {
  pledges: PledgeWithComputedFields[];
  totals: PledgeListTotals;
};

export type PledgeInstallment = {
  id: string;
  orgId: string;
  pledgeId: string;
  dueDate: string;
  amountCents: number;
  status: PledgeInstallmentStatus;
  paidCents: number;
  createdAt: string;
  deletedAt: string | null;
};

export type PledgePayment = {
  id: string;
  orgId: string;
  pledgeId: string;
  installmentId: string | null;
  amountCents: number;
  paymentDate: string;
  accretionCents: number;
  notes: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type AmortizationEntry = {
  period: number;
  date: string;
  carryingValueCents: number;
  accretionCents: number;
  cumulativeAccretionCents: number;
};

export type PledgeDetailResponse = {
  pledge: PledgeWithComputedFields & {
    outstandingCents: number;
    agingBuckets: Record<InstallmentAgingBucket, number>;
  };
  installments: PledgeInstallment[];
  payments: PledgePayment[];
  amortizationSchedule: AmortizationEntry[];
  carryingValueCents: number;
};

export type PledgeListFilters = {
  status?: PledgeStatus;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFailureType(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 422) return "validation";
    if (error.status === 401 || error.status === 403) return "permission";
    if (error.status === 404) return "not_found";
    return "unknown";
  }
  if (!(error instanceof Error)) return "unknown";
  const message = error.message.toLowerCase();
  if (message.includes("valid") || message.includes("required")) return "validation";
  if (message.includes("permission") || message.includes("forbidden")) return "permission";
  if (message.includes("not found")) return "not_found";
  return "unknown";
}

function getSafeErrorExtra(error: unknown, failureType: string): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    failure_type: failureType,
  };

  if (error instanceof ApiError) {
    extra.status = error.status;
    if (error.errorCode) extra.error_code = error.errorCode;
  }

  return extra;
}

function handlePledgeError(operation: string) {
  return (error: unknown) => {
    const failureType = getFailureType(error);
    captureEvent("pledge_operation_failed", {
      operation,
      failure_type: failureType,
    });
    captureAppException(
      error,
      {
        tags: {
          feature: "pledge_tracker",
          operation,
        },
        extra: getSafeErrorExtra(error, failureType),
      },
      {
        includeExpected: true,
        sanitize: true,
      },
    );
    onMutationError(error);
  };
}

function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 5) return "1_5";
  if (count <= 10) return "6_10";
  if (count <= 25) return "11_25";
  return "25_plus";
}

function discountRateBucket(basisPoints: number): string {
  if (basisPoints <= 0) return "0_bp";
  if (basisPoints <= 500) return "1_500_bp";
  if (basisPoints <= 1_000) return "501_1000_bp";
  return "1000_plus_bp";
}

export function buildPledgeListQuery(filters: PledgeListFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.status) query.status = filters.status;
  if (typeof filters.limit === "number") query.limit = String(filters.limit);
  return query;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePledges(filters: PledgeListFilters = {}) {
  const query = buildPledgeListQuery(filters);
  const result = useQuery({
    queryKey: pledgeKeys.list(filters),
    queryFn: async (): Promise<PledgeListResponse> => {
      const res = await pledgesApi.$get({ query });
      return readResponseOrThrow<PledgeListResponse>(
        res as unknown as Parameters<typeof readResponseOrThrow<PledgeListResponse>>[0],
      );
    },
    retry: (failureCount, error) => {
      if (isApiErrorStatus(error, 402) || isApiErrorStatus(error, 403)) return false;
      return failureCount < 1;
    },
  });

  const isPlanGated = isApiErrorStatus(result.error, 402) || isApiErrorStatus(result.error, 403);

  return { ...result, isPlanGated };
}

export function usePledge(id: string) {
  const result = useQuery({
    queryKey: pledgeKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<PledgeDetailResponse> => {
      const res = await pledgesApi[":id"].$get({ param: { id } });
      return readResponseOrThrow<PledgeDetailResponse>(
        res as unknown as Parameters<typeof readResponseOrThrow<PledgeDetailResponse>>[0],
      );
    },
    retry: (failureCount, error) => {
      if (isApiErrorStatus(error, 402) || isApiErrorStatus(error, 403)) return false;
      return failureCount < 1;
    },
  });

  const isPlanGated = isApiErrorStatus(result.error, 402) || isApiErrorStatus(result.error, 403);

  return { ...result, isPlanGated };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreatePledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePledgeInput) => {
      const res = await pledgesApi.$post({ json: data as never });
      return readResponseOrThrow(res as unknown as Parameters<typeof readResponseOrThrow>[0]);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: pledgeKeys.all() });
      captureEvent("pledge_created", {
        has_fund: Boolean(variables.fundId),
        has_grant: Boolean(variables.grantId),
        is_conditional: variables.hasBarrier && variables.hasRightOfReturn,
        installment_count_bucket: countBucket(variables.installments.length),
        discount_rate_bucket: discountRateBucket(variables.discountRateBasisPoints),
        net_asset_class: variables.netAssetClass,
      });
      toast.success("Pledge created");
    },
    onError: handlePledgeError("create_pledge"),
  });
}

export type RecordPledgePaymentVariables = RecordPledgePaymentInput & { pledgeId: string };

export function useRecordPledgePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: RecordPledgePaymentVariables) => {
      const { pledgeId, ...body } = data;
      const res = await pledgesApi[":id"].payments.$post({
        param: { id: pledgeId },
        json: body as never,
      });
      return readResponseOrThrow(res as unknown as Parameters<typeof readResponseOrThrow>[0]);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: pledgeKeys.all() });
      void queryClient.invalidateQueries({
        queryKey: pledgeKeys.detail(variables.pledgeId),
      });
      captureEvent("pledge_payment_recorded", {
        has_installment: Boolean(variables.installmentId),
      });
      toast.success("Payment recorded");
    },
    onError: handlePledgeError("record_payment"),
  });
}

export type SetPledgeAllowanceVariables = SetPledgeAllowanceInput & { pledgeId: string };

export function useSetPledgeAllowance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SetPledgeAllowanceVariables) => {
      const { pledgeId, ...body } = data;
      const res = await pledgesApi[":id"].allowance.$post({
        param: { id: pledgeId },
        json: body as never,
      });
      return readResponseOrThrow(res as unknown as Parameters<typeof readResponseOrThrow>[0]);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: pledgeKeys.all() });
      void queryClient.invalidateQueries({
        queryKey: pledgeKeys.detail(variables.pledgeId),
      });
      captureEvent("pledge_allowance_set");
      toast.success("Allowance updated");
    },
    onError: handlePledgeError("set_allowance"),
  });
}

export type WriteOffPledgeVariables = WriteOffPledgeInput & { pledgeId: string };

export function useWriteOffPledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: WriteOffPledgeVariables) => {
      const { pledgeId, ...body } = data;
      const res = await pledgesApi[":id"]["write-off"].$post({
        param: { id: pledgeId },
        json: body as never,
      });
      return readResponseOrThrow(res as unknown as Parameters<typeof readResponseOrThrow>[0]);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: pledgeKeys.all() });
      void queryClient.invalidateQueries({
        queryKey: pledgeKeys.detail(variables.pledgeId),
      });
      captureEvent("pledge_written_off");
      toast.success("Pledge written off");
    },
    onError: handlePledgeError("write_off"),
  });
}

export function usePromotePledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pledgeId: string) => {
      const res = await pledgesApi[":id"].promote.$post({
        param: { id: pledgeId },
        json: {} as never,
      });
      return readResponseOrThrow(res as unknown as Parameters<typeof readResponseOrThrow>[0]);
    },
    onSuccess: (_data, pledgeId) => {
      void queryClient.invalidateQueries({ queryKey: pledgeKeys.all() });
      void queryClient.invalidateQueries({
        queryKey: pledgeKeys.detail(pledgeId),
      });
      captureEvent("pledge_promoted");
      toast.success("Pledge promoted to active");
    },
    onError: handlePledgeError("promote_pledge"),
  });
}
