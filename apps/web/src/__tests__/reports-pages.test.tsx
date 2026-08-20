import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const TabsCtx = React.createContext<{
  active: string;
  setActive: (v: string) => void;
}>({ active: "", setActive: () => {} });

const routeState = vi.hoisted(() => ({
  params: { reportId: "report-1" },
}));

const mockUseGrants = vi.fn();
const mockUseReportArtifacts = vi.fn();
const mockUseReportArtifact = vi.fn();
const mockUseReportPreview = vi.fn();
const mockUseSefaTripwire = vi.fn();
const mockUseGenerateGrantComplianceReport = vi.fn();
const mockUseGenerateAuditReport = vi.fn();
const mockUseGenerateSefaReport = vi.fn();
const mockUseGenerateIrs990Report = vi.fn();
const mockUseGenerateBoardReport = vi.fn();
const mockUseGenerateAcknowledgmentLetter = vi.fn();
const mockUseGenerateDonorYearEndStatementRun = vi.fn();
const mockUseAcknowledgmentTemplate = vi.fn();
const mockUseUpdateAcknowledgmentTemplate = vi.fn();
const mockUseOrgBilling = vi.fn();
const mockUseGenerateRestrictedRollforward = vi.fn();

vi.mock("../components/shell/page-tabs", () => ({
  AppPageTabs: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => routeState.params,
  }),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => {
    const href =
      to && params
        ? Object.entries(params).reduce(
            (current, [key, value]) => current.replace(`$${key}`, value),
            to,
          )
        : to;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../hooks/use-grants", () => ({
  useGrants: (...args: unknown[]) => mockUseGrants(...args),
}));

vi.mock("../hooks/use-reports", () => ({
  useReportGrantOptions: () => ({
    data: [
      { id: "grant-1", name: "Grant 1" },
      { id: "grant-2", name: "Grant 2" },
    ],
    isLoading: false,
    isError: false,
  }),
  useReportArtifacts: (...args: unknown[]) => mockUseReportArtifacts(...args),
  useReportArtifact: (...args: unknown[]) => mockUseReportArtifact(...args),
  useReportPreview: (...args: unknown[]) => mockUseReportPreview(...args),
  useSefaTripwire: (...args: unknown[]) => mockUseSefaTripwire(...args),
  useGenerateGrantComplianceReport: (...args: unknown[]) =>
    mockUseGenerateGrantComplianceReport(...args),
  useGenerateAuditReport: (...args: unknown[]) => mockUseGenerateAuditReport(...args),
  useGenerateSefaReport: (...args: unknown[]) => mockUseGenerateSefaReport(...args),
  useGenerateIrs990Report: (...args: unknown[]) => mockUseGenerateIrs990Report(...args),
  useGenerateBoardReport: (...args: unknown[]) => mockUseGenerateBoardReport(...args),
  useGenerateAcknowledgmentLetter: (...args: unknown[]) =>
    mockUseGenerateAcknowledgmentLetter(...args),
  useGenerateDonorYearEndStatementRun: (...args: unknown[]) =>
    mockUseGenerateDonorYearEndStatementRun(...args),
  useAcknowledgmentTemplate: (...args: unknown[]) => mockUseAcknowledgmentTemplate(...args),
  useUpdateAcknowledgmentTemplate: (...args: unknown[]) =>
    mockUseUpdateAcknowledgmentTemplate(...args),
}));

vi.mock("../hooks/use-org-settings", () => ({
  useOrgBilling: (...args: unknown[]) => mockUseOrgBilling(...args),
}));

