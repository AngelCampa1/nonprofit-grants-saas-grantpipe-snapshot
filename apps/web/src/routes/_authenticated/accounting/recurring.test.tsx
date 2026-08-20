import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const {
  mockUseSession,
  mockUseRecurringTemplates,
  mockUseCreateRecurringTemplate,
  mockUseUpdateRecurringTemplate,
  mockUseDeleteRecurringTemplate,
  mockUseRunRecurringTemplate,
  mockUseAccounts,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRecurringTemplates: vi.fn(),
  mockUseCreateRecurringTemplate: vi.fn(),
  mockUseUpdateRecurringTemplate: vi.fn(),
  mockUseDeleteRecurringTemplate: vi.fn(),
  mockUseRunRecurringTemplate: vi.fn(),
  mockUseAccounts: vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Select: ({
      children,
      value = "",
      onValueChange = () => {},
      disabled = false,
    }: {
      children?: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
    }) => (
      <SelectCtx.Provider value={{ value, onValueChange, disabled }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({
      id,
      "aria-label": ariaLabel,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const { value, onValueChange, disabled } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (!disabled) onValueChange(e.target.value);
          }}
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

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../hooks/use-accounting", () => ({
  useRecurringTemplates: (isActive?: boolean) => mockUseRecurringTemplates(isActive),
  useCreateRecurringTemplate: () => mockUseCreateRecurringTemplate(),
  useUpdateRecurringTemplate: (id: string) => mockUseUpdateRecurringTemplate(id),
  useDeleteRecurringTemplate: () => mockUseDeleteRecurringTemplate(),
  useRunRecurringTemplate: () => mockUseRunRecurringTemplate(),
  useAccounts: (params: unknown) => mockUseAccounts(params),
}));

import { RecurringTemplatesPage } from "./recurring";

describe("RecurringTemplatesPage source contracts", () => {
  it("derives recurring frequency options from shared constants", () => {
    const source = readFileSync(join(__dirname, "recurring.tsx"), "utf8");

    expect(source).toContain("RECURRING_TEMPLATE_FREQUENCIES");
    expect(source).toContain("RECURRING_TEMPLATE_FREQUENCY_LABELS");
    expect(source).not.toContain('<SelectItem value="monthly">Monthly</SelectItem>');
    expect(source).not.toContain('<SelectItem value="quarterly">Quarterly</SelectItem>');
    expect(source).not.toContain('<SelectItem value="annually">Annually</SelectItem>');
  });
});

