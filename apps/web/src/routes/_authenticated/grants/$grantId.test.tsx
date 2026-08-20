import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const hoisted = vi.hoisted(() => ({
  routeParams: { grantId: "grant-test-1" } as Record<string, string>,
  mockUseGrant: vi.fn(),
  mockUseGrantUpdateMutations: vi.fn(),
  mockUseAllocationMutations: vi.fn(),
  mockUseExpenseMutations: vi.fn(),
  mockUseImpactMetricMutations: vi.fn(),
  mockUseReportingRequirementMutations: vi.fn(),
  mockUseCloseoutItemMutations: vi.fn(),
  mockUseFunds: vi.fn(),
  mockUseFunders: vi.fn(),
  mockUseSpendDown: vi.fn(),
  mockUseGenerateSpendDownReport: vi.fn(),
  mockUseGrantBudgetVariance: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSession: vi.fn(),
  mockCreateRestrictionTerm: vi.fn(),
  mockUsePaymentRequests: vi.fn(),
  mockUseGrantPaymentSummary: vi.fn(),
  mockUseSubawards: vi.fn(),
  mockUseStartDocumentExtraction: vi.fn(),
  mockUsePrograms: vi.fn(),
}));

const mockNavigate = vi.fn();

describe("GrantDetailPage source contracts", () => {
  it("derives spend-down report plan gate copy from shared pricing entitlements", () => {
    const source = readFileSync(join(__dirname, "$grantId.tsx"), "utf8");

    expect(source).toMatch(/getPlanEntitlementLabelList\(\s*"hasComplianceReportPack"/);
    expect(source).not.toContain("Growth plan required to download spend-down reports.");
  });

  it("derives reporting requirement type options from shared constants", () => {
    const source = readFileSync(join(__dirname, "$grantId.tsx"), "utf8");

    expect(source).toContain("REPORT_TYPES");
    expect(source).toContain("REPORT_TYPE_LABELS");
    expect(source).not.toContain('<SelectItem value="quarterly">Quarterly</SelectItem>');
    expect(source).not.toContain('<SelectItem value="annual">Annual</SelectItem>');
    expect(source).not.toContain('<SelectItem value="final">Final</SelectItem>');
    expect(source).not.toContain('<SelectItem value="custom">Custom</SelectItem>');
  });
});

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
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
    hash?: string;
  }) => {
    let href = to ?? "";
    if (params) {
      href = href.replace(
        /\$([a-zA-Z]+)/g,
        (_match: string, key: string) => params[key] ?? `$${key}`,
      );
    }
    if (hash) {
      href = `${href}#${hash}`;
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
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
  PageShell: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
      data-slot="page-shell"
      className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  ),
  PageHeader: ({
    title,
    description,
    kicker,
    actions,
    breadcrumb,
  }: {
    title: string;
    description?: string;
    kicker?: string;
    actions?: React.ReactNode;
    breadcrumb?: React.ReactNode;
    className?: string;
  }) => (
    <div data-slot="page-header">
      {breadcrumb ? <div data-slot="page-header-breadcrumb">{breadcrumb}</div> : null}
      {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div data-slot="page-header-actions">{actions}</div> : null}
    </div>
  ),
  Alert: ({
    title,
    children,
    variant,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & { title?: string; variant?: string }) => (
    <div role="alert" data-slot="alert" data-variant={variant} className={className}>
      {title ? <p data-slot="alert-title">{title}</p> : null}
      {children ? <div data-slot="alert-content">{children}</div> : null}
    </div>
  ),
  Breadcrumb: ({ children }: React.HTMLAttributes<HTMLElement>) => (
    <nav data-slot="breadcrumb" aria-label="breadcrumb">
      {children}
    </nav>
  ),
  BreadcrumbList: ({ children }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol data-slot="breadcrumb-list">{children}</ol>
  ),
  BreadcrumbItem: ({ children }: React.HTMLAttributes<HTMLLIElement>) => (
    <li data-slot="breadcrumb-item">{children}</li>
  ),
  BreadcrumbLink: ({
    children,
    asChild,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        "data-slot": "breadcrumb-link",
        ...props,
      } as Partial<React.HTMLAttributes<HTMLElement>>);
    }

    return (
      <a data-slot="breadcrumb-link" {...props}>
        {children}
      </a>
    );
  },
  BreadcrumbPage: ({ children }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span data-slot="breadcrumb-page" aria-current="page">
      {children}
    </span>
  ),
  BreadcrumbSeparator: ({ children }: React.HTMLAttributes<HTMLLIElement>) => (
    <li data-slot="breadcrumb-separator" aria-hidden="true">
      {children ?? "/"}
    </li>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }) => (
    <div data-testid="dialog" data-open={open ? "true" : "false"}>
      {onOpenChange ? (
        <>
          <button
            data-testid="dialog-open-trigger"
            onClick={() => {
              onOpenChange(true);
            }}
          />
          <button
            data-testid="dialog-close-trigger"
            onClick={() => {
              onOpenChange(false);
            }}
          />
        </>
      ) : null}
      {children}
    </div>
  ),
  DialogContent: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
  DialogClose: ({
    children,
    asChild,
  }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) =>
    asChild ? (children as React.ReactElement) : <div>{children}</div>,
  DialogHeader: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2>{children}</h2>,
  DialogTrigger: ({
    children,
    asChild,
  }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) =>
    asChild ? (children as React.ReactElement) : <div>{children}</div>,
  Input: ({
    id,
    placeholder,
    value,
    onChange,
    defaultValue,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      defaultValue={defaultValue}
      {...props}
    />
  ),
  Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Textarea: ({
    id,
    name,
    placeholder,
    defaultValue,
    rows,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
      id={id}
      name={name}
      placeholder={placeholder}
      defaultValue={defaultValue}
      rows={rows}
      {...props}
    />
  ),
  Tabs: ({
    children,
    defaultValue,
    onValueChange,
  }: React.HTMLAttributes<HTMLDivElement> & {
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  }) => {
    const [activeTab, setActiveTab] = React.useState(defaultValue ?? "");
    return (
      <div data-testid="tabs" data-default-value={defaultValue} data-active={activeTab}>
        {React.Children.map(children, (child) => {
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
        })}
      </div>
    );
  },
  TabsList: ({
    children,
    onTabChange,
  }: React.HTMLAttributes<HTMLDivElement> & { onTabChange?: (v: string) => void }) => (
    <div role="tablist">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ onActivate?: () => void }>, {
            onActivate: () => onTabChange?.((child.props as { value?: string }).value ?? ""),
          });
        }
        return child;
      })}
    </div>
  ),
  TabsTrigger: ({
    children,
    value,
    onActivate,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value: string;
    onActivate?: () => void;
  }) => (
    <button role="tab" data-value={value} onClick={onActivate} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: React.HTMLAttributes<HTMLDivElement> & { value: string }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
  StatusPanel: ({
    children,
    variant,
  }: React.HTMLAttributes<HTMLDivElement> & { variant?: string; title?: string }) => (
    <div data-slot="status-panel" data-variant={variant}>
      {children}
    </div>
  ),
  Skeleton: ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="skeleton" className={className} {...props} />
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
    children: _children,
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
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <div role="option" data-value={value}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" "),
}));

vi.mock("../../../hooks/use-grants", () => ({
  useGrant: hoisted.mockUseGrant,
  useGrantUpdateMutations: hoisted.mockUseGrantUpdateMutations,
  useAllocationMutations: hoisted.mockUseAllocationMutations,
  useExpenseMutations: hoisted.mockUseExpenseMutations,
  useImpactMetricMutations: hoisted.mockUseImpactMetricMutations,
  useReportingRequirementMutations: hoisted.mockUseReportingRequirementMutations,
  useCloseoutItemMutations: hoisted.mockUseCloseoutItemMutations,
  useFunds: hoisted.mockUseFunds,
  useFunders: hoisted.mockUseFunders,
  useSpendDown: hoisted.mockUseSpendDown,
  useGenerateSpendDownReport: hoisted.mockUseGenerateSpendDownReport,
  useGrantBudgetVariance: hoisted.mockUseGrantBudgetVariance,
}));

vi.mock("../../../hooks/use-programs", () => ({
  usePrograms: (...args: unknown[]) => hoisted.mockUsePrograms(...args),
  useReplaceGrantProgramAllocations: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useReplaceExpenseProgramAllocations: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: hoisted.mockUseOrgBilling,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../../hooks/use-restrictions", () => ({
  useRestrictionTerms: () => ({
    data: { data: [] },
    isPending: false,
    isError: false,
  }),
  useRestrictionAlerts: () => ({
    data: { data: [] },
    isPending: false,
    isError: false,
  }),
  useCreateRestrictionTerm: () => ({
    mutateAsync: hoisted.mockCreateRestrictionTerm,
    isPending: false,
  }),
}));

vi.mock("../../../components/restrictions/restriction-lifecycle-panel", () => ({
  RestrictionLifecyclePanel: ({ grantId }: { grantId?: string }) => (
    <section aria-label="Restriction lifecycle">Restrictions for {grantId}</section>
  ),
}));

vi.mock("../../../components/entity-activity-section", () => ({
  EntityActivitySection: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="entity-activity" data-entity-type={entityType} data-entity-id={entityId} />
  ),
}));

vi.mock("../../../components/entity-custom-fields-section", () => ({
  EntityCustomFieldsSection: ({
    entityType,
    entityId,
  }: {
    entityType: string;
    entityId: string;
  }) => (
    <div
      data-testid="entity-custom-fields"
      data-entity-type={entityType}
      data-entity-id={entityId}
    />
  ),
}));

vi.mock("../../../components/entity-documents-section", () => ({
  EntityDocumentsSection: ({
    entityType,
    entityId,
    renderDocumentActions,
  }: {
    entityType: string;
    entityId: string;
    renderDocumentActions?: (doc: { id: string }) => React.ReactNode;
  }) => (
    <div data-testid="entity-documents" data-entity-type={entityType} data-entity-id={entityId}>
      {renderDocumentActions ? renderDocumentActions({ id: "doc-1" }) : null}
    </div>
  ),
}));

vi.mock("../../../hooks/use-payments", () => ({
  usePaymentRequests: hoisted.mockUsePaymentRequests,
  useGrantPaymentSummary: hoisted.mockUseGrantPaymentSummary,
}));

vi.mock("../../../hooks/use-subrecipients", () => ({
  useSubawards: hoisted.mockUseSubawards,
}));

vi.mock("../../../hooks/use-document-extractions", () => ({
  useStartDocumentExtraction: () => hoisted.mockUseStartDocumentExtraction(),
}));

vi.mock("../../../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: () => <div data-testid="quick-share-sheet" />,
}));

import {
  centsToAmountInput,
  formatIsoDateLabel,
  formatYearMonthLabel,
  normalizeDateInput,
  Route,
  trimmedText,
} from "./$grantId";

const GrantDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const NOOP_MUTATIONS = {
  updateGrant: { mutateAsync: vi.fn() },
  deleteGrant: { mutateAsync: vi.fn() },
};
const NOOP_ALLOCATION = {
  createAllocation: { mutateAsync: vi.fn() },
  updateAllocation: { mutateAsync: vi.fn() },
  deleteAllocation: { mutateAsync: vi.fn(), isPending: false },
};
const NOOP_EXPENSE = {
  createExpense: { mutateAsync: vi.fn() },
  deleteExpense: { mutateAsync: vi.fn(), isPending: false },
};
const NOOP_METRIC = {
  createMetric: { mutateAsync: vi.fn() },
  createEntry: { mutateAsync: vi.fn() },
  deleteMetric: { mutateAsync: vi.fn(), isPending: false },
  deleteEntry: { mutateAsync: vi.fn(), isPending: false },
};
const NOOP_REPORTING = {
  createRequirement: { mutateAsync: vi.fn() },
  updateRequirement: { mutateAsync: vi.fn() },
  deleteRequirement: { mutateAsync: vi.fn(), isPending: false },
};
const NOOP_CLOSEOUT = {
  createItem: { mutateAsync: vi.fn() },
  updateItem: { mutateAsync: vi.fn() },
  deleteItem: { mutateAsync: vi.fn(), isPending: false },
};

