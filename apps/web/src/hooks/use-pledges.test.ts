import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockPledgesGet: vi.fn(),
  mockPledgeIdGet: vi.fn(),
  mockPledgesPost: vi.fn(),
  mockPaymentsPost: vi.fn(),
  mockAllowancePost: vi.fn(),
  mockWriteOffPost: vi.fn(),
  mockPromotePost: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      pledges: {
        $get: hoisted.mockPledgesGet,
        $post: hoisted.mockPledgesPost,
        ":id": {
          $get: hoisted.mockPledgeIdGet,
          payments: { $post: hoisted.mockPaymentsPost },
          allowance: { $post: hoisted.mockAllowancePost },
          "write-off": { $post: hoisted.mockWriteOffPost },
          promote: { $post: hoisted.mockPromotePost },
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";
import { onMutationError } from "../lib/mutation-error";
import { ApiError } from "../lib/http-response";
import {
  usePledges,
  usePledge,
  useCreatePledge,
  useRecordPledgePayment,
  useSetPledgeAllowance,
  useWriteOffPledge,
  usePromotePledge,
  buildPledgeListQuery,
  pledgeKeys,
} from "./use-pledges";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureQueryKey() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryKey: unknown[] }).queryKey;
}

function captureQueryEnabled() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { enabled?: boolean }).enabled;
}

function captureRetry() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { retry: (count: number, error: unknown) => boolean }).retry;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { mutationFn: (data: unknown) => Promise<unknown> }).mutationFn;
}

function captureMutationOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { onSuccess: (data: unknown, variables: unknown) => void }).onSuccess;
}

function captureMutationOnError() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { onError: (error: unknown) => void }).onError;
}

const MOCK_PLEDGE_LIST: import("./use-pledges").PledgeListResponse = {
  pledges: [
    {
      id: "p1",
      orgId: "org1",
      contactId: "c1",
      fundId: null,
      grantId: null,
      status: "active",
      isConditional: false,
      conditionNote: null,
      hasBarrier: false,
      hasRightOfReturn: false,
      faceAmountCents: 500000,
      pledgeDate: "2026-01-01T00:00:00.000Z",
      discountRateBasisPoints: 400,
      presentValueCents: 480000,
      discountCents: 20000,
      netAssetClass: "temporarily_restricted",
      allowanceCents: 0,
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      outstandingCents: 500000,
      agingBuckets: { current: 1, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 },
    },
  ],
  totals: {
    totalFaceCents: 500000,
    totalPVCents: 480000,
    totalOutstandingCents: 500000,
    totalWrittenOffCents: 0,
    totalAllowanceCents: 0,
  },
};

const MOCK_PLEDGE_DETAIL: import("./use-pledges").PledgeDetailResponse = {
  pledge: {
    ...MOCK_PLEDGE_LIST.pledges[0]!,
  },
  installments: [
    {
      id: "i1",
      orgId: "org1",
      pledgeId: "p1",
      dueDate: "2027-01-01T00:00:00.000Z",
      amountCents: 250000,
      status: "scheduled",
      paidCents: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    },
  ],
  payments: [],
  amortizationSchedule: [],
  carryingValueCents: 480000,
};

// ---------------------------------------------------------------------------
// buildPledgeListQuery
// ---------------------------------------------------------------------------

describe("buildPledgeListQuery", () => {
  it("returns empty record when no filters", () => {
    expect(buildPledgeListQuery({})).toEqual({});
  });

  it("serializes status", () => {
    expect(buildPledgeListQuery({ status: "active" })).toEqual({ status: "active" });
  });

  it("serializes limit as string", () => {
    expect(buildPledgeListQuery({ limit: 10 })).toEqual({ limit: "10" });
  });

  it("serializes both filters", () => {
    expect(buildPledgeListQuery({ status: "completed", limit: 50 })).toEqual({
      status: "completed",
      limit: "50",
    });
  });
});

// ---------------------------------------------------------------------------
// pledgeKeys
// ---------------------------------------------------------------------------

describe("pledgeKeys", () => {
  it("all returns base key", () => {
    expect(pledgeKeys.all()).toEqual(["pledges"]);
  });

  it("list returns key with params", () => {
    expect(pledgeKeys.list({ status: "active" })).toEqual([
      "pledges",
      "list",
      { status: "active" },
    ]);
  });

  it("detail returns key with id", () => {
    expect(pledgeKeys.detail("p1")).toEqual(["pledges", "detail", "p1"]);
  });
});

