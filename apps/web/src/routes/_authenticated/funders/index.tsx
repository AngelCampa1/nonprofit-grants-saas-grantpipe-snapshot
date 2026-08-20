import React, { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { createFunderSchema, type CreateFunderInput, type FunderType } from "@grantpipe/shared";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  cardVariants,
  cn,
} from "@grantpipe/ui";
import { Building2Icon } from "lucide-react";
import { useCreateFunder, useFunders } from "../../../hooks/use-grants";
import { formatFunderTypeLabel } from "../../../lib/format";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { captureRecordFilterChanged } from "../../../lib/record-discovery-analytics";
import { RetryButton } from "../../../components/retry-button";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { grantsTabs } from "../../../config/page-tabs";

const FUNDERS_PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/funders/")({
  validateSearch: z.object({
    q: z.string().optional(),
    type: z.enum(["foundation", "corporate", "government", "other"]).optional(),
    page: z.number().int().positive().optional(),
  }),
  component: FundersListPage,
});

interface FundersPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function FundersPagination({ page, pageSize, total, onPageChange }: FundersPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div data-testid="funders-pagination" className="flex items-center justify-between pt-4">
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

const FUNDERS_ERROR_TITLE = "Unable to load funders.";

interface FunderRow {
  id: string;
  name: string;
  type: string;
}

function FunderCard({ funder }: { funder: FunderRow }) {
  return (
    <Link
      to="/funders/$funderId"
      params={{ funderId: funder.id }}
      className={cn(cardVariants({ variant: "interactive" }), "group block min-w-0 p-5")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            title={funder.name}
            className="line-clamp-2 text-base font-semibold text-foreground group-hover:text-primary"
          >
            {funder.name}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {formatFunderTypeLabel(funder.type)}
        </Badge>
      </div>
    </Link>
  );
}

export function FundersListPage() {
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<CreateFunderInput>({
    name: "",
    type: "foundation",
    website: undefined,
    priorities: undefined,
    notes: undefined,
  });
  const [websiteInput, setWebsiteInput] = useState("");
  const [prioritiesInput, setPrioritiesInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch();
  const page = routeSearch.page ?? 1;
  const search = routeSearch.q ?? "";
  const typeFilter: FunderType | "" = (routeSearch.type as FunderType | undefined) ?? "";
  const fundersQuery = useFunders({
    page,
    pageSize: FUNDERS_PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
    ...(search ? { search } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  });
  const createFunder = useCreateFunder();
  const funders: FunderRow[] = fundersQuery.data?.data ?? [];
  const fundersTotal = fundersQuery.data?.total ?? 0;

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextSearch = event.target.value;
    captureRecordFilterChanged("funders", "search", { search: nextSearch, type: typeFilter });
    syncFiltersToRoute({ search: nextSearch, type: typeFilter });
  }

  function handleTypeFilterChange(val: string) {
    const nextType = val === "all" ? "" : (val as FunderType);
    captureRecordFilterChanged("funders", "type", { search, type: nextType });
    syncFiltersToRoute({ search, type: nextType });
  }

  function syncFiltersToRoute(next: { search: string; type: FunderType | "" }) {
    void navigate({
      to: ".",
      search: {
        ...(next.search ? { q: next.search } : {}),
        ...(next.type ? { type: next.type } : {}),
      },
      replace: true,
    });
  }

  function handlePageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: {
        ...(search ? { q: search } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
        page: nextPage,
      },
      replace: false,
    });
  }

  async function handleCreateFunder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmedWebsite = websiteInput.trim();
    const trimmedPriorities = prioritiesInput.trim();
    const trimmedNotes = notesInput.trim();
    const parsed = createFunderSchema.safeParse({
      ...formData,
      name: formData.name.trim(),
      ...(trimmedWebsite ? { website: trimmedWebsite } : { website: undefined }),
      ...(trimmedPriorities ? { priorities: trimmedPriorities } : { priorities: undefined }),
      ...(trimmedNotes ? { notes: trimmedNotes } : { notes: undefined }),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Unable to add funder.");
      return;
    }

    try {
      await createFunder.mutateAsync(parsed.data);
      setOpen(false);
      resetFunderForm();
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add funder.");
    }
  }

  function resetFunderForm() {
    setFormData({
      name: "",
      type: "foundation",
      website: undefined,
      priorities: undefined,
      notes: undefined,
    });
    setWebsiteInput("");
    setPrioritiesInput("");
    setNotesInput("");
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFormError(null);

    if (!nextOpen) {
      resetFunderForm();
    }
  }

  const headerActions = canEdit ? (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button>Add funder</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add funder</DialogTitle>
          <DialogDescription>
            Add a funder. Track its grants, contacts, and priorities in one place.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={handleCreateFunder}>
          {formError ? (
            <Alert variant="destructive" title="Unable to add funder">
              {formError}
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="funder-name">Funder name</Label>
            <Input
              id="funder-name"
              placeholder="Funder name"
              value={formData.name}
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
                setFormData((current) => ({
                  ...current,
                  type: val as CreateFunderInput["type"],
                }));
              }}
            >
              <SelectTrigger aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="foundation">Foundation</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="funder-website">Website</Label>
            <Input
              id="funder-website"
              type="url"
              placeholder="https://example.org"
              value={websiteInput}
              onChange={(event) => {
                setFormError(null);
                setWebsiteInput(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="funder-priorities">Funding priorities</Label>
            <Textarea
              id="funder-priorities"
              placeholder="Funding priorities, focus areas, or strategic interests"
              value={prioritiesInput}
              onChange={(event) => {
                setFormError(null);
                setPrioritiesInput(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="funder-notes">Notes</Label>
            <Textarea
              id="funder-notes"
              placeholder="Internal notes, contacts, or context"
              value={notesInput}
              onChange={(event) => {
                setFormError(null);
                setNotesInput(event.target.value);
              }}
            />
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createFunder.isPending || formData.name.trim().length === 0}
            >
              {createFunder.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : null;

  const isErrorState = fundersQuery.isError === true;
  const isLoadingState = fundersQuery.isLoading === true;
  const hasActiveFilters = search.length > 0 || !!typeFilter;
  // Hide the FilterBar in the true-empty state (no funders and no active filter);
  // show it as soon as there are records to filter or an active filter to clear.
  const hasFunderListChrome = funders.length > 0 || hasActiveFilters;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Funders"
        actions={headerActions}
      />
      <AppPageTabs groupId="grants" items={grantsTabs} />

      {hasFunderListChrome ? (
        <div className="space-y-3">
          <FilterBar className="items-stretch sm:items-center">
            <Input
              aria-label="Search funders"
              className="sm:w-64"
              placeholder="Search funders…"
              value={search}
              onChange={handleSearchChange}
            />
            <Select
              value={typeFilter === "" ? "all" : typeFilter}
              onValueChange={handleTypeFilterChange}
            >
              <SelectTrigger aria-label="Filter funder type" className="w-full sm:w-fit">
                <SelectValue placeholder="All funder types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All funder types</SelectItem>
                <SelectItem value="foundation">Foundation</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </div>
      ) : null}

      {isErrorState ? (
        <div className="space-y-3">
          <Alert variant="destructive" title={FUNDERS_ERROR_TITLE}>
            Refresh the page or try again in a moment.
          </Alert>
          <RetryButton query={fundersQuery} />
        </div>
      ) : isLoadingState ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : funders.length === 0 && hasActiveFilters ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          data-testid="funders-filter-empty"
        >
          No funders match these filters.{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => syncFiltersToRoute({ search: "", type: "" })}
          >
            Clear filters
          </Button>
        </p>
      ) : funders.length === 0 ? (
        <TeachAndActEmptyState
          icon={<Building2Icon className="size-5" />}
          heading="Your funders live here"
          description="Track who funds your work. See every grant tied to each one."
          primaryAction={
            canEdit
              ? { label: "Add your first funder", onClick: () => handleDialogOpenChange(true) }
              : { label: "Open help", href: "/help" }
          }
          helpLink={{ label: "How funders work", href: "/help" }}
        />
      ) : (
        <>
          <div
            className="grid min-w-0 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="funders-card-grid"
          >
            {funders.map((funder) => (
              <FunderCard key={funder.id} funder={funder} />
            ))}
          </div>
          {!fundersQuery.isError && fundersTotal > 0 ? (
            <FundersPagination
              page={page}
              pageSize={FUNDERS_PAGE_SIZE}
              total={fundersTotal}
              onPageChange={handlePageChange}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