describe("GrantDetailPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    hoisted.mockUseGrant.mockReset();
    hoisted.mockUseGrantUpdateMutations.mockReturnValue(NOOP_MUTATIONS);
    hoisted.mockUseAllocationMutations.mockReturnValue(NOOP_ALLOCATION);
    hoisted.mockUseExpenseMutations.mockReturnValue(NOOP_EXPENSE);
    hoisted.mockUseImpactMetricMutations.mockReturnValue(NOOP_METRIC);
    hoisted.mockUseReportingRequirementMutations.mockReturnValue(NOOP_REPORTING);
    hoisted.mockUseCloseoutItemMutations.mockReturnValue(NOOP_CLOSEOUT);
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Example Foundation" },
          { id: "funder-2", name: "Second Foundation" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSpendDown.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseGrantBudgetVariance.mockReturnValue({
      data: { rows: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockCreateRestrictionTerm.mockResolvedValue({});
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPaymentSummary.mockReturnValue({
      data: {
        totalRequestedCents: 0,
        totalApprovedCents: 0,
        totalPaidCents: 0,
        outstandingCents: 0,
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSubawards.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
    hoisted.mockUseStartDocumentExtraction.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "extraction-1" }),
      isPending: false,
    });
    hoisted.mockUsePrograms.mockReturnValue({
      data: { data: [], total: 0 },
      isLoading: false,
      isError: false,
    });
  });

  function renderPage() {
    return render(<GrantDetailPage />);
  }

  it("renders skeleton loading state when query is loading (not Alert text)", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    expect(container.querySelector("[data-slot='page-shell']")).toBeInTheDocument();
    // No Alert-based loading text
    expect(screen.queryByText("Loading grant...")).not.toBeInTheDocument();
    // Skeleton elements rendered
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it("renders fatal error state with retry button when isError and no data", () => {
    const mockRefetch = vi.fn();
    hoisted.mockUseGrant.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network failure"),
      refetch: mockRefetch,
    });

    const { container } = renderPage();

    expect(container.querySelector("[data-slot='page-shell']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='alert'][data-variant='destructive']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load grant.")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("renders stale-data banner when isError and data is present", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "STEM Access Fund",
        status: "active",
        amountCents: 500000,
        description: "Grant description here",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 200000,
          expenseTotalCents: 50000,
          remainingBalanceCents: 300000,
          thresholdState: "80",
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    expect(container.querySelector("[data-slot='page-shell']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='alert'][data-variant='destructive']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Grant data may be stale.")).toBeInTheDocument();
    // The grant data should still be visible
    expect(screen.getByRole("heading", { name: "STEM Access Fund" })).toBeInTheDocument();
    // No retry button in this stale-data scenario
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    // A present spend-down threshold state renders the header badge.
    expect(screen.getByText("Threshold 80%")).toBeInTheDocument();
  });

  it("renders the Budget tab with budget-vs-actual visibility", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Budget Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseGrantBudgetVariance.mockReturnValue({
      data: {
        rows: [
          {
            lineId: "line-1",
            category: "Personnel",
            approvedAmountCents: 100000,
            actualCents: 25000,
            plannedCents: 15000,
            remainingCents: 60000,
            varianceCents: 75000,
            variancePercent: 75,
            allowable: true,
            costType: "direct",
          },
        ],
      },
      isPending: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByRole("tab", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByText("Budget-vs-actual")).toBeInTheDocument();
    expect(screen.getByText("Personnel")).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
    // With no threshold to report, the dangling "Threshold --" badge must be omitted.
    expect(screen.queryByText(/^Threshold/)).not.toBeInTheDocument();
  });

  it("resets closeoutError when the closeout dialog onOpenChange fires with true", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    // Submit the closeout form with empty label to trigger closeoutError
    const submitButtons = screen.getAllByRole("button", { name: "Save item" });
    fireEvent.click(submitButtons[0]!);

    expect(screen.getByRole("alert")).toHaveTextContent("Checklist item label is required.");

    // Now click the dialog-open-trigger to call onOpenChange(true), which should reset the error
    // Scope to the closeout tab content to avoid picking up the ConfirmDialog trigger
    const closeoutTabContent = container.querySelector("[data-testid='tab-content-closeout']");
    const closeoutOpenTrigger = closeoutTabContent?.querySelector(
      "[data-testid='dialog-open-trigger']",
    );
    fireEvent.click(closeoutOpenTrigger!);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears closeoutError when an input onChange fires inside the closeout form", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Submit the closeout form with empty label to trigger closeoutError
    const submitButton = screen.getByRole("button", { name: "Save item" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Checklist item label is required.");

    // Now change an input inside the closeout form to clear the error
    const labelInput = screen.getByRole("textbox", { name: "Item" });
    fireEvent.change(labelInput, { target: { value: "New label" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("resets reportError when the reporting dialog onOpenChange fires with true", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    // Submit the reporting form with empty type/date to trigger reportError
    const submitButtons = screen.getAllByRole("button", { name: "Save requirement" });
    fireEvent.click(submitButtons[0]!);

    expect(screen.getByRole("alert")).toHaveTextContent("Report type and due date are required.");

    // Now click the dialog-open-trigger inside the reporting tab to call onOpenChange(true)
    // The reporting dialog's trigger is the one near "Add reporting requirement" button
    const openTriggers = container.querySelectorAll("[data-testid='dialog-open-trigger']");
    // The reporting dialog trigger (tab-content-reporting has the relevant one)
    const reportingTabContent = container.querySelector("[data-testid='tab-content-reporting']");
    if (reportingTabContent) {
      const trigger = reportingTabContent.querySelector("[data-testid='dialog-open-trigger']");
      if (trigger) {
        fireEvent.click(trigger);
      }
    } else {
      fireEvent.click(openTriggers[openTriggers.length - 2]!);
    }

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears reportError when an input onChange fires inside the reporting form", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Submit the reporting form with empty type to trigger reportError
    const submitButton = screen.getByRole("button", { name: "Save requirement" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Report type and due date are required.");

    // Change the report type select inside the reporting form to clear the error
    const reportTypeSelect = screen.getByRole("combobox", { name: "Report type" });
    fireEvent.change(reportTypeSelect, { target: { value: "quarterly" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("resets metricError when the metric dialog onOpenChange fires with true", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    // Submit the metric form with empty name to trigger metricError
    const submitButton = screen.getByRole("button", { name: "Save metric" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Metric name is required.");

    // Click the dialog-open-trigger inside the metrics tab to call onOpenChange(true)
    const metricsTabContent = container.querySelector("[data-testid='tab-content-metrics']");
    if (metricsTabContent) {
      const trigger = metricsTabContent.querySelector("[data-testid='dialog-open-trigger']");
      if (trigger) {
        fireEvent.click(trigger);
      }
    }

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears metricError when an input onChange fires inside the metric form", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Submit the metric form with empty name to trigger metricError
    const submitButton = screen.getByRole("button", { name: "Save metric" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Metric name is required.");

    // Change an input inside the metric form to clear the error
    const metricNameInput = screen.getByPlaceholderText("Metric name");
    fireEvent.change(metricNameInput, { target: { value: "Impact metric" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("associates accessible labels with the metric name and unit inputs", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByLabelText("Metric name")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toBeInTheDocument();
  });

  it("resets expenseError when the expense dialog onOpenChange fires with true", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    // Submit the expense form with zero amount to trigger expenseError
    const submitButton = screen.getByRole("button", { name: "Save expense" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Expense amount and date are required.");

    // Click the dialog-open-trigger inside the expense tab to call onOpenChange(true)
    const expensesTabContent = container.querySelector("[data-testid='tab-content-expenses']");
    if (expensesTabContent) {
      const trigger = expensesTabContent.querySelector("[data-testid='dialog-open-trigger']");
      if (trigger) {
        fireEvent.click(trigger);
      }
    }

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears expenseError when an input onChange fires inside the expense form", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Submit the expense form with zero amount to trigger expenseError
    const submitButton = screen.getByRole("button", { name: "Save expense" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Expense amount and date are required.");

    // Change an input inside the expense form to clear the error.
    // There are two "Description" fields on the page (grant overview + expense form),
    // so we scope the query to the expenses tab content to get the right one.
    const expensesTab = document.querySelector("[data-testid='tab-content-expenses']")!;
    const descriptionInput = expensesTab.querySelector("input[name='description']") as HTMLElement;
    fireEvent.change(descriptionInput, { target: { value: "Office supplies" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears allocationError when an input onChange fires inside the allocation form", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Submit the allocation form with empty fund ID to trigger allocationError
    const submitButton = screen.getByRole("button", { name: "Save allocation" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Fund and a positive amount are required.");

    // Change the fund select inside the allocation form to clear the error
    const fundSelect = screen.getByRole("combobox", { name: "Fund" });
    fireEvent.change(fundSelect, { target: { value: "fund-123" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows allocationError when createAllocation.mutateAsync rejects", async () => {
    const mockCreateAllocation = vi.fn().mockRejectedValue(new Error("Allocation failed"));
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: mockCreateAllocation },
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-123", name: "General Fund" }] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Fill in valid fund and amount, then submit
    fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), {
      target: { value: "fund-123" },
    });
    // Allocation amount is the first "Amount (USD)" spinbutton (expense is the second)
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[0] as HTMLElement,
      {
        target: { value: "50" },
      },
    );
    const allocForm = screen
      .getByRole("button", { name: "Save allocation" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(allocForm);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Allocation failed");
  });

  it("shows metricError when createMetric.mutateAsync rejects", async () => {
    const mockCreateMetric = vi.fn().mockRejectedValue(new Error("Metric save failed"));
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: mockCreateMetric },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn(), isPending: false },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Metric name"), {
      target: { value: "Families served" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Metric save failed");
  });

  it("shows reportError when createRequirement.mutateAsync rejects", async () => {
    const mockCreateRequirement = vi.fn().mockRejectedValue(new Error("Requirement save failed"));
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: mockCreateRequirement },
      updateRequirement: { mutateAsync: vi.fn() },
      deleteRequirement: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Report type" }), {
      target: { value: "quarterly" },
    });
    const reportForm = screen
      .getByRole("button", { name: "Save requirement" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(reportForm.querySelector("input[name='dueDate']") as HTMLInputElement, {
      target: { value: "2026-03-31" },
    });
    fireEvent.submit(reportForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Requirement save failed");
  });

  it("shows closeoutError when createItem.mutateAsync rejects", async () => {
    const mockCreateItem = vi.fn().mockRejectedValue(new Error("Checklist save failed"));
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: mockCreateItem },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const closeoutForm = screen
      .getByRole("button", { name: "Save item" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(closeoutForm.querySelector("input[name='label']") as HTMLInputElement, {
      target: { value: "Final report" },
    });
    fireEvent.submit(closeoutForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Checklist save failed");
  });

  it("shows an inline entry error when createEntry.mutateAsync rejects", async () => {
    const mockCreateEntry = vi.fn().mockRejectedValue(new Error("Entry save failed"));
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn(), isPending: false },
      createEntry: { mutateAsync: mockCreateEntry },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-reject-1",
            name: "Children Reached",
            unit: "children",
            actualValue: 0,
            targetValue: "100",
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const entryForm = screen
      .getByRole("button", { name: "Save entry" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(entryForm.querySelector("input[name='value']") as HTMLInputElement, {
      target: { value: "42" },
    });
    fireEvent.change(entryForm.querySelector("input[name='periodStart']") as HTMLInputElement, {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(entryForm.querySelector("input[name='periodEnd']") as HTMLInputElement, {
      target: { value: "2026-02-28" },
    });
    fireEvent.submit(entryForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Entry save failed");
  });

  it("renders the missing-value token for a metric with no reported actual", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-null-actual",
            name: "Children Reached",
            unit: "children",
            actualValue: null,
            targetValue: "100",
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // A metric with no reported actual shows the "--" token, not a misleading "0"
    // (which reads as "we achieved zero"). Matches the Target line right below.
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Actual: -- children"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((_, el) => el?.tagName === "P" && el.textContent === "Actual: 0 children"),
    ).not.toBeInTheDocument();
  });

  it("uses fallback metric error message when createMetric rejects with a non-Error", async () => {
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn().mockRejectedValue("boom") },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn(), isPending: false },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Metric name"), {
      target: { value: "Families served" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save metric.");
  });

  it("uses fallback requirement error when createRequirement rejects with a non-Error", async () => {
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: vi.fn().mockRejectedValue("boom") },
      updateRequirement: { mutateAsync: vi.fn() },
      deleteRequirement: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Report type" }), {
      target: { value: "quarterly" },
    });
    const reportForm = screen
      .getByRole("button", { name: "Save requirement" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(reportForm.querySelector("input[name='dueDate']") as HTMLInputElement, {
      target: { value: "2026-03-31" },
    });
    fireEvent.submit(reportForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save requirement.");
  });

  it("uses fallback checklist error when createItem rejects with a non-Error", async () => {
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn().mockRejectedValue("boom") },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const closeoutForm = screen
      .getByRole("button", { name: "Save item" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(closeoutForm.querySelector("input[name='label']") as HTMLInputElement, {
      target: { value: "Final report" },
    });
    fireEvent.submit(closeoutForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save checklist item.");
  });

  it("uses fallback entry error when createEntry rejects with a non-Error", async () => {
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn(), isPending: false },
      createEntry: { mutateAsync: vi.fn().mockRejectedValue("boom") },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-reject-2",
            name: "Children Reached",
            unit: "children",
            actualValue: 0,
            targetValue: "100",
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const entryForm = screen
      .getByRole("button", { name: "Save entry" })
      .closest("form") as HTMLFormElement;
    fireEvent.change(entryForm.querySelector("input[name='value']") as HTMLInputElement, {
      target: { value: "42" },
    });
    fireEvent.change(entryForm.querySelector("input[name='periodStart']") as HTMLInputElement, {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(entryForm.querySelector("input[name='periodEnd']") as HTMLInputElement, {
      target: { value: "2026-02-28" },
    });
    fireEvent.submit(entryForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save entry.");
  });

  it("renders fallback error message when grantQuery.error is not an Error instance", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "plain string error",
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    expect(
      container.querySelector("[data-slot='alert'][data-variant='destructive']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Refresh the page and try again.")).toBeInTheDocument();
  });

  it("resets allocationError when the allocation dialog onOpenChange fires with true", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    // Submit the allocation form with empty fund ID to trigger allocationError
    const submitButton = screen.getByRole("button", { name: "Save allocation" });
    fireEvent.click(submitButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Fund and a positive amount are required.");

    // Click the dialog-open-trigger inside the allocations tab to call onOpenChange(true)
    const allocationsTabContent = container.querySelector(
      "[data-testid='tab-content-allocations']",
    );
    if (allocationsTabContent) {
      const trigger = allocationsTabContent.querySelector("[data-testid='dialog-open-trigger']");
      if (trigger) {
        fireEvent.click(trigger);
      }
    }

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders populated grant content with PageShell, PageHeader, and tabs", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Community Impact Grant",
        status: "awarded",
        amountCents: 1000000,
        description: "Supporting community programs",
        notes: "Some notes",
        applicationDeadline: "2026-03-15T12:00:00.000Z",
        startDate: "2026-01-01T12:00:00.000Z",
        endDate: "2026-12-31T12:00:00.000Z",
        summary: {
          allocatedTotalCents: 750000,
          expenseTotalCents: 200000,
          remainingBalanceCents: 250000,
          thresholdState: "90",
          burnRateCentsPerMonth: 25000,
        },
        fundAllocations: [
          {
            id: "alloc-1",
            fund: { name: "General Fund" },
            allocatedAmountCents: 750000,
          },
        ],
        expenses: [
          {
            id: "exp-1",
            description: "Office supplies",
            amountCents: 5000,
            date: "2026-02-01T12:00:00.000Z",
          },
        ],
        impactMetrics: [],
        reportingRequirements: [
          {
            id: "req-1",
            reportType: "quarterly",
            dueDate: "2026-06-30T12:00:00.000Z",
            derivedStatus: "upcoming",
          },
        ],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    expect(container.querySelector("[data-slot='page-shell']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community Impact Grant" })).toBeInTheDocument();
    expect(screen.getAllByText("Awarded").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$10,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$7,500").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$2,500").length).toBeGreaterThanOrEqual(1);
  });

  it("renders breadcrumb with Grants link and grant name as current page", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Breadcrumb Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    const breadcrumb = container.querySelector("[data-slot='breadcrumb']");
    expect(breadcrumb).toBeInTheDocument();
    const grantsLink = container.querySelector("[data-slot='breadcrumb-link']");
    expect(grantsLink).toBeInTheDocument();
    expect(grantsLink).toHaveTextContent("Grants");
    const currentPage = container.querySelector("[data-slot='breadcrumb-page']");
    expect(currentPage).toBeInTheDocument();
    expect(currentPage).toHaveTextContent("Breadcrumb Test Grant");
  });

  it("renders tabs with expected tab triggers", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Tabs Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Allocations" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Impact Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reporting" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Closeout" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Spend-Down" })).toBeInTheDocument();
  });

  it("renders PageHeader description with status, amount, and grant period", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Description Test Grant",
        status: "awarded",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: "2026-01-01T12:00:00.000Z",
        endDate: "2026-12-31T12:00:00.000Z",
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    const description = container.querySelector("[data-slot='page-header-description']");
    expect(description).toBeInTheDocument();
    expect(description?.textContent).toContain("Awarded");
    expect(description?.textContent).toContain("$5,000");
    expect(description?.textContent).toContain("Jan 1, 2026");
    expect(description?.textContent).toContain("Dec 31, 2026");
  });

  it("renders PageHeader description with only status when no amount or dates", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Minimal Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    const description = container.querySelector("[data-slot='page-header-description']");
    expect(description).toBeInTheDocument();
    expect(description?.textContent).toContain("Discovery");
  });

  it("renders Delete grant button in PageHeader actions area", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Actions Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    const actionsArea = container.querySelector("[data-slot='page-header-actions']");
    expect(actionsArea).toBeInTheDocument();
    // The delete button is rendered by DialogTrigger asChild inside the actions area
    const deleteBtn = Array.from(actionsArea?.querySelectorAll("button") ?? []).find(
      (btn) => btn.textContent === "Delete grant",
    );
    expect(deleteBtn).not.toBeUndefined();
  });

  it("shows unallocated balance separately from remaining to spend", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 1000000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 300000,
          expenseTotalCents: 200000,
          unallocatedBalanceCents: 700000,
          remainingBalanceCents: 800000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const unallocatedCard = screen.getByText("Unallocated").closest("div")?.parentElement;
    expect(unallocatedCard).toHaveTextContent("$7,000");

    const remainingToSpendCard = screen
      .getByText("Remaining to spend")
      .closest("div")?.parentElement;
    expect(remainingToSpendCard).toHaveTextContent("$8,000");
  });

  it("renders status select with current grant status pre-selected", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "awarded",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const statusSelect = screen.getByRole("combobox", { name: "Pipeline status" });
    expect(statusSelect).toBeInTheDocument();
    expect((statusSelect as HTMLSelectElement).value).toBe("awarded");

    // All GRANT_STATUSES options should be present
    const options = screen.getAllByRole("option").map((o) => o.getAttribute("data-value"));
    expect(options).toContain("discovery");
    expect(options).toContain("application");
    expect(options).toContain("submitted");
    expect(options).toContain("awarded");
    expect(options).toContain("active");
    expect(options).toContain("reporting");
    expect(options).toContain("closeout");
    expect(options).toContain("renewal");
    expect(options).toContain("declined");
  });

  it("explains the selected grant status in plain language", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(
      screen.getByText("The grant is underway. Track spending, outcomes, and restrictions."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Next: keep expenses, restricted funds, and outcome notes current."),
    ).toBeInTheDocument();
  });

  it("syncs the status explanation after async grant data loads", async () => {
    hoisted.mockUseGrant
      .mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      })
      .mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 500000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 500000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

    const { rerender } = renderPage();

    rerender(<GrantDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText("The grant is underway. Track spending, outcomes, and restrictions."),
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Pipeline status" })).toHaveValue("active");
    });
  });

  it("syncs the funder Select after async grant data loads (cold load)", async () => {
    hoisted.mockUseGrant
      .mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      })
      .mockReturnValue({
        data: {
          name: "Funder Sync Grant",
          status: "reporting",
          amountCents: 500000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          funderId: "funder-2",
          funder: { id: "funder-2", name: "Second Foundation" },
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 500000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

    const { rerender } = renderPage();
    rerender(<GrantDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Funder" })).toHaveValue("funder-2");
      expect(screen.getByRole("combobox", { name: "Pipeline status" })).toHaveValue("reporting");
    });
  });

  it("syncs both Selects under StrictMode after async grant data loads", async () => {
    hoisted.mockUseGrant
      .mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      })
      .mockReturnValue({
        data: {
          name: "StrictMode Grant",
          status: "reporting",
          amountCents: 500000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          funderId: "funder-2",
          funder: { id: "funder-2", name: "Second Foundation" },
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 500000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

    const { rerender } = render(
      <React.StrictMode>
        <GrantDetailPage />
      </React.StrictMode>,
    );
    rerender(
      <React.StrictMode>
        <GrantDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Funder" })).toHaveValue("funder-2");
      expect(screen.getByRole("combobox", { name: "Pipeline status" })).toHaveValue("reporting");
    });
  });

  it("ignores a stray empty Select change during loading and still syncs saved values", async () => {
    // Reproduces the dirty-lock: a spurious empty-value onValueChange fired while the
    // grant query is still loading must NOT permanently block the load-sync effect.
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Dirty Lock Grant",
        status: "reporting",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        funderId: "funder-2",
        funder: { id: "funder-2", name: "Second Foundation" },
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Saved values are shown initially.
    expect(screen.getByRole("combobox", { name: "Funder" })).toHaveValue("funder-2");
    expect(screen.getByRole("combobox", { name: "Pipeline status" })).toHaveValue("reporting");

    // Radix can emit a spurious empty-value change before its items/value settle.
    // This must be a no-op — an empty funder/status is never a valid user selection.
    fireEvent.change(screen.getByRole("combobox", { name: "Funder" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Pipeline status" }), {
      target: { value: "" },
    });

    // The saved values must survive the stray empty change (no permanent dirty-lock).
    expect(screen.getByRole("combobox", { name: "Funder" })).toHaveValue("funder-2");
    expect(screen.getByRole("combobox", { name: "Pipeline status" })).toHaveValue("reporting");
  });

  it("passes the selected status to updateGrant on form submit", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      updateGrant: { mutateAsync: mockUpdateGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const statusSelect = screen.getByRole("combobox", { name: "Pipeline status" });
    fireEvent.change(statusSelect, { target: { value: "reporting" } });

    const overviewForm = statusSelect.closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    await waitFor(() => {
      expect(mockUpdateGrant).toHaveBeenCalledWith(
        expect.objectContaining({ status: "reporting" }),
      );
    });
  });

  it("renders a grant name input pre-populated with the current grant name", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Renamed Grant Test",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const nameInput = screen.getByRole("textbox", { name: "Grant name" });
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveValue("Renamed Grant Test");
  });

  it("passes the updated name to updateGrant on form submit", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      updateGrant: { mutateAsync: mockUpdateGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Old Grant Name",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const nameInput = screen.getByRole("textbox", { name: "Grant name" });
    fireEvent.change(nameInput, { target: { value: "New Grant Name" } });

    const overviewForm = nameInput.closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    await waitFor(() => {
      expect(mockUpdateGrant).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Grant Name" }),
      );
    });
  });

  it("shows a delete confirmation dialog when Delete grant is clicked, and cancelling does not call deleteGrant", async () => {
    const mockDeleteGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      deleteGrant: { mutateAsync: mockDeleteGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "To Be Deleted Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // The delete dialog content is always rendered in the mock (Dialog mock renders all children).
    // Verify confirmation text is visible.
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // Use getAllByRole because the ConfirmDialog (metric-entry) also renders a Cancel button.
    // The delete-grant dialog's Cancel button appears first in DOM order.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);

    expect(mockDeleteGrant).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("calls deleteGrant and navigates to /grants when Delete is confirmed", async () => {
    const mockDeleteGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      deleteGrant: { mutateAsync: mockDeleteGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Confirm Delete Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete grant" }));
    // Use getAllByRole because the ConfirmDialog (metric-entry) also renders a Delete button.
    // The delete-grant dialog's Delete button appears first in DOM order.
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    await waitFor(() => {
      expect(mockDeleteGrant).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/grants" });
    });
  });

  it("disables the Delete grant confirm button while the deletion is in flight", () => {
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      deleteGrant: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Deleting Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // The delete-grant dialog's confirm button is first in DOM order.
    expect(screen.getAllByRole("button", { name: "Delete" })[0]!).toBeDisabled();
  });

  it("disables the Delete allocation button while a removal is in flight", () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn(), isPending: true },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Allocated Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-pending-1", fund: { name: "Tech Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole("button", { name: "Delete allocation" })).toBeDisabled();
  });

  it("formats whole-dollar and fractional cents as two-decimal money input values", () => {
    expect(centsToAmountInput(100000)).toBe("1000.00");
    expect(centsToAmountInput(100)).toBe("1.00");
    expect(centsToAmountInput(12345)).toBe("123.45");
    expect(centsToAmountInput(0)).toBe("0.00");
  });

  it("shows overviewError when updateGrant rejects and clears it on subsequent change", async () => {
    const mockUpdateGrant = vi.fn().mockRejectedValue(new Error("Save failed"));
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      updateGrant: { mutateAsync: mockUpdateGrant },
      deleteGrant: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const overviewForm = screen
      .getByRole("button", { name: "Save changes" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");

    // Changing any input in the form should clear the error
    const nameInput = screen.getByRole("textbox", { name: "Grant name" });
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks an overview save whose end date precedes its start date without calling the API", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      updateGrant: { mutateAsync: mockUpdateGrant },
      deleteGrant: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const startInput = document.querySelector("#grant-start") as HTMLInputElement;
    const endInput = document.querySelector("#grant-end") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "2027-12-31" } });
    fireEvent.change(endInput, { target: { value: "2025-01-01" } });

    const overviewForm = screen
      .getByRole("button", { name: "Save changes" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "End date must be on or after the start date.",
    );
    expect(mockUpdateGrant).not.toHaveBeenCalled();
  });

  it("renders a funder select pre-populated with the grant's current funder", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Funded Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        funder: { id: "funder-1", name: "Example Foundation" },
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole("combobox", { name: "Funder" })).toHaveValue("funder-1");
  });

  it("passes the reassigned funder to updateGrant on overview form submit", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      updateGrant: { mutateAsync: mockUpdateGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Funded Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        funder: { id: "funder-1", name: "Example Foundation" },
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const funderSelect = screen.getByRole("combobox", { name: "Funder" });
    fireEvent.change(funderSelect, { target: { value: "funder-2" } });

    const overviewForm = funderSelect.closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    await waitFor(() => {
      expect(mockUpdateGrant).toHaveBeenCalledWith(
        expect.objectContaining({ funderId: "funder-2" }),
      );
    });
  });

  it("omits funderId when the grant has no funder and none is chosen", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      updateGrant: { mutateAsync: mockUpdateGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Unfunded Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        funder: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const funderSelect = screen.getByRole("combobox", { name: "Funder" });
    expect(funderSelect).toHaveValue("");

    const overviewForm = funderSelect.closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    await waitFor(() => {
      expect(mockUpdateGrant).toHaveBeenCalledWith(
        expect.objectContaining({ funderId: undefined }),
      );
    });
  });

  it("opens and submits the edit allocation dialog", async () => {
    const mockUpdateAllocation = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: mockUpdateAllocation },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-edit-1", fund: { name: "Operations Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Click Edit to open the edit allocation dialog
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // The edit dialog should now be rendered — use the unique input id to find it
    const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    fireEvent.change(amountInput, { target: { value: "1500" } });
    const editForm = amountInput.closest("form") as HTMLFormElement;
    fireEvent.submit(editForm);

    await waitFor(() => {
      expect(mockUpdateAllocation).toHaveBeenCalledWith({
        allocationId: "alloc-edit-1",
        data: { allocatedAmountCents: 150000 },
      });
    });
  });

  it("shows editAllocationError when update amount is zero and clears it on onChange", async () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-edit-2", fund: { name: "Tech Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Click Edit to open dialog
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Use the unique input id for the edit dialog
    const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    fireEvent.change(amountInput, { target: { value: "0" } });
    const editForm = amountInput.closest("form") as HTMLFormElement;
    fireEvent.submit(editForm);

    expect(screen.getByRole("alert")).toHaveTextContent("Amount must be greater than zero.");

    // Change the input to clear the error
    fireEvent.change(amountInput, { target: { value: "500" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows editAllocationError when updateAllocation rejects", async () => {
    const mockUpdateAllocation = vi.fn().mockRejectedValue(new Error("Update failed"));
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: mockUpdateAllocation },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-edit-3", fund: { name: "Research Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Click Edit to open dialog
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Use the unique input id for the edit dialog
    const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    fireEvent.change(amountInput, { target: { value: "2000" } });
    const editForm = amountInput.closest("form") as HTMLFormElement;
    fireEvent.submit(editForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");
  });

  it("uses empty string defaultValue in edit allocation dialog when allocatedAmountCents is null", () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          // allocatedAmountCents is null to trigger the empty-string fallback branch
          { id: "alloc-null-amt", fund: { name: "Null Fund" }, allocatedAmountCents: null },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Click Edit to open dialog; the defaultValue should be "" not a number string
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    expect(amountInput.defaultValue).toBe("");
  });

  it("passes undefined status to updateGrant when rawStatus is not a valid GrantStatus", async () => {
    const mockUpdateGrant = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      updateGrant: { mutateAsync: mockUpdateGrant },
      deleteGrant: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: null,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Set an invalid value on the status select via fireEvent.change to update React state
    const statusSelect = screen.getByRole("combobox", {
      name: "Pipeline status",
    }) as HTMLInputElement;
    fireEvent.change(statusSelect, { target: { value: "invalid_status" } });
    const overviewForm = screen
      .getByRole("button", { name: "Save changes" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    await waitFor(() => {
      expect(mockUpdateGrant).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
    });
  });

  it("does not call deleteAllocation immediately — shows confirm dialog first", async () => {
    const mockDeleteAllocation = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: mockDeleteAllocation, isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-del-1", fund: { name: "Operations Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete allocation" }));
    expect(mockDeleteAllocation).not.toHaveBeenCalled();

    // Confirm in the "Delete allocation?" dialog specifically
    const dialogTitle = screen.getByText("Delete allocation?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteAllocation).toHaveBeenCalledWith("alloc-del-1");
    });
  });

  it("does not call deleteExpense immediately — shows confirm dialog first", async () => {
    const mockDeleteExpense = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseExpenseMutations.mockReturnValue({
      createExpense: { mutateAsync: vi.fn() },
      updateExpense: { mutateAsync: vi.fn() },
      deleteExpense: { mutateAsync: mockDeleteExpense, isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 25000,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [
          {
            id: "exp-del-1",
            description: "Travel",
            amountCents: 25000,
            date: "2026-02-01T12:00:00.000Z",
          },
        ],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
    expect(mockDeleteExpense).not.toHaveBeenCalled();

    const dialogTitle = screen.getByText("Delete expense?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteExpense).toHaveBeenCalledWith("exp-del-1");
    });
  });

  it("does not call deleteMetric immediately — shows confirm dialog first", async () => {
    const mockDeleteMetric = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: mockDeleteMetric, isPending: false },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-del-1",
            name: "Families Served",
            unit: "families",
            actualValue: 10,
            targetValue: "50",
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete metric" }));
    expect(mockDeleteMetric).not.toHaveBeenCalled();

    const dialogTitle = screen.getByText("Delete metric?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteMetric).toHaveBeenCalledWith("metric-del-1");
    });
  });

  it("calls deleteEntry when the Delete entry button is clicked on a metric entry", async () => {
    const mockDeleteEntry = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn() },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: mockDeleteEntry },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-entry-1",
            name: "Children Reached",
            unit: "children",
            actualValue: 20,
            targetValue: "100",
            entries: [
              {
                id: "entry-del-1",
                value: "20",
                periodStart: "2026-01-01T00:00:00.000Z",
                periodEnd: "2026-03-31T00:00:00.000Z",
                notes: "Q1",
              },
            ],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Clicking "Delete entry" now opens the ConfirmDialog instead of calling deleteEntry directly.
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    // Confirm in the "Delete entry?" dialog specifically.
    const entryDialogTitle = screen.getByText("Delete entry?");
    const entryDialogContent = entryDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(entryDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteEntry).toHaveBeenCalledWith({
        metricId: "metric-entry-1",
        entryId: "entry-del-1",
      });
    });
  });

  it("shows deleteGrantError when deleteGrant throws and stays in dialog", async () => {
    const mockDeleteGrant = vi.fn().mockRejectedValue(new Error("Permission denied."));
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      ...NOOP_MUTATIONS,
      deleteGrant: { mutateAsync: mockDeleteGrant },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Error Grant",
        status: "discovery",
        amountCents: null,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 0,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete grant" }));
    // Use getAllByRole because the ConfirmDialog (metric-entry) also renders a Delete button.
    // The delete-grant dialog's Delete button appears first in DOM order.
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    await waitFor(() => {
      expect(screen.getByText("Permission denied.")).toBeInTheDocument();
    });
    // Navigate should NOT have been called
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows deleteAllocationError when deleteAllocation throws", async () => {
    const mockDeleteAllocation = vi.fn().mockRejectedValue(new Error("Allocation delete failed."));
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: mockDeleteAllocation, isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-err-1", fund: { name: "Error Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete allocation" }));
    const dialogTitle = screen.getByText("Delete allocation?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Allocation delete failed.")).toBeInTheDocument();
    });
  });

  it("shows deleteExpenseError when deleteExpense throws", async () => {
    const mockDeleteExpense = vi.fn().mockRejectedValue(new Error("Expense delete failed."));
    hoisted.mockUseExpenseMutations.mockReturnValue({
      createExpense: { mutateAsync: vi.fn() },
      updateExpense: { mutateAsync: vi.fn() },
      deleteExpense: { mutateAsync: mockDeleteExpense, isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 50000,
          remainingBalanceCents: 450000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [
          {
            id: "exp-err-1",
            description: "Conference travel",
            amountCents: 50000,
            date: "2026-04-01",
          },
        ],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
    const dialogTitle = screen.getByText("Delete expense?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Expense delete failed.")).toBeInTheDocument();
    });
  });

  it("shows deleteMetricError when deleteMetric throws", async () => {
    const mockDeleteMetric = vi.fn().mockRejectedValue(new Error("Metric delete failed."));
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: mockDeleteMetric, isPending: false },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-err-1",
            name: "Families Served",
            unit: "families",
            actualValue: 5,
            targetValue: "20",
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete metric" }));
    const dialogTitle = screen.getByText("Delete metric?");
    const dialogContent = dialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(dialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Metric delete failed.")).toBeInTheDocument();
    });
  });

  it("closes edit allocation dialog via dialog dismissal (onOpenChange false)", () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-dismiss-1", fund: { name: "Science Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Open the edit allocation dialog
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(document.querySelector("#edit-alloc-amount")).not.toBeNull();

    // Simulate dialog dismissal via onOpenChange(false) — covers the branch at lines 575-579
    const editAmountInput = document.querySelector("#edit-alloc-amount");
    const editDialog = editAmountInput?.closest("[data-testid='dialog']");
    const closeTrigger = editDialog?.querySelector("[data-testid='dialog-close-trigger']");
    if (closeTrigger) {
      fireEvent.click(closeTrigger);
    }

    // The edit dialog should now be closed
    expect(document.querySelector("#edit-alloc-amount")).toBeNull();
  });

  it("closes edit allocation dialog and clears error when Cancel button is clicked", () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          {
            id: "alloc-cancel-btn-1",
            fund: { name: "Science Fund" },
            allocatedAmountCents: 100000,
          },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Open the edit allocation dialog
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(document.querySelector("#edit-alloc-amount")).not.toBeNull();

    // Click the Cancel button inside the edit dialog
    const editAmountInput = document.querySelector("#edit-alloc-amount");
    const editForm = editAmountInput?.closest("form");
    const cancelBtn = editForm?.parentElement?.querySelector(
      "button[type='button']",
    ) as HTMLButtonElement | null;
    if (cancelBtn) {
      fireEvent.click(cancelBtn);
    }

    // The edit dialog should now be closed
    expect(document.querySelector("#edit-alloc-amount")).toBeNull();
  });

  it("uses fallback error message when updateGrant throws a non-Error", async () => {
    const mockUpdateGrant = vi.fn().mockRejectedValue("plain string error from grant update");
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      updateGrant: { mutateAsync: mockUpdateGrant },
      deleteGrant: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const overviewForm = screen
      .getByRole("button", { name: "Save changes" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(overviewForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save grant details.");
  });

  it("uses fallback error message when updateAllocation throws a non-Error", async () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn().mockRejectedValue("unexpected string error") },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 100000,
          expenseTotalCents: 0,
          remainingBalanceCents: 400000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [
          { id: "alloc-str-err-1", fund: { name: "Research Fund" }, allocatedAmountCents: 100000 },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "1000" } });
    const editForm = amountInput.closest("form") as HTMLFormElement;
    fireEvent.submit(editForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update allocation.");
  });

  it("uses fallback error message when createAllocation throws a non-Error", async () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: {
        mutateAsync: vi.fn().mockRejectedValue("unexpected string error for create"),
      },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-nonErr-1", name: "Research Fund" }] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), {
      target: { value: "fund-nonErr-1" },
    });
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[0] as HTMLElement,
      {
        target: { value: "500" },
      },
    );
    const allocForm = screen
      .getByRole("button", { name: "Save allocation" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(allocForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save allocation.");
  });

  it("uses fallback error message when createExpense throws a non-Error", async () => {
    hoisted.mockUseExpenseMutations.mockReturnValue({
      createExpense: {
        mutateAsync: vi.fn().mockRejectedValue("unexpected string error for expense"),
      },
      updateExpense: { mutateAsync: vi.fn() },
      deleteExpense: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    // Expense amount is the second "Amount (USD)" spinbutton (first is allocation)
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[1] as HTMLElement,
      {
        target: { value: "500" },
      },
    );
    fireEvent.change(document.querySelector("#exp-date") as HTMLInputElement, {
      target: { value: "2026-04-15" },
    });
    const expenseForm = screen
      .getByRole("button", { name: "Save expense" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(expenseForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save expense.");
  });

  it("renders completed closeout item with completedBy and without completedBy", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [
          {
            id: "item-with-user",
            label: "Final report submitted",
            completed: true,
            dueDate: null,
            completedAt: "2026-04-15T00:00:00.000Z",
            completedBy: "user-jane",
            completedByUser: { name: "Jane Doe" },
          },
          {
            id: "item-without-user",
            label: "Audit complete",
            completed: true,
            dueDate: null,
            completedAt: "2026-04-16T00:00:00.000Z",
            completedBy: null,
            completedByUser: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText(/by Jane Doe/)).toBeInTheDocument();
    // item without completedBy should show "Completed Apr 16, 2026" without a "by" suffix
    expect(screen.getByText("Completed Apr 16, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/by null/)).not.toBeInTheDocument();
  });

  it("renders Alert for spend-down loading state when spendDownQuery is pending", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Spend-Down Loading Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });

    const { container } = renderPage();

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    expect(spendDownContent).toBeInTheDocument();
    const loadingSkeleton = spendDownContent?.querySelector("[data-testid='spend-down-loading']");
    expect(loadingSkeleton).not.toBeNull();
  });

  it("renders Alert for spend-down report success state", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Spend-Down Success Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      data: {
        budgetCents: 100000,
        expensesCents: 0,
        remainingCents: 100000,
        burnRateCentsPerMonth: null,
        thresholdState: null,
        byCategory: [],
        byFund: [],
        byMonth: [],
      },
      isPending: false,
      isError: false,
    });

    const { container } = renderPage();

    const downloadBtn = screen.getByRole("button", { name: "Download spend-down report" });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ grantId: "grant-test-1" });
    });

    await waitFor(() => {
      const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
      const successAlerts = spendDownContent?.querySelectorAll("[data-slot='alert']");
      const hasSuccess = Array.from(successAlerts ?? []).some((el) =>
        el.textContent?.includes("Spend-down report generated"),
      );
      expect(hasSuccess).toBe(true);
    });
  });

  it("surfaces an error when generating the spend-down report fails", async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error("Report generation failed"));
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Spend-Down Error Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      data: {
        budgetCents: 100000,
        expensesCents: 0,
        remainingCents: 100000,
        burnRateCentsPerMonth: null,
        thresholdState: null,
        byCategory: [],
        byFund: [],
        byMonth: [],
      },
      isPending: false,
      isError: false,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Download spend-down report" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ grantId: "grant-test-1" });
    });
    expect(await screen.findByText("Report generation failed")).toBeInTheDocument();
  });

  describe("role-gated actions", () => {
    const LOADED_GRANT = {
      name: "Test Grant",
      status: "active",
      amountCents: 100000,
      description: "",
      notes: "",
      applicationDeadline: null,
      startDate: null,
      endDate: null,
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 100000,
        thresholdState: "80",
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    };

    beforeEach(() => {
      hoisted.mockUseGrant.mockReturnValue({
        data: LOADED_GRANT,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
    });

    it("shows Delete grant button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: "Delete grant" })).toBeInTheDocument();
    });

    it("hides Delete grant button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: "Delete grant" })).not.toBeInTheDocument();
    });

    it("hides Delete grant button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: "Delete grant" })).not.toBeInTheDocument();
    });

    it("shows Save changes button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    it("hides Save changes button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    });

    it("shows Save changes button for viewer with grants edit override", () => {
      hoisted.mockUseSession.mockReturnValue({
        memberRole: "viewer",
        memberPermissions: { grants: "edit" },
        isLoading: false,
      });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    it("shows Add allocation button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add allocation/i })).toBeInTheDocument();
    });

    it("shows Add allocation button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add allocation/i })).toBeInTheDocument();
    });

    it("hides Add allocation button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: /add allocation/i })).not.toBeInTheDocument();
    });

    it("shows Add expense button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add expense/i })).toBeInTheDocument();
    });

    it("shows Add expense button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add expense/i })).toBeInTheDocument();
    });

    it("hides Add expense button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: /add expense/i })).not.toBeInTheDocument();
    });

    it("shows Add metric button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add metric/i })).toBeInTheDocument();
    });

    it("shows Add metric button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add metric/i })).toBeInTheDocument();
    });

    it("hides Add metric button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: /add metric/i })).not.toBeInTheDocument();
    });

    it("shows Add reporting requirement button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(
        screen.getByRole("button", { name: /add reporting requirement/i }),
      ).toBeInTheDocument();
    });

    it("shows Add reporting requirement button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(
        screen.getByRole("button", { name: /add reporting requirement/i }),
      ).toBeInTheDocument();
    });

    it("hides Add reporting requirement button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(
        screen.queryByRole("button", { name: /add reporting requirement/i }),
      ).not.toBeInTheDocument();
    });

    it("shows Add closeout item button for admin role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add closeout item/i })).toBeInTheDocument();
    });

    it("shows Add closeout item button for editor role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "editor", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.getByRole("button", { name: /add closeout item/i })).toBeInTheDocument();
    });

    it("hides Add closeout item button for viewer role", () => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      render(<GrantDetailPage />);
      expect(screen.queryByRole("button", { name: /add closeout item/i })).not.toBeInTheDocument();
    });
  });

  describe("viewer inline mutation hardening", () => {
    const VIEWER_LOADED_GRANT = {
      name: "Viewer Grant",
      status: "active",
      amountCents: 250000,
      description: "Existing description",
      notes: "Existing notes",
      applicationDeadline: "2026-05-15T12:00:00.000Z",
      startDate: "2026-01-01T12:00:00.000Z",
      endDate: "2026-12-31T12:00:00.000Z",
      summary: {
        allocatedTotalCents: 150000,
        expenseTotalCents: 50000,
        remainingBalanceCents: 200000,
        thresholdState: "80",
        burnRateCentsPerMonth: 10000,
      },
      fundAllocations: [
        {
          id: "allocation-viewer-1",
          fund: { name: "General Fund" },
          allocatedAmountCents: 150000,
        },
      ],
      expenses: [
        {
          id: "expense-viewer-1",
          description: "Program travel",
          amountCents: 50000,
          date: "2026-02-01T12:00:00.000Z",
        },
      ],
      impactMetrics: [
        {
          id: "metric-viewer-1",
          name: "Students served",
          unit: "students",
          actualValue: 10,
          targetValue: "100",
          entries: [
            {
              id: "entry-viewer-1",
              value: "10",
              periodStart: "2026-01-01T12:00:00.000Z",
              periodEnd: "2026-01-31T12:00:00.000Z",
              notes: "January update",
            },
          ],
        },
      ],
      reportingRequirements: [
        {
          id: "requirement-viewer-1",
          reportType: "quarterly",
          dueDate: "2026-06-30T12:00:00.000Z",
          derivedStatus: "upcoming",
        },
      ],
      closeoutItems: [
        {
          id: "closeout-viewer-1",
          label: "Submit final report",
          completed: false,
          dueDate: "2026-11-30T12:00:00.000Z",
          completedAt: null,
          completedBy: null,
        },
      ],
    };

    beforeEach(() => {
      hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      hoisted.mockUseGrant.mockReturnValue({
        data: VIEWER_LOADED_GRANT,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
    });

    it("does not let viewers submit overview, allocation, expense, or metric mutations", async () => {
      const mockUpdateGrant = vi.fn();
      const mockUpdateAllocation = vi.fn();
      const mockDeleteAllocation = vi.fn();
      const mockDeleteExpense = vi.fn();
      const mockDeleteMetric = vi.fn();
      const mockCreateEntry = vi.fn();
      const mockDeleteEntry = vi.fn();

      hoisted.mockUseGrantUpdateMutations.mockReturnValue({
        updateGrant: { mutateAsync: mockUpdateGrant },
        deleteGrant: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: vi.fn() },
        updateAllocation: { mutateAsync: mockUpdateAllocation },
        deleteAllocation: { mutateAsync: mockDeleteAllocation },
      });
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: vi.fn() },
        updateExpense: { mutateAsync: vi.fn() },
        deleteExpense: { mutateAsync: mockDeleteExpense },
      });
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: vi.fn() },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: mockDeleteMetric },
        createEntry: { mutateAsync: mockCreateEntry },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: mockDeleteEntry },
      });

      renderPage();

      const overviewForm = screen.getByLabelText("Grant name").closest("form");
      expect(overviewForm).not.toBeNull();
      fireEvent.submit(overviewForm!);

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const editAllocationSubmit = await screen.findByRole("button", { name: "Save changes" });
      fireEvent.submit(editAllocationSubmit.closest("form")!);

      fireEvent.click(screen.getByRole("button", { name: "Delete allocation" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete metric" }));

      const metricEntryForm = screen.getByRole("button", { name: "Save entry" }).closest("form");
      expect(metricEntryForm).not.toBeNull();
      const entryValueInput = metricEntryForm!.querySelector(
        "input[name='value']",
      ) as HTMLInputElement;
      const entryStartInput = metricEntryForm!.querySelector(
        "input[name='periodStart']",
      ) as HTMLInputElement;
      const entryEndInput = metricEntryForm!.querySelector(
        "input[name='periodEnd']",
      ) as HTMLInputElement;
      fireEvent.change(entryValueInput, { target: { value: "42" } });
      fireEvent.change(entryStartInput, { target: { value: "2026-02-01" } });
      fireEvent.change(entryEndInput, { target: { value: "2026-02-28" } });
      fireEvent.submit(metricEntryForm!);

      fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));

      expect(mockUpdateGrant).not.toHaveBeenCalled();
      expect(mockUpdateAllocation).not.toHaveBeenCalled();
      expect(mockDeleteAllocation).not.toHaveBeenCalled();
      expect(mockDeleteExpense).not.toHaveBeenCalled();
      expect(mockDeleteMetric).not.toHaveBeenCalled();
      expect(mockCreateEntry).not.toHaveBeenCalled();
      expect(mockDeleteEntry).not.toHaveBeenCalled();
    });

    it("does not let viewers submit reporting or closeout mutations", () => {
      const mockUpdateRequirement = vi.fn();
      const mockDeleteRequirement = vi.fn();
      const mockUpdateCloseout = vi.fn();
      const mockDeleteCloseout = vi.fn();

      hoisted.mockUseReportingRequirementMutations.mockReturnValue({
        createRequirement: { mutateAsync: vi.fn() },
        updateRequirement: { mutateAsync: mockUpdateRequirement },
        deleteRequirement: { mutateAsync: mockDeleteRequirement },
      });
      hoisted.mockUseCloseoutItemMutations.mockReturnValue({
        createItem: { mutateAsync: vi.fn() },
        updateItem: { mutateAsync: mockUpdateCloseout },
        deleteItem: { mutateAsync: mockDeleteCloseout },
      });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete requirement" }));

      const closeoutForm = screen
        .getByLabelText("Due date for Submit final report")
        .closest("form");
      expect(closeoutForm).not.toBeNull();
      const closeoutDueDateInput = closeoutForm!.querySelector(
        "input[name='dueDate']",
      ) as HTMLInputElement;
      fireEvent.change(closeoutDueDateInput, { target: { value: "2026-12-15" } });
      fireEvent.submit(closeoutForm!);

      fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete item" }));

      expect(mockUpdateRequirement).not.toHaveBeenCalled();
      expect(mockDeleteRequirement).not.toHaveBeenCalled();
      expect(mockUpdateCloseout).not.toHaveBeenCalled();
      expect(mockDeleteCloseout).not.toHaveBeenCalled();
    });
  });
});