// ---------------------------------------------------------------------------
// usePledges
// ---------------------------------------------------------------------------

describe("usePledges", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined, error: null } as never);
    hoisted.mockPledgesGet.mockReset();
    hoisted.mockPledgesGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_PLEDGE_LIST),
    });
  });

  it("passes correct query key with no filters", () => {
    usePledges();
    expect(captureQueryKey()).toEqual(["pledges", "list", {}]);
  });

  it("passes correct query key with status filter", () => {
    usePledges({ status: "active" });
    expect(captureQueryKey()).toEqual(["pledges", "list", { status: "active" }]);
  });

  it("fetches pledges and returns response", async () => {
    usePledges({ status: "active" });
    const fn = captureQueryFn();
    const result = await fn();
    expect(hoisted.mockPledgesGet).toHaveBeenCalledWith({
      query: { status: "active" },
    });
    expect(result).toEqual(MOCK_PLEDGE_LIST);
  });

  it("throws when API returns non-ok response", async () => {
    hoisted.mockPledgesGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Server error" }),
    });
    usePledges();
    await expect(captureQueryFn()()).rejects.toThrow("Server error");
  });

  it("does not retry on 403 plan-gate errors", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      error: new ApiError("insufficient_plan", 403, "insufficient_plan"),
    } as never);
    usePledges();
    const retry = captureRetry();
    expect(retry(0, new ApiError("insufficient_plan", 403, "insufficient_plan"))).toBe(false);
  });

  it("does not retry on 402 errors", () => {
    usePledges();
    const retry = captureRetry();
    expect(retry(0, new ApiError("plan_gate", 402, "plan_gate"))).toBe(false);
  });

  it("retries once then stops on other errors", () => {
    usePledges();
    const retry = captureRetry();
    const err = new Error("Network error");
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(false);
  });

  it("exposes isPlanGated=true on 403", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: new ApiError("insufficient_plan", 403, "insufficient_plan"),
    } as never);
    const { isPlanGated } = usePledges();
    expect(isPlanGated).toBe(true);
  });

  it("exposes isPlanGated=false on no error", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: MOCK_PLEDGE_LIST,
      isError: false,
      error: null,
    } as never);
    const { isPlanGated } = usePledges();
    expect(isPlanGated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePledge
// ---------------------------------------------------------------------------

describe("usePledge", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined, error: null } as never);
    hoisted.mockPledgeIdGet.mockReset();
    hoisted.mockPledgeIdGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_PLEDGE_DETAIL),
    });
  });

  it("passes correct query key", () => {
    usePledge("p1");
    expect(captureQueryKey()).toEqual(["pledges", "detail", "p1"]);
  });

  it("is enabled when id is non-empty", () => {
    usePledge("p1");
    expect(captureQueryEnabled()).toBe(true);
  });

  it("is disabled when id is empty", () => {
    usePledge("");
    expect(captureQueryEnabled()).toBe(false);
  });

  it("fetches pledge detail and returns response", async () => {
    usePledge("p1");
    const fn = captureQueryFn();
    const result = await fn();
    expect(hoisted.mockPledgeIdGet).toHaveBeenCalledWith({ param: { id: "p1" } });
    expect(result).toEqual(MOCK_PLEDGE_DETAIL);
  });

  it("throws when API returns non-ok", async () => {
    hoisted.mockPledgeIdGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Not found" }),
    });
    usePledge("p1");
    await expect(captureQueryFn()()).rejects.toThrow("Not found");
  });

  it("does not retry on 403", () => {
    usePledge("p1");
    const retry = captureRetry();
    expect(retry(0, new ApiError("plan_gate", 403, "plan_gate"))).toBe(false);
  });

  it("retries once then stops on other errors", () => {
    usePledge("p1");
    const retry = captureRetry();
    const err = new Error("Network error");
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(false);
  });

  it("does not retry on 402", () => {
    usePledge("p1");
    const retry = captureRetry();
    expect(retry(0, new ApiError("plan_gate", 402, "plan_gate"))).toBe(false);
  });

  it("exposes isPlanGated=true on 403", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: new ApiError("plan_gate", 403, "plan_gate"),
    } as never);
    const { isPlanGated } = usePledge("p1");
    expect(isPlanGated).toBe(true);
  });

  it("exposes isPlanGated=false when no error", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: MOCK_PLEDGE_DETAIL,
      isError: false,
      error: null,
    } as never);
    const { isPlanGated } = usePledge("p1");
    expect(isPlanGated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useCreatePledge
// ---------------------------------------------------------------------------

describe("useCreatePledge", () => {
  const mockInvalidate = vi.fn();
  const mockQueryClient = { invalidateQueries: mockInvalidate };

  beforeEach(() => {
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockReturnValue({} as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
    vi.mocked(captureEvent).mockReset();
    vi.mocked(captureAppException).mockReset();
    vi.mocked(toast.success).mockReset();
    hoisted.mockPledgesPost.mockReset();
    hoisted.mockPledgesPost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ pledge: MOCK_PLEDGE_LIST.pledges[0] }),
    });
  });

  it("calls pledges POST endpoint", async () => {
    useCreatePledge();
    const fn = captureMutationFn();
    const input = {
      contactId: "c1",
      pledgeDate: new Date("2026-01-01"),
      discountRateBasisPoints: 400,
      netAssetClass: "temporarily_restricted" as const,
      hasBarrier: false,
      hasRightOfReturn: false,
      installments: [{ dueDate: new Date("2027-01-01"), amountCents: 500000 }],
    };
    await fn(input);
    expect(hoisted.mockPledgesPost).toHaveBeenCalled();
  });

  it("throws when API returns non-ok", async () => {
    hoisted.mockPledgesPost.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Validation error" }),
    });
    useCreatePledge();
    const fn = captureMutationFn();
    await expect(
      fn({
        contactId: "c1",
        pledgeDate: new Date(),
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [],
      }),
    ).rejects.toThrow();
  });

  it("invalidates pledges and fires toast/event on success", () => {
    useCreatePledge();
    const onSuccess = captureMutationOnSuccess();
    const variables = {
      contactId: "c1",
      pledgeDate: new Date("2026-01-01"),
      discountRateBasisPoints: 750,
      netAssetClass: "temporarily_restricted" as const,
      hasBarrier: false,
      hasRightOfReturn: false,
      installments: [{ dueDate: new Date("2027-01-01"), amountCents: 500000 }],
    };
    variables.installments.push(
      { dueDate: new Date("2028-01-01"), amountCents: 100000 },
      { dueDate: new Date("2029-01-01"), amountCents: 100000 },
      { dueDate: new Date("2030-01-01"), amountCents: 100000 },
      { dueDate: new Date("2031-01-01"), amountCents: 100000 },
      { dueDate: new Date("2032-01-01"), amountCents: 100000 },
    );
    onSuccess(undefined, variables);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_created",
      expect.objectContaining({
        has_fund: false,
        has_grant: false,
        is_conditional: false,
        installment_count_bucket: "6_10",
        discount_rate_bucket: "501_1000_bp",
      }),
    );
    const [, payload] = vi.mocked(captureEvent).mock.calls[0]!;
    expect(payload).not.toHaveProperty("installment_count");
    expect(payload).not.toHaveProperty("discount_rate_bp");
    expect(toast.success).toHaveBeenCalledWith("Pledge created");
  });

  it("tracks is_conditional=true when both barrier flags are set", () => {
    useCreatePledge();
    const onSuccess = captureMutationOnSuccess();
    const variables = {
      contactId: "c1",
      pledgeDate: new Date("2026-01-01"),
      discountRateBasisPoints: 0,
      netAssetClass: "unrestricted" as const,
      hasBarrier: true,
      hasRightOfReturn: true,
      installments: [],
    };
    onSuccess(undefined, variables);
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_created",
      expect.objectContaining({ is_conditional: true }),
    );
  });

  it("buckets pledge create telemetry at count and discount-rate edges", () => {
    useCreatePledge();
    const onSuccess = captureMutationOnSuccess();
    const examples = [
      { count: 0, rate: 0, countBucket: "0", rateBucket: "0_bp" },
      { count: 1, rate: 500, countBucket: "1_5", rateBucket: "1_500_bp" },
      { count: 11, rate: 1_000, countBucket: "11_25", rateBucket: "501_1000_bp" },
      { count: 26, rate: 1_001, countBucket: "25_plus", rateBucket: "1000_plus_bp" },
    ];

    for (const example of examples) {
      vi.mocked(captureEvent).mockClear();
      onSuccess(undefined, {
        contactId: "c1",
        pledgeDate: new Date("2026-01-01"),
        discountRateBasisPoints: example.rate,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: Array.from({ length: example.count }, (_, index) => ({
          dueDate: new Date(2027, 0, index + 1),
          amountCents: 100_000,
        })),
      });

      expect(captureEvent).toHaveBeenCalledWith(
        "pledge_created",
        expect.objectContaining({
          installment_count_bucket: example.countBucket,
          discount_rate_bucket: example.rateBucket,
        }),
      );
      const [, payload] = vi.mocked(captureEvent).mock.calls[0]!;
      expect(payload).not.toHaveProperty("installment_count");
      expect(payload).not.toHaveProperty("discount_rate_bp");
    }
  });

  it("calls onMutationError on failure", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    const error = new Error("Bad request");
    onError(error);
    expect(onMutationError).toHaveBeenCalledWith(error);
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ operation: "create_pledge" }),
    );
  });

  it("captures create ApiError failures in Sentry with safe metadata", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    const error = new ApiError("donor name from raw response body", 400, "validation_failed");
    onError(error);
    expect(captureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: {
          feature: "pledge_tracker",
          operation: "create_pledge",
        },
        extra: {
          failure_type: "validation",
          status: 400,
          error_code: "validation_failed",
        },
      },
      {
        includeExpected: true,
        sanitize: true,
      },
    );
    expect(JSON.stringify(vi.mocked(captureAppException).mock.calls)).not.toContain(
      "raw response body",
    );
  });

  it("classifies permission and not-found ApiErrors without reading raw text", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    onError(new ApiError("custom forbidden body", 403, "forbidden"));
    onError(new ApiError("custom not found body", 404, "not_found"));
    expect(captureEvent).toHaveBeenNthCalledWith(
      1,
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "permission" }),
    );
    expect(captureEvent).toHaveBeenNthCalledWith(
      2,
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "not_found" }),
    );
  });

  it("classifies validation error failure_type", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    onError(new Error("validation failed: field required"));
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "validation" }),
    );
  });

  it("classifies permission error failure_type", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    onError(new Error("forbidden: permission denied"));
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "permission" }),
    );
  });

  it("classifies not_found error failure_type", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    onError(new Error("resource not found"));
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "not_found" }),
    );
  });

  it("classifies non-Error as unknown failure_type", () => {
    useCreatePledge();
    const onError = captureMutationOnError();
    onError("string error");
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ failure_type: "unknown" }),
    );
  });
});

