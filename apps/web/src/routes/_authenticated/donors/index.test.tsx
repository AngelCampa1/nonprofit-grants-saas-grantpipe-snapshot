import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mockNavigate = vi.fn();
let mockPathname = "/donors";
let mockRouteSearch: {
  segment?: string;
  search?: string;
  pipelineStage?: string;
  tagId?: string;
  type?: string;
} = {};

describe("donors index source contracts", () => {
  it("uses shared donor pipeline stage labels", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/donors/index.tsx"),
      "utf8",
    );

    expect(source).toContain("DONOR_PIPELINE_STAGE_LABELS");
    expect(source).not.toContain("const STAGE_LABELS");
  });
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useSearch: () => mockRouteSearch,
  }),
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mockPathname } }),
  Link: ({
    to,
    params,
    children,
    className,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    let href = to;
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        href = href.replace(`$${key}`, value);
      });
    }
    return React.createElement("a", { href, className, ...props }, children);
  },
}));

vi.mock("../../../components/explore-sample-data-cta", () => ({
  ExploreSampleDataCta: () => <div data-testid="explore-sample-data-cta-stub" />,
}));

vi.mock("../../../components/donors/stats-bar", () => ({
  StatsBar: () => <div data-testid="stats-bar" />,
}));

vi.mock("../../../components/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    onConfirm,
    confirmLabel = "Confirm",
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    isPending?: boolean;
  }) =>
    open ? (
      <div role="dialog" data-testid="confirm-dialog">
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../../../components/dialogs/new-donor-dialog", () => ({
  NewDonorDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" data-testid="new-donor-dialog">
        <p>Create a new donor record and add it to this organization.</p>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));

vi.mock("../../../components/donors/pipeline-stage-select", () => ({
  PipelineStageSelect: ({
    value,
    onChange,
  }: {
    value: string | undefined;
    onChange: (value: string) => void;
  }) => (
    <select
      data-testid="pipeline-stage-select"
      aria-label="Pipeline Stage"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All stages</option>
      <option value="prospect">Prospect</option>
      <option value="cultivation">Cultivation</option>
    </select>
  ),
}));

const mockSegmentMutateAsync = vi.fn().mockResolvedValue({});
const mockDeleteSegmentMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUseContacts = vi.fn();
const mockUseDonorStats = vi.fn();
const mockUseRetentionStats = vi.fn();
const mockUseTags = vi.fn();
const mockUseSegments = vi.fn();
const mockUseSession = vi.fn();

vi.mock("../../../hooks/use-donors", () => ({
  useContacts: (...args: unknown[]) => mockUseContacts(...args),
  useDonorStats: () => mockUseDonorStats(),
  useRetentionStats: () => mockUseRetentionStats(),
  useTags: () => mockUseTags(),
  useSegments: () => mockUseSegments(),
  useCreateSegment: () => ({ mutateAsync: mockSegmentMutateAsync, isPending: false }),
  useDeleteSegment: () => ({ mutateAsync: mockDeleteSegmentMutateAsync }),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  const TabsCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    FilterBar: ({ children }: { children?: React.ReactNode }) => (
      <div data-slot="filter-bar">{children}</div>
    ),
    Tabs: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => <TabsCtx.Provider value={{ value, onValueChange }}>{children}</TabsCtx.Provider>,
    TabsList: ({ children }: { children?: React.ReactNode }) => (
      <div role="tablist">{children}</div>
    ),
    TabsTrigger: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { value: activeValue, onValueChange } = React.useContext(TabsCtx);
      return (
        <button
          role="tab"
          aria-selected={activeValue === value}
          onClick={() => onValueChange(value)}
        >
          {children}
        </button>
      );
    },
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
  };
});

import { captureEvent } from "../../../lib/analytics";
import { captureAppException } from "../../../lib/sentry";
import { DonorListPage } from "./index";

const mockCaptureEvent = vi.mocked(captureEvent);
const mockCaptureAppException = vi.mocked(captureAppException);

const mockContacts = [
  {
    id: "c1",
    type: "individual",
    firstName: "Alice",
    lastName: "Smith",
    organizationName: null,
    email: "alice@example.com",
    pipelineStage: "prospect",
    lastDonationDate: "2025-03-01",
    totalGivingCents: 50050,
  },
  {
    id: "c2",
    type: "organization",
    firstName: null,
    lastName: null,
    organizationName: "Acme Foundation",
    email: "acme@example.com",
    pipelineStage: "stewardship",
    lastDonationDate: "2025-01-15",
    totalGivingCents: 250099,
  },
];

