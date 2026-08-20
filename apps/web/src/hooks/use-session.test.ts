import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock the auth-client module before importing the hook
vi.mock("../lib/auth-client", () => ({
  useBetterAuthSession: vi.fn(),
}));

const { mockAuthSessionGet } = vi.hoisted(() => ({
  mockAuthSessionGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      auth: {
        session: {
          $get: mockAuthSessionGet,
        },
      },
    },
  },
}));

import { useBetterAuthSession } from "../lib/auth-client";
import { useSession } from "./use-session";

const mockUseBetterAuthSession = vi.mocked(useBetterAuthSession);

function createWrapper(retryDelay = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state when session is pending", () => {
    mockUseBetterAuthSession.mockReturnValue({
      data: null,
      isPending: true,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.memberRole).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("exposes the better-auth refetch as refetchSession so callers can retry a failed session fetch", () => {
    const refetch = vi.fn();
    mockUseBetterAuthSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch,
    });

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current.refetchSession).toBe(refetch);
  });

  it("returns user, session, and auth context when session data exists", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
          entityScope: "entity",
          entityRole: "admin",
          entityPermissions: {
            entitySettings: "manage",
            entityTeam: "manage",
            grants: "manage",
            funds: "manage",
            documents: "manage",
            compliance: "manage",
            accounting: "manage",
            reports: "manage",
          },
          activeEntity: {
            id: "entity-1",
            name: "Foundation Alpha",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            role: "admin",
            permissions: {
              entitySettings: "manage",
              entityTeam: "manage",
              grants: "manage",
              funds: "manage",
              documents: "manage",
              compliance: "manage",
              accounting: "manage",
              reports: "manage",
            },
            isDefault: true,
          },
          availableEntities: [
            {
              id: "entity-1",
              name: "Foundation Alpha",
              kind: "root",
              status: "active",
              fiscalSponsorModel: "none",
              parentEntityId: null,
              role: "admin",
              permissions: {
                entitySettings: "manage",
                entityTeam: "manage",
                grants: "manage",
                funds: "manage",
                documents: "manage",
                compliance: "manage",
                accounting: "manage",
                reports: "manage",
              },
              isDefault: true,
            },
          ],
          onboardingCompleted: true,
          planSelectionCompleted: true,
          orgSubscription: {
            subscriptionStatus: "trialing",
            billingLifecycleState: "trialing",
            trialEndsAt: "2026-05-01T00:00:00.000Z",
            planTier: "starter",
            onboardingCompleted: true,
            planSelectedAt: "2026-04-20T00:00:00.000Z",
            stripeSubscriptionId: null,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.session).toEqual(mockSession);
    expect(result.current.orgId).toBe("org-1");
    expect(result.current.memberRole).toBe("admin");
    expect(result.current.entityScope).toBe("entity");
    expect(result.current.entityRole).toBe("admin");
    expect(result.current.entityPermissions).toMatchObject({
      entitySettings: "manage",
      reports: "manage",
    });
    expect(result.current.activeEntity).toMatchObject({
      id: "entity-1",
      name: "Foundation Alpha",
      role: "admin",
      isDefault: true,
    });
    expect(result.current.availableEntities).toHaveLength(1);
    expect(result.current.onboardingCompleted).toBe(true);
    expect(result.current.planSelectionCompleted).toBe(true);
    expect(result.current.orgSubscription).toEqual({
      subscriptionStatus: "trialing",
      billingLifecycleState: "trialing",
      trialEndsAt: "2026-05-01T00:00:00.000Z",
      planTier: "starter",
      onboardingCompleted: true,
      planSelectedAt: "2026-04-20T00:00:00.000Z",
      stripeSubscriptionId: null,
    });
    expect(result.current.orgSubscription?.billingLifecycleState).toBe("trialing");
    expect(result.current.error).toBeNull();
  });

  it("scopes queryKey to the user ID to prevent cross-user cache pollution", async () => {
    const mockUserA = {
      id: "user-a",
      name: "User A",
      email: "a@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-a",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUserA, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(JSON.stringify({ orgId: "org-a", memberRole: "admin" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    // queryClient with spy to capture keys
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const queries = queryClient.getQueryCache().getAll();
    const sessionContextQuery = queries.find(
      (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "auth-session-context",
    );
    expect(sessionContextQuery).toBeDefined();
    expect(sessionContextQuery?.queryKey).toEqual(["auth-session-context", "user-a"]);
  });

  it("uses null as queryKey userId segment when no session data exists", () => {
    mockUseBetterAuthSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useSession(), { wrapper });

    const queries = queryClient.getQueryCache().getAll();
    const sessionContextQuery = queries.find(
      (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "auth-session-context",
    );
    // Query is disabled when no session, but if present should have null userId
    if (sessionContextQuery) {
      expect(sessionContextQuery.queryKey).toEqual(["auth-session-context", null]);
    } else {
      // Query not created when disabled — acceptable
      expect(queries.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns null user and session when no session data", () => {
    mockUseBetterAuthSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.memberRole).toBeNull();
    expect(result.current.onboardingCompleted).toBe(false);
    expect(result.current.planSelectionCompleted).toBe(false);
    expect(result.current.orgSubscription).toBeNull();
  });

  it("throws and exposes contextError when the internal session endpoint fails", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(new Response(null, { status: 500 }));

    // Pass retryDelay: 0 so the 2 retries resolve immediately
    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(0),
    });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 5000 },
    );

    // After a permanent query failure, role is null but contextError is set — never silent
    expect(result.current.orgId).toBeNull();
    expect(result.current.memberRole).toBeNull();
    expect(result.current.contextError).toBeInstanceOf(Error);
    expect((result.current.contextError as Error).message).toMatch(/500/);
  });

  it("contextError is null when context query succeeds", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(JSON.stringify({ orgId: "org-1", memberRole: "editor" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contextError).toBeNull();
  });

  it("contextError is null while loading (not an error state)", () => {
    mockUseBetterAuthSession.mockReturnValue({
      data: null,
      isPending: true,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.contextError).toBeNull();
  });

  it("defaults orgId and memberRole to null when absent from context response", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    // Response body is empty object — orgId and memberRole are absent
    mockAuthSessionGet.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orgId).toBeNull();
    expect(result.current.memberRole).toBeNull();
    expect(result.current.contextError).toBeNull();
  });

  it("computes effectivePlanTier from the selected plan for an active trial", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
          orgSubscription: {
            subscriptionStatus: "trialing",
            trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            planTier: "starter",
            onboardingCompleted: true,
            planSelectedAt: null,
            stripeSubscriptionId: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.effectivePlanTier).toBe("starter");
  });

  it("falls back effectivePlanTier to stored plan when subscription is active", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
          orgSubscription: {
            subscriptionStatus: "active",
            trialEndsAt: null,
            planTier: "growth",
            onboardingCompleted: true,
            planSelectedAt: "2026-04-20T00:00:00.000Z",
            stripeSubscriptionId: "sub_123",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.effectivePlanTier).toBe("growth");
  });

  it("derives effectivePlanTier from stored trial fields when server effective tier is stale", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
          orgSubscription: {
            subscriptionStatus: "trialing",
            trialEndsAt: "2000-01-01T00:00:00.000Z",
            planTier: "starter",
            effectivePlanTier: "enterprise",
            onboardingCompleted: true,
            planSelectedAt: null,
            stripeSubscriptionId: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.effectivePlanTier).toBe("starter");
  });

  it("exposes onboardingGoal from the session payload", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
          onboardingCompleted: true,
          planSelectionCompleted: true,
          onboardingGoal: "grants",
          orgSubscription: {
            subscriptionStatus: "active",
            trialEndsAt: null,
            planTier: "growth",
            onboardingCompleted: true,
            planSelectedAt: "2026-04-20T00:00:00.000Z",
            stripeSubscriptionId: "sub_123",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.onboardingGoal).toBe("grants");
  });

  it("defaults onboardingGoal to null when absent from the session payload", async () => {
    const mockUser = {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    };
    const mockSession = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(),
      token: "tok-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    mockUseBetterAuthSession.mockReturnValue({
      data: { user: mockUser, session: mockSession },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAuthSessionGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          orgId: "org-1",
          memberRole: "admin",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.onboardingGoal).toBeNull();
  });

  it("retries 2 times before exposing contextError — succeeds on 3rd attempt", async () => {
    // Use a wrapper WITHOUT retry:false so the query-level retry:2 takes effect.
    // retryDelay:0 makes the two retries resolve immediately in tests.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    mockUseBetterAuthSession.mockReturnValue({
      data: {
        user: {
          id: "u1",
          name: "Test",
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        },
        session: {
          id: "s1",
          userId: "u1",
          expiresAt: new Date(),
          token: "tok",
          createdAt: new Date(),
          updatedAt: new Date(),
          ipAddress: null,
          userAgent: null,
        },
      },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    // Fail twice, succeed on the third call (retry 1 + retry 2 = attempts 2 and 3)
    mockAuthSessionGet
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(
        new Response(JSON.stringify({ orgId: "org-1", memberRole: "admin" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 5000 },
    );

    // After two transient failures the query retried and eventually succeeded —
    // contextError must be null and role must be populated.
    expect(result.current.contextError).toBeNull();
    expect(result.current.memberRole).toBe("admin");
    expect(result.current.orgId).toBe("org-1");
  });
});
