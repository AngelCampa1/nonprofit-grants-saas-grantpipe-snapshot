import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FundsRouteSearch = {
  search?: string;
  type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
  page?: number;
};

describe("funds index source contracts", () => {
  it("uses shared fund type constants and labels for fund type options", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/funds/index.tsx"),
      "utf8",
    );

    expect(source).toContain("FUND_TYPES");
    expect(source).toContain("formatFundTypeLabel");
    expect(source).not.toContain(
      '<SelectItem value="temporarily_restricted">Temporarily Restricted</SelectItem>',
    );
    expect(source).not.toContain(
      '<SelectItem value="permanently_restricted">Permanently Restricted</SelectItem>',
    );
  });
});

const hoisted = vi.hoisted(() => ({
  routeSearchListeners: new Set<(value: FundsRouteSearch) => void>(),
  routeSearch: {} as FundsRouteSearch,
  getRouteSearch: () => hoisted.routeSearch,
  subscribeRouteSearch: (listener: (value: FundsRouteSearch) => void) => {
    hoisted.routeSearchListeners.add(listener);
    return () => hoisted.routeSearchListeners.delete(listener);
  },
  setRouteSearch: (value: FundsRouteSearch) => {
    hoisted.routeSearch = value;
    for (const listener of hoisted.routeSearchListeners) {
      listener(value);
    }
  },
  createNavigateMock: () =>
    vi.fn((options?: { search?: FundsRouteSearch }) => {
      hoisted.setRouteSearch(options?.search ?? {});
    }),
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useSearch: () =>
      React.useSyncExternalStore(
        hoisted.subscribeRouteSearch,
        hoisted.getRouteSearch,
        hoisted.getRouteSearch,
      ),
  })),
  mockUseNavigate: vi.fn(() => hoisted.createNavigateMock()),
  mockUseFunds: vi.fn(),
  mockUseCreateFund: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseSavedSegments: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  useNavigate: () => hoisted.mockUseNavigate(),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/funds" } }),
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

