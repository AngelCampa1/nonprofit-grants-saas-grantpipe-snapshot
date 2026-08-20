import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUseSession,
  mockUseFiscalPeriods,
  mockUseCreateFiscalPeriod,
  mockUseUpdateFiscalPeriod,
  mockUseCloseFiscalPeriod,
  mockUsePeriodCloseChecklist,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseFiscalPeriods: vi.fn(),
  mockUseCreateFiscalPeriod: vi.fn(),
  mockUseUpdateFiscalPeriod: vi.fn(),
  mockUseCloseFiscalPeriod: vi.fn(),
  mockUsePeriodCloseChecklist: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../hooks/use-accounting", () => ({
  useFiscalPeriods: () => mockUseFiscalPeriods(),
  useCreateFiscalPeriod: () => mockUseCreateFiscalPeriod(),
  useUpdateFiscalPeriod: (id: string) => mockUseUpdateFiscalPeriod(id),
  useCloseFiscalPeriod: (id: string) => mockUseCloseFiscalPeriod(id),
  usePeriodCloseChecklist: (id: string) => mockUsePeriodCloseChecklist(id),
}));

import { FiscalPeriodsPage } from "./periods";

const SAMPLE_PERIODS = [
  {
    id: "p1",
    orgId: "org-1",
    name: "FY2026 Q1",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-03-31T23:59:59.999Z",
    status: "open",
    closedBy: null,
    closedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "p2",
    orgId: "org-1",
    name: "FY2025 Q4",
    startDate: "2025-10-01T00:00:00.000Z",
    endDate: "2025-12-31T23:59:59.999Z",
    status: "closed",
    closedBy: "user-1",
    closedAt: "2026-01-05T00:00:00.000Z",
    createdAt: "2025-10-01T00:00:00.000Z",
  },
  {
    id: "p3",
    orgId: "org-1",
    name: "FY2025 Q3",
    startDate: "2025-07-01T00:00:00.000Z",
    endDate: "2025-09-30T23:59:59.999Z",
    status: "locked",
    closedBy: "user-1",
    closedAt: "2025-10-05T00:00:00.000Z",
    createdAt: "2025-07-01T00:00:00.000Z",
  },
];

const SAMPLE_CHECKLIST = {
  periodId: "p1",
  periodName: "FY2026 Q1",
  periodStatus: "open",
  checks: [
    { id: "balanced", label: "All journal entries are balanced", passed: true, detail: null },
    { id: "no-drafts", label: "No draft journal entries", passed: false, detail: "2 drafts found" },
  ],
  readyToClose: false,
};

