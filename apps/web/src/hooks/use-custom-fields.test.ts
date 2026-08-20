import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { useEntityCustomFields, useUpsertCustomFieldValue } from "./use-custom-fields";

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

describe("useEntityCustomFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("fetches custom field values for the requested entity", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            definition: {
              id: "field-1",
              name: "Program Area",
              fieldType: "text",
            },
            value: {
              id: "value-1",
              fieldId: "field-1",
              entityId: "grant-1",
              value: "STEM",
            },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/org/custom-fields/grant/grant-1/values", {
      credentials: "include",
      headers: { "X-Org-Id": "org-42" },
    });
    expect(result.current.data?.[0]?.definition.name).toBe("Program Area");
  });

  it("surfaces non-OK responses as query errors", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Custom fields unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Custom fields unavailable");
  });

  it("does not fetch when the entity inputs are incomplete", () => {
    const { result } = renderHook(() => useEntityCustomFields("grant", ""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces plain text custom field failures", async () => {
    fetchMock.mockResolvedValue(
      new Response("Custom fields timed out", {
        status: 504,
        headers: { "content-type": "text/plain" },
      }),
    );

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Custom fields timed out");
  });

  it("surfaces JSON message custom field failures", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Custom field request failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Custom field request failed");
  });

  it("falls back to a generic error when the response body cannot be parsed", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "application/json",
      },
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to a generic error when a plain-text response body cannot be read", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "text/plain",
      },
      json: vi.fn(),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useEntityCustomFields("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });
});

describe("useUpsertCustomFieldValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("sends a PUT request with the field value and returns the result", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    const updatedRecord = {
      definition: { id: "field-1", name: "Program Area", fieldType: "text" },
      value: { id: "value-1", fieldId: "field-1", entityId: "grant-1", value: "STEM" },
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(updatedRecord), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useUpsertCustomFieldValue("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    let data: unknown;
    await result.current.mutateAsync({ fieldId: "field-1", value: "STEM" }).then((d) => {
      data = d;
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/org/custom-fields/grant/grant-1/values/field-1",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "application/json", "X-Org-Id": "org-42" },
        body: JSON.stringify({ value: "STEM" }),
        credentials: "include",
      }),
    );
    expect(data).toEqual(updatedRecord);
  });

  it("throws on a non-OK response with a JSON error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Field not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useUpsertCustomFieldValue("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync({ fieldId: "field-99", value: "X" })).rejects.toThrow(
      "Field not found",
    );
  });
});
