import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockUseOutstandingSummary: vi.fn(),
  mockUseReimbursementCashFlowRadar: vi.fn(),
  mockUsePaymentRequests: vi.fn(),
  mockUseGrants: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUsePaymentRequestMutations: vi.fn(),
  mockCanAccessFeature: vi.fn(),
  routeSearch: {} as { grantId?: string },
}));

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => hoisted.routeSearch,
  }),
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a href={params ? `${to}/${Object.values(params).join("/")}` : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@grantpipe/ui", () => ({
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(" "),
  PageShell: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
  PageHeader: ({ title, kicker }: { title: string; kicker?: string; variant?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {kicker ? <p>{kicker}</p> : null}
    </div>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Button: ({
    children,
    onClick,
    className,
    "aria-pressed": ariaPressed,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    "aria-pressed"?: boolean;
  }) => (
    <button onClick={onClick} className={className} aria-pressed={ariaPressed} {...props}>
      {children}
    </button>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, htmlFor }: { children?: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="dialog" data-open={open}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ dialogOpen?: boolean; onDialogOpen?: () => void }>,
            { dialogOpen: open, onDialogOpen: () => onOpenChange?.(true) },
          );
        }
        return child;
      })}
      <button
        data-testid="dialog-close"
        onClick={() => onOpenChange?.(false)}
        aria-label="Close dialog"
      />
    </div>
  ),
  DialogContent: ({
    children,
    dialogOpen,
  }: {
    children?: React.ReactNode;
    dialogOpen?: boolean;
  }) => (dialogOpen ? <div data-testid="dialog-content">{children}</div> : null),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({
    children,
    asChild: _asChild,
    onDialogOpen,
  }: {
    children?: React.ReactNode;
    asChild?: boolean;
    onDialogOpen?: () => void;
  }) => (
    <div data-testid="dialog-trigger" onClick={onDialogOpen}>
      {children}
    </div>
  ),
  Select: ({
    children,
    name,
    defaultValue,
  }: {
    children?: React.ReactNode;
    name?: string;
    defaultValue?: string;
  }) => (
    <select name={name} defaultValue={defaultValue} aria-label={name}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  TeachAndActEmptyState: ({
    heading,
    description,
    primaryAction,
    helpLink,
  }: {
    icon?: React.ReactNode;
    heading: string;
    description?: React.ReactNode;
    primaryAction?: { label: string; onClick?: () => void; href?: string };
    helpLink?: { label: string; href: string };
  }) => (
    <div data-testid="empty-state">
      <h3>{heading}</h3>
      {description ? <p>{description}</p> : null}
      {primaryAction ? (
        primaryAction.href ? (
          <a href={primaryAction.href}>{primaryAction.label}</a>
        ) : (
          <button type="button" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        )
      ) : null}
      {helpLink ? <a href={helpLink.href}>{helpLink.label}</a> : null}
    </div>
  ),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => ({
    memberRole: "admin",
    memberPermissions: null,
    orgId: "org-1",
    isPending: false,
  }),
}));

vi.mock("../../../lib/access-control", () => ({
  canAccessFeature: hoisted.mockCanAccessFeature,
}));

vi.mock("../../../components/access-denied-state", () => ({
  AccessDeniedState: ({ message }: { title?: string; message?: string }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));

vi.mock("../../../hooks/use-payments", () => ({
  useOutstandingSummary: hoisted.mockUseOutstandingSummary,
  useReimbursementCashFlowRadar: hoisted.mockUseReimbursementCashFlowRadar,
  usePaymentRequests: hoisted.mockUsePaymentRequests,
  usePaymentRequestMutations: hoisted.mockUsePaymentRequestMutations,
}));

vi.mock("../../../hooks/use-grants", () => ({
  useGrants: hoisted.mockUseGrants,
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: hoisted.mockUseOrgBilling,
}));

vi.mock("../../../components/retry-button", () => ({
  RetryButton: ({ query }: { query: unknown }) => (
    <button
      data-testid="retry-button"
      onClick={() => (query as { refetch?: () => void })?.refetch?.()}
    >
      Retry
    </button>
  ),
}));

const mockCaptureRecordFilterChanged = vi.fn();
vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureRecordFilterChanged: (...args: unknown[]) => mockCaptureRecordFilterChanged(...args),
}));

