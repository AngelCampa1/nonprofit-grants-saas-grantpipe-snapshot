import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const {
  mockUseSession,
  mockUseBankAccounts,
  mockUseBankTransactions,
  mockUseImportBankTransactions,
  mockUseMatchBankTransaction,
  mockUseIgnoreBankTransaction,
  mockUseUnmatchBankTransaction,
  mockUseCreateReconciliation,
  mockUseCompleteReconciliation,
  mockUseCancelReconciliation,
  mockUseJournalEntries,
  mockUseParams,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseBankAccounts: vi.fn(),
  mockUseBankTransactions: vi.fn(),
  mockUseImportBankTransactions: vi.fn(),
  mockUseMatchBankTransaction: vi.fn(),
  mockUseIgnoreBankTransaction: vi.fn(),
  mockUseUnmatchBankTransaction: vi.fn(),
  mockUseCreateReconciliation: vi.fn(),
  mockUseCompleteReconciliation: vi.fn(),
  mockUseCancelReconciliation: vi.fn(),
  mockUseJournalEntries: vi.fn(),
  mockUseParams: vi.fn(),
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

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    params?: Record<string, string>;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useParams: () => mockUseParams(),
}));

vi.mock("../../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../../hooks/use-accounting", () => ({
  useBankAccounts: () => mockUseBankAccounts(),
  useBankTransactions: (id: string, params: unknown) => mockUseBankTransactions(id, params),
  useImportBankTransactions: (id: string) => mockUseImportBankTransactions(id),
  useMatchBankTransaction: (id: string) => mockUseMatchBankTransaction(id),
  useIgnoreBankTransaction: (id: string) => mockUseIgnoreBankTransaction(id),
  useUnmatchBankTransaction: (id: string) => mockUseUnmatchBankTransaction(id),
  useCreateReconciliation: () => mockUseCreateReconciliation(),
  useCompleteReconciliation: () => mockUseCompleteReconciliation(),
  useCancelReconciliation: () => mockUseCancelReconciliation(),
  useJournalEntries: (params: unknown) => mockUseJournalEntries(params),
}));

import { BankAccountDetailPage } from "./$bankAccountId";

const SAMPLE_ACCOUNT = {
  id: "ba-1",
  orgId: "org-1",
  name: "Checking — Chase",
  accountNumber: "4321",
  glAccountId: "acc-cash-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const SAMPLE_TRANSACTIONS = [
  {
    id: "txn-1",
    orgId: "org-1",
    bankAccountId: "ba-1",
    date: "2026-03-15T00:00:00.000Z",
    amountCents: 150000,
    description: "Grant payment received",
    referenceNumber: "REF001",
    status: "unmatched" as const,
    journalEntryId: null,
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  },
  {
    id: "txn-2",
    orgId: "org-1",
    bankAccountId: "ba-1",
    date: "2026-03-20T00:00:00.000Z",
    amountCents: -50000,
    description: "Office supplies",
    referenceNumber: null,
    status: "matched" as const,
    journalEntryId: "je-1",
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
  },
  {
    id: "txn-3",
    orgId: "org-1",
    bankAccountId: "ba-1",
    date: "2026-03-22T00:00:00.000Z",
    amountCents: -1000,
    description: "Bank fee",
    referenceNumber: null,
    status: "ignored" as const,
    journalEntryId: null,
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
  },
];

const SAMPLE_JOURNAL_ENTRIES = [
  {
    id: "je-1",
    orgId: "org-1",
    entryNumber: 101,
    date: "2026-03-20T00:00:00.000Z",
    fiscalPeriodId: "p1",
    memo: "Office supplies purchase",
    source: "manual",
    postedBy: "user-1",
    isAdjusting: false,
    reversedByEntryId: null,
    createdAt: "2026-03-20T00:00:00.000Z",
    lines: [],
  },
];

