import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@grantpipe/ui";
import { usePortalProgram } from "../../hooks/use-portal-session";
import { humanizeEnum } from "../../lib/format";

export const Route = createFileRoute("/portal/programs/$id")({
  component: PortalProgramPage,
});

export function PortalProgramPage() {
  const { id } = Route.useParams();
  const programQuery = usePortalProgram(id);
  const program = programQuery.data;

  if (programQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading program…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (programQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load program</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {programQuery.error instanceof Error
            ? programQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!program) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(program.name ?? "Program")}
        </h1>
        {program.status ? (
          <p className="text-sm text-muted-foreground">{humanizeEnum(String(program.status))}</p>
        ) : null}
      </div>

      {program.code ? (
        <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Code
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{String(program.code)}</dd>
          </div>
        </dl>
      ) : null}

      {program.description ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="text-sm text-muted-foreground">{String(program.description)}</p>
        </div>
      ) : null}
    </div>
  );
}
