import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  })),
  mockUseDashboardOverview: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseRestrictionAlerts: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseOutstandingSummary: vi.fn(),
  mockUseDashboardHomePreferenceMutation: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockCaptureRecordViewChanged: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  Link: ({
    children,
    to,
    search,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    search?: Record<string, string | undefined>;
    params?: Record<string, string>;
  }) => {
    const qs =
      search && Object.keys(search).length > 0
        ? "?" + new URLSearchParams(search as Record<string, string>).toString()
        : "";
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "",
    );
    return (
      <a href={`${href}${qs}`} data-params={JSON.stringify(params ?? {})} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

vi.mock("../../lib/record-discovery-analytics", () => ({
  captureRecordViewChanged: hoisted.mockCaptureRecordViewChanged,
}));

vi.mock("../../hooks/use-restrictions", () => ({
  useRestrictionAlerts: hoisted.mockUseRestrictionAlerts,
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgBilling: hoisted.mockUseOrgBilling,
}));

vi.mock("@grantpipe/ui", () => ({
  PageHeader: ({
    title,
    description,
    kicker,
    help,
    helpLabel,
    actions,
  }: {
    title: string;
    description?: string;
    kicker?: string;
    actions?: React.ReactNode;
    help?: React.ReactNode;
    helpLabel?: string;
  }) => (
    <div data-slot="page-header">
      {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {help ? (
        <button type="button" aria-label={helpLabel ?? `Help for ${title}`}>
          ?
        </button>
      ) : null}
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div data-slot="page-header-actions">{actions}</div> : null}
    </div>
  ),
  Alert: ({
    children,
    title,
    variant,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { title?: string; variant?: string }) => (
    <div role="alert" data-slot="alert" data-variant={variant} className={className} {...props}>
      {title ? <p data-slot="alert-title">{title}</p> : null}
      {children !== undefined ? <div data-slot="alert-content">{children}</div> : null}
    </div>
  ),
  ActionPanel: ({
    title,
    description,
    action,
    secondaryAction,
    variant,
  }: {
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    secondaryAction?: React.ReactNode;
    variant?: string;
  }) => (
    <section
      role={variant === "error" ? "alert" : "region"}
      aria-label={title}
      data-slot="action-panel"
      data-variant={variant}
    >
      <h3>{title}</h3>
      {description ? <div>{description}</div> : null}
      {action}
      {secondaryAction}
    </section>
  ),
  AttentionBanner: ({
    title,
    description,
    variant,
    children,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    variant?: string;
    children?: React.ReactNode;
  }) => (
    <div data-slot="attention-banner" data-variant={variant}>
      <p data-slot="attention-banner-title">{title}</p>
      {description ? <p data-slot="attention-banner-description">{description}</p> : null}
      {children ? <div data-slot="attention-banner-children">{children}</div> : null}
    </div>
  ),
  Card: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="card" className={className} {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="card-content" className={className} {...props}>
      {children}
    </div>
  ),
  Badge: ({
    children,
    className,
    variant,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { variant?: string }) => (
    <div data-slot="badge" data-variant={variant} className={className} {...props}>
      {children}
    </div>
  ),
  Skeleton: ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="skeleton" className={className} {...props} />
  ),
  cn: (...args: unknown[]) => (args.filter(Boolean) as string[]).join(" "),
  IconButton: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    className,
    size: _size,
    tooltip: _tooltip,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
    className?: string;
    size?: string;
    tooltip?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        onClick,
        "aria-label": ariaLabel,
        className: `rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 ${className ?? ""}`,
      },
      children,
    ),
  PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  ),
  MetricTile: ({
    label,
    value,
    description,
  }: {
    label?: string;
    value?: string | React.ReactNode;
    description?: string;
  }) => (
    <div data-slot="metric-tile">
      <div>{label}</div>
      <div>{value}</div>
      <div>{description}</div>
    </div>
  ),
  ViewToggle: ({
    value,
    onChange,
    options,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    "aria-label"?: string;
  }) => (
    <div role="radiogroup" aria-label={ariaLabel ?? "View toggle"} data-slot="view-toggle">
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
}));

vi.mock("../../hooks/use-overview", () => ({
  useDashboardOverview: hoisted.mockUseDashboardOverview,
  useDashboardHomePreferenceMutation: hoisted.mockUseDashboardHomePreferenceMutation,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

vi.mock("../../components/onboarding-checklist", () => ({
  OnboardingChecklist: ({ role }: { role?: string | null }) => (
    <div data-testid="onboarding-checklist">Checklist for {role}</div>
  ),
}));

vi.mock("../../components/trial-upgrade-card", () => ({
  TrialUpgradeCard: () => <div data-testid="trial-upgrade-card-stub" />,
}));

vi.mock("../../hooks/use-payments", () => ({
  useOutstandingSummary: hoisted.mockUseOutstandingSummary,
}));

// lucide-react mock — minimal stubs so icons render without SVG
vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
  TrendingUp: () => <span data-testid="icon-trending-up" />,
  Calendar: () => <span data-testid="icon-calendar" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  CheckCircle2: () => <span data-testid="icon-check-circle-2" />,
  AlertTriangle: () => <span data-testid="icon-alert-triangle" />,
  Clock: () => <span data-testid="icon-clock" />,
  Settings2: () => <span data-testid="icon-settings-2" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  X: () => <span data-testid="icon-x" />,
  Check: () => <span data-testid="icon-check" />,
}));

import { DashboardPage } from "./dashboard";

// ── Shared test data ─────────────────────────────────────────────────────────

const baseOverview = {
  asOf: "2026-04-08T18:30:00.000Z",
  upcomingDeadlines: [],
  atRiskGrants: [],
  recentActivity: [],
  donorMetrics: {
    retentionRate: 0,
    currentFiscalYearGivingCents: 0,
    previousFiscalYearGivingCents: 0,
    newDonorCount: 0,
  },
  pipelineSummary: { donors: [], grants: [] },
  fundBalances: [],
};

