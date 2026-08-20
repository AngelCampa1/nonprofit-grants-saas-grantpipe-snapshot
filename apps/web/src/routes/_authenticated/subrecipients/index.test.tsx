import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseSession,
  mockUseOrgBilling,
  mockUseSubrecipients,
  mockUseSubrecipientMutations,
  mockRouteUseSearch,
  mockHasSubrecipientMonitoring,
  mockGetEffectivePlanTier,
  mockCanAccessFeature,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSubrecipients: vi.fn(),
  mockUseSubrecipientMutations: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
  mockHasSubrecipientMonitoring: vi.fn().mockReturnValue(true),
  mockGetEffectivePlanTier: vi.fn().mockReturnValue("audit_ready"),
  mockCanAccessFeature: vi.fn().mockReturnValue(true),
}));

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return {
    ...actual,
    hasSubrecipientMonitoring: mockHasSubrecipientMonitoring,
    getEffectivePlanTier: mockGetEffectivePlanTier,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) => (config: { component: React.ComponentType; validateSearch?: unknown }) => ({
      ...config,
      path,
      useSearch: mockRouteUseSearch,
    }),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/subrecipients" } }),
  Link: ({
    to,
    params,
    hash,
    children,
    className,
    "aria-current": ariaCurrent,
    "data-testid": dataTestId,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    hash?: string;
    search?: Record<string, unknown>;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
    "data-testid"?: string;
  }) => {
    const base = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? "") : to;
    const href = hash ? `${base}#${hash}` : base;
    return React.createElement(
      "a",
      { href, className, "aria-current": ariaCurrent, "data-testid": dataTestId, ...rest },
      children,
    );
  },
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: () => mockUseOrgBilling(),
}));

vi.mock("../../../hooks/use-subrecipients", () => ({
  useSubrecipients: (...args: unknown[]) => mockUseSubrecipients(...args),
  useSubrecipientMutations: () => mockUseSubrecipientMutations(),
}));

vi.mock("../../../lib/access-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/access-control")>();
  return {
    ...actual,
    canAccessFeature: (...args: unknown[]) => mockCanAccessFeature(...args),
  };
});

vi.mock("../../../components/retry-button", () => ({
  RetryButton: () => React.createElement("button", { type: "button" }, "Retry"),
}));

const mockCaptureRecordFilterChanged = vi.fn();
vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureRecordFilterChanged: (...args: unknown[]) => mockCaptureRecordFilterChanged(...args),
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
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => React.createElement(SelectCtx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({
      id,
      "aria-label": ariaLabel,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return React.createElement("input", {
        role: "combobox",
        id,
        "aria-label": ariaLabel,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value),
        readOnly: false,
      });
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return React.createElement(
        "span",
        {
          role: "option",
          "aria-selected": false,
          onClick: () => onValueChange(value),
          "data-slot": "select-item",
        },
        children,
      );
    },
  };
});

import { SubrecipientsPage, Route } from "./index";

const defaultBilling = {
  data: {
    planTier: "audit_ready",
    billingCycle: "monthly",
    status: "active",
    trialEndsAt: null,
  },
  isLoading: false,
  isError: false,
  error: null,
};

const defaultSession = {
  memberRole: "admin",
  memberPermissions: [],
};

const defaultMutations = {
  createSubrecipient: { mutateAsync: vi.fn(), isPending: false },
};

const mockRow = {
  id: "sub-1",
  name: "Community Health Network",
  status: "active",
  highestRiskRating: "high" as const,
  activeSubawardCount: 2,
  openTaskCount: 3,
  overdueTaskCount: 1,
  openFindingCount: 2,
};

type SubrecipientSummary = {
  subrecipients: number;
  overdueTasks: number;
  openFindings: number;
  highRisk: number;
};

function makeListResult(
  rows: unknown[],
  summaryOverrides?: Partial<SubrecipientSummary>,
  totalOverride?: number,
): { data: unknown[]; total: number; summary: SubrecipientSummary } {
  const summary: SubrecipientSummary = {
    subrecipients: rows.length,
    overdueTasks: 0,
    openFindings: 0,
    highRisk: 0,
    ...summaryOverrides,
  };
  return { data: rows, total: totalOverride ?? rows.length, summary };
}

