import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockNavigate,
  mockOutlet,
  mockParams,
  mockUsePortalAuth,
  mockUsePortalBundle,
  mockUsePortalDocument,
  mockUsePortalFund,
  mockUsePortalGeneratedReport,
  mockUsePortalGrant,
  mockUsePortalProgram,
  mockUsePortalRestrictionTerm,
  mockUsePortalSession,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockOutlet: vi.fn(() => <div>Portal child route</div>),
  mockParams: vi.fn(() => ({ id: "record-1", token: "token-1" })),
  mockUsePortalAuth: vi.fn(),
  mockUsePortalBundle: vi.fn(),
  mockUsePortalDocument: vi.fn(),
  mockUsePortalFund: vi.fn(),
  mockUsePortalGeneratedReport: vi.fn(),
  mockUsePortalGrant: vi.fn(),
  mockUsePortalProgram: vi.fn(),
  mockUsePortalRestrictionTerm: vi.fn(),
  mockUsePortalSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: mockParams,
  }),
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    let href = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value);
      }
    }
    return React.createElement("a", { href, className }, children);
  },
  Outlet: () => mockOutlet(),
  useNavigate: () => mockNavigate,
}));

vi.mock("../hooks/use-portal-session", () => ({
  daysUntilExpiry: (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  },
  portalDocumentDownloadUrl: (documentId: string) =>
    `/api/public/portal/documents/${documentId}/download`,
  portalGeneratedReportDownloadUrl: (reportId: string) =>
    `/api/public/portal/generated-reports/${reportId}/download`,
  usePortalAuth: () => mockUsePortalAuth(),
  usePortalBundle: (id: string) => mockUsePortalBundle(id),
  usePortalDocument: (id: string) => mockUsePortalDocument(id),
  usePortalFund: (id: string) => mockUsePortalFund(id),
  usePortalGeneratedReport: (id: string) => mockUsePortalGeneratedReport(id),
  usePortalGrant: (id: string) => mockUsePortalGrant(id),
  usePortalProgram: (id: string) => mockUsePortalProgram(id),
  usePortalRestrictionTerm: (id: string) => mockUsePortalRestrictionTerm(id),
  usePortalSession: () => mockUsePortalSession(),
}));

import { PortalIndexRedirect, Route as PortalRoute } from "./portal";
import { PortalIndexPage } from "./portal/index";
import { PortalHomePage } from "./portal/home";
import { PortalTokenPage } from "./portal/$token";
import { PortalGrantPage } from "./portal/grants.$id";
import { PortalFundPage } from "./portal/funds.$id";
import { PortalDocumentPage } from "./portal/documents.$id";
import { PortalBundlePage } from "./portal/bundles.$id";
import { PortalGeneratedReportPage } from "./portal/generated-reports.$id";
import { PortalProgramPage } from "./portal/programs.$id";
import { PortalRestrictionTermPage } from "./portal/restriction-terms.$id";

