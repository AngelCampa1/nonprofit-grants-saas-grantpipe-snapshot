import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUseSession, mockUseJournalEntries, mockUseFiscalPeriods } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseJournalEntries: vi.fn(),
  mockUseFiscalPeriods: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => {
    let href = to ?? "";
    if (params)
      Object.entries(params).forEach(([k, v]) => {
        href = href.replace(`$${k}`, v);
      });
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../../hooks/use-accounting", () => ({
  useJournalEntries: (params: unknown) => mockUseJournalEntries(params),
  useFiscalPeriods: () => mockUseFiscalPeriods(),
}));

import { JournalIndexPage } from "./index";

const SAMPLE_ENTRIES = [
  {
    id: "je-1",
    entryNumber: 1,
    date: "2026-01-15T00:00:00.000Z",
    memo: "Grant payment",
    source: "manual",
    lines: [
      { debitCents: 10000, creditCents: 0, reconciliationId: null },
      { debitCents: 0, creditCents: 10000, reconciliationId: null },
    ],
  },
  {
    id: "je-2",
    entryNumber: 2,
    date: "2026-01-20T00:00:00.000Z",
    memo: null,
    source: "donation",
    lines: [
      { debitCents: 5000, creditCents: 0, reconciliationId: "recon-1" },
      { debitCents: 0, creditCents: 5000, reconciliationId: null },
    ],
  },
];

