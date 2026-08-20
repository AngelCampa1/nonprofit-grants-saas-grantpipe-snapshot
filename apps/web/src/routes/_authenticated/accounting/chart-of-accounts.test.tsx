import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUseSession, mockUseAccounts, mockUseCreateAccount, mockUseUpdateAccount } = vi.hoisted(
  () => ({
    mockUseSession: vi.fn(),
    mockUseAccounts: vi.fn(),
    mockUseCreateAccount: vi.fn(),
    mockUseUpdateAccount: vi.fn(),
  }),
);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../../hooks/use-session", () => ({ useSession: () => mockUseSession() }));
vi.mock("../../../hooks/use-accounting", () => ({
  useAccounts: (params: unknown) => mockUseAccounts(params),
  useCreateAccount: () => mockUseCreateAccount(),
  useUpdateAccount: (id: string) => mockUseUpdateAccount(id),
}));

import { ChartOfAccountsPage } from "./chart-of-accounts";

const SAMPLE_ACCOUNTS = [
  {
    id: "acc-1",
    code: "1000",
    name: "Cash",
    type: "asset",
    subtype: "current_assets",
    isActive: true,
  },
  {
    id: "acc-2",
    code: "2000",
    name: "Accounts Payable",
    type: "liability",
    subtype: null,
    isActive: false,
  },
];

