import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const render = vi.fn();
  const mockSubscribe = vi.fn(() => () => {});
  return {
    mockCreateRoot: vi.fn(() => ({ render })),
    mockRender: render,
    mockSubscribe,
    mockCreateRouter: vi.fn(() => ({ id: "router", subscribe: mockSubscribe })),
    mockRouterProvider: vi.fn(() => null),
    mockQueryClientProvider: vi.fn(({ children }: { children: unknown }) => children),
    mockMutationCache: vi.fn((options: unknown) => ({ type: "mutation-cache", options })),
    mockQueryCache: vi.fn((options: unknown) => ({ type: "query-cache", options })),
    mockQueryClient: vi.fn(),
    mockInitAnalytics: vi.fn(),
    mockCapturePageview: vi.fn(),
    mockCaptureQueryError: vi.fn(),
    mockCreateReactRootOptions: vi.fn(() => ({ onCaughtError: "caught" })),
    mockInitSentry: vi.fn(),
    mockSummarizeQueryKey: vi.fn((queryKey: unknown[]) => ["safe", String(queryKey.length)]),
    mockErrorBoundary: vi.fn(({ children }: { children: unknown }) => children),
    mockAppNotFound: vi.fn(() => null),
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: hoisted.mockCreateRoot,
}));

vi.mock("@tanstack/react-router", () => ({
  RouterProvider: hoisted.mockRouterProvider,
  createRouter: hoisted.mockCreateRouter,
}));

vi.mock("@tanstack/react-query", () => ({
  MutationCache: hoisted.mockMutationCache,
  QueryCache: hoisted.mockQueryCache,
  QueryClient: hoisted.mockQueryClient,
  QueryClientProvider: hoisted.mockQueryClientProvider,
}));

vi.mock("./routeTree.gen", () => ({
  routeTree: { id: "route-tree" },
}));

vi.mock("./lib/analytics", () => ({
  initAnalytics: hoisted.mockInitAnalytics,
  capturePageview: hoisted.mockCapturePageview,
}));

vi.mock("./lib/sentry", () => ({
  captureQueryError: hoisted.mockCaptureQueryError,
  createReactRootOptions: hoisted.mockCreateReactRootOptions,
  initSentry: hoisted.mockInitSentry,
  summarizeQueryKey: hoisted.mockSummarizeQueryKey,
}));

vi.mock("./components/error-boundary", () => ({
  ErrorBoundary: hoisted.mockErrorBoundary,
}));

vi.mock("./components/app-not-found", () => ({
  AppNotFound: hoisted.mockAppNotFound,
}));

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.mockCreateRoot.mockClear();
    hoisted.mockRender.mockClear();
    hoisted.mockCreateRouter.mockClear();
    hoisted.mockRouterProvider.mockClear();
    hoisted.mockQueryClientProvider.mockClear();
    hoisted.mockMutationCache.mockClear();
    hoisted.mockQueryCache.mockClear();
    hoisted.mockQueryClient.mockClear();
    hoisted.mockInitAnalytics.mockClear();
    hoisted.mockCapturePageview.mockClear();
    hoisted.mockSubscribe.mockClear();
    hoisted.mockCaptureQueryError.mockClear();
    hoisted.mockCreateReactRootOptions.mockClear();
    hoisted.mockInitSentry.mockClear();
    hoisted.mockSummarizeQueryKey.mockClear();
    hoisted.mockErrorBoundary.mockClear();
    hoisted.mockAppNotFound.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("creates the query client, router, and renders the app into #root", async () => {
    await import("./main");

    expect(hoisted.mockQueryClient).toHaveBeenCalledWith({
      mutationCache: { type: "mutation-cache", options: expect.any(Object) },
      queryCache: { type: "query-cache", options: expect.any(Object) },
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          retry: 1,
        },
      },
    });
    expect(hoisted.mockCreateRouter).toHaveBeenCalledWith({
      basepath: "/app",
      routeTree: { id: "route-tree" },
      defaultNotFoundComponent: hoisted.mockAppNotFound,
    });
    expect(hoisted.mockCreateRoot).toHaveBeenCalledWith(document.getElementById("root"), {
      onCaughtError: "caught",
    });
    expect(hoisted.mockRender).toHaveBeenCalledTimes(1);
    expect(hoisted.mockInitSentry).toHaveBeenCalledOnce();
    expect(hoisted.mockInitAnalytics).toHaveBeenCalledOnce();
    // Verify ErrorBoundary is at the root of the rendered tree (inside StrictMode)
    const [rootElement] = hoisted.mockRender.mock.calls[0] as [
      React.ReactElement<{ children: { type: unknown } }>,
    ];
    expect(rootElement.props.children.type).toBe(hoisted.mockErrorBoundary);
  });

  it("subscribes to onResolved router events for pageview tracking", async () => {
    await import("./main");
    expect(hoisted.mockSubscribe).toHaveBeenCalledWith("onResolved", expect.any(Function));

    // Simulate a navigation event
    const [[, listener]] = hoisted.mockSubscribe.mock.calls as unknown as [
      [string, (e: { toLocation: { href: string } }) => void],
    ];
    listener({ toLocation: { href: "/app/donors" } });
    expect(hoisted.mockCapturePageview).toHaveBeenCalledWith("/app/donors");
  });

  it("reports global query and mutation errors through the Sentry helper", async () => {
    await import("./main");

    const queryOptions = hoisted.mockQueryCache.mock.calls[0]?.[0] as {
      onError: (error: unknown, query: { queryHash: string; queryKey: unknown[] }) => void;
    };
    queryOptions.onError(new Error("query failed"), {
      queryHash: "query-hash",
      queryKey: ["dashboard"],
    });

    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(expect.any(Error), "query", {
      queryHash: "query-hash",
      queryKey: ["safe", "1"],
    });

    const mutationOptions = hoisted.mockMutationCache.mock.calls[0]?.[0] as {
      onError: (
        error: unknown,
        variables: unknown,
        context: unknown,
        mutation: { options: { mutationKey?: unknown[] } },
      ) => void;
    };
    mutationOptions.onError(new Error("mutation failed"), undefined, undefined, {
      options: { mutationKey: ["save"] },
    });

    expect(hoisted.mockCaptureQueryError).toHaveBeenCalledWith(expect.any(Error), "mutation", {
      mutationKey: ["safe", "1"],
    });
  });
});
