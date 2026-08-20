import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockReviewersGet,
  mockReviewersPost,
  mockReviewersPatch,
  mockReviewersDelete,
  mockSessionsGet,
  mockSessionsPost,
  mockSessionRevokePost,
  mockSessionExtendPost,
  mockBundlesGet,
  mockBundlesPost,
  mockBundlesPatch,
  mockBundlesDelete,
  mockBundlePublishPost,
  mockBundleItemsPost,
  mockBundleItemDelete,
  mockBundleReorderPost,
  mockAuditEventsGet,
  mockQuickSharePost,
} = vi.hoisted(() => ({
  mockReviewersGet: vi.fn(),
  mockReviewersPost: vi.fn(),
  mockReviewersPatch: vi.fn(),
  mockReviewersDelete: vi.fn(),
  mockSessionsGet: vi.fn(),
  mockSessionsPost: vi.fn(),
  mockSessionRevokePost: vi.fn(),
  mockSessionExtendPost: vi.fn(),
  mockBundlesGet: vi.fn(),
  mockBundlesPost: vi.fn(),
  mockBundlesPatch: vi.fn(),
  mockBundlesDelete: vi.fn(),
  mockBundlePublishPost: vi.fn(),
  mockBundleItemsPost: vi.fn(),
  mockBundleItemDelete: vi.fn(),
  mockBundleReorderPost: vi.fn(),
  mockAuditEventsGet: vi.fn(),
  mockQuickSharePost: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "external-reviewers": {
        reviewers: {
          $get: mockReviewersGet,
          $post: mockReviewersPost,
          ":id": { $patch: mockReviewersPatch, $delete: mockReviewersDelete },
        },
        sessions: {
          $get: mockSessionsGet,
          $post: mockSessionsPost,
          ":id": {
            revoke: { $post: mockSessionRevokePost },
            extend: { $post: mockSessionExtendPost },
          },
        },
        bundles: {
          $get: mockBundlesGet,
          $post: mockBundlesPost,
          ":id": {
            $get: mockBundlesGet,
            $patch: mockBundlesPatch,
            $delete: mockBundlesDelete,
            publish: { $post: mockBundlePublishPost },
            items: {
              $post: mockBundleItemsPost,
              ":itemId": { $delete: mockBundleItemDelete },
            },
            reorder: { $post: mockBundleReorderPost },
          },
        },
        "audit-events": { $get: mockAuditEventsGet },
        "quick-share": { $post: mockQuickSharePost },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { ApiError } from "../lib/http-response";
import { isAuditReadyPlanGate } from "../lib/api-errors";
import { captureEvent } from "../lib/analytics";
import {
  useAuditEvents,
  useBundle,
  useBundleMutations,
  useBundles,
  useQuickShare,
  useReviewerMutations,
  useReviewers,
  useSessionMutations,
  useSessions,
} from "./use-external-reviewers";

const mockCaptureEvent = vi.mocked(captureEvent);

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("external reviewer hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("turns reviewer 402 insufficient_plan into a typed Audit-Ready gate without retries", async () => {
    mockReviewersGet.mockResolvedValue(
      jsonResponse({ error: "Upgrade required", errorCode: "insufficient_plan" }, 402),
    );

    const { result } = renderHook(() => useReviewers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3_000 });

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(isAuditReadyPlanGate(result.current.error)).toBe(true);
    expect(mockReviewersGet).toHaveBeenCalledTimes(1);
  });

  it("recognizes production-style 402 insufficient_plan errors without errorCode", async () => {
    mockReviewersGet.mockResolvedValue(jsonResponse({ error: "insufficient_plan" }, 402));

    const { result } = renderHook(() => useReviewers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3_000 });

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(isAuditReadyPlanGate(result.current.error)).toBe(true);
  });

  it("keeps 500 reviewer failures as reportable query errors", async () => {
    mockReviewersGet.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "Database unavailable" }, 500)),
    );

    const { result } = renderHook(() => useReviewers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3_000 });

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(500);
    expect(isAuditReadyPlanGate(result.current.error)).toBe(false);
  });

  it("supports disabled reviewer, session, bundle, and audit-event queries", () => {
    renderHook(() => useReviewers(undefined, { enabled: false }), { wrapper: createWrapper() });
    renderHook(() => useSessions({ includeExpired: true }, { enabled: false }), {
      wrapper: createWrapper(),
    });
    renderHook(() => useBundles(undefined, { enabled: false }), { wrapper: createWrapper() });
    renderHook(() => useAuditEvents(undefined, { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockReviewersGet).not.toHaveBeenCalled();
    expect(mockSessionsGet).not.toHaveBeenCalled();
    expect(mockBundlesGet).not.toHaveBeenCalled();
    expect(mockAuditEventsGet).not.toHaveBeenCalled();
  });

  it("executes reviewer, session, bundle, bundle detail, and audit-event query filters", async () => {
    const ok = jsonResponse({ data: [] });
    mockReviewersGet.mockResolvedValue(ok.clone());
    mockSessionsGet.mockResolvedValue(ok.clone());
    mockBundlesGet.mockResolvedValue(ok.clone());
    mockAuditEventsGet.mockResolvedValue(ok.clone());
    mockBundlesGet.mockResolvedValueOnce(ok.clone()).mockResolvedValue(ok.clone());

    const reviewers = renderHook(() => useReviewers({ reviewerType: "auditor", search: "audit" }), {
      wrapper: createWrapper(),
    });
    const sessions = renderHook(
      () =>
        useSessions({
          reviewerId: "reviewer-1",
          includeExpired: true,
          includeRevoked: true,
        }),
      { wrapper: createWrapper() },
    );
    const bundles = renderHook(() => useBundles({ purpose: "audit", page: 2, pageSize: 50 }), {
      wrapper: createWrapper(),
    });
    const bundle = renderHook(() => useBundle("bundle-1"), {
      wrapper: createWrapper(),
    });
    const auditEvents = renderHook(
      () =>
        useAuditEvents({
          sessionId: "session-1",
          reviewerId: "reviewer-1",
          eventType: "bundle_viewed",
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(reviewers.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(sessions.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(bundles.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(bundle.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(auditEvents.result.current.isSuccess).toBe(true));

    expect(mockReviewersGet).toHaveBeenCalledWith({
      query: { reviewerType: "auditor", search: "audit" },
    });
    expect(mockSessionsGet).toHaveBeenCalledWith({
      query: {
        reviewerId: "reviewer-1",
        includeExpired: "true",
        includeRevoked: "true",
      },
    });
    expect(mockBundlesGet).toHaveBeenCalledWith({
      query: { purpose: "audit", page: "2", pageSize: "50" },
    });
    expect(mockBundlesGet).toHaveBeenCalledWith({ param: { id: "bundle-1" } });
    expect(mockAuditEventsGet).toHaveBeenCalledWith({
      query: {
        sessionId: "session-1",
        reviewerId: "reviewer-1",
        eventType: "bundle_viewed",
      },
    });
  });

  it("turns reviewer mutation 402s into typed non-reportable ApiErrors", async () => {
    mockReviewersPost.mockResolvedValue(
      jsonResponse({ error: "Upgrade required", errorCode: "insufficient_plan" }, 402),
    );
    mockQuickSharePost.mockResolvedValue(
      jsonResponse({ error: "Upgrade required", errorCode: "insufficient_plan" }, 402),
    );

    const reviewerMutations = renderHook(() => useReviewerMutations(), {
      wrapper: createWrapper(),
    });
    const quickShare = renderHook(() => useQuickShare(), { wrapper: createWrapper() });

    await expect(
      reviewerMutations.result.current.createReviewer.mutateAsync({
        email: "auditor@example.org",
        name: "External Auditor",
        reviewerType: "auditor",
      }),
    ).rejects.toMatchObject({ status: 402, errorCode: "insufficient_plan" });

    await expect(
      quickShare.result.current.quickShare.mutateAsync({
        reviewerId: "reviewer-1",
        purpose: "Audit review",
        scopeType: "grant",
        scopeId: "grant-1",
      }),
    ).rejects.toMatchObject({ status: 402, errorCode: "insufficient_plan" });
  });

  it("returns friendly mutation error messages for Error and non-Error values", () => {
    const reviewerMutations = renderHook(() => useReviewerMutations(), {
      wrapper: createWrapper(),
    });

    expect(reviewerMutations.result.current.getErrorMessage(new Error("Named failure"))).toBe(
      "Named failure",
    );
    expect(reviewerMutations.result.current.getErrorMessage("nope")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("tracks failed external reviewer mutations without raw error messages", async () => {
    mockReviewersPost.mockRejectedValue(new Error("invalid reviewer email"));
    const reviewerMutations = renderHook(() => useReviewerMutations(), {
      wrapper: createWrapper(),
    });

    await expect(
      reviewerMutations.result.current.createReviewer.mutateAsync({
        email: "auditor@example.org",
        name: "External Auditor",
        reviewerType: "auditor",
      }),
    ).rejects.toThrow("invalid reviewer email");

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("external_review_operation_failed", {
        operation: "create_reviewer",
        failure_type: "validation_error",
      });
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "external_review_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("executes reviewer, session, and bundle mutation success paths", async () => {
    const ok = jsonResponse({ ok: true });
    mockReviewersPost.mockResolvedValue(ok.clone());
    mockReviewersPatch.mockResolvedValue(ok.clone());
    mockReviewersDelete.mockResolvedValue(ok.clone());
    mockSessionsPost.mockResolvedValue(ok.clone());
    mockSessionRevokePost.mockResolvedValue(ok.clone());
    mockSessionExtendPost.mockResolvedValue(ok.clone());
    mockBundlesPost.mockResolvedValue(ok.clone());
    mockBundlesPatch.mockResolvedValue(ok.clone());
    mockBundlesDelete.mockResolvedValue(ok.clone());
    mockBundlePublishPost.mockResolvedValue(ok.clone());
    mockBundleItemsPost.mockResolvedValue(ok.clone());
    mockBundleItemDelete.mockResolvedValue(ok.clone());
    mockBundleReorderPost.mockResolvedValue(ok.clone());
    mockQuickSharePost.mockResolvedValue(ok.clone());

    const reviewerMutations = renderHook(() => useReviewerMutations(), {
      wrapper: createWrapper(),
    });
    const sessionMutations = renderHook(() => useSessionMutations(), {
      wrapper: createWrapper(),
    });
    const bundleMutations = renderHook(() => useBundleMutations(), {
      wrapper: createWrapper(),
    });
    const quickShare = renderHook(() => useQuickShare(), {
      wrapper: createWrapper(),
    });

    await reviewerMutations.result.current.createReviewer.mutateAsync({
      email: "auditor@example.org",
      name: "External Auditor",
      reviewerType: "auditor",
    });
    await reviewerMutations.result.current.updateReviewer.mutateAsync({
      id: "reviewer-1",
      data: { name: "Updated Auditor" },
    });
    await reviewerMutations.result.current.deleteReviewer.mutateAsync("reviewer-1");

    await sessionMutations.result.current.createSession.mutateAsync({
      reviewerId: "reviewer-1",
      purpose: "Audit review",
      scopes: [{ scopeType: "grant", scopeId: "grant-1" }],
    });
    await sessionMutations.result.current.revokeSession.mutateAsync("session-1");
    await sessionMutations.result.current.extendSession.mutateAsync({
      id: "session-1",
      extensionMs: 86_400_000,
    });

    await bundleMutations.result.current.createBundle.mutateAsync({
      title: "Audit pack",
      purpose: "audit",
    });
    await bundleMutations.result.current.updateBundle.mutateAsync({
      id: "bundle-1",
      data: { title: "Updated audit pack" },
    });
    await bundleMutations.result.current.publishBundle.mutateAsync("bundle-1");
    await bundleMutations.result.current.addBundleItem.mutateAsync({
      bundleId: "bundle-1",
      data: { itemType: "grant", itemId: "grant-1" },
    });
    await bundleMutations.result.current.removeBundleItem.mutateAsync({
      bundleId: "bundle-1",
      itemId: "item-1",
    });
    await bundleMutations.result.current.reorderBundleItems.mutateAsync({
      bundleId: "bundle-1",
      itemIds: ["item-2", "item-1"],
    });
    await bundleMutations.result.current.deleteBundle.mutateAsync("bundle-1");

    await quickShare.result.current.quickShare.mutateAsync({
      reviewerId: "reviewer-1",
      purpose: "Audit review",
      scopeType: "grant",
      scopeId: "grant-1",
    });

    expect(mockReviewersPatch).toHaveBeenCalledWith({
      param: { id: "reviewer-1" },
      json: { name: "Updated Auditor" },
    });
    expect(mockSessionExtendPost).toHaveBeenCalledWith({
      param: { id: "session-1" },
      json: { extensionMs: 86_400_000 },
    });
    expect(mockBundleReorderPost).toHaveBeenCalledWith({
      param: { id: "bundle-1" },
      json: { itemIds: ["item-2", "item-1"] },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("external_reviewer_created", {
      reviewer_type: "auditor",
      has_organization: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("external_reviewer_updated", {
      reviewer_type_changed: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("external_reviewer_deleted");
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_created", {
      scope_count_bucket: "1-10",
      has_ttl: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_revoked");
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_extended", {
      extension_bucket: "1-7_days",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_created", {
      purpose: "audit",
      has_period: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_updated", {
      purpose_changed: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_published");
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_item_added", {
      item_type: "grant",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_item_removed");
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_items_reordered", {
      item_count_bucket: "1-10",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_deleted");
    expect(mockCaptureEvent).toHaveBeenCalledWith("quick_share_created", {
      scope_type: "grant",
      has_bundle: false,
      has_ttl: false,
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reviewer_id: "reviewer-1",
      }),
    );
  });

  it("tracks reviewer and bundle analytics edge buckets without raw ids", async () => {
    const ok = jsonResponse({ ok: true });
    mockReviewersPost.mockResolvedValue(ok.clone());
    mockSessionExtendPost.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    mockBundlesPost.mockResolvedValue(ok.clone());
    mockBundlesPatch.mockResolvedValue(ok.clone());
    mockBundleReorderPost.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    mockQuickSharePost.mockResolvedValue(ok.clone());

    const reviewerMutations = renderHook(() => useReviewerMutations(), {
      wrapper: createWrapper(),
    });
    const sessionMutations = renderHook(() => useSessionMutations(), {
      wrapper: createWrapper(),
    });
    const bundleMutations = renderHook(() => useBundleMutations(), {
      wrapper: createWrapper(),
    });
    const quickShare = renderHook(() => useQuickShare(), {
      wrapper: createWrapper(),
    });

    await reviewerMutations.result.current.createReviewer.mutateAsync({
      email: "auditor@example.org",
      name: "External Auditor",
      reviewerType: "funder",
      organizationName: "Example Funder",
    });

    for (const extensionMs of [3_600_000, 10 * 86_400_000, 45 * 86_400_000]) {
      await sessionMutations.result.current.extendSession.mutateAsync({
        id: "session-1",
        extensionMs,
      });
    }

    await bundleMutations.result.current.createBundle.mutateAsync({
      title: "Monitoring pack",
      purpose: "funder_review",
      periodStart: "2026-01-01T00:00:00.000Z",
    });
    await bundleMutations.result.current.updateBundle.mutateAsync({
      id: "bundle-1",
      data: { purpose: "audit" },
    });

    for (const itemIds of [
      [] as string[],
      Array.from({ length: 11 }, (_value, index) => `item-${index}`),
      Array.from({ length: 51 }, (_value, index) => `item-${index}`),
    ]) {
      await bundleMutations.result.current.reorderBundleItems.mutateAsync({
        bundleId: "bundle-1",
        itemIds,
      });
    }

    await quickShare.result.current.quickShare.mutateAsync({
      reviewerId: "reviewer-1",
      purpose: "Audit review",
      ttlMs: 86_400_000,
      scopeType: "fund",
      scopeId: "fund-1",
      bundleId: "bundle-1",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("external_reviewer_created", {
      reviewer_type: "funder",
      has_organization: true,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_extended", {
      extension_bucket: "under_1_day",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_extended", {
      extension_bucket: "8-30_days",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("reviewer_session_extended", {
      extension_bucket: "30+_days",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_created", {
      purpose: "funder_review",
      has_period: true,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_updated", {
      purpose_changed: true,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_items_reordered", {
      item_count_bucket: "0",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_items_reordered", {
      item_count_bucket: "11-50",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("evidence_bundle_items_reordered", {
      item_count_bucket: "50+",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("quick_share_created", {
      scope_type: "fund",
      has_bundle: true,
      has_ttl: true,
    });
  });
});
