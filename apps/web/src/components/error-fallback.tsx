import { Link } from "@tanstack/react-router";
import { Button } from "@grantpipe/ui";
import { getUserFacingErrorMessage } from "../lib/sentry";

interface ErrorFallbackProps {
  error: unknown;
  onReset?: () => void;
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const message =
    error instanceof Error ? getUserFacingErrorMessage(error) : "An unexpected error occurred.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center font-body">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onReset && <Button onClick={onReset}>Try again</Button>}
        <Button variant="outline" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
