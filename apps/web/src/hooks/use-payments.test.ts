import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const hoisted = vi.hoisted(() => ({
  mockPaymentsGet: vi.fn(),
  mockPaymentsPost: vi.fn(),
  mockOutstandingSummaryGet: vi.fn(),
  mockCashFlowRadarGet: vi.fn(),
  mockPaymentIdGet: vi.fn(),
  mockPaymentIdPatch: vi.fn(),
  mockPaymentIdDelete: vi.fn(),
  mockTransitionsPost: vi.fn(),
  mockLinesPost: vi.fn(),
  mockLinesPatch: vi.fn(),
  mockLinesDelete: vi.fn(),
  mockEligibleExpensesGet: vi.fn(),
  mockAdjustmentsPost: vi.fn(),
  mockPaymentsRecordPost: vi.fn(),
  mockPaymentsRecordDelete: vi.fn(),
  mockIndirectRecomputePost: vi.fn(),
  mockUgGuardrailsPreviewPost: vi.fn(),
  mockPacketGet: vi.fn(),
  mockIndirectRulesGet: vi.fn(),
  mockIndirectRulesPost: vi.fn(),
  mockIndirectRulesPatch: vi.fn(),
  mockIndirectRulesDelete: vi.fn(),
  mockGrantSummaryGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      payments: {
        $get: hoisted.mockPaymentsGet,
        $post: hoisted.mockPaymentsPost,
        "outstanding-summary": { $get: hoisted.mockOutstandingSummaryGet },
        "cash-flow-radar": { $get: hoisted.mockCashFlowRadarGet },
        ":id": {
          $get: hoisted.mockPaymentIdGet,
          $patch: hoisted.mockPaymentIdPatch,
          $delete: hoisted.mockPaymentIdDelete,
          transitions: { $post: hoisted.mockTransitionsPost },
          lines: {
            $post: hoisted.mockLinesPost,
            ":lineId": { $patch: hoisted.mockLinesPatch, $delete: hoisted.mockLinesDelete },
          },
          "eligible-expenses": { $get: hoisted.mockEligibleExpensesGet },
          adjustments: { $post: hoisted.mockAdjustmentsPost },
          payments: {
            $post: hoisted.mockPaymentsRecordPost,
            ":paymentId": { $delete: hoisted.mockPaymentsRecordDelete },
          },
          indirect: { recompute: { $post: hoisted.mockIndirectRecomputePost } },
          "ug-guardrails": { preview: { $post: hoisted.mockUgGuardrailsPreviewPost } },
          packet: { $get: hoisted.mockPacketGet },
        },
        "indirect-rules": {
          $get: hoisted.mockIndirectRulesGet,
          $post: hoisted.mockIndirectRulesPost,
          ":ruleId": {
            $patch: hoisted.mockIndirectRulesPatch,
            $delete: hoisted.mockIndirectRulesDelete,
          },
        },
        grants: { ":grantId": { summary: { $get: hoisted.mockGrantSummaryGet } } },
      },
    },
  },
}));

vi.mock("../lib/http-response", () => ({
  readResponseOrThrow: vi.fn(async (res: { json: () => Promise<unknown> }) => res.json()),
  throwIfNotOk: vi.fn(async (_res: unknown) => undefined),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

function makeResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeRetryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

import {
  usePaymentRequests,
  useOutstandingSummary,
  useReimbursementCashFlowRadar,
  usePaymentRequest,
  useEligibleExpenses,
  useGrantPaymentSummary,
  useIndirectCostRules,
  useEvidenceManifest,
  usePaymentRequestMutations,
} from "./use-payments";
import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";

const mockCaptureEvent = vi.mocked(captureEvent);
const mockOnMutationError = vi.mocked(onMutationError);

describe("usePaymentRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches payment requests list", async () => {
    const mockData = { data: [{ id: "req-1" }], total: 1 };
    hoisted.mockPaymentsGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => usePaymentRequests({ page: 1, pageSize: 25 }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockPaymentsGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "25" },
    });
  });

  it("passes status filter when provided", async () => {
    hoisted.mockPaymentsGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(
      () => usePaymentRequests({ page: 1, pageSize: 25, status: "submitted" }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockPaymentsGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "25", status: "submitted" },
    });
  });

  it("passes grantId filter when provided", async () => {
    hoisted.mockPaymentsGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(
      () => usePaymentRequests({ page: 1, pageSize: 25, grantId: "grant-abc" }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockPaymentsGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "25", grantId: "grant-abc" },
    });
  });

  it("passes type filter when provided", async () => {
    hoisted.mockPaymentsGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(
      () => usePaymentRequests({ page: 1, pageSize: 25, type: "drawdown" }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockPaymentsGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "25", type: "drawdown" },
    });
  });

  it("is disabled when enabled=false", () => {
    const { result } = renderHook(
      () => usePaymentRequests({ page: 1, pageSize: 25 }, { enabled: false }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isPending).toBe(true);
    expect(hoisted.mockPaymentsGet).not.toHaveBeenCalled();
  });
});

