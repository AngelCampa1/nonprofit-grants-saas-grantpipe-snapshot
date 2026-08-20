import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUseSession,
  mockUseJournalEntry,
  mockUseReverseJournalEntry,
  mockUseFiscalPeriods,
  mockUseAccounts,
  mockUseParams,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseJournalEntry: vi.fn(),
  mockUseReverseJournalEntry: vi.fn(),
  mockUseFiscalPeriods: vi.fn(),
  mockUseAccounts: vi.fn(),
  mockUseParams: vi.fn().mockReturnValue({ entryId: "je-1" }),
  mockNavigate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: mockUseParams,
  }),
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../../hooks/use-accounting", () => ({
  useJournalEntry: () => mockUseJournalEntry(),
  useReverseJournalEntry: (id: string) => mockUseReverseJournalEntry(id),
  useFiscalPeriods: () => mockUseFiscalPeriods(),
  useAccounts: () => mockUseAccounts(),
}));

import { JournalEntryDetailPage } from "./$entryId";

const SAMPLE_ENTRY = {
  id: "je-1",
  entryNumber: 42,
  date: "2026-01-15T00:00:00.000Z",
  fiscalPeriodId: "p1",
  memo: "Test journal entry",
  source: "manual",
  isAdjusting: false,
  reversedByEntryId: null,
  lines: [
    {
      id: "l1",
      lineNumber: 1,
      accountId: "acc-1",
      debitCents: 10000,
      creditCents: 0,
      memo: "Debit line",
      reconciliationId: null,
    },
    {
      id: "l2",
      lineNumber: 2,
      accountId: "acc-2",
      debitCents: 0,
      creditCents: 10000,
      memo: null,
      reconciliationId: null,
    },
  ],
};

