import {
  captureQueryError,
  createReactRootOptions,
  initSentry,
  summarizeQueryKey,
} from "./lib/sentry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { capturePageview, initAnalytics } from "./lib/analytics";
import { initBingUet } from "./lib/bing-uet";
import { ErrorBoundary } from "./components/error-boundary";
import { AppNotFound } from "./components/app-not-found";
import "./app.css";

initSentry();
initAnalytics();
initBingUet();

export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        captureQueryError(error, "query", {
          queryHash: query.queryHash,
          queryKey: summarizeQueryKey(query.queryKey),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        captureQueryError(error, "mutation", {
          mutationKey: summarizeQueryKey(mutation.options.mutationKey),
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        retry: 1,
      },
    },
  });
}

export function createAppRouter() {
  return createRouter({
    routeTree,
    basepath: "/app",
    defaultNotFoundComponent: AppNotFound,
  });
}

export const router = createAppRouter();

// Track pageviews on every resolved navigation, including the initial load.
router.subscribe("onResolved", ({ toLocation }) => {
  capturePageview(toLocation.href);
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// queryClient is created per-mount inside mountApp() to avoid sharing state
// across server-side renders or test runs. The exported let variable is
// updated on each mount so other modules always reference the active instance.
export let queryClient = createAppQueryClient();

export function mountApp(rootElement: HTMLElement) {
  queryClient = createAppQueryClient();
  createRoot(rootElement, createReactRootOptions()).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  mountApp(rootElement);
}