// ---------------------------------------------------------------------------
// useRecordPledgePayment
// ---------------------------------------------------------------------------

describe("useRecordPledgePayment", () => {
  const mockInvalidate = vi.fn();
  const mockQueryClient = { invalidateQueries: mockInvalidate };

  beforeEach(() => {
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockReturnValue({} as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
    vi.mocked(captureEvent).mockReset();
    vi.mocked(captureAppException).mockReset();
    vi.mocked(toast.success).mockReset();
    hoisted.mockPaymentsPost.mockReset();
    hoisted.mockPaymentsPost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ payment: {} }),
    });
  });

  it("calls /:id/payments POST endpoint", async () => {
    useRecordPledgePayment();
    const fn = captureMutationFn();
    const input = {
      pledgeId: "p1",
      amountCents: 100000,
      paymentDate: new Date("2026-06-01"),
    };
    await fn(input);
    expect(hoisted.mockPaymentsPost).toHaveBeenCalledWith({
      param: { id: "p1" },
      json: { amountCents: 100000, paymentDate: new Date("2026-06-01") },
    });
  });

  it("invalidates pledges list and detail, fires toast/event on success", () => {
    useRecordPledgePayment();
    const onSuccess = captureMutationOnSuccess();
    const variables = { pledgeId: "p1", amountCents: 100000, paymentDate: new Date() };
    onSuccess(undefined, variables);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges", "detail", "p1"] });
    expect(toast.success).toHaveBeenCalledWith("Payment recorded");
    expect(captureEvent).toHaveBeenCalledWith("pledge_payment_recorded", {
      has_installment: false,
    });
  });

  it("calls onMutationError on failure", () => {
    useRecordPledgePayment();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });

  it("captures payment failures in Sentry with safe metadata", () => {
    useRecordPledgePayment();
    const onError = captureMutationOnError();
    const error = new Error("forbidden: permission denied");
    onError(error);
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({
        operation: "record_payment",
        failure_type: "permission",
      }),
    );
    expect(captureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: {
          feature: "pledge_tracker",
          operation: "record_payment",
        },
        extra: {
          failure_type: "permission",
        },
      },
      {
        includeExpected: true,
        sanitize: true,
      },
    );
  });
});