describe("useOutstandingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches outstanding summary", async () => {
    const mockData = {
      totalOutstandingCents: 50000,
      submittedCount: 2,
      approvedCount: 1,
      overdueCount: 0,
    };
    hoisted.mockOutstandingSummaryGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useOutstandingSummary(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it("is disabled when enabled=false", () => {
    const { result } = renderHook(() => useOutstandingSummary({ enabled: false }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(hoisted.mockOutstandingSummaryGet).not.toHaveBeenCalled();
  });
});

describe("useReimbursementCashFlowRadar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the reimbursement cash-flow radar", async () => {
    const mockData = {
      totals: {
        totalCashGapCents: 45000,
        criticalCount: 1,
        warningCount: 0,
      },
      worklist: [{ grantId: "grant-1", grantName: "Science Grant" }],
    };
    hoisted.mockCashFlowRadarGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useReimbursementCashFlowRadar(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockCashFlowRadarGet).toHaveBeenCalledWith();
    expect(mockCaptureEvent).toHaveBeenCalledWith("reimbursement_cash_flow_radar_viewed", {
      total_gap_bucket: "100-999",
      work_item_count: 1,
      critical_count: 1,
      warning_count: 0,
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Science Grant");
  });

  it("tracks reimbursement cash-flow radar failures", async () => {
    hoisted.mockCashFlowRadarGet.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useReimbursementCashFlowRadar(), {
      wrapper: makeRetryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockCaptureEvent).toHaveBeenCalledWith("reimbursement_cash_flow_radar_failed", {
      failure_type: "request_error",
    });
  });

  it("does not track a failed reimbursement cash-flow radar retry that recovers", async () => {
    const mockData = {
      totals: {
        totalCashGapCents: 45000,
        criticalCount: 0,
        warningCount: 1,
      },
      worklist: [],
    };
    hoisted.mockCashFlowRadarGet
      .mockRejectedValueOnce(new Error("Temporary network error"))
      .mockResolvedValueOnce(makeResponse(mockData));

    const { result } = renderHook(() => useReimbursementCashFlowRadar(), {
      wrapper: makeRetryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockCashFlowRadarGet).toHaveBeenCalledTimes(2);
    expect(mockCaptureEvent).toHaveBeenCalledWith("reimbursement_cash_flow_radar_viewed", {
      total_gap_bucket: "100-999",
      work_item_count: 0,
      critical_count: 0,
      warning_count: 1,
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "reimbursement_cash_flow_radar_failed",
      expect.anything(),
    );
  });

  it("tracks one reimbursement cash-flow radar failure after retries are exhausted", async () => {
    hoisted.mockCashFlowRadarGet.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useReimbursementCashFlowRadar(), {
      wrapper: makeRetryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCashFlowRadarGet).toHaveBeenCalledTimes(2);
    expect(
      mockCaptureEvent.mock.calls.filter(
        ([eventName]) => eventName === "reimbursement_cash_flow_radar_failed",
      ),
    ).toEqual([
      [
        "reimbursement_cash_flow_radar_failed",
        {
          failure_type: "request_error",
        },
      ],
    ]);
  });

  it("does not fetch the reimbursement cash-flow radar when disabled", () => {
    const { result } = renderHook(() => useReimbursementCashFlowRadar({ enabled: false }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(hoisted.mockCashFlowRadarGet).not.toHaveBeenCalled();
  });
});

describe("usePaymentRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single payment request by id", async () => {
    const mockData = { id: "req-1", status: "draft", type: "reimbursement" };
    hoisted.mockPaymentIdGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => usePaymentRequest("req-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockPaymentIdGet).toHaveBeenCalledWith({ param: { id: "req-1" } });
  });

  it("is disabled when requestId is empty", () => {
    const { result } = renderHook(() => usePaymentRequest(""), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(true);
    expect(hoisted.mockPaymentIdGet).not.toHaveBeenCalled();
  });
});

describe("useEligibleExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches eligible expenses for a request", async () => {
    const mockData = { data: [{ id: "exp-1", amountCents: 10000 }] };
    hoisted.mockEligibleExpensesGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useEligibleExpenses("req-1", {}), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockEligibleExpensesGet).toHaveBeenCalledWith({
      param: { id: "req-1" },
      query: {},
    });
  });

  it("passes search params when provided", async () => {
    hoisted.mockEligibleExpensesGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(() => useEligibleExpenses("req-1", { search: "travel" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockEligibleExpensesGet).toHaveBeenCalledWith({
      param: { id: "req-1" },
      query: { search: "travel" },
    });
  });

  it("passes period and category params when provided", async () => {
    hoisted.mockEligibleExpensesGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(
      () =>
        useEligibleExpenses("req-1", {
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          category: "indirect",
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockEligibleExpensesGet).toHaveBeenCalledWith({
      param: { id: "req-1" },
      query: {
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        category: "indirect",
      },
    });
  });
});

describe("useGrantPaymentSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches grant payment summary", async () => {
    const mockData = { totalRequestedCents: 10000, totalPaidCents: 5000 };
    hoisted.mockGrantSummaryGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useGrantPaymentSummary("grant-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockGrantSummaryGet).toHaveBeenCalledWith({ param: { grantId: "grant-1" } });
  });

  it("is disabled when enabled=false", () => {
    const { result } = renderHook(() => useGrantPaymentSummary("grant-1", { enabled: false }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isPending).toBe(true);
    expect(hoisted.mockGrantSummaryGet).not.toHaveBeenCalled();
  });
});

describe("useIndirectCostRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches indirect cost rules", async () => {
    const mockData = { data: [{ id: "rule-1" }] };
    hoisted.mockIndirectRulesGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useIndirectCostRules(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(hoisted.mockIndirectRulesGet).toHaveBeenCalledWith({ query: {} });
  });

  it("passes grantId param when provided", async () => {
    hoisted.mockIndirectRulesGet.mockResolvedValue(makeResponse({ data: [] }));

    const { result } = renderHook(() => useIndirectCostRules({ grantId: "grant-1" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hoisted.mockIndirectRulesGet).toHaveBeenCalledWith({ query: { grantId: "grant-1" } });
  });
});

describe("useEvidenceManifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches evidence manifest", async () => {
    const mockData = { requestId: "req-1", documents: [] };
    hoisted.mockPacketGet.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => useEvidenceManifest("req-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it("is disabled when enabled=false", () => {
    const { result } = renderHook(() => useEvidenceManifest("req-1", { enabled: false }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isPending).toBe(true);
    expect(hoisted.mockPacketGet).not.toHaveBeenCalled();
  });
});

describe("usePaymentRequestMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createRequest calls payments.$post", async () => {
    const mockData = { id: "new-req" };
    hoisted.mockPaymentsPost.mockResolvedValue(makeResponse(mockData));

    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper: makeWrapper() });

    await result.current.createRequest.mutateAsync({
      grantId: "grant-1",
      type: "reimbursement",
      autoPostJournalEntry: false,
    });

    expect(hoisted.mockPaymentsPost).toHaveBeenCalledWith({
      json: { grantId: "grant-1", type: "reimbursement", autoPostJournalEntry: false },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_created", {
      request_type: "reimbursement",
      auto_post_journal_entry: false,
    });
  });

  it("createRequest refreshes the per-grant payment summary", async () => {
    hoisted.mockPaymentsPost.mockResolvedValue(makeResponse({ id: "new-req" }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper });

    await result.current.createRequest.mutateAsync({
      grantId: "grant-1",
      type: "reimbursement",
      autoPostJournalEntry: false,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["payment-requests"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grant-payment-summary"] });
  });

  it("updateRequest calls payments[':id'].$patch with requestId", async () => {
    hoisted.mockPaymentIdPatch.mockResolvedValue(makeResponse({ id: "req-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.updateRequest.mutateAsync({ notes: "updated" });

    expect(hoisted.mockPaymentIdPatch).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: { notes: "updated" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_updated");
  });

  it("updateRequest throws when no requestId", async () => {
    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper: makeWrapper() });

    await expect(result.current.updateRequest.mutateAsync({ notes: "test" })).rejects.toThrow(
      "requestId is required",
    );
  });

  it("tracks failed payment operations without raw error messages", async () => {
    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper: makeWrapper() });

    await expect(result.current.updateRequest.mutateAsync({ notes: "test" })).rejects.toThrow(
      "requestId is required",
    );

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("payment_operation_failed", {
        operation: "update_request",
        failure_type: "validation_error",
      });
    });
    expect(mockOnMutationError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "payment_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("deleteRequest calls payments[':id'].$delete", async () => {
    hoisted.mockPaymentIdDelete.mockResolvedValue(makeResponse(null));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.deleteRequest.mutateAsync("req-1");

    expect(hoisted.mockPaymentIdDelete).toHaveBeenCalledWith({ param: { id: "req-1" } });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_deleted");
  });

  it("transitionRequest calls transitions.$post", async () => {
    hoisted.mockTransitionsPost.mockResolvedValue(
      makeResponse({ id: "req-1", status: "submitted" }),
    );

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.transitionRequest.mutateAsync({
      fromStatus: "draft",
      toStatus: "submitted",
    });

    expect(hoisted.mockTransitionsPost).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: { fromStatus: "draft", toStatus: "submitted" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_transitioned", {
      from_status: "draft",
      to_status: "submitted",
    });
  });

  it("addLine calls lines.$post", async () => {
    hoisted.mockLinesPost.mockResolvedValue(makeResponse({ id: "line-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.addLine.mutateAsync({
      amountCents: 5000,
      category: "direct",
      sortOrder: 0,
    });

    expect(hoisted.mockLinesPost).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: { amountCents: 5000, category: "direct", sortOrder: 0 },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_line_added", {
      category: "direct",
    });
  });

  it("updateLine calls lines[':lineId'].$patch", async () => {
    hoisted.mockLinesPatch.mockResolvedValue(makeResponse({ id: "line-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.updateLine.mutateAsync({ lineId: "line-1", data: { amountCents: 6000 } });

    expect(hoisted.mockLinesPatch).toHaveBeenCalledWith({
      param: { id: "req-1", lineId: "line-1" },
      json: { amountCents: 6000 },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_line_updated");
  });

  it("removeLine calls lines[':lineId'].$delete", async () => {
    hoisted.mockLinesDelete.mockResolvedValue(makeResponse(null));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.removeLine.mutateAsync("line-1");

    expect(hoisted.mockLinesDelete).toHaveBeenCalledWith({
      param: { id: "req-1", lineId: "line-1" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_line_removed");
  });

  it("createAdjustment calls adjustments.$post", async () => {
    hoisted.mockAdjustmentsPost.mockResolvedValue(makeResponse({ id: "adj-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.createAdjustment.mutateAsync({ kind: "reduction", reason: "duplicate" });

    expect(hoisted.mockAdjustmentsPost).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: { kind: "reduction", reason: "duplicate" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_adjustment_created", {
      adjustment_kind: "reduction",
    });
  });

  it("recordPayment calls payments.$post", async () => {
    hoisted.mockPaymentsRecordPost.mockResolvedValue(makeResponse({ id: "pmt-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.recordPayment.mutateAsync({
      receivedDate: "2026-05-01T12:00:00.000Z",
      amountCents: 10000,
    });

    expect(hoisted.mockPaymentsRecordPost).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: { receivedDate: "2026-05-01T12:00:00.000Z", amountCents: 10000 },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_payment_recorded", {
      amount_bucket: "100-999",
    });
  });

  it.each([
    { amountCents: 9999, amountBucket: "0-99" },
    { amountCents: 100000, amountBucket: "1000-9999" },
    { amountCents: 1000000, amountBucket: "10000+" },
    { amountCents: -1000000, amountBucket: "10000+" },
  ])(
    "buckets recorded payment amount $amountCents as $amountBucket",
    async ({ amountCents, amountBucket }) => {
      hoisted.mockPaymentsRecordPost.mockResolvedValue(makeResponse({ id: "pmt-1" }));

      const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
        wrapper: makeWrapper(),
      });

      await result.current.recordPayment.mutateAsync({
        receivedDate: "2026-05-01T12:00:00.000Z",
        amountCents,
      });

      expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_payment_recorded", {
        amount_bucket: amountBucket,
      });
    },
  );

  it("recordPayment refreshes the accounting balance views and journal entries", async () => {
    hoisted.mockPaymentsRecordPost.mockResolvedValue(makeResponse({ id: "pmt-1" }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), { wrapper });

    await result.current.recordPayment.mutateAsync({
      receivedDate: "2026-05-01T12:00:00.000Z",
      amountCents: 10000,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-journal-entries"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-trial-balance"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-ledger"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["accounting-report-financial-position"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-report-activities"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["accounting-report-functional-expenses"],
    });
  });

  it("removePayment refreshes the accounting balance views and journal entries", async () => {
    hoisted.mockPaymentsRecordDelete.mockResolvedValue(makeResponse(null));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), { wrapper });

    await result.current.removePayment.mutateAsync("pmt-1");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-journal-entries"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-trial-balance"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-ledger"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["accounting-report-financial-position"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting-report-activities"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["accounting-report-functional-expenses"],
    });
  });

  it("removePayment calls payments[':paymentId'].$delete", async () => {
    hoisted.mockPaymentsRecordDelete.mockResolvedValue(makeResponse(null));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.removePayment.mutateAsync("pmt-1");

    expect(hoisted.mockPaymentsRecordDelete).toHaveBeenCalledWith({
      param: { id: "req-1", paymentId: "pmt-1" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_payment_removed");
  });

  it("recomputeIndirect calls indirect.recompute.$post", async () => {
    hoisted.mockIndirectRecomputePost.mockResolvedValue(makeResponse({ recomputed: true }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.recomputeIndirect.mutateAsync();

    expect(hoisted.mockIndirectRecomputePost).toHaveBeenCalledWith({ param: { id: "req-1" } });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_request_indirect_recomputed");
  });

  it("previewUniformGuidanceGuardrails calls the preview endpoint and captures privacy-safe status", async () => {
    hoisted.mockUgGuardrailsPreviewPost.mockResolvedValue(
      makeResponse({
        applicable: true,
        status: "warning",
        findingCount: 1,
        findings: [],
        regulatoryFacts: {
          deMinimisRatePercent: 15,
          mtdcSubawardCapCents: 5000000,
          equipmentThresholdCents: 1000000,
        },
      }),
    );

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.previewUniformGuidanceGuardrails.mutateAsync({
      amountCents: 6000000,
      category: "direct",
      expenseId: "exp-1",
      sortOrder: 0,
    });

    expect(hoisted.mockUgGuardrailsPreviewPost).toHaveBeenCalledWith({
      param: { id: "req-1" },
      json: {
        amountCents: 6000000,
        category: "direct",
        expenseId: "exp-1",
        sortOrder: 0,
      },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("uniform_guidance_guardrails_previewed", {
      result_status: "warning",
      finding_count: 1,
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("exp-1");
  });

  it("previewUniformGuidanceGuardrails captures blocked guardrail previews", async () => {
    hoisted.mockUgGuardrailsPreviewPost.mockResolvedValue(
      makeResponse({
        applicable: true,
        status: "blocked",
        findingCount: 1,
        findings: [],
        regulatoryFacts: {
          deMinimisRatePercent: 15,
          mtdcSubawardCapCents: 5000000,
          equipmentThresholdCents: 1000000,
        },
      }),
    );

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.previewUniformGuidanceGuardrails.mutateAsync({
      amountCents: 10000,
      category: "indirect",
      sortOrder: 0,
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("uniform_guidance_guardrails_blocked", {
      finding_count: 1,
    });
  });

  it("createIndirectRule calls indirect-rules.$post", async () => {
    hoisted.mockIndirectRulesPost.mockResolvedValue(makeResponse({ id: "rule-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.createIndirectRule.mutateAsync({
      base: "direct_costs",
      rateBasisPoints: 1500,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    expect(hoisted.mockIndirectRulesPost).toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith("indirect_cost_rule_created", {
      rule_base: "direct_costs",
    });
  });

  it("updateIndirectRule calls indirect-rules[':ruleId'].$patch", async () => {
    hoisted.mockIndirectRulesPatch.mockResolvedValue(makeResponse({ id: "rule-1" }));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.updateIndirectRule.mutateAsync({
      ruleId: "rule-1",
      data: { rateBasisPoints: 2000 },
    });

    expect(hoisted.mockIndirectRulesPatch).toHaveBeenCalledWith({
      param: { ruleId: "rule-1" },
      json: { rateBasisPoints: 2000 },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("indirect_cost_rule_updated");
  });

  it("deleteIndirectRule calls indirect-rules[':ruleId'].$delete", async () => {
    hoisted.mockIndirectRulesDelete.mockResolvedValue(makeResponse(null));

    const { result } = renderHook(() => usePaymentRequestMutations("req-1"), {
      wrapper: makeWrapper(),
    });

    await result.current.deleteIndirectRule.mutateAsync("rule-1");

    expect(hoisted.mockIndirectRulesDelete).toHaveBeenCalledWith({ param: { ruleId: "rule-1" } });
    expect(mockCaptureEvent).toHaveBeenCalledWith("indirect_cost_rule_deleted");
  });

  it("recomputeIndirect throws when no requestId", async () => {
    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper: makeWrapper() });

    await expect(result.current.recomputeIndirect.mutateAsync()).rejects.toThrow(
      "requestId is required",
    );
    await expect(
      result.current.previewUniformGuidanceGuardrails.mutateAsync({
        amountCents: 10000,
        category: "direct",
        sortOrder: 0,
      }),
    ).rejects.toThrow("requestId is required");
  });

  it("request-scoped mutations reject before API calls when requestId is missing", async () => {
    const { result } = renderHook(() => usePaymentRequestMutations(), { wrapper: makeWrapper() });

    await expect(
      result.current.transitionRequest.mutateAsync({
        fromStatus: "draft",
        toStatus: "submitted",
      }),
    ).rejects.toThrow("requestId is required");
    await expect(
      result.current.addLine.mutateAsync({
        amountCents: 5000,
        category: "direct",
        sortOrder: 0,
      }),
    ).rejects.toThrow("requestId is required");
    await expect(
      result.current.updateLine.mutateAsync({
        lineId: "line-1",
        data: { amountCents: 6000 },
      }),
    ).rejects.toThrow("requestId is required");
    await expect(result.current.removeLine.mutateAsync("line-1")).rejects.toThrow(
      "requestId is required",
    );
    await expect(
      result.current.createAdjustment.mutateAsync({
        kind: "reduction",
        reason: "duplicate",
      }),
    ).rejects.toThrow("requestId is required");
    await expect(
      result.current.recordPayment.mutateAsync({
        receivedDate: "2026-05-01T12:00:00.000Z",
        amountCents: 10000,
      }),
    ).rejects.toThrow("requestId is required");
    await expect(result.current.removePayment.mutateAsync("pmt-1")).rejects.toThrow(
      "requestId is required",
    );

    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      expect.stringMatching(/^payment_request_/),
      expect.anything(),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_operation_failed", {
      operation: "transition_request",
      failure_type: "validation_error",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("payment_operation_failed", {
      operation: "record_payment",
      failure_type: "validation_error",
    });
  });
});
