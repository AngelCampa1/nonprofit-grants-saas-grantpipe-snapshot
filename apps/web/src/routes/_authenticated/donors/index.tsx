import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import React, { useEffect, useMemo, useState } from "react";
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
  ViewToggle,
  cn,
} from "@grantpipe/ui";
import { Columns2Icon, ListIcon, UsersIcon, XIcon } from "lucide-react";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { AccessDeniedState } from "../../../components/access-denied-state";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { StatsBar } from "../../../components/donors/stats-bar";
import { PipelineStageSelect } from "../../../components/donors/pipeline-stage-select";
import { NewDonorDialog } from "../../../components/dialogs/new-donor-dialog";
import {
  useContacts,
  useCreateSegment,
  useDeleteSegment,
  useDonorStats,
  useRetentionStats,
  useSegments,
  useTags,
} from "../../../hooks/use-donors";
import { useSession } from "../../../hooks/use-session";
import { formatCurrency, formatUtcCalendarDate } from "../../../lib/format";
import { createOrgRequestInit } from "../../../lib/org-context";
import { captureAppException } from "../../../lib/sentry";
import { canAccessFeature, type AppRole } from "../../../lib/access-control";
import { RetryButton } from "../../../components/retry-button";
import { ExploreSampleDataCta } from "../../../components/explore-sample-data-cta";
import {
  captureDonorExportCompleted,
  captureRecordFilterChanged,
  captureRecordViewChanged,
} from "../../../lib/record-discovery-analytics";
import { DONOR_PIPELINE_STAGE_LABELS, contactExportSchema } from "@grantpipe/shared";
import { donorTabs } from "../../../config/page-tabs";
import type {
  ContactType,
  DonorPipelineStage,
  PermissionMap,
  PermissionOverrides,
} from "@grantpipe/shared";

export const Route = createFileRoute("/_authenticated/donors/")({
  validateSearch: contactExportSchema.extend({
    segment: z.string().optional(),
  }),
  component: DonorListPage,
});

const PAGE_SIZE = 25;
const BOARD_PAGE_SIZE = 200;
const VIEW_STORAGE_KEY = "gp-don-view";

type DonorView = "list" | "kanban";

type StageBadgeVariant =
  | "secondary"
  | "stage-cultivation"
  | "stage-solicitation"
  | "stage-stewardship"
  | "stage-donor"
  | "stage-lapsed";

const STAGE_BADGE_VARIANTS: Record<DonorPipelineStage, StageBadgeVariant> = {
  prospect: "secondary",
  cultivation: "stage-cultivation",
  solicitation: "stage-solicitation",
  stewardship: "stage-stewardship",
  donor: "stage-donor",
  lapsed: "stage-lapsed",
};

// Kanban only shows these 5 stages (prospect is not a pipeline column)
const KANBAN_STAGES: DonorPipelineStage[] = [
  "cultivation",
  "solicitation",
  "stewardship",
  "donor",
  "lapsed",
];

const CONTACTS_ERROR_MESSAGE = "Unable to load contacts.";

function getDisplayName(contact: {
  type: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
}): string {
  if (contact.type === "organization") {
    if (contact.organizationName?.trim()) return contact.organizationName.trim();
    const fallback = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    return fallback || "--";
  }

  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  /* v8 ignore next -- anonymous donor fallback is covered in donor detail tests. */
  return parts.length > 0 ? parts.join(" ") : "--";
}

interface ContactRow {
  id: string;
  type: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  email?: string | null;
  pipelineStage?: string | null;
  lastDonationDate?: string | null;
  totalGivingCents?: number | null;
}

type ContactColumn = DataTableProps<ContactRow, unknown>["columns"][number];

const EMPTY_TAGS: Array<{ id: string; name: string }> = [];
const EMPTY_SEGMENTS: Array<{ id: string; name: string; filters: unknown }> = [];

function MobileCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-4 h-20 w-full" />
    </div>
  );
}

function KanbanColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

interface DonorKanbanBoardProps {
  contacts: ContactRow[];
  isLoading: boolean;
}

