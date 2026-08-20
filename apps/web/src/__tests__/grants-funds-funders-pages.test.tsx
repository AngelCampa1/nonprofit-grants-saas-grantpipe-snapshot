import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

describe("grants page source contracts", () => {
  it("uses the shared-backed funder type formatter instead of a route-local copy", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/grants/index.tsx"),
      "utf8",
    );

    expect(source).toContain("formatFunderTypeLabel");
    expect(source).toContain("../../../lib/format");
    expect(source).not.toContain("function formatFunderTypeLabel");
  });
});

const {
  routeState,
  mockUseGrants,
  mockUseFunders,
  mockUseGrantOpportunities,
  mockUseGrantOpportunitySearch,
  mockUseGrantPipeline,
  mockUseGrant,
  mockUseGrantBudgetVariance,
  mockUseFunds,
  mockUseFund,
  mockUseFunder,
  mockUseOrgBilling,
  mockUseSession,
  mockUsePaymentRequests,
  mockUseGrantPaymentSummary,
  mockUseSubawards,
  mockUsePrograms,
  mutationMocks,
  mockNavigate,
} = vi.hoisted(() => ({
  routeState: {
    params: {} as Record<string, string>,
    search: {} as Record<string, string | undefined>,
  },
  mockNavigate: vi.fn(),
  mockUseGrants: vi.fn(),
  mockUseFunders: vi.fn(),
  mockUseGrantOpportunities: vi.fn(),
  mockUseGrantOpportunitySearch: vi.fn(),
  mockUseGrantPipeline: vi.fn(),
  mockUseGrant: vi.fn(),
  mockUseGrantBudgetVariance: vi.fn(),
  mockUseFunds: vi.fn(),
  mockUseFund: vi.fn(),
  mockUseFunder: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSession: vi.fn(),
  mockUsePaymentRequests: vi.fn(),
  mockUseGrantPaymentSummary: vi.fn(),
  mockUseSubawards: vi.fn(),
  mockUsePrograms: vi.fn(),
  mutationMocks: {
    replaceGrantProgramAllocations: vi.fn(),
    replaceExpenseProgramAllocations: vi.fn(),
    createGrant: vi.fn(),
    updateGrant: vi.fn(),
    deleteGrant: vi.fn(),
    createAllocation: vi.fn(),
    createMetricEntry: vi.fn(),
    updateRequirement: vi.fn(),
    deleteRequirement: vi.fn(),
    updateCloseoutItem: vi.fn(),
    deleteCloseoutItem: vi.fn(),
    createExpense: vi.fn(),
    createMetric: vi.fn(),
    createRequirement: vi.fn(),
    createCloseoutItem: vi.fn(),
    createFund: vi.fn(),
    updateFund: vi.fn(),
    deleteFund: vi.fn(),
    createFunder: vi.fn(),
    updateFunder: vi.fn(),
    deleteFunder: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    updateGrantStage: vi.fn(),
    createGrantOpportunity: vi.fn(),
    saveOpportunity: vi.fn(),
    dismissOpportunity: vi.fn(),
    convertOpportunity: vi.fn(),
  },
}));

vi.mock("../hooks/use-org-settings", () => ({
  useOrgBilling: (...args: unknown[]) => mockUseOrgBilling(...args),
}));

vi.mock("../components/shell/page-tabs", () => ({
  AppPageTabs: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => routeState.params,
    useSearch: () => routeState.search,
  }),
  createLazyFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => routeState.params,
    useSearch: () => routeState.search,
  }),
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  // Real cardVariants so card class output tracks the actual design system.
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    cardVariants: actual.cardVariants,
    FilterBar: ({ children }: { children?: React.ReactNode }) => (
      <div data-slot="filter-bar">{children}</div>
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
      id,
      "aria-label": ariaLabel,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          aria-label={ariaLabel}
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          readOnly={false}
        />
      );
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
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
    PageShell: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-slot="page-shell">{children}</div>
    ),
    PageHero: ({
      eyebrow,
      title,
      description,
      meta,
      actions,
    }: {
      eyebrow?: React.ReactNode;
      title: React.ReactNode;
      description?: React.ReactNode;
      meta?: React.ReactNode;
      actions?: React.ReactNode;
    }) => (
      <section data-slot="page-hero">
        {eyebrow ? <div>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <p>{meta}</p> : null}
        {actions ? <div>{actions}</div> : null}
      </section>
    ),
    SurfaceSection: ({
      title,
      description,
      children,
      actions,
      className,
    }: React.HTMLAttributes<HTMLElement> & {
      title?: React.ReactNode;
      description?: React.ReactNode;
      actions?: React.ReactNode;
    }) => (
      <section data-slot="surface-section" className={className}>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
        {actions ? <div>{actions}</div> : null}
        <div>{children}</div>
      </section>
    ),
    StatusPanel: ({
      title,
      children,
      variant,
    }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; variant?: string }) => (
      <div data-slot="status-panel" data-variant={variant}>
        {title ? <p>{title}</p> : null}
        <div>{children}</div>
      </div>
    ),
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
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
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div>
        {children}
        <button type="button" onClick={() => onOpenChange?.(true)}>
          Open dialog state
        </button>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close dialog state
        </button>
      </div>
    ),
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="dialog-footer">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
    DialogClose: ({
      children,
      asChild,
    }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <div>{children}</div>,
    DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    FilePicker: ({
      id,
      accept,
      className,
      onFileChange,
    }: {
      id?: string;
      accept?: string;
      className?: string;
      onFileChange: (file: File | null) => void;
    }) => (
      <input
        type="file"
        id={id}
        accept={accept}
        className={className}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          onFileChange(file);
        }}
      />
    ),
    Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    HelpTooltip: ({ label, children }: { label: string; children: React.ReactNode }) => (
      <button type="button" aria-label={label}>
        {children}
      </button>
    ),
    Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td {...props}>{children}</td>
    ),
    TableHead: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
      <th {...props}>{children}</th>
    ),
    TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
    Tabs: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
      <div data-slot="tabs" className={className} {...props}>
        {children}
      </div>
    ),
    TabsContent: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    TabsList: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    TabsTrigger: ({
      children,
      className,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
      <button type="button" className={className} {...props}>
        {children}
      </button>
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
    PageHeader: ({
      kicker,
      title,
      description,
      actions,
    }: {
      kicker?: React.ReactNode;
      title: React.ReactNode;
      description?: React.ReactNode;
      actions?: React.ReactNode;
    }) => (
      <div data-slot="page-header">
        {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions ? <div>{actions}</div> : null}
      </div>
    ),
    IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
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
        {options.map((opt: { value: string; label: string }) => (
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
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
    Alert: ({
      title,
      variant,
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { title?: string; variant?: string }) => (
      <div role="alert" data-slot="alert" data-variant={variant} {...props}>
        {title ? <p data-slot="alert-title">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    ),
    EmptyState: ({
      title,
      description,
      icon,
    }: {
      title: string;
      description?: string;
      icon?: React.ReactNode;
    }) => (
      <div role="region" aria-label={title} data-slot="empty-state">
        {icon ? <div>{icon}</div> : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
    ),
    TeachAndActEmptyState: ({
      heading,
      description,
      primaryAction,
      secondaryAction,
      helpLink,
    }: {
      heading: string;
      description?: string;
      primaryAction?: { label: string; onClick?: () => void; href?: string };
      secondaryAction?: { label: string; onClick?: () => void; href?: string };
      helpLink?: { label: string; href: string };
    }) => (
      <div role="region" aria-label={heading} data-slot="teach-and-act-empty-state">
        <h3>{heading}</h3>
        {description ? <p>{description}</p> : null}
        {primaryAction?.href ? (
          <a href={primaryAction.href}>{primaryAction.label}</a>
        ) : primaryAction ? (
          <button type="button" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        ) : null}
        {secondaryAction?.href ? (
          <a href={secondaryAction.href}>{secondaryAction.label}</a>
        ) : secondaryAction ? (
          <button type="button" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </button>
        ) : null}
        {helpLink ? <a href={helpLink.href}>{helpLink.label}</a> : null}
      </div>
    ),
    Skeleton: ({ className }: { className?: string }) => (
      <div
        data-slot="skeleton"
        className={["animate-pulse", className].filter(Boolean).join(" ")}
      />
    ),
    Breadcrumb: ({ children }: { children: React.ReactNode }) => (
      <nav aria-label="breadcrumb">{children}</nav>
    ),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
    BreadcrumbLink: ({
      children,
      asChild,
      ...props
    }: { children: React.ReactNode; asChild?: boolean } & React.HTMLAttributes<HTMLSpanElement>) =>
      asChild
        ? React.cloneElement(children as React.ReactElement, props)
        : React.createElement("a", props, children),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
      <span aria-current="page">{children}</span>
    ),
    BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
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
    numericSortingFn: () => 0,
  };
});

vi.mock("../hooks/use-saved-segments", () => ({
  useSavedSegments: () => ({
    segments: [],
    saveSegment: vi.fn(),
    deleteSegment: vi.fn(),
    applySegment: vi.fn(),
  }),
}));

vi.mock("../hooks/use-grants", () => ({
  useGrants: mockUseGrants,
  useFunders: mockUseFunders,
  useGrantOpportunities: mockUseGrantOpportunities,
  useGrantOpportunitySearch: mockUseGrantOpportunitySearch,
  useGrantOpportunityMutations: () => ({
    saveOpportunity: { mutate: mutationMocks.saveOpportunity },
    dismissOpportunity: { mutate: mutationMocks.dismissOpportunity },
    convertOpportunity: { mutate: mutationMocks.convertOpportunity },
  }),
  useCreateGrantOpportunity: () => ({
    mutate: mutationMocks.createGrantOpportunity,
    mutateAsync: mutationMocks.createGrantOpportunity,
    isPending: false,
  }),
  useCreateGrant: () => ({ mutateAsync: mutationMocks.createGrant }),
  useGrantUpdateMutations: () => ({
    updateGrant: { mutateAsync: mutationMocks.updateGrant },
    deleteGrant: { mutateAsync: mutationMocks.deleteGrant },
  }),
  useGrantPipeline: mockUseGrantPipeline,
  useUpdateGrantStage: () => ({ mutateAsync: mutationMocks.updateGrantStage }),
  useGrant: mockUseGrant,
  useGrantBudgetVariance: mockUseGrantBudgetVariance,
  useAllocationMutations: () => ({
    createAllocation: { mutateAsync: mutationMocks.createAllocation },
    updateAllocation: { mutateAsync: vi.fn() },
    deleteAllocation: { mutateAsync: vi.fn(), isPending: false },
  }),
  useExpenseMutations: () => ({
    createExpense: { mutateAsync: mutationMocks.createExpense },
  }),
  useImpactMetricMutations: () => ({
    createMetric: { mutateAsync: mutationMocks.createMetric },
    createEntry: { mutateAsync: mutationMocks.createMetricEntry },
    deleteEntry: { mutateAsync: vi.fn(), isPending: false },
    deleteMetric: { mutateAsync: vi.fn() },
  }),
  useReportingRequirementMutations: () => ({
    createRequirement: { mutateAsync: mutationMocks.createRequirement },
    updateRequirement: { mutateAsync: mutationMocks.updateRequirement },
    deleteRequirement: { mutateAsync: mutationMocks.deleteRequirement },
  }),
  useCloseoutItemMutations: () => ({
    createItem: { mutateAsync: mutationMocks.createCloseoutItem },
    updateItem: { mutateAsync: mutationMocks.updateCloseoutItem },
    deleteItem: { mutateAsync: mutationMocks.deleteCloseoutItem },
  }),
  useFunds: mockUseFunds,
  useSpendDown: () => ({ data: undefined, isPending: false, isError: false }),
  useGenerateSpendDownReport: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
  }),
  useCreateFund: () => ({ mutateAsync: mutationMocks.createFund }),
  useFundUpdateMutations: () => ({
    updateFund: { mutateAsync: mutationMocks.updateFund },
    deleteFund: { mutateAsync: mutationMocks.deleteFund },
  }),
  useFund: mockUseFund,
  useCreateFunder: () => ({ mutateAsync: mutationMocks.createFunder }),
  useFunder: mockUseFunder,
  useFunderUpdateMutations: () => ({
    updateFunder: { mutateAsync: mutationMocks.updateFunder },
    deleteFunder: { mutateAsync: mutationMocks.deleteFunder },
  }),
  useFunderContactMutations: () => ({
    createContact: { mutateAsync: mutationMocks.createContact },
    updateContact: { mutateAsync: mutationMocks.updateContact },
    deleteContact: { mutateAsync: mutationMocks.deleteContact },
  }),
}));

vi.mock("../hooks/use-documents", () => ({
  useEntityDocuments: () => ({
    data: { data: [], total: 0, page: 1, pageSize: 25 },
    isLoading: false,
    isError: false,
  }),
  useUploadDocument: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
  }),
  useDeleteDocument: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
  }),
}));

