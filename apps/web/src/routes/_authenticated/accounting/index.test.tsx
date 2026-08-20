import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockUseSession,
  mockUseOrgProfile,
  mockUseTrialBalance,
  mockUseFiscalPeriods,
  mockUseJournalEntries,
  mockUseSeedOpeningBalances,
  mockUseSeedChartOfAccounts,
  mockUseEnableAccounting,
  mockUseBankAccounts,
  mockUseCreateJournalEntry,
  mockUseAccounts,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgProfile: vi.fn(),
  mockUseTrialBalance: vi.fn(),
  mockUseFiscalPeriods: vi.fn(),
  mockUseJournalEntries: vi.fn(),
  mockUseSeedOpeningBalances: vi.fn(),
  mockUseSeedChartOfAccounts: vi.fn(),
  mockUseEnableAccounting: vi.fn(),
  mockUseBankAccounts: vi.fn(),
  mockUseCreateJournalEntry: vi.fn(),
  mockUseAccounts: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => {
    let href = to ?? "";
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        href = href.replace(`$${k}`, v);
      });
    }
    return (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../hooks/use-org-settings", () => ({ useOrgProfile: () => mockUseOrgProfile() }));
vi.mock("../../../hooks/use-accounting", () => ({
  useTrialBalance: () => mockUseTrialBalance(),
  useFiscalPeriods: () => mockUseFiscalPeriods(),
  useJournalEntries: () => mockUseJournalEntries(),
  useSeedOpeningBalances: () => mockUseSeedOpeningBalances(),
  useSeedChartOfAccounts: () => mockUseSeedChartOfAccounts(),
  useEnableAccounting: () => mockUseEnableAccounting(),
  useBankAccounts: () => mockUseBankAccounts(),
  useCreateJournalEntry: () => mockUseCreateJournalEntry(),
  useAccounts: () => mockUseAccounts(),
}));

import { AccountingDashboardPage } from "./index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseSession() {
  mockUseSession.mockReturnValue({ memberRole: "admin" });
}

function baseEnabledOrg() {
  mockUseOrgProfile.mockReturnValue({ data: { accountingEnabled: true }, isLoading: false });
}

function baseDisabledOrg() {
  mockUseOrgProfile.mockReturnValue({ data: { accountingEnabled: false }, isLoading: false });
}

function baseSeedMutation() {
  mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseSeedChartOfAccounts.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
}

