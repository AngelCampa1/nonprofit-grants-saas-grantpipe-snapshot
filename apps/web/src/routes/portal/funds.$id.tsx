import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@grantpipe/ui";
import { usePortalFund } from "../../hooks/use-portal-session";
import { humanizeEnum } from "../../lib/format";

export const Route = createFileRoute("/portal/funds/$id")({
  component: PortalFundPage,
});

export function PortalFundPage() {
  const { id } = Route.useParams();
  const fundQuery = usePortalFund(id);
  const fund = fundQuery.data;

  if (fundQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading fund…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (fundQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load fund</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {fundQuery.error instanceof Error
            ? fundQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!fund) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(fund.name ?? "Fund")}
        </h1>
        {fund.type ? (
          <p className="text-sm text-muted-foreground">{humanizeEnum(String(fund.type))}</p>
        ) : null}
      </div>

      {fund.description ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="text-sm text-muted-foreground">{String(fund.description)}</p>
        </div>
      ) : null}
    </div>
  );
}
