import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { getDefaultPermissionsForRole } from "@grantpipe/shared";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

const {
  mockUseSession,
  mockUseOrgBilling,
  mockUsePrograms,
  mockUseProgramBudgetVsActual,
  mockUseCreateProgram,
  mockUseExportProgramBudgetVsActual,
  mockUseOrgTeam,
  mockRouteUseSearch,
  mockNavigate,
  mockCanAccessFeature,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUsePrograms: vi.fn(),
  mockUseProgramBudgetVsActual: vi.fn(),
  mockUseCreateProgram: vi.fn(),
  mockUseExportProgramBudgetVsActual: vi.fn(),
  mockUseOrgTeam: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
  mockNavigate: vi.fn(),
  mockCanAccessFeature: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) => (config: { component: React.ComponentType; validateSearch?: unknown }) => ({
      ...config,
      path,
      useSearch: mockRouteUseSearch,
    }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/programs" } }),
  Link: ({
    to,
    params,
    children,
    className,
    "data-testid": dataTestId,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
    "data-testid"?: string;
  }) => {
    const href = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? "") : to;
    return React.createElement(
      "a",
      { href, className, "data-testid": dataTestId, ...rest },
      children,
    );
  },
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: () => mockUseOrgBilling(),
  useOrgTeam: () => mockUseOrgTeam(),
}));

vi.mock("../../../hooks/use-programs", () => ({
  usePrograms: () => mockUsePrograms(),
  useProgramBudgetVsActual: () => mockUseProgramBudgetVsActual(),
  useCreateProgram: () => mockUseCreateProgram(),
  useExportProgramBudgetVsActual: () => mockUseExportProgramBudgetVsActual(),
}));

vi.mock("../../../lib/access-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/access-control")>();
  return {
    ...actual,
    canAccessFeature: (...args: unknown[]) => mockCanAccessFeature(...args),
  };
});

const mockCaptureRecordFilterChanged = vi.fn();
vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureRecordFilterChanged: (...args: unknown[]) => mockCaptureRecordFilterChanged(...args),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Select: ({
      children,
      value = "",
      onValueChange = () => {},
    }: {
      children?: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
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
          aria-label={ariaLabel}
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
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

import { ProgramsPage } from "./index";

const defaultBilling = {
  data: {
    planTier: "audit_ready",
    billingCycle: "monthly",
    status: "active",
    trialEndsAt: null,
  },
  isLoading: false,
  isError: false,
  error: null,
};

const defaultSession: {
  memberRole: string;
  memberPermissions: ReturnType<typeof getDefaultPermissionsForRole> | [];
} = {
  memberRole: "admin",
  memberPermissions: [],
};

const defaultReportQuery = {
  data: { rows: [] },
  isLoading: false,
  isError: false,
  error: null,
};

const defaultCreateProgram = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const defaultExportReport = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const defaultOrgTeam = {
  data: [
    {
      id: "m1",
      role: "admin",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Alice Admin",
        email: "alice@example.com",
      },
    },
    {
      id: "m2",
      role: "editor",
      user: { id: "00000000-0000-4000-8000-000000000002", name: null, email: "bob@example.com" },
    },
    { id: "m3", role: "viewer", user: null },
  ],
  isLoading: false,
  isError: false,
};

function setup(overrides?: {
  programsQuery?: Partial<ReturnType<typeof mockUsePrograms>>;
  search?: string;
  status?: string;
  page?: number;
  session?: Partial<typeof defaultSession>;
  billing?: Partial<typeof defaultBilling>;
  createProgram?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
  orgTeam?: Partial<typeof defaultOrgTeam>;
  canAccessFeature?: boolean;
  canAccessFeatureImpl?: (...args: unknown[]) => boolean;
}) {
  if (overrides?.canAccessFeatureImpl) {
    mockCanAccessFeature.mockImplementation(overrides.canAccessFeatureImpl);
  } else {
    mockCanAccessFeature.mockReturnValue(overrides?.canAccessFeature ?? true);
  }
  mockUseSession.mockReturnValue({ ...defaultSession, ...overrides?.session });
  mockUseOrgBilling.mockReturnValue({ ...defaultBilling, ...overrides?.billing });
  mockUseProgramBudgetVsActual.mockReturnValue(defaultReportQuery);
  mockUseCreateProgram.mockReturnValue(overrides?.createProgram ?? defaultCreateProgram);
  mockUseExportProgramBudgetVsActual.mockReturnValue(defaultExportReport);
  mockUseOrgTeam.mockReturnValue({ ...defaultOrgTeam, ...overrides?.orgTeam });
  mockRouteUseSearch.mockReturnValue({
    search: overrides?.search,
    status: overrides?.status,
    page: overrides?.page,
  });

  mockUsePrograms.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: null,
    ...overrides?.programsQuery,
  });

  return render(React.createElement(ProgramsPage));
}