vi.mock("../hooks/use-restrictions", () => ({
  useGenerateRestrictedRollforward: (...args: unknown[]) =>
    mockUseGenerateRestrictedRollforward(...args),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => ({ memberRole: "admin", orgId: "org-1", isLoading: false }),
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

vi.mock("../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: () => React.createElement("div", { "data-testid": "quick-share-sheet" }),
}));

vi.mock("@grantpipe/ui", () => {
  return {
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
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
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
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label htmlFor={htmlFor}>{children}</label>
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
        {description ? <p data-slot="page-header-description">{description}</p> : null}
        {actions ? <div>{actions}</div> : null}
      </div>
    ),
    PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div
        data-slot="page-shell"
        className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}
      >
        {children}
      </div>
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
    Skeleton: ({ className }: { className?: string }) => (
      <div data-slot="skeleton" className={className} />
    ),
    Tabs: ({
      children,
      className,
      defaultValue,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      defaultValue?: string;
    }) => {
      const [active, setActive] = React.useState(defaultValue ?? "");
      return (
        <TabsCtx.Provider value={{ active, setActive }}>
          <div data-slot="tabs" className={className} {...props}>
            {children}
          </div>
        </TabsCtx.Provider>
      );
    },
    TabsContent: ({
      children,
      className,
      value,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      value?: string;
    }) => {
      const { active } = React.useContext(TabsCtx);
      if (active !== value) return null;
      return (
        <div className={className} {...props}>
          {children}
        </div>
      );
    },
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
      value,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      children: React.ReactNode;
      value?: string;
    }) => {
      const { setActive } = React.useContext(TabsCtx);
      return (
        <button
          type="button"
          className={className}
          value={value}
          onClick={() => setActive(value ?? "")}
          {...props}
        >
          {children}
        </button>
      );
    },
    Checkbox: ({
      id,
      "aria-label": ariaLabel,
      className,
      checked,
      onCheckedChange,
    }: {
      id?: string;
      "aria-label"?: string;
      className?: string;
      checked?: boolean | "indeterminate";
      onCheckedChange?: (checked: boolean | "indeterminate") => void;
    }) => (
      <input
        type="checkbox"
        id={id}
        aria-label={ariaLabel}
        className={className}
        checked={checked === true}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
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
  };
});

import { Route as ReportDetailRoute } from "../routes/_authenticated/reports/$reportId";
import { ReportsPage } from "../routes/_authenticated/reports/index";

