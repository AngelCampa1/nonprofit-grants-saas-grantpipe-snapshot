import { useEffect, useState } from "react";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ShieldAlertIcon } from "lucide-react";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
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
  useBudgetSentinel,
  type BudgetSentinelItem,
  type OverspendItem,
  type UnderspendItem,
} from "../../../hooks/use-budget-sentinel";
import { captureEvent } from "../../../lib/analytics";
import { getCountBucket } from "../../../lib/analytics-buckets";
import { formatCurrency } from "../../../lib/format";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { grantsTabs } from "../../../config/page-tabs";

export const Route = createLazyFileRoute("/_authenticated/grants/sentinel")({
  component: BudgetSentinelPage,
});

type SentinelBand =
  | "over_budget"
  | "projected_overspend"
  | "near_limit"
  | "lapsed_unspent"
  | "lapsing_soon"
  | "lapse_watch";

export const BAND_LABELS: Record<SentinelBand, string> = {
  over_budget: "Over Budget",
  projected_overspend: "Projected Overspend",
  near_limit: "Near Limit",
  lapsed_unspent: "Lapsed Unspent",
  lapsing_soon: "Lapsing Soon",
  lapse_watch: "Lapse Watch",
};

export function getBandVariant(band: SentinelBand): "destructive" | "warning" | "secondary" {
  if (band === "over_budget" || band === "lapsed_unspent") return "destructive";
  if (band === "projected_overspend" || band === "lapsing_soon") return "warning";
  return "secondary";
}

export function formatDaysUntilEnd(days: number): string {
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function formatExpiredDaysAgo(daysUntilEnd: number): string {
  const elapsed = Math.abs(daysUntilEnd);
  return `expired ${elapsed} ${elapsed === 1 ? "day" : "days"} ago`;
}

type KindFilter = "overspend" | "underspend";

const KIND_LABELS: Record<KindFilter, string> = {
  overspend: "Overspend",
  underspend: "Underspend",
};

const ALL_KINDS: KindFilter[] = ["overspend", "underspend"];

function toggleKind(selected: KindFilter[], kind: KindFilter): KindFilter[] {
  return selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind];
}

function captureSentinelItemOpened(item: BudgetSentinelItem, linkType: "grant" | "fund") {
  captureEvent(ANALYTICS_EVENTS.budgetSentinelItemOpened, {
    kind: item.kind,
    status: item.band,
    link_type: linkType,
  });
}

function OverspendRow({ item }: { item: OverspendItem }) {
  return (
    <TableRow data-testid="sentinel-row">
      <TableCell>
        <Link
          to="/grants/$grantId"
          params={{ grantId: item.grantId }}
          className="font-medium text-foreground hover:underline underline-offset-4"
          onClick={() => captureSentinelItemOpened(item, "grant")}
        >
          {item.category} - {item.grantName}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="rounded-full text-xs">
          Overspend
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={getBandVariant(item.band)} className="rounded-full text-xs">
          {BAND_LABELS[item.band]}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatCurrency(item.overByCents > 0 ? item.overByCents : item.projectedCents)}
      </TableCell>
    </TableRow>
  );
}

function UnderspendRow({ item }: { item: UnderspendItem }) {
  const titleNode = item.fundId ? (
    <Link
      to="/funds/$fundId"
      params={{ fundId: item.fundId }}
      className="font-medium text-foreground hover:underline underline-offset-4"
      onClick={() => captureSentinelItemOpened(item, "fund")}
    >
      {item.title}
    </Link>
  ) : item.grantId ? (
    <Link
      to="/grants/$grantId"
      params={{ grantId: item.grantId }}
      className="font-medium text-foreground hover:underline underline-offset-4"
      onClick={() => captureSentinelItemOpened(item, "grant")}
    >
      {item.title}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{item.title}</span>
  );

  return (
    <TableRow data-testid="sentinel-row">
      <TableCell>
        {titleNode}
        {item.fundName && <p className="text-xs text-muted-foreground">{item.fundName}</p>}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="rounded-full text-xs">
          Underspend
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={getBandVariant(item.band)} className="rounded-full text-xs">
          {BAND_LABELS[item.band]}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <span>{formatCurrency(item.balanceCents)}</span>
        <span className="ml-1 text-xs">
          {item.band === "lapsed_unspent"
            ? `- ${formatExpiredDaysAgo(item.daysUntilEnd)}`
            : `- lapses in ${formatDaysUntilEnd(item.daysUntilEnd)}`}
        </span>
      </TableCell>
    </TableRow>
  );
}

