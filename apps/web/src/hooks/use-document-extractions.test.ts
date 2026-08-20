import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureEvent, mockCaptureAppException } = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
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

import {
  isActiveDocumentExtractionStatus,
  useCommitDocumentExtraction,
  useDocumentExtraction,
  useRecordDocumentExtractionAction,
  useStartDocumentExtraction,
} from "./use-document-extractions";
import { ApiError } from "../lib/http-response";
import { getAiUsageCapPayload } from "../lib/api-errors";

it("polls while a validated provider result is waiting to materialize", () => {
  expect(isActiveDocumentExtractionStatus("provider_result_pending")).toBe(true);
  expect(isActiveDocumentExtractionStatus("ready_for_review")).toBe(false);
});

function createWrapper(
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("document extraction hooks", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockReportAiUsageCap.mockReturnValue(false);
    localStorage.setItem("grantpipe.activeOrgId", "org-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starts extraction and invalidates the detail query", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "extraction-1", status: "pending" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          documentId: "document-1",
          attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
        }),
      ).resolves.toEqual({
        id: "extraction-1",
        status: "pending",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/document-extractions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Org-Id": "org-1" },
        body: JSON.stringify({
          documentId: "document-1",
          attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
        }),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["document-extraction", "extraction-1"],
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_started", {
      intake_surface: "document_extraction",
      status: "pending",
    });
  });

  it("reuses one generated attempt id when a legacy document start is retried", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "extraction-1", status: "pending" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("document-1")).rejects.toThrow("response lost");
    await expect(result.current.mutateAsync("document-1")).resolves.toMatchObject({
      id: "extraction-1",
    });

    const bodies = fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      return JSON.parse(String(init.body)) as { documentId: string; attemptId?: string };
    });
    expect(bodies[0]).toMatchObject({
      documentId: "document-1",
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("loads extraction detail and polls active statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "extraction-1", documentId: "doc-1", status: "pending" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDocumentExtraction("extraction-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe("pending");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/document-extractions/extraction-1",
      expect.objectContaining({ credentials: "include", headers: { "X-Org-Id": "org-1" } }),
    );
  });

  it("does not fetch detail without an extraction id", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDocumentExtraction(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to generic errors for invalid JSON API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => "application/json" },
        json: vi.fn().mockRejectedValue(new Error("bad json")),
      }),
    );

    const { result } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("document-1")).rejects.toThrow("Request failed");
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_failed", {
      stage: "start",
      failure_type: "api_error",
    });
  });

  it("uses server JSON error messages and generic non-JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Extraction limit reached" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { result, rerender } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("document-1")).rejects.toThrow(
      "Extraction limit reached",
    );
    expect(mockCaptureEvent).toHaveBeenLastCalledWith("award_intake_failed", {
      stage: "start",
      failure_type: "api_error",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("nope", { status: 500 })));
    rerender();

    await expect(result.current.mutateAsync("document-1")).rejects.toThrow("Request failed");
    expect(mockCaptureEvent).toHaveBeenLastCalledWith("award_intake_failed", {
      stage: "start",
      failure_type: "api_error",
    });
  });

  it("tracks network failures as unknown award intake failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("document-1")).rejects.toThrow("offline");
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_failed", {
      stage: "start",
      failure_type: "unknown_error",
    });
  });

  it("returns successful text responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("accepted", { status: 200 })));

    const { result } = renderHook(() => useRecordDocumentExtractionAction("extraction-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ fieldId: "field-1", action: "accept" }),
    ).resolves.toBe("accepted");
  });

  it("records actions and invalidates extraction detail", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "action-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRecordDocumentExtractionAction("extraction 1"), {
      wrapper: createWrapper(client),
    });

    const payload = { fieldId: "field-1", action: "map_existing" as const, mappedEntityId: "g-1" };
    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/document-extractions/extraction%201/actions",
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["document-extraction", "extraction 1"],
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_field_actioned", {
      action: "map_existing",
      field_destination_type: "unknown",
    });
  });

  it("commits extraction and invalidates related grant queries", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ grantId: "grant-1", funderId: "funder-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCommitDocumentExtraction("extraction-1"), {
      wrapper: createWrapper(client),
    });

    const payload = {
      funderDecision: { action: "create_new" as const },
      grantDecision: { action: "map_existing" as const, existingId: "grant-old" },
      requiredGrantBasics: { name: "Award", amountCents: 10000 },
    };
    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/document-extractions/extraction-1/commit",
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["document-extraction", "extraction-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["funders"] });
    // The committed grant is tied to a (created or reused) funder, which getFunder
    // embeds via { grants: true } and the funder "Grant History" tab renders from
    // the ["funder", id] query — refresh the funder detail caches too.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["funder"] });
    // Committing an award intake inserts reporting_requirement rows carrying
    // dueDates that the calendar embeds as deadline items (calendar-overview is
    // built from reportingRequirements[].dueDate). Refresh it too, or those
    // deadlines stay missing from the calendar until a reload.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendar-overview"] });
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_committed", {
      funder_decision: "create_new",
      grant_decision: "map_existing",
    });
  });

  it("tracks failed field action and commit stages without record ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Action rejected" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Commit rejected" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        ),
    );

    const actionHook = renderHook(() => useRecordDocumentExtractionAction("extraction-1"), {
      wrapper: createWrapper(),
    });
    await expect(
      actionHook.result.current.mutateAsync({
        fieldId: "field-1",
        action: "edit",
        mappedEntityType: "grant",
      }),
    ).rejects.toThrow("Action rejected");

    const commitHook = renderHook(() => useCommitDocumentExtraction("extraction-1"), {
      wrapper: createWrapper(),
    });
    await expect(
      commitHook.result.current.mutateAsync({
        funderDecision: { action: "map_existing", existingId: "funder-1" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Award" },
      }),
    ).rejects.toThrow("Commit rejected");

    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_failed", {
      stage: "field_action",
      failure_type: "api_error",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("award_intake_failed", {
      stage: "commit",
      failure_type: "api_error",
    });
  });

  it("start: 402 ai_usage_cap_reached produces a detectable ApiError and suppresses captureAppException", async () => {
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

    const { result } = renderHook(() => useStartDocumentExtraction(), {
      wrapper: createWrapper(),
    });

    const thrownError = await result.current.mutateAsync("document-1").catch((e: unknown) => e);

    expect(thrownError).toBeInstanceOf(ApiError);
    const apiErr = thrownError as ApiError;
    expect(apiErr.status).toBe(402);
    expect(apiErr.errorCode).toBe("ai_usage_cap_reached");
    expect(getAiUsageCapPayload(apiErr)).not.toBeNull();
    expect(mockReportAiUsageCap).toHaveBeenCalledWith(apiErr);
    expect(mockCaptureAppException).not.toHaveBeenCalled();
  });

  it("commit: 402 ai_usage_cap_reached produces a detectable ApiError and suppresses captureAppException", async () => {
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

    const { result } = renderHook(() => useCommitDocumentExtraction("extraction-1"), {
      wrapper: createWrapper(),
    });

    const thrownError = await result.current
      .mutateAsync({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Award" },
      })
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
