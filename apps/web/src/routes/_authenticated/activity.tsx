import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Input,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { Activity } from "lucide-react";
import { ACTIVITY_ENTITY_TYPES, type ActivityEntityType } from "@grantpipe/shared";
import { useOrgActivity, type ActivityRecord } from "../../hooks/use-activity";
import { useSession } from "../../hooks/use-session";
import { formatActivityEntityLabel, localDateInputEndOfDayIso } from "../../lib/format";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

const ACTIVITY_ERROR_TITLE = "Unable to load activity.";
const AUDITOR_ACTIVITY_ENTITY_TYPES = [
  "grant",
  "fund",
  "allocation",
  "expense",
  "reporting_requirement",
  "closeout_item",
  "generated_report",
  "document",
  "account",
  "fiscal_period",
  "journal_entry",
  "payment_request",
  "payment_request_line",
  "payment_request_adjustment",
  "payment",
] as const satisfies readonly ActivityEntityType[];

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function ActivityPage() {
  const navigate = useNavigate();
  const { memberRole } = useSession();
  const isAuditor = memberRole === "auditor";
  const visibleEntityTypes = isAuditor ? AUDITOR_ACTIVITY_ENTITY_TYPES : ACTIVITY_ENTITY_TYPES;
  const [entityTypeFilter, setEntityTypeFilter] = useState<ActivityEntityType | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const pageSize = 25;

  const { data, isLoading, isError } = useOrgActivity({
    entityType: entityTypeFilter !== "" ? entityTypeFilter : undefined,
    fromDate: fromDate !== "" ? new Date(fromDate).toISOString() : undefined,
    toDate: toDate !== "" ? localDateInputEndOfDayIso(toDate) : undefined,
    page,
    pageSize,
  });

  const entries: ActivityRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = entityTypeFilter !== "" || fromDate !== "" || toDate !== "";
  const hasActivityFilterChrome = entries.length > 0 || hasActiveFilters;

  return (
    <PageShell>
      <PageHeader variant="workbench" kicker="Audit trail" title="Activity Log" />

      {hasActivityFilterChrome ? (
        <section className="space-y-3">
          <header className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Filters</h2>
            <p className="text-sm text-muted-foreground">
              Narrow the log by entity type or date range.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-foreground">Entity type</label>
              <Select
                value={entityTypeFilter === "" ? "all" : entityTypeFilter}
                onValueChange={(val) => {
                  setEntityTypeFilter((val === "all" ? "" : val) as ActivityEntityType | "");
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Entity type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {visibleEntityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatActivityEntityLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="from-date-filter" className="text-sm font-medium text-foreground">
                From date
              </label>
              <Input
                id="from-date-filter"
                aria-label="From date"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="to-date-filter" className="text-sm font-medium text-foreground">
                To date
              </label>
              <Input
                id="to-date-filter"
                aria-label="To date"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {isError ? (
        <Alert variant="destructive" title={ACTIVITY_ERROR_TITLE}>
          Refresh the page or try again in a moment.
        </Alert>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card">
          {isLoading ? (
            <div className="space-y-1 p-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : entries.length === 0 ? (
            <div className="p-4">
              {hasActiveFilters ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No activity matches these filters.{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 font-medium text-primary"
                    onClick={() => {
                      setEntityTypeFilter("");
                      setFromDate("");
                      setToDate("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </p>
              ) : (
                <TeachAndActEmptyState
                  icon={<Activity className="size-5" />}
                  heading="Activity log"
                  description="Every change your team makes shows up here — who changed what, and when. Add a record to see your first entry."
                  primaryAction={{
                    label: isAuditor ? "Go to Grants" : "Go to Donors",
                    onClick: () => void navigate({ to: isAuditor ? "/grants" : "/donors" }),
                  }}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1 p-2" data-testid="activity-feed">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 rounded-lg px-3 py-3 hover:bg-muted/30 transition-colors"
                  data-testid="activity-entry"
                >
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {formatActivityEntityLabel(entry.entityType)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{entry.actorName ?? "System"}</span>{" "}
                      <span className="text-muted-foreground">
                        {entry.action.replace(/_/g, " ")}
                      </span>
                      {entry.entityLabel ? (
                        <>
                          {" "}
                          <span className="font-medium">{entry.entityLabel}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRelativeTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {total} {total === 1 ? "entry" : "entries"} total · Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next page
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