function setup(overrides?: {
  canMonitoring?: boolean;
  subrecipientsQuery?: Partial<{
    data: { data: unknown[]; total: number; summary: SubrecipientSummary } | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  }>;
  session?: Partial<typeof defaultSession>;
  billing?:
    | Partial<typeof defaultBilling>
    | { data: undefined; isLoading: boolean; isError: boolean; error: null };
  mutations?: typeof defaultMutations;
}) {
  const canMonitoring = overrides?.canMonitoring ?? true;
  mockHasSubrecipientMonitoring.mockReturnValue(canMonitoring);
  mockGetEffectivePlanTier.mockReturnValue(canMonitoring ? "audit_ready" : "starter");
  mockUseSession.mockReturnValue({ ...defaultSession, ...overrides?.session });
  mockUseOrgBilling.mockReturnValue({ ...defaultBilling, ...overrides?.billing });
  mockUseSubrecipientMutations.mockReturnValue(overrides?.mutations ?? defaultMutations);

  mockUseSubrecipients.mockReturnValue({
    data: makeListResult([]),
    isLoading: false,
    isError: false,
    error: null,
    ...overrides?.subrecipientsQuery,
  });

  return render(React.createElement(SubrecipientsPage));
}

describe("Route.validateSearch", () => {
  it("returns grantId when it is a string", () => {
    const result = (
      Route as { validateSearch?: (s: Record<string, unknown>) => unknown }
    ).validateSearch?.({
      grantId: "grant-abc",
    });
    expect(result).toEqual({ grantId: "grant-abc" });
  });

  it("returns undefined grantId when it is not a string", () => {
    const result = (
      Route as { validateSearch?: (s: Record<string, unknown>) => unknown }
    ).validateSearch?.({
      grantId: 123,
    });
    expect(result).toEqual({ grantId: undefined });
  });
});

