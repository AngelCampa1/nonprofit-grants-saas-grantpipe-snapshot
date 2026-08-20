import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUseAccounts, mockUseAccountLedger } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
  mockUseAccountLedger: vi.fn(),
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
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) =>
    React.createElement("a", { href: `${to}?${new URLSearchParams(params).toString()}` }, children),
}));

vi.mock("../../../hooks/use-accounting", () => ({
  useAccounts: (params: unknown) => mockUseAccounts(params),
  useAccountLedger: (id: string, opts: unknown) => mockUseAccountLedger(id, opts),
}));

import { AccountLedgerPage } from "./ledger";

const SAMPLE_ACCOUNTS = [
  { id: "acc-1", code: "1000", name: "Cash", type: "asset", isActive: true },
  { id: "acc-2", code: "2000", name: "Accounts Payable", type: "liability", isActive: true },
];

const SAMPLE_LEDGER = {
  account: { id: "acc-1", code: "1000", name: "Cash", type: "asset" },
  lines: [
    {
      line: { debitCents: 10000, creditCents: 0, memo: "Opening balance" },
      journalEntry: {
        id: "je-1",
        entryNumber: 1,
        date: "2026-01-01T00:00:00.000Z",
        memo: "JE memo",
        source: "manual",
        isAdjusting: false,
      },
      runningBalance: 10000,
    },
    {
      line: { debitCents: 0, creditCents: 5000, memo: null },
      journalEntry: {
        id: "je-2",
        entryNumber: 2,
        date: "2026-01-15T00:00:00.000Z",
        memo: "Payment",
        source: "manual",
        isAdjusting: false,
      },
      runningBalance: 5000,
    },
  ],
};

// Helper to select an account from the dropdown
async function selectAccount(accountName: string) {
  const trigger = screen.getByRole("combobox");
  fireEvent.click(trigger);
  const listbox = await screen.findByRole("listbox");
  fireEvent.click(within(listbox).getByText(new RegExp(accountName, "i")));
}