import { PaymentsCashWorkspace, Route, readTrimmedField } from "./index";

const defaultSummary = {
  totalOutstandingCents: 150000,
  submittedCount: 3,
  approvedCount: 1,
  overdueCount: 0,
};

const defaultRequests = {
  data: [
    {
      id: "req-1",
      requestNumber: "PRQ-001",
      grantName: "Science Grant",
      type: "reimbursement",
      status: "submitted",
      requestedAmountCents: 50000,
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
      createdAt: "2026-04-01T00:00:00.000Z",
    },
  ],
};

const emptyCashFlowRadar = {
  totals: {
    totalCashGapCents: 0,
  },
  worklist: [],
};

const populatedCashFlowRadar = {
  totals: {
    unrequestedExpenseCents: 30000,
    submittedCents: 10000,
    approvedOutstandingCents: 5000,
    totalCashGapCents: 45000,
    criticalCount: 1,
    warningCount: 0,
  },
  worklist: [
    {
      grantId: "grant-1",
      grantName: "Science Grant",
      grantStatus: "active",
      unrequestedExpenseCents: 30000,
      submittedCents: 10000,
      approvedOutstandingCents: 5000,
      totalCashGapCents: 45000,
      riskLevel: "critical",
      recommendedAction: "Create a reimbursement request for posted eligible expenses.",
    },
  ],
};

let createRequestMock: ReturnType<typeof vi.fn>;

