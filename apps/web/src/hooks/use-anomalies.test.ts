import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

const hoisted = vi.hoisted(() => ({
  mockAnomaliesGet: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      accounting: {
        anomalies: {
          $get: hoisted.mockAnomaliesGet,
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../lib/http-response";
import { buildAnomalyQuery, useAnomalies, type AnomalyFilters } from "./use-anomalies";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureQueryKey() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryKey: unknown[] }).queryKey;
}

function captureRetry() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { retry: (count: number, error: unknown) => boolean }).retry;
}

const MOCK_RESPONSE = {
  asOf: "2026-06-16T00:00:00.000Z",
  items: [
    {
      class: "category_misallocation" as const,
      severity: "warning" as const,
      reason: "Expense category not allowed under term",
      entityId: "exp-1",
      entityType: "expense" as const,
      expenseCategory: "Travel",
      expenseAccountId: null,
      termId: "term-1",
    },
    {
      class: "release_over_balance" as const,
      severity: "critical" as const,
      reason: "Release exceeds available balance",
      entityId: "rel-1",
      entityType: "restriction_release" as const,
      releaseAmountCents: 200000,
      availableBalanceCents: 100000,
      overByCents: 100000,
      termId: "term-2",
    },
    {
      class: "duplicate_donation" as const,
      severity: "warning" as const,
      reason: "Likely duplicate donation within 3 days",
      entityId: "don-1",
      entityType: "donation" as const,
      contactId: "contact-1",
      duplicateGroupIds: ["don-1", "don-2"],
    },
    {
      class: "indirect_rate_mismatch" as const,
      severity: "info" as const,
      reason: "Indirect rate differs from expected",
      entityId: "pr-1",
      entityType: "payment_request" as const,
      postedRateBasisPoints: 1000,
      postedAmountCents: 5000,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 7500,
      deltaCents: 2500,
    },
  ],
  totals: {
    category_misallocation: 1,
    release_over_balance: 1,
    duplicate_donation: 1,
    indirect_rate_mismatch: 1,
  },
};

describe("buildAnomalyQuery", () => {
  it("returns an empty record when no filters are supplied", () => {
    expect(buildAnomalyQuery({})).toEqual({});
  });

  it("serializes classes as a comma-joined string", () => {
    expect(
      buildAnomalyQuery({ classes: ["category_misallocation", "duplicate_donation"] }),
    ).toEqual({ classes: "category_misallocation,duplicate_donation" });
  });

  it("serializes a single class", () => {
    expect(buildAnomalyQuery({ classes: ["release_over_balance"] })).toEqual({
      classes: "release_over_balance",
    });
  });

  it("serializes limit as a string", () => {
    expect(buildAnomalyQuery({ limit: 50 })).toEqual({ limit: "50" });
  });

  it("omits empty classes array", () => {
    expect(buildAnomalyQuery({ classes: [] })).toEqual({});
  });

  it("serializes both filters together", () => {
    const filters: AnomalyFilters = {
      classes: ["indirect_rate_mismatch"],
      limit: 100,
    };
    expect(buildAnomalyQuery(filters)).toEqual({
      classes: "indirect_rate_mismatch",
      limit: "100",
    });
  });
});

describe("useAnomalies", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined, error: null } as never);
    hoisted.mockAnomaliesGet.mockReset();
    hoisted.mockCaptureEvent.mockReset();
    hoisted.mockAnomaliesGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    });
  });

  it("keys the query by the serialized filters", () => {
    useAnomalies({ classes: ["category_misallocation"], limit: 25 });
    expect(captureQueryKey()).toEqual([
      "accounting-anomalies",
      { classes: "category_misallocation", limit: "25" },
    ]);
  });

  it("fetches the anomalies endpoint and returns the response", async () => {
    useAnomalies({ classes: ["category_misallocation"] });
    const result = await captureQueryFn()();
    expect(hoisted.mockAnomaliesGet).toHaveBeenCalledWith({
      query: { classes: "category_misallocation" },
    });
    expect(result).toEqual(MOCK_RESPONSE);
  });

  it("defaults to no filters when called without arguments", async () => {
    useAnomalies();
    expect(captureQueryKey()).toEqual(["accounting-anomalies", {}]);
    await captureQueryFn()();
    expect(hoisted.mockAnomaliesGet).toHaveBeenCalledWith({ query: {} });
  });

  it("throws when the API returns a non-ok response", async () => {
    hoisted.mockAnomaliesGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Something went wrong" }),
    });
    useAnomalies();
    await expect(captureQueryFn()()).rejects.toThrow("Something went wrong");
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.accountingAnomalyOperationFailed,
      { operation: "load", failure_status: "unknown" },
    );
  });

  it("captures the numeric status when the anomaly load fails with one", async () => {
    hoisted.mockAnomaliesGet.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Server error" }),
    });
    useAnomalies();
    await expect(captureQueryFn()()).rejects.toThrow("Server error");
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.accountingAnomalyOperationFailed,
      { operation: "load", failure_status: 500 },
    );
  });

  it("does not retry on 402 plan-gate errors", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
    } as never);
    useAnomalies();
    const retry = captureRetry();
    const planGateError = new ApiError("insufficient_plan", 402, "insufficient_plan");
    expect(retry(0, planGateError)).toBe(false);
  });

  it("retries once on non-402 errors and then stops", () => {
    useAnomalies();
    const retry = captureRetry();
    const networkError = new Error("Network error");
    expect(retry(0, networkError)).toBe(true);
    expect(retry(1, networkError)).toBe(false);
  });

  it("exposes isPlanGated=true when the error is a 402", () => {
    const planGateError = new ApiError("insufficient_plan", 402, "insufficient_plan");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: planGateError,
    } as never);
    const { isPlanGated } = useAnomalies();
    expect(isPlanGated).toBe(true);
  });

  it("exposes isPlanGated=false for non-402 errors", () => {
    const otherError = new ApiError("Server error", 500);
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: otherError,
    } as never);
    const { isPlanGated } = useAnomalies();
    expect(isPlanGated).toBe(false);
  });

  it("exposes isPlanGated=false when there is no error", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: MOCK_RESPONSE,
      isError: false,
      error: null,
    } as never);
    const { isPlanGated } = useAnomalies();
    expect(isPlanGated).toBe(false);
  });

  it("passes classes filter for indirect_rate_mismatch only", async () => {
    useAnomalies({ classes: ["indirect_rate_mismatch"] });
    await captureQueryFn()();
    expect(hoisted.mockAnomaliesGet).toHaveBeenCalledWith({
      query: { classes: "indirect_rate_mismatch" },
    });
  });
});
