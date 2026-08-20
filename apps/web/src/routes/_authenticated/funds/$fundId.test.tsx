import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefetch = vi.fn();
const DialogOpenCtx = React.createContext(false);
const DialogOnOpenChangeFn = React.createContext<((open: boolean) => void) | null>(null);

const mockNavigate = vi.fn();

const hoisted = vi.hoisted(() => ({
  routeParams: { fundId: "fund-123" } as Record<string, string>,
  routeSearch: {} as Record<string, string | undefined>,
  mockUseFund: vi.fn(),
  mockUseFundUpdateMutations: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSession: vi.fn(),
  mockCreateRestrictionTerm: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => hoisted.routeParams,
    useSearch: () => hoisted.routeSearch,
  }),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureDetailTabViewed: vi.fn(),
  captureRecordViewed: vi.fn(),
  captureRecordSearched: vi.fn(),
  captureDonorExportCompleted: vi.fn(),
  captureRecordFilterApplied: vi.fn(),
  captureRecordSortChanged: vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Tabs: ({
      children,
      defaultValue,
      onValueChange,
      ...props
    }: {
      children: React.ReactNode;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      [k: string]: unknown;
    }) => {
      const [activeTab, setActiveTab] = React.useState(defaultValue ?? "");
      return React.createElement(
        "div",
        { "data-testid": "tabs", "data-value": activeTab, ...props },
        React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(
              child as React.ReactElement<{ onTabChange?: (v: string) => void }>,
              {
                onTabChange: (value: string) => {
                  setActiveTab(value);
                  onValueChange?.(value);
                },
              },
            );
          }
          return child;
        }),
      );
    },
    TabsList: ({
      children,
      onTabChange,
      ...props
    }: {
      children: React.ReactNode;
      onTabChange?: (v: string) => void;
      [k: string]: unknown;
    }) =>
      React.createElement(
        "div",
        { role: "tablist", ...props },
        React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<{ onActivate?: () => void }>, {
              onActivate: () => onTabChange?.((child.props as { value?: string }).value ?? ""),
            });
          }
          return child;
        }),
      ),
    TabsTrigger: ({
      children,
      value,
      onActivate,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      onActivate?: () => void;
      [k: string]: unknown;
    }) =>
      React.createElement(
        "button",
        { role: "tab", "data-value": value, onClick: onActivate, ...props },
        children,
      ),
    TabsContent: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      [k: string]: unknown;
    }) => React.createElement("div", { role: "tabpanel", ...props }, children),
    Alert: ({
      title,
      children,
      variant,
    }: {
      title?: React.ReactNode;
      children?: React.ReactNode;
      variant?: string;
    }) => (
      <div role="alert" data-slot="alert" data-variant={variant}>
        {title ? <p data-slot="alert-title">{title}</p> : null}
        <div>{children}</div>
      </div>
    ),
    PageHeader: ({
      breadcrumb,
      title,
      description,
      actions,
    }: {
      breadcrumb?: React.ReactNode;
      title: string;
      description?: string;
      actions?: React.ReactNode;
    }) => (
      <div data-slot="page-header">
        {breadcrumb}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions}
      </div>
    ),
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-slot="card" {...props}>
        {children}
      </div>
    ),
    CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 {...props}>{children}</h2>
    ),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    Textarea: ({
      id,
      name,
      placeholder,
      defaultValue,
      rows,
      ...props
    }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        rows={rows}
        {...props}
      />
    ),
    Breadcrumb: ({ children }: { children: React.ReactNode }) => (
      <nav aria-label="breadcrumb">{children}</nav>
    ),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
    BreadcrumbLink: ({
      children,
      asChild,
      ...props
    }: { children: React.ReactNode; asChild?: boolean } & React.HTMLAttributes<HTMLSpanElement>) =>
      asChild
        ? React.cloneElement(children as React.ReactElement, props)
        : React.createElement("a", props, children),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
      <span aria-current="page">{children}</span>
    ),
    BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <DialogOpenCtx.Provider value={!!open}>
        <DialogOnOpenChangeFn.Provider value={onOpenChange ?? null}>
          {children}
        </DialogOnOpenChangeFn.Provider>
      </DialogOpenCtx.Provider>
    ),
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
      const onOpenChange = React.useContext(DialogOnOpenChangeFn);
      const handleClick = () => onOpenChange?.(true);
      if (asChild)
        return React.cloneElement(
          children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
          { onClick: handleClick },
        );
      return <button onClick={handleClick}>{children}</button>;
    },
    DialogContent: ({ children }: { children: React.ReactNode }) => {
      const open = React.useContext(DialogOpenCtx);

      const onOpenChange = React.useContext(DialogOnOpenChangeFn);
      if (!open) return null;
      return (
        <div role="dialog" aria-modal="true" data-slot="dialog-content">
          {children}
          <button data-testid="dialog-close-trigger" onClick={() => onOpenChange?.(false)} />
        </div>
      );
    },
    DialogHeader: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="dialog-header">{children}</div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  };
});

