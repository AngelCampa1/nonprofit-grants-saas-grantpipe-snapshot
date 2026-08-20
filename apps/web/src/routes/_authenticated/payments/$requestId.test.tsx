import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  routeParams: { requestId: "req-test-1" } as Record<string, string>,
  mockUsePaymentRequest: vi.fn(),
  mockUsePaymentRequestMutations: vi.fn(),
  mockUseEligibleExpenses: vi.fn(),
  mockUseIndirectCostRules: vi.fn(),
  mockUseSession: vi.fn(),
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

vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureDetailTabViewed: vi.fn(),
  captureRecordViewed: vi.fn(),
  captureRecordSearched: vi.fn(),
  captureDonorExportCompleted: vi.fn(),
  captureRecordFilterApplied: vi.fn(),
  captureRecordSortChanged: vi.fn(),
}));

vi.mock("@grantpipe/ui", () => ({
  Alert: ({
    title,
    variant,
    children,
  }: {
    title?: React.ReactNode;
    variant?: string;
    children?: React.ReactNode;
  }) => (
    <div data-slot="alert" data-variant={variant} role="alert">
      {title ? <p data-slot="alert-title">{title}</p> : null}
      <div>{children}</div>
    </div>
  ),
  PageShell: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
  PageHeader: ({
    title,
    breadcrumb,
    actions,
  }: {
    title: string;
    breadcrumb?: React.ReactNode;
    actions?: React.ReactNode;
    variant?: string;
  }) => (
    <div data-testid="page-header">
      {breadcrumb ? <div data-testid="breadcrumb">{breadcrumb}</div> : null}
      <h1>{title}</h1>
      {actions ? <div data-testid="header-actions">{actions}</div> : null}
    </div>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: { children?: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  Breadcrumb: ({ children }: { children?: React.ReactNode }) => (
    <nav data-testid="breadcrumb-nav">{children}</nav>
  ),
  BreadcrumbList: ({ children }: { children?: React.ReactNode }) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  BreadcrumbLink: ({
    children,
    asChild,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }) =>
    // Mirror the real component's Radix Slot behavior: when asChild is set the
    // child already renders the anchor, so we must not wrap it in another <a>
    // (doing so produces an invalid nested-anchor and a validateDOMNesting warning).
    asChild ? <>{children}</> : <a {...props}>{children}</a>,
  BreadcrumbPage: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  BreadcrumbSeparator: ({ children }: { children?: React.ReactNode }) => (
    <li aria-hidden="true">{children ?? "/"}</li>
  ),
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
            child as React.ReactElement<{
              dialogOpen?: boolean;
              onDialogOpen?: () => void;
            }>,
            {
              dialogOpen: open,
              onDialogOpen: () => onOpenChange?.(true),
            },
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
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, htmlFor }: { children?: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Select: ({
    children,
    name,
    required,
    defaultValue,
  }: {
    children?: React.ReactNode;
    name?: string;
    required?: boolean;
    defaultValue?: string;
  }) => (
    <select name={name} required={required} defaultValue={defaultValue}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Tabs: ({
    children,
    defaultValue,
    onValueChange,
  }: {
    children?: React.ReactNode;
    defaultValue?: string;
    className?: string;
    onValueChange?: (value: string) => void;
  }) => {
    const [activeTab, setActiveTab] = React.useState(defaultValue ?? "");
    return (
      <div data-testid="tabs" data-active={activeTab}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(
              child as React.ReactElement<{
                activeTab?: string;
                onTabChange?: (v: string) => void;
              }>,
              {
                activeTab,
                onTabChange: (value: string) => {
                  setActiveTab(value);
                  onValueChange?.(value);
                },
              },
            );
          }
          return child;
        })}
      </div>
    );
  },
  TabsList: ({
    children,
    activeTab,
    onTabChange,
  }: {
    children?: React.ReactNode;
    activeTab?: string;
    onTabChange?: (v: string) => void;
    variant?: string;
  }) => (
    <div role="tablist" data-testid="tabs-list">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              isActive?: boolean;
              onActivate?: () => void;
            }>,
            {
              isActive: (child.props as { value?: string }).value === activeTab,
              onActivate: () => onTabChange?.((child.props as { value?: string }).value ?? ""),
            },
          );
        }
        return child;
      })}
    </div>
  ),
  TabsTrigger: ({
    children,
    value,
    isActive,
    onActivate,
  }: {
    children?: React.ReactNode;
    value: string;
    isActive?: boolean;
    onActivate?: () => void;
    className?: string;
  }) => (
    <button role="tab" data-value={value} aria-selected={isActive} onClick={onActivate}>
      {children}
    </button>
  ),
  TabsContent: ({
    children,
    value,
    activeTab,
  }: {
    children?: React.ReactNode;
    value: string;
    activeTab?: string;
    className?: string;
  }) => (
    <div data-testid={`tab-content-${value}`} hidden={activeTab !== value}>
      {children}
    </div>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
  DialogClose: ({
    children,
    asChild,
  }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) =>
    asChild ? (children as React.ReactElement) : <div>{children}</div>,
}));

vi.mock("../../../components/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    title,
    confirmLabel = "Confirm",
    onConfirm,
    isPending = false,
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
      <div data-testid="confirm-dialog" role="dialog" aria-label={title}>
        <p>{title}</p>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
          disabled={isPending}
        >
          {confirmLabel}
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../../../hooks/use-payments", () => ({
  usePaymentRequest: hoisted.mockUsePaymentRequest,
  usePaymentRequestMutations: hoisted.mockUsePaymentRequestMutations,
  useEligibleExpenses: hoisted.mockUseEligibleExpenses,
  useIndirectCostRules: hoisted.mockUseIndirectCostRules,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

vi.mock("../../../components/entity-activity-section", () => ({
  EntityActivitySection: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="entity-activity-section">
      Activity for {entityType} {entityId}
    </div>
  ),
}));

