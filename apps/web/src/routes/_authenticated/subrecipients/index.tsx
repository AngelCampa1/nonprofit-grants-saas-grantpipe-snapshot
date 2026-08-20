import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Alert,
  Input,
  Label,
  PageHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { Network } from "lucide-react";
import {
  getEffectivePlanTier,
  getPlanEntitlementLabelList,
  getPlanLabelsWithEntitlement,
  hasSubrecipientMonitoring,
  SUBRECIPIENT_STATUSES,
  type SubrecipientStatus,
} from "@grantpipe/shared";
import { RetryButton } from "../../../components/retry-button";
import { useSession } from "../../../hooks/use-session";
import { useOrgBilling } from "../../../hooks/use-org-settings";
import { canAccessFeature } from "../../../lib/access-control";
import {
  useSubrecipientMutations,
  useSubrecipients,
  type SubrecipientPortfolioRow,
} from "../../../hooks/use-subrecipients";
import { captureRecordFilterChanged } from "../../../lib/record-discovery-analytics";
import { formatNumber } from "../../../lib/format";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { grantsTabs } from "../../../config/page-tabs";

export const Route = createFileRoute("/_authenticated/subrecipients/")({
  validateSearch: (search: Record<string, unknown>) => ({
    grantId: typeof search.grantId === "string" ? search.grantId : undefined,
  }),
  component: SubrecipientsPage,
});

const statusOptions = ["all", "active", "watchlist", "inactive"] as const;
const riskOptions = ["all", "low", "medium", "high"] as const;
const SUBRECIPIENT_MONITORING_PLAN_LABELS = getPlanLabelsWithEntitlement(
  "hasSubrecipientMonitoring",
);
const SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL = SUBRECIPIENT_MONITORING_PLAN_LABELS[0] ?? "paid";
const SUBRECIPIENT_MONITORING_PLAN_LIST = getPlanEntitlementLabelList("hasSubrecipientMonitoring");

