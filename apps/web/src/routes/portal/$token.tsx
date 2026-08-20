import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePortalAuth } from "../../hooks/use-portal-session";

export const Route = createFileRoute("/portal/$token")({
  component: PortalTokenPage,
});

export function PortalTokenPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { authenticate } = usePortalAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Track which token we have already exchanged. Portal links are single-use,
  // so the effect must fire exactly once per token even though `authenticate`
  // and `navigate` are unstable callable identities across renders.
  const exchangedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (exchangedTokenRef.current === token) {
      return;
    }
    exchangedTokenRef.current = token;

    async function exchange() {
      try {
        await authenticate.mutateAsync(token);
        setIsLoading(false);
        void navigate({ to: "/portal/home", replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid or expired portal link.");
        setIsLoading(false);
      }
    }

    void exchange();
  }, [token, authenticate, navigate]);

  if (isLoading && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Verifying your access link…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
          <p className="text-sm font-semibold text-destructive">Access link invalid</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Links are single-use and expire after their set duration. Contact the organization to
            request a new link.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
