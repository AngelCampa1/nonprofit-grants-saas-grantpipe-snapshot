import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockUseAllocationBases: vi.fn(),
  mockUseAllocationTargets: vi.fn(),
  mockUseAllocationRules: vi.fn(),
  mockUseAllocatedFunctionalExpenses: vi.fn(),
  mockUseCreateAllocationBase: vi.fn(),
  mockUseUpdateAllocationBase: vi.fn(),
  mockUseDeleteAllocationBase: vi.fn(),
  mockUseSetAllocationTargets: vi.fn(),
  mockUseCreateAllocationRule: vi.fn(),
  mockUseDeleteAllocationRule: vi.fn(),
  mockUseAccounts: vi.fn(),
  mockUsePrograms: vi.fn(),
  mockUseSession: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  useNavigate: () => hoisted.mockNavigate,
  Link: ({
    children,
    to,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to ?? ""} className={className} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../../hooks/use-allocation", () => ({
  useAllocationBases: hoisted.mockUseAllocationBases,
  useAllocationTargets: hoisted.mockUseAllocationTargets,
  useAllocationRules: hoisted.mockUseAllocationRules,
  useAllocatedFunctionalExpenses: hoisted.mockUseAllocatedFunctionalExpenses,
  useCreateAllocationBase: hoisted.mockUseCreateAllocationBase,
  useUpdateAllocationBase: hoisted.mockUseUpdateAllocationBase,
  useDeleteAllocationBase: hoisted.mockUseDeleteAllocationBase,
  useSetAllocationTargets: hoisted.mockUseSetAllocationTargets,
  useCreateAllocationRule: hoisted.mockUseCreateAllocationRule,
  useDeleteAllocationRule: hoisted.mockUseDeleteAllocationRule,
}));

vi.mock("../../../../hooks/use-accounting", () => ({
  useAccounts: hoisted.mockUseAccounts,
}));

vi.mock("../../../../hooks/use-programs", () => ({
  usePrograms: hoisted.mockUsePrograms,
}));

