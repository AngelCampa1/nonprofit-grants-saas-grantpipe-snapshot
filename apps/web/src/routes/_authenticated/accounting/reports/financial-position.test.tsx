import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

const { mockUseFinancialPosition } = vi.hoisted(() => ({
  mockUseFinancialPosition: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../../hooks/use-accounting", () => ({
  useFinancialPosition: (asOf: string) => mockUseFinancialPosition(asOf),
}));

import { FinancialPositionPage } from "./financial-position";

const SAMPLE_REPORT = {
  assets: {
    total: 500000,
    items: [
      { accountId: "acc-1", code: "1000", name: "Cash", balanceCents: 300000 },
      { accountId: "acc-2", code: "1200", name: "Accounts Receivable", balanceCents: 200000 },
    ],
  },
  liabilities: {
    total: 100000,
    items: [{ accountId: "acc-3", code: "2000", name: "Accounts Payable", balanceCents: 100000 }],
  },
  netAssets: {
    unrestricted: 250000,
    temporarilyRestricted: 100000,
    permanentlyRestricted: 50000,
    total: 400000,
  },
  totalLiabilitiesAndNetAssets: 500000,
};

describe("FinancialPositionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFinancialPosition.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page heading", () => {
    render(<FinancialPositionPage />);
    expect(
      screen.getByRole("heading", { name: "Statement of Financial Position" }),
    ).toBeInTheDocument();
  });

  it("renders as-of date input defaulting to today", () => {
    render(<FinancialPositionPage />);
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
      render(<FinancialPositionPage />);
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

  it("shows Generate button", () => {
    render(<FinancialPositionPage />);
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("shows an outcome-led empty state that points at the in-page Generate flow", () => {
    render(<FinancialPositionPage />);
    // The empty state teaches the outcome instead of restating the page title,
    // and its primary action is the in-page Generate flow (a button), not a
    // navigate-away link to the chart of accounts.
    expect(screen.getByText("See what you own and owe")).toBeInTheDocument();
    expect(screen.getByText("Pick a date above. We build your balance sheet.")).toBeInTheDocument();
    expect(screen.queryByText("Statement of financial position")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view chart of accounts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
  });

  it("generates the report when the empty-state primary action is clicked", () => {
    mockUseFinancialPosition.mockImplementation((asOf: string) => ({
      data: asOf ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(screen.getByText("Cash")).toBeInTheDocument();
  });

  it("shows loading skeleton after clicking Generate while loading", () => {
    mockUseFinancialPosition.mockImplementation((asOf: string) => ({
      data: undefined,
      isLoading: !!asOf,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders report data after generation", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Accounts Receivable")).toBeInTheDocument();
    expect(screen.getByText("Accounts Payable")).toBeInTheDocument();
    expect(screen.getByText("Total Assets")).toBeInTheDocument();
    expect(screen.getByText("Total Liabilities")).toBeInTheDocument();
    expect(screen.getByText("Total Net Assets")).toBeInTheDocument();
    expect(screen.getByText("Total Liabilities and Net Assets")).toBeInTheDocument();
  });

  it("wraps raw report tables in horizontal overflow containers", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByTestId("financial-position-assets-table-scroll")).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByTestId("financial-position-liabilities-table-scroll")).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByTestId("financial-position-net-assets-table-scroll")).toHaveClass(
      "overflow-x-auto",
    );
  });

  it("renders the branded report header after generation", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("img", { name: "GrantPipe" })).toHaveAttribute(
      "src",
      "/brand/grantpipe-logo-light.svg",
    );
    expect(screen.getByText("Prepared report")).toBeInTheDocument();
    expect(
      screen.getByText("Balance sheet view of assets, liabilities, and net assets"),
    ).toBeInTheDocument();
  });

  it("shows correct account codes", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
  });

  it("shows net asset classes", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/without donor restrictions/i)).toBeInTheDocument();
    expect(screen.getByText(/temporary/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent/i)).toBeInTheDocument();
  });

  it("shows Export CSV button when data is available", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });

  it("shows Print button when data is available", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("calls window.print on Print button click", () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);
    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /print/i }));
    expect(printSpy).toHaveBeenCalled();
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
      if (el instanceof HTMLAnchorElement) el.click = clickSpy;
      return origAppendChild(el);
    });
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => el);

    mockUseFinancialPosition.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
  });

  it("shows error alert on failure", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/unable to load report/i)).toBeInTheDocument();
  });

  it("calls refetch when Try again is clicked", async () => {
    const refetchFn = vi.fn();
    mockUseFinancialPosition.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("resets generated state when date changes", async () => {
    // Use an implementation mock so the query returns data only when a non-empty asOf is passed
    mockUseFinancialPosition.mockImplementation((asOf: string) => ({
      data: asOf ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Cash")).toBeInTheDocument();
    // Drive the date field through userEvent: a controlled type="date" input does
    // not fire React's onChange under fireEvent.change in React 19, so the reset
    // never ran and this assertion timed out. Real typing updates the value
    // tracker and dispatches the change the component listens for.
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "2026-07-01");
    // After date change, generated resets to false — useFinancialPosition is called with ""
    // so data is undefined and the TeachAndActEmptyState is shown
    await waitFor(() => expect(screen.getByText("See what you own and owe")).toBeInTheDocument());
  });

  it("shows empty asset state when no assets", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: { ...SAMPLE_REPORT, assets: { total: 0, items: [] } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/no assets/i)).toBeInTheDocument();
  });

  it("shows empty liability state when no liabilities", () => {
    mockUseFinancialPosition.mockReturnValue({
      data: { ...SAMPLE_REPORT, liabilities: { total: 0, items: [] } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/no liabilities/i)).toBeInTheDocument();
  });

  it("shows Generating… text while loading", () => {
    mockUseFinancialPosition.mockImplementation((asOf: string) => ({
      data: undefined,
      isLoading: !!asOf,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FinancialPositionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /generating/i })).toBeInTheDocument();
  });
});