describe("AccountLedgerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAccounts.mockReturnValue({ data: SAMPLE_ACCOUNTS, isLoading: false });
    mockUseAccountLedger.mockReturnValue({ data: undefined, isLoading: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page heading", () => {
    render(<AccountLedgerPage />);
    expect(screen.getByRole("heading", { name: "Account Ledger" })).toBeInTheDocument();
  });

  it("renders account selector with accounts", () => {
    render(<AccountLedgerPage />);
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("renders from and to date inputs", () => {
    render(<AccountLedgerPage />);
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("shows an outcome-led empty state that points at the in-page account picker", () => {
    render(<AccountLedgerPage />);
    // The empty state teaches the outcome instead of echoing the page title,
    // and its primary action opens the in-page account picker (a button) rather
    // than navigating away to the chart of accounts.
    expect(screen.getByText("See every transaction in an account")).toBeInTheDocument();
    expect(
      screen.getByText("Pick an account above. We list each entry and its balance."),
    ).toBeInTheDocument();
    expect(screen.queryByText("General ledger")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view chart of accounts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick an account" })).toBeInTheDocument();
  });

  it("opens the in-page account picker when the empty-state action is clicked", async () => {
    render(<AccountLedgerPage />);
    // Clicking the empty-state primary action should open the account Select
    // (it forwards the click to the in-page picker) rather than navigate away.
    fireEvent.click(screen.getByRole("button", { name: "Pick an account" }));
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText(/1000: Cash/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/2000: Accounts Payable/i)).toBeInTheDocument();
  });

  it("hides Export CSV button when no data", () => {
    render(<AccountLedgerPage />);
    expect(screen.queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
  });

  it("shows loading skeleton after account is selected and ledger is loading", async () => {
    mockUseAccountLedger.mockReturnValue({ data: undefined, isLoading: true });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(document.querySelector(".animate-pulse")).toBeInTheDocument());
  });

  it("shows error alert when ledger query fails", async () => {
    mockUseAccountLedger.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText(/unable to load ledger/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("refetches the ledger when Try again is clicked in the error state", async () => {
    const refetch = vi.fn();
    mockUseAccountLedger.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows no transactions message when lines are empty after account selection", async () => {
    mockUseAccountLedger.mockReturnValue({
      data: { account: SAMPLE_ACCOUNTS[0], lines: [] },
      isLoading: false,
    });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() =>
      expect(screen.getByText(/no transactions for this account/i)).toBeInTheDocument(),
    );
  });

  it("shows ledger table with transaction rows after account selection", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText("Opening balance")).toBeInTheDocument());
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("adds a title to truncated memo cells", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    const memo = await screen.findByText("Opening balance");
    expect(memo.closest("td")).toHaveAttribute("title", "Opening balance");
  });

  it("falls back to journal entry memo and dash memo in ledger rows", async () => {
    mockUseAccountLedger.mockReturnValue({
      data: {
        account: { id: "acc-1", code: "1000", name: "Cash", type: "net_assets_restricted" },
        lines: [
          {
            line: { debitCents: 2500, creditCents: 0, memo: null },
            journalEntry: {
              id: "je-3",
              entryNumber: 3,
              date: "2026-02-01T00:00:00.000Z",
              memo: "Entry-level memo",
              source: "manual",
              isAdjusting: false,
            },
            runningBalance: 2500,
          },
          {
            line: { debitCents: 0, creditCents: 0, memo: null },
            journalEntry: {
              id: "je-4",
              entryNumber: 4,
              date: "2026-02-02T00:00:00.000Z",
              memo: null,
              source: "manual",
              isAdjusting: false,
            },
            runningBalance: 2500,
          },
        ],
      },
      isLoading: false,
    });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText("Entry-level memo")).toBeInTheDocument());
    expect(screen.getByText("net assets restricted")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
  });

  it("shows debit and credit amounts formatted as currency in ledger rows", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    // Wait for the table to appear
    await waitFor(() => expect(screen.getByText("Opening balance")).toBeInTheDocument());
    // Debit for first row (10000 cents = $100)
    const debitCells = screen.getAllByText(/\$\d+/);
    expect(debitCells.length).toBeGreaterThan(0);
    // credit shows "-" since debitCents = 0 for second row
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("shows dash when both line and journal entry memos are blank", async () => {
    const firstLine = SAMPLE_LEDGER.lines[0]!;
    mockUseAccountLedger.mockReturnValue({
      data: {
        ...SAMPLE_LEDGER,
        lines: [
          {
            ...firstLine,
            line: { ...firstLine.line, memo: null },
            journalEntry: { ...firstLine.journalEntry, memo: null },
          },
        ],
      },
      isLoading: false,
    });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("shows account name and type metadata after selecting account with data", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText("Cash")).toBeInTheDocument());
    expect(screen.getByText("asset")).toBeInTheDocument();
  });

  it("shows Export CSV button when ledger data with lines is present", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument(),
    );
  });

  it("triggers CSV download on export button click", async () => {
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURLSpy = vi.fn();
    const clickSpy = vi.fn();

    Object.defineProperty(window, "URL", {
      value: { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy },
      writable: true,
    });
    const origAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((el) => {
      if (el instanceof HTMLAnchorElement) {
        el.click = clickSpy;
      }
      return origAppendChild(el);
    });
    const origRemoveChild = document.body.removeChild.bind(document.body);
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => origRemoveChild(el));

    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    const exportBtn = await screen.findByRole("button", { name: /export csv/i });
    fireEvent.click(exportBtn);
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
  });

  it("exports a blank memo when both line and journal memos are absent", async () => {
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:fake");
    Object.defineProperty(window, "URL", {
      value: { createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() },
      writable: true,
    });
    const origAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((el) => {
      if (el instanceof HTMLAnchorElement) {
        el.click = vi.fn();
      }
      return origAppendChild(el);
    });
    const origRemoveChild = document.body.removeChild.bind(document.body);
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => origRemoveChild(el));

    mockUseAccountLedger.mockReturnValue({
      data: {
        account: { id: "acc-1", code: "1000", name: "Cash", type: "asset" },
        lines: [
          {
            line: { debitCents: 0, creditCents: 1000, memo: null },
            journalEntry: {
              id: "je-5",
              entryNumber: 5,
              date: "2026-03-01T00:00:00.000Z",
              memo: null,
              source: "manual",
              isAdjusting: false,
            },
            runningBalance: -1000,
          },
        ],
      },
      isLoading: false,
    });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    fireEvent.click(await screen.findByRole("button", { name: /export csv/i }));
    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("passes from and to date filters to useAccountLedger", async () => {
    render(<AccountLedgerPage />);
    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    fireEvent.change(fromInput, { target: { value: "2026-01-01" } });
    fireEvent.change(toInput, { target: { value: "2026-03-31" } });
    await waitFor(() =>
      expect(mockUseAccountLedger).toHaveBeenCalledWith(
        "",
        expect.objectContaining({
          from: expect.stringContaining("2026-01-01"),
          to: expect.stringContaining("2026-03-31"),
        }),
      ),
    );
  });

  it("calls useAccountLedger with selected account id after selection", async () => {
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() =>
      expect(mockUseAccountLedger).toHaveBeenCalledWith(
        "acc-1",
        expect.objectContaining({ from: undefined, to: undefined }),
      ),
    );
  });

  it("renders with empty accounts list gracefully", () => {
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<AccountLedgerPage />);
    expect(screen.getByText("See every transaction in an account")).toBeInTheDocument();
  });

  it("renders with undefined accounts gracefully", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: false });
    render(<AccountLedgerPage />);
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("renders JE ref as a link to the journal entry detail page", async () => {
    mockUseAccountLedger.mockReturnValue({ data: SAMPLE_LEDGER, isLoading: false });
    render(<AccountLedgerPage />);
    await selectAccount("Cash");
    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());
    const link = screen.getByText("#1").closest("a");
    expect(link).not.toBeNull();
  });
});