const populatedOverview = {
  asOf: "2026-04-08T18:30:00.000Z",
  upcomingDeadlines: [
    {
      id: "deadline-1",
      title: "Q2 Narrative Report",
      date: "2026-04-12T00:00:00.000Z",
      kind: "report_due",
      grantId: "grant-1",
      grantName: "STEM Access",
    },
    {
      id: "deadline-2",
      title: "Closeout checklist",
      date: "2026-04-13T00:00:00.000Z",
      kind: "closeout_due",
    },
  ],
  atRiskGrants: [
    {
      id: "grant-1",
      name: "STEM Access",
      health: "at_risk",
      reason: "Budget 90% spent",
    },
  ],
  complianceHealth: {
    overdueGrantCount: 1,
    atRiskGrantCount: 1,
    upcomingDeadlineCount: 2,
    restrictedFundWatchCount: 1,
    auditEvidenceEventCount: 2,
  },
  boardReportFreshness: {
    latestReportId: "report-1",
    latestReportTitle: "March board packet",
    latestGeneratedAt: "2026-04-01T12:00:00.000Z",
    daysSinceLatestReport: 7,
  },
  recentActivity: [
    {
      id: "activity-1",
      entityType: "grant",
      entityId: "grant-1",
      action: "updated",
      createdAt: "2026-04-08T15:00:00.000Z",
    },
    {
      id: "activity-2",
      entityType: "generated_report",
      entityId: "report-1",
      action: "exported",
      createdAt: "2026-04-08T16:00:00.000Z",
    },
    {
      id: "activity-3",
      entityType: "import_history",
      entityId: "import-1",
      action: "created",
      createdAt: "2026-04-08T17:00:00.000Z",
    },
  ],
  donorMetrics: {
    retentionRate: 62.5,
    currentFiscalYearGivingCents: 2400000,
    previousFiscalYearGivingCents: 1800000,
    newDonorCount: 12,
  },
  pipelineSummary: {
    donors: [{ label: "major_donor", count: 4 }],
    grants: [{ label: "closeout_due", count: 3 }],
  },
  fundBalances: [
    { fundId: "fund-1", fundName: "General Fund", fundType: "unrestricted", balanceCents: 515000 },
  ],
};

