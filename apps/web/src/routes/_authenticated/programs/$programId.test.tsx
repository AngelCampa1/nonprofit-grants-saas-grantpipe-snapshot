import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

interface RouteConfig {
  component: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: unknown }>;
  pendingComponent?: React.ComponentType;
}

const {
  mockUseProgram,
  mockUseParams,
  mockUseProgramMutations,
  mockUseCreateProgramBudget,
  mockUseUpdateProgramBudget,
  mockUseOutcomes,
  mockUseCreateOutcome,
  mockUseCreateOutcomeIndicator,
  mockUseSession,
  mockUseOrgBilling,
  mockUseOrgTeam,
  capturedRouteConfig,
} = vi.hoisted(() => ({
  mockUseProgram: vi.fn(),
  mockUseParams: vi.fn().mockReturnValue({ programId: "program-1" }),
  mockUseProgramMutations: vi.fn(),
  mockUseCreateProgramBudget: vi.fn(),
  mockUseUpdateProgramBudget: vi.fn(),
  mockUseOutcomes: vi.fn(),
  mockUseCreateOutcome: vi.fn(),
  mockUseCreateOutcomeIndicator: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseOrgTeam: vi.fn(),
  capturedRouteConfig: {} as { config?: unknown },
}));

function getRouteConfig(): RouteConfig {
  return capturedRouteConfig.config as RouteConfig;
}

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: unknown) => {
    capturedRouteConfig.config = config;
    return { ...(config as object), useParams: mockUseParams };
  },
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) =>
    React.createElement("a", { href: to, ...rest }, children),
}));

vi.mock("../../../hooks/use-programs", () => ({
  useProgram: (id: string) => mockUseProgram(id),
  useProgramMutations: (id: string) => mockUseProgramMutations(id),
  useCreateProgramBudget: () => mockUseCreateProgramBudget(),
  useUpdateProgramBudget: (budgetId: string, programId: string) =>
    mockUseUpdateProgramBudget(budgetId, programId),
}));

vi.mock("../../../hooks/use-outcomes", () => ({
  useOutcomes: (params: unknown) => mockUseOutcomes(params),
  useCreateOutcome: () => mockUseCreateOutcome(),
  useCreateOutcomeIndicator: (outcomeId: string) => mockUseCreateOutcomeIndicator(outcomeId),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: () => mockUseOrgBilling(),
  useOrgTeam: () => mockUseOrgTeam(),
}));