describe("grant detail form helpers", () => {
  it("normalizes nullable text, ISO dates, and empty display dates", () => {
    expect(trimmedText(null)).toBe("");
    expect(trimmedText("  Grant name  ")).toBe("Grant name");
    expect(normalizeDateInput("2026-05-06T10:00:00.000Z")).toBe("2026-05-06T10:00:00.000Z");
    expect(formatIsoDateLabel(null)).toBe("--");
  });

  it("formats YYYY-MM month keys as readable month labels", () => {
    expect(formatYearMonthLabel("2026-01")).toBe("Jan 2026");
    expect(formatYearMonthLabel("2025-12")).toBe("Dec 2025");
  });

  it("returns the raw value when a month key cannot be parsed", () => {
    expect(formatYearMonthLabel("not-a-month")).toBe("not-a-month");
    expect(formatYearMonthLabel("2026-13")).toBe("2026-13");
    expect(formatYearMonthLabel("2026-00")).toBe("2026-00");
    expect(formatYearMonthLabel("26-01")).toBe("26-01");
  });

  it("returns an empty string for nullish month keys", () => {
    expect(formatYearMonthLabel("")).toBe("");
    expect(formatYearMonthLabel(null)).toBe("");
    expect(formatYearMonthLabel(undefined)).toBe("");
  });
});

