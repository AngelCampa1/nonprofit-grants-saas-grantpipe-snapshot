import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseOrgActivity = vi.fn();
const mockNavigate = vi.fn();
const mockUseSession = vi.fn();

vi.mock("../../hooks/use-activity", () => ({
  useOrgActivity: (filters: unknown) => mockUseOrgActivity(filters),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
    SelectTrigger: ({
      "aria-label": ariaLabel,
    }: {
      "aria-label"?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          readOnly={false}
        />
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return (
        <span
          role="option"
          aria-selected={false}
          data-slot="select-item"
          onClick={() => onValueChange(value)}
        >
          {children}
        </span>
      );
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: React.ComponentType }) => config,
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) =>
    React.createElement("a", { href: to, ...props }, children),
}));

import { ActivityPage } from "./activity";

describe("ActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
  });

  it("renders the page title", () => {
    mockUseOrgActivity.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("Activity Log")).toBeInTheDocument();
  });

  it("renders the audit trail kicker", () => {
    mockUseOrgActivity.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("Audit trail")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    mockUseOrgActivity.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { container } = render(React.createElement(ActivityPage));

    // Feed renders 3 skeleton divs while loading
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(3);
  });

  it("shows an error alert when the query errors", () => {
    mockUseOrgActivity.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("Unable to load activity.")).toBeInTheDocument();
  });

  it("shows TeachAndActEmptyState with heading and description when no activity entries", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("region", { name: "Activity log" })).toBeInTheDocument();
    expect(screen.getByText("Activity log")).toBeInTheDocument();
    expect(screen.getByText(/Every change your team makes shows up here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to Donors/ })).toBeInTheDocument();
  });

  it("primary action on TeachAndActEmptyState navigates to /donors", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    fireEvent.click(screen.getByRole("button", { name: "Go to Donors" }));

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/donors" }));
  });

  it("shows filter-active empty state when a filter is active and list is empty", async () => {
    // Seed one entry so filter chrome renders, then data becomes empty after filter applied
    mockUseOrgActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    const select = screen.getByLabelText("Entity type");
    fireEvent.change(select, { target: { value: "grant" } });

    expect(screen.getByText("No activity matches these filters.")).toBeInTheDocument();
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it("Clear filters resets all filters and shows teach-and-act empty state", async () => {
    // Seed one entry so filter chrome renders initially
    mockUseOrgActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    // Set a filter
    const select = screen.getByLabelText("Entity type");
    fireEvent.change(select, { target: { value: "grant" } });

    expect(screen.getByText("No activity matches these filters.")).toBeInTheDocument();

    // Clear filters
    fireEvent.click(screen.getByText("Clear filters"));

    // Filter-active state should be gone; TeachAndActEmptyState should show
    expect(screen.queryByText("No activity matches these filters.")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Activity log" })).toBeInTheDocument();
  });

  it("renders activity entries in the feed", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "activity-1",
            action: "created",
            entityType: "grant",
            entityId: "grant-1",
            actorId: "user-1",
            actorName: "Jane Doe",
            changes: { name: "New Grant" },
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(React.createElement(ActivityPage));

    // Feed container exists
    expect(container.querySelector('[data-testid="activity-feed"]')).toBeInTheDocument();
    // Entry row exists
    expect(container.querySelector('[data-testid="activity-entry"]')).toBeInTheDocument();
    // Entity badge shows entity type text
    expect(screen.getAllByText("Grant").length).toBeGreaterThan(0);
    // Action verb stays lowercase so the actor-verb-target line reads as a sentence
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.queryByText("Created")).not.toBeInTheDocument();
    // Actor name shown
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders multiple activity entries as individual rows", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            actorId: "user-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
          {
            id: "a2",
            action: "updated",
            entityType: "donor",
            entityId: "d-1",
            actorId: "user-2",
            createdAt: "2026-04-01T09:00:00.000Z",
          },
        ],
        total: 2,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(React.createElement(ActivityPage));

    expect(container.querySelectorAll('[data-testid="activity-entry"]').length).toBe(2);
  });

  it("renders entityLabel in feed entry when present", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            entityLabel: "Tech Innovation Grant",
            actorId: "user-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("Tech Innovation Grant")).toBeInTheDocument();
  });

  it('shows "System" when actorName is absent', () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("renders entity type filter select when entries exist", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByLabelText("Entity type")).toBeInTheDocument();
  });

  it("hides filter chrome when there are zero entries and no active filter", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.queryByLabelText("Entity type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("To date")).not.toBeInTheDocument();
    expect(screen.getByText("Activity log")).toBeInTheDocument();
  });

  it("limits auditor entity filters to audit-safe activity types", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor" });
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("option", { name: "Grant" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fund" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Payment Request" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Payment" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Donor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Donation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Event" })).not.toBeInTheDocument();
  });

  it("does not show a donor empty-state action to auditors", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor" });
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("region", { name: "Activity log" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Go to Donors/ })).not.toBeInTheDocument();
  });

  it("renders from date input when entries exist", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByLabelText("From date")).toBeInTheDocument();
  });

  it("renders to date input when entries exist", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("updates entityType filter when select changes", async () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    const select = screen.getByLabelText("Entity type");
    fireEvent.change(select, { target: { value: "grant" } });

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: "grant" }),
      );
    });
  });

  it("updates fromDate filter when date input changes", async () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    const fromInput = screen.getByLabelText("From date");
    fireEvent.change(fromInput, { target: { value: "2025-01-01" } });

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenCalledWith(
        expect.objectContaining({ fromDate: expect.stringContaining("2025-01-01") }),
      );
    });
  });

  it("updates toDate filter when date input changes", async () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "created",
            entityType: "grant",
            entityId: "g-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    const toInput = screen.getByLabelText("To date");
    fireEvent.change(toInput, { target: { value: "2025-12-31" } });

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          toDate: new Date(2025, 11, 31, 23, 59, 59, 999).toISOString(),
        }),
      );
    });
  });

  it("renders pagination when there are multiple pages", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: Array.from({ length: 25 }, (_, i) => ({
          id: `entry-${i}`,
          action: "created",
          entityType: "grant",
          entityId: "g-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        })),
        total: 50,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
  });

  it("previous page button is disabled on first page", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 50, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("next page button is disabled on last page", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 10, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("advances to next page when next button is clicked", async () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 50, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it("goes back to previous page when prev button is clicked", async () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 75, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    // Advance to page 2 first so the Previous button becomes enabled.
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));

    await waitFor(() => {
      expect(mockUseOrgActivity).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  it("hides pagination when there are no entries", () => {
    mockUseOrgActivity.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
  });

  it("renders relative times across the just-now / minutes / hours branches", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const justNow = new Date(now.getTime() - 5 * 1000).toISOString();
    const minutes = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const oneMinute = new Date(now.getTime() - 60 * 1000).toISOString();
    const hours = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const days = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          { id: "a", action: "a", entityType: "grant", entityId: "e-1", createdAt: justNow },
          { id: "b", action: "b", entityType: "grant", entityId: "e-2", createdAt: oneMinute },
          { id: "c", action: "c", entityType: "grant", entityId: "e-3", createdAt: minutes },
          { id: "d", action: "d", entityType: "grant", entityId: "e-4", createdAt: oneHour },
          { id: "e", action: "e", entityType: "grant", entityId: "e-5", createdAt: hours },
          { id: "f", action: "f", entityType: "grant", entityId: "e-6", createdAt: oneDay },
          { id: "g", action: "g", entityType: "grant", entityId: "e-7", createdAt: days },
        ],
        total: 7,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("1 minute ago")).toBeInTheDocument();
    expect(screen.getByText("5 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("1 hour ago")).toBeInTheDocument();
    expect(screen.getByText("3 hours ago")).toBeInTheDocument();
    expect(screen.getByText("1 day ago")).toBeInTheDocument();
    expect(screen.getByText("2 days ago")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows the singular entry label when total is 1", () => {
    mockUseOrgActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            action: "updated",
            entityType: "donor",
            entityId: "d-1",
            createdAt: "2026-04-01T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(React.createElement(ActivityPage));

    expect(screen.getByText(/1 entry total/)).toBeInTheDocument();
  });
});
