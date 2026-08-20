import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockStatusGet: vi.fn(),
  mockSeedPost: vi.fn(),
  mockClearDelete: vi.fn(),
  mockCaptureQueryError: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "sample-data": {
        status: {
          $get: hoisted.mockStatusGet,
        },
        $post: hoisted.mockSeedPost,
        $delete: hoisted.mockClearDelete,
      },
    },
  },
}));

vi.mock("../lib/sentry", () => ({
  captureQueryError: hoisted.mockCaptureQueryError,
}));

import { useSampleDataStatus, useSeedSampleData, useClearSampleData } from "./use-sample-data";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

describe("useSampleDataStatus", () => {
  beforeEach(() => {
    hoisted.mockStatusGet.mockReset();
    hoisted.mockCaptureQueryError.mockReset();
  });

  it("resolves and returns the status payload", async () => {
    const payload = { seeded: true, recordCount: 42 };
    hoisted.mockStatusGet.mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSampleDataStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it("calls captureQueryError when the request fails", async () => {
    const error = new Error("network error");
    hoisted.mockStatusGet.mockRejectedValue(error);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSampleDataStatus(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(error, "query", {
      feature: "sample_data",
    });
  });

  it("calls captureQueryError when the response is not ok", async () => {
    hoisted.mockStatusGet.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSampleDataStatus(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(expect.any(Error), "query", {
      feature: "sample_data",
    });
  });
});

describe("useSeedSampleData", () => {
  beforeEach(() => {
    hoisted.mockSeedPost.mockReset();
    hoisted.mockCaptureQueryError.mockReset();
  });

  it("invalidates the affected query keys on success", async () => {
    const payload = { seeded: true, recordCount: 10 };
    hoisted.mockSeedPost.mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSeedSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sample-data-status"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["funds"] });
  });

  it("calls captureQueryError on mutation error", async () => {
    const error = new Error("seed failed");
    hoisted.mockSeedPost.mockRejectedValue(error);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSeedSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(error, "mutation", {
      feature: "sample_data_seed",
    });
  });

  it("calls captureQueryError when response is not ok", async () => {
    hoisted.mockSeedPost.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSeedSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(expect.any(Error), "mutation", {
      feature: "sample_data_seed",
    });
  });
});

describe("useClearSampleData", () => {
  beforeEach(() => {
    hoisted.mockClearDelete.mockReset();
    hoisted.mockCaptureQueryError.mockReset();
  });

  it("invalidates the affected query keys on success", async () => {
    hoisted.mockClearDelete.mockResolvedValue({
      ok: true,
      json: async () => ({ seeded: false, recordCount: 0 }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useClearSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sample-data-status"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["funds"] });
  });

  it("calls captureQueryError on mutation error", async () => {
    const error = new Error("clear failed");
    hoisted.mockClearDelete.mockRejectedValue(error);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClearSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(error, "mutation", {
      feature: "sample_data_clear",
    });
  });

  it("calls captureQueryError when response is not ok", async () => {
    hoisted.mockClearDelete.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClearSampleData(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(expect.any(Error), "mutation", {
      feature: "sample_data_clear",
    });
  });
});
