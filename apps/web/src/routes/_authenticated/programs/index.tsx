import React, { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  programCreateSchema,
  PROGRAM_STATUSES,
  getEffectivePlanTier,
  getPlanEntitlements,
  hasProgramReportExport,
  type ProgramStatus,
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FilterBar,
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
} from "@grantpipe/ui";
import { Shapes } from "lucide-react";
import { z } from "zod";
import { useOrgBilling, useOrgTeam } from "../../../hooks/use-org-settings";
import {
  useCreateProgram,
  useExportProgramBudgetVsActual,
  useProgramBudgetVsActual,
  usePrograms,
} from "../../../hooks/use-programs";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { formatCurrency } from "../../../lib/format";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { fundsTabs } from "../../../config/page-tabs";
import { captureRecordFilterChanged } from "../../../lib/record-discovery-analytics";

const PROGRAMS_PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/programs/")({
  validateSearch: z.object({
    search: z.string().optional(),
    status: z.enum(PROGRAM_STATUSES).optional(),
    page: z.number().int().positive().optional(),
  }),
  component: ProgramsPage,
});

interface ProgramsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function ProgramsPagination({ page, pageSize, total, onPageChange }: ProgramsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div data-testid="programs-pagination" className="flex items-center justify-between pt-4">
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

type ProgramRouteSearch = {
  search?: string;
  status?: ProgramStatus;
  page?: number;
};

type ProgramRow = {
  id: string;
  name: string;
  code?: string | null;
  status?: string | null;
};

type BudgetVsActualRow = {
  programId: string;
  category: string;
  budgetedCents: number;
  actualCents: number;
  remainingCents: number;
};

type BudgetColumn = DataTableProps<BudgetVsActualRow, unknown>["columns"][number];

const PROGRAMS_ERROR_TITLE = "Unable to load programs.";

function buildProgramsRouteSearch(filters: {
  search: string;
  status: ProgramStatus | "";
  page?: number;
}): ProgramRouteSearch {
  return {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.page && filters.page > 1 ? { page: filters.page } : {}),
  };
}

