import React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  DEFAULT_DASHBOARD_WIDGETS_BY_ROLE,
  getAllowedDashboardWidgetsForRole,
  getEffectivePlanTier,
  hasPaymentRequests,
  type DashboardWidgetId,
  type OnboardingGoal,
  type PlanTier,
  type Role,
} from "@grantpipe/shared";
import {
  ActionPanel,
  Alert,
  AttentionBanner,
  Badge,
  MetricTile,
  PageHeader,
  PageShell,
  Skeleton,
  ViewToggle,
  cn,
} from "@grantpipe/ui";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Settings2,
  TrendingUp,
} from "lucide-react";
import {
  useDashboardHomePreferenceMutation,
  useDashboardOverview,
  type DashboardOverview,
} from "../../hooks/use-overview";
import { useOutstandingSummary } from "../../hooks/use-payments";
import { useSession } from "../../hooks/use-session";
import { useActivationAha } from "../../hooks/use-activation-aha";
import {
  formatActivityEntityLabel,
  formatCurrency,
  formatFundTypeLabel,
  formatNumber,
  formatUtcDate,
  formatUtcDateTime,
  formatDateKicker,
} from "../../lib/format";
import { OnboardingChecklist } from "../../components/onboarding-checklist";
import { TrialUpgradeCard } from "../../components/trial-upgrade-card";
import { type AppRole } from "../../lib/access-control";
import { useRestrictionAlerts } from "../../hooks/use-restrictions";
import { useOrgBilling } from "../../hooks/use-org-settings";
import { captureRecordViewChanged } from "../../lib/record-discovery-analytics";
import { captureEvent } from "../../lib/analytics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type DashView = "actions" | "metrics" | "agenda";

const DASH_VIEW_KEY = "gp-dash-view";

function readStoredView(): DashView {
  try {
    const stored = sessionStorage.getItem(DASH_VIEW_KEY);
    if (stored === "actions" || stored === "metrics" || stored === "agenda") {
      return stored;
    }
  } catch {
    return "actions";
  }
  return "actions";
}

