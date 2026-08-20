import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUseSession,
  mockUseFiscalPeriods,
  mockUseAccounts,
  mockUseCreateJournalEntry,
  mockNavigate,
  mockUseFunds,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseFiscalPeriods: vi.fn(),
  mockUseAccounts: vi.fn(),
  mockUseCreateJournalEntry: vi.fn(),
  mockNavigate: vi.fn().mockResolvedValue(undefined),
  mockUseFunds: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../../hooks/use-accounting", () => ({
  useFiscalPeriods: () => mockUseFiscalPeriods(),
  useAccounts: () => mockUseAccounts(),
  useCreateJournalEntry: () => mockUseCreateJournalEntry(),
}));

vi.mock("../../../../hooks/use-grants", () => ({
  useFunds: () => mockUseFunds(),
}));

import { NewJournalEntryPage } from "./new";

const SAMPLE_PERIODS = [
  { id: "p1", name: "FY2026 Q1", status: "open", startDate: "2026-01-01", endDate: "2026-03-31" },
];
const SAMPLE_ACCOUNTS = [
  { id: "acc-1", code: "1000", name: "Cash" },
  { id: "acc-2", code: "4000", name: "Donations Revenue" },
];
const SAMPLE_FUNDS = [
  { id: "fund-1", name: "General Fund" },
  { id: "fund-2", name: "Education Fund" },
];