function baseLoadedDashboard() {
  mockUseTrialBalance.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseFiscalPeriods.mockReturnValue({
    data: [{ id: "p1", name: "FY2026 Q1", status: "open" }],
    isLoading: false,
  });
  mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
  mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AccountingDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
  });

  it("shows loading skeleton while org profile is loading", () => {
    baseSession();
    mockUseOrgProfile.mockReturnValue({ data: undefined, isLoading: true });
    render(<AccountingDashboardPage />);
    // Skeleton placeholders are present (data-slot="skeleton")
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows AccountingDisabledCard when accountingEnabled is false", () => {
    baseSession();
    baseDisabledOrg();
    baseSeedMutation();
    render(<AccountingDashboardPage />);
    expect(screen.getByText("Enable Double-Entry Accounting")).toBeInTheDocument();
  });

  it("shows Preview & Enable button for admin", () => {
    baseSession();
    baseDisabledOrg();
    baseSeedMutation();
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("button", { name: /preview & enable/i })).toBeInTheDocument();
  });

  it("shows message to non-admin when accounting is disabled", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    baseDisabledOrg();
    baseSeedMutation();
    render(<AccountingDashboardPage />);
    expect(screen.getByText(/ask an admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
  });

  it("shows dashboard content when accountingEnabled is true", () => {
    baseSession();
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("heading", { name: "Accounting" })).toBeInTheDocument();
    expect(screen.getByText("Cash Balance")).toBeInTheDocument();
    expect(screen.getByText("Open Fiscal Period")).toBeInTheDocument();
    expect(screen.getByText("Net Assets")).toBeInTheDocument();
  });

  it("shows open period name in dashboard", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026 Q1", status: "open" }],
      isLoading: false,
    });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("FY2026 Q1")).toBeInTheDocument();
  });

  it("shows 'None' when no open fiscal period", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026", status: "closed" }],
      isLoading: false,
    });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("links to period setup when no open fiscal period exists", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026", status: "closed" }],
      isLoading: false,
    });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    const setupLink = screen.getByRole("link", { name: /set up a period/i });
    expect(setupLink).toHaveAttribute("href", "/accounting/periods");
  });

  it("links to period management when an open fiscal period exists", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2026 Q1", status: "open" }],
      isLoading: false,
    });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    const viewLink = screen.getByRole("link", { name: /view periods/i });
    expect(viewLink).toHaveAttribute("href", "/accounting/periods");
  });

  it("shows recent journal entries table", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({
      data: [
        {
          id: "je-1",
          entryNumber: 1,
          date: "2026-01-15T00:00:00.000Z",
          memo: "Test entry",
          source: "manual",
          lines: [{ debitCents: 5000, creditCents: 0, reconciliationId: null }],
        },
      ],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Test entry")).toBeInTheDocument();
  });

  it("shows empty message when no recent entries", () => {
    baseSession();
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByText("No journal entries yet")).toBeInTheDocument();
  });

  it("shows error alert when trial balance fails", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("Unable to load accounting data.")).toBeInTheDocument();
  });

  it("calls seed mutation on Preview & Enable click", async () => {
    baseSession();
    baseDisabledOrg();
    const mutateFn = vi.fn().mockResolvedValue({
      dryRun: true,
      donations: 10,
      expenses: 5,
      estimatedJEs: 20,
    });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    const btn = screen.getByRole("button", { name: /preview & enable/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ dryRun: true }));
  });

  it("shows preview dialog with stats after dry-run", async () => {
    baseSession();
    baseDisabledOrg();
    const mutateFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 10, expenses: 5, estimatedJEs: 20 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.getByText("Donations")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("closes preview dialog on Cancel click", async () => {
    baseSession();
    baseDisabledOrg();
    const mutateFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 1, expenses: 1, estimatedJEs: 2 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() =>
      expect(screen.getByText("Preview: Opening Balances Seeding")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Preview: Opening Balances Seeding")).not.toBeInTheDocument(),
    );
  });

  it("requires an explicit confirmation before enabling accounting", async () => {
    baseSession();
    baseDisabledOrg();
    const seedMutate = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 10, expenses: 5, estimatedJEs: 20 });
    const enableMutate = vi.fn().mockResolvedValue({});
    const coaMutate = vi.fn().mockResolvedValue({});
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: seedMutate, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableMutate, isPending: false });
    mockUseSeedChartOfAccounts.mockReturnValue({ mutateAsync: coaMutate, isPending: false });

    render(<AccountingDashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() =>
      expect(screen.getByText("Preview: Opening Balances Seeding")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const enableButton = await screen.findByRole("button", { name: "Enable" });
    expect(enableButton).toBeDisabled();
  });

  it("closes confirm dialog on Cancel click", async () => {
    baseSession();
    baseDisabledOrg();
    const seedMutate = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 1, expenses: 1, estimatedJEs: 2 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: seedMutate, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() =>
      expect(screen.getByText("Preview: Opening Balances Seeding")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /enable accounting/i });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /enable accounting/i })).not.toBeInTheDocument(),
    );
  });

  it("shows error message when seed dry-run fails", async () => {
    baseSession();
    baseDisabledOrg();
    const mutateFn = vi.fn().mockRejectedValue(new Error("Seed failed"));
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Seed failed")).toBeInTheDocument();
  });

  it("calculates cash balance from asset accounts whose code starts with '10' (FASB 1xxx range)", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [
        {
          account: {
            id: "1",
            code: "1010",
            name: "Checking",
            type: "asset",
            subtype: "current_asset",
            isActive: true,
          },
          debitTotal: 100000,
          creditTotal: 0,
          balance: 100000,
        },
        {
          account: {
            id: "2",
            code: "2000",
            name: "Payables",
            type: "liability",
            subtype: null,
            isActive: true,
          },
          debitTotal: 0,
          creditTotal: 20000,
          balance: 20000,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    // Cash balance card shows $1,000 (100000 cents)
    expect(screen.getByText("$1,000")).toBeInTheDocument();
  });

  it("shows loading skeleton in fiscal period card when periods are loading", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: true });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows loading skeleton in net assets card when trial balance is loading", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows loading skeleton in recent journal entries section when entries are loading", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: undefined, isLoading: true });
    render(<AccountingDashboardPage />);
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows None when no open period exists", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2025 Q4", status: "closed" }],
      isLoading: false,
    });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows fallback error when seed dry-run throws non-Error", async () => {
    baseSession();
    baseDisabledOrg();
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to preview seeding/i)).toBeInTheDocument();
  });

  it("shows fallback error when enable mutation throws non-Error", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 1, expenses: 1, estimatedJEs: 2 });
    const enableFn = vi.fn().mockRejectedValue("string error");
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableFn, isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/i understand this will post opening balances/i));
    const confirmBtn = await screen.findByRole("button", { name: /^enable$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText(/unable to enable accounting/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows Loading… text when seed mutation is pending", () => {
    baseSession();
    baseDisabledOrg();
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("button", { name: /loading/i })).toBeInTheDocument();
  });

  it("shows Enabling… text while the enable sequence is in flight", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 2, expenses: 1, estimatedJEs: 4 });
    let resolveEnable: (() => void) | undefined;
    const enableFn = vi
      .fn()
      .mockImplementation(() => new Promise<void>((resolve) => (resolveEnable = resolve)));
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableFn, isPending: false });
    mockUseSeedChartOfAccounts.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/i understand this will post opening balances/i));
    fireEvent.click(await screen.findByRole("button", { name: /^enable$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /enabling/i })).toBeInTheDocument(),
    );
    resolveEnable!();
  });

  it("shows - when recent journal entry memo is null", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({
      data: [
        {
          id: "je-1",
          entryNumber: 1,
          date: "2026-01-15T00:00:00.000Z",
          memo: null,
          source: "manual",
          lines: [{ debitCents: 5000, creditCents: 0, reconciliationId: null }],
        },
      ],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("excludes non-cash asset accounts (code outside 10xx) from the cash balance", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [
        {
          account: {
            id: "1",
            code: "1500",
            name: "Fixed Assets",
            type: "asset",
            subtype: "fixed_asset",
            isActive: true,
          },
          debitTotal: 50000,
          creditTotal: 0,
          balance: 50000,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    // Fixed assets (code 1500, not in 10xx range) excluded — cash balance is $0
    expect(screen.getAllByText("$0").length).toBeGreaterThanOrEqual(1);
  });

  it("calls refetch when Try again button is clicked on error", async () => {
    baseSession();
    baseEnabledOrg();
    const refetchFn = vi.fn();
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainBtn);
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("shows Accounting enabled message after enable completes", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 5, expenses: 2, estimatedJEs: 10 });
    const enableFn = vi.fn().mockResolvedValue({});
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableFn, isPending: false });
    render(<AccountingDashboardPage />);
    // Click Preview & Enable to trigger dry run
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    // Wait for preview dialog to appear
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    // Click Continue to open confirm dialog
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    // The confirm dialog has a button labeled "Enable"
    fireEvent.click(await screen.findByLabelText(/i understand this will post opening balances/i));
    const confirmBtn = await screen.findByRole("button", { name: /^enable$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getByText(/accounting enabled/i)).toBeInTheDocument());
  });

  it("guards the Enable button against a double submission", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 5, expenses: 2, estimatedJEs: 10 });
    let resolveEnable: (() => void) | undefined;
    const enableFn = vi
      .fn()
      .mockImplementation(() => new Promise<void>((resolve) => (resolveEnable = resolve)));
    const coaFn = vi.fn().mockResolvedValue({});
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableFn, isPending: false });
    mockUseSeedChartOfAccounts.mockReturnValue({ mutateAsync: coaFn, isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/i understand this will post opening balances/i));
    const confirmBtn = await screen.findByRole("button", { name: /^enable$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(confirmBtn).toBeDisabled());
    fireEvent.click(confirmBtn);
    expect(enableFn).toHaveBeenCalledTimes(1);
    resolveEnable!();
  });

  it("opens confirm dialog when Continue is clicked in preview dialog", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 3, expenses: 1, estimatedJEs: 7 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    // The confirm dialog heading appears
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /enable accounting/i })).toBeInTheDocument(),
    );
  });

  it("closes the preview dialog when Cancel is clicked", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 3, expenses: 1, estimatedJEs: 7 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() =>
      expect(screen.getByText("Preview: Opening Balances Seeding")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Preview: Opening Balances Seeding")).not.toBeInTheDocument();
  });

  it("closes the confirm dialog when Cancel is clicked", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 3, expenses: 1, estimatedJEs: 7 });
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: /enable accounting/i })).not.toBeInTheDocument();
  });

  it("shows error when enable mutation fails", async () => {
    baseSession();
    baseDisabledOrg();
    const dryRunFn = vi
      .fn()
      .mockResolvedValue({ dryRun: true, donations: 2, expenses: 1, estimatedJEs: 5 });
    const enableFn = vi.fn().mockRejectedValue(new Error("Enable failed"));
    mockUseSeedOpeningBalances.mockReturnValue({ mutateAsync: dryRunFn, isPending: false });
    mockUseEnableAccounting.mockReturnValue({ mutateAsync: enableFn, isPending: false });
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /preview & enable/i }));
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByLabelText(/i understand this will post opening balances/i));
    const confirmBtn = await screen.findByRole("button", { name: /^enable$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText("Enable failed").length).toBeGreaterThanOrEqual(1);
  });

  it("calculates net assets from trial balance net_assets accounts", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [
        {
          account: {
            id: "1",
            code: "3000",
            name: "Unrestricted Net Assets",
            type: "net_assets",
            subtype: null,
            isActive: true,
            naturalRestriction: "unrestricted",
          },
          debitTotal: 0,
          creditTotal: 50000,
          balance: 50000,
        },
        {
          account: {
            id: "2",
            code: "3100",
            name: "Temp Restricted",
            type: "net_assets",
            subtype: null,
            isActive: true,
            naturalRestriction: "temporarily_restricted",
          },
          debitTotal: 0,
          creditTotal: 20000,
          balance: 20000,
        },
        {
          account: {
            id: "3",
            code: "3200",
            name: "Perm Restricted",
            type: "net_assets",
            subtype: null,
            isActive: true,
            naturalRestriction: "permanently_restricted",
          },
          debitTotal: 0,
          creditTotal: 10000,
          balance: 10000,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    // Unrestricted net assets: 50000 cents = $500
    expect(screen.getByText("$500")).toBeInTheDocument();
    // Temp restricted: 20000 cents = $200
    expect(screen.getByText("$200")).toBeInTheDocument();
    // Perm restricted: 10000 cents = $100
    expect(screen.getByText("$100")).toBeInTheDocument();
    // Net-asset class labels are spelled out in full (ASC 958 classifications),
    // matching the rest of the app (funds, donation form, pledges) — never abbreviated.
    expect(screen.getByText("Unrestricted")).toBeInTheDocument();
    expect(screen.getByText("Temporarily restricted")).toBeInTheDocument();
    expect(screen.getByText("Permanently restricted")).toBeInTheDocument();
    expect(screen.queryByText("Temp. restricted")).not.toBeInTheDocument();
    expect(screen.queryByText("Perm. restricted")).not.toBeInTheDocument();
    // Source caption clarifies the figures come from posted journal entries.
    expect(screen.getByText("From posted journal entries.")).toBeInTheDocument();
  });

  it("explains the empty net assets state when no journal entries are posted", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(
      screen.getByText("No journal entries yet. This fills in as you post them."),
    ).toBeInTheDocument();
    // The plain source caption is replaced by the empty-state explanation.
    expect(screen.queryByText("From posted journal entries.")).not.toBeInTheDocument();
  });

  it("shows mid-year caption when net assets are 0 but posted activity exists via recentEntries", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({
      data: [
        {
          id: "je1",
          entryNumber: 1,
          date: "2026-01-15T00:00:00.000Z",
          memo: "Cash receipt",
          source: "manual",
          lines: [{ debitCents: 42450, creditCents: 0, reconciliationId: null }],
        },
      ],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    expect(
      screen.getByText("Net assets update after you close a fiscal period."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No journal entries yet. This fills in as you post them."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("From posted journal entries.")).not.toBeInTheDocument();
  });

  it("shows mid-year caption when net assets are 0 but trial balance rows have non-zero balances", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [
        {
          account: {
            id: "10",
            code: "1010",
            name: "Checking",
            type: "asset",
            subtype: "current_asset",
            isActive: true,
            naturalRestriction: null,
          },
          debitTotal: 42450,
          creditTotal: 0,
          balance: 42450,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(
      screen.getByText("Net assets update after you close a fiscal period."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No journal entries yet. This fills in as you post them."),
    ).not.toBeInTheDocument();
  });

  it("shows Bank Accounts KPI card in dashboard", () => {
    baseSession();
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByText("Bank Accounts")).toBeInTheDocument();
  });

  it("bank accounts card Manage link points to /accounting/bank", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    mockUseBankAccounts.mockReturnValue({
      data: [{ id: "ba-1", name: "Checking", accountType: "checking" }],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    const manageLink = screen.getByRole("link", { name: /manage/i });
    expect(manageLink).toHaveAttribute("href", "/accounting/bank");
  });

  it("shows no bank accounts message when bank accounts list is empty", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("No bank accounts added.")).toBeInTheDocument();
  });

  it("shows bank account count when bank accounts are present", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    mockUseBankAccounts.mockReturnValue({
      data: [
        { id: "ba-1", name: "Checking", accountType: "checking" },
        { id: "ba-2", name: "Savings", accountType: "savings" },
      ],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/bank accounts added/i)).toBeInTheDocument();
  });

  it("shows singular 'bank account' label for exactly one bank account", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    mockUseBankAccounts.mockReturnValue({
      data: [{ id: "ba-1", name: "Checking", accountType: "checking" }],
      isLoading: false,
    });
    render(<AccountingDashboardPage />);
    expect(screen.getByText(/bank account added/i)).toBeInTheDocument();
  });

  it("shows loading skeleton in unreconciled card when bank accounts are loading", () => {
    baseSession();
    baseEnabledOrg();
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    mockUseJournalEntries.mockReturnValue({ data: [], isLoading: false });
    mockUseBankAccounts.mockReturnValue({ data: undefined, isLoading: true });
    render(<AccountingDashboardPage />);
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows 'New journal entry' button for admin on dashboard", () => {
    baseSession(); // admin
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("button", { name: /new journal entry/i })).toBeInTheDocument();
  });

  it("shows 'New journal entry' button for editor on dashboard", () => {
    mockUseSession.mockReturnValue({ memberRole: "editor" });
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("button", { name: /new journal entry/i })).toBeInTheDocument();
  });

  it("shows 'New journal entry' button for a viewer with accounting edit permission", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "edit" },
    });
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.getByRole("button", { name: /new journal entry/i })).toBeInTheDocument();
  });

  it("does not show 'New journal entry' button for viewer on dashboard", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    expect(screen.queryByRole("button", { name: /new journal entry/i })).not.toBeInTheDocument();
  });

  it("clicking 'New journal entry' opens the dialog", async () => {
    baseSession(); // admin
    baseEnabledOrg();
    baseLoadedDashboard();
    render(<AccountingDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /new journal entry/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
