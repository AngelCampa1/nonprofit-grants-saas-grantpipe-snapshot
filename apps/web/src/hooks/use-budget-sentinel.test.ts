import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockBudgetSentinelGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      grants: {
        "budget-sentinel": {
          $get: hoisted.mockBudgetSentinelGet,
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../lib/http-response";
import {
  buildBudgetSentinelQuery,
  useBudgetSentinel,
  type BudgetSentinelFilters,
} from "./use-budget-sentinel";

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
  return (
    call as unknown as { retry: (count: number, error: unknown) => boolean }
  ).retry;
}

const MOCK_RESPONSE = {
  asOf: "2026-06-16T00:00:00.000Z",
  items: [
    {
      kind: "overspend" as const,
      id: "os1",
      grantId: "g1",
      grantName: "EPA Grant",
      category: "Personnel",
      band: "over_budget" as const,
      approvedAmountCents: 100000,
      actualCents: 120000,
      plannedCents: 100000,
      projectedCents: 130000,
      overByCents: 20000,
      utilizationPercent: 120,
      riskScore: 95,
    },
    {
      kind: "underspend" as const,
      id: "us1",
      fundId: "f1",
      fundName: "Restricted Fund A",
      grantId: "g2",
      title: "Q4 Lapsing",
      band: "lapsing_soon" as const,
      balanceCents: 50000,
      daysUntilEnd: 10,
      endDate: "2026-09-30",
      riskScore: 80,
    },
  ],
  totals: {
    overspend: { near_limit: 0, projected_overspend: 0, over_budget: 1, total: 1 },
    underspend: { lapse_watch: 0, lapsing_soon: 1, lapsed_unspent: 0, total: 1 },
    totalAtRisk: 2,
  },
};

describe("buildBudgetSentinelQuery", () => {
  it("returns an empty record when no filters are supplied", () => {
    expect(buildBudgetSentinelQuery({})).toEqual({});
  });

  it("serializes kinds as a comma-joined string", () => {
    expect(buildBudgetSentinelQuery({ kinds: ["overspend", "underspend"] })).toEqual({
      kinds: "overspend,underspend",
    });
  });

  it("serializes a single kind", () => {
    expect(buildBudgetSentinelQuery({ kinds: ["overspend"] })).toEqual({
      kinds: "overspend",
    });
  });

  it("serializes limit as a string", () => {
    expect(buildBudgetSentinelQuery({ limit: 50 })).toEqual({ limit: "50" });
  });

  it("omits empty kinds array", () => {
    expect(buildBudgetSentinelQuery({ kinds: [] })).toEqual({});
  });

  it("serializes both filters together", () => {
    const filters: BudgetSentinelFilters = {
      kinds: ["underspend"],
      limit: 100,
    };
    expect(buildBudgetSentinelQuery(filters)).toEqual({
      kinds: "underspend",
      limit: "100",
    });
  });
});

describe("useBudgetSentinel", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined, error: null } as never);
    hoisted.mockBudgetSentinelGet.mockReset();
    hoisted.mockBudgetSentinelGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    });
  });

  it("keys the query by the serialized filters", () => {
    useBudgetSentinel({ kinds: ["overspend"], limit: 25 });
    expect(captureQueryKey()).toEqual([
      "budget-sentinel",
      { kinds: "overspend", limit: "25" },
    ]);
  });

  it("fetches the budget-sentinel endpoint and returns the response", async () => {
    useBudgetSentinel({ kinds: ["overspend"] });
    const result = await captureQueryFn()();
    expect(hoisted.mockBudgetSentinelGet).toHaveBeenCalledWith({
      query: { kinds: "overspend" },
    });
    expect(result).toEqual(MOCK_RESPONSE);
  });

  it("defaults to no filters when called without arguments", async () => {
    useBudgetSentinel();
    expect(captureQueryKey()).toEqual(["budget-sentinel", {}]);
    await captureQueryFn()();
    expect(hoisted.mockBudgetSentinelGet).toHaveBeenCalledWith({ query: {} });
  });

  it("throws when the API returns a non-ok response", async () => {
    hoisted.mockBudgetSentinelGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Something went wrong" }),
    });
    useBudgetSentinel();
    await expect(captureQueryFn()()).rejects.toThrow("Something went wrong");
  });

  it("does not retry on 402 plan-gate errors", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
    } as never);
    useBudgetSentinel();
    const retry = captureRetry();
    const planGateError = new ApiError("insufficient_plan", 402, "insufficient_plan");
    expect(retry(0, planGateError)).toBe(false);
  });

  it("retries once on non-402 errors and then stops", () => {
    useBudgetSentinel();
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
    const { isPlanGated } = useBudgetSentinel();
    expect(isPlanGated).toBe(true);
  });

  it("exposes isPlanGated=false for non-402 errors", () => {
    const otherError = new ApiError("Server error", 500);
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: otherError,
    } as never);
    const { isPlanGated } = useBudgetSentinel();
    expect(isPlanGated).toBe(false);
  });

  it("exposes isPlanGated=false when there is no error", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: MOCK_RESPONSE,
      isError: false,
      error: null,
    } as never);
    const { isPlanGated } = useBudgetSentinel();
    expect(isPlanGated).toBe(false);
  });

  it("passes kinds filter with underspend only", async () => {
    useBudgetSentinel({ kinds: ["underspend"] });
    await captureQueryFn()();
    expect(hoisted.mockBudgetSentinelGet).toHaveBeenCalledWith({
      query: { kinds: "underspend" },
    });
  });
});