function formatRisk(value: SubrecipientPortfolioRow["highestRiskRating"]) {
  if (!value) return "Not assessed";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function riskTone(value: SubrecipientPortfolioRow["highestRiskRating"]) {
  if (value === "high") return "destructive";
  if (value === "medium") return "secondary";
  return "outline";
}

export function SubrecipientsPage() {
  const { grantId } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("all");
  const [riskRating, setRiskRating] = useState<(typeof riskOptions)[number]>("all");
  const [overdueTasks, setOverdueTasks] = useState(false);
  const [openFindings, setOpenFindings] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<SubrecipientStatus>("active");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { memberRole, memberPermissions } = useSession();
  const billingQuery = useOrgBilling();
  const mutations = useSubrecipientMutations();
  const canUseMonitoring = hasSubrecipientMonitoring(
    billingQuery.data
      ? getEffectivePlanTier({
          planTier: billingQuery.data.planTier,
          subscriptionStatus: billingQuery.data.status,
          trialEndsAt: billingQuery.data.trialEndsAt,
        })
      : null,
  );
  const canEditCompliance = canAccessFeature(memberRole, memberPermissions, "compliance", "edit");
  const canCreate = canUseMonitoring && canEditCompliance;
  const query = useSubrecipients(
    {
      page,
      pageSize,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(riskRating !== "all" ? { riskRating } : {}),
      ...(overdueTasks ? { overdueTasks: true } : {}),
      ...(openFindings ? { openFindings: true } : {}),
    },
    {
      enabled: canUseMonitoring,
    },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data?.data]);
  const total = query.data?.total ?? 0;
  const totals = query.data?.summary ?? {
    subrecipients: 0,
    overdueTasks: 0,
    openFindings: 0,
    highRisk: 0,
  };
  const hasActiveFilters =
    search.trim() !== "" ||
    status !== "all" ||
    riskRating !== "all" ||
    overdueTasks ||
    openFindings;

  const hasSubrecipientListChrome = rows.length > 0 || hasActiveFilters;

  return (
    <div className="space-y-6">
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Subrecipient Monitoring"
        description="Track subawards, risk, tasks, findings, and evidence in one place."
        actions={
          canUseMonitoring ? (
            <Dialog
              open={createOpen}
              onOpenChange={(nextOpen) => {
                setCreateOpen(nextOpen);
                if (nextOpen) setCreateError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button disabled={!canEditCompliance}>Add subrecipient</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add subrecipient</DialogTitle>
                  <DialogDescription>
                    Create the monitored organization profile before linking subawards.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onChange={() => setCreateError(null)}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!canCreate) return;
                    const form = new FormData(event.currentTarget);
                    const name = String(form.get("name") ?? "").trim();
                    const uei = String(form.get("uei") ?? "").trim();
                    const notes = String(form.get("notes") ?? "").trim();
                    if (!name) {
                      setCreateError("Name is required.");
                      return;
                    }
                    try {
                      await mutations.createSubrecipient.mutateAsync({
                        name,
                        ...(uei ? { uei } : {}),
                        status: createStatus,
                        ...(notes ? { notes } : {}),
                      });
                      setCreateOpen(false);
                      setCreateStatus("active");
                    } catch (error) {
                      setCreateError(
                        error instanceof Error ? error.message : "Unable to save subrecipient.",
                      );
                    }
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="subrecipient-name">Name</Label>
                    <Input id="subrecipient-name" name="name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subrecipient-uei">UEI</Label>
                    <Input id="subrecipient-uei" name="uei" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subrecipient-status">Status</Label>
                    <Select
                      value={createStatus}
                      onValueChange={(next) => setCreateStatus(next as SubrecipientStatus)}
                    >
                      <SelectTrigger id="subrecipient-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBRECIPIENT_STATUSES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subrecipient-notes">Notes</Label>
                    <Input id="subrecipient-notes" name="notes" />
                  </div>
                  {createError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {createError}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    disabled={!canCreate || mutations.createSubrecipient.isPending}
                  >
                    Save subrecipient
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Button asChild variant="outline">
              <Link to="/settings" hash="billing">
                See plans
              </Link>
            </Button>
          )
        }
      />
      <AppPageTabs groupId="grants" items={grantsTabs} />

      {!canUseMonitoring ? (
        <TeachAndActEmptyState
          icon={<Network />}
          heading={`Subrecipient monitoring requires ${SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL}.`}
          description={`Requires ${SUBRECIPIENT_MONITORING_PLAN_LIST}. Track subawards, tasks, findings, and evidence.`}
          primaryAction={{ label: "See plans", href: "/settings#billing" }}
        />
      ) : null}

      {canUseMonitoring ? (
        <>
          {!canEditCompliance ? (
            <Alert title="Read-only access">
              <p>Viewers and auditors can read these records. They cannot change them.</p>
            </Alert>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Subrecipients" value={totals.subrecipients} />
            <Metric label="High risk" value={totals.highRisk} />
            <Metric label="Overdue tasks" value={totals.overdueTasks} />
            <Metric label="Open findings" value={totals.openFindings} />
          </section>

          {hasSubrecipientListChrome ? (
            <section className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto]">
              <div className="space-y-2">
                <Label htmlFor="subrecipient-search">Search</Label>
                <Input
                  id="subrecipient-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  onBlur={() => {
                    if (search.trim()) {
                      captureRecordFilterChanged("subrecipients", "search", {
                        search,
                        status,
                        riskRating,
                        overdueTasks,
                        openFindings,
                      });
                    }
                  }}
                  placeholder="Name or UEI"
                />
              </div>
              <FilterSelect
                label="Status"
                value={status}
                onValueChange={(next) => {
                  setStatus(next);
                  setPage(1);
                  captureRecordFilterChanged("subrecipients", "status", {
                    search,
                    status: next,
                    riskRating,
                    overdueTasks,
                    openFindings,
                  });
                }}
                values={statusOptions}
              />
              <FilterSelect
                label="Risk"
                value={riskRating}
                onValueChange={(next) => {
                  setRiskRating(next);
                  setPage(1);
                  captureRecordFilterChanged("subrecipients", "riskRating", {
                    search,
                    status,
                    riskRating: next,
                    overdueTasks,
                    openFindings,
                  });
                }}
                values={riskOptions}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  variant={overdueTasks ? "default" : "outline"}
                  aria-pressed={overdueTasks}
                  onClick={() => {
                    const next = !overdueTasks;
                    setOverdueTasks(next);
                    setPage(1);
                    captureRecordFilterChanged("subrecipients", "overdueTasks", {
                      search,
                      status,
                      riskRating,
                      overdueTasks: next,
                      openFindings,
                    });
                  }}
                >
                  Overdue
                </Button>
                <Button
                  type="button"
                  variant={openFindings ? "default" : "outline"}
                  aria-pressed={openFindings}
                  onClick={() => {
                    const next = !openFindings;
                    setOpenFindings(next);
                    setPage(1);
                    captureRecordFilterChanged("subrecipients", "openFindings", {
                      search,
                      status,
                      riskRating,
                      overdueTasks,
                      openFindings: next,
                    });
                  }}
                >
                  Findings
                </Button>
              </div>
            </section>
          ) : null}

          {query.isError ? (
            <Alert variant="destructive" title="Unable to load subrecipients">
              <p>{query.error instanceof Error ? query.error.message : "Try again."}</p>
              <RetryButton query={query} />
            </Alert>
          ) : rows.length === 0 && !query.isLoading && hasActiveFilters ? (
            <TeachAndActEmptyState
              icon={<Network />}
              heading="No subrecipients match this view."
              description="Try clearing your filters."
              primaryAction={{
                label: "Clear filters",
                onClick: () => {
                  setSearch("");
                  setStatus("all");
                  setRiskRating("all");
                  setOverdueTasks(false);
                  setOpenFindings(false);
                },
              }}
            />
          ) : rows.length === 0 && !query.isLoading ? (
            <TeachAndActEmptyState
              icon={<Network />}
              heading="Your subrecipients live here"
              description="Track the groups you fund. Watch their risk. Keep audit findings in one place."
              primaryAction={
                canCreate
                  ? { label: "Add your first subrecipient", onClick: () => setCreateOpen(true) }
                  : { label: "Open help", href: "/help" }
              }
              helpLink={{ label: "How subrecipients work", href: "/help" }}
            />
          ) : query.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array(6)
                .fill(null)
                .map((_, index) => (
                  <Skeleton key={index} className="h-32 rounded-2xl" />
                ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="subrecipients-card-grid"
            >
              {rows.map((row) => (
                <Link
                  key={row.id}
                  to="/subrecipients/$subrecipientId"
                  params={{ subrecipientId: row.id }}
                  search={{ grantId }}
                  className="group rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="subrecipient-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="line-clamp-2 text-base font-semibold group-hover:text-primary"
                      title={row.name}
                    >
                      {row.name}
                    </span>
                    <Badge variant={riskTone(row.highestRiskRating)}>
                      {formatRisk(row.highestRiskRating)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <div className="font-medium text-foreground">{row.activeSubawardCount}</div>
                      <div>Subawards</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{row.openTaskCount}</div>
                      <div>Open tasks</div>
                    </div>
                    <div>
                      <div
                        className={
                          row.openFindingCount > 0
                            ? "font-medium text-destructive"
                            : "font-medium text-foreground"
                        }
                      >
                        {row.openFindingCount}
                      </div>
                      <div>Findings</div>
                    </div>
                  </div>
                  {row.overdueTaskCount > 0 ? (
                    <div className="mt-2 text-xs font-medium text-destructive">
                      {row.overdueTaskCount} overdue
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
          {rows.length > 0 && total > pageSize ? (
            <div
              className="flex items-center justify-between pt-4"
              data-testid="subrecipients-pagination"
            >
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="text-2xl font-semibold">{formatNumber(value)}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onValueChange,
  values,
}: {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  values: readonly T[];
}) {
  const id = `subrecipient-filter-${label.toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "all" ? "All" : option.charAt(0).toUpperCase() + option.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
