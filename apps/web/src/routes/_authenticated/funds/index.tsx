import React, { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  createFundSchema,
  FUND_TYPES,
  type CreateFundInput,
  type FundType,
} from "@grantpipe/shared";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  numericSortingFn,
  type DataTableProps,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FilterBar,
  IconButton,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
  Textarea,
  ViewToggle,
  cardVariants,
  cn,
} from "@grantpipe/ui";
import { WalletIcon, XIcon } from "lucide-react";
import { z } from "zod";
import { useCreateFund, useFunds } from "../../../hooks/use-grants";
import { useSession } from "../../../hooks/use-session";
import { useActivationAha } from "../../../hooks/use-activation-aha";
import { formatCurrency, formatFundTypeLabel } from "../../../lib/format";
import { useSavedSegments } from "../../../hooks/use-saved-segments";
import { canAccessFeature } from "../../../lib/access-control";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { RetryButton } from "../../../components/retry-button";
import { ExploreSampleDataCta } from "../../../components/explore-sample-data-cta";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { fundsTabs } from "../../../config/page-tabs";
import {
  captureRecordFilterChanged,
  captureRecordViewChanged,
} from "../../../lib/record-discovery-analytics";

const FUNDS_PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/funds/")({
  validateSearch: z.object({
    search: z.string().optional(),
    type: z.enum(FUND_TYPES).optional(),
    page: z.number().int().positive().optional(),
  }),
  component: FundsListPage,
});

interface FundsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function FundsPagination({ page, pageSize, total, onPageChange }: FundsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div data-testid="funds-pagination" className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

const FUND_VIEW_KEY = "gp-fund-view";

type FundView = "cards" | "ledger";

function readStoredFundView(): FundView {
  try {
    const stored = sessionStorage.getItem(FUND_VIEW_KEY);
    if (stored === "cards" || stored === "ledger") return stored;
    /* v8 ignore next -- fallback when stored value is unrecognized */
  } catch {
    /* v8 ignore next -- sessionStorage unavailable in restricted environments */
  }
  return "cards";
}

interface FundCardProps {
  fund: FundRow;
}

function FundCard({ fund }: FundCardProps) {
  return (
    <Link
      to="/funds/$fundId"
      params={{ fundId: fund.id }}
      className={cn(cardVariants({ variant: "interactive" }), "group block p-5")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="line-clamp-2 text-base font-semibold text-foreground group-hover:text-primary"
            title={fund.name}
          >
            {fund.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Balance:{" "}
            <span className="font-mono text-foreground">
              {formatCurrency(fund.summary.currentBalanceCents)}
            </span>
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {formatFundTypeLabel(fund.type)}
        </Badge>
      </div>
    </Link>
  );
}

type FundsRouteSearch = {
  search?: string;
  type?: FundType;
  page?: number;
};

function buildFundsRouteSearch(filters: {
  search: string;
  type: FundType | "";
  page?: number;
}): FundsRouteSearch {
  return {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.page && filters.page > 1 ? { page: filters.page } : {}),
  };
}

function matchesFundSegment(
  segmentFilters: Partial<FundSegmentFilters> | undefined,
  routeFilters: FundSegmentFilters,
) {
  return (
    (segmentFilters?.search ?? "") === routeFilters.search &&
    (segmentFilters?.type ?? "") === routeFilters.type
  );
}

const FUNDS_ERROR_TITLE = "Unable to load funds.";

interface FundsFilterEmptyStateProps {
  onClear: () => void;
}

function FundsFilterEmptyState({ onClear }: FundsFilterEmptyStateProps) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground" data-testid="funds-filter-empty">
      No funds match these filters.{" "}
      <Button variant="link" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </p>
  );
}

interface FundRow {
  id: string;
  name: string;
  type: string;
  summary: {
    allocatedTotalCents: number;
    expenseTotalCents: number;
    currentBalanceCents: number;
    expenseRatio: number;
    thresholdState: "80" | "90" | "100" | null;
  };
}

type FundColumn = DataTableProps<FundRow, unknown>["columns"][number];

type FundSegmentFilters = {
  search: string;
  type: string;
};

