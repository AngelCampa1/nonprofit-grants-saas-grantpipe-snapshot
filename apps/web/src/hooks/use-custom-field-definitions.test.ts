import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  useCreateCustomFieldDefinition,
  useCustomFieldDefinitions,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
  type CustomFieldDefinition,
} from "./use-custom-field-definitions";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const sample: CustomFieldDefinition = {
  id: "def-1",
  orgId: "org-1",
  entityType: "contact",
  name: "Preferred Name",
  fieldType: "text",
  options: null,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useCustomFieldDefinitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("lists definitions for the entity type", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    fetchMock.mockResolvedValue(jsonResponse([sample]));

    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/org/custom-fields?entityType=contact", {
      credentials: "include",
      headers: { "X-Org-Id": "org-42" },
    });
    expect(result.current.data).toEqual([sample]);
  });

  it("surfaces JSON error field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "denied" }, 403));
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("denied");
  });

  it("surfaces JSON message field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "bad request" }, 400));
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("bad request");
  });

  it("surfaces plain text failures", async () => {
    fetchMock.mockResolvedValue(
      new Response("gateway down", { status: 502, headers: { "content-type": "text/plain" } }),
    );
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("gateway down");
  });

  it("falls back to generic error when the body cannot be parsed", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: vi.fn().mockRejectedValue(new Error("bad")),
      text: vi.fn(),
    });
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to generic error when plain text read fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      headers: { get: () => "text/plain" },
      json: vi.fn(),
      text: vi.fn().mockRejectedValue(new Error("nope")),
    });
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to Request failed when JSON body has neither error nor message", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 503 }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to Request failed when plain text body is whitespace-only", async () => {
    fetchMock.mockResolvedValue(
      new Response("   ", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed");
  });

  it("falls back to Request failed when content-type header is absent (null ?? '' branch)", async () => {
    // headers.get returns null → ?? "" → empty string → not "application/json" → reads as text
    fetchMock.mockResolvedValue({
      ok: false,
      headers: { get: () => null },
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn(),
    });
    const { result } = renderHook(() => useCustomFieldDefinitions("contact"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed");
  });
});

describe("useCreateCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs and returns the created definition", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    fetchMock.mockResolvedValue(jsonResponse(sample, 201));
    const { result } = renderHook(() => useCreateCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });

    const created = await result.current.mutateAsync({
      entityType: "contact",
      name: "Preferred Name",
      fieldType: "text",
      sortOrder: 0,
    });

    expect(created).toEqual(sample);
    expect(fetchMock).toHaveBeenCalledWith("/api/org/custom-fields", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Org-Id": "org-42" },
      body: JSON.stringify({
        entityType: "contact",
        name: "Preferred Name",
        fieldType: "text",
        sortOrder: 0,
      }),
      credentials: "include",
    });
  });

  it("throws with server error message on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 400));
    const { result } = renderHook(() => useCreateCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        entityType: "contact",
        name: "x",
        fieldType: "text",
        sortOrder: 0,
      }),
    ).rejects.toThrow("nope");
  });
});

describe("useUpdateCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCHes the definition", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    fetchMock.mockResolvedValue(jsonResponse({ ...sample, name: "New" }));
    const { result } = renderHook(() => useUpdateCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });

    const updated = await result.current.mutateAsync({
      definitionId: "def-1",
      entityType: "contact",
      data: { name: "New" },
    });

    expect(updated.name).toBe("New");
    expect(fetchMock).toHaveBeenCalledWith("/api/org/custom-fields/def-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", "X-Org-Id": "org-42" },
      body: JSON.stringify({ name: "New" }),
      credentials: "include",
    });
  });
});

describe("useDeleteCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETEs the definition and resolves", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useDeleteCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });

    const outcome = await result.current.mutateAsync({
      definitionId: "def-1",
      entityType: "contact",
    });

    expect(outcome).toEqual({ definitionId: "def-1", entityType: "contact" });
    expect(fetchMock).toHaveBeenCalledWith("/api/org/custom-fields/def-1", {
      method: "DELETE",
      credentials: "include",
      headers: { "X-Org-Id": "org-42" },
    });
  });

  it("throws on non-OK delete response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "denied" }, 403));
    const { result } = renderHook(() => useDeleteCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ definitionId: "def-1", entityType: "contact" }),
    ).rejects.toThrow("denied");
  });
});

describe("custom field definition cache invalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates custom-fields when definitions are created, updated, or deleted", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    fetchMock.mockImplementation(() => jsonResponse(sample, 201));
    const createResult = renderHook(() => useCreateCustomFieldDefinition(), { wrapper });
    await createResult.result.current.mutateAsync({
      entityType: "contact",
      name: "Preferred Name",
      fieldType: "text",
      sortOrder: 0,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["custom-fields"] });
    });

    invalidateSpy.mockClear();
    fetchMock.mockImplementation(() => jsonResponse({ ...sample, name: "Updated" }, 200));
    const updateResult = renderHook(() => useUpdateCustomFieldDefinition(), { wrapper });
    await updateResult.result.current.mutateAsync({
      definitionId: "def-1",
      entityType: "contact",
      data: { name: "Updated" },
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["custom-fields"] });
    });

    invalidateSpy.mockClear();
    fetchMock.mockImplementation(() => new Response(null, { status: 204 }));
    const deleteResult = renderHook(() => useDeleteCustomFieldDefinition(), { wrapper });
    await deleteResult.result.current.mutateAsync({
      definitionId: "def-1",
      entityType: "contact",
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["custom-fields"] });
    });
  });
});
