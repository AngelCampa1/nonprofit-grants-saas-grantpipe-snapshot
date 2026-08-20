import {
  formatCurrencyCents,
  formatUtcCalendarDate,
  type ActivityEntityType,
} from "@grantpipe/shared";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@grantpipe/ui";
import { useEntityActivity } from "../hooks/use-activity";

type EntityActivitySectionProps = {
  entityType: ActivityEntityType;
  entityId: string;
};

const hiddenChangeKeys = new Set(["orgId", "entityId", "funderId"]);

function formatDate(value: string) {
  return formatUtcCalendarDate(value);
}

// The audit trail records exact amounts. The shared formatter keeps cents when
// present, so a change to $500.50 never collapses to $500.
function formatCurrency(cents: number) {
  return formatCurrencyCents(cents);
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatChangeLabel(key: string) {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bCents\b/g, "")
    .trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shouldPreserveRawString(key: string, value: string) {
  if (/id$/i.test(key) || /(email|url|uri|website)/i.test(key)) {
    return true;
  }

  if (value.includes("@") || /^https?:\/\//i.test(value) || /^www\./i.test(value)) {
    return true;
  }

  return false;
}

function formatPrimitiveChangeValue(key: string, value: string | number | boolean) {
  if (typeof value === "number" && key.endsWith("Cents")) {
    return formatCurrency(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string" &&
    /(date|deadline)/i.test(key) &&
    !Number.isNaN(Date.parse(value))
  ) {
    return formatDate(value);
  }

  if (
    typeof value === "string" &&
    !shouldPreserveRawString(key, value) &&
    /^[a-z0-9_-]+(?: [a-z0-9_-]+)*$/i.test(value) &&
    value === value.toLowerCase()
  ) {
    return titleCase(value);
  }

  return String(value);
}

function formatChangeValue(key: string, value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return formatPrimitiveChangeValue(key, value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean"
          ? formatPrimitiveChangeValue(key, item)
          : JSON.stringify(item),
      )
      .join(", ");
  }

  return JSON.stringify(value);
}

function summarizeChanges(changes: Record<string, unknown> | null | undefined) {
  if (!changes) {
    return [];
  }

  return Object.entries(changes)
    .filter(([key, value]) => {
      if (hiddenChangeKeys.has(key)) {
        return false;
      }

      if (value == null) {
        return false;
      }

      if (typeof value === "string" && value.trim().length === 0) {
        return false;
      }

      return true;
    })
    .map(([key, value]) => ({
      key: formatChangeLabel(key),
      value: formatChangeValue(key, value),
    }));
}

export function EntityActivitySection({ entityType, entityId }: EntityActivitySectionProps) {
  const activityQuery = useEntityActivity(entityType, entityId);
  const entries = activityQuery.data?.data ?? [];

  const errorMessage =
    activityQuery.isError && activityQuery.error instanceof Error
      ? activityQuery.error.message
      : activityQuery.isError
        ? "Unable to load activity."
        : null;

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activityQuery.isLoading ? (
          <div
            data-slot="activity-loading"
            role="status"
            aria-live="polite"
            className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4"
          >
            <p className="text-sm text-muted-foreground">Loading activity…</p>
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div
            data-slot="activity-empty"
            className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center"
          >
            <h3 className="text-sm font-semibold text-foreground">No activity yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Changes to this record will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const changes = summarizeChanges(entry.changes);

              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{titleCase(entry.action)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                  </div>
                  {changes.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {changes.map((change) => (
                        <div
                          key={`${entry.id}-${change.key}`}
                          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                        >
                          <p className="font-medium text-foreground">{change.key}</p>
                          <p className="mt-1 break-words">{change.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