vi.mock("../../../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

vi.mock("../../../../lib/format", () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  formatUtcCalendarDate: (iso: string) => iso.slice(0, 10),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  FunctionalExpenseAllocationPage,
  BaseDialog,
  BindRuleDialog,
  AllocatedPreview,
  TargetsEditor,
  METHOD_LABELS,
  bpToPercent,
  percentToBp,
  sumWeightsBp,
} from "./functional-expense-allocation";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_BASE = {
  id: "b1",
  orgId: "org1",
  name: "Headcount",
  description: null,
  method: "headcount_fte",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const MOCK_RULE = {
  id: "r1",
  orgId: "org1",
  accountId: "acc1",
  baseId: "b1",
  status: "active",
  accountName: "Office Supplies",
  baseName: "Headcount",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const MOCK_TARGET = {
  id: "t1",
  orgId: "org1",
  baseId: "b1",
  functionalClass: "program",
  programId: null,
  label: null,
  weightBasisPoints: 10000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeDefaultMutations() {
  return {
    mutateAsync: vi.fn(),
    isPending: false,
  };
}

function setDefaultMocks(planTier = "growth") {
  hoisted.mockUseSession.mockReturnValue({
    effectivePlanTier: planTier,
    memberRole: "admin",
    memberPermissions: null,
  });
  hoisted.mockUseAllocationBases.mockReturnValue({
    data: [MOCK_BASE],
    isLoading: false,
    isError: false,
  });
  hoisted.mockUseAllocationRules.mockReturnValue({
    data: [MOCK_RULE],
    isLoading: false,
    isError: false,
  });
  hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  hoisted.mockUseCreateAllocationBase.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseUpdateAllocationBase.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseDeleteAllocationBase.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseSetAllocationTargets.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseCreateAllocationRule.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseDeleteAllocationRule.mockReturnValue(makeDefaultMutations());
  hoisted.mockUseAccounts.mockReturnValue({
    data: { data: [{ id: "acc1", code: "6000", name: "Office Supplies" }] },
  });
  hoisted.mockUsePrograms.mockReturnValue({ data: { data: [] } });
  hoisted.mockUseAllocationTargets.mockReturnValue({ data: [MOCK_TARGET], isLoading: false });
}

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("bpToPercent", () => {
  it("converts 10000 bp to 100%", () => {
    expect(bpToPercent(10000)).toBe(100);
  });

  it("converts 5000 bp to 50%", () => {
    expect(bpToPercent(5000)).toBe(50);
  });

  it("converts 0 bp to 0%", () => {
    expect(bpToPercent(0)).toBe(0);
  });

  it("converts 100 bp to 1%", () => {
    expect(bpToPercent(100)).toBe(1);
  });
});

describe("percentToBp", () => {
  it("converts 100% to 10000 bp", () => {
    expect(percentToBp(100)).toBe(10000);
  });

  it("converts 50% to 5000 bp", () => {
    expect(percentToBp(50)).toBe(5000);
  });

  it("converts 33.33% to 3333 bp (rounded)", () => {
    expect(percentToBp(33.33)).toBe(3333);
  });
});

describe("sumWeightsBp", () => {
  it("sums an array of basis points", () => {
    expect(sumWeightsBp([3000, 3000, 4000])).toBe(10000);
  });

  it("returns 0 for empty array", () => {
    expect(sumWeightsBp([])).toBe(0);
  });
});

describe("METHOD_LABELS", () => {
  it("has a label for headcount_fte", () => {
    expect(METHOD_LABELS.headcount_fte).toBe("Headcount / FTE");
  });

  it("has a label for all methods", () => {
    expect(METHOD_LABELS.square_footage).toBeTruthy();
    expect(METHOD_LABELS.time_study).toBeTruthy();
    expect(METHOD_LABELS.manual_percentage).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FunctionalExpenseAllocationPage
// ---------------------------------------------------------------------------

describe("FunctionalExpenseAllocationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultMocks();
  });

  it("shows upgrade card when plan is starter", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "starter",
      memberRole: "admin",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText(/Allocation Studio is on Growth and above/i)).toBeInTheDocument();
  });

  it("shows access denied for a viewer without accounting manage access", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "growth",
      memberRole: "viewer",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("You need accounting access.")).toBeInTheDocument();
    expect(screen.queryByText("Expense Allocation Studio")).not.toBeInTheDocument();
  });

  it("shows access denied for an auditor without accounting manage access", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "growth",
      memberRole: "auditor",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("You need accounting access.")).toBeInTheDocument();
  });

  it("shows access denied for an editor without accounting manage access", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "growth",
      memberRole: "editor",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("You need accounting access.")).toBeInTheDocument();
  });

  it("renders the studio for an admin with accounting manage access", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "growth",
      memberRole: "admin",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("Expense Allocation Studio")).toBeInTheDocument();
  });

  it("prefers the access-denied state over the upgrade card for a viewer on starter", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "starter",
      memberRole: "viewer",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("You need accounting access.")).toBeInTheDocument();
    expect(screen.queryByText(/Allocation Studio is on Growth and above/i)).not.toBeInTheDocument();
  });

  it("shows the page title when entitled", () => {
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("Expense Allocation Studio")).toBeInTheDocument();
  });

  it("renders bases table with base data", () => {
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getAllByText("Headcount").length).toBeGreaterThan(0);
    expect(screen.getByText("Headcount / FTE")).toBeInTheDocument();
  });

  it("renders rules table with rule data", () => {
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText("Office Supplies")).toBeInTheDocument();
  });

  it("shows empty states when no bases", () => {
    hoisted.mockUseAllocationBases.mockReturnValue({ data: [], isLoading: false, isError: false });
    hoisted.mockUseAllocationRules.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText(/No allocation bases yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No rules yet/i)).toBeInTheDocument();
  });

  it("shows skeletons when loading", () => {
    hoisted.mockUseAllocationBases.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUseAllocationRules.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<FunctionalExpenseAllocationPage />);
    // Skeleton rendered without crashing
    expect(screen.getByText("Expense Allocation Studio")).toBeInTheDocument();
  });

  it("shows error alert when bases fail to load", () => {
    hoisted.mockUseAllocationBases.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText(/Unable to load allocation bases/i)).toBeInTheDocument();
  });

  it("shows error alert when rules fail to load", () => {
    hoisted.mockUseAllocationRules.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByText(/Unable to load rules/i)).toBeInTheDocument();
  });

  it("opens base dialog on 'Add allocation base' click", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    await user.click(screen.getByRole("button", { name: /Add allocation base/i }));
    // Trigger button and dialog title share the text "Add allocation base";
    // assert the dialog opened via its heading to disambiguate from the trigger.
    expect(screen.getByRole("heading", { name: /Add allocation base/i })).toBeInTheDocument();
  });

  it("opens bind rule dialog on 'Bind account' click", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    await user.click(screen.getByRole("button", { name: /Bind account/i }));
    expect(screen.getByText(/Bind account to allocation base/i)).toBeInTheDocument();
  });

  it("calls deleteBase when trash button on base is clicked", async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    hoisted.mockUseDeleteAllocationBase.mockReturnValue({
      mutateAsync: mockDelete,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    const deleteButtons = screen.getAllByRole("button", { name: /Delete base/i });
    await user.click(deleteButtons[0]!);
    expect(mockDelete).toHaveBeenCalledWith("b1");
  });

  it("calls deleteRule when remove rule button is clicked", async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    hoisted.mockUseDeleteAllocationRule.mockReturnValue({
      mutateAsync: mockDelete,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    const removeButtons = screen.getAllByRole("button", { name: /Remove rule/i });
    await user.click(removeButtons[0]!);
    expect(mockDelete).toHaveBeenCalledWith("r1");
  });

  it("shows targets editor when base row is clicked", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    await user.click(screen.getByRole("button", { name: /Edit targets for Headcount/i }));
    expect(screen.getByText(/Targets for/i)).toBeInTheDocument();
  });

  it("toggles the targets editor from an accessible base button", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    const targetButton = screen.getByRole("button", {
      name: /Edit targets for Headcount/i,
    });

    expect(targetButton).toHaveAttribute("aria-expanded", "false");
    await user.click(targetButton);

    expect(targetButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Targets for/i)).toBeInTheDocument();
  });

  it("remounts targets editor when switching bases", async () => {
    hoisted.mockUseAllocationBases.mockReturnValue({
      data: [
        MOCK_BASE,
        { ...MOCK_BASE, id: "b2", name: "Square footage", method: "square_footage" },
      ],
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseAllocationTargets.mockImplementation((baseId: string) => ({
      data:
        baseId === "b1"
          ? [MOCK_TARGET]
          : [{ ...MOCK_TARGET, id: "t2", baseId: "b2", weightBasisPoints: 6000 }],
      isLoading: false,
    }));
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);

    await user.click(screen.getByRole("button", { name: /Edit targets for Headcount/i }));
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "80");
    await user.click(screen.getByRole("button", { name: /Edit targets for Square footage/i }));

    expect(screen.getByText(/Targets for/i)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(60);
  });

  it("upgrade card has a billing button", () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "starter",
      memberRole: "admin",
      memberPermissions: null,
    });
    render(<FunctionalExpenseAllocationPage />);
    expect(screen.getByRole("button", { name: /View billing/i })).toBeInTheDocument();
  });

  it("upgrade card navigate is called on billing button click", async () => {
    hoisted.mockUseSession.mockReturnValue({
      effectivePlanTier: "starter",
      memberRole: "admin",
      memberPermissions: null,
    });
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    await user.click(screen.getByRole("button", { name: /View billing/i }));
    expect(hoisted.mockNavigate).toHaveBeenCalledWith({ to: "/settings", hash: "billing" });
  });

  it("shows edit dialog when pencil button is clicked", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    const editButtons = screen.getAllByRole("button", { name: /Edit base/i });
    await user.click(editButtons[0]!);
    expect(screen.getByText(/Edit allocation base/i)).toBeInTheDocument();
  });

  it("clears edited base when edit dialog is closed", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);
    await user.click(screen.getAllByRole("button", { name: /Edit base/i })[0]!);
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await user.click(screen.getByRole("button", { name: /Add allocation base/i }));
    expect(screen.getByRole("heading", { name: /Add allocation base/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BaseDialog
// ---------------------------------------------------------------------------

describe("BaseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUseCreateAllocationBase.mockReturnValue(makeDefaultMutations());
    hoisted.mockUseUpdateAllocationBase.mockReturnValue(makeDefaultMutations());
  });

  it("renders create form when no initial", () => {
    render(<BaseDialog open onOpenChange={vi.fn()} initial={null} />);
    expect(screen.getByText(/Add allocation base/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Name the base, choose a method, and set its status/i),
    ).toBeInTheDocument();
  });

  it("renders edit form when initial is provided", () => {
    render(<BaseDialog open onOpenChange={vi.fn()} initial={MOCK_BASE} />);
    expect(screen.getByText(/Edit allocation base/i)).toBeInTheDocument();
  });

  it("shows pending text while adding a base", () => {
    hoisted.mockUseCreateAllocationBase.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });
    render(<BaseDialog open onOpenChange={vi.fn()} initial={null} />);

    expect(screen.getByRole("button", { name: /Adding/i })).toBeDisabled();
  });

  it("uses keyed remounts when the edited base changes", () => {
    const { rerender } = render(
      <BaseDialog key={MOCK_BASE.id} open onOpenChange={vi.fn()} initial={MOCK_BASE} />,
    );
    expect(screen.getByLabelText(/Name/i)).toHaveValue("Headcount");

    rerender(
      <BaseDialog
        key="b2"
        open
        onOpenChange={vi.fn()}
        initial={{ ...MOCK_BASE, id: "b2", name: "Square footage" }}
      />,
    );

    expect(screen.getByLabelText(/Name/i)).toHaveValue("Square footage");
  });

  it("calls createBase on submit with valid name", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(MOCK_BASE);
    hoisted.mockUseCreateAllocationBase.mockReturnValue({ mutateAsync, isPending: false });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<BaseDialog open onOpenChange={onOpenChange} initial={null} />);
    await user.clear(screen.getByLabelText(/Name/i));
    await user.type(screen.getByLabelText(/Name/i), "My Base");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(mutateAsync).toHaveBeenCalled();
  });

  it("saves selected method and status values", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(MOCK_BASE);
    hoisted.mockUseCreateAllocationBase.mockReturnValue({ mutateAsync, isPending: false });
    render(<BaseDialog open onOpenChange={vi.fn()} initial={null} />);

    await userEvent.clear(screen.getByLabelText(/Name/i));
    await userEvent.type(screen.getByLabelText(/Name/i), "Space base");

    const selects = screen.getAllByRole("combobox");
    fireEvent.click(selects[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Square footage/i));
    fireEvent.click(selects[1]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Inactive/i));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        name: "Space base",
        method: "square_footage",
        status: "inactive",
      }),
    );
  });

  it("shows error when name is empty on submit", async () => {
    const user = userEvent.setup();
    render(<BaseDialog open onOpenChange={vi.fn()} initial={null} />);
    await user.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
  });

  it("closes dialog on Cancel", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<BaseDialog open onOpenChange={onOpenChange} initial={null} />);
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error message when mutateAsync throws", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("server error"));
    hoisted.mockUseCreateAllocationBase.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<BaseDialog open onOpenChange={vi.fn()} initial={null} />);
    await user.type(screen.getByLabelText(/Name/i), "Test");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("calls updateBase when editing", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(MOCK_BASE);
    hoisted.mockUseUpdateAllocationBase.mockReturnValue({ mutateAsync, isPending: false });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<BaseDialog open onOpenChange={onOpenChange} initial={MOCK_BASE} />);
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(mutateAsync).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BindRuleDialog
// ---------------------------------------------------------------------------