describe("ChartOfAccountsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseAccounts.mockReturnValue({ data: SAMPLE_ACCOUNTS, isLoading: false });
    mockUseCreateAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders page header with title", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByRole("heading", { name: "Chart of Accounts" })).toBeInTheDocument();
  });

  it("renders accounts in a table", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Accounts Payable")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
  });

  it("shows Active badge for active accounts", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Add account button for admins", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByRole("button", { name: "Add account" })).toBeInTheDocument();
  });

  it("hides Add account button for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<ChartOfAccountsPage />);
    expect(screen.queryByRole("button", { name: "Add account" })).not.toBeInTheDocument();
  });

  it("shows loading skeleton when accounts are loading", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: true });
    render(<ChartOfAccountsPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows error alert when accounts query fails", () => {
    mockUseAccounts.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ChartOfAccountsPage />);
    expect(screen.getByText(/unable to load accounts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("refetches accounts when Try again is clicked in the error state", () => {
    const refetch = vi.fn();
    mockUseAccounts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows TeachAndActEmptyState when no accounts and no filters", () => {
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<ChartOfAccountsPage />);
    expect(screen.getByText("Chart of accounts")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add account" }).length).toBeGreaterThan(0);
  });

  it("labels the account type filter dropdown for screen readers", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByRole("combobox", { name: "Filter by account type" })).toBeInTheDocument();
  });

  it("stacks the account filters full-width on mobile and restores fixed widths from sm up", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByRole("combobox", { name: "Filter by account type" })).toHaveClass(
      "w-full",
      "sm:w-40",
    );
    expect(screen.getByRole("textbox", { name: "Search accounts" })).toHaveClass(
      "w-full",
      "sm:w-64",
    );
  });

  it("shows view-only CTA in TeachAndActEmptyState for non-admin when no accounts", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<ChartOfAccountsPage />);
    expect(screen.getByText("Chart of accounts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toBeInTheDocument();
  });

  it("opens create dialog on Add account click", () => {
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByRole("heading", { name: "Add account" })).toBeInTheDocument();
  });

  it("closes create dialog on Cancel", () => {
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Add account" })).not.toBeInTheDocument();
  });

  it("opens edit dialog on row click for admin", () => {
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    expect(screen.getByRole("heading", { name: "Edit account" })).toBeInTheDocument();
  });

  it("opens view dialog on row click for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    expect(screen.getByRole("heading", { name: "Account details" })).toBeInTheDocument();
  });

  it("creates account on form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "new", code: "9999", name: "New" });
    mockUseCreateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    const codeInput = screen.getByLabelText(/code/i);
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(codeInput, { target: { value: "9999" } });
    fireEvent.change(nameInput, { target: { value: "New Account" } });
    // Select type - use the select trigger inside the dialog
    const dialog = screen.getByRole("dialog");
    const typeSelects = within(dialog).getAllByRole("combobox");
    const typeSelect = typeSelects[0];
    fireEvent.click(typeSelect!);
    // Pick the "asset" option from the listbox
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("asset"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
  });

  it("shows validation error when code is empty", async () => {
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/code is required/i)).toBeInTheDocument();
  });

  it("shows deactivate button in edit dialog for active account", () => {
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
  });

  it("deactivates account on deactivate click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "acc-1", isActive: false });
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ isActive: false }));
  });

  it("filters accounts by search text in the query key", async () => {
    render(<ChartOfAccountsPage />);
    const searchInput = screen.getByPlaceholderText(/search accounts/i);
    fireEvent.change(searchInput, { target: { value: "cash" } });
    await waitFor(() =>
      expect(mockUseAccounts).toHaveBeenCalledWith(expect.objectContaining({ search: "cash" })),
    );
  });

  it("filters accounts by type and can reset to all types", async () => {
    render(<ChartOfAccountsPage />);
    const typeSelect = screen.getAllByRole("combobox")[0]!;
    fireEvent.click(typeSelect);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("asset"));
    await waitFor(() =>
      expect(mockUseAccounts).toHaveBeenCalledWith(expect.objectContaining({ type: "asset" })),
    );

    fireEvent.click(screen.getAllByRole("combobox")[0]!);
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("All types"));
    await waitFor(() =>
      expect(mockUseAccounts).toHaveBeenCalledWith(expect.objectContaining({ type: undefined })),
    );
  });

  it("shows validation error when name is empty", async () => {
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "9999" } });
    // Leave name empty — click Add directly
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("shows validation error when type is empty", async () => {
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "9999" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Some Account" } });
    // Do not select type — click Add directly
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/type is required/i)).toBeInTheDocument();
  });

  it("saves account in edit mode on form submit", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "acc-1", code: "1000", name: "Cash Updated" });
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    // Click the Cash row to open edit dialog
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    // Change the name
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "Cash Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ name: "Cash Updated" })),
    );
  });

  it("creates account with subtype when subtype is provided", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "new", code: "1010", name: "Checking" });
    mockUseCreateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "1010" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Checking" } });
    // Fill in subtype
    const subtypeInput = screen.queryByLabelText(/subtype/i);
    if (subtypeInput) {
      fireEvent.change(subtypeInput, { target: { value: "cash" } });
    }
    const dialog = screen.getByRole("dialog");
    const typeSelects = within(dialog).getAllByRole("combobox");
    fireEvent.click(typeSelects[0]!);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("asset"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalled());
  });

  it("saves account in edit mode with empty subtype (null)", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "acc-1", code: "1000", name: "Cash" });
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    // Clear the subtype input if it exists
    const subtypeInputs = screen.queryAllByLabelText(/subtype/i);
    if (subtypeInputs.length > 0) {
      fireEvent.change(subtypeInputs[0]!, { target: { value: "" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ subtype: null })),
    );
  });

  it("hides filter toolbar when there are no accounts and no active filter (true-empty)", () => {
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    render(<ChartOfAccountsPage />);
    expect(screen.queryByPlaceholderText(/search accounts/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Filter by account type" }),
    ).not.toBeInTheDocument();
  });

  it("shows filter toolbar when accounts exist (even with no active filter)", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByPlaceholderText(/search accounts/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by account type" })).toBeInTheDocument();
  });

  it("shows filter toolbar when a filter is active but zero records match", async () => {
    // Start with accounts visible so filter chrome appears
    render(<ChartOfAccountsPage />);
    const searchInput = screen.getByPlaceholderText(/search accounts/i);
    // Simulate filter returning zero results
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    fireEvent.change(searchInput, { target: { value: "nomatch" } });
    // Chrome should still be visible because search filter is active
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search accounts/i)).toBeInTheDocument(),
    );
  });

  it("shows 'No accounts match your filters' when search returns empty", async () => {
    // Start with accounts so the filter toolbar is visible, then mock returning empty on filter
    render(<ChartOfAccountsPage />);
    const searchInput = screen.getByPlaceholderText(/search accounts/i);
    mockUseAccounts.mockReturnValue({ data: [], isLoading: false });
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    await waitFor(() =>
      expect(screen.getByText(/no accounts match your filters/i)).toBeInTheDocument(),
    );
  });

  it("shows Adding… text when create mutation is pending", () => {
    mockUseCreateAccount.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("shows activate button in edit dialog for inactive account", () => {
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Accounts Payable").closest("tr")!;
    fireEvent.click(row);
    expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("activates account on activate click", async () => {
    const mutateFn = vi.fn().mockResolvedValue({ id: "acc-2", isActive: true });
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Accounts Payable").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => expect(mutateFn).toHaveBeenCalledWith({ isActive: true }));
  });

  it("shows error message when activate fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Activation blocked"));
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Accounts Payable").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Activation blocked")).toBeInTheDocument();
  });

  it("shows fallback error message when activate throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Accounts Payable").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to activate account/i)).toBeInTheDocument();
  });

  it("shows error message on create failure (mutation throws Error)", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Code in use"));
    mockUseCreateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Dup" } });
    // Select type
    const dialog = screen.getByRole("dialog");
    const typeSelects = within(dialog).getAllByRole("combobox");
    fireEvent.click(typeSelects[0]!);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("asset"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Code in use")).toBeInTheDocument();
  });

  it("shows fallback error message when create throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseCreateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "9000" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Test" } });
    const dialog = screen.getByRole("dialog");
    const typeSelects = within(dialog).getAllByRole("combobox");
    fireEvent.click(typeSelects[0]!);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("asset"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to add account/i)).toBeInTheDocument();
  });

  it("shows fallback error message when edit save throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "Cash Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to save account/i)).toBeInTheDocument();
  });

  it("shows error message when deactivate fails", async () => {
    const mutateFn = vi.fn().mockRejectedValue(new Error("Deactivation blocked"));
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Deactivation blocked")).toBeInTheDocument();
  });

  it("shows fallback error message when deactivate throws non-Error", async () => {
    const mutateFn = vi.fn().mockRejectedValue("string error");
    mockUseUpdateAccount.mockReturnValue({ mutateAsync: mutateFn, isPending: false });
    render(<ChartOfAccountsPage />);
    const row = screen.getByText("Cash").closest("tr")!;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/unable to deactivate account/i)).toBeInTheDocument();
  });

  it("search input has an accessible name", () => {
    render(<ChartOfAccountsPage />);
    expect(screen.getByRole("textbox", { name: /search accounts/i })).toBeInTheDocument();
  });
});