vi.mock("../../../components/entity-documents-section", () => ({
  EntityDocumentsSection: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="entity-documents-section">
      Documents for {entityType} {entityId}
    </div>
  ),
}));

vi.mock("../../../components/retry-button", () => ({
  RetryButton: () => <button data-testid="retry-button">Retry</button>,
}));

const defaultMutations = {
  createRequest: { mutateAsync: vi.fn(), isPending: false },
  updateRequest: { mutateAsync: vi.fn(), isPending: false },
  deleteRequest: { mutateAsync: vi.fn(), isPending: false },
  transitionRequest: { mutateAsync: vi.fn(), isPending: false },
  addLine: { mutateAsync: vi.fn(), isPending: false },
  updateLine: { mutateAsync: vi.fn(), isPending: false },
  removeLine: { mutateAsync: vi.fn(), isPending: false },
  createAdjustment: { mutateAsync: vi.fn(), isPending: false },
  recordPayment: { mutateAsync: vi.fn(), isPending: false },
  removePayment: { mutateAsync: vi.fn(), isPending: false },
  recomputeIndirect: { mutateAsync: vi.fn(), isPending: false },
  previewUniformGuidanceGuardrails: {
    mutateAsync: vi.fn().mockResolvedValue({
      applicable: false,
      status: "clear",
      findingCount: 0,
      findings: [],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5000000,
        equipmentThresholdCents: 1000000,
      },
    }),
    isPending: false,
    data: null,
  },
  createIndirectRule: { mutateAsync: vi.fn(), isPending: false },
  updateIndirectRule: { mutateAsync: vi.fn(), isPending: false },
  deleteIndirectRule: { mutateAsync: vi.fn(), isPending: false },
};

const defaultRequest = {
  id: "req-test-1",
  requestNumber: "PRQ-001",
  status: "draft",
  type: "reimbursement",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-03-31T00:00:00.000Z",
  funderReference: "REF-123",
  notes: "Test notes",
  requestedAmountCents: 50000,
  approvedAmountCents: null,
  grant: { id: "grant-1", name: "Science Grant" },
  lines: [
    {
      id: "line-1",
      description: "Travel expense",
      category: "direct",
      amountCents: 50000,
      approvedAmountCents: null,
      rejectionReason: null,
    },
  ],
  adjustments: [],
  payments: [],
};

import { PaymentRequestDetailPage } from "./$requestId";