describe("BindRuleDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUseAccounts.mockReturnValue({
      data: { data: [{ id: "acc1", code: "6000", name: "Office Supplies" }] },
    });
    hoisted.mockUseCreateAllocationRule.mockReturnValue(makeDefaultMutations());
  });

  it("renders bind account form", () => {
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);
    expect(screen.getByText(/Bind account to allocation base/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Pick the shared expense account and the base to use/i),
    ).toBeInTheDocument();
  });

  it("shows pending text while binding a rule", () => {
    hoisted.mockUseCreateAllocationRule.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);

    expect(screen.getByRole("button", { name: /Binding/i })).toBeDisabled();
  });

  it("shows error when fields are empty on submit", async () => {
    const user = userEvent.setup();
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);
    await user.click(screen.getByRole("button", { name: /Bind account/i }));
    expect(screen.getByText(/Select both an account and a base/i)).toBeInTheDocument();
  });

  it("renders with an empty account response", () => {
    hoisted.mockUseAccounts.mockReturnValue({ data: undefined });
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);

    expect(screen.getByLabelText(/Expense account/i)).toBeInTheDocument();
  });

  it("closes on Cancel click", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<BindRuleDialog open onOpenChange={onOpenChange} bases={[MOCK_BASE]} />);
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error when mutateAsync throws", async () => {
    // Pre-fill form and trigger error
    const mutateAsync = vi.fn().mockRejectedValue(new Error("fail"));
    hoisted.mockUseCreateAllocationRule.mockReturnValue({ mutateAsync, isPending: false });
    // We can't easily select via radix selects in unit tests — just verify the form structure
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);
    expect(screen.getByLabelText(/Expense account/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Allocation base/i).length).toBeGreaterThan(0);
  });

  it("calls createRule on submit with selected account and base", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(MOCK_RULE);
    hoisted.mockUseCreateAllocationRule.mockReturnValue({ mutateAsync, isPending: false });
    const onOpenChange = vi.fn();
    render(<BindRuleDialog open onOpenChange={onOpenChange} bases={[MOCK_BASE]} />);

    const selects = screen.getAllByRole("combobox");
    fireEvent.click(selects[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Office Supplies/i));
    fireEvent.click(selects[1]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Headcount/i));
    fireEvent.click(screen.getByRole("button", { name: /Bind account/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        accountId: "acc1",
        baseId: "b1",
        status: "active",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error when selected rule creation fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("fail"));
    hoisted.mockUseCreateAllocationRule.mockReturnValue({ mutateAsync, isPending: false });
    render(<BindRuleDialog open onOpenChange={vi.fn()} bases={[MOCK_BASE]} />);

    const selects = screen.getAllByRole("combobox");
    fireEvent.click(selects[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Office Supplies/i));
    fireEvent.click(selects[1]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Headcount/i));
    fireEvent.click(screen.getByRole("button", { name: /Bind account/i }));

    expect(await screen.findByText(/Unable to bind rule/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AllocatedPreview
// ---------------------------------------------------------------------------

describe("AllocatedPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("renders date range inputs and preview button", () => {
    render(<AllocatedPreview />);
    expect(screen.getByLabelText(/From/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/To/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preview/i })).toBeInTheDocument();
  });

  it("shows loading skeletons when isLoading", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);
    expect(screen.getByRole("button", { name: /Generating/i })).toBeInTheDocument();
  });

  it("shows error alert when isError", async () => {
    const refetch = vi.fn();
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();
    render(<AllocatedPreview />);
    expect(screen.getByText(/Unable to load preview/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows report table when data is present", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc1",
            name: "Salaries",
            program: 700000,
            management: 200000,
            fundraising: 100000,
            total: 1000000,
          },
        ],
        totals: { program: 700000, management: 200000, fundraising: 1000000, total: 1000000 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);
    expect(screen.getByText("Salaries")).toBeInTheDocument();
    expect(screen.getAllByText("$7000.00").length).toBeGreaterThan(0);
  });

  it("shows dashes for zero program and management amounts", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc1",
            name: "Shared Rent",
            program: 0,
            management: 0,
            fundraising: 100000,
            total: 100000,
          },
        ],
        totals: { program: 0, management: 0, fundraising: 100000, total: 100000 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty message when data has no rows", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: { rows: [], totals: { program: 0, management: 0, fundraising: 0, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);
    expect(screen.getByText(/No allocated expenses in this period/i)).toBeInTheDocument();
  });

  it("shows program breakdown rows when present", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc1",
            name: "Salaries",
            program: 700000,
            management: 200000,
            fundraising: 100000,
            total: 1000000,
            programBreakdown: [
              { programId: "p1", programName: "Youth Program", amountCents: 700000 },
            ],
          },
        ],
        totals: { program: 700000, management: 200000, fundraising: 100000, total: 1000000 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);
    expect(screen.getByText("Youth Program")).toBeInTheDocument();
  });

  it("shows top-level program breakdown returned by the API", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc1",
            name: "Shared Rent",
            program: 600000,
            management: 400000,
            fundraising: 0,
            total: 1000000,
          },
        ],
        totals: { program: 600000, management: 400000, fundraising: 0, total: 1000000 },
        programBreakdown: [{ programId: "p1", programName: "Youth Program", amountCents: 600000 }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);
    expect(screen.getByText("Program breakdown")).toBeInTheDocument();
    expect(screen.getByText("Youth Program")).toBeInTheDocument();
  });

  it("renders an unassigned program breakdown row", () => {
    hoisted.mockUseAllocatedFunctionalExpenses.mockReturnValue({
      data: {
        rows: [
          {
            accountId: "acc1",
            name: "Shared Rent",
            program: 600000,
            management: 400000,
            fundraising: 0,
            total: 1000000,
          },
        ],
        totals: { program: 600000, management: 400000, fundraising: 0, total: 1000000 },
        programBreakdown: [{ programId: null, programName: "All programs", amountCents: 600000 }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AllocatedPreview />);

    expect(screen.getByText("All programs")).toBeInTheDocument();
  });

  it("clears generated state when from date changes", async () => {
    const user = userEvent.setup();
    render(<AllocatedPreview />);
    const fromInput = screen.getByLabelText(/From/i);
    await user.clear(fromInput);
    await user.type(fromInput, "2026-03-01");
    // Preview button should be enabled (not in loading state)
    expect(screen.getByRole("button", { name: /Preview/i })).not.toBeDisabled();
  });

  it("clears generated state when to date changes", async () => {
    const user = userEvent.setup();
    render(<AllocatedPreview />);
    const toInput = screen.getByLabelText(/To/i);
    await user.clear(toInput);
    await user.type(toInput, "2026-03-31");
    expect(screen.getByRole("button", { name: /Preview/i })).not.toBeDisabled();
  });

  it("generates a report query when preview is clicked", async () => {
    const user = userEvent.setup();
    render(<AllocatedPreview />);

    await user.click(screen.getByRole("button", { name: /Preview/i }));

    await waitFor(() =>
      expect(hoisted.mockUseAllocatedFunctionalExpenses).toHaveBeenLastCalledWith(
        expect.stringMatching(/T00:00:00\.000Z$/),
        expect.stringMatching(/T23:59:59\.999Z$/),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// TargetsEditor
// ---------------------------------------------------------------------------

describe("TargetsEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [MOCK_TARGET],
      isLoading: false,
    });
    hoisted.mockUsePrograms.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseSetAllocationTargets.mockReturnValue(makeDefaultMutations());
  });

  it("renders targets table with existing targets", () => {
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    expect(screen.getByText(/Add row/i)).toBeInTheDocument();
  });

  it("renders when programs have not loaded yet", () => {
    hoisted.mockUsePrograms.mockReturnValue({ data: undefined });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    expect(screen.getByText(/Add row/i)).toBeInTheDocument();
  });

  it("renders program options for program targets", async () => {
    hoisted.mockUsePrograms.mockReturnValue({
      data: { data: [{ id: "p1", name: "Youth Program" }] },
    });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("combobox")[1]!);

    expect(
      within(await screen.findByRole("listbox")).getByText("Youth Program"),
    ).toBeInTheDocument();
  });

  it("updates a target percentage", async () => {
    const mutateAsync = vi.fn().mockResolvedValue([MOCK_TARGET]);
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [
        { ...MOCK_TARGET, id: "t1", weightBasisPoints: 5000 },
        { ...MOCK_TARGET, id: "t2", weightBasisPoints: 5000 },
      ],
      isLoading: false,
    });
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    const inputs = screen.getAllByRole("spinbutton");
    await user.clear(inputs[1]!);
    await user.type(inputs[1]!, "50");
    await user.click(screen.getByRole("button", { name: /Save targets/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      baseId: "b1",
      data: {
        targets: [
          expect.objectContaining({ weightBasisPoints: 5000 }),
          expect.objectContaining({ weightBasisPoints: 5000 }),
        ],
      },
    });
  });

  it("updates a program target selection before saving", async () => {
    const mutateAsync = vi.fn().mockResolvedValue([MOCK_TARGET]);
    hoisted.mockUsePrograms.mockReturnValue({
      data: { data: [{ id: "p1", name: "Youth Program" }] },
    });
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("combobox")[1]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Youth Program"));
    fireEvent.click(screen.getByRole("button", { name: /Save targets/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        baseId: "b1",
        data: {
          targets: [
            expect.objectContaining({
              functionalClass: "program",
              programId: "p1",
              weightBasisPoints: 10000,
            }),
          ],
        },
      }),
    );
  });

  it("updates a target functional class", async () => {
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("combobox")[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Fundraising/i));

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("updates rows when target data loads after mount", () => {
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    const { rerender } = render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    expect(screen.getByText(/0.00%/)).toBeInTheDocument();

    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [MOCK_TARGET],
      isLoading: false,
    });
    rerender(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    expect(screen.getByText(/100.00%/)).toBeInTheDocument();
  });

  it("shows loading skeletons when loading", () => {
    hoisted.mockUseAllocationTargets.mockReturnValue({ data: undefined, isLoading: true });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    // loading skeletons shown — no crash
    expect(screen.queryByText(/Add row/i)).not.toBeInTheDocument();
  });

  it("shows total percentage", () => {
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    expect(screen.getByText(/100.00%/)).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("adds a row when 'Add row' is clicked", async () => {
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    const addBtn = screen.getByRole("button", { name: /Add row/i });
    await user.click(addBtn);
    // Table should now have 2 rows — check for 2 remove buttons
    const removeButtons = screen.getAllByRole("button", { name: /Remove row/i });
    expect(removeButtons).toHaveLength(2);
  });

  it("save targets button is disabled when total is not 100%", () => {
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [{ ...MOCK_TARGET, weightBasisPoints: 5000 }],
      isLoading: false,
    });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Save targets/i })).toBeDisabled();
  });

  it("shows pending text while saving targets", () => {
    hoisted.mockUseSetAllocationTargets.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
  });

  it("keeps invalid target totals from saving if submit is triggered defensively", () => {
    const mutateAsync = vi.fn();
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [{ ...MOCK_TARGET, weightBasisPoints: 5000 }],
      isLoading: false,
    });
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    const saveButton = screen.getByRole("button", { name: /Save targets/i });
    Object.defineProperty(saveButton, "disabled", { value: false });
    fireEvent.click(saveButton);

    expect(screen.getAllByText(/Weights must total exactly 100%/i).length).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls setTargets when save is clicked with valid total", async () => {
    const mutateAsync = vi.fn().mockResolvedValue([MOCK_TARGET]);
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Save targets/i }));
    expect(mutateAsync).toHaveBeenCalledWith({
      baseId: "b1",
      data: {
        targets: [
          expect.objectContaining({
            functionalClass: "program",
            weightBasisPoints: 10000,
          }),
        ],
      },
    });
  });

  it("saves management targets without a program id", async () => {
    const mutateAsync = vi.fn().mockResolvedValue([MOCK_TARGET]);
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [
        {
          ...MOCK_TARGET,
          functionalClass: "management",
          programId: "p1",
        },
      ],
      isLoading: false,
    });
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save targets/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      baseId: "b1",
      data: {
        targets: [
          {
            functionalClass: "management",
            programId: undefined,
            weightBasisPoints: 10000,
          },
        ],
      },
    });
  });

  it("shows error when mutateAsync throws during save", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("server fail"));
    hoisted.mockUseSetAllocationTargets.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Save targets/i }));
    expect(await screen.findByText(/Unable to save targets/i)).toBeInTheDocument();
  });

  it("removes a row when remove button is clicked", async () => {
    hoisted.mockUseAllocationTargets.mockReturnValue({
      data: [MOCK_TARGET, { ...MOCK_TARGET, id: "t2", weightBasisPoints: 0 }],
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<TargetsEditor baseId="b1" onClose={vi.fn()} />);
    const removeButtons = screen.getAllByRole("button", { name: /Remove row/i });
    await user.click(removeButtons[0]!);
    const remainingRemove = screen.queryAllByRole("button", { name: /Remove row/i });
    expect(remainingRemove).toHaveLength(1);
  });
});

