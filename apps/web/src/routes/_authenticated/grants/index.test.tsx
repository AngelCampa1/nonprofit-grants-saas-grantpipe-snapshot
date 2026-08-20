import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRANT_STAGE_DETAILS } from "../../../lib/grant-stages";

const hoisted = vi.hoisted(() => ({
  routeSearchListeners: new Set<
    (value: {
      search?: string;
      status?: string;
      funderId?: string;
      threshold?: "80" | "90" | "100";
    }) => void
  >(),
  routeSearch: {} as {
    search?: string;
    status?: string;
    funderId?: string;
    threshold?: "80" | "90" | "100";
  },
  getRouteSearch: () => hoisted.routeSearch,
  subscribeRouteSearch: (
    listener: (value: {
      search?: string;
      status?: string;
      funderId?: string;
      threshold?: "80" | "90" | "100";
    }) => void,
  ) => {
    hoisted.routeSearchListeners.add(listener);
    return () => hoisted.routeSearchListeners.delete(listener);
  },
  setRouteSearch: (value: {
    search?: string;
    status?: string;
    funderId?: string;
    threshold?: "80" | "90" | "100";
  }) => {
    hoisted.routeSearch = value;
    for (const listener of hoisted.routeSearchListeners) {
      listener(value);
    }
  },
  mockNavigate: vi.fn(
    (options?: {
      search?: {
        search?: string;
        status?: string;
        funderId?: string;
        threshold?: "80" | "90" | "100";
      };
    }) => {
      hoisted.setRouteSearch(options?.search ?? {});
    },
  ),
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
  mockUseGrants: vi.fn(),
  mockUseFunders: vi.fn(),
  mockUseGrantPipeline: vi.fn(),
  mockUseGrantOpportunitySearch: vi.fn(),
  mockUseGrantOpportunities: vi.fn(),
  mockUseGrantOpportunityMutations: vi.fn(),
  mockUseCreateGrantOpportunity: vi.fn(),
  mockUseCreateGrant: vi.fn(),
  mockUseUpdateGrantStage: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseSavedSegments: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  useNavigate: () => hoisted.mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/grants" } }),
  Link: ({
    children,
    to,
    params,
    hash,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
    hash?: string;
  }) => {
    let href = to ?? "";
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        href = href.replace(`$${key}`, value);
      });
    }
    return (
      <a href={hash ? `${href}#${hash}` : href} className={className} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../../../hooks/use-grants", () => ({
  useGrants: hoisted.mockUseGrants,
  useFunders: hoisted.mockUseFunders,
  useGrantPipeline: hoisted.mockUseGrantPipeline,
  useGrantOpportunitySearch: hoisted.mockUseGrantOpportunitySearch,
  useGrantOpportunities: hoisted.mockUseGrantOpportunities,
  useGrantOpportunityMutations: hoisted.mockUseGrantOpportunityMutations,
  useCreateGrantOpportunity: hoisted.mockUseCreateGrantOpportunity,
  useCreateGrant: hoisted.mockUseCreateGrant,
  useUpdateGrantStage: hoisted.mockUseUpdateGrantStage,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
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

vi.mock("../../../components/dialogs/new-grant-dialog", () => ({
  NewGrantDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" data-testid="new-grant-dialog">
        <p>Create grant</p>
        <p>Set up a new grant record and connect it to the right funder.</p>
        <button onClick={() => onOpenChange(false)}>Close dialog</button>
      </div>
    ) : null,
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
    disabled: boolean;
  }>({ value: "", onValueChange: () => {}, disabled: false });
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
      disabled = false,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
      children?: React.ReactNode;
    }) => (
      <SelectCtx.Provider value={{ value, onValueChange, disabled }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({
      "aria-label": ariaLabel,
      id,
    }: {
      "aria-label"?: string;
      id?: string;
      children?: React.ReactNode;
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
          readOnly={false}
        />
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange, disabled } = React.useContext(SelectCtx);
      return (
        <span
          role="option"
          aria-selected={false}
          data-slot="select-item"
          onClick={() => {
            if (!disabled) onValueChange(value);
          }}
        >
          {children}
        </span>
      );
    },
    cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  };
});

vi.mock("../../../hooks/use-saved-segments", () => ({
  useSavedSegments: (...args: unknown[]) => hoisted.mockUseSavedSegments(...args),
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../../components/video-dialog", () => ({
  VideoDialog: ({ slug, triggerLabel }: { slug: string; triggerLabel?: string }) => (
    <button data-testid={`video-dialog-${slug}`}>{triggerLabel ?? `Watch: ${slug}`}</button>
  ),
}));

vi.mock("../../../components/explore-sample-data-cta", () => ({
  ExploreSampleDataCta: () => <div data-testid="explore-sample-data-cta-stub" />,
}));

import { captureEvent } from "../../../lib/analytics";
import { GrantsListPage, GrantsPagination, buildGrantRouteSearch } from "./index";

const mockCaptureEvent = vi.mocked(captureEvent);

