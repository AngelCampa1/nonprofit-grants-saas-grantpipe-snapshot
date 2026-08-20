import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RouteErrorBoundary } from "../components/route-error-boundary";
import { usePortalSession, daysUntilExpiry } from "../hooks/use-portal-session";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
  errorComponent: (props) => <RouteErrorBoundary {...props} source="portal-route" />,
});

function PortalLayout() {
  const portalQuery = usePortalSession();
  const session = portalQuery.data?.session;
  const reviewer = portalQuery.data?.reviewer;
  const expiresAt = session?.expiresAt;
  const daysLeft = expiresAt ? daysUntilExpiry(expiresAt) : null;

  return (
    <div className="min-h-screen bg-background font-body">
      {/* Reviewer identity banner */}
      {reviewer ? (
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Verified access
              </span>
              <span className="text-sm font-medium text-foreground">{reviewer.name}</span>
              {session?.purpose ? (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  ({session.purpose})
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              {daysLeft !== null
                ? daysLeft > 0
                  ? `Access expires in ${daysLeft.toString()} day${daysLeft === 1 ? "" : "s"}`
                  : "Access expired"
                : null}
            </div>
          </div>
        </header>
      ) : null}

      {/* Expiry warning */}
      {daysLeft !== null && daysLeft <= 3 && daysLeft > 0 ? (
        <div className="border-b border-accent/30 bg-accent/10">
          <div className="mx-auto max-w-4xl px-4 py-2 text-sm text-accent-foreground">
            Your access expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Contact the
            organization if you need extended access.
          </div>
        </div>
      ) : null}

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <p className="text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a
              href="https://grantpipe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
            >
              GrantPipe
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// Internal component used by the index route to redirect
export function PortalIndexRedirect() {
  const navigate = useNavigate();
  const portalQuery = usePortalSession();

  useEffect(() => {
    if (portalQuery.isSuccess) {
      void navigate({ to: "/portal/home" });
    }
  }, [portalQuery.isSuccess, navigate]);

  if (portalQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium text-foreground">No active portal session.</p>
      <p className="text-sm text-muted-foreground">
        Open the portal link you received to access your review materials.
      </p>
    </div>
  );
}