describe("DashboardPage", () => {
  beforeEach(() => {
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReset();
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin" });
    hoisted.mockCreateFileRoute.mockClear();
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: { totalOutstandingCents: 0, submittedCount: 0, approvedCount: 0, overdueCount: 0 },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseDashboardHomePreferenceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    hoisted.mockCaptureEvent.mockReset();
    hoisted.mockCaptureRecordViewChanged.mockReset();
    // Reset sessionStorage between tests
    sessionStorage.clear();
  });

  // ── Loading / error states ─────────────────────────────────────────────────

  it("renders skeleton loading state correctly (not Alert text)", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    // No Alert-based loading text
    expect(screen.queryByText("Loading overview...")).not.toBeInTheDocument();
    // Skeleton elements rendered
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(7); // 4 cards + 1 heading + 3 items
    // 4 metric card skeletons in the grid
    const metricSkeletons = Array.from(skeletons).filter((el) => el.className.includes("h-24"));
    expect(metricSkeletons).toHaveLength(4);
    // ViewToggle is rendered even in loading state
    expect(screen.getByRole("radiogroup", { name: "Dashboard view" })).toBeInTheDocument();
  });

  it("renders error state when no data and not loading", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Overview unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unable to load dashboard data.")).toBeInTheDocument();
    const alertEl = screen.getByText("Overview unavailable").closest("[data-slot='action-panel']");
    expect(alertEl).toHaveAttribute("data-variant", "error");
    // ViewToggle still rendered in error state
    expect(screen.getByRole("radiogroup", { name: "Dashboard view" })).toBeInTheDocument();
  });

  // ── ViewToggle rendering ───────────────────────────────────────────────────

  it("renders ViewToggle with Actions, Metrics, Agenda options", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    const toggle = screen.getByRole("radiogroup", { name: "Dashboard view" });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Agenda" })).toBeInTheDocument();
  });

  it("defaults to Actions view (aria-checked=true on Actions button)", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("radio", { name: "Actions" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Metrics" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Agenda" })).toHaveAttribute("aria-checked", "false");
  });

  it("renders the trial upgrade card host", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByTestId("trial-upgrade-card-stub")).toBeInTheDocument();
  });

  it("switches to Metrics view when Metrics button is clicked", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

    expect(screen.getByRole("radio", { name: "Metrics" })).toHaveAttribute("aria-checked", "true");
    // Metrics view has sparkline-style sections
    expect(screen.getByRole("heading", { name: "Donor pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grant pipeline" })).toBeInTheDocument();
  });

  it("switches to Agenda view when Agenda button is clicked", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

    expect(screen.getByRole("radio", { name: "Agenda" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Period status" })).toBeInTheDocument();
  });

  it("persists view choice to sessionStorage", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

    expect(sessionStorage.getItem("gp-dash-view")).toBe("metrics");
  });

  it("reads initial view from sessionStorage", () => {
    sessionStorage.setItem("gp-dash-view", "agenda");
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("radio", { name: "Agenda" })).toHaveAttribute("aria-checked", "true");
  });

  // ── Actions view ───────────────────────────────────────────────────────────

  it("opens the customize panel and saves pinned dashboard widgets", () => {
    const mutate = vi.fn();
    hoisted.mockUseDashboardHomePreferenceMutation.mockReturnValue({
      mutate,
      isPending: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...populatedOverview,
        dashboardLayout: {
          pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
          source: "saved",
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));

    expect(screen.getByRole("region", { name: "Customize dashboard home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Needs attention" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Recent activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances", "recent_activity"],
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("closes the customize panel after a successful save", () => {
    const mutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    hoisted.mockUseDashboardHomePreferenceMutation.mockReturnValue({
      mutate,
      isPending: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...populatedOverview,
        dashboardLayout: {
          pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
          source: "saved",
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByRole("region", { name: "Customize dashboard home" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Customize dashboard home" }),
    ).not.toBeInTheDocument();
  });

  it("discards pending widget edits when the customize panel is canceled", () => {
    hoisted.mockUseDashboardHomePreferenceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...populatedOverview,
        dashboardLayout: {
          pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
          source: "saved",
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByRole("button", { name: "Recent activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("region", { name: "Customize dashboard home" }),
    ).not.toBeInTheDocument();
  });

  it("shows a saving label on the customize panel while the save is pending", () => {
    hoisted.mockUseDashboardHomePreferenceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...populatedOverview,
        dashboardLayout: {
          pinnedWidgetIds: ["needs_attention", "grant_health", "fund_balances"],
          source: "saved",
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });

  it("uses auditor role defaults without donor widgets", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "auditor" });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.queryByRole("link", { name: "Raised (FY)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Donor pipeline" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grant health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fund balances" })).toBeInTheDocument();
  });

  it("renders empty-state messaging when the overview has no data (Actions view)", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help for Dashboard" })).toBeInTheDocument();
    // outstanding reimbursements metric tile shown (payments enabled via growth plan)
    expect(container.querySelectorAll("[data-slot='metric-tile']")).toHaveLength(1);
    expect(
      screen.getByText("Donor metrics and fund balances will appear here as you add data."),
    ).toBeInTheDocument();
    // compliance section
    const complianceHeading = screen.getByRole("heading", { name: "Grant health" });
    const complianceSection = complianceHeading.closest("section");
    expect(complianceSection).toBeInTheDocument();
    const complianceScope = within(complianceSection as HTMLElement);
    expect(complianceScope.getByText("Overdue grants")).toBeInTheDocument();
    expect(complianceScope.getByText("At-risk grants")).toBeInTheDocument();
    expect(complianceScope.getByText("Upcoming deadlines")).toBeInTheDocument();
    expect(complianceScope.getByText("Restricted funds on watch")).toBeInTheDocument();
    expect(complianceScope.getByText("Audit evidence events")).toBeInTheDocument();
    // updated timestamp in description
    expect(screen.getByText("Updated Apr 8, 2026, 6:30 PM UTC")).toBeInTheDocument();
    // "all clear" state in needs attention card
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
    // empty-state messages for activity and fund balances
    expect(screen.getByText(/Activity will appear after your team/)).toBeInTheDocument();
    expect(screen.getByText(/Fund balances appear after restricted/)).toBeInTheDocument();
    // wrapper has correct spacing
    expect(container.firstChild).toHaveClass("space-y-8", "p-4", "sm:p-6", "lg:p-8");
  });

  it("renders populated dashboard sections and metrics (Actions view)", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    // donor metrics show in stat row
    const { container } = render(<DashboardPage />);
    expect(screen.getAllByText("$24,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$18,000").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();

    // Compliance section
    const complianceHeading = screen.getByRole("heading", { name: "Grant health" });
    const complianceSection = complianceHeading.closest("section");
    expect(complianceSection).toBeInTheDocument();
    const complianceScope = within(complianceSection as HTMLElement);
    expect(complianceScope.getByText("Overdue grants")).toBeInTheDocument();
    expect(complianceScope.getByText("At-risk grants")).toBeInTheDocument();
    expect(complianceScope.getByText("Upcoming deadlines")).toBeInTheDocument();
    expect(complianceScope.getByText("Restricted funds on watch")).toBeInTheDocument();
    expect(complianceScope.getByText("Audit evidence events")).toBeInTheDocument();

    // Reporting readiness section
    expect(screen.getByRole("heading", { name: "Reporting readiness" })).toBeInTheDocument();
    expect(screen.getByText("March board packet")).toBeInTheDocument();
    expect(screen.getByText("Generated Apr 1, 2026, 12:00 PM UTC")).toBeInTheDocument();
    expect(screen.getByText("7 days since latest board packet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open reports" })).toHaveAttribute("href", "/reports");
    expect(screen.getByText("Updated Apr 8, 2026, 6:30 PM UTC")).toBeInTheDocument();

    // Attention section (inside NeedsAttentionCard)
    expect(screen.getByTestId("dashboard-attention-section")).toHaveAttribute(
      "data-attention-count",
      "3",
    );
    // At-risk grant
    expect(screen.getByTestId("dashboard-attention-grant-1")).toHaveAttribute(
      "data-attention-kind",
      "grant",
    );
    expect(screen.getByTestId("dashboard-attention-grant-1")).toHaveAttribute("role", "group");
    expect(screen.getByText("Budget 90% spent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open grant STEM Access" })).toHaveAttribute(
      "href",
      "/grants/grant-1",
    );
    // Deadlines
    expect(screen.getByTestId("dashboard-attention-deadline-1")).toHaveAttribute(
      "data-attention-kind",
      "deadline",
    );
    expect(screen.getByTestId("dashboard-attention-deadline-1")).toHaveAttribute("role", "group");
    expect(screen.getByText("Q2 Narrative Report")).toBeInTheDocument();
    expect(screen.getByText("Closeout checklist")).toBeInTheDocument();
    expect(screen.getByText("Apr 12, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open grant STEM Access deadline" })).toHaveAttribute(
      "href",
      "/grants/grant-1",
    );
    expect(screen.getByRole("link", { name: "Open grant STEM Access deadline" })).toHaveAttribute(
      "data-params",
      JSON.stringify({ grantId: "grant-1" }),
    );

    // Activity feed
    expect(screen.getByText("Grant Updated")).toBeInTheDocument();
    expect(screen.getByText("Report Exported")).toBeInTheDocument();
    expect(screen.getByText("Import Created")).toBeInTheDocument();
    expect(screen.queryByText("Generated Report exported")).not.toBeInTheDocument();
    expect(screen.queryByText("Import History created")).not.toBeInTheDocument();

    // Fund balances
    expect(screen.getByText("General Fund")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View fund" })).toHaveAttribute(
      "href",
      "/funds/fund-1",
    );
  });

  it("leads with an executive snapshot and priority actions for grant managers", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        executiveSnapshot: {
          status: "urgent",
          statusLabel: "Action needed",
          statusDescription: "1 overdue grant and no board packet generated.",
          primaryMetricLabel: "Grant health",
          primaryMetricValue: "1 urgent",
          secondaryMetricLabel: "Upcoming deadlines",
          secondaryMetricValue: "2 next 30 days",
          priorityActions: [
            {
              id: "grant:grant-1",
              kind: "grant_risk",
              title: "STEM Access",
              description: "final report is overdue",
              severity: "urgent",
              dueDate: "2026-04-05T00:00:00.000Z",
              targetType: "grant",
              targetId: "grant-1",
            },
            {
              id: "reporting:board-packet",
              kind: "reporting_readiness",
              title: "Generate a board packet",
              description: "No board packet has been generated yet.",
              severity: "watch",
              dueDate: null,
              targetType: "reports",
              targetId: null,
            },
          ],
        },
        upcomingDeadlines: [],
        atRiskGrants: [],
        complianceHealth: {
          overdueGrantCount: 1,
          atRiskGrantCount: 0,
          upcomingDeadlineCount: 2,
          restrictedFundWatchCount: 0,
          auditEvidenceEventCount: 0,
        },
        boardReportFreshness: {
          latestReportId: null,
          latestReportTitle: null,
          latestGeneratedAt: null,
          daysSinceLatestReport: null,
        },
        recentActivity: [],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Executive snapshot" })).toBeInTheDocument();
    expect(screen.getByText("Action needed")).toBeInTheDocument();
    expect(screen.getByText("1 overdue grant and no board packet generated.")).toBeInTheDocument();
    expect(screen.getByText("1 urgent")).toBeInTheDocument();
    expect(screen.getByText("2 next 30 days")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority actions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open STEM Access" })).toHaveAttribute(
      "href",
      "/grants/grant-1",
    );
    expect(screen.getByRole("link", { name: "Open Generate a board packet" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(screen.getByRole("heading", { name: "Grant health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reporting readiness" })).toBeInTheDocument();
  });

  it("links fund priority actions from a watch snapshot", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        executiveSnapshot: {
          status: "watch",
          statusLabel: "Watch closely",
          statusDescription: "1 restricted fund on watch.",
          primaryMetricLabel: "Grant health",
          primaryMetricValue: "0 urgent",
          secondaryMetricLabel: "Upcoming deadlines",
          secondaryMetricValue: "0 next 30 days",
          priorityActions: [
            {
              id: "fund:fund-1",
              kind: "fund_watch",
              title: "Restricted Growth Fund",
              description: "Restricted fund is 90% spent.",
              severity: "watch",
              dueDate: null,
              targetType: "fund",
              targetId: "fund-1",
            },
          ],
        },
        upcomingDeadlines: [],
        atRiskGrants: [],
        complianceHealth: {
          overdueGrantCount: 0,
          atRiskGrantCount: 0,
          upcomingDeadlineCount: 0,
          restrictedFundWatchCount: 1,
          auditEvidenceEventCount: 0,
        },
        boardReportFreshness: {
          latestReportId: "report-1",
          latestReportTitle: "April board packet",
          latestGeneratedAt: "2026-04-08T12:00:00.000Z",
          daysSinceLatestReport: 0,
        },
        recentActivity: [],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Watch closely")).toHaveClass(
      "border-accent/40",
      "bg-accent/15",
      "text-accent-foreground",
    );
    expect(screen.getByRole("link", { name: "Open Restricted Growth Fund" })).toHaveAttribute(
      "href",
      "/funds/fund-1",
    );
  });

  it("renders same-day board packet freshness copy and default grant health tone", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [
          {
            id: "grant-review",
            name: "Capacity Building",
            health: "review",
            reason: "Grant needs finance review",
          },
        ],
        complianceHealth: {
          overdueGrantCount: 0,
          atRiskGrantCount: 1,
          upcomingDeadlineCount: 0,
          restrictedFundWatchCount: 0,
          auditEvidenceEventCount: 0,
        },
        boardReportFreshness: {
          latestReportId: "report-1",
          latestReportTitle: null,
          latestGeneratedAt: "2026-04-08T12:00:00.000Z",
          daysSinceLatestReport: 0,
        },
        recentActivity: [],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Latest board packet")).toBeInTheDocument();
    expect(screen.getByText("Generated today")).toBeInTheDocument();
    // "Review" badge in NeedsAttentionCard
    expect(screen.getByText("Review")).toHaveClass("border-border", "bg-muted", "text-foreground");
  });

  it("renders singular board packet freshness copy", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [],
        boardReportFreshness: {
          latestReportId: "report-1",
          latestReportTitle: "April packet",
          latestGeneratedAt: "2026-04-07T12:00:00.000Z",
          daysSinceLatestReport: 1,
        },
        recentActivity: [],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("1 day since latest board packet")).toBeInTheDocument();
  });

  it("renders overdue grants with the destructive tone class on the badge", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [
          {
            id: "grant-1",
            name: "STEM Access",
            health: "overdue",
            reason: "Reporting overdue",
          },
        ],
        recentActivity: [],
        donorMetrics: {
          retentionRate: 62.5,
          currentFiscalYearGivingCents: 2400000,
          previousFiscalYearGivingCents: 1800000,
          newDonorCount: 12,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Overdue")).toHaveClass(
      "border-destructive/30",
      "bg-destructive/10",
      "text-destructive",
    );
  });

  it("shows all-clear in NeedsAttentionCard when there are no at-risk grants or upcoming deadlines", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [],
        recentActivity: [],
        donorMetrics: {
          retentionRate: 55,
          currentFiscalYearGivingCents: 1000000,
          previousFiscalYearGivingCents: 900000,
          newDonorCount: 5,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    // NeedsAttentionCard always renders; shows all-clear message instead
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
    // no items in attention section data
    expect(screen.queryByTestId("dashboard-attention-section")).not.toBeInTheDocument();
  });

  it("renders activity feed with time elements for each entry", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [],
        recentActivity: [
          {
            id: "act-1",
            entityType: "donor",
            entityId: "donor-1",
            action: "created",
            createdAt: "2026-04-08T10:00:00.000Z",
          },
          {
            id: "act-2",
            entityType: "grant",
            entityId: "grant-1",
            action: "deleted",
            createdAt: "2026-04-08T11:00:00.000Z",
          },
        ],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<DashboardPage />);

    expect(screen.getByText("Donor Created")).toBeInTheDocument();
    expect(screen.getByText("Grant Deleted")).toBeInTheDocument();
    // time elements present
    const timeEls = container.querySelectorAll("time");
    expect(timeEls).toHaveLength(2);
    expect(timeEls[0]).toHaveAttribute("dateTime", "2026-04-08T10:00:00.000Z");
    expect(timeEls[1]).toHaveAttribute("dateTime", "2026-04-08T11:00:00.000Z");
  });

  it("keeps the last successful dashboard data visible when a refetch fails", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [
          {
            id: "deadline-1",
            title: "Q2 Narrative Report",
            date: "2026-04-12T00:00:00.000Z",
            kind: "report_due",
            grantName: "STEM Access",
          },
        ],
        atRiskGrants: [
          {
            id: "grant-1",
            name: "STEM Access",
            health: "overdue",
            reason: "Reporting overdue",
          },
        ],
        recentActivity: [],
        donorMetrics: {
          retentionRate: 62.5,
          currentFiscalYearGivingCents: 2400000,
          previousFiscalYearGivingCents: 1800000,
          newDonorCount: 12,
        },
        pipelineSummary: {
          donors: [{ label: "major_donor", count: 4 }],
          grants: [{ label: "closeout_due", count: 3 }],
        },
        fundBalances: [],
      },
      isLoading: false,
      isError: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Q2 Narrative Report")).toBeInTheDocument();
    // STEM Access appears in attention card (grant link label) and deadline grant name link
    expect(screen.getAllByText("STEM Access")).toHaveLength(2);
    expect(screen.getByText("Reporting overdue")).toBeInTheDocument();
    expect(screen.getByText("Dashboard data may be stale.")).toBeInTheDocument();
    expect(screen.queryByText("Overview unavailable")).not.toBeInTheDocument();
  });

  it("renders at_risk grant with the correct accent tone class on the badge", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [
          {
            id: "grant-2",
            name: "Youth Program Grant",
            health: "at_risk",
            reason: "Budget 85% spent",
          },
        ],
        recentActivity: [],
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("At Risk")).toHaveClass(
      "border-accent/40",
      "bg-accent/15",
      "text-accent-foreground",
    );
  });

  // ── Stat row ───────────────────────────────────────────────────────────────

  it("renders donor stat row with correct values when data is present", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        asOf: "2026-04-08T18:30:00.000Z",
        upcomingDeadlines: [],
        atRiskGrants: [],
        recentActivity: [],
        donorMetrics: {
          retentionRate: 62.5,
          currentFiscalYearGivingCents: 2400000,
          previousFiscalYearGivingCents: 1800000,
          newDonorCount: 12,
        },
        pipelineSummary: { donors: [], grants: [] },
        fundBalances: [],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    // Stat cards are custom divs, not MetricTile; check for rendered values
    expect(screen.getByRole("link", { name: "Raised (FY)" })).toHaveAttribute(
      "href",
      "/donors?segment=giving_fy_current",
    );
    expect(screen.getByRole("link", { name: "Retention rate" })).toHaveAttribute(
      "href",
      "/donors?segment=retained",
    );
    expect(screen.getByRole("link", { name: "New donors" })).toHaveAttribute(
      "href",
      "/donors?segment=new",
    );
    expect(screen.getByRole("link", { name: "Prior FY giving" })).toHaveAttribute(
      "href",
      "/donors?segment=giving_fy_last",
    );
    expect(screen.getAllByText("$24,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("62.5%").length).toBeGreaterThanOrEqual(1);
  });

  it("suppresses stat row and shows placeholder text when all donor metrics are zero", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<DashboardPage />);

    // donor stat row not rendered; only outstanding tile shown
    expect(container.querySelectorAll("[data-slot='metric-tile']")).toHaveLength(1);
    expect(
      screen.getByText("Donor metrics and fund balances will appear here as you add data."),
    ).toBeInTheDocument();
  });

  it("renders stat row when currentFiscalYearGivingCents is non-zero", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 1,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "Raised (FY)" })).toBeInTheDocument();
    expect(
      screen.queryByText("Donor metrics and fund balances will appear here as you add data."),
    ).not.toBeInTheDocument();
  });

  it("renders stat row when newDonorCount is non-zero", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 1,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "New donors" })).toBeInTheDocument();
  });

  it("renders stat row when previousFiscalYearGivingCents is non-zero", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        donorMetrics: {
          retentionRate: 0,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 1,
          newDonorCount: 0,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "Prior FY giving" })).toBeInTheDocument();
  });

  it("renders stat row when retentionRate is non-zero", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        donorMetrics: {
          retentionRate: 45.5,
          currentFiscalYearGivingCents: 0,
          previousFiscalYearGivingCents: 0,
          newDonorCount: 0,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "Retention rate" })).toBeInTheDocument();
    expect(screen.getAllByText("45.5%").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText("Donor metrics and fund balances will appear here as you add data."),
    ).not.toBeInTheDocument();
  });

  // ── Fund balances ──────────────────────────────────────────────────────────

  it("renders fund balance items with formatted currency and links", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        fundBalances: [
          {
            fundId: "fund-a",
            fundName: "Restricted Education Fund",
            fundType: "temporarily_restricted",
            balanceCents: 1250000,
          },
          {
            fundId: "fund-b",
            fundName: "General Operating",
            fundType: "unrestricted",
            balanceCents: 87500,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Restricted Education Fund")).toBeInTheDocument();
    expect(screen.getByText("General Operating")).toBeInTheDocument();
    expect(screen.getByText("$12,500")).toBeInTheDocument();
    expect(screen.getByText("$875")).toBeInTheDocument();
    expect(screen.getByText("Temporarily restricted")).toBeInTheDocument();
    expect(screen.getByText("Unrestricted")).toBeInTheDocument();
    expect(screen.queryByText("Restricted", { exact: true })).not.toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "View fund" });
    expect(links).toHaveLength(2);
  });

  it("fund balances empty state includes a Create a fund link", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    const link = screen.getByRole("link", { name: "Create a fund" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/funds");
  });

  it("preserves cents in dashboard currency metrics and fund balances", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        donorMetrics: {
          retentionRate: 41.2,
          currentFiscalYearGivingCents: 123456,
          previousFiscalYearGivingCents: 78901,
          newDonorCount: 3,
        },
        fundBalances: [
          {
            fundId: "fund-cents",
            fundName: "Scholarship Fund",
            fundType: "permanently_restricted",
            balanceCents: 654321,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getAllByText("$1,234.56").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$789.01").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$6,543.21")).toBeInTheDocument();
  });

  // ── Activity feed ──────────────────────────────────────────────────────────

  it("recent activity empty state includes a Go to Donors link", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    const section = screen.getByRole("region", { name: "Recent activity" });
    const link = within(section).getByRole("link", { name: "Go to Donors" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/donors");
  });

  it("Activity timestamps use formatUtcDateTime", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        recentActivity: [
          {
            id: "activity-1",
            entityType: "grant",
            entityId: "grant-1",
            action: "updated",
            createdAt: "2026-04-08T15:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Apr 8, 2026, 3:00 PM UTC")).toBeInTheDocument();
  });

  // ── Quick actions ──────────────────────────────────────────────────────────

  it("renders quick action links in Actions view", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "Manage donors" })).toHaveAttribute("href", "/donors");
    expect(screen.getByRole("link", { name: "Manage grants" })).toHaveAttribute("href", "/grants");
    // Award intake quick action removed — there is no /award-intake index route.
    expect(screen.queryByRole("link", { name: "Award intake" })).toBeNull();
    expect(screen.getByRole("link", { name: "Journal entry" })).toHaveAttribute(
      "href",
      "/accounting/journal",
    );
    expect(screen.getByRole("link", { name: "Manage funds" })).toHaveAttribute("href", "/funds");

    // Design Canon: nav-link rows are pills (matches SidebarNavItem rounded-full), not rounded-lg.
    for (const name of ["Manage donors", "Manage grants", "Journal entry", "Manage funds"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveClass("rounded-full");
      expect(link).not.toHaveClass("rounded-lg");
    }
  });

  it("renders view-only quick action links for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer" });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: "Manage donors" })).toHaveAttribute("href", "/donors");
    expect(screen.getByRole("link", { name: "Manage grants" })).toHaveAttribute("href", "/grants");
    expect(screen.getByRole("link", { name: "Manage funds" })).toHaveAttribute("href", "/funds");
    // create-only links are hidden for viewers
    expect(screen.queryByRole("link", { name: "Award intake" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Journal entry" })).not.toBeInTheDocument();

    // restore default
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin" });
  });

  // ── Outstanding Reimbursements tile ─────────────────────────────────────

  describe("Outstanding Reimbursements tile", () => {
    it("renders the tile when plan supports payment requests", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
      hoisted.mockUseOutstandingSummary.mockReturnValue({
        data: {
          totalOutstandingCents: 250000,
          submittedCount: 2,
          approvedCount: 1,
          overdueCount: 0,
        },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);

      expect(screen.getByText("Outstanding Reimbursements")).toBeInTheDocument();
      expect(screen.getByText("$2,500")).toBeInTheDocument();
      expect(screen.getByText("2 submitted, 1 approved")).toBeInTheDocument();
      const tileLink = screen.getByRole("link", { name: "Outstanding reimbursements" });
      expect(tileLink).toHaveAttribute("href", "/payments");
    });

    it("hides the tile when plan does not support payment requests", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "starter" } });
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);

      expect(screen.queryByText("Outstanding Reimbursements")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Outstanding reimbursements" }),
      ).not.toBeInTheDocument();
    });

    it("shows zero amounts when outstanding summary has no data", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
      hoisted.mockUseOutstandingSummary.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);

      expect(screen.getByText("Outstanding Reimbursements")).toBeInTheDocument();
      expect(screen.getByText("$0")).toBeInTheDocument();
      expect(screen.getByText("0 submitted, 0 approved")).toBeInTheDocument();
    });
  });

  // ── Onboarding checklist ───────────────────────────────────────────────────

  it("renders onboarding checklist in Actions view with correct role", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor" });

    render(<DashboardPage />);

    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    expect(screen.getByText("Checklist for editor")).toBeInTheDocument();
  });

  it("no longer renders the retired floating 30-day onboarding overlay", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor" });

    render(<DashboardPage />);

    expect(screen.queryByTestId("onboarding-overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Your first 30 days")).not.toBeInTheDocument();
  });

  // ── Metrics view ───────────────────────────────────────────────────────────

  describe("Metrics view", () => {
    beforeEach(() => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: populatedOverview,
        isLoading: false,
        isError: false,
      });
    });

    it("shows donor and grant pipeline tables", () => {
      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

      expect(screen.getByRole("heading", { name: "Donor pipeline" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Grant pipeline" })).toBeInTheDocument();
    });

    it("renders metric summary cards with real data values", () => {
      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

      expect(screen.getByText("Giving trend")).toBeInTheDocument();
      expect(screen.getAllByText("Retention").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Compliance")).toBeInTheDocument();
    });

    it("renders large stat cards in Metrics view", () => {
      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

      // Large stat cards have bigger padding but same links
      expect(screen.getAllByRole("link", { name: "Raised (FY)" }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole("link", { name: "Retention rate" }).length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("shows pipeline empty state when no data", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

      expect(
        screen.getByText("Pipeline counts appear after donors move through stages."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Pipeline counts appear after grants move through stages."),
      ).toBeInTheDocument();
    });
  });

  // ── Agenda view ────────────────────────────────────────────────────────────

  describe("Agenda view", () => {
    it("shows all-clear empty state when no upcoming deadlines and no at-risk grants", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      expect(screen.getByText("No upcoming deadlines")).toBeInTheDocument();
    });

    it("renders at-risk grants at top of agenda list", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: {
          ...baseOverview,
          atRiskGrants: [
            { id: "grant-1", name: "STEM Access", health: "at_risk", reason: "Budget at 90%" },
          ],
        },
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      expect(screen.getByText("At risk")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "STEM Access" })).toHaveAttribute(
        "href",
        "/grants/grant-1",
      );
    });

    it("renders date-grouped deadlines", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: {
          ...baseOverview,
          upcomingDeadlines: [
            {
              id: "d1",
              title: "Q2 Report",
              date: "2026-04-12T00:00:00.000Z",
              grantId: "grant-1",
              grantName: "STEM Access",
            },
            {
              id: "d2",
              title: "Closeout",
              date: "2026-04-12T00:00:00.000Z",
              grantName: undefined,
            },
          ],
        },
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      expect(screen.getByText("Q2 Report")).toBeInTheDocument();
      expect(screen.getByText("Closeout")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open grant STEM Access" })).toHaveAttribute(
        "data-params",
        JSON.stringify({ grantId: "grant-1" }),
      );
    });

    it("renders period status checklist in right column", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: {
          ...baseOverview,
          complianceHealth: {
            overdueGrantCount: 0,
            atRiskGrantCount: 0,
            upcomingDeadlineCount: 0,
            restrictedFundWatchCount: 0,
            auditEvidenceEventCount: 0,
          },
          boardReportFreshness: {
            latestReportId: "r1",
            latestReportTitle: "April packet",
            latestGeneratedAt: "2026-04-08T00:00:00.000Z",
            daysSinceLatestReport: 5,
          },
        },
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      expect(screen.getByRole("heading", { name: "Period status" })).toBeInTheDocument();
      expect(screen.getByText("Donations matched")).toBeInTheDocument();
      expect(screen.getByText("Restricted allocated")).toBeInTheDocument();
      expect(screen.getByText("Reports current")).toBeInTheDocument();
    });

    it("renders urgent items in Today card using AttentionBanner", () => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: {
          ...baseOverview,
          atRiskGrants: [
            { id: "grant-1", name: "STEM Access", health: "overdue", reason: "Report overdue" },
          ],
        },
        isLoading: false,
        isError: false,
      });

      render(<DashboardPage />);
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      const attentionBanners = document.querySelectorAll("[data-slot='attention-banner']");
      expect(attentionBanners.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Restriction alerts ─────────────────────────────────────────────────────

  it("renders restriction alerts section when plan supports restriction lifecycle", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: {
        data: [
          { id: "alert-1", label: "Grant Rollforward Pending", alertType: "rollforward_due" },
          { id: "alert-2", label: "Restricted Fund Overspent", alertType: "overspent" },
        ],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Restricted balance risk" })).toBeInTheDocument();
    // Labels appear in both NeedsAttentionCard and RestrictionAlertsSection
    expect(screen.getAllByText("Grant Rollforward Pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Restricted Fund Overspent").length).toBeGreaterThanOrEqual(1);
    // Title-cased alertType labels appear in the restriction alerts section
    expect(screen.getAllByText("Rollforward Due").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Overspent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "Generate rollforward" })).toHaveAttribute(
      "href",
      "/reports",
    );
  });

  it("distinguishes same-label restriction alerts with per-row amount and date context", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: {
        data: [
          {
            id: "rel-1",
            label: "Release is missing evidence",
            alertType: "release_without_support",
            amountCents: 125050,
            date: "2026-05-03T00:00:00.000Z",
            contextLabel: "Scholarship fund term",
          },
          {
            id: "rel-2",
            label: "Release is missing evidence",
            alertType: "release_without_support",
            amountCents: 90025,
            date: "2026-04-12T00:00:00.000Z",
            contextLabel: "Capacity building term",
          },
          {
            id: "exp-1",
            label: "FY2026 grant: time restriction expired with unspent balance",
            alertType: "expired_time_restriction",
            amountCents: 5099,
            contextLabel: null,
          },
          {
            id: "ev-1",
            label: "Program term: required evidence has not been recorded",
            alertType: "missing_evidence",
            amountCents: 0,
            contextLabel: null,
          },
        ],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    // The two identical labels are now distinguishable by contextLabel (term title) + amount + date.
    expect(screen.getByText("Scholarship fund term · $1,250.50 · May 3, 2026")).toBeInTheDocument();
    expect(screen.getByText("Capacity building term · $900.25 · Apr 12, 2026")).toBeInTheDocument();
    // Amount only (no contextLabel, no date) still renders a context line.
    expect(screen.getByText("$50.99")).toBeInTheDocument();
    // Zero amount with no contextLabel and no date renders no context line — label stands alone.
    // The label appears in multiple dashboard sections; target the restriction-alerts
    // list row specifically (the <span> rendered by RestrictionAlertsSection).
    const evidenceLabel = screen
      .getAllByText("Program term: required evidence has not been recorded")
      .find((el) => el.tagName === "SPAN");
    expect(evidenceLabel).toBeDefined();
    const evidenceRow = evidenceLabel?.closest("li");
    expect(evidenceRow).not.toBeNull();
    expect(evidenceRow?.querySelector("p")).toBeNull();
  });

  it("always loads restriction alerts now that the lifecycle is universal", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        effectivePlanTier: "enterprise",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: {
        data: [{ id: "alert-1", label: "Trial restriction alert", alertType: "overspent" }],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(hoisted.mockUseRestrictionAlerts).toHaveBeenCalledWith({}, { enabled: true });
    expect(screen.getByRole("heading", { name: "Restricted balance risk" })).toBeInTheDocument();
  });

  it("does not use a stale server effective tier after trial expiration", () => {
    // After the trial ends the effective tier recomputes client-side down to Starter,
    // which has no payment requests — so the outstanding-reimbursement query must be
    // disabled rather than trusting the stale server effectivePlanTier of "enterprise".
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        effectivePlanTier: "enterprise",
        status: "trialing",
        trialEndsAt: "2000-01-01T00:00:00.000Z",
      },
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(hoisted.mockUseOutstandingSummary).toHaveBeenCalledWith({ enabled: false });
  });

  // ── Agenda view — today deadlines ─────────────────────────────────────────

  it("renders today deadlines in Agenda Today card using AttentionBanner", () => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        upcomingDeadlines: [
          {
            id: "today-d1",
            title: "Submit Q2 Report",
            date: `${todayUtc}T00:00:00.000Z`,
            grantId: "grant-today",
            grantName: "STEM Fund",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

    const attentionBanners = document.querySelectorAll("[data-slot='attention-banner']");
    expect(attentionBanners.length).toBeGreaterThanOrEqual(1);
    // Today's deadline rendered in Agenda view (date-grouped list and/or Today card)
    expect(screen.getAllByText("Submit Q2 Report").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Open grant STEM Fund" })[0]).toHaveAttribute(
      "data-params",
      JSON.stringify({ grantId: "grant-today" }),
    );
  });

  // ── Pipeline summary (Metrics + legacy Actions section) ────────────────────

  it("renders pipeline donors and grants sections in Metrics view independently", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: {
        ...baseOverview,
        pipelineSummary: {
          donors: [{ label: "prospect", count: 7 }],
          grants: [],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

    expect(screen.getByText("Prospect")).toBeInTheDocument();
    // Grant pipeline section still shown (with empty state)
    expect(screen.getByRole("heading", { name: "Grant pipeline" })).toBeInTheDocument();
  });

  it("falls back to the actions view when sessionStorage reads throw", () => {
    const getItem = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("sessionStorage unavailable");
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    expect(() => render(<DashboardPage />)).not.toThrow();
    expect(screen.getByRole("radio", { name: "Actions" })).toHaveAttribute("aria-checked", "true");

    getItem.mockRestore();
  });

  it("does not crash when sessionStorage writes throw", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });
    const setItem = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("sessionStorage unavailable");
    });

    render(<DashboardPage />);

    expect(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));
    }).not.toThrow();
    expect(setItem).toHaveBeenCalled();

    setItem.mockRestore();
  });

  it("ignores malformed restriction alert payloads", () => {
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: { data: { id: "not-an-array" } },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: baseOverview,
      isLoading: false,
      isError: false,
    });

    expect(() => render(<DashboardPage />)).not.toThrow();
    expect(screen.queryByText("not-an-array")).not.toBeInTheDocument();
  });

  // ── PostHog analytics ─────────────────────────────────────────────────────

  describe("PostHog analytics", () => {
    beforeEach(() => {
      hoisted.mockUseDashboardOverview.mockReturnValue({
        data: baseOverview,
        isLoading: false,
        isError: false,
      });
    });

    it("fires record_view_changed with record_type dashboard when switching views", () => {
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));

      expect(hoisted.mockCaptureRecordViewChanged).toHaveBeenCalledWith(
        "dashboard",
        "metrics",
        "actions",
      );
    });

    it("fires record_view_changed with correct fromView when switching from Metrics to Agenda", () => {
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("radio", { name: "Metrics" }));
      hoisted.mockCaptureRecordViewChanged.mockClear();
      fireEvent.click(screen.getByRole("radio", { name: "Agenda" }));

      expect(hoisted.mockCaptureRecordViewChanged).toHaveBeenCalledWith(
        "dashboard",
        "agenda",
        "metrics",
      );
    });

    it("fires cta_clicked with source dashboard_quick_actions and label Manage donors", () => {
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("link", { name: "Manage donors" }));

      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("cta_clicked", {
        source: "dashboard_quick_actions",
        label: "Manage donors",
      });
    });

    it("fires cta_clicked with label Manage grants", () => {
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("link", { name: "Manage grants" }));

      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("cta_clicked", {
        source: "dashboard_quick_actions",
        label: "Manage grants",
      });
    });

    it("fires cta_clicked with label Journal entry for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor" });
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("link", { name: "Journal entry" }));

      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("cta_clicked", {
        source: "dashboard_quick_actions",
        label: "Journal entry",
      });
    });

    it("fires cta_clicked with label Manage funds", () => {
      render(<DashboardPage />);

      fireEvent.click(screen.getByRole("link", { name: "Manage funds" }));

      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("cta_clicked", {
        source: "dashboard_quick_actions",
        label: "Manage funds",
      });
    });
  });

  // ── Title-attribute truncation helpers ────────────────────────────────────

  it("shows full grant health reason as title attribute on truncated reason p", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByTitle("Budget 90% spent")).toBeInTheDocument();
  });

  it("shows full deadline label as title attribute on truncated deadline p", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByTitle("Q2 Narrative Report")).toBeInTheDocument();
  });

  it("shows full fund name as title attribute on truncated fund balance p", () => {
    hoisted.mockUseDashboardOverview.mockReturnValue({
      data: populatedOverview,
      isLoading: false,
      isError: false,
    });

    render(<DashboardPage />);

    expect(screen.getByTitle("General Fund")).toBeInTheDocument();
  });
});
