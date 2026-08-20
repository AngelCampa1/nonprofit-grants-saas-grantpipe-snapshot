import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockDeadlinesGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      deadlines: {
        $get: hoisted.mockDeadlinesGet,
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/react-query";
import { buildDeadlineRadarQuery, useDeadlineRadar } from "./use-deadline-radar";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureQueryKey() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryKey: unknown[] }).queryKey;
}

describe("buildDeadlineRadarQuery", () => {
  it("returns an empty query when no filters are supplied", () => {
    expect(buildDeadlineRadarQuery({})).toEqual({});
  });

  it("serializes every supplied filter", () => {
    expect(
      buildDeadlineRadarQuery({
        horizonDays: 30,
        kinds: ["reporting_requirement", "period_close"],
        status: "overdue",
        includeResolved: true,
      }),
    ).toEqual({
      horizonDays: "30",
      kinds: "reporting_requirement,period_close",
      status: "overdue",
      includeResolved: "true",
    });
  });

  it("omits empty kinds and falsey includeResolved", () => {
    expect(
      buildDeadlineRadarQuery({ kinds: [], includeResolved: false }),
    ).toEqual({});
  });
});

describe("useDeadlineRadar", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    hoisted.mockDeadlinesGet.mockReset();
    hoisted.mockDeadlinesGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ asOf: "2026-06-15", bands: {}, totals: {} }),
    });
  });

  it("keys the query by the serialized filters and fetches the feed", async () => {
    useDeadlineRadar({ kinds: ["closeout_item"], status: "due_today" });

    expect(captureQueryKey()).toEqual([
      "deadline-radar",
      { kinds: "closeout_item", status: "due_today" },
    ]);

    const result = await captureQueryFn()();
    expect(hoisted.mockDeadlinesGet).toHaveBeenCalledWith({
      query: { kinds: "closeout_item", status: "due_today" },
    });
    expect(result).toEqual({ asOf: "2026-06-15", bands: {}, totals: {} });
  });

  it("defaults to no filters when called without arguments", async () => {
    useDeadlineRadar();
    expect(captureQueryKey()).toEqual(["deadline-radar", {}]);
    await captureQueryFn()();
    expect(hoisted.mockDeadlinesGet).toHaveBeenCalledWith({ query: {} });
  });

  it("throws when the API returns a non-ok response", async () => {
    hoisted.mockDeadlinesGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Radar unavailable" }),
    });

    useDeadlineRadar();

    await expect(captureQueryFn()()).rejects.toThrow("Radar unavailable");
  });
});
