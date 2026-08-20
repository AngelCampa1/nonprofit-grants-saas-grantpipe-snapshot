import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/http-response";
import {
  daysUntilExpiry,
  portalDocumentDownloadUrl,
  portalGeneratedReportDownloadUrl,
  usePortalAuth,
  usePortalBundle,
  usePortalDocument,
  usePortalFund,
  usePortalGeneratedReport,
  usePortalGrant,
  usePortalLogout,
  usePortalProgram,
  usePortalRestrictionTerm,
  usePortalSession,
} from "./use-portal-session";

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(client = createTestClient()) {
  return {
    client,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    },
  };
}

function createPortalMe(sessionId: string, reviewerId: string) {
  return {
    reviewer: {
      id: reviewerId,
      email: `${reviewerId}@example.org`,
      name: reviewerId,
      reviewerType: "auditor",
    },
    session: {
      id: sessionId,
      purpose: "Audit",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      revokedAt: null,
      orgId: "org-1",
    },
    scopes: [],
  };
}

describe("portal session hooks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces invalid portal session checks as typed 401 ApiErrors without retry", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePortalSession(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces invalid portal auth tokens as typed 401 ApiErrors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid or expired portal link." }), { status: 401 }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePortalAuth(), { wrapper });

    await expect(result.current.authenticate.mutateAsync("not-a-real-token")).rejects.toMatchObject(
      {
        status: 401,
        message: "Invalid or expired portal link.",
      },
    );
  });

  it("surfaces portal detail 401s as typed ApiErrors", async () => {
    const { client, wrapper } = createWrapper();
    client.setQueryData(["portal-session"], createPortalMe("session-1", "reviewer-1"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const { result } = renderHook(() => usePortalBundle("bundle-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(401);
  });

  it("keeps portal detail data empty until a portal session authorizes the resource request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePortalBundle("bundle-1"), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/api/public/portal/evidence-bundles/bundle-1",
      expect.anything(),
    );

    await expect(result.current.refetch()).resolves.toMatchObject({
      error: expect.objectContaining({
        message: "Portal session is required before loading portal data.",
      }),
    });
  });

  it("loads portal grant, fund, document, and generated report resources from public portal endpoints", async () => {
    const { client, wrapper } = createWrapper();
    client.setQueryData(["portal-session"], createPortalMe("session-1", "reviewer-1"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify({ id: url.split("/").at(-1), url }), {
        headers: { "content-type": "application/json" },
      });
    });

    const grant = renderHook(() => usePortalGrant("grant-1"), { wrapper });
    const fund = renderHook(() => usePortalFund("fund-1"), { wrapper });
    const document = renderHook(() => usePortalDocument("document-1"), {
      wrapper,
    });
    const generatedReport = renderHook(() => usePortalGeneratedReport("report-1"), {
      wrapper,
    });
    const program = renderHook(() => usePortalProgram("program-1"), {
      wrapper,
    });
    const restrictionTerm = renderHook(() => usePortalRestrictionTerm("term-1"), {
      wrapper,
    });

    await waitFor(() => expect(grant.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(fund.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(document.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(generatedReport.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(program.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(restrictionTerm.result.current.isSuccess).toBe(true));

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/grants/grant-1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/funds/fund-1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/documents/document-1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/generated-reports/report-1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/programs/program-1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/restriction-terms/term-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("updates and clears the cached portal session through auth and logout mutations", async () => {
    const portalMe = {
      reviewer: {
        id: "reviewer-1",
        email: "auditor@example.org",
        name: "Auditor",
        reviewerType: "auditor",
      },
      session: {
        id: "session-1",
        purpose: "Audit",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        revokedAt: null,
        orgId: "org-1",
      },
      scopes: [],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/auth") ? portalMe : { ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });

    const { wrapper } = createWrapper();
    const auth = renderHook(() => usePortalAuth(), { wrapper });
    const logout = renderHook(() => usePortalLogout(), { wrapper });

    await expect(auth.result.current.authenticate.mutateAsync("token-1")).resolves.toEqual(
      portalMe,
    );
    await expect(logout.result.current.logout.mutateAsync()).resolves.toBeUndefined();
  });

  it("does not render reviewer A cached portal detail after reviewer B authenticates", async () => {
    const { client, wrapper } = createWrapper();
    const reviewerB = createPortalMe("session-b", "reviewer-b");
    const reviewerAResource = { id: "bundle-1", reviewer: "reviewer-a" };
    const reviewerBResource = { id: "bundle-1", reviewer: "reviewer-b" };

    client.setQueryData(["portal-session"], createPortalMe("session-a", "reviewer-a"));
    client.setQueryData(["portal-bundle", "bundle-1"], reviewerAResource);
    client.setQueryData(["portal-session"], reviewerB);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(reviewerBResource), {
        headers: { "content-type": "application/json" },
      }),
    );

    const bundle = renderHook(() => usePortalBundle("bundle-1"), { wrapper });

    expect(bundle.result.current.data).not.toEqual(reviewerAResource);
    await waitFor(() => expect(bundle.result.current.data).toEqual(reviewerBResource));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/public/portal/evidence-bundles/bundle-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("purges prior portal resource caches when a new reviewer token is exchanged", async () => {
    const { client, wrapper } = createWrapper();
    const reviewerB = createPortalMe("session-b", "reviewer-b");
    client.setQueryData(["portal-session"], createPortalMe("session-a", "reviewer-a"));
    client.setQueryData(["portal-bundle", "bundle-1"], { reviewer: "reviewer-a" });
    client.setQueryData(["portal-document", "document-1"], { reviewer: "reviewer-a" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(reviewerB), {
        headers: { "content-type": "application/json" },
      }),
    );

    const auth = renderHook(() => usePortalAuth(), { wrapper });

    await expect(auth.result.current.authenticate.mutateAsync("token-b")).resolves.toEqual(
      reviewerB,
    );

    expect(client.getQueryData(["portal-session"])).toEqual(reviewerB);
    expect(client.getQueryData(["portal-bundle", "bundle-1"])).toBeUndefined();
    expect(client.getQueryData(["portal-document", "document-1"])).toBeUndefined();
  });

  it("clears the cached portal session as soon as a new reviewer token exchange starts", async () => {
    const { client, wrapper } = createWrapper();
    const reviewerA = createPortalMe("session-a", "reviewer-a");
    let resolveAuth!: (response: Response) => void;
    client.setQueryData(["portal-session"], reviewerA);
    client.setQueryData(["portal-bundle", "bundle-1"], { reviewer: "reviewer-a" });
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );

    const auth = renderHook(() => usePortalAuth(), { wrapper });
    const pendingAuth = auth.result.current.authenticate.mutateAsync("token-b");

    await waitFor(() => {
      expect(client.getQueryData(["portal-session"])).toBeNull();
    });
    expect(client.getQueryData(["portal-bundle", "bundle-1"])).toBeUndefined();

    resolveAuth(
      new Response(JSON.stringify({ error: "Invalid or expired portal link." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(pendingAuth).rejects.toMatchObject({ status: 401 });
    expect(client.getQueryData(["portal-session"])).toBeNull();
  });

  it("purges portal session and resource caches on logout", async () => {
    const { client, wrapper } = createWrapper();
    client.setQueryData(["portal-session"], createPortalMe("session-a", "reviewer-a"));
    client.setQueryData(["portal-bundle", "bundle-1"], { reviewer: "reviewer-a" });
    client.setQueryData(["portal-generated-report", "report-1"], { reviewer: "reviewer-a" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    );

    const logout = renderHook(() => usePortalLogout(), { wrapper });

    await expect(logout.result.current.logout.mutateAsync()).resolves.toBeUndefined();

    expect(client.getQueryData(["portal-session"])).toBeUndefined();
    expect(client.getQueryData(["portal-bundle", "bundle-1"])).toBeUndefined();
    expect(client.getQueryData(["portal-generated-report", "report-1"])).toBeUndefined();
  });

  it("does not clear the cached portal session when logout returns non-ok", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const cachedSession = { reviewer: { id: "reviewer-1" }, session: { id: "session-1" } };
    client.setQueryData(["portal-session"], cachedSession);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "logout_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const logout = renderHook(() => usePortalLogout(), { wrapper });

    await expect(logout.result.current.logout.mutateAsync()).rejects.toThrow("logout_failed");
    expect(client.getQueryData(["portal-session"])).toBe(cachedSession);
  });

  it("formats portal helper values", () => {
    expect(daysUntilExpiry(new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString())).toBe(2);
    expect(daysUntilExpiry(new Date(Date.now() - 1_000).toISOString())).toBe(0);
    expect(portalDocumentDownloadUrl("document-1")).toBe(
      "/api/public/portal/documents/document-1/download",
    );
    expect(portalGeneratedReportDownloadUrl("report-1")).toBe(
      "/api/public/portal/generated-reports/report-1/download",
    );
  });
});