describe("PaymentsCashWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.routeSearch = {};
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: defaultSummary,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseReimbursementCashFlowRadar.mockReturnValue({
      data: emptyCashFlowRadar,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: defaultRequests,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          { id: "grant-1", name: "Science Grant" },
          { id: "grant-2", name: "Arts Grant" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active", trialEndsAt: null },
    });
    createRequestMock = vi.fn().mockResolvedValue({ id: "new-req-1" });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      createRequest: { mutateAsync: createRequestMock, isPending: false },
    });
    hoisted.mockCanAccessFeature.mockReturnValue(true);
  });

  it("renders page header with correct title and kicker", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByRole("heading", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
    expect(screen.queryByText("Compliance")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounting")).not.toBeInTheDocument();
  });

  it("renders stat row with data-testid", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("payments-stat-row")).toBeInTheDocument();
  });

  it("renders four stat tiles", () => {
    render(<PaymentsCashWorkspace />);
    const tiles = screen.getAllByTestId("stat-tile");
    expect(tiles).toHaveLength(4);
  });

  it("renders summary tiles with correct values", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders the reimbursement cash-flow radar", () => {
    hoisted.mockUseReimbursementCashFlowRadar.mockReturnValue({
      data: populatedCashFlowRadar,
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("cash-flow-radar")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Reimbursement cash-flow radar" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("cash-flow-radar")).getByText("Science Grant"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create a reimbursement request for posted eligible expenses."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$450")).not.toHaveLength(0);
  });

  it("renders an empty radar state when no grants have cash gaps", () => {
    hoisted.mockUseReimbursementCashFlowRadar.mockReturnValue({
      data: { totals: { totalCashGapCents: 0 }, worklist: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("No reimbursement cash gaps right now.")).toBeInTheDocument();
  });

  it("announces a radar load failure", () => {
    hoisted.mockUseReimbursementCashFlowRadar.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load reimbursement cash-flow radar.",
    );
  });

  it("renders overdue count without accent when zero", () => {
    render(<PaymentsCashWorkspace />);
    // overdueCount = 0, no destructive class
    const tiles = screen.getAllByTestId("stat-tile");
    const overdueTile = tiles[3] as HTMLElement;
    const valueEl = overdueTile.querySelector(".text-2xl");
    expect(valueEl).not.toHaveClass("text-destructive");
  });

  it("renders overdue count with accent class when overdue > 0", () => {
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: { ...defaultSummary, overdueCount: 5 },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const tiles = screen.getAllByTestId("stat-tile");
    const overdueTile = tiles[3] as HTMLElement;
    const valueEl = overdueTile.querySelector(".text-2xl");
    expect(valueEl).toHaveClass("text-destructive");
  });

  it("renders status filter chips as pill buttons", () => {
    render(<PaymentsCashWorkspace />);
    const group = screen.getByRole("group", { name: "Filter by status" });
    expect(group).toBeInTheDocument();
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(allBtn).toBeInTheDocument();
    expect(allBtn.tagName).toBe("BUTTON");
    // pill shape: rounded-full class
    expect(allBtn.className).toContain("rounded-full");
  });

  it("renders status filter buttons", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submitted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approved" })).toBeInTheDocument();
  });

  it("All filter chip has aria-pressed=true by default", () => {
    render(<PaymentsCashWorkspace />);
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(allBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders request table with data-testid", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("payments-table")).toBeInTheDocument();
  });

  it("renders request table with request data", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("PRQ-001")).toBeInTheDocument();
    expect(screen.getByText("Science Grant")).toBeInTheDocument();
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
    // "Submitted" appears in both the filter button and the status badge — use getAllByText
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
    expect(screen.getByText("$500")).toBeInTheDocument();
  });

  it("renders skeleton tiles when summary is loading", () => {
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders skeleton rows when requests are loading", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state with retry button when requests fail", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("Unable to load payment requests.")).toBeInTheDocument();
    expect(screen.getByTestId("retry-button")).toBeInTheDocument();
  });

  it("announces the load failure to screen readers via role=alert", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load payment requests.");
  });

  it("renders first-run empty state with a create CTA when allowed", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const region = screen.getByTestId("empty-state");
    expect(screen.getByText(/Your payment requests live here/)).toBeInTheDocument();
    expect(within(region).getByText(/Ask funders for money you're owed\./)).toBeInTheDocument();
    expect(
      within(region).getByRole("button", { name: "Add your first request" }),
    ).toBeInTheDocument();
  });

  it("first-run empty state CTA opens the new payment request dialog", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
    const region = screen.getByTestId("empty-state");
    fireEvent.click(within(region).getByRole("button", { name: "Add your first request" }));
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("first-run empty state shows the help CTA when the user cannot create", () => {
    hoisted.mockCanAccessFeature.mockImplementation(
      (_role, _perms, _feature, action?: string) => action !== "edit",
    );
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const region = screen.getByTestId("empty-state");
    expect(
      within(region).queryByRole("button", { name: "Add your first request" }),
    ).not.toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Open help" })).toBeInTheDocument();
  });

  it("clicking a status filter updates the selection", () => {
    render(<PaymentsCashWorkspace />);
    const submittedBtn = screen.getByRole("button", { name: "Submitted" });
    fireEvent.click(submittedBtn);
    expect(submittedBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("previously active filter chip has aria-pressed=false after switching", () => {
    render(<PaymentsCashWorkspace />);
    const allBtn = screen.getByRole("button", { name: "All" });
    const draftBtn = screen.getByRole("button", { name: "Draft" });
    fireEvent.click(draftBtn);
    expect(allBtn).toHaveAttribute("aria-pressed", "false");
    expect(draftBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("updates hook call when status filter changes", () => {
    render(<PaymentsCashWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    expect(hoisted.mockUsePaymentRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("shows fallback request id when requestNumber is null", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: {
        data: [
          {
            id: "12345678-abcd",
            requestNumber: null,
            type: "drawdown",
            status: "draft",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("12345678")).toBeInTheDocument();
  });

  it("renders link to request detail page", () => {
    render(<PaymentsCashWorkspace />);
    const link = screen.getByRole("link", { name: "PRQ-001" });
    expect(link).toBeInTheDocument();
  });

  it("renders empty period as double dash", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: {
        data: [
          {
            id: "req-2",
            requestNumber: "PRQ-002",
            type: "drawdown",
            status: "approved",
            requestedAmountCents: 0,
            periodStart: null,
            periodEnd: null,
            createdAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    // Multiple "--" for period, created, grantName
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders double dash for invalid date strings", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: {
        data: [
          {
            id: "req-invalid",
            requestNumber: "PRQ-INV",
            type: "reimbursement",
            status: "draft",
            requestedAmountCents: 1000,
            periodStart: "not-a-date",
            periodEnd: "also-not-a-date",
            createdAt: "bad-date",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    // Invalid dates render as "--" for both period parts with a plain hyphen separator
    // The period cell renders: `"-- - --"`
    expect(screen.getByText("-- - --")).toBeInTheDocument();
  });

  it("renders stat tiles with null summary data gracefully", () => {
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: {
        totalOutstandingCents: null,
        submittedCount: null,
        approvedCount: null,
        overdueCount: null,
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    // Null values fall back to 0
    expect(screen.getAllByText("$0").length).toBeGreaterThan(0);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it("renders double dash when status is null", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: {
        data: [
          {
            id: "req-3",
            requestNumber: "PRQ-003",
            type: null,
            status: null,
            requestedAmountCents: null,
            grantName: null,
            periodStart: null,
            periodEnd: null,
            createdAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    // No badge rendered when status is null; multiple dashes present
    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders empty state hint about filter when filter is active", () => {
    // Start with one record so the status-filter chips are visible.
    // Re-mock before clicking so the hook returns empty for the status-filtered call.
    hoisted.mockUsePaymentRequests.mockImplementation(({ status }: { status?: string } = {}) => ({
      data: status === "draft" ? { data: [] } : defaultRequests,
      isLoading: false,
      isError: false,
    }));
    render(<PaymentsCashWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    expect(screen.getByText(/No payment requests match this status/)).toBeInTheDocument();
  });

  it("clearing the status filter from the empty state restores all requests", () => {
    // Seed one record initially; return empty only for the draft-filtered call.
    hoisted.mockUsePaymentRequests.mockImplementation(({ status }: { status?: string } = {}) => ({
      data: status === "draft" ? { data: [] } : defaultRequests,
      isLoading: false,
      isError: false,
    }));
    render(<PaymentsCashWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    // After switching to Draft, the hook returns empty — filter-empty message shows,
    // but the status-filter chips remain visible (hasStatusFilter is true).
    expect(screen.getByTestId("payments-filter-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  // True-empty state chrome gating (Wave 143)
  it("hides status-filter chips and page-filter input in true-empty state", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    // No records, no active filter → chrome must be absent
    expect(screen.queryByRole("group", { name: "Filter by status" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter current page")).not.toBeInTheDocument();
    // But the summary tiles and empty state are still present
    expect(screen.getByTestId("payments-stat-row")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("shows status-filter chips and page-filter input when records exist", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter current page")).toBeInTheDocument();
  });

  it("shows status-filter chips when a status filter is active even with no results", () => {
    // Start with a record so chips are rendered, switch to Draft which returns empty.
    hoisted.mockUsePaymentRequests.mockImplementation(({ status }: { status?: string } = {}) => ({
      data: status === "draft" ? { data: [] } : defaultRequests,
      isLoading: false,
      isError: false,
    }));
    render(<PaymentsCashWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    // hasStatusFilter is true → chips must stay visible so user can clear/change the filter
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
  });

  it("filters the current page by the free-text query", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: {
        data: [
          { ...defaultRequests.data[0] },
          {
            id: "req-2",
            requestNumber: "PRQ-002",
            grantName: "Arts Grant",
            type: "drawdown",
            status: "approved",
            requestedAmountCents: 25000,
            periodStart: null,
            periodEnd: null,
            createdAt: "2026-04-02T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("PRQ-001")).toBeInTheDocument();
    expect(screen.getByText("PRQ-002")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter current page"), {
      target: { value: "arts" },
    });
    expect(screen.queryByText("PRQ-001")).not.toBeInTheDocument();
    expect(screen.getByText("PRQ-002")).toBeInTheDocument();
  });

  it("shows the page-filter-empty hint and clears the query", () => {
    render(<PaymentsCashWorkspace />);
    fireEvent.change(screen.getByLabelText("Filter current page"), {
      target: { value: "no-such-match" },
    });
    expect(screen.getByTestId("payments-page-filter-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    expect(screen.getByText("PRQ-001")).toBeInTheDocument();
  });

  it("renders pagination and pages forward and back when total exceeds the page size", () => {
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: defaultRequests.data, total: 60 },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("payments-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("renders the access-denied state without view permission", () => {
    hoisted.mockCanAccessFeature.mockReturnValue(false);
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("payments-stat-row")).not.toBeInTheDocument();
  });
});

describe("readTrimmedField", () => {
  it("returns the trimmed value when the field is present", () => {
    const form = new FormData();
    form.set("grantId", "  grant-7  ");
    expect(readTrimmedField(form, "grantId")).toBe("grant-7");
  });

  it("returns an empty string when the field is absent", () => {
    const form = new FormData();
    expect(readTrimmedField(form, "grantId")).toBe("");
  });
});

describe("Route.validateSearch", () => {
  const validateSearch = (
    Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => { grantId?: string };
    }
  ).validateSearch;

  it("keeps a non-empty grantId string", () => {
    expect(validateSearch({ grantId: "grant-9" })).toEqual({ grantId: "grant-9" });
  });

  it("drops a blank grantId", () => {
    expect(validateSearch({ grantId: "   " })).toEqual({});
  });

  it("drops a non-string grantId", () => {
    expect(validateSearch({ grantId: 42 })).toEqual({});
  });
});

describe("PaymentsCashWorkspace — create request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.routeSearch = {};
    hoisted.mockUseOutstandingSummary.mockReturnValue({
      data: defaultSummary,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: defaultRequests,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          { id: "grant-1", name: "Science Grant" },
          { id: "grant-2", name: "Arts Grant" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active", trialEndsAt: null },
    });
    createRequestMock = vi.fn().mockResolvedValue({ id: "new-req-1" });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      createRequest: { mutateAsync: createRequestMock, isPending: false },
    });
    hoisted.mockCanAccessFeature.mockReturnValue(true);
    hoisted.mockUseReimbursementCashFlowRadar.mockReturnValue({
      data: emptyCashFlowRadar,
      isLoading: false,
      isError: false,
    });
  });

  function openDialog() {
    fireEvent.click(screen.getByTestId("dialog-trigger"));
  }

  it("renders the Add request button when allowed", () => {
    render(<PaymentsCashWorkspace />);
    expect(screen.getByText("Add request")).toBeInTheDocument();
  });

  it("hides the Add request button without payments edit permission", () => {
    hoisted.mockCanAccessFeature.mockImplementation(
      (_role, _perms, _feature, action?: string) => action !== "edit",
    );
    render(<PaymentsCashWorkspace />);
    expect(screen.queryByText("Add request")).not.toBeInTheDocument();
  });

  it("hides the Add request button when the plan lacks payment requests", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "starter", status: "active", trialEndsAt: null },
    });
    render(<PaymentsCashWorkspace />);
    expect(screen.queryByText("Add request")).not.toBeInTheDocument();
  });

  it("hides the Add request button when billing data is unavailable", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: undefined });
    render(<PaymentsCashWorkspace />);
    expect(screen.queryByText("Add request")).not.toBeInTheDocument();
  });

  it("auto-opens the dialog with grant prefilled from the search param", () => {
    hoisted.routeSearch = { grantId: "grant-2" };
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
    const grantSelect = screen.getByLabelText("grantId") as HTMLSelectElement;
    expect(grantSelect.value).toBe("grant-2");
  });

  it("creates a request with required fields only, omitting blank optionals, then navigates", async () => {
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createRequestMock).toHaveBeenCalledTimes(1));
    expect(createRequestMock).toHaveBeenCalledWith({ grantId: "grant-1", type: "drawdown" });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/payments/$requestId",
        params: { requestId: "new-req-1" },
      }),
    );
  });

  it("includes optional fields when provided, normalizing dates to ISO", async () => {
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.change(screen.getByLabelText("Period start"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.change(screen.getByLabelText("Funder reference"), {
      target: { value: "AWD-123" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Q1 drawdown" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createRequestMock).toHaveBeenCalledTimes(1));
    expect(createRequestMock).toHaveBeenCalledWith({
      grantId: "grant-1",
      type: "drawdown",
      periodStart: "2026-01-01T12:00:00.000Z",
      periodEnd: "2026-03-31T12:00:00.000Z",
      funderReference: "AWD-123",
      notes: "Q1 drawdown",
    });
  });

  it("disambiguates same-named grants in the picker by funder and period year", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-2026",
            name: "Mobile Dental Outreach",
            funderName: "The Hartwell Family Foundation",
            startDate: "2026-01-01",
          },
          {
            id: "grant-2025",
            name: "Mobile Dental Outreach",
            funderName: "Riverbend Community Trust",
            startDate: "2025-01-01",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    openDialog();
    expect(screen.getByText(/The Hartwell Family Foundation.*2026/s)).toBeInTheDocument();
    expect(screen.getByText(/Riverbend Community Trust.*2025/s)).toBeInTheDocument();
  });

  it("renders the grant select with no options when grants data is undefined", () => {
    hoisted.routeSearch = { grantId: "grant-2" };
    hoisted.mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    const grantSelect = screen.getByLabelText("grantId");
    expect(grantSelect).toBeInTheDocument();
    expect(grantSelect.querySelectorAll("option")).toHaveLength(0);
  });

  it("shows a validation error when no grant is available to select", async () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Select a grant for this request.")).toBeInTheDocument();
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the type is cleared", async () => {
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.change(screen.getByLabelText("type"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Select a request type.")).toBeInTheDocument();
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it("blocks creation when the period end precedes the period start", () => {
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.change(screen.getByLabelText("Period start"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("End date must be on or after the start date.")).toBeInTheDocument();
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it("surfaces an error when the create mutation fails", async () => {
    createRequestMock.mockRejectedValueOnce(new Error("boom"));
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(
        screen.getByText("Unable to add the payment request. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("announces the create failure to screen readers via role=alert", async () => {
    createRequestMock.mockRejectedValueOnce(new Error("boom"));
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to add the payment request. Please try again.",
      ),
    );
  });

  it("does not navigate when the created request has no id", async () => {
    createRequestMock.mockResolvedValueOnce({});
    render(<PaymentsCashWorkspace />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createRequestMock).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a pending label while creating", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      createRequest: { mutateAsync: createRequestMock, isPending: true },
    });
    render(<PaymentsCashWorkspace />);
    openDialog();
    const submit = screen.getByRole("button", { name: "Adding…" });
    expect(submit).toBeDisabled();
  });

  it("renders the grant id as the option label when name is missing", () => {
    hoisted.mockUseGrants.mockReturnValue({
      data: { data: [{ id: "grant-x", name: null }] },
      isLoading: false,
      isError: false,
    });
    hoisted.routeSearch = { grantId: "grant-x" };
    render(<PaymentsCashWorkspace />);
    const option = screen.getByRole("option", { name: "grant-x" }) as HTMLOptionElement;
    expect(option.value).toBe("grant-x");
  });

  it("closes the dialog via the close control", () => {
    hoisted.routeSearch = { grantId: "grant-1" };
    render(<PaymentsCashWorkspace />);
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dialog-close"));
    expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
  });

  it("fires captureRecordFilterChanged with record_type=payments on status chip click", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    render(<PaymentsCashWorkspace />);

    const submitted = screen.getByRole("button", { name: "Submitted" });
    fireEvent.click(submitted);

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "payments",
        "status",
        expect.objectContaining({ status: "submitted" }),
      );
    });
  });

  it("fires captureRecordFilterChanged with record_type=payments on search input blur", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    render(<PaymentsCashWorkspace />);

    const searchInput = screen.getByLabelText("Filter current page");
    fireEvent.change(searchInput, { target: { value: "PRQ" } });
    fireEvent.blur(searchInput);

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "payments",
        "search",
        expect.objectContaining({ search: "PRQ" }),
      );
    });
  });
});
