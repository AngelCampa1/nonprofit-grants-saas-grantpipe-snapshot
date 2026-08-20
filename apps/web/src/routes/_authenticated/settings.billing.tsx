import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

const billingSearchSchema = z.object({
  checkout: z.string().optional().catch(undefined),
  portal: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/settings/billing")({
  validateSearch: billingSearchSchema,
  component: SettingsBillingRedirect,
});

export function SettingsBillingRedirect() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/settings",
      hash: "billing",
      search,
      replace: true,
    });
  }, [navigate, search]);

  return (
    <div
      data-testid="settings-billing-redirecting"
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"
    >
      <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Redirecting&hellip;</p>
    </div>
  );
}
