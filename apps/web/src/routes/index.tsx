import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/dashboard", replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-heading font-bold text-primary">Opening GrantPipe</h1>
        <p className="mt-2 text-muted-foreground">Routing you into the workspace.</p>
      </div>
    </div>
  );
}