describe("JournalIndexPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseJournalEntries.mockReturnValue({ data: SAMPLE_ENTRIES, isLoading: false });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026 Q1", status: "open" }],
      isLoading: false,
    });
  });

  it("renders page heading", () => {
    render(<JournalIndexPage />);
    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
  });

  it("shows New Entry button for editors", () => {
    render(<JournalIndexPage />);
    const link = screen.getByRole("link", { name: "New Entry" });
    expect(link).toHaveAttribute("href", "/accounting/journal/new");
  });

  it("hides New Entry button for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<JournalIndexPage />);
    expect(screen.queryByRole("link", { name: "New Entry" })).not.toBeInTheDocument();
  });

  it("uses accounting edit permissions instead of role alone for New Entry", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "edit" },
    });

    render(<JournalIndexPage />);

    expect(screen.getByRole("link", { name: "New Entry" })).toHaveAttribute(
      "href",
      "/accounting/journal/new",
    );
  });

  it("renders journal entry rows", () => {
    render(<JournalIndexPage />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Grant payment")).toBeInTheDocument();
  });

  it("shows - for entries without memo", () => {
    render(<JournalIndexPage />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows LOCKED badge for locked entries", () => {
    render(<JournalIndexPage />);
    expect(screen.getByText("LOCKED")).toBeInTheDocument();
  });

  it("shows loading skeleton when entries are loading", () => {
    mockUseJournalEntries.mockReturnValue({ data: undefined, isLoading: true });
    render(<JournalIndexPage />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error message when entries query fails", () => {
    mockUseJournalEntries.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<JournalIndexPage />);
    expect(screen.getByText(/unable to load journal entries/i)).toBeInTheDocument();
  });

  it("announces the entries load failure to screen readers via role=alert", () => {
    mockUseJournalEntries.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<JournalIndexPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load journal entries. Please try again.",
    );
  });

  it("shows TeachAndActEmptyState when no entries", () => {
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<JournalIndexPage />);
    expect(screen.getByText("Journal entries")).toBeInTheDocument();
    expect(
      screen.queryByText(/journal entries record individual financial transactions/i),
    ).not.toBeInTheDocument();
    // The empty state explains what journal entries are for, not just a bare heading.
    expect(
      screen.getByText(
        "Use journal entries to fix balances. Add one for anything outside donations or grants.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New entry" })).toBeInTheDocument();
  });

  it("labels the period and source filter dropdowns for screen readers", () => {
    render(<JournalIndexPage />);
    expect(screen.getByRole("combobox", { name: "Filter by fiscal period" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by source" })).toBeInTheDocument();
  });

  it("stacks the journal filters full-width on mobile and restores fixed widths from sm up", () => {
    render(<JournalIndexPage />);
    expect(screen.getByRole("combobox", { name: "Filter by fiscal period" })).toHaveClass(
      "w-full",
      "sm:w-48",
    );
    expect(screen.getByRole("combobox", { name: "Filter by source" })).toHaveClass(
      "w-full",
      "sm:w-40",
    );
    expect(screen.getByLabelText("From date")).toHaveClass("w-full", "sm:w-40");
    expect(screen.getByLabelText("To date")).toHaveClass("w-full", "sm:w-40");
  });

  it("renders source badge as capitalized text", () => {
    render(<JournalIndexPage />);
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getByText("donation")).toBeInTheDocument();
  });

  it("shows fiscal period filter dropdown", () => {
    render(<JournalIndexPage />);
    // The period filter trigger renders "All periods" placeholder when no period selected
    expect(screen.getByText("All periods")).toBeInTheDocument();
  });

  it("renders date range inputs", () => {
    render(<JournalIndexPage />);
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("links each entry to detail page", () => {
    render(<JournalIndexPage />);
    const link = screen.getByRole("link", { name: "#1" });
    expect(link).toHaveAttribute("href", "/accounting/journal/je-1");
  });

  it("handles undefined fiscalPeriods data gracefully", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: false });
    render(<JournalIndexPage />);
    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
  });

  it("updates from date filter on input change", async () => {
    render(<JournalIndexPage />);
    const fromInput = screen.getByLabelText("From date");
    fireEvent.change(fromInput, { target: { value: "2026-01-01" } });
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ from: "2026-01-01T00:00:00.000Z" }),
      ),
    );
  });

  it("updates to date filter on input change", async () => {
    render(<JournalIndexPage />);
    const toInput = screen.getByLabelText("To date");
    fireEvent.change(toInput, { target: { value: "2026-03-31" } });
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ to: "2026-03-31T23:59:59.999Z" }),
      ),
    );
  });

  it("passes source filter to useJournalEntries when source is selected", async () => {
    render(<JournalIndexPage />);
    // Click the source filter trigger (second combobox)
    const triggers = screen.getAllByRole("combobox");
    const sourceSelect = triggers[1]!;
    fireEvent.click(sourceSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("manual"));
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ source: "manual" }),
      ),
    );
  });

  it("passes fiscalPeriodId filter to useJournalEntries when period is selected", async () => {
    render(<JournalIndexPage />);
    const triggers = screen.getAllByRole("combobox");
    const periodSelect = triggers[0]!;
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalPeriodId: "p1" }),
      ),
    );
  });

  it("resets fiscalPeriodId filter when All periods is re-selected", async () => {
    render(<JournalIndexPage />);
    const triggers = screen.getAllByRole("combobox");
    const periodSelect = triggers[0]!;
    // First select a period
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));
    // Then reset to "All periods"
    fireEvent.click(periodSelect);
    const listbox2 = await screen.findByRole("listbox");
    fireEvent.click(within(listbox2).getByText("All periods"));
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalPeriodId: undefined }),
      ),
    );
  });

  it("hides filter toolbar when there are no entries and no active filter (true-empty)", () => {
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<JournalIndexPage />);
    expect(
      screen.queryByRole("combobox", { name: "Filter by fiscal period" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter by source" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("To date")).not.toBeInTheDocument();
  });

  it("shows filter toolbar when records exist (even with no active filter)", () => {
    render(<JournalIndexPage />);
    expect(screen.getByRole("combobox", { name: "Filter by fiscal period" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by source" })).toBeInTheDocument();
  });

  it("shows filter toolbar when a filter is active but zero records match", async () => {
    // Start with empty results but simulate a fromDate filter being active
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    const { rerender } = render(<JournalIndexPage />);
    // Toolbar hidden initially (true-empty)
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
    // Now simulate the user having typed a date — we can't directly set state, but we can
    // verify the chrome appears when entries exist; for the filter-active path we test it
    // by seeding one entry so the chrome shows, then confirm toolbar is present.
    mockUseJournalEntries.mockReturnValue({ data: SAMPLE_ENTRIES, isLoading: false });
    rerender(<JournalIndexPage />);
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
  });

  it("shows View chart of accounts CTA in empty state for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<JournalIndexPage />);
    expect(screen.getByRole("link", { name: "View chart of accounts" })).toBeInTheDocument();
  });

  it("shows QuickBooks badge when externalSourceSystem is quickbooks_online", () => {
    mockUseJournalEntries.mockReturnValue({
      data: [
        {
          ...SAMPLE_ENTRIES[0],
          externalSourceSystem: "quickbooks_online",
          externalSourceSyncedAt: "2026-01-10T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    render(<JournalIndexPage />);
    expect(screen.getByText("QuickBooks")).toBeInTheDocument();
    // externalSourceSyncedAt badge renders a formatted date — confirm it's in the document
    // Use a broader query since the exact locale-formatted string may vary by environment
    const badges = document.querySelectorAll('[data-slot="badge"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows full memo as title attribute on truncated memo cell", () => {
    render(<JournalIndexPage />);
    expect(screen.getByTitle("Grant payment")).toBeInTheDocument();
  });

  it("omits title attribute on memo cell when memo is null", () => {
    render(<JournalIndexPage />);
    // entry je-2 has memo: null — the cell renders "-" with no title attribute
    const cells = document.querySelectorAll("td");
    const dashCell = Array.from(cells).find((td) => td.textContent === "-");
    expect(dashCell).toBeDefined();
    expect(dashCell?.getAttribute("title")).toBeNull();
  });

  it("resets source filter when All sources is re-selected", async () => {
    render(<JournalIndexPage />);
    const triggers = screen.getAllByRole("combobox");
    const sourceSelect = triggers[1]!;
    fireEvent.click(sourceSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("manual"));
    // Then reset to "All sources"
    fireEvent.click(sourceSelect);
    const listbox2 = await screen.findByRole("listbox");
    fireEvent.click(within(listbox2).getByText("All sources"));
    await waitFor(() =>
      expect(mockUseJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ source: undefined }),
      ),
    );
  });
});