vi.mock("../hooks/use-activity", () => ({
  useEntityActivity: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../hooks/use-restrictions", () => ({
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
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock("../hooks/use-custom-fields", () => ({
  useEntityCustomFields: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useUpsertCustomFieldValue: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: () => React.createElement("div", { "data-testid": "quick-share-sheet" }),
}));

vi.mock("../components/explore-sample-data-cta", () => ({
  ExploreSampleDataCta: () => null,
}));

vi.mock("../components/confirm-dialog", () => ({
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

vi.mock("../hooks/use-payments", () => ({
  usePaymentRequests: (...args: unknown[]) => mockUsePaymentRequests(...args),
  useGrantPaymentSummary: (...args: unknown[]) => mockUseGrantPaymentSummary(...args),
}));

vi.mock("../hooks/use-subrecipients", () => ({
  useSubawards: (...args: unknown[]) => mockUseSubawards(...args),
}));

vi.mock("../hooks/use-programs", () => ({
  usePrograms: (...args: unknown[]) => mockUsePrograms(...args),
  useReplaceGrantProgramAllocations: () => ({
    mutateAsync: mutationMocks.replaceGrantProgramAllocations,
    isPending: false,
  }),
  useReplaceExpenseProgramAllocations: () => ({
    mutateAsync: mutationMocks.replaceExpenseProgramAllocations,
    isPending: false,
  }),
}));

import { Route as FunderDetailRoute } from "../routes/_authenticated/funders/$funderId";
import { FundersListPage } from "../routes/_authenticated/funders/index";
import { Route as FundDetailRoute } from "../routes/_authenticated/funds/$fundId";
import { FundsListPage } from "../routes/_authenticated/funds/index";
import { Route as GrantDetailRoute } from "../routes/_authenticated/grants/$grantId";
import { GrantsListPage } from "../routes/_authenticated/grants/index";
import { GrantPipelinePage } from "../routes/_authenticated/grants/pipeline.lazy";
import { createFundSchema, createFunderContactSchema, createFunderSchema } from "@grantpipe/shared";

const FunderDetailPage = (FunderDetailRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;
const FundDetailPage = (FundDetailRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;
const GrantDetailPage = (GrantDetailRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

function submitButtonForm(name: string) {
  const form = screen.getByRole("button", { name }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form as HTMLFormElement);
}

function getButtonForm(name: string) {
  const form = screen.getByRole("button", { name }).closest("form");
  expect(form).not.toBeNull();
  return within(form as HTMLFormElement);
}

function clearInputNames(placeholders: string[]) {
  placeholders.forEach((placeholder) => {
    screen.getAllByPlaceholderText(placeholder).forEach((element) => {
      element.removeAttribute("name");
    });
  });
}

function resetStates() {
  routeState.params = {};
  routeState.search = {};
  mockNavigate.mockReset();
  mockUseGrants.mockReset();
  mockUseFunders.mockReset();
  mockUseGrantOpportunities.mockReset();
  mockUseGrantOpportunitySearch.mockReset();
  mockUseGrantPipeline.mockReset();
  mockUseGrant.mockReset();
  mockUseGrantBudgetVariance.mockReset();
  mockUseFunds.mockReset();
  mockUseFund.mockReset();
  mockUseFunder.mockReset();
  mockUseOrgBilling.mockReset();
  mockUseSession.mockReset();
  mockUsePaymentRequests.mockReset();
  mockUseGrantPaymentSummary.mockReset();
  mockUseGrantBudgetVariance.mockReset();
  mockUseSubawards.mockReset();
  mockUsePrograms.mockReset();
  mutationMocks.replaceGrantProgramAllocations.mockReset();
  mutationMocks.replaceGrantProgramAllocations.mockResolvedValue({});
  mutationMocks.replaceExpenseProgramAllocations.mockReset();
  mutationMocks.replaceExpenseProgramAllocations.mockResolvedValue({});
  mockUsePrograms.mockReturnValue({
    data: {
      data: [
        { id: "11111111-1111-4111-8111-111111111111", name: "After School" },
        { id: "22222222-2222-4222-8222-222222222222", name: "Summer Camp" },
      ],
      total: 2,
    },
    isLoading: false,
    isError: false,
  });

  mockUseGrants.mockReturnValue({ data: { data: [] } });
  mockUseFunders.mockReturnValue({ data: { data: [] } });
  mockUseGrantOpportunities.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
  });
  mockUseGrantOpportunitySearch.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
  });
  mockUseGrantPipeline.mockReturnValue({ data: {} });
  mockUseGrant.mockReturnValue({ data: undefined });
  mockUseGrantBudgetVariance.mockReturnValue({
    data: { rows: [] },
    isLoading: false,
    isError: false,
  });
  mockUseFunds.mockReturnValue({ data: { data: [] } });
  mockUseFund.mockReturnValue({ data: undefined });
  mockUseFunder.mockReturnValue({ data: undefined });
  mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
  mockUseOrgBilling.mockReturnValue({
    data: {
      planTier: "growth",
      status: "active",
      trialEndsAt: null,
    },
    isLoading: false,
    isError: false,
  });
  mockUsePaymentRequests.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
  });
  mockUseGrantPaymentSummary.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  mockUseGrantBudgetVariance.mockReturnValue({
    data: { rows: [] },
    isPending: false,
    isError: false,
  });
  mockUseSubawards.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  });

  Object.values(mutationMocks).forEach((mockFn) => {
    mockFn.mockReset();
    mockFn.mockResolvedValue({});
  });
}

describe("grant routes", () => {
  beforeEach(() => {
    resetStates();
  });

  it("renders the grants list empty state", () => {
    render(<GrantsListPage />);

    expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
  });

  it("tracks manual and filtered grant opportunities", async () => {
    mutationMocks.createGrantOpportunity.mockImplementation((_payload, options) => {
      (options as { onSuccess?: () => void } | undefined)?.onSuccess?.();
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByLabelText("Tracked opportunity source type"), {
      target: { value: "corporate" },
    });
    fireEvent.change(screen.getByLabelText("Tracked opportunity funder type"), {
      target: { value: "corporate" },
    });

    await waitFor(() => {
      expect(mockUseGrantOpportunities).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 25,
        sourceType: "corporate",
        funderType: "corporate",
      });
    });

    fireEvent.change(screen.getByLabelText("Opportunity title"), {
      target: { value: "Corporate capacity grant" },
    });
    fireEvent.change(screen.getByLabelText("Source type"), {
      target: { value: "corporate" },
    });
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Acme Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(mutationMocks.createGrantOpportunity).toHaveBeenCalledWith(
      {
        title: "Corporate capacity grant",
        sourceType: "corporate",
        sourceName: "Acme Foundation",
        funderType: "corporate",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows a loading state while the grants list is still resolving", () => {
    mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<GrantsListPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Your grants live here" })).not.toBeInTheDocument();
  });

  it("shows an error state instead of a false empty state when grants fail to load", () => {
    mockUseGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Grant service unavailable"),
    });

    render(<GrantsListPage />);

    expect(screen.getByText("Unable to load grants.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your grants live here" })).not.toBeInTheDocument();
  });

  it("renders the grants list populated state", () => {
    mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "Summer Learning",
            status: "active",
            amountCents: 2500000,
            applicationDeadline: "2026-07-01T00:00:00.000Z",
          },
        ],
      },
    });

    render(<GrantsListPage />);

    expect(screen.getByRole("link", { name: "Summer Learning" })).toHaveAttribute(
      "href",
      "/grants/$grantId",
    );
    expect(screen.getByText("Active", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText("active", { selector: "div" })).not.toBeInTheDocument();
  });

  it("keeps grant status help concise and leaves detailed meaning inline", () => {
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
    });

    render(<GrantsListPage />);

    const statusHelp = screen.getByRole("button", {
      name: "How do grant statuses work?",
    });
    expect(statusHelp).toHaveTextContent(
      "Pick the stage this grant is in. A description appears below.",
    );
    expect(statusHelp).not.toHaveTextContent("Awarded:");
    expect(statusHelp).not.toHaveTextContent("Declined:");
    expect(
      screen.getByText("You found a possible grant and are deciding if it is worth pursuing."),
    ).toBeInTheDocument();
  });

  it("updates the grant query when the search term changes", async () => {
    mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "Literacy Fund",
            status: "active",
            amountCents: 100000,
            applicationDeadline: null,
          },
        ],
      },
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search grants…"), {
      target: { value: "literacy" },
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenLastCalledWith({
        to: ".",
        search: { search: "literacy" },
        replace: true,
      });
    });
  });

  it("updates the grant query when status, funder, and threshold filters change", async () => {
    mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-1",
            name: "Literacy Fund",
            status: "active",
            amountCents: 100000,
            applicationDeadline: null,
          },
        ],
      },
    });
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
    });

    render(<GrantsListPage />);

    fireEvent.change(screen.getByLabelText("Filter status"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("Filter funder"), {
      target: { value: "funder-1" },
    });
    fireEvent.change(screen.getByLabelText("Filter threshold"), {
      target: { value: "90" },
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: ".",
        search: { status: "active" },
        replace: true,
      });
      expect(mockNavigate).toHaveBeenCalledWith({
        to: ".",
        search: { funderId: "funder-1" },
        replace: true,
      });
      expect(mockNavigate).toHaveBeenCalledWith({
        to: ".",
        search: { threshold: "90" },
        replace: true,
      });
    });
  });

  it("falls back when grant and funder list payloads are missing", () => {
    mockUseGrants.mockReturnValue({});
    mockUseFunders.mockReturnValue({});

    render(<GrantsListPage />);

    expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
  });

  it("does not expose 'Select funder' as a selectable option in the funder dropdown", () => {
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation" }] },
    });

    render(<GrantsListPage />);

    // After removing the __none__ sentinel, "Select funder" must not appear as a
    // selectable option in the dropdown — it is a non-interactive placeholder only.
    const addGrantButton = screen.getByRole("button", { name: "Add grant" });
    fireEvent.click(addGrantButton);
    const funderOptions = screen.queryAllByRole("option");
    expect(funderOptions.length).toBeGreaterThan(0);
    expect(funderOptions.every((opt) => opt.textContent !== "Select funder")).toBe(true);
  });

  it("renders grant list row fallbacks for missing amount and deadline", () => {
    mockUseGrants.mockReturnValue({
      data: {
        data: [
          {
            id: "grant-3",
            name: "Fallback Grant",
            status: "submitted",
            amountCents: null,
            applicationDeadline: null,
          },
        ],
      },
    });

    render(<GrantsListPage />);

    expect(screen.getByText("Fallback Grant")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("renders the pipeline with populated and empty stages", () => {
    mockUseGrantPipeline.mockReturnValue({
      data: {
        active: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
    });

    render(<GrantPipelinePage />);

    expect(screen.getByText("Summer Learning")).toBeInTheDocument();
    expect(screen.getByText("No grants you are still researching.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active delivery" })).toBeInTheDocument();
  });

  it("falls back to an empty pipeline when no pipeline data is returned", () => {
    mockUseGrantPipeline.mockReturnValue({ data: null });

    render(<GrantPipelinePage />);

    expect(screen.getByText("No grants currently underway.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Archived \/ declined 0/i })).toBeInTheDocument();
  });

  it("updates a grant stage from the pipeline board", async () => {
    mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "grant-1", name: "Summer Learning" }],
        },
      },
    });

    render(<GrantPipelinePage />);

    fireEvent.change(screen.getByLabelText("Move Summer Learning to another stage"), {
      target: { value: "active" },
    });

    await waitFor(() => {
      expect(mutationMocks.updateGrantStage).toHaveBeenCalledWith({
        grantId: "grant-1",
        status: "active",
      });
    });
  });

  it("renders grant detail fallback labels and statuses", () => {
    routeState.params = { grantId: "grant-2" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-2",
        name: null,
        status: null,
        amountCents: null,
        summary: {
          allocatedTotalCents: null,
          remainingBalanceCents: null,
          thresholdState: null,
        },
        fundAllocations: [{ id: "alloc-2", fund: null, allocatedAmountCents: null }],
        expenses: [{ id: "expense-2", description: null, amountCents: null }],
        impactMetrics: [
          { id: "metric-2", name: "Meals", unit: null, actualValue: 0, targetValue: null },
        ],
        reportingRequirements: [
          { id: "report-2", reportType: "final", dueDate: "2026-12-31", derivedStatus: null },
        ],
        closeoutItems: [{ id: "item-2", label: "Archive records", completed: true }],
      },
    });

    render(<GrantDetailPage />);

    expect(screen.getByText("Grant")).toBeInTheDocument();
    expect(screen.queryByText(/^Threshold/)).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    expect(screen.getByText("Fund allocation")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Target: --")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getAllByText("Documents").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Custom Fields").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state messages on all tabs when data lists are empty", () => {
    routeState.params = { grantId: "grant-empty-tabs" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-empty-tabs",
        name: "Empty Tabs Grant",
        status: "active",
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    });

    render(<GrantDetailPage />);

    expect(
      screen.getByText(
        "No fund allocations yet. Add an allocation to track how much a fund is committing to this grant.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No expenses recorded yet. Log spending to keep the burn rate and remaining balance accurate.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No impact metrics defined yet. Add a metric to track outcomes funded by this grant.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No reporting requirements added yet. Add one to track deliverables owed to this funder.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No closeout tasks yet. Add items to track the wrap-up steps required before this grant is fully closed.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an explicit error state when grant detail fails to load", () => {
    routeState.params = { grantId: "grant-error" };
    mockUseGrant.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Grant detail unavailable"),
    });

    render(<GrantDetailPage />);

    expect(screen.getByText("Unable to load grant.")).toBeInTheDocument();
    expect(screen.getByText("Grant detail unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Loading grant...")).not.toBeInTheDocument();
  });

  it("renders grant detail dates and metric fallback actual values", () => {
    routeState.params = { grantId: "grant-dates" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-dates",
        name: "Dated Grant",
        applicationDeadline: "2026-06-01T00:00:00.000Z",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        impactMetrics: [
          {
            id: "metric-null",
            name: "Families Served",
            unit: "families",
            actualValue: null,
            targetValue: "20",
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    // The PageHeader description now shows status · period (no "Application deadline:" prefix)
    // Application deadline is still available via the form input
    expect(screen.getByLabelText("Application deadline")).not.toHaveValue("");
    expect(screen.getByLabelText("Start date")).not.toHaveValue("");
    expect(screen.getByLabelText("End date")).not.toHaveValue("");
    // The header description should include the date range (may also appear in the linked context panel)
    expect(screen.getAllByText(/Jul 1, 2026/).length).toBeGreaterThanOrEqual(1);
    // A metric with no reported actual shows the "--" missing token (not a
    // misleading "0"), matching the Target line's fallback.
    expect(screen.getByText("Actual: -- families")).toBeInTheDocument();
  });

  it("uses a stacked tabs layout for grant detail content", () => {
    routeState.params = { grantId: "grant-mobile-layout" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-mobile-layout",
        name: "Mobile Layout Grant",
      },
    });

    const { container } = render(<GrantDetailPage />);

    const tabsRoot = container.querySelector('[data-slot="tabs"]');
    expect(tabsRoot).toHaveClass("flex-col");
  });

  it("renders the grant burn rate when it is available", () => {
    routeState.params = { grantId: "grant-burn-rate" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-burn-rate",
        name: "Burn Rate Grant",
        summary: {
          burnRateCentsPerMonth: 125000,
        },
      },
    });

    render(<GrantDetailPage />);

    expect(screen.getByText(/Burn rate/)).toBeInTheDocument();
    expect(screen.getByText("$1,250/mo")).toBeInTheDocument();
  });

  it("falls back to the raw date part when a deadline string is not parseable", () => {
    routeState.params = { grantId: "grant-invalid-date" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-invalid-date",
        name: "Invalid Date Grant",
        applicationDeadline: "invalid-date-value",
        closeoutItems: [
          {
            id: "item-1",
            label: "Archive documents",
            completed: false,
            dueDate: "invalid-date-value",
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    // Application deadline input is present in the form
    expect(screen.getByLabelText("Application deadline")).toBeInTheDocument();
    // Closeout due date fallback still shown in the closeout tab
    expect(screen.getByText("Due invalid-da")).toBeInTheDocument();
  });

  it("shows inline errors for invalid blank grant detail create submissions", async () => {
    routeState.params = { grantId: "grant-empty" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-empty",
        name: "Empty Grant",
      },
    });

    render(<GrantDetailPage />);

    clearInputNames(["Metric name", "Unit"]);

    submitButtonForm("Save allocation");
    submitButtonForm("Save expense");
    submitButtonForm("Save metric");
    submitButtonForm("Save requirement");
    submitButtonForm("Save item");

    expect(await screen.findByText("Fund and a positive amount are required.")).toBeInTheDocument();
    expect(screen.getByText("Expense amount and date are required.")).toBeInTheDocument();
    expect(screen.getByText("Metric name is required.")).toBeInTheDocument();
    expect(screen.getByText("Report type and due date are required.")).toBeInTheDocument();
    expect(screen.getByText("Checklist item label is required.")).toBeInTheDocument();

    await waitFor(() => {
      expect(mutationMocks.createAllocation).not.toHaveBeenCalled();
      expect(mutationMocks.createExpense).not.toHaveBeenCalled();
      expect(mutationMocks.createMetric).not.toHaveBeenCalled();
      expect(mutationMocks.createRequirement).not.toHaveBeenCalled();
      expect(mutationMocks.createCloseoutItem).not.toHaveBeenCalled();
    });
  });

  it("blocks invalid blank metric entry submissions and renders entry fallbacks", async () => {
    routeState.params = { grantId: "grant-entry-fallback" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-entry-fallback",
        name: "Entry Fallback Grant",
        impactMetrics: [
          {
            id: "metric-entry",
            name: "Meals Served",
            entries: [
              {
                id: "entry-fallback",
                value: null,
                periodStart: null,
                periodEnd: null,
                notes: null,
              },
            ],
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    // Entry form starts with empty values; validation fails naturally without clearing inputs
    submitButtonForm("Save entry");

    await waitFor(() => {
      expect(mutationMocks.createMetricEntry).not.toHaveBeenCalled();
    });

    expect(screen.getByText("-- from -- to --")).toBeInTheDocument();
    expect(screen.getByText("No notes")).toBeInTheDocument();
  });

  it("reopens a completed closeout item", async () => {
    routeState.params = { grantId: "grant-reopen" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-reopen",
        name: "Reopen Grant",
        closeoutItems: [{ id: "item-done", label: "Submit archive", completed: true }],
      },
    });

    render(<GrantDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(mutationMocks.updateCloseoutItem).toHaveBeenCalledWith({
        itemId: "item-done",
        data: { completed: false },
      });
    });
  });

  it("shows completion timestamp and the user's name for a completed closeout item", () => {
    routeState.params = { grantId: "grant-completed" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-completed",
        name: "Completed Grant",
        closeoutItems: [
          {
            id: "item-done",
            label: "Submit archive",
            completed: true,
            completedAt: "2026-04-15T00:00:00.000Z",
            completedBy: "user-abc",
            completedByUser: { name: "Dana Lee" },
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    expect(screen.getByText(/Completed Apr 15, 2026/)).toBeInTheDocument();
    // The reviewer's name, not the raw user UUID, identifies who completed it.
    expect(screen.getByText(/by Dana Lee/)).toBeInTheDocument();
    expect(screen.queryByText(/user-abc/)).not.toBeInTheDocument();
  });

  it("omits the completing user when the name is unavailable instead of showing a raw id", () => {
    routeState.params = { grantId: "grant-completed-noname" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-completed-noname",
        name: "Completed Grant",
        closeoutItems: [
          {
            id: "item-done",
            label: "Submit archive",
            completed: true,
            completedAt: "2026-04-15T00:00:00.000Z",
            completedBy: "user-abc",
            completedByUser: null,
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    // The completion line shows the date with no trailing "by <id>" clause.
    expect(screen.getByText("Completed Apr 15, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/user-abc/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Apr 15, 2026 by/)).not.toBeInTheDocument();
  });

  it("creates and updates closeout item due dates", async () => {
    routeState.params = { grantId: "grant-closeout-dates" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-closeout-dates",
        name: "Closeout Dates Grant",
        closeoutItems: [
          {
            id: "item-1",
            label: "Archive documents",
            completed: false,
            dueDate: "2026-08-15T00:00:00.000Z",
          },
        ],
      },
    });

    render(<GrantDetailPage />);

    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Submit final narrative" },
    });
    fireEvent.change(screen.getByLabelText("Due date (optional)"), {
      target: { value: "2026-08-31" },
    });
    submitButtonForm("Save item");

    fireEvent.change(screen.getByLabelText("Due date for Archive documents"), {
      target: { value: "2026-08-20" },
    });
    submitButtonForm("Save due date");

    await waitFor(() => {
      expect(mutationMocks.createCloseoutItem).toHaveBeenCalledWith({
        label: "Submit final narrative",
        dueDate: "2026-08-31T12:00:00.000Z",
      });
      expect(mutationMocks.updateCloseoutItem).toHaveBeenCalledWith({
        itemId: "item-1",
        data: { dueDate: "2026-08-20T12:00:00.000Z" },
      });
    });

    expect(screen.getByText("Due Aug 15, 2026")).toBeInTheDocument();
  });

  it("manages metric entries, reporting actions, closeout actions, and grant actions", async () => {
    routeState.params = { grantId: "grant-actions" };
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-actions",
        name: "Action Grant",
        status: "active",
        impactMetrics: [
          {
            id: "metric-1",
            name: "Students Served",
            unit: "students",
            actualValue: 40,
            targetValue: "100",
            entries: [
              {
                id: "entry-1",
                value: "40",
                periodStart: "2026-01-01T00:00:00.000Z",
                periodEnd: "2026-03-31T00:00:00.000Z",
                notes: "Q1",
              },
            ],
          },
        ],
        reportingRequirements: [
          {
            id: "report-1",
            reportType: "quarterly",
            dueDate: "2026-08-01",
            derivedStatus: "upcoming",
          },
        ],
        closeoutItems: [{ id: "item-1", label: "Archive documents", completed: false }],
      },
    });

    render(<GrantDetailPage />);

    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Period start"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-06-30" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional notes"), {
      target: { value: "Q2" },
    });
    submitButtonForm("Save entry");

    fireEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete requirement" }));
    // Confirm the "Delete requirement?" dialog via its confirm-dialog container
    fireEvent.click(
      within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: "Delete" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    // Confirm the "Delete closeout item?" dialog via its confirm-dialog container
    fireEvent.click(
      within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: "Delete" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete grant" }));
    // The grant delete dialog's confirm button — use heading to locate the dialog-content
    const grantDeleteHeading = screen.getByRole("heading", { name: "Delete grant?" });
    const grantDeleteContent = grantDeleteHeading.closest<HTMLElement>(
      '[data-testid="dialog-content"]',
    );
    fireEvent.click(within(grantDeleteContent!).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mutationMocks.createMetricEntry).toHaveBeenCalledWith({
        metricId: "metric-1",
        data: {
          value: "25",
          periodStart: "2026-04-01T12:00:00.000Z",
          periodEnd: "2026-06-30T12:00:00.000Z",
          notes: "Q2",
        },
      });
      expect(mutationMocks.updateRequirement).toHaveBeenCalledWith({
        requirementId: "report-1",
        data: { status: "submitted" },
      });
      expect(mutationMocks.deleteRequirement).toHaveBeenCalledWith("report-1");
      expect(mutationMocks.updateCloseoutItem).toHaveBeenCalledWith({
        itemId: "item-1",
        data: { completed: true },
      });
      expect(mutationMocks.deleteCloseoutItem).toHaveBeenCalledWith("item-1");
      expect(mutationMocks.updateGrant).toHaveBeenCalledWith({
        name: "Action Grant",
        description: null,
        notes: null,
        status: "active",
        amountCents: null,
        applicationDeadline: null,
        startDate: null,
        endDate: null,
      });
      expect(mutationMocks.deleteGrant).toHaveBeenCalled();
    });
  });

  it("renders the loading branch and the full grant detail workflow", async () => {
    routeState.params = { grantId: "grant-1" };

    const { rerender, container } = render(<GrantDetailPage />);
    expect(screen.queryByText("Loading grant...")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);

    mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-1", name: "Test Fund" }] },
    });
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-1",
        name: "Summer Learning",
        status: "active",
        amountCents: 2500000,
        description: null,
        applicationDeadline: null,
        startDate: null,
        endDate: null,
        summary: {
          allocatedTotalCents: 1500000,
          remainingBalanceCents: 1000000,
          thresholdState: "80%",
        },
        fundAllocations: [
          { id: "alloc-1", fund: { name: "Education Fund" }, allocatedAmountCents: 1500000 },
        ],
        expenses: [{ id: "expense-1", description: "Books", amountCents: 250000 }],
        impactMetrics: [
          {
            id: "metric-1",
            name: "Students Served",
            unit: "students",
            actualValue: 40,
            targetValue: null,
          },
        ],
        reportingRequirements: [
          {
            id: "report-1",
            reportType: "quarterly",
            dueDate: "2026-08-01",
            derivedStatus: "upcoming",
          },
        ],
        closeoutItems: [{ id: "item-1", label: "Archive documents", completed: false }],
      },
    });

    rerender(<GrantDetailPage />);

    expect(screen.getAllByLabelText("Description")[0]).toHaveValue("");
    expect(screen.getByLabelText("Application deadline")).toHaveValue("");
    expect(screen.getByLabelText("Start date")).toHaveValue("");
    expect(screen.getByLabelText("End date")).toHaveValue("");
    expect(
      screen.getByText(
        "Document which fund is supporting this grant and how much has been committed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Capture grant spending so burn rate and remaining balance stay accurate."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Define the outcomes this grant is funding so progress can be measured over time.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Track upcoming deliverables and the cadence required by this funder."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "List the wrap-up tasks that must be completed before this grant is fully closed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Education Fund")).toBeInTheDocument();
    expect(screen.getByText("Books")).toBeInTheDocument();
    expect(screen.getByText("Students Served")).toBeInTheDocument();
    expect(screen.getByText("Archive documents")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fund"), { target: { value: "fund-1" } });
    fireEvent.change(screen.getAllByLabelText("Amount (USD)")[0] as HTMLElement, {
      target: { value: "123.45" },
    });
    submitButtonForm("Save allocation");

    const expenseForm = getButtonForm("Save expense");
    fireEvent.change(expenseForm.getByLabelText("Amount (USD)"), {
      target: { value: "50" },
    });
    fireEvent.change(expenseForm.getByLabelText("Date"), { target: { value: "2026-04-01" } });
    fireEvent.change(expenseForm.getByLabelText("Description"), {
      target: { value: "Travel" },
    });
    submitButtonForm("Save expense");

    fireEvent.change(screen.getByPlaceholderText("Metric name"), {
      target: { value: "Households Served" },
    });
    fireEvent.change(screen.getByPlaceholderText("Unit"), { target: { value: "households" } });
    submitButtonForm("Save metric");

    fireEvent.change(screen.getByLabelText("Report type"), { target: { value: "final" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-31" } });
    submitButtonForm("Save requirement");

    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Send final narrative" },
    });
    submitButtonForm("Save item");

    await waitFor(() => {
      expect(mutationMocks.createAllocation).toHaveBeenCalledWith({
        fundId: "fund-1",
        allocatedAmountCents: Math.round(123.45 * 100),
      });
      expect(mutationMocks.createExpense).toHaveBeenCalledWith({
        amountCents: 5000,
        date: "2026-04-01T12:00:00.000Z",
        description: "Travel",
      });
      expect(mutationMocks.createMetric).toHaveBeenCalledWith({
        name: "Households Served",
        unit: "households",
      });
      expect(mutationMocks.createRequirement).toHaveBeenCalledWith({
        reportType: "final",
        dueDate: "2026-12-31T12:00:00.000Z",
      });
      expect(mutationMocks.createCloseoutItem).toHaveBeenCalledWith({
        label: "Send final narrative",
        dueDate: null,
      });
    });
  });

  it("preserves loaded overview values when saving after the query resolves", async () => {
    routeState.params = { grantId: "grant-loaded-overview" };

    const { rerender, container } = render(<GrantDetailPage />);
    expect(screen.queryByText("Loading grant...")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);

    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-loaded-overview",
        name: "Loaded Overview Grant",
        description: "Existing description",
        notes: "Existing notes",
      },
    });

    rerender(<GrantDetailPage />);
    submitButtonForm("Save changes");

    await waitFor(() => {
      expect(mutationMocks.updateGrant).toHaveBeenCalledWith({
        name: "Loaded Overview Grant",
        description: "Existing description",
        notes: "Existing notes",
        status: "discovery",
        amountCents: null,
        applicationDeadline: null,
        startDate: null,
        endDate: null,
      });
    });
  });

  it("does not overwrite unsaved overview edits when the grant refetches", async () => {
    routeState.params = { grantId: "grant-unsaved-overview" };

    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-unsaved-overview",
        name: "Unsaved Overview Grant",
        description: "Existing description",
        notes: "Existing notes",
      },
    });

    const { rerender } = render(<GrantDetailPage />);

    fireEvent.change(screen.getAllByLabelText("Description")[0] as HTMLElement, {
      target: { value: "Unsaved local description" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Unsaved local notes" },
    });

    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-unsaved-overview",
        name: "Unsaved Overview Grant",
        description: "Server description after refetch",
        notes: "Existing notes",
      },
    });

    rerender(<GrantDetailPage />);
    submitButtonForm("Save changes");

    await waitFor(() => {
      expect(mutationMocks.updateGrant).toHaveBeenCalledWith({
        name: "Unsaved Overview Grant",
        description: "Unsaved local description",
        notes: "Unsaved local notes",
        status: "discovery",
        amountCents: null,
        applicationDeadline: null,
        startDate: null,
        endDate: null,
      });
    });
  });

  describe("program allocations editor", () => {
    const auditReadyBilling = {
      data: { planTier: "audit_ready", status: "active", trialEndsAt: null },
      isLoading: false,
      isError: false,
    };

    it("renders the program allocations editor on growth plans", () => {
      routeState.params = { grantId: "grant-pa-growth" };
      mockUseOrgBilling.mockReturnValue({
        data: { planTier: "growth", status: "active", trialEndsAt: null },
        isLoading: false,
        isError: false,
      });
      mockUseGrant.mockReturnValue({
        data: { id: "grant-pa-growth", name: "Growth Grant", status: "active" },
      });

      render(<GrantDetailPage />);

      expect(screen.getByText("Program allocations")).toBeInTheDocument();
    });

    it("renders existing program allocations from the grant", () => {
      routeState.params = { grantId: "grant-pa" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "grant-pa",
          name: "Program Grant",
          status: "active",
          programAllocations: [
            {
              id: "gpa-1",
              programId: "11111111-1111-4111-8111-111111111111",
              amountCents: 250000,
              program: { id: "11111111-1111-4111-8111-111111111111", name: "After School" },
            },
          ],
        },
      });

      render(<GrantDetailPage />);

      expect(screen.getByText("Program allocations")).toBeInTheDocument();
      const amountInput = screen.getByLabelText("Program allocation amount 1") as HTMLInputElement;
      expect(amountInput.value).toBe("2500.00");
    });

    it("saves program allocations with dollar amounts converted to cents", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-aaaaaaaaaaaa" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
          name: "Save Grant",
          status: "active",
          programAllocations: [],
        },
      });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for allocation row 1"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.change(screen.getByLabelText("Program allocation amount 1"), {
        target: { value: "125.50" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save program allocations" }));

      await waitFor(() => {
        expect(mutationMocks.replaceGrantProgramAllocations).toHaveBeenCalledWith({
          grantId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
          allocations: [{ programId: "11111111-1111-4111-8111-111111111111", amountCents: 12550 }],
        });
      });
      expect(screen.getByText("Program allocations saved.")).toBeInTheDocument();
    });

    it("adds and removes allocation rows", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-bbbbbbbbbbbb" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-bbbbbbbbbbbb",
          name: "Rows Grant",
          status: "active",
          programAllocations: [],
        },
      });

      render(<GrantDetailPage />);

      fireEvent.click(screen.getByRole("button", { name: "Add program allocation" }));
      expect(screen.getByLabelText("Program allocation amount 2")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Remove program allocation row 2" }));
      expect(screen.queryByLabelText("Program allocation amount 2")).not.toBeInTheDocument();
    });

    it("surfaces a validation error when an amount is missing", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-cccccccccccc" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-cccccccccccc",
          name: "Invalid Grant",
          status: "active",
          programAllocations: [],
        },
      });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for allocation row 1"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save program allocations" }));

      await waitFor(() => {
        expect(
          screen.getByText("Enter a positive amount for each program allocation."),
        ).toBeInTheDocument();
      });
      expect(mutationMocks.replaceGrantProgramAllocations).not.toHaveBeenCalled();
    });

    it("surfaces a server error when the save fails", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-dddddddddddd" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-dddddddddddd",
          name: "Error Grant",
          status: "active",
          programAllocations: [],
        },
      });
      mutationMocks.replaceGrantProgramAllocations.mockRejectedValueOnce(
        new Error("Allocation conflict"),
      );

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for allocation row 1"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.change(screen.getByLabelText("Program allocation amount 1"), {
        target: { value: "100" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save program allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Allocation conflict")).toBeInTheDocument();
      });
    });

    it("renders read-only program allocations for viewers", () => {
      routeState.params = { grantId: "grant-pa-viewer" };
      mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "grant-pa-viewer",
          name: "Viewer Grant",
          status: "active",
          programAllocations: [
            {
              id: "gpa-9",
              programId: "11111111-1111-4111-8111-111111111111",
              amountCents: 500000,
              program: { id: "11111111-1111-4111-8111-111111111111", name: "After School" },
            },
          ],
        },
      });

      render(<GrantDetailPage />);

      expect(screen.getByText("Program allocations")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save program allocations" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("After School")).toBeInTheDocument();
    });

    it("seeds an empty amount when a current allocation has no amount", () => {
      routeState.params = { grantId: "grant-pa-null-amount" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "grant-pa-null-amount",
          name: "Null Amount Grant",
          status: "active",
          programAllocations: [
            {
              id: "gpa-null",
              programId: "11111111-1111-4111-8111-111111111111",
              amountCents: null,
              program: { id: "11111111-1111-4111-8111-111111111111", name: "After School" },
            },
          ],
        },
      });

      render(<GrantDetailPage />);

      const amountInput = screen.getByLabelText("Program allocation amount 1") as HTMLInputElement;
      expect(amountInput.value).toBe("");
    });

    it("surfaces a uniqueness error for duplicate programs", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-eeeeeeeeeeee" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-eeeeeeeeeeee",
          name: "Duplicate Grant",
          status: "active",
          programAllocations: [],
        },
      });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for allocation row 1"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.change(screen.getByLabelText("Program allocation amount 1"), {
        target: { value: "10" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add program allocation" }));
      fireEvent.change(screen.getByLabelText("Program for allocation row 2"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.change(screen.getByLabelText("Program allocation amount 2"), {
        target: { value: "20" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save program allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Program allocations must be unique")).toBeInTheDocument();
      });
      expect(mutationMocks.replaceGrantProgramAllocations).not.toHaveBeenCalled();
    });

    it("shows a generic message when the save rejects without an Error", async () => {
      routeState.params = { grantId: "11111111-1111-4111-8111-ffffffffffff" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      mockUseGrant.mockReturnValue({
        data: {
          id: "11111111-1111-4111-8111-ffffffffffff",
          name: "Generic Error Grant",
          status: "active",
          programAllocations: [],
        },
      });
      mutationMocks.replaceGrantProgramAllocations.mockRejectedValueOnce("boom");

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for allocation row 1"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      fireEvent.change(screen.getByLabelText("Program allocation amount 1"), {
        target: { value: "100" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save program allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Unable to save program allocations.")).toBeInTheDocument();
      });
    });

    it("renders read-only fallbacks for missing program names, amounts, and empty lists", () => {
      mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);

      routeState.params = { grantId: "grant-pa-fallbacks" };
      mockUseGrant.mockReturnValue({
        data: {
          id: "grant-pa-fallbacks",
          name: "Fallback Grant",
          status: "active",
          programAllocations: [
            {
              id: "gpa-a",
              programId: "11111111-1111-4111-8111-111111111111",
              amountCents: null,
              program: null,
            },
            {
              id: "gpa-b",
              programId: "99999999-9999-4999-8999-999999999999",
              amountCents: null,
              program: null,
            },
          ],
        },
      });

      const { rerender } = render(<GrantDetailPage />);

      expect(screen.getByText("After School")).toBeInTheDocument();
      expect(screen.getByText("Unknown program")).toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);

      routeState.params = { grantId: "grant-pa-empty" };
      mockUseGrant.mockReturnValue({
        data: {
          id: "grant-pa-empty",
          name: "Empty Grant",
          status: "active",
          programAllocations: [],
        },
      });
      rerender(<GrantDetailPage />);

      expect(screen.getByText("No programs are allocated to this grant yet.")).toBeInTheDocument();
    });
  });

  describe("expense program allocations editor", () => {
    const auditReadyBilling = {
      data: { planTier: "audit_ready", status: "active", trialEndsAt: null },
      isLoading: false,
      isError: false,
    };
    const programA = "11111111-1111-4111-8111-111111111111";
    const programB = "22222222-2222-4222-8222-222222222222";
    const expenseId = "44444444-4444-4444-8444-444444444444";

    function grantWithExpense(
      grantId: string,
      expense: Record<string, unknown>,
      extra?: Record<string, unknown>,
    ) {
      mockUseGrant.mockReturnValue({
        data: {
          id: grantId,
          name: "Expense Grant",
          status: "active",
          programAllocations: [],
          expenses: [{ id: expenseId, description: "Travel", amountCents: 100000, ...expense }],
          ...extra,
        },
      });
    }

    it("renders the expense allocations editor on growth plans", () => {
      routeState.params = { grantId: "grant-exp-growth" };
      mockUseOrgBilling.mockReturnValue({
        data: { planTier: "growth", status: "active", trialEndsAt: null },
        isLoading: false,
        isError: false,
      });
      grantWithExpense("grant-exp-growth", {});

      render(<GrantDetailPage />);

      expect(screen.getByRole("button", { name: "Save expense allocations" })).toBeInTheDocument();
    });

    it("seeds an amount-mode row from an existing expense allocation", () => {
      routeState.params = { grantId: "grant-exp-amount" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-amount", {
        programAllocations: [
          {
            id: "epa-1",
            programId: programA,
            amountCents: 75000,
            percentBasisPoints: null,
            program: { id: programA, name: "After School" },
          },
        ],
      });

      render(<GrantDetailPage />);

      const valueInput = screen.getByLabelText("Expense allocation amount 1") as HTMLInputElement;
      expect(valueInput.value).toBe("750.00");
    });

    it("seeds percent mode when all current allocations use basis points", () => {
      routeState.params = { grantId: "grant-exp-percent" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-percent", {
        programAllocations: [
          {
            id: "epa-2",
            programId: programA,
            amountCents: null,
            percentBasisPoints: 4000,
            program: { id: programA, name: "After School" },
          },
        ],
      });

      render(<GrantDetailPage />);

      const valueInput = screen.getByLabelText("Expense allocation percent 1") as HTMLInputElement;
      expect(valueInput.value).toBe("40");
    });

    it("saves amount-mode allocations with cents conversion and replace balance mode", async () => {
      routeState.params = { grantId: "grant-exp-save-amount" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-save-amount", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.change(screen.getByLabelText("Expense allocation amount 1"), {
        target: { value: "125.50" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(mutationMocks.replaceExpenseProgramAllocations).toHaveBeenCalledWith({
          expenseId,
          balanceMode: "replace",
          allocations: [{ programId: programA, amountCents: 12550 }],
        });
      });
      expect(screen.getByText("Expense allocations saved.")).toBeInTheDocument();
    });

    it("saves percent-mode allocations totalling 100% with balancing", async () => {
      routeState.params = { grantId: "grant-exp-save-percent" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-save-percent", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Expense allocation mode"), {
        target: { value: "percent" },
      });
      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.change(screen.getByLabelText("Expense allocation percent 1"), {
        target: { value: "100" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(mutationMocks.replaceExpenseProgramAllocations).toHaveBeenCalledWith({
          expenseId,
          balanceMode: "replace_and_balance",
          allocations: [{ programId: programA, percentBasisPoints: 10000 }],
        });
      });
    });

    it("requires at least one program before saving", async () => {
      routeState.params = { grantId: "grant-exp-empty-rows" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-empty-rows", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Add at least one program allocation.")).toBeInTheDocument();
      });
      expect(mutationMocks.replaceExpenseProgramAllocations).not.toHaveBeenCalled();
    });

    it("surfaces a positive-amount error in amount mode", async () => {
      routeState.params = { grantId: "grant-exp-amount-error" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-amount-error", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(
          screen.getByText("Enter a positive amount for each program allocation."),
        ).toBeInTheDocument();
      });
    });

    it("surfaces a positive-percentage error in percent mode", async () => {
      routeState.params = { grantId: "grant-exp-percent-error" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-percent-error", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Expense allocation mode"), {
        target: { value: "percent" },
      });
      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(
          screen.getByText("Enter a positive percentage for each program allocation."),
        ).toBeInTheDocument();
      });
    });

    it("surfaces a schema error when percentages do not total 100%", async () => {
      routeState.params = { grantId: "grant-exp-percent-total" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-percent-total", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Expense allocation mode"), {
        target: { value: "percent" },
      });
      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.change(screen.getByLabelText("Expense allocation percent 1"), {
        target: { value: "40" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(
          screen.getByText("Percent allocations must total 10000 basis points"),
        ).toBeInTheDocument();
      });
      expect(mutationMocks.replaceExpenseProgramAllocations).not.toHaveBeenCalled();
    });

    it("adds and removes expense allocation rows", () => {
      routeState.params = { grantId: "grant-exp-rows" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-rows", { programAllocations: [] });

      render(<GrantDetailPage />);

      fireEvent.click(screen.getByRole("button", { name: "Add expense allocation" }));
      expect(screen.getByLabelText("Expense allocation amount 2")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Remove expense allocation row 2" }));
      expect(screen.queryByLabelText("Expense allocation amount 2")).not.toBeInTheDocument();
    });

    it("surfaces a server error message when the save fails", async () => {
      routeState.params = { grantId: "grant-exp-server-error" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-server-error", { programAllocations: [] });
      mutationMocks.replaceExpenseProgramAllocations.mockRejectedValueOnce(
        new Error("Expense allocation conflict"),
      );

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programA },
      });
      fireEvent.change(screen.getByLabelText("Expense allocation amount 1"), {
        target: { value: "100" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Expense allocation conflict")).toBeInTheDocument();
      });
    });

    it("shows a generic message when the save rejects without an Error", async () => {
      routeState.params = { grantId: "grant-exp-generic-error" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-generic-error", { programAllocations: [] });
      mutationMocks.replaceExpenseProgramAllocations.mockRejectedValueOnce("boom");

      render(<GrantDetailPage />);

      fireEvent.change(screen.getByLabelText("Program for expense allocation row 1"), {
        target: { value: programB },
      });
      fireEvent.change(screen.getByLabelText("Expense allocation amount 1"), {
        target: { value: "100" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save expense allocations" }));

      await waitFor(() => {
        expect(screen.getByText("Unable to save expense allocations.")).toBeInTheDocument();
      });
    });

    it("renders read-only expense allocation labels and fallbacks for viewers", () => {
      mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      routeState.params = { grantId: "grant-exp-viewer" };
      grantWithExpense("grant-exp-viewer", {
        programAllocations: [
          {
            id: "epa-amount",
            programId: programA,
            amountCents: 50000,
            percentBasisPoints: null,
            program: { id: programA, name: "After School" },
          },
          {
            id: "epa-percent",
            programId: programB,
            amountCents: null,
            percentBasisPoints: 2500,
            program: null,
          },
          {
            id: "epa-none",
            programId: "33333333-3333-4333-8333-333333333333",
            amountCents: null,
            percentBasisPoints: null,
            program: null,
          },
        ],
      });

      render(<GrantDetailPage />);

      expect(
        screen.queryByRole("button", { name: "Save expense allocations" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("$500")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("Summer Camp")).toBeInTheDocument();
      expect(screen.getByText("Unknown program")).toBeInTheDocument();
    });

    it("shows an empty read-only state when an expense has no allocations", () => {
      mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      routeState.params = { grantId: "grant-exp-viewer-empty" };
      grantWithExpense("grant-exp-viewer-empty", { programAllocations: [] });

      render(<GrantDetailPage />);

      expect(
        screen.getByText("No programs are allocated to this expense yet."),
      ).toBeInTheDocument();
    });

    it("seeds an empty value when an amount-mode allocation has no amount", () => {
      routeState.params = { grantId: "grant-exp-null-amount" };
      mockUseOrgBilling.mockReturnValue(auditReadyBilling);
      grantWithExpense("grant-exp-null-amount", {
        programAllocations: [
          {
            id: "epa-null-amount",
            programId: programA,
            amountCents: null,
            percentBasisPoints: null,
            program: { id: programA, name: "After School" },
          },
        ],
      });

      render(<GrantDetailPage />);

      const valueInput = screen.getByLabelText("Expense allocation amount 1") as HTMLInputElement;
      expect(valueInput.value).toBe("");
    });
  });
});

describe("fund routes", () => {
  beforeEach(() => {
    resetStates();
  });

  it("renders the funds list empty state", () => {
    render(<FundsListPage />);

    expect(screen.getByRole("region", { name: "Your funds live here" })).toBeInTheDocument();
  });

  it("shows a loading state while the funds list is still resolving", () => {
    mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<FundsListPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Your funds live here" })).not.toBeInTheDocument();
  });

  it("shows an error state instead of a false empty state when funds fail to load", () => {
    mockUseFunds.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Fund ledger offline"),
    });

    render(<FundsListPage />);

    expect(screen.getByText("Unable to load funds.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your funds live here" })).not.toBeInTheDocument();
  });

  it("renders the funds list populated state and create flow", async () => {
    mockUseFunds.mockReturnValue({
      data: {
        data: [
          {
            id: "fund-1",
            name: "General Operations",
            type: "temporarily_restricted",
            summary: {
              allocatedTotalCents: 2000000,
              expenseTotalCents: 500000,
              currentBalanceCents: 1500000,
              expenseRatio: 0.25,
              thresholdState: null,
            },
          },
        ],
      },
    });

    render(<FundsListPage />);

    expect(
      screen.getByText("Create a fund to track balances and restrictions."),
    ).toBeInTheDocument();
    expect(screen.getByText("$15,000")).toBeInTheDocument();
    // In Cards view the entire card (name + badge) is wrapped in the Link.
    // Use a partial text match to find the fund link.
    expect(screen.getByRole("link", { name: /General Operations/ })).toHaveAttribute(
      "href",
      "/funds/$fundId",
    );
    expect(screen.getAllByText("Temporarily restricted").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^temporarily restricted$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fund name")).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText("Fund name"), {
      target: { value: "Board Reserve" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "temporarily_restricted" },
    });
    submitButtonForm("Add");

    await waitFor(() => {
      expect(mutationMocks.createFund).toHaveBeenCalledWith({
        name: "Board Reserve",
        type: "temporarily_restricted",
      });
    });
  });

  it("blocks an empty fund submission before hitting the mutation", async () => {
    render(<FundsListPage />);

    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Fund name is required.");
    expect(mutationMocks.createFund).not.toHaveBeenCalled();
  });

  it("shows an inline error when creating a fund fails", async () => {
    mutationMocks.createFund.mockRejectedValueOnce(new Error("Fund already exists"));

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Fund name"), {
      target: { value: "General Operations" },
    });
    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Fund already exists");
  });

  it("falls back to the default fund validation error when the schema exposes no issue message", async () => {
    const safeParseSpy = vi
      .spyOn(createFundSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Fund name"), {
      target: { value: "Schema Edge Case Fund" },
    });
    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to add fund.");
    safeParseSpy.mockRestore();
  });

  it("updates the fund query when the search term changes", async () => {
    render(<FundsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funds…"), {
      target: { value: "reserve" },
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenLastCalledWith({
        to: ".",
        search: { search: "reserve" },
        replace: true,
      });
    });
  });

  it("updates the fund query when the type filter changes", async () => {
    render(<FundsListPage />);

    fireEvent.change(screen.getByLabelText("Filter fund type"), {
      target: { value: "temporarily_restricted" },
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenLastCalledWith({
        to: ".",
        search: { type: "temporarily_restricted" },
        replace: true,
      });
    });
  });

  it("falls back when the fund list payload is missing", () => {
    mockUseFunds.mockReturnValue({});

    render(<FundsListPage />);

    expect(screen.getByRole("region", { name: "Your funds live here" })).toBeInTheDocument();
  });

  it("renders fund detail fallbacks for empty and incomplete data", () => {
    routeState.params = { fundId: "fund-2" };
    mockUseFund.mockReturnValue({
      data: {
        id: "fund-2",
        name: null,
        type: null,
        summary: {
          allocatedTotalCents: null,
          expenseTotalCents: null,
          currentBalanceCents: null,
          thresholdState: null,
        },
        grantAllocations: [{ id: "alloc-2", grant: null, allocatedAmountCents: null }],
        expenses: [{ id: "expense-2", description: null, amountCents: null }],
      },
    });

    render(<FundDetailPage />);

    expect(screen.getAllByText("Fund").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Unrestricted").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^unrestricted$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Threshold/)).not.toBeInTheDocument();
    expect(screen.getByText("Grant allocation")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("falls back when fund detail collections and summary are missing", () => {
    routeState.params = { fundId: "fund-4" };
    mockUseFund.mockReturnValue({
      data: {
        id: "fund-4",
        name: "Sparse Fund",
      },
    });

    render(<FundDetailPage />);

    expect(screen.queryByText(/^Threshold/)).not.toBeInTheDocument();
    expect(screen.getByText("No allocations recorded.")).toBeInTheDocument();
    expect(screen.getByText("No expenses posted to this fund.")).toBeInTheDocument();
  });

  it("renders the loading and populated fund detail states", () => {
    routeState.params = { fundId: "fund-1" };

    const { container, rerender } = render(<FundDetailPage />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();

    mockUseFund.mockReturnValue({
      data: {
        id: "fund-1",
        name: "General Operations",
        type: "temporarily_restricted",
        summary: {
          allocatedTotalCents: 2000000,
          expenseTotalCents: 500000,
          currentBalanceCents: 1500000,
          thresholdState: "90%",
        },
        grantAllocations: [
          { id: "alloc-1", grant: { name: "Summer Learning" }, allocatedAmountCents: 2000000 },
        ],
        expenses: [{ id: "expense-1", description: "Payroll", amountCents: 500000 }],
      },
    });

    rerender(<FundDetailPage />);

    expect(screen.getByText("Summer Learning")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
    expect(screen.getByText("Threshold 90%")).toBeInTheDocument();
    expect(screen.getAllByText("Temporarily restricted").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^temporarily restricted$/)).not.toBeInTheDocument();
    expect(screen.getByText("$15,000")).toBeInTheDocument();
    expect(screen.getAllByText("Documents").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);
  });

  it("shows an explicit error state when fund detail fails to load", () => {
    routeState.params = { fundId: "fund-error" };
    mockUseFund.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Fund detail unavailable"),
      refetch: vi.fn(),
    });

    render(<FundDetailPage />);

    // "Unable to load fund." appears in the Alert title
    expect(screen.getByText("Unable to load fund.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders the empty fund detail ledger states", () => {
    routeState.params = { fundId: "fund-3" };
    mockUseFund.mockReturnValue({
      data: {
        id: "fund-3",
        name: "Reserve Fund",
        type: "permanently_restricted",
        summary: {},
        grantAllocations: [],
        expenses: [],
      },
    });

    render(<FundDetailPage />);

    expect(screen.getByText("No allocations recorded.")).toBeInTheDocument();
    expect(screen.getByText("No expenses posted to this fund.")).toBeInTheDocument();
  });

  it("updates and deletes a fund from the detail page", async () => {
    routeState.params = { fundId: "fund-actions" };
    mockUseFund.mockReturnValue({
      data: {
        id: "fund-actions",
        name: "Operations Reserve",
        description: "Reserve fund",
      },
    });

    render(<FundDetailPage />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Updated reserve fund" },
    });
    submitButtonForm("Save changes");
    fireEvent.click(screen.getByRole("button", { name: "Delete fund" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mutationMocks.updateFund).toHaveBeenCalledWith({
        description: "Updated reserve fund",
      });
      expect(mutationMocks.deleteFund).toHaveBeenCalled();
    });
  });

  it("submits a blank fund description as null", async () => {
    routeState.params = { fundId: "fund-blank-description" };
    mockUseFund.mockReturnValue({
      data: {
        id: "fund-blank-description",
        name: "Blank Description Fund",
        description: "Existing description",
      },
    });

    render(<FundDetailPage />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "   " },
    });
    submitButtonForm("Save changes");

    await waitFor(() => {
      expect(mutationMocks.updateFund).toHaveBeenCalledWith({
        description: null,
      });
    });
  });
});

describe("funder routes", () => {
  beforeEach(() => {
    resetStates();
  });

  it("renders the funders list empty state", () => {
    render(<FundersListPage />);

    expect(screen.getByRole("region", { name: "Your funders live here" })).toBeInTheDocument();
  });

  it("shows a help action instead of create controls when the member cannot edit funders", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: {
        grants: "view",
      },
      isLoading: false,
    });

    render(<FundersListPage />);

    expect(screen.queryByRole("button", { name: "Add funder" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open help" })).toHaveAttribute("href", "/help");
  });

  it("shows a loading state while the funders list is still resolving", () => {
    mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<FundersListPage />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("region", { name: "Your funders live here" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error state instead of a false empty state when funders fail to load", () => {
    mockUseFunders.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Funder directory unavailable"),
    });

    render(<FundersListPage />);

    expect(screen.getByText("Unable to load funders.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Your funders live here" }),
    ).not.toBeInTheDocument();
  });

  it("renders the funders list populated state and create flow", async () => {
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation", type: "foundation" }] },
    });

    render(<FundersListPage />);

    expect(
      screen.getByText("Add a funder. Track its grants, contacts, and priorities in one place."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Acme Foundation/ })).toHaveAttribute(
      "href",
      "/funders/$funderId",
    );
    expect(screen.getByText("Foundation", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText(/^foundation$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Funder name")).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText("Funder name"), {
      target: { value: "Civic Partners" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "corporate" },
    });
    submitButtonForm("Add");

    await waitFor(() => {
      expect(mutationMocks.createFunder).toHaveBeenCalledWith({
        name: "Civic Partners",
        type: "corporate",
      });
    });
  });

  it("blocks an empty funder name before hitting the mutation", async () => {
    render(<FundersListPage />);

    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a funder name.");
    expect(mutationMocks.createFunder).not.toHaveBeenCalled();
  });

  it("shows an inline error when creating a funder fails", async () => {
    mutationMocks.createFunder.mockRejectedValueOnce(new Error("Funder already exists"));

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Funder name"), {
      target: { value: "Acme Foundation" },
    });
    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Funder already exists");
  });

  it("updates the funder query when the search term changes", () => {
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation", type: "foundation" }] },
    });

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search funders…"), {
      target: { value: "acme" },
    });

    // Search now syncs to the URL via navigate; verify the route update carries the search term
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ q: "acme" }),
      }),
    );
  });

  it("updates the funder query when the type filter changes", () => {
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "funder-1", name: "Acme Foundation", type: "foundation" }] },
    });

    render(<FundersListPage />);

    fireEvent.change(screen.getByLabelText("Filter funder type"), {
      target: { value: "government" },
    });

    // Type filter now syncs to the URL via navigate; verify the route update carries the type
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ type: "government" }),
      }),
    );
  });

  it("falls back when the funder list payload is missing", () => {
    mockUseFunders.mockReturnValue({});

    render(<FundersListPage />);

    expect(screen.getByRole("region", { name: "Your funders live here" })).toBeInTheDocument();
  });

  it("falls back to the default validation error when the schema exposes no issue message", async () => {
    const safeParseSpy = vi
      .spyOn(createFunderSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<FundersListPage />);

    fireEvent.change(screen.getByPlaceholderText("Funder name"), {
      target: { value: "Schema Edge Case Funder" },
    });
    submitButtonForm("Add");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to add funder.");
    safeParseSpy.mockRestore();
  });

  it("renders funder detail fallback states", () => {
    routeState.params = { funderId: "funder-2" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-2",
        name: null,
        type: null,
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    expect(screen.getByText("Funder")).toBeInTheDocument();
    expect(screen.getByText("Foundation", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText(/^foundation$/)).not.toBeInTheDocument();
    expect(screen.getByText("No funder contacts recorded.")).toBeInTheDocument();
    expect(screen.getByText("No grants tied to this funder yet.")).toBeInTheDocument();
  });

  it("shows an explicit error state when funder detail fails to load", () => {
    routeState.params = { funderId: "funder-error" };
    mockUseFunder.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Funder detail unavailable"),
      refetch: vi.fn(),
    });

    render(<FunderDetailPage />);

    // "Unable to load funder." appears in the Alert title
    expect(screen.getByText("Unable to load funder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Loading funder...")).not.toBeInTheDocument();
  });

  it("falls back when funder detail collections are missing and rejects empty contact names", async () => {
    routeState.params = { funderId: "funder-3" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-3",
        name: "Sparse Funder",
      },
    });

    render(<FunderDetailPage />);

    expect(screen.getByText("No funder contacts recorded.")).toBeInTheDocument();
    expect(screen.getByText("No grants tied to this funder yet.")).toBeInTheDocument();

    clearInputNames(["Full name", "e.g. Program Officer", "name@example.org"]);
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Contact name is required");
    expect(mutationMocks.createContact).not.toHaveBeenCalled();
  });

  it("rejects invalid contact emails from the shared validator", async () => {
    routeState.params = { funderId: "funder-invalid-email" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-invalid-email",
        name: "Validator Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Jordan Officer" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@example.org"), {
      target: { value: "not-an-email" },
    });
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email address");
    expect(mutationMocks.createContact).not.toHaveBeenCalled();
  });

  it("omits blank optional funder contact fields when only a name is provided", async () => {
    routeState.params = { funderId: "funder-name-only" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-name-only",
        name: "Name Only Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Jordan Officer" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Program Officer"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByPlaceholderText("name@example.org"), {
      target: { value: "   " },
    });
    submitButtonForm("Save contact");

    await waitFor(() => {
      expect(mutationMocks.createContact).toHaveBeenCalledWith({
        name: "Jordan Officer",
      });
    });
  });

  it("clears contact errors when the contact form changes", async () => {
    routeState.params = { funderId: "funder-clear-errors" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-clear-errors",
        name: "Clear Errors Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    clearInputNames(["Full name", "e.g. Program Officer", "name@example.org"]);
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Contact name is required");

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Jordan Officer" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("clears existing contact errors when the dialog open state changes", async () => {
    routeState.params = { funderId: "funder-dialog-open" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-dialog-open",
        name: "Dialog State Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("name@example.org"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Jordan Officer" },
    });
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email address");

    // There are multiple dialogs (delete-funder + add-contact), so multiple "Open dialog state"
    // buttons. The delete-funder dialog comes first in the tree; click index [1] which is the
    // add-contact dialog's onOpenChange (it clears contactError when called).
    fireEvent.click(screen.getAllByRole("button", { name: "Open dialog state" })[1]!);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("shows an inline error when creating a funder contact fails", async () => {
    routeState.params = { funderId: "funder-contact-error" };
    mutationMocks.createContact.mockRejectedValueOnce(new Error("Email validation failed"));
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-contact-error",
        name: "Error Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Taylor Officer" },
    });
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email validation failed");
  });

  it("falls back to the default contact error when the mutation rejects without an Error instance", async () => {
    routeState.params = { funderId: "funder-non-error-contact-failure" };
    mutationMocks.createContact.mockRejectedValueOnce("contact rejected");
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-non-error-contact-failure",
        name: "Non Error Funder",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Taylor Officer" },
    });
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save funder contact.");
  });

  it("falls back to the default validation error when the schema exposes no issue message", async () => {
    routeState.params = { funderId: "funder-schema-fallback" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-schema-fallback",
        name: "Schema Fallback Funder",
        contacts: [],
        grants: [],
      },
    });

    const safeParseSpy = vi
      .spyOn(createFunderContactSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Taylor Officer" },
    });
    submitButtonForm("Save contact");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save funder contact.");
    safeParseSpy.mockRestore();
  });

  it("renders the loading and populated funder detail states and adds a contact", async () => {
    routeState.params = { funderId: "funder-1" };

    const { container: funderContainer, rerender } = render(<FunderDetailPage />);
    expect(funderContainer.querySelector(".animate-pulse")).toBeInTheDocument();

    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-1",
        name: "Acme Foundation",
        type: "foundation",
        contacts: [{ id: "contact-1", name: "Jane Officer", title: null, email: null }],
        grants: [{ id: "grant-1", name: "Summer Learning", status: "active" }],
      },
    });

    rerender(<FunderDetailPage />);

    expect(screen.getByText("Jane Officer", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("No title")).toBeInTheDocument();
    expect(screen.getByText("No email")).toBeInTheDocument();
    expect(screen.getByText("Summer Learning")).toBeInTheDocument();
    expect(screen.getAllByText("Documents").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "John Program" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Program Officer"), {
      target: { value: "Senior Officer" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@example.org"), {
      target: { value: "john@example.com" },
    });
    submitButtonForm("Save contact");

    await waitFor(() => {
      expect(mutationMocks.createContact).toHaveBeenCalledWith({
        name: "John Program",
        title: "Senior Officer",
        email: "john@example.com",
      });
    });
  });

  it("shows an inline error when creating an expense fails", async () => {
    routeState.params = { grantId: "grant-expense-error" };
    mutationMocks.createExpense.mockRejectedValueOnce(new Error("Expense date must be ISO-8601"));
    mockUseGrant.mockReturnValue({
      data: {
        id: "grant-expense-error",
        name: "Expense Error Grant",
      },
    });

    render(<GrantDetailPage />);

    const expenseForm = getButtonForm("Save expense");
    fireEvent.change(expenseForm.getByLabelText("Amount (USD)"), {
      target: { value: "25" },
    });
    fireEvent.change(expenseForm.getByLabelText("Date"), {
      target: { value: "2026-04-15" },
    });
    submitButtonForm("Save expense");

    expect(await screen.findByRole("alert")).toHaveTextContent("Expense date must be ISO-8601");
  });

  it("updates and deletes funder contacts and the funder record", async () => {
    routeState.params = { funderId: "funder-actions" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-actions",
        name: "Acme Foundation",
        website: "https://acme.org",
        contacts: [
          { id: "contact-1", name: "Jane Officer", title: "Officer", email: "jane@acme.org" },
        ],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://updated.acme.org" },
    });
    submitButtonForm("Save changes");

    fireEvent.click(screen.getByRole("button", { name: "Edit contact Jane Officer" }));
    expect(mutationMocks.updateContact).not.toHaveBeenCalled();

    const contactCard = screen.getByText("Jane Officer", { selector: "p" }).closest("div");
    expect(contactCard).not.toBeNull();
    const card = contactCard as HTMLElement;

    fireEvent.change(within(card).getByPlaceholderText("Full name"), {
      target: { value: "Jane Q. Officer" },
    });
    fireEvent.change(within(card).getByPlaceholderText("e.g. Program Officer"), {
      target: { value: "Senior Officer" },
    });
    fireEvent.change(within(card).getByPlaceholderText("name@example.org"), {
      target: { value: "jane.q@acme.org" },
    });
    fireEvent.submit(within(card).getByRole("button", { name: "Save contact" }).closest("form")!);

    fireEvent.click(screen.getByRole("button", { name: "Delete contact Jane Officer" }));
    const contactDeleteDialog = screen
      .getByRole("heading", { name: "Delete contact?" })
      .closest('[data-testid="dialog-content"]') as HTMLElement;
    fireEvent.click(within(contactDeleteDialog).getByRole("button", { name: "Delete" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete funder" }));
    const funderDeleteDialog = screen
      .getByRole("heading", { name: "Delete funder?" })
      .closest('[data-testid="dialog-content"]') as HTMLElement;
    fireEvent.click(within(funderDeleteDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mutationMocks.updateFunder).toHaveBeenCalledWith(
        expect.objectContaining({ website: "https://updated.acme.org" }),
      );
      expect(mutationMocks.updateContact).toHaveBeenCalledWith({
        contactId: "contact-1",
        data: {
          name: "Jane Q. Officer",
          title: "Senior Officer",
          email: "jane.q@acme.org",
        },
      });
      expect(mutationMocks.deleteContact).toHaveBeenCalledWith("contact-1");
      expect(mutationMocks.deleteFunder).toHaveBeenCalled();
    });
  });

  it("allows clearing nullable funder contact fields while keeping the name", async () => {
    routeState.params = { funderId: "funder-fallback-title" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-fallback-title",
        name: "Fallback Title Funder",
        website: null,
        contacts: [{ id: "contact-fallback", name: "Sam Contact", title: null, email: null }],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit contact Sam Contact" }));
    expect(mutationMocks.updateContact).not.toHaveBeenCalled();

    const contactCard = screen.getByText("Sam Contact", { selector: "p" }).closest("div");
    expect(contactCard).not.toBeNull();
    const card = contactCard as HTMLElement;

    fireEvent.change(within(card).getByPlaceholderText("Full name"), {
      target: { value: "Sam Contact" },
    });
    fireEvent.change(within(card).getByPlaceholderText("e.g. Program Officer"), {
      target: { value: "   " },
    });
    fireEvent.change(within(card).getByPlaceholderText("name@example.org"), {
      target: { value: "   " },
    });
    fireEvent.submit(within(card).getByRole("button", { name: "Save contact" }).closest("form")!);

    await waitFor(() => {
      expect(mutationMocks.updateContact).toHaveBeenCalledWith({
        contactId: "contact-fallback",
        data: {
          name: "Sam Contact",
          title: null,
          email: null,
        },
      });
    });
  });

  it("submits a blank funder website as null", async () => {
    routeState.params = { funderId: "funder-blank-website" };
    mockUseFunder.mockReturnValue({
      data: {
        id: "funder-blank-website",
        name: "Blank Website Funder",
        website: "https://example.org",
        contacts: [],
        grants: [],
      },
    });

    render(<FunderDetailPage />);

    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "   " },
    });
    submitButtonForm("Save changes");

    await waitFor(() => {
      expect(mutationMocks.updateFunder).toHaveBeenCalledWith(
        expect.objectContaining({ website: null }),
      );
    });
  });
});
