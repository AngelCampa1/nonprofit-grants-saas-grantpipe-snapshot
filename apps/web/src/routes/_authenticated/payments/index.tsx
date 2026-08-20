import React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
  Textarea,
} from "@grantpipe/ui";
import { Plus, Wallet } from "lucide-react";
import {
  getEffectivePlanTier,
  hasPaymentRequests,
  PAYMENT_REQUEST_TYPES,
  type PaymentRequestType,
} from "@grantpipe/shared";
import { AccessDeniedState } from "../../../components/access-denied-state";
import {
  useOutstandingSummary,
  usePaymentRequests,
  usePaymentRequestMutations,
  useReimbursementCashFlowRadar,
} from "../../../hooks/use-payments";
import { useGrants } from "../../../hooks/use-grants";
import { useOrgBilling } from "../../../hooks/use-org-settings";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { captureRecordFilterChanged } from "../../../lib/record-discovery-analytics";
import {
  formatCurrency,
  formatPaymentRequestStatus,
  formatPaymentRequestType,
} from "../../../lib/format";
import { RetryButton } from "../../../components/retry-button";

type PaymentsSearch = { grantId?: string };

export const Route = createFileRoute("/_authenticated/payments/")({
  component: PaymentsCashWorkspace,
  validateSearch: (search: Record<string, unknown>): PaymentsSearch => {
    const grantId =
      typeof search.grantId === "string" && search.grantId.trim().length > 0
        ? search.grantId
        : undefined;
    return grantId ? { grantId } : {};
  },
});

const PAYMENTS_PAGE_SIZE = 25;

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Partially Approved", value: "partially_approved" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Paid", value: "paid" },
  { label: "Closed", value: "closed" },
] as const;

type RequestRow = {
  id: string;
  requestNumber?: string | null;
  grantName?: string | null;
  type?: string | null;
  status?: string | null;
  requestedAmountCents?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  createdAt?: string | null;
};

type SummaryData = {
  totalOutstandingCents?: number | null;
  submittedCount?: number | null;
  approvedCount?: number | null;
  overdueCount?: number | null;
};

type CashFlowRadarWorkItem = {
  grantId: string;
  grantName: string;
  grantStatus: string;
  grantAmountCents?: number | null;
  grantEndDate?: string | null;
  unrequestedExpenseCents: number;
  submittedCents: number;
  approvedOutstandingCents: number;
  totalCashGapCents: number;
  daysSinceOldestUnrequestedExpense?: number | null;
  riskLevel: "critical" | "warning" | "watch";
  recommendedAction: string;
};

type CashFlowRadarData = {
  totals?: {
    unrequestedExpenseCents?: number | null;
    submittedCents?: number | null;
    approvedOutstandingCents?: number | null;
    totalCashGapCents?: number | null;
    criticalCount?: number | null;
    warningCount?: number | null;
  } | null;
  worklist?: CashFlowRadarWorkItem[] | null;
};

