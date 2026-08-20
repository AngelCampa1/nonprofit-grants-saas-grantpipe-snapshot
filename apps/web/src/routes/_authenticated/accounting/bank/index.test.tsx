import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUseSession, mockUseBankAccounts, mockUseCreateBankAccount, mockUseDeleteBankAccount } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUseBankAccounts: vi.fn(),
    mockUseCreateBankAccount: vi.fn(),
    mockUseDeleteBankAccount: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => (
    <a href={params ? `${to}/${Object.values(params).join("/")}` : to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../../hooks/use-accounting", () => ({
  useBankAccounts: () => mockUseBankAccounts(),
  useCreateBankAccount: () => mockUseCreateBankAccount(),
  useDeleteBankAccount: () => mockUseDeleteBankAccount(),
}));

import { BankAccountsPage } from "./index";

const SAMPLE_ACCOUNTS = [
  {
    id: "ba-1",
    orgId: "org-1",
    name: "Checking — Chase",
    accountNumber: "4321",
    glAccountId: "acc-cash-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ba-2",
    orgId: "org-1",
    name: "Savings — Wells Fargo",
    accountNumber: null,
    glAccountId: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
  },
];

describe("BankAccountsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseBankAccounts.mockReturnValue({
      data: SAMPLE_ACCOUNTS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseCreateBankAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders page heading", () => {
    render(<BankAccountsPage />);
    expect(screen.getByRole("heading", { name: "Bank Accounts" })).toBeInTheDocument();
  });

  it("shows Add Account button for admins", () => {
    render(<BankAccountsPage />);
    expect(screen.getByRole("button", { name: /add account/i })).toBeInTheDocument();
  });

  it("hides Add Account button for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<BankAccountsPage />);
    expect(screen.queryByRole("button", { name: /add account/i })).not.toBeInTheDocument();
  });

  it("shows management actions for a viewer with accounting manage permission", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { accounting: "manage" },
    });
    render(<BankAccountsPage />);
    expect(screen.getByRole("button", { name: /add account/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("renders bank account rows", () => {
    render(<BankAccountsPage />);
    expect(screen.getByText("Checking — Chase")).toBeInTheDocument();
    expect(screen.getByText("Savings — Wells Fargo")).toBeInTheDocument();
  });

  it("shows masked account number", () => {
    render(<BankAccountsPage />);
    expect(screen.getByText(/•••• 4321/)).toBeInTheDocument();
  });

  it("shows GL account linked badge", () => {
    render(<BankAccountsPage />);
    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("shows not linked text for account without GL account", () => {
    render(<BankAccountsPage />);
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });

  it("shows loading skeleton when loading", () => {
    mockUseBankAccounts.mockReturnValue({ data: undefined, isLoading: true });
    render(<BankAccountsPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows empty state when no accounts", () => {
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BankAccountsPage />);
    expect(screen.getByText(/see money move in and out/i)).toBeInTheDocument();
    expect(screen.getByText(/upload a statement to match transactions fast/i)).toBeInTheDocument();
  });

  it("shows Add Account button in empty state for admins", () => {
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BankAccountsPage />);
    // Both header and empty state have an Add Account button
    expect(screen.getAllByRole("button", { name: /add account/i }).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("hides the empty-state action for users who cannot manage accounting", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BankAccountsPage />);
    expect(screen.getByText(/see money move in and out/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add account/i })).not.toBeInTheDocument();
  });

  it("shows error alert on load failure", () => {
    mockUseBankAccounts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<BankAccountsPage />);
    expect(screen.getByText(/unable to load bank accounts/i)).toBeInTheDocument();
  });

  it("calls refetch on Try again click", async () => {
    const refetchFn = vi.fn();
    mockUseBankAccounts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchFn,
    });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(refetchFn).toHaveBeenCalled());
  });

  it("opens add account dialog on button click", () => {
    render(<BankAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    expect(screen.getByRole("heading", { name: /add bank account/i })).toBeInTheDocument();
  });

  it("opens add account dialog from the empty state", () => {
    mockUseBankAccounts.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i }).at(-1)!);
    expect(screen.getByRole("heading", { name: /add bank account/i })).toBeInTheDocument();
  });

  it("closes the add account dialog on Cancel", () => {
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: /add bank account/i })).not.toBeInTheDocument();
  });

  it("creates account on valid form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "ba-3", name: "New Account" });
    mockUseCreateBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    // Open dialog via header button
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: "Checking — Bank of America" },
    });
    fireEvent.change(screen.getByLabelText(/account number/i), { target: { value: "5678" } });
    // Submit via form id
    const form = document.getElementById("add-account-form");
    fireEvent.submit(form!);
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Checking — Bank of America", accountNumber: "5678" }),
      ),
    );
  });

  it("shows validation error when account name is empty", async () => {
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    const form = document.getElementById("add-account-form");
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/account name is required/i)).toBeInTheDocument();
  });

  it("shows error when create mutation fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Duplicate account"));
    mockUseCreateBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: "Test" } });
    const form = document.getElementById("add-account-form");
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Duplicate account")).toBeInTheDocument();
  });

  it("shows Adding… while creating", () => {
    mockUseCreateBankAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("requires confirmation before deleting a bank account", async () => {
    const mutateFn = vi.fn().mockResolvedValue(undefined);
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]!);
    expect(mutateFn).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /delete bank account/i })).toBeInTheDocument();
    expect(screen.getAllByText(/checking/i).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith("ba-1"));
  });

  it("closes the delete confirmation when canceled", () => {
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(screen.getByRole("heading", { name: /delete bank account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: /delete bank account/i })).not.toBeInTheDocument();
  });

  it("closes the delete confirmation through dialog open state changes", () => {
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: /delete bank account/i })).not.toBeInTheDocument();
  });

  it("shows delete pending text in the confirmation dialog", () => {
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    const { rerender } = render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    rerender(<BankAccountsPage />);

    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  });

  it("shows delete error when mutation fails", async () => {
    const mutateFn = vi
      .fn()
      .mockRejectedValue(new Error("Cannot delete account with transactions"));
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText("Cannot delete account with transactions")).toBeInTheDocument(),
    );
  });

  it("shows fallback delete error when mutation throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseDeleteBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText(/unable to delete bank account/i)).toBeInTheDocument(),
    );
  });

  it("hides Delete buttons for non-admins", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<BankAccountsPage />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows fallback error when create throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateBankAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<BankAccountsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /add account/i })[0]!);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: "Test" } });
    const form = document.getElementById("add-account-form");
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to add bank account/i)).toBeInTheDocument();
  });

  it("scopes the per-row Delete button to the in-flight row only", () => {
    // Mutation pending on ba-1; ba-2's Delete button must stay enabled
    mockUseDeleteBankAccount.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      variables: "ba-1",
    });
    render(<BankAccountsPage />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons).toHaveLength(2);
    expect(deleteButtons[0]).toBeDisabled(); // ba-1 — in-flight
    expect(deleteButtons[1]).not.toBeDisabled(); // ba-2 — sibling, must remain enabled
  });
});
