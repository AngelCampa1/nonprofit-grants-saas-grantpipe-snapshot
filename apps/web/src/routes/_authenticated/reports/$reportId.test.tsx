import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: () => ({ reportId: "rpt-test-1" }),
  })),
  mockUseReportArtifact: vi.fn(),
  mockUseReportPreview: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
  mockRefetch: vi.fn(),
  mockDownloadViaOrgFetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
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
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Tabs: ({
      children,
      defaultValue,
      ...props
    }: {
      children: React.ReactNode;
      defaultValue?: string;
      [k: string]: unknown;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "tabs", "data-value": defaultValue, ...props },
        children,
      ),
    TabsList: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) =>
      React.createElement("div", { role: "tablist", ...props }, children),
    TabsTrigger: ({
      children,
      value,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      [k: string]: unknown;
    }) => React.createElement("button", { role: "tab", "data-value": value, ...props }, children),
    TabsContent: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      [k: string]: unknown;
    }) => React.createElement("div", { role: "tabpanel", ...props }, children),
    Alert: ({
      title,
      variant,
      children,
    }: {
      title?: React.ReactNode;
      variant?: string;
      children?: React.ReactNode;
    }) => (
      <div role="alert" data-slot="alert" data-variant={variant}>
        {title ? <p data-slot="alert-title">{title}</p> : null}
        <div>{children}</div>
      </div>
    ),
    PageHeader: ({
      breadcrumb,
      title,
      description,
      actions,
    }: {
      breadcrumb?: React.ReactNode;
      title: string;
      description?: string;
      actions?: React.ReactNode;
    }) => (
      <div data-slot="page-header">
        {breadcrumb}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions}
      </div>
    ),
    Button: ({
      children,
      asChild,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <button {...props}>{children}</button>,
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
    PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  };
});

vi.mock("../../../hooks/use-reports", () => ({
  useReportArtifact: hoisted.mockUseReportArtifact,
  useReportPreview: hoisted.mockUseReportPreview,
}));

vi.mock("../../../components/entity-activity-section", () => ({
  EntityActivitySection: () => <div data-testid="entity-activity-section" />,
}));

vi.mock("../../../components/entity-documents-section", () => ({
  EntityDocumentsSection: () => <div data-testid="entity-documents-section" />,
}));

vi.mock("../../../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: () => <div data-testid="quick-share-sheet" />,
}));