const PortalLayout = (PortalRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

const portalData = {
  reviewer: {
    id: "reviewer-1",
    email: "auditor@example.com",
    name: "Avery Auditor",
    reviewerType: "auditor",
  },
  session: {
    id: "session-1",
    purpose: "Annual compliance review",
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    orgId: "org-1",
  },
  scopes: [
    {
      id: "scope-1",
      sessionId: "session-1",
      scopeType: "grant",
      scopeId: "grant-123456789",
      scopeName: "Annual Operating Grant",
    },
    {
      id: "scope-2",
      sessionId: "session-1",
      scopeType: "evidence_bundle",
      scopeId: "bundle-123456789",
      scopeName: "Audit Evidence Bundle",
    },
    {
      id: "scope-3",
      sessionId: "session-1",
      scopeType: "generated_report",
      scopeId: "report-123456789",
      scopeName: "Q4 Compliance Report",
    },
  ],
};

describe("public portal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.mockReturnValue({ id: "record-1", token: "token-1" });
    mockUsePortalSession.mockReturnValue({
      data: portalData,
      isError: false,
      isLoading: false,
      isSuccess: true,
    });
  });

  it("renders the portal layout identity banner, expiry warning, outlet, and footer", () => {
    render(<PortalLayout />);

    expect(screen.getByText("Verified access")).toBeInTheDocument();
    expect(screen.getByText("Avery Auditor")).toBeInTheDocument();
    expect(screen.getByText(/Access expires in 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Your access expires in 2 days/)).toBeInTheDocument();
    expect(screen.getByText("Portal child route")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GrantPipe" })).toHaveAttribute(
      "href",
      "https://grantpipe.com",
    );
  });

  it("renders the portal layout without reviewer or expiry metadata", () => {
    mockUsePortalSession.mockReturnValue({
      data: { session: undefined, reviewer: undefined, scopes: [] },
      isError: false,
      isLoading: false,
      isSuccess: true,
    });

    render(<PortalLayout />);

    expect(screen.queryByText("Verified access")).not.toBeInTheDocument();
    expect(screen.queryByText(/Access expires/)).not.toBeInTheDocument();
    expect(screen.getByText("Portal child route")).toBeInTheDocument();
  });

  it("shows the portal index loading and empty-session states", () => {
    mockUsePortalSession.mockReturnValue({ isLoading: true, isSuccess: false });
    const { rerender } = render(<PortalIndexPage />);

    expect(screen.getByText(/^Loading/)).toBeInTheDocument();

    mockUsePortalSession.mockReturnValue({ isLoading: false, isSuccess: false });
    rerender(<PortalIndexPage />);

    expect(screen.getByText("No active portal session.")).toBeInTheDocument();
    expect(screen.getByText(/Open the secure link/)).toBeInTheDocument();
  });

  it("redirects the portal index to home when a session exists", async () => {
    render(<PortalIndexPage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal/home", replace: true });
    });
  });

  it("covers the internal portal index redirect loading and empty-session states", async () => {
    mockUsePortalSession.mockReturnValue({ isLoading: true, isSuccess: false });
    const { rerender } = render(<PortalIndexRedirect />);

    expect(screen.getByText(/^Loading/)).toBeInTheDocument();

    mockUsePortalSession.mockReturnValue({ isLoading: false, isSuccess: true });
    rerender(<PortalIndexRedirect />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal/home" });
    });

    mockUsePortalSession.mockReturnValue({ isLoading: false, isSuccess: false });
    rerender(<PortalIndexRedirect />);

    expect(screen.getByText("No active portal session.")).toBeInTheDocument();
    expect(screen.getByText(/Open the portal link/)).toBeInTheDocument();
  });

  it("renders grouped portal home scopes and redirects when the session errors", async () => {
    const { rerender } = render(<PortalHomePage />);

    expect(screen.getByRole("heading", { name: "Welcome, Avery Auditor" })).toBeInTheDocument();
    expect(screen.getByText("Review purpose: Annual compliance review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grants" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence Bundles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generated Reports" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Annual Operating Grant/ })).toHaveAttribute(
      "href",
      "/portal/grants/grant-123456789",
    );
    expect(screen.getByRole("link", { name: /Q4 Compliance Report/ })).toHaveAttribute(
      "href",
      "/portal/generated-reports/report-123456789",
    );

    mockUsePortalSession.mockReturnValue({ isError: true, isLoading: false });
    rerender(<PortalHomePage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal" });
    });
  });

  it("renders the portal home empty-materials state", () => {
    mockUsePortalSession.mockReturnValue({
      data: { ...portalData, scopes: [] },
      isError: false,
      isLoading: false,
    });

    render(<PortalHomePage />);

    expect(screen.getByText("No materials available yet")).toBeInTheDocument();
  });

  it("renders portal home loading, null-data, and unknown-scope fallback states", () => {
    mockUsePortalSession.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalHomePage />);

    expect(screen.getAllByText(/^Loading your review materials/).length).toBeGreaterThan(0);

    mockUsePortalSession.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });
    rerender(<PortalHomePage />);

    expect(screen.queryByText(/^Loading your review materials/)).not.toBeInTheDocument();

    mockUsePortalSession.mockReturnValue({
      data: {
        ...portalData,
        session: { ...portalData.session, purpose: "" },
        scopes: [
          {
            id: "scope-unknown",
            sessionId: "session-1",
            scopeType: "subaward",
            scopeId: "subaward-123456789",
          },
        ],
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalHomePage />);

    expect(screen.queryByText(/Review purpose:/)).not.toBeInTheDocument();
    // Unmapped scope types render a disabled "coming soon" card instead of a
    // broken link (see getScopeRoute in routes/portal/home.tsx).
    expect(screen.queryByRole("link", { name: /Subaward #subaward/ })).not.toBeInTheDocument();
    const disabledCard = screen.getByTestId("portal-scope-disabled-subaward");
    expect(disabledCard).toBeInTheDocument();
    expect(disabledCard.textContent ?? "").toMatch(/Subaward/);
    // The meaningless truncated UUID is no longer shown; a scope with no
    // resolved name falls back to the humanized type alone.
    expect(disabledCard.textContent ?? "").not.toMatch(/#subaward/);
    expect(disabledCard.textContent ?? "").toMatch(/Coming soon/);
  });

  it("exchanges a portal token and navigates home", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(portalData);
    mockUsePortalAuth.mockReturnValue({ authenticate: { mutateAsync } });

    render(<PortalTokenPage />);

    expect(screen.getByText(/^Verifying your access link/)).toBeInTheDocument();
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("token-1");
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal/home", replace: true });
    });
  });

  it("does not exchange the same single-use token again after an auth hook rerender", async () => {
    const firstMutateAsync = vi.fn().mockResolvedValue(portalData);
    const secondMutateAsync = vi.fn().mockResolvedValue(portalData);
    mockUsePortalAuth.mockReturnValue({
      authenticate: { mutateAsync: firstMutateAsync },
    });

    const { rerender } = render(<PortalTokenPage />);

    await waitFor(() => {
      expect(firstMutateAsync).toHaveBeenCalledOnce();
    });

    mockUsePortalAuth.mockReturnValue({
      authenticate: { mutateAsync: secondMutateAsync },
    });
    rerender(<PortalTokenPage />);

    await waitFor(() => {
      expect(firstMutateAsync).toHaveBeenCalledOnce();
      expect(secondMutateAsync).not.toHaveBeenCalled();
    });
  });

  it("shows token exchange errors", async () => {
    mockUsePortalAuth.mockReturnValue({
      authenticate: { mutateAsync: vi.fn().mockRejectedValue(new Error("Expired link")) },
    });

    render(<PortalTokenPage />);

    expect(await screen.findByText("Access link invalid")).toBeInTheDocument();
    expect(screen.getByText("Expired link")).toBeInTheDocument();
  });

  it("shows the safe fallback when token exchange rejects with a non-Error value", async () => {
    mockUsePortalAuth.mockReturnValue({
      authenticate: { mutateAsync: vi.fn().mockRejectedValue("expired") },
    });

    render(<PortalTokenPage />);

    expect(await screen.findByText("Access link invalid")).toBeInTheDocument();
    expect(screen.getByText("Invalid or expired portal link.")).toBeInTheDocument();
  });

  it("renders fund loading state", () => {
    mockUsePortalFund.mockReturnValue({ isLoading: true });
    render(<PortalFundPage />);
    expect(screen.getByText(/^Loading fund/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders grant loading, error, and data states", () => {
    mockUsePortalGrant.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalGrantPage />);
    expect(screen.getByText(/^Loading grant/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    mockUsePortalGrant.mockReturnValue({
      error: new Error("Grant blocked"),
      isError: true,
      isLoading: false,
    });
    rerender(<PortalGrantPage />);
    expect(screen.getByText("Unable to load grant")).toBeInTheDocument();
    expect(screen.getByText("Grant blocked")).toBeInTheDocument();

    mockUsePortalGrant.mockReturnValue({
      data: {
        amountCents: 125000,
        applicationDeadline: "2026-06-15T00:00:00.000Z",
        description: "Grant description",
        endDate: "2026-12-31T00:00:00.000Z",
        name: "Literacy Expansion",
        notes: "Board approved",
        startDate: "2026-01-01T00:00:00.000Z",
        status: "in_progress",
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalGrantPage />);

    expect(mockUsePortalGrant).toHaveBeenLastCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "Literacy Expansion" })).toBeInTheDocument();
    expect(screen.getByText("$1,250.00")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Grant description")).toBeInTheDocument();
    expect(screen.getByText("Board approved")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();
    expect(screen.getByText("Jun 15, 2026")).toBeInTheDocument();
  });

  it("renders fund data from the raw fund row (type column, no balance fields)", () => {
    mockUsePortalFund.mockReturnValue({
      data: {
        description: "Restricted fund",
        type: "temporarily_restricted",
        name: "Scholarship Fund",
      },
      isError: false,
      isLoading: false,
    });

    render(<PortalFundPage />);

    expect(mockUsePortalFund).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "Scholarship Fund" })).toBeInTheDocument();
    expect(screen.getByText("Temporarily Restricted")).toBeInTheDocument();
    expect(screen.queryByText("Balance")).not.toBeInTheDocument();
    expect(screen.queryByText("Initial balance")).not.toBeInTheDocument();
  });

  it("renders document data and download link", () => {
    mockUsePortalDocument.mockReturnValue({
      data: {
        description: "Signed award letter",
        fileSizeBytes: 2048,
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      isError: false,
      isLoading: false,
    });

    render(<PortalDocumentPage />);

    expect(mockUsePortalDocument).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "award.pdf" })).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/public/portal/documents/record-1/download",
    );
  });

  it("renders bundle data with sorted item links and empty bundle state", () => {
    mockUsePortalBundle.mockReturnValue({
      data: {
        bundle: {
          description: "Evidence package",
          periodEnd: "2026-03-31T00:00:00.000Z",
          periodStart: "2026-01-01T00:00:00.000Z",
          purpose: "quarterly_report",
          title: "Q1 Evidence",
        },
        items: [
          {
            id: "item-2",
            itemId: "grant-222222222",
            itemType: "grant",
            sortOrder: 2,
          },
          {
            caption: "Budget PDF",
            id: "item-1",
            itemId: "doc-111111111",
            itemType: "document",
            sortOrder: 1,
          },
          {
            id: "item-3",
            itemId: "report-333333333",
            itemType: "generated_report",
            sortOrder: 3,
          },
        ],
      },
      isError: false,
      isLoading: false,
    });
    const { rerender } = render(<PortalBundlePage />);

    expect(mockUsePortalBundle).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "Q1 Evidence" })).toBeInTheDocument();
    expect(screen.getByText("Quarterly Report")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent?.includes("Jan 1, 2026") === true &&
          element.textContent.includes("Mar 31, 2026"),
      ).length,
    ).toBeGreaterThan(0);
    const links = screen.getAllByRole("link");
    expect(links[1]).toHaveAttribute("href", "/portal/documents/doc-111111111");
    expect(links[2]).toHaveAttribute("href", "/portal/grants/grant-222222222");
    expect(links[3]).toHaveAttribute("href", "/portal/generated-reports/report-333333333");

    mockUsePortalBundle.mockReturnValue({
      data: { bundle: { title: "Empty Bundle" }, items: [] },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);
    expect(screen.getByText("This bundle has no items.")).toBeInTheDocument();
  });

  it("renders bundle loading, error, raw bundle, and unknown item fallback states", () => {
    mockUsePortalBundle.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalBundlePage />);

    expect(screen.getByText(/^Loading bundle/)).toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      error: new Error("Bundle blocked"),
      isError: true,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.getByText("Unable to load bundle")).toBeInTheDocument();
    expect(screen.getByText("Bundle blocked")).toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      error: "blocked",
      isError: true,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.queryByText("Unable to load bundle")).not.toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      data: {
        description: "Raw bundle description",
        title: "Raw Bundle",
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.getByRole("heading", { name: "Raw Bundle" })).toBeInTheDocument();
    expect(screen.getByText("Raw bundle description")).toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      data: {
        bundle: {
          title: "No Items Bundle",
        },
        items: undefined,
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.getByRole("heading", { name: "No Items Bundle" })).toBeInTheDocument();
    expect(screen.getByText("This bundle has no items.")).toBeInTheDocument();

    mockUsePortalBundle.mockReturnValue({
      data: {
        bundle: {
          title: undefined,
        },
        items: [
          {
            id: "item-unknown",
            itemId: "sub-444444444",
            itemType: "subrecipient",
            sortOrder: 1,
          },
        ],
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalBundlePage />);

    expect(screen.getByRole("heading", { name: "Evidence bundle" })).toBeInTheDocument();
    expect(screen.getByTestId("portal-bundle-item-disabled-subrecipient")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Subrecipient/ })).not.toBeInTheDocument();
  });

  it("renders generated report data from the portal API", () => {
    mockUsePortalGeneratedReport.mockReturnValue({
      data: {
        description: "Board-ready summary",
        fileSizeBytes: 2048,
        fileName: "may-compliance.pdf",
        format: "pdf",
        generatedAt: "2026-05-20T15:30:00.000Z",
        status: "ready",
        title: "May Compliance Report",
        type: "board_report",
      },
      isError: false,
      isLoading: false,
    });

    render(<PortalGeneratedReportPage />);

    expect(mockUsePortalGeneratedReport).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "May Compliance Report" })).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Pdf")).toBeInTheDocument();
    expect(screen.getByText("Board Report")).toBeInTheDocument();
    expect(screen.getByText("Board-ready summary")).toBeInTheDocument();
    expect(screen.getByText("May 20, 2026")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByText("may-compliance.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/public/portal/generated-reports/record-1/download",
    );
  });

  it("renders generated report loading and error states", () => {
    mockUsePortalGeneratedReport.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalGeneratedReportPage />);

    expect(screen.getByText(/^Loading report/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    mockUsePortalGeneratedReport.mockReturnValue({
      error: new Error("Report blocked"),
      isError: true,
      isLoading: false,
    });
    rerender(<PortalGeneratedReportPage />);

    expect(screen.getByText("Unable to load report")).toBeInTheDocument();
    expect(screen.getByText("Report blocked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/portal/home",
    );
  });

  it("renders generated report fallback and omitted metadata states", () => {
    mockUsePortalGeneratedReport.mockReturnValue({
      data: {
        createdAt: "2026-05-19T10:00:00.000Z",
        fileSizeBytes: 512,
        name: "Fallback Report Name",
      },
      isError: false,
      isLoading: false,
    });
    const { rerender } = render(<PortalGeneratedReportPage />);

    expect(screen.getByRole("heading", { name: "Fallback Report Name" })).toBeInTheDocument();
    expect(screen.getByText("May 19, 2026")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.queryByText("Format")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();

    mockUsePortalGeneratedReport.mockReturnValue({
      data: {
        fileSizeBytes: "unknown",
        generatedAt: "",
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalGeneratedReportPage />);

    expect(screen.getByRole("heading", { name: "Generated report" })).toBeInTheDocument();
    expect(screen.queryByText("Generated")).not.toBeInTheDocument();
    expect(screen.queryByText("File size")).not.toBeInTheDocument();

    mockUsePortalGeneratedReport.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });
    rerender(<PortalGeneratedReportPage />);

    expect(screen.queryByRole("heading", { name: "Generated report" })).not.toBeInTheDocument();

    mockUsePortalGeneratedReport.mockReturnValue({
      error: "blocked",
      isError: true,
      isLoading: false,
    });
    rerender(<PortalGeneratedReportPage />);

    expect(screen.getByText("You may not have access to this report.")).toBeInTheDocument();
  });

  it("renders program data with status, code, and description", () => {
    mockUsePortalProgram.mockReturnValue({
      data: {
        code: "PRG-100",
        description: "After-school literacy program",
        name: "Literacy Program",
        status: "active",
      },
      isError: false,
      isLoading: false,
    });

    render(<PortalProgramPage />);

    expect(mockUsePortalProgram).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "Literacy Program" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("PRG-100")).toBeInTheDocument();
    expect(screen.getByText("After-school literacy program")).toBeInTheDocument();
  });

  it("renders program loading, error, fallback, and null states", () => {
    mockUsePortalProgram.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalProgramPage />);
    expect(screen.getByText(/^Loading program/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    mockUsePortalProgram.mockReturnValue({
      error: new Error("Program blocked"),
      isError: true,
      isLoading: false,
    });
    rerender(<PortalProgramPage />);
    expect(screen.getByText("Unable to load program")).toBeInTheDocument();
    expect(screen.getByText("Program blocked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/portal/home",
    );

    mockUsePortalProgram.mockReturnValue({ error: "blocked", isError: true, isLoading: false });
    rerender(<PortalProgramPage />);
    expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();

    mockUsePortalProgram.mockReturnValue({ data: {}, isError: false, isLoading: false });
    rerender(<PortalProgramPage />);
    expect(screen.getByRole("heading", { name: "Program" })).toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();

    mockUsePortalProgram.mockReturnValue({ data: undefined, isError: false, isLoading: false });
    rerender(<PortalProgramPage />);
    expect(screen.queryByRole("heading", { name: "Program" })).not.toBeInTheDocument();
  });

  it("renders restriction term data with money, dates, and detail sections", () => {
    mockUsePortalRestrictionTerm.mockReturnValue({
      data: {
        beginningBalanceCents: 250000,
        currency: "USD",
        endDate: "2026-12-31T00:00:00.000Z",
        evidenceRequirement: "Quarterly expenditure report",
        purposeStatement: "Restricted to scholarships",
        releaseRule: "Released as scholarships are awarded",
        restrictionType: "time_restriction",
        source: "grant_agreement",
        startDate: "2026-01-01T00:00:00.000Z",
        title: "Scholarship Restriction",
      },
      isError: false,
      isLoading: false,
    });

    render(<PortalRestrictionTermPage />);

    expect(mockUsePortalRestrictionTerm).toHaveBeenCalledWith("record-1");
    expect(screen.getByRole("heading", { name: "Scholarship Restriction" })).toBeInTheDocument();
    expect(screen.getByText("Time Restriction")).toBeInTheDocument();
    expect(screen.getByText("Grant Agreement")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();
    expect(screen.getByText("Restricted to scholarships")).toBeInTheDocument();
    expect(screen.getByText("Released as scholarships are awarded")).toBeInTheDocument();
    expect(screen.getByText("Quarterly expenditure report")).toBeInTheDocument();
  });

  it("renders restriction term loading, error, fallback, and minimal states", () => {
    mockUsePortalRestrictionTerm.mockReturnValue({ isLoading: true });
    const { rerender } = render(<PortalRestrictionTermPage />);
    expect(screen.getByText(/^Loading restriction/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    mockUsePortalRestrictionTerm.mockReturnValue({
      error: new Error("Restriction blocked"),
      isError: true,
      isLoading: false,
    });
    rerender(<PortalRestrictionTermPage />);
    expect(screen.getByText("Unable to load restriction")).toBeInTheDocument();
    expect(screen.getByText("Restriction blocked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/portal/home",
    );

    mockUsePortalRestrictionTerm.mockReturnValue({
      error: "blocked",
      isError: true,
      isLoading: false,
    });
    rerender(<PortalRestrictionTermPage />);
    expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();

    mockUsePortalRestrictionTerm.mockReturnValue({
      data: {
        beginningBalanceCents: null,
        currency: 42,
        endDate: "",
        restrictionType: 7,
        source: null,
        startDate: 0,
        title: null,
      },
      isError: false,
      isLoading: false,
    });
    rerender(<PortalRestrictionTermPage />);
    expect(screen.getByRole("heading", { name: "Restriction term" })).toBeInTheDocument();
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Beginning balance")).not.toBeInTheDocument();
    expect(screen.queryByText("Start date")).not.toBeInTheDocument();
    expect(screen.queryByText("Purpose")).not.toBeInTheDocument();

    mockUsePortalRestrictionTerm.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });
    rerender(<PortalRestrictionTermPage />);
    expect(screen.queryByRole("heading", { name: "Restriction term" })).not.toBeInTheDocument();
  });
});