function formatStatus(value: string | null | undefined) {
  const normalized = value?.trim() || "active";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProgramsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch();
  const { memberRole, memberPermissions } = useSession();
  const billingQuery = useOrgBilling();
  const planTier = getEffectivePlanTier({
    planTier: billingQuery.data?.planTier,
    subscriptionStatus: billingQuery.data?.status,
    trialEndsAt: billingQuery.data?.trialEndsAt,
  });
  const entitlements = getPlanEntitlements(planTier);
  const canEdit =
    entitlements.canManagePrograms &&
    canAccessFeature(memberRole, memberPermissions, "programs", "edit");
  const canExport = hasProgramReportExport(planTier);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    code: string;
    description: string;
    status: ProgramStatus;
    ownerUserId: string;
  }>({
    name: "",
    code: "",
    description: "",
    status: "active",
    ownerUserId: "",
  });
  const page = routeSearch.page ?? 1;
  const filters: { search: string; status: ProgramStatus | "" } = {
    search: routeSearch.search ?? "",
    status: (routeSearch.status as ProgramStatus | undefined) ?? "",
  };
  const currentYear = new Date().getUTCFullYear();
  const reportParams = {
    periodStart: `${currentYear}-01-01`,
    periodEnd: `${currentYear}-12-31`,
  };
  const orgTeamQuery = useOrgTeam();
  const programsQuery = usePrograms({
    page,
    pageSize: PROGRAMS_PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  });
  const reportQuery = useProgramBudgetVsActual(reportParams);
  const createProgram = useCreateProgram();
  const exportReport = useExportProgramBudgetVsActual();
  const programs = (programsQuery.data?.data ?? []) as ProgramRow[];
  const programsTotal = (programsQuery.data?.total ?? 0) as number;
  const reportRows = (reportQuery.data?.rows ?? []) as BudgetVsActualRow[];
  const hasNoProgramsYet =
    !filters.search &&
    !filters.status &&
    !programsQuery.isLoading &&
    !programsQuery.isError &&
    programs.length === 0;
  // Hide the FilterBar in the true-empty state (no programs and no active filter);
  // show it as soon as there are records or an active filter to clear.
  const hasProgramListChrome = programs.length > 0 || !!(filters.search || filters.status);

  function handleProgramSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextSearch = event.target.value;
    captureRecordFilterChanged("programs", "search", {
      search: nextSearch,
      status: filters.status,
    });
    syncFilters({ ...filters, search: nextSearch });
  }

  function handleProgramStatusChange(value: string) {
    const nextStatus = value === "all" ? "" : (value as ProgramStatus);
    captureRecordFilterChanged("programs", "status", {
      search: filters.search,
      status: nextStatus,
    });
    syncFilters({ ...filters, status: nextStatus });
  }

  function syncFilters(next: { search: string; status: ProgramStatus | "" }) {
    void navigate({ to: ".", search: buildProgramsRouteSearch(next), replace: true });
  }

  function handlePageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: buildProgramsRouteSearch({ ...filters, page: nextPage }),
      replace: false,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createProgram.isPending) {
      return;
    }
    setOpen(nextOpen);
    setFormError(null);
    if (!nextOpen) {
      setFormData({ name: "", code: "", description: "", status: "active", ownerUserId: "" });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = programCreateSchema.safeParse({
      name: formData.name.trim(),
      code: formData.code.trim() || undefined,
      description: formData.description.trim() || undefined,
      status: formData.status,
      ownerUserId: formData.ownerUserId || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]!.message);
      return;
    }
    try {
      await createProgram.mutateAsync(parsed.data);
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add program.");
    }
  }

  const budgetColumns = useMemo<BudgetColumn[]>(
    () => [
      { id: "programId", accessorKey: "programId", header: "Program" },
      { id: "category", accessorKey: "category", header: "Category" },
      {
        id: "budgeted",
        accessorKey: "budgetedCents",
        header: "Budget",
        sortingFn: numericSortingFn,
        cell: ({ row }) => formatCurrency(row.original.budgetedCents),
      },
      {
        id: "actual",
        accessorKey: "actualCents",
        header: "Actual",
        sortingFn: numericSortingFn,
        cell: ({ row }) => formatCurrency(row.original.actualCents),
      },
      {
        id: "remaining",
        accessorKey: "remainingCents",
        header: "Remaining",
        sortingFn: numericSortingFn,
        cell: ({ row }) => formatCurrency(row.original.remainingCents),
      },
    ],
    [],
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button>Add program</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add program</DialogTitle>
              <DialogDescription>
                Group grants, expenses, and budgets by mission area.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError ? (
                <Alert variant="destructive" title="Unable to add program">
                  {formError}
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="program-name">
                  Program name <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="program-name"
                  placeholder="Program name"
                  value={formData.name}
                  required
                  aria-required="true"
                  disabled={createProgram.isPending}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="program-code">Code</Label>
                <Input
                  id="program-code"
                  placeholder="HEALTH"
                  value={formData.code}
                  disabled={createProgram.isPending}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, code: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="program-description">Description</Label>
                <Textarea
                  id="program-description"
                  placeholder="What does this program track?"
                  value={formData.description}
                  disabled={createProgram.isPending}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="program-owner">Owner</Label>
                <Select
                  value={formData.ownerUserId}
                  onValueChange={(next) =>
                    setFormData((current) => ({ ...current, ownerUserId: next }))
                  }
                >
                  <SelectTrigger id="program-owner" aria-label="Owner">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {(orgTeamQuery.data ?? [])
                      .filter(
                        (
                          member,
                        ): member is typeof member & {
                          user: { id: string };
                        } => !!member.user?.id,
                      )
                      .map((member) => (
                        <SelectItem key={member.user.id} value={member.user.id}>
                          {member.user.name ?? member.user.email ?? member.user.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="program-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(next) =>
                    setFormData((current) => ({
                      ...current,
                      status: next as ProgramStatus,
                    }))
                  }
                >
                  <SelectTrigger id="program-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_STATUSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createProgram.isPending || formData.name.trim().length === 0}
              >
                {createProgram.isPending ? "Adding…" : "Add"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      <Button
        variant="outline"
        disabled={!canExport || exportReport.isPending}
        onClick={() => {
          setExportError(null);
          void exportReport.mutateAsync(reportParams).catch((error) => {
            setExportError(error instanceof Error ? error.message : "Unable to export the report.");
          });
        }}
      >
        Export budget vs actual
      </Button>
      {!canExport ? (
        <span className="text-sm text-muted-foreground">
          CSV export is on Growth and above.{" "}
          <Link to="/settings" hash="billing" className="font-medium text-primary hover:underline">
            Go to Billing.
          </Link>
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Programs"
        help="Group grants, funds, and expenses by program. Each program tracks its budget, spending, and report due dates."
        actions={headerActions}
      />

      <AppPageTabs groupId="funds" items={fundsTabs} />

      {hasProgramListChrome ? (
        <FilterBar>
          <Input
            aria-label="Search programs"
            placeholder="Search programs…"
            value={filters.search}
            onChange={handleProgramSearchChange}
          />
          <Select value={filters.status || "all"} onValueChange={handleProgramStatusChange}>
            <SelectTrigger aria-label="Filter program status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>
      ) : null}

      {programsQuery.isError ? (
        <Alert variant="destructive" title={PROGRAMS_ERROR_TITLE}>
          Refresh the page or try again in a moment.
        </Alert>
      ) : programsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        filters.search || filters.status ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No programs match these filters.
          </p>
        ) : (
          <TeachAndActEmptyState
            icon={<Shapes className="size-5" />}
            heading="Your programs live here"
            description="Group your spending by program. Track budget against actual costs."
            primaryAction={
              canEdit
                ? { label: "Add your first program", onClick: () => handleOpenChange(true) }
                : { label: "Open help", href: "/help" }
            }
            helpLink={{ label: "How programs work", href: "/help" }}
          />
        )
      ) : (
        <>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="programs-card-grid"
          >
            {programs.map((program) => (
              <Link
                key={program.id}
                to="/programs/$programId"
                params={{ programId: program.id }}
                className="group rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="program-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-semibold group-hover:text-primary">
                    {program.name}
                  </span>
                  <Badge variant="outline">{formatStatus(program.status)}</Badge>
                </div>
                {program.code ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{program.code}</p>
                ) : null}
              </Link>
            ))}
          </div>
          {!programsQuery.isError && programsTotal > 0 ? (
            <ProgramsPagination
              page={page}
              pageSize={PROGRAMS_PAGE_SIZE}
              total={programsTotal}
              onPageChange={handlePageChange}
            />
          ) : null}
        </>
      )}

      {hasNoProgramsYet ? null : (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Budget vs actual</h2>
            <p className="text-sm text-muted-foreground">
              Budget vs. actual spending for each program this year.
            </p>
          </div>
          {exportError ? (
            <Alert variant="destructive" title="Unable to complete the export">
              {exportError}
            </Alert>
          ) : null}
          {reportQuery.isError ? (
            <Alert variant="destructive" title="Unable to load program report">
              Refresh the page or try again in a moment.
            </Alert>
          ) : (
            <DataTable<BudgetVsActualRow, unknown>
              columns={budgetColumns}
              data={reportRows}
              isLoading={reportQuery.isLoading}
              emptyState={
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No program budget or actual rows for this period.
                </p>
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
