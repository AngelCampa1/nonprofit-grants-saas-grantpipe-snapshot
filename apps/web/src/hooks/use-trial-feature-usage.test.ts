import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTrialFeatureUsage } from "./use-trial-feature-usage";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("useTrialFeatureUsage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("requests /api/org/trial-feature-usage with credentials and returns normalized data", async () => {
    const mockFetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void url;
        void init;
        return jsonResponse({ highestTier: "audit_ready", tiersUsed: ["growth", "audit_ready"] });
      },
    );
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useTrialFeatureUsage(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall!;
    expect(url).toBe("/api/org/trial-feature-usage");
    expect(init?.credentials).toBe("include");
    expect(result.current.data).toEqual({
      highestTier: "audit_ready",
      tiersUsed: ["growth", "audit_ready"],
    });
  });

  it("filters out unknown plan tiers in the response", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ highestTier: "unknown_tier", tiersUsed: ["growth", "bogus", null, 5] }),
    ) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useTrialFeatureUsage(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ highestTier: null, tiersUsed: ["growth"] });
  });

  it("normalizes a missing tiersUsed field to an empty array", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ highestTier: null }),
    ) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useTrialFeatureUsage(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ highestTier: null, tiersUsed: [] });
  });

  it("surfaces an error when the request fails", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useTrialFeatureUsage(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toContain("status 500");
  });

  it("uses orgId in the query key for cache scoping", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ highestTier: "growth", tiersUsed: ["growth"] }),
    ) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useTrialFeatureUsage({ orgId: "org-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.highestTier).toBe("growth");
  });

  it("does not fetch when disabled", () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    renderHook(() => useTrialFeatureUsage({ enabled: false }), { wrapper: createWrapper() });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
