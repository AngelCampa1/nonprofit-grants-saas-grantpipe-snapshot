import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateReportDefinition,
  useDeleteReportDefinition,
  useReportBuilderMetadata,
  useReportBuilderPreview,
  useReportDefinitions,
  useRunReportDefinition,
  useUpdateReportDefinition,
} from "./use-report-builder";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

const mocks = vi.hoisted(() => ({
  metadataGet: vi.fn(),
  definitionsGet: vi.fn(),
  definitionPost: vi.fn(),
  definitionPatch: vi.fn(),
  definitionDelete: vi.fn(),
  previewPost: vi.fn(),
  runPost: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "report-builder": {
        metadata: { $get: mocks.metadataGet },
        definitions: {
          $get: mocks.definitionsGet,
          $post: mocks.definitionPost,
          ":definitionId": {
            $patch: mocks.definitionPatch,
            $delete: mocks.definitionDelete,
            run: { $post: mocks.runPost },
          },
        },
        preview: { $post: mocks.previewPost },
      },
    },
  },
}));

const { ApiError: RealApiError } =
  await vi.importActual<typeof import("../lib/http-response")>("../lib/http-response");

vi.mock("../lib/http-response", async (importActual) => {
  const actual = await importActual<typeof import("../lib/http-response")>();
  return {
    ...actual,
    readResponseOrThrow: vi.fn(async (response: { json: () => Promise<unknown> }) =>
      response.json(),
    ),
  };
});

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

type MutationForTest = { mutateAsync: (input: unknown) => Promise<unknown> };