// ---------------------------------------------------------------------------
// useSetPledgeAllowance
// ---------------------------------------------------------------------------

describe("useSetPledgeAllowance", () => {
  const mockInvalidate = vi.fn();
  const mockQueryClient = { invalidateQueries: mockInvalidate };

  beforeEach(() => {
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockReturnValue({} as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
    vi.mocked(captureEvent).mockReset();
    vi.mocked(toast.success).mockReset();
    hoisted.mockAllowancePost.mockReset();
    hoisted.mockAllowancePost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ pledge: {} }),
    });
  });

  it("calls /:id/allowance POST endpoint", async () => {
    useSetPledgeAllowance();
    const fn = captureMutationFn();
    const input = { pledgeId: "p1", allowanceCents: 50000 };
    await fn(input);
    expect(hoisted.mockAllowancePost).toHaveBeenCalledWith({
      param: { id: "p1" },
      json: { allowanceCents: 50000 },
    });
  });

  it("invalidates and fires toast on success", () => {
    useSetPledgeAllowance();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, { pledgeId: "p1", allowanceCents: 50000 });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges", "detail", "p1"] });
    expect(toast.success).toHaveBeenCalledWith("Allowance updated");
    expect(captureEvent).toHaveBeenCalledWith("pledge_allowance_set");
  });

  it("calls onMutationError on failure", () => {
    useSetPledgeAllowance();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useWriteOffPledge
// ---------------------------------------------------------------------------

describe("useWriteOffPledge", () => {
  const mockInvalidate = vi.fn();
  const mockQueryClient = { invalidateQueries: mockInvalidate };

  beforeEach(() => {
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockReturnValue({} as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
    vi.mocked(captureEvent).mockReset();
    vi.mocked(toast.success).mockReset();
    hoisted.mockWriteOffPost.mockReset();
    hoisted.mockWriteOffPost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ pledge: {} }),
    });
  });

  it("calls /:id/write-off POST endpoint", async () => {
    useWriteOffPledge();
    const fn = captureMutationFn();
    const input = { pledgeId: "p1", reason: "Donor deceased" };
    await fn(input);
    expect(hoisted.mockWriteOffPost).toHaveBeenCalledWith({
      param: { id: "p1" },
      json: { reason: "Donor deceased" },
    });
  });

  it("invalidates and fires toast on success", () => {
    useWriteOffPledge();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, { pledgeId: "p1" });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges", "detail", "p1"] });
    expect(toast.success).toHaveBeenCalledWith("Pledge written off");
    expect(captureEvent).toHaveBeenCalledWith("pledge_written_off");
  });

  it("calls onMutationError on failure", () => {
    useWriteOffPledge();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePromotePledge
// ---------------------------------------------------------------------------

describe("usePromotePledge", () => {
  const mockInvalidate = vi.fn();
  const mockQueryClient = { invalidateQueries: mockInvalidate };

  beforeEach(() => {
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockReturnValue({} as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
    vi.mocked(captureEvent).mockReset();
    vi.mocked(toast.success).mockReset();
    hoisted.mockPromotePost.mockReset();
    hoisted.mockPromotePost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ pledge: {} }),
    });
  });

  it("calls the promote endpoint with the id in the path", async () => {
    usePromotePledge();
    const fn = captureMutationFn();
    await fn("p1");
    expect(hoisted.mockPromotePost).toHaveBeenCalledWith({
      param: { id: "p1" },
      json: {},
    });
  });

  it("throws when the promote endpoint returns a non-ok response", async () => {
    hoisted.mockPromotePost.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Only conditional pledges can be promoted" }),
    });
    usePromotePledge();
    const fn = captureMutationFn();
    await expect(fn("p1")).rejects.toThrow();
  });

  it("invalidates and fires toast on success", () => {
    usePromotePledge();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, "p1");
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["pledges", "detail", "p1"] });
    expect(toast.success).toHaveBeenCalledWith("Pledge promoted to active");
    expect(captureEvent).toHaveBeenCalledWith("pledge_promoted");
  });

  it("calls onMutationError on failure", () => {
    usePromotePledge();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
    expect(captureEvent).toHaveBeenCalledWith(
      "pledge_operation_failed",
      expect.objectContaining({ operation: "promote_pledge" }),
    );
  });
});