function StatTile({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5" data-testid="stat-tile">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          mono && "font-mono tabular-nums",
          accent && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CashFlowRadarPanel({
  data,
  isLoading,
  isError,
}: {
  data?: CashFlowRadarData;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="mt-4 h-20 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p role="alert" className="text-sm text-destructive">
          Unable to load reimbursement cash-flow radar.
        </p>
      </div>
    );
  }

  const totals = data?.totals;
  const worklist = (data?.worklist ?? []).slice(0, 3);

  return (
    <section
      aria-labelledby="cash-flow-radar-heading"
      className="rounded-2xl border border-border/60 bg-card p-5"
      data-testid="cash-flow-radar"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="cash-flow-radar-heading" className="text-lg font-semibold">
            Reimbursement cash-flow radar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See posted grant costs that still need a request, approval, or cash receipt.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Cash gap</div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {formatCurrency(totals?.totalCashGapCents ?? 0)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 p-3">
          <div className="text-xs text-muted-foreground">Not requested</div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {formatCurrency(totals?.unrequestedExpenseCents ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 p-3">
          <div className="text-xs text-muted-foreground">Awaiting approval</div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {formatCurrency(totals?.submittedCents ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 p-3">
          <div className="text-xs text-muted-foreground">Approved, unpaid</div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {formatCurrency(totals?.approvedOutstandingCents ?? 0)}
          </div>
        </div>
      </div>

      {worklist.length > 0 ? (
        <div className="mt-4 divide-y divide-border/50">
          {worklist.map((item) => (
            <div
              key={item.grantId}
              className="grid gap-3 py-3 md:grid-cols-[1fr_auto]"
              data-testid="cash-flow-work-item"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.grantName}</span>
                  <Badge variant="outline">{item.riskLevel}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.recommendedAction}</p>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatCurrency(item.totalCashGapCents)}
                </span>
                <Link
                  to="/grants/$grantId"
                  params={{ grantId: item.grantId }}
                  className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  Open grant
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No reimbursement cash gaps right now.</p>
      )}
    </section>
  );
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

const PAYMENTS_ACCESS_DENIED_TITLE = "Payments require accounting access.";
const PAYMENTS_ACCESS_DENIED_DESCRIPTION =
  "Ask an admin to update your team permissions before opening the cash workspace.";

type GrantOption = {
  id: string;
  name?: string | null;
  funderName?: string | null;
  startDate?: string | null;
};

function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}T12:00:00.000Z` : null;
}

export function readTrimmedField(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function NewPaymentRequestDialog({
  defaultGrantId,
  open: controlledOpen,
  onOpenChange,
}: {
  defaultGrantId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(Boolean(defaultGrantId));
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const grantsQuery = useGrants({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const grants = ((grantsQuery.data as { data?: GrantOption[] } | undefined)?.data ??
    []) as GrantOption[];
  const { createRequest } = usePaymentRequestMutations();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const grantId = readTrimmedField(form, "grantId");
    const type = readTrimmedField(form, "type");
    if (!grantId) {
      setError("Select a grant for this request.");
      return;
    }
    if (!(PAYMENT_REQUEST_TYPES as readonly string[]).includes(type)) {
      setError("Select a request type.");
      return;
    }
    const periodStart = toIsoDate(readTrimmedField(form, "periodStart"));
    const periodEnd = toIsoDate(readTrimmedField(form, "periodEnd"));
    // Guard the period order on the client so the user sees a plain-language
    // message inline. The shared schema enforces the same rule server-side, but
    // a zValidator rejection only surfaces as a generic "Request failed".
    if (periodStart && periodEnd && new Date(periodStart) > new Date(periodEnd)) {
      setError("End date must be on or after the start date.");
      return;
    }
    const funderReference = readTrimmedField(form, "funderReference");
    const notes = readTrimmedField(form, "notes");
    try {
      const created = await createRequest.mutateAsync({
        grantId,
        type: type as PaymentRequestType,
        ...(periodStart ? { periodStart } : {}),
        ...(periodEnd ? { periodEnd } : {}),
        ...(funderReference ? { funderReference } : {}),
        ...(notes ? { notes } : {}),
      });
      const newId = (created as { id?: string } | null)?.id;
      setOpen(false);
      if (newId) {
        void navigate({ to: "/payments/$requestId", params: { requestId: newId } });
      }
    } catch {
      setError("Unable to add the payment request. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Add request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add payment request</DialogTitle>
          <DialogDescription>
            Start a drawdown, reimbursement, or invoice. You can add expense lines after creating
            it.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="new-request-grant">Grant</Label>
            <Select name="grantId" defaultValue={defaultGrantId ?? ""}>
              <SelectTrigger id="new-request-grant">
                <SelectValue placeholder="Select a grant" />
              </SelectTrigger>
              <SelectContent>
                {grants.map((grant) => {
                  // Same-named grants (e.g. annual renewals) are common. Show the
                  // funder and grant period year so the right grant is picked.
                  const periodYear = grant.startDate?.slice(0, 4);
                  const disambiguator = [grant.funderName, periodYear].filter(Boolean).join(" · ");
                  return (
                    <SelectItem key={grant.id} value={grant.id}>
                      <span className="flex flex-col">
                        <span>{grant.name ?? grant.id}</span>
                        {disambiguator ? (
                          <span className="text-xs text-muted-foreground">{disambiguator}</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-request-type">Type</Label>
            <Select name="type" defaultValue="drawdown">
              <SelectTrigger id="new-request-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_REQUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatPaymentRequestType(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-request-period-start">Period start</Label>
              <Input id="new-request-period-start" name="periodStart" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-request-period-end">Period end</Label>
              <Input id="new-request-period-end" name="periodEnd" type="date" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-request-funder-ref">Funder reference</Label>
            <Input
              id="new-request-funder-ref"
              name="funderReference"
              placeholder="Optional award or invoice reference"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-request-notes">Notes</Label>
            <Textarea id="new-request-notes" name="notes" placeholder="Optional notes" />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={createRequest.isPending}>
            {createRequest.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentsCashWorkspace() {
  const { memberRole, memberPermissions } = useSession();

  if (!canAccessFeature(memberRole, memberPermissions, "payments", "view")) {
    return (
      <AccessDeniedState
        title={PAYMENTS_ACCESS_DENIED_TITLE}
        description={PAYMENTS_ACCESS_DENIED_DESCRIPTION}
      />
    );
  }

  return <PaymentsCashWorkspaceContent />;
}

function PaymentsCashWorkspaceContent() {
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState("");

  const { grantId: searchGrantId } = Route.useSearch();
  const [createOpen, setCreateOpen] = React.useState(Boolean(searchGrantId));
  const { memberRole, memberPermissions } = useSession();
  const billingQuery = useOrgBilling();
  const planTier = billingQuery.data
    ? getEffectivePlanTier({
        planTier: billingQuery.data.planTier,
        subscriptionStatus: billingQuery.data.status,
        trialEndsAt: billingQuery.data.trialEndsAt,
      })
    : null;
  const canCreateRequests =
    canAccessFeature(memberRole, memberPermissions, "payments", "edit") &&
    hasPaymentRequests(planTier);

  const summaryQuery = useOutstandingSummary();
  const cashFlowRadarQuery = useReimbursementCashFlowRadar();
  const requestsQuery = usePaymentRequests({
    page,
    pageSize: PAYMENTS_PAGE_SIZE,
    ...(statusFilter
      ? {
          status: statusFilter as
            | "draft"
            | "submitted"
            | "partially_approved"
            | "approved"
            | "rejected"
            | "paid"
            | "closed",
        }
      : {}),
  });

  const summaryData = summaryQuery.data as SummaryData | undefined;
  const requests = ((requestsQuery.data as { data?: RequestRow[] } | undefined)?.data ??
    []) as RequestRow[];
  const total = (requestsQuery.data as { total?: number } | undefined)?.total ?? requests.length;
  const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));

  const filterTrimmed = filter.trim().toLowerCase();
  const filteredRequests =
    filterTrimmed.length > 0
      ? requests.filter((req) => {
          const haystack = [req.requestNumber, req.grantName, req.type, req.status]
            .filter((v): v is string => typeof v === "string")
            .join(" ")
            .toLowerCase();
          return haystack.includes(filterTrimmed);
        })
      : requests;
  const hasFilter = filterTrimmed.length > 0;
  const hasStatusFilter = statusFilter !== "";
  // In the true-empty state (no requests and no active filter) the status-filter chips
  // and the "Filter current page..." input have nothing to act on and visually
  // contradict the "create your first request" empty state. Show them only once there
  // is a list to work with (requests exist server-side) or a filter the user can clear.
  const hasPaymentListChrome = requests.length > 0 || hasStatusFilter;

  function handleStatusChange(nextStatus: string) {
    setStatusFilter(nextStatus);
    setPage(1);
    captureRecordFilterChanged("payments", "status", { status: nextStatus, search: filter });
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader variant="workbench" title="Payments" kicker="Grants & Funding" />
        {canCreateRequests ? (
          <NewPaymentRequestDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            {...(searchGrantId ? { defaultGrantId: searchGrantId } : {})}
          />
        ) : null}
      </div>

      {/* Summary tiles */}
      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="payments-stat-row">
          <StatTile
            label="Total Outstanding"
            value={formatCurrency(summaryData?.totalOutstandingCents ?? 0)}
            mono
          />
          <StatTile label="Submitted" value={String(summaryData?.submittedCount ?? 0)} />
          <StatTile label="Approved" value={String(summaryData?.approvedCount ?? 0)} />
          <StatTile
            label="Overdue (>30 days)"
            value={String(summaryData?.overdueCount ?? 0)}
            accent={Number(summaryData?.overdueCount ?? 0) > 0}
          />
        </div>
      )}

      <CashFlowRadarPanel
        data={cashFlowRadarQuery.data as CashFlowRadarData | undefined}
        isLoading={cashFlowRadarQuery.isLoading}
        isError={cashFlowRadarQuery.isError}
      />

      {hasPaymentListChrome ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((sf) => (
            <Button
              key={sf.value}
              variant="outline"
              size="sm"
              aria-pressed={statusFilter === sf.value}
              onClick={() => handleStatusChange(sf.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                statusFilter === sf.value &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
              )}
            >
              {sf.label}
            </Button>
          ))}
        </div>
      ) : null}

      {hasPaymentListChrome ? (
        <Input
          placeholder="Filter current page…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onBlur={() => {
            if (filter.trim()) {
              captureRecordFilterChanged("payments", "search", {
                status: statusFilter,
                search: filter,
              });
            }
          }}
          className="max-w-sm"
          aria-label="Filter current page"
        />
      ) : null}

      {/* Request table */}
      {requestsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : requestsQuery.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Unable to load payment requests.
          </p>
          <RetryButton query={requestsQuery} />
        </div>
      ) : requests.length === 0 ? (
        hasStatusFilter ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="payments-filter-empty"
          >
            No payment requests match this status.{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 font-medium text-primary underline-offset-4"
              onClick={() => handleStatusChange("")}
            >
              Clear filter
            </Button>
          </p>
        ) : (
          <TeachAndActEmptyState
            icon={<Wallet className="size-5" />}
            heading="Your payment requests live here"
            description="Ask funders for money you're owed. See where each request stands, from sent to paid."
            primaryAction={
              canCreateRequests
                ? { label: "Add your first request", onClick: () => setCreateOpen(true) }
                : { label: "Open help", href: "/help" }
            }
            helpLink={{ label: "How payment requests work", href: "/help" }}
          />
        )
      ) : filteredRequests.length === 0 && hasFilter ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          data-testid="payments-page-filter-empty"
        >
          No requests on this page match your filter.{" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 font-medium text-primary underline-offset-4"
            onClick={() => setFilter("")}
          >
            Clear filter
          </Button>
        </p>
      ) : (
        <>
          <div
            className="overflow-x-auto rounded-2xl border border-border/60"
            data-testid="payments-table"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Request #
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Grant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Requested
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to="/payments/$requestId"
                        params={{ requestId: req.id }}
                        className="font-medium text-primary hover:underline underline-offset-4"
                      >
                        {req.requestNumber ?? req.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{req.grantName ?? "--"}</td>
                    <td className="px-4 py-3">
                      {req.type ? formatPaymentRequestType(req.type) : "--"}
                    </td>
                    <td className="px-4 py-3">
                      {req.status ? (
                        <Badge variant="outline">{formatPaymentRequestStatus(req.status)}</Badge>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(req.requestedAmountCents)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {req.periodStart || req.periodEnd
                        ? `${formatShortDate(req.periodStart)} - ${formatShortDate(req.periodEnd)}`
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatShortDate(req.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAYMENTS_PAGE_SIZE ? (
            <div
              className="flex items-center justify-between pt-4"
              data-testid="payments-pagination"
            >
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
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
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