describe("GrantDetailPage — spend-down data table and generate report states", () => {
  const SPEND_DOWN_FULL_DATA = {
    budgetCents: 500000,
    expensesCents: 100000,
    remainingCents: 400000,
    burnRateCentsPerMonth: 25000,
    thresholdState: "80",
    byCategory: [{ category: "Travel", amountCents: 50000 }],
    byFund: [
      {
        fundId: "fund-1",
        fundName: "General Fund",
        allocatedAmountCents: 300000,
        expensesCents: 100000,
      },
    ],
    byMonth: [
      { month: "2026-01", amountCents: 50000 },
      { month: "2026-02", amountCents: 50000 },
    ],
  };

  const GRANT_DATA = {
    name: "Spend-Down Full Grant",
    status: "active",
    amountCents: 500000,
    description: "",
    notes: "",
    applicationDeadline: null,
    startDate: null,
    endDate: null,
    summary: {
      allocatedTotalCents: 300000,
      expenseTotalCents: 100000,
      remainingBalanceCents: 400000,
      thresholdState: "80",
      burnRateCentsPerMonth: 25000,
    },
    fundAllocations: [],
    expenses: [],
    impactMetrics: [],
    reportingRequirements: [],
    closeoutItems: [],
  };

  beforeEach(() => {
    hoisted.mockUseGrant.mockReturnValue({
      data: GRANT_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      data: SPEND_DOWN_FULL_DATA,
      isPending: false,
      isError: false,
    });
    hoisted.mockUseGrantUpdateMutations.mockReturnValue({
      updateGrant: { mutateAsync: vi.fn() },
      deleteGrant: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseExpenseMutations.mockReturnValue({
      createExpense: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      createEntry: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: vi.fn() },
      updateRequirement: { mutateAsync: vi.fn() },
      deleteRequirement: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: { mutateAsync: vi.fn() },
    });
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Example Foundation" },
          { id: "funder-2", name: "Second Foundation" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
  });

  it("renders spend-down byMonth table rows when byMonth data is populated", () => {
    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    expect(spendDownContent?.textContent).toContain("Jan 2026");
    expect(spendDownContent?.textContent).toContain("Feb 2026");
    expect(spendDownContent?.textContent).not.toContain("2026-01");
    expect(spendDownContent?.textContent).not.toContain("2026-02");
  });

  it("shows Generating… text when generateSpendDownMutation is pending", () => {
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
    });

    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    expect(spendDownContent?.textContent).toContain("Generating");
  });

  it("shows destructive Alert when generateSpendDownMutation has error", () => {
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
    });

    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    const errorAlert = spendDownContent?.querySelector(
      "[data-slot='alert'][data-variant='destructive']",
    );
    expect(errorAlert).not.toBeNull();
    expect(errorAlert?.textContent).toContain("Unable to generate report");
  });

  it("renders thresholdState badge when spendDown has thresholdState", () => {
    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    // ThresholdState "80" renders as threshold label text
    expect(spendDownContent).toBeInTheDocument();
  });

  it("shows destructive Alert for spend-down query error state", () => {
    hoisted.mockUseSpendDown.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });

    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    const errorAlert = spendDownContent?.querySelector(
      "[data-slot='alert'][data-variant='destructive']",
    );
    expect(errorAlert).not.toBeNull();
    expect(errorAlert?.textContent).toContain("Unable to load spend-down data");
  });

  it("renders -- for remainingCents when it is null", () => {
    hoisted.mockUseSpendDown.mockReturnValue({
      data: {
        ...SPEND_DOWN_FULL_DATA,
        remainingCents: null,
      },
      isPending: false,
      isError: false,
    });

    const { container } = render(<GrantDetailPage />);

    const spendDownContent = container.querySelector("[data-testid='tab-content-spend-down']");
    expect(spendDownContent?.textContent).toContain("--");
  });

  it("uses fallback error message when deleteAllocation throws a non-Error", async () => {
    hoisted.mockUseAllocationMutations.mockReturnValue({
      createAllocation: { mutateAsync: vi.fn() },
      updateAllocation: { mutateAsync: vi.fn() },
      deleteAllocation: {
        mutateAsync: vi.fn().mockRejectedValue("string error"),
        isPending: false,
      },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        ...GRANT_DATA,
        fundAllocations: [
          { id: "alloc-str-fallback", fund: { name: "Test Fund" }, allocatedAmountCents: 100000 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete allocation" }));
    const allocDialogTitle = screen.getByText("Delete allocation?");
    const allocDialogContent = allocDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(allocDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to delete allocation.")).toBeInTheDocument();
    });
  });

  it("uses fallback error message when deleteExpense throws a non-Error", async () => {
    hoisted.mockUseExpenseMutations.mockReturnValue({
      createExpense: { mutateAsync: vi.fn() },
      updateExpense: { mutateAsync: vi.fn() },
      deleteExpense: {
        mutateAsync: vi.fn().mockRejectedValue("string error"),
        isPending: false,
      },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        ...GRANT_DATA,
        expenses: [
          {
            id: "exp-str-fallback",
            description: "Test Expense",
            amountCents: 5000,
            date: "2026-01-01",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
    const expDialogTitle = screen.getByText("Delete expense?");
    const expDialogContent = expDialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(expDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to delete expense.")).toBeInTheDocument();
    });
  });

  it("uses fallback error message when deleteEntry throws a non-Error", async () => {
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      createEntry: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: vi.fn().mockRejectedValue("string error") },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        ...GRANT_DATA,
        impactMetrics: [
          {
            id: "metric-str-fallback",
            name: "Test Metric",
            unit: "units",
            actualValue: 5,
            targetValue: "20",
            entries: [
              {
                id: "entry-str-fallback",
                value: "5",
                periodStart: "2026-01-01T00:00:00.000Z",
                periodEnd: "2026-03-31T00:00:00.000Z",
                notes: null,
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    // "Delete entry" now opens the ConfirmDialog; confirm in the "Delete entry?" dialog.
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    const entryDialogTitle = screen.getByText("Delete entry?");
    const entryDialogContent = entryDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(entryDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to delete metric entry.")).toBeInTheDocument();
    });
  });
});

describe("GrantDetailPage — impact metric deleteEntry error path", () => {
  it("shows deleteMetricError when deleteEntry throws", async () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    const mockDeleteEntry = vi.fn().mockRejectedValue(new Error("Entry delete failed."));
    hoisted.mockUseImpactMetricMutations.mockReturnValue({
      createMetric: { mutateAsync: vi.fn() },
      updateMetric: { mutateAsync: vi.fn() },
      deleteMetric: { mutateAsync: vi.fn() },
      createEntry: { mutateAsync: vi.fn() },
      updateEntry: { mutateAsync: vi.fn() },
      deleteEntry: { mutateAsync: mockDeleteEntry },
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 500000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 500000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-entry-err",
            name: "Clients Helped",
            unit: "clients",
            actualValue: 3,
            targetValue: "50",
            entries: [
              {
                id: "entry-err-1",
                value: "3",
                periodStart: "2026-01-01T00:00:00.000Z",
                periodEnd: "2026-03-31T00:00:00.000Z",
                notes: null,
              },
            ],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    // "Delete entry" now opens the ConfirmDialog; confirm in the "Delete entry?" dialog.
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    const entryDialogTitle = screen.getByText("Delete entry?");
    const entryDialogContent = entryDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(entryDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Entry delete failed.")).toBeInTheDocument();
    });
  });
});

describe("GrantDetailPage — spend-down plan gating", () => {
  beforeEach(() => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
  });

  it("shows Starter orgs an upgrade message and disables spend-down downloads", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "starter", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        budgetCents: 100000,
        expensesCents: 80000,
        remainingCents: 20000,
        burnRateCentsPerMonth: 10000,
        thresholdState: "80",
        byCategory: [],
        byFund: [],
        byMonth: [],
      },
    });

    render(<GrantDetailPage />);

    const gateText = screen.getByText(
      "Growth plan required to download spend-down reports. Available on Growth, Audit-Ready, or Enterprise.",
    );
    const gatePanel = gateText.closest('[data-slot="status-panel"]');
    expect(gatePanel).toHaveAttribute("data-variant", "empty");
    const billingLink = within(gatePanel as HTMLElement).getByText("Go to Billing to upgrade.");
    expect(billingLink).toHaveAttribute("href", "/settings#billing");
    expect(screen.getByRole("button", { name: "Download spend-down report" })).toBeDisabled();
  });

  it("fails closed while billing is loading for spend-down downloads", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        budgetCents: 100000,
        expensesCents: 80000,
        remainingCents: 20000,
        burnRateCentsPerMonth: 10000,
        thresholdState: "80",
        byCategory: [],
        byFund: [],
        byMonth: [],
      },
    });

    render(<GrantDetailPage />);

    expect(
      screen.getByText(
        "Growth plan required to download spend-down reports. Available on Growth, Audit-Ready, or Enterprise.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download spend-down report" })).toBeDisabled();
  });

  it("fails closed when billing lookup errors for spend-down downloads", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Billing lookup failed"),
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hoisted.mockUseSpendDown.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        budgetCents: 100000,
        expensesCents: 80000,
        remainingCents: 20000,
        burnRateCentsPerMonth: 10000,
        thresholdState: "80",
        byCategory: [],
        byFund: [],
        byMonth: [],
      },
    });

    render(<GrantDetailPage />);

    expect(
      screen.getByText(
        "Growth plan required to download spend-down reports. Available on Growth, Audit-Ready, or Enterprise.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download spend-down report" })).toBeDisabled();
  });
});

