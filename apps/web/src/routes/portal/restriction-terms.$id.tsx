import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@grantpipe/ui";
import { usePortalRestrictionTerm } from "../../hooks/use-portal-session";
import { humanizeEnum, formatUtcCalendarDate } from "../../lib/format";

export const Route = createFileRoute("/portal/restriction-terms/$id")({
  component: PortalRestrictionTermPage,
});

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function getDateText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return formatUtcCalendarDate(value);
}

export function PortalRestrictionTermPage() {
  const { id } = Route.useParams();
  const termQuery = usePortalRestrictionTerm(id);
  const term = termQuery.data;

  if (termQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading restriction…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (termQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load restriction</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {termQuery.error instanceof Error
            ? termQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!term) return null;

  const currency = typeof term.currency === "string" ? term.currency : "USD";
  const restrictionType =
    typeof term.restrictionType === "string" ? humanizeEnum(term.restrictionType) : null;
  const source = typeof term.source === "string" ? humanizeEnum(term.source) : null;
  const startDate = getDateText(term.startDate);
  const endDate = getDateText(term.endDate);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(term.title ?? "Restriction term")}
        </h1>
        {restrictionType ? (
          <p className="text-sm text-muted-foreground">{restrictionType}</p>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        {source ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Source
            </dt>
            <dd className="mt-1 text-sm text-foreground">{source}</dd>
          </div>
        ) : null}
        {term.beginningBalanceCents != null ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Beginning balance
            </dt>
            <dd className="mt-1 text-lg font-semibold text-foreground">
              {formatCurrency(term.beginningBalanceCents as number, currency)}
            </dd>
          </div>
        ) : null}
        {startDate ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Start date
            </dt>
            <dd className="mt-1 text-sm text-foreground">{startDate}</dd>
          </div>
        ) : null}
        {endDate ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              End date
            </dt>
            <dd className="mt-1 text-sm text-foreground">{endDate}</dd>
          </div>
        ) : null}
      </dl>

      {term.purposeStatement ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Purpose</h2>
          <p className="text-sm text-muted-foreground">{String(term.purposeStatement)}</p>
        </div>
      ) : null}

      {term.releaseRule ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Release rule</h2>
          <p className="text-sm text-muted-foreground">{String(term.releaseRule)}</p>
        </div>
      ) : null}

      {term.evidenceRequirement ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Evidence requirement</h2>
          <p className="text-sm text-muted-foreground">{String(term.evidenceRequirement)}</p>
        </div>
      ) : null}
    </div>
  );
}
