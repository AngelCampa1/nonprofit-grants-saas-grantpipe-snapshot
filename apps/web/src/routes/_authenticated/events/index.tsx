import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  Alert,
  Badge,
  Button,
  FilterBar,
  Input,
  PageHeader,
  Skeleton,
  TeachAndActEmptyState,
  cn,
} from "@grantpipe/ui";
import { CalendarDaysIcon } from "lucide-react";
import { AccessDeniedState } from "../../../components/access-denied-state";
import { RetryButton } from "../../../components/retry-button";
import { NewEventDialog } from "../../../components/dialogs/new-event-dialog";
import { useEvents } from "../../../hooks/use-events";
import { useSession } from "../../../hooks/use-session";
import { canAccessEvents, canAccessFeature, type AppRole } from "../../../lib/access-control";
import { formatEventTypeLabel } from "../../../lib/format";

const EVENTS_PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/events/")({
  validateSearch: z.object({
    q: z.string().optional(),
    page: z.number().int().positive().optional(),
  }),
  component: EventsListPage,
});

interface EventsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function EventsPagination({ page, pageSize, total, onPageChange }: EventsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div data-testid="events-pagination" className="flex items-center justify-between pt-4">
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

const EVENTS_ERROR_TITLE = "Unable to load events.";
const EVENTS_ACCESS_DENIED_TITLE = "You need event access.";
const EVENTS_ACCESS_DENIED_DESCRIPTION = "Ask an admin to update your team permissions.";

interface EventRow {
  id: string;
  name: string;
  type: string;
}

const EVENT_TYPE_ACCENTS: Record<string, string> = {
  gala: "bg-primary",
  fundraiser: "bg-warning",
  campaign: "bg-info",
  meeting: "bg-muted-foreground/40",
  other: "bg-border",
};

function EventCard({ event }: { event: EventRow }) {
  const accentClass = EVENT_TYPE_ACCENTS[event.type] ?? "bg-border";
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className={cn("h-1.5 w-full", accentClass)} />
      <div className="p-4">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary">
          {event.name}
        </p>
        <div className="mt-2">
          <Badge variant="outline">{formatEventTypeLabel(event.type)}</Badge>
        </div>
      </div>
    </Link>
  );
}

export function EventsListPage() {
  const { memberRole, memberPermissions } = useSession();

  if (!canAccessEvents(memberRole, memberPermissions)) {
    return (
      <AccessDeniedState
        title={EVENTS_ACCESS_DENIED_TITLE}
        description={EVENTS_ACCESS_DENIED_DESCRIPTION}
      />
    );
  }

  return <EventsListPageContent memberRole={memberRole} memberPermissions={memberPermissions} />;
}

function EventsListPageContent(props: {
  memberRole: AppRole | null | undefined;
  memberPermissions?: Parameters<typeof canAccessFeature>[1];
}) {
  const canEdit = canAccessFeature(props.memberRole, props.memberPermissions, "events", "edit");
  const [newEventOpen, setNewEventOpen] = useState(false);
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch();
  const page = routeSearch.page ?? 1;
  const search = routeSearch.q ?? "";
  const eventsQuery = useEvents({
    page,
    pageSize: EVENTS_PAGE_SIZE,
    sortBy: "date",
    sortOrder: "asc",
    timeframe: "all",
    search,
  });
  const rows: EventRow[] = eventsQuery.data?.data ?? [];
  const eventsTotal = eventsQuery.data?.total ?? 0;

  function syncSearchToRoute(nextQ: string) {
    void navigate({
      to: ".",
      search: { ...(nextQ ? { q: nextQ } : {}), page: undefined },
      replace: true,
    });
  }

  function handlePageChange(nextPage: number) {
    void navigate({
      to: ".",
      search: { ...(search ? { q: search } : {}), page: nextPage },
      replace: false,
    });
  }

  const headerActions = canEdit ? (
    <Button type="button" onClick={() => setNewEventOpen(true)}>
      Add event
    </Button>
  ) : null;

  const isErrorState = eventsQuery.isError === true;
  const isLoadingState = eventsQuery.isLoading === true;
  const hasActiveFilters = search.length > 0;
  const hasEventListChrome = rows.length > 0 || hasActiveFilters;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      {canEdit ? <NewEventDialog open={newEventOpen} onOpenChange={setNewEventOpen} /> : null}

      <PageHeader
        variant="workbench"
        kicker="Event workspace"
        title="Events"
        actions={headerActions}
      />

      {hasEventListChrome ? (
        <div className="space-y-3">
          <FilterBar>
            <Input
              aria-label="Search events"
              placeholder="Search events…"
              value={search}
              onChange={(event) => syncSearchToRoute(event.target.value)}
            />
          </FilterBar>
        </div>
      ) : null}

      {isErrorState ? (
        <div className="space-y-3">
          <Alert variant="destructive" title={EVENTS_ERROR_TITLE}>
            Refresh the page or try again in a moment.
          </Alert>
          <RetryButton query={eventsQuery} />
        </div>
      ) : isLoadingState ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 && hasActiveFilters ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          data-testid="events-filter-empty"
        >
          No events match these filters.{" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 font-medium text-primary underline-offset-4"
            onClick={() => syncSearchToRoute("")}
          >
            Clear filters
          </Button>
        </p>
      ) : rows.length === 0 ? (
        <TeachAndActEmptyState
          icon={<CalendarDaysIcon className="size-5" />}
          heading="Your events live here"
          description="Plan your fundraisers and meetups. See what is coming up next."
          primaryAction={
            canEdit
              ? {
                  label: "Add your first event",
                  onClick: () => setNewEventOpen(true),
                }
              : { label: "Open help", href: "/help" }
          }
          helpLink={{ label: "How events work", href: "/help" }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="events-card-grid">
            {rows.map((row) => (
              <EventCard key={row.id} event={row} />
            ))}
          </div>
          {!eventsQuery.isError && eventsTotal > 0 ? (
            <EventsPagination
              page={page}
              pageSize={EVENTS_PAGE_SIZE}
              total={eventsTotal}
              onPageChange={handlePageChange}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