describe("PaymentRequestDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.routeParams = { requestId: "req-test-1" };
    hoisted.mockUsePaymentRequestMutations.mockReturnValue(defaultMutations);
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: { payments: "manage" },
    });
  });

  it("renders loading skeleton when request is loading", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state when request fails", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByText("Unable to load payment request.")).toBeInTheDocument();
    expect(screen.getByTestId("retry-button")).toBeInTheDocument();
  });

  it("renders page header with request number", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("heading", { name: "Request #PRQ-001" })).toBeInTheDocument();
  });

  it("renders status badge", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByTestId("badge")).toHaveTextContent("Draft");
  });

  it("renders tab list with all tabs", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lines" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Adjustments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Documents" })).toBeInTheDocument();
  });

  it("renders overview tab content by default", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    const overviewContent = screen.getByTestId("tab-content-overview");
    expect(overviewContent).not.toHaveAttribute("hidden");
    expect(overviewContent).toHaveTextContent("Request details");
  });

  it("shows grant link in overview", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("link", { name: "Science Grant" })).toBeInTheDocument();
  });

  it("shows funder reference and notes in draft mode", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByDisplayValue("REF-123")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test notes")).toBeInTheDocument();
  });

  it("shows line data in lines tab", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    // Switch to lines tab
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const linesContent = screen.getByTestId("tab-content-lines");
    expect(linesContent).toHaveTextContent("Travel expense");
    expect(linesContent).toHaveTextContent("$500");
  });

  it("shows add line button when in draft status", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    expect(screen.getByRole("button", { name: "Add line" })).toBeInTheDocument();
  });

  it("shows transition dialog trigger when transitions are available", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("button", { name: "Transition status" })).toBeInTheDocument();
  });

  it("does not show transition button for closed status", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "closed" },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.queryByRole("button", { name: "Transition status" })).not.toBeInTheDocument();
  });

  it("opens transition dialog when button is clicked", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    expect(screen.getByRole("heading", { name: "Transition status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply transition" })).toBeInTheDocument();
  });

  it("submits a status transition with an approved amount", async () => {
    const transitionRequest = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      transitionRequest: { mutateAsync: transitionRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted" },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    fireEvent.change(container.querySelector('select[name="toStatus"]')!, {
      target: { value: "approved" },
    });
    fireEvent.change(screen.getByLabelText("Approved amount (dollars)"), {
      target: { value: "123.45" },
    });
    fireEvent.submit(container.querySelector('[data-testid="dialog-content"] form')!);

    await waitFor(() =>
      expect(transitionRequest).toHaveBeenCalledWith({
        fromStatus: "submitted",
        toStatus: "approved",
        approvedAmountCents: 12345,
      }),
    );
  });

  it("blocks an approve transition when the approved amount is blank", async () => {
    const transitionRequest = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      transitionRequest: { mutateAsync: transitionRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted" },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    fireEvent.change(container.querySelector('select[name="toStatus"]')!, {
      target: { value: "approved" },
    });
    fireEvent.submit(container.querySelector('[data-testid="dialog-content"] form')!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the approved amount to approve this request.",
    );
    expect(transitionRequest).not.toHaveBeenCalled();
  });

  it("shows transition mutation errors", async () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      transitionRequest: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Transition failed")),
        isPending: false,
      },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    fireEvent.change(container.querySelector('select[name="toStatus"]')!, {
      target: { value: "submitted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply transition" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Transition failed");
  });

  it("renders record payment button for approved status", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved" },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
  });

  it("does not show add line button for non-draft status", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted" },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    expect(screen.queryByRole("button", { name: "Add line" })).not.toBeInTheDocument();
  });

  it("shows adjustments tab content", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        adjustments: [
          {
            id: "adj-1",
            kind: "reduction",
            amountCents: 1000,
            reason: "Duplicate",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    const adjContent = screen.getByTestId("tab-content-adjustments");
    expect(adjContent).toHaveTextContent("Reduction");
    expect(adjContent).toHaveTextContent("Duplicate");
  });

  it("shows payments tab content", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "paid",
        payments: [
          {
            id: "pmt-1",
            receivedDate: "2026-05-01T00:00:00.000Z",
            amountCents: 50000,
            method: "ach",
            referenceNumber: "ACH-001",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    const paymentsContent = screen.getByTestId("tab-content-payments");
    expect(paymentsContent).toHaveTextContent("$500");
    expect(paymentsContent).toHaveTextContent("ACH");
    expect(paymentsContent).toHaveTextContent("ACH-001");
  });

  it("renders activity section in activity tab", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    const activitySection = screen.getByTestId("entity-activity-section");
    expect(activitySection).toBeInTheDocument();
    expect(activitySection).toHaveTextContent("payment_request");
  });

  it("renders documents section in documents tab", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.getByTestId("entity-documents-section")).toBeInTheDocument();
  });

  it("does not call removeLine immediately — shows confirm dialog first", async () => {
    const removeLine = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      removeLine: { mutateAsync: removeLine, isPending: false },
    });

    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const removeBtn = screen.getByRole("button", { name: "Remove" });
    fireEvent.click(removeBtn);
    expect(removeLine).not.toHaveBeenCalled();

    expect(screen.getByText("Remove line item?")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);
    await waitFor(() => expect(removeLine).toHaveBeenCalledWith("line-1"));
  });

  it("uses request id slice as fallback requestNumber", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, requestNumber: null },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("heading", { name: /Request #req-test/ })).toBeInTheDocument();
  });

  it("shows empty payments state when no payments recorded", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByText("No payments recorded.")).toBeInTheDocument();
  });

  it("opens record payment dialog and submits successfully", async () => {
    const recordPayment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recordPayment: { mutateAsync: recordPayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    // Open dialog by clicking the Record payment button (wrapped by DialogTrigger)
    const paymentsContent = screen.getByTestId("tab-content-payments");
    const triggers = paymentsContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    // Fill in form
    fireEvent.change(screen.getByLabelText("Date received"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Amount (dollars)"), {
      target: { value: "500" },
    });

    // Submit form
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 50000,
          receivedDate: expect.stringContaining("2026-05-01"),
        }),
      ),
    );
  });

  it("records payments with ISO dates and omits invalid optional method fields", async () => {
    const recordPayment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recordPayment: { mutateAsync: recordPayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    fireEvent.click(
      screen.getByTestId("tab-content-payments").querySelector("[data-testid='dialog-trigger']")!,
    );

    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    const receivedDate = screen.getByLabelText("Date received") as HTMLInputElement;
    Object.defineProperty(receivedDate, "value", {
      configurable: true,
      value: "2026-05-01T00:00:00.000Z",
    });
    fireEvent.change(screen.getByLabelText("Amount (dollars)"), {
      target: { value: "25" },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(recordPayment).toHaveBeenCalledWith({
        receivedDate: "2026-05-01T00:00:00.000Z",
        amountCents: 2500,
        method: "ach",
        referenceNumber: undefined,
      }),
    );
  });

  it("shows validation error when record payment amount is invalid", async () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    const paymentsContent = screen.getByTestId("tab-content-payments");
    const triggers = paymentsContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    // Submit without amount (empty field → NaN → validation fails)
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a valid amount greater than zero.",
      ),
    );
  });

  it("shows mutation error when recordPayment rejects", async () => {
    const recordPayment = vi.fn().mockRejectedValue(new Error("Server error"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recordPayment: { mutateAsync: recordPayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    const paymentsContent = screen.getByTestId("tab-content-payments");
    const triggers = paymentsContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    fireEvent.change(screen.getByLabelText("Amount (dollars)"), {
      target: { value: "100" },
    });
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server error"));
  });

  it("clears payment error when dialog is closed and reopened", async () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    const paymentsContent = screen.getByTestId("tab-content-payments");
    const triggers = paymentsContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    // Trigger validation error
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Close dialog via the close button injected by the mock Dialog
    const dialogEl = paymentsContent.querySelector("[data-testid='dialog']");
    const closeBtn = dialogEl?.querySelector("[data-testid='dialog-close']");
    fireEvent.click(closeBtn!);

    // Reopen
    fireEvent.click(triggers[0] as Element);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not call removePayment immediately — shows confirm dialog first", async () => {
    const removePayment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      removePayment: { mutateAsync: removePayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "paid",
        payments: [
          {
            id: "pmt-1",
            receivedDate: "2026-05-01T00:00:00.000Z",
            amountCents: 50000,
            method: "ach",
            referenceNumber: "ACH-001",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    const removeBtn = screen.getByRole("button", { name: "Remove" });
    fireEvent.click(removeBtn);
    expect(removePayment).not.toHaveBeenCalled();

    expect(screen.getByText("Remove payment?")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);
    await waitFor(() => expect(removePayment).toHaveBeenCalledWith("pmt-1"));
  });

  it("shows non-Error mutation failure message for recordPayment", async () => {
    const recordPayment = vi.fn().mockRejectedValue("plain string error");
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recordPayment: { mutateAsync: recordPayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));

    const paymentsContent = screen.getByTestId("tab-content-payments");
    const triggers = paymentsContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    fireEvent.change(screen.getByLabelText("Amount (dollars)"), {
      target: { value: "100" },
    });
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to record payment."),
    );
  });

  it("renders adjustment row with null kind as double dash", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        adjustments: [
          {
            id: "adj-null",
            kind: null,
            amountCents: null,
            reason: null,
            createdAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    const adjContent = screen.getByTestId("tab-content-adjustments");
    // kind null → "--", amountCents null → "--", reason null → "--"
    const dashes = adjContent.querySelectorAll("td");
    expect(Array.from(dashes).some((td) => td.textContent === "--")).toBe(true);
  });

  it("shows empty adjustments state when no adjustments recorded", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, adjustments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    expect(screen.getByText("No adjustments recorded.")).toBeInTheDocument();
  });

  it("shows add adjustment button for draft status and submits", async () => {
    const createAdjustment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createAdjustment: { mutateAsync: createAdjustment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, adjustments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));

    const adjContent = screen.getByTestId("tab-content-adjustments");
    const triggers = adjContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Test reason" } });
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "Test reason" }),
      ),
    );
  });

  it("shows adjustment error when createAdjustment rejects", async () => {
    const createAdjustment = vi.fn().mockRejectedValue(new Error("Adj failed"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createAdjustment: { mutateAsync: createAdjustment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, adjustments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));

    const adjContent = screen.getByTestId("tab-content-adjustments");
    const triggers = adjContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Adj failed"));
  });

  it("renders lines with null-safe fields", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        lines: [
          {
            id: "line-null",
            description: null,
            category: null,
            amountCents: null,
            approvedAmountCents: null,
            rejectionReason: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const linesContent = screen.getByTestId("tab-content-lines");
    expect(linesContent).toBeInTheDocument();
  });

  it("renders overview with no grant link when grant is null", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, grant: null },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    expect(screen.queryByRole("link", { name: /Science Grant/ })).not.toBeInTheDocument();
  });

  it("renders non-draft overview without edit fields", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted" },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    // In non-draft mode the type is shown as plain text, not a select
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("submits the overview details form and calls updateRequest", async () => {
    const updateRequest = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: updateRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    // The overview tab is active by default
    const overviewContent = screen.getByTestId("tab-content-overview");
    const form = overviewContent.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() => expect(updateRequest).toHaveBeenCalled());
  });

  it("silently swallows updateRequest errors", async () => {
    const updateRequest = vi.fn().mockRejectedValue(new Error("Server error"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: updateRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    const overviewContent = screen.getByTestId("tab-content-overview");
    const form = overviewContent.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    // Should not throw; error is swallowed (shown via toast in production)
    await waitFor(() => expect(updateRequest).toHaveBeenCalled());
  });

  it("overview form does nothing when status is not draft", async () => {
    const updateRequest = vi.fn();
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: updateRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted" },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    const overviewContent = screen.getByTestId("tab-content-overview");
    const form = overviewContent.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    // isDraft is false → early return → updateRequest not called
    await new Promise((r) => setTimeout(r, 50));
    expect(updateRequest).not.toHaveBeenCalled();
  });

  it("renders sparse request defaults and submits blank overview fields as undefined", async () => {
    const updateRequest = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: updateRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        id: "req-test-1",
        requestNumber: null,
        status: null,
        type: null,
        periodStart: "not-a-date",
        periodEnd: null,
        funderReference: null,
        notes: null,
        requestedAmountCents: null,
        approvedAmountCents: null,
        grant: { name: "Grant Without Id" },
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);

    expect(screen.getByRole("heading", { name: /Request #req-test/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grant Without Id" })).toHaveAttribute(
      "href",
      "/grants/$grantId/",
    );
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);

    const overviewContent = screen.getByTestId("tab-content-overview");
    const form = overviewContent.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(updateRequest).toHaveBeenCalledWith({
        type: "drawdown",
        notes: undefined,
        funderReference: undefined,
      }),
    );
  });

  it("submits undefined when the overview type field has an unsupported value", async () => {
    const updateRequest = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: updateRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    const select = document.querySelector('select[name="type"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "unsupported_type" } });
    fireEvent.submit(select.closest("form")!);

    await waitFor(() =>
      expect(updateRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          type: undefined,
        }),
      ),
    );
  });

  it("renders pending labels for payment request mutations", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      transitionRequest: { mutateAsync: vi.fn(), isPending: true },
      createAdjustment: { mutateAsync: vi.fn(), isPending: true },
      recordPayment: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: { data: [{ id: "exp-pending", description: "Pending expense", amountCents: 1000 }] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    fireEvent.click(
      screen
        .getByTestId("tab-content-adjustments")
        .querySelector("[data-testid='dialog-trigger']")!,
    );
    expect(screen.getAllByRole("button", { name: /Saving/ }).at(-1)).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    fireEvent.click(
      screen.getByTestId("tab-content-payments").querySelector("[data-testid='dialog-trigger']")!,
    );
    expect(screen.getAllByRole("button", { name: /Saving/ }).at(-1)).toBeDisabled();
  });

  it("renders line with approved amount when not null", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        lines: [
          {
            id: "line-approved",
            description: "Approved line",
            category: "direct",
            amountCents: 50000,
            approvedAmountCents: 45000,
            rejectionReason: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const linesContent = screen.getByTestId("tab-content-lines");
    expect(linesContent).toHaveTextContent("$450");
    expect(linesContent).toHaveTextContent("Direct");
    expect(linesContent).not.toHaveTextContent("direct");
  });

  it("hides mutating controls when payment access is read-only", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { payments: "view" },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "approved",
        payments: [
          {
            id: "pmt-view-only",
            receivedDate: "2026-05-10T00:00:00.000Z",
            amountCents: 25000,
            method: "check",
            referenceNumber: "CHK-101",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);

    expect(screen.queryByRole("button", { name: "Transition status" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    expect(screen.queryByRole("button", { name: "Add adjustment" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("submits add adjustment with dollar amount", async () => {
    const createAdjustment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createAdjustment: { mutateAsync: createAdjustment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, adjustments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));

    const adjContent = screen.getByTestId("tab-content-adjustments");
    const triggers = adjContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Overcharge" } });
    // Provide a dollar amount to exercise the amountCents branch
    fireEvent.change(screen.getByLabelText("Amount (dollars, optional)"), {
      target: { value: "150" },
    });

    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 15000, reason: "Overcharge" }),
      ),
    );
  });

  it("shows payment method as uppercase when method is set", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "paid",
        payments: [
          {
            id: "pmt-check",
            receivedDate: "2026-05-10T00:00:00.000Z",
            amountCents: 25000,
            method: "check",
            referenceNumber: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByText("Check")).toBeInTheDocument();
  });

  it("shows empty lines message for draft with no lines", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    expect(screen.getByText(/No lines added yet.*Add an expense line/)).toBeInTheDocument();
  });

  it("shows empty lines message for non-draft with no lines", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "submitted", lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    expect(screen.getByText(/No lines added yet/)).toBeInTheDocument();
    // In non-draft mode, "Add an expense line" prompt should not appear
    expect(screen.queryByText(/Add an expense line/)).not.toBeInTheDocument();
  });

  it("AddLineDialog shows eligible expenses and submits successfully", async () => {
    const addLine = vi.fn().mockResolvedValue(undefined);
    const preview = vi.fn().mockResolvedValue({
      applicable: false,
      status: "clear",
      findingCount: 0,
      findings: [],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5000000,
        equipmentThresholdCents: 1000000,
      },
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      addLine: { mutateAsync: addLine, isPending: false },
      previewUniformGuidanceGuardrails: {
        mutateAsync: preview,
        isPending: false,
        data: null,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-1",
            description: "Mileage",
            amountCents: 12500,
            date: "2026-03-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    // Select the expense
    const radioBtn = screen.getByRole("radio", { name: /Select expense Mileage/ });
    fireEvent.click(radioBtn);

    // Submit
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(addLine).toHaveBeenCalledWith(expect.objectContaining({ expenseId: "exp-1" })),
    );
  });

  it("AddLineDialog shows Uniform Guidance guardrail warnings for selected expenses", async () => {
    const previewResult = {
      applicable: true,
      status: "warning",
      findingCount: 1,
      findings: [
        {
          code: "mtdc_subaward_cap",
          severity: "warning",
          title: "MTDC subaward cap",
          message: "Only the first $50,000 of each subaward can be included in MTDC.",
          source: "expense",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5000000,
        equipmentThresholdCents: 1000000,
      },
    };
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      previewUniformGuidanceGuardrails: {
        mutateAsync: vi.fn().mockResolvedValue(previewResult),
        isPending: false,
        data: null,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-1",
            description: "Subaward",
            amountCents: 6000000,
            date: "2026-03-01T00:00:00.000Z",
            category: "subaward",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const triggers = screen
      .getByTestId("tab-content-lines")
      .querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);
    fireEvent.click(screen.getByRole("radio", { name: /Select expense Subaward/ }));

    await waitFor(() => expect(screen.getByText("Cost may need review")).toBeInTheDocument());
    expect(
      screen.getByText("Only the first $50,000 of each subaward can be included in MTDC."),
    ).toBeInTheDocument();
  });

  it("AddLineDialog disables submit when a guardrail blocks the selected expense", async () => {
    const addLine = vi.fn().mockResolvedValue(undefined);
    const previewResult = {
      applicable: true,
      status: "blocked",
      findingCount: 1,
      findings: [
        {
          code: "unallowable_budget_line",
          severity: "block",
          title: "Unallowable budget line",
          message: "This budget line is marked unallowable for the award.",
          source: "budget_line",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5000000,
        equipmentThresholdCents: 1000000,
      },
    };
    const preview = vi.fn().mockResolvedValue(previewResult);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      addLine: { mutateAsync: addLine, isPending: false },
      previewUniformGuidanceGuardrails: {
        mutateAsync: preview,
        isPending: false,
        data: null,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-1",
            description: "Lobbying",
            amountCents: 12500,
            date: "2026-03-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const triggers = screen
      .getByTestId("tab-content-lines")
      .querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);
    fireEvent.click(screen.getByRole("radio", { name: /Select expense Lobbying/ }));

    await waitFor(() => expect(screen.getByText("Cost review blocked")).toBeInTheDocument());
    expect(
      screen.getByTestId("dialog-content").querySelector("button[type='submit']"),
    ).toBeDisabled();
    fireEvent.submit(screen.getByTestId("dialog-content").querySelector("form")!);
    expect(screen.getByText("Fix this item before adding the line.")).toBeInTheDocument();
    expect(addLine).not.toHaveBeenCalled();
  });

  it("AddLineDialog shows a preview error when guardrail review fails", async () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      previewUniformGuidanceGuardrails: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Could not check this cost.")),
        isPending: false,
        data: null,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-1",
            description: "Travel",
            amountCents: 12500,
            date: "2026-03-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    const triggers = screen
      .getByTestId("tab-content-lines")
      .querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);
    fireEvent.click(screen.getByRole("radio", { name: /Select expense Travel/ }));

    await waitFor(() => expect(screen.getByText("Could not check this cost.")).toBeInTheDocument());
  });

  it("AddLineDialog handles sparse eligible expense rows and pending state", async () => {
    const addLine = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      addLine: { mutateAsync: addLine, isPending: false },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-sparse",
            description: null,
            amountCents: null,
            date: "not-a-date",
            category: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.click(
      screen.getByTestId("tab-content-lines").querySelector("[data-testid='dialog-trigger']")!,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select expense exp-sparse/ }));

    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    fireEvent.submit(screen.getByTestId("dialog-content").querySelector("form")!);

    await waitFor(() =>
      expect(addLine).toHaveBeenCalledWith({
        expenseId: "exp-sparse",
        amountCents: 0,
        category: "direct",
        sortOrder: 0,
      }),
    );
  });

  it("AddLineDialog shows error when no expense selected", async () => {
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-2",
            description: "Supply",
            amountCents: 5000,
            date: "2026-04-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    // Submit without selecting
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Select an expense to add."),
    );
  });

  it("AddLineDialog shows error when addLine rejects", async () => {
    const addLine = vi.fn().mockRejectedValue(new Error("Add line failed"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      addLine: { mutateAsync: addLine, isPending: false },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-3",
            description: "Travel",
            amountCents: 8000,
            date: null,
            category: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    const radioBtn = screen.getByRole("radio", { name: /Select expense Travel/ });
    fireEvent.click(radioBtn);

    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Add line failed"));
  });

  it("AddLineDialog shows loading skeleton when expenses load", () => {
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("AddLineDialog shows error state when expenses fail to load", () => {
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    expect(screen.getByText("Unable to load eligible expenses.")).toBeInTheDocument();
  });

  it("AddLineDialog shows empty message when no eligible expenses", () => {
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, lines: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    const linesContent = screen.getByTestId("tab-content-lines");
    const triggers = linesContent.querySelectorAll("[data-testid='dialog-trigger']");
    fireEvent.click(triggers[0] as Element);

    expect(screen.getByText("No eligible expenses found for this grant.")).toBeInTheDocument();
  });

  it("shows double dash for payment method when method is null", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "paid",
        payments: [
          {
            id: "pmt-no-method",
            receivedDate: "2026-05-10T00:00:00.000Z",
            amountCents: 25000,
            method: null,
            referenceNumber: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    const paymentsContent = screen.getByTestId("tab-content-payments");
    // method null → "--", referenceNumber null → "--"
    const cells = paymentsContent.querySelectorAll("td");
    expect(Array.from(cells).filter((td) => td.textContent === "--").length).toBeGreaterThan(0);
  });

  it("renders sparse non-draft overview fields and status transition fallbacks", async () => {
    const transitionRequest = vi.fn().mockRejectedValue("plain failure");
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      transitionRequest: { mutateAsync: transitionRequest, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "submitted",
        type: null,
        funderReference: null,
        notes: null,
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<PaymentRequestDetailPage />);

    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);

    fireEvent.click(screen.getByRole("button", { name: "Transition status" }));
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    const toStatus = container.querySelector('select[name="toStatus"]') as HTMLSelectElement;
    const approvedAmount = screen.getByLabelText("Approved amount (dollars)") as HTMLInputElement;
    toStatus.removeAttribute("name");
    approvedAmount.removeAttribute("name");
    fireEvent.submit(form);

    await waitFor(() =>
      expect(transitionRequest).toHaveBeenCalledWith({
        fromStatus: "submitted",
        toStatus: "",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to transition status.");

    fireEvent.click(screen.getAllByTestId("dialog-close")[0]!);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("renders draft save and add-line pending states", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateRequest: { mutateAsync: vi.fn(), isPending: true },
      addLine: { mutateAsync: vi.fn(), isPending: true },
      previewUniformGuidanceGuardrails: {
        mutateAsync: vi.fn(() => new Promise(() => undefined)),
        isPending: true,
        data: null,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-pending-line",
            description: "Pending line expense",
            amountCents: 1000,
            date: "2026-01-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);

    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.click(
      screen.getByTestId("tab-content-lines").querySelector("[data-testid='dialog-trigger']")!,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Select expense Pending line expense/ }));
    expect(screen.getByText("Checking award rules…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adding/ })).toBeDisabled();
  });

  it("uses fallback errors for add-line and adjustment failures", async () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      addLine: { mutateAsync: vi.fn().mockRejectedValue("plain failure"), isPending: false },
      createAdjustment: {
        mutateAsync: vi.fn().mockRejectedValue("plain failure"),
        isPending: false,
      },
    });
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: {
        data: [
          {
            id: "exp-fallback",
            description: "Fallback expense",
            amountCents: 2500,
            date: "2026-01-01T00:00:00.000Z",
            category: "direct",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.click(
      screen.getByTestId("tab-content-lines").querySelector("[data-testid='dialog-trigger']")!,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Select expense Fallback expense/ }));
    fireEvent.submit(screen.getByTestId("dialog-content").querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to add line.");
    fireEvent.click(screen.getAllByTestId("dialog-close")[1]!);

    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    fireEvent.click(
      screen
        .getByTestId("tab-content-adjustments")
        .querySelector("[data-testid='dialog-trigger']")!,
    );
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Fallback note" } });
    const adjustmentForm = screen
      .getAllByTestId("dialog-content")
      .at(-1)!
      .querySelector("form") as HTMLFormElement;
    (adjustmentForm.querySelector('select[name="kind"]') as HTMLSelectElement).removeAttribute(
      "name",
    );
    (screen.getByLabelText("Amount (dollars, optional)") as HTMLInputElement).removeAttribute(
      "name",
    );
    fireEvent.submit(adjustmentForm);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create adjustment.");
    fireEvent.click(screen.getAllByTestId("dialog-close")[2]!);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("submits record payment with missing optional form names", async () => {
    const recordPayment = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recordPayment: { mutateAsync: recordPayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, status: "approved", payments: [] },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    fireEvent.click(
      screen.getByTestId("tab-content-payments").querySelector("[data-testid='dialog-trigger']")!,
    );
    const form = screen.getByTestId("dialog-content").querySelector("form") as HTMLFormElement;
    (screen.getByLabelText("Date received") as HTMLInputElement).removeAttribute("name");
    fireEvent.change(screen.getByLabelText("Amount (dollars)"), { target: { value: "42.50" } });
    (form.querySelector('select[name="method"]') as HTMLSelectElement).removeAttribute("name");
    (screen.getByLabelText("Reference number (optional)") as HTMLInputElement).removeAttribute(
      "name",
    );
    fireEvent.submit(form);

    await waitFor(() =>
      expect(recordPayment).toHaveBeenCalledWith({
        receivedDate: "T12:00:00.000Z",
        amountCents: 4250,
        method: undefined,
        referenceNumber: undefined,
      }),
    );
  });

  it("surfaces an error when removing a line fails", async () => {
    const removeLine = vi.fn().mockRejectedValue(new Error("Line removal failed."));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      removeLine: { mutateAsync: removeLine, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);

    expect(await screen.findByText("Line removal failed.")).toBeInTheDocument();
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
  });

  it("surfaces a fallback error when removing a payment fails with a non-Error", async () => {
    const removePayment = vi.fn().mockRejectedValue("boom");
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      removePayment: { mutateAsync: removePayment, isPending: false },
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: {
        ...defaultRequest,
        status: "paid",
        payments: [
          {
            id: "pmt-1",
            receivedDate: "2026-05-01T00:00:00.000Z",
            amountCents: 50000,
            method: "ach",
            referenceNumber: "ACH-001",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);

    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });
});

describe("PaymentRequestDetailPage — Indirect cost tab", () => {
  const sampleRule = {
    id: "rule-1",
    grantId: "grant-1",
    base: "modified_total_direct",
    rateBasisPoints: 1500,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
  };

  function setIndirectEntitledPlan(overrides?: { memberRole?: string; payments?: string }) {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: overrides?.memberRole ?? "admin",
      memberPermissions: { payments: overrides?.payments ?? "manage" },
      effectivePlanTier: "growth",
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.routeParams = { requestId: "req-test-1" };
    hoisted.mockUsePaymentRequestMutations.mockReturnValue(defaultMutations);
    hoisted.mockUseEligibleExpenses.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: defaultRequest,
      isLoading: false,
      isError: false,
    });
    setIndirectEntitledPlan();
  });

  it("hides the Indirect tab when plan tier lacks the entitlement", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: { payments: "manage" },
      effectivePlanTier: "starter",
    });
    render(<PaymentRequestDetailPage />);
    expect(screen.queryByRole("tab", { name: "Indirect" })).not.toBeInTheDocument();
  });

  it("shows the Indirect tab when plan tier is Growth", () => {
    render(<PaymentRequestDetailPage />);
    expect(screen.getByRole("tab", { name: "Indirect" })).toBeInTheDocument();
  });

  it("calls recomputeIndirect when the calculate button is clicked", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(null);
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: { mutateAsync, isPending: false, isSuccess: false, data: undefined },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate indirect cost" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("renders the computed indirect result", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: {
        mutateAsync: vi.fn(),
        isPending: false,
        isSuccess: true,
        data: {
          ruleId: "rule-1",
          base: "modified_total_direct",
          rateBasisPoints: 1500,
          baseAmountCents: 100000,
          indirectAmountCents: 15000,
        },
      },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getByText("Modified total direct cost (MTDC)")).toBeInTheDocument();
    expect(screen.getByText("15.00%")).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("$150")).toBeInTheDocument();
  });

  it("shows a no-active-rule message when recompute returns null", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: {
        mutateAsync: vi.fn(),
        isPending: false,
        isSuccess: true,
        data: null,
      },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(
      screen.getByText("No active indirect cost rule applies to this request."),
    ).toBeInTheDocument();
  });

  it("surfaces a recompute error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("recompute boom"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: { mutateAsync, isPending: false, isSuccess: false, data: undefined },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate indirect cost" }));
    expect(await screen.findByText("recompute boom")).toBeInTheDocument();
  });

  it("shows calculating state when recompute is pending", () => {
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: {
        mutateAsync: vi.fn(),
        isPending: true,
        isSuccess: false,
        data: undefined,
      },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getByRole("button", { name: "Calculating…" })).toBeInTheDocument();
  });

  it("lists existing indirect cost rules", () => {
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule, { ...sampleRule, id: "rule-2", grantId: null }] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getAllByText("Modified total direct cost (MTDC)").length).toBeGreaterThan(0);
    expect(screen.getByText("This grant")).toBeInTheDocument();
    expect(screen.getByText("Org-wide")).toBeInTheDocument();
  });

  it("shows a loading skeleton while rules load", () => {
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("shows an error when rules fail to load", () => {
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getByText("Unable to load indirect cost rules.")).toBeInTheDocument();
  });

  it("shows an empty message when no rules are defined", () => {
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getByText("No indirect cost rules defined.")).toBeInTheDocument();
  });

  it("creates a grant-scoped indirect cost rule", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "rule-new" });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    fireEvent.change(
      screen
        .getByTestId("dialog-content")
        .querySelector('select[name="base"]') as HTMLSelectElement,
      {
        target: { value: "direct_costs" },
      },
    );
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      base: "direct_costs",
      rateBasisPoints: 1500,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      grantId: "grant-1",
    });
  });

  it("creates an org-wide rule with an effective-to date", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "rule-new" });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    fireEvent.change(
      screen
        .getByTestId("dialog-content")
        .querySelector('select[name="base"]') as HTMLSelectElement,
      {
        target: { value: "salaries_only" },
      },
    );
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Effective to (optional)"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(screen.getByLabelText("Apply org-wide (all grants)"));
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      base: "salaries_only",
      rateBasisPoints: 1000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: "2026-12-31T00:00:00.000Z",
    });
  });

  it("validates the rate before creating a rule", async () => {
    const mutateAsync = vi.fn();
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);

    expect(await screen.findByText("Enter a rate greater than zero.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("validates the effective-from date before creating a rule", async () => {
    const mutateAsync = vi.fn();
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "15" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);

    expect(await screen.findByText("Select an effective-from date.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces a create-rule error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("create boom"));
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(
      screen
        .getByTestId("dialog-content")
        .querySelector('select[name="base"]') as HTMLSelectElement,
      { target: { value: "direct_costs" } },
    );
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);

    expect(await screen.findByText("create boom")).toBeInTheDocument();
  });

  it("edits an existing rule via the prefilled dialog", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "rule-1" });
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "12.5" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save rule" }).closest("form")!);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      ruleId: "rule-1",
      data: {
        base: "modified_total_direct",
        rateBasisPoints: 1250,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        grantId: "grant-1",
      },
    });
  });

  it("confirms before deleting a rule (first click only opens the dialog)", () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      deleteIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByText("Remove indirect cost rule?")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("cancelling the confirm dialog leaves the rule in place", () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      deleteIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Remove indirect cost rule?")).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("deletes a rule after confirming", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      deleteIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("rule-1"));
  });

  it("surfaces a delete-rule error after confirming", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("delete boom"));
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      deleteIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);

    expect(await screen.findByText("delete boom")).toBeInTheDocument();
  });

  it("renders rules read-only for viewers without edit permission", () => {
    setIndirectEntitledPlan({ memberRole: "viewer", payments: "view" });
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(
      screen.getByText("You do not have permission to calculate indirect cost for this request."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("handles a request without a grant and renders rate fallbacks", () => {
    hoisted.mockUsePaymentRequest.mockReturnValue({
      data: { ...defaultRequest, grant: null },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: {
        data: [{ id: "rule-x", grantId: null, base: "unknown_base", rateBasisPoints: null }],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    expect(screen.getByText("unknown_base")).toBeInTheDocument();
    expect(screen.getByText("Org-wide")).toBeInTheDocument();
  });

  it("resets the editing state when the rule dialog is closed", async () => {
    setIndirectEntitledPlan();
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));

    // Open via Edit so editingRule is populated, then trigger validation error.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save rule" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Close the dialog: clears editingRule + formError.
    const ruleDialog = screen
      .getByRole("button", { name: "Save rule" })
      .closest("[data-testid='dialog']") as HTMLElement;
    fireEvent.click(ruleDialog.querySelector("[data-testid='dialog-close']")!);

    // Reopen via Add rule — the form is back to create mode with no error.
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create rule" })).toBeInTheDocument();
  });

  it("renders a rule with a null basis and an effective-to date", () => {
    setIndirectEntitledPlan();
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: {
        data: [
          {
            id: "rule-open",
            grantId: null,
            base: null,
            rateBasisPoints: 1200,
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveTo: "2026-12-31T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    // Null basis renders as the "--" placeholder; effective-to date is shown.
    expect(screen.getByText("12.00%")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();
  });

  it("edits an org-wide rule and keeps it org-wide on save", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "rule-org" });
    setIndirectEntitledPlan();
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: {
        data: [
          {
            id: "rule-org",
            grantId: null,
            base: "direct_costs",
            rateBasisPoints: 1500,
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveTo: "2026-06-30T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      updateIndirectRule: { mutateAsync, isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.submit(screen.getByRole("button", { name: "Save rule" }).closest("form")!);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      ruleId: "rule-org",
      data: {
        base: "direct_costs",
        rateBasisPoints: 1500,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2026-06-30T00:00:00.000Z",
        grantId: null,
      },
    });
  });

  it("shows the fallback message when recompute throws a non-Error", async () => {
    setIndirectEntitledPlan();
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      recomputeIndirect: {
        mutateAsync: vi.fn().mockRejectedValue("boom"),
        isPending: false,
        isSuccess: false,
        data: undefined,
      },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate indirect cost" }));
    await waitFor(() =>
      expect(screen.getByText("Unable to calculate indirect cost.")).toBeInTheDocument(),
    );
  });

  it("shows the fallback message when creating a rule throws a non-Error", async () => {
    setIndirectEntitledPlan();
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      createIndirectRule: { mutateAsync: vi.fn().mockRejectedValue("boom"), isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(
      screen
        .getByTestId("dialog-content")
        .querySelector('select[name="base"]') as HTMLSelectElement,
      { target: { value: "direct_costs" } },
    );
    fireEvent.change(screen.getByLabelText("Rate (percent)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create rule" }).closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("Unable to save indirect cost rule.")).toBeInTheDocument(),
    );
  });

  it("shows the fallback message when deleting a rule throws a non-Error", async () => {
    setIndirectEntitledPlan();
    hoisted.mockUseIndirectCostRules.mockReturnValue({
      data: { data: [sampleRule] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUsePaymentRequestMutations.mockReturnValue({
      ...defaultMutations,
      deleteIndirectRule: { mutateAsync: vi.fn().mockRejectedValue("boom"), isPending: false },
    });
    render(<PaymentRequestDetailPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Indirect" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);
    await waitFor(() => expect(screen.getByText("Unable to delete rule.")).toBeInTheDocument());
  });

  it("fires captureDetailTabViewed with record_type payments when tab changes", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    render(<PaymentRequestDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));

    expect(mockCapture).toHaveBeenCalledWith("payments", "lines", "overview");
  });

  it("updates previousTabRef on sequential tab switches for payments", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    render(<PaymentRequestDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));

    expect(mockCapture).toHaveBeenNthCalledWith(1, "payments", "lines", "overview");
    expect(mockCapture).toHaveBeenNthCalledWith(2, "payments", "activity", "lines");
  });
});