vi.mock("../../../lib/access-control", () => ({
  canAccessFeature: () => true,
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

import { Route } from "./$programId";

const ProgramDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const defaultSession = {
  memberRole: "admin",
  memberPermissions: [],
};

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

const defaultUpdateProgram = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const defaultArchiveProgram = {
  mutateAsync: vi.fn(),
  isPending: false,
};

function makeBudgetMutation() {
  return { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
}

function makeOutcomeMutation() {
  return { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
}

function setupWithProgram(
  programData: Record<string, unknown>,
  overrides?: {
    session?: Partial<typeof defaultSession>;
    billing?: Partial<typeof defaultBilling>;
    orgTeam?: Partial<typeof defaultOrgTeam>;
    updateProgram?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
    archiveProgram?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
    createBudget?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
    updateBudget?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
    createOutcome?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
    createIndicator?: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
  },
) {
  mockUseProgram.mockReturnValue({
    isLoading: false,
    isError: false,
    data: programData,
  });
  mockUseSession.mockReturnValue({ ...defaultSession, ...overrides?.session });
  mockUseOrgBilling.mockReturnValue({ ...defaultBilling, ...overrides?.billing });
  mockUseOrgTeam.mockReturnValue({ ...defaultOrgTeam, ...overrides?.orgTeam });
  mockUseProgramMutations.mockReturnValue({
    updateProgram: overrides?.updateProgram ?? defaultUpdateProgram,
    archiveProgram: overrides?.archiveProgram ?? defaultArchiveProgram,
  });
  mockUseCreateProgramBudget.mockReturnValue(overrides?.createBudget ?? makeBudgetMutation());
  mockUseUpdateProgramBudget.mockReturnValue(overrides?.updateBudget ?? makeBudgetMutation());
  mockUseOutcomes.mockReturnValue({
    isLoading: false,
    isFetching: false,
    isError: false,
    data: { data: [], pagination: { page: 1, pageSize: 10, hasNextPage: false } },
  });
  mockUseCreateOutcome.mockReturnValue(overrides?.createOutcome ?? makeOutcomeMutation());
  mockUseCreateOutcomeIndicator.mockReturnValue(
    overrides?.createIndicator ?? makeOutcomeMutation(),
  );
  return render(<ProgramDetailPage />);
}

const baseProgram = {
  id: "program-1",
  name: "Youth Services",
  code: "YOUTH",
  description: "Youth programming for the community.",
  status: "active",
  budgets: [],
  grantAllocations: [],
  expenseAllocations: [],
  impactMetricLinks: [],
};

describe("ProgramDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ programId: "program-1" });
    mockUseProgramMutations.mockReturnValue({
      updateProgram: defaultUpdateProgram,
      archiveProgram: defaultArchiveProgram,
    });
    mockUseCreateProgramBudget.mockReturnValue(makeBudgetMutation());
    mockUseUpdateProgramBudget.mockReturnValue(makeBudgetMutation());
    mockUseOutcomes.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: { data: [], pagination: { page: 1, pageSize: 10, hasNextPage: false } },
    });
    mockUseCreateOutcome.mockReturnValue(makeOutcomeMutation());
    mockUseCreateOutcomeIndicator.mockReturnValue(makeOutcomeMutation());
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
  });

  it("renders skeletons while the query is loading", () => {
    mockUseProgram.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<ProgramDetailPage />);
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("renders the error alert with a RetryButton when the query errors", () => {
    const refetch = vi.fn();
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch,
      isFetching: false,
    });
    render(<ProgramDetailPage />);
    expect(screen.getByText("Unable to load program.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders the breadcrumb back to the programs index", () => {
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        id: "program-1",
        name: "Youth Services",
        code: "YOUTH",
        budgets: [],
      },
    });
    render(<ProgramDetailPage />);
    const link = screen.getByRole("link", { name: "Programs" });
    expect(link).toHaveAttribute("href", "/programs");
    expect(screen.getAllByText("Youth Services").length).toBeGreaterThan(0);
  });

  it("renders the TeachAndActEmptyState when there are no budgets", () => {
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        id: "program-1",
        name: "Youth Services",
        budgets: [],
      },
    });
    render(<ProgramDetailPage />);
    expect(screen.getByText("No program budgets recorded yet")).toBeInTheDocument();
  });

  it("renders budget rows and totals when budgets are present", () => {
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        id: "program-1",
        name: "Youth Services",
        budgets: [
          {
            id: "b1",
            name: "FY26 Operations",
            status: "approved",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-12-31T00:00:00.000Z",
            lines: [
              { id: "l1", category: "Personnel", budgetedCents: 250000 },
              { id: "l2", category: "Supplies", budgetedCents: 50000 },
            ],
          },
        ],
        grantAllocations: [{ id: "g1", grantId: "x" }],
        expenseAllocations: [],
        impactMetricLinks: [],
      },
    });
    render(<ProgramDetailPage />);
    expect(screen.getByText("FY26 Operations")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getAllByText("$3,000").length).toBeGreaterThan(0);
  });

  it("renders program outcomes from the outcome query", () => {
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: false,
      data: baseProgram,
    });
    mockUseOutcomes.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        data: [
          {
            id: "outcome-1",
            name: "School readiness",
            statement: "Students can start school ready.",
            status: "active",
            indicators: [
              {
                id: "indicator-1",
                name: "Reading score",
                status: "on_track",
                actualValue: 82,
                targetValue: 80,
                unit: "%",
                funderDefined: true,
              },
            ],
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: false },
      },
    });
    render(<ProgramDetailPage />);

    expect(mockUseOutcomes).toHaveBeenCalledWith({
      programId: "program-1",
      enabled: true,
      page: 1,
      pageSize: 10,
    });
    expect(screen.getByText("Outcome goals")).toBeInTheDocument();
    expect(screen.getByText("School readiness")).toBeInTheDocument();
    expect(screen.getByText("Reading score")).toBeInTheDocument();
    expect(screen.getByText("82 / 80 %")).toBeInTheDocument();
  });

  it("requests more outcomes from the load more control", async () => {
    mockUseProgram.mockReturnValue({
      isLoading: false,
      isError: false,
      data: baseProgram,
    });
    mockUseOutcomes.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        data: [
          {
            id: "outcome-1",
            name: "School readiness",
            statement: "Students can start school ready.",
            status: "active",
            indicators: [],
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: true },
      },
    });
    render(<ProgramDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(mockUseOutcomes).toHaveBeenLastCalledWith({
        programId: "program-1",
        enabled: true,
        page: 1,
        pageSize: 20,
      });
    });
  });

  it("shows a locked outcome state without loading outcomes below Growth", () => {
    setupWithProgram(baseProgram, {
      billing: {
        data: {
          ...defaultBilling.data,
          planTier: "starter",
        },
      },
    });

    expect(mockUseOutcomes).toHaveBeenCalledWith({
      programId: "program-1",
      enabled: false,
      page: 1,
      pageSize: 10,
    });
    expect(screen.getByText("Outcome tracking is locked")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Growth/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add outcome/i })).not.toBeInTheDocument();
  });

  it("creates an outcome from the program detail page", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseParams.mockReturnValue({ programId: "00000000-0000-4000-8000-000000000010" });
    setupWithProgram(baseProgram, {
      createOutcome: { mutateAsync, isPending: false },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /add outcome/i })[0]!);
    fireEvent.change(screen.getByLabelText(/outcome name/i), {
      target: { value: "School readiness" },
    });
    fireEvent.change(screen.getByLabelText(/what should change/i), {
      target: { value: "Students can start school ready." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save outcome/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          programId: "00000000-0000-4000-8000-000000000010",
          name: "School readiness",
          statement: "Students can start school ready.",
          status: "active",
        }),
      );
    });
  });

  it("creates a funder indicator under an outcome", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      createIndicator: { mutateAsync, isPending: false },
    });
    mockUseOutcomes.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        data: [
          {
            id: "outcome-1",
            name: "School readiness",
            statement: "Students can start school ready.",
            status: "active",
            indicators: [],
          },
        ],
        pagination: { page: 1, pageSize: 10, hasNextPage: false },
      },
    });
    render(<ProgramDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /add indicator/i }));
    fireEvent.change(screen.getByLabelText(/indicator name/i), {
      target: { value: "Reading score" },
    });
    fireEvent.change(screen.getByLabelText(/target value/i), { target: { value: "80" } });
    fireEvent.click(screen.getByLabelText(/funder-defined/i));
    fireEvent.click(screen.getByRole("button", { name: /save number/i }));

    await waitFor(() => {
      expect(mockUseCreateOutcomeIndicator).toHaveBeenLastCalledWith("outcome-1");
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Reading score",
          targetValue: 80,
          funderDefined: true,
        }),
      );
    });
  });

  it("exposes errorComponent and pendingComponent route config", () => {
    const config = getRouteConfig();
    expect(config.errorComponent).toBeDefined();
    expect(config.pendingComponent).toBeDefined();

    const ErrorComponent = config.errorComponent;
    if (!ErrorComponent) throw new Error("errorComponent missing");
    const { unmount: unmountError } = render(<ErrorComponent error={new Error("boom")} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    unmountError();

    const { unmount: unmountError2 } = render(<ErrorComponent error="raw string" />);
    expect(screen.getByText("Unknown error")).toBeInTheDocument();
    unmountError2();

    const PendingComponent = config.pendingComponent;
    if (!PendingComponent) throw new Error("pendingComponent missing");
    const { container } = render(<PendingComponent />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("exports the Route object created by createFileRoute", () => {
    expect(Route).toBeDefined();
    expect(typeof Route).toBe("object");
  });
});

describe("ProgramDetailPage — edit dialog (N3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ programId: "program-1" });
    mockUseCreateProgramBudget.mockReturnValue(makeBudgetMutation());
    mockUseUpdateProgramBudget.mockReturnValue(makeBudgetMutation());
  });

  it("renders the Edit program button when the user can edit", () => {
    setupWithProgram(baseProgram);
    expect(screen.getByRole("button", { name: /edit program/i })).toBeInTheDocument();
  });

  it("does not render the Edit program button when the user is a viewer", () => {
    setupWithProgram(baseProgram, {
      session: { memberRole: "viewer" },
      billing: {
        data: {
          planTier: "audit_ready",
          billingCycle: "monthly",
          status: "active",
          trialEndsAt: null,
        },
      },
    });
    expect(screen.queryByRole("button", { name: /edit program/i })).not.toBeInTheDocument();
  });

  it("opens the edit dialog with pre-populated fields on button click", () => {
    setupWithProgram(baseProgram);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    expect(screen.getByText("Edit program details")).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/program name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Youth Services");
    const codeInput = screen.getByLabelText(/^code$/i) as HTMLInputElement;
    expect(codeInput.value).toBe("YOUTH");
  });

  it("pre-populates the description field", () => {
    setupWithProgram(baseProgram);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe("Youth programming for the community.");
  });

  it("lists org team members as options in the owner select inside the edit dialog", () => {
    setupWithProgram(baseProgram);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("calls updateProgram.mutateAsync with changed name on submit", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const nameInput = screen.getByLabelText(/program name/i);
    fireEvent.change(nameInput, { target: { value: "Youth Services Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Youth Services Updated" }),
      );
    });
  });

  it("closes the dialog after a successful save", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.queryByText("Edit program details")).not.toBeInTheDocument();
    });
  });

  it("disables Save changes when the name is cleared", () => {
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync: vi.fn(), isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/program name/i), { target: { value: "Renamed" } });
    expect(save).toBeEnabled();
  });

  it("disables the submit button and shows Saving… while isPending", () => {
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync: vi.fn(), isPending: true },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const submitBtn = screen.getByRole("button", { name: /saving/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows a server error when mutateAsync rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("update failed"));
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.getByText("update failed")).toBeInTheDocument();
    });
  });

  it("prevents closing the dialog while the mutation is pending", async () => {
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync: vi.fn(() => new Promise(() => {})), isPending: true },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    expect(screen.getByText("Edit program details")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByText("Edit program details")).toBeInTheDocument();
    });
  });

  it("resets form to current program values when dialog is closed and reopened", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const nameInput = screen.getByLabelText(/program name/i);
    fireEvent.change(nameInput, { target: { value: "Changed Name" } });
    // Close without saving
    fireEvent.keyDown(document.body, { key: "Escape" });
    // Reopen
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const nameInputAfterReopen = screen.getByLabelText(/program name/i) as HTMLInputElement;
    expect(nameInputAfterReopen.value).toBe("Youth Services");
  });

  it("submits ownerUserId when an owner is selected in the edit dialog", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const ownerCombobox = screen.getByLabelText(/owner/i);
    fireEvent.change(ownerCombobox, { target: { value: "00000000-0000-4000-8000-000000000001" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: "00000000-0000-4000-8000-000000000001" }),
      );
    });
  });

  it("shows a validation error when program name is cleared", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const nameInput = screen.getByLabelText(/program name/i);
    fireEvent.change(nameInput, { target: { value: "" } });
    const form = screen
      .getByRole("button", { name: /save changes/i })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Unable to save program")).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders 'Active' badge when budget status is null (formatStatus fallback)", () => {
    setupWithProgram({
      id: "program-1",
      name: "Youth Services",
      budgets: [
        {
          id: "b1",
          name: "FY26 Draft",
          status: null,
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-12-31T00:00:00.000Z",
          lines: [{ id: "l1", category: "Personnel", budgetedCents: 1000 }],
        },
      ],
    });
    // formatStatus(null) returns "Active" (the fallback default)
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders zero budget total when budget has no lines (lines undefined)", () => {
    setupWithProgram({
      id: "program-1",
      name: "Youth Services",
      budgets: [
        {
          id: "b1",
          name: "FY26 Draft",
          status: "draft",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-12-31T00:00:00.000Z",
          // no lines property → budget.lines ?? []
        },
      ],
    });
    expect(screen.getByText("FY26 Draft")).toBeInTheDocument();
    // Budget total with no lines should be $0 (multiple $0 elements expected)
    expect(screen.getAllByText("$0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Program' fallback text when data is undefined (post-load)", () => {
    mockUseProgram.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockUseProgramMutations.mockReturnValue({
      updateProgram: defaultUpdateProgram,
      archiveProgram: defaultArchiveProgram,
    });
    render(<ProgramDetailPage />);
    // The kicker and title both fall back to "Program" when data is undefined
    expect(screen.getAllByText("Program").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the dialog with empty defaults when program has no code, description, or owner", () => {
    setupWithProgram({
      id: "program-1",
      name: "Minimal Program",
      // no code, description, ownerUserId
      budgets: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const codeInput = screen.getByLabelText(/^code$/i) as HTMLInputElement;
    expect(codeInput.value).toBe("");
    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe("");
  });

  it("populates empty strings when programQuery.data is undefined on open", () => {
    // Set mocks directly for this edge case
    mockUseProgram.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    mockUseSession.mockReturnValue(defaultSession);
    mockUseOrgBilling.mockReturnValue(defaultBilling);
    mockUseOrgTeam.mockReturnValue(defaultOrgTeam);
    mockUseProgramMutations.mockReturnValue({
      updateProgram: defaultUpdateProgram,
      archiveProgram: defaultArchiveProgram,
    });
    render(<ProgramDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const nameInput = screen.getByLabelText(/program name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("");
    const codeInput = screen.getByLabelText(/^code$/i) as HTMLInputElement;
    expect(codeInput.value).toBe("");
  });

  it("submits with undefined code when the code field is cleared", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    // Clear the code field
    const codeInput = screen.getByLabelText(/^code$/i);
    fireEvent.change(codeInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "Youth Services" }));
    });
    // code should not be included (falsy → undefined)
    const callArg = (mutateAsync.mock.calls[0] as [Record<string, unknown>])[0];
    expect(callArg.code).toBeUndefined();
  });

  it("surfaces non-Error server errors with fallback message when mutateAsync throws unknown", async () => {
    const mutateAsync = vi.fn().mockRejectedValue("string error");
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.getByText("Unable to save program.")).toBeInTheDocument();
    });
  });

  it("renders owner select with fallback to user.id when name and email are absent", () => {
    setupWithProgram(baseProgram, {
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
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    // When name and email are null, falls back to user.id
    expect(screen.getByText("00000000-0000-4000-8000-000000000004")).toBeInTheDocument();
  });

  it("renders no owner options when orgTeam data is undefined", () => {
    setupWithProgram(baseProgram, {
      orgTeam: { data: undefined, isLoading: false, isError: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    // Alice Admin and bob@example.com should not appear since data is undefined
    expect(screen.queryByText("Alice Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("updates code field in the edit dialog", () => {
    setupWithProgram(baseProgram);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const codeInput = screen.getByLabelText(/^code$/i) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "NEWCODE" } });
    expect(codeInput.value).toBe("NEWCODE");
  });

  it("shows a parse error when code exceeds the max length", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const codeInput = screen.getByLabelText(/^code$/i);
    // code max is 50 chars; pass 51 chars
    fireEvent.change(codeInput, { target: { value: "A".repeat(51) } });
    const form = screen
      .getByRole("button", { name: /save changes/i })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Unable to save program")).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("updates description in the edit dialog", () => {
    setupWithProgram(baseProgram);
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Updated description" } });
    expect((descInput as HTMLTextAreaElement).value).toBe("Updated description");
  });

  it("disables the description textarea while isPending", () => {
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync: vi.fn(), isPending: true },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    const descInput = screen.getByLabelText(/description/i);
    expect(descInput).toBeDisabled();
  });

  it("updates status select in the edit dialog and includes it in submission", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(baseProgram, {
      updateProgram: { mutateAsync, isPending: false },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit program/i }));
    // Change status via the status select trigger (id="edit-program-status")
    const statusCombobox = document.querySelector("#edit-program-status") as HTMLInputElement;
    expect(statusCombobox).not.toBeNull();
    fireEvent.change(statusCombobox, { target: { value: "archived" } });
    fireEvent.change(screen.getByLabelText(/program name/i), {
      target: { value: "Youth Services" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    });
  });
});