describe("BankAccountDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ bankAccountId: "ba-1" });
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseBankAccounts.mockReturnValue({
      data: [SAMPLE_ACCOUNT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseBankTransactions.mockReturnValue({
      data: SAMPLE_TRANSACTIONS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseIgnoreBankTransaction.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseUnmatchBankTransaction.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseCompleteReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseCancelReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseJournalEntries.mockReturnValue({ data: SAMPLE_JOURNAL_ENTRIES, isLoading: false });
  });

  it("renders account name as heading", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("heading", { name: "Checking — Chase" })).toBeInTheDocument();
  });

  it("shows account number in description", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/account ending in 4321/i)).toBeInTheDocument();
  });

  it("renders transactions table", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByText("Grant payment received")).toBeInTheDocument();
    expect(screen.getByText("Office supplies")).toBeInTheDocument();
    expect(screen.getByText("Bank fee")).toBeInTheDocument();
  });

  it("shows humanized status badges on transactions", () => {
    render(<BankAccountDetailPage />);
    // Humanized labels appear (badges; the status filter options also use these labels).
    expect(screen.getAllByText("Unmatched").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Matched").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ignored").length).toBeGreaterThan(0);
    // Raw lowercase enum tokens are never rendered as visible text.
    expect(screen.queryByText("unmatched")).not.toBeInTheDocument();
    expect(screen.queryByText("matched")).not.toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
  });

  it("renders the unmatched status badge as a warning, not destructive", () => {
    // An unmatched transaction is the default state of every freshly imported
    // row and the user's reconciliation to-do — an actionable-pending state, not
    // an error. The app's `warning` variant signals "needs attention" everywhere
    // else (due-today, lapsing-soon, unread); `destructive` is reserved for
    // danger/failure and would paint a fresh import a wall of red.
    render(<BankAccountDetailPage />);
    const badges = Array.from(document.querySelectorAll('[data-slot="badge"]'));
    const unmatchedBadges = badges.filter((badge) => badge.textContent === "Unmatched");
    expect(unmatchedBadges.length).toBeGreaterThan(0);
    for (const badge of unmatchedBadges) {
      expect(badge.getAttribute("data-variant")).toBe("warning");
      expect(badge.getAttribute("data-variant")).not.toBe("destructive");
    }
  });

  it("shows negative amounts in red class", () => {
    render(<BankAccountDetailPage />);
    const cells = document.querySelectorAll(".text-destructive");
    // Negative amounts should have destructive class
    expect(cells.length).toBeGreaterThan(0);
  });

  it("shows reference number", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByText("REF001")).toBeInTheDocument();
  });

  it("shows import panel for editors", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/import transactions/i)).toBeInTheDocument();
  });

  it("groups the import format radios under a labelled radiogroup", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("radiogroup", { name: "Import format" })).toBeInTheDocument();
  });

  it("hides import panel for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<BankAccountDetailPage />);
    expect(screen.queryByText(/import transactions/i)).not.toBeInTheDocument();
  });

  it("shows edit controls for a viewer with accounting edit permission", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "edit" },
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/import transactions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start reconciliation/i })).toBeInTheDocument();
  });

  it("shows Match and Ignore buttons for unmatched transactions (editor)", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: "Match" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignore" })).toBeInTheDocument();
  });

  it("shows Unmatch button for matched transactions", () => {
    render(<BankAccountDetailPage />);
    const unmatchButtons = screen.getAllByRole("button", { name: "Unmatch" });
    expect(unmatchButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Unignore button for ignored transactions", () => {
    render(<BankAccountDetailPage />);
    // "Unignore" is the unmatch button for ignored status
    const unignoreBtn = screen.getByRole("button", { name: "Unignore" });
    expect(unignoreBtn).toBeInTheDocument();
  });

  it("hides action buttons for viewer role", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<BankAccountDetailPage />);
    expect(screen.queryByRole("button", { name: "Match" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument();
  });

  it("calls ignore mutation on Ignore click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseIgnoreBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ bankTransactionId: "txn-1" }));
  });

  it("calls unmatch mutation on Unmatch click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseUnmatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    // Click Unmatch (for matched transaction)
    const unmatchButtons = screen.getAllByRole("button", { name: "Unmatch" });
    fireEvent.click(unmatchButtons[0]!);
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ bankTransactionId: "txn-2" }));
  });

  it("calls unmatch mutation on Unignore click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseUnmatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Unignore" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ bankTransactionId: "txn-3" }));
  });

  it("only disables the Ignore button for the row whose ignore request is in flight", () => {
    mockUseBankTransactions.mockReturnValue({
      data: [
        { ...SAMPLE_TRANSACTIONS[0], id: "txn-a", description: "Row A" },
        { ...SAMPLE_TRANSACTIONS[0], id: "txn-b", description: "Row B" },
      ],
      isLoading: false,
    });
    mockUseIgnoreBankTransaction.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      variables: { bankTransactionId: "txn-a" },
    });
    render(<BankAccountDetailPage />);
    const ignoreButtons = screen.getAllByRole("button", { name: "Ignore" });
    expect(ignoreButtons).toHaveLength(2);
    // Row A is mid-request -> disabled; Row B stays clickable.
    expect(ignoreButtons[0]).toBeDisabled();
    expect(ignoreButtons[1]).not.toBeDisabled();
  });

  it("only disables the Unmatch button for the row whose unmatch request is in flight", () => {
    mockUseBankTransactions.mockReturnValue({
      data: [
        { ...SAMPLE_TRANSACTIONS[1], id: "txn-a", description: "Row A" },
        { ...SAMPLE_TRANSACTIONS[1], id: "txn-b", description: "Row B" },
      ],
      isLoading: false,
    });
    mockUseUnmatchBankTransaction.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      variables: { bankTransactionId: "txn-a" },
    });
    render(<BankAccountDetailPage />);
    const unmatchButtons = screen.getAllByRole("button", { name: "Unmatch" });
    expect(unmatchButtons).toHaveLength(2);
    expect(unmatchButtons[0]).toBeDisabled();
    expect(unmatchButtons[1]).not.toBeDisabled();
  });

  it("shows action error when ignore fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Transaction already processed"));
    mockUseIgnoreBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    await waitFor(() =>
      expect(screen.getByText("Transaction already processed")).toBeInTheDocument(),
    );
  });

  it("shows fallback action error when ignore throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseIgnoreBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    await waitFor(() =>
      expect(screen.getByText(/unable to ignore transaction/i)).toBeInTheDocument(),
    );
  });

  it("shows action error when unmatch fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Cannot unmatch reconciled transaction"));
    mockUseUnmatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Unmatch" })[0]!);
    await waitFor(() =>
      expect(screen.getByText("Cannot unmatch reconciled transaction")).toBeInTheDocument(),
    );
  });

  it("opens match dialog when Match is clicked", () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    expect(screen.getByRole("heading", { name: /match transaction/i })).toBeInTheDocument();
  });

  it("closes match dialog when cancel is clicked", async () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /match transaction/i })).not.toBeInTheDocument(),
    );
  });

  it("shows no journal entries message in match dialog", () => {
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    expect(screen.getByText(/no journal entries found/i)).toBeInTheDocument();
  });

  it("shows match dialog loading skeleton while journal entries load", async () => {
    mockUseJournalEntries.mockReturnValue({ data: undefined, isLoading: true });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    await waitFor(() => expect(document.querySelector(".animate-pulse")).toBeInTheDocument());
  });

  it("shows journal entries in match dialog", () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    expect(screen.getByText("#101")).toBeInTheDocument();
    expect(screen.getByText("Office supplies purchase")).toBeInTheDocument();
  });

  it("shows a dash for journal entries without a memo in match dialog", () => {
    mockUseJournalEntries.mockReturnValue({
      data: [{ ...SAMPLE_JOURNAL_ENTRIES[0], memo: null }],
      isLoading: false,
    });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    const rows = screen.getAllByRole("row");
    const entryRow = rows.find((r) => within(r).queryByText("#101"));
    expect(entryRow).toBeTruthy();
    const cells = within(entryRow!).getAllByRole("cell");
    expect(cells[3]!.textContent).toBe("-");
  });

  it("shows full memo as title on truncated match-dialog cell when memo is present", () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    expect(screen.getByTitle("Office supplies purchase")).toBeInTheDocument();
  });

  it("omits title on match-dialog memo cell when memo is null", () => {
    mockUseJournalEntries.mockReturnValue({
      data: [{ ...SAMPLE_JOURNAL_ENTRIES[0], memo: null }],
      isLoading: false,
    });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    const rows = screen.getAllByRole("row");
    const entryRow = rows.find((r) => within(r).queryByText("#101"));
    const cells = within(entryRow!).getAllByRole("cell");
    expect(cells[3]!.getAttribute("title")).toBeNull();
  });

  it("calls match mutation on confirm", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    // Open match dialog for the unmatched transaction
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    // Select the journal entry via radio
    const radioInputs = screen.getAllByRole("radio");
    fireEvent.click(radioInputs[0]!);
    // Now there are two Match buttons: one in table, one in dialog. Click the dialog one (last).
    const matchButtons = screen.getAllByRole("button", { name: "Match" });
    fireEvent.click(matchButtons[matchButtons.length - 1]!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith({
        bankTransactionId: "txn-1",
        journalEntryId: "je-1",
      }),
    );
  });

  it("selects a match entry when the table row is clicked", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    fireEvent.click(screen.getByText("#101").closest("tr")!);
    const matchButtons = screen.getAllByRole("button", { name: "Match" });
    fireEvent.click(matchButtons[matchButtons.length - 1]!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith({
        bankTransactionId: "txn-1",
        journalEntryId: "je-1",
      }),
    );
  });

  it("shows match error when no entry selected", async () => {
    render(<BankAccountDetailPage />);
    // Open match dialog
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    // Click confirm dialog Match button without selecting an entry
    const matchButtons = screen.getAllByRole("button", { name: "Match" });
    fireEvent.click(matchButtons[matchButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.getByText(/select a journal entry/i)).toBeInTheDocument();
    });
  });

  it("shows match error when match mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Amount mismatch"));
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    fireEvent.click(screen.getByLabelText(/select entry #101/i));
    const matchButtons = screen.getAllByRole("button", { name: "Match" });
    fireEvent.click(matchButtons[matchButtons.length - 1]!);
    await waitFor(() => expect(screen.getByText("Amount mismatch")).toBeInTheDocument());
  });

  it("shows fallback match error when match mutation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    fireEvent.click(screen.getByLabelText(/select entry #101/i));
    const matchButtons = screen.getAllByRole("button", { name: "Match" });
    fireEvent.click(matchButtons[matchButtons.length - 1]!);
    await waitFor(() =>
      expect(screen.getByText(/unable to match transaction/i)).toBeInTheDocument(),
    );
  });

  it("shows Matching… while match mutation is pending", () => {
    mockUseMatchBankTransaction.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    fireEvent.click(screen.getByLabelText(/select entry #101/i));
    expect(screen.getByRole("button", { name: /matching/i })).toBeInTheDocument();
  });

  it("imports transactions on import button click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ imported: 3, duplicates: 2 });
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    const textarea = screen.getByLabelText(/paste.*content/i);
    fireEvent.change(textarea, {
      target: { value: "Date,Description,Amount\n2026-01-01,Test,100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith({
        format: "csv",
        content: "Date,Description,Amount\n2026-01-01,Test,100",
      }),
    );
    // Text is split across elements: "Imported ", <strong>3</strong>, " transaction(s)"
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/duplicate.*skipped/i)).toBeInTheDocument();
  });

  it("imports OFX content when OFX format is selected", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ imported: 1, duplicates: 0 });
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByLabelText("OFX"));
    fireEvent.change(screen.getByLabelText(/paste.*content/i), {
      target: { value: "<OFX>content</OFX>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith({ format: "ofx", content: "<OFX>content</OFX>" }),
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/duplicate.*skipped/i)).not.toBeInTheDocument();
  });

  it("shows singular duplicate copy for one skipped duplicate", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ imported: 2, duplicates: 1 });
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/paste.*content/i), {
      target: { value: "Date,Description,Amount\n2026-01-01,Test,100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.getByText(/1 duplicate skipped/i)).toBeInTheDocument());
  });

  it("shows import error when content is empty", async () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/paste or upload file content/i)).toBeInTheDocument();
  });

  it("shows import error when mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Invalid CSV format"));
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    const textarea = screen.getByLabelText(/paste.*content/i);
    fireEvent.change(textarea, { target: { value: "bad content" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.getByText("Invalid CSV format")).toBeInTheDocument());
  });

  it("shows fallback import error when mutation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/paste.*content/i), {
      target: { value: "bad content" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(screen.getByText(/unable to import transactions/i)).toBeInTheDocument(),
    );
  });

  it("shows loading skeleton for transactions", () => {
    mockUseBankTransactions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<BankAccountDetailPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows empty state when no transactions", () => {
    mockUseBankTransactions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();
  });

  it("shows error alert when transactions fail to load", () => {
    mockUseBankTransactions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/unable to load transactions/i)).toBeInTheDocument();
  });

  it("calls refetch from the transaction error alert", async () => {
    const refetchFn = vi.fn();
    mockUseBankTransactions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("shows bank account loading skeleton", () => {
    mockUseBankAccounts.mockReturnValue({ data: undefined, isLoading: true });
    render(<BankAccountDetailPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows not found alert when account does not exist", () => {
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/bank account not found/i)).toBeInTheDocument();
  });

  it("shows reconciliation section", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("heading", { name: "Reconciliation" })).toBeInTheDocument();
  });

  it("shows Start Reconciliation button for editors", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: /start reconciliation/i })).toBeInTheDocument();
  });

  it("creates reconciliation on Start click with valid inputs", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          bankAccountId: "ba-1",
          statementEndingBalanceCents: 500000,
        }),
      ),
    );
  });

  it("shows Starting… while create reconciliation is pending", () => {
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: /starting/i })).toBeInTheDocument();
  });

  it("shows error when start reconciliation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("No open fiscal period"));
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() => expect(screen.getByText("No open fiscal period")).toBeInTheDocument());
  });

  it("shows fallback error when start reconciliation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() =>
      expect(screen.getByText(/unable to start reconciliation/i)).toBeInTheDocument(),
    );
  });

  it("shows reconciliation error when statement date is missing", async () => {
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/statement date is required/i)).toBeInTheDocument();
  });

  it("shows reconciliation error when ending balance is invalid", async () => {
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    const balanceInput = screen.getByLabelText(/statement ending balance/i);
    balanceInput.setAttribute("type", "text");
    fireEvent.change(balanceInput, { target: { value: "not-a-number" } });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() => expect(screen.getByText(/invalid balance amount/i)).toBeInTheDocument());
  });

  it("shows message for non-editor users in reconciliation", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/editors and admins can start reconciliations/i)).toBeInTheDocument();
  });

  it("does not show complete or cancel reconciliation controls without accounting manage", async () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "edit" },
    });
    const mutateFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
    expect(screen.getByText(/accounting managers can complete or cancel/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete reconciliation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("shows pagination buttons", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("previous button is disabled on page 1", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("advances and returns pagination when a full page is loaded", async () => {
    mockUseBankTransactions.mockReturnValue({
      data: Array.from({ length: 20 }, (_, i) => ({
        ...SAMPLE_TRANSACTIONS[0],
        id: `txn-${i}`,
        description: `Transaction ${i}`,
      })),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BankAccountDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(mockUseBankTransactions).toHaveBeenCalledWith(
        "ba-1",
        expect.objectContaining({ page: 2 }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    await waitFor(() =>
      expect(mockUseBankTransactions).toHaveBeenCalledWith(
        "ba-1",
        expect.objectContaining({ page: 1 }),
      ),
    );
  });

  it("reads file content into textarea on upload", async () => {
    render(<BankAccountDetailPage />);
    const fileInput = screen.getByLabelText(/upload file/i);
    const file = new File(["Date,Description,Amount\n2026-01-01,Test,100"], "test.csv", {
      type: "text/csv",
    });
    const readAsTextSpy = vi.fn();
    let onLoadCallback: ((ev: { target: { result: string } }) => void) | null = null;
    vi.spyOn(window, "FileReader").mockImplementation(
      () =>
        ({
          readAsText: readAsTextSpy,
          set onload(fn: (ev: { target: { result: string } }) => void) {
            onLoadCallback = fn;
          },
        }) as unknown as FileReader,
    );

    fireEvent.change(fileInput, { target: { files: [file] } });
    if (onLoadCallback !== null) {
      (onLoadCallback as (ev: { target: { result: string } }) => void)({
        target: { result: "Date,Description,Amount\n2026-01-01,Test,100" },
      });
    }
    expect(readAsTextSpy).toHaveBeenCalledWith(file);
  });

  it("ignores file upload changes without a selected file", () => {
    render(<BankAccountDetailPage />);
    const readAsTextSpy = vi.fn();
    vi.spyOn(window, "FileReader").mockImplementation(
      () => ({ readAsText: readAsTextSpy }) as unknown as FileReader,
    );
    fireEvent.change(screen.getByLabelText(/upload file/i), { target: { files: [] } });
    expect(readAsTextSpy).not.toHaveBeenCalled();
  });

  it("shows no account number message when none on file", () => {
    mockUseBankAccounts.mockReturnValue({
      data: [{ ...SAMPLE_ACCOUNT, accountNumber: null }],
      isLoading: false,
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText(/no account number on file/i)).toBeInTheDocument();
  });

  it("changes status filter via select", () => {
    render(<BankAccountDetailPage />);
    // Status filter select exists
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("passes selected status filter to transaction query", async () => {
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "matched" } });
    await waitFor(() =>
      expect(mockUseBankTransactions).toHaveBeenCalledWith(
        "ba-1",
        expect.objectContaining({ status: "matched", page: 1 }),
      ),
    );
  });

  it("renders unknown transaction statuses without action buttons", () => {
    mockUseBankTransactions.mockReturnValue({
      data: [{ ...SAMPLE_TRANSACTIONS[0], id: "txn-pending", status: "pending" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Match" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument();
  });

  it("shows Importing… while import is pending", () => {
    mockUseImportBankTransactions.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<BankAccountDetailPage />);
    expect(screen.getByRole("button", { name: /importing/i })).toBeInTheDocument();
  });

  it("shows journal entry number when transaction reference is missing", () => {
    mockUseBankTransactions.mockReturnValue({
      data: [{ ...SAMPLE_TRANSACTIONS[1], journalEntryNumber: 77 }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BankAccountDetailPage />);
    expect(screen.getByText("JE #77")).toBeInTheDocument();
  });

  it("completes reconciliation after start", async () => {
    const startFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    const completeFn = vi
      .fn()
      .mockResolvedValue({ id: "recon-1", reconciledAt: new Date().toISOString() });
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: startFn, isPending: false });
    mockUseCompleteReconciliation.mockReturnValue({ mutateAsync: completeFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /complete reconciliation/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /complete reconciliation/i }));
    await waitFor(() => expect(screen.getByText(/reconciliation complete/i)).toBeInTheDocument());
  });

  it("cancels reconciliation after start", async () => {
    const startFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    const cancelFn = vi.fn().mockResolvedValue(undefined);
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: startFn, isPending: false });
    mockUseCancelReconciliation.mockReturnValue({ mutateAsync: cancelFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelFn).toHaveBeenCalledWith("recon-1"));
  });

  it("shows error when reconciliation complete fails", async () => {
    const startFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    const completeFn = vi.fn().mockRejectedValue(new Error("Out of balance"));
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: startFn, isPending: false });
    mockUseCompleteReconciliation.mockReturnValue({ mutateAsync: completeFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    fireEvent.click(await screen.findByRole("button", { name: /complete reconciliation/i }));
    await waitFor(() => expect(screen.getByText("Out of balance")).toBeInTheDocument());
  });

  it("shows pending reconciliation action labels", async () => {
    const startFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: startFn, isPending: false });
    mockUseCompleteReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    mockUseCancelReconciliation.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    expect(await screen.findByRole("button", { name: /completing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelling/i })).toBeInTheDocument();
  });

  it("shows fallback error when cancel reconciliation throws non-Error", async () => {
    const startFn = vi.fn().mockResolvedValue({ id: "recon-1" });
    const cancelFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateReconciliation.mockReturnValue({ mutateAsync: startFn, isPending: false });
    mockUseCancelReconciliation.mockReturnValue({ mutateAsync: cancelFn, isPending: false });
    render(<BankAccountDetailPage />);
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: /start reconciliation/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByText(/unable to cancel reconciliation/i)).toBeInTheDocument(),
    );
  });

  it("shows full transaction description as title attribute on truncated cell", () => {
    render(<BankAccountDetailPage />);
    expect(screen.getByTitle("Grant payment received")).toBeInTheDocument();
  });
});
