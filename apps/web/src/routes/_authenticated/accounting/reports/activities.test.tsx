import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUseStatementOfActivities } = vi.hoisted(() => ({
  mockUseStatementOfActivities: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../../hooks/use-accounting", () => ({
  useStatementOfActivities: (from: string, to: string) => mockUseStatementOfActivities(from, to),
}));

import { ActivitiesPage } from "./activities";

const SAMPLE_REPORT = {
  revenue: [
    {
      accountId: "acc-r1",
      name: "Donations",
      withoutRestrictions: 400000,
      withRestrictions: 100000,
      total: 500000,
    },
  ],
  releases: { withoutRestrictions: 50000, withRestrictions: -50000 },
  expenses: [
    {
      accountId: "acc-e1",
      name: "Salaries",
      withoutRestrictions: 200000,
      withRestrictions: 0,
      total: 200000,
    },
  ],
  changeInNetAssets: { withoutRestrictions: 250000, withRestrictions: 50000, total: 300000 },
  beginningNetAssets: { withoutRestrictions: 100000, withRestrictions: 50000, total: 150000 },
  endingNetAssets: { withoutRestrictions: 350000, withRestrictions: 100000, total: 450000 },
};

describe("ActivitiesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStatementOfActivities.mockReturnValue({
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
    render(<ActivitiesPage />);
    expect(screen.getByRole("heading", { name: "Statement of Activities" })).toBeInTheDocument();
  });

  it("renders from/to date inputs", () => {
    render(<ActivitiesPage />);
    expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument();
  });

  it("shows Generate button", () => {
    render(<ActivitiesPage />);
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("shows an outcome-led empty state that points at the in-page Generate flow", () => {
    render(<ActivitiesPage />);
    // The empty state teaches the outcome instead of restating the page title,
    // and its primary action is the in-page Generate flow (a button), not a
    // navigate-away link to the chart of accounts.
    expect(screen.getByText("See your income and spending")).toBeInTheDocument();
    expect(screen.getByText("Pick your dates above. We build the report.")).toBeInTheDocument();
    expect(screen.queryByText("Statement of activities")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view chart of accounts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /statement of activities help/i })).toHaveAttribute(
      "href",
      "/help#statement_of_activities_report",
    );
  });

  it("generates the report when the empty-state primary action is clicked", () => {
    mockUseStatementOfActivities.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(screen.getByText("Donations")).toBeInTheDocument();
  });

  it("shows loading skeleton while loading", () => {
    mockUseStatementOfActivities.mockImplementation((from: string) => ({
      data: undefined,
      isLoading: !!from,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders report data after generation", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Donations")).toBeInTheDocument();
    expect(screen.getByText("Salaries")).toBeInTheDocument();
    expect(screen.getByText(/net assets released from restrictions/i)).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Total Expenses")).toBeInTheDocument();
    expect(screen.getByText("Change in Net Assets")).toBeInTheDocument();
    expect(screen.getByText(/net assets.*beginning/i)).toBeInTheDocument();
    expect(screen.getByText(/net assets.*end/i)).toBeInTheDocument();
  });

  it("wraps the raw report table in a horizontal overflow container", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByTestId("activities-report-table-scroll")).toHaveClass("overflow-x-auto");
  });

  it("renders the branded report header after generation", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("img", { name: "GrantPipe" })).toHaveAttribute(
      "src",
      "/brand/grantpipe-logo-light.svg",
    );
    expect(screen.getByText("Prepared report")).toBeInTheDocument();
    expect(screen.getByText("Revenue, expenses, and changes in net assets")).toBeInTheDocument();
  });

  it("shows empty revenue state", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: { ...SAMPLE_REPORT, revenue: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/no revenue in this period/i)).toBeInTheDocument();
  });

  it("shows empty expenses state", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: { ...SAMPLE_REPORT, expenses: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/no expenses in this period/i)).toBeInTheDocument();
  });

  it("shows Export CSV button when data available", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });

  it("shows Print button when data available", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("calls window.print on Print click", () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);
    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
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

    mockUseStatementOfActivities.mockReturnValue({
      data: SAMPLE_REPORT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
  });

  it("shows error alert on failure", () => {
    mockUseStatementOfActivities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText(/unable to load report/i)).toBeInTheDocument();
  });

  it("calls refetch on Try again click", async () => {
    const refetchFn = vi.fn();
    mockUseStatementOfActivities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("resets generated state when date changes", async () => {
    mockUseStatementOfActivities.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Donations")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: "2026-02-01" } });
    await waitFor(() =>
      expect(screen.getByText("See your income and spending")).toBeInTheDocument(),
    );
  });

  it("resets generated state when the to date changes", async () => {
    mockUseStatementOfActivities.mockImplementation((from: string) => ({
      data: from ? SAMPLE_REPORT : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Donations")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: "2026-02-28" } });
    await waitFor(() =>
      expect(screen.getByText("See your income and spending")).toBeInTheDocument(),
    );
  });

  it("shows Generating… text while loading", () => {
    mockUseStatementOfActivities.mockImplementation((from: string) => ({
      data: undefined,
      isLoading: !!from,
      isError: false,
      refetch: vi.fn(),
    }));
    render(<ActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: /generating/i })).toBeInTheDocument();
  });
});