const ReportDetailPage = (ReportDetailRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

describe("ReportsPage", () => {
  beforeEach(() => {
    mockUseReportArtifacts.mockReset();
    mockUseSefaTripwire.mockReset();
    mockUseGenerateGrantComplianceReport.mockReset();
    mockUseGenerateAuditReport.mockReset();
    mockUseGenerateSefaReport.mockReset();
    mockUseGenerateIrs990Report.mockReset();
    mockUseGenerateBoardReport.mockReset();
    mockUseGenerateAcknowledgmentLetter.mockReset();
    mockUseGenerateDonorYearEndStatementRun.mockReset();
    mockUseGenerateRestrictedRollforward.mockReset();
    mockUseAcknowledgmentTemplate.mockReset();
    mockUseUpdateAcknowledgmentTemplate.mockReset();
    mockUseOrgBilling.mockReset();

    mockUseGrants.mockReturnValue({
      data: {
        data: [
          { id: "grant-1", name: "Q1 STEM Expansion" },
          { id: "grant-2", name: "Community Impact" },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });
    mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Q1 Compliance Report",
            type: "compliance",
            status: "ready",
            createdAt: "2026-04-07T20:00:00.000Z",
            downloadPath: "/api/compliance/reports/report-1/download",
          },
        ],
      },
    });
    mockUseSefaTripwire.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      error: null,
    });
    mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      reset: vi.fn(),
    });
    mockUseGenerateAuditReport.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseGenerateSefaReport.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      isError: false,
      error: null,
    });
    mockUseGenerateIrs990Report.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseGenerateBoardReport.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseGenerateAcknowledgmentLetter.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      reset: vi.fn(),
    });
    mockUseGenerateDonorYearEndStatementRun.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    mockUseGenerateRestrictedRollforward.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      reset: vi.fn(),
      isPending: false,
      isError: false,
    });
    mockUseAcknowledgmentTemplate.mockReturnValue({
      data: {
        intro: "Intro copy",
        body: "Body copy",
        closing: "Closing copy",
      },
    });
    mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
    });
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        status: "active",
        trialEndsAt: null,
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders report history and generation actions", () => {
    render(<ReportsPage />);

    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Q1 Compliance Report")).toBeInTheDocument();
    expect(screen.getByLabelText("Grant")).toHaveValue("");
    expect(screen.getByLabelText("Donation reference")).toHaveValue("");
    expect(screen.queryByLabelText("Donation ID")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate audit export" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate IRS 990 prep export" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate board report" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate acknowledgment letter" })).toBeDisabled();
  });

  it("renders structured report workbench sections with fiscal year inputs before export actions", () => {
    render(<ReportsPage />);

    expect(screen.getByText("Grant compliance")).toBeInTheDocument();
    expect(screen.getByText("Financial exports")).toBeInTheDocument();
    expect(screen.getByText("Donation acknowledgments")).toBeInTheDocument();
    expect(screen.getByText("Recently generated")).toBeInTheDocument();

    const auditLabel = screen.getByLabelText("Audit fiscal year");
    const auditButton = screen.getByRole("button", { name: "Generate audit export" });
    const irsLabel = screen.getByLabelText("IRS 990 fiscal year");
    const irsButton = screen.getByRole("button", { name: "Generate IRS 990 prep export" });
    const boardLabel = screen.getByLabelText("Board fiscal year");
    const boardButton = screen.getByRole("button", { name: "Generate board report" });

    expect(auditLabel.compareDocumentPosition(auditButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(irsLabel.compareDocumentPosition(irsButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(boardLabel.compareDocumentPosition(boardButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("submits each generator action and updates template copy", async () => {
    const grantMutation = { mutateAsync: vi.fn().mockResolvedValue({}), reset: vi.fn() };
    const auditMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const sefaMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const irsMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const boardMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const ackMutation = { mutateAsync: vi.fn().mockResolvedValue({}), reset: vi.fn() };
    const templateMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };

    mockUseGenerateGrantComplianceReport.mockReturnValue(grantMutation);
    mockUseGenerateAuditReport.mockReturnValue(auditMutation);
    mockUseGenerateSefaReport.mockReturnValue(sefaMutation);
    mockUseGenerateIrs990Report.mockReturnValue(irsMutation);
    mockUseGenerateBoardReport.mockReturnValue(boardMutation);
    mockUseGenerateAcknowledgmentLetter.mockReturnValue(ackMutation);
    mockUseUpdateAcknowledgmentTemplate.mockReturnValue(templateMutation);

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Grant"), { target: { value: "grant-2" } });
    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-44" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate audit export" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate IRS 990 prep export" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate board report" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate acknowledgment letter" }));

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Updated intro" },
    });
    fireEvent.change(screen.getByLabelText("Acknowledgment body"), {
      target: { value: "Updated body" },
    });
    fireEvent.change(screen.getByLabelText("Acknowledgment closing"), {
      target: { value: "Updated closing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    await waitFor(() => {
      expect(mockUseGenerateGrantComplianceReport).toHaveBeenLastCalledWith("grant-2");
      expect(mockUseGenerateAcknowledgmentLetter).toHaveBeenLastCalledWith("donation-44");
      expect(grantMutation.mutateAsync).toHaveBeenCalled();
      expect(auditMutation.mutateAsync).toHaveBeenCalled();
      expect(sefaMutation.mutateAsync).not.toHaveBeenCalled();
      expect(irsMutation.mutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2026",
        title: "FY2026 IRS 990 Prep Export",
      });
      expect(boardMutation.mutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2026",
        title: "FY2026 Board Packet",
        cadence: "one_time",
        sections: [
          "executive_snapshot",
          "fundraising",
          "grant_pipeline",
          "fund_balances",
          "compliance_deadlines",
        ],
      });
      expect(ackMutation.mutateAsync).toHaveBeenCalled();
      expect(templateMutation.mutateAsync).toHaveBeenCalledWith({
        intro: "Updated intro",
        body: "Updated body",
        closing: "Updated closing",
      });
    });
  });

  it("selects a grant from the dropdown and enables the compliance button", async () => {
    const grantMutation = { mutateAsync: vi.fn().mockResolvedValue({}), reset: vi.fn() };
    mockUseGenerateGrantComplianceReport.mockReturnValue(grantMutation);

    render(<ReportsPage />);

    expect(screen.queryByLabelText("Grant ID")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Grant"), {
      target: { value: "grant-1" },
    });

    expect(screen.getByLabelText("Grant")).toHaveValue("grant-1");
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeEnabled();
    expect(mockUseGenerateGrantComplianceReport).toHaveBeenLastCalledWith("grant-1");

    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

    await waitFor(() => {
      expect(grantMutation.mutateAsync).toHaveBeenCalledWith({
        title: "Quarterly Compliance Report",
      });
    });
  });

  it("renders the empty history state and allows id inputs to change", () => {
    mockUseReportArtifacts.mockReturnValue({ data: undefined });
    mockUseAcknowledgmentTemplate.mockReturnValue({ data: undefined });

    render(<ReportsPage />);

    expect(screen.getByRole("region", { name: "Your reports live here" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Grant"), { target: { value: "grant-2" } });
    fireEvent.change(screen.getByLabelText("Audit fiscal year"), { target: { value: "FY2027" } });
    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-44" },
    });

    expect(screen.getByLabelText("Grant")).toHaveValue("grant-2");
    expect(screen.getByLabelText("Audit fiscal year")).toHaveValue("FY2027");
    expect(screen.getByLabelText("Donation reference")).toHaveValue("donation-44");
    expect(screen.getByLabelText("Acknowledgment intro")).toHaveValue("");
  });

  it("renders inline mutation errors for failed report generation", async () => {
    mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Grant not found")),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Grant"), { target: { value: "grant-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

    expect(await screen.findByText("Grant not found")).toBeInTheDocument();
  });

  it("clears the grant report error after a successful retry", async () => {
    const grantMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Grant not found"))
      .mockResolvedValueOnce({});

    mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: grantMutation,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Grant"), { target: { value: "grant-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));
    expect(await screen.findByText("Grant not found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

    await waitFor(() => {
      expect(grantMutation).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText("Grant not found")).not.toBeInTheDocument();
  });

  it("renders inline mutation errors when saving the acknowledgment template fails", async () => {
    mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Template save failed")),
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Edited intro copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    expect(await screen.findByText("Template save failed")).toBeInTheDocument();
  });

  it("clears the template save error after editing and after a successful retry", async () => {
    const templateMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Template save failed"))
      .mockResolvedValueOnce({});

    mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: templateMutation,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment body"), {
      target: { value: "First attempt body" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));
    expect(await screen.findByText("Template save failed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Acknowledgment body"), {
      target: { value: "Updated body copy" },
    });

    expect(screen.queryByText("Template save failed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    await waitFor(() => {
      expect(templateMutation).toHaveBeenLastCalledWith({
        intro: "Intro copy",
        body: "Updated body copy",
        closing: "Closing copy",
      });
    });
    expect(screen.queryByText("Template save failed")).not.toBeInTheDocument();
  });

  it("disables template saving while the template query is still loading", () => {
    mockUseAcknowledgmentTemplate.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });

    render(<ReportsPage />);

    expect(screen.getByRole("button", { name: "Save acknowledgment template" })).toBeDisabled();
  });

  it("renders an explicit error state when reports or template queries fail", () => {
    mockUseReportArtifacts.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Unable to load reports"),
    });
    mockUseAcknowledgmentTemplate.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Unable to load template"),
    });

    render(<ReportsPage />);

    expect(screen.getByText("Unable to load reports.")).toBeInTheDocument();
    expect(screen.getByText("Unable to load reports")).toBeInTheDocument();
    expect(screen.getByText("Unable to load template.")).toBeInTheDocument();
    expect(screen.getByText("Unable to load template")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Your reports live here" }),
    ).not.toBeInTheDocument();
  });
});

