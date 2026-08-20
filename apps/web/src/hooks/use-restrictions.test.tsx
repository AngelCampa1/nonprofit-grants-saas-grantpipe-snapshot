import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  restrictionKeys,
  useCreateRestrictionAddition,
  useCreateRestrictionRelease,
  useCreateRestrictionTerm,
  useDeleteRestrictionTerm,
  useGenerateRestrictedRollforward,
  useLinkRestrictionEvidence,
  useRestrictionAlerts,
  useRestrictionTerms,
  useUpdateRestrictionTerm,
} from "./use-restrictions";

const hoisted = vi.hoisted(() => ({
  termsGet: vi.fn(),
  termsPost: vi.fn(),
  termPatch: vi.fn(),
  termDelete: vi.fn(),
  additionsPost: vi.fn(),
  releasesPost: vi.fn(),
  evidencePost: vi.fn(),
  alertsGet: vi.fn(),
  rollforwardPost: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      restrictions: {
        terms: Object.assign(hoisted.termsGet, {
          $get: hoisted.termsGet,
          $post: hoisted.termsPost,
          ":termId": {
            $patch: hoisted.termPatch,
            $delete: hoisted.termDelete,
            additions: { $post: hoisted.additionsPost },
            releases: { $post: hoisted.releasesPost },
          },
        }),
        releases: {
          ":releaseId": {
            evidence: { $post: hoisted.evidencePost },
          },
        },
        alerts: { $get: hoisted.alertsGet },
        reports: { rollforward: { $post: hoisted.rollforwardPost } },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";

const mockCaptureEvent = vi.mocked(captureEvent);
const mockOnMutationError = vi.mocked(onMutationError);

function response(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function wrapper(queryClient: QueryClient) {
  return function TestWrapper(props: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("restriction hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    hoisted.termsGet.mockResolvedValue(response({ data: [] }));
    hoisted.termsPost.mockResolvedValue(response({ id: "term-1" }));
    hoisted.termPatch.mockResolvedValue(response({ id: "term-1" }));
    hoisted.termDelete.mockResolvedValue(response({ id: "term-1" }));
    hoisted.additionsPost.mockResolvedValue(response({ id: "addition-1" }));
    hoisted.releasesPost.mockResolvedValue(response({ release: { id: "release-1" } }));
    hoisted.evidencePost.mockResolvedValue(response({ id: "evidence-1" }));
    hoisted.alertsGet.mockResolvedValue(response({ data: [] }));
    hoisted.rollforwardPost.mockResolvedValue(response({ report: { id: "report-1" } }));
  });

  it("builds stable query keys and fetches terms and alerts with optional filters", async () => {
    expect(restrictionKeys.terms({ page: 1, pageSize: 50 })).toEqual([
      "restrictions",
      "terms",
      { page: 1, pageSize: 50 },
    ]);

    renderHook(
      () =>
        useRestrictionTerms({
          page: 2,
          pageSize: 10,
          fundId: "fund-1",
          grantId: "grant-1",
          donationId: "donation-1",
          sourceDocumentId: "doc-1",
          restrictionType: "purpose",
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(hoisted.termsGet).toHaveBeenCalled());
    expect(hoisted.termsGet).toHaveBeenCalledWith({
      query: expect.objectContaining({
        page: "2",
        pageSize: "10",
        fundId: "fund-1",
        restrictionType: "purpose",
      }),
    });

    renderHook(
      () =>
        useRestrictionAlerts({
          fundId: "fund-1",
          grantId: "grant-1",
          alertType: "release_without_support",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-01-31T00:00:00.000Z",
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(hoisted.alertsGet).toHaveBeenCalled());
    expect(hoisted.alertsGet).toHaveBeenCalledWith({
      query: expect.objectContaining({ alertType: "release_without_support" }),
    });
  });

  it("does not fetch disabled queries", async () => {
    renderHook(() => useRestrictionTerms({ page: 1, pageSize: 50 }, { enabled: false }), {
      wrapper: wrapper(queryClient),
    });
    renderHook(() => useRestrictionAlerts({}, { enabled: false }), {
      wrapper: wrapper(queryClient),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hoisted.termsGet).not.toHaveBeenCalled();
    expect(hoisted.alertsGet).not.toHaveBeenCalled();
  });

  it("omits optional query filters when they are not provided", async () => {
    renderHook(() => useRestrictionTerms({ page: 1, pageSize: 50 }), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(hoisted.termsGet).toHaveBeenCalled());
    expect(hoisted.termsGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "50" },
    });

    renderHook(() => useRestrictionAlerts({}), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(hoisted.alertsGet).toHaveBeenCalled());
    expect(hoisted.alertsGet).toHaveBeenCalledWith({ query: {} });
  });

  it("runs all mutation hooks and invalidates restriction data", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const createTerm = renderHook(() => useCreateRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;
    const updateTerm = renderHook(() => useUpdateRestrictionTerm("term-1"), {
      wrapper: wrapper(queryClient),
    }).result;
    const deleteTerm = renderHook(() => useDeleteRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;
    const createAddition = renderHook(() => useCreateRestrictionAddition("term-1"), {
      wrapper: wrapper(queryClient),
    }).result;
    const createRelease = renderHook(() => useCreateRestrictionRelease("term-1"), {
      wrapper: wrapper(queryClient),
    }).result;
    const linkEvidence = renderHook(() => useLinkRestrictionEvidence("release-1"), {
      wrapper: wrapper(queryClient),
    }).result;
    const generateRollforward = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    }).result;

    await createTerm.current.mutateAsync({
      fundId: "fund-1",
      restrictionType: "purpose",
      source: "donor",
      title: "Term",
      purposeStatement: "Purpose",
      beginningBalanceCents: 0,
    });
    await updateTerm.current.mutateAsync({ title: "Updated" });
    await deleteTerm.current.mutateAsync("term-1");
    await createAddition.current.mutateAsync({
      amountCents: 100,
      date: "2026-01-01T00:00:00.000Z",
    });
    await createRelease.current.mutateAsync({
      amountCents: 100,
      date: "2026-01-01T00:00:00.000Z",
      reason: "Eligible spend",
    });
    await linkEvidence.current.mutateAsync({
      documentId: "doc-1",
      label: "Invoice",
      evidenceType: "invoice",
    });
    await generateRollforward.current.mutateAsync({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
      includeEvidencePackage: true,
    });

    expect(hoisted.termsPost).toHaveBeenCalledWith({ json: expect.any(Object) });
    expect(hoisted.termPatch).toHaveBeenCalledWith({
      param: { termId: "term-1" },
      json: { title: "Updated" },
    });
    expect(hoisted.termDelete).toHaveBeenCalledWith({ param: { termId: "term-1" } });
    expect(hoisted.additionsPost).toHaveBeenCalledWith({
      param: { termId: "term-1" },
      json: expect.objectContaining({ amountCents: 100 }),
    });
    expect(hoisted.evidencePost).toHaveBeenCalledWith({
      param: { releaseId: "release-1" },
      json: expect.objectContaining({ documentId: "doc-1" }),
    });
    expect(hoisted.rollforwardPost).toHaveBeenCalledWith({
      json: expect.objectContaining({ attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["restrictions"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reports"] });
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_term_created", {
      restriction_type: "purpose",
      source: "donor",
      has_fund: true,
      has_grant: false,
      has_donation: false,
      has_source_document: false,
      beginning_balance_bucket: "0-99",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_term_updated");
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_term_deleted");
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_addition_created", {
      amount_bucket: "0-99",
      has_donation: false,
      has_grant: false,
      has_journal_line: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_release_created", {
      amount_bucket: "0-99",
      has_expense: false,
      has_journal_line: false,
      has_program: false,
      has_category: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_evidence_linked", {
      evidence_type: "invoice",
      target_type: "document",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "restricted_rollforward_generated",
      expect.anything(),
    );
  });

  it("reuses a rollforward attempt after failure and rotates it after success or payload change", async () => {
    hoisted.rollforwardPost
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response({ report: { id: "report-1" } }));
    const generate = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    });
    const input = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
    };

    await expect(generate.result.current.mutateAsync(input)).rejects.toThrow("offline");
    await generate.result.current.mutateAsync(input);
    await generate.result.current.mutateAsync(input);
    await generate.result.current.mutateAsync({ ...input, includeEvidencePackage: true });

    const attempts = hoisted.rollforwardPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).toBe(attempts[1]);
    expect(attempts[2]).not.toBe(attempts[1]);
    expect(attempts[3]).not.toBe(attempts[2]);
  });

  it("keeps separate attempt ids for interleaved rollforward payloads", async () => {
    let rejectFirst!: (error: Error) => void;
    const firstResponse = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    hoisted.rollforwardPost
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue(response({ report: { id: "report-1" } }));
    const generate = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    });
    const first = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
    };
    const second = { ...first, fundId: "fund-1" };

    const firstAttempt = generate.result.current.mutateAsync(first);
    await generate.result.current.mutateAsync(second);
    rejectFirst(new Error("response lost"));
    await expect(firstAttempt).rejects.toThrow("response lost");
    await generate.result.current.mutateAsync({
      periodEnd: first.periodEnd,
      periodStart: first.periodStart,
    });

    const attempts = hoisted.rollforwardPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).toBe(attempts[2]);
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("keeps concurrent identical rollforwards independent and retries the failed invocation", async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    let rejectSecond!: (error: Error) => void;
    const firstResponse = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<never>((_resolve, reject) => {
      rejectSecond = reject;
    });
    hoisted.rollforwardPost
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse)
      .mockResolvedValue(response({ report: { id: "report-retried" } }));
    const generate = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    });
    const input = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
    };

    const successfulInvocation = generate.result.current.mutateAsync(input);
    const lostInvocation = generate.result.current.mutateAsync(input);
    resolveFirst(response({ report: { id: "report-first" } }));
    await successfulInvocation;
    rejectSecond(new Error("response lost"));
    await expect(lostInvocation).rejects.toThrow("response lost");
    await generate.result.current.mutateAsync(input);

    const attempts = hoisted.rollforwardPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(attempts[2]).toBe(attempts[1]);
  });

  it("starts a new rollforward attempt when the active entity changes after a lost response", async () => {
    hoisted.rollforwardPost
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(response({ report: { id: "report-entity-2" } }));
    localStorage.setItem("grantpipe.activeEntityId", "entity-1");
    const generate = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    });
    const input = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
    };

    await expect(generate.result.current.mutateAsync(input)).rejects.toThrow("response lost");
    localStorage.setItem("grantpipe.activeEntityId", "entity-2");
    await generate.result.current.mutateAsync(input);

    const attempts = hoisted.rollforwardPost.mock.calls.map(
      ([request]) => (request.json as { attemptId: string }).attemptId,
    );
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("captures default analytics when optional fields are omitted", async () => {
    const createTerm = renderHook(() => useCreateRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;
    const linkEvidence = renderHook(() => useLinkRestrictionEvidence("release-1"), {
      wrapper: wrapper(queryClient),
    }).result;
    const generateRollforward = renderHook(() => useGenerateRestrictedRollforward(), {
      wrapper: wrapper(queryClient),
    }).result;

    await createTerm.current.mutateAsync({
      restrictionType: "purpose",
      source: "donor",
      title: "Term",
      purposeStatement: "Purpose",
    });
    await linkEvidence.current.mutateAsync({
      label: "Generated report",
      evidenceType: "report",
    });
    await generateRollforward.current.mutateAsync({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "restriction_term_created",
      expect.objectContaining({ beginning_balance_bucket: "0-99", has_fund: false }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_evidence_linked", {
      evidence_type: "report",
      target_type: "generated_report",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "restricted_rollforward_generated",
      expect.anything(),
    );
  });

  it("classifies non-Error rejections as unknown errors", async () => {
    hoisted.termsPost.mockRejectedValue("string failure");
    const createTerm = renderHook(() => useCreateRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;

    await expect(
      createTerm.current.mutateAsync({
        restrictionType: "purpose",
        source: "donor",
        title: "Term",
        purposeStatement: "Purpose",
      }),
    ).rejects.toBe("string failure");

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_operation_failed", {
        operation: "create_term",
        failure_type: "unknown_error",
      });
    });
    expect(mockOnMutationError).toHaveBeenCalledWith("string failure");
  });

  it.each([
    { amountCents: 50000, amountBucket: "100-999" },
    { amountCents: 250000, amountBucket: "1000-9999" },
    { amountCents: 1000000, amountBucket: "10000+" },
    { amountCents: -1000000, amountBucket: "10000+" },
  ])("buckets restriction amounts as $amountBucket", async ({ amountCents, amountBucket }) => {
    const createAddition = renderHook(() => useCreateRestrictionAddition("term-1"), {
      wrapper: wrapper(queryClient),
    }).result;

    await createAddition.current.mutateAsync({
      amountCents,
      date: "2026-01-01T00:00:00.000Z",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_addition_created", {
      amount_bucket: amountBucket,
      has_donation: false,
      has_grant: false,
      has_journal_line: false,
    });
  });

  it("tracks failed restriction mutations without raw error messages", async () => {
    hoisted.termsPost.mockRejectedValue(new Error("invalid title"));
    const createTerm = renderHook(() => useCreateRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;

    await expect(
      createTerm.current.mutateAsync({
        fundId: "fund-1",
        restrictionType: "purpose",
        source: "donor",
        title: "Term",
        purposeStatement: "Purpose",
        beginningBalanceCents: 0,
      }),
    ).rejects.toThrow("invalid title");

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_operation_failed", {
        operation: "create_term",
        failure_type: "validation_error",
      });
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "restriction_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    await waitFor(() => {
      expect(mockOnMutationError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("classifies non-validation failures as request errors", async () => {
    hoisted.termsPost.mockRejectedValue(new Error("server exploded"));
    const createTerm = renderHook(() => useCreateRestrictionTerm(), {
      wrapper: wrapper(queryClient),
    }).result;

    await expect(
      createTerm.current.mutateAsync({
        fundId: "fund-1",
        restrictionType: "purpose",
        source: "donor",
        title: "Term",
        purposeStatement: "Purpose",
        beginningBalanceCents: 0,
      }),
    ).rejects.toThrow("server exploded");

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("restriction_operation_failed", {
        operation: "create_term",
        failure_type: "request_error",
      });
    });
    expect(mockOnMutationError).toHaveBeenCalledWith(expect.any(Error));
  });
});