describe("GrantsListPage", () => {
  it("builds route search params without default pagination noise", () => {
    expect(
      buildGrantRouteSearch(
        {
          search: "stem",
          status: "awarded",
          funderId: "funder-1",
          threshold: "90",
        },
        { page: 1, trackedPage: 1 },
      ),
    ).toEqual({
      search: "stem",
      status: "awarded",
      funderId: "funder-1",
      threshold: "90",
    });
    expect(
      buildGrantRouteSearch(
        { search: "", status: "", funderId: "", threshold: "" },
        { page: 2, trackedPage: 3 },
      ),
    ).toEqual({ page: 2, trackedPage: 3 });
  });

  it("renders grant pagination controls and calls page changes", () => {
    const onPageChange = vi.fn();

    render(<GrantsPagination page={2} pageSize={25} total={75} onPageChange={onPageChange} />);

    expect(screen.getByTestId("grants-pagination")).toHaveTextContent("Page 2 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("hides grant pagination when there is only one page", () => {
    const { container } = render(
      <GrantsPagination page={1} pageSize={25} total={25} onPageChange={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  beforeEach(() => {
    mockCaptureEvent.mockClear();
    hoisted.mockNavigate.mockClear();
    hoisted.setRouteSearch({});
    hoisted.mockUseGrants.mockReset();
    hoisted.mockUseFunders.mockReset();
    hoisted.mockUseGrantPipeline.mockReset();
    hoisted.mockUseGrantOpportunitySearch.mockReset();
    hoisted.mockUseGrantOpportunities.mockReset();
    hoisted.mockUseGrantOpportunityMutations.mockReset();
    hoisted.mockUseCreateGrantOpportunity.mockReset();
    hoisted.mockUseCreateGrant.mockReset();
    hoisted.mockUseUpdateGrantStage.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      isLoading: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunities.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunityMutations.mockReturnValue({
      saveOpportunity: { mutate: vi.fn() },
      convertOpportunity: { mutate: vi.fn() },
    });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseCreateGrant.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders PageHeader primitive with kicker and help affordance", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    const heading = screen.getByRole("heading", { name: "Grants" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header-kicker']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
  });

  it("renders the Grants tab group with links to every cluster page", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    const nav = screen.getByRole("navigation", { name: "Grants sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/grants/pipeline",
    );
    expect(within(nav).getByRole("link", { name: "Funders" })).toHaveAttribute("href", "/funders");
    expect(within(nav).getByRole("link", { name: "Subrecipients" })).toHaveAttribute(
      "href",
      "/subrecipients",
    );
    expect(within(nav).getByRole("link", { name: "Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
  });

  it("renders grant workspace tabs", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(screen.getByRole("tab", { name: "Opportunities" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Portfolio" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_view_changed", {
      from_view: "portfolio",
      record_type: "grants",
      to_view: "pipeline",
    });
  });

  it("renders the real grant pipeline board inside the Pipeline tab", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        active: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));

    expect(screen.getByText("Active delivery")).toBeInTheDocument();
    expect(screen.getByText("Summer Learning")).toBeInTheDocument();
    expect(screen.getByText("No grants you are still researching.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Pipeline work now lives in this Grants workspace/i),
    ).not.toBeInTheDocument();
  });

  it("lets editors move grants from the Pipeline tab board", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));

    fireEvent.change(
      screen.getByRole("combobox", { name: "Move Summer Learning to another stage" }),
      {
        target: { value: "submitted" },
      },
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      grantId: "grant-1",
      status: "submitted",
    });
  });

  it("lets users with explicit grants edit permission move grants in the Pipeline tab", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { grants: "edit" },
      isLoading: false,
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));

    fireEvent.change(
      screen.getByRole("combobox", { name: "Move Summer Learning to another stage" }),
      {
        target: { value: "submitted" },
      },
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      grantId: "grant-1",
      status: "submitted",
    });
  });

  it("keeps Pipeline tab stage controls read-only for viewers", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));

    const trigger = screen.getByRole("combobox", {
      name: "Move Summer Learning to another stage",
    });
    expect(trigger).toBeDisabled();
    fireEvent.change(trigger, { target: { value: "submitted" } });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("searches grant opportunities and can add one to the pipeline", async () => {
    const user = userEvent.setup();
    const convert = vi.fn();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-1",
            title: "Community Food Access",
            agencyName: "HHS",
            opportunityNumber: "HHS-2026-001",
            officialUrl: "https://www.grants.gov/search-results-detail/opp-1",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunityMutations.mockReturnValue({
      saveOpportunity: { mutate: vi.fn() },
      convertOpportunity: { mutate: convert },
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    fireEvent.change(screen.getByLabelText("Search grant opportunities"), {
      target: { value: "food" },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    expect(hoisted.mockUseGrantOpportunitySearch).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "food" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_search_submitted", {
      keyword_length_bucket: "1-20",
      source: "grants_gov",
    });
    expect(convert).toHaveBeenCalledWith(
      { opportunityId: "opp-1", status: "application" },
      { onError: expect.any(Function) },
    );
  });

  it("shows tracked opportunities separately from live Grants.gov search", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunities.mockReturnValue({
      data: {
        data: [
          {
            id: "tracked-1",
            title: "Neighborhood Resilience Fund",
            sourceType: "community_foundation",
            sourceName: "Community Foundation",
            funderType: "foundation",
            officialUrl: "https://example.org/apply",
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("tab", { name: "Tracked/imported" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_view_changed", {
      from_view: "live",
      to_view: "tracked",
    });
    expect(screen.getByText("Neighborhood Resilience Fund")).toBeInTheDocument();
    expect(screen.getAllByText("Community foundation").length).toBeGreaterThan(0);
    expect(screen.getByText("Community Foundation")).toBeInTheDocument();
    expect(hoisted.mockUseGrantOpportunities).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );

    fireEvent.change(screen.getByLabelText("Tracked opportunity source type"), {
      target: { value: "community_foundation" },
    });
    fireEvent.change(screen.getByLabelText("Tracked opportunity funder type"), {
      target: { value: "foundation" },
    });

    expect(hoisted.mockUseGrantOpportunities).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        sourceType: "community_foundation",
        funderType: "foundation",
      }),
    );
    const applyLink = screen.getByRole("link", { name: /Apply/i });
    expect(applyLink).toHaveAttribute("target", "_blank");
    expect(applyLink).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(applyLink);
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_apply_clicked", {
      funder_type: "foundation",
      source_type: "community_foundation",
      surface: "opportunity_card",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "Neighborhood Resilience Fund",
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("https://example.org/apply");
  });

  it("navigates portfolio and tracked opportunity pagination controls", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
        total: 75,
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunities.mockReturnValue({
      data: {
        data: [
          {
            id: "tracked-1",
            title: "Tracked Opportunity",
            sourceType: "federal",
            officialUrl: null,
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
        total: 75,
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByTestId("grants-pagination").querySelectorAll("button")[1]!);
    expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ page: 2 }),
      }),
    );

    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("tab", { name: "Tracked/imported" }));
    await user.click(
      screen.getByTestId("tracked-opportunities-pagination").querySelectorAll("button")[1]!,
    );
    expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ trackedPage: 2 }),
      }),
    );
  });

  it("creates a manual opportunity from the Opportunities tab", async () => {
    const user = userEvent.setup();
    const createOpportunity = vi.fn();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: createOpportunity,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add manual opportunity" }));
    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Neighborhood Resilience Fund" },
    });
    fireEvent.change(screen.getByLabelText("Source type"), {
      target: { value: "community_foundation" },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Community Foundation" },
    });
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation",
      }),
      expect.anything(),
    );
    const mutationOptions = createOpportunity.mock.calls[0]?.[1] as
      | { onSuccess?: () => void }
      | undefined;
    await act(async () => {
      mutationOptions?.onSuccess?.();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([
    ["corporate", "corporate"],
    ["state_local", "government"],
    ["other", "other"],
    ["association", "other"],
  ] as const)("maps manual %s opportunities to %s funder type", async (sourceType, funderType) => {
    const user = userEvent.setup();
    const createOpportunity = vi.fn();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: createOpportunity,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add manual opportunity" }));
    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Mapped opportunity" },
    });
    fireEvent.change(screen.getByLabelText("Source type"), {
      target: { value: sourceType },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Mapped source" },
    });
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType,
        funderType,
      }),
      expect.anything(),
    );
  });

  it("shows live and tracked opportunity loading and error states", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
    });
    hoisted.mockUseGrantOpportunities.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(screen.getByText("Searching Grants.gov…")).toBeInTheDocument();
    expect(screen.getByText("Unable to search grant opportunities")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tracked/imported" }));

    expect(screen.getByText("Loading tracked opportunities…")).toBeInTheDocument();
    expect(screen.getByText("Unable to load tracked opportunities")).toBeInTheDocument();
  });

  it("prompts the user to search before any live opportunity keyword is submitted", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(
      screen.getByText("Search Grants.gov to find grants. Type a keyword above."),
    ).toBeInTheDocument();
  });

  it("shows a no-match empty state when a live search returns nothing", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    fireEvent.change(screen.getByLabelText("Search grant opportunities"), {
      target: { value: "no results here" },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      screen.getByText("No grants match your search. Try another keyword."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Search Grants.gov to find grants. Type a keyword above."),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state on the tracked tab when nothing is tracked", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("tab", { name: "Tracked/imported" }));

    expect(
      screen.getByText("No tracked grants yet. Find grants on the Live tab and track them."),
    ).toBeInTheDocument();
  });

  it("renders the DataTable with grant rows when data loads", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "grant-2",
            name: "Community Garden",
            funder: null,
            status: "discovery",
            amountCents: null,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    // DataTable primitive renders a real <table>
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);

    expect(screen.getAllByText("Name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Funder").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Amount").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deadline").length).toBeGreaterThan(0);

    expect(screen.getByText("STEM Access Fund")).toBeInTheDocument();
    expect(screen.getByText("Acme Foundation")).toBeInTheDocument();
    expect(screen.getByText("Community Garden")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Discovery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$5,000")).toBeInTheDocument();
    // Null funder + null amount + null deadline all render as "--"
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);
  });

  it("shows a pending overage banner from grant capacity metadata without blocking the table", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
        capacity: {
          planTier: "starter",
          billingCapGrantCount: 12,
          includedCap: 10,
          softHeadroomCap: 20,
          overageCount: 2,
          overageCopy: "$10/active grant/month",
          overageMonthlyCents: 2000,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(screen.getByTestId("grants-overage-banner")).toHaveTextContent(
      "2 active grants over your included cap",
    );
    expect(screen.getByText(/\$10\/active grant\/month/)).toBeInTheDocument();
    expect(screen.getByText(/\$20\/mo currently pending/)).toBeInTheDocument();
    expect(screen.getByText("STEM Access Fund")).toBeInTheDocument();
  });

  it("uses singular copy when grant capacity has one overage", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [],
        capacity: {
          planTier: "starter",
          billingCapGrantCount: 11,
          includedCap: 10,
          softHeadroomCap: 20,
          overageCount: 1,
          overageCopy: "$10/active grant/month",
          overageMonthlyCents: 1000,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(screen.getByTestId("grants-overage-banner")).toHaveTextContent(
      "1 active grant over your included cap",
    );
  });

  it("renders TeachAndActEmptyState with actions when no grants and no filters", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
    expect(screen.getByText("Your grants live here")).toBeInTheDocument();
    expect(
      screen.getByText("Track every grant you win. Watch deadlines so nothing slips."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("video-dialog-add-grant-allocate")).toHaveTextContent(
      "Watch: Add a grant",
    );
    expect(screen.getByRole("button", { name: "Add your first grant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /How grants work/ })).toBeInTheDocument();

    // The video trigger and the sample-data CTA render inside the
    // TeachAndActEmptyState card's footer slot, not as floating siblings.
    const card = container.querySelector("[data-slot='teach-and-act-empty-state']");
    expect(card).not.toBeNull();
    expect(card?.contains(screen.getByTestId("video-dialog-add-grant-allocate"))).toBe(true);
    expect(card?.contains(screen.getByTestId("explore-sample-data-cta-stub"))).toBe(true);
  });

  it("primary action opens the create grant dialog", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add your first grant" }));

    expect(screen.getByText("Create grant")).toBeInTheDocument();
  });

  it("Add grant button opens the NewGrantDialog", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add grant" }));

    expect(screen.getByTestId("new-grant-dialog")).toBeInTheDocument();
  });

  it("uses the shared grant status list for the portfolio status filter", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    for (const stage of GRANT_STAGE_DETAILS) {
      expect(screen.getAllByRole("option", { name: stage.label }).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("secondary action navigates to /import", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Import from spreadsheet" }));

    expect(hoisted.mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/import" }));
  });

  it("renders filter-active empty state when search is active and no grants found", async () => {
    // Seed one grant so the FilterBar is visible, then type a non-matching search.
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    // The grant is visible initially.
    expect(screen.getByText("STEM Access Fund")).toBeInTheDocument();

    // Now mock returns empty (simulating a server-side search returning nothing).
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("grants-filter-empty")).toBeInTheDocument();
      expect(screen.getByText(/No grants match these filters/)).toBeInTheDocument();
    });
  });

  it("Clear filters button resets filter state", async () => {
    // Seed one grant so the FilterBar is visible on first render.
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    // Switch mock to empty so the DataTable emptyState (with "Clear filters") appears.
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByText("Clear filters")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear filters"));

    // After clearing, hasActiveFilters=false and grants=[] → hasGrantListChrome=false →
    // the FilterBar is hidden. Assert it is gone and the true-empty state is shown.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search grants…")).toBeNull();
      expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
    });
  });

  it("renders the destructive Alert when the grants query errors", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<GrantsListPage />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(screen.getByText("Unable to load grants.")).toBeInTheDocument();
    expect(screen.queryByText("No grants found.")).not.toBeInTheDocument();
  });

  it("renders DataTable skeleton rows while grants are loading", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("renders the filter controls when grants exist", () => {
    // Seed one grant so the FilterBar is visible (true-empty hides it).
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(screen.getByPlaceholderText("Search grants…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter funder" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter threshold" })).toBeInTheDocument();
  });

  it("opens the create dialog when Add grant button is clicked", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    const addGrantButton = screen.getByRole("button", { name: "Add grant" });
    expect(addGrantButton).toBeInTheDocument();
    fireEvent.click(addGrantButton);

    expect(screen.getByTestId("new-grant-dialog")).toBeInTheDocument();
    expect(screen.getByText("Create grant")).toBeInTheDocument();
    expect(
      screen.getByText("Set up a new grant record and connect it to the right funder."),
    ).toBeInTheDocument();
  });

  it("closes the dialog when Close dialog button is clicked", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add grant" }));
    expect(screen.getByTestId("new-grant-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() => {
      expect(screen.queryByTestId("new-grant-dialog")).not.toBeInTheDocument();
    });
  });

  it("drives filter state when search, status, funder, and threshold change", async () => {
    // Seed one grant so the FilterBar is visible (true-empty hides it).
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });

    // Filter selects are now Radix Select comboboxes
    fireEvent.click(screen.getByRole("combobox", { name: "Filter status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Filter funder" }));
    fireEvent.click(await screen.findByRole("option", { name: "Acme Foundation" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Filter threshold" }));
    fireEvent.click(await screen.findByRole("option", { name: "80%" }));

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "STEM",
          status: "active",
          funderId: "funder-1",
          threshold: "80",
        }),
      );
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "search",
      filter_count: 1,
      filter_keys: ["search"],
      has_search: true,
      record_type: "grants",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "threshold",
      filter_count: 4,
      filter_keys: ["funderId", "search", "status", "threshold"],
      has_search: true,
      record_type: "grants",
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Filter status" }));
    fireEvent.click(await screen.findByRole("option", { name: "All statuses" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Filter funder" }));
    fireEvent.click(await screen.findByRole("option", { name: "All funders" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Filter threshold" }));
    fireEvent.click(await screen.findByRole("option", { name: "All thresholds" }));

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.not.objectContaining({
          status: expect.any(String),
          funderId: expect.any(String),
          threshold: expect.any(String),
        }),
      );
    });
  });

  it("hydrates the filters from route search params on load", async () => {
    hoisted.setRouteSearch({
      search: "STEM",
      status: "active",
      funderId: "funder-1",
      threshold: "90",
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "STEM",
          status: "active",
          funderId: "funder-1",
          threshold: "90",
        }),
      );
    });

    expect(screen.getByPlaceholderText("Search grants…")).toHaveValue("STEM");
    expect(screen.getByRole("combobox", { name: "Filter status" })).toHaveValue("active");
    expect(screen.getByRole("combobox", { name: "Filter funder" })).toHaveValue("funder-1");
    expect(screen.getByRole("combobox", { name: "Filter threshold" })).toHaveValue("90");
  });

  it("marks a matching saved segment active when the route search hydrates from a bookmarked URL", async () => {
    hoisted.setRouteSearch({
      search: "STEM",
      status: "active",
      funderId: "funder-1",
      threshold: "90",
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Active STEM grants",
          filters: { search: "STEM", status: "active", funderId: "funder-1", threshold: "90" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    const chip = await screen.findByRole("button", { name: "Active STEM grants" });
    expect(chip).toHaveClass("bg-primary");

    fireEvent.click(chip);

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: {},
        }),
      );
    });
  });

  it("matches saved segments with missing filters against empty route filters", async () => {
    hoisted.mockUseGrants.mockReturnValue({
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

    render(<GrantsListPage />);

    expect(await screen.findByRole("button", { name: "Everything" })).toHaveClass("bg-primary");
  });

  it("uses an org-scoped segment storage key when org id is available", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      orgId: "org-123",
      isLoading: false,
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(hoisted.mockUseSavedSegments).toHaveBeenCalledWith("gp-grant-segments:org-123", {
      recordType: "grants",
    });
  });

  it("updates the visible filters when the route search changes externally", async () => {
    hoisted.setRouteSearch({});
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<GrantsListPage />);

    await act(async () => {
      hoisted.setRouteSearch({
        search: "STEM",
        status: "active",
        funderId: "funder-1",
        threshold: "100",
      });
      rerender(<GrantsListPage />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search grants…")).toHaveValue("STEM");
      expect(screen.getByRole("combobox", { name: "Filter status" })).toHaveValue("active");
      expect(screen.getByRole("combobox", { name: "Filter funder" })).toHaveValue("funder-1");
      expect(screen.getByRole("combobox", { name: "Filter threshold" })).toHaveValue("100");
    });
  });

  it("syncs filter interactions into route search params for bookmarkable URLs", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: true,
          search: { search: "STEM" },
        }),
      );
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Filter status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: true,
          search: {
            search: "STEM",
            status: "active",
          },
        }),
      );
    });
  });

  it("removes status, funder, and threshold params when their filters are reset to all", async () => {
    hoisted.setRouteSearch({
      status: "active",
      funderId: "funder-1",
      threshold: "80",
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Filter status" }), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter funder" }), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter threshold" }), {
      target: { value: "all" },
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          replace: true,
          search: {},
        }),
      );
    });
  });

  it("shows Add grant button for admin role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<GrantsListPage />);

    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
  });

  it("shows Add grant button for editor role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<GrantsListPage />);

    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
  });

  it("hides Add grant button for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<GrantsListPage />);

    expect(screen.queryByRole("button", { name: "Add grant" })).not.toBeInTheDocument();
  });

  it("hides the sample-data CTA for viewer role but still shows the video trigger", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<GrantsListPage />);

    expect(screen.queryByTestId("explore-sample-data-cta-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("video-dialog-add-grant-allocate")).toBeInTheDocument();
  });

  it("uses grant edit permissions instead of role alone for Add grant", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { grants: "edit" },
      isLoading: false,
    });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });

    render(<GrantsListPage />);

    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
  });

  it("does not render the saved-segments section when there are no segments and user is a viewer", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    expect(screen.queryByText("Saved segments")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save current filters" })).not.toBeInTheDocument();
  });

  it("renders saved segment chips when segments exist", () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Active STEM grants",
          filters: { search: "STEM", status: "active", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi
        .fn()
        .mockReturnValue({ search: "STEM", status: "active", funderId: "", threshold: "" }),
    });

    render(<GrantsListPage />);

    expect(screen.getByRole("button", { name: "Active STEM grants" })).toBeInTheDocument();
  });

  it("shows Save current filters button for admin only when at least one filter is active", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    // No filters active — button should not appear
    expect(screen.queryByRole("button", { name: "Save current filters" })).not.toBeInTheDocument();

    // Activate a filter
    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });

    expect(screen.getByRole("button", { name: "Save current filters" })).toBeInTheDocument();
  });

  it("applying a saved segment updates the filter state", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi.fn().mockReturnValue({
      search: "Green",
      status: "awarded",
      funderId: "funder-42",
      threshold: "90",
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Green Awarded",
          filters: { search: "Green", status: "awarded", funderId: "funder-42", threshold: "90" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Green Awarded" }));

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "Green",
          status: "awarded",
          funderId: "funder-42",
          threshold: "90",
        }),
      );
    });
  });

  it("leaves filters alone when a saved segment lookup returns nothing", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi.fn().mockReturnValue(undefined);
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Missing saved filters",
          filters: { search: "Archived", status: "active", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Missing saved filters" }));

    expect(applySegment).toHaveBeenCalledWith("seg-1");
    expect(hoisted.mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking an active segment chip deactivates/clears the segment", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi.fn().mockReturnValue({
      search: "Green",
      status: "awarded",
      funderId: "",
      threshold: "",
    });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Green",
          filters: { search: "Green", status: "awarded", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    const chip = screen.getByRole("button", { name: "Green" });
    fireEvent.click(chip); // apply
    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: { search: "Green", status: "awarded" } }),
      );
    });

    fireEvent.click(chip); // deactivate (clicking active segment clears filters back to empty)
    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: {} }),
      );
    });
  });

  it("deletes a saved segment when the delete button is clicked", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const deleteSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "To Delete",
          filters: { search: "", status: "", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment,
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    // Clicking the delete icon now opens the ConfirmDialog.
    const deleteButton = screen.getByRole("button", { name: "Delete segment To Delete" });
    fireEvent.click(deleteButton);

    // Confirm in the ConfirmDialog.
    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    expect(deleteSegment).toHaveBeenCalledWith("seg-1");
  });

  it("opens Save segment dialog, accepts a name, and calls saveSegment", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "Tech Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "Tech" },
    });

    const saveButton = screen.getByRole("button", { name: "Save current filters" });
    fireEvent.click(saveButton);

    const segmentNameInput = await screen.findByPlaceholderText("e.g. Active STEM grants");
    fireEvent.change(segmentNameInput, { target: { value: "My Tech Segment" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });

    expect(saveSegment).toHaveBeenCalledWith(
      "My Tech Segment",
      expect.objectContaining({ search: "Tech" }),
    );
  });

  it("saves a segment via Enter key in the segment name input", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const input = await screen.findByPlaceholderText("e.g. Active STEM grants");
    fireEvent.change(input, { target: { value: "STEM segment" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(saveSegment).toHaveBeenCalledWith(
      "STEM segment",
      expect.objectContaining({ search: "STEM" }),
    );
  });

  it("does not call saveSegment when Enter is pressed with an empty segment name", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const saveSegment = vi.fn();
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [],
      saveSegment,
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save current filters" }));

    const input = await screen.findByPlaceholderText("e.g. Active STEM grants");
    // Leave name empty, press Enter
    fireEvent.keyDown(input, { key: "Enter" });

    expect(saveSegment).not.toHaveBeenCalled();
  });

  it("applying a segment with empty status clears the status filter", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "Test", status: "", funderId: "", threshold: "" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "All statuses",
          filters: { search: "Test", status: "", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "All statuses" }));

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Test" }),
      );
      // status should not be in query when empty
      expect(hoisted.mockUseGrants).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
    });
  });

  it("fills missing optional saved-segment fields with empty filters", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi.fn().mockReturnValue({ search: "Test", status: "active" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Partial filters",
          filters: { search: "Test", status: "active" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Partial filters" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "Test", status: "active" },
        }),
      );
    });
  });

  it("deactivates a segment when the active chip is clicked again", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "Active", status: "active", funderId: "", threshold: "" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Active",
          filters: { search: "Active", status: "active", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    render(<GrantsListPage />);

    const chip = screen.getByRole("button", { name: "Active" });
    fireEvent.click(chip); // apply

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Active" }),
      );
    });

    fireEvent.click(chip); // deactivate

    await waitFor(() => {
      expect(hoisted.mockUseGrants).toHaveBeenCalledWith(
        expect.not.objectContaining({ search: "Active" }),
      );
    });
  });

  it("reapplies a saved segment after external route changes clear its active state", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    const applySegment = vi
      .fn()
      .mockReturnValue({ search: "Active", status: "active", funderId: "", threshold: "" });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        {
          id: "seg-1",
          name: "Active",
          filters: { search: "Active", status: "active", funderId: "", threshold: "" },
        },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment,
    });

    const { rerender } = render(<GrantsListPage />);
    const chip = screen.getByRole("button", { name: "Active" });

    fireEvent.click(chip);

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "Active", status: "active" },
        }),
      );
    });

    await act(async () => {
      hoisted.setRouteSearch({ search: "STEM" });
      rerender(<GrantsListPage />);
    });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "Active", status: "active" },
        }),
      );
    });
  });

  it("does not resurrect stale draft filters when the URL revisits an earlier route state", async () => {
    hoisted.setRouteSearch({});
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "STEM" },
    });
    expect(screen.getByPlaceholderText("Search grants…")).toHaveValue("STEM");

    await act(async () => {
      hoisted.setRouteSearch({ search: "reserve" });
      rerender(<GrantsListPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search grants…")).toHaveValue("reserve");
    });

    await act(async () => {
      hoisted.setRouteSearch({});
      rerender(<GrantsListPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search grants…")).toHaveValue("");
    });
  });

  it("marks a saved grant segment with undefined filters active against empty route filters", async () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [{ id: "seg-1", name: "Everything", filters: undefined }],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn(),
    });

    render(<GrantsListPage />);

    expect(await screen.findByRole("button", { name: "Everything" })).toHaveClass("bg-primary");
  });

  it("does nothing when a saved segment returns no filters", () => {
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseSavedSegments.mockReturnValue({
      segments: [
        { id: "seg-1", name: "Broken Segment", filters: { search: "broken", status: "" } },
      ],
      saveSegment: vi.fn(),
      deleteSegment: vi.fn(),
      applySegment: vi.fn().mockReturnValue(undefined),
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Broken Segment" }));

    expect(hoisted.mockNavigate).not.toHaveBeenCalled();
  });

  it("opportunity without officialUrl does not render an Apply link", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-2",
            title: "No-URL Grant",
            agencyName: "NEA",
            opportunityNumber: "NEA-001",
            officialUrl: null,
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(screen.getByText("No-URL Grant")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("opportunity with unsafe officialUrl does not render an Apply link", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-unsafe-url",
            title: "Unsafe URL Grant",
            agencyName: "NEA",
            opportunityNumber: "NEA-002",
            officialUrl: "javascript:alert(1)",
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(screen.getByText("Unsafe URL Grant")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("opportunity with malformed officialUrl uses federal fallbacks without an Apply link", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-malformed-url",
            title: "Malformed URL Grant",
            officialUrl: "not a url",
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(screen.getByText("Malformed URL Grant")).toBeInTheDocument();
    expect(screen.getByText("Federal")).toBeInTheDocument();
    expect(screen.getByText("Grants.gov")).toBeInTheDocument();
    expect(screen.getByText("No deadline listed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("viewer on Opportunities tab sees no Save or Add to pipeline buttons", async () => {
    const user = userEvent.setup();
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-3",
            title: "Viewer Opportunity",
            agencyName: "DoE",
            opportunityNumber: "DOE-001",
            officialUrl: "https://www.grants.gov/opp-3",
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to pipeline" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apply" })).toBeInTheDocument();
  });

  it("Save button on opportunity calls saveOpportunity mutate", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-4",
            title: "Saveable Grant",
            agencyName: "NIH",
            opportunityNumber: "NIH-001",
            officialUrl: null,
            closeDate: "2026-10-01T00:00:00.000Z",
            awardCeilingCents: 100000,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunityMutations.mockReturnValue({
      saveOpportunity: { mutate: save },
      convertOpportunity: { mutate: vi.fn() },
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledWith(
      { opportunityId: "opp-4", data: {} },
      { onError: expect.any(Function) },
    );
  });

  it("surfaces an error alert when saving an opportunity fails", async () => {
    const user = userEvent.setup();
    const save = vi.fn((_vars, opts) => opts?.onError?.(new Error("Save failed")));
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-5",
            title: "Failing Save Grant",
            agencyName: "NIH",
            opportunityNumber: "NIH-002",
            officialUrl: null,
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunityMutations.mockReturnValue({
      saveOpportunity: { mutate: save },
      convertOpportunity: { mutate: vi.fn() },
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when converting an opportunity fails without an Error", async () => {
    const user = userEvent.setup();
    const convert = vi.fn((_vars, opts) => opts?.onError?.("nope"));
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunitySearch.mockReturnValue({
      data: {
        data: [
          {
            id: "opp-6",
            title: "Failing Convert Grant",
            agencyName: "NIH",
            opportunityNumber: "NIH-003",
            officialUrl: null,
            closeDate: null,
            awardCeilingCents: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantOpportunityMutations.mockReturnValue({
      saveOpportunity: { mutate: vi.fn() },
      convertOpportunity: { mutate: convert },
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    expect(screen.getByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("surfaces an error alert when creating a manual opportunity fails", async () => {
    const user = userEvent.setup();
    const createOpportunity = vi.fn((_vars, opts) => opts?.onError?.(new Error("Create failed")));
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: createOpportunity,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add manual opportunity" }));
    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Doomed Opportunity" },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Doomed Source" },
    });
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Create failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when manual opportunity creation fails without an Error", async () => {
    const user = userEvent.setup();
    const createOpportunity = vi.fn((_vars, opts) => opts?.onError?.("nope"));
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: createOpportunity,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add manual opportunity" }));
    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Doomed Opportunity" },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Doomed Source" },
    });
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(screen.getByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("paginates the grant portfolio via the Next control", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: null,
            status: "active",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
        total: 60,
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    const pagination = screen.getByTestId("grants-pagination");
    expect(within(pagination).getByText("Page 1 of 3")).toBeInTheDocument();
    await user.click(within(pagination).getByRole("button", { name: "Next" }));

    expect(hoisted.mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ".",
        search: expect.objectContaining({ page: 2 }),
      }),
    );
  });

  it("paginates tracked opportunities via the Next control", async () => {
    const user = userEvent.setup();
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseGrantOpportunities.mockReturnValue({
      data: { data: [], total: 60 },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("tab", { name: "Tracked/imported" }));

    const pagination = screen.getByTestId("tracked-opportunities-pagination");
    await user.click(within(pagination).getByRole("button", { name: "Next" }));

    expect(hoisted.mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ".",
        search: expect.objectContaining({ trackedPage: 2 }),
      }),
    );
  });

  it("closes the manual opportunity dialog after a successful create", async () => {
    const user = userEvent.setup();
    const createOpportunity = vi.fn((_vars, opts) => opts?.onSuccess?.());
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseCreateGrantOpportunity.mockReturnValue({
      mutate: createOpportunity,
      isPending: false,
    });

    render(<GrantsListPage />);
    await user.click(screen.getByRole("tab", { name: "Opportunities" }));
    await user.click(screen.getByRole("button", { name: "Add manual opportunity" }));
    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Renewed Resilience Fund" },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Renewed Source" },
    });
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(createOpportunity).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByLabelText("Opportunity title")).not.toBeInTheDocument();
    });
  });

  it("status column renders a gs-* badge variant matching the grant status", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    const awardedBadge = container.querySelector("[data-variant='gs-awarded']");
    expect(awardedBadge).toBeInTheDocument();
  });

  it("amount column uses font-mono class", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: null,
            status: "active",
            amountCents: 250000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    const amountCell = container.querySelector(".font-mono");
    expect(amountCell).toBeInTheDocument();
    expect(amountCell?.textContent).toContain("$2,500");
  });

  it("deadline column uses font-mono and formatUtcCalendarDate", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: null,
            status: "active",
            amountCents: null,
            applicationDeadline: "2026-09-15T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    // formatUtcCalendarDate("2026-09-15T00:00:00.000Z") => "Sep 15, 2026"
    expect(container.querySelector(".font-mono.text-muted-foreground")).toBeInTheDocument();
    expect(screen.getByText("Sep 15, 2026")).toBeInTheDocument();
  });

  it("clears grant filters when the All options are selected", async () => {
    hoisted.setRouteSearch({
      search: "STEM",
      status: "active",
      funderId: "funder-1",
      threshold: "90",
    });
    hoisted.mockUseGrants.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    fireEvent.click(screen.getByRole("combobox", { name: "Filter status" }));
    fireEvent.click(await screen.findByRole("option", { name: "All statuses" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Filter funder" }));
    fireEvent.click(await screen.findByRole("option", { name: "All funders" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Filter threshold" }));
    fireEvent.click(await screen.findByRole("option", { name: "All thresholds" }));

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { search: "STEM" },
        }),
      );
    });
  });
});

