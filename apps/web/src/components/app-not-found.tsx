import { Link } from "@tanstack/react-router";
import { Button } from "@grantpipe/ui";

/**
 * In-shell "page not found" body. Rendered as the router's
 * defaultNotFoundComponent so unknown nested routes (e.g. an unknown
 * /accounting/* path) show a styled 404 inside the app shell instead of the
 * bare unstyled fallback. Also reused by the authenticated layout route.
 */
export function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
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