const budgetProgram = {
  id: "program-1",
  name: "Youth Services",
  code: "YOUTH",
  status: "active",
  budgets: [
    {
      id: "00000000-0000-4000-8000-0000000000b1",
      name: "FY26 Operations",
      status: "approved",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T00:00:00.000Z",
      lines: [
        { id: "l1", category: "Personnel", budgetedCents: 250000, notes: "Salaries" },
        { id: "l2", category: "Supplies", budgetedCents: 50000 },
      ],
    },
  ],
  grantAllocations: [],
  expenseAllocations: [],
  impactMetricLinks: [],
};

function openCreateBudgetDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Add budget" }));
}

// jsdom blocks implicit submit-on-click when a form has constrained
// (type=date/number) inputs, so dispatch submit on the form directly.
function submitBudgetForm(buttonName: "Add" | "Save") {
  fireEvent.submit(screen.getByRole("button", { name: buttonName }).closest("form")!);
}

const BUDGET_PROGRAM_UUID = "00000000-0000-4000-8000-0000000000a1";

describe("ProgramDetailPage — budget create/edit (Wave 51)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ programId: BUDGET_PROGRAM_UUID });
    mockUseCreateProgramBudget.mockReturnValue(makeBudgetMutation());
    mockUseUpdateProgramBudget.mockReturnValue(makeBudgetMutation());
  });

  it("does not render Add budget or Edit budget buttons for viewers", () => {
    setupWithProgram(budgetProgram, { session: { memberRole: "viewer" } });
    expect(screen.queryByRole("button", { name: "Add budget" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit budget" })).not.toBeInTheDocument();
  });

  it("opens the Add budget dialog with one empty line from the section header", () => {
    setupWithProgram(budgetProgram);
    openCreateBudgetDialog();
    expect(screen.getByText("Set a budget period. Then add line items.")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 category")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("opens the Add budget dialog from the empty-state primary action when no budgets exist", () => {
    setupWithProgram({ ...budgetProgram, budgets: [] });
    fireEvent.click(screen.getByRole("button", { name: "Add budget period" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders the Open help link in the empty state for viewers (no edit access)", () => {
    setupWithProgram({ ...budgetProgram, budgets: [] }, { session: { memberRole: "viewer" } });
    expect(screen.getByRole("link", { name: "Open help" })).toHaveAttribute("href", "/help");
  });

  it("creates a budget with trimmed name, dollar→cents lines, and notes", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    fireEvent.change(screen.getByLabelText(/Budget name/), {
      target: { value: "  FY27 Plan  " },
    });
    fireEvent.change(document.querySelector("#budget-period-start") as HTMLInputElement, {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(document.querySelector("#budget-period-end") as HTMLInputElement, {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), {
      target: { value: "Personnel" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "2500.50" } });
    fireEvent.change(screen.getByLabelText("Line 1 notes"), { target: { value: "Two FTE" } });
    submitBudgetForm("Add");
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        programId: BUDGET_PROGRAM_UUID,
        name: "FY27 Plan",
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
        status: "draft",
        lines: [{ category: "Personnel", budgetedCents: 250050, notes: "Two FTE" }],
      });
    });
  });

  it("adds and removes budget lines, and the first line cannot be removed", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    // Only one line → no remove button
    expect(screen.queryByRole("button", { name: "Remove line 1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByLabelText("Line 2 category")).toBeInTheDocument();
    // Now removable
    fireEvent.click(screen.getByRole("button", { name: "Remove line 2" }));
    expect(screen.queryByLabelText("Line 2 category")).not.toBeInTheDocument();
  });

  it("surfaces a validation error when a line amount is zero", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    fireEvent.change(screen.getByLabelText(/Budget name/), { target: { value: "FY27" } });
    fireEvent.change(document.querySelector("#budget-period-start") as HTMLInputElement, {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(document.querySelector("#budget-period-end") as HTMLInputElement, {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), { target: { value: "Personnel" } });
    // amount left empty → centsFromInput("") === 0 → fails .positive()
    const form = screen.getByRole("button", { name: "Add" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Unable to save budget")).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces a server error when create rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("budget create failed"));
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    fireEvent.change(screen.getByLabelText(/Budget name/), { target: { value: "FY27" } });
    fireEvent.change(document.querySelector("#budget-period-start") as HTMLInputElement, {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(document.querySelector("#budget-period-end") as HTMLInputElement, {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), { target: { value: "Personnel" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "100" } });
    submitBudgetForm("Add");
    await waitFor(() => {
      expect(screen.getByText("budget create failed")).toBeInTheDocument();
    });
  });

  it("surfaces a non-Error fallback message when create rejects with a non-Error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue("nope");
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    fireEvent.change(screen.getByLabelText(/Budget name/), { target: { value: "FY27" } });
    fireEvent.change(document.querySelector("#budget-period-start") as HTMLInputElement, {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(document.querySelector("#budget-period-end") as HTMLInputElement, {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), { target: { value: "Personnel" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "100" } });
    submitBudgetForm("Add");
    await waitFor(() => {
      expect(screen.getByText("Unable to save budget.")).toBeInTheDocument();
    });
  });

  it("opens the Edit budget dialog pre-populated from the row and updates the budget", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(budgetProgram, { updateBudget: { mutateAsync, isPending: false } });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    expect(screen.getByLabelText(/Budget name/)).toHaveValue("FY26 Operations");
    expect(document.querySelector("#budget-period-start")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("Line 1 category")).toHaveValue("Personnel");
    expect(screen.getByLabelText("Line 1 amount")).toHaveValue(2500);
    expect(screen.getByLabelText("Line 1 notes")).toHaveValue("Salaries");
    fireEvent.change(screen.getByLabelText(/Budget name/), { target: { value: "FY26 Revised" } });
    submitBudgetForm("Save");
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "FY26 Revised",
          periodStart: "2026-01-01",
          periodEnd: "2026-12-31",
          status: "approved",
        }),
      );
    });
    // The hook was parametrized by the edited budget id
    expect(mockUseUpdateProgramBudget).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-0000000000b1",
      BUDGET_PROGRAM_UUID,
    );
  });

  it("surfaces an error when the budget update rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("budget update failed"));
    setupWithProgram(budgetProgram, { updateBudget: { mutateAsync, isPending: false } });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    submitBudgetForm("Save");
    await waitFor(() => {
      expect(screen.getByText("budget update failed")).toBeInTheDocument();
    });
  });

  it("shows a fallback when editing a budget with an unknown status and no lines", () => {
    setupWithProgram({
      ...budgetProgram,
      budgets: [
        {
          id: "00000000-0000-4000-8000-0000000000c2",
          name: "Loose Budget",
          status: "weird_status",
          periodStart: "2026-03-01T00:00:00.000Z",
          periodEnd: "2026-06-30T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    // unknown status falls back to "draft"; missing lines → one empty line
    expect(document.querySelector("#budget-status")).toHaveValue("draft");
    expect(screen.getByLabelText("Line 1 category")).toHaveValue("");
  });

  it("disables the submit button and shows Adding… while a budget create mutation is pending", () => {
    setupWithProgram(budgetProgram, {
      createBudget: { mutateAsync: vi.fn(() => new Promise(() => {})), isPending: true },
    });
    openCreateBudgetDialog();
    const submit = screen.getByRole("button", { name: /adding/i });
    expect(submit).toBeDisabled();
  });

  it("disables the submit button and shows Saving… while a budget update mutation is pending", () => {
    setupWithProgram(budgetProgram, {
      updateBudget: { mutateAsync: vi.fn(() => new Promise(() => {})), isPending: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    const submit = screen.getByRole("button", { name: /saving/i });
    expect(submit).toBeDisabled();
  });

  it("prevents closing the budget dialog while a mutation is pending", async () => {
    setupWithProgram(budgetProgram, {
      createBudget: { mutateAsync: vi.fn(() => new Promise(() => {})), isPending: true },
    });
    openCreateBudgetDialog();
    expect(screen.getByText("Set a budget period. Then add line items.")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByText("Set a budget period. Then add line items.")).toBeInTheDocument();
    });
  });

  it("changes the budget status select and submits the new status on create", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    setupWithProgram(budgetProgram, { createBudget: { mutateAsync, isPending: false } });
    openCreateBudgetDialog();
    fireEvent.change(screen.getByLabelText(/Budget name/), { target: { value: "FY27" } });
    fireEvent.change(document.querySelector("#budget-period-start") as HTMLInputElement, {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(document.querySelector("#budget-period-end") as HTMLInputElement, {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(document.querySelector("#budget-status") as HTMLInputElement, {
      target: { value: "approved" },
    });
    fireEvent.change(screen.getByLabelText("Line 1 category"), { target: { value: "Personnel" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "100" } });
    submitBudgetForm("Add");
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
    });
  });
});
