import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUseFunctionalExpenses } = vi.hoisted(() => ({
  mockUseFunctionalExpenses: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../../hooks/use-accounting", () => ({
  useFunctionalExpenses: (from: string, to: string) => mockUseFunctionalExpenses(from, to),
}));

import { FunctionalExpensesPage } from "./functional-expenses";

const SAMPLE_REPORT = {
  rows: [
    {
      accountId: "acc-e1",
      name: "Salaries",
      program: 100000,
      management: 50000,
      fundraising: 20000,
      total: 170000,
    },
    {
      accountId: "acc-e2",
      name: "Rent",
      program: 30000,
      management: 10000,
      fundraising: 5000,
      total: 45000,
    },
  ],
  totals: { program: 130000, management: 60000, fundraising: 25000, total: 215000 },
};

describe("FunctionalExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFunctionalExpenses.mockReturnValue({
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
    render(<FunctionalExpensesPage />);
    expect(
      screen.getByRole("heading", { name: "Statement of Functional Expenses" }),
    ).toBeInTheDocument();
  });

  it("renders from/to date inputs", () => {
    render(<FunctionalExpensesPage />);
    expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument();
  });

  it("shows Generate button", () => {
    render(<FunctionalExpensesPage />);
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("shows an outcome-led empty state that points at the in-page Generate flow", () => {
    render(<FunctionalExpensesPage />);
    // The empty state teaches the outcome instead of restating the page title,
    // and its primary action is the in-page Generate flow (a button), not a
    // navigate-away link to the chart of accounts.
    expect(screen.getByText("See where your money goes")).toBeInTheDocument();
    expect(
      screen.getByText("Pick your dates above. We sort spending by purpose."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Functional expenses")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view chart of accounts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /functional expenses help/i })).toHaveAttribute(
      "href",
      "/help#functional_expenses_report",
    );
  });

  it("generates the report when the empty-state primary action is clicked", () => {
    mockUseFunctionalExpenses.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(screen.getByText("Salaries")).toBeInTheDocument();
  });

  it("renders report rows after generation", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Salaries")).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Totals")).toBeInTheDocument();
  });

  it("renders the branded report header after generation", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("img", { name: "GrantPipe" })).toHaveAttribute(
      "src",
      "/brand/grantpipe-logo-light.svg",
    );
    expect(screen.getByText("Prepared report")).toBeInTheDocument();
    expect(
      screen.getByText("Expenses split by program, management, and fundraising"),
    ).toBeInTheDocument();
  });

  it("renders column headers", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.getByText("Fundraising")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("shows empty state when no expense rows", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: { rows: [], totals: { program: 0, management: 0, fundraising: 0, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/no expenses in this period/i)).toBeInTheDocument();
  });

  it("shows loading skeleton while loading", () => {
    mockUseFunctionalExpenses.mockImplementation((from: string) => ({
      data: undefined,
      isLoading: !!from,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows Export CSV button when data is available", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });

  it("shows Print button when data is available", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("calls window.print on Print click", () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);
    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
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
    const origRemoveChild = document.body.removeChild.bind(document.body);
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => origRemoveChild(el));

    mockUseFunctionalExpenses.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
  });

  it("shows error alert on failure", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/unable to load report/i)).toBeInTheDocument();
  });

  it("calls refetch on Try again click", async () => {
    const refetchFn = vi.fn();
    mockUseFunctionalExpenses.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("resets generated when date changes", async () => {
    mockUseFunctionalExpenses.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Salaries")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: "2026-02-01" } });
    await waitFor(() => expect(screen.getByText("See where your money goes")).toBeInTheDocument());
  });

  it("resets generated when the to date changes", async () => {
    mockUseFunctionalExpenses.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Salaries")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: "2026-02-28" } });
    await waitFor(() => expect(screen.getByText("See where your money goes")).toBeInTheDocument());
  });

  it("shows dashes for zero functional amounts", () => {
    const reportWithZeros = {
      rows: [
        {
          accountId: "acc-e1",
          name: "Specific Program Expense",
          program: 50000,
          management: 0,
          fundraising: 0,
          total: 50000,
        },
      ],
      totals: { program: 50000, management: 0, fundraising: 0, total: 50000 },
    };
    mockUseFunctionalExpenses.mockReturnValue({
      data: reportWithZeros,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    // Zero values render as "-" placeholder, not "$0.00"
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("Specific Program Expense")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a dash for a zero program amount", () => {
    mockUseFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc-e3",
            name: "Management Only Expense",
            program: 0,
            management: 25000,
            fundraising: 0,
            total: 25000,
          },
        ],
        totals: { program: 0, management: 25000, fundraising: 0, total: 25000 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Management Only Expense")).toBeInTheDocument();
    // Zero program and fundraising amounts render as "-" placeholder, not "$0.00"
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("shows Generating… text while loading", () => {
    mockUseFunctionalExpenses.mockImplementation((from: string) => ({
      data: undefined,
      isLoading: !!from,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<FunctionalExpensesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /generating/i })).toBeInTheDocument();
  });
});