const SAMPLE_TEMPLATES = [
  {
    id: "tmpl-1",
    orgId: "org-1",
    name: "Monthly Depreciation",
    description: "Fixed asset depreciation",
    frequency: "monthly" as const,
    nextRunDate: new Date("2026-05-01T00:00:00.000Z"),
    isActive: true,
    fiscalPeriodId: null,
    memo: "Depreciation",
    lines: [
      { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
      { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
    ],
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-2",
    orgId: "org-1",
    name: "Quarterly Grant Allocation",
    description: null,
    frequency: "quarterly" as const,
    nextRunDate: new Date("2026-07-01T00:00:00.000Z"),
    isActive: false,
    fiscalPeriodId: null,
    memo: null,
    lines: [
      { accountId: "acc-3", debitCents: 50000, creditCents: 0 },
      { accountId: "acc-4", debitCents: 0, creditCents: 50000 },
    ],
    createdBy: "user-1",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
  },
];

const SAMPLE_ACCOUNTS = [
  { id: "acc-1", code: "1000", name: "Cash", type: "asset", isActive: true },
  { id: "acc-2", code: "1500", name: "Accumulated Depreciation", type: "asset", isActive: true },
  { id: "acc-3", code: "7100", name: "Program Expenses", type: "expense", isActive: true },
  { id: "acc-4", code: "2000", name: "Accounts Payable", type: "liability", isActive: true },
];

describe("RecurringTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseRecurringTemplates.mockReturnValue({
      data: SAMPLE_TEMPLATES,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseUpdateRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseAccounts.mockReturnValue({ data: SAMPLE_ACCOUNTS, isLoading: false });
  });

  it("renders page heading", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByRole("heading", { name: "Recurring Templates" })).toBeInTheDocument();
  });

  it("shows Add template button for admins", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByRole("button", { name: /add template/i })).toBeInTheDocument();
  });

  it("hides Add template button for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<RecurringTemplatesPage />);
    expect(screen.queryByRole("button", { name: /add template/i })).not.toBeInTheDocument();
  });

  it("renders template rows", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("Monthly Depreciation")).toBeInTheDocument();
    expect(screen.getByText("Quarterly Grant Allocation")).toBeInTheDocument();
  });

  it("renders template descriptions", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("Fixed asset depreciation")).toBeInTheDocument();
  });

  it("renders frequency labels", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Quarterly")).toBeInTheDocument();
  });

  it("shows Active badge with clearer scheduled wording", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
  });

  it("shows Inactive badge with clearer paused wording", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows Run Now, Edit, Delete buttons for admins", () => {
    render(<RecurringTemplatesPage />);
    expect(screen.getAllByRole("button", { name: "Run Now" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("hides Run Now, Edit, Delete buttons for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<RecurringTemplatesPage />);
    expect(screen.queryByRole("button", { name: "Run Now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("only disables the Delete button for the row whose delete request is in flight", () => {
    mockUseDeleteRecurringTemplate.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      variables: "tmpl-1",
    });
    render(<RecurringTemplatesPage />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it("shows loading skeleton when loading", () => {
    mockUseRecurringTemplates.mockReturnValue({ data: undefined, isLoading: true });
    render(<RecurringTemplatesPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows a clear empty state when no templates", () => {
    mockUseRecurringTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<RecurringTemplatesPage />);
    expect(screen.getByText(/post repeat entries on schedule/i)).toBeInTheDocument();
    expect(
      screen.getByText(/set up a template\. grantpipe posts the entry on schedule/i),
    ).toBeInTheDocument();
  });

  it("opens the Add template dialog from the empty-state action for admins", () => {
    mockUseRecurringTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<RecurringTemplatesPage />);
    // Header + empty-state both expose an Add template button for admins
    const buttons = screen.getAllByRole("button", { name: /add template/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons.at(-1)!);
    expect(screen.getByRole("heading", { name: /add recurring template/i })).toBeInTheDocument();
  });

  it("hides the empty-state action for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    mockUseRecurringTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<RecurringTemplatesPage />);
    expect(screen.getByText(/post repeat entries on schedule/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add template/i })).not.toBeInTheDocument();
  });

  it("shows error alert when loading fails", () => {
    mockUseRecurringTemplates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<RecurringTemplatesPage />);
    expect(screen.getByText(/unable to load templates/i)).toBeInTheDocument();
  });

  it("calls refetch on Try again click", async () => {
    const refetchFn = vi.fn();
    mockUseRecurringTemplates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("opens Add template dialog on button click", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    expect(screen.getByRole("heading", { name: /add recurring template/i })).toBeInTheDocument();
  });

  it("renders template form when accounts data is undefined", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    expect(screen.getAllByLabelText(/account for line/i)).toHaveLength(2);
  });

  it("calls run mutation on Run Now click", async () => {
    const mutateFn = vi
      .fn()
      .mockResolvedValue({ journalEntryId: "je-new-1", nextRunDate: new Date() });
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Now" })[0]!);
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith("tmpl-1"));
  });

  it("shows success toast after Run Now", async () => {
    const mutateFn = vi
      .fn()
      .mockResolvedValue({ journalEntryId: "je-new-abc123456", nextRunDate: new Date() });
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Now" })[0]!);
    await waitFor(() => expect(screen.getByText(/template ran successfully/i)).toBeInTheDocument());
  });

  it("shows error when run fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("No open fiscal period"));
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Now" })[0]!);
    await waitFor(() => expect(screen.getByText("No open fiscal period")).toBeInTheDocument());
  });

  it("disables only the running template's Run Now button while its run is in flight", async () => {
    let resolveRun: ((v: { journalEntryId: string; nextRunDate: Date }) => void) | undefined;
    const mutateFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (resolveRun = resolve)));
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    const runButtons = screen.getAllByRole("button", { name: "Run Now" });
    fireEvent.click(runButtons[0]!);
    await waitFor(() => expect(runButtons[0]).toBeDisabled());
    expect(runButtons[1]).not.toBeDisabled();
    resolveRun!({ journalEntryId: "je-1", nextRunDate: new Date() });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Run Now" })[0]).not.toBeDisabled(),
    );
  });

  it("closes the delete confirm dialog on first click so it cannot be double-fired", async () => {
    let resolveDelete: (() => void) | undefined;
    const mutateFn = vi
      .fn()
      .mockImplementation(() => new Promise<void>((resolve) => (resolveDelete = resolve)));
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mutateFn).toHaveBeenCalledTimes(1);
    resolveDelete!();
  });

  it("requires confirmation before deleting a template", async () => {
    const mutateFn = vi.fn().mockResolvedValue(undefined);
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(mutateFn).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /delete recurring template/i })).toBeInTheDocument();
    expect(screen.getAllByText(/monthly depreciation/i).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith("tmpl-1"));
  });

  it("shows error when delete fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Cannot delete active template"));
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText("Cannot delete active template")).toBeInTheDocument(),
    );
  });

  it("shows fallback error when delete throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText(/unable to delete template/i)).toBeInTheDocument());
  });

  it("opens Edit dialog on Edit click", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("heading", { name: /edit recurring template/i })).toBeInTheDocument();
  });

  it("pre-fills edit form with template values", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      "Monthly Depreciation",
    );
  });

  it("shows validation error when name is empty in new template form", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    // Balance the lines so the button becomes enabled
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    // Wait for button to be enabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Add$/i })).not.toBeDisabled();
    });
    // Submit with empty name
    const form = document.getElementById("template-form");
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());
  });

  it("shows balance validation error when lines are unbalanced", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Test Template" },
    });
    // Set debit on line 1 only
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    // Template should be unbalanced -- submit button should be disabled
    expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled();
  });

  it("disables Create button when lines are unbalanced", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    // Default empty lines are unbalanced
    expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled();
  });

  it("creates template on valid form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "tmpl-3" });
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Annual Report Fee" } });
    // Set accounts on both lines
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    // Set equal debits/credits
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "500" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "500" } });
    await waitFor(() => {
      const createBtn = screen.getByRole("button", { name: /^Add$/i });
      expect(createBtn).not.toBeDisabled();
    });
    const form = document.getElementById("template-form");
    fireEvent.submit(form!);
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
  });

  it("creates template with optional description, memo, and annual frequency", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "tmpl-3" });
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Annual Audit" } });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "annually" } });
    fireEvent.change(screen.getByLabelText(/memo/i), { target: { value: "Audit accrual" } });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Board approved recurring audit fee" },
    });
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "250" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "250" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Board approved recurring audit fee",
          frequency: "annually",
          memo: "Audit accrual",
        }),
      ),
    );
  });

  it("shows account-required validation before balanced validation", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Missing accounts" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() =>
      expect(screen.getByText(/all line items must have an account selected/i)).toBeInTheDocument(),
    );
  });

  it("shows error when create mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Template name already exists"));
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Test Template" } });
    // Set accounts on both lines
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Add$/i })).not.toBeDisabled();
    });
    const form = document.getElementById("template-form");
    fireEvent.submit(form!);
    await waitFor(() =>
      expect(screen.getByText("Template name already exists")).toBeInTheDocument(),
    );
  });

  it("updates an existing template on valid edit form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "tmpl-1" });
    mockUseUpdateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Monthly Depreciation Updated" },
    });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "quarterly" } });
    fireEvent.change(screen.getByLabelText(/memo/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Monthly Depreciation Updated",
          description: null,
          frequency: "quarterly",
          memo: null,
        }),
      ),
    );
  });

  it("updates an existing template with optional line fund and memo", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "tmpl-1" });
    mockUseUpdateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    mockUseRecurringTemplates.mockReturnValue({
      data: [
        {
          ...SAMPLE_TEMPLATES[0],
          lines: [
            {
              accountId: "acc-1",
              fundId: "fund-1",
              debitCents: 10000,
              creditCents: 0,
              memo: "Debit memo",
            },
            { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ fundId: "fund-1", memo: "Debit memo" }),
          ]),
        }),
      ),
    );
  });

  it("shows Saving while update mutation is pending", () => {
    mockUseUpdateRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("closes the edit dialog on Cancel", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: /edit recurring template/i }),
    ).not.toBeInTheDocument();
  });

  it("shows raw frequency when the template has an unknown frequency", () => {
    mockUseRecurringTemplates.mockReturnValue({
      data: [{ ...SAMPLE_TEMPLATES[0], frequency: "biweekly" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecurringTemplatesPage />);
    expect(screen.getByText("biweekly")).toBeInTheDocument();
  });

  it("formats string next run dates", () => {
    mockUseRecurringTemplates.mockReturnValue({
      data: [{ ...SAMPLE_TEMPLATES[0], nextRunDate: "2026-05-01T00:00:00.000Z" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecurringTemplatesPage />);
    expect(screen.getByText(/May 1, 2026|5\/1\/2026/)).toBeInTheDocument();
  });

  it("shows Add Line button in template form", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
  });

  it("adds a line when Add Line is clicked", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    const initialLineCount = screen.getAllByLabelText(/debit for line/i).length;
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    expect(screen.getAllByLabelText(/debit for line/i).length).toBe(initialLineCount + 1);
  });

  it("shows Remove button when more than 2 lines", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    expect(screen.getAllByRole("button", { name: /remove line/i }).length).toBeGreaterThan(0);
  });

  it("removes a line when Remove is clicked", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    const beforeCount = screen.getAllByLabelText(/debit for line/i).length;
    fireEvent.click(screen.getAllByRole("button", { name: /remove line/i })[0]!);
    expect(screen.getAllByLabelText(/debit for line/i).length).toBe(beforeCount - 1);
  });

  it("shows Adding while mutation is pending", () => {
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("shows fallback error when run throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseRunRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Run Now" })[0]!);
    await waitFor(() => expect(screen.getByText(/unable to run template/i)).toBeInTheDocument());
  });

  it("shows next run date required error", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/next run date/i), { target: { value: "" } });
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() => expect(screen.getByText(/next run date is required/i)).toBeInTheDocument());
  });

  it("shows balance validation when submitted with selected accounts but uneven totals", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Uneven template" } });
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "50" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() => expect(screen.getByText(/debits must equal credits/i)).toBeInTheDocument());
  });

  // TDD: failing test first -- NaN-safe debit/credit inputs (Part A bug fix tests)
  it("non-numeric debit input produces 0 cents (NaN-safe)", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    // Type a non-numeric value -- with centsFromInput this yields 0
    fireEvent.change(debitInputs[0]!, { target: { value: "abc" } });
    // 0 debits means not balanced; button stays disabled
    expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled();
    // Also verify credit input non-numeric value yields 0
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(creditInputs[0]!, { target: { value: "xyz" } });
    expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled();
  });

  it("non-numeric debit input does not break balance display", async () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    // Set valid balanced amounts first
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Add$/i })).not.toBeDisabled());
    // Now type a non-numeric value -- should fall back to 0, making it unbalanced
    fireEvent.change(debitInputs[0]!, { target: { value: "not-a-number" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled());
  });

  it("closes delete confirm dialog on Cancel click", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(screen.getByRole("heading", { name: /delete recurring template/i })).toBeInTheDocument();
    // Click Cancel inside the confirm dialog -- this calls setTemplateToDelete(null)
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    expect(
      screen.queryByRole("heading", { name: /delete recurring template/i }),
    ).not.toBeInTheDocument();
  });

  it("shows fallback error when create throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("non-error string");
    mockUseCreateRecurringTemplate.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getByRole("button", { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Test" } });
    const accountSelects = screen.getAllByLabelText(/account for line/i);
    fireEvent.change(accountSelects[0]!, { target: { value: "acc-1" } });
    fireEvent.change(accountSelects[1]!, { target: { value: "acc-2" } });
    const debitInputs = screen.getAllByLabelText(/debit for line/i);
    const creditInputs = screen.getAllByLabelText(/credit for line/i);
    fireEvent.change(debitInputs[0]!, { target: { value: "100" } });
    fireEvent.change(creditInputs[1]!, { target: { value: "100" } });
    fireEvent.submit(document.getElementById("template-form")!);
    await waitFor(() => expect(screen.getByText(/unable to add template/i)).toBeInTheDocument());
  });

  it("closes edit dialog via onOpenChange (e.g. Escape key)", () => {
    render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("heading", { name: /edit recurring template/i })).toBeInTheDocument();
    // Trigger onOpenChange with open=false (simulates Escape / outside click)
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    // The close button in Radix Dialog triggers onOpenChange; we trigger it via the X button
    const closeBtn = dialog!.querySelector("[data-slot='dialog-close']") as HTMLElement | null;
    if (closeBtn) {
      fireEvent.click(closeBtn);
    } else {
      // Alternatively, find a button with Close accessible name
      const allDialogBtns = Array.from(dialog!.querySelectorAll("button")) as HTMLElement[];
      const closeAlt = allDialogBtns.find((b) => b.getAttribute("aria-label") === "Close");
      if (closeAlt) fireEvent.click(closeAlt);
    }
    expect(
      screen.queryByRole("heading", { name: /edit recurring template/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Deleting while delete mutation is pending", async () => {
    // Open the confirm dialog while not pending, then re-render with isPending: true.
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    const { rerender } = render(<RecurringTemplatesPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(screen.getByRole("heading", { name: /delete recurring template/i })).toBeInTheDocument();
    // Switch mock to isPending: true, then rerender to push the new value into the component
    mockUseDeleteRecurringTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    rerender(<RecurringTemplatesPage />);
    expect(screen.getByText("Deleting…")).toBeInTheDocument();
  });
});