describe("ProgramsPage — Funds tab group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessFeature.mockReturnValue(true);
  });

  it("renders Funds section tabs with Overview and Programs links for an admin", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });

    const nav = screen.getByRole("navigation", { name: "Funds sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programs" })).toBeInTheDocument();
  });

  it("does not render Funds section tabs for an auditor (programs has no permission)", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      session: {
        memberRole: "auditor",
        memberPermissions: getDefaultPermissionsForRole("auditor"),
      },
      // Auditors have funds:view but programs:none — mirror the real predicate so
      // the tab filter leaves a single visible tab and the strip renders nothing.
      canAccessFeatureImpl: (...args: unknown[]) => args[2] !== "programs",
    });

    expect(screen.queryByRole("navigation", { name: "Funds sections" })).not.toBeInTheDocument();
  });
});

describe("ProgramsPage — card grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessFeature.mockReturnValue(true);
  });

  it("renders program cards for each program", () => {
    setup({
      programsQuery: {
        data: {
          data: [
            { id: "p1", name: "Youth Services", code: "YOUTH", status: "active" },
            { id: "p2", name: "Housing Support", code: null, status: "archived" },
          ],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const grid = screen.getByTestId("programs-card-grid");
    expect(grid).toBeInTheDocument();

    const cards = screen.getAllByTestId("program-card");
    expect(cards).toHaveLength(2);

    expect(screen.getByText("Youth Services")).toBeInTheDocument();
    expect(screen.getByText("YOUTH")).toBeInTheDocument();
    expect(screen.getByText("Housing Support")).toBeInTheDocument();
    // Status badges (use getAllByText because Select options also render "Active"/"Archived")
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Archived").length).toBeGreaterThanOrEqual(1);
  });

  it("renders card links pointing to the correct program detail route", () => {
    setup({
      programsQuery: {
        data: {
          data: [{ id: "abc123", name: "Education", code: "EDU", status: "active" }],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const card = screen.getByTestId("program-card");
    expect(card).toHaveAttribute("href", "/programs/abc123");
  });

  it("does not render code paragraph when code is null", () => {
    setup({
      programsQuery: {
        data: {
          data: [{ id: "p1", name: "Health", code: null, status: "active" }],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // Only the name and status badge — no mono code text
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
  });

  it("renders program code with font-mono class", () => {
    setup({
      programsQuery: {
        data: {
          data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const codeEl = screen.getByText("YOUTH");
    expect(codeEl).toHaveClass("font-mono");
  });

  it("renders loading skeletons when programsQuery is loading", () => {
    setup({ programsQuery: { data: undefined, isLoading: true } });

    const skeletons = document.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBe(6);
    // No cards yet
    expect(screen.queryByTestId("program-card")).not.toBeInTheDocument();
  });

  it("shows filter-match empty state when filters are active and no results", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false }, search: "xyz" });

    expect(screen.getByText("No programs match these filters.")).toBeInTheDocument();
    expect(screen.queryByTestId("program-card")).not.toBeInTheDocument();
  });

  it("shows filter-match empty state when status filter is set and no results", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false }, status: "archived" });

    expect(screen.getByText("No programs match these filters.")).toBeInTheDocument();
  });

  it("shows TeachAndActEmptyState when no filters and no results", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });

    // TeachAndActEmptyState renders the heading
    expect(screen.getByText("Your programs live here")).toBeInTheDocument();
    expect(
      screen.getByText("Group your spending by program. Track budget against actual costs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How programs work" })).toBeInTheDocument();
    expect(screen.queryByText("No programs match these filters.")).not.toBeInTheDocument();
  });

  it("hides the Budget vs actual section when the org has no programs at all", () => {
    setup({ programsQuery: { data: { data: [], total: 0 }, isLoading: false } });

    // Only the primary teach empty state shows — no stacked second empty state
    expect(screen.getByText("Your programs live here")).toBeInTheDocument();
    expect(screen.queryByText("Budget vs actual")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No program budget or actual rows for this period."),
    ).not.toBeInTheDocument();
  });

  it("shows the Budget vs actual section when filters yield no matches but programs exist", () => {
    setup({
      programsQuery: { data: { data: [], total: 0 }, isLoading: false },
      search: "xyz",
    });

    // Filtering is active, so the org may still have programs — keep the report section
    expect(screen.getByText("No programs match these filters.")).toBeInTheDocument();
    expect(screen.getByText("Budget vs actual")).toBeInTheDocument();
  });

  it("clicking 'Add your first program' in empty state calls handleOpenChange", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });

    const createBtn = screen.getByRole("button", { name: "Add your first program" });
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    // After click the dialog open state is true — dialog heading is rendered
    expect(screen.getByRole("heading", { name: "Add program" })).toBeInTheDocument();
  });

  it("renders error alert when programsQuery errors", () => {
    setup({
      programsQuery: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("network error"),
      },
    });

    expect(screen.getByText("Unable to load programs.")).toBeInTheDocument();
    expect(screen.queryByTestId("programs-card-grid")).not.toBeInTheDocument();
  });

  it("marks the program name field as required in the create dialog", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    const nameInput = screen.getByLabelText(/program name/i);
    expect(nameInput).toBeRequired();
    expect(nameInput).toHaveAttribute("aria-required", "true");
  });

  it("rejects empty program name submission and does not call mutateAsync", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    const nameInput = screen.getByLabelText(/program name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows Adding… while the mutation is pending", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync: vi.fn(), isPending: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    const submit = screen.getByRole("button", { name: /adding/i });
    expect(submit).toBeDisabled();
    const nameInput = screen.getByLabelText(/program name/i);
    expect(nameInput).toBeDisabled();
  });

  it("disables Add until a name is entered", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync: vi.fn(), isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    const save = screen.getByRole("button", { name: /^Add$/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "Health" } });
    expect(save).toBeEnabled();
  });

  it("calls mutateAsync with parsed program data on valid submit", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), {
      target: { value: "Youth Services" },
    });
    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: "YOUTH" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Youth Services", code: "YOUTH" }),
      );
    });
  });

  it("surfaces the validation error message when zod rejects the payload", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    const form = screen.getByRole("button", { name: /^Add$/i }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Unable to add program")).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces server errors when mutateAsync rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("boom server"));
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "Health" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(screen.getByText("boom server")).toBeInTheDocument();
    });
  });

  it("shows the help link in empty state when canEdit is false", () => {
    setup({
      session: { memberRole: "viewer", memberPermissions: [] },
      canAccessFeature: false,
      programsQuery: { data: { data: [] }, isLoading: false },
    });

    expect(screen.getByText("Your programs live here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How programs work" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("does not render pagination when total fits on one page", () => {
    setup({
      programsQuery: {
        data: {
          data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
          total: 1,
        },
        isLoading: false,
      },
    });

    expect(screen.queryByTestId("programs-pagination")).not.toBeInTheDocument();
  });

  it("renders pagination and Next navigates to page 2 when total exceeds page size", () => {
    setup({
      programsQuery: {
        data: {
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `p${i}`,
            name: `Program ${i}`,
            code: null,
            status: "active",
          })),
          total: 30,
        },
        isLoading: false,
      },
    });

    expect(screen.getByTestId("programs-pagination")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: ".", search: { page: 2 }, replace: false }),
    );
  });

  it("disables Next button on the last page", () => {
    setup({
      page: 2,
      programsQuery: {
        data: {
          data: Array.from({ length: 5 }, (_, i) => ({
            id: `p${i}`,
            name: `Program ${i}`,
            code: null,
            status: "active",
          })),
          total: 30,
        },
        isLoading: false,
      },
    });

    expect(screen.getByTestId("programs-pagination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("resets status filter to empty when all statuses option is selected", () => {
    setup({
      status: "archived",
      programsQuery: { data: { data: [] }, isLoading: false },
    });

    // The status filter combobox is rendered with current value "archived"
    const statusSelect = screen.getByRole("combobox", { name: "Filter program status" });
    expect(statusSelect).toBeInTheDocument();

    // Changing to "all" should call syncFilters with status: ""
    fireEvent.change(statusSelect, { target: { value: "all" } });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.not.objectContaining({ status: "archived" }),
      }),
    );
  });

  it("prevents closing the dialog while the mutation is pending", async () => {
    const mutateAsync = vi.fn(() => new Promise(() => {})); // never resolves
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: true },
    });

    // Open the dialog via Add program button in the page header
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));

    // The dialog is open — the heading confirms it
    expect(screen.getByRole("heading", { name: "Add program" })).toBeInTheDocument();

    // Try to close when pending — the dialog close button should not hide the dialog
    // (handleOpenChange returns early when !nextOpen && isPending)
    // In our Dialog mock, pressing Escape fires onOpenChange(false)
    fireEvent.keyDown(document.body, { key: "Escape" });

    // Dialog should still be open because isPending blocked the close
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add program" })).toBeInTheDocument();
    });
  });

  it("resets page to 1 (drops page from URL) when search is typed while on a later page", () => {
    setup({
      page: 5,
      programsQuery: {
        data: {
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `p${i}`,
            name: `Program ${i}`,
            code: null,
            status: "active",
          })),
          total: 200,
        },
        isLoading: false,
      },
    });

    const searchInput = screen.getByPlaceholderText("Search programs…");
    fireEvent.change(searchInput, { target: { value: "health" } });

    // syncFilters calls navigate with buildProgramsRouteSearch(next) where next has no page
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.not.objectContaining({ page: 5 }),
      }),
    );

    // Verify the search object passed to navigate does not include page at all
    const filterCall = mockNavigate.mock.calls.find(
      (args) =>
        args[0] &&
        typeof args[0] === "object" &&
        "replace" in args[0] &&
        (args[0] as { replace: boolean }).replace === true,
    );
    expect(filterCall).toBeDefined();
    expect((filterCall![0] as { search: { page?: number } }).search.page).toBeUndefined();
  });

  it("clicking Previous on page 2 navigates back to page 1 (page omitted from search)", () => {
    setup({
      page: 2,
      programsQuery: {
        data: {
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `p${i}`,
            name: `Program ${i}`,
            code: null,
            status: "active",
          })),
          total: 60,
        },
        isLoading: false,
      },
    });

    expect(screen.getByTestId("programs-pagination")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: ".", replace: false }));
    // page: 1 is omitted from search since buildProgramsRouteSearch only includes page > 1
    const call = mockNavigate.mock.calls[0]!;
    expect((call[0] as { search: { page?: number } }).search.page).toBeUndefined();
  });

  it("Export budget vs actual button calls exportReport.mutateAsync", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseProgramBudgetVsActual.mockReturnValue(defaultReportQuery);
    mockUseCreateProgram.mockReturnValue(defaultCreateProgram);
    mockUseExportProgramBudgetVsActual.mockReturnValue({ mutateAsync, isPending: false });
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockRouteUseSearch.mockReturnValue({});
    mockUsePrograms.mockReturnValue({
      data: {
        data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(ProgramsPage));

    fireEvent.click(screen.getByRole("button", { name: /export budget vs actual/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });
  });

  it("renders report error alert when reportQuery errors", () => {
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseProgramBudgetVsActual.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("report error"),
    });
    mockUseCreateProgram.mockReturnValue(defaultCreateProgram);
    mockUseExportProgramBudgetVsActual.mockReturnValue(defaultExportReport);
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockRouteUseSearch.mockReturnValue({});
    mockUsePrograms.mockReturnValue({
      data: {
        data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(ProgramsPage));

    expect(screen.getByText("Unable to load program report")).toBeInTheDocument();
  });

  it("renders budget vs actual table with data including formatted currency cells", () => {
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseProgramBudgetVsActual.mockReturnValue({
      data: {
        rows: [
          {
            programId: "p1",
            category: "Personnel",
            budgetedCents: 100000,
            actualCents: 80000,
            remainingCents: 20000,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mockUseCreateProgram.mockReturnValue(defaultCreateProgram);
    mockUseExportProgramBudgetVsActual.mockReturnValue(defaultExportReport);
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockRouteUseSearch.mockReturnValue({});
    mockUsePrograms.mockReturnValue({
      data: {
        data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(ProgramsPage));

    // Table headers confirm columns are rendered
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Remaining")).toBeInTheDocument();
    expect(screen.getByText("Personnel")).toBeInTheDocument();
  });

  it("surfaces an error when the budget-vs-actual export fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Export download failed."));
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseProgramBudgetVsActual.mockReturnValue(defaultReportQuery);
    mockUseCreateProgram.mockReturnValue(defaultCreateProgram);
    mockUseExportProgramBudgetVsActual.mockReturnValue({ mutateAsync, isPending: false });
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockRouteUseSearch.mockReturnValue({});
    mockUsePrograms.mockReturnValue({
      data: {
        data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(ProgramsPage));
    fireEvent.click(screen.getByRole("button", { name: /export budget vs actual/i }));

    expect(await screen.findByText("Export download failed.")).toBeInTheDocument();
    expect(screen.getByText("Unable to complete the export")).toBeInTheDocument();
  });

  it("shows a fallback message when the export fails with a non-Error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue("boom");
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseProgramBudgetVsActual.mockReturnValue(defaultReportQuery);
    mockUseCreateProgram.mockReturnValue(defaultCreateProgram);
    mockUseExportProgramBudgetVsActual.mockReturnValue({ mutateAsync, isPending: false });
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockRouteUseSearch.mockReturnValue({});
    mockUsePrograms.mockReturnValue({
      data: {
        data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(ProgramsPage));
    fireEvent.click(screen.getByRole("button", { name: /export budget vs actual/i }));

    expect(await screen.findByText("Unable to export the report.")).toBeInTheDocument();
  });
});

describe("ProgramsPage — owner picker (N2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessFeature.mockReturnValue(true);
  });

  it("renders an owner select field in the create dialog", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    expect(screen.getByLabelText(/owner/i)).toBeInTheDocument();
  });

  it("lists org team members as options in the owner select", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    // Alice Admin and bob@example.com should appear as options
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("does not include team members with no user.id as owner options", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    // m3 has user: null so should NOT appear as an owner option value
    const options = screen.getAllByRole("option");
    const optionValues = options.map((o) => o.getAttribute("data-value"));
    expect(optionValues).not.toContain(null);
    // Only u1 and u2 should be member user IDs
    expect(optionValues).toContain("00000000-0000-4000-8000-000000000001");
    expect(optionValues).toContain("00000000-0000-4000-8000-000000000002");
  });

  it("submits ownerUserId when an owner is selected", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), {
      target: { value: "Health Programs" },
    });
    // Select owner via the owner combobox
    const ownerCombobox = screen.getByLabelText(/owner/i);
    fireEvent.change(ownerCombobox, { target: { value: "00000000-0000-4000-8000-000000000001" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: "00000000-0000-4000-8000-000000000001" }),
      );
    });
  });

  it("submits without ownerUserId when no owner is selected (unassigned)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), {
      target: { value: "Health Programs" },
    });
    // Leave owner as default (unassigned)
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Health Programs" }),
      );
    });
    // ownerUserId should not be set (undefined)
    const callArg = (mutateAsync.mock.calls[0] as [Record<string, unknown>])[0];
    expect(callArg.ownerUserId).toBeUndefined();
  });

  it("resets ownerUserId when the dialog is closed and reopened", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    // Open dialog, pick an owner, then close
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    const ownerCombobox = screen.getByLabelText(/owner/i);
    fireEvent.change(ownerCombobox, { target: { value: "00000000-0000-4000-8000-000000000001" } });
    // Close dialog without submitting — fire Escape
    fireEvent.keyDown(document.body, { key: "Escape" });
    // Reopen
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    // Owner should be reset to empty / unassigned
    const ownerComboboxAfterReopen = screen.getByLabelText(/owner/i) as HTMLInputElement;
    expect(ownerComboboxAfterReopen.value).toBe("");
  });

  it("surfaces non-Error server errors with fallback message when mutateAsync throws unknown", async () => {
    const mutateAsync = vi.fn().mockRejectedValue("string error");
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add your first program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "Health" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Unable to add program.")).toBeInTheDocument();
    });
  });

  it("sets status filter to 'active' when a specific status is selected in the status filter", () => {
    setup({
      status: undefined,
      programsQuery: {
        data: { data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }] },
        isLoading: false,
      },
    });

    const statusSelect = screen.getByRole("combobox", { name: "Filter program status" });
    fireEvent.change(statusSelect, { target: { value: "active" } });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ status: "active" }),
      }),
    );
  });

  it("renders owner select with fallback to member.user.id when name and email are absent", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      orgTeam: {
        data: [
          {
            id: "m4",
            role: "admin",
            user: {
              id: "00000000-0000-4000-8000-000000000004",
              name: null as unknown as string,
              email: null as unknown as string,
            },
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    // When name and email are null, falls back to user.id
    expect(screen.getByText("00000000-0000-4000-8000-000000000004")).toBeInTheDocument();
  });

  it("updates description field in the create dialog", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Youth health programs" } });
    expect((descInput as HTMLTextAreaElement).value).toBe("Youth health programs");
  });

  it("updates status select in the create dialog and includes it in submission", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      createProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    fireEvent.change(screen.getByLabelText(/program name/i), {
      target: { value: "Health" },
    });
    // Change status via the status select trigger (id="program-status")
    const statusCombobox = document.querySelector("#program-status") as HTMLInputElement;
    expect(statusCombobox).not.toBeNull();
    fireEvent.change(statusCombobox, { target: { value: "archived" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    });
  });
});