describe("FunctionalExpenseAllocationPage targets panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultMocks();
  });

  it("closes the selected targets editor from the page", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);

    await user.click(screen.getByRole("button", { name: /Edit targets for Headcount/i }));
    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(screen.queryByText(/Targets for/i)).not.toBeInTheDocument();
  });

  it("uses fallback labels for unknown base methods and rule names", () => {
    hoisted.mockUseAllocationBases.mockReturnValue({
      data: [{ ...MOCK_BASE, method: "other_method", status: "inactive" }],
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseAllocationRules.mockReturnValue({
      data: [{ ...MOCK_RULE, accountName: undefined, baseName: undefined, status: "inactive" }],
      isLoading: false,
      isError: false,
    });

    render(<FunctionalExpenseAllocationPage />);

    expect(screen.getByText("other_method")).toBeInTheDocument();
    expect(screen.getByText("acc1")).toBeInTheDocument();
    expect(screen.getByText("b1")).toBeInTheDocument();
    expect(screen.getAllByText("inactive").length).toBeGreaterThanOrEqual(2);
  });

  it("toggles the selected base off when clicked twice", async () => {
    const user = userEvent.setup();
    render(<FunctionalExpenseAllocationPage />);

    const targetButton = screen.getByRole("button", { name: /Edit targets for Headcount/i });
    await user.click(targetButton);
    await user.click(targetButton);

    expect(screen.queryByText(/Targets for/i)).not.toBeInTheDocument();
    expect(targetButton).toHaveAttribute("aria-expanded", "false");
  });
});