// ── Money parsing tests (Bug #10) ─────────────────────────────────────────
describe("GrantDetailPage — money parsing", () => {
  beforeEach(() => {
    hoisted.mockUseGrantUpdateMutations.mockReturnValue(NOOP_MUTATIONS);
    hoisted.mockUseAllocationMutations.mockReturnValue(NOOP_ALLOCATION);
    hoisted.mockUseExpenseMutations.mockReturnValue(NOOP_EXPENSE);
    hoisted.mockUseImpactMetricMutations.mockReturnValue(NOOP_METRIC);
    hoisted.mockUseReportingRequirementMutations.mockReturnValue(NOOP_REPORTING);
    hoisted.mockUseCloseoutItemMutations.mockReturnValue(NOOP_CLOSEOUT);
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Example Foundation" },
          { id: "funder-2", name: "Second Foundation" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSpendDown.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPaymentSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSubawards.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
  });

  function renderPage() {
    return render(<GrantDetailPage />);
  }

  function grantDataWithFund() {
    return {
      name: "Test Grant",
      status: "active" as const,
      amountCents: 500000,
      description: "",
      notes: "",
      applicationDeadline: null,
      startDate: null,
      endDate: null,
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 500000,
        thresholdState: null,
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    };
  }

  describe("add allocation — money parsing", () => {
    it("converts valid dollar input to cents and calls createAllocation", async () => {
      const mockCreateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: mockCreateAllocation },
        updateAllocation: { mutateAsync: vi.fn() },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseFunds.mockReturnValue({
        data: { data: [{ id: "fund-abc", name: "Program Fund" }] },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), {
        target: { value: "fund-abc" },
      });
      // $250.75 should become 25075 cents
      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[0] as HTMLElement,
        { target: { value: "250.75" } },
      );

      const allocForm = screen
        .getByRole("button", { name: "Save allocation" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(allocForm);

      await waitFor(() => {
        expect(mockCreateAllocation).toHaveBeenCalledWith(
          expect.objectContaining({ allocatedAmountCents: 25075 }),
        );
      });
    });

    it("rejects empty allocation amount and shows validation error", async () => {
      const mockCreateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: mockCreateAllocation },
        updateAllocation: { mutateAsync: vi.fn() },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseFunds.mockReturnValue({
        data: { data: [{ id: "fund-abc", name: "Program Fund" }] },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), {
        target: { value: "fund-abc" },
      });
      // Leave amount empty
      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[0] as HTMLElement,
        { target: { value: "" } },
      );

      const allocForm = screen
        .getByRole("button", { name: "Save allocation" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(allocForm);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Fund and a positive amount are required.",
      );
      expect(mockCreateAllocation).not.toHaveBeenCalled();
    });

    it("rejects non-numeric allocation amount and shows validation error", async () => {
      const mockCreateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: mockCreateAllocation },
        updateAllocation: { mutateAsync: vi.fn() },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseFunds.mockReturnValue({
        data: { data: [{ id: "fund-abc", name: "Program Fund" }] },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), {
        target: { value: "fund-abc" },
      });
      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[0] as HTMLElement,
        { target: { value: "not-a-number" } },
      );

      const allocForm = screen
        .getByRole("button", { name: "Save allocation" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(allocForm);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Fund and a positive amount are required.",
      );
      expect(mockCreateAllocation).not.toHaveBeenCalled();
    });
  });

  describe("edit allocation — money parsing", () => {
    it("converts valid dollar input to cents and calls updateAllocation", async () => {
      const mockUpdateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: vi.fn() },
        updateAllocation: { mutateAsync: mockUpdateAllocation },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          fundAllocations: [
            { id: "alloc-money-1", fund: { name: "Program Fund" }, allocatedAmountCents: 50000 },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));

      const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
      // $99.99 → 9999 cents
      fireEvent.change(amountInput, { target: { value: "99.99" } });
      fireEvent.submit(amountInput.closest("form") as HTMLFormElement);

      await waitFor(() => {
        expect(mockUpdateAllocation).toHaveBeenCalledWith(
          expect.objectContaining({ data: { allocatedAmountCents: 9999 } }),
        );
      });
    });

    it("rejects empty amount in edit allocation and shows validation error", async () => {
      const mockUpdateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: vi.fn() },
        updateAllocation: { mutateAsync: mockUpdateAllocation },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          fundAllocations: [
            { id: "alloc-money-2", fund: { name: "Program Fund" }, allocatedAmountCents: 50000 },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));

      const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "" } });
      fireEvent.submit(amountInput.closest("form") as HTMLFormElement);

      expect(screen.getByRole("alert")).toHaveTextContent("Amount must be greater than zero.");
      expect(mockUpdateAllocation).not.toHaveBeenCalled();
    });

    it("rejects non-numeric amount in edit allocation and shows validation error", async () => {
      const mockUpdateAllocation = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseAllocationMutations.mockReturnValue({
        createAllocation: { mutateAsync: vi.fn() },
        updateAllocation: { mutateAsync: mockUpdateAllocation },
        deleteAllocation: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          fundAllocations: [
            { id: "alloc-money-3", fund: { name: "Program Fund" }, allocatedAmountCents: 50000 },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));

      const amountInput = document.querySelector("#edit-alloc-amount") as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "bad-input" } });
      fireEvent.submit(amountInput.closest("form") as HTMLFormElement);

      expect(screen.getByRole("alert")).toHaveTextContent("Amount must be greater than zero.");
      expect(mockUpdateAllocation).not.toHaveBeenCalled();
    });
  });

  describe("add expense — money parsing", () => {
    it("converts valid dollar input to cents and calls createExpense", async () => {
      const mockCreateExpense = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: mockCreateExpense },
        deleteExpense: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      // Expense amount is the second "Amount (USD)" spinbutton (allocation is first)
      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[1] as HTMLElement,
        { target: { value: "125.50" } },
      );
      const expensesTab = document.querySelector(
        "[data-testid='tab-content-expenses']",
      ) as HTMLElement;
      const dateInput = expensesTab.querySelector("input[name='date']") as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-03-15" } });

      const expenseForm = screen
        .getByRole("button", { name: "Save expense" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(expenseForm);

      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledWith(
          expect.objectContaining({ amountCents: 12550 }),
        );
      });
    });

    it("rejects empty expense amount and shows validation error", async () => {
      const mockCreateExpense = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: mockCreateExpense },
        deleteExpense: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      // Leave expense amount empty, fill in date
      const expensesTab = document.querySelector(
        "[data-testid='tab-content-expenses']",
      ) as HTMLElement;
      const dateInput = expensesTab.querySelector("input[name='date']") as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-03-15" } });

      const expenseForm = screen
        .getByRole("button", { name: "Save expense" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(expenseForm);

      expect(screen.getByRole("alert")).toHaveTextContent("Expense amount and date are required.");
      expect(mockCreateExpense).not.toHaveBeenCalled();
    });

    it("rejects non-numeric expense amount and shows validation error", async () => {
      const mockCreateExpense = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: mockCreateExpense },
        deleteExpense: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[1] as HTMLElement,
        { target: { value: "not-a-number" } },
      );
      const expensesTab = document.querySelector(
        "[data-testid='tab-content-expenses']",
      ) as HTMLElement;
      const dateInput = expensesTab.querySelector("input[name='date']") as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-03-15" } });

      const expenseForm = screen
        .getByRole("button", { name: "Save expense" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(expenseForm);

      expect(screen.getByRole("alert")).toHaveTextContent("Expense amount and date are required.");
      expect(mockCreateExpense).not.toHaveBeenCalled();
    });
  });

  describe("optional text fields — omit when blank", () => {
    it("omits expense description when blank instead of sending an empty string", async () => {
      const mockCreateExpense = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: mockCreateExpense },
        deleteExpense: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[1] as HTMLElement,
        { target: { value: "50.00" } },
      );
      const expensesTab = document.querySelector(
        "[data-testid='tab-content-expenses']",
      ) as HTMLElement;
      const dateInput = expensesTab.querySelector("input[name='date']") as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-03-15" } });

      const expenseForm = screen
        .getByRole("button", { name: "Save expense" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(expenseForm);

      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.not.objectContaining({ description: expect.anything() }),
      );
    });

    it("includes expense description when provided", async () => {
      const mockCreateExpense = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseExpenseMutations.mockReturnValue({
        createExpense: { mutateAsync: mockCreateExpense },
        deleteExpense: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(
        screen.getAllByRole("spinbutton", { name: "Amount (USD)" })[1] as HTMLElement,
        { target: { value: "50.00" } },
      );
      const expensesTab = document.querySelector(
        "[data-testid='tab-content-expenses']",
      ) as HTMLElement;
      const dateInput = expensesTab.querySelector("input[name='date']") as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-03-15" } });
      const descInput = expensesTab.querySelector("input[name='description']") as HTMLInputElement;
      fireEvent.change(descInput, { target: { value: "Travel" } });

      const expenseForm = screen
        .getByRole("button", { name: "Save expense" })
        .closest("form") as HTMLFormElement;
      fireEvent.submit(expenseForm);

      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Travel" }),
        );
      });
    });

    it("omits metric unit when blank instead of sending an empty string", async () => {
      const mockCreateMetric = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: mockCreateMetric },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: vi.fn() },
        createEntry: { mutateAsync: vi.fn() },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("Metric name"), {
        target: { value: "Families served" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

      await waitFor(() => {
        expect(mockCreateMetric).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateMetric).toHaveBeenCalledWith({ name: "Families served" });
    });

    it("includes metric unit when provided", async () => {
      const mockCreateMetric = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: mockCreateMetric },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: vi.fn() },
        createEntry: { mutateAsync: vi.fn() },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: grantDataWithFund(),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("Metric name"), {
        target: { value: "Families served" },
      });
      fireEvent.change(screen.getByPlaceholderText("Unit"), {
        target: { value: "families" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

      await waitFor(() => {
        expect(mockCreateMetric).toHaveBeenCalledWith({
          name: "Families served",
          unit: "families",
        });
      });
    });

    it("omits metric entry notes when blank instead of sending an empty string", async () => {
      const mockCreateEntry = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: vi.fn() },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: vi.fn() },
        createEntry: { mutateAsync: mockCreateEntry },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          impactMetrics: [
            {
              id: "metric-notes-1",
              name: "Children Reached",
              unit: "children",
              actualValue: 0,
              targetValue: "100",
              entries: [],
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const entryForm = screen
        .getByRole("button", { name: "Save entry" })
        .closest("form") as HTMLFormElement;
      fireEvent.change(entryForm.querySelector("input[name='value']") as HTMLInputElement, {
        target: { value: "42" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodStart']") as HTMLInputElement, {
        target: { value: "2026-02-01" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodEnd']") as HTMLInputElement, {
        target: { value: "2026-02-28" },
      });
      fireEvent.submit(entryForm);

      await waitFor(() => {
        expect(mockCreateEntry).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ notes: expect.anything() }),
        }),
      );
    });

    it("blocks a metric entry whose period end precedes its period start", async () => {
      const mockCreateEntry = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: vi.fn() },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: vi.fn() },
        createEntry: { mutateAsync: mockCreateEntry },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          impactMetrics: [
            {
              id: "metric-order-1",
              name: "Children Reached",
              unit: "children",
              actualValue: 0,
              targetValue: "100",
              entries: [],
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const entryForm = screen
        .getByRole("button", { name: "Save entry" })
        .closest("form") as HTMLFormElement;
      fireEvent.change(entryForm.querySelector("input[name='value']") as HTMLInputElement, {
        target: { value: "42" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodStart']") as HTMLInputElement, {
        target: { value: "2026-09-30" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodEnd']") as HTMLInputElement, {
        target: { value: "2026-02-01" },
      });
      fireEvent.submit(entryForm);

      expect(screen.getByText("End date must be on or after the start date.")).toBeInTheDocument();
      expect(mockCreateEntry).not.toHaveBeenCalled();
    });

    it("includes metric entry notes when provided", async () => {
      const mockCreateEntry = vi.fn().mockResolvedValue(undefined);
      hoisted.mockUseImpactMetricMutations.mockReturnValue({
        createMetric: { mutateAsync: vi.fn() },
        updateMetric: { mutateAsync: vi.fn() },
        deleteMetric: { mutateAsync: vi.fn() },
        createEntry: { mutateAsync: mockCreateEntry },
        updateEntry: { mutateAsync: vi.fn() },
        deleteEntry: { mutateAsync: vi.fn() },
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...grantDataWithFund(),
          impactMetrics: [
            {
              id: "metric-notes-2",
              name: "Children Reached",
              unit: "children",
              actualValue: 0,
              targetValue: "100",
              entries: [],
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const entryForm = screen
        .getByRole("button", { name: "Save entry" })
        .closest("form") as HTMLFormElement;
      fireEvent.change(entryForm.querySelector("input[name='value']") as HTMLInputElement, {
        target: { value: "42" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodStart']") as HTMLInputElement, {
        target: { value: "2026-02-01" },
      });
      fireEvent.change(entryForm.querySelector("input[name='periodEnd']") as HTMLInputElement, {
        target: { value: "2026-02-28" },
      });
      fireEvent.change(entryForm.querySelector("input[name='notes']") as HTMLInputElement, {
        target: { value: "Q1 progress" },
      });
      fireEvent.submit(entryForm);

      await waitFor(() => {
        expect(mockCreateEntry).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: "Q1 progress" }),
        }),
      );
    });
  });

  describe("Payments tab", () => {
    const baseGrant = {
      name: "STEM Access Fund",
      status: "active",
      amountCents: 500000,
      description: "",
      notes: "",
      applicationDeadline: null,
      startDate: null,
      endDate: null,
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 500000,
        thresholdState: null,
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    };

    it("renders Payments tab trigger in the tab list", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      expect(screen.getByRole("tab", { name: "Payments" })).toBeInTheDocument();
    });

    it("shows upsell card when plan does not support payment requests", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "starter", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      expect(paymentsTabContent).toBeInTheDocument();
      expect(paymentsTabContent).toHaveTextContent(
        "Grant payment requests require the Growth plan or higher.",
      );
      expect(paymentsTabContent.querySelector("a[href='/settings#billing']")).toBeInTheDocument();
    });

    it("renders payment summary cards and empty request list for growth plan", () => {
      hoisted.mockUseGrantPaymentSummary.mockReturnValue({
        data: {
          totalRequestedCents: 100000,
          totalApprovedCents: 80000,
          totalPaidCents: 60000,
          outstandingCents: 20000,
        },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUsePaymentRequests.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      expect(paymentsTabContent).toBeInTheDocument();
      expect(paymentsTabContent).toHaveTextContent("Total requested");
      expect(paymentsTabContent).toHaveTextContent("$1,000");
      expect(paymentsTabContent).toHaveTextContent("Total approved");
      expect(paymentsTabContent).toHaveTextContent("$800");
      expect(paymentsTabContent).toHaveTextContent("Total paid");
      expect(paymentsTabContent).toHaveTextContent("$600");
      expect(paymentsTabContent).toHaveTextContent("Outstanding");
      expect(paymentsTabContent).toHaveTextContent("$200");
      expect(paymentsTabContent).toHaveTextContent(
        "No payment requests yet. Create one to answer what is ready to draw down.",
      );
    });

    it("renders payment request rows when requests exist", () => {
      hoisted.mockUsePaymentRequests.mockReturnValue({
        data: {
          data: [
            {
              id: "req-111",
              requestNumber: "PRQ-001",
              type: "reimbursement",
              status: "submitted",
              requestedAmountCents: 50000,
              createdAt: "2026-04-01T00:00:00.000Z",
            },
            {
              id: "req-22222222",
              requestNumber: null,
              type: null,
              status: "draft",
              requestedAmountCents: 25000,
              createdAt: null,
            },
          ],
        },
        isLoading: false,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      expect(paymentsTabContent).toHaveTextContent("PRQ-001");
      expect(paymentsTabContent).toHaveTextContent("Reimbursement");
      expect(paymentsTabContent).toHaveTextContent("Submitted");
      expect(paymentsTabContent).toHaveTextContent("$500");
      expect(paymentsTabContent).toHaveTextContent("req-2222");
      expect(paymentsTabContent).toHaveTextContent("--");
      expect(paymentsTabContent).toHaveTextContent("Draft");
      expect(paymentsTabContent).toHaveTextContent("$250");
    });

    it("renders payment request load errors with a retry action", () => {
      const refetch = vi.fn();
      hoisted.mockUsePaymentRequests.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
        error: new Error("Payment requests boom"),
        refetch,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      expect(paymentsTabContent).toHaveTextContent("Unable to load payment requests.");
      expect(paymentsTabContent).toHaveTextContent("Payment requests boom");

      const retryButton = within(paymentsTabContent).getByRole("button", { name: /retry/i });
      fireEvent.click(retryButton);
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to a generic retry message when the payment request error is not an Error", () => {
      hoisted.mockUsePaymentRequests.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
        error: "string failure",
        refetch: vi.fn(),
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      expect(paymentsTabContent).toHaveTextContent("Unable to load payment requests.");
      expect(paymentsTabContent).toHaveTextContent("Try again");
    });

    it("renders skeleton rows when payment requests are loading", () => {
      hoisted.mockUsePaymentRequests.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      const skeletons = paymentsTabContent.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders skeleton summary cards when summary is loading", () => {
      hoisted.mockUseGrantPaymentSummary.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      const skeletons = paymentsTabContent.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows create request link targeting the payments workspace with grantId", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrant,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const paymentsTabContent = document.querySelector(
        "[data-testid='tab-content-payments']",
      ) as HTMLElement;
      const createLink = paymentsTabContent.querySelector("a[href='/payments']");
      expect(createLink).toBeInTheDocument();
    });
  });

  describe("route components and action coverage", () => {
    it("renders the route errorComponent for an Error instance", () => {
      const routeConfig = Route as unknown as {
        errorComponent: (props: { error: unknown }) => React.ReactNode;
      };
      const { container } = render(
        routeConfig.errorComponent({ error: new Error("Route error") }) as React.ReactElement,
      );
      expect(container).toHaveTextContent("Route error");
    });

    it("renders the route errorComponent for a non-Error value", () => {
      const routeConfig = Route as unknown as {
        errorComponent: (props: { error: unknown }) => React.ReactNode;
      };
      const { container } = render(
        routeConfig.errorComponent({ error: "plain string" }) as React.ReactElement,
      );
      expect(container).toHaveTextContent("Unknown error");
    });

    it("renders the route pendingComponent", () => {
      const routeConfig = Route as unknown as { pendingComponent: () => React.ReactNode };
      const { container } = render(routeConfig.pendingComponent() as React.ReactElement);
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    });

    it("renders Share button and clicking it shows share sheet", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const shareButton = screen.getByRole("button", { name: "Share" });
      expect(shareButton).toBeInTheDocument();
      fireEvent.click(shareButton);
      // The QuickShareSheet is rendered (already in DOM regardless of open state in mock)
      expect(screen.getByTestId("quick-share-sheet")).toBeInTheDocument();
    });

    it("renders AwardIntakeDocumentAction via documents tab renderDocumentActions", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      // The EntityDocumentsSection mock calls renderDocumentActions with doc-1,
      // which renders AwardIntakeDocumentAction with documentId="doc-1"
      const docsTab = document.querySelector("[data-testid='tab-content-documents']");
      expect(docsTab).toBeInTheDocument();
      const aiIntakeButton = docsTab?.querySelector("button");
      expect(aiIntakeButton).toBeInTheDocument();
      expect(aiIntakeButton).toHaveTextContent("AI intake");
    });

    it("surfaces an error when AI intake extraction fails", async () => {
      hoisted.mockUseStartDocumentExtraction.mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(new Error("Intake failed")),
        isPending: false,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const docsTab = document.querySelector("[data-testid='tab-content-documents']");
      const aiIntakeButton = docsTab?.querySelector("button") as HTMLButtonElement;
      fireEvent.click(aiIntakeButton);

      expect(await screen.findByText("Intake failed")).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("renders GrantSubrecipientsTable when plan is enterprise", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "enterprise", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseSubawards.mockReturnValue({
        data: {
          data: [
            {
              id: "sub-1",
              subrecipientId: "recip-1",
              title: "Partner Org Subaward",
              riskRating: "low",
              openTaskCount: 2,
              overdueTaskCount: 1,
              openFindingCount: 0,
            },
          ],
        },
        isLoading: false,
        isError: false,
        error: undefined,
        refetch: vi.fn(),
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const subTab = document.querySelector("[data-testid='tab-content-subrecipients']");
      expect(subTab).toHaveTextContent("Partner Org Subaward");
    });

    it("renders the subrecipient monitoring plan gate with a calm tone when not entitled", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "starter", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseSubawards.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        isError: false,
        error: undefined,
        refetch: vi.fn(),
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const subTab = document.querySelector("[data-testid='tab-content-subrecipients']");
      expect(subTab).toHaveTextContent(/Subrecipient monitoring requires/);
      const gatePanel = subTab?.querySelector("[data-slot='status-panel']");
      expect(gatePanel).toHaveAttribute("data-variant", "empty");
    });

    it("renders GrantSubrecipientsTable error state when subawards query fails", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "enterprise", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseSubawards.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load subawards"),
        refetch: vi.fn(),
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const subTab = document.querySelector("[data-testid='tab-content-subrecipients']");
      expect(subTab).toHaveTextContent("Unable to load linked subawards");
    });

    it("renders GrantSubrecipientsTable empty state for enterprise plan with no subawards", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "enterprise", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const subTab = document.querySelector("[data-testid='tab-content-subrecipients']");
      expect(subTab).toHaveTextContent("No subawards are linked to this grant yet.");
    });

    it("renders GrantSubrecipientsTable with high risk subaward badge", () => {
      hoisted.mockUseOrgBilling.mockReturnValue({
        data: { planTier: "enterprise", status: "active" },
        isLoading: false,
        isError: false,
        error: undefined,
      });
      hoisted.mockUseSubawards.mockReturnValue({
        data: {
          data: [
            {
              id: "sub-1",
              subrecipientId: "recip-1",
              title: "High Risk Subaward",
              riskRating: "high",
              openTaskCount: 5,
              overdueTaskCount: 0,
              openFindingCount: 3,
            },
          ],
        },
        isLoading: false,
        isError: false,
        error: undefined,
        refetch: vi.fn(),
      });
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          name: "Test Grant",
          status: "active",
          amountCents: 100000,
          description: "",
          notes: "",
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          summary: {
            allocatedTotalCents: 0,
            expenseTotalCents: 0,
            remainingBalanceCents: 100000,
            thresholdState: null,
            burnRateCentsPerMonth: null,
          },
          fundAllocations: [],
          expenses: [],
          impactMetrics: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const subTab = document.querySelector("[data-testid='tab-content-subrecipients']");
      expect(subTab).toHaveTextContent("High Risk Subaward");
    });
  });

  describe("GrantStageProgressStrip", () => {
    const baseGrantData = {
      name: "Test Grant",
      status: "application",
      amountCents: 100000,
      description: "",
      notes: "",
      applicationDeadline: null,
      startDate: null,
      endDate: null,
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 100000,
        thresholdState: null,
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    };

    it("renders stage progress strip", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrantData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      expect(screen.getByTestId("stage-progress-strip")).toBeInTheDocument();
    });

    it("highlights current stage in progress strip", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: { ...baseGrantData, status: "submitted" },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const strip = screen.getByTestId("stage-progress-strip");
      expect(strip).toHaveTextContent("Submitted");
      expect(strip).toHaveTextContent("Discovery");
      expect(strip).toHaveTextContent("Application");
    });

    it("scrolls the current stage into view so it stays visible when the strip overflows on mobile", () => {
      const scrollSpy = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollSpy;
      try {
        hoisted.mockUseGrant.mockReturnValue({
          data: { ...baseGrantData, status: "reporting" },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        });

        renderPage();

        expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ inline: "center" }));
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it("shows Declined badge for declined grants", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: { ...baseGrantData, status: "declined" },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const strip = screen.getByTestId("stage-progress-strip");
      expect(strip).toHaveTextContent("Declined");
    });

    it("shows Renewal badge for renewal status grants", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: { ...baseGrantData, status: "renewal" },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const strip = screen.getByTestId("stage-progress-strip");
      expect(strip).toHaveTextContent("Renewal");
    });
  });

  describe("LinkedContextPanel", () => {
    const baseGrantData = {
      name: "Test Grant",
      status: "active",
      amountCents: 100000,
      description: "",
      notes: "",
      applicationDeadline: "2025-03-01T12:00:00.000Z",
      startDate: "2025-04-01T12:00:00.000Z",
      endDate: "2026-03-31T12:00:00.000Z",
      funder: { id: "funder-1", name: "National Science Foundation" },
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 100000,
        thresholdState: null,
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [
        {
          id: "alloc-1",
          fund: { id: "fund-1", name: "General Operations Fund" },
          allocatedAmountCents: 50000,
        },
      ],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    };

    it("renders linked context panel in overview tab", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrantData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      expect(screen.getByTestId("linked-context-panel")).toBeInTheDocument();
    });

    it("linked context shows funder name with link", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrantData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      const funderLink = panel.querySelector("a[href='/funders/funder-1']");
      expect(funderLink).toBeInTheDocument();
      expect(funderLink).toHaveTextContent("National Science Foundation");
    });

    it("linked context shows key dates", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrantData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      expect(panel).toHaveTextContent("Deadline");
      expect(panel).toHaveTextContent("Start");
      expect(panel).toHaveTextContent("End");
    });

    it("shows 'No dates set' when all key dates are null", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...baseGrantData,
          applicationDeadline: null,
          startDate: null,
          endDate: null,
          funder: null,
          fundAllocations: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      expect(panel).toHaveTextContent("No dates set");
    });

    it("shows linked fund name with link when allocations include a fund", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: baseGrantData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      const fundLink = panel.querySelector("a[href='/funds/fund-1']");
      expect(fundLink).toBeInTheDocument();
      expect(fundLink).toHaveTextContent("General Operations Fund");
    });

    it("shows 'Funds' (plural) label when multiple distinct funds are linked", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...baseGrantData,
          fundAllocations: [
            {
              id: "alloc-1",
              fund: { id: "fund-1", name: "General Operations Fund" },
              allocatedAmountCents: 25000,
            },
            {
              id: "alloc-2",
              fund: { id: "fund-2", name: "Capital Reserve Fund" },
              allocatedAmountCents: 25000,
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      expect(panel).toHaveTextContent("Funds");
      expect(panel.querySelector("a[href='/funds/fund-2']")).toBeInTheDocument();
    });

    it("deduplicates fund links when the same fund appears in multiple allocations", () => {
      hoisted.mockUseGrant.mockReturnValue({
        data: {
          ...baseGrantData,
          fundAllocations: [
            {
              id: "alloc-1",
              fund: { id: "fund-1", name: "General Operations Fund" },
              allocatedAmountCents: 25000,
            },
            {
              id: "alloc-2",
              fund: { id: "fund-1", name: "General Operations Fund" },
              allocatedAmountCents: 25000,
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();

      const panel = screen.getByTestId("linked-context-panel");
      // Only one link for the same fund (deduplication)
      const fundLinks = panel.querySelectorAll("a[href='/funds/fund-1']");
      expect(fundLinks.length).toBe(1);
      // Shows "Fund" singular since only one unique fund
      expect(panel).toHaveTextContent("Fund");
    });
  });
});

describe("GrantDetailPage — reporting/closeout action error surfaces", () => {
  function loadedGrantWithReportingAndCloseout() {
    return {
      name: "Action Error Grant",
      status: "active" as const,
      amountCents: 500000,
      description: "",
      notes: "",
      applicationDeadline: null,
      startDate: null,
      endDate: null,
      summary: {
        allocatedTotalCents: 0,
        expenseTotalCents: 0,
        remainingBalanceCents: 500000,
        thresholdState: null,
        burnRateCentsPerMonth: null,
      },
      fundAllocations: [],
      expenses: [],
      impactMetrics: [],
      reportingRequirements: [
        {
          id: "requirement-err-1",
          reportType: "quarterly",
          dueDate: "2026-06-30T12:00:00.000Z",
          derivedStatus: "upcoming",
        },
      ],
      closeoutItems: [
        {
          id: "closeout-err-1",
          label: "Submit final report",
          completed: false,
          dueDate: "2026-11-30T12:00:00.000Z",
          completedAt: null,
          completedBy: null,
        },
      ],
    };
  }

  beforeEach(() => {
    hoisted.mockUseGrantUpdateMutations.mockReturnValue(NOOP_MUTATIONS);
    hoisted.mockUseAllocationMutations.mockReturnValue(NOOP_ALLOCATION);
    hoisted.mockUseExpenseMutations.mockReturnValue(NOOP_EXPENSE);
    hoisted.mockUseImpactMetricMutations.mockReturnValue(NOOP_METRIC);
    hoisted.mockUseReportingRequirementMutations.mockReturnValue(NOOP_REPORTING);
    hoisted.mockUseCloseoutItemMutations.mockReturnValue(NOOP_CLOSEOUT);
    hoisted.mockUseFunds.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    hoisted.mockUseFunders.mockReturnValue({
      data: {
        data: [
          { id: "funder-1", name: "Example Foundation" },
          { id: "funder-2", name: "Second Foundation" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSpendDown.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    hoisted.mockUseGenerateSpendDownReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hoisted.mockUseGrantBudgetVariance.mockReturnValue({
      data: { rows: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    hoisted.mockUsePaymentRequests.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseGrantPaymentSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseSubawards.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
    hoisted.mockUseStartDocumentExtraction.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "extraction-1" }),
      isPending: false,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: loadedGrantWithReportingAndCloseout(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("does not call deleteRequirement immediately — shows confirm dialog first", async () => {
    const mockDeleteRequirement = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: vi.fn() },
      updateRequirement: { mutateAsync: vi.fn() },
      deleteRequirement: { mutateAsync: mockDeleteRequirement, isPending: false },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete requirement" }));
    expect(mockDeleteRequirement).not.toHaveBeenCalled();

    const reqDialogTitle = screen.getByText("Delete requirement?");
    const reqDialogContent = reqDialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(reqDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteRequirement).toHaveBeenCalled();
    });
  });

  it("does not call deleteItem (closeout) immediately — shows confirm dialog first", async () => {
    const mockDeleteItem = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: { mutateAsync: mockDeleteItem, isPending: false },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    expect(mockDeleteItem).not.toHaveBeenCalled();

    const closeoutDialogTitle = screen.getByText("Delete closeout item?");
    const closeoutDialogContent = closeoutDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(closeoutDialogContent).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalled();
    });
  });

  it("surfaces an error when marking a reporting requirement submitted fails", async () => {
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: vi.fn() },
      updateRequirement: { mutateAsync: vi.fn().mockRejectedValue(new Error("Submit failed.")) },
      deleteRequirement: { mutateAsync: vi.fn(), isPending: false },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark submitted" }));

    expect(await screen.findByText("Submit failed.")).toBeInTheDocument();
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
  });

  it("hides the Mark submitted button for a requirement that is already submitted", () => {
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        ...loadedGrantWithReportingAndCloseout(),
        reportingRequirements: [
          {
            id: "requirement-submitted-1",
            reportType: "quarterly",
            dueDate: "2026-06-30T12:00:00.000Z",
            derivedStatus: "submitted",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    expect(screen.queryByRole("button", { name: "Mark submitted" })).not.toBeInTheDocument();
    // The requirement row still renders (status badge + delete action remain available).
    expect(screen.getByRole("button", { name: "Delete requirement" })).toBeInTheDocument();
  });

  it("shows the Mark submitted button for a requirement that is not yet submitted", () => {
    render(<GrantDetailPage />);

    expect(screen.getByRole("button", { name: "Mark submitted" })).toBeInTheDocument();
  });

  it("surfaces an error when deleting a reporting requirement fails", async () => {
    hoisted.mockUseReportingRequirementMutations.mockReturnValue({
      createRequirement: { mutateAsync: vi.fn() },
      updateRequirement: { mutateAsync: vi.fn() },
      deleteRequirement: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Requirement delete failed.")),
        isPending: false,
      },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete requirement" }));
    const reqDialogTitle = screen.getByText("Delete requirement?");
    const reqDialogContent = reqDialogTitle.closest<HTMLElement>('[data-testid="dialog-content"]')!;
    fireEvent.click(within(reqDialogContent).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Requirement delete failed.")).toBeInTheDocument();
  });

  it("surfaces an error when saving a closeout item due date fails", async () => {
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: { mutateAsync: vi.fn().mockRejectedValue(new Error("Due date save failed.")) },
      deleteItem: { mutateAsync: vi.fn(), isPending: false },
    });

    render(<GrantDetailPage />);

    const closeoutForm = screen.getByLabelText("Due date for Submit final report").closest("form");
    expect(closeoutForm).not.toBeNull();
    fireEvent.submit(closeoutForm!);

    expect(await screen.findByText("Due date save failed.")).toBeInTheDocument();
  });

  it("surfaces an error when toggling a closeout item completion fails", async () => {
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Completion toggle failed.")),
      },
      deleteItem: { mutateAsync: vi.fn(), isPending: false },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));

    expect(await screen.findByText("Completion toggle failed.")).toBeInTheDocument();
  });

  it("surfaces an error when deleting a closeout item fails", async () => {
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Item delete failed.")),
        isPending: false,
      },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    const itemDialogTitle = screen.getByText("Delete closeout item?");
    const itemDialogContent = itemDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(itemDialogContent).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Item delete failed.")).toBeInTheDocument();
  });

  it("uses fallback copy when a reporting/closeout action rejects a non-Error", async () => {
    hoisted.mockUseCloseoutItemMutations.mockReturnValue({
      createItem: { mutateAsync: vi.fn() },
      updateItem: { mutateAsync: vi.fn() },
      deleteItem: {
        mutateAsync: vi.fn().mockRejectedValue("plain string error"),
        isPending: false,
      },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    const fallbackDialogTitle = screen.getByText("Delete closeout item?");
    const fallbackDialogContent = fallbackDialogTitle.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    )!;
    fireEvent.click(within(fallbackDialogContent).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("renders program picker options with disambiguating code subtitles when programs share a name", () => {
    hoisted.mockUsePrograms.mockReturnValue({
      data: {
        data: [
          { id: "p-a", name: "Youth Mentoring", code: "YM-2025" },
          { id: "p-b", name: "Youth Mentoring", code: "YM-2026" },
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "audit_ready", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGrant.mockReturnValue({
      data: {
        name: "Program Picker Test Grant",
        status: "active",
        amountCents: 100000,
        description: "",
        notes: "",
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 0,
          expenseTotalCents: 0,
          remainingBalanceCents: 100000,
          thresholdState: null,
          burnRateCentsPerMonth: null,
        },
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<GrantDetailPage />);

    // The SelectItem mock renders children directly as div[role=option].
    // Both program pickers (grant allocations + expense allocations) render items.
    // Assert that the code subtitles appear at least once in the document.
    expect(screen.getAllByText("YM-2025").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("YM-2026").length).toBeGreaterThanOrEqual(1);
  });

  it("fires captureDetailTabViewed with record_type grants when tab changes", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    render(<GrantDetailPage />);

    const allocationsTab = screen.getByRole("tab", { name: /allocations/i });
    fireEvent.click(allocationsTab);

    expect(mockCapture).toHaveBeenCalledWith("grants", "allocations", "overview");
  });

  it("updates previousTabRef on sequential tab switches for grants", async () => {
    const { captureDetailTabViewed } = await import("../../../lib/record-discovery-analytics");
    const mockCapture = captureDetailTabViewed as ReturnType<typeof vi.fn>;
    mockCapture.mockClear();

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("tab", { name: /allocations/i }));
    fireEvent.click(screen.getByRole("tab", { name: /expenses/i }));

    expect(mockCapture).toHaveBeenNthCalledWith(1, "grants", "allocations", "overview");
    expect(mockCapture).toHaveBeenNthCalledWith(2, "grants", "expenses", "allocations");
  });
});
