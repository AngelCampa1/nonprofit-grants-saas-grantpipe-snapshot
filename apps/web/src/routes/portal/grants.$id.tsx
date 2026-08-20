import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@grantpipe/ui";
import { usePortalGrant } from "../../hooks/use-portal-session";
import { humanizeEnum, formatUtcCalendarDate } from "../../lib/format";

export const Route = createFileRoute("/portal/grants/$id")({
  component: PortalGrantPage,
});

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function PortalGrantPage() {
  const { id } = Route.useParams();
  const grantQuery = usePortalGrant(id);
  const grant = grantQuery.data;

  if (grantQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading grant…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (grantQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load grant</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {grantQuery.error instanceof Error
            ? grantQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!grant) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(grant.name ?? "Grant")}
        </h1>
        {grant.status ? (
          <p className="text-sm text-muted-foreground">{humanizeEnum(String(grant.status))}</p>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        {grant.amountCents != null ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Grant amount
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">
              {formatCurrency(grant.amountCents as number)}
            </dd>
          </div>
        ) : null}
        {grant.startDate ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Start date
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {formatUtcCalendarDate(String(grant.startDate))}
            </dd>
          </div>
        ) : null}
        {grant.endDate ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              End date
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {formatUtcCalendarDate(String(grant.endDate))}
            </dd>
          </div>
        ) : null}
        {grant.applicationDeadline ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Application deadline
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {formatUtcCalendarDate(String(grant.applicationDeadline))}
            </dd>
          </div>
        ) : null}
      </dl>

      {grant.description ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="text-sm text-muted-foreground">{String(grant.description)}</p>
        </div>
      ) : null}

      {grant.notes ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Notes</h2>
          <p className="text-sm text-muted-foreground">{String(grant.notes)}</p>
        </div>
      ) : null}
    </div>
  );
}
