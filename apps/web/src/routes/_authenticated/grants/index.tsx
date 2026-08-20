import React, { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  FUNDER_TYPES,
  GRANT_STATUSES,
  GRANT_SOURCE_TYPES,
  PLAN_LABELS,
  formatGrantSourceTypeLabel,
  type FunderType,
  type GrantListParams,
  type GrantSourceType,
  type GrantStatus,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@grantpipe/ui";
import { ExternalLinkIcon, FileTextIcon, SearchIcon, XIcon } from "lucide-react";
import { TeachAndActEmptyState } from "@grantpipe/ui";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { grantsTabs } from "../../../config/page-tabs";
import { VideoDialog } from "../../../components/video-dialog";
import {
  useFunders,
  useCreateGrantOpportunity,
  useGrantOpportunities,
  useGrantOpportunityMutations,
  useGrantOpportunitySearch,
  useGrants,
} from "../../../hooks/use-grants";
import { useSession } from "../../../hooks/use-session";
import {
  formatCurrency,
  formatFunderTypeLabel,
  formatGrantStatusLabel,
  formatUtcCalendarDate,
} from "../../../lib/format";
import { GRANT_STAGE_DETAILS, GRANT_STATUS_BADGE_VARIANTS } from "../../../lib/grant-stages";
import { useSavedSegments } from "../../../hooks/use-saved-segments";
import { GrantPipelineBoard } from "../../../components/grants/grant-pipeline-board";
import { canAccessFeature } from "../../../lib/access-control";
import { NewGrantDialog } from "../../../components/dialogs/new-grant-dialog";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { captureEvent } from "../../../lib/analytics";
import {
  captureRecordFilterChanged,
  captureRecordViewChanged,
} from "../../../lib/record-discovery-analytics";
import { getTextLengthBucket } from "../../../lib/analytics-buckets";
import { RetryButton } from "../../../components/retry-button";
import { ExploreSampleDataCta } from "../../../components/explore-sample-data-cta";

const grantsSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(GRANT_STATUSES).optional(),
  funderId: z.string().optional(),
  threshold: z.enum(["80", "90", "100"]).optional(),
  page: z.number().int().positive().optional(),
  trackedPage: z.number().int().positive().optional(),
});

const GRANTS_PAGE_SIZE = 25;

interface GrantsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  testId?: string;
}

export function GrantsPagination({
  page,
  pageSize,
  total,
  onPageChange,
  testId,
}: GrantsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div
      data-testid={testId ?? "grants-pagination"}
      className="flex items-center justify-between pt-4"
    >
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

export const Route = createFileRoute("/_authenticated/grants/")({
  validateSearch: grantsSearchSchema,
  component: GrantsListPage,
});

const GRANTS_ERROR_TITLE = "Unable to load grants.";

interface GrantRow {
  id: string;
  name: string;
  funder?: { id: string; name: string } | null;
  status: string;
  amountCents?: number | null;
  applicationDeadline?: string | null;
}

interface OpportunityRow {
  id: string;
  title: string;
  sourceType?: GrantSourceType | null;
  sourceName?: string | null;
  funderType?: FunderType | null;
  agencyName?: string | null;
  opportunityNumber?: string | null;
  closeDate?: string | null;
  awardCeilingCents?: number | null;
  officialUrl?: string | null;
}

type GrantColumn = DataTableProps<GrantRow, unknown>["columns"][number];

type GrantSegmentFilters = {
  search: string;
  status: string;
  funderId: string;
  threshold: string;
};

type GrantRouteSearch = z.infer<typeof grantsSearchSchema>;
type GrantThresholdFilter = "80" | "90" | "100" | "";

export function buildGrantRouteSearch(
  filters: GrantSegmentFilters,
  pageOverrides: { page?: number; trackedPage?: number } = {},
): GrantRouteSearch {
  return {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status as GrantRouteSearch["status"] } : {}),
    ...(filters.funderId ? { funderId: filters.funderId } : {}),
    ...(filters.threshold ? { threshold: filters.threshold as GrantRouteSearch["threshold"] } : {}),
    ...(pageOverrides.page && pageOverrides.page > 1 ? { page: pageOverrides.page } : {}),
    ...(pageOverrides.trackedPage && pageOverrides.trackedPage > 1
      ? { trackedPage: pageOverrides.trackedPage }
      : {}),
  };
}

