import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockActivityGet } = vi.hoisted(() => ({
  mockActivityGet: vi.fn(),
}));

const { mockOrgActivityGet } = vi.hoisted(() => ({
  mockOrgActivityGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      activity: {
        $get: mockActivityGet,
        org: {
          $get: mockOrgActivityGet,
        },
      },
    },
  },
}));

import { useEntityActivity, useOrgActivity } from "./use-activity";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("useEntityActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches activity entries for the requested entity", async () => {
    mockActivityGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "activity-1",
              action: "updated",
              entityType: "grant",
              entityId: "grant-1",
              changes: { status: "active" },
              createdAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockActivityGet).toHaveBeenCalledWith({
      query: {
        entityType: "grant",
        entityId: "grant-1",
        page: "1",
        pageSize: "25",
      },
    });
    expect(result.current.data?.data[0]?.action).toBe("updated");
  });

  it("surfaces non-OK activity responses as errors", async () => {
    mockActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ error: "Activity unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Activity unavailable");
  });

  it("does not run when the entity inputs are empty", () => {
    const { result } = renderHook(() => useEntityActivity("grant", ""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockActivityGet).not.toHaveBeenCalled();
  });

  it("surfaces plain text activity failures", async () => {
    mockActivityGet.mockResolvedValue(
      new Response("Temporary outage", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Temporary outage");
  });

  it("surfaces JSON message activity failures", async () => {
    mockActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ message: "Activity request failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Activity request failed");
  });

  it("falls back to a generic error when the response body cannot be parsed", async () => {
    mockActivityGet.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "application/json",
      },
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to a generic error when a plain-text response body cannot be read", async () => {
    mockActivityGet.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "text/plain",
      },
      json: vi.fn(),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to Request failed when JSON body has neither error nor message", async () => {
    mockActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ code: 503 }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to plain string error when plain text body is whitespace", async () => {
    mockActivityGet.mockResolvedValue(
      new Response("   ", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // whitespace-only string → trim().length === 0 → falls to "Request failed"
    expect(result.current.error?.message).toBe("Request failed");
  });
});

describe("useOrgActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches org-wide activity without filters", async () => {
    mockOrgActivityGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "activity-10",
              action: "created",
              entityType: "grant",
              entityId: "grant-1",
              changes: null,
              createdAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useOrgActivity({}), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data[0]?.action).toBe("created");
  });

  it("includes optional filters in the query", async () => {
    mockOrgActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () =>
        useOrgActivity({
          entityType: "grant",
          actorId: "user-1",
          fromDate: "2025-01-01T00:00:00.000Z",
          toDate: "2025-12-31T23:59:59.000Z",
          page: 2,
          pageSize: 10,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockOrgActivityGet).toHaveBeenCalledWith({
      query: expect.objectContaining({
        entityType: "grant",
        actorId: "user-1",
        page: "2",
        pageSize: "10",
      }),
    });
  });

  it("surfaces org activity errors", async () => {
    mockOrgActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgActivity({}), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Forbidden");
  });

  it("includes sortOrder in the query when provided", async () => {
    mockOrgActivityGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgActivity({ sortOrder: "asc" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockOrgActivityGet).toHaveBeenCalledWith({
      query: expect.objectContaining({ sortOrder: "asc" }),
    });
  });
});

describe("readResponseOrThrow — null content-type branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to Request failed when content-type header is absent (null)", async () => {
    // headers.get("content-type") returns null → ?? "" → empty string → not JSON
    // reads as text, but response is not ok
    mockActivityGet.mockResolvedValue({
      ok: false,
      headers: { get: () => null },
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn(),
    });

    const { result } = renderHook(() => useEntityActivity("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });
});