describe("ReportDetailPage", () => {
  beforeEach(() => {
    mockUseReportArtifact.mockReset();
    mockUseReportPreview.mockReset();
    routeState.params = { reportId: "report-1" };
    mockUseReportArtifact.mockReturnValue({
      data: {
        id: "report-1",
        title: "Q1 Compliance Report",
        type: "compliance",
        format: "pdf",
        status: "ready",
        downloadPath: "/api/compliance/reports/report-1/download",
      },
    });
    mockUseReportPreview.mockReturnValue({
      data: {
        kind: "html",
        title: "Q1 Compliance Report",
        content: "<h1>Q1 Compliance Report</h1><p>Preview body</p>",
      },
    });
  });

  it("renders the report preview and download button", () => {
    const { container } = render(<ReportDetailPage />);

    expect(screen.getAllByRole("heading", { name: "Q1 Compliance Report", level: 1 })).toHaveLength(
      1,
    );
    expect(screen.getByText("Status: Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    const iframe = container.querySelector("iframe[title='Report preview']");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
    expect(iframe).toHaveAttribute("srcDoc", "<h1>Q1 Compliance Report</h1><p>Preview body</p>");
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("renders the report detail header within a PageHeader section", () => {
    const { container } = render(<ReportDetailPage />);

    const header = container.querySelector("[data-slot='page-header']");
    expect(header).toBeInTheDocument();
  });

  it("renders loading states for both the report and its preview", () => {
    mockUseReportArtifact.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockUseReportPreview.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { rerender, container } = render(<ReportDetailPage />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    mockUseReportArtifact.mockReturnValue({
      data: {
        id: "report-1",
        title: "Q1 Compliance Report",
        type: "compliance",
        format: "pdf",
        status: "ready",
        downloadPath: "/api/compliance/reports/report-1/download",
      },
      isLoading: false,
      isError: false,
    });
    mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    rerender(<ReportDetailPage />);

    const iframe = container.querySelector("iframe[title='Report preview']");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("srcDoc", "<p>Loading preview…</p>");
  });

  it("renders an explicit error state when the report query fails", () => {
    mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Generated report not found"),
    });
    mockUseReportPreview.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Generated report not found"),
    });

    render(<ReportDetailPage />);

    expect(screen.getByText("Unable to load report.")).toBeInTheDocument();
    expect(screen.getByText("Generated report not found")).toBeInTheDocument();
  });

  it("renders a generic report error message for non-Error failures", () => {
    mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isError: true,
      error: "unknown",
    });
    mockUseReportPreview.mockReturnValue({
      data: undefined,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.getByText("Unable to load report.")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders an explicit error state when the preview query fails", () => {
    mockUseReportArtifact.mockReturnValue({
      data: {
        id: "report-1",
        title: "Q1 Compliance Report",
        type: "compliance",
        format: "pdf",
        status: "ready",
        downloadPath: "/api/compliance/reports/report-1/download",
      },
    });
    mockUseReportPreview.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Preview generation failed"),
    });

    render(<ReportDetailPage />);

    expect(screen.getByText("Unable to load preview.")).toBeInTheDocument();
    expect(screen.getByText("Preview generation failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Status: Ready")).toBeInTheDocument();
  });

  it("renders a generic preview error message for non-Error failures", () => {
    mockUseReportArtifact.mockReturnValue({
      data: {
        id: "report-1",
        title: "Q1 Compliance Report",
        type: "compliance",
        format: "pdf",
        status: "ready",
        downloadPath: "/api/compliance/reports/report-1/download",
      },
    });
    mockUseReportPreview.mockReturnValue({
      data: undefined,
      isError: true,
      error: "unknown",
    });

    render(<ReportDetailPage />);

    expect(screen.getByText("Unable to load preview.")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });
});