function storeView(view: DashView) {
  try {
    sessionStorage.setItem(DASH_VIEW_KEY, view);
  } catch {
    return;
  }
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityLabel(entityType: string, action: string) {
  return `${formatActivityEntityLabel(entityType)} ${titleCase(action)}`;
}

function getHealthTone(health: string) {
  switch (health) {
    case "at_risk":
      return "border-accent/40 bg-accent/15 text-accent-foreground";
    case "overdue":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function getSnapshotTone(status: string) {
  switch (status) {
    case "urgent":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "watch":
      return "border-accent/40 bg-accent/15 text-accent-foreground";
    default:
      return "border-primary/20 bg-primary/10 text-primary";
  }
}

function getActionTone(severity: string) {
  return severity === "urgent"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-accent/40 bg-accent/15 text-accent-foreground";
}

function getBillingEffectivePlanTier(
  billing: ReturnType<typeof useOrgBilling>["data"] | undefined,
): PlanTier | null {
  if (!billing) return null;
  return getEffectivePlanTier({
    planTier: billing.planTier ?? billing.effectivePlanTier,
    subscriptionStatus: billing.status,
    trialEndsAt: billing.trialEndsAt,
  });
}

function getDashboardRole(role: AppRole | null): Role {
  return role === "admin" || role === "editor" || role === "viewer" || role === "auditor"
    ? role
    : "viewer";
}

function getDashboardPinnedWidgets(
  overview: DashboardOverview,
  memberRole: AppRole | null,
): DashboardWidgetId[] {
  return overview.dashboardLayout?.pinnedWidgetIds.length
    ? overview.dashboardLayout.pinnedWidgetIds
    : [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE[getDashboardRole(memberRole)]];
}

function PriorityActionLink({
  action,
  children,
  className,
}: {
  action: DashboardOverview["executiveSnapshot"]["priorityActions"][number];
  children: React.ReactNode;
  className?: string;
}) {
  if (action.targetType === "grant" && action.targetId) {
    return (
      <Link
        to="/grants/$grantId"
        params={{ grantId: action.targetId }}
        aria-label={`Open ${action.title}`}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (action.targetType === "fund" && action.targetId) {
    return (
      <Link
        to="/funds/$fundId"
        params={{ fundId: action.targetId }}
        aria-label={`Open ${action.title}`}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/reports" aria-label={`Open ${action.title}`} className={className}>
      {children}
    </Link>
  );
}

// ── Shared stat row ──────────────────────────────────────────────────────────

interface DonorStatRowProps {
  overview: DashboardOverview;
  cardClassName?: string;
}

function DonorStatRow({ overview, cardClassName }: DonorStatRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Link
        to="/donors"
        search={{ segment: "giving_fy_current" }}
        aria-label="Raised (FY)"
        className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
      >
        <div className={cn("bg-card border border-border/70 rounded-2xl px-4 py-3", cardClassName)}>
          <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Raised (FY)
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {formatCurrency(overview.donorMetrics.currentFiscalYearGivingCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            vs {formatCurrency(overview.donorMetrics.previousFiscalYearGivingCents)} prior
          </p>
        </div>
      </Link>
      <Link
        to="/donors"
        search={{ segment: "new" }}
        aria-label="New donors"
        className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
      >
        <div className={cn("bg-card border border-border/70 rounded-2xl px-4 py-3", cardClassName)}>
          <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Donors
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {overview.donorMetrics.newDonorCount}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">new this fiscal year</p>
        </div>
      </Link>
      <Link
        to="/donors"
        search={{ segment: "retained" }}
        aria-label="Retention rate"
        className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
      >
        <div className={cn("bg-card border border-border/70 rounded-2xl px-4 py-3", cardClassName)}>
          <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Retention
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {overview.donorMetrics.retentionRate.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">donors who gave again</p>
        </div>
      </Link>
      <Link
        to="/donors"
        search={{ segment: "giving_fy_last" }}
        aria-label="Prior FY giving"
        className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
      >
        <div className={cn("bg-card border border-border/70 rounded-2xl px-4 py-3", cardClassName)}>
          <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
            Prior FY
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {formatCurrency(overview.donorMetrics.previousFiscalYearGivingCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">benchmark</p>
        </div>
      </Link>
    </div>
  );
}

// ── Needs-attention card ─────────────────────────────────────────────────────

type RestrictionAlertRow = {
  id: string;
  label: string;
  alertType: string;
  amountCents?: number;
  date?: string;
  contextLabel?: string | null;
};

interface NeedsAttentionCardProps {
  overview: DashboardOverview;
  restrictionAlerts: RestrictionAlertRow[];
}

function NeedsAttentionCard({ overview, restrictionAlerts }: NeedsAttentionCardProps) {
  type AttentionItem =
    | { kind: "grant"; id: string; label: string; reason: string; health: string; href: string }
    | {
        kind: "deadline";
        id: string;
        label: string;
        grantId?: string;
        grantName?: string;
        date: string;
      }
    | { kind: "alert"; id: string; label: string; alertType: string };

  const items: AttentionItem[] = [
    ...overview.atRiskGrants.map((g) => ({
      kind: "grant" as const,
      id: g.id,
      label: g.name,
      reason: g.reason,
      health: g.health,
      href: `/grants/${g.id}`,
    })),
    ...overview.upcomingDeadlines.map((d) => ({
      kind: "deadline" as const,
      id: d.id,
      label: d.title,
      grantId: d.grantId,
      grantName: d.grantName,
      date: d.date,
    })),
    ...restrictionAlerts.map((a) => ({
      kind: "alert" as const,
      id: a.id,
      label: a.label,
      alertType: a.alertType,
    })),
  ].slice(0, 5);

  const count = items.length;

  return (
    <section
      aria-labelledby="needs-attention-card-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          id="needs-attention-card-heading"
          className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
        >
          Needs attention
        </h2>
        {count > 0 ? (
          <Badge className="border border-warning/40 bg-warning/10 text-warning-foreground text-xs rounded-full px-2 py-0.5">
            {count}
          </Badge>
        ) : null}
      </div>

      {count === 0 ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success shrink-0" aria-hidden />
          <span>All clear. No grants, deadlines, or alerts need attention.</span>
        </div>
      ) : (
        <div
          className="space-y-1"
          data-testid="dashboard-attention-section"
          data-attention-count={overview.atRiskGrants.length + overview.upcomingDeadlines.length}
        >
          {items.map((item) => {
            if (item.kind === "grant") {
              const railColor = item.health === "overdue" ? "bg-destructive" : "bg-warning";
              return (
                <article
                  key={item.id}
                  role="group"
                  aria-label={`Grant needs attention: ${item.label}`}
                  data-testid={`dashboard-attention-${item.id}`}
                  data-attention-kind="grant"
                  className="grid grid-cols-[4px_1fr_auto] gap-3 items-center rounded-lg border border-border/60 bg-background px-3 py-2"
                >
                  <span className={cn("self-stretch rounded-full", railColor)} aria-hidden />
                  <div className="min-w-0">
                    <Link
                      to="/grants/$grantId"
                      params={{ grantId: item.id }}
                      aria-label={`Open grant ${item.label}`}
                      className="text-sm font-semibold text-primary hover:underline underline-offset-4"
                    >
                      {item.label}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate" title={item.reason}>
                      {item.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn("text-xs", getHealthTone(item.health))}>
                      {titleCase(item.health)}
                    </Badge>
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                </article>
              );
            }
            if (item.kind === "deadline") {
              return (
                <article
                  key={item.id}
                  role="group"
                  aria-label={`Upcoming deadline: ${item.label}`}
                  data-testid={`dashboard-attention-${item.id}`}
                  data-attention-kind="deadline"
                  className="grid grid-cols-[4px_1fr_auto] gap-3 items-center rounded-lg border border-border/60 bg-background px-3 py-2"
                >
                  <span className="self-stretch rounded-full bg-info" aria-hidden />
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold text-foreground truncate"
                      title={item.label}
                    >
                      {item.label}
                    </p>
                    {item.grantName && item.grantId ? (
                      <Link
                        to="/grants/$grantId"
                        params={{ grantId: item.grantId }}
                        aria-label={`Open grant ${item.grantName} deadline`}
                        className="text-xs font-medium text-primary hover:underline underline-offset-4"
                        title={item.grantName}
                      >
                        {item.grantName}
                      </Link>
                    ) : item.grantName ? (
                      <p
                        className="text-xs font-medium text-muted-foreground truncate"
                        title={item.grantName}
                      >
                        {item.grantName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {formatUtcDate(item.date)}
                    </span>
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                </article>
              );
            }
            // alert
            return (
              <article
                key={item.id}
                role="group"
                aria-label={`Restriction alert: ${item.label}`}
                data-testid={`dashboard-attention-alert-${item.id}`}
                data-attention-kind="alert"
                className="grid grid-cols-[4px_1fr_auto] gap-3 items-center rounded-lg border border-border/60 bg-background px-3 py-2"
              >
                <span className="self-stretch rounded-full bg-warning" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" title={item.label}>
                    {item.label}
                  </p>
                  {(() => {
                    const ctx = formatAlertContext(item);
                    return ctx ? (
                      <p className="text-xs text-muted-foreground truncate" title={ctx}>
                        {ctx}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{titleCase(item.alertType)}</Badge>
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Recent activity card ─────────────────────────────────────────────────────

function RecentActivityCard({ overview }: { overview: DashboardOverview }) {
  return (
    <section
      aria-labelledby="recent-activity-card-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          id="recent-activity-card-heading"
          className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
        >
          Recent activity
        </h2>
        <Link
          to="/activity"
          className="text-xs font-medium text-primary hover:underline underline-offset-4"
        >
          View all
        </Link>
      </div>

      {overview.recentActivity.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">
            Activity will appear after your team creates, imports, edits, or exports records. Start
            with a donor, grant, or report when you are ready.
          </p>
          <Link
            to="/donors"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            Go to Donors
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {overview.recentActivity.slice(0, 5).map((activity) => (
            <li key={activity.id} className="py-2 first:pt-0 last:pb-0">
              <div className="grid grid-cols-[110px_1fr] gap-2 items-start">
                <time
                  dateTime={activity.createdAt}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {formatUtcDateTime(activity.createdAt)}
                </time>
                <p className="text-sm font-medium text-foreground">
                  {formatActivityLabel(activity.entityType, activity.action)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Fund balances card ───────────────────────────────────────────────────────

function FundBalancesCard({ overview }: { overview: DashboardOverview }) {
  const maxBalance = Math.max(...overview.fundBalances.map((f) => f.balanceCents), 1);

  const LOW_BALANCE_THRESHOLD = 5;
  const MID_BALANCE_THRESHOLD = 50;

  function getProgressColor(pct: number) {
    if (pct < LOW_BALANCE_THRESHOLD) return "bg-destructive";
    if (pct < MID_BALANCE_THRESHOLD) return "bg-warning";
    return "bg-primary";
  }

  return (
    <section
      aria-labelledby="fund-balances-card-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2
          id="fund-balances-card-heading"
          className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
        >
          Fund balances
        </h2>
      </div>

      {overview.fundBalances.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">
            Fund balances appear after restricted or unrestricted funds are created. Use Funds when
            you need to track money set aside for a specific purpose.
          </p>
          <Link
            to="/funds"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            Create a fund
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {overview.fundBalances.slice(0, 5).map((fund) => {
              const pct = maxBalance > 0 ? (fund.balanceCents / maxBalance) * 100 : 0;
              return (
                <li key={fund.fundId}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium text-foreground truncate"
                        title={fund.fundName}
                      >
                        {fund.fundName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFundTypeLabel(fund.fundType)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(fund.balanceCents)}
                      </p>
                      <Link
                        to="/funds/$fundId"
                        params={{ fundId: fund.fundId }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View fund
                      </Link>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", getProgressColor(pct))}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            to="/funds"
            className="mt-3 block text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            View all funds
          </Link>
        </>
      )}
    </section>
  );
}

// ── Quick actions card ───────────────────────────────────────────────────────

function QuickActionsCard({ canEdit }: { canEdit: boolean }) {
  return (
    <section
      aria-labelledby="quick-actions-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <h2
        id="quick-actions-heading"
        className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-3"
      >
        Quick actions
      </h2>
      <div className="space-y-1.5">
        <Link
          to="/donors"
          className="flex items-center gap-2 rounded-full bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() =>
            captureEvent("cta_clicked", {
              source: "dashboard_quick_actions",
              label: "Manage donors",
            })
          }
        >
          Manage donors
        </Link>
        <Link
          to="/grants"
          className="flex items-center gap-2 rounded-full bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() =>
            captureEvent("cta_clicked", {
              source: "dashboard_quick_actions",
              label: "Manage grants",
            })
          }
        >
          Manage grants
        </Link>
        {canEdit ? (
          <Link
            to="/accounting/journal"
            className="flex items-center gap-2 rounded-full bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() =>
              captureEvent("cta_clicked", {
                source: "dashboard_quick_actions",
                label: "Journal entry",
              })
            }
          >
            Journal entry
          </Link>
        ) : null}
        <Link
          to="/funds"
          className="flex items-center gap-2 rounded-full bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() =>
            captureEvent("cta_clicked", {
              source: "dashboard_quick_actions",
              label: "Manage funds",
            })
          }
        >
          Manage funds
        </Link>
      </div>
    </section>
  );
}

// ── VIEW A: Actions ──────────────────────────────────────────────────────────

interface ActionsViewProps {
  overview: DashboardOverview;
  restrictionAlerts: RestrictionAlertRow[];
  paymentsEnabled: boolean;
  outstandingSummaryData:
    | {
        totalOutstandingCents?: number | null;
        submittedCount?: number | null;
        approvedCount?: number | null;
      }
    | undefined;
  memberRole: AppRole | null;
  hasAnyDonorData: boolean;
  onboardingGoal?: OnboardingGoal | null;
}

const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  executive_snapshot: "Executive snapshot",
  needs_attention: "Needs attention",
  quick_actions: "Quick actions",
  payments: "Payments",
  donor_metrics: "Donor metrics",
  donor_pipeline: "Donor pipeline",
  grant_pipeline: "Grant pipeline",
  grant_health: "Grant health",
  restriction_risk: "Restriction risk",
  fund_balances: "Fund balances",
  reporting_readiness: "Reporting readiness",
  recent_activity: "Recent activity",
  agenda: "Agenda",
};

function PipelineSummaryWidget({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{ label: string; count: number }>;
}) {
  const headingId = `${title.toLowerCase().replaceAll(" ", "-")}-widget-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <h2
        id={headingId}
        className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-3"
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">{titleCase(item.label)}</span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNumber(item.count)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardCustomizePanel({
  allowedWidgetIds,
  pinnedWidgetIds,
  onToggleWidget,
  onSave,
  onCancel,
  isSaving,
}: {
  allowedWidgetIds: DashboardWidgetId[];
  pinnedWidgetIds: DashboardWidgetId[];
  onToggleWidget: (widgetId: DashboardWidgetId) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <section
      aria-label="Customize dashboard home"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-caps text-muted-foreground">
            Customize home
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the widgets that should stay pinned on this dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {allowedWidgetIds.map((widgetId) => {
          const checked = pinnedWidgetIds.includes(widgetId);
          return (
            <button
              key={widgetId}
              type="button"
              aria-pressed={checked}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
              onClick={() => onToggleWidget(widgetId)}
            >
              {DASHBOARD_WIDGET_LABELS[widgetId]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface RoleHomeViewProps extends ActionsViewProps {
  pinnedWidgetIds: DashboardWidgetId[];
}

function RoleHomeView({
  overview,
  restrictionAlerts,
  paymentsEnabled,
  outstandingSummaryData,
  memberRole,
  hasAnyDonorData,
  onboardingGoal,
  pinnedWidgetIds,
}: RoleHomeViewProps) {
  const canEdit = memberRole === "admin" || memberRole === "editor";

  function renderWidget(widgetId: DashboardWidgetId) {
    switch (widgetId) {
      case "executive_snapshot":
        return <ExecutiveSnapshotSection key={widgetId} overview={overview} />;
      case "needs_attention":
        return (
          <NeedsAttentionCard
            key={widgetId}
            overview={overview}
            restrictionAlerts={restrictionAlerts}
          />
        );
      case "quick_actions":
        return <QuickActionsCard key={widgetId} canEdit={canEdit} />;
      case "payments":
        return paymentsEnabled ? (
          <Link
            key={widgetId}
            to="/payments"
            aria-label="Outstanding reimbursements"
            className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MetricTile
              label="Outstanding Reimbursements"
              value={formatCurrency(outstandingSummaryData?.totalOutstandingCents ?? 0)}
              description={`${outstandingSummaryData?.submittedCount ?? 0} submitted, ${outstandingSummaryData?.approvedCount ?? 0} approved`}
            />
          </Link>
        ) : null;
      case "donor_metrics":
        return hasAnyDonorData ? (
          <DonorStatRow key={widgetId} overview={overview} />
        ) : (
          <ActionPanel
            key={widgetId}
            variant="empty"
            title="No donor metrics yet"
            description="Donor metrics and fund balances will appear here as you add data."
            action={
              <Link
                to="/donors"
                className="text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                Go to Donors
              </Link>
            }
            secondaryAction={
              <Link
                to="/import"
                className="text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                Import data
              </Link>
            }
          />
        );
      case "donor_pipeline":
        return (
          <PipelineSummaryWidget
            key={widgetId}
            title="Donor pipeline"
            emptyText="Pipeline counts appear after donors move through stages."
            items={overview.pipelineSummary.donors}
          />
        );
      case "grant_pipeline":
        return (
          <PipelineSummaryWidget
            key={widgetId}
            title="Grant pipeline"
            emptyText="Pipeline counts appear after grants move through stages."
            items={overview.pipelineSummary.grants}
          />
        );
      case "grant_health":
        return <ComplianceHealthSection key={widgetId} overview={overview} />;
      case "restriction_risk":
        return <RestrictionAlertsSection key={widgetId} restrictionAlerts={restrictionAlerts} />;
      case "fund_balances":
        return <FundBalancesCard key={widgetId} overview={overview} />;
      case "reporting_readiness":
        return <ReportingReadinessSection key={widgetId} overview={overview} />;
      case "recent_activity":
        return <RecentActivityCard key={widgetId} overview={overview} />;
      case "agenda":
        return <AgendaView key={widgetId} overview={overview} />;
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
        <OnboardingChecklist role={memberRole} goal={onboardingGoal} />
      </div>
      {pinnedWidgetIds.map((widgetId) => renderWidget(widgetId))}
    </div>
  );
}

interface MetricsViewProps {
  overview: DashboardOverview;
}

function MetricSummaryCard({
  title,
  description,
  accent,
  value,
  sub,
}: {
  title: string;
  description: string;
  accent: "primary" | "success" | "warning";
  value: string;
  sub: string;
}) {
  const accentClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  }[accent];

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-caps ${accentClass} mb-2`}
      >
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function MetricsView({ overview }: MetricsViewProps) {
  const complianceHealth = overview.complianceHealth ?? {
    overdueGrantCount: 0,
    atRiskGrantCount: 0,
    upcomingDeadlineCount: 0,
    restrictedFundWatchCount: 0,
    auditEvidenceEventCount: 0,
  };
  const snapshot = overview.executiveSnapshot ?? {
    primaryMetricLabel: "Urgent work",
    primaryMetricValue: "0 urgent",
    secondaryMetricLabel: "Upcoming deadlines",
    secondaryMetricValue: "0 next 30 days",
  };

  return (
    <div className="space-y-6">
      {/* Large stat grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link
          to="/donors"
          search={{ segment: "giving_fy_current" }}
          aria-label="Raised (FY)"
          className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
        >
          <div className="bg-card border border-border/70 rounded-2xl px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Raised (FY)
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCurrency(overview.donorMetrics.currentFiscalYearGivingCents)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              vs {formatCurrency(overview.donorMetrics.previousFiscalYearGivingCents)} prior
            </p>
          </div>
        </Link>
        <Link
          to="/donors"
          search={{ segment: "new" }}
          aria-label="New donors"
          className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
        >
          <div className="bg-card border border-border/70 rounded-2xl px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Donors
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {overview.donorMetrics.newDonorCount}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">new this fiscal year</p>
          </div>
        </Link>
        <Link
          to="/donors"
          search={{ segment: "retained" }}
          aria-label="Retention rate"
          className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
        >
          <div className="bg-card border border-border/70 rounded-2xl px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Retention
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {overview.donorMetrics.retentionRate.toFixed(1)}%
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">donors who gave again</p>
          </div>
        </Link>
        <Link
          to="/donors"
          search={{ segment: "giving_fy_last" }}
          aria-label="Prior FY giving"
          className="block rounded-2xl hover:ring-1 hover:ring-primary/30 transition-shadow"
        >
          <div className="bg-card border border-border/70 rounded-2xl px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
              Prior FY
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCurrency(overview.donorMetrics.previousFiscalYearGivingCents)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">benchmark</p>
          </div>
        </Link>
      </div>

      {/* Metric summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricSummaryCard
          title="Giving trend"
          description="Fiscal year giving vs prior year"
          accent="primary"
          value={formatCurrency(overview.donorMetrics.currentFiscalYearGivingCents)}
          sub={`vs ${formatCurrency(overview.donorMetrics.previousFiscalYearGivingCents)} prior FY`}
        />
        <MetricSummaryCard
          title="Retention"
          description="Donors who gave again this FY"
          accent="success"
          value={`${overview.donorMetrics.retentionRate.toFixed(1)}%`}
          sub={`${overview.donorMetrics.newDonorCount} new donors this FY`}
        />
        <MetricSummaryCard
          title="Compliance"
          description="Open items requiring attention"
          accent="warning"
          value={`${complianceHealth.overdueGrantCount + complianceHealth.atRiskGrantCount} at risk`}
          sub={`${complianceHealth.upcomingDeadlineCount} deadlines upcoming`}
        />
      </div>

      {/* 2-col bottom */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donor pipeline */}
        <section
          aria-labelledby="metrics-donor-pipeline-heading"
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
        >
          <h2
            id="metrics-donor-pipeline-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-3"
          >
            Donor pipeline
          </h2>
          {overview.pipelineSummary.donors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pipeline counts appear after donors move through stages.
            </p>
          ) : (
            <div className="space-y-1">
              {overview.pipelineSummary.donors.map((item) => (
                <div
                  key={`donor-${item.label}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{titleCase(item.label)}</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatNumber(item.count)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{snapshot.primaryMetricLabel}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-foreground mt-0.5">
                {snapshot.primaryMetricValue}
              </dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{snapshot.secondaryMetricLabel}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-foreground mt-0.5">
                {snapshot.secondaryMetricValue}
              </dd>
            </div>
          </dl>
        </section>

        {/* Grant pipeline */}
        <section
          aria-labelledby="metrics-grant-pipeline-heading"
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
        >
          <h2
            id="metrics-grant-pipeline-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-3"
          >
            Grant pipeline
          </h2>
          {overview.pipelineSummary.grants.length === 0 && overview.atRiskGrants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pipeline counts appear after grants move through stages.
            </p>
          ) : (
            <div className="space-y-1">
              {overview.pipelineSummary.grants.map((item) => (
                <div
                  key={`grant-${item.label}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{titleCase(item.label)}</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatNumber(item.count)}
                  </span>
                </div>
              ))}
              {overview.atRiskGrants.map((grant) => (
                <div
                  key={`at-risk-${grant.id}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{grant.name}</span>
                  <Badge variant="outline" className={cn("text-xs", getHealthTone(grant.health))}>
                    {titleCase(grant.health)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">Overdue</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-foreground mt-0.5">
                {complianceHealth.overdueGrantCount}
              </dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">At risk</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-foreground mt-0.5">
                {complianceHealth.atRiskGrantCount}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ── VIEW C: Agenda ───────────────────────────────────────────────────────────

interface AgendaViewProps {
  overview: DashboardOverview;
}

function groupDeadlinesByDate(
  deadlines: DashboardOverview["upcomingDeadlines"],
): Map<string, DashboardOverview["upcomingDeadlines"]> {
  const groups = new Map<string, DashboardOverview["upcomingDeadlines"]>();
  for (const d of deadlines) {
    const dateKey = d.date.slice(0, 10);
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(d);
    } else {
      groups.set(dateKey, [d]);
    }
  }
  return groups;
}

function AgendaView({ overview }: AgendaViewProps) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const deadlineGroups = groupDeadlinesByDate(overview.upcomingDeadlines);

  const complianceHealth = overview.complianceHealth ?? {
    overdueGrantCount: 0,
    atRiskGrantCount: 0,
    upcomingDeadlineCount: 0,
    restrictedFundWatchCount: 0,
    auditEvidenceEventCount: 0,
  };
  const boardReportFreshness = overview.boardReportFreshness ?? {
    latestReportId: null,
    latestReportTitle: null,
    latestGeneratedAt: null,
    daysSinceLatestReport: null,
  };

  const todayDeadlines = (deadlineGroups.get(todayUtc) ?? []).filter((d) =>
    d.date.startsWith(todayUtc),
  );
  const urgentCount = overview.atRiskGrants.length + todayDeadlines.length;

  const periodChecks = [
    {
      label: "Donations matched",
      status: complianceHealth.overdueGrantCount === 0 ? ("ok" as const) : ("issue" as const),
      description:
        complianceHealth.overdueGrantCount === 0
          ? "No overdue grants"
          : `${complianceHealth.overdueGrantCount} overdue`,
    },
    {
      label: "Restricted allocated",
      status:
        complianceHealth.restrictedFundWatchCount === 0 ? ("ok" as const) : ("issue" as const),
      description:
        complianceHealth.restrictedFundWatchCount === 0
          ? "No funds on watch"
          : `${complianceHealth.restrictedFundWatchCount} on watch`,
    },
    {
      label: "Reports current",
      status:
        boardReportFreshness.daysSinceLatestReport !== null &&
        boardReportFreshness.daysSinceLatestReport <= 30
          ? ("ok" as const)
          : ("issue" as const),
      description:
        boardReportFreshness.daysSinceLatestReport !== null
          ? `${boardReportFreshness.daysSinceLatestReport} days since latest`
          : "No report generated",
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      {/* Left — date-grouped upcoming list */}
      <section aria-labelledby="agenda-upcoming-heading" className="space-y-2">
        <h2
          id="agenda-upcoming-heading"
          className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
        >
          Upcoming
        </h2>

        {/* At-risk grants at top */}
        {overview.atRiskGrants.length > 0 ? (
          <div className="rounded-2xl border border-warning/25 bg-warning/5 divide-y divide-warning/15 overflow-hidden">
            {overview.atRiskGrants.map((grant) => (
              <div key={grant.id} className="grid grid-cols-[140px_1fr] min-h-[48px]">
                <div className="bg-destructive/10 px-3 py-2 flex items-center border-r border-warning/15">
                  <span className="text-xs font-semibold text-destructive">At risk</span>
                </div>
                <div className="px-3 py-2 flex items-center gap-2">
                  <Link
                    to="/grants/$grantId"
                    params={{ grantId: grant.id }}
                    className="text-sm font-medium text-primary hover:underline underline-offset-4"
                  >
                    {grant.name}
                  </Link>
                  <span className="text-xs text-muted-foreground truncate" title={grant.reason}>
                    ({grant.reason})
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Date-grouped deadlines */}
        {deadlineGroups.size === 0 && overview.atRiskGrants.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-card p-6 text-center">
            <CheckCircle2 className="mx-auto size-8 text-success mb-2" aria-hidden />
            <p className="text-sm font-medium text-foreground">No upcoming deadlines</p>
            <p className="text-xs text-muted-foreground mt-1">
              Deadlines from grants will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card overflow-hidden divide-y divide-border/60">
            {Array.from(deadlineGroups.entries()).map(([dateKey, items]) => {
              const isToday = dateKey === todayUtc;
              return (
                <div key={dateKey} className="grid grid-cols-[140px_1fr] min-h-[48px]">
                  <div
                    className={cn(
                      "px-3 py-2 flex items-start border-r border-border/60",
                      isToday ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        isToday ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {isToday
                        ? "Today"
                        : new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${dateKey}T00:00:00.000Z`))}
                    </span>
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {items.map((d) => (
                      <div key={d.id}>
                        <p className="text-sm font-medium text-foreground">{d.title}</p>
                        {d.grantName && d.grantId ? (
                          <Link
                            to="/grants/$grantId"
                            params={{ grantId: d.grantId }}
                            aria-label={`Open grant ${d.grantName}`}
                            className="text-xs font-medium text-primary hover:underline underline-offset-4"
                          >
                            {d.grantName}
                          </Link>
                        ) : d.grantName ? (
                          <p className="text-xs text-muted-foreground">{d.grantName}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Right column */}
      <div className="space-y-4">
        {/* Today card */}
        <section
          aria-labelledby="agenda-today-heading"
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
        >
          <h2
            id="agenda-today-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-1"
          >
            Today
          </h2>
          <p className="text-lg font-semibold text-foreground">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${todayUtc}T12:00:00Z`))}
          </p>
          {urgentCount === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing urgent today.</p>
          ) : (
            <p className="mt-1 text-sm font-medium text-foreground">
              {urgentCount} urgent {urgentCount === 1 ? "item" : "items"} need attention
            </p>
          )}
          <div className="mt-3 space-y-2">
            {overview.atRiskGrants.map((grant) => (
              <AttentionBanner
                key={grant.id}
                variant={grant.health === "overdue" ? "destructive" : "warning"}
                title={grant.name}
                description={grant.reason}
              />
            ))}
            {todayDeadlines.map((d) => (
              <AttentionBanner
                key={d.id}
                variant="info"
                title={d.title}
                description={!d.grantId ? d.grantName : undefined}
              >
                {d.grantName && d.grantId ? (
                  <Link
                    to="/grants/$grantId"
                    params={{ grantId: d.grantId }}
                    aria-label={`Open grant ${d.grantName}`}
                    className="text-sm font-medium text-primary hover:underline underline-offset-4"
                  >
                    {d.grantName}
                  </Link>
                ) : null}
              </AttentionBanner>
            ))}
          </div>
        </section>

        {/* Period status card */}
        <section
          aria-labelledby="agenda-period-status-heading"
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
        >
          <h2
            id="agenda-period-status-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground mb-3"
          >
            Period status
          </h2>
          <ul className="space-y-2">
            {periodChecks.map((check) => (
              <li key={check.label} className="flex items-start gap-2">
                {check.status === "ok" ? (
                  <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" aria-hidden />
                ) : (
                  <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{check.label}</p>
                  <p className="text-xs text-muted-foreground">{check.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ── Shared sub-sections (used by Actions view) ───────────────────────────────

function ExecutiveSnapshotSection({ overview }: { overview: DashboardOverview }) {
  const snapshot = overview.executiveSnapshot ?? {
    status: "clear",
    statusLabel: "Under control",
    statusDescription: "No urgent grant or reporting work needs attention.",
    primaryMetricLabel: "Urgent work",
    primaryMetricValue: "0 urgent",
    secondaryMetricLabel: "Upcoming deadlines",
    secondaryMetricValue: "0 next 30 days",
    priorityActions: [],
  };

  return (
    <section
      aria-labelledby="executive-snapshot-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="executive-snapshot-heading"
              className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
            >
              Executive snapshot
            </h2>
            <Badge className={cn("border text-xs", getSnapshotTone(snapshot.status))}>
              {snapshot.statusLabel}
            </Badge>
          </div>
          <p className="mt-3 max-w-3xl text-lg font-medium text-foreground">
            {snapshot.statusDescription}
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
                {snapshot.primaryMetricLabel}
              </dt>
              <dd className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {snapshot.primaryMetricValue}
              </dd>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">
                {snapshot.secondaryMetricLabel}
              </dt>
              <dd className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {snapshot.secondaryMetricValue}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-caps text-muted-foreground">
            Priority actions
          </h3>
          {snapshot.priorityActions.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              No urgent grant or reporting work needs action right now.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {snapshot.priorityActions.map((action) => (
                <article
                  key={action.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <PriorityActionLink
                        action={action}
                        className="text-sm font-semibold text-primary hover:underline underline-offset-4"
                      >
                        {action.title}
                      </PriorityActionLink>
                      <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-xs", getActionTone(action.severity))}
                    >
                      {titleCase(action.severity)}
                    </Badge>
                  </div>
                  {action.dueDate ? (
                    <time
                      dateTime={action.dueDate}
                      className="mt-2 block text-xs font-medium text-muted-foreground"
                    >
                      Due {formatUtcDate(action.dueDate)}
                    </time>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ComplianceHealthSection({ overview }: { overview: DashboardOverview }) {
  const complianceHealth = overview.complianceHealth ?? {
    overdueGrantCount: 0,
    atRiskGrantCount: 0,
    upcomingDeadlineCount: 0,
    restrictedFundWatchCount: 0,
    auditEvidenceEventCount: 0,
  };

  const complianceRows = [
    { label: "Overdue grants", count: complianceHealth.overdueGrantCount },
    { label: "At-risk grants", count: complianceHealth.atRiskGrantCount },
    { label: "Upcoming deadlines", count: complianceHealth.upcomingDeadlineCount },
    { label: "Restricted funds on watch", count: complianceHealth.restrictedFundWatchCount },
    { label: "Audit evidence events", count: complianceHealth.auditEvidenceEventCount },
  ];

  return (
    <section
      aria-labelledby="compliance-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="compliance-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
          >
            Grant health
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control counts for grant risk, deadlines, funds, and audit evidence.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {complianceRows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {row.count}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatAlertContext(alert: RestrictionAlertRow): string | null {
  const parts: string[] = [];
  if (alert.contextLabel) {
    parts.push(alert.contextLabel);
  }
  if (typeof alert.amountCents === "number" && alert.amountCents !== 0) {
    parts.push(formatCurrency(alert.amountCents));
  }
  if (alert.date) {
    parts.push(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(alert.date)),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function RestrictionAlertsSection({
  restrictionAlerts,
}: {
  restrictionAlerts: RestrictionAlertRow[];
}) {
  if (restrictionAlerts.length === 0) return null;

  return (
    <section
      aria-labelledby="restriction-risk-heading"
      className="rounded-2xl border border-warning/25 bg-warning/5 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="restriction-risk-heading"
            className="text-sm font-semibold uppercase tracking-caps text-foreground"
          >
            Restricted balance risk
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open restriction lifecycle alerts that need evidence or balance review.
          </p>
        </div>
        <Link to="/reports" className="text-sm font-medium text-primary hover:underline">
          Generate rollforward
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-warning/20">
        {restrictionAlerts.slice(0, 5).map((alert) => {
          const context = formatAlertContext(alert);
          return (
            <li key={alert.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-foreground">{alert.label}</span>
                {context ? <p className="mt-0.5 text-xs text-muted-foreground">{context}</p> : null}
              </div>
              <Badge variant="outline" className="shrink-0">
                {titleCase(alert.alertType)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReportingReadinessSection({ overview }: { overview: DashboardOverview }) {
  const boardReportFreshness = overview.boardReportFreshness ?? {
    latestReportId: null,
    latestReportTitle: null,
    latestGeneratedAt: null,
    daysSinceLatestReport: null,
  };

  return (
    <section
      aria-labelledby="board-packet-heading"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="board-packet-heading"
            className="text-sm font-semibold uppercase tracking-caps text-muted-foreground"
          >
            Reporting readiness
          </h2>
          {boardReportFreshness.latestGeneratedAt ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {boardReportFreshness.latestReportTitle ?? "Latest board packet"}
              </p>
              <p className="text-sm text-muted-foreground">
                Generated {formatUtcDateTime(boardReportFreshness.latestGeneratedAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                {boardReportFreshness.daysSinceLatestReport === 0
                  ? "Generated today"
                  : boardReportFreshness.daysSinceLatestReport === 1
                    ? "1 day since latest board packet"
                    : `${boardReportFreshness.daysSinceLatestReport ?? 0} days since latest board packet`}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No board packet has been generated yet.
            </p>
          )}
        </div>
        <Link to="/reports" className="text-sm font-medium text-primary hover:underline">
          Open reports
        </Link>
      </div>
    </section>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { memberRole, orgId, onboardingGoal } = useSession();
  useActivationAha(orgId);
  const overviewQuery = useDashboardOverview();
  const billingQuery = useOrgBilling();
  const planTier = getBillingEffectivePlanTier(billingQuery.data);
  const paymentsEnabled = planTier !== null && hasPaymentRequests(planTier);
  const restrictionAlertsQuery = useRestrictionAlerts({}, { enabled: true });
  const outstandingSummaryQuery = useOutstandingSummary({ enabled: paymentsEnabled });
  const homePreferenceMutation = useDashboardHomePreferenceMutation();
  const overview = overviewQuery.data;

  const [dashView, setDashView] = React.useState<DashView>(readStoredView);
  const [isCustomizingHome, setIsCustomizingHome] = React.useState(false);
  const [pendingWidgetIds, setPendingWidgetIds] = React.useState<DashboardWidgetId[]>([]);

  function handleViewChange(view: DashView) {
    captureRecordViewChanged("dashboard", view, dashView);
    setDashView(view);
    storeView(view);
  }

  const VIEW_OPTIONS = [
    { value: "actions" as const, label: "Actions", icon: AlertCircle },
    { value: "metrics" as const, label: "Metrics", icon: TrendingUp },
    { value: "agenda" as const, label: "Agenda", icon: Calendar },
  ];
  const currentPinnedWidgetIds = React.useMemo(
    () =>
      overview
        ? getDashboardPinnedWidgets(overview, memberRole)
        : [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE[getDashboardRole(memberRole)]],
    [memberRole, overview],
  );

  React.useEffect(() => {
    if (!isCustomizingHome) {
      setPendingWidgetIds(currentPinnedWidgetIds);
    }
  }, [currentPinnedWidgetIds, isCustomizingHome]);

  function handleToggleWidget(widgetId: DashboardWidgetId) {
    setPendingWidgetIds((current) => {
      if (current.includes(widgetId)) {
        return current.length > 1 ? current.filter((id) => id !== widgetId) : current;
      }
      return [...current, widgetId];
    });
  }

  function handleSaveHome() {
    homePreferenceMutation.mutate(
      { pinnedWidgetIds: pendingWidgetIds },
      {
        onSuccess: () => {
          setIsCustomizingHome(false);
        },
      },
    );
  }

  if (overviewQuery.isLoading && !overview) {
    return (
      <PageShell>
        <PageHeader
          variant="workbench"
          kicker={formatDateKicker(new Date())}
          title="Dashboard"
          help="The dashboard is a summary, not a place to edit records. Use the links in each section to open the donor, grant, or fund workspace behind the numbers."
          actions={
            <ViewToggle
              value={dashView}
              onChange={handleViewChange}
              options={VIEW_OPTIONS}
              aria-label="Dashboard view"
            />
          }
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <section aria-label="Loading needs attention">
          <Skeleton className="h-6 w-48" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </section>
      </PageShell>
    );
  }

  if (!overview) {
    return (
      <PageShell>
        <PageHeader
          variant="workbench"
          kicker={formatDateKicker(new Date())}
          title="Dashboard"
          help="The dashboard is a summary, not a place to edit records. Use the links in each section to open the donor, grant, or fund workspace behind the numbers."
          actions={
            <ViewToggle
              value={dashView}
              onChange={handleViewChange}
              options={VIEW_OPTIONS}
              aria-label="Dashboard view"
            />
          }
        />
        <ActionPanel
          variant="error"
          title="Overview unavailable"
          description="Unable to load dashboard data."
        />
      </PageShell>
    );
  }

  const restrictionAlertsRaw = restrictionAlertsQuery.data;
  const restrictionAlerts: RestrictionAlertRow[] = Array.isArray(restrictionAlertsRaw?.data)
    ? (restrictionAlertsRaw.data as RestrictionAlertRow[])
    : [];

  const hasAnyDonorData =
    overview.donorMetrics.currentFiscalYearGivingCents !== 0 ||
    overview.donorMetrics.previousFiscalYearGivingCents !== 0 ||
    overview.donorMetrics.newDonorCount !== 0 ||
    overview.donorMetrics.retentionRate !== 0;

  const outstandingSummaryData = outstandingSummaryQuery.data;

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker={formatDateKicker(overview.asOf)}
        title="Dashboard"
        description={`Updated ${formatUtcDateTime(overview.asOf)}`}
        help="The dashboard is a summary, not a place to edit records. Use the links in each section to open the donor, grant, or fund workspace behind the numbers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle
              value={dashView}
              onChange={handleViewChange}
              options={VIEW_OPTIONS}
              aria-label="Dashboard view"
            />
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => {
                setPendingWidgetIds(currentPinnedWidgetIds);
                setIsCustomizingHome((open) => !open);
              }}
            >
              <Settings2 className="size-4" aria-hidden />
              Customize
            </button>
          </div>
        }
      />

      {overviewQuery.isError ? (
        <Alert variant="warning" title="Dashboard data may be stale.">
          Unable to refresh the latest overview. You are seeing the last saved snapshot.
        </Alert>
      ) : null}

      <TrialUpgradeCard />

      {isCustomizingHome ? (
        <DashboardCustomizePanel
          allowedWidgetIds={getAllowedDashboardWidgetsForRole(getDashboardRole(memberRole))}
          pinnedWidgetIds={pendingWidgetIds}
          onToggleWidget={handleToggleWidget}
          onSave={handleSaveHome}
          onCancel={() => {
            setPendingWidgetIds(currentPinnedWidgetIds);
            setIsCustomizingHome(false);
          }}
          isSaving={homePreferenceMutation.isPending}
        />
      ) : null}

      {dashView === "actions" ? (
        <RoleHomeView
          overview={overview}
          restrictionAlerts={restrictionAlerts}
          paymentsEnabled={paymentsEnabled}
          outstandingSummaryData={outstandingSummaryData}
          memberRole={memberRole}
          hasAnyDonorData={hasAnyDonorData}
          onboardingGoal={onboardingGoal}
          pinnedWidgetIds={currentPinnedWidgetIds}
        />
      ) : dashView === "metrics" ? (
        <MetricsView overview={overview} />
      ) : (
        <AgendaView overview={overview} />
      )}
    </PageShell>
  );
}