vi.mock("../../../lib/download", () => ({
  downloadViaOrgFetch: hoisted.mockDownloadViaOrgFetch,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

vi.mock("../../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => hoisted.mockCaptureAppException(...args),
}));

import { Route } from "./$reportId";

const ReportDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const populatedArtifact = {
  title: "Q2 Compliance Report",
  format: "pdf",
  status: "ready",
  downloadPath: "/downloads/q2-report.pdf",
};

describe("ReportDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockRefetch.mockResolvedValue({});
    hoisted.mockDownloadViaOrgFetch.mockResolvedValue(undefined);
    hoisted.mockCaptureEvent.mockClear();
    hoisted.mockCaptureAppException.mockClear();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it("renders route pending and error fallbacks", () => {
    const routeConfig = Route as unknown as {
      pendingComponent: React.ComponentType;
      errorComponent: React.ComponentType<{ error: unknown }>;
    };
    const PendingComponent = routeConfig.pendingComponent;
    const ErrorComponent = routeConfig.errorComponent;
    const { container, rerender } = render(<PendingComponent />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();

    rerender(<ErrorComponent error="route failure" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Unable to load page")).toBeInTheDocument();
    expect(screen.getByText("Unknown error")).toBeInTheDocument();

    rerender(<ErrorComponent error={new Error("boom from route")} />);

    expect(screen.getByText("boom from route")).toBeInTheDocument();
  });

  it("renders loading skeleton while artifact data is loading", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fatal error state
  // ---------------------------------------------------------------------------

  it("renders Alert error state with retry button on fatal error", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Not found"),
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);

    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Unable to load report.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading is false, isError is false, and data is undefined", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hoisted.mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("renders populated report with PageHeader, breadcrumb, tabs, preview section, and sections", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Preview content here</p>" },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);

    // PageHeader heading
    expect(
      screen.getByRole("heading", { level: 1, name: "Q2 Compliance Report" }),
    ).toBeInTheDocument();

    // Breadcrumb
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector("a[href='/reports']")).toBeInTheDocument();
    const currentPage = nav.querySelector("[aria-current='page']");
    expect(currentPage?.textContent).toBe("Q2 Compliance Report");

    // Tabs
    const tabs = screen.getByTestId("tabs");
    expect(tabs).toHaveAttribute("data-value", "preview");
    expect(screen.getByRole("tab", { name: /preview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();

    // Status description
    expect(screen.getByText("Status: Ready")).toBeInTheDocument();

    // Download button (no longer a bare anchor — uses downloadViaOrgFetch)
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();

    // Sections
    expect(screen.getByTestId("entity-activity-section")).toBeInTheDocument();
    expect(screen.getByTestId("entity-documents-section")).toBeInTheDocument();

    // Iframe preview
    const iframe = container.querySelector("iframe[title='Report preview']");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
    expect(iframe).toHaveAttribute("srcDoc", "<p>Preview content here</p>");
    // Uses layout tokens, not arbitrary pixel bounds
    expect(iframe?.className).toContain("min-h-layout-report-min");
    expect(iframe?.className).toContain("max-h-layout-report-max");
    expect(iframe?.className).not.toContain("min-h-[400px]");
    expect(iframe?.className).not.toContain("max-h-[1100px]");

    // No error banner
    expect(container.querySelector("[data-slot='alert']")).not.toBeInTheDocument();
  });

  it("tracks report opening without sending report identifiers or titles", async () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Preview content here</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    await waitFor(() => {
      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_opened", {
        report_format: "pdf",
        report_status: "ready",
      });
    });
    const calls = JSON.stringify(hoisted.mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Q2 Compliance Report");
    expect(calls).not.toContain("rpt-test-1");
    expect(calls).not.toContain("/downloads/q2-report.pdf");
  });

  it("opens the share sheet when the Share button is clicked", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Preview content here</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(screen.getByTestId("quick-share-sheet")).toBeInTheDocument();
  });

  it("tracks report share and download actions with report metadata only", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Preview content here</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_share_started", {
      report_format: "pdf",
      report_status: "ready",
      surface: "report_detail",
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_download_clicked", {
      report_format: "pdf",
      report_status: "ready",
      surface: "report_detail",
    });
    const calls = JSON.stringify(hoisted.mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Q2 Compliance Report");
    expect(calls).not.toContain("rpt-test-1");
    expect(calls).not.toContain("/downloads/q2-report.pdf");
  });

  it("renders loading placeholder in iframe srcDoc while preview is loading", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: { title: "Q2 Report", format: "pdf", status: "ready", downloadPath: "/dl/q2.pdf" },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);
    const iframe = container.querySelector("iframe[title='Report preview']");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("srcDoc", "<p>Loading preview…</p>");
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  });

  it("uses a CSV-specific download label for CSV bundle artifacts", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "IRS 990 Prep Export",
        format: "csv_bundle",
        status: "ready",
        downloadPath: "/dl/irs-990.csv",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>CSV preview</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.getByRole("button", { name: "Download CSV export" })).toBeInTheDocument();
  });

  it("falls back to a generic download label for unknown artifact formats", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "Legacy Export",
        format: "unknown",
        status: "ready",
        downloadPath: "/dl/legacy.dat",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Legacy preview</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.getByRole("button", { name: "Download report" })).toBeInTheDocument();
  });

  it("renders unavailable placeholder in iframe srcDoc when preview content is absent", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: { title: "Q2 Report", format: "pdf", status: "ready", downloadPath: "/dl/q2.pdf" },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ReportDetailPage />);
    const iframe = container.querySelector("iframe[title='Report preview']");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("srcDoc", "<p>Preview unavailable.</p>");
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  });

  it("shows inline Alert error for preview failure without making the page fatal", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Preview generation failed"),
    });

    const { container } = render(<ReportDetailPage />);

    // Page is NOT a fatal error — the title heading still shows
    expect(
      screen.getByRole("heading", { level: 1, name: "Q2 Compliance Report" }),
    ).toBeInTheDocument();

    // Inline preview error
    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Unable to load preview.")).toBeInTheDocument();
    expect(screen.getByText("Preview generation failed")).toBeInTheDocument();
  });

  it("renders generic error message when artifact error is not an Error instance", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "some string error",
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders generic error message when preview error is not an Error instance", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: { title: "My Report", format: "pdf", status: "ready", downloadPath: "/dl/r.pdf" },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: 42,
    });

    const { container } = render(<ReportDetailPage />);
    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("suppresses the download action while a report artifact is still pending", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "Queued Report",
        format: "pdf",
        status: "pending",
        downloadPath: "/dl/pending.pdf",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Pending preview</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    expect(
      screen.getByText("This report is still generating. Download will be ready when it finishes."),
    ).toBeInTheDocument();
  });

  it("suppresses the download action and explains failed artifacts", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "Failed Report",
        format: "pdf",
        status: "failed",
        downloadPath: "/dl/failed.pdf",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    expect(
      screen.getByText("Unable to generate this report. There is nothing to download."),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Preview description text
  // ---------------------------------------------------------------------------

  it("renders the preview description text", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(
      screen.getByText("Check the output here before you share or download it."),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Download via org fetch
  // ---------------------------------------------------------------------------

  it("calls downloadViaOrgFetch with downloadPath and expected fallback filename on click (pdf)", async () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download PDF" });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(hoisted.mockDownloadViaOrgFetch).toHaveBeenCalledWith(
      "/downloads/q2-report.pdf",
      "Q2 Compliance Report.pdf",
    );
  });

  it("calls downloadViaOrgFetch with .csv extension for csv_bundle format", async () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "IRS 990 Prep Export",
        format: "csv_bundle",
        status: "ready",
        downloadPath: "/dl/irs-990.csv",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>CSV preview</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download CSV export" });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(hoisted.mockDownloadViaOrgFetch).toHaveBeenCalledWith(
      "/dl/irs-990.csv",
      "IRS 990 Prep Export.csv",
    );
  });

  it("calls downloadViaOrgFetch with .txt extension for unknown formats", async () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "Legacy Export",
        format: "unknown",
        status: "ready",
        downloadPath: "/dl/legacy.dat",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>Legacy preview</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download report" });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(hoisted.mockDownloadViaOrgFetch).toHaveBeenCalledWith(
      "/dl/legacy.dat",
      "Legacy Export.txt",
    );
  });

  it("disables the button while download is in flight and re-enables after resolve", async () => {
    let resolveDownload!: () => void;
    const deferredPromise = new Promise<void>((resolve) => {
      resolveDownload = resolve;
    });
    hoisted.mockDownloadViaOrgFetch.mockReturnValue(deferredPromise);

    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download PDF" });
    fireEvent.click(btn);

    // During download, button text changes and button is disabled
    expect(await screen.findByRole("button", { name: "Downloading…" })).toBeDisabled();

    // Resolve the download
    await act(async () => {
      resolveDownload();
      await deferredPromise;
    });

    // After resolve, button is re-enabled
    expect(screen.getByRole("button", { name: "Download PDF" })).not.toBeDisabled();
  });

  it("shows an error message when download rejects with an Error", async () => {
    hoisted.mockDownloadViaOrgFetch.mockRejectedValue(new Error("Server returned 403"));

    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download PDF" });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByText("Server returned 403")).toBeInTheDocument();
    expect(hoisted.mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          feature: "reports",
          operation: "download",
          surface: "report_detail",
          report_format: "pdf",
          report_status: "ready",
        },
      }),
      { sanitize: true },
    );
    const calls = JSON.stringify(hoisted.mockCaptureAppException.mock.calls);
    expect(calls).not.toContain("Q2 Compliance Report");
    expect(calls).not.toContain("rpt-test-1");
    expect(calls).not.toContain("/downloads/q2-report.pdf");
  });

  it("shows generic error message when download rejects with a non-Error value", async () => {
    hoisted.mockDownloadViaOrgFetch.mockRejectedValue("something went wrong");

    hoisted.mockUseReportArtifact.mockReturnValue({
      data: populatedArtifact,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    const btn = screen.getByRole("button", { name: "Download PDF" });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByText("Unable to download file.")).toBeInTheDocument();
    expect(screen.getByText("Unable to download file.").closest('[role="alert"]')).not.toBeNull();
  });

  it("does not render the download button when canDownloadArtifact is false", () => {
    hoisted.mockUseReportArtifact.mockReturnValue({
      data: {
        title: "Queued Report",
        format: "pdf",
        status: "pending",
        downloadPath: "/dl/pending.pdf",
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseReportPreview.mockReturnValue({
      data: { content: "<p>content</p>" },
      isLoading: false,
      isError: false,
    });

    render(<ReportDetailPage />);

    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });
});
