import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ANALYTICS_EVENTS, type ClassificationResult } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPostFn = vi.fn();

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      donors: {
        "classify-restriction": {
          $post: (...args: unknown[]) => mockPostFn(...args),
        },
      },
    },
  },
}));

const mockReadResponseOrThrow = vi.fn();
vi.mock("../lib/http-response", () => ({
  readResponseOrThrow: (...args: unknown[]) => mockReadResponseOrThrow(...args),
  throwIfNotOk: vi.fn().mockResolvedValue(undefined),
}));

const mockCaptureEvent = vi.fn();
vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

// TanStack Query wrapper
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

import { useClassifyRestriction } from "./use-classify-restriction";

const SAMPLE_RESULT: ClassificationResult = {
  netAssetClass: "temporarily_restricted",
  donationRestriction: "restricted",
  restrictionType: "purpose",
  confidence: "high",
  signals: [{ source: "fundType", detail: 'Linked fund type is "temporarily_restricted".' }],
};

describe("useClassifyRestriction", () => {
  beforeEach(() => {
    mockPostFn.mockReset();
    mockReadResponseOrThrow.mockReset();
    mockCaptureEvent.mockReset();
  });

  it("calls the classify-restriction endpoint with fundId", async () => {
    const fakeResponse = Symbol("response");
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: "fund-123" });
    });

    expect(mockPostFn).toHaveBeenCalledWith({
      json: { fundId: "fund-123" },
    });
    expect(mockReadResponseOrThrow).toHaveBeenCalledWith(fakeResponse);
  });

  it("calls the endpoint with grantId", async () => {
    const fakeResponse = Symbol("response");
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ grantId: "grant-456" });
    });

    expect(mockPostFn).toHaveBeenCalledWith({
      json: { grantId: "grant-456" },
    });
  });

  it("calls the endpoint with designation", async () => {
    const fakeResponse = Symbol("response");
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ designation: "endowment fund" });
    });

    expect(mockPostFn).toHaveBeenCalledWith({
      json: { designation: "endowment fund" },
    });
  });

  it("calls the endpoint with date", async () => {
    const fakeResponse = Symbol("response");
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ date: "2026-01-01T00:00:00.000Z" });
    });

    expect(mockPostFn).toHaveBeenCalledWith({
      json: { date: "2026-01-01T00:00:00.000Z" },
    });
  });

  it("omits undefined params from the request body", async () => {
    const fakeResponse = Symbol("response");
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: "fund-1" });
    });

    const call = mockPostFn.mock.calls[0]?.[0] as { json: Record<string, unknown> };
    expect(call.json).not.toHaveProperty("grantId");
    expect(call.json).not.toHaveProperty("designation");
    expect(call.json).not.toHaveProperty("date");
  });

  it("returns the ClassificationResult from readResponseOrThrow", async () => {
    const fakeResponse = {};
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    let returned: ClassificationResult | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ fundId: "fund-1" });
    });

    expect(returned).toEqual(SAMPLE_RESULT);
  });

  it("propagates errors thrown by readResponseOrThrow", async () => {
    const fakeResponse = {};
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ fundId: "fund-1" })).rejects.toThrow("API error");
    });
  });

  it("combines multiple params into one request", async () => {
    const fakeResponse = {};
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        fundId: "fund-1",
        designation: "for the youth program",
      });
    });

    expect(mockPostFn).toHaveBeenCalledWith({
      json: { fundId: "fund-1", designation: "for the youth program" },
    });
  });

  it("captures restrictionClassificationSuggested with netAssetClass on success", async () => {
    const fakeResponse = {};
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockResolvedValue(SAMPLE_RESULT);

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: "fund-1" });
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.restrictionClassificationSuggested,
      { classification: "temporarily_restricted" },
    );
  });

  it("does not capture event when the mutation fails", async () => {
    const fakeResponse = {};
    mockPostFn.mockResolvedValue(fakeResponse);
    mockReadResponseOrThrow.mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() => useClassifyRestriction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ fundId: "fund-1" })).rejects.toThrow("API error");
    });

    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
});