function matchesGrantSegment(
  segmentFilters: Partial<GrantSegmentFilters> | undefined,
  routeFilters: GrantSegmentFilters,
) {
  return (
    (segmentFilters?.search ?? "") === routeFilters.search &&
    (segmentFilters?.status ?? "") === routeFilters.status &&
    (segmentFilters?.funderId ?? "") === routeFilters.funderId &&
    (segmentFilters?.threshold ?? "") === routeFilters.threshold
  );
}

export function GrantsListPage() {
  const { memberRole, memberPermissions, orgId } = useSession();
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch();
  const routeFilters: GrantSegmentFilters = {
    search: routeSearch.search ?? "",
    status: (routeSearch.status as GrantStatus | undefined) ?? "",
    funderId: routeSearch.funderId ?? "",
    threshold: routeSearch.threshold ?? "",
  };
  const canEdit = canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const canImport = canAccessFeature(memberRole, memberPermissions, "import", "edit");
  const [open, setOpen] = useState(false);
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [activeGrantTab, setActiveGrantTab] = useState("portfolio");
  const [activeOpportunityView, setActiveOpportunityView] = useState("live");
  const [opportunityKeyword, setOpportunityKeyword] = useState("");
  const [submittedOpportunityKeyword, setSubmittedOpportunityKeyword] = useState("");
  const [manualOpportunityOpen, setManualOpportunityOpen] = useState(false);
  const [manualOpportunityError, setManualOpportunityError] = useState<string | null>(null);
  const [manualOpportunityTitle, setManualOpportunityTitle] = useState("");
  const [manualOpportunitySourceType, setManualOpportunitySourceType] =
    useState<GrantSourceType>("private_foundation");
  const [manualOpportunitySourceName, setManualOpportunitySourceName] = useState("");
  const [trackedOpportunitySourceType, setTrackedOpportunitySourceType] = useState<
    GrantSourceType | "all"
  >("all");
  const [trackedOpportunityFunderType, setTrackedOpportunityFunderType] = useState<
    FunderType | "all"
  >("all");
  /* v8 ignore next -- anonymous-org storage fallback is defensive for unauthenticated test shells. */
  const segmentStorageKey = orgId ? `gp-grant-segments:${orgId}` : "gp-grant-segments";
  const { segments, saveSegment, deleteSegment, applySegment } =
    useSavedSegments<GrantSegmentFilters>(segmentStorageKey, { recordType: "grants" });
  const [confirmDeleteSegmentId, setConfirmDeleteSegmentId] = useState<string | null>(null);
  const segmentToDeleteGrants = segments.find((s) => s.id === confirmDeleteSegmentId);
  const routeMatchedSegmentId =
    segments.find((segment) => matchesGrantSegment(segment.filters, routeFilters))?.id ?? null;
  const [activeFilters, setActiveFilters] = React.useOptimistic(
    routeFilters,
    (_current, next: GrantSegmentFilters) => next,
  );
  const [activeSegmentForRoute, setActiveSegmentForRoute] = React.useOptimistic(
    routeMatchedSegmentId,
    (_current, next: string | null) => next,
  );
  const search = activeFilters.search;
  const statusFilter = activeFilters.status as GrantStatus | "";
  const funderFilter = activeFilters.funderId;
  const thresholdFilter = activeFilters.threshold as GrantThresholdFilter;
  const hasActiveFilters =
    search.length > 0 || !!statusFilter || !!funderFilter || !!thresholdFilter;
  const page = routeSearch.page ?? 1;
  const trackedPage = routeSearch.trackedPage ?? 1;
  const grantsQuery = useGrants({
    page,
    pageSize: GRANTS_PAGE_SIZE,
    sortBy: "updatedAt",
    sortOrder: "desc",
    ...(search ? { search } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(funderFilter ? { funderId: funderFilter } : {}),
    ...(thresholdFilter ? { threshold: thresholdFilter } : {}),
  });
  const fundersQuery = useFunders({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" });
  const opportunityQuery = useGrantOpportunitySearch({
    keyword: submittedOpportunityKeyword,
    page: 1,
    pageSize: GRANTS_PAGE_SIZE,
  });
  const trackedOpportunityQuery = useGrantOpportunities({
    page: trackedPage,
    pageSize: GRANTS_PAGE_SIZE,
    ...(trackedOpportunitySourceType !== "all" ? { sourceType: trackedOpportunitySourceType } : {}),
    ...(trackedOpportunityFunderType !== "all" ? { funderType: trackedOpportunityFunderType } : {}),
  });

  function handleGrantsPageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: buildGrantRouteSearch(activeFilters, { page: nextPage, trackedPage }),
      replace: false,
    });
  }

  function handleTrackedPageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: buildGrantRouteSearch(activeFilters, { page, trackedPage: nextPage }),
      replace: false,
    });
  }
  const opportunityMutations = useGrantOpportunityMutations();
  const createGrantOpportunity = useCreateGrantOpportunity();

  function syncRouteSearch(nextFilters: GrantSegmentFilters) {
    void navigate({
      to: ".",
      search: buildGrantRouteSearch(nextFilters),
      replace: true,
    });
  }

  function updateFilters(nextFilters: Partial<GrantSegmentFilters>) {
    const nextResolvedFilters: GrantSegmentFilters = {
      ...activeFilters,
      ...nextFilters,
    };
    const changedFilterKey = Object.keys(nextFilters)[0] ?? "unknown";

    React.startTransition(() => {
      setActiveFilters(nextResolvedFilters);
      setActiveSegmentForRoute(null);
    });
    captureRecordFilterChanged("grants", changedFilterKey, nextResolvedFilters);
    syncRouteSearch(nextResolvedFilters);
  }

  function handleGrantTabChange(nextTab: string) {
    captureRecordViewChanged("grants", nextTab, activeGrantTab);
    setActiveGrantTab(nextTab);
  }

  function handleOpportunityViewChange(nextView: string) {
    if (nextView !== activeOpportunityView) {
      captureEvent("grant_opportunity_view_changed", {
        from_view: activeOpportunityView,
        to_view: nextView,
      });
    }
    setActiveOpportunityView(nextView);
  }

  function handleOpportunitySearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = opportunityKeyword.trim();
    if (keyword.length === 0) return;
    setSubmittedOpportunityKeyword(keyword);
    captureEvent("grant_opportunity_search_submitted", {
      keyword_length_bucket: getTextLengthBucket(keyword.length),
      source: "grants_gov",
    });
  }

  function handleApplySegment(segId: string) {
    if (activeSegmentForRoute === segId) {
      const clearedFilters = { search: "", status: "", funderId: "", threshold: "" };
      React.startTransition(() => {
        setActiveFilters(clearedFilters);
        setActiveSegmentForRoute(null);
      });
      syncRouteSearch(clearedFilters);
    } else {
      const filters = applySegment(segId);
      if (filters) {
        const nextFilters = {
          search: filters.search,
          status: filters.status,
          /* v8 ignore next -- empty segment defaults are covered by clear paths. */
          funderId: filters.funderId ?? "",
          /* v8 ignore next -- empty segment defaults are covered by clear paths. */
          threshold: filters.threshold ?? "",
        };
        React.startTransition(() => {
          setActiveFilters(nextFilters);
          setActiveSegmentForRoute(segId);
        });
        syncRouteSearch(nextFilters);
      }
    }
  }

  function handleSaveSegment() {
    if (!segmentName.trim()) return;
    saveSegment(segmentName.trim(), {
      search,
      status: statusFilter,
      funderId: funderFilter,
      threshold: thresholdFilter,
    });
    setSegmentName("");
    setSaveSegmentOpen(false);
  }

  function resetManualOpportunityForm() {
    setManualOpportunityTitle("");
    setManualOpportunitySourceType("private_foundation");
    setManualOpportunitySourceName("");
  }

  function handleCreateManualOpportunity() {
    if (!manualOpportunityTitle.trim() || !manualOpportunitySourceName.trim()) return;
    setManualOpportunityError(null);
    createGrantOpportunity.mutate(
      {
        title: manualOpportunityTitle.trim(),
        sourceType: manualOpportunitySourceType,
        sourceName: manualOpportunitySourceName.trim(),
        funderType:
          manualOpportunitySourceType === "corporate"
            ? "corporate"
            : manualOpportunitySourceType === "state_local"
              ? "government"
              : manualOpportunitySourceType === "other" ||
                  manualOpportunitySourceType === "association"
                ? "other"
                : "foundation",
      },
      {
        onSuccess: () => {
          resetManualOpportunityForm();
          setManualOpportunityOpen(false);
        },
        onError: (error) =>
          setManualOpportunityError(
            error instanceof Error ? error.message : "Unable to complete this action.",
          ),
      },
    );
  }

  const grants: GrantRow[] = grantsQuery.data?.data ?? [];
  const grantsTotal = grantsQuery.data?.total ?? 0;
  const grantCapacity = grantsQuery.data?.capacity;
  const trackedOpportunityTotal =
    (trackedOpportunityQuery.data as { total?: number } | undefined)?.total ?? 0;
  const liveOpportunities =
    (opportunityQuery.data as { data?: OpportunityRow[] } | undefined)?.data ?? [];
  const trackedOpportunities =
    (trackedOpportunityQuery.data as { data?: OpportunityRow[] } | undefined)?.data ?? [];
  const funders = fundersQuery.data?.data ?? [];

  const columns = useMemo<GrantColumn[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/grants/$grantId"
            params={{ grantId: row.original.id }}
            className="font-medium text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "funder",
        accessorKey: "funder.name",
        header: "Funder",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.funder?.name ?? "--"}</span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status as GrantStatus;
          return (
            <Badge variant={GRANT_STATUS_BADGE_VARIANTS[status] ?? "outline"}>
              {formatGrantStatusLabel(status)}
            </Badge>
          );
        },
      },
      {
        id: "amount",
        accessorKey: "amountCents",
        header: "Amount",
        sortingFn: numericSortingFn,
        cell: ({ row }) => (
          <span className="font-mono">{formatCurrency(row.original.amountCents)}</span>
        ),
      },
      {
        id: "deadline",
        accessorKey: "applicationDeadline",
        header: "Deadline",
        cell: ({ row }) => (
          <span className="font-mono text-muted-foreground">
            {row.original.applicationDeadline
              ? formatUtcCalendarDate(row.original.applicationDeadline)
              : "--"}
          </span>
        ),
      },
    ],
    [],
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {canEdit ? (
        <>
          <Button onClick={() => setOpen(true)}>Add grant</Button>
          <NewGrantDialog open={open} onOpenChange={setOpen} />
        </>
      ) : null}
    </div>
  );

  const isErrorState = grantsQuery.isError === true;
  const isLoadingState = grantsQuery.isLoading === true;
  // Hide the FilterBar in the true-empty state (no grants and no active filter);
  // show it as soon as there are records or an active filter to clear.
  const hasGrantListChrome = grants.length > 0 || hasActiveFilters;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Grants"
        help="Use Grants for funder opportunities and awards. Put general donations in Donors. Connect grant money to Funds when it has spending rules."
        actions={headerActions}
      />
      <AppPageTabs groupId="grants" items={grantsTabs} />

      <Tabs value={activeGrantTab} onValueChange={handleGrantTabChange} className="space-y-5">
        <TabsList variant="record" aria-label="Grant workspace views">
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
        </TabsList>

        <TabsContent value="opportunities" className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Find new grants</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search live Grants.gov listings. You can also track grants from funder websites,
                spreadsheets, and your own research.
              </p>
            </div>
            {canEdit ? (
              <Dialog open={manualOpportunityOpen} onOpenChange={setManualOpportunityOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Add manual opportunity</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add opportunity</DialogTitle>
                    <DialogDescription>
                      Track a non-federal opportunity from a funder website, spreadsheet, or
                      prospect source.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="manual-opportunity-title">Opportunity title</Label>
                      <Input
                        id="manual-opportunity-title"
                        value={manualOpportunityTitle}
                        onChange={(event) => setManualOpportunityTitle(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manual-opportunity-source-type">Source type</Label>
                      <Select
                        value={manualOpportunitySourceType}
                        onValueChange={(value) =>
                          setManualOpportunitySourceType(value as GrantSourceType)
                        }
                      >
                        <SelectTrigger id="manual-opportunity-source-type" aria-label="Source type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRANT_SOURCE_TYPES.filter((sourceType) => sourceType !== "federal").map(
                            (sourceType) => (
                              <SelectItem key={sourceType} value={sourceType}>
                                {formatGrantSourceTypeLabel(sourceType)}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manual-opportunity-source-name">Source name</Label>
                      <Input
                        id="manual-opportunity-source-name"
                        value={manualOpportunitySourceName}
                        onChange={(event) => setManualOpportunitySourceName(event.target.value)}
                      />
                    </div>
                    {manualOpportunityError ? (
                      <Alert variant="destructive" title="Unable to complete the action">
                        <p>{manualOpportunityError}</p>
                      </Alert>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreateManualOpportunity}
                      disabled={
                        createGrantOpportunity.isPending ||
                        !manualOpportunityTitle.trim() ||
                        !manualOpportunitySourceName.trim()
                      }
                    >
                      Create opportunity
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          <Tabs
            value={activeOpportunityView}
            onValueChange={handleOpportunityViewChange}
            className="space-y-4"
          >
            <TabsList variant="record" aria-label="Opportunity source views">
              <TabsTrigger value="live">Live Grants.gov</TabsTrigger>
              <TabsTrigger value="tracked">Tracked/imported</TabsTrigger>
            </TabsList>
            <TabsContent value="live" className="space-y-4">
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={handleOpportunitySearchSubmit}
              >
                <Input
                  aria-label="Search grant opportunities"
                  placeholder="Search Grants.gov opportunities…"
                  value={opportunityKeyword}
                  onChange={(event) => setOpportunityKeyword(event.target.value)}
                />
                <Button type="submit" disabled={opportunityKeyword.trim().length === 0}>
                  <SearchIcon className="mr-2 size-4" />
                  Search
                </Button>
              </form>
              {opportunityQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Searching Grants.gov…</p>
              ) : null}
              {opportunityQuery.isError ? (
                <Alert variant="destructive" title="Unable to search grant opportunities">
                  Try again in a moment.
                </Alert>
              ) : null}
              {!opportunityQuery.isLoading &&
              !opportunityQuery.isError &&
              liveOpportunities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
                  {submittedOpportunityKeyword.trim().length === 0
                    ? "Search Grants.gov to find grants. Type a keyword above."
                    : "No grants match your search. Try another keyword."}
                </div>
              ) : (
                <div className="space-y-3">
                  {liveOpportunities.map((opportunity) => (
                    <OpportunityCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      canEdit={canEdit}
                      opportunityMutations={opportunityMutations}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="tracked" className="space-y-3">
              <FilterBar>
                <Select
                  value={trackedOpportunitySourceType}
                  onValueChange={(value) =>
                    setTrackedOpportunitySourceType(value as GrantSourceType | "all")
                  }
                >
                  <SelectTrigger aria-label="Tracked opportunity source type">
                    <SelectValue placeholder="Source type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All source types</SelectItem>
                    {GRANT_SOURCE_TYPES.map((sourceType) => (
                      <SelectItem key={sourceType} value={sourceType}>
                        {formatGrantSourceTypeLabel(sourceType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={trackedOpportunityFunderType}
                  onValueChange={(value) =>
                    setTrackedOpportunityFunderType(value as FunderType | "all")
                  }
                >
                  <SelectTrigger aria-label="Tracked opportunity funder type">
                    <SelectValue placeholder="Funder type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All funder types</SelectItem>
                    {FUNDER_TYPES.map((funderType) => (
                      <SelectItem key={funderType} value={funderType}>
                        {formatFunderTypeLabel(funderType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar>
              {trackedOpportunityQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading tracked opportunities…</p>
              ) : null}
              {trackedOpportunityQuery.isError ? (
                <Alert variant="destructive" title="Unable to load tracked opportunities">
                  Try again in a moment.
                </Alert>
              ) : null}
              {!trackedOpportunityQuery.isLoading &&
              !trackedOpportunityQuery.isError &&
              trackedOpportunities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
                  No tracked grants yet. Find grants on the Live tab and track them.
                </div>
              ) : (
                trackedOpportunities.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    canEdit={canEdit}
                    opportunityMutations={opportunityMutations}
                  />
                ))
              )}
              {trackedOpportunityTotal > 0 ? (
                <GrantsPagination
                  page={trackedPage}
                  pageSize={GRANTS_PAGE_SIZE}
                  total={trackedOpportunityTotal}
                  onPageChange={handleTrackedPageChange}
                  testId="tracked-opportunities-pagination"
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="pipeline">
          <GrantPipelineBoard />
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          {grantCapacity && grantCapacity.overageCount > 0 ? (
            <Alert variant="warning" data-testid="grants-overage-banner">
              <span className="font-medium">
                {grantCapacity.overageCount.toLocaleString("en-US")} active{" "}
                {grantCapacity.overageCount === 1 ? "grant" : "grants"} over your included cap
              </span>{" "}
              on {PLAN_LABELS[grantCapacity.planTier]}. {grantCapacity.overageCopy} pending overage.{" "}
              {formatCurrency(grantCapacity.overageMonthlyCents)}/mo currently pending. You can keep
              working until the soft headroom cap.
            </Alert>
          ) : null}

          {hasGrantListChrome ? (
            <div className="space-y-3">
              <FilterBar>
                <Input
                  aria-label="Search grants"
                  placeholder="Search grants…"
                  value={search}
                  onChange={(event) => {
                    const nextSearch = event.target.value;
                    updateFilters({ search: nextSearch });
                  }}
                />
                <Select
                  value={statusFilter === "" ? "all" : statusFilter}
                  onValueChange={(val) => {
                    const nextStatus = val === "all" ? "" : (val as GrantStatus);
                    updateFilters({ status: nextStatus });
                  }}
                >
                  <SelectTrigger aria-label="Filter status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {GRANT_STAGE_DETAILS.map((stage) => (
                      <SelectItem key={stage.status} value={stage.status}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={funderFilter === "" ? "all" : funderFilter}
                  onValueChange={(val) => {
                    const nextFunder = val === "all" ? "" : val;
                    updateFilters({ funderId: nextFunder });
                  }}
                >
                  <SelectTrigger aria-label="Filter funder">
                    <SelectValue placeholder="All funders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All funders</SelectItem>
                    {funders.map((funder: { id: string; name: string }) => (
                      <SelectItem key={funder.id} value={funder.id}>
                        {funder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={thresholdFilter === "" ? "all" : thresholdFilter}
                  onValueChange={(val) => {
                    const nextThreshold =
                      val === "all" ? "" : (val as GrantListParams["threshold"]);
                    updateFilters({ threshold: nextThreshold });
                  }}
                >
                  <SelectTrigger aria-label="Filter threshold">
                    <SelectValue placeholder="All thresholds" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All thresholds</SelectItem>
                    <SelectItem value="80">80%</SelectItem>
                    <SelectItem value="90">90%</SelectItem>
                    <SelectItem value="100">100%</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar>
            </div>
          ) : null}

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
                        <DialogDescription>
                          Give this filter set a name so you can quickly apply it later.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="grant-segment-name">Segment name</Label>
                        <Input
                          id="grant-segment-name"
                          placeholder="e.g. Active STEM grants"
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
              <Alert variant="destructive" title={GRANTS_ERROR_TITLE}>
                Refresh the page or try again in a moment.
              </Alert>
              <RetryButton query={grantsQuery} />
            </div>
          ) : (
            <>
              <DataTable<GrantRow, unknown>
                columns={columns}
                data={grants}
                isLoading={isLoadingState}
                emptyState={
                  hasActiveFilters ? (
                    <p
                      className="py-6 text-center text-sm text-muted-foreground"
                      data-testid="grants-filter-empty"
                    >
                      No grants match these filters.{" "}
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          const cleared = { search: "", status: "", funderId: "", threshold: "" };
                          React.startTransition(() => {
                            setActiveFilters(cleared);
                            setActiveSegmentForRoute(null);
                          });
                          syncRouteSearch(cleared);
                        }}
                      >
                        Clear filters
                      </Button>
                    </p>
                  ) : (
                    <TeachAndActEmptyState
                      icon={<FileTextIcon className="size-5" />}
                      heading="Your grants live here"
                      description="Track every grant you win. Watch deadlines so nothing slips."
                      primaryAction={
                        canEdit
                          ? {
                              label: "Add your first grant",
                              onClick: () => setOpen(true),
                            }
                          : { label: "Open help", href: "/help" }
                      }
                      secondaryAction={
                        canImport
                          ? {
                              label: "Import from spreadsheet",
                              onClick: () => void navigate({ to: "/import" }),
                            }
                          : undefined
                      }
                      helpLink={{ label: "How grants work", href: "/help" }}
                      footer={
                        <>
                          <VideoDialog
                            slug="add-grant-allocate"
                            triggerLabel="Watch: Add a grant"
                            triggerVariant="outline"
                          />
                          {canEdit ? <ExploreSampleDataCta /> : null}
                        </>
                      }
                    />
                  )
                }
              />
              {grantsTotal > 0 ? (
                <GrantsPagination
                  page={page}
                  pageSize={GRANTS_PAGE_SIZE}
                  total={grantsTotal}
                  onPageChange={handleGrantsPageChange}
                  testId="grants-pagination"
                />
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={confirmDeleteSegmentId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteSegmentId(null);
        }}
        title={`Delete saved view '${segmentToDeleteGrants?.name ?? ""}'?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteSegmentId) {
            deleteSegment(confirmDeleteSegmentId);
            setConfirmDeleteSegmentId(null);
          }
        }}
      />
    </div>
  );
}

function OpportunityCard({
  opportunity,
  canEdit,
  opportunityMutations,
}: {
  opportunity: OpportunityRow;
  canEdit: boolean;
  opportunityMutations: ReturnType<typeof useGrantOpportunityMutations>;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const runOpportunityAction = (run: (handlers: { onError: (error: unknown) => void }) => void) => {
    setActionError(null);
    run({
      onError: (error) =>
        setActionError(error instanceof Error ? error.message : "Unable to complete this action."),
    });
  };
  const sourceLabel = opportunity.sourceType
    ? formatGrantSourceTypeLabel(opportunity.sourceType)
    : "Federal";
  const sourceName = opportunity.sourceName ?? opportunity.agencyName ?? "Grants.gov";
  const sourceDetail = [sourceName, opportunity.opportunityNumber].filter(Boolean).join(" - ");
  const officialUrl = getSafeExternalUrl(opportunity.officialUrl);

  return (
    <div className="rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{sourceLabel}</Badge>
            {opportunity.funderType ? (
              <Badge variant="outline">{formatFunderTypeLabel(opportunity.funderType)}</Badge>
            ) : null}
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-foreground">{opportunity.title}</h3>
            <p className="text-muted-foreground">{sourceDetail}</p>
            <p className="text-muted-foreground">
              {opportunity.closeDate
                ? `Due ${formatUtcCalendarDate(opportunity.closeDate)}`
                : "No deadline listed"}
              {opportunity.awardCeilingCents
                ? ` - Up to ${formatCurrency(opportunity.awardCeilingCents)}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {officialUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  captureEvent("grant_opportunity_apply_clicked", {
                    ...(opportunity.funderType ? { funder_type: opportunity.funderType } : {}),
                    source_type: opportunity.sourceType ?? "federal",
                    surface: "opportunity_card",
                  });
                }}
              >
                <ExternalLinkIcon className="mr-2 size-4" />
                Apply
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  runOpportunityAction((handlers) =>
                    opportunityMutations.saveOpportunity.mutate(
                      { opportunityId: opportunity.id, data: {} },
                      handlers,
                    ),
                  )
                }
              >
                Save
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  runOpportunityAction((handlers) =>
                    opportunityMutations.convertOpportunity.mutate(
                      { opportunityId: opportunity.id, status: "application" },
                      handlers,
                    ),
                  )
                }
              >
                Add to pipeline
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action" className="mt-3">
          <p>{actionError}</p>
        </Alert>
      ) : null}
    </div>
  );
}

function getSafeExternalUrl(value: string | undefined | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
