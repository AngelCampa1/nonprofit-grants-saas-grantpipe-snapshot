import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangleIcon } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import {
  ANALYTICS_EVENTS,
  DONOR_LAPSE_RISK_BANDS,
  type DonorLapseRiskBand,
} from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { useAtRiskDonors, type AtRiskDonor } from "../../../hooks/use-at-risk-donors";
import { captureEvent } from "../../../lib/analytics";
import { getCountBucket } from "../../../lib/analytics-buckets";
import { formatCurrency, formatUtcCalendarDate } from "../../../lib/format";
import { donorTabs } from "../../../config/page-tabs";

export const Route = createFileRoute("/_authenticated/donors/at-risk")({
  component: AtRiskDonorsPage,
});

/** Bands the view shows (excludes "none"). */
const VISIBLE_BANDS = DONOR_LAPSE_RISK_BANDS.filter(
  (b): b is Exclude<DonorLapseRiskBand, "none"> => b !== "none",
);

export const LAPSE_BAND_LABELS: Record<Exclude<DonorLapseRiskBand, "none">, string> = {
  lapsing: "Lapsing",
  at_risk: "At Risk",
  lapsed: "Lapsed",
};

export function getLapseBandVariant(
  band: Exclude<DonorLapseRiskBand, "none">,
): "warning" | "destructive" | "secondary" {
  if (band === "lapsing") return "warning";
  if (band === "at_risk") return "destructive";
  return "secondary";
}

function toggleBand(
  selected: Array<Exclude<DonorLapseRiskBand, "none">>,
  band: Exclude<DonorLapseRiskBand, "none">,
): Array<Exclude<DonorLapseRiskBand, "none">> {
  return selected.includes(band) ? selected.filter((b) => b !== band) : [...selected, band];
}

export function formatDaysSince(days: number): string {
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function AtRiskDonorsPage() {
  const [selectedBands, setSelectedBands] = useState<Array<Exclude<DonorLapseRiskBand, "none">>>(
    [],
  );

  const { data, isLoading, isError, isPlanGated } = useAtRiskDonors({
    bands: selectedBands.length > 0 ? selectedBands : undefined,
  });

  const donors = data?.donors ?? [];
  const totals = data?.totals;

  useEffect(() => {
    if (isLoading || isError || isPlanGated || !data) return;
    captureEvent(ANALYTICS_EVENTS.donorLapseViewed, {
      has_filters: selectedBands.length > 0,
      selected_bands: selectedBands,
      selected_band_count: selectedBands.length,
      visible_donor_count_bucket: getCountBucket(donors.length),
      total_donor_count_bucket: getCountBucket(totals?.total ?? donors.length),
    });
  }, [data, donors.length, isError, isLoading, isPlanGated, selectedBands, totals?.total]);

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Fundraising"
        title="At-Risk Donors"
        description="Donors who have gone quiet based on their giving history."
      />

      <AppPageTabs groupId="donors" items={donorTabs} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by band">
        {VISIBLE_BANDS.map((band) => {
          const active = selectedBands.includes(band);
          return (
            <Button
              key={band}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              className="rounded-full"
              onClick={() => {
                const nextBands = toggleBand(selectedBands, band);
                captureEvent(ANALYTICS_EVENTS.donorLapseFilterChanged, {
                  has_filters: nextBands.length > 0,
                  selected_bands: nextBands,
                  selected_band_count: nextBands.length,
                });
                setSelectedBands(nextBands);
              }}
            >
              {LAPSE_BAND_LABELS[band]}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <StatusPanel variant="loading" title="Loading at-risk donors…">
          Checking giving history across your donors.
        </StatusPanel>
      ) : isPlanGated ? (
        <StatusPanel variant="empty" title="Growth plan required">
          At-risk donor tracking is available on the Growth plan.{" "}
          <Link
            to="/settings"
            hash="billing"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Go to Billing to upgrade.
          </Link>
        </StatusPanel>
      ) : isError ? (
        <StatusPanel variant="error" title="Unable to load at-risk donors.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : donors.length === 0 ? (
        <StatusPanel variant="empty" title="No at-risk donors right now">
          All your donors are within their expected giving cadence.
        </StatusPanel>
      ) : (
        <>
          {totals && (
            <div
              className="flex flex-wrap gap-4 text-sm text-muted-foreground"
              data-testid="at-risk-totals"
            >
              <span>
                <span className="font-medium text-foreground">{totals.lapsing}</span> lapsing
              </span>
              <span>
                <span className="font-medium text-foreground">{totals.at_risk}</span> at risk
              </span>
              <span>
                <span className="font-medium text-foreground">{totals.lapsed}</span> lapsed
              </span>
            </div>
          )}

          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangleIcon className="size-4 text-warning" aria-hidden="true" />
                Donors to follow up
              </CardTitle>
              <Badge variant="secondary" className="rounded-full">
                {donors.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last gift</TableHead>
                    <TableHead>Days since</TableHead>
                    <TableHead className="text-right">Lifetime giving</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donors.map((donor: AtRiskDonor) => (
                    <TableRow key={donor.contactId} data-testid="at-risk-row">
                      <TableCell>
                        <Link
                          to="/donors/$contactId"
                          params={{ contactId: donor.contactId }}
                          className="font-medium text-foreground hover:underline underline-offset-4"
                        >
                          {donor.displayName}
                        </Link>
                        {donor.email && (
                          <p className="text-xs text-muted-foreground">{donor.email}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getLapseBandVariant(donor.band)} className="rounded-full">
                          {LAPSE_BAND_LABELS[donor.band]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {donor.lastGiftDate ? formatUtcCalendarDate(donor.lastGiftDate) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDaysSince(donor.daysSinceLastGift)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(donor.lifetimeGivingCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