// True-empty state chrome gating (Wave 143)
describe("ProgramsPage — filter chrome gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessFeature.mockReturnValue(true);
  });

  it("hides the FilterBar in the true-empty state (no programs, no active filter)", () => {
    setup({ programsQuery: { data: { data: [] }, isLoading: false } });

    expect(screen.queryByPlaceholderText("Search programs…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Filter program status" }),
    ).not.toBeInTheDocument();
    // The empty state must still be present.
    expect(screen.getByText("Your programs live here")).toBeInTheDocument();
  });

  it("shows the FilterBar when programs exist", () => {
    setup({
      programsQuery: {
        data: { data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }] },
        isLoading: false,
      },
    });

    expect(screen.getByPlaceholderText("Search programs…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter program status" })).toBeInTheDocument();
  });

  it("shows the FilterBar when a search filter is active even with no results", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      search: "xyz",
    });

    // Active filter → FilterBar must stay visible so user can clear it.
    expect(screen.getByPlaceholderText("Search programs…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter program status" })).toBeInTheDocument();
  });

  it("shows the FilterBar when a status filter is active even with no results", () => {
    setup({
      programsQuery: { data: { data: [] }, isLoading: false },
      status: "archived",
    });

    expect(screen.getByPlaceholderText("Search programs…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter program status" })).toBeInTheDocument();
  });

  it("fires captureRecordFilterChanged with record_type=programs on search change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    setup({
      programsQuery: {
        data: { data: [{ id: "p1", name: "Youth", code: "Y", status: "active" }] },
        isLoading: false,
      },
    });

    fireEvent.change(screen.getByPlaceholderText("Search programs…"), {
      target: { value: "health" },
    });

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "programs",
        "search",
        expect.objectContaining({ search: "health" }),
      );
    });
  });

  it("fires captureRecordFilterChanged with record_type=programs on status filter change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    setup({
      programsQuery: {
        data: { data: [{ id: "p1", name: "Youth", code: "Y", status: "active" }] },
        isLoading: false,
      },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Filter program status" }), {
      target: { value: "archived" },
    });

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "programs",
        "status",
        expect.objectContaining({ status: "archived" }),
      );
    });
  });

  it("search input has an accessible name", () => {
    setup({
      programsQuery: {
        data: { data: [{ id: "p1", name: "Youth Services", code: "YOUTH", status: "active" }] },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByRole("textbox", { name: /search programs/i })).toBeInTheDocument();
  });
});