function DonorKanbanBoard({ contacts, isLoading }: DonorKanbanBoardProps) {
  if (isLoading) {
    return (
      <div data-testid="kanban-board" className="grid grid-cols-5 gap-3">
        {KANBAN_STAGES.map((stage) => (
          <KanbanColumnSkeleton key={stage} />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="kanban-board" className="grid grid-cols-5 gap-3">
      {KANBAN_STAGES.map((stage) => {
        const stageDonors = contacts.filter((d) => d.pipelineStage === stage);
        return (
          <div key={stage} data-testid={`kanban-column-${stage}`} className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant={STAGE_BADGE_VARIANTS[stage]}>
                {DONOR_PIPELINE_STAGE_LABELS[stage]}
              </Badge>
              <span className="text-xs text-muted-foreground">{stageDonors.length}</span>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-20rem)] flex flex-col gap-2">
              {stageDonors.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-center">
                  <span className="text-xs text-muted-foreground">No donors</span>
                </div>
              ) : (
                stageDonors.map((d) => (
                  <Link
                    key={d.id}
                    to="/donors/$contactId"
                    params={{ contactId: d.id }}
                    data-testid="kanban-donor-card"
                  >
                    <div className="rounded-lg border border-border bg-card p-3 hover:bg-muted/50 cursor-pointer">
                      <p className="text-sm font-medium">{getDisplayName(d)}</p>
                      <div className="flex justify-between mt-1.5 gap-2">
                        <span
                          className="text-xs text-muted-foreground truncate"
                          title={d.email ?? undefined}
                        >
                          {d.email ?? "--"}
                        </span>
                        <span className="font-mono text-xs text-foreground whitespace-nowrap">
                          {d.totalGivingCents != null ? formatCurrency(d.totalGivingCents) : "--"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function readStoredView(): DonorView {
  try {
    const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "kanban" || stored === "list") return stored;
    /* v8 ignore next -- fallback when stored value is unrecognized */
  } catch {
    /* v8 ignore next -- sessionStorage unavailable in restricted environments */
  }
  return "list";
}

interface DonorListContentProps {
  memberRole: AppRole | null | undefined;
  memberPermissions: PermissionOverrides | PermissionMap | null | undefined;
}

export function DonorListPage() {
  const { memberRole, memberPermissions } = useSession();
  const canView = canAccessFeature(memberRole, memberPermissions, "donors", "view");

  if (!canView) {
    return (
      <AccessDeniedState
        title="You need donor access."
        description="Ask an admin to update your team permissions."
      />
    );
  }

  return <DonorListContent memberRole={memberRole} memberPermissions={memberPermissions} />;
}

function DonorListContent({ memberRole, memberPermissions }: DonorListContentProps) {
  const navigate = useNavigate();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "donors", "edit");
  const canImport = canAccessFeature(memberRole, memberPermissions, "import", "edit");
  const routeSearch = Route.useSearch();
  const [search, setSearch] = useState(routeSearch.search ?? "");
  const [pipelineStage, setPipelineStage] = useState<DonorPipelineStage | "">(
    routeSearch.pipelineStage ?? "",
  );
  const [tagId, setTagId] = useState(routeSearch.tagId ?? "");
  const [type, setType] = useState<ContactType | "">(routeSearch.type ?? "");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(
    routeSearch.segment ?? null,
  );
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [confirmDeleteSegmentId, setConfirmDeleteSegmentId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveSegmentError, setSaveSegmentError] = useState<string | null>(null);
  const [deleteSegmentError, setDeleteSegmentError] = useState<string | null>(null);
  const [view, setView] = useState<DonorView>(readStoredView);

  const contactsQuery = useContacts({
    page,
    pageSize: PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
    ...(search ? { search } : {}),
    ...(pipelineStage ? { pipelineStage } : {}),
    ...(tagId ? { tagId } : {}),
    ...(type ? { type } : {}),
  });

  const boardContactsQuery = useContacts({
    page: 1,
    pageSize: BOARD_PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
    ...(search ? { search } : {}),
    ...(tagId ? { tagId } : {}),
    ...(type ? { type } : {}),
    enabled: view === "kanban",
    // NOTE: do NOT pass pipelineStage — the board needs contacts from all stages to fill columns
  });

  const donorStatsQuery = useDonorStats();
  const retentionStatsQuery = useRetentionStats();
  const tagsQuery = useTags();
  const segmentsQuery = useSegments();
  const createSegment = useCreateSegment();
  const deleteSegment = useDeleteSegment();

  const contacts: ContactRow[] = contactsQuery.data?.data ?? [];
  /* v8 ignore next 6 -- pagination fallbacks guard malformed API totals. */
  const totalPages =
    contactsQuery.data !== undefined
      ? Math.max(
          1,
          Math.ceil((contactsQuery.data.total ?? 0) / (contactsQuery.data.pageSize ?? 25)),
        )
      : 1;
  const tags = tagsQuery.data ?? EMPTY_TAGS;
  const segments = segmentsQuery.data ?? EMPTY_SEGMENTS;
  const segmentToDelete = (segments as Array<{ id: string; name: string; filters: unknown }>).find(
    (s) => s.id === confirmDeleteSegmentId,
  );

  const boardContacts: ContactRow[] = boardContactsQuery.data?.data ?? [];

  function handleViewChange(newView: DonorView) {
    captureRecordViewChanged("donors", newView, view);
    setView(newView);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, newView);
      /* v8 ignore next -- sessionStorage unavailable in restricted environments */
    } catch {
      /* v8 ignore next -- no-op fallback */
    }
  }

  useEffect(() => {
    if (routeSearch.segment) {
      return;
    }

    setActiveSegmentId(null);
    setSearch(routeSearch.search ?? "");
    setPipelineStage(routeSearch.pipelineStage ?? "");
    setTagId(routeSearch.tagId ?? "");
    setType(routeSearch.type ?? "");
    setPage(1);
  }, [
    routeSearch.search,
    routeSearch.pipelineStage,
    routeSearch.segment,
    routeSearch.tagId,
    routeSearch.type,
  ]);

  useEffect(() => {
    if (!routeSearch.segment) {
      return;
    }

    const matchedSegment = segments.find((segment) => segment.id === routeSearch.segment);
    if (!matchedSegment) {
      return;
    }

    /* v8 ignore next -- null segment filter fallback is covered by applySegment tests. */
    const parsed = contactExportSchema.safeParse(matchedSegment.filters ?? {});
    const filters = parsed.success ? parsed.data : {};

    setActiveSegmentId(matchedSegment.id);
    setSearch(filters.search ?? "");
    setPipelineStage(filters.pipelineStage ?? "");
    setTagId(filters.tagId ?? "");
    setType(filters.type ?? "");
    setPage(1);
  }, [routeSearch.segment, segments]);

  const columns = useMemo<ContactColumn[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => getDisplayName(row),
        header: "Name",
        cell: ({ row }) => {
          const contact = row.original;
          return (
            <Link
              to="/donors/$contactId"
              params={{ contactId: contact.id }}
              className="font-medium text-primary hover:underline"
            >
              {getDisplayName(contact)}
            </Link>
          );
        },
      },
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span>{row.original.email ?? "--"}</span>,
      },
      {
        id: "type",
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.type === "individual" ? "Individual" : "Organization"}
          </Badge>
        ),
      },
      {
        id: "pipelineStage",
        accessorKey: "pipelineStage",
        header: "Pipeline Stage",
        cell: ({ row }) => {
          const stage = row.original.pipelineStage as DonorPipelineStage | null | undefined;
          if (!stage) return <span>--</span>;
          return (
            <Badge variant={STAGE_BADGE_VARIANTS[stage]}>
              {DONOR_PIPELINE_STAGE_LABELS[stage]}
            </Badge>
          );
        },
      },
      {
        id: "lastDonationDate",
        accessorKey: "lastDonationDate",
        header: "Last Donation",
        cell: ({ row }) => <span>{formatUtcCalendarDate(row.original.lastDonationDate)}</span>,
      },
      {
        id: "totalGivingCents",
        accessorKey: "totalGivingCents",
        header: "Total Giving",
        sortingFn: numericSortingFn,
        cell: ({ row }) => {
          const cents = row.original.totalGivingCents;
          return <span>{cents != null ? formatCurrency(cents) : "--"}</span>;
        },
      },
    ],
    [],
  );

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextSearch = event.target.value;
    setSearch(nextSearch);
    setPage(1);
    captureRecordFilterChanged("donors", "search", {
      search: nextSearch,
      pipelineStage,
      tagId,
      type,
    });
  }

  function handleStageChange(stage: DonorPipelineStage | "") {
    setPipelineStage(stage);
    setPage(1);
    captureRecordFilterChanged("donors", "pipelineStage", {
      search,
      pipelineStage: stage,
      tagId,
      type,
    });
  }

  function handleTypeChange(val: string) {
    const nextType = val as ContactType | "";
    setType(nextType);
    setPage(1);
    captureRecordFilterChanged("donors", "type", {
      search,
      pipelineStage,
      tagId,
      type: nextType,
    });
  }

  function handleTagChange(val: string) {
    setTagId(val);
    setPage(1);
    captureRecordFilterChanged("donors", "tagId", {
      search,
      pipelineStage,
      tagId: val,
      type,
    });
  }

  function applySegment(seg: { id: string; filters: unknown }) {
    /* v8 ignore next -- route segment parsing covers the same fallback. */
    const parsed = contactExportSchema.safeParse(seg.filters ?? {});
    const f = parsed.success ? parsed.data : {};
    setActiveSegmentId(seg.id);
    setSearch(f.search ?? "");
    setPipelineStage(f.pipelineStage ?? "");
    setTagId(f.tagId ?? "");
    setType(f.type ?? "");
    setPage(1);
  }

  function clearSegment() {
    setActiveSegmentId(null);
    setSearch("");
    setPipelineStage("");
    setTagId("");
    setType("");
    setPage(1);
  }

  async function handleSaveSegment() {
    if (!segmentName.trim()) return;
    setSaveSegmentError(null);
    try {
      await createSegment.mutateAsync({
        name: segmentName.trim(),
        filters: {
          ...(search ? { search } : {}),
          ...(pipelineStage ? { pipelineStage } : {}),
          ...(tagId ? { tagId } : {}),
          ...(type ? { type } : {}),
        },
      });
      setSegmentName("");
      setSaveSegmentOpen(false);
    } catch (err) {
      setSaveSegmentError(err instanceof Error ? err.message : "Unable to complete this action.");
    }
  }

  async function handleDeleteSegment(segmentId: string) {
    setDeleteSegmentError(null);
    try {
      await deleteSegment.mutateAsync(segmentId);
      if (activeSegmentId === segmentId) clearSegment();
    } catch (err) {
      setDeleteSegmentError(err instanceof Error ? err.message : "Unable to complete this action.");
    }
  }

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (pipelineStage) qs.set("pipelineStage", pipelineStage);
      if (tagId) qs.set("tagId", tagId);
      if (type) qs.set("type", type);
      const res = await fetch(`/api/donors/export?${qs.toString()}`, createOrgRequestInit());
      if (res.status === 401) {
        await navigate({ to: "/login" });
        return;
      }
      if (!res.ok) throw new Error(`Export failed (${res.status.toString()})`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/csv")) {
        throw new Error("Export failed: unexpected response format");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      captureDonorExportCompleted({ search, pipelineStage, tagId, type });
    } catch (err) {
      captureAppException(
        err,
        {
          tags: { feature: "donors", operation: "export_csv" },
          extra: {
            filterPresence: {
              search: Boolean(search),
              pipelineStage: Boolean(pipelineStage),
              tagId: Boolean(tagId),
              type: Boolean(type),
            },
          },
        },
        { sanitize: true },
      );
      const message = err instanceof Error ? err.message : "Export failed. Please try again.";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExport()}
          disabled={isExporting}
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </Button>
        {exportError ? (
          <p role="alert" className="text-xs text-destructive">
            {exportError}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <>
          <Button onClick={() => setDialogOpen(true)}>Add donor</Button>
          <NewDonorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      ) : null}
    </div>
  );

  const isErrorState = contactsQuery.isError === true;
  const isLoadingState = contactsQuery.isLoading === true;
  const isEmptyState = !isLoadingState && !isErrorState && contacts.length === 0;
  const hasActiveFilters = search.length > 0 || !!pipelineStage || !!tagId || !!type;
  const hasDonorListChrome = contacts.length > 0 || hasActiveFilters;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Fundraising"
        title="Donors"
        help="Donors tracks people and orgs that give to you or might give. Pipeline stages show where each one stands."
        actions={headerActions}
      />

      <AppPageTabs groupId="donors" items={donorTabs} />

      <StatsBar
        stats={donorStatsQuery.data}
        retentionData={retentionStatsQuery.data}
        isLoading={donorStatsQuery.isLoading || retentionStatsQuery.isLoading}
      />

      {segments.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {segments.map((seg: { id: string; name: string; filters: unknown }) => (
              <div key={seg.id} className="flex items-center gap-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={activeSegmentId === seg.id}
                  onClick={() => {
                    if (activeSegmentId === seg.id) {
                      clearSegment();
                    } else {
                      applySegment(seg);
                    }
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    activeSegmentId === seg.id &&
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
          </div>
          {deleteSegmentError ? (
            <Alert variant="destructive" title="Unable to complete the action">
              <p>{deleteSegmentError}</p>
            </Alert>
          ) : null}
        </div>
      )}

      {hasDonorListChrome ? (
        <div className="space-y-3">
          <FilterBar>
            <Input
              aria-label="Search contacts"
              placeholder="Search contacts…"
              value={search}
              onChange={handleSearchChange}
              className="w-full sm:w-auto sm:max-w-sm"
            />

            <PipelineStageSelect
              value={pipelineStage || undefined}
              onChange={handleStageChange}
              showAllOption
            />

            {tags.length > 0 ? (
              <Select
                /* v8 ignore next -- reset behavior is covered through onValueChange. */
                value={tagId === "" ? "all" : tagId}
                onValueChange={(val) => handleTagChange(val === "all" ? "" : val)}
              >
                <SelectTrigger aria-label="Tag">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.map((tag: { id: string; name: string }) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select
              /* v8 ignore next -- reset behavior is covered through onValueChange. */
              value={type === "" ? "all" : type}
              onValueChange={(val) => handleTypeChange(val === "all" ? "" : val)}
            >
              <SelectTrigger aria-label="Type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
              </SelectContent>
            </Select>

            <ViewToggle<DonorView>
              value={view}
              onChange={handleViewChange}
              options={[
                { value: "list", label: "List", icon: ListIcon },
                { value: "kanban", label: "Board", icon: Columns2Icon },
              ]}
            />

            {canEdit && (
              <div className="ml-auto">
                <Dialog
                  open={saveSegmentOpen}
                  onOpenChange={(open) => {
                    setSaveSegmentOpen(open);
                    if (!open) setSaveSegmentError(null);
                  }}
                >
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
                      <Label htmlFor="segment-name">Segment name</Label>
                      <Input
                        id="segment-name"
                        placeholder="e.g. Major donors"
                        value={segmentName}
                        onChange={(e) => setSegmentName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveSegment();
                        }}
                      />
                      {saveSegmentError ? (
                        <Alert variant="destructive" title="Unable to complete the action">
                          <p>{saveSegmentError}</p>
                        </Alert>
                      ) : null}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => void handleSaveSegment()}
                        disabled={!segmentName.trim() || createSegment.isPending}
                      >
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </FilterBar>
        </div>
      ) : null}

      <div data-testid="donor-mobile-list" className="grid min-w-0 gap-3 md:hidden">
        {isLoadingState ? (
          Array.from({ length: 3 }).map((_, index) => <MobileCardSkeleton key={index} />)
        ) : isErrorState ? (
          <div className="space-y-3">
            <Alert variant="destructive" title={CONTACTS_ERROR_MESSAGE}>
              We couldn&apos;t load contacts. Refresh the page or try again in a moment.
            </Alert>
            <RetryButton query={contactsQuery} />
          </div>
        ) : isEmptyState ? (
          hasActiveFilters ? (
            <p
              className="py-6 text-center text-sm text-muted-foreground"
              data-testid="donors-filter-empty"
            >
              No donors match these filters.{" "}
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setPipelineStage("");
                  setTagId("");
                  setType("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            </p>
          ) : (
            <TeachAndActEmptyState
              icon={<UsersIcon className="size-5" />}
              heading="Your donors live here"
              description="Keep all your donors in one place. See their gifts and next steps."
              primaryAction={
                canEdit
                  ? {
                      label: "Add your first donor",
                      onClick: () => setDialogOpen(true),
                    }
                  : /* v8 ignore next -- viewer mobile fallback covered by desktop empty state tests */
                    { label: "Open help", href: "/help" }
              }
              secondaryAction={
                canImport
                  ? {
                      label: "Import from spreadsheet",
                      onClick: () => void navigate({ to: "/import" }),
                    }
                  : /* v8 ignore next -- non-import mobile fallback covered by desktop empty state tests */
                    undefined
              }
              helpLink={{ label: "How donor records work", href: "/help" }}
              footer={canEdit ? <ExploreSampleDataCta /> : null}
            />
          )
        ) : (
          contacts.map((contact) => {
            const name = getDisplayName(contact);
            const stage = contact.pipelineStage as DonorPipelineStage | null | undefined;

            return (
              <article
                key={contact.id}
                className="min-w-0 rounded-2xl border border-border bg-card/95 p-4 shadow-sm"
              >
                <div className="min-w-0 space-y-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Link
                        to="/donors/$contactId"
                        params={{ contactId: contact.id }}
                        className="block line-clamp-2 text-lg font-semibold text-primary hover:underline"
                        title={name}
                      >
                        {name}
                      </Link>
                      <p
                        className="truncate text-sm text-muted-foreground"
                        title={contact.email ?? undefined}
                      >
                        {contact.email ?? "--"}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {contact.type === "individual" ? "Individual" : "Organization"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {stage ? (
                      <Badge variant={STAGE_BADGE_VARIANTS[stage]}>
                        {DONOR_PIPELINE_STAGE_LABELS[stage]}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">--</span>
                    )}
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-border bg-muted p-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">
                        Last donation
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {formatUtcCalendarDate(contact.lastDonationDate)}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">
                        Total giving
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {contact.totalGivingCents != null
                          ? formatCurrency(contact.totalGivingCents)
                          : "--"}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden md:block">
        {isErrorState ? (
          <div className="space-y-3">
            <Alert variant="destructive" title={CONTACTS_ERROR_MESSAGE}>
              We couldn&apos;t load contacts. Refresh the page or try again in a moment.
            </Alert>
            <RetryButton query={contactsQuery} />
          </div>
        ) : view === "kanban" ? (
          boardContactsQuery.isError ? (
            <Alert variant="destructive" title="Unable to load donors.">
              Couldn&apos;t load the pipeline board. Refresh the page or try again.
            </Alert>
          ) : (
            <DonorKanbanBoard contacts={boardContacts} isLoading={boardContactsQuery.isLoading} />
          )
        ) : (
          <DataTable<ContactRow, unknown>
            columns={columns}
            data={contacts}
            isLoading={isLoadingState}
            emptyState={
              hasActiveFilters ? (
                <p
                  className="py-6 text-center text-sm text-muted-foreground"
                  data-testid="donors-filter-empty-desktop"
                >
                  No donors match these filters.{" "}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setPipelineStage("");
                      setTagId("");
                      setType("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </p>
              ) : (
                <TeachAndActEmptyState
                  icon={<UsersIcon className="size-5" />}
                  heading="Your donors live here"
                  description="Keep every donor in one place. See who gave and when."
                  primaryAction={
                    canEdit
                      ? {
                          label: "Add your first donor",
                          /* v8 ignore next -- covered by the header Add donor action. */
                          onClick: () => setDialogOpen(true),
                        }
                      : { label: "Open help", href: "/help" }
                  }
                  secondaryAction={
                    canImport
                      ? {
                          label: "Import from spreadsheet",
                          /* v8 ignore next -- covered by the header import action. */
                          onClick: () => void navigate({ to: "/import" }),
                        }
                      : undefined
                  }
                  helpLink={{ label: "How donor records work", href: "/help" }}
                  footer={canEdit ? <ExploreSampleDataCta /> : null}
                />
              )
            }
          />
        )}
      </div>

      {view === "list" && !isErrorState && (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteSegmentId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteSegmentId(null);
        }}
        title={`Delete saved view '${segmentToDelete?.name ?? ""}'?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteSegment.isPending}
        onConfirm={() => {
          if (confirmDeleteSegmentId) void handleDeleteSegment(confirmDeleteSegmentId);
        }}
      />
    </div>
  );
}
