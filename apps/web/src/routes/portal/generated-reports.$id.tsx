import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Skeleton } from "@grantpipe/ui";
import {
  usePortalGeneratedReport,
  portalGeneratedReportDownloadUrl,
} from "../../hooks/use-portal-session";
import { humanizeEnum, formatUtcCalendarDate } from "../../lib/format";

export const Route = createFileRoute("/portal/generated-reports/$id")({
  component: PortalGeneratedReportPage,
});

function formatBytes(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 1024) {
    return `${value.toString()} B`;
  }

  return `${Math.round(value / 1024).toString()} KB`;
}

function getDateText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return formatUtcCalendarDate(value);
}

export function PortalGeneratedReportPage() {
  const { id } = Route.useParams();
  const reportQuery = usePortalGeneratedReport(id);
  const report = reportQuery.data;

  if (reportQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading report…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load report</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {reportQuery.error instanceof Error
            ? reportQuery.error.message
            : "You may not have access to this report."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!report) return null;

  const format = typeof report.format === "string" ? humanizeEnum(report.format) : null;
  const status = typeof report.status === "string" ? humanizeEnum(report.status) : null;
  const type = typeof report.type === "string" ? humanizeEnum(report.type) : null;
  const generatedDate = getDateText(report.generatedAt ?? report.createdAt);
  const fileSize = formatBytes(report.fileSizeBytes);
  const fileName = report.fileName ?? report.filename;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          Back
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {String(report.title ?? report.name ?? "Generated report")}
          </h1>
          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        </div>
        <Button asChild>
          <a href={portalGeneratedReportDownloadUrl(id)} download>
            Download
          </a>
        </Button>
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        {format ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Format
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{format}</dd>
          </div>
        ) : null}
        {type ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </dt>
            <dd className="mt-1 text-sm text-foreground">{type}</dd>
          </div>
        ) : null}
        {generatedDate ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Generated
            </dt>
            <dd className="mt-1 text-sm text-foreground">{generatedDate}</dd>
          </div>
        ) : null}
        {fileSize ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              File size
            </dt>
            <dd className="mt-1 text-sm text-foreground">{fileSize}</dd>
          </div>
        ) : null}
        {fileName ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              File name
            </dt>
            <dd className="mt-1 text-sm text-foreground">{String(fileName)}</dd>
          </div>
        ) : null}
      </dl>

      {report.description ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="text-sm text-muted-foreground">{String(report.description)}</p>
        </div>
      ) : null}
    </div>
  );
}