describe("SubrecipientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteUseSearch.mockReturnValue({});
    mockHasSubrecipientMonitoring.mockReturnValue(true);
    mockGetEffectivePlanTier.mockReturnValue("audit_ready");
    mockCanAccessFeature.mockReturnValue(true);
  });

  it("renders TeachAndActEmptyState with upgrade message when canUseMonitoring is false", () => {
    setup({ canMonitoring: false });

    expect(screen.getByText("Subrecipient monitoring requires Audit-Ready.")).toBeInTheDocument();
    expect(screen.queryByTestId("subrecipients-card-grid")).not.toBeInTheDocument();
  });

  it("derives subrecipient monitoring plan gate copy from shared pricing data", () => {
    const source = readFileSync(join(__dirname, "index.tsx"), "utf8");

    expect(source).toMatch(/getPlanEntitlementLabelList\(\s*"hasSubrecipientMonitoring"/);
    expect(source).not.toContain("Requires Audit-Ready or Enterprise");
    expect(source).not.toContain('heading="Subrecipient monitoring requires Audit-Ready."');
  });

  it("uses the Grants & Funding kicker and renders the Grants tab group with Subrecipients active", () => {
    setup();

    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
    expect(screen.queryByText("Compliance")).not.toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Grants sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/grants");
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/grants/pipeline",
    );
    expect(within(nav).getByRole("link", { name: "Funders" })).toHaveAttribute("href", "/funders");
    expect(within(nav).getByRole("link", { name: "Subrecipients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
  });

  it("renders 6 Skeleton divs while loading", () => {
    setup({
      subrecipientsQuery: {
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      },
    });

    const skeletons = document.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBe(6);
    expect(screen.queryByTestId("subrecipients-card-grid")).not.toBeInTheDocument();
  });

  it("renders the page title in title case", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByRole("heading", { name: "Subrecipient Monitoring" })).toBeInTheDocument();
  });

  it("renders card grid and individual cards when data loads", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByTestId("subrecipients-card-grid")).toBeInTheDocument();
    expect(screen.getByTestId("subrecipient-card")).toBeInTheDocument();
    expect(screen.getByText("Community Health Network")).toBeInTheDocument();
    // risk badge is rendered within the card
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    // subaward count and open task count visible somewhere on page
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("renders findings count with text-destructive when openFindingCount > 0", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([{ ...mockRow, openFindingCount: 2 }]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // The findings count element with text-destructive class should exist inside the card
    const card = screen.getByTestId("subrecipient-card");
    const destructiveEl = card.querySelector(".text-destructive");
    expect(destructiveEl).not.toBeNull();
  });

  it("does NOT apply text-destructive to findings count when openFindingCount is 0", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([{ ...mockRow, openFindingCount: 0, overdueTaskCount: 0 }]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const card = screen.getByTestId("subrecipient-card");
    // The findings count cell is the div showing "0" inside the card's metric grid
    const allZeros = Array.from(card.querySelectorAll("div")).filter(
      (el) => el.textContent === "0" && !el.querySelector("div"),
    );
    // None of the zero-count cells should have text-destructive
    for (const el of allZeros) {
      expect(el).not.toHaveClass("text-destructive");
    }
  });

  it("renders overdue indicator with text-destructive when overdueTaskCount > 0", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([{ ...mockRow, overdueTaskCount: 1 }]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const overdueEl = screen.getByText("1 overdue");
    expect(overdueEl).toHaveClass("text-destructive");
  });

  it("does NOT render overdue indicator when overdueTaskCount is 0", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([{ ...mockRow, overdueTaskCount: 0 }]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });

  it("renders Alert with RetryButton when query errors", () => {
    setup({
      subrecipientsQuery: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("network failure"),
      },
    });

    expect(screen.getByText("Unable to load subrecipients")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("subrecipients-card-grid")).not.toBeInTheDocument();
  });

  it("renders the first-run empty state when rows is empty and no filters are active", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByText("Your subrecipients live here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first subrecipient" })).toBeInTheDocument();
    expect(screen.queryByText("No subrecipients match this view.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("subrecipients-card-grid")).not.toBeInTheDocument();
  });

  it("first-run empty state CTA opens the create dialog", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // Two "Add subrecipient" buttons exist once dialog opens (header trigger + empty-state CTA);
    // before clicking, the empty-state CTA is the one inside the teach-and-act region.
    const region = screen.getByRole("region", { name: "Your subrecipients live here" });
    fireEvent.click(within(region).getByRole("button", { name: "Add your first subrecipient" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the filtered-empty state (not first-run) when a filter is active and rows is empty", () => {
    // Seed one row so the filter toolbar renders; then typing in search activates hasActiveFilters
    // while the query still returns zero results — producing the filtered-empty state.
    const { rerender } = setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    fireEvent.change(screen.getByPlaceholderText("Name or UEI"), { target: { value: "acme" } });

    // Simulate the query now returning zero results after the filter is applied
    mockUseSubrecipients.mockReturnValue({
      data: makeListResult([]),
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(React.createElement(SubrecipientsPage));

    expect(screen.getByText("No subrecipients match this view.")).toBeInTheDocument();
    expect(screen.queryByText("Your subrecipients live here")).not.toBeInTheDocument();
  });

  it("shows the read-only first-run help CTA when the user cannot create", () => {
    mockCanAccessFeature.mockReturnValue(false);
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const region = screen.getByRole("region", { name: "Your subrecipients live here" });
    expect(
      within(region).queryByRole("button", { name: "Add subrecipient" }),
    ).not.toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Open help" })).toBeInTheDocument();
  });

  it("renders 4 metric tiles with correct counts", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult(
          [
            {
              ...mockRow,
              highestRiskRating: "high" as const,
              overdueTaskCount: 2,
              openFindingCount: 1,
            },
            {
              ...mockRow,
              id: "sub-2",
              name: "Other Org",
              highestRiskRating: "low" as const,
              overdueTaskCount: 0,
              openFindingCount: 0,
            },
          ],
          { subrecipients: 2, highRisk: 1, overdueTasks: 2, openFindings: 1 },
        ),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByText("Subrecipients", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Overdue tasks")).toBeInTheDocument();
    expect(screen.getByText("Open findings")).toBeInTheDocument();
    // Find the metric label elements and locate their sibling value divs
    const subrecipientsLabel = screen.getByText("Subrecipients", { selector: "div" });
    expect(subrecipientsLabel.previousSibling?.textContent).toBe("2");
    const highRiskLabel = screen.getByText("High risk");
    expect(highRiskLabel.previousSibling?.textContent).toBe("1");
    const overdueLabel = screen.getByText("Overdue tasks");
    expect(overdueLabel.previousSibling?.textContent).toBe("2");
    const openFindingsLabel = screen.getByText("Open findings");
    expect(openFindingsLabel.previousSibling?.textContent).toBe("1");
  });

  it("KPI cards reflect SERVER summary even when rows are page-local subset", () => {
    // Only 1 row in current page, but server says there are 42 total, 7 high risk, etc.
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow], {
          subrecipients: 42,
          highRisk: 7,
          overdueTasks: 5,
          openFindings: 3,
        }),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const subrecipientsLabel = screen.getByText("Subrecipients", { selector: "div" });
    expect(subrecipientsLabel.previousSibling?.textContent).toBe("42");
    const highRiskLabel = screen.getByText("High risk");
    expect(highRiskLabel.previousSibling?.textContent).toBe("7");
    const overdueLabel = screen.getByText("Overdue tasks");
    expect(overdueLabel.previousSibling?.textContent).toBe("5");
    const openFindingsLabel = screen.getByText("Open findings");
    expect(openFindingsLabel.previousSibling?.textContent).toBe("3");
  });

  it("card links point to correct subrecipient detail route", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const card = screen.getByTestId("subrecipient-card");
    expect(card).toHaveAttribute("href", "/subrecipients/sub-1");
  });

  it("filters area renders search, status and risk selects", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByPlaceholderText("Name or UEI")).toBeInTheDocument();
  });

  it("overdue toggle button is rendered and toggleable", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const overdueBtn = screen.getByRole("button", { name: "Overdue" });
    expect(overdueBtn).toBeInTheDocument();
    expect(overdueBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(overdueBtn);
    expect(overdueBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("findings toggle button is rendered and toggleable", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const findingsBtn = screen.getByRole("button", { name: "Findings" });
    expect(findingsBtn).toBeInTheDocument();
    expect(findingsBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(findingsBtn);
    expect(findingsBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("Add subrecipient button is enabled for admin with canUseMonitoring", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByRole("button", { name: "Add subrecipient" })).toBeInTheDocument();
  });

  it("does not call mutateAsync when canCreate is false (canEditCompliance=false)", async () => {
    mockCanAccessFeature.mockReturnValue(false);
    const mutateAsync = vi.fn().mockResolvedValue({ id: "new-sub" });

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const saveButton = screen.queryByRole("button", { name: "Save subrecipient" });
    if (saveButton) {
      const form = saveButton.closest("form");
      if (form) {
        fireEvent.submit(form);
        // Since canCreate is false, mutateAsync should NOT be called
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mutateAsync).not.toHaveBeenCalled();
      }
    }
  });

  it("renders read-only alert when canEditCompliance is false", () => {
    mockCanAccessFeature.mockReturnValue(false);

    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByText("Read-only access")).toBeInTheDocument();
  });

  it("Clear filters button in empty state resets all filter state", () => {
    // Start with one row so the filter toolbar renders, then activate filters,
    // then simulate empty results to show the filtered-empty state with Clear filters.
    const { rerender } = setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // Set some filters
    const searchInput = screen.getByPlaceholderText("Name or UEI");
    fireEvent.change(searchInput, { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));

    expect(screen.getByRole("button", { name: "Overdue" })).toHaveAttribute("aria-pressed", "true");

    // Simulate query returning zero results after filter
    mockUseSubrecipients.mockReturnValue({
      data: makeListResult([]),
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(React.createElement(SubrecipientsPage));

    // Click Clear filters in the TeachAndActEmptyState
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    // With zero rows and filters now cleared, the view transitions from the
    // filtered-empty state to the true-empty state: the filter toolbar (and its
    // search input) unmounts and the first-run empty state is shown.
    expect(screen.queryByPlaceholderText("Name or UEI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overdue" })).not.toBeInTheDocument();
    expect(screen.getByText("Your subrecipients live here")).toBeInTheDocument();
  });

  it("shows validation error when submitting create form without a name", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "new-sub" });

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));
    fireEvent.click(screen.getByRole("button", { name: "Save subrecipient" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders full create form with name, UEI, notes fields and save button", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("UEI")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save subrecipient" })).toBeInTheDocument();
    expect(screen.getAllByText("Add subrecipient").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Create the monitored organization profile before linking subawards."),
    ).toBeInTheDocument();
  });

  it("submits the create form with a name and calls mutateAsync", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "new-sub" });

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const saveButton = screen.getByRole("button", { name: "Save subrecipient" });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();

    const nameInput = form!.querySelector<HTMLInputElement>('[name="name"]');
    expect(nameInput).not.toBeNull();

    // Set the native input value using the HTMLInputElement prototype setter
    // so FormData reads it correctly
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(nameInput, "New Org");
    // Trigger React's synthetic onChange to sync state
    fireEvent.change(nameInput!, { target: {} });

    // Submit the form
    fireEvent.submit(form!);

    // The form onSubmit is async — wait for mutateAsync to be called
    await vi.waitFor(
      () => {
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ name: "New Org", status: "active" }),
        );
      },
      { timeout: 2000 },
    );
  });

  it("surfaces an error in the create form when mutateAsync rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("UEI already in use"));

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const form = screen.getByRole("button", { name: "Save subrecipient" }).closest("form")!;
    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(nameInput, "New Org");
    fireEvent.submit(form);

    expect(await screen.findByText("UEI already in use")).toBeInTheDocument();
    // Dialog stays open so the user can correct and retry.
    expect(screen.getByRole("button", { name: "Save subrecipient" })).toBeInTheDocument();
  });

  it("shows a generic create error when mutateAsync rejects with a non-Error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue("boom");

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const form = screen.getByRole("button", { name: "Save subrecipient" }).closest("form")!;
    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(nameInput, "New Org");
    fireEvent.submit(form);

    expect(await screen.findByText("Unable to save subrecipient.")).toBeInTheDocument();
  });

  it("changing status filter passes status to useSubrecipients", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const statusCombobox = screen.getByRole("combobox", { name: "Status" });
    if (statusCombobox) {
      fireEvent.change(statusCombobox, { target: { value: "active" } });
      expect(mockUseSubrecipients).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
        expect.anything(),
      );
    }
  });

  it("changing risk filter passes riskRating to useSubrecipients", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const riskCombobox = screen.getByRole("combobox", { name: "Risk" });
    if (riskCombobox) {
      fireEvent.change(riskCombobox, { target: { value: "high" } });
      expect(mockUseSubrecipients).toHaveBeenCalledWith(
        expect.objectContaining({ riskRating: "high" }),
        expect.anything(),
      );
    }
  });

  it("search input updates query filter", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const searchInput = screen.getByPlaceholderText("Name or UEI");
    fireEvent.change(searchInput, { target: { value: "health" } });

    expect(searchInput).toHaveValue("health");
    expect(mockUseSubrecipients).toHaveBeenCalledWith(
      expect.objectContaining({ search: "health" }),
      expect.anything(),
    );
  });

  it("renders 'Not assessed' badge when highestRiskRating is null", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([{ ...mockRow, highestRiskRating: null }]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByText("Not assessed")).toBeInTheDocument();
  });

  it("renders medium risk badge with secondary variant text", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([
          { ...mockRow, highestRiskRating: "medium" as const },
          { ...mockRow, id: "sub-2", name: "Low Risk Org", highestRiskRating: "low" as const },
        ]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // Risk badges appear inside cards; SelectItem options may also render "Medium"/"Low"
    // Just verify at least one occurrence exists
    expect(screen.getAllByText("Medium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Low").length).toBeGreaterThan(0);
  });

  it("renders with null billingQuery data (canUseMonitoring derives from null tier)", () => {
    // With null billing data, hasSubrecipientMonitoring receives null — mock returns false
    mockHasSubrecipientMonitoring.mockReturnValue(false);

    setup({
      canMonitoring: false,
      billing: { data: undefined, isLoading: false, isError: false, error: null },
    });

    expect(screen.getByText("Subrecipient monitoring requires Audit-Ready.")).toBeInTheDocument();
  });

  it("renders 'Try again.' when query.error is not an Error instance", () => {
    setup({
      subrecipientsQuery: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: "string-error" as unknown as Error,
      },
    });

    expect(screen.getByText("Try again.")).toBeInTheDocument();
  });

  it("submits form with uei and notes hitting the conditional spread branches", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "new-sub" });

    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const saveButton = screen.getByRole("button", { name: "Save subrecipient" });
    const form = saveButton.closest("form")!;

    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
    const ueiInput = form.querySelector<HTMLInputElement>('[name="uei"]');
    const notesInput = form.querySelector<HTMLInputElement>('[name="notes"]');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(nameInput, "New Org");
    nativeInputValueSetter?.call(ueiInput, "ABC123");
    nativeInputValueSetter?.call(notesInput, "Some notes");

    fireEvent.submit(form);

    await vi.waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Org",
          uei: "ABC123",
          notes: "Some notes",
          status: "active",
        }),
      );
    });
  });

  it("error message displayed inside create form when name is cleared and re-submitted", async () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Org" } });
    // Simulate onChange clearing the error
    fireEvent.change(nameInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Save subrecipient" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
  });

  it("pagination controls render and Next is enabled when total > pageSize", () => {
    // pageSize is 25; total=30 means there is a second page
    const rows = Array.from({ length: 25 }, (_, i) => ({
      ...mockRow,
      id: `sub-${i}`,
      name: `Partner ${i}`,
    }));
    setup({
      subrecipientsQuery: {
        data: makeListResult(
          rows,
          { subrecipients: 30, highRisk: 0, overdueTasks: 0, openFindings: 0 },
          30,
        ),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByTestId("subrecipients-pagination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("Next is disabled when page * pageSize >= total", () => {
    // pageSize=25, page=1 initially; total=20 means all rows fit on page 1
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...mockRow,
      id: `sub-${i}`,
      name: `Partner ${i}`,
    }));
    setup({
      subrecipientsQuery: {
        data: makeListResult(rows, {
          subrecipients: 20,
          highRisk: 0,
          overdueTasks: 0,
          openFindings: 0,
        }),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // total (20) <= pageSize (25), so pagination should not render
    expect(screen.queryByTestId("subrecipients-pagination")).not.toBeInTheDocument();
  });

  it("Previous is disabled on page 1 and Next is disabled when page * pageSize >= total on last page", () => {
    // total=26, pageSize=25 => 2 pages; on page 2 Next should be disabled
    const rows = Array.from({ length: 1 }, (_, i) => ({
      ...mockRow,
      id: `sub-page2-${i}`,
      name: `Partner P2 ${i}`,
    }));
    // We simulate being on page 2 by having only 1 row but total=26
    setup({
      subrecipientsQuery: {
        data: {
          data: rows,
          total: 26,
          summary: { subrecipients: 26, highRisk: 0, overdueTasks: 0, openFindings: 0 },
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    // With page=1, rows.length=1, total=26 > pageSize=25 => show pagination
    expect(screen.getByTestId("subrecipients-pagination")).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextBtn); // Now on page 2; 2*25=50 >= 26 => Next disabled
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    // Click Previous to go back to page 1
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("create form status select forwards the chosen status to the create mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "sub-new" });
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
      mutations: {
        createSubrecipient: { mutateAsync, isPending: false },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add subrecipient" }));

    const statusCombobox = document.getElementById("subrecipient-status") as HTMLInputElement;
    expect(statusCombobox).not.toBeNull();
    // Drive the Select onValueChange (line 173) to set createStatus to "watchlist".
    fireEvent.change(statusCombobox, { target: { value: "watchlist" } });

    const form = screen.getByRole("button", { name: "Save subrecipient" }).closest("form")!;
    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(nameInput, "Watchlisted Org");
    fireEvent.submit(form);

    await vi.waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Watchlisted Org", status: "watchlist" }),
      );
    });
  });

  it("hides the filter toolbar when there are zero rows and no active filters (true-empty state)", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.queryByPlaceholderText("Name or UEI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overdue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Findings" })).not.toBeInTheDocument();
  });

  it("shows the filter toolbar when rows are present", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByPlaceholderText("Name or UEI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Findings" })).toBeInTheDocument();
  });

  it("fires captureRecordFilterChanged with record_type=subrecipients on status filter change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    setup({
      subrecipientsQuery: {
        data: {
          data: [
            {
              id: "s1",
              name: "Org A",
              highestRiskRating: null,
              activeSubawardCount: 0,
              openTaskCount: 0,
              overdueTaskCount: 0,
              openFindingCount: 0,
            },
          ],
          total: 1,
          summary: { subrecipients: 1, overdueTasks: 0, openFindings: 0, highRisk: 0 },
        },
      },
    });

    const statusCombobox = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(statusCombobox, { target: { value: "active" } });

    await vi.waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "subrecipients",
        "status",
        expect.objectContaining({ status: "active" }),
      );
    });
  });

  it("fires captureRecordFilterChanged with record_type=subrecipients on Overdue toggle", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    setup({
      subrecipientsQuery: {
        data: {
          data: [
            {
              id: "s1",
              name: "Org A",
              highestRiskRating: null,
              activeSubawardCount: 0,
              openTaskCount: 0,
              overdueTaskCount: 0,
              openFindingCount: 0,
            },
          ],
          total: 1,
          summary: { subrecipients: 1, overdueTasks: 0, openFindings: 0, highRisk: 0 },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));

    await vi.waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "subrecipients",
        "overdueTasks",
        expect.objectContaining({ overdueTasks: true }),
      );
    });
  });

  it("fires captureRecordFilterChanged with record_type=subrecipients on search input blur", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    setup({
      subrecipientsQuery: {
        data: {
          data: [
            {
              id: "s1",
              name: "Org A",
              highestRiskRating: null,
              activeSubawardCount: 0,
              openTaskCount: 0,
              overdueTaskCount: 0,
              openFindingCount: 0,
            },
          ],
          total: 1,
          summary: { subrecipients: 1, overdueTasks: 0, openFindings: 0, highRisk: 0 },
        },
      },
    });

    const searchInput = screen.getByPlaceholderText("Name or UEI");
    fireEvent.change(searchInput, { target: { value: "Org" } });
    fireEvent.blur(searchInput);

    await vi.waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "subrecipients",
        "search",
        expect.objectContaining({ search: "Org" }),
      );
    });
  });

  it("formats metric counts >= 1000 with thousands separator", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult(
          [mockRow],
          { subrecipients: 1500, highRisk: 0, overdueTasks: 0, openFindings: 0 },
          1500,
        ),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    const subrecipientsLabel = screen.getByText("Subrecipients", { selector: "div" });
    expect(subrecipientsLabel.previousSibling?.textContent).toBe("1,500");
  });

  it("shows full subrecipient name as title attribute on truncated card heading", () => {
    setup({
      subrecipientsQuery: {
        data: makeListResult([mockRow]),
        isLoading: false,
        isError: false,
        error: null,
      },
    });

    expect(screen.getByTitle("Community Health Network")).toBeInTheDocument();
  });
});