describe("JournalEntryDetailPage", () => {
  const SAMPLE_ACCOUNTS = [
    { id: "acc-1", code: "1000", name: "Cash" },
    { id: "acc-2", code: "4000", name: "Donations Revenue" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseJournalEntry.mockReturnValue({
      data: SAMPLE_ENTRY,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseReverseJournalEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026 Q1", status: "open" }],
      isLoading: false,
    });
    mockUseAccounts.mockReturnValue({ data: SAMPLE_ACCOUNTS, isLoading: false });
  });

  it("renders page heading with entry number", () => {
    render(<JournalEntryDetailPage />);
    expect(screen.getByRole("heading", { name: /journal entry #42/i })).toBeInTheDocument();
  });

  it("shows entry metadata", () => {
    render(<JournalEntryDetailPage />);
    expect(screen.getByText("FY2026 Q1")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders line items table", () => {
    render(<JournalEntryDetailPage />);
    // $100 appears in the debit column and totals footer
    expect(screen.getAllByText("$100").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Debit line")).toBeInTheDocument();
  });

  it("shows totals row in table footer", () => {
    render(<JournalEntryDetailPage />);
    expect(screen.getByText("Totals")).toBeInTheDocument();
  });

  it("shows Reverse button for admin on unlocked entry", () => {
    render(<JournalEntryDetailPage />);
    expect(screen.getByRole("button", { name: /reverse/i })).toBeInTheDocument();
  });

  it("hides Reverse button for non-admin", () => {
    mockUseSession.mockReturnValue({ memberRole: "editor" });
    render(<JournalEntryDetailPage />);
    expect(screen.queryByRole("button", { name: /^reverse$/i })).not.toBeInTheDocument();
  });

  it("hides Reverse button when entry is already reversed", () => {
    mockUseJournalEntry.mockReturnValue({
      data: { ...SAMPLE_ENTRY, reversedByEntryId: "je-99" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.queryByRole("button", { name: /^reverse$/i })).not.toBeInTheDocument();
    expect(screen.getByText("REVERSED")).toBeInTheDocument();
  });

  it("shows LOCKED badge when any line has reconciliationId", () => {
    mockUseJournalEntry.mockReturnValue({
      data: {
        ...SAMPLE_ENTRY,
        lines: [{ ...SAMPLE_ENTRY.lines[0], reconciliationId: "recon-1" }, SAMPLE_ENTRY.lines[1]],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.getByText("LOCKED")).toBeInTheDocument();
  });

  it("hides Reverse button when entry is locked", () => {
    mockUseJournalEntry.mockReturnValue({
      data: {
        ...SAMPLE_ENTRY,
        lines: [{ ...SAMPLE_ENTRY.lines[0], reconciliationId: "recon-1" }, SAMPLE_ENTRY.lines[1]],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.queryByRole("button", { name: /^reverse$/i })).not.toBeInTheDocument();
  });

  it("shows adjusting badge on adjusting entries", () => {
    mockUseJournalEntry.mockReturnValue({
      data: { ...SAMPLE_ENTRY, isAdjusting: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.getByText("Adjusting")).toBeInTheDocument();
  });

  it("opens reverse dialog on Reverse click", () => {
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    expect(screen.getByRole("heading", { name: /reverse journal entry/i })).toBeInTheDocument();
  });

  it("closes reverse dialog on Cancel", () => {
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: /reverse journal entry/i }),
    ).not.toBeInTheDocument();
  });

  it("calls reverse mutation on dialog confirm", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-rev", entryNumber: 43 });
    mockUseReverseJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    const memoInput = screen.getByLabelText(/reversal memo/i);
    fireEvent.change(memoInput, { target: { value: "Reversing for correction" } });
    fireEvent.click(screen.getByRole("button", { name: /^reverse$/i }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith({ memo: "Reversing for correction" }),
    );
  });

  it("shows error in dialog when reverse fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Already reversed"));
    mockUseReverseJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reverse$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Already reversed")).toBeInTheDocument();
  });

  it("shows loading skeleton while entry is loading", () => {
    mockUseJournalEntry.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows error alert when entry fails to load", () => {
    mockUseJournalEntry.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.getByText(/unable to load journal entry/i)).toBeInTheDocument();
  });

  it("shows fallback error message when reverse throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseReverseJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reverse$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to reverse entry/i)).toBeInTheDocument();
  });

  it("falls back to fiscalPeriodId when no matching period found", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    render(<JournalEntryDetailPage />);
    // With no matching period, shows the raw fiscalPeriodId "p1"
    expect(screen.getByText("p1")).toBeInTheDocument();
  });

  it("shows Reversing… text when reverse mutation is pending", () => {
    mockUseReverseJournalEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /reverse/i }));
    expect(screen.getByText("Reversing…")).toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked on error", async () => {
    const refetchFn = vi.fn();
    mockUseJournalEntry.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<JournalEntryDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("shows No memo when entry memo is null", () => {
    mockUseJournalEntry.mockReturnValue({
      data: { ...SAMPLE_ENTRY, memo: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<JournalEntryDetailPage />);
    expect(screen.getByText("No memo")).toBeInTheDocument();
  });

  it("handles undefined fiscalPeriods data gracefully", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: false });
    render(<JournalEntryDetailPage />);
    // With undefined periods data, falls back to fiscalPeriodId
    expect(screen.getByText("p1")).toBeInTheDocument();
  });

  it("displays account code and name instead of raw UUID when accounts are loaded", () => {
    render(<JournalEntryDetailPage />);
    // Should show "1000: Cash" and "4000: Donations Revenue" instead of raw UUIDs
    expect(screen.getByText("1000: Cash")).toBeInTheDocument();
    expect(screen.getByText("4000: Donations Revenue")).toBeInTheDocument();
    // Raw UUIDs should not appear as account cells
    expect(screen.queryByText("acc-1")).not.toBeInTheDocument();
    expect(screen.queryByText("acc-2")).not.toBeInTheDocument();
  });

  it("falls back to raw accountId when account is not in the COA list", () => {
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<JournalEntryDetailPage />);
    // Without matching accounts, raw IDs are shown as fallback
    expect(screen.getByText("acc-1")).toBeInTheDocument();
    expect(screen.getByText("acc-2")).toBeInTheDocument();
  });

  it("handles undefined accounts data gracefully", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: false });
    render(<JournalEntryDetailPage />);
    // Falls back to raw accountId when no accounts data
    expect(screen.getByText("acc-1")).toBeInTheDocument();
  });
});