vi.mock("../../../hooks/use-grants", () => ({
  useFund: hoisted.mockUseFund,
  useFundUpdateMutations: hoisted.mockUseFundUpdateMutations,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: hoisted.mockUseOrgBilling,
}));

vi.mock("../../../hooks/use-restrictions", () => ({
  useRestrictionTerms: () => ({
    data: { data: [] },
    isPending: false,
    isError: false,
  }),
  useRestrictionAlerts: () => ({
    data: { data: [] },
    isPending: false,
    isError: false,
  }),
  useCreateRestrictionTerm: () => ({
    mutateAsync: hoisted.mockCreateRestrictionTerm,
    isPending: false,
  }),
}));

vi.mock("../../../components/restrictions/restriction-lifecycle-panel", () => ({
  RestrictionLifecyclePanel: ({
    fundId,
    highlightTermId,
  }: {
    fundId?: string;
    highlightTermId?: string;
  }) => (
    <section aria-label="Restriction lifecycle" data-highlight-term={highlightTermId}>
      Restrictions for {fundId}
    </section>
  ),
}));

vi.mock("../../../components/entity-activity-section", () => ({
  EntityActivitySection: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div
      data-testid="entity-activity-section"
      data-entity-type={entityType}
      data-entity-id={entityId}
    />
  ),
}));

vi.mock("../../../components/entity-documents-section", () => ({
  EntityDocumentsSection: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div
      data-testid="entity-documents-section"
      data-entity-type={entityType}
      data-entity-id={entityId}
    />
  ),
}));

vi.mock("../../../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: ({ open }: { open: boolean }) => (
    <div data-testid="quick-share-sheet" data-open={String(open)} />
  ),
}));

import { Route } from "./$fundId";

const FundDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const baseMutations = {
  updateFund: { mutateAsync: vi.fn() },
  deleteFund: { mutateAsync: vi.fn(), isPending: false },
};

const baseFund = {
  id: "fund-123",
  name: "General Fund",
  type: "unrestricted",
  description: "Main operating fund",
  grantAllocations: [
    { id: "alloc-1", grant: { name: "STEM Access" }, allocatedAmountCents: 500000 },
  ],
  expenses: [{ id: "exp-1", description: "Payroll", amountCents: 100000 }],
  summary: {
    allocatedTotalCents: 500000,
    expenseTotalCents: 100000,
    currentBalanceCents: 400000,
    thresholdState: "75",
  },
};

