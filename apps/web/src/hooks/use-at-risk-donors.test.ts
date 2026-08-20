import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockLapseRiskGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      donors: {
        "lapse-risk": {
          $get: hoisted.mockLapseRiskGet,
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
  buildAtRiskDonorsQuery,
  useAtRiskDonors,
  type AtRiskDonorFilters,
} from "./use-at-risk-donors";

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
  donors: [
    {
      contactId: "c1",
      displayName: "Jane Doe",
      email: "jane@example.com",
      band: "lapsing",
      daysSinceLastGift: 95,
      typicalCadenceDays: 90,
      riskScore: 42,
      lifetimeGivingCents: 50000,
      lastGiftDate: "2026-03-01",
    },
  ],
  totals: { lapsing: 1, at_risk: 0, lapsed: 0, total: 1 },
};

describe("buildAtRiskDonorsQuery", () => {
  it("returns an empty record when no filters are supplied", () => {
    expect(buildAtRiskDonorsQuery({})).toEqual({});
  });

  it("serializes bands as a comma-joined string", () => {
    expect(buildAtRiskDonorsQuery({ bands: ["lapsing", "at_risk"] })).toEqual({
      bands: "lapsing,at_risk",
    });
  });

  it("serializes limit as a string", () => {
    expect(buildAtRiskDonorsQuery({ limit: 50 })).toEqual({ limit: "50" });
  });

  it("omits empty bands array", () => {
    expect(buildAtRiskDonorsQuery({ bands: [] })).toEqual({});
  });

  it("serializes both filters together", () => {
    const filters: AtRiskDonorFilters = {
      bands: ["lapsed"],
      limit: 100,
    };
    expect(buildAtRiskDonorsQuery(filters)).toEqual({
      bands: "lapsed",
      limit: "100",
    });
  });
});

describe("useAtRiskDonors", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined, error: null } as never);
    hoisted.mockLapseRiskGet.mockReset();
    hoisted.mockLapseRiskGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    });
  });

  it("keys the query by the serialized filters", () => {
    useAtRiskDonors({ bands: ["lapsing"], limit: 25 });
    expect(captureQueryKey()).toEqual([
      "at-risk-donors",
      { bands: "lapsing", limit: "25" },
    ]);
  });

  it("fetches the lapse-risk endpoint and returns the response", async () => {
    useAtRiskDonors({ bands: ["lapsing"] });
    const result = await captureQueryFn()();
    expect(hoisted.mockLapseRiskGet).toHaveBeenCalledWith({
      query: { bands: "lapsing" },
    });
    expect(result).toEqual(MOCK_RESPONSE);
  });

  it("defaults to no filters when called without arguments", async () => {
    useAtRiskDonors();
    expect(captureQueryKey()).toEqual(["at-risk-donors", {}]);
    await captureQueryFn()();
    expect(hoisted.mockLapseRiskGet).toHaveBeenCalledWith({ query: {} });
  });

  it("throws when the API returns a non-ok response", async () => {
    hoisted.mockLapseRiskGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Something went wrong" }),
    });
    useAtRiskDonors();
    await expect(captureQueryFn()()).rejects.toThrow("Something went wrong");
  });

  it("does not retry on 402 plan-gate errors", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
    } as never);
    useAtRiskDonors();
    const retry = captureRetry();
    const planGateError = new ApiError("insufficient_plan", 402, "insufficient_plan");
    expect(retry(0, planGateError)).toBe(false);
  });

  it("retries once on non-402 errors and then stops", () => {
    useAtRiskDonors();
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
    const { isPlanGated } = useAtRiskDonors();
    expect(isPlanGated).toBe(true);
  });

  it("exposes isPlanGated=false for non-402 errors", () => {
    const otherError = new ApiError("Server error", 500);
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      error: otherError,
    } as never);
    const { isPlanGated } = useAtRiskDonors();
    expect(isPlanGated).toBe(false);
  });

  it("exposes isPlanGated=false when there is no error", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: MOCK_RESPONSE,
      isError: false,
      error: null,
    } as never);
    const { isPlanGated } = useAtRiskDonors();
    expect(isPlanGated).toBe(false);
  });
});
