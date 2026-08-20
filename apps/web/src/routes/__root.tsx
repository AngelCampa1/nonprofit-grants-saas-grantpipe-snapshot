import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button, EmptyStateLinkProvider, Skeleton } from "@grantpipe/ui";
import { AiUsageCapProvider } from "../components/dialogs/ai-usage-cap-provider";
import { ErrorFallback } from "../components/error-fallback";
import { RouterEmptyStateLink } from "../components/router-empty-state-link";
import { captureAppException } from "../lib/sentry";
import { Suspense, useEffect } from "react";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RootErrorPage,
});

export function RootErrorPage({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    console.error("[RootErrorPage] Route render error:", error);
    try {
      captureAppException(error, { tags: { source: "root-route-error" } });
    } catch {
      // Error reporting must not make the recovery UI fail.
    }
  }, [error]);

  return <ErrorFallback error={error} onReset={reset} />;
}

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Skip to main content
      </a>
      <AiUsageCapProvider>
        <Suspense
          fallback={
            <div
              data-testid="root-suspense-fallback"
              className="flex min-h-screen items-center justify-center p-8"
            >
              <Skeleton className="h-32 w-full max-w-2xl" />
            </div>
          }
        >
          <EmptyStateLinkProvider component={RouterEmptyStateLink}>
            <Outlet />
          </EmptyStateLinkProvider>
        </Suspense>
      </AiUsageCapProvider>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center font-body">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-caps text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Page not found
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          The page you are looking for does not exist or may have been moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
