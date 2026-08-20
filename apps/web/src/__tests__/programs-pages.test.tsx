import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => {} });

const hoisted = vi.hoisted(() => ({
  routeState: {
    params: {} as Record<string, string>,
    search: {} as Record<string, string | undefined>,
  },
  mockNavigate: vi.fn(),
  mockUsePrograms: vi.fn(),
  mockUseProgram: vi.fn(),
  mockUseProgramBudgetVsActual: vi.fn(),
  mockUseCreateProgram: vi.fn(),
  mockUseExportProgramBudgetVsActual: vi.fn(),
  mockUseOutcomes: vi.fn(),
  mockUseCreateOutcome: vi.fn(),
  mockUseCreateOutcomeIndicator: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSession: vi.fn(),
  mockCreateProgramMutate: vi.fn(),
  mockExportMutate: vi.fn(),
  mockUpdateProgramMutate: vi.fn(),
  mockCreateBudgetMutate: vi.fn(),
  mockUpdateBudgetMutate: vi.fn(),
  mockCreateOutcomeMutate: vi.fn(),
  mockCreateIndicatorMutate: vi.fn(),
}));

vi.mock("../components/shell/page-tabs", () => ({
  AppPageTabs: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => hoisted.routeState.params,
    useSearch: () => hoisted.routeState.search,
  }),
  useNavigate: () => hoisted.mockNavigate,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@grantpipe/ui", () => ({
  Alert: ({ title, children }: React.HTMLAttributes<HTMLDivElement> & { title?: string }) => (
    <div role="alert">
      {title ? <p>{title}</p> : null}
      {children}
    </div>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked"> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
  DataTable: <TData extends { id?: string }>({
    columns,
    data,
    emptyState,
  }: {
    columns: Array<{
      id?: string;
      accessorKey?: string;
      header: React.ReactNode;
      cell?: (ctx: { row: { original: TData } }) => React.ReactNode;
    }>;
    data: TData[];
    emptyState?: React.ReactNode;
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th key={column.id ?? String(index)}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>{emptyState}</td>
          </tr>
        ) : (
          data.map((row, rowIndex) => (
            <tr key={row.id ?? String(rowIndex)}>
              {columns.map((column, index) => (
                <td key={column.id ?? String(index)}>
                  {column.cell
                    ? column.cell({ row: { original: row } })
                    : column.accessorKey
                      ? String((row as Record<string, unknown>)[column.accessorKey] ?? "")
                      : null}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  ),
  numericSortingFn: () => 0,
  Breadcrumb: ({ children }: { children: React.ReactNode }) => (
    <nav aria-label="breadcrumb">{children}</nav>
  ),
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  BreadcrumbLink: ({
    children,
    asChild,
    ...props
  }: { children: React.ReactNode; asChild?: boolean } & React.HTMLAttributes<HTMLElement>) =>
    asChild
      ? React.cloneElement(children as React.ReactElement, props)
      : React.createElement("a", props, children),
  BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
    <span aria-current="page">{children}</span>
  ),
  BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FilterBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  PageHeader: ({
    kicker,
    title,
    help,
    actions,
    breadcrumb,
  }: {
    kicker?: React.ReactNode;
    title: React.ReactNode;
    help?: React.ReactNode;
    actions?: React.ReactNode;
    breadcrumb?: React.ReactNode;
  }) => (
    <header>
      {breadcrumb}
      {kicker ? <p>{kicker}</p> : null}
      <h1>{title}</h1>
      {help ? <p>{help}</p> : null}
      {actions}
    </header>
  ),
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
    const { onValueChange } = React.useContext(SelectCtx);
    return (
      <button type="button" onClick={() => onValueChange(value)}>
        {children}
      </button>
    );
  },
  SelectTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => {
    const { value, onValueChange } = React.useContext(SelectCtx);
    return (
      <input
        role="combobox"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Skeleton: ({ className }: { className?: string }) => <div className={className} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  TeachAndActEmptyState: ({
    heading,
    primaryAction,
  }: {
    heading: string;
    primaryAction?: { label: string; onClick?: () => void; href?: string };
  }) => (
    <section aria-label={heading}>
      <h2>{heading}</h2>
      {primaryAction ? (
        <button onClick={primaryAction.onClick}>{primaryAction.label}</button>
      ) : null}
    </section>
  ),
}));

vi.mock("../hooks/use-org-settings", () => ({
  useOrgBilling: () => hoisted.mockUseOrgBilling(),
  useOrgTeam: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../hooks/use-outcomes", () => ({
  useOutcomes: () => hoisted.mockUseOutcomes(),
  useCreateOutcome: () => hoisted.mockUseCreateOutcome(),
  useCreateOutcomeIndicator: () => hoisted.mockUseCreateOutcomeIndicator(),
}));

vi.mock("../hooks/use-programs", () => ({
  usePrograms: () => hoisted.mockUsePrograms(),
  useProgram: () => hoisted.mockUseProgram(),
  useProgramBudgetVsActual: () => hoisted.mockUseProgramBudgetVsActual(),
  useCreateProgram: () => hoisted.mockUseCreateProgram(),
  useProgramMutations: () => ({
    updateProgram: { mutateAsync: hoisted.mockUpdateProgramMutate, isPending: false },
    archiveProgram: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  }),
  useExportProgramBudgetVsActual: () => hoisted.mockUseExportProgramBudgetVsActual(),
  useCreateProgramBudget: () => ({
    mutateAsync: hoisted.mockCreateBudgetMutate,
    isPending: false,
  }),
  useUpdateProgramBudget: () => ({
    mutateAsync: hoisted.mockUpdateBudgetMutate,
    isPending: false,
  }),
}));

import { Route as ProgramDetailRoute } from "../routes/_authenticated/programs/$programId";
import { ProgramsPage } from "../routes/_authenticated/programs/index";

const ProgramDetailPage = (ProgramDetailRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;
const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderProgramDetailPage() {
  const queryClient = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ProgramDetailPage />
    </QueryClientProvider>,
  );

  return {
    ...view,
    rerenderProgramDetailPage: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ProgramDetailPage />
        </QueryClientProvider>,
      ),
  };
}

describe("program pages", () => {
  beforeEach(() => {
    hoisted.routeState.params = {};
    hoisted.routeState.search = {};
    hoisted.mockNavigate.mockClear();
    hoisted.mockCreateProgramMutate.mockReset();
    hoisted.mockCreateProgramMutate.mockResolvedValue({ id: "program-2" });
    hoisted.mockExportMutate.mockReset();
    hoisted.mockExportMutate.mockResolvedValue("csv");
    hoisted.mockUpdateProgramMutate.mockReset();
    hoisted.mockUpdateProgramMutate.mockResolvedValue({});
    hoisted.mockCreateBudgetMutate.mockReset();
    hoisted.mockCreateBudgetMutate.mockResolvedValue({});
    hoisted.mockUpdateBudgetMutate.mockReset();
    hoisted.mockUpdateBudgetMutate.mockResolvedValue({});
    hoisted.mockCreateOutcomeMutate.mockReset();
    hoisted.mockCreateOutcomeMutate.mockResolvedValue({});
    hoisted.mockCreateIndicatorMutate.mockReset();
    hoisted.mockCreateIndicatorMutate.mockResolvedValue({});
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: { programs: "manage" },
    });
    hoisted.mockUsePrograms.mockReturnValue({
      data: {
        data: [
          { id: "program-1", name: "Health Access", code: "HEALTH", status: "active" },
          { id: "program-2", name: "Food Security", status: "in_review" },
          { id: "program-3", name: "Housing", code: null, status: null },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseProgramBudgetVsActual.mockReturnValue({
      data: {
        rows: [
          {
            programId: "program-1",
            category: "Personnel",
            budgetedCents: 100_00,
            actualCents: 25_00,
            remainingCents: 75_00,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseCreateProgram.mockReturnValue({
      mutateAsync: hoisted.mockCreateProgramMutate,
    });
    hoisted.mockUseExportProgramBudgetVsActual.mockReturnValue({
      mutateAsync: hoisted.mockExportMutate,
      isPending: false,
    });
    hoisted.mockUseOutcomes.mockReturnValue({
      data: { data: [], pagination: { page: 1, pageSize: 10, hasNextPage: false } },
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    hoisted.mockUseCreateOutcome.mockReturnValue({
      mutateAsync: hoisted.mockCreateOutcomeMutate,
      isPending: false,
    });
    hoisted.mockUseCreateOutcomeIndicator.mockReturnValue({
      mutateAsync: hoisted.mockCreateIndicatorMutate,
      isPending: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "audit_ready" } });
    hoisted.mockUseProgram.mockReturnValue({
      data: {
        id: "program-1",
        name: "Health Access",
        code: "HEALTH",
        budgets: [
          {
            id: "budget-1",
            name: "FY 2027",
            status: "draft",
            periodStart: "2026-07-01",
            periodEnd: "2027-06-30",
            lines: [{ id: "line-1", category: "Personnel", budgetedCents: 100_00 }],
          },
          {
            id: "budget-2",
            name: "FY 2028",
            status: undefined,
            periodStart: "2027-07-01",
            periodEnd: "2028-06-30",
          },
        ],
        grantAllocations: [{ id: "ga-1", grantId: "grant-1" }],
        expenseAllocations: [],
        impactMetricLinks: [{ id: "metric-link-1", impactMetricId: "metric-1" }],
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders program list, filters, report rows, and create flow", async () => {
    render(<ProgramsPage />);

    expect(screen.getByRole("heading", { name: "Programs" })).toBeInTheDocument();
    expect(screen.getByText("Health Access")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getByText("$75")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export budget vs actual" }));
    expect(hoisted.mockExportMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart: expect.stringMatching(/^\d{4}-01-01$/),
        periodEnd: expect.stringMatching(/^\d{4}-12-31$/),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText("Search programs…"), {
      target: { value: "health" },
    });
    expect(hoisted.mockNavigate).toHaveBeenCalledWith({
      to: ".",
      search: { search: "health" },
      replace: true,
    });

    fireEvent.change(screen.getByLabelText(/Program name/i), {
      target: { value: "Nutrition" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockCreateProgramMutate).toHaveBeenCalledWith({
        name: "Nutrition",
        status: "active",
      });
    });
  });

  it("uses the fallback create error for non-error rejections", async () => {
    hoisted.mockCreateProgramMutate.mockRejectedValueOnce("offline");

    render(<ProgramsPage />);

    fireEvent.change(screen.getByLabelText(/Program name/i), {
      target: { value: "Nutrition" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);

    expect(await screen.findByText("Unable to add program.")).toBeInTheDocument();
  });

  it("handles status filters, empty state action, and form errors", async () => {
    hoisted.routeState.search = { search: "missing" };
    hoisted.mockUsePrograms.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseProgramBudgetVsActual.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockCreateProgramMutate.mockRejectedValueOnce(new Error("Duplicate code"));

    render(<ProgramsPage />);

    // Both the create-program dialog's status Select and the FilterBar
    // expose an "Archived" SelectItem (mocked as a <button>). The dialog
    // lives in PageHeader.actions which renders before the FilterBar, so
    // the filter's button is the second match.
    const archivedButtons = screen.getAllByRole("button", { name: "Archived" });
    const archivedButton = archivedButtons.at(-1);
    if (!archivedButton) throw new Error("expected archived filter button");
    fireEvent.click(archivedButton);
    expect(hoisted.mockNavigate).toHaveBeenCalledWith({
      to: ".",
      search: { search: "missing", status: "archived" },
      replace: true,
    });

    expect(screen.getByText("No programs match these filters.")).toBeInTheDocument();
    expect(
      screen.getByText("No program budget or actual rows for this period."),
    ).toBeInTheDocument();

    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);
    expect(await screen.findByText("Unable to add program")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Program name/i), {
      target: { value: "Nutrition" },
    });
    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "NUTRITION" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockCreateProgramMutate).toHaveBeenCalledWith({
        name: "Nutrition",
        code: "NUTRITION",
        status: "active",
      });
    });
    expect(await screen.findByText("Duplicate code")).toBeInTheDocument();
  });

  it("shows the default empty state when no filters are active", () => {
    hoisted.mockUsePrograms.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<ProgramsPage />);

    expect(screen.getByText("Your programs live here")).toBeInTheDocument();
  });

  it("allows Starter program editing and gates CSV export to Growth", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "starter" } });

    render(<ProgramsPage />);

    expect(screen.getByRole("button", { name: "Add program" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export budget vs actual" })).toBeDisabled();
    expect(screen.getByText("CSV export is on Growth and above.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Billing." })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("disables export while the audit-ready export is pending", () => {
    hoisted.mockUseExportProgramBudgetVsActual.mockReturnValue({
      mutateAsync: hoisted.mockExportMutate,
      isPending: true,
    });

    render(<ProgramsPage />);

    expect(screen.getByRole("button", { name: "Export budget vs actual" })).toBeDisabled();
  });

  it("hides the add-program action when the member cannot edit programs", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { programs: "read" },
    });

    render(<ProgramsPage />);

    expect(screen.queryByRole("button", { name: "Add program" })).not.toBeInTheDocument();
  });

  it("renders report error state", () => {
    hoisted.mockUseProgramBudgetVsActual.mockReturnValue({
      isLoading: false,
      isError: true,
    });

    render(<ProgramsPage />);

    expect(screen.getByText("Unable to load program report")).toBeInTheDocument();
  });

  it("renders program detail funding and ownership context", () => {
    hoisted.routeState.params = { programId: "program-1" };

    renderProgramDetailPage();

    expect(screen.getByRole("heading", { name: "Health Access" })).toBeInTheDocument();
    expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
    expect(screen.getByText("FY 2027")).toBeInTheDocument();
    expect(screen.getByText("Outcome links")).toBeInTheDocument();
  });

  it("creates and edits program budgets from detail", async () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };

    renderProgramDetailPage();

    fireEvent.change(screen.getByLabelText(/Budget name/i), {
      target: { value: "FY 2029" },
    });
    fireEvent.change(screen.getByLabelText(/Period start/i), {
      target: { value: "2028-07-01" },
    });
    fireEvent.change(screen.getByLabelText(/Period end/i), {
      target: { value: "2029-06-30" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), {
      target: { value: "Supplies" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), {
      target: { value: "25.50" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 notes"), {
      target: { value: "Program kits" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockCreateBudgetMutate).toHaveBeenCalledWith({
        programId: PROGRAM_ID,
        name: "FY 2029",
        periodStart: "2028-07-01",
        periodEnd: "2029-06-30",
        status: "approved",
        lines: [
          {
            category: "Supplies",
            budgetedCents: 2550,
            notes: "Program kits",
          },
        ],
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit budget" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 2 category"), {
      target: { value: "Travel" },
    });
    fireEvent.change(screen.getByLabelText("Line 2 amount"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove line 2" }));
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockUpdateBudgetMutate).toHaveBeenCalledWith({
        name: "FY 2027",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        status: "draft",
        lines: [
          {
            category: "Personnel",
            budgetedCents: 10_000,
            notes: undefined,
          },
        ],
      });
    });
  });

  it("shows budget validation and mutation fallback errors", async () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockCreateBudgetMutate.mockRejectedValueOnce("offline");

    renderProgramDetailPage();

    fireEvent.change(screen.getByLabelText(/Budget name/i), {
      target: { value: "FY 2029" },
    });
    fireEvent.change(screen.getByLabelText(/Period start/i), {
      target: { value: "2028-07-01" },
    });
    fireEvent.change(screen.getByLabelText(/Period end/i), {
      target: { value: "2029-06-30" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), {
      target: { value: "Supplies" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), {
      target: { value: "25" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);

    expect(await screen.findByText("Unable to save budget.")).toBeInTheDocument();
  });

  it("creates outcomes and indicators from program detail", async () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockUseOutcomes.mockReturnValue({
      data: {
        data: [
          {
            id: "outcome-1",
            name: "Families stay housed",
            statement: "Families keep stable housing.",
            status: "active",
            indicators: [
              {
                id: "indicator-1",
                name: "Families served",
                status: "behind",
                actualValue: 10,
                targetValue: 25,
                unit: "families",
                funderDefined: true,
              },
              {
                id: "indicator-2",
                name: "Plans completed",
                status: "on_track",
                actualValue: null,
                targetValue: null,
                unit: null,
                funderDefined: false,
              },
            ],
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: true },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    });

    renderProgramDetailPage();

    expect(screen.getByText("Funder-defined indicator")).toBeInTheDocument();
    expect(screen.getByText("Internal indicator")).toBeInTheDocument();
    expect(screen.getByText("10 / 25 families")).toBeInTheDocument();
    expect(screen.getByText("Missing / Missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    fireEvent.change(screen.getByLabelText("Outcome name"), {
      target: { value: "Youth graduate" },
    });
    fireEvent.change(screen.getByLabelText("What should change?"), {
      target: { value: "Students finish the program." },
    });
    fireEvent.change(screen.getByLabelText("Who is this for?"), {
      target: { value: "Students" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save outcome" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockCreateOutcomeMutate).toHaveBeenCalledWith({
        programId: PROGRAM_ID,
        name: "Youth graduate",
        statement: "Students finish the program.",
        targetPopulation: "Students",
        status: "active",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Add indicator" })[0]!);
    fireEvent.change(screen.getByLabelText("Indicator name"), {
      target: { value: "Attendance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Output" }));
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    fireEvent.change(screen.getByLabelText("Target value"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Baseline"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "students" },
    });
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "Attendance sheet" },
    });
    fireEvent.click(screen.getByLabelText("Funder-defined"));
    fireEvent.submit(screen.getByRole("button", { name: "Save number" }).closest("form")!);

    await waitFor(() => {
      expect(hoisted.mockCreateIndicatorMutate).toHaveBeenCalledWith({
        name: "Attendance",
        indicatorType: "output",
        direction: "increase",
        targetValue: 100,
        baselineValue: 50,
        unit: "students",
        source: "Attendance sheet",
        funderDefined: true,
        reportingCadence: "annual",
      });
    });
  });

  it("shows outcome and indicator validation and fallback errors", async () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockCreateOutcomeMutate.mockRejectedValueOnce("offline");
    hoisted.mockCreateIndicatorMutate.mockRejectedValueOnce("offline");

    renderProgramDetailPage();

    fireEvent.change(screen.getByLabelText("Outcome name"), {
      target: { value: "Youth graduate" },
    });
    fireEvent.change(screen.getByLabelText("What should change?"), {
      target: { value: "Students finish the program." },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save outcome" }).closest("form")!);
    expect(await screen.findByText("Unable to save outcome.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Indicator name"), {
      target: { value: "Attendance" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save number" }).closest("form")!);
    expect(await screen.findByText("Unable to save number.")).toBeInTheDocument();
  });

  it("renders program detail outcome loading, error, and pending states", () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockUseOutcomes.mockReturnValue({
      isLoading: false,
      isError: true,
      isFetching: false,
    });

    const { rerenderProgramDetailPage } = renderProgramDetailPage();
    expect(screen.getByText("Unable to load outcomes.")).toBeInTheDocument();

    hoisted.mockUseOutcomes.mockReturnValue({
      isLoading: true,
      isError: false,
      isFetching: false,
    });
    rerenderProgramDetailPage();
    expect(document.querySelectorAll(".h-36").length).toBeGreaterThan(0);

    hoisted.mockUseOutcomes.mockReturnValue({
      data: {
        data: [
          {
            id: "outcome-empty",
            name: "Families stay housed",
            statement: "Families keep stable housing.",
            status: "active",
            indicators: [],
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: true },
      },
      isLoading: false,
      isError: false,
      isFetching: true,
    });
    hoisted.mockUseCreateOutcome.mockReturnValue({
      mutateAsync: hoisted.mockCreateOutcomeMutate,
      isPending: true,
    });
    hoisted.mockUseCreateOutcomeIndicator.mockReturnValue({
      mutateAsync: hoisted.mockCreateIndicatorMutate,
      isPending: true,
    });
    rerenderProgramDetailPage();

    expect(screen.getByText("No indicators yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    const savingButtons = screen.getAllByRole("button", { name: "Saving…" });
    expect(savingButtons).toHaveLength(2);
    expect(savingButtons[0]).toBeDisabled();
    expect(savingButtons[1]).toBeDisabled();
  });

  it("renders read-only outcomes when indicator data is omitted", () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { programs: "read" },
    });
    hoisted.mockUseOutcomes.mockReturnValue({
      data: {
        data: [
          {
            id: "outcome-without-indicators",
            name: "Families stay housed",
            statement: "Families keep stable housing.",
            status: "active",
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: false },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    });

    renderProgramDetailPage();

    expect(screen.getByText("Families stay housed")).toBeInTheDocument();
    expect(screen.getByText("No indicators yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add indicator" })).not.toBeInTheDocument();
  });

  it("renders locked outcome tracking for plans without the entitlement", () => {
    hoisted.routeState.params = { programId: PROGRAM_ID };
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "starter" } });

    renderProgramDetailPage();

    expect(screen.getByText("Outcome tracking is locked")).toBeInTheDocument();
    expect(
      screen.getByText("Upgrade to Growth. Then track goals for this program."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add outcome" })).not.toBeInTheDocument();
  });

  it("renders program detail loading and error states", () => {
    hoisted.routeState.params = { programId: "program-1" };
    hoisted.mockUseProgram.mockReturnValue({
      isLoading: true,
      isError: false,
    });

    const { rerenderProgramDetailPage } = renderProgramDetailPage();
    expect(document.querySelectorAll(".h-16").length).toBeGreaterThan(0);

    hoisted.mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: true,
    });
    rerenderProgramDetailPage();

    expect(screen.getByText("Unable to load program.")).toBeInTheDocument();
  });

  it("renders program detail fallbacks when optional data is absent", () => {
    hoisted.routeState.params = { programId: "program-1" };
    hoisted.mockUseProgram.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    renderProgramDetailPage();

    expect(screen.getByRole("heading", { name: "Program" })).toBeInTheDocument();
    expect(
      screen.getByText("Program funding, budgets, grants, expenses, and outcomes."),
    ).toBeInTheDocument();
    expect(screen.getByText("No program budgets recorded yet")).toBeInTheDocument();
  });

  it("renders error states", () => {
    hoisted.mockUsePrograms.mockReturnValue({ isError: true, isLoading: false });
    hoisted.mockUseProgramBudgetVsActual.mockReturnValue({ data: { rows: [] } });

    render(<ProgramsPage />);

    expect(screen.getByText("Unable to load programs.")).toBeInTheDocument();
  });
});
