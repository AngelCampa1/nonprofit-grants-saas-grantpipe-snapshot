import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

type EventsRouteSearch = { q?: string; page?: number };

const hoisted = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let routeSearch: EventsRouteSearch = {};

  function getRouteSearch() {
    return routeSearch;
  }

  function subscribeRouteSearch(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function setRouteSearch(next: EventsRouteSearch) {
    routeSearch = next;
    for (const fn of listeners) fn();
  }

  return {
    getRouteSearch,
    subscribeRouteSearch,
    setRouteSearch,
    mockUseEvents: vi.fn(),
    mockCreateEventMutateAsync: vi.fn(),
    mockUseSession: vi.fn(),
    mockNavigate: vi.fn((opts?: { search?: EventsRouteSearch }) => {
      if (opts?.search !== undefined) {
        setRouteSearch(opts.search);
      }
    }),
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useSearch: () =>
      React.useSyncExternalStore(
        hoisted.subscribeRouteSearch,
        hoisted.getRouteSearch,
        hoisted.getRouteSearch,
      ),
  }),
  useNavigate: () => hoisted.mockNavigate,
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    let href = to;
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        href = href.replace(`$${key}`, value);
      });
    }

    return React.createElement("a", { href, className }, children);
  },
}));

vi.mock("../../../hooks/use-events", () => ({
  useEvents: (...args: unknown[]) => hoisted.mockUseEvents(...args),
  useCreateEvent: () => ({ mutateAsync: hoisted.mockCreateEventMutateAsync, isPending: false }),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../../components/dialogs/new-event-dialog", () => ({
  NewEventDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "new-event-dialog" },
          React.createElement(
            "button",
            { type: "button", onClick: () => onOpenChange(false) },
            "Close New Event",
          ),
        )
      : null,
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Select: ({
      children,
      value = "",
      onValueChange = () => {},
      disabled = false,
    }: {
      children?: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
    }) => (
      <SelectCtx.Provider value={{ value, onValueChange, disabled }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({
      id,
      "aria-label": ariaLabel,
      children: _children,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const { value, onValueChange, disabled } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (!disabled) onValueChange(e.target.value);
          }}
        />
      );
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
      <div role="option" data-value={value}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

import { EventsListPage } from "./index";

describe("EventsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setRouteSearch({});
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockCreateEventMutateAsync.mockResolvedValue({ id: "event-1" });
    hoisted.mockNavigate.mockImplementation((opts?: { search?: EventsRouteSearch }) => {
      if (opts?.search !== undefined) {
        hoisted.setRouteSearch(opts.search);
      }
    });
  });

  it("renders the PageHeader primitive with kicker and actions", () => {
    const { container } = render(<EventsListPage />);

    const heading = screen.getByRole("heading", { name: "Events" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header-kicker']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Event workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add event" })).toBeInTheDocument();
  });

  it("renders DataTable skeleton rows while events are loading", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Your events live here")).not.toBeInTheDocument();
  });

  it("renders a destructive Alert when the events query errors", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<EventsListPage />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(screen.getByText("Unable to load events.")).toBeInTheDocument();
    expect(screen.queryByText("Your events live here")).not.toBeInTheDocument();
  });

  it("renders TeachAndActEmptyState when no events and no filters active", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.getByRole("region", { name: "Your events live here" })).toBeInTheDocument();
    expect(screen.getByText("Your events live here")).toBeInTheDocument();
    expect(
      screen.getByText("Plan your fundraisers and meetups. See what is coming up next."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first event" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /How events work/ })).toBeInTheDocument();
  });

  it("primary action opens the new event dialog", async () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.queryByTestId("new-event-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add your first event" }));

    await waitFor(() => {
      expect(screen.getByTestId("new-event-dialog")).toBeInTheDocument();
    });
  });

  it("renders filter-active empty state when search is active and no events found", async () => {
    hoisted.setRouteSearch({ q: "nonexistent" });
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    await waitFor(() => {
      expect(screen.getByTestId("events-filter-empty")).toBeInTheDocument();
      expect(screen.getByText(/No events match these filters/)).toBeInTheDocument();
    });
  });

  it("Clear filters button resets filter state via URL navigation", async () => {
    hoisted.setRouteSearch({ q: "nonexistent" });
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Clear filters")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear filters"));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search events…")).toBeNull();
      expect(screen.getByRole("region", { name: "Your events live here" })).toBeInTheDocument();
    });
  });

  it("hides filter chrome when no events and no active filter (true-empty state)", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.queryByPlaceholderText("Search events…")).toBeNull();
    expect(screen.getByRole("region", { name: "Your events live here" })).toBeInTheDocument();
  });

  it("renders populated event rows with detail links and badges", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [
          { id: "evt-1", name: "Annual Gala", type: "gala" },
          { id: "evt-2", name: "Summer Fundraiser", type: "fundraiser" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    expect(container.querySelector("[data-testid='events-card-grid']")).toBeInTheDocument();
    expect(screen.getByText("Annual Gala")).toBeInTheDocument();
    expect(screen.getByText("Summer Fundraiser")).toBeInTheDocument();
    // "Gala" appears both as a badge and as a <select> option — use getAllByText
    expect(screen.getAllByText("Gala").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Fundraiser").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("No events found.")).not.toBeInTheDocument();

    const galaLink = screen.getByRole("link", { name: /Annual Gala/ });
    expect(galaLink).toHaveAttribute("href", "/events/evt-1");
  });

  it("opens the new event dialog when Add event is clicked", async () => {
    render(<EventsListPage />);

    expect(screen.queryByTestId("new-event-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => {
      expect(screen.getByTestId("new-event-dialog")).toBeInTheDocument();
    });
  });

  it("closes the new event dialog when dialog requests close", async () => {
    render(<EventsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => {
      expect(screen.getByTestId("new-event-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close New Event" }));

    await waitFor(() => {
      expect(screen.queryByTestId("new-event-dialog")).not.toBeInTheDocument();
    });
  });

  it("drives the events query when the search term changes", async () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: { data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }] },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search events…"), {
      target: { value: "gala" },
    });

    await waitFor(() => {
      expect(hoisted.mockUseEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "gala",
        }),
      );
    });
  });

  it("shows Add event button for admin role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    render(<EventsListPage />);
    expect(screen.getByRole("button", { name: "Add event" })).toBeInTheDocument();
  });

  it("shows Add event button for editor role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
    render(<EventsListPage />);
    expect(screen.getByRole("button", { name: "Add event" })).toBeInTheDocument();
  });

  it("hides Add event button for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    render(<EventsListPage />);
    expect(screen.queryByRole("button", { name: "Add event" })).not.toBeInTheDocument();
  });

  it("blocks the events page when explicit permissions remove access", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "editor",
      memberPermissions: { events: "none" },
      isLoading: false,
    });

    render(<EventsListPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add event" })).not.toBeInTheDocument();
    expect(hoisted.mockUseEvents).not.toHaveBeenCalled();
  });

  it("renders event card grid", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [
          { id: "evt-1", name: "Annual Gala", type: "gala" },
          { id: "evt-2", name: "Summer Fundraiser", type: "fundraiser" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    expect(container.querySelector("[data-testid='events-card-grid']")).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeInTheDocument();
    expect(screen.getByText("Annual Gala")).toBeInTheDocument();
    expect(screen.getByText("Summer Fundraiser")).toBeInTheDocument();
  });

  it("each event card has colored accent bar", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    const grid = container.querySelector("[data-testid='events-card-grid']");
    expect(grid).toBeInTheDocument();
    // The accent bar is a div with h-1.5 class
    const accentBar = grid?.querySelector(".h-1\\.5");
    expect(accentBar).toBeInTheDocument();
  });

  it("each event card links to event detail", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-99", name: "Community Fair", type: "other" }],
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    const link = screen.getByRole("link", { name: /Community Fair/ });
    expect(link).toHaveAttribute("href", "/events/evt-99");
  });

  it("shows loading skeleton", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });

  it("keeps auditors blocked even when explicit permissions grant events", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "auditor",
      memberPermissions: { events: "manage" },
      isLoading: false,
    });

    render(<EventsListPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(hoisted.mockUseEvents).not.toHaveBeenCalled();
  });

  it("does not render pagination when total fits on one page", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.queryByTestId("events-pagination")).not.toBeInTheDocument();
  });

  it("renders pagination when total exceeds page size and Next updates the route", async () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.getByTestId("events-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: expect.objectContaining({ page: 2 }) }),
      );
    });
  });

  it("disables Next on the last page", () => {
    hoisted.setRouteSearch({ page: 2 });
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 26,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("clicking Previous on page 2 navigates back to page 1", async () => {
    hoisted.setRouteSearch({ page: 2 });
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: false,
          search: expect.objectContaining({ page: 1 }),
        }),
      );
    });
  });

  it("uses fallback accent class for unknown event type", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-99", name: "Mystery Event", type: "unknown_type" }],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<EventsListPage />);

    const grid = container.querySelector("[data-testid='events-card-grid']");
    expect(grid).toBeInTheDocument();
    // The fallback accent class bg-border should be applied
    const accentBar = grid?.querySelector(".h-1\\.5");
    expect(accentBar).toBeInTheDocument();
    expect(accentBar?.className).toContain("bg-border");
  });

  it("preserves active search in URL when paginating forward", async () => {
    hoisted.setRouteSearch({ q: "gala", page: 1 });
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: false,
          search: expect.objectContaining({ q: "gala", page: 2 }),
        }),
      );
    });
  });

  it("resets page to 1 (drops page from URL) when search is typed while on a later page", async () => {
    hoisted.setRouteSearch({ page: 5 });
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "evt-1", name: "Annual Gala", type: "gala" }],
        total: 200,
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search events…"), {
      target: { value: "gala" },
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.not.objectContaining({ page: 5 }),
          replace: true,
        }),
      );
    });

    // The navigate call should have page undefined (dropped) — not page: 5
    const call = hoisted.mockNavigate.mock.calls.find(
      (args) =>
        args[0] &&
        typeof args[0] === "object" &&
        "search" in args[0] &&
        "replace" in args[0] &&
        args[0].replace === true,
    );
    expect(call).toBeDefined();
    expect((call![0] as { search: EventsRouteSearch }).search.page).toBeUndefined();
  });

  it("search input has an accessible name", () => {
    hoisted.mockUseEvents.mockReturnValue({
      data: {
        data: [
          {
            id: "event-1",
            name: "Annual Gala",
            date: "2025-06-01",
            status: "upcoming",
            type: "gala",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EventsListPage />);

    expect(screen.getByRole("textbox", { name: /search events/i })).toBeInTheDocument();
  });

  it("shows a Retry button when the events query errors and clicking it calls refetch", () => {
    const mockRefetch = vi.fn();
    hoisted.mockUseEvents.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    render(<EventsListPage />);

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
