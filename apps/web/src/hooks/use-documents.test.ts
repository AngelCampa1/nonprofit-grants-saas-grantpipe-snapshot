import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureEvent, mockDocumentsGet, mockCaptureAppException } = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
  mockDocumentsGet: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

const { mockReportAiUsageCap } = vi.hoisted(() => ({
  mockReportAiUsageCap: vi.fn(() => false),
}));

vi.mock("../components/dialogs/ai-usage-cap-provider", () => ({
  useReportAiUsageCap: () => mockReportAiUsageCap,
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      documents: {
        $get: mockDocumentsGet,
      },
    },
  },
}));

import { useDeleteDocument, useEntityDocuments, useUploadDocument } from "./use-documents";
import { ApiError } from "../lib/http-response";
import { getAiUsageCapPayload } from "../lib/api-errors";

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

describe("useEntityDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches documents for the requested entity", async () => {
    mockDocumentsGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "doc-1",
              filename: "appeal.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1234,
              createdAt: "2026-04-01T00:00:00.000Z",
              uploadedBy: "user-1",
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

    const { result } = renderHook(() => useEntityDocuments("contact", "contact-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDocumentsGet).toHaveBeenCalledWith({
      query: {
        entityType: "contact",
        entityId: "contact-1",
        page: "1",
        pageSize: "25",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    });
    expect(result.current.data?.data[0]?.filename).toBe("appeal.pdf");
  });
});

describe("useUploadDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReportAiUsageCap.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a document with form data", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "doc-2" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    const file = new File(["hello"], "appeal.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "X-Org-Id": "org-42" },
      }),
    );

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(requestBody.get("entityType")).toBe("grant");
    expect(requestBody.get("entityId")).toBe("grant-1");
    expect(requestBody.get("file")).toBe(file);
    expect(mockCaptureEvent).toHaveBeenCalledWith("document_uploaded", {
      entity_type: "grant",
      mime_type: "application/pdf",
      size_bucket: "under_10kb",
    });
  });

  it.each([
    [10 * 1024, "10kb_100kb"],
    [100 * 1024, "100kb_1mb"],
    [1024 * 1024, "1mb_10mb"],
    [10 * 1024 * 1024, "over_10mb"],
  ])("tracks uploaded document size bucket %s as %s", async (sizeBytes, sizeBucket) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "doc-2" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    const file = new File(["x"], "appeal.pdf");
    Object.defineProperty(file, "size", { value: sizeBytes });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_uploaded", {
      entity_type: "grant",
      mime_type: "unknown",
      size_bucket: sizeBucket,
    });
  });

  it("throws the server error message when upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Upload failed");

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_upload_failed", {
      entity_type: "fund",
      mime_type: "application/pdf",
      size_bucket: "under_10kb",
      failure_type: "api_error",
    });
  });

  it("tracks fetch failures without leaking document metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("offline");

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_upload_failed", {
      entity_type: "fund",
      mime_type: "application/pdf",
      size_bucket: "under_10kb",
      failure_type: "unknown_error",
    });
  });

  it("throws the server message field when upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Upload blocked" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Upload blocked");

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_upload_failed", {
      entity_type: "fund",
      mime_type: "application/pdf",
      size_bucket: "under_10kb",
      failure_type: "api_error",
    });
  });

  it("falls back to plain text error responses when upload fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Upload unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Upload unavailable");

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_upload_failed", {
      entity_type: "fund",
      mime_type: "application/pdf",
      size_bucket: "under_10kb",
      failure_type: "api_error",
    });
  });

  it("falls back to a generic message when the response body cannot be read", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: {
        get: () => "text/plain",
      },
      text: vi.fn().mockRejectedValue(new Error("network read failed")),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Request failed");
  });

  it("falls back to a generic message when invalid JSON cannot be parsed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: {
        get: () => "application/json",
      },
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUploadDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync(new File(["hello"], "appeal.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Request failed");
  });

  it("upload: 402 ai_usage_cap_reached produces a detectable ApiError and suppresses captureAppException", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    const capBody = {
      error: "ai_usage_cap_reached",
      errorCode: "ai_usage_cap_reached",
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(capBody), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    mockReportAiUsageCap.mockReturnValue(true);

    const { result } = renderHook(() => useUploadDocument("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    const thrownError = await result.current
      .mutateAsync(new File(["hello"], "award.pdf", { type: "application/pdf" }))
      .catch((e: unknown) => e);

    expect(thrownError).toBeInstanceOf(ApiError);
    const apiErr = thrownError as ApiError;
    expect(apiErr.status).toBe(402);
    expect(apiErr.errorCode).toBe("ai_usage_cap_reached");
    expect(getAiUsageCapPayload(apiErr)).not.toBeNull();
    expect(mockReportAiUsageCap).toHaveBeenCalledWith(apiErr);
    expect(mockCaptureAppException).not.toHaveBeenCalled();
  });
});

describe("useDeleteDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes a document by id with org context", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDeleteDocument("grant", "grant-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync("doc-9");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc-9",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: { "X-Org-Id": "org-42" },
      }),
    );
  });

  it("throws the server error message when delete fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Delete forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDeleteDocument("fund", "fund-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("doc-9")).rejects.toThrow("Delete forbidden");
  });
});