describe("FiscalPeriodsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseFiscalPeriods.mockReturnValue({ data: SAMPLE_PERIODS, isLoading: false });
    mockUseCreateFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseUpdateFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseCloseFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUsePeriodCloseChecklist.mockReturnValue({ data: SAMPLE_CHECKLIST, isLoading: false });
  });

  it("renders page heading", () => {
    render(<FiscalPeriodsPage />);
    expect(screen.getByRole("heading", { name: "Fiscal Periods" })).toBeInTheDocument();
  });

  it("shows Add period button for admins", () => {
    render(<FiscalPeriodsPage />);
    expect(screen.getByRole("button", { name: "Add period" })).toBeInTheDocument();
  });

  it("hides Add period button for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<FiscalPeriodsPage />);
    expect(screen.queryByRole("button", { name: "Add period" })).not.toBeInTheDocument();
  });

  it("renders period rows in table", () => {
    render(<FiscalPeriodsPage />);
    expect(screen.getByText("FY2026 Q1")).toBeInTheDocument();
    expect(screen.getByText("FY2025 Q4")).toBeInTheDocument();
    expect(screen.getByText("FY2025 Q3")).toBeInTheDocument();
  });

  it("renders a plain label instead of the epoch for an opening-balances period", () => {
    mockUseFiscalPeriods.mockReturnValue({
      data: [
        {
          id: "p0",
          orgId: "org-1",
          name: "Opening Balances",
          startDate: "1970-01-01T00:00:00.000Z",
          endDate: "2025-06-30T23:59:59.999Z",
          status: "closed",
          closedBy: "user-1",
          closedAt: "2025-07-01T00:00:00.000Z",
          createdAt: "2025-07-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    expect(screen.getByText("From the start")).toBeInTheDocument();
    expect(screen.queryByText("Jan 1, 1970")).not.toBeInTheDocument();
  });

  it("shows correct status badges", () => {
    render(<FiscalPeriodsPage />);
    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
    expect(screen.getByText("locked")).toBeInTheDocument();
  });

  it("shows Edit and Close buttons only for open periods when admin", () => {
    render(<FiscalPeriodsPage />);
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  it("hides Close buttons for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<FiscalPeriodsPage />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("shows loading skeleton when periods are loading", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: true });
    render(<FiscalPeriodsPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows error message when periods query fails", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<FiscalPeriodsPage />);
    expect(screen.getByText(/unable to load fiscal periods/i)).toBeInTheDocument();
  });

  it("announces the periods load failure to screen readers via role=alert", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<FiscalPeriodsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load fiscal periods. Please try again.",
    );
  });

  it("shows warning variant on closed status badge", () => {
    render(<FiscalPeriodsPage />);
    const closedBadge = screen.getByText("closed");
    expect(closedBadge).toHaveAttribute("data-variant", "warning");
    expect(closedBadge.className).not.toMatch(/amber-\d/);
  });

  it("shows empty message when no periods", () => {
    mockUseFiscalPeriods.mockReturnValue({ data: [], isLoading: false });
    render(<FiscalPeriodsPage />);
    expect(screen.getByText(/no fiscal periods yet/i)).toBeInTheDocument();
  });

  it("opens Add period dialog on button click", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(screen.getByRole("heading", { name: "Add fiscal period" })).toBeInTheDocument();
  });

  it("closes Add period dialog on Cancel click", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Add fiscal period" })).not.toBeInTheDocument(),
    );
  });

  it("opens Close dialog on Close button click", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("heading", { name: /close fiscal period: FY2026 Q1/i }),
    ).toBeInTheDocument();
  });

  it("closes Close dialog on Cancel click", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /close fiscal period: FY2026 Q1/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows pre-close checklist in close dialog", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("All journal entries are balanced")).toBeInTheDocument();
    expect(screen.getByText("No draft journal entries")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("shows resolve issues warning when not ready to close", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText(/resolve the issues above before closing/i)).toBeInTheDocument();
  });

  it("disables Close Period button when not readyToClose", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const closeBtn = screen.getByRole("button", { name: "Close period" });
    expect(closeBtn).toBeDisabled();
  });

  it("enables Close Period button when readyToClose is true", () => {
    mockUsePeriodCloseChecklist.mockReturnValue({
      data: { ...SAMPLE_CHECKLIST, readyToClose: true },
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const closeBtn = screen.getByRole("button", { name: "Close period" });
    expect(closeBtn).not.toBeDisabled();
  });

  it("calls close mutation on Close Period confirm", async () => {
    const mutateFn = vi.fn().mockResolvedValue(undefined);
    mockUseCloseFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUsePeriodCloseChecklist.mockReturnValue({
      data: { ...SAMPLE_CHECKLIST, readyToClose: true },
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
  });

  it("shows error in close dialog when mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Period already closed"));
    mockUseCloseFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUsePeriodCloseChecklist.mockReturnValue({
      data: { ...SAMPLE_CHECKLIST, readyToClose: true },
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Period already closed")).toBeInTheDocument();
  });

  it("shows checklist loading skeleton in close dialog", () => {
    mockUsePeriodCloseChecklist.mockReturnValue({ data: undefined, isLoading: true });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      document.querySelector("[data-radix-dialog-content] .animate-pulse") ??
        document.querySelector(".animate-pulse"),
    ).toBeInTheDocument();
  });

  it("closes the close dialog on Cancel", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: /close fiscal period: FY2026 Q1/i }),
    ).not.toBeInTheDocument();
  });

  it("creates a fiscal period on valid new period form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "p4", name: "FY2026 Q2" });
    mockUseCreateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Q2" } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "FY2026 Q2",
          startDate: expect.stringContaining("2026-04-01"),
          endDate: expect.stringContaining("2026-06-30"),
        }),
      ),
    );
  });

  it("shows validation error when name is empty in new period form", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("shows validation error when start or end date is missing", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Q2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/start and end dates are required/i)).toBeInTheDocument();
  });

  it("shows validation error when end date is not after start date", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Q2" } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-06-30" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
  });

  it("shows error in new period dialog when create mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Overlapping period"));
    mockUseCreateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Q2" } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Overlapping period")).toBeInTheDocument();
  });

  it("shows Adding… text when create mutation is pending", () => {
    mockUseCreateFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("closes the new period dialog on Cancel", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Add fiscal period" })).not.toBeInTheDocument();
  });

  it("shows Closing… text when close mutation is pending", () => {
    mockUseCloseFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    mockUsePeriodCloseChecklist.mockReturnValue({
      data: { ...SAMPLE_CHECKLIST, readyToClose: true },
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: /closing/i })).toBeInTheDocument();
  });

  it("shows fallback status badge for unknown status", () => {
    mockUseFiscalPeriods.mockReturnValue({
      data: [
        {
          id: "p4",
          orgId: "org-1",
          name: "FY2024 Q1",
          startDate: "2024-01-01T00:00:00.000Z",
          endDate: "2024-03-31T23:59:59.999Z",
          status: "unknown_status",
          closedBy: null,
          closedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    // Should render without crashing, badge shows the unknown status text
    expect(screen.getByText("unknown_status")).toBeInTheDocument();
  });

  it("shows fallback error when new period create throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Q2" } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to add fiscal period/i)).toBeInTheDocument();
  });

  it("shows close dialog without checklist when checklist data is undefined after load", () => {
    mockUsePeriodCloseChecklist.mockReturnValue({ data: undefined, isLoading: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // Should show the dialog heading without crashing
    expect(
      screen.getByRole("heading", { name: /close fiscal period: FY2026 Q1/i }),
    ).toBeInTheDocument();
    // The checklist section should render null (no checklist content)
    expect(screen.queryByText("All journal entries are balanced")).not.toBeInTheDocument();
  });

  it("shows fallback error when close mutation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCloseFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUsePeriodCloseChecklist.mockReturnValue({
      data: { ...SAMPLE_CHECKLIST, readyToClose: true },
      isLoading: false,
    });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to close fiscal period/i)).toBeInTheDocument();
  });

  it("opens Edit dialog on Edit button click", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit fiscal period" })).toBeInTheDocument();
  });

  it("closes Edit dialog on Cancel click", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Edit fiscal period" })).not.toBeInTheDocument(),
    );
  });

  it("pre-populates Edit dialog with period data", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toHaveValue("FY2026 Q1");
    expect(screen.getByLabelText("Start Date")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("End Date")).toHaveValue("2026-03-31");
  });

  it("calls update mutation on Edit save", async () => {
    const mutateFn = vi.fn().mockResolvedValue(undefined);
    mockUseUpdateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FY2026 Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ name: "FY2026 Updated" })),
    );
  });

  it("shows validation error in edit dialog when name is empty", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("shows validation error in edit dialog when a date is missing", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/start and end dates are required/i)).toBeInTheDocument();
  });

  it("shows validation error in edit dialog when end date not after start date", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
  });

  it("shows validation error in edit dialog when start or end date is missing", async () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/start and end dates are required/i)).toBeInTheDocument();
  });

  it("shows error in edit dialog when update mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Overlapping period"));
    mockUseUpdateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Overlapping period")).toBeInTheDocument();
  });

  it("shows fallback error when edit mutation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseUpdateFiscalPeriod.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to update fiscal period/i)).toBeInTheDocument();
  });

  it("shows Saving… when update mutation is pending", () => {
    mockUseUpdateFiscalPeriod.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("closes the edit dialog on Cancel", () => {
    render(<FiscalPeriodsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Edit fiscal period" })).not.toBeInTheDocument();
  });

  it("hides Edit button for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<FiscalPeriodsPage />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