// True-empty state chrome gating (Wave 143)
describe("GrantsListPage — filter chrome gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setRouteSearch({});
  });

  it("hides the portfolio FilterBar in the true-empty state (no grants, no active filter)", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    // Switch to portfolio tab first so the FilterBar is in view.
    fireEvent.click(screen.getByRole("tab", { name: "Portfolio" }));

    expect(screen.queryByPlaceholderText("Search grants…")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter status" })).not.toBeInTheDocument();
    // The empty state heading must still be present.
    expect(screen.getByText("Your grants live here")).toBeInTheDocument();
  });

  it("shows the portfolio FilterBar when grants exist", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Portfolio" }));

    expect(screen.getByPlaceholderText("Search grants…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter status" })).toBeInTheDocument();
  });

  it("shows the portfolio FilterBar when an active filter is set even with no results", () => {
    hoisted.setRouteSearch({ search: "STEM" });
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Portfolio" }));

    // Active filter → FilterBar must stay visible so user can clear it.
    expect(screen.getByPlaceholderText("Search grants…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter status" })).toBeInTheDocument();
  });

  it("search grants input has an accessible name", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "STEM Access Fund",
            funder: { id: "funder-1", name: "Acme Foundation" },
            status: "awarded",
            amountCents: 500000,
            applicationDeadline: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantsListPage />);

    expect(screen.getByRole("textbox", { name: /search grants/i })).toBeInTheDocument();
  });

  it("shows a Retry button when the grants query errors and clicking it calls refetch", () => {
    const mockRefetch = vi.fn();
    hoisted.mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    render(<GrantsListPage />);

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
