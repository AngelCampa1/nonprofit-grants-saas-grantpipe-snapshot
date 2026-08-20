import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProgressGet, mockProgressPatch } = vi.hoisted(() => ({
  mockProgressGet: vi.fn(),
  mockProgressPatch: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      help: {
        progress: {
          $get: mockProgressGet,
          ":guideKey": {
            $patch: mockProgressPatch,
          },
        },
      },
    },
  },
}));

import { useGuideProgress, useGuideProgressMutation } from "./use-guide-progress";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(client = createClient()) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("guide progress hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches guide progress", async () => {
    mockProgressGet.mockResolvedValue(
      new Response(JSON.stringify([{ guideKey: "first_setup", status: "completed" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useGuideProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.guideKey).toBe("first_setup");
  });

  it("uses API message errors when loading progress fails", async () => {
    mockProgressGet.mockResolvedValue(
      new Response(JSON.stringify({ message: "Please sign in again" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useGuideProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Please sign in again"));
  });

  it("falls back when an error response is not JSON", async () => {
    mockProgressGet.mockResolvedValue(new Response("nope", { status: 500 }));

    const { result } = renderHook(() => useGuideProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Request failed"));
  });

  it("optimistically updates and rolls back on failure", async () => {
    const client = createClient();
    client.setQueryData(
      ["guide-progress"],
      [
        {
          guideKey: "first_setup",
          status: "in_progress",
          lastStep: null,
          completedAt: null,
          dismissedAt: null,
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    );
    mockProgressPatch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Save failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useGuideProgressMutation(), {
      wrapper: createWrapper(client),
    });

    await expect(
      result.current.mutateAsync({
        guideKey: "first_setup",
        data: { status: "completed" },
      }),
    ).rejects.toThrow("Save failed");

    expect(client.getQueryData<Array<{ status: string }>>(["guide-progress"])?.[0]?.status).toBe(
      "in_progress",
    );
  });

  it("optimistically stores dismissed progress before the server responds", async () => {
    let resolvePatch: (response: Response) => void = () => undefined;
    mockProgressPatch.mockReturnValue(new Promise((resolve) => (resolvePatch = resolve)));
    const client = createClient();

    const { result } = renderHook(() => useGuideProgressMutation(), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({
      guideKey: "open_pdf_report",
      data: { status: "dismissed", lastStep: "checklist" },
    });

    await waitFor(() =>
      expect(client.getQueryData<Array<{ status: string }>>(["guide-progress"])?.[0]?.status).toBe(
        "dismissed",
      ),
    );
    expect(
      client.getQueryData<Array<{ dismissedAt: string | null }>>(["guide-progress"])?.[0]
        ?.dismissedAt,
    ).toEqual(expect.any(String));

    resolvePatch(
      new Response(
        JSON.stringify({
          guideKey: "open_pdf_report",
          status: "dismissed",
          lastStep: "checklist",
          completedAt: null,
          dismissedAt: "2026-04-23T12:00:00.000Z",
          updatedAt: "2026-04-23T12:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });
});
