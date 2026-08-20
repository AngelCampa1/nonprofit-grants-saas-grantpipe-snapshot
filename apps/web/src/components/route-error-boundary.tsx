import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@grantpipe/ui";

import { captureAppException } from "../lib/sentry";

interface RouteErrorBoundaryProps extends ErrorComponentProps {
  source?: string;
}

/**
 * Inline error card for an individual route subtree. Unlike the top-level
 * RootErrorPage, this preserves the surrounding shell (sidebar, topbar) so
 * users can navigate away from a failing route without reloading.
 */
export function RouteErrorBoundary({ error, reset, source }: RouteErrorBoundaryProps) {
  useEffect(() => {
    console.error("[RouteErrorBoundary] Route render error:", error);
    try {
      captureAppException(error, { tags: { source: source ?? "route-error-boundary" } });
    } catch {
      // Capturing must never make the recovery UI crash.
    }
  }, [error, source]);

  const message =
    error instanceof Error && error.message
      ? error.message
      : "Something went wrong while loading this page.";

  return (
    <div
      data-testid="route-error-boundary"
      className="flex min-h-[40vh] items-center justify-center p-6"
    >
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden className="size-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-foreground">
          Couldn&apos;t load this page
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-5">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