export function FundsListPage() {
  const { memberRole, memberPermissions, orgId } = useSession();
  useActivationAha(orgId);
  const navigate = useNavigate({ from: Route.fullPath });
  const canEdit = canAccessFeature(memberRole, memberPermissions, "funds", "edit");
  const routeSearch = Route.useSearch();
  const page = routeSearch.page ?? 1;
  const routeFilters: FundSegmentFilters = {
    search: routeSearch.search ?? "",
    type: (routeSearch.type as FundType | undefined) ?? "",
  };
  const [open, setOpen] = useState(false);
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [confirmDeleteSegmentId, setConfirmDeleteSegmentId] = useState<string | null>(null);
  const segmentStorageKey = orgId ? `gp-fund-segments:${orgId}` : "gp-fund-segments";
  const { segments, saveSegment, deleteSegment, applySegment } =
    useSavedSegments<FundSegmentFilters>(segmentStorageKey, { recordType: "funds" });
  const routeMatchedSegmentId =
    segments.find((segment) => matchesFundSegment(segment.filters, routeFilters))?.id ?? null;
  const [activeFilters, setActiveFilters] = React.useOptimistic(
    routeFilters,
    (_current, next: FundSegmentFilters) => next,
  );
  const [activeSegmentForRoute, setActiveSegmentForRoute] = React.useOptimistic(
    routeMatchedSegmentId,
    (_current, next: string | null) => next,
  );
  const search = activeFilters.search;
  const typeFilter = activeFilters.type as FundType | "";
  const hasActiveFilters = search.length > 0 || !!typeFilter;
  const [formData, setFormData] = useState<CreateFundInput>({
    name: "",
    type: "unrestricted",
    description: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [view, setView] = useState<FundView>(readStoredFundView);

  function handleViewChange(newView: FundView) {
    captureRecordViewChanged("funds", newView, view);
    setView(newView);
    try {
      sessionStorage.setItem(FUND_VIEW_KEY, newView);
      /* v8 ignore next -- sessionStorage unavailable in restricted environments */
    } catch {
      /* v8 ignore next -- no-op fallback */
    }
  }

  function handleClearFilters() {
    const cleared: { search: string; type: FundType | "" } = { search: "", type: "" };
    React.startTransition(() => {
      setActiveFilters(cleared);
      setActiveSegmentForRoute(null);
    });
    syncFiltersToRoute(cleared);
  }

  function syncFiltersToRoute(next: { search: string; type: FundType | "" }) {
    void navigate({
      to: ".",
      search: buildFundsRouteSearch(next),
      replace: true,
    });
  }

  const fundsQuery = useFunds({
    page,
    pageSize: FUNDS_PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
    ...(search ? { search } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  });
  const createFund = useCreateFund();
  const funds: FundRow[] = fundsQuery.data?.data ?? [];
  const fundsTotal = fundsQuery.data?.total ?? 0;

  function handlePageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: buildFundsRouteSearch({ search, type: typeFilter, page: nextPage }),
      replace: false,
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (formData.name.trim().length === 0) {
      setFormError("Fund name is required.");
      return;
    }

    const trimmedDescription = formData.description?.trim() ?? "";
    const parsed = createFundSchema.safeParse({
      ...formData,
      name: formData.name.trim(),
      ...(trimmedDescription ? { description: trimmedDescription } : { description: undefined }),
    });

    if (!parsed.success) {
      // v8 ignore next — Zod always provides a message; the fallback is unreachable
      setFormError(parsed.error.issues[0]?.message ?? "Unable to add fund.");
      return;
    }

    try {
      await createFund.mutateAsync(parsed.data);
      setOpen(false);
      setFormData({ name: "", type: "unrestricted", description: "" });
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add fund.");
    }
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFormError(null);

    if (!nextOpen) {
      setFormData({ name: "", type: "unrestricted", description: "" });
    }
  }

  function handleApplySegment(segId: string) {
    if (activeSegmentForRoute === segId) {
      const clearedFilters: { search: string; type: FundType | "" } = { search: "", type: "" };
      React.startTransition(() => {
        setActiveFilters(clearedFilters);
        setActiveSegmentForRoute(null);
      });
      syncFiltersToRoute(clearedFilters);
    } else {
      const filters = applySegment(segId);
      if (filters) {
        const nextSearch = filters.search;
        const nextType = (filters.type as FundType) || "";
        const nextFilters = { search: nextSearch, type: nextType };
        React.startTransition(() => {
          setActiveFilters(nextFilters);
          setActiveSegmentForRoute(segId);
        });
        syncFiltersToRoute(nextFilters);
      }
    }
  }

  function handleSaveSegment() {
    if (!segmentName.trim()) return;
    saveSegment(segmentName.trim(), { search, type: typeFilter });
    setSegmentName("");
    setSaveSegmentOpen(false);
  }

  const columns = useMemo<FundColumn[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/funds/$fundId"
            params={{ fundId: row.original.id }}
            className="font-medium text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">{formatFundTypeLabel(row.original.type)}</Badge>
        ),
      },
      {
        id: "balance",
        accessorFn: (row) => row.summary.currentBalanceCents,
        header: "Balance",
        sortingFn: numericSortingFn,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatCurrency(row.original.summary.currentBalanceCents)}
          </span>
        ),
      },
    ],
    [],
  );

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" className="rounded-full" asChild>
        <Link to="/grants/sentinel">Open Budget Sentinel</Link>
      </Button>
      {canEdit ? (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button>Add fund</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add fund</DialogTitle>
              <DialogDescription>
                Create a fund to track balances and restrictions.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError ? (
                <Alert variant="destructive" title="Unable to add fund">
                  {formError}
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="fund-name">Fund name</Label>
                <Input
                  id="fund-name"
                  placeholder="Fund name"
                  // v8 ignore next
                  value={formData.name ?? ""}
                  onChange={(event) => {
                    setFormError(null);
                    setFormData((current) => ({ ...current, name: event.target.value }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(val) => {
                    setFormError(null);
                    setFormData((c) => ({ ...c, type: val as CreateFundInput["type"] }));
                  }}
                >
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUND_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {formatFundTypeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fund-description">Description</Label>
                <Textarea
                  id="fund-description"
                  placeholder="What is this fund for?"
                  value={formData.description ?? ""}
                  onChange={(event) => {
                    setFormError(null);
                    setFormData((current) => ({ ...current, description: event.target.value }));
                  }}
                />
              </div>
              <DialogFooter className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createFund.isPending || formData.name.trim().length === 0}
                >
                  {createFund.isPending ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );

  const isErrorState = fundsQuery.isError === true;
  const isLoadingState = fundsQuery.isLoading === true;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Funds"
        help="Funds separate money by purpose. Unrestricted funds can go toward any expense. Restricted funds must follow donor, grant, or board rules."
        actions={headerActions}
      />

      <AppPageTabs groupId="funds" items={fundsTabs} />

      <div className="space-y-3">
        <FilterBar>
          <Input
            aria-label="Search funds"
            placeholder="Search funds…"
            value={search}
            onChange={(event) => {
              const nextSearch = event.target.value;
              const nextFilters = { ...activeFilters, search: nextSearch };
              React.startTransition(() => {
                setActiveFilters(nextFilters);
                setActiveSegmentForRoute(null);
              });
              captureRecordFilterChanged("funds", "search", nextFilters);
              syncFiltersToRoute({ search: nextSearch, type: typeFilter });
            }}
          />
          <Select
            value={typeFilter === "" ? "all" : typeFilter}
            onValueChange={(val) => {
              const nextType = val === "all" ? "" : (val as FundType);
              const nextFilters = { ...activeFilters, type: nextType };
              React.startTransition(() => {
                setActiveFilters(nextFilters);
                setActiveSegmentForRoute(null);
              });
              captureRecordFilterChanged("funds", "type", nextFilters);
              syncFiltersToRoute({ search, type: nextType });
            }}
          >
            <SelectTrigger aria-label="Filter fund type">
              <SelectValue placeholder="All fund types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fund types</SelectItem>
              {FUND_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {formatFundTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <ViewToggle<FundView>
              options={[
                { value: "cards", label: "Cards" },
                { value: "ledger", label: "Ledger" },
              ]}
              value={view}
              onChange={handleViewChange}
            />
          </div>
        </FilterBar>
      </div>

      {(segments.length > 0 || canEdit) && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {segments.map((seg) => (
              <div key={seg.id} className="flex items-center gap-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={activeSegmentForRoute === seg.id}
                  onClick={() => handleApplySegment(seg.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    activeSegmentForRoute === seg.id &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                  )}
                >
                  {seg.name}
                </Button>
                {canEdit && (
                  <IconButton
                    size="sm"
                    aria-label={`Delete segment ${seg.name}`}
                    onClick={() => setConfirmDeleteSegmentId(seg.id)}
                    className="hover:text-destructive"
                  >
                    <XIcon className="size-3.5" />
                  </IconButton>
                )}
              </div>
            ))}
            {canEdit && hasActiveFilters && (
              <Dialog open={saveSegmentOpen} onOpenChange={setSaveSegmentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Save current filters
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Save segment</DialogTitle>
                    <DialogDescription>Name this filter set to reuse it later.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="fund-segment-name">Segment name</Label>
                    <Input
                      id="fund-segment-name"
                      placeholder="e.g. Restricted grants"
                      value={segmentName}
                      onChange={(e) => setSegmentName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveSegment();
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveSegment} disabled={!segmentName.trim()}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {isErrorState ? (
        <div className="space-y-3">
          <Alert variant="destructive" title={FUNDS_ERROR_TITLE}>
            Refresh the page or try again in a moment.
          </Alert>
          <RetryButton query={fundsQuery} />
        </div>
      ) : view === "cards" ? (
        isLoadingState ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`skeleton-${i}`} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : funds.length === 0 && hasActiveFilters ? (
          <FundsFilterEmptyState onClear={handleClearFilters} />
        ) : funds.length === 0 ? (
          <TeachAndActEmptyState
            icon={<WalletIcon className="size-5" />}
            heading="Your funds live here"
            description="Track money by its purpose. See what each fund can pay for."
            primaryAction={
              canEdit
                ? {
                    label: "Add your first fund",
                    onClick: () => handleDialogOpenChange(true),
                  }
                : { label: "Open help", href: "/help" }
            }
            helpLink={{ label: "How funds work", href: "/help" }}
            footer={canEdit ? <ExploreSampleDataCta /> : null}
          />
        ) : (
          <>
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="funds-card-grid"
            >
              {funds.map((fund) => (
                <FundCard key={fund.id} fund={fund} />
              ))}
            </div>
            {!isErrorState && fundsTotal > 0 ? (
              <FundsPagination
                page={page}
                pageSize={FUNDS_PAGE_SIZE}
                total={fundsTotal}
                onPageChange={handlePageChange}
              />
            ) : null}
          </>
        )
      ) : (
        <>
          <DataTable<FundRow, unknown>
            columns={columns}
            data={funds}
            isLoading={isLoadingState}
            emptyState={
              hasActiveFilters ? (
                <FundsFilterEmptyState onClear={handleClearFilters} />
              ) : (
                <TeachAndActEmptyState
                  icon={<WalletIcon className="size-5" />}
                  heading="Your funds live here"
                  primaryAction={
                    canEdit
                      ? {
                          label: "Add your first fund",
                          onClick: () => handleDialogOpenChange(true),
                        }
                      : { label: "Open help", href: "/help" }
                  }
                  helpLink={{ label: "How funds work", href: "/help" }}
                  footer={canEdit ? <ExploreSampleDataCta /> : null}
                />
              )
            }
          />
          {!isErrorState && fundsTotal > 0 ? (
            <FundsPagination
              page={page}
              pageSize={FUNDS_PAGE_SIZE}
              total={fundsTotal}
              onPageChange={handlePageChange}
            />
          ) : null}
        </>
      )}
      {(() => {
        const segToDelete = segments.find((s) => s.id === confirmDeleteSegmentId);
        return (
          <ConfirmDialog
            open={confirmDeleteSegmentId !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmDeleteSegmentId(null);
            }}
            title={`Delete saved view '${segToDelete?.name ?? ""}'?`}
            description="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={() => {
              if (confirmDeleteSegmentId) {
                deleteSegment(confirmDeleteSegmentId);
                setConfirmDeleteSegmentId(null);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
