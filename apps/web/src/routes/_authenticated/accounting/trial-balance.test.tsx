import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUseTrialBalance } = vi.hoisted(() => ({ mockUseTrialBalance: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../hooks/use-accounting", () => ({
  useTrialBalance: (params: unknown) => mockUseTrialBalance(params),
}));

import { TrialBalancePage } from "./trial-balance";

const SAMPLE_ROWS = [
  {
    account: {
      id: "acc-1",
      code: "1000",
      name: "Cash",
      type: "asset",
      subtype: null,
      naturalRestriction: null,
      functionalClass: null,
      isActive: true,
    },
    debitTotal: 150000,
    creditTotal: 0,
    balance: 150000,
  },
  {
    account: {
      id: "acc-2",
      code: "2000",
      name: "Accounts Payable",
      type: "liability",
      subtype: null,
      naturalRestriction: null,
      functionalClass: null,
      isActive: true,
    },
    debitTotal: 0,
    creditTotal: 30000,
    balance: 30000,
  },
];

describe("TrialBalancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTrialBalance.mockReturnValue({
      data: SAMPLE_ROWS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page heading", () => {
    render(<TrialBalancePage />);
    expect(screen.getByRole("heading", { name: "Trial Balance" })).toBeInTheDocument();
  });

  it("renders as-of date input defaulting to today", () => {
    render(<TrialBalancePage />);
    const input = screen.getByLabelText(/as of date/i);
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).type).toBe("date");
  });

  it("defaults the as-of input to the local calendar date near a UTC boundary", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Chicago";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T04:30:00.000Z"));

    try {
      render(<TrialBalancePage />);
      expect(screen.getByLabelText(/as of date/i)).toHaveValue("2026-07-12");
    } finally {
      vi.useRealTimers();
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  it("renders account rows in table", () => {
    render(<TrialBalancePage />);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Accounts Payable")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
  });

  it("shows debit balance for debit-side accounts", () => {
    render(<TrialBalancePage />);
    // $1,500 appears in both the row and the totals footer
    expect(screen.getAllByText("$1,500").length).toBeGreaterThanOrEqual(1);
  });

  it("shows credit balance for credit-side accounts", () => {
    render(<TrialBalancePage />);
    // $300 appears in both the row and the totals footer
    expect(screen.getAllByText("$300").length).toBeGreaterThanOrEqual(1);
  });

  it("renders totals row in footer", () => {
    render(<TrialBalancePage />);
    expect(screen.getByText("Totals")).toBeInTheDocument();
  });

  it("shows Export CSV button when data is available", () => {
    render(<TrialBalancePage />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });

  it("hides Export CSV button when no data", () => {
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TrialBalancePage />);
    expect(screen.queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
  });

  it("shows TeachAndActEmptyState when no rows", () => {
    mockUseTrialBalance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TrialBalancePage />);
    expect(screen.getByText("Trial balance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view chart of accounts/i })).toBeInTheDocument();
  });

  it("shows loading skeleton", () => {
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TrialBalancePage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows error alert on failure", () => {
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<TrialBalancePage />);
    expect(screen.getByText(/unable to load trial balance/i)).toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked on error", async () => {
    const refetchFn = vi.fn();
    mockUseTrialBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<TrialBalancePage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("triggers CSV download on export button click", async () => {
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURLSpy = vi.fn();
    const appendChildSpy = vi.fn();
    const removeChildSpy = vi.fn();
    const clickSpy = vi.fn();

    Object.defineProperty(window, "URL", {
      value: { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy },
      writable: true,
    });
    const origAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((el) => {
      appendChildSpy(el);
      if (el instanceof HTMLAnchorElement) {
        el.click = clickSpy;
      }
      return origAppendChild(el);
    });
    const origRemoveChild = document.body.removeChild.bind(document.body);
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => {
      removeChildSpy(el);
      return origRemoveChild(el);
    });

    render(<TrialBalancePage />);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
  });

  it("uses the as-of date from the input for the query", async () => {
    render(<TrialBalancePage />);
    // Drive the date field through userEvent: a controlled type="date" input does
    // not fire React's onChange under fireEvent.change in React 19, so the state
    // never updated. Use a fixed non-today date so the assertion is real and not
    // an accident of the current date.
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "2025-03-15");
    await waitFor(() =>
      expect(mockUseTrialBalance).toHaveBeenCalledWith(
        expect.objectContaining({ asOf: expect.stringContaining("2025-03-15") }),
      ),
    );
  });
});