describe("use-report-builder", () => {
  beforeEach(() => {
    mocks.runPost.mockReset();
    localStorage.clear();
    vi.mocked(captureEvent).mockClear();
    vi.mocked(captureAppException).mockClear();
  });

  it("loads builder metadata", async () => {
    mocks.metadataGet.mockResolvedValueOnce({
      json: async () => ({ entities: { grants: { label: "Grants", columns: [] } } }),
    });

    const { result } = renderHook(() => useReportBuilderMetadata(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.metadataGet).toHaveBeenCalled();
    expect(result.current.isPlanGated).toBe(false);
  });

  it("sets isPlanGated=true when metadata returns a 403", async () => {
    const planError = new RealApiError("insufficient_plan", 403);
    mocks.metadataGet.mockRejectedValueOnce(planError);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function noRetryWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useReportBuilderMetadata(), { wrapper: noRetryWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPlanGated).toBe(true);
  });

  it("sets isPlanGated=false when metadata succeeds", async () => {
    mocks.metadataGet.mockResolvedValueOnce({
      json: async () => ({ entities: {} }),
    });

    const { result } = renderHook(() => useReportBuilderMetadata(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isPlanGated).toBe(false);
  });

  it("loads saved definitions for an entity", async () => {
    mocks.definitionsGet.mockResolvedValueOnce({
      json: async () => [{ id: "definition-1", entity: "grants" }],
    });

    const { result } = renderHook(() => useReportDefinitions({ entity: "grants" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.definitionsGet).toHaveBeenCalledWith({ query: { entity: "grants" } });
  });

  it("loads all saved definitions without an entity filter", async () => {
    mocks.definitionsGet.mockResolvedValueOnce({ json: async () => [] });

    const { result } = renderHook(() => useReportDefinitions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.definitionsGet).toHaveBeenCalledWith({ query: {} });
  });

  it("does not fetch saved definitions while disabled", async () => {
    mocks.definitionsGet.mockClear();
    const { result } = renderHook(
      () => useReportDefinitions({ entity: "grants" }, { enabled: false }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mocks.definitionsGet).not.toHaveBeenCalled();
  });

  it("posts saved report definitions", async () => {
    mocks.definitionPost.mockResolvedValueOnce({ json: async () => ({ id: "definition-1" }) });

    const { result } = renderHook(() => useCreateReportDefinition(), { wrapper });
    await result.current.mutateAsync({ name: "Grant list", entity: "grants", columns: ["name"] });

    expect(mocks.definitionPost).toHaveBeenCalledWith({
      json: { name: "Grant list", entity: "grants", columns: ["name"] },
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.reportBuilderDefinitionSaved, {
      entity_type: "grants",
      report_type: "custom_report",
      surface: "report_builder",
      column_count: 1,
      custom_field_count: 0,
      filter_count: 0,
      sort_count: 0,
      has_description: false,
    });
  });

  it("previews ad hoc builder definitions", async () => {
    mocks.previewPost.mockResolvedValueOnce({
      json: async () => ({ columns: [], rows: [], totalRows: 0 }),
    });

    const { result } = renderHook(() => useReportBuilderPreview(), { wrapper });
    await result.current.mutateAsync({ entity: "funds", columns: ["name"], limit: 10 });

    expect(mocks.previewPost).toHaveBeenCalledWith({
      json: { entity: "funds", columns: ["name"], limit: 10 },
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.reportBuilderPreviewGenerated, {
      entity_type: "funds",
      report_type: "custom_report",
      surface: "report_builder",
      column_count: 1,
      custom_field_count: 0,
      filter_count: 0,
      sort_count: 0,
      has_description: false,
      limit_bucket: "1_10",
      total_rows_bucket: "0",
    });
  });

  it("buckets preview counts across the safe analytics ranges", async () => {
    const cases = [
      { limit: undefined, totalRows: Number.NaN, limitBucket: "unknown", rowBucket: "unknown" },
      { limit: "20", totalRows: 15, limitBucket: "10_25", rowBucket: "10_25" },
      { limit: 50, totalRows: 50, limitBucket: "25_100", rowBucket: "25_100" },
      { limit: 250, totalRows: 101, limitBucket: "100_plus", rowBucket: "100_plus" },
    ];

    const { result } = renderHook(() => useReportBuilderPreview(), { wrapper });

    for (const testCase of cases) {
      mocks.previewPost.mockResolvedValueOnce({
        json: async () => ({ columns: [], rows: [], totalRows: testCase.totalRows }),
      });
      await result.current.mutateAsync({
        entity: "grants",
        columns: ["name"],
        ...(testCase.limit === undefined ? {} : { limit: testCase.limit }),
        filters: [{ field: "name", operator: "contains", value: "Grant" }],
        sort: [{ field: "name", direction: "asc" }],
      });
      expect(captureEvent).toHaveBeenLastCalledWith(
        ANALYTICS_EVENTS.reportBuilderPreviewGenerated,
        expect.objectContaining({
          filter_count: 1,
          sort_count: 1,
          limit_bucket: testCase.limitBucket,
          total_rows_bucket: testCase.rowBucket,
        }),
      );
    }
  });

  it("updates and deletes saved definitions", async () => {
    mocks.definitionPatch.mockResolvedValueOnce({ json: async () => ({ id: "definition-1" }) });
    mocks.definitionDelete.mockResolvedValueOnce({ json: async () => ({ success: true }) });

    const update = renderHook(() => useUpdateReportDefinition("definition-1"), { wrapper });
    const remove = renderHook(() => useDeleteReportDefinition(), { wrapper });

    await update.result.current.mutateAsync({ name: "Renamed report" });
    await remove.result.current.mutateAsync("definition-1");

    expect(mocks.definitionPatch).toHaveBeenCalledWith({
      param: { definitionId: "definition-1" },
      json: { name: "Renamed report" },
    });
    expect(mocks.definitionDelete).toHaveBeenCalledWith({
      param: { definitionId: "definition-1" },
    });
  });

  it("runs the saved definition without duplicating canonical server analytics", async () => {
    mocks.runPost.mockResolvedValueOnce({ json: async () => ({ id: "report-1" }) });

    const { result } = renderHook(() => useRunReportDefinition(), { wrapper });
    await result.current.mutateAsync({
      definitionId: "definition-9",
      title: "Board grant report",
    });

    expect(mocks.runPost).toHaveBeenCalledWith({
      param: { definitionId: "definition-9" },
      json: {
        title: "Board grant report",
        attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(captureEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.reportGenerated,
      expect.anything(),
    );
  });

  it("reuses an export attempt after failure and rotates it after success or payload change", async () => {
    mocks.runPost
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ json: async () => ({ id: "report-1" }) });
    const { result } = renderHook(() => useRunReportDefinition(), { wrapper });
    const input = { definitionId: "definition-9", title: "Board grant report" };

    await expect(result.current.mutateAsync(input)).rejects.toThrow("offline");
    await result.current.mutateAsync({ ...input, title: "  Board grant report  " });
    await result.current.mutateAsync(input);
    await result.current.mutateAsync({ ...input, title: "Changed title" });

    const attempts = mocks.runPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).toBe(attempts[1]);
    expect(attempts[2]).not.toBe(attempts[1]);
    expect(attempts[3]).not.toBe(attempts[2]);
  });

  it("keeps separate attempt ids for interleaved export payloads", async () => {
    let rejectFirst!: (error: Error) => void;
    const firstResponse = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    mocks.runPost
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue({ json: async () => ({ id: "report-1" }) });
    const { result } = renderHook(() => useRunReportDefinition(), { wrapper });
    const first = { definitionId: "definition-1", title: "First" };
    const second = { definitionId: "definition-2", title: "Second" };

    const firstAttempt = result.current.mutateAsync(first);
    await result.current.mutateAsync(second);
    rejectFirst(new Error("response lost"));
    await expect(firstAttempt).rejects.toThrow("response lost");
    await result.current.mutateAsync(first);

    const attempts = mocks.runPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).toBe(attempts[2]);
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("keeps concurrent identical exports independent and retries the failed invocation", async () => {
    let resolveFirst!: (value: { json: () => Promise<{ id: string }> }) => void;
    let rejectSecond!: (error: Error) => void;
    const firstResponse = new Promise<{ json: () => Promise<{ id: string }> }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<never>((_resolve, reject) => {
      rejectSecond = reject;
    });
    mocks.runPost
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse)
      .mockResolvedValue({ json: async () => ({ id: "report-retried" }) });
    const { result } = renderHook(() => useRunReportDefinition(), { wrapper });
    const input = { definitionId: "definition-1", title: "Same report" };

    const successfulInvocation = result.current.mutateAsync(input);
    const lostInvocation = result.current.mutateAsync(input);
    resolveFirst({ json: async () => ({ id: "report-first" }) });
    await successfulInvocation;
    rejectSecond(new Error("response lost"));
    await expect(lostInvocation).rejects.toThrow("response lost");
    await result.current.mutateAsync(input);

    const attempts = mocks.runPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(attempts[2]).toBe(attempts[1]);
  });

  it("starts a new export attempt when the active entity changes after a lost response", async () => {
    mocks.runPost
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ json: async () => ({ id: "report-entity-2" }) });
    localStorage.setItem("grantpipe.activeEntityId", "entity-1");
    const { result } = renderHook(() => useRunReportDefinition(), { wrapper });
    const input = { definitionId: "definition-1", title: "Same report" };

    await expect(result.current.mutateAsync(input)).rejects.toThrow("response lost");
    localStorage.setItem("grantpipe.activeEntityId", "entity-2");
    await result.current.mutateAsync(input);

    const attempts = mocks.runPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("captures safe failure telemetry without raw report names", async () => {
    const error = new Error("Server unavailable");
    mocks.definitionPost.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCreateReportDefinition(), { wrapper });

    await expect(
      result.current.mutateAsync({
        name: "Major donor emails",
        description: "Contains free form details",
        entity: "donors",
        columns: ["displayName", "email"],
        customFieldIds: ["field-1"],
      }),
    ).rejects.toThrow("Server unavailable");

    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.reportBuilderOperationFailed, {
      entity_type: "donors",
      report_type: "custom_report",
      surface: "report_builder",
      operation: "definition_save",
      failure_type: "api_error",
      column_count: 2,
      custom_field_count: 1,
      filter_count: 0,
      sort_count: 0,
      has_description: true,
    });
    expect(captureAppException).toHaveBeenCalledWith(error, {
      tags: {
        feature: "report_builder",
        operation: "definition_save",
      },
      extra: {
        entity_type: "donors",
        column_count: 2,
        custom_field_count: 1,
        filter_count: 0,
        sort_count: 0,
        has_description: true,
      },
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Major donor emails");
    expect(JSON.stringify(vi.mocked(captureAppException).mock.calls)).not.toContain(
      "Contains free form details",
    );
  });

  it("captures update, delete, preview, and export failures", async () => {
    const failures: Array<{
      useMutationHook: () => unknown;
      setup: () => void;
      run: (mutation: MutationForTest) => Promise<unknown>;
      operation: string;
    }> = [
      {
        useMutationHook: () => useUpdateReportDefinition("definition-1"),
        setup: () => mocks.definitionPatch.mockRejectedValueOnce(new Error("Update failed")),
        run: (mutation) => mutation.mutateAsync({ entity: "grants", columns: ["name"] }),
        operation: "definition_update",
      },
      {
        useMutationHook: () => useDeleteReportDefinition(),
        setup: () => mocks.definitionDelete.mockRejectedValueOnce(new Error("Delete failed")),
        run: (mutation) => mutation.mutateAsync("definition-1"),
        operation: "definition_delete",
      },
      {
        useMutationHook: () => useReportBuilderPreview(),
        setup: () => mocks.previewPost.mockRejectedValueOnce(new Error("Preview failed")),
        run: (mutation) => mutation.mutateAsync({ entity: "grants", columns: ["name"] }),
        operation: "preview",
      },
      {
        useMutationHook: () => useRunReportDefinition(),
        setup: () => mocks.runPost.mockRejectedValueOnce(new Error("Export failed")),
        run: (mutation) => mutation.mutateAsync({ definitionId: "definition-1" }),
        operation: "export",
      },
    ];

    for (const failure of failures) {
      failure.setup();
      const { result } = renderHook(failure.useMutationHook, { wrapper });

      await expect(failure.run(result.current as MutationForTest)).rejects.toThrow();

      expect(captureEvent).toHaveBeenLastCalledWith(
        ANALYTICS_EVENTS.reportBuilderOperationFailed,
        expect.objectContaining({
          operation: failure.operation,
          failure_type: "api_error",
        }),
      );
      expect(captureAppException).toHaveBeenLastCalledWith(expect.any(Error), {
        tags: {
          feature: "report_builder",
          operation: failure.operation,
        },
        extra: expect.any(Object),
      });
    }
  });
});