describe("FundDetailPage", () => {
  beforeEach(() => {
    hoisted.routeSearch = {};
    hoisted.mockUseFund.mockReset();
    hoisted.mockUseFundUpdateMutations.mockReset();
    mockRefetch.mockReset();
    mockNavigate.mockReset();
    hoisted.mockUseFundUpdateMutations.mockReturnValue(baseMutations);
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
    hoisted.mockCreateRestrictionTerm.mockResolvedValue({});
  });

  it("opens the overview tab and highlights a deep-linked expense", () => {
    hoisted.routeSearch = { tab: "overview", highlightExpenseId: "exp-1" };
    hoisted.mockUseFund.mockReturnValue({ data: baseFund, isLoading: false, isError: false });
    const Component = (Route as unknown as { component: React.ComponentType }).component;

    render(<Component />);

    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "overview");
    expect(screen.getByTestId("fund-expense-exp-1")).toHaveAttribute("data-highlighted", "true");
  });

  it("opens restrictions and forwards a deep-linked restriction term", () => {
    hoisted.routeSearch = {
      tab: "restrictions",
      highlightRestrictionTermId: "term-1",
    };
    hoisted.mockUseFund.mockReturnValue({ data: baseFund, isLoading: false, isError: false });
    const Component = (Route as unknown as { component: React.ComponentType }).component;

    render(<Component />);

    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "restrictions");
    expect(screen.getByRole("region", { name: "Restriction lifecycle" })).toHaveAttribute(
      "data-highlight-term",
      "term-1",
    );
  });

  it("renders route pending and error fallbacks", () => {
    const routeConfig = Route as unknown as {
      pendingComponent: React.ComponentType;
      errorComponent: React.ComponentType<{ error: unknown }>;
    };
    const PendingComponent = routeConfig.pendingComponent;
    const ErrorComponent = routeConfig.errorComponent;
    const { container, rerender } = render(<PendingComponent />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();

    rerender(<ErrorComponent error={new Error("Fund route failed")} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("Fund route failed")).toBeInTheDocument();

    rerender(<ErrorComponent error="plain route failure" />);

    expect(screen.getByText("Unknown error")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it("renders route fallback components", () => {
    const routeFallbacks = Route as unknown as {
      errorComponent: React.ComponentType<{ error: unknown }>;
      pendingComponent: React.ComponentType;
    };
    const ErrorComponent = routeFallbacks.errorComponent;
    const PendingComponent = routeFallbacks.pendingComponent;

    const { rerender, container } = render(<ErrorComponent error={new Error("Route failed")} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("Route failed")).toBeInTheDocument();

    rerender(<ErrorComponent error="plain error" />);
    expect(screen.getByText("Unknown error")).toBeInTheDocument();

    rerender(<PendingComponent />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders loading skeleton when fund is loading", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<FundDetailPage />);

    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fatal error state
  // ---------------------------------------------------------------------------

  it("renders fatal error state with retry button that calls refetch", async () => {
    hoisted.mockUseFund.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: mockRefetch,
    });

    const { container } = render(<FundDetailPage />);

    expect(
      container.querySelector("[data-slot='alert'][data-variant='destructive']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load fund.")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    await userEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // No-data fallback (not loading, not error, no data)
  // ---------------------------------------------------------------------------

  it("renders loading skeleton when data is undefined with no error or loading state", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<FundDetailPage />);

    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Stale-data banner
  // ---------------------------------------------------------------------------

  it("renders stale-data banner and keeps page content visible", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: true,
      error: new Error("Refetch failed"),
      refetch: mockRefetch,
    });

    const { container } = render(<FundDetailPage />);

    expect(
      container.querySelector("[data-slot='alert'][data-variant='destructive']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Fund data may be stale.")).toBeInTheDocument();

    // Page content still visible
    expect(screen.getByRole("heading", { level: 1, name: "General Fund" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("renders populated fund detail with PageHeader, breadcrumb, tabs, allocations and expenses", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    // PageHeader heading
    expect(screen.getByRole("heading", { level: 1, name: "General Fund" })).toBeInTheDocument();

    // Breadcrumb
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector("a[href='/funds']")).toBeInTheDocument();
    const currentPage = nav.querySelector("[aria-current='page']");
    expect(currentPage?.textContent).toBe("General Fund");

    // Tabs
    const tabs = screen.getByTestId("tabs");
    expect(tabs).toHaveAttribute("data-value", "overview");
    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();

    // Data
    expect(screen.getByText("STEM Access")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
    expect(screen.getAllByText("$5,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$1,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$4,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("entity-activity-section")).toBeInTheDocument();
    expect(screen.getByTestId("entity-documents-section")).toBeInTheDocument();
  });

  it("keeps overview section headings in sentence case for coherence with 'Fund details'", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("heading", { name: "Source allocations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Expense ledger" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Source Allocations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Expense Ledger" })).not.toBeInTheDocument();
  });

  it("renders gracefully when optional fund arrays and summary are missing", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: {
        id: "fund-123",
        name: "Sparse Fund",
        type: "temporarily_restricted",
        description: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Sparse Fund" })).toBeInTheDocument();
    expect(screen.getByText("No allocations recorded.")).toBeInTheDocument();
    expect(screen.getByText("No expenses posted to this fund.")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("omits the spend-down threshold badge when there is no threshold to report", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: {
        id: "fund-123",
        name: "Sparse Fund",
        type: "temporarily_restricted",
        description: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    // A dangling "Threshold --" badge reads as broken; with no allocation
    // there is no spend-down to track, so the badge must not render at all.
    expect(screen.queryByText(/^Threshold/)).not.toBeInTheDocument();
  });

  it("shows the spend-down threshold badge when a threshold state is present", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByText("Threshold 75%")).toBeInTheDocument();
  });

  it("renders PageHeader without generic body guidance", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(
      screen.queryByText("Manage fund details, track allocations, expenses, and review activity."),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fund details form
  // ---------------------------------------------------------------------------

  it("calls updateFund.mutateAsync when save details form is submitted", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const descriptionInput = screen.getByLabelText("Description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Updated description");

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await userEvent.click(saveButton);

    expect(mockUpdateFund).toHaveBeenCalledOnce();
    expect(mockUpdateFund).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Updated description" }),
    );
  });

  it("disables Save changes while the update is in flight so it can't double-submit", () => {
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("associates the Type label with its select control for click-to-focus and screen readers", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const typeLabel = screen.getByText("Type");
    const htmlFor = typeLabel.getAttribute("for");
    expect(htmlFor).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveAttribute("id", htmlFor);
  });

  it("syncs the fund type select to data that arrives after a cold load", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });

    // Cold load: query data is undefined while loading.
    hoisted.mockUseFund.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { rerender } = render(<FundDetailPage />);

    // Data arrives for a restricted fund.
    hoisted.mockUseFund.mockReturnValue({
      data: { ...baseFund, type: "temporarily_restricted" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    rerender(<FundDetailPage />);

    // Save without touching the Type select.
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await userEvent.click(saveButton);

    expect(mockUpdateFund).toHaveBeenCalledOnce();
    // The stale "unrestricted" default must NOT be sent as an intentional edit.
    expect(mockUpdateFund).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "unrestricted" }),
    );
  });

  it("sends only the changed name when the name field is edited", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Fund");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFund).toHaveBeenCalledOnce();
    expect(mockUpdateFund).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed Fund" }));
    // Type was untouched, so it must not be included in the diff.
    expect(mockUpdateFund).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "unrestricted" }),
    );
  });

  it("includes the new type when the type select is changed", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("combobox", { name: "Type" }));
    await userEvent.click(await screen.findByRole("option", { name: "Temporarily restricted" }));

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFund).toHaveBeenCalledOnce();
    expect(mockUpdateFund).toHaveBeenCalledWith(
      expect.objectContaining({ type: "temporarily_restricted" }),
    );
  });

  it("falls back to the unrestricted default when saving a fund with no type", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: {
        id: "fund-123",
        name: "Typeless Fund",
        grantAllocations: [],
        expenses: [],
        summary: {},
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFund).toHaveBeenCalledOnce();
    // type matches the "unrestricted" fallback, so it is not sent as an edit.
    expect(mockUpdateFund).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    expect(mockUpdateFund).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "unrestricted" }),
    );
  });

  it("opens the quick share sheet from the header action", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByTestId("quick-share-sheet")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(screen.getByTestId("quick-share-sheet")).toHaveAttribute("data-open", "true");
  });

  it("shows save error when updateFund.mutateAsync rejects", async () => {
    const mockUpdateFund = vi.fn().mockRejectedValue(new Error("Server error"));
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await userEvent.click(saveButton);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Server error");
  });

  it("shows generic save error when updateFund.mutateAsync rejects with non-Error value", async () => {
    const mockUpdateFund = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save fund.");
  });

  it("opens confirmation dialog when delete button is clicked, then calls deleteFund and navigates", async () => {
    const mockDeleteFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFund: { mutateAsync: mockDeleteFund, isPending: false },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    // Dialog not open yet — no confirm Delete button visible
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Open dialog
    await userEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Confirm deletion
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mockDeleteFund).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/funds" });
  });

  it("keeps the delete dialog open and shows the error inside it when deleteFund rejects", async () => {
    // Regression: the catch block called setDeleteOpen(false), closing the
    // dialog on error so the message rendered in the form behind it — the user
    // lost context and could not retry. The error must stay inside the
    // still-open dialog (mirrors the grant/donor delete flow).
    const mockDeleteFund = vi.fn().mockRejectedValue(new Error("Delete failed"));
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFund: { mutateAsync: mockDeleteFund, isPending: false },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    // Dialog must remain open with the error inside it.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Delete failed");
    // The confirm button recovers so the user can retry.
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("shows generic save error when deleteFund rejects with a non-Error value", async () => {
    const mockDeleteFund = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFund: { mutateAsync: mockDeleteFund, isPending: false },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete fund.");
  });

  it("closes dialog without deleting when Cancel is clicked", async () => {
    const mockDeleteFund = vi.fn();
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFund: { mutateAsync: mockDeleteFund, isPending: false },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockDeleteFund).not.toHaveBeenCalled();
  });

  it("clears delete errors when the dialog dismisses", async () => {
    const mockDeleteFund = vi.fn().mockRejectedValue(new Error("Delete failed"));
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFund: { mutateAsync: mockDeleteFund, isPending: false },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");

    await userEvent.click(screen.getByTestId("dialog-close-trigger"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("places the fund balance summary band before the record tabs", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const summaryBand = screen.getByRole("region", { name: "Fund balance summary" });
    const tabs = screen.getByTestId("tabs");

    expect(summaryBand.compareDocumentPosition(tabs)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(summaryBand).toHaveTextContent("Allocated");
    expect(summaryBand).toHaveTextContent("$5,000");
    expect(summaryBand).toHaveTextContent("Spent");
    expect(summaryBand).toHaveTextContent("$1,000");
    expect(summaryBand).toHaveTextContent("Balance");
    expect(summaryBand).toHaveTextContent("$4,000");
  });

  // ---------------------------------------------------------------------------
  // Empty states
  // ---------------------------------------------------------------------------

  it("renders empty allocations and expenses messages", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: {
        ...baseFund,
        grantAllocations: [],
        expenses: [],
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          currentBalanceCents: 0,
          thresholdState: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByText("No allocations recorded.")).toBeInTheDocument();
    expect(screen.getByText("No expenses posted to this fund.")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fallback values
  // ---------------------------------------------------------------------------

  it("renders fallback Fund name and expense label when fund fields are null", () => {
    hoisted.mockUseFund.mockReturnValue({
      data: {
        id: "fund-null",
        name: null,
        type: null,
        description: null,
        grantAllocations: [{ id: "alloc-null", grant: null, allocatedAmountCents: undefined }],
        expenses: [{ id: "exp-null", description: null, amountCents: undefined }],
        summary: {},
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getAllByText("Fund").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Grant allocation")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Description cleared to empty string becomes null
  // ---------------------------------------------------------------------------

  it("passes null description when description field is blank on submit", async () => {
    const mockUpdateFund = vi.fn().mockResolvedValue({});
    hoisted.mockUseFundUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFund: { mutateAsync: mockUpdateFund },
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const descriptionInput = screen.getByLabelText("Description");
    await userEvent.clear(descriptionInput);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFund).toHaveBeenCalledWith({ description: null });
  });

  it("shows Save changes and Delete fund buttons for admin role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete fund" })).toBeInTheDocument();
  });

  it("shows Save changes but hides Delete fund button for editor role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete fund" })).not.toBeInTheDocument();
  });

  it("uses explicit fund permissions for Save changes and Delete fund controls", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { funds: "manage" },
      isLoading: false,
    });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete fund" })).toBeInTheDocument();
  });

  it("hides Save changes and Delete fund buttons for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete fund" })).not.toBeInTheDocument();
  });

  it("fires captureDetailTabViewed with record_type funds when tab changes", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    const activityTab = screen.getByRole("tab", { name: /activity/i });
    fireEvent.click(activityTab);

    expect(mockCapture).toHaveBeenCalledWith("funds", "activity", "overview");
  });

  it("updates previousTabRef on sequential tab switches for funds", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    hoisted.mockUseFund.mockReturnValue({
      data: baseFund,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FundDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: /activity/i }));
    fireEvent.click(screen.getByRole("tab", { name: /documents/i }));

    expect(mockCapture).toHaveBeenNthCalledWith(1, "funds", "activity", "overview");
    expect(mockCapture).toHaveBeenNthCalledWith(2, "funds", "documents", "activity");
  });
});