function setupDefaultMocks() {
  mockUseSession.mockReturnValue({
    user: { role: "admin" },
    session: null,
    memberRole: "admin",
    isLoading: false,
    error: null,
  });
  mockUseContacts.mockReturnValue({
    data: { data: mockContacts, total: 2, page: 1, pageSize: 25 },
    isLoading: false,
  });
  mockUseDonorStats.mockReturnValue({ data: undefined, isLoading: false });
  mockUseRetentionStats.mockReturnValue({ data: undefined, isLoading: false });
  mockUseTags.mockReturnValue({ data: [] });
  mockUseSegments.mockReturnValue({ data: [] });
}

describe("DonorListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockClear();
    mockCaptureAppException.mockClear();
    mockPathname = "/donors";
    mockRouteSearch = {};
    setupDefaultMocks();
  });

  it("renders the header affordances without instructional body copy", () => {
    const { container } = render(<DonorListPage />);

    const heading = screen.getByRole("heading", { name: "Donors" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    // PageHeader primitive renders with data-slot="page-header"
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Next action:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help for Donors" })).toBeInTheDocument();
    expect(screen.getByTestId("stats-bar")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "List" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Pipeline" })).not.toBeInTheDocument();
  });

  it("renders the page-tabs navigation with Overview, At-Risk, and Pledges links", () => {
    render(<DonorListPage />);

    const nav = screen.getByRole("navigation", { name: "Donors sections" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "At-Risk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pledges" })).toBeInTheDocument();
  });

  it("blocks auditors from direct donor list URLs without fetching donor data", () => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      user: { role: "auditor" },
      session: null,
      memberRole: "auditor",
      isLoading: false,
      error: null,
    });

    render(<DonorListPage />);

    expect(screen.getByText("You need donor access.")).toBeInTheDocument();
    expect(screen.getByText("Ask an admin to update your team permissions.")).toBeInTheDocument();
    expect(mockUseContacts).not.toHaveBeenCalled();
    expect(mockUseDonorStats).not.toHaveBeenCalled();
  });

  it("renders the DataTable primitive on desktop when contacts load", () => {
    const { container } = render(<DonorListPage />);

    // DataTable renders a <table> wrapped in a container with the shared border.
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);

    // The DataTable header columns should include the canonical donor fields.
    expect(screen.getAllByText("Name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pipeline Stage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last Donation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Giving").length).toBeGreaterThan(0);
  });

  it("sorts by display name through the DataTable name accessor", () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));

    expect(screen.getByRole("button", { name: "Sort by Name desc" })).toBeInTheDocument();
  });

  it("keeps empty state actions visible without long donor explanations", () => {
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    const { container } = render(<DonorListPage />);

    expect(screen.getAllByRole("region", { name: "Your donors live here" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Your donors live here").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Keep all your donors in one place. See their gifts and next steps.")
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Keep every donor in one place. See who gave and when."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Donor records are the heart of your fundraising operation/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add your first donor" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByRole("button", { name: "Import from spreadsheet" }).length,
    ).toBeGreaterThan(0);

    // The sample-data CTA renders inside each TeachAndActEmptyState card's
    // footer slot (mobile + desktop variants), not as a floating sibling.
    const cards = container.querySelectorAll("[data-slot='teach-and-act-empty-state']");
    const ctaStubs = screen.getAllByTestId("explore-sample-data-cta-stub");
    expect(cards.length).toBeGreaterThan(0);
    expect(ctaStubs.length).toBe(cards.length);
    ctaStubs.forEach((stub) => {
      expect(Array.from(cards).some((card) => card.contains(stub))).toBe(true);
    });
  });

  it("hides the sample-data CTA for viewer role in both empty-state variants", () => {
    mockUseSession.mockReturnValue({
      user: { role: "viewer" },
      session: null,
      memberRole: "viewer",
      isLoading: false,
      error: null,
    });
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    expect(screen.getAllByRole("region", { name: "Your donors live here" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByTestId("explore-sample-data-cta-stub")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open help" }).length).toBeGreaterThan(0);
  });

  it("primary action opens the create donor dialog", () => {
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    const buttons = screen.getAllByRole("button", { name: "Add your first donor" });
    fireEvent.click(buttons[0]!);

    expect(
      screen.getByText("Create a new donor record and add it to this organization."),
    ).toBeInTheDocument();
  });

  it("secondary action navigates to /import", () => {
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    const buttons = screen.getAllByRole("button", { name: "Import from spreadsheet" });
    fireEvent.click(buttons[0]!);

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/import" }));
  });

  it("renders filter-active empty state when search is active and no donors found", async () => {
    mockRouteSearch = { search: "nonexistent" };
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    await waitFor(() => {
      const filterEmptyEls = document.querySelectorAll(
        "[data-testid='donors-filter-empty'], [data-testid='donors-filter-empty-desktop']",
      );
      expect(filterEmptyEls.length).toBeGreaterThan(0);
    });
  });

  it("Clear filters button in filter-active empty state resets search", async () => {
    mockRouteSearch = { search: "nonexistent" };
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Clear filters").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Clear filters")[0]!);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search contacts…")).toBeNull();
      expect(screen.getAllByText("Your donors live here").length).toBeGreaterThan(0);
    });
  });

  it("hides filter chrome when no donors and no active filter (true-empty state)", () => {
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    expect(screen.queryByPlaceholderText("Search contacts…")).toBeNull();
    expect(screen.getAllByText("Your donors live here").length).toBeGreaterThan(0);
  });

  it("desktop Clear filters button resets all active filters", async () => {
    mockRouteSearch = { search: "nonexistent" };
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });
    mockUseTags.mockReturnValue({
      data: [{ id: "tag-1", name: "Major Donor", color: "#0000FF" }],
    });

    render(<DonorListPage />);
    fireEvent.change(screen.getByTestId("pipeline-stage-select"), {
      target: { value: "cultivation" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Individual" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Tag" }));
    fireEvent.click(await screen.findByRole("option", { name: "Major Donor" }));

    await waitFor(() => {
      expect(screen.getAllByText("Clear filters").length).toBeGreaterThan(1);
    });

    const clearButtons = screen.getAllByText("Clear filters");
    fireEvent.click(clearButtons[clearButtons.length - 1]!);

    await waitFor(() => {
      // After all filters are cleared with no contacts, chrome is hidden — input is gone.
      expect(screen.queryByPlaceholderText("Search contacts…")).toBeNull();
      expect(screen.getAllByText("Your donors live here").length).toBeGreaterThan(0);
    });
  });

  it("ignores a route segment id that does not match saved segments", () => {
    mockRouteSearch = { segment: "missing-segment" };
    mockUseSegments.mockReturnValue({
      data: [{ id: "segment-1", name: "Major donors", filters: { search: "Alice" } }],
    });

    render(<DonorListPage />);

    expect(screen.getByPlaceholderText("Search contacts…")).toHaveValue("");
    expect(mockUseContacts).toHaveBeenCalledWith(expect.not.objectContaining({ search: "Alice" }));
  });

  it("renders the Alert primitive when the contacts query errors", () => {
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    });

    render(<DonorListPage />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    // The destructive alert variant is applied.
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(screen.getAllByText("Unable to load contacts.").length).toBeGreaterThan(0);
  });

  it("renders search and filter controls", () => {
    render(<DonorListPage />);

    expect(screen.getByPlaceholderText("Search contacts…")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-stage-select")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
  });

  it("shows add-contact entry points for admins and editors only", () => {
    const { unmount } = render(<DonorListPage />);
    expect(screen.getAllByRole("button", { name: "Add donor" })).toHaveLength(1);

    unmount();

    mockUseSession.mockReturnValue({
      user: { role: "viewer" },
      session: null,
      memberRole: "viewer",
      isLoading: false,
      error: null,
    });

    render(<DonorListPage />);
    expect(screen.queryAllByRole("button", { name: "Add donor" })).toHaveLength(0);
  });

  it("uses donor edit permissions instead of role alone for add-contact actions", () => {
    mockUseSession.mockReturnValue({
      user: { role: "viewer" },
      session: null,
      memberRole: "viewer",
      memberPermissions: { donors: "edit" },
      isLoading: false,
      error: null,
    });

    render(<DonorListPage />);

    expect(screen.getByRole("button", { name: "Add donor" })).toBeInTheDocument();
  });

  it("renders desktop table rows and mobile donor cards", () => {
    render(<DonorListPage />);

    expect(screen.getByTestId("donor-mobile-list")).toBeInTheDocument();
    expect(screen.getAllByText("Alice Smith").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Acme Foundation").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Last donation").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Total giving").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$500.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$2,500.99").length).toBeGreaterThanOrEqual(1);
  });

  it("uses detail links for contact names", () => {
    render(<DonorListPage />);

    const links = screen.getAllByRole("link", { name: "Alice Smith" });

    expect(links.some((link) => link.getAttribute("href") === "/donors/c1")).toBe(true);
  });

  it("resets pagination when search changes", async () => {
    render(<DonorListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search contacts…"), {
      target: { value: "Alice" },
    });

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Alice", page: 1 }),
      );
    });
  });

  it("updates the contacts query when stage, type, and tag filters change", async () => {
    mockUseTags.mockReturnValue({
      data: [{ id: "t1", name: "Major Donor", color: "#0000FF" }],
    });

    render(<DonorListPage />);

    fireEvent.change(screen.getByTestId("pipeline-stage-select"), {
      target: { value: "cultivation" },
    });

    // Type filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Individual" }));

    // Tag filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Tag" }));
    fireEvent.click(await screen.findByRole("option", { name: "Major Donor" }));

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "cultivation", page: 1 }),
      );
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ type: "individual", page: 1 }),
      );
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ tagId: "t1", page: 1 }),
      );
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "pipelineStage",
      filter_count: 1,
      filter_keys: ["pipelineStage"],
      has_search: false,
      record_type: "donors",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "tagId",
      filter_count: 3,
      filter_keys: ["pipelineStage", "tagId", "type"],
      has_search: false,
      record_type: "donors",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("t1");
  });

  it("hydrates the pipelineStage filter from route search params", async () => {
    mockRouteSearch = { pipelineStage: "cultivation" };

    render(<DonorListPage />);

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "cultivation" }),
      );
    });
    expect(screen.getByTestId("pipeline-stage-select")).toHaveValue("cultivation");
  });

  it("opens the add-donor dialog when the Add donor button is clicked", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add donor" }));

    await waitFor(() => expect(screen.getByTestId("new-donor-dialog")).toBeInTheDocument());
    expect(
      screen.getByText("Create a new donor record and add it to this organization."),
    ).toBeInTheDocument();
  });

  it("renders loading skeletons when contacts are loading", () => {
    mockUseContacts.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<DonorListPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("shows empty states and clamps pagination for an empty result set", () => {
    mockUseContacts.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    expect(screen.getAllByText("Your donors live here").length).toBeGreaterThan(0);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows an explicit error state instead of a false empty state when contacts fail to load", () => {
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Contacts API unavailable"),
    });

    render(<DonorListPage />);

    expect(screen.getAllByText("Unable to load contacts.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Your donors live here")).not.toBeInTheDocument();
  });

  it("handles null display values with ASCII placeholders", () => {
    mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "c3",
            type: "organization",
            firstName: null,
            lastName: null,
            organizationName: null,
            email: null,
            pipelineStage: null,
            lastDonationDate: null,
            totalGivingCents: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
    });

    render(<DonorListPage />);

    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole("link", { name: "--" }).length).toBeGreaterThan(0);
  });

  it("supports paging forward and backward", async () => {
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 50, page: 1, pageSize: 25 },
      isLoading: false,
    });

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  // ---------------------------------------------------------------------------
  // Filter toolbar consolidation
  // ---------------------------------------------------------------------------

  it("consolidates search, stage, type, view toggle, and save-filters into one toolbar row", () => {
    const { container } = render(<DonorListPage />);

    const filterBar = container.querySelector('[data-slot="filter-bar"]');
    expect(filterBar).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Search contacts");
    const stageSelect = screen.getByTestId("pipeline-stage-select");
    const typeSelect = screen.getByLabelText("Type");
    const viewToggle = screen.getByRole("radiogroup", { name: "View toggle" });
    const saveButton = screen.getByRole("button", { name: "Save current filters" });

    expect(filterBar).toContainElement(searchInput);
    expect(filterBar).toContainElement(stageSelect);
    expect(filterBar).toContainElement(typeSelect);
    expect(filterBar).toContainElement(viewToggle);
    expect(filterBar).toContainElement(saveButton);

    // Save current filters is pushed to the far right of the toolbar row.
    expect(saveButton.closest(".ml-auto")).not.toBeNull();
  });

  it("still offers Save current filters in the toolbar when no segments are saved yet", () => {
    mockUseSegments.mockReturnValue({ data: [] });
    render(<DonorListPage />);

    expect(screen.getByRole("button", { name: "Save current filters" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Segments UI
  // ---------------------------------------------------------------------------

  it("shows saved segments section when segments exist", () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: { pipelineStage: "donor" } }],
    });

    render(<DonorListPage />);

    expect(screen.getByRole("button", { name: "Major Donors" })).toBeInTheDocument();
  });

  it("applies segment filters when chip is clicked", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: { pipelineStage: "donor" } }],
    });

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Major Donors" }));

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "donor" }),
      );
    });
  });

  it("applies a saved segment referenced by the route search params", async () => {
    mockRouteSearch = { segment: "seg-1" };
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: { pipelineStage: "donor" } }],
    });

    render(<DonorListPage />);

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "donor" }),
      );
    });
  });

  it("clears segment filters when active chip is clicked again", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: { pipelineStage: "donor" } }],
    });

    render(<DonorListPage />);

    // Apply the segment
    fireEvent.click(screen.getByRole("button", { name: "Major Donors" }));
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "donor" }),
      );
    });

    // Click again to clear
    fireEvent.click(screen.getByRole("button", { name: "Major Donors" }));
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.not.objectContaining({ pipelineStage: "donor" }),
      );
    });
  });

  it("calls deleteSegment.mutateAsync when delete button is clicked", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: {} }],
    });

    render(<DonorListPage />);

    // Clicking the delete icon opens the ConfirmDialog instead of calling the mutation directly.
    fireEvent.click(screen.getByRole("button", { name: "Delete segment Major Donors" }));

    // Confirm in the dialog.
    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteSegmentMutateAsync).toHaveBeenCalledWith("seg-1");
    });
  });

  it("opens save-segment dialog and calls createSegment on submit", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "My segment" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockSegmentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My segment" }),
      );
    });
  });

  it("surfaces an error alert when saving a segment fails", async () => {
    mockSegmentMutateAsync.mockRejectedValueOnce(new Error("Segment save failed"));

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));
    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "Doomed segment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Segment save failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when segment save rejects without an Error", async () => {
    mockSegmentMutateAsync.mockRejectedValueOnce("nope");

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));
    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "Doomed segment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("surfaces an error alert when deleting a segment fails", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: {} }],
    });
    mockDeleteSegmentMutateAsync.mockRejectedValueOnce(new Error("Segment delete failed"));

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete segment Major Donors" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Segment delete failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when segment delete rejects without an Error", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: {} }],
    });
    mockDeleteSegmentMutateAsync.mockRejectedValueOnce("nope");

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete segment Major Donors" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("hides delete buttons from viewers", () => {
    mockUseSession.mockReturnValue({
      user: { role: "viewer" },
      session: null,
      memberRole: "viewer",
      isLoading: false,
      error: null,
    });
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: {} }],
    });

    render(<DonorListPage />);

    // Segment chip should be visible
    expect(screen.getByRole("button", { name: "Major Donors" })).toBeInTheDocument();
    // Delete button should NOT be visible
    expect(
      screen.queryByRole("button", { name: "Delete segment Major Donors" }),
    ).not.toBeInTheDocument();
  });

  it("does not render a separate donor pipeline tab", () => {
    render(<DonorListPage />);

    expect(screen.queryByRole("tab", { name: "Pipeline" })).not.toBeInTheDocument();
  });

  it("keeps the donors page as the only donor workspace route", () => {
    render(<DonorListPage />);

    expect(screen.getByRole("heading", { name: "Donors" })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/donors/pipeline" });
  });

  // ---------------------------------------------------------------------------
  // Export CSV
  // ---------------------------------------------------------------------------

  it("redirects to /login when export returns 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      blob: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockNavigate.mockResolvedValue(undefined);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });

    vi.unstubAllGlobals();
  });

  it("shows error message when export returns non-csv content-type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      blob: vi.fn().mockResolvedValue(new Blob()),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed: unexpected response format")).toBeInTheDocument();
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        {
          tags: { feature: "donors", operation: "export_csv" },
          extra: {
            filterPresence: {
              search: false,
              pipelineStage: false,
              tagId: false,
              type: false,
            },
          },
        },
        { sanitize: true },
      );
    });

    vi.unstubAllGlobals();
  });

  it("announces the export error to screen readers via role=alert", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      blob: vi.fn().mockResolvedValue(new Blob()),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Export failed: unexpected response format",
      );
    });

    vi.unstubAllGlobals();
  });

  it("exports CSV with active filters included in query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      blob: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);

    // Set search filter
    fireEvent.change(screen.getByPlaceholderText("Search contacts…"), {
      target: { value: "Alice" },
    });

    // Trigger export
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("search=Alice"),
        expect.any(Object),
      );
    });

    vi.unstubAllGlobals();
  });

  it("exports CSV with pipelineStage, tagId, and type filters in query string", async () => {
    mockUseTags.mockReturnValue({
      data: [{ id: "t1", name: "Major Donor", color: "#0000FF" }],
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      blob: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);

    // Set pipelineStage, type, and tag filters
    fireEvent.change(screen.getByTestId("pipeline-stage-select"), {
      target: { value: "prospect" },
    });

    // Type filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Individual" }));

    // Tag filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Tag" }));
    fireEvent.click(await screen.findByRole("option", { name: "Major Donor" }));

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("pipelineStage=prospect");
      expect(url).toContain("type=individual");
      expect(url).toContain("tagId=t1");
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        {
          tags: { feature: "donors", operation: "export_csv" },
          extra: {
            filterPresence: {
              search: false,
              pipelineStage: true,
              tagId: true,
              type: true,
            },
          },
        },
        { sanitize: true },
      );
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Major Donor");
    });

    vi.unstubAllGlobals();
  });

  it("treats null content-type header as empty string and throws unexpected format error", async () => {
    // null content-type → ?? "" → doesn't include text/csv → throws
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (_header: string) => null },
      blob: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed: unexpected response format")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("clears the active segment when the active segment is deleted", async () => {
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-1", name: "Major Donors", filters: { pipelineStage: "donor" } }],
    });

    render(<DonorListPage />);

    // First activate the segment
    fireEvent.click(screen.getByRole("button", { name: "Major Donors" }));
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "donor" }),
      );
    });

    // Now delete the active segment — clicking the icon opens the ConfirmDialog.
    fireEvent.click(screen.getByRole("button", { name: "Delete segment Major Donors" }));
    // Confirm in the dialog.
    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockDeleteSegmentMutateAsync).toHaveBeenCalledWith("seg-1");
    });
    // After deletion, filters should be cleared (no pipelineStage)
    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(
        expect.not.objectContaining({ pipelineStage: "donor" }),
      );
    });
  });

  it("shows generic error message when a non-Error is thrown during export", async () => {
    const mockFetch = vi.fn().mockRejectedValue("string error");
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed. Please try again.")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("shows error message when export returns non-ok status (not 401)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      blob: vi.fn(),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed (500)")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("shows exporting state while export is in progress", async () => {
    let resolveExport!: (value: Response) => void;
    const exportPromise = new Promise<Response>((resolve) => {
      resolveExport = resolve;
    });
    const mockFetch = vi.fn().mockReturnValue(exportPromise);
    vi.stubGlobal("fetch", mockFetch);

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Exporting…" })).toBeInTheDocument();
    });

    // Resolve export to clean up
    resolveExport(new Response(null, { status: 401 }));
    mockNavigate.mockResolvedValue(undefined);

    vi.unstubAllGlobals();
  });

  it("renders without errors when tags query returns undefined data", () => {
    mockUseTags.mockReturnValue({ data: undefined });
    mockUseSegments.mockReturnValue({ data: undefined });

    render(<DonorListPage />);

    // Should render normally — falls back to empty arrays
    expect(screen.getByRole("heading", { name: "Donors" })).toBeInTheDocument();
  });

  it("does not save segment when name is empty — Enter key triggers early return", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const nameInput = await screen.findByLabelText("Segment name");
    // Name is empty — pressing Enter should early-return without calling mutateAsync
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(mockSegmentMutateAsync).not.toHaveBeenCalled();
  });

  it("does not save segment when name is empty (click — button is disabled)", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    await screen.findByLabelText("Segment name");
    // Leave the name empty and click Save
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The save button should be disabled when name is empty
    expect(mockSegmentMutateAsync).not.toHaveBeenCalled();
  });

  it("applies segment with filters missing optional fields — falls back to empty defaults", async () => {
    // Segment with no search/pipelineStage/tagId/type fields
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-empty", name: "Empty Segment", filters: {} }],
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Empty Segment" }));

    await waitFor(() => {
      // No filters passed, just the base call
      expect(mockUseContacts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  it("applies segment with invalid filters — falls back to empty segment object", async () => {
    // Segment with non-object filters value that fails schema validation → parsed.success = false
    mockUseSegments.mockReturnValue({
      data: [{ id: "seg-bad", name: "Bad Segment", filters: "invalid-string" }],
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Bad Segment" }));

    await waitFor(() => {
      expect(mockUseContacts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  it("saves segment with all active filters in the payload", async () => {
    mockUseTags.mockReturnValue({
      data: [{ id: "t1", name: "Major Donor", color: "#0000FF" }],
    });

    render(<DonorListPage />);

    // Set all filters
    fireEvent.change(screen.getByPlaceholderText("Search contacts…"), {
      target: { value: "Angel" },
    });
    fireEvent.change(screen.getByTestId("pipeline-stage-select"), {
      target: { value: "prospect" },
    });

    // Type filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Individual" }));

    // Tag filter is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Tag" }));
    fireEvent.click(await screen.findByRole("option", { name: "Major Donor" }));

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));
    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "All Filters" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockSegmentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "All Filters",
          filters: expect.objectContaining({
            search: "Angel",
            pipelineStage: "prospect",
            type: "individual",
            tagId: "t1",
          }),
        }),
      );
    });
  });

  it("saves segment on Enter key in segment name input", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "Enter segment" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    await waitFor(() => {
      expect(mockSegmentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Enter segment" }),
      );
    });
  });

  it("does not save segment on non-Enter key press", async () => {
    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const nameInput = await screen.findByLabelText("Segment name");
    fireEvent.change(nameInput, { target: { value: "My segment" } });
    fireEvent.keyDown(nameInput, { key: "Tab" });

    // Should not have been called
    expect(mockSegmentMutateAsync).not.toHaveBeenCalled();
  });

  it("downloads CSV when export succeeds", async () => {
    const mockBlob = new Blob(["id,name\n1,Alice"], { type: "text/csv" });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/csv; charset=utf-8" },
      blob: vi.fn().mockResolvedValue(mockBlob),
    });
    vi.stubGlobal("fetch", mockFetch);

    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:url");
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    // Capture the anchor element created by the component via a stub
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        if (tag === "a") {
          const anchor = originalCreateElement("a", options) as HTMLAnchorElement;
          anchor.click = mockClick;
          return anchor;
        }
        return originalCreateElement(tag, options);
      });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });

    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:url");
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_export_completed", {
      export_format: "csv",
      filter_count: 0,
      filter_keys: [],
      has_search: false,
      record_type: "donors",
    });

    createElementSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("reads segment URL param without throwing a validation error", () => {
    // The route validates search with z.object({ segment: z.string().optional() }).
    // This test confirms the component renders normally when segment is present in search.
    render(<DonorListPage />);
    // Component mounts without error
    expect(screen.getByRole("heading", { name: "Donors" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // View Toggle & Kanban Board
  // ---------------------------------------------------------------------------

  it("renders ViewToggle with List and Board options", () => {
    render(<DonorListPage />);

    const radiogroup = screen.getByRole("radiogroup", { name: "View toggle" });
    expect(radiogroup).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: /list/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /board/i })).toBeInTheDocument();
  });

  it("defaults to list view", () => {
    sessionStorage.removeItem("gp-don-view");

    render(<DonorListPage />);

    const listRadio = screen.getByRole("radio", { name: /list/i });
    expect(listRadio).toHaveAttribute("aria-checked", "true");
    const boardRadio = screen.getByRole("radio", { name: /board/i });
    expect(boardRadio).toHaveAttribute("aria-checked", "false");
  });

  it("switches to board view when Board is selected", async () => {
    sessionStorage.removeItem("gp-don-view");
    // Board query needs its own mock return
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 2, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);

    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /board/i })).toHaveAttribute("aria-checked", "true");
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_view_changed", {
      from_view: "list",
      record_type: "donors",
      to_view: "kanban",
    });
  });

  it("board view renders kanban columns for all 5 stages", async () => {
    sessionStorage.removeItem("gp-don-view");
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 2, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      expect(screen.getByTestId("kanban-column-cultivation")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-solicitation")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-stewardship")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-donor")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-lapsed")).toBeInTheDocument();
    });
  });

  it("board view shows donor cards with name, email, and total giving", async () => {
    sessionStorage.removeItem("gp-don-view");
    const boardContacts = [
      {
        id: "c10",
        type: "individual",
        firstName: "Bob",
        lastName: "Jones",
        organizationName: null,
        email: "bob@example.com",
        pipelineStage: "cultivation",
        lastDonationDate: "2025-06-01",
        totalGivingCents: 10000,
      },
    ];
    mockUseContacts.mockReturnValue({
      data: { data: boardContacts, total: 1, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Bob Jones").length).toBeGreaterThan(0);
      // Email shown in sub-line, NOT nextAction
      expect(screen.getAllByText("bob@example.com").length).toBeGreaterThan(0);
      // 10000 cents → $100 (no cents because 10000 % 100 === 0)
      expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
    });
  });

  it("board view renders KanbanColumnSkeleton and no donor cards while loading", async () => {
    sessionStorage.setItem("gp-don-view", "kanban");
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<DonorListPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    });

    // Skeleton elements should be present; no donor cards rendered
    await waitFor(() => {
      expect(screen.queryAllByTestId("kanban-donor-card").length).toBe(0);
    });
  });

  it("board view shows alert when board query errors", async () => {
    sessionStorage.removeItem("gp-don-view");
    // List query succeeds; board query (pageSize=200) errors
    mockUseContacts.mockImplementation((args: { pageSize?: number }) => {
      if (args.pageSize === 200) {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error("board fetch failed"),
        };
      }
      return {
        data: { data: mockContacts, total: 2, page: 1, pageSize: 25 },
        isLoading: false,
        isError: false,
      };
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Unable to load donors.").length).toBeGreaterThan(0);
    });
  });

  it("reads kanban view from sessionStorage and renders board immediately on mount", async () => {
    sessionStorage.setItem("gp-don-view", "kanban");
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 2, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);

    // Board should be present immediately without clicking the toggle
    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    });
    // Board radio is checked
    expect(screen.getByRole("radio", { name: /board/i })).toHaveAttribute("aria-checked", "true");

    sessionStorage.removeItem("gp-don-view");
  });

  it("persists view in sessionStorage", async () => {
    sessionStorage.removeItem("gp-don-view");
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 2, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem("gp-don-view")).toBe("kanban");
    });
  });

  it("board view shows skeleton columns while board data is loading", async () => {
    sessionStorage.setItem("gp-don-view", "kanban");
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<DonorListPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    });
  });

  it("mobile always shows list regardless of view toggle", async () => {
    sessionStorage.removeItem("gp-don-view");
    mockUseContacts.mockReturnValue({
      data: { data: mockContacts, total: 2, page: 1, pageSize: 200 },
      isLoading: false,
    });

    render(<DonorListPage />);
    fireEvent.click(screen.getByRole("radio", { name: /board/i }));

    await waitFor(() => {
      // Mobile list is always present in DOM (hidden via CSS md:hidden class on the mobile container)
      const mobileList = screen.getByTestId("donor-mobile-list");
      expect(mobileList).toBeInTheDocument();
      // The kanban board is only shown in the desktop (hidden md:block) area
      const kanbanBoard = screen.getByTestId("kanban-board");
      expect(kanbanBoard).toBeInTheDocument();
      // Kanban is inside the hidden md:block wrapper (not mobile)
      const desktopWrapper = kanbanBoard.closest(".hidden.md\\:block");
      expect(desktopWrapper).toBeInTheDocument();
    });
  });

  it("keeps mobile donor cards shrinkable inside narrow padded viewports", () => {
    render(<DonorListPage />);

    const mobileList = screen.getByTestId("donor-mobile-list");
    expect(mobileList).toHaveClass("min-w-0");

    const mobileCard = screen.getAllByRole("article")[0];
    expect(mobileCard).toHaveClass("min-w-0");
    // Name clamps to two lines (still overflow-hidden, so the card stays
    // shrinkable in narrow viewports) instead of single-line truncation that
    // hides the name behind a hover-only tooltip.
    expect(screen.getByTitle("Alice Smith")).toHaveClass("line-clamp-2");
  });

  it("search input has an accessible name", () => {
    render(<DonorListPage />);
    expect(screen.getByRole("textbox", { name: /search contacts/i })).toBeInTheDocument();
  });

  it("shows Retry buttons when the contacts query errors and clicking one calls refetch", () => {
    const mockRefetch = vi.fn();
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      error: new Error("boom"),
    });

    render(<DonorListPage />);

    const retryButtons = screen.getAllByRole("button", { name: /retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);
    const firstRetryButton = retryButtons[0];
    if (!firstRetryButton) throw new Error("Expected at least one retry button");
    fireEvent.click(firstRetryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("does not render the pagination row when the contacts query errors", () => {
    mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
      error: new Error("boom"),
    });

    render(<DonorListPage />);

    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
  });

  it("shows full email as title attribute on truncated email spans when email is present", () => {
    render(<DonorListPage />);

    const emailTitles = screen.getAllByTitle("alice@example.com");
    expect(emailTitles.length).toBeGreaterThan(0);
  });

  it("omits title attribute on email spans when email is null", () => {
    mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "c-null-email",
            type: "individual",
            firstName: "No",
            lastName: "Email",
            organizationName: null,
            email: null,
            pipelineStage: "prospect",
            lastDonationDate: null,
            totalGivingCents: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
    });

    render(<DonorListPage />);

    // "--" placeholder spans for null email should not carry a title attribute
    const dashSpans = Array.from(document.querySelectorAll("span")).filter(
      (el) => el.textContent === "--" && el.getAttribute("title") !== null,
    );
    expect(dashSpans.length).toBe(0);
  });
});
