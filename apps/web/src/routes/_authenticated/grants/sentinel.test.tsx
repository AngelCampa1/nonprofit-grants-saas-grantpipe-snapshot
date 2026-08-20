import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { ApiError } from "../../../lib/http-response";

const { mockUseBudgetSentinel } = vi.hoisted(() => ({
  mockUseBudgetSentinel: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  createLazyFileRoute: () => (config: { component: unknown }) => config,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/grants/sentinel" } }),
  Link: ({
    children,
    to,
    params,
    hash,
    onClick,
    "aria-current": ariaCurrent,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    hash?: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    "aria-current"?: "page";
    className?: string;
  }) => {
    const href = params
      ? Object.entries(params).reduce((s, [k, v]) => s.replace(`$${k}`, v), to)
      : to;
    return (
      <a
        href={`${href}${hash ? `#${hash}` : ""}`}
        onClick={onClick}
        aria-current={ariaCurrent}
        className={className}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("../../../hooks/use-budget-sentinel", () => ({
  useBudgetSentinel: mockUseBudgetSentinel,
}));

vi.mock("../../../lib/format", () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => ({ memberRole: "admin", memberPermissions: null }),
}));

import { captureEvent } from "../../../lib/analytics";
import { Route as SentinelRoute } from "./sentinel";
import {
  BudgetSentinelPage,
  getBandVariant,
  formatDaysUntilEnd,
  formatExpiredDaysAgo,
} from "./sentinel.lazy";

const mockCaptureEvent = vi.mocked(captureEvent);

const MOCK_OVERSPEND_ITEM = {
  kind: "overspend" as const,
  id: "os1",
  grantId: "g1",
  grantName: "EPA Grant",
  category: "Personnel",
  band: "over_budget" as const,
  approvedAmountCents: 100000,
  actualCents: 120000,
  plannedCents: 100000,
  projectedCents: 130000,
  overByCents: 20000,
  utilizationPercent: 120,
  riskScore: 95,
};

const MOCK_UNDERSPEND_ITEM = {
  kind: "underspend" as const,
  id: "us1",
  fundId: "f1",
  fundName: "Restricted Fund A",
  grantId: "g2",
  title: "Q4 Lapsing",
  band: "lapsing_soon" as const,
  balanceCents: 50000,
  daysUntilEnd: 10,
  endDate: "2026-09-30",
  riskScore: 80,
};

const MOCK_LAPSE_WATCH_ITEM = {
  kind: "underspend" as const,
  id: "us2",
  fundId: null,
  fundName: null,
  grantId: "g3",
  title: "Watch Item",
  band: "lapse_watch" as const,
  balanceCents: 200000,
  daysUntilEnd: 60,
  endDate: "2026-12-31",
  riskScore: 40,
};

const MOCK_NEAR_LIMIT_ITEM = {
  kind: "overspend" as const,
  id: "os2",
  grantId: "g4",
  grantName: "NSF Grant",
  category: "Travel",
  band: "near_limit" as const,
  approvedAmountCents: 50000,
  actualCents: 45000,
  plannedCents: 50000,
  projectedCents: 52000,
  overByCents: 0,
  utilizationPercent: 90,
  riskScore: 50,
};

const BASE_TOTALS = {
  overspend: { near_limit: 0, projected_overspend: 0, over_budget: 1, total: 1 },
  underspend: { lapse_watch: 0, lapsing_soon: 1, lapsed_unspent: 0, total: 1 },
  totalAtRisk: 2,
};

describe("getBandVariant", () => {
  it("maps over_budget to destructive", () => {
    expect(getBandVariant("over_budget")).toBe("destructive");
  });

  it("maps lapsed_unspent to destructive", () => {
    expect(getBandVariant("lapsed_unspent")).toBe("destructive");
  });

  it("maps projected_overspend to warning", () => {
    expect(getBandVariant("projected_overspend")).toBe("warning");
  });

  it("maps lapsing_soon to warning", () => {
    expect(getBandVariant("lapsing_soon")).toBe("warning");
  });

  it("maps near_limit to secondary", () => {
    expect(getBandVariant("near_limit")).toBe("secondary");
  });

  it("maps lapse_watch to secondary", () => {
    expect(getBandVariant("lapse_watch")).toBe("secondary");
  });
});

describe("formatDaysUntilEnd", () => {
  it("returns 'today' for 0 days", () => {
    expect(formatDaysUntilEnd(0)).toBe("today");
  });

  it("returns '1 day' for 1", () => {
    expect(formatDaysUntilEnd(1)).toBe("1 day");
  });

  it("returns plural for more than 1", () => {
    expect(formatDaysUntilEnd(10)).toBe("10 days");
    expect(formatDaysUntilEnd(60)).toBe("60 days");
  });

  it("returns 'expired' for negative days", () => {
    expect(formatDaysUntilEnd(-5)).toBe("expired");
  });
});

describe("formatExpiredDaysAgo", () => {
  it("uses the singular unit when exactly one day has passed", () => {
    expect(formatExpiredDaysAgo(-1)).toBe("expired 1 day ago");
  });

  it("uses the plural unit for more than one day", () => {
    expect(formatExpiredDaysAgo(-14)).toBe("expired 14 days ago");
  });

  it("normalizes positive inputs to the elapsed magnitude", () => {
    expect(formatExpiredDaysAgo(3)).toBe("expired 3 days ago");
  });
});

describe("BudgetSentinelPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the file route shell for lazy loading", () => {
    expect(SentinelRoute).toBeDefined();
  });

  it("renders loading state", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: true,
      isError: false,
      isPlanGated: false,
      data: undefined,
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/loading budget sentinel/i)).toBeInTheDocument();
  });

  it("renders plan-gate upgrade state on 402", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: true,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
      data: undefined,
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/budget sentinel needs a plan check/i)).toBeInTheDocument();
    expect(screen.queryByText(/growth plan required/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see billing/i })).toBeInTheDocument();
  });

  it("renders generic error state on non-402 errors", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: false,
      error: new Error("Server error"),
      data: undefined,
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/unable to load budget sentinel/i)).toBeInTheDocument();
  });

  it("renders empty state when no items", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [],
        totals: {
          overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
          underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
          totalAtRisk: 0,
        },
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/no budget risks detected/i)).toBeInTheDocument();
  });

  it("uses the Grants & Funding kicker and renders the Grants tab group", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [],
        totals: {
          overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
          underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
          totalAtRisk: 0,
        },
      },
    });

    render(<BudgetSentinelPage />);

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
      "href",
      "/subrecipients",
    );
    expect(within(nav).getByRole("link", { name: "Budget Sentinel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("tracks empty ready state with zero buckets when totals are missing", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [],
      },
    });

    render(<BudgetSentinelPage />);

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelViewed, {
      status: "empty",
      item_count_bucket: "0",
      total_at_risk_count_bucket: "0",
      overspend_count_bucket: "0",
      underspend_count_bucket: "0",
    });
  });

  it("renders overspend item with grant link and money figure", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_OVERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);

    expect(screen.getByText("Personnel - EPA Grant")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /EPA Grant/i });
    expect(link).toHaveAttribute("href", "/grants/g1");
    // over by $200.00
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  it("renders lapsed_unspent item with 'expired N days ago' copy (not 'lapses in expired')", () => {
    const lapsedItem = {
      kind: "underspend" as const,
      id: "us-lapsed",
      fundId: "f-lapsed",
      fundName: "Lapsed Fund",
      grantId: null,
      title: "Lapsed Restriction",
      band: "lapsed_unspent" as const,
      balanceCents: 30000,
      daysUntilEnd: -14,
      endDate: "2026-06-02",
      riskScore: 90,
    };
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [lapsedItem],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/expired 14 days ago/i)).toBeInTheDocument();
    // Must not show the old broken text
    expect(screen.queryByText(/lapses in expired/i)).not.toBeInTheDocument();
  });

  it("renders the singular 'expired 1 day ago' copy without a stray plural", () => {
    const lapsedItem = {
      kind: "underspend" as const,
      id: "us-lapsed-1",
      fundId: "f-lapsed-1",
      fundName: "Just-Lapsed Fund",
      grantId: null,
      title: "Just-Lapsed Restriction",
      band: "lapsed_unspent" as const,
      balanceCents: 50000,
      daysUntilEnd: -1,
      endDate: "2026-06-15",
      riskScore: 88,
    };
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [lapsedItem],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/expired 1 day ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/expired 1 days ago/i)).not.toBeInTheDocument();
  });

  it("renders underspend item with balance and days until end", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_UNDERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);

    expect(screen.getByText("Q4 Lapsing")).toBeInTheDocument();
    expect(screen.getByText("Restricted Fund A")).toBeInTheDocument();
    // balance $500.00, lapses in 10 days
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText(/lapses in 10 days/i)).toBeInTheDocument();
  });

  it("renders underspend item without fund name when fundName is null", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_LAPSE_WATCH_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText("Watch Item")).toBeInTheDocument();
    // lapse_watch → muted badge
    expect(screen.getByText(/lapse watch/i)).toBeInTheDocument();
  });

  it("renders correct band badge label for near_limit overspend", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_NEAR_LIMIT_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText(/near limit/i)).toBeInTheDocument();
  });

  it("renders totals summary row", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_OVERSPEND_ITEM, MOCK_UNDERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByTestId("sentinel-totals")).toBeInTheDocument();
  });

  it("tracks budget_sentinel_viewed with privacy-safe summary buckets", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_OVERSPEND_ITEM, MOCK_UNDERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelViewed, {
      status: "ready",
      item_count_bucket: "1-10",
      total_at_risk_count_bucket: "1-10",
      overspend_count_bucket: "1-10",
      underspend_count_bucket: "1-10",
    });
  });

  it("tracks budget_sentinel_filter_changed with only status, kind, and count bucket properties", async () => {
    const user = userEvent.setup();
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_OVERSPEND_ITEM, MOCK_UNDERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);

    await user.click(screen.getByRole("button", { name: "Overspend" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelFilterChanged, {
      status: "enabled",
      kind: "overspend",
      selected_kind_count_bucket: "1-10",
    });
  });

  it("tracks budget_sentinel_item_opened with kind, status, and link type only", async () => {
    const user = userEvent.setup();
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_OVERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);

    await user.click(screen.getByRole("link", { name: /EPA Grant/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelItemOpened, {
      kind: "overspend",
      status: "over_budget",
      link_type: "grant",
    });
  });

  it("renders both kind filter chips", () => {
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "",
        items: [],
        totals: {
          overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
          underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
          totalAtRisk: 0,
        },
      },
    });

    render(<BudgetSentinelPage />);

    expect(screen.getByRole("button", { name: "Overspend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Underspend" })).toBeInTheDocument();
  });

  it("toggles kind filter chips with aria-pressed", async () => {
    const user = userEvent.setup();
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "",
        items: [],
        totals: {
          overspend: { near_limit: 0, projected_overspend: 0, over_budget: 0, total: 0 },
          underspend: { lapse_watch: 0, lapsing_soon: 0, lapsed_unspent: 0, total: 0 },
          totalAtRisk: 0,
        },
      },
    });

    render(<BudgetSentinelPage />);

    const overspendChip = screen.getByRole("button", { name: "Overspend" });
    expect(overspendChip).toHaveAttribute("aria-pressed", "false");

    await user.click(overspendChip);
    expect(overspendChip).toHaveAttribute("aria-pressed", "true");

    await user.click(overspendChip);
    expect(overspendChip).toHaveAttribute("aria-pressed", "false");
  });

  it("underspend item links to fund when fundId is set (fund takes priority over grant)", async () => {
    const user = userEvent.setup();
    // MOCK_UNDERSPEND_ITEM has fundId:"f1" AND grantId:"g2" — fund wins
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [MOCK_UNDERSPEND_ITEM],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    const link = screen.getByRole("link", { name: /Q4 Lapsing/i });
    expect(link).toHaveAttribute("href", "/funds/f1");

    await user.click(link);

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelItemOpened, {
      kind: "underspend",
      status: "lapsing_soon",
      link_type: "fund",
    });
  });

  it("underspend item links to grant when fundId is null but grantId is set", async () => {
    const user = userEvent.setup();
    const grantOnlyItem = { ...MOCK_LAPSE_WATCH_ITEM, fundId: null, grantId: "g3" };
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [grantOnlyItem],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    const link = screen.getByRole("link", { name: /Watch Item/i });
    expect(link).toHaveAttribute("href", "/grants/g3");

    await user.click(link);

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.budgetSentinelItemOpened, {
      kind: "underspend",
      status: "lapse_watch",
      link_type: "grant",
    });
  });

  it("underspend item shows fund link when grantId is null", () => {
    const noGrantItem = {
      ...MOCK_LAPSE_WATCH_ITEM,
      grantId: null,
      fundId: "f99",
      fundName: "Fund X",
    };
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [noGrantItem],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    const link = screen.getByRole("link", { name: /Watch Item/i });
    expect(link).toHaveAttribute("href", "/funds/f99");
  });

  it("underspend with no grantId and no fundId renders title without link", () => {
    const noLinkItem = { ...MOCK_LAPSE_WATCH_ITEM, grantId: null, fundId: null };
    mockUseBudgetSentinel.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [noLinkItem],
        totals: BASE_TOTALS,
      },
    });

    render(<BudgetSentinelPage />);
    expect(screen.getByText("Watch Item")).toBeInTheDocument();
    // Should not be a link
    expect(screen.queryByRole("link", { name: /Watch Item/i })).not.toBeInTheDocument();
  });
});
