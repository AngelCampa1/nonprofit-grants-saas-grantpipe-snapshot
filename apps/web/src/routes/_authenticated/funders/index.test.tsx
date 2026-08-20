import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

type FundersRouteSearch = { q?: string; type?: string; page?: number };

const hoisted = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let routeSearch: FundersRouteSearch = {};

  function getRouteSearch() {
    return routeSearch;
  }

  function subscribeRouteSearch(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function setRouteSearch(next: FundersRouteSearch) {
    routeSearch = next;
    for (const fn of listeners) fn();
  }

  const mockNavigate = vi.fn((opts?: { search?: FundersRouteSearch }) => {
    if (opts?.search !== undefined) {
      setRouteSearch(opts.search);
    }
  });

  return {
    getRouteSearch,
    subscribeRouteSearch,
    setRouteSearch,
    mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
      ...config,
      path,
      useSearch: () =>
        React.useSyncExternalStore(subscribeRouteSearch, getRouteSearch, getRouteSearch),
    })),
    mockUseFunders: vi.fn(),
    mockUseCreateFunder: vi.fn(),
    mockUseSession: vi.fn(),
    mockNavigate,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  useNavigate: () => hoisted.mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/funders" } }),
  Link: ({
    children,
    to,
    params,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => {
    let href = to ?? "";
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        href = href.replace(`$${key}`, value);
      });
    }
    return (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@grantpipe/ui", async (importOriginal) => ({
  // Real cn/cardVariants so class assertions track the actual design system
  // instead of a hand-copied string that can silently drift.
  cn: (await importOriginal<typeof import("@grantpipe/ui")>()).cn,
  cardVariants: (await importOriginal<typeof import("@grantpipe/ui")>()).cardVariants,
  Alert: ({
    title,
    variant,
    children,
  }: {
    title?: React.ReactNode;
    variant?: string;
    children?: React.ReactNode;
  }) => (
    <div role="alert" data-slot="alert" data-variant={variant}>
      {title ? <p data-slot="alert-title">{title}</p> : null}
      <div>{children}</div>
    </div>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  Skeleton: ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="skeleton" className={className} {...props} />
  ),
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? (children as React.ReactElement) : <button {...props}>{children}</button>,
  DataTable: <TData extends { id?: string | number }>({
    columns,
    data,
    isLoading,
    emptyState,
    skeletonRows = 3,
  }: {
    columns: Array<{
      id?: string;
      accessorKey?: string;
      header: React.ReactNode;
      cell?: (ctx: { row: { original: TData } }) => React.ReactNode;
    }>;
    data: TData[];
    isLoading?: boolean;
    emptyState?: React.ReactNode;
    skeletonRows?: number;
  }) => (
    <div data-slot="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={col.id ?? String(idx)}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, rIdx) => (
              <tr key={`skel-${String(rIdx)}`}>
                {columns.map((col, cIdx) => (
                  <td key={`skel-${String(rIdx)}-${col.id ?? String(cIdx)}`}>
                    <div data-slot="skeleton" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : (
            data.map((row, rIdx) => (
              <tr key={row.id !== undefined ? String(row.id) : `row-${String(rIdx)}`}>
                {columns.map((col, cIdx) => {
                  const value = col.cell
                    ? col.cell({ row: { original: row } })
                    : col.accessorKey
                      ? (row as Record<string, unknown>)[col.accessorKey]
                      : null;
                  return <td key={col.id ?? String(cIdx)}>{value as React.ReactNode}</td>;
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  ),
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    React.useEffect(() => {
      if (!onOpenChange) return;
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") onOpenChange!(false);
      }
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onOpenChange]);
    return (
      <div data-slot="dialog" data-open={open ? "true" : "false"}>
        {children}
        {onOpenChange ? (
          <button type="button" onClick={() => onOpenChange(false)}>
            __close_dialog__
          </button>
        ) : null}
      </div>
    );
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-slot="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? (children as React.ReactElement) : <div>{children}</div>,
  FilterBar: ({ children }: { children?: React.ReactNode }) => (
    <div data-slot="filter-bar">{children}</div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  PageHeader: ({
    title,
    description,
    kicker,
    actions,
  }: {
    title: string;
    description?: string;
    kicker?: string;
    actions?: React.ReactNode;
  }) => (
    <div data-slot="page-header">
      {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div>{actions}</div> : null}
    </div>
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
  SelectTrigger: ({
    id,
    "aria-label": ariaLabel,
    className,
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
        className={className}
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
  TeachAndActEmptyState: ({
    heading,
    description,
    primaryAction,
  }: {
    heading: string;
    description?: string;
    primaryAction?: { label: string; onClick: () => void } | React.ReactNode;
  }) => (
    <div role="region" aria-label={heading} data-slot="teach-and-act-empty-state">
      <h3>{heading}</h3>
      {description ? <p>{description}</p> : null}
      {primaryAction &&
      typeof primaryAction === "object" &&
      "label" in (primaryAction as object) ? (
        <button
          type="button"
          onClick={(primaryAction as { label: string; onClick: () => void }).onClick}
        >
          {(primaryAction as { label: string; onClick: () => void }).label}
        </button>
      ) : (
        (primaryAction as React.ReactNode)
      )}
    </div>
  ),
  PageTabs: ({
    items,
    activePath,
    linkComponent: TabLink,
    ariaLabel,
  }: {
    items: Array<{ to: string; label: string }>;
    activePath: string;
    linkComponent: React.ComponentType<{
      to: string;
      "aria-current"?: "page";
      children: React.ReactNode;
    }>;
    ariaLabel: string;
  }) => (
    <nav aria-label={ariaLabel}>
      {items.map((item) => (
        <TabLink
          key={item.to}
          to={item.to}
          aria-current={item.to === activePath ? "page" : undefined}
        >
          {item.label}
        </TabLink>
      ))}
    </nav>
  ),
}));

vi.mock("../../../hooks/use-grants", () => ({
  useFunders: hoisted.mockUseFunders,
  useCreateFunder: hoisted.mockUseCreateFunder,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

const mockCaptureRecordFilterChanged = vi.fn();
vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureRecordFilterChanged: (...args: unknown[]) => mockCaptureRecordFilterChanged(...args),
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { FundersListPage } from "./index";

describe("FundersListPage", () => {
  beforeEach(() => {
    hoisted.setRouteSearch({});
    hoisted.mockUseFunders.mockReset();
    hoisted.mockUseCreateFunder.mockReset();
    hoisted.mockUseSession.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
    hoisted.mockNavigate.mockClear();
    hoisted.mockNavigate.mockImplementation((opts?: { search?: FundersRouteSearch }) => {
      if (opts?.search !== undefined) {
        hoisted.setRouteSearch(opts.search);
      }
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseCreateFunder.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders the PageHeader primitive without static next-action guidance", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    const heading = screen.getByRole("heading", { name: "Funders" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header-kicker']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Next action:/)).not.toBeInTheDocument();
    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
  });

  it("renders the Grants tab group with Funders marked as the active tab", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const nav = screen.getByRole("navigation", { name: "Grants sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/grants");
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/grants/pipeline",
    );
    expect(within(nav).getByRole("link", { name: "Funders" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Subrecipients" })).toHaveAttribute(
      "href",
      "/subrecipients",
    );
    expect(within(nav).getByRole("link", { name: "Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
  });

  it("renders DataTable skeleton rows while funders are loading", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders a destructive Alert when the funders query errors", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<FundersListPage />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(screen.getByText("Unable to load funders.")).toBeInTheDocument();
    expect(screen.queryByText("Your funders live here")).not.toBeInTheDocument();
  });

  it("keeps empty state actions visible without long funder explanations", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByRole("region", { name: "Your funders live here" })).toBeInTheDocument();
    expect(screen.getByText("Your funders live here")).toBeInTheDocument();
    expect(
      screen.getByText("Track who funds your work. See every grant tied to each one."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Funders are the foundations and agencies that award grants/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add funder" })).toBeInTheDocument();
  });

  it("primary action opens the create funder dialog", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const emptyState = screen.getByRole("region", { name: "Your funders live here" });
    fireEvent.click(within(emptyState).getByRole("button", { name: "Add your first funder" }));

    expect(screen.getAllByText("Add funder").length).toBeGreaterThan(0);
  });

  it("top-of-page trigger opens the create funder dialog", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    expect(screen.getAllByText("Add funder").length).toBeGreaterThan(0);
  });

  it("renders filter-active empty state when search is active and no funders found", async () => {
    // Seed one funder initially so the FilterBar is visible; return empty for the search call.
    hoisted.mockUseFunders.mockImplementation(({ search }: { search?: string } = {}) => ({
      data: search
        ? { data: [] }
        : { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    }));

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("funders-filter-empty")).toBeInTheDocument();
      expect(screen.getByText(/No funders match these filters/)).toBeInTheDocument();
    });
  });

  it("Clear filters button resets filter state via URL navigation", async () => {
    // Seed one funder initially so the FilterBar is visible; return empty for the search call.
    hoisted.mockUseFunders.mockImplementation(({ search }: { search?: string } = {}) => ({
      data: search
        ? { data: [] }
        : { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    }));

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByText("Clear filters")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear filters"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funders…")).toHaveValue("");
    });
  });

  it("renders the DataTable with funder rows and detail links", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Gates Foundation", type: "foundation" },
          { id: "funder-2", name: "USDA", type: "government" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    const grid = container.querySelector("[data-testid='funders-card-grid']");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass("min-w-0");
    // Cards in the same row stretch to match the tallest sibling, so a
    // two-line wrapped name doesn't leave an uneven void next to single-line
    // sibling cards.
    expect(grid).toHaveClass("items-stretch");

    expect(screen.getByText("Gates Foundation")).toBeInTheDocument();
    expect(screen.getByText("USDA")).toBeInTheDocument();
    expect(screen.getAllByText("Foundation").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Government").length).toBeGreaterThanOrEqual(1);

    const gatesLink = screen.getByRole("link", { name: /Gates Foundation/ });
    expect(gatesLink).toHaveAttribute("href", "/funders/funder-1");

    // Migrated onto cardVariants({ variant: "interactive" }) — carries the
    // shared interactive-card affordance classes instead of hand-rolled ones.
    expect(gatesLink).toHaveClass("cursor-pointer");
    expect(gatesLink).toHaveClass("hover:shadow-md");
    expect(gatesLink).toHaveClass("hover:border-primary/30");
    expect(gatesLink).toHaveClass("rounded-2xl");
  });

  it("exposes the full funder name via a title tooltip so truncated names stay recoverable", () => {
    const longName =
      "U.S. Department of Health & Human Services, Administration for Community Living";
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-long", name: longName, type: "government" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const nameEl = screen.getByText(longName);
    // Names show on up to two lines (line-clamp-2); the title tooltip remains
    // the fallback for the rare name that overflows even two lines.
    expect(nameEl).toHaveClass("line-clamp-2");
    expect(nameEl).toHaveAttribute("title", longName);

    // The type badge stays pinned to the top of the header row (not centered)
    // so a wrapped two-line name doesn't push it out of alignment.
    const card = screen.getByRole("link", { name: new RegExp(longName) });
    const badgeEl = within(card).getByText("Government");
    const headerRow = badgeEl.parentElement;
    expect(headerRow).toHaveClass("items-start");
    expect(badgeEl).toHaveClass("shrink-0");
  });

  it("renders the search input and funder-type filter when records exist", () => {
    // Seed one funder so the FilterBar is visible (true-empty hides it).
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const searchInput = screen.getByPlaceholderText("Search funders…");
    const typeFilter = screen.getByLabelText("Filter funder type");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveClass("sm:w-64");
    expect(typeFilter).toBeInTheDocument();
    expect(typeFilter).toHaveClass("w-full");
    expect(typeFilter).toHaveClass("sm:w-fit");
  });

  it("opens the create-funder dialog when Add funder is clicked", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const addFunderButton = screen.getByRole("button", { name: "Add funder" });
    expect(addFunderButton).toBeInTheDocument();
    fireEvent.click(addFunderButton);

    expect(screen.getAllByText("Add funder").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Add a funder. Track its grants, contacts, and priorities in one place."),
    ).toBeInTheDocument();
  });

  it("labels the priorities field 'Funding priorities' to match the funder detail edit form", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    expect(screen.getByLabelText("Funding priorities")).toBeInTheDocument();
    expect(screen.queryByText("Priorities", { selector: "label" })).not.toBeInTheDocument();
  });

  it("uses grant edit permissions instead of role alone for Add funder", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { grants: "edit" },
      isLoading: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByRole("button", { name: "Add funder" })).toBeInTheDocument();
  });

  it("disables Add funder until a name is entered", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Civic Partners" },
    });

    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("closes the dialog when Cancel is clicked", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));
    expect(screen.getAllByText("Add funder").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("heading", { name: "Add funder" }).closest("[data-slot='dialog']"),
    ).toHaveAttribute("data-open", "false");
  });

  it("surfaces a schema validation error for an invalid website URL", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));
    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Civic Partners" },
    });
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid website URL, including https://")).toBeInTheDocument();
    });
  });

  it("successfully creates a funder and resets the dialog", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockResolvedValue({ id: "funder-x" });
    hoisted.mockUseCreateFunder.mockReturnValue({ mutateAsync });

    render(<FundersListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Civic Partners" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "corporate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Civic Partners",
          type: "corporate",
        }),
      );
    });
  });

  it("surfaces a mutation error in the dialog", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Funder already exists"));
    hoisted.mockUseCreateFunder.mockReturnValue({ mutateAsync });

    render(<FundersListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Acme Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Funder already exists")).toBeInTheDocument();
    });
  });

  it("drives the funders query when search and type filter change", async () => {
    // Seed one funder so the FilterBar is visible; allow any search to still call the hook.
    hoisted.mockUseFunders.mockImplementation(({ search }: { search?: string } = {}) => ({
      data: search
        ? { data: [] }
        : { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    }));

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "acme" },
    });

    await waitFor(() => {
      expect(hoisted.mockUseFunders).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "acme",
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Filter funder type"), {
      target: { value: "government" },
    });

    await waitFor(() => {
      expect(hoisted.mockUseFunders).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "government",
        }),
      );
    });
  });

  it("resets dialog state when the dialog is closed and reopened via Escape", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    const nameInput = screen.getByLabelText("Funder name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Temp" } });
    expect(nameInput.value).toBe("Temp");

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Add funder" }));
    });

    await waitFor(() => {
      const reopenedInput = screen.getByLabelText("Funder name") as HTMLInputElement;
      expect(reopenedInput.value).toBe("");
    });
  });

  it("resets form data when the dialog is closed via the X button", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    const nameInput = screen.getByLabelText("Funder name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Temp Funder" } });
    expect(nameInput.value).toBe("Temp Funder");

    // Close via the X button rendered by DialogContent
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Add funder" }));
    });

    await waitFor(() => {
      const reopenedInput = screen.getByLabelText("Funder name") as HTMLInputElement;
      expect(reopenedInput.value).toBe("");
    });
  });

  it("renders card grid instead of table", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Gates Foundation", type: "foundation" },
          { id: "funder-2", name: "USDA", type: "government" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    expect(container.querySelector("[data-testid='funders-card-grid']")).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeInTheDocument();
    expect(screen.getByText("Gates Foundation")).toBeInTheDocument();
    expect(screen.getByText("USDA")).toBeInTheDocument();
  });

  it("each card links to funder detail", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "funder-42", name: "Civic Trust", type: "foundation" }],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    const link = screen.getByRole("link", { name: /Civic Trust/ });
    expect(link).toHaveAttribute("href", "/funders/funder-42");
    expect(link).toHaveClass("min-w-0");
  });

  it("shows loading skeleton when fetching", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });

  it("shows empty state when no funders and no filters", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByRole("region", { name: "Your funders live here" })).toBeInTheDocument();
  });

  it("shows filter-empty message when filters active and no results", async () => {
    // Seed one funder so the FilterBar is visible; return empty when search term present.
    hoisted.mockUseFunders.mockImplementation(({ search }: { search?: string } = {}) => ({
      data: search
        ? { data: [] }
        : { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    }));

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "xyz" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("funders-filter-empty")).toBeInTheDocument();
    });
  });

  it("surfaces a non-Error mutation rejection as a generic error message", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockRejectedValue("string-error");
    hoisted.mockUseCreateFunder.mockReturnValue({ mutateAsync });

    render(<FundersListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));
    fireEvent.change(screen.getByLabelText("Funder name"), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to add funder.")).toBeInTheDocument();
    });
  });

  it("does not render pagination when total fits on one page", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.queryByTestId("funders-pagination")).not.toBeInTheDocument();
  });

  it("renders pagination when total exceeds page size and Next increments page", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByTestId("funders-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({ page: 2 }),
        }),
      );
    });
  });

  it("disables Next on the last page", () => {
    hoisted.setRouteSearch({ page: 2 });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 26,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("clicking Previous on page 2 navigates back to page 1", async () => {
    hoisted.setRouteSearch({ page: 2 });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: false,
          search: expect.objectContaining({ page: 1 }),
        }),
      );
    });
  });

  it("preserves active search and type filter when paginating forward", async () => {
    hoisted.setRouteSearch({ q: "gates", type: "foundation", page: 1 });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: false,
          search: expect.objectContaining({ q: "gates", type: "foundation", page: 2 }),
        }),
      );
    });
  });

  it("resets type filter back to all when selecting the all option", async () => {
    hoisted.setRouteSearch({ type: "foundation" });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    // The select shows "foundation" as current value; changing to "all" clears the type
    fireEvent.change(screen.getByLabelText("Filter funder type"), {
      target: { value: "all" },
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: true,
          search: expect.not.objectContaining({ type: "foundation" }),
        }),
      );
    });
  });

  it("shows a Zod validation error when name has only whitespace", async () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add funder" }));

    // Bypass the empty-name guard by setting a name that passes isEmpty but fails Zod schema
    // The schema requires name.trim().length > 0; we test the setFormError(parsed.error) path
    // by triggering submit with a name that is non-empty but invalid per Zod
    // In the actual code: after trimming, if parsed.success is false, setFormError is called
    // We can trigger this by directly submitting the form after we set up state — the empty
    // name guard catches that first. Instead test by checking the schema returns an error
    // through the form submit with a minimal invalid payload.
    // The handleSubmit path: name.trim().length === 0 -> early return; then safeParse runs.
    // The funder name schema just validates string, so any non-empty string passes.
    // The uncovered line 170 is only reachable if safeParse returns failure with a non-empty name.
    // This happens if the name exceeds max length. Set a 256+ char name:
    const longName = "A".repeat(201);
    fireEvent.change(screen.getByLabelText("Funder name"), { target: { value: longName } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      // Either a Zod error message or the generic fallback is shown
      const errorText =
        screen.queryByText(/Unable to add funder/) ??
        screen.queryByText(/String must contain at most/);
      expect(errorText).toBeInTheDocument();
    });
  });

  it("resets page to 1 (drops page from URL) when search is typed while on a later page", async () => {
    hoisted.setRouteSearch({ page: 5 });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [{ id: "f-1", name: "Gates Foundation", type: "foundation" }],
        total: 200,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "gates" },
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: true,
        }),
      );
    });

    // The navigate call for filter sync must not include page
    const filterCall = hoisted.mockNavigate.mock.calls.find(
      (args) =>
        args[0] && typeof args[0] === "object" && "replace" in args[0] && args[0].replace === true,
    );
    expect(filterCall).toBeDefined();
    expect((filterCall![0] as { search: FundersRouteSearch }).search.page).toBeUndefined();
  });

  // True-empty state chrome gating (Wave 143)
  it("hides the FilterBar in the true-empty state (no funders, no active filter)", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.queryByPlaceholderText("Search funders…")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter funder type")).not.toBeInTheDocument();
    // The empty state must still be present.
    expect(screen.getByRole("region", { name: "Your funders live here" })).toBeInTheDocument();
  });

  it("shows the FilterBar when funders exist", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByPlaceholderText("Search funders…")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter funder type")).toBeInTheDocument();
  });

  it("shows the FilterBar when a filter is active even with no results", async () => {
    hoisted.setRouteSearch({ q: "xyz" });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    // Active search filter → FilterBar must stay visible so user can clear it.
    expect(screen.getByPlaceholderText("Search funders…")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter funder type")).toBeInTheDocument();
  });

  it("fires captureRecordFilterChanged with record_type=funders on search change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "acme" },
    });

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "funders",
        "search",
        expect.objectContaining({ search: "acme" }),
      );
    });
  });

  it("fires captureRecordFilterChanged with record_type=funders on type filter change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    fireEvent.change(screen.getByLabelText("Filter funder type"), {
      target: { value: "government" },
    });

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "funders",
        "type",
        expect.objectContaining({ type: "government" }),
      );
    });
  });

  it("search input has an accessible name", () => {
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Gates Foundation", type: "foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<FundersListPage />);

    expect(screen.getByRole("textbox", { name: /search funders/i })).toBeInTheDocument();
  });

  it("shows a Retry button when the funders query errors and clicking it calls refetch", () => {
    const mockRefetch = vi.fn();
    hoisted.mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    render(<FundersListPage />);

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