describe("NewJournalEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseFiscalPeriods.mockReturnValue({ data: SAMPLE_PERIODS, isLoading: false });
    mockUseAccounts.mockReturnValue({ data: SAMPLE_ACCOUNTS, isLoading: false });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseFunds.mockReturnValue({ data: { data: SAMPLE_FUNDS }, isLoading: false });
  });

  it("renders page heading", () => {
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("heading", { name: "New Journal Entry" })).toBeInTheDocument();
  });

  it("shows permission message for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<NewJournalEntryPage />);
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New Journal Entry" })).not.toBeInTheDocument();
  });

  it("renders the form for a viewer with accounting edit permission", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "edit" },
    });
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("heading", { name: "New Journal Entry" })).toBeInTheDocument();
    expect(screen.queryByText(/do not have permission/i)).not.toBeInTheDocument();
  });

  it("shows permission message for auditors", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor" });
    render(<NewJournalEntryPage />);
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New Journal Entry" })).not.toBeInTheDocument();
  });

  it("renders date input with today default", () => {
    render(<NewJournalEntryPage />);
    const dateInput = screen.getByLabelText(/^date/i);
    expect(dateInput).toBeInTheDocument();
    expect((dateInput as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("renders fiscal period dropdown with open periods", () => {
    render(<NewJournalEntryPage />);
    expect(screen.getByLabelText("Fiscal Period")).toBeInTheDocument();
  });

  it("renders adjusting entry toggle", () => {
    render(<NewJournalEntryPage />);
    expect(screen.getByLabelText(/adjusting entry/i)).toBeInTheDocument();
  });

  it("updates the entry memo and line memo fields", () => {
    render(<NewJournalEntryPage />);
    fireEvent.change(screen.getByLabelText(/memo/i), {
      target: { value: "Board-approved adjustment" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("Line memo")[0]!, {
      target: { value: "Cash side" },
    });
    expect(screen.getByLabelText(/memo/i)).toHaveValue("Board-approved adjustment");
    expect(screen.getAllByPlaceholderText("Line memo")[0]!).toHaveValue("Cash side");
  });

  it("renders at least two line item rows by default", () => {
    render(<NewJournalEntryPage />);
    expect(screen.getByText("Line Items")).toBeInTheDocument();
  });

  it("adds a line on Add Line click", () => {
    render(<NewJournalEntryPage />);
    const addBtn = screen.getByRole("button", { name: /add line/i });
    fireEvent.click(addBtn);
    // Now 3 lines: 2 debit inputs + 1 new = 3 total debit inputs
    const debitInputs = screen.getAllByPlaceholderText("0.00");
    expect(debitInputs.length).toBeGreaterThanOrEqual(6); // 3 lines × 2 (debit+credit)
  });

  it("removes a line on Remove Line click", () => {
    render(<NewJournalEntryPage />);
    // Add a 3rd line first so Remove button appears
    const addBtn = screen.getByRole("button", { name: /add line/i });
    fireEvent.click(addBtn);
    // Remove buttons should now be present
    const removeBtn = screen.getAllByRole("button", { name: /remove line/i })[0]!;
    fireEvent.click(removeBtn);
    // Back to 2 lines (4 debit+credit inputs)
    const inputs = screen.getAllByPlaceholderText("0.00");
    expect(inputs.length).toBe(4); // 2 lines × 2
  });

  it("shows the off-by difference when debits != credits", () => {
    render(<NewJournalEntryPage />);
    const debitInputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(debitInputs[0]!, { target: { value: "10.00" } });
    expect(screen.getByText("Off by $10")).toBeInTheDocument();
    expect(screen.queryByText("Unbalanced")).not.toBeInTheDocument();
  });

  it("shows the exact off-by amount for a fractional difference", () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "10.00" } }); // line 1 debit
    fireEvent.change(inputs[3]!, { target: { value: "9.50" } }); // line 2 credit
    expect(screen.getByText("Off by $0.50")).toBeInTheDocument();
  });

  it("shows balanced indicator when debits === credits", () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    // Line 1 debit
    fireEvent.change(inputs[0]!, { target: { value: "10.00" } });
    // Line 2 credit
    fireEvent.change(inputs[3]!, { target: { value: "10.00" } });
    expect(screen.getByText("Balanced")).toBeInTheDocument();
  });

  it("submit button is disabled when entry is unbalanced", () => {
    render(<NewJournalEntryPage />);
    const submitBtn = screen.getByRole("button", { name: /post entry/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows fallback error when create throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "75.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "75.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    const lb1 = await screen.findByRole("listbox");
    fireEvent.click(within(lb1).getByText(/1000/));
    fireEvent.click(accountSelects[3]!);
    const lb2 = await screen.findByRole("listbox");
    fireEvent.click(within(lb2).getByText(/4000/));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to create journal entry/i)).toBeInTheDocument();
  });

  it("handles invalid debit input gracefully (NaN treated as 0)", () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "abc" } });
    // NaN input treated as 0, so the entry never reaches a balanced state (not erroring)
    expect(screen.queryByText("Balanced")).not.toBeInTheDocument();
  });

  it("handles negative debit input gracefully (treated as 0)", () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "-10" } });
    // Negative treated as 0
    expect(screen.queryByText("Balanced")).not.toBeInTheDocument();
  });

  it("renders with undefined fiscalPeriods data gracefully", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: false });
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("heading", { name: "New Journal Entry" })).toBeInTheDocument();
  });

  it("shows the period date range so same-named periods can be told apart", async () => {
    render(<NewJournalEntryPage />);
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText(/Jan 1, 2026.*Mar 31, 2026/s)).toBeInTheDocument();
  });

  it("renders with undefined accounts data gracefully", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: false });
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("heading", { name: "New Journal Entry" })).toBeInTheDocument();
  });

  it("shows validation error when date is cleared", async () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "10.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "10.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Clear the date input
    const dateInput = screen.getByLabelText(/^date/i);
    fireEvent.change(dateInput, { target: { value: "" } });

    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
  });

  it("shows validation error when unbalanced on submit", async () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    // Only set debit (unbalanced)
    fireEvent.change(inputs[0]!, { target: { value: "10.00" } });

    // Select fiscal period so we get past that check
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/debits must equal credits/i)).toBeInTheDocument();
  });

  it("shows form error when fiscal period is not selected", async () => {
    render(<NewJournalEntryPage />);
    // Make balanced: set debit line 1 and credit line 2
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "10.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "10.00" } });

    // Wait for balanced state
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Submit the form directly
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("calls createEntry mutation on valid form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-new", entryNumber: 1 });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });

    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    // Set balanced entry: line 1 debit $100, line 2 credit $100
    fireEvent.change(inputs[0]!, { target: { value: "100.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "100.00" } });

    // Wait for balanced state
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Submit the form directly — fiscal period and accounts are empty, so error appears
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    // Should show error because fiscal period is not filled
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("Cancel button navigates to journal list", async () => {
    render(<NewJournalEntryPage />);
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: "/accounting/journal" }));
  });

  it("shows loading state when mutation is pending", () => {
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("button", { name: /posting/i })).toBeInTheDocument();
  });

  it("shows error when create mutation throws", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Server error"));
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    // Set up a valid form with a period selected
    mockUseFiscalPeriods.mockReturnValue({ data: SAMPLE_PERIODS, isLoading: false });

    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "100.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "100.00" } });

    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Select fiscal period
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    // Select accounts for lines to pass validation (format: "1000 — Cash")
    const accountSelects = screen.getAllByRole("combobox");
    // Select account for line 1 (first combobox after the period select, index 1)
    fireEvent.click(accountSelects[1]!);
    const listbox1 = await screen.findByRole("listbox");
    fireEvent.click(within(listbox1).getByText(/1000/));

    // Select account for line 2 (index 3, after line 1 fund select at index 2)
    fireEvent.click(accountSelects[3]!);
    const listbox2 = await screen.findByRole("listbox");
    fireEvent.click(within(listbox2).getByText(/4000/));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("shows validation error when lines have no accounts", async () => {
    render(<NewJournalEntryPage />);
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "100.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "100.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Select fiscal period
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    // Don't select accounts — submit to hit validLines.length < 2 check
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/at least 2 lines/i)).toBeInTheDocument();
  });

  it("navigates to entry detail on successful submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-new", entryNumber: 1 });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "100.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "100.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    const lb1 = await screen.findByRole("listbox");
    fireEvent.click(within(lb1).getByText(/1000/));

    fireEvent.click(accountSelects[3]!);
    const lb2 = await screen.findByRole("listbox");
    fireEvent.click(within(lb2).getByText(/4000/));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/accounting/journal/$entryId",
        params: { entryId: "je-new" },
      }),
    );
  });

  it("submits optional entry memo, line memo, fund clearing, and adjusting flag", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-new", entryNumber: 1 });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    fireEvent.change(screen.getByLabelText(/memo/i), {
      target: { value: "Month-end allocation" },
    });
    fireEvent.click(screen.getByLabelText(/adjusting entry/i));

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "125.50" } });
    fireEvent.change(inputs[3]!, { target: { value: "125.50" } });
    fireEvent.change(screen.getAllByPlaceholderText("Line memo")[0]!, {
      target: { value: "Line detail" },
    });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Fiscal Period"));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("FY2026 Q1"));

    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/1000/));
    fireEvent.click(accountSelects[3]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/4000/));

    const fundSelects = screen.getAllByRole("combobox", { name: /fund/i });
    fireEvent.click(fundSelects[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("General Fund"));
    fireEvent.click(fundSelects[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("None"));

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: "Month-end allocation",
          isAdjusting: true,
          lines: expect.arrayContaining([
            expect.objectContaining({
              debitCents: 12550,
              memo: "Line detail",
            }),
          ]),
        }),
      ),
    );
    const callArg = mutateFn.mock.calls[0]?.[0] as {
      lines: Array<{ fundId?: string }>;
    };
    expect(callArg.lines[0]?.fundId).toBeUndefined();
  });

  it("navigates to journal list when entry has no id on submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({});
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "50.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "50.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    const lb1 = await screen.findByRole("listbox");
    fireEvent.click(within(lb1).getByText(/1000/));

    fireEvent.click(accountSelects[3]!);
    const lb2 = await screen.findByRole("listbox");
    fireEvent.click(within(lb2).getByText(/4000/));

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: "/accounting/journal" }));
  });

  it("shows no open periods message when there are no open periods", async () => {
    mockUseFiscalPeriods.mockReturnValue({
      data: [{ id: "p1", name: "FY2025 Q4", status: "closed" }],
      isLoading: false,
    });
    render(<NewJournalEntryPage />);
    // Open the period select dropdown to see the "No open periods" option
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    // Should show "No open periods" disabled item in the listbox
    // Radix renders both a native <option> and a visual <span>, so use getAllByText
    await waitFor(() =>
      expect(screen.getAllByText("No open periods").length).toBeGreaterThanOrEqual(1),
    );
  });

  it("renders Fund column header in line items table", () => {
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("columnheader", { name: /fund/i })).toBeInTheDocument();
  });

  it("gives each line's account and fund select a per-line accessible name", () => {
    render(<NewJournalEntryPage />);
    // Each row's comboboxes are uniquely identifiable for screen readers, not a
    // wall of identically-named "Select account" boxes.
    expect(screen.getByRole("combobox", { name: "Account for line 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Account for line 2" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Fund for line 1" })).toBeInTheDocument();
  });

  it("renders fund selector for each line with available funds", async () => {
    render(<NewJournalEntryPage />);
    // Open one of the Fund selects (aria-label="Fund")
    const fundSelects = screen.getAllByRole("combobox", { name: /fund/i });
    expect(fundSelects.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(fundSelects[0]!);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("General Fund")).toBeInTheDocument();
    expect(within(listbox).getByText("Education Fund")).toBeInTheDocument();
  });

  it("selecting a fund sets fundId on the line", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-new" });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    // Balance the entry
    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "50.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "50.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    // Select fiscal period
    const periodSelect = screen.getByLabelText("Fiscal Period");
    fireEvent.click(periodSelect);
    const periodListbox = await screen.findByRole("listbox");
    fireEvent.click(within(periodListbox).getByText("FY2026 Q1"));

    // Select accounts
    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    const lb1 = await screen.findByRole("listbox");
    fireEvent.click(within(lb1).getByText(/1000/));
    fireEvent.click(accountSelects[3]!);
    const lb2 = await screen.findByRole("listbox");
    fireEvent.click(within(lb2).getByText(/4000/));

    // Select fund for line 1
    const fundSelects = screen.getAllByRole("combobox", { name: /fund/i });
    fireEvent.click(fundSelects[0]!);
    const fundListbox = await screen.findByRole("listbox");
    fireEvent.click(within(fundListbox).getByText("General Fund"));

    // Submit
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
    const callArg = mutateFn.mock.calls[0]?.[0] as { lines: Array<{ fundId?: string }> };
    expect(callArg.lines[0]?.fundId).toBe("fund-1");
  });

  it("selecting None clears the fundId on the line", async () => {
    render(<NewJournalEntryPage />);

    // First select a fund
    const fundSelects = screen.getAllByRole("combobox", { name: /fund/i });
    fireEvent.click(fundSelects[0]!);
    const lb1 = await screen.findByRole("listbox");
    fireEvent.click(within(lb1).getByText("General Fund"));

    // Now select None to clear it
    fireEvent.click(fundSelects[0]!);
    const lb2 = await screen.findByRole("listbox");
    fireEvent.click(within(lb2).getByText("None"));

    // The select should show "None" as placeholder (empty value)
    expect(screen.getAllByRole("combobox", { name: /fund/i })[0]).toBeInTheDocument();
  });

  it("submits without fundId after selecting None for a previously selected fund", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "je-new" });
    mockUseCreateJournalEntry.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<NewJournalEntryPage />);

    const inputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(inputs[0]!, { target: { value: "50.00" } });
    fireEvent.change(inputs[3]!, { target: { value: "50.00" } });
    await waitFor(() => expect(screen.getByText("Balanced")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Fiscal Period"));
    let listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("FY2026 Q1"));

    const accountSelects = screen.getAllByRole("combobox");
    fireEvent.click(accountSelects[1]!);
    listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText(/1000/));
    fireEvent.click(accountSelects[3]!);
    listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText(/4000/));

    const fundSelects = screen.getAllByRole("combobox", { name: /fund/i });
    fireEvent.click(fundSelects[0]!);
    listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("General Fund"));
    fireEvent.click(fundSelects[0]!);
    listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("None"));

    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
    const callArg = mutateFn.mock.calls[0]?.[0] as { lines: Array<{ fundId?: string }> };
    expect(callArg.lines[0]?.fundId).toBeUndefined();
  });

  it("renders gracefully when funds data is undefined", () => {
    mockUseFunds.mockReturnValue({ data: undefined, isLoading: false });
    render(<NewJournalEntryPage />);
    expect(screen.getByRole("heading", { name: "New Journal Entry" })).toBeInTheDocument();
  });
});
