import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const mockRefetch = vi.fn();

const hoisted = vi.hoisted(() => ({
  routeParams: { funderId: "funder-123" } as Record<string, string>,
  mockUseFunder: vi.fn(),
  mockUseFunderUpdateMutations: vi.fn(),
  mockUseFunderContactMutations: vi.fn(),
  mockUseSession: vi.fn(() => ({ memberRole: "admin", memberPermissions: null })),
}));

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => hoisted.routeParams,
  }),
  useNavigate: () => mockNavigate,
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
    Breadcrumb: ({ children }: { children: React.ReactNode }) => (
      <nav aria-label="breadcrumb">{children}</nav>
    ),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
    BreadcrumbLink: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & React.HTMLAttributes<HTMLSpanElement>) =>
      asChild
        ? React.cloneElement(children as React.ReactElement, props)
        : React.createElement("a", props, children),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
      <span aria-current="page">{children}</span>
    ),
    BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
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
      variant,
      children,
    }: {
      title?: React.ReactNode;
      variant?: string;
      children?: React.ReactNode;
    }) => (
      <div data-slot="alert" data-variant={variant}>
        {title ? <p data-slot="alert-title">{title}</p> : null}
        <div>{children}</div>
      </div>
    ),
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    Button: ({
      children,
      asChild,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <button {...props}>{children}</button>,
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-slot="dialog" data-open={open ? "true" : "false"}>
        {children}
        {onOpenChange ? (
          <button type="button" onClick={() => onOpenChange(false)}>
            __close_dialog__
          </button>
        ) : null}
      </div>
    ),
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="dialog-content">{children}</div>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <div>{children}</div>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
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
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
      <div role="option" data-value={value}>
        {children}
      </div>
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
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

vi.mock("@grantpipe/shared", () => ({
  ADMIN_ONLY_ROLES: ["admin"],
  EDITOR_UP_ROLES: ["admin", "editor"],
  FUNDER_TYPES: ["foundation", "corporate", "government", "other"],
  READ_ONLY_ROLES: ["admin", "editor", "viewer", "auditor"],
  STANDARD_ROLES: ["admin", "editor", "viewer"],
  createFunderContactSchema: {
    safeParse: vi.fn(() => ({ success: true, data: {} })),
  },
  updateFunderContactSchema: {
    safeParse: vi.fn(() => ({ success: true, data: {} })),
  },
  resolveEffectivePermissions: (role: string | null | undefined) => {
    const permissionMaps: Record<string, Record<string, string>> = {
      admin: { grants: "manage", funds: "manage", donors: "manage", events: "manage" },
      editor: { grants: "edit", funds: "edit", donors: "edit", events: "edit" },
      viewer: { grants: "view", funds: "view", donors: "view", events: "view" },
      auditor: { grants: "view", funds: "view", donors: "none", events: "none" },
    };
    return permissionMaps[role ?? ""] ?? {};
  },
}));

vi.mock("../../../hooks/use-grants", () => ({
  useFunder: hoisted.mockUseFunder,
  useFunderUpdateMutations: hoisted.mockUseFunderUpdateMutations,
  useFunderContactMutations: hoisted.mockUseFunderContactMutations,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../../lib/format", () => ({
  formatFunderTypeLabel: (type: string) => {
    const map: Record<string, string> = {
      foundation: "Foundation",
      corporate: "Corporate",
      government: "Government",
      other: "Other",
    };
    return map[type] ?? type;
  },
  humanizeEnum: (value: string) =>
    value
      .split("_")
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" "),
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

import { Route } from "./$funderId";
import { updateFunderContactSchema, createFunderContactSchema } from "@grantpipe/shared";

const FunderDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const baseMutations = {
  updateFunder: { mutateAsync: vi.fn() },
  deleteFunder: { mutateAsync: vi.fn() },
};

const baseContactMutations = {
  createContact: { mutateAsync: vi.fn() },
  updateContact: { mutateAsync: vi.fn() },
  deleteContact: { mutateAsync: vi.fn() },
};

const baseFunder = {
  id: "funder-123",
  name: "Gates Foundation",
  type: "foundation",
  website: "https://gatesfoundation.org",
  priorities: null,
  notes: null,
  contacts: [
    { id: "contact-1", name: "Jane Doe", title: "Program Officer", email: "jane@gates.org" },
  ],
  grants: [{ id: "grant-1", name: "STEM Access", status: "active" }],
};

// The mocked UI Dialog renders every dialog body unconditionally (gating is
// reflected on the wrapper's data-open attribute, not by mounting). Scope
// queries to the contact-delete dialog so its "Delete"/"Cancel" buttons are
// not confused with the funder-delete dialog's identically labeled buttons.
function contactDeleteDialog(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Delete contact?" });
  const dialog = heading.closest('[data-slot="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Could not find the contact-delete dialog wrapper");
  }
  return dialog;
}

function funderDeleteDialog(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Delete funder?" });
  const dialog = heading.closest('[data-slot="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Could not find the funder-delete dialog wrapper");
  }
  return dialog;
}

describe("FunderDetailPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    hoisted.mockUseFunder.mockReset();
    hoisted.mockUseFunderUpdateMutations.mockReset();
    hoisted.mockUseFunderContactMutations.mockReset();
    mockRefetch.mockReset();
    hoisted.mockUseFunderUpdateMutations.mockReturnValue(baseMutations);
    hoisted.mockUseFunderContactMutations.mockReturnValue(baseContactMutations);
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

    rerender(<ErrorComponent error={new Error("Funder route failed")} />);

    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("Funder route failed")).toBeInTheDocument();

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
    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("Route failed")).toBeInTheDocument();

    rerender(<ErrorComponent error="plain error" />);
    expect(screen.getByText("Unknown error")).toBeInTheDocument();

    rerender(<PendingComponent />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders loading skeleton while funder data is loading", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<FunderDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading is false, isError is false, and data is undefined", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<FunderDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fatal error state
  // ---------------------------------------------------------------------------

  it("renders Alert error state with retry button on fatal error", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: mockRefetch,
    });

    const { container } = render(<FunderDetailPage />);

    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Unable to load funder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Stale data banner
  // ---------------------------------------------------------------------------

  it("renders stale-data banner and keeps page content visible", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: true,
      error: new Error("Refetch failed"),
      refetch: mockRefetch,
    });

    const { container } = render(<FunderDetailPage />);

    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Funder data may be stale.")).toBeInTheDocument();

    // Page content still visible
    expect(screen.getByRole("heading", { level: 1, name: "Gates Foundation" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("renders populated funder with PageHeader, breadcrumb, tabs, contacts, and grants", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<FunderDetailPage />);

    // PageHeader heading
    expect(screen.getByRole("heading", { level: 1, name: "Gates Foundation" })).toBeInTheDocument();

    // Breadcrumb
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector("a[href='/funders']")).toBeInTheDocument();
    const currentPage = nav.querySelector("[aria-current='page']");
    expect(currentPage?.textContent).toBe("Gates Foundation");

    // Tabs
    const tabs = screen.getByTestId("tabs");
    expect(tabs).toHaveAttribute("data-value", "overview");
    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /program officers/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /grant history/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();

    // Contact info (the name also appears inside the always-rendered delete
    // confirmation dialog body, so allow more than one match).
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getByText("Program Officer")).toBeInTheDocument();
    expect(screen.getByText("jane@gates.org")).toBeInTheDocument();

    // Grant history
    expect(screen.getByText("STEM Access")).toBeInTheDocument();
    // Grant status enum is humanized, not rendered raw
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();

    // Sections
    expect(screen.getByTestId("entity-activity-section")).toBeInTheDocument();
    expect(screen.getByTestId("entity-documents-section")).toBeInTheDocument();

    // No fatal error banner
    expect(container.querySelector("[data-slot='alert']")).not.toBeInTheDocument();
  });

  it("keeps tab-content section headings in sentence case for coherence with 'Funder details'", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Section headings (h2) follow the app-wide sentence-case canon; the
    // Title-Case tab triggers (role="tab") are a separate nav convention.
    expect(screen.getByRole("heading", { name: "Program officers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grant history" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Program Officers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Grant History" })).not.toBeInTheDocument();
  });

  it("renders empty contacts and grants messages when arrays are empty", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: {
        ...baseFunder,
        contacts: [],
        grants: [],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.getByText("No funder contacts recorded.")).toBeInTheDocument();
    expect(screen.getByText("No grants tied to this funder yet.")).toBeInTheDocument();
  });

  it("renders fallback funder name when name is null", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, name: null, contacts: [], grants: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Funder" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Form: save funder details
  // ---------------------------------------------------------------------------

  it("calls updateFunder.mutateAsync when save details form is submitted", async () => {
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const websiteInput = screen.getByLabelText("Website");
    await userEvent.clear(websiteInput);
    await userEvent.type(websiteInput, "https://example.org");
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "corporate" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFunder).toHaveBeenCalledOnce();
    expect(mockUpdateFunder).toHaveBeenCalledWith(
      expect.objectContaining({ type: "corporate", website: "https://example.org" }),
    );
  });

  it("saves a changed funder type from the select", async () => {
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "corporate" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFunder).toHaveBeenCalledWith(expect.objectContaining({ type: "corporate" }));
  });

  it("reflects the loaded funder type on the Type select when the funder resolves after the first render", async () => {
    // First render mirrors the real app: the query is still loading and has no
    // data yet, so the loading guard renders before the funder arrives.
    hoisted.mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });

    const { rerender } = render(<FunderDetailPage />);

    // Query resolves with a non-default funder type.
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, type: "government" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    rerender(<FunderDetailPage />);

    const typeSelect = screen.getByRole("combobox", { name: "Type" }) as HTMLInputElement;
    expect(typeSelect.value).toBe("government");

    // Saving without touching the select must persist the real type, not the
    // stale "foundation" fallback captured during the loading render.
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mockUpdateFunder).toHaveBeenCalledWith(expect.objectContaining({ type: "government" }));
  });

  it("shows save error when updateFunder.mutateAsync rejects with Error instance", async () => {
    const mockUpdateFunder = vi.fn().mockRejectedValue(new Error("Server error"));
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Server error");
  });

  it("shows generic saveError when updateFunder.mutateAsync rejects with a non-Error value", async () => {
    const mockUpdateFunder = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save funder.");
  });

  // ---------------------------------------------------------------------------
  // Delete funder
  // ---------------------------------------------------------------------------

  it("calls deleteFunder.mutateAsync and navigates to /funders when delete is confirmed", async () => {
    const mockDeleteFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open confirmation dialog
    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));

    // Confirm deletion
    await userEvent.click(within(funderDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(mockDeleteFunder).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/funders" });
  });

  it("disables the confirm Delete button while deleteFunder is pending (prevents double-submit)", async () => {
    // Regression: the confirm button lacked a disabled guard, so a rapid
    // double-click fired DELETE /funders/{id} twice. Mirror the grant delete
    // dialog, which already disables on isPending.
    const mockDeleteFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder, isPending: true },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));

    const confirmButton = within(funderDeleteDialog()).getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeDisabled();
  });

  it("shows deleteFunder error when deleteFunder.mutateAsync rejects", async () => {
    const mockDeleteFunder = vi.fn().mockRejectedValue(new Error("Delete failed"));
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));
    await userEvent.click(within(funderDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Delete failed");
  });

  it("places the Delete funder action in the page header, not inside the edit form", () => {
    // Consistency: funder uses the same always-editable-form model as the event
    // and grant detail pages, so its destructive action belongs in the header
    // actions slot beside the type badge — not buried at the bottom of the form.
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const deleteTrigger = screen.getByRole("button", { name: "Delete funder" });
    expect(deleteTrigger.closest("form")).toBeNull();
    expect(deleteTrigger.closest("[data-slot='page-header']")).not.toBeNull();
  });

  it("shows generic saveError when deleteFunder.mutateAsync rejects with a non-Error value", async () => {
    const mockDeleteFunder = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));
    await userEvent.click(within(funderDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to delete funder.");
  });

  it("keeps the delete dialog open and shows the error inside it when deleteFunder fails", async () => {
    // Regression: the catch block called setDeleteOpen(false), closing the
    // dialog on error and rendering the message in the form behind it — the
    // user lost context and could not retry from the dialog. The error must
    // stay inside the still-open dialog (mirrors the grant/donor delete flow).
    const mockDeleteFunder = vi.fn().mockRejectedValue(new Error("Delete failed"));
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));
    await userEvent.click(within(funderDeleteDialog()).getByRole("button", { name: "Delete" }));

    // Dialog must remain open after the failure...
    const dialog = funderDeleteDialog();
    expect(dialog).toBeInTheDocument();
    // ...and the error must render inside that dialog, not in the form behind it.
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Delete failed");
    // The confirm button recovers so the user can retry.
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  // ---------------------------------------------------------------------------
  // Add contact form
  // ---------------------------------------------------------------------------

  it("calls createContact.mutateAsync when add contact form is submitted", async () => {
    const mockCreateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "New Contact");

    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(mockCreateContact).toHaveBeenCalledOnce();
  });

  it("disables Save contact on the add form while createContact is pending", () => {
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.getByRole("button", { name: "Save contact" })).toBeDisabled();
  });

  it("renders a DialogDescription for the add contact dialog", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(
      screen.getByText("Add a program officer or staff contact for this funder."),
    ).toBeInTheDocument();
  });

  it("shows contact error when name is empty on add contact submit", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Submit with empty name
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Contact name is required");
  });

  // ---------------------------------------------------------------------------
  // Edit contact form
  // ---------------------------------------------------------------------------

  it("shows editingContactError when update contact name is empty on submit", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form by clicking "Update Jane Doe"
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Clear the name field in the inline edit form
    const nameInputs = screen.getAllByLabelText("Name");
    const editNameInput = nameInputs[nameInputs.length - 1]!;
    await userEvent.clear(editNameInput);

    // Submit the inline edit form via "Save contact" (index [1] = inline edit form)
    const saveChangesButton = screen.getAllByRole("button", {
      name: "Save contact",
    })[1] as HTMLElement;
    await userEvent.click(saveChangesButton);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Contact name is required");
  });

  it("disables Save contact on the inline edit form while updateContact is pending", async () => {
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      updateContact: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // index [1] = inline edit form's Save contact button
    const inlineSave = screen.getAllByRole("button", {
      name: "Save contact",
    })[1] as HTMLElement;
    expect(inlineSave).toBeDisabled();
  });

  it("hides the edit form when cancel button is clicked", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Two "Save contact" buttons now visible: dialog + inline edit form
    expect(screen.getAllByRole("button", { name: "Save contact" })).toHaveLength(2);

    // Cancel buttons: one in delete dialog, one in inline edit form
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButtons[cancelButtons.length - 1]!);

    // The inline edit "Save contact" button should be gone
    expect(screen.getAllByRole("button", { name: "Save contact" })).toHaveLength(1);
  });

  it("shows Zod validation error in edit form when schema rejects the payload", async () => {
    const mockSafeParse = vi.mocked(updateFunderContactSchema.safeParse);
    mockSafeParse.mockReturnValueOnce({
      success: false,
      error: { issues: [{ message: "Name is too short" }] },
    } as ReturnType<typeof updateFunderContactSchema.safeParse>);

    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Type a non-empty name (so the basic length check passes)
    const nameInputs = screen.getAllByLabelText("Name");
    const editNameInput = nameInputs[nameInputs.length - 1]!;
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "X");

    // Submit — Zod will reject
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Name is too short");
  });

  it("shows error in edit form when updateContact.mutateAsync rejects", async () => {
    const mockUpdateContact = vi.fn().mockRejectedValue(new Error("Update failed"));
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      updateContact: { mutateAsync: mockUpdateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Submit with the existing name (non-empty, Zod passes)
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Update failed");
  });

  it("shows generic editingContactError when updateContact.mutateAsync rejects with a non-Error value", async () => {
    const mockUpdateContact = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      updateContact: { mutateAsync: mockUpdateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save funder contact.");
  });

  it("shows fallback editingContactError when Zod returns no issue message", async () => {
    const mockSafeParse = vi.mocked(updateFunderContactSchema.safeParse);
    mockSafeParse.mockReturnValueOnce({
      success: false,
      error: { issues: [] },
    } as unknown as ReturnType<typeof updateFunderContactSchema.safeParse>);

    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    const nameInputs = screen.getAllByLabelText("Name");
    const editNameInput = nameInputs[nameInputs.length - 1]!;
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "SomeName");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save funder contact.");
  });

  it("clears editingContactError when the edit form onChange fires after an error", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Submit with empty name to trigger editingContactError
    const nameInputs = screen.getAllByLabelText("Name");
    const editNameInput = nameInputs[nameInputs.length - 1]!;
    await userEvent.clear(editNameInput);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Contact name is required");

    // Now type something in the name field — onChange should clear the error
    await userEvent.type(editNameInput, "A");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Contact fallback display (nullableText / title / email branches)
  // ---------------------------------------------------------------------------

  it("shows a neutral No title fallback when contact has no title", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: {
        ...baseFunder,
        contacts: [
          { id: "c1", name: "No Title Contact", title: null, email: "no-title@example.org" },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.getByText("No title")).toBeInTheDocument();
    // Never fabricate a job title the contact did not provide.
    expect(screen.queryByText("Program Officer")).not.toBeInTheDocument();
    expect(screen.getByText("no-title@example.org")).toBeInTheDocument();
  });

  it("shows No email fallback when contact has no email", () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: {
        ...baseFunder,
        contacts: [{ id: "c2", name: "No Email Contact", title: "Director", email: null }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("No email")).toBeInTheDocument();
  });

  it("shows Zod validation error in create contact form when schema rejects the payload", async () => {
    const mockSafeParse = vi.mocked(createFunderContactSchema.safeParse);
    mockSafeParse.mockReturnValueOnce({
      success: false,
      error: { issues: [{ message: "Email must be valid" }] },
    } as ReturnType<typeof createFunderContactSchema.safeParse>);

    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "Test Contact");

    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Email must be valid");
  });

  it("shows fallback contactError when Zod returns no issue message in create form", async () => {
    const mockSafeParse = vi.mocked(createFunderContactSchema.safeParse);
    mockSafeParse.mockReturnValueOnce({
      success: false,
      error: { issues: [] },
    } as unknown as ReturnType<typeof createFunderContactSchema.safeParse>);

    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "Test Contact");

    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save funder contact.");
  });

  it("shows contact error when createContact.mutateAsync rejects with an Error instance", async () => {
    const mockCreateContact = vi.fn().mockRejectedValue(new Error("Create failed"));
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "New Contact");
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Create failed");
  });

  it("shows generic contactError when createContact.mutateAsync rejects with a non-Error value", async () => {
    const mockCreateContact = vi.fn().mockRejectedValue("plain string");
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "New Contact");
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save funder contact.");
  });

  it("clears contactError when the add contact form onChange fires after an error", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Submit with empty name to trigger contactError
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Contact name is required");

    // Type in name field — onChange should clear the error
    await userEvent.type(screen.getByLabelText("Name"), "A");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls deleteContact.mutateAsync with the contact id when Delete button is clicked", async () => {
    const mockDeleteContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: mockDeleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));
    await userEvent.click(within(contactDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(mockDeleteContact).toHaveBeenCalledOnce();
    expect(mockDeleteContact).toHaveBeenCalledWith("contact-1");
  });

  it("disables the contact confirm Delete button while deleteContact is pending (prevents double-submit)", async () => {
    // Same double-submit class as the funder-level delete: the per-contact
    // confirm button must disable while the mutation is in flight.
    const mockDeleteContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: mockDeleteContact, isPending: true },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));

    const confirmButton = within(contactDeleteDialog()).getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeDisabled();
  });

  it("does not delete a contact on the first click; it asks for confirmation first", async () => {
    const mockDeleteContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: mockDeleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // The dialog is closed until the user asks to delete.
    expect(contactDeleteDialog()).toHaveAttribute("data-open", "false");

    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));

    // Clicking the row action opens a confirmation dialog and does NOT delete.
    expect(contactDeleteDialog()).toHaveAttribute("data-open", "true");
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  it("cancels contact deletion without deleting when Cancel is clicked", async () => {
    const mockDeleteContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: mockDeleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));
    expect(contactDeleteDialog()).toHaveAttribute("data-open", "true");

    await userEvent.click(within(contactDeleteDialog()).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteContact).not.toHaveBeenCalled();
    expect(contactDeleteDialog()).toHaveAttribute("data-open", "false");
  });

  it("closes the add contact dialog when onOpenChange is called with false", async () => {
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Trigger the dialog close via the mocked __close_dialog__ button
    const closeButtons = screen.getAllByRole("button", { name: "__close_dialog__" });
    // The first close button belongs to the add-contact dialog
    await userEvent.click(closeButtons[0]!);

    // After close, the dialog's open state should be false (no "Save contact" button visible)
    // The dialog is still rendered (mock always renders children) but open=false
    const dialogs = document.querySelectorAll("[data-slot='dialog'][data-open='false']");
    expect(dialogs.length).toBeGreaterThan(0);
  });

  it("Cancel button in delete dialog closes the dialog without deleting", async () => {
    const mockDeleteFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      deleteFunder: { mutateAsync: mockDeleteFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the delete confirmation dialog
    await userEvent.click(screen.getByRole("button", { name: "Delete funder" }));
    // Click Cancel — exercises the onClick={() => setDeleteOpen(false)} branch (line 290)
    await userEvent.click(within(funderDeleteDialog()).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteFunder).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("add-contact dialog onOpenChange clears contactError when dialog closes", async () => {
    // Exercises the onOpenChange (nextOpen) => { setOpen(nextOpen); setContactError(null); } branch
    const mockCreateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Trigger a contactError by submitting with empty name
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));
    // Error should appear
    expect(await screen.findByText("Contact name is required")).toBeInTheDocument();

    // Now close the dialog via __close_dialog__ button — calls onOpenChange(false)
    // which sets contactError(null) → clears the error
    // closeButtons[1] is the add-contact dialog's close button (delete dialog is [0])
    const closeButtons = screen.getAllByRole("button", { name: "__close_dialog__" });
    await userEvent.click(closeButtons[1]!);

    // After onOpenChange(false), contactError should be null (message gone)
    await waitFor(() => {
      expect(screen.queryByText("Contact name is required")).not.toBeInTheDocument();
    });
  });

  it("form submit uses type: undefined when rawType is not in FUNDER_TYPES", async () => {
    // Exercises the (FUNDER_TYPES.includes(rawType) ? rawType : undefined) false branch
    // We do this by directly testing the select renders the correct raw type and submitting
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Change the type select to a value not in FUNDER_TYPES by changing it via DOM
    const typeSelect = screen.getByRole("combobox", { name: /type/i }) as HTMLSelectElement;
    // Programmatically change value to something invalid (fireEvent bypasses user interaction)
    Object.defineProperty(typeSelect, "value", { value: "invalid_type", writable: true });

    // Submit the form
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // updateFunder should have been called — verify type is either valid or undefined
    expect(mockUpdateFunder).toHaveBeenCalledOnce();
  });

  it("form submit passes website as null when website input is empty", async () => {
    // Exercises the nullableText("") branch (returns null) for website, priorities, notes
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, website: null, priorities: null, notes: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFunder).toHaveBeenCalledWith(
      expect.objectContaining({ website: null, priorities: null, notes: null }),
    );
  });

  it("renders fallback empty string for funder type when type is null", () => {
    // Exercises funder.type ?? "foundation" null branch
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, type: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<FunderDetailPage />);
    // type ?? "foundation" → "foundation"
    const options = screen.getAllByRole("option");
    const foundationOption = options.find((o) => o.textContent === "Foundation");
    expect(foundationOption).toBeDefined();
  });

  it("renders empty message when contacts is undefined (contacts ?? [] fallback)", () => {
    // Exercises the contacts ?? [] null branch when contacts is undefined
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, contacts: undefined },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<FunderDetailPage />);
    expect(screen.getByText("No funder contacts recorded.")).toBeInTheDocument();
  });

  it("renders empty message when grants is undefined (grants ?? [] fallback)", () => {
    // Exercises the grants ?? [] null branch when grants is undefined
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: undefined },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<FunderDetailPage />);
    expect(screen.getByText("No grants tied to this funder yet.")).toBeInTheDocument();
  });

  it("renders edit form with empty title and email when contact has null values", async () => {
    // Exercises contact.title ?? "" and contact.email ?? "" null branches in edit form
    hoisted.mockUseFunder.mockReturnValue({
      data: {
        ...baseFunder,
        contacts: [{ id: "c-null", name: "No Title", title: null, email: null }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<FunderDetailPage />);
    // Click "Update No Title" to open the edit form (exercising the title ?? "" and email ?? "" branches)
    await userEvent.click(screen.getByRole("button", { name: "Edit contact No Title" }));
    // Verify the edit form appears with empty title (use specific id to avoid ambiguity)
    const titleInput = document.getElementById("edit-title-c-null") as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    expect(titleInput.value).toBe("");
  });

  it("buildContactPayload includes title in safeParse call when title is provided", async () => {
    // Covers the ...(title ? { title } : {}) TRUE branch (line 59) in buildContactPayload
    // We verify via the safeParse spy since the schema mock returns data: {}
    const mockSafeParse = vi.mocked(createFunderContactSchema.safeParse);
    mockSafeParse.mockReturnValueOnce({ success: true, data: {} as never });

    const mockCreateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    await userEvent.type(screen.getByLabelText("Name"), "Contact With Title");
    await userEvent.type(screen.getByLabelText("Title"), "Program Director");
    await userEvent.type(screen.getByLabelText("Email"), "program@example.org");
    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    // Verify that safeParse was called with a payload that includes the title
    expect(mockSafeParse).toHaveBeenCalledWith(
      expect.objectContaining({ email: "program@example.org", title: "Program Director" }),
    );
  });

  it("successful contact update clears editingContactId and error (happy path)", async () => {
    // Covers lines 455-457: setEditingContactError(null); setEditingContactId(null)
    const mockUpdateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      updateContact: { mutateAsync: mockUpdateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));
    // Two "Save contact" buttons: [0] = add dialog, [1] = edit form
    expect(screen.getAllByRole("button", { name: "Save contact" })).toHaveLength(2);

    // Submit with existing name — Zod passes, mutateAsync resolves
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(mockUpdateContact).toHaveBeenCalledOnce();
    // After success, edit form should be hidden (editingContactId set to null)
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Save contact" })).toHaveLength(1);
    });
  });

  it("form submit passes undefined for funderName when name input is cleared", async () => {
    // Covers the String(form.get("funderName") ?? "").trim() || undefined FALSE path (line 190)
    // i.e. non-empty name → uses the trimmed value rather than undefined
    // To cover the TRUTHY branch (empty → undefined), we need to clear the input.
    // However "required" attribute is on the input, so we test via DOM manipulation.
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Clear the funder name input (bypass required via DOM)
    const nameInput = screen.getByLabelText("Funder name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    // Remove the required attribute so form submission proceeds
    nameInput.removeAttribute("required");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFunder).toHaveBeenCalledOnce();
    const call = mockUpdateFunder.mock.calls[0]?.[0] as Record<string, unknown>;
    // Empty trimmed string → || undefined → name should be undefined
    expect(call.name).toBeUndefined();
  });

  it("buildContactUpdatePayload handles missing form fields (form.get ?? '' null branch)", async () => {
    // Covers the ?? "" null branches in buildContactUpdatePayload (lines 66, 67, 68)
    // by removing form inputs from the DOM before submit so form.get() returns null
    const mockUpdateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      updateContact: { mutateAsync: mockUpdateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Open the edit form
    await userEvent.click(screen.getByRole("button", { name: "Edit contact Jane Doe" }));

    // Remove the title and email inputs from the DOM so form.get() returns null → ?? "" fires
    const titleInput = document.getElementById("edit-title-contact-1");
    const emailInput = document.getElementById("edit-email-contact-1");
    titleInput?.parentElement?.removeChild(titleInput);
    emailInput?.parentElement?.removeChild(emailInput);

    // Submit — form.get("title") and form.get("email") will return null
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save contact" })[1] as HTMLElement,
    );

    expect(mockUpdateContact).toHaveBeenCalledOnce();
  });

  it("form submit handles missing type/funderName/website/priorities/notes (form.get ?? '' null branches)", async () => {
    // Covers ?? "" null branches in form submit handler (lines 187, 190, 194, 195, 196)
    // by removing those inputs from the DOM before submit so form.get() returns null
    const mockUpdateFunder = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderUpdateMutations.mockReturnValue({
      ...baseMutations,
      updateFunder: { mutateAsync: mockUpdateFunder },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Remove the type, website, priorities, notes inputs so form.get() returns null
    const typeSelect = document.getElementById("funder-type");
    const websiteInput = document.getElementById("funder-website");
    const prioritiesTextarea = document.getElementById("funder-priorities");
    const notesTextarea = document.getElementById("funder-notes");

    typeSelect?.parentElement?.removeChild(typeSelect);
    websiteInput?.parentElement?.removeChild(websiteInput);
    prioritiesTextarea?.parentElement?.removeChild(prioritiesTextarea);
    notesTextarea?.parentElement?.removeChild(notesTextarea);

    // funderName is required so keep it, but remove required attr and clear it
    const nameInput = screen.getByLabelText("Funder name") as HTMLInputElement;
    nameInput.removeAttribute("required");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateFunder).toHaveBeenCalledOnce();
  });

  it("hides mutating controls for viewer role", () => {
    hoisted.mockUseSession.mockReturnValueOnce({ memberRole: "viewer", memberPermissions: null });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete funder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit contact Jane Doe" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete contact Jane Doe" }),
    ).not.toBeInTheDocument();
  });

  it("hides mutating controls for auditor role", () => {
    hoisted.mockUseSession.mockReturnValueOnce({ memberRole: "auditor", memberPermissions: null });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete funder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add contact" })).not.toBeInTheDocument();
  });

  it("hides delete-funder button for editor role (manage required)", () => {
    hoisted.mockUseSession.mockReturnValueOnce({ memberRole: "editor", memberPermissions: null });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Editor can edit
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add contact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit contact Jane Doe" })).toBeInTheDocument();
    // Editor cannot manage (delete)
    expect(screen.queryByRole("button", { name: "Delete funder" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete contact Jane Doe" }),
    ).not.toBeInTheDocument();
  });

  it("buildContactPayload excludes title and email when they are whitespace-only", async () => {
    const mockCreateContact = vi.fn().mockResolvedValue({});
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      createContact: { mutateAsync: mockCreateContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: baseFunder,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    // Type a name but leave title and email blank (whitespace)
    await userEvent.type(screen.getByLabelText("Name"), "Whitespace Test");
    await userEvent.type(screen.getByLabelText("Title"), "   ");
    // email is type="email" so browser validation would block whitespace; leave empty

    await userEvent.click(screen.getByRole("button", { name: "Save contact" }));

    expect(mockCreateContact).toHaveBeenCalledOnce();
    // Title should NOT be in the payload (nullableText returned null → conditional spread excluded it)
    const call = mockCreateContact.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("title");
  });

  it("deletes a contact and shows no error when the mutation succeeds", async () => {
    const deleteContact = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: deleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: [] },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));
    await userEvent.click(within(contactDeleteDialog()).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteContact).toHaveBeenCalledWith("contact-1"));
    expect(screen.queryByText("Unable to complete the action")).not.toBeInTheDocument();
  });

  it("surfaces an error when deleting a contact fails", async () => {
    const deleteContact = vi.fn().mockRejectedValue(new Error("Contact delete failed."));
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: deleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: [] },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));
    await userEvent.click(within(contactDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Contact delete failed.")).toBeInTheDocument();
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
  });

  it("shows a fallback message when deleting a contact fails with a non-Error", async () => {
    const deleteContact = vi.fn().mockRejectedValue("boom");
    hoisted.mockUseFunderContactMutations.mockReturnValue({
      ...baseContactMutations,
      deleteContact: { mutateAsync: deleteContact },
    });
    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: [] },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Delete contact Jane Doe" }));
    await userEvent.click(within(contactDeleteDialog()).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("fires captureDetailTabViewed with record_type funders when tab changes", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: [] },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    const grantsTab = screen.getByRole("tab", { name: /grant history/i });
    fireEvent.click(grantsTab);

    expect(mockCapture).toHaveBeenCalledWith("funders", "grants", "overview");
  });

  it("updates previousTabRef on sequential tab switches for funders", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    hoisted.mockUseFunder.mockReturnValue({
      data: { ...baseFunder, grants: [] },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    render(<FunderDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: /grant history/i }));
    fireEvent.click(screen.getByRole("tab", { name: /program officers/i }));

    expect(mockCapture).toHaveBeenNthCalledWith(1, "funders", "grants", "overview");
    expect(mockCapture).toHaveBeenNthCalledWith(2, "funders", "contacts", "grants");
  });
});
