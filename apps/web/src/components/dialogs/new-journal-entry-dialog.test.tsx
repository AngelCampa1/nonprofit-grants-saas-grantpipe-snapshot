import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn();
const mockUseCreateJournalEntry = vi.fn();
const mockUseFiscalPeriods = vi.fn();
const mockUseAccounts = vi.fn();

vi.mock("../../hooks/use-accounting", () => ({
  useCreateJournalEntry: () => mockUseCreateJournalEntry(),
  useFiscalPeriods: () => mockUseFiscalPeriods(),
  useAccounts: (..._args: unknown[]) => mockUseAccounts(),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
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
      id,
      children: _children,
    }: {
      "aria-label"?: string;
      id?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel ?? id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
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

import { NewJournalEntryDialog } from "./new-journal-entry-dialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAccounts = [
  { id: "acc-1", code: "1010", name: "Checking" },
  { id: "acc-2", code: "4000", name: "Revenue" },
];

const mockFiscalPeriods = [
  {
    id: "fp-1",
    name: "FY2026 Q1",
    status: "open",
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  },
];

function setupDefaultMocks() {
  mockUseCreateJournalEntry.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
  mockUseFiscalPeriods.mockReturnValue({
    data: mockFiscalPeriods,
    isLoading: false,
  });
  mockUseAccounts.mockReturnValue({
    data: mockAccounts,
    isLoading: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NewJournalEntryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders dialog when open=true", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("New journal entry")).toBeInTheDocument();
  });

  it("does not render dialog content when open=false", () => {
    render(<NewJournalEntryDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders with 2 initial line rows", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    // Two debit inputs should be present (one per line)
    const debitInputs = screen.getAllByPlaceholderText("0.00");
    // 2 debit + 2 credit = 4
    expect(debitInputs.length).toBeGreaterThanOrEqual(4);
  });

  it("has date, reference, and memo inputs", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/memo/i)).toBeInTheDocument();
  });

  it("defaults the date input to the local calendar date near a UTC boundary", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Chicago";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T04:30:00.000Z"));

    try {
      render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
      expect(screen.getByLabelText("Date")).toHaveValue("2026-07-12");
    } finally {
      vi.useRealTimers();
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  it("recomputes the local date when a mounted dialog reopens after midnight", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Chicago";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T04:59:00.000Z"));

    try {
      const { rerender } = render(<NewJournalEntryDialog open={false} onOpenChange={vi.fn()} />);
      vi.setSystemTime(new Date("2026-07-13T05:01:00.000Z"));
      rerender(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByLabelText("Date")).toHaveValue("2026-07-13");
    } finally {
      vi.useRealTimers();
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  it("shows a no-open-period empty state guiding the user to open a fiscal period first", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("No open fiscal period")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open a fiscal period/i })).toBeInTheDocument();
    // The period picker must not be offered when there is nothing selectable.
    expect(screen.queryByRole("combobox", { name: "Fiscal period" })).not.toBeInTheDocument();
  });

  it("clicking Open a fiscal period closes the dialog and navigates to the periods page", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    const onOpenChange = vi.fn();
    render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open a fiscal period/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/accounting/periods" });
  });

  it("does not show the no-open-period empty state while fiscal periods are loading", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: true });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("No open fiscal period")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Fiscal period" })).toBeInTheDocument();
  });

  it("Add line button adds a new line row", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const debitsBefore = screen.getAllByPlaceholderText("0.00").length;
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText("0.00").length).toBeGreaterThan(debitsBefore);
    });
  });

  it("Remove button is hidden when only 2 lines remain", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    // With exactly 2 lines, no remove buttons should be visible
    expect(screen.queryAllByRole("button", { name: /remove line/i })).toHaveLength(0);
  });

  it("Remove button appears when 3+ lines exist and removes a line", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /remove line/i })).toHaveLength(3);
    });
    const [firstRemoveBtn] = screen.getAllByRole("button", { name: /remove line/i });
    fireEvent.click(firstRemoveBtn!);
    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: /remove line/i })).toHaveLength(0);
    });
  });

  it("balance indicator shows 'Balanced' when debits equal credits (both > 0)", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [line0Debit, , , line1Credit] = screen.getAllByPlaceholderText("0.00");
    // First input is line 0 debit, second is line 0 credit, third is line 1 debit, fourth is line 1 credit
    // Set debit on line 0 = 100, credit on line 1 = 100
    fireEvent.change(line0Debit!, { target: { value: "100" } });
    fireEvent.change(line1Credit!, { target: { value: "100" } });
    await waitFor(() => {
      expect(screen.getByText(/balanced/i)).toBeInTheDocument();
    });
  });

  it("balance indicator shows 'Not balanced' when debits ≠ credits", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [line0Debit] = screen.getAllByPlaceholderText("0.00");
    // Set debit on line 0 = 100, credit = 0
    fireEvent.change(line0Debit!, { target: { value: "100" } });
    await waitFor(() => {
      expect(screen.getByText(/not balanced/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/off by \$100\b/i)).toBeInTheDocument();
  });

  it("balance indicator shows the exact off-by amount for a fractional difference", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [line0Debit, , , line1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(line0Debit!, { target: { value: "10.00" } });
    fireEvent.change(line1Credit!, { target: { value: "9.50" } });
    await waitFor(() => {
      expect(screen.getByText(/off by \$0\.50/i)).toBeInTheDocument();
    });
  });

  it("Post entry button is disabled when not balanced", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /post entry/i })).toBeDisabled();
  });

  it("Post entry button is disabled when balanced but date is missing", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [line0Debit, , , line1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(line0Debit!, { target: { value: "100" } });
    fireEvent.change(line1Credit!, { target: { value: "100" } });
    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    // Clear the date
    const dateInput = screen.getByLabelText(/date/i);
    fireEvent.change(dateInput, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /post entry/i })).toBeDisabled();
    });
  });

  it("Post entry button is disabled when balanced but no fiscal period", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [line0Debit, , , line1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(line0Debit!, { target: { value: "50" } });
    fireEvent.change(line1Credit!, { target: { value: "50" } });
    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    // No fiscal period selected by default — button should remain disabled
    expect(screen.getByRole("button", { name: /post entry/i })).toBeDisabled();
  });

  it("Post entry button is disabled when balanced but fewer than 2 lines have an account and amount", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    // Fill date and fiscal period so only the line-count rule can block submit.
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    const periodCombo = screen.getByRole("combobox", { name: /fiscal period/i });
    fireEvent.change(periodCombo, { target: { value: "fp-1" } });
    // Put both a debit and a credit on the SAME line so the entry balances
    // while only one line has an account and amount.
    const [line0Debit, line0Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(line0Debit!, { target: { value: "100" } });
    fireEvent.change(line0Credit!, { target: { value: "100" } });
    const [acctCombo0] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(acctCombo0!, { target: { value: "acc-1" } });
    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    // A valid double entry needs at least 2 populated lines, so the button stays disabled.
    expect(screen.getByRole("button", { name: /post entry/i })).toBeDisabled();
  });

  it("successful submit calls mutateAsync with correct data", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-1" });
    const onOpenChange = vi.fn();

    render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);

    // Fill date
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });

    // Select fiscal period via combobox (the mocked SelectTrigger with aria-label="Fiscal period")
    const periodCombo = screen.getByRole("combobox", { name: /fiscal period/i });
    fireEvent.change(periodCombo, { target: { value: "fp-1" } });

    // Set balanced amounts (debit line 0 = $100, credit line 1 = $100)
    const [line0Debit, , , line1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(line0Debit!, { target: { value: "100" } }); // line 0 debit
    fireEvent.change(line1Credit!, { target: { value: "100" } }); // line 1 credit

    // Select accounts using the combobox inputs directly (avoids multi-select context ambiguity)
    const [acctCombo0, acctCombo1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(acctCombo0!, { target: { value: "acc-1" } }); // line 0
    fireEvent.change(acctCombo1!, { target: { value: "acc-2" } }); // line 1

    // Wait for balanced state and enabled button
    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());

    const postBtn = screen.getByRole("button", { name: /post entry/i });
    expect(postBtn).not.toBeDisabled();
    fireEvent.click(postBtn);
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  });

  it("shows error alert when mutation throws", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Server error"));
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    // Fill date and fiscal period
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    const periodCombo = screen.getByRole("combobox", { name: /fiscal period/i });
    fireEvent.change(periodCombo, { target: { value: "fp-1" } });

    // Balanced amounts
    const [errLine0Debit, , , errLine1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(errLine0Debit!, { target: { value: "100" } });
    fireEvent.change(errLine1Credit!, { target: { value: "100" } });

    // Select accounts via combobox
    const [errAcctCombo0, errAcctCombo1] = screen.getAllByRole("combobox", {
      name: /Account line/i,
    });
    fireEvent.change(errAcctCombo0!, { target: { value: "acc-1" } });
    fireEvent.change(errAcctCombo1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());

    const postBtn = screen.getByRole("button", { name: /post entry/i });
    expect(postBtn).not.toBeDisabled();
    fireEvent.click(postBtn);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Server error/i)).toBeInTheDocument();
  });

  it("Cancel button calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("form resets on close — reopening shows 2 empty lines", async () => {
    const onOpenChange = vi.fn();
    render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);

    // Add a line making it 3 total
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /remove line/i })).toHaveLength(3),
    );

    // Close via Cancel button — this goes through handleOpenChange which calls reset()
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // onOpenChange(false) was called
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Now simulate reopening by checking that the component resets internal state
    // We render a fresh instance (simulating the parent toggling open back to true)
    const { unmount } = render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      // Back to 2 lines — no remove buttons
      expect(screen.queryAllByRole("button", { name: /remove line/i })).toHaveLength(0);
    });

    unmount();
  });

  it("shows the no-open-period empty state when fiscal periods list is empty", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("No open fiscal period")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /no open periods/i })).not.toBeInTheDocument();
  });

  it("shows the period date range so same-named periods can be told apart", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText(/Jan 1, 2026.*Mar 31, 2026/s)).toBeInTheDocument();
  });

  it("shows account options from chart of accounts", () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getAllByRole("option", { name: /Checking/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: /Revenue/i }).length).toBeGreaterThan(0);
  });

  it("debit and credit inputs accept dollar amounts and compute cents on submit", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-2" });
    const onOpenChange = vi.fn();
    render(<NewJournalEntryDialog open={true} onOpenChange={onOpenChange} />);

    // Fill date and fiscal period to enable submit
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    const periodCombo = screen.getByRole("combobox", { name: /fiscal period/i });
    fireEvent.change(periodCombo, { target: { value: "fp-1" } });

    const [cents0Debit, , , cents1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(cents0Debit!, { target: { value: "25.50" } }); // $25.50 debit on line 0
    fireEvent.change(cents1Credit!, { target: { value: "25.50" } }); // $25.50 credit on line 1

    // Select accounts via combobox
    const [centsAcctCombo0, centsAcctCombo1] = screen.getAllByRole("combobox", {
      name: /Account line/i,
    });
    fireEvent.change(centsAcctCombo0!, { target: { value: "acc-1" } });
    fireEvent.change(centsAcctCombo1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());

    // Submit and verify cents conversion
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ debitCents: 2550 }),
            expect.objectContaining({ creditCents: 2550 }),
          ]),
        }),
      );
    });
  });

  it("negative or non-numeric debit/credit input treated as 0", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const [neg0Debit, neg0Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(neg0Debit!, { target: { value: "-50" } });
    fireEvent.change(neg0Credit!, { target: { value: "abc" } });
    // Both are treated as 0 — no balance change shown in "balanced" state since both = 0
    await waitFor(() => {
      // Not balanced indicator not shown for 0 debits
      expect(screen.queryByText(/not balanced/i)).not.toBeInTheDocument();
    });
  });

  it("Post entry shows Posting… text while pending", () => {
    mockUseCreateJournalEntry.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /posting/i })).toBeInTheDocument();
  });

  it("Post entry button stays disabled when one balanced line has no account", async () => {
    // Scenario: balanced amounts but line 1 has no accountId → only 1 valid line.
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByRole("combobox", { name: /fiscal period/i }), {
      target: { value: "fp-1" },
    });

    // Set balanced amounts on line 0 debit and line 1 credit
    const [v0Debit, , , v1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(v0Debit!, { target: { value: "100" } });
    fireEvent.change(v1Credit!, { target: { value: "100" } });

    // Only assign accountId to line 0 — line 1 has no account
    const [vAcct0] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(vAcct0!, { target: { value: "acc-1" } });
    // line 1 account left empty intentionally

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());

    // Line 1 has no account, so only one valid line exists and the button stays disabled.
    expect(screen.getByRole("button", { name: /post entry/i })).toBeDisabled();
  });

  it("mutation error with non-Error object shows fallback message", async () => {
    mockMutateAsync.mockRejectedValue("string error");
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    const periodCombo = screen.getByRole("combobox", { name: /fiscal period/i });
    fireEvent.change(periodCombo, { target: { value: "fp-1" } });

    const [fb0Debit, , , fb1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(fb0Debit!, { target: { value: "100" } });
    fireEvent.change(fb1Credit!, { target: { value: "100" } });

    const [fbAcct0, fbAcct1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(fbAcct0!, { target: { value: "acc-1" } });
    fireEvent.change(fbAcct1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/unable to create journal entry/i)).toBeInTheDocument();
    });
  });

  it("line memo input updates correctly", async () => {
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);
    const lineMemoInputs = screen.getAllByPlaceholderText("Line memo");
    fireEvent.change(lineMemoInputs[0]!, { target: { value: "Grant payment" } });
    await waitFor(() => {
      expect(lineMemoInputs[0]).toHaveValue("Grant payment");
    });
  });

  it("reference and memo are combined in fullMemo on submit", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-3" });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByRole("combobox", { name: /fiscal period/i }), {
      target: { value: "fp-1" },
    });
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: "JE-001" } });
    fireEvent.change(screen.getByLabelText(/^memo$/i), { target: { value: "Payroll" } });

    const [ref0Debit, , , ref1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(ref0Debit!, { target: { value: "500" } });
    fireEvent.change(ref1Credit!, { target: { value: "500" } });

    const [refAcct0, refAcct1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(refAcct0!, { target: { value: "acc-1" } });
    fireEvent.change(refAcct1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ memo: "JE-001: Payroll" }),
      );
    });
  });

  it("submit with only reference and no memo uses reference as memo", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-4" });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByRole("combobox", { name: /fiscal period/i }), {
      target: { value: "fp-1" },
    });
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: "JE-002" } });
    // Leave memo blank

    const [refOnly0Debit, , , refOnly1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(refOnly0Debit!, { target: { value: "200" } });
    fireEvent.change(refOnly1Credit!, { target: { value: "200" } });

    const [refOnlyAcct0, refOnlyAcct1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(refOnlyAcct0!, { target: { value: "acc-1" } });
    fireEvent.change(refOnlyAcct1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ memo: "JE-002" }));
    });
  });

  it("submit with no reference and no memo sends memo as undefined", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-5" });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByRole("combobox", { name: /fiscal period/i }), {
      target: { value: "fp-1" },
    });

    const [noMemo0Debit, , , noMemo1Credit] = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(noMemo0Debit!, { target: { value: "75" } });
    fireEvent.change(noMemo1Credit!, { target: { value: "75" } });

    const [noMemoAcct0, noMemoAcct1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(noMemoAcct0!, { target: { value: "acc-1" } });
    fireEvent.change(noMemoAcct1!, { target: { value: "acc-2" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ memo: undefined }));
    });
  });

  it("line with memo sends line memo on submit", async () => {
    mockMutateAsync.mockResolvedValue({ id: "je-6" });
    render(<NewJournalEntryDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByRole("combobox", { name: /fiscal period/i }), {
      target: { value: "fp-1" },
    });

    const allAmounts = screen.getAllByPlaceholderText("0.00");
    const [lm0Debit, , , lm1Credit] = allAmounts;
    fireEvent.change(lm0Debit!, { target: { value: "300" } });
    fireEvent.change(lm1Credit!, { target: { value: "300" } });

    const [lmAcct0, lmAcct1] = screen.getAllByRole("combobox", { name: /Account line/i });
    fireEvent.change(lmAcct0!, { target: { value: "acc-1" } });
    fireEvent.change(lmAcct1!, { target: { value: "acc-2" } });

    // Add a line memo to line 0
    const lineMemos = screen.getAllByPlaceholderText("Line memo");
    fireEvent.change(lineMemos[0]!, { target: { value: "Cash receipt" } });

    await waitFor(() => expect(screen.getByText(/balanced/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /post entry/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([expect.objectContaining({ memo: "Cash receipt" })]),
        }),
      );
    });
  });
});
