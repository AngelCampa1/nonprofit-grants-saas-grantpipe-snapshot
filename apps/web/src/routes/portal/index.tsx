import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePortalSession } from "../../hooks/use-portal-session";

export const Route = createFileRoute("/portal/")({
  component: PortalIndexPage,
});

export function PortalIndexPage() {
  const navigate = useNavigate();
  const portalQuery = usePortalSession();

  useEffect(() => {
    if (portalQuery.isSuccess) {
      void navigate({ to: "/portal/home", replace: true });
    }
  }, [portalQuery.isSuccess, navigate]);

  if (portalQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-sm font-medium text-foreground">No active portal session.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Open the secure link you received to access your review materials.
      </p>
    </div>
  );
}