vi.mock("../../../hooks/use-grants", () => ({
  useFunds: hoisted.mockUseFunds,
  useCreateFund: hoisted.mockUseCreateFund,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    FilterBar: ({ children }: { children?: React.ReactNode }) => (
      <div data-slot="filter-bar">{children}</div>
    ),
    IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
    SelectTrigger: ({
      "aria-label": ariaLabel,
    }: {
      "aria-label"?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          readOnly={false}
        />
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return (
        <span
          role="option"
          aria-selected={false}
          data-slot="select-item"
          onClick={() => onValueChange(value)}
        >
          {children}
        </span>
      );
    },
    ViewToggle: ({
      options,
      value,
      onChange,
    }: {
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (v: string) => void;
    }) => (
      <div role="radiogroup" aria-label="View toggle">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={opt.value === value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    ),
    Skeleton: ({ className }: { className?: string }) => (
      <div data-slot="skeleton" className={className} />
    ),
    cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  };
});

vi.mock("../../../hooks/use-saved-segments", () => ({
  useSavedSegments: (...args: unknown[]) => hoisted.mockUseSavedSegments(...args),
}));

vi.mock("../../../components/explore-sample-data-cta", () => ({
  ExploreSampleDataCta: () => <div data-testid="explore-sample-data-cta-stub" />,
}));

vi.mock("../../../components/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    title,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={() => onConfirm()}>Confirm delete</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

import { getDefaultPermissionsForRole } from "@grantpipe/shared";
import { captureEvent } from "../../../lib/analytics";
import { FundsListPage } from "./index";

const mockCaptureEvent = vi.mocked(captureEvent);

describe("FundsListPage", () => {
  beforeEach(() => {
    mockCaptureEvent.mockClear();
    hoisted.mockUseFunds.mockReset();
    hoisted.mockUseCreateFund.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
    hoisted.mockUseNavigate.mockReset();
    hoisted.mockUseNavigate.mockImplementation(() => hoisted.createNavigateMock());
    hoisted.setRouteSearch({});
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseCreateFund.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });
  });

  it("renders Funds section tabs with Overview and Programs links for an admin", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    const nav = screen.getByRole("navigation", { name: "Funds sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programs" })).toBeInTheDocument();
  });

  it("does not render Funds section tabs for an auditor (programs has no permission)", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "auditor",
      memberPermissions: getDefaultPermissionsForRole("auditor"),
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.queryByRole("navigation", { name: "Funds sections" })).not.toBeInTheDocument();
  });

  it("renders the PageHeader primitive with kicker and help affordance", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundsListPage />);

    const heading = screen.getByRole("heading", { name: "Funds" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header-kicker']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help for Funds" })).toBeInTheDocument();
  });

  it("links restricted fund work to Budget Sentinel", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByRole("link", { name: "Open Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
  });

  it("renders DataTable skeleton rows while funds are loading", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<FundsListPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("renders a destructive Alert when the funds query errors", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<FundsListPage />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(screen.getByText("Unable to load funds.")).toBeInTheDocument();
    expect(screen.queryByText("Your funds live here")).not.toBeInTheDocument();
  });

  it("renders TeachAndActEmptyState when no funds and no filters active", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundsListPage />);

    expect(screen.getByRole("region", { name: "Your funds live here" })).toBeInTheDocument();
    expect(screen.getByText("Your funds live here")).toBeInTheDocument();
    expect(
      screen.getByText("Track money by its purpose. See what each fund can pay for."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first fund" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /How funds work/ })).toBeInTheDocument();

    // The sample-data CTA renders inside the TeachAndActEmptyState card's
    // footer slot, not as a floating sibling.
    const card = container.querySelector("[data-slot='teach-and-act-empty-state']");
    expect(card).not.toBeNull();
    expect(card?.contains(screen.getByTestId("explore-sample-data-cta-stub"))).toBe(true);
  });

  it("primary action opens the create fund dialog", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add your first fund" }));

    expect(screen.getAllByText("Add fund").length).toBeGreaterThan(0);
  });

  it("renders filter-active empty state when search is active and no funds found", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("funds-filter-empty")).toBeInTheDocument();
      expect(screen.getByText(/No funds match these filters/)).toBeInTheDocument();
    });
  });

  it("Clear filters button resets filter state", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByText("Clear filters")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear filters"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("");
    });
  });

  it("renders the DataTable with fund rows and detail links in Ledger view", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    const defaultSummary = {
      allocatedTotalCents: 0,
      expenseTotalCents: 0,
      currentBalanceCents: 0,
      expenseRatio: 0,
      thresholdState: null as null,
    };
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          { id: "fund-1", name: "General Fund", type: "unrestricted", summary: defaultSummary },
          {
            id: "fund-2",
            name: "STEM Access",
            type: "temporarily_restricted",
            summary: defaultSummary,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundsListPage />);

    const tables = container.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);

    expect(screen.getAllByText("Name").length).toBeGreaterThan(0);
    // "Type" collides with the filter and form labels, so we only assert on the fund-specific row content.
    expect(screen.getByText("General Fund")).toBeInTheDocument();
    expect(screen.getByText("STEM Access")).toBeInTheDocument();
    // Badge + select options render these labels.
    expect(screen.getAllByText("Unrestricted").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Temporarily restricted").length).toBeGreaterThanOrEqual(1);

    const generalFundLink = screen.getByRole("link", { name: "General Fund" });
    expect(generalFundLink).toHaveAttribute("href", "/funds/fund-1");

    sessionStorage.removeItem("gp-fund-view");
  });

  it("sorts funds numerically by balance when the Balance header is clicked", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    const summaryWith = (currentBalanceCents: number) => ({
      allocatedTotalCents: 0,
      expenseTotalCents: 0,
      currentBalanceCents,
      expenseRatio: 0,
      thresholdState: null as null,
    });
    // Insertion order is deliberately unsorted by balance (mid, low, high) so a
    // correct numeric sort must reorder the rows in either direction.
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          { id: "fund-mid", name: "Beta Fund", type: "unrestricted", summary: summaryWith(500000) },
          { id: "fund-low", name: "Alpha Fund", type: "unrestricted", summary: summaryWith(50000) },
          {
            id: "fund-high",
            name: "Gamma Fund",
            type: "unrestricted",
            summary: summaryWith(2000000),
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<FundsListPage />);
    const surface = container.querySelector('[data-slot="data-table-surface"]') as HTMLElement;

    const rowNames = () =>
      [...surface.querySelectorAll("tbody tr")].map(
        (tr) => tr.querySelector("td")?.textContent ?? "",
      );

    // Before sorting, rows follow the unsorted insertion order.
    expect(rowNames()[0]).toContain("Beta Fund");

    const balanceHeader = [...surface.querySelectorAll("thead th")].find((th) =>
      /Balance/i.test(th.textContent ?? ""),
    ) as HTMLElement;
    fireEvent.click(balanceHeader.querySelector("button") as HTMLElement);

    // After sorting, the rows are fully ordered by numeric balance (asc or desc),
    // never the lexicographic order that strings would produce.
    const sorted = rowNames();
    const ascending = ["Alpha Fund", "Beta Fund", "Gamma Fund"];
    const descending = [...ascending].reverse();
    const matchesAsc = ascending.every((name, i) => sorted[i]?.includes(name));
    const matchesDesc = descending.every((name, i) => sorted[i]?.includes(name));
    expect(matchesAsc || matchesDesc).toBe(true);

    sessionStorage.removeItem("gp-fund-view");
  });

  it("renders the search input and fund-type filter", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByPlaceholderText("Search funds…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter fund type" })).toBeInTheDocument();
  });

  it("opens the create-fund dialog when Add fund is clicked", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    const addFundButton = screen.getByRole("button", { name: "Add fund" });
    expect(addFundButton).toBeInTheDocument();
    fireEvent.click(addFundButton);

    expect(screen.getAllByText("Add fund").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Create a fund to track balances and restrictions."),
    ).toBeInTheDocument();
  });

  it("closes the create-fund dialog when Cancel is clicked", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    expect(screen.getAllByText("Add fund").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Create a fund to track balances and restrictions."),
      ).not.toBeInTheDocument();
    });
  });

  it("guards a direct empty-name form submission with a human message", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    // The Save button is disabled while the name is empty, so exercise the
    // defensive guard by submitting the form directly (e.g. Enter in a field).
    const form = screen.getByLabelText("Fund name").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText("Fund name is required.")).toBeInTheDocument();
    });
  });

  it("disables Add fund until a name is entered and while the create is pending", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    const save = screen.getByRole("button", { name: "Add" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: "   " } });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: "Building Fund" } });
    expect(save).toBeEnabled();

    hoisted.mockUseCreateFund.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    rerender(<FundsListPage />);
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
  });

  it("shows a Zod validation error when the fund name exceeds the max length", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));

    fireEvent.change(screen.getByLabelText("Fund name"), {
      target: { value: "A".repeat(201) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("successfully creates a fund and resets the dialog", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockResolvedValue({ id: "fund-x" });
    hoisted.mockUseCreateFund.mockReturnValue({ mutateAsync });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));

    fireEvent.change(screen.getByLabelText("Fund name"), {
      target: { value: "Scholarship Fund" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "temporarily_restricted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Scholarship Fund",
          type: "temporarily_restricted",
        }),
      );
    });
  });

  it("surfaces a mutation error in the dialog", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Fund already exists"));
    hoisted.mockUseCreateFund.mockReturnValue({ mutateAsync });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));

    fireEvent.change(screen.getByLabelText("Fund name"), {
      target: { value: "Scholarship Fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Fund already exists")).toBeInTheDocument();
    });
  });

  it("drives the funds query when search and fund-type filter change", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "scholar" },
    });

    // Fund type filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Filter fund type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Permanently restricted" }));

    await waitFor(() => {
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "scholar",
          type: "permanently_restricted",
        }),
      );
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "search",
      filter_count: 1,
      filter_keys: ["search"],
      has_search: true,
      record_type: "funds",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "type",
      filter_count: 2,
      filter_keys: ["search", "type"],
      has_search: true,
      record_type: "funds",
    });
  });

  it("hydrates fund filters from route search on load", async () => {
    hoisted.setRouteSearch({
      search: "reserve",
      type: "temporarily_restricted",
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("reserve");
      expect(screen.getByRole("combobox", { name: "Filter fund type" })).toHaveValue(
        "temporarily_restricted",
      );
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "reserve",
          type: "temporarily_restricted",
        }),
      );
    });
  });

  it("normalizes the all fund-type filter back to an empty route filter", async () => {
    hoisted.setRouteSearch({ type: "temporarily_restricted" });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const navigate = vi.fn(
      (options?: {
        search?: {
          search?: string;
          type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
        };
      }) => {
        hoisted.setRouteSearch(options?.search ?? {});
      },
    );
    hoisted.mockUseNavigate.mockReturnValue(navigate);

    render(<FundsListPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Filter fund type" }), {
      target: { value: "all" },
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: {} }));
    });
  });

  it("matches saved segments with missing filters against empty route filters", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-empty", name: "Everything", filters: undefined }],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn().mockReturnValue({}),
    });

    render(<FundsListPage />);

    expect(await screen.findByRole("button", { name: "Everything" })).toHaveClass("bg-primary");
  });

  it("uses the default segment storage key when no org id is available", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(hoisted.mockUseSavedSegments).toHaveBeenCalledWith("gp-fund-segments", {
      recordType: "funds",
    });
  });

  it("uses an org-scoped segment storage key when org id is available", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      orgId: "org-123",
      isLoading: false,
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(hoisted.mockUseSavedSegments).toHaveBeenCalledWith("gp-fund-segments:org-123", {
      recordType: "funds",
    });
  });

  it("marks a matching saved segment active when the route search hydrates from a bookmarked URL", async () => {
    hoisted.setRouteSearch({
      search: "reserve",
      type: "temporarily_restricted",
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Restricted only",
          filters: { search: "reserve", type: "temporarily_restricted" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });
    const navigate = vi.fn(
      (options?: {
        search?: {
          search?: string;
          type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
        };
      }) => {
        hoisted.setRouteSearch(options?.search ?? {});
      },
    );
    hoisted.mockUseNavigate.mockReturnValue(navigate);

    render(<FundsListPage />);

    const chip = await screen.findByRole("button", { name: "Restricted only" });
    expect(chip).toHaveClass("bg-primary");

    fireEvent.click(chip);

    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: {},
        }),
      );
    });
  });

  it("updates the visible filters when the route search changes externally", async () => {
    hoisted.setRouteSearch({});
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<FundsListPage />);

    await act(async () => {
      hoisted.setRouteSearch({
        search: "reserve",
        type: "temporarily_restricted",
      });
      rerender(<FundsListPage />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("reserve");
      expect(screen.getByRole("combobox", { name: "Filter fund type" })).toHaveValue(
        "temporarily_restricted",
      );
    });
  });

  it("writes filter changes back to route search for bookmarkable funds filters", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const navigate = vi.fn(
      (options?: {
        search?: {
          search?: string;
          type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
        };
      }) => {
        hoisted.setRouteSearch(options?.search ?? {});
      },
    );
    hoisted.mockUseNavigate.mockReturnValue(navigate);

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "reserve" },
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalled();
    });

    const firstSearchUpdate = navigate.mock.calls.at(-1)?.[0]?.search;
    expect(firstSearchUpdate).toEqual({ search: "reserve" });

    fireEvent.click(screen.getByRole("combobox", { name: "Filter fund type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Permanently restricted" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(2);
    });

    const secondSearchUpdate = navigate.mock.calls.at(-1)?.[0]?.search;
    expect(secondSearchUpdate).toEqual({
      search: "reserve",
      type: "permanently_restricted",
    });
  });

  it("resets dialog state when the dialog is closed and reopened via Escape", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));

    const nameInput = screen.getByLabelText("Fund name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Temp" } });
    expect(nameInput.value).toBe("Temp");

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    });

    await waitFor(() => {
      const reopenedInput = screen.getByLabelText("Fund name") as HTMLInputElement;
      expect(reopenedInput.value).toBe("");
    });
  });

  it("shows Add fund button for admin role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("button", { name: "Add fund" })).toBeInTheDocument();
  });

  it("shows Add fund button for editor role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("button", { name: "Add fund" })).toBeInTheDocument();
  });

  it("hides Add fund button for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.queryByRole("button", { name: "Add fund" })).not.toBeInTheDocument();
  });

  it("uses fund edit permissions instead of role alone for Add fund", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { funds: "edit" },
      isLoading: false,
    });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("button", { name: "Add fund" })).toBeInTheDocument();
  });

  it("resets form data when the dialog is closed via the X button", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));

    const nameInput = screen.getByLabelText("Fund name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Temp Fund" } });
    expect(nameInput.value).toBe("Temp Fund");

    // Close via the X button rendered by DialogContent
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    });

    await waitFor(() => {
      const reopenedInput = screen.getByLabelText("Fund name") as HTMLInputElement;
      expect(reopenedInput.value).toBe("");
    });
  });

  it("surfaces a non-Error mutation rejection as a generic error message", async () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockRejectedValue("string-error");
    hoisted.mockUseCreateFund.mockReturnValue({ mutateAsync });

    render(<FundsListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: "Some Fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to add fund.")).toBeInTheDocument();
    });
  });

  it("does not render the saved-segments section when there are no segments and user is a viewer", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    expect(screen.queryByText("Saved segments")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save current filters" })).not.toBeInTheDocument();
  });

  it("renders saved segment chips when segments exist", () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Restricted only",
          filters: { search: "", type: "temporarily_restricted" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn().mockReturnValue({ search: "", type: "temporarily_restricted" }),
    });

    render(<FundsListPage />);

    expect(screen.getByRole("button", { name: "Restricted only" })).toBeInTheDocument();
  });

  it("shows Save current filters button for admin only when at least one filter is active", () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    // No filters active — button should not appear
    expect(screen.queryByRole("button", { name: "Save current filters" })).not.toBeInTheDocument();

    // Activate a filter
    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "scholar" },
    });

    expect(screen.getByRole("button", { name: "Save current filters" })).toBeInTheDocument();
  });

  it("applying a saved segment updates fund filter state", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "Green", type: "permanently_restricted" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Perm Restricted",
          filters: { search: "Green", type: "permanently_restricted" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Perm Restricted" }));

    await waitFor(() => {
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Green", type: "permanently_restricted" }),
      );
    });
  });

  it("deletes a saved fund segment after confirming in the confirm dialog", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const deleteSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-1", name: "Old Segment", filters: { search: "", type: "" } }],
      saveSegment: vi.fn(),
      deleteSegment,
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    const deleteButton = screen.getByRole("button", { name: "Delete segment Old Segment" });
    fireEvent.click(deleteButton);

    // Confirm dialog should open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(deleteSegment).toHaveBeenCalledWith("seg-1");
  });

  it("opens Save segment dialog, accepts a name, and calls saveSegment for funds", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "scholar" },
    });

    const saveButton = screen.getByRole("button", { name: "Save current filters" });
    fireEvent.click(saveButton);

    const segmentNameInput = await screen.findByPlaceholderText("e.g. Restricted grants");
    fireEvent.change(segmentNameInput, { target: { value: "Scholar Funds" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });

    expect(saveSegment).toHaveBeenCalledWith(
      "Scholar Funds",
      expect.objectContaining({ search: "scholar" }),
    );
  });

  it("saves a segment via Enter key in the segment name input", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "scholar" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const segmentNameInput = await screen.findByPlaceholderText("e.g. Restricted grants");
    fireEvent.change(segmentNameInput, { target: { value: "Scholar Funds" } });
    fireEvent.keyDown(segmentNameInput, { key: "Enter" });

    expect(saveSegment).toHaveBeenCalledWith(
      "Scholar Funds",
      expect.objectContaining({ search: "scholar" }),
    );
  });

  it("does not call saveSegment when Enter is pressed with an empty segment name", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const input = await screen.findByPlaceholderText("e.g. Restricted grants");
    // Leave name empty, press Enter
    fireEvent.keyDown(input, { key: "Enter" });

    expect(saveSegment).not.toHaveBeenCalled();
  });

  it("applying a segment with an empty type clears the type filter", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi.fn().mockReturnValue({ search: "Green", type: "" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-1", name: "Green all types", filters: { search: "Green", type: "" } }],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Green all types" }));

    await waitFor(() => {
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Green" }),
      );
      // type should not be in the query when empty
      expect(hoisted.mockUseFunds).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "temporarily_restricted" }),
      );
    });
  });

  it("deactivates a segment when the active chip is clicked again", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "scholar", type: "temporarily_restricted" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Scholar",
          filters: { search: "scholar", type: "temporarily_restricted" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<FundsListPage />);

    const chip = screen.getByRole("button", { name: "Scholar" });
    fireEvent.click(chip); // apply segment

    await waitFor(() => {
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.objectContaining({ search: "scholar" }),
      );
    });

    fireEvent.click(chip); // deactivate

    await waitFor(() => {
      // After clearing, search goes back to empty (not in query params)
      expect(hoisted.mockUseFunds).toHaveBeenCalledWith(
        expect.not.objectContaining({ search: "scholar" }),
      );
    });
  });

  it("reapplies a saved segment after external route changes clear its active state", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "scholar", type: "temporarily_restricted" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Scholar",
          filters: { search: "scholar", type: "temporarily_restricted" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });
    const navigate = vi.fn(
      (options?: {
        search?: {
          search?: string;
          type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
        };
      }) => {
        hoisted.setRouteSearch(options?.search ?? {});
      },
    );
    hoisted.mockUseNavigate.mockReturnValue(navigate);

    const { rerender } = render(<FundsListPage />);
    const chip = screen.getByRole("button", { name: "Scholar" });

    fireEvent.click(chip);

    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "scholar", type: "temporarily_restricted" },
        }),
      );
    });

    await act(async () => {
      hoisted.setRouteSearch({ search: "reserve" });
      rerender(<FundsListPage />);
    });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "scholar", type: "temporarily_restricted" },
        }),
      );
    });
  });

  it("does not resurrect stale draft filters when the URL revisits an earlier route state", async () => {
    hoisted.setRouteSearch({});
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "reserve" },
    });
    expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("reserve");

    await act(async () => {
      hoisted.setRouteSearch({ search: "scholar" });
      rerender(<FundsListPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("scholar");
    });

    await act(async () => {
      hoisted.setRouteSearch({});
      rerender(<FundsListPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("");
    });
  });

  it("marks a saved fund segment with undefined filters active against empty route filters", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-1", name: "Everything", filters: undefined }],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    expect(await screen.findByRole("button", { name: "Everything" })).toHaveClass("bg-primary");
  });

  it("clears the fund type filter when All fund types is selected", async () => {
    hoisted.setRouteSearch({ search: "reserve", type: "temporarily_restricted" });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const navigate = vi.fn(
      (options?: {
        search?: {
          search?: string;
          type?: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
        };
      }) => {
        hoisted.setRouteSearch(options?.search ?? {});
      },
    );
    hoisted.mockUseNavigate.mockReturnValue(navigate);

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("combobox", { name: "Filter fund type" }));
    fireEvent.click(await screen.findByRole("option", { name: "All fund types" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "reserve" },
        }),
      );
    });
  });

  it("renders the ViewToggle in the FilterBar with Cards and Ledger options", () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    const toggle = screen.getByRole("radiogroup", { name: "View toggle" });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cards" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ledger" })).toBeInTheDocument();
  });

  it("defaults to Cards view", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Ledger" })).toHaveAttribute("aria-checked", "false");
  });

  it("switches to Ledger view when the Ledger toggle is clicked", async () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Ledger" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Ledger" })).toHaveAttribute("aria-checked", "true");
      // DataTable should be rendered (has a table element)
      expect(document.querySelector("table")).toBeInTheDocument();
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_view_changed", {
      from_view: "cards",
      record_type: "funds",
      to_view: "ledger",
    });
  });

  it("persists view selection to sessionStorage", async () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Ledger" }));

    await waitFor(() => {
      expect(sessionStorage.getItem("gp-fund-view")).toBe("ledger");
    });
  });

  it("restores view from sessionStorage on mount", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("radio", { name: "Ledger" })).toHaveAttribute("aria-checked", "true");

    sessionStorage.removeItem("gp-fund-view");
  });

  it("renders fund cards in Cards view when funds are loaded", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
          {
            id: "fund-2",
            name: "STEM Access",
            type: "temporarily_restricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    // Cards view should show the fund-card grid
    const cardGrid = document.querySelector("[data-testid='funds-card-grid']");
    expect(cardGrid).toBeInTheDocument();
    const generalFundLink = screen.getByRole("link", { name: /General Fund/ });
    expect(generalFundLink).toHaveAttribute("href", "/funds/fund-1");
    expect(screen.getByRole("link", { name: /STEM Access/ })).toHaveAttribute(
      "href",
      "/funds/fund-2",
    );

    // Migrated onto cardVariants({ variant: "interactive" }) — carries the
    // shared interactive-card affordance classes instead of hand-rolled ones.
    expect(generalFundLink).toHaveClass("cursor-pointer");
    expect(generalFundLink).toHaveClass("hover:shadow-md");
    expect(generalFundLink).toHaveClass("hover:border-primary/30");
    expect(generalFundLink).toHaveClass("rounded-2xl");
  });

  it("renders 6 skeleton cards in Cards view while loading", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<FundsListPage />);

    const skeletons = document.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBe(6);
  });

  it("shows filter-active empty state in Cards view when search is active and no funds", async () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("funds-filter-empty")).toBeInTheDocument();
    });
  });

  it("shows TeachAndActEmptyState in Cards view when no funds and no filters", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("region", { name: "Your funds live here" })).toBeInTheDocument();
  });

  it("shows filter-active empty state in Ledger view when search is active and no funds", async () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("funds-filter-empty")).toBeInTheDocument();
    });

    sessionStorage.removeItem("gp-fund-view");
  });

  it("Clear filters button in Ledger view resets filter state", async () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Clear filters").length).toBeGreaterThanOrEqual(1);
    });

    // Click the Clear filters button in the Ledger DataTable emptyState
    fireEvent.click(screen.getAllByText("Clear filters")[0]!);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search funds…")).toHaveValue("");
    });

    sessionStorage.removeItem("gp-fund-view");
  });

  it("shows TeachAndActEmptyState in Ledger view when no funds and no filters for viewer", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    expect(screen.getByRole("region", { name: "Your funds live here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open help" })).toBeInTheDocument();
    // Viewers cannot seed sample data, so the footer CTA stays hidden.
    expect(screen.queryByTestId("explore-sample-data-cta-stub")).not.toBeInTheDocument();

    sessionStorage.removeItem("gp-fund-view");
  });

  it("shows the sample-data CTA inside the card in Ledger view when no funds and no filters for an editor", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    const { container } = render(<FundsListPage />);

    const card = container.querySelector("[data-slot='teach-and-act-empty-state']");
    expect(card).not.toBeNull();
    expect(card?.contains(screen.getByTestId("explore-sample-data-cta-stub"))).toBe(true);

    sessionStorage.removeItem("gp-fund-view");
  });

  it("does not render pagination when total fits on one page", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "f-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.queryByTestId("funds-pagination")).not.toBeInTheDocument();
  });

  it("renders pagination when total exceeds page size and Next calls navigate", async () => {
    sessionStorage.removeItem("gp-fund-view");
    const navigate = vi.fn();
    hoisted.mockUseNavigate.mockReturnValue(navigate);
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "f-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByTestId("funds-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: expect.objectContaining({ page: 2 }) }),
      );
    });
  });

  it("disables Next on the last page", () => {
    sessionStorage.removeItem("gp-fund-view");
    act(() => {
      hoisted.setRouteSearch({ page: 2 });
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "f-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
        total: 26,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("clicking Previous on page 2 navigates back to page 1", async () => {
    sessionStorage.removeItem("gp-fund-view");
    act(() => {
      hoisted.setRouteSearch({ page: 2 });
    });
    const navigate = vi.fn();
    hoisted.mockUseNavigate.mockReturnValue(navigate);
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "f-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByTestId("funds-pagination")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ replace: false }));
    });
    const call = navigate.mock.calls[0]!;
    expect(call[0].search.page).toBeUndefined();
  });

  it("clicking 'Add your first fund' in Ledger view empty state opens the create dialog", async () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<FundsListPage />);

    const createButton = screen.getByRole("button", { name: "Add your first fund" });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    sessionStorage.removeItem("gp-fund-view");
  });

  it("closes the segment delete confirm dialog when Cancel is clicked without deleting", async () => {
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const deleteSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-99", name: "To Cancel", filters: { search: "", type: "" } }],
      saveSegment: vi.fn(),
      deleteSegment,
      applySegment: vi.fn(),
    });

    render(<FundsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete segment To Cancel" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteSegment).not.toHaveBeenCalled();
  });

  it("search input has an accessible name", () => {
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Operating",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 100000,
              expenseTotalCents: 0,
              currentBalanceCents: 100000,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByRole("textbox", { name: /search funds/i })).toBeInTheDocument();
  });

  it("renders fund balance in Cards view from summary.currentBalanceCents", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 500_000,
              expenseTotalCents: 200_000,
              currentBalanceCents: 300_000,
              expenseRatio: 0.4,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    // Balance should appear in the card — match by regex to handle locale-specific number formatting in jsdom
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
  });

  it("renders fund balance column in Ledger view from summary.currentBalanceCents", () => {
    sessionStorage.setItem("gp-fund-view", "ledger");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 1_000_000,
              expenseTotalCents: 750_000,
              currentBalanceCents: 250_000,
              expenseRatio: 0.75,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    // Balance column header
    expect(screen.getByText("Balance")).toBeInTheDocument();
    // Balance value — match by regex to handle locale-specific number formatting in jsdom
    expect(screen.getByText(/2,500/)).toBeInTheDocument();

    sessionStorage.removeItem("gp-fund-view");
  });

  it("shows a Retry button when the funds query errors and clicking it calls refetch", () => {
    const mockRefetch = vi.fn();
    hoisted.mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    render(<FundsListPage />);

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows full fund name as title attribute on truncated card heading", () => {
    sessionStorage.removeItem("gp-fund-view");
    hoisted.mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Fund",
            type: "unrestricted",
            summary: {
              allocatedTotalCents: 0,
              expenseTotalCents: 0,
              currentBalanceCents: 0,
              expenseRatio: 0,
              thresholdState: null,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<FundsListPage />);

    expect(screen.getByTitle("General Fund")).toBeInTheDocument();
  });
});