function SentinelRow({ item }: { item: BudgetSentinelItem }) {
  if (item.kind === "overspend") {
    return <OverspendRow item={item} />;
  }
  return <UnderspendRow item={item} />;
}

export function BudgetSentinelPage() {
  const [selectedKinds, setSelectedKinds] = useState<KindFilter[]>([]);

  const { data, isLoading, isError, isPlanGated } = useBudgetSentinel({
    kinds: selectedKinds.length > 0 ? selectedKinds : undefined,
  });

  const items = data?.items ?? [];
  const totals = data?.totals;

  useEffect(() => {
    if (isLoading) {
      captureEvent(ANALYTICS_EVENTS.budgetSentinelViewed, { status: "loading" });
      return;
    }

    if (isPlanGated) {
      captureEvent(ANALYTICS_EVENTS.budgetSentinelViewed, { status: "plan_gated" });
      return;
    }

    if (isError) {
      captureEvent(ANALYTICS_EVENTS.budgetSentinelViewed, { status: "error" });
      return;
    }

    captureEvent(ANALYTICS_EVENTS.budgetSentinelViewed, {
      status: items.length === 0 ? "empty" : "ready",
      item_count_bucket: getCountBucket(items.length),
      total_at_risk_count_bucket: getCountBucket(totals?.totalAtRisk ?? 0),
      overspend_count_bucket: getCountBucket(totals?.overspend.total ?? 0),
      underspend_count_bucket: getCountBucket(totals?.underspend.total ?? 0),
    });
  }, [isError, isLoading, isPlanGated, items.length, totals]);

  function handleKindToggle(kind: KindFilter) {
    setSelectedKinds((current) => {
      const nextKinds = toggleKind(current, kind);
      captureEvent(ANALYTICS_EVENTS.budgetSentinelFilterChanged, {
        status: nextKinds.includes(kind) ? "enabled" : "disabled",
        kind,
        selected_kind_count_bucket: getCountBucket(nextKinds.length),
      });
      return nextKinds;
    });
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Budget Sentinel"
        description="Grants and funds at risk of overspending or lapsing unspent."
      />
      <AppPageTabs groupId="grants" items={grantsTabs} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        {ALL_KINDS.map((kind) => {
          const active = selectedKinds.includes(kind);
          return (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              className="rounded-full"
              onClick={() => handleKindToggle(kind)}
            >
              {KIND_LABELS[kind]}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <StatusPanel variant="loading" title="Loading Budget Sentinel…">
          Checking budgets across your grants and funds.
        </StatusPanel>
      ) : isPlanGated ? (
        <StatusPanel variant="empty" title="Budget Sentinel needs a plan check">
          See Billing to check your plan.{" "}
          <Link
            to="/settings"
            hash="billing"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            See Billing.
          </Link>
        </StatusPanel>
      ) : isError ? (
        <StatusPanel variant="error" title="Unable to load Budget Sentinel.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : items.length === 0 ? (
        <StatusPanel variant="empty" title="No budget risks detected">
          All grants and funds are within expected spending ranges.
        </StatusPanel>
      ) : (
        <>
          {totals && (
            <div
              className="flex flex-wrap gap-4 text-sm text-muted-foreground"
              data-testid="sentinel-totals"
            >
              <span>
                <span className="font-medium text-foreground">{totals.overspend.total}</span>{" "}
                overspend
              </span>
              <span>
                <span className="font-medium text-foreground">{totals.underspend.total}</span>{" "}
                underspend
              </span>
              <span>
                <span className="font-medium text-foreground">{totals.totalAtRisk}</span> total at
                risk
              </span>
            </div>
          )}

          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlertIcon className="size-4 text-warning" aria-hidden="true" />
                Budget risks to address
              </CardTitle>
              <Badge variant="secondary" className="rounded-full">
                {items.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Amount at risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: BudgetSentinelItem) => (
                    <SentinelRow key={item.id} item={item} />
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
