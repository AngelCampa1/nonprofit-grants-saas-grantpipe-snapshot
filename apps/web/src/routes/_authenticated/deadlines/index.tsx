import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangleIcon, RadarIcon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
  StatusPanel,
} from "@grantpipe/ui";
import {
  RADAR_OBLIGATION_KINDS,
  RADAR_URGENCY_BANDS,
  type RadarObligation,
  type RadarObligationKind,
  type RadarObligationStatus,
  type RadarUrgencyBand,
} from "@grantpipe/shared";
import { useDeadlineRadar } from "../../../hooks/use-deadline-radar";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { deadlinesTabs } from "../../../config/page-tabs";

export const Route = createFileRoute("/_authenticated/deadlines/")({
  component: RadarPage,
});

export const RADAR_BAND_LABELS: Record<RadarUrgencyBand, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  this_week: "This week",
  this_month: "This month",
  later: "Later",
};

export const RADAR_KIND_LABELS: Record<RadarObligationKind, string> = {
  application_deadline: "Application deadlines",
  reporting_requirement: "Reporting",
  closeout_item: "Closeout",
  restriction_release: "Restriction release",
  period_close: "Period close",
};

const RADAR_STATUS_OPTIONS: Array<{ value: RadarObligationStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
];

export function getBandBadgeVariant(
  band: RadarUrgencyBand,
): "destructive" | "warning" | "secondary" {
  if (band === "overdue") {
    return "destructive";
  }
  if (band === "due_today" || band === "this_week") {
    return "warning";
  }
  return "secondary";
}

export function formatDueLabel(obligation: RadarObligation): string {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(obligation.dueDate));

  if (obligation.daysUntilDue === 0) {
    return `Due today (${dateLabel})`;
  }
  if (obligation.daysUntilDue < 0) {
    const overdueDays = Math.abs(obligation.daysUntilDue);
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue (${dateLabel})`;
  }
  return `In ${obligation.daysUntilDue} day${obligation.daysUntilDue === 1 ? "" : "s"} (${dateLabel})`;
}

type RadarLinkTarget = { to: string; params: Record<string, string>; ariaLabel: string };

export function getObligationLink(obligation: RadarObligation): RadarLinkTarget {
  const { target, title } = obligation;
  if (target.type === "grant") {
    return {
      to: "/grants/$grantId",
      params: { grantId: target.id },
      ariaLabel: `Open grant for ${title}`,
    };
  }
  if (target.type === "fund") {
    return {
      to: "/funds/$fundId",
      params: { fundId: target.id },
      ariaLabel: `Open fund for ${title}`,
    };
  }
  return {
    to: "/accounting/periods",
    params: {},
    ariaLabel: `Open fiscal periods for ${title}`,
  };
}

function toggleKind(
  selected: RadarObligationKind[],
  kind: RadarObligationKind,
): RadarObligationKind[] {
  return selected.includes(kind) ? selected.filter((value) => value !== kind) : [...selected, kind];
}

export function RadarPage() {
  const [selectedKinds, setSelectedKinds] = useState<RadarObligationKind[]>([]);
  const [status, setStatus] = useState<RadarObligationStatus | "all">("all");

  const radarQuery = useDeadlineRadar({
    kinds: selectedKinds.length > 0 ? selectedKinds : undefined,
    status: status === "all" ? undefined : status,
  });

  const bands = radarQuery.data?.bands;
  const totalCount = useMemo(() => {
    if (!bands) {
      return 0;
    }
    return RADAR_URGENCY_BANDS.reduce((sum, band) => sum + bands[band].length, 0);
  }, [bands]);

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Reporting & Compliance"
        title="Deadline Radar"
        description="Every dated obligation across grants, funds, and fiscal periods in one feed."
      />
      <AppPageTabs groupId="deadlines" items={deadlinesTabs} />

      <div className="flex flex-col gap-3" data-testid="radar-filters">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by obligation type">
          {RADAR_OBLIGATION_KINDS.map((kind) => {
            const active = selectedKinds.includes(kind);
            return (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                className="rounded-full"
                onClick={() => setSelectedKinds((current) => toggleKind(current, kind))}
              >
                {RADAR_KIND_LABELS[kind]}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {RADAR_STATUS_OPTIONS.map((option) => {
            const active = status === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                className="rounded-full"
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      {radarQuery.isLoading ? (
        <StatusPanel variant="loading" title="Loading deadlines…">
          Gathering obligations across your records.
        </StatusPanel>
      ) : radarQuery.isError ? (
        <StatusPanel variant="error" title="Unable to load deadlines.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : totalCount === 0 ? (
        <StatusPanel variant="empty" title="Nothing is due">
          No obligations match these filters. You are all caught up.
        </StatusPanel>
      ) : (
        <div className="space-y-6" data-testid="radar-feed">
          {RADAR_URGENCY_BANDS.map((band) => {
            const items = bands ? bands[band] : [];
            if (items.length === 0) {
              return null;
            }
            return (
              <Card key={band} className="rounded-2xl border-border bg-card shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {band === "overdue" ? (
                      <AlertTriangleIcon className="size-4 text-destructive" aria-hidden="true" />
                    ) : (
                      <RadarIcon className="size-4 text-primary" aria-hidden="true" />
                    )}
                    {RADAR_BAND_LABELS[band]}
                  </CardTitle>
                  <Badge variant={getBandBadgeVariant(band)} className="rounded-full">
                    {items.length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((obligation) => {
                    const link = getObligationLink(obligation);
                    return (
                      <article
                        key={obligation.id}
                        data-testid="radar-row"
                        className="rounded-2xl border border-border bg-muted/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium leading-5 text-foreground">
                              {obligation.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {obligation.contextLabel}
                            </p>
                          </div>
                          <Badge variant="outline" className="rounded-full">
                            {RADAR_KIND_LABELS[obligation.kind]}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            {formatDueLabel(obligation)}
                          </p>
                          <Link
                            to={link.to}
                            params={link.params}
                            aria-label={link.ariaLabel}
                            className="text-sm font-medium text-primary hover:underline underline-offset-4"
                          >
                            View record
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
