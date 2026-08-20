import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultPermissionsForRole } from "@grantpipe/shared";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    component: config.component,
    path,
  })),
  mockUseReportArtifacts: vi.fn(),
  mockUseReportGrantOptions: vi.fn(),
  mockUseAcknowledgmentTemplate: vi.fn(),
  mockUseUpdateAcknowledgmentTemplate: vi.fn(),
  mockUseGenerateGrantComplianceReport: vi.fn(),
  mockUseGenerateAuditReport: vi.fn(),
  mockUseGenerateSefaReport: vi.fn(),
  mockUseSefaTripwire: vi.fn(),
  mockUseGenerateIrs990Report: vi.fn(),
  mockUseGenerateBoardReport: vi.fn(),
  mockUseGenerateDonorYearEndStatementRun: vi.fn(),
  mockUseGenerateAcknowledgmentLetter: vi.fn(),
  mockUseGenerateRestrictedRollforward: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSession: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockNavigate: vi.fn(),
  grantMutateAsync: vi.fn().mockResolvedValue({ id: "generated-grant-report" }),
  auditMutateAsync: vi.fn().mockResolvedValue({ id: "generated-audit-report" }),
  sefaMutateAsync: vi.fn().mockResolvedValue({ id: "generated-sefa-report" }),
  irsMutateAsync: vi.fn().mockResolvedValue({ id: "generated-irs-report" }),
  boardMutateAsync: vi.fn().mockResolvedValue({ id: "generated-board-report" }),
  yearEndStatementMutateAsync: vi.fn().mockResolvedValue({ id: "generated-year-end-statement" }),
  rollforwardMutateAsync: vi.fn().mockResolvedValue({ report: { id: "generated-rollforward" } }),
  acknowledgmentMutateAsync: vi.fn().mockResolvedValue({
    id: "generated-acknowledgment-report",
  }),
  templateMutateAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  useNavigate: () => hoisted.mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/reports" } }),
  Link: ({
    children,
    to,
    params,
    hash,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
    hash?: string;
    className?: string;
    [key: string]: unknown;
  }) => {
    let href = to ?? "";
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        href = href.replace(`$${key}`, value);
      });
    }
    if (hash) {
      href = `${href}#${hash}`;
    }
    return (
      <a
        href={href}
        data-router-link="true"
        className={className}
        {...(rest as Record<string, unknown>)}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("../../../hooks/use-reports", () => ({
  useReportArtifacts: hoisted.mockUseReportArtifacts,
  useReportGrantOptions: hoisted.mockUseReportGrantOptions,
  useAcknowledgmentTemplate: hoisted.mockUseAcknowledgmentTemplate,
  useUpdateAcknowledgmentTemplate: hoisted.mockUseUpdateAcknowledgmentTemplate,
  useGenerateGrantComplianceReport: hoisted.mockUseGenerateGrantComplianceReport,
  useGenerateAuditReport: hoisted.mockUseGenerateAuditReport,
  useGenerateSefaReport: hoisted.mockUseGenerateSefaReport,
  useSefaTripwire: hoisted.mockUseSefaTripwire,
  useGenerateIrs990Report: hoisted.mockUseGenerateIrs990Report,
  useGenerateBoardReport: hoisted.mockUseGenerateBoardReport,
  useGenerateDonorYearEndStatementRun: hoisted.mockUseGenerateDonorYearEndStatementRun,
  useGenerateAcknowledgmentLetter: hoisted.mockUseGenerateAcknowledgmentLetter,
}));

vi.mock("../../../hooks/use-restrictions", () => ({
  useGenerateRestrictedRollforward: hoisted.mockUseGenerateRestrictedRollforward,
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: hoisted.mockUseOrgBilling,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

import { ReportsPage } from "./index";

describe("ReportsPage", () => {
  beforeEach(() => {
    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: [
        { id: "grant-1", name: "STEM Expansion" },
        { id: "grant-2", name: "Community STEM" },
      ],
      isError: false,
      isPending: false,
      error: undefined,
    });
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });
    hoisted.mockUseAcknowledgmentTemplate.mockReturnValue({
      data: {
        intro: "Thanks",
        body: "We appreciate your support.",
        closing: "Sincerely",
      },
      isError: false,
      isPending: false,
      error: undefined,
    });
    hoisted.mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: hoisted.templateMutateAsync,
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "audit_ready", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: null,
      isLoading: false,
    });
    hoisted.mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: hoisted.grantMutateAsync,
      reset: vi.fn(),
    });
    hoisted.mockUseGenerateAuditReport.mockReturnValue({
      mutateAsync: hoisted.auditMutateAsync,
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateSefaReport.mockReturnValue({
      mutateAsync: hoisted.sefaMutateAsync,
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseSefaTripwire.mockReturnValue({
      data: {
        fiscalYear: "FY2026",
        thresholdCents: 100_000_000,
        totalFederalExpendituresCents: 82_500_000,
        remainingToThresholdCents: 17_500_000,
        thresholdPercent: 82.5,
        state: "watch",
        rows: [],
        warnings: [],
      },
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateIrs990Report.mockReturnValue({
      mutateAsync: hoisted.irsMutateAsync,
    });
    hoisted.mockUseGenerateBoardReport.mockReturnValue({
      mutateAsync: hoisted.boardMutateAsync,
    });
    hoisted.mockUseGenerateDonorYearEndStatementRun.mockReturnValue({
      mutateAsync: hoisted.yearEndStatementMutateAsync,
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateRestrictedRollforward.mockReturnValue({
      mutateAsync: hoisted.rollforwardMutateAsync,
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateAcknowledgmentLetter.mockReturnValue({
      mutateAsync: hoisted.acknowledgmentMutateAsync,
      reset: vi.fn(),
    });

    hoisted.mockCreateFileRoute.mockClear();
    hoisted.mockNavigate.mockClear();
    hoisted.grantMutateAsync.mockClear();
    hoisted.auditMutateAsync.mockClear();
    hoisted.sefaMutateAsync.mockClear();
    hoisted.irsMutateAsync.mockClear();
    hoisted.boardMutateAsync.mockClear();
    hoisted.yearEndStatementMutateAsync.mockClear();
    hoisted.rollforwardMutateAsync.mockClear();
    hoisted.acknowledgmentMutateAsync.mockClear();
    hoisted.templateMutateAsync.mockClear();
    hoisted.mockCaptureEvent.mockClear();
  });

  it("renders the PageHeader primitive with kicker, title, and description", () => {
    const { container } = render(<ReportsPage />);

    const heading = screen.getByRole("heading", { name: "Reports" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header-kicker']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='page-header-description']"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Reporting & Compliance")).toBeInTheDocument();
    expect(screen.queryByText("Reporting workspace")).not.toBeInTheDocument();
  });

  it("renders the Reports tab navigation after the page header", () => {
    render(<ReportsPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    expect(nav).toBeInTheDocument();

    const links = within(nav).getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Builder");
    expect(labels).toContain("Drafts");
    expect(labels).toContain("Ask Ledger");
  });

  it("derives plan gate copy from shared pricing entitlements", () => {
    const source = readFileSync(join(__dirname, "index.tsx"), "utf8");

    expect(source).toMatch(/getPlanLabelsWithEntitlement\(\s*"hasComplianceReportPack"/);
    expect(source).toMatch(/getPlanEntitlementLabelList\(\s*"hasRestrictionEvidencePackage"/);
    expect(source).not.toContain("Upgrade to the Growth plan to open the compliance report pack.");
    expect(source).not.toContain('title="Growth plan required"');
    expect(source).not.toContain("Audit-Ready plan required for evidence package output.");
  });

  it("uses a responsive financial export grid that avoids cramped sidebar widths", () => {
    const { container } = render(<ReportsPage />);

    const exportGrid = container.querySelector("[data-testid='financial-export-grid']");
    const generationGrid = container.querySelector("[data-report-generation]");

    expect(exportGrid).toBeInTheDocument();
    expect(exportGrid).toHaveClass("grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]");
    expect(exportGrid).toHaveClass("min-w-0");
    expect(generationGrid).toHaveClass("min-w-0");
    expect(exportGrid).not.toHaveClass("md:grid-cols-3");
  });

  it("sizes financial export cards to their own content instead of stretching to the tallest sibling", () => {
    const { container } = render(<ReportsPage />);

    const exportGrid = container.querySelector("[data-testid='financial-export-grid']");
    expect(exportGrid).toHaveClass("items-start");
  });

  it("allows long report action labels to wrap inside constrained export cards", () => {
    render(<ReportsPage />);

    const irsButton = screen.getByRole("button", {
      name: "Generate IRS 990 prep export",
    });

    expect(irsButton).toHaveClass("!whitespace-normal");
    expect(irsButton).toHaveClass("break-words");
    expect(irsButton).toHaveClass("h-auto");
    expect(irsButton).toHaveClass("min-h-9");
  });

  it("shows the SEFA tripwire and generates a SEFA draft", async () => {
    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "SEFA builder" })).toBeInTheDocument();
    expect(screen.getByText("$825,000 expended")).toBeInTheDocument();
    expect(screen.getByText(/Status: watch/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate SEFA draft" }));

    await waitFor(() => {
      expect(hoisted.sefaMutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2026",
        title: "FY2026 SEFA Draft",
      });
    });
    expect(hoisted.mockNavigate).toHaveBeenCalledWith({
      to: "/reports/$reportId",
      params: { reportId: "generated-sefa-report" },
    });
  });

  it("keeps report section headings in sentence case for cross-section coherence", () => {
    render(<ReportsPage />);

    // Sibling section headings ("Audit package", "SEFA builder", "IRS 990 prep")
    // are sentence case, so the board packet section must match.
    expect(screen.getByRole("heading", { name: "Board packet composer" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Board Packet Composer" }),
    ).not.toBeInTheDocument();
  });

  it("uses the canonical card radius (rounded-2xl) on the top-level banner cards", () => {
    render(<ReportsPage />);
    // The hero banners are styled like Cards (bg-card, border, shadow-sm) so they
    // must share the canonical Card radius (rounded-2xl) — not rounded-lg — to sit
    // flush with the rounded-2xl section cards directly below them.
    const banner = screen
      .getByRole("heading", { name: "Need a custom report?" })
      .closest("section") as HTMLElement;
    expect(banner).toHaveClass("rounded-2xl");
    expect(banner).not.toHaveClass("rounded-lg");
  });

  it("keeps the acknowledgment template card from stretching to the left column's height", () => {
    render(<ReportsPage />);

    const templateSection = screen
      .getByRole("heading", { name: "Acknowledgment template" })
      .closest("section") as HTMLElement;

    expect(templateSection).toHaveClass("self-start");
  });

  it("requires explicit grant and donation selections before generation", async () => {
    render(<ReportsPage />);

    expect(screen.queryByText(/Latest artifact/)).not.toBeInTheDocument();

    // Grant is now a Radix Select combobox, acknowledgment uses a donor-facing reference label
    expect(screen.getByRole("combobox", { name: "Grant" })).toBeInTheDocument();
    expect(screen.getByLabelText("Donation reference")).toHaveValue("");
    expect(screen.queryByLabelText("Donation ID")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate acknowledgment letter" })).toBeDisabled();

    // Select grant-2 via combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Community STEM" }));

    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-2" },
    });

    expect(hoisted.mockUseGenerateGrantComplianceReport).toHaveBeenLastCalledWith("grant-2");
    expect(hoisted.mockUseGenerateAcknowledgmentLetter).toHaveBeenLastCalledWith("donation-2");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

      fireEvent.change(screen.getByLabelText("Audit fiscal year"), {
        target: { value: "FY2027" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Generate audit export" }));

      fireEvent.change(screen.getByLabelText("IRS 990 fiscal year"), {
        target: { value: "FY2028" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Generate IRS 990 prep export" }));

      fireEvent.change(screen.getByLabelText("Board fiscal year"), {
        target: { value: "FY2029" },
      });
      fireEvent.change(screen.getByLabelText("Board meeting date"), {
        target: { value: "2026-04-20" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Compliance deadlines" }));
      await waitFor(() =>
        expect(screen.getByRole("checkbox", { name: "Compliance deadlines" })).not.toBeChecked(),
      );
      fireEvent.click(screen.getByRole("button", { name: "Generate board report" }));

      fireEvent.change(screen.getByLabelText("Statement year"), {
        target: { value: "2027" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Generate year-end statements" }));

      fireEvent.click(screen.getByRole("button", { name: "Generate acknowledgment letter" }));

      fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
        target: { value: "Intro updated" },
      });
      fireEvent.change(screen.getByLabelText("Acknowledgment body"), {
        target: { value: "Body updated" },
      });
      fireEvent.change(screen.getByLabelText("Acknowledgment closing"), {
        target: { value: "Closing updated" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

      await Promise.resolve();
    });

    expect(screen.getByText("Quarterly compliance")).toBeInTheDocument();
    expect(screen.getByText(/Grant Compliance/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("grant_compliance")).not.toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(hoisted.grantMutateAsync).toHaveBeenCalledWith({
        title: "Quarterly Compliance Report",
      });
      expect(hoisted.auditMutateAsync).toHaveBeenCalledWith({ title: "FY audit export" });
      expect(hoisted.irsMutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2028",
        title: "FY2028 IRS 990 Prep Export",
      });
      expect(hoisted.boardMutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2029",
        title: "FY2029 Board Packet",
        meetingDate: "2026-04-20",
        cadence: "one_time",
        sections: ["executive_snapshot", "fundraising", "grant_pipeline", "fund_balances"],
      });
      expect(hoisted.yearEndStatementMutateAsync).toHaveBeenCalledWith({
        year: 2027,
        deliveryMode: "download",
        minimumAmountCents: 0,
        title: "2027 Year-End Giving Statements",
      });
      expect(hoisted.acknowledgmentMutateAsync).toHaveBeenCalledWith({ title: "Donation Receipt" });
      expect(hoisted.templateMutateAsync).toHaveBeenCalledWith({
        intro: "Intro updated",
        body: "Body updated",
        closing: "Closing updated",
      });
    });
  });

  it("explains why disabled report actions cannot run yet, and clears the hint once satisfied", async () => {
    render(<ReportsPage />);

    // Disabled-by-default actions each show an inline reason, linked to the button.
    expect(screen.getByText("Choose a grant above to generate this report.")).toHaveAttribute(
      "id",
      "grant-compliance-hint",
    );
    expect(
      screen.getByRole("button", { name: "Generate grant compliance report" }),
    ).toHaveAttribute("aria-describedby", "grant-compliance-hint");
    expect(
      screen.getByText("Enter a donation reference above to generate the letter."),
    ).toHaveAttribute("id", "acknowledgment-hint");
    expect(screen.getByText("Change the template above to save it.")).toHaveAttribute(
      "id",
      "template-save-hint",
    );

    // Choosing a grant clears its hint.
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Community STEM" }));
    expect(
      screen.queryByText("Choose a grant above to generate this report."),
    ).not.toBeInTheDocument();

    // Entering a donation reference clears the acknowledgment hint.
    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-2" },
    });
    expect(
      screen.queryByText("Enter a donation reference above to generate the letter."),
    ).not.toBeInTheDocument();

    // Editing the template clears the save hint.
    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Intro updated" },
    });
    expect(screen.queryByText("Change the template above to save it.")).not.toBeInTheDocument();
  });

  it("renders artifact cards inside the artifact list container", () => {
    const { container } = render(<ReportsPage />);

    expect(container.querySelector("[data-testid='reports-artifact-list']")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-testid='report-artifact-card']").length).toBe(1);
    expect(screen.getByRole("link", { name: /Quarterly compliance/ })).toHaveAttribute(
      "href",
      "/reports/report-1",
    );
    expect(screen.getByText(/Grant Compliance/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders type and date in font-mono below the card title", () => {
    const { container } = render(<ReportsPage />);

    const monoEl = container.querySelector(".font-mono");
    expect(monoEl).toBeInTheDocument();
    expect(monoEl?.textContent).toContain("Grant Compliance");
    expect(monoEl?.textContent).toContain("Apr 8, 2026");
  });

  it("renders the status badge on each artifact card", () => {
    render(<ReportsPage />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("navigates report artifact pagination controls", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
        total: 50,
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("navigates to each generated report detail page after successful generation", async () => {
    render(<ReportsPage />);

    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Community STEM" }));
    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-2" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));
      fireEvent.click(screen.getByRole("button", { name: "Generate audit export" }));
      fireEvent.click(screen.getByRole("button", { name: "Generate IRS 990 prep export" }));
      fireEvent.click(screen.getByRole("button", { name: "Generate board report" }));
      fireEvent.click(screen.getByRole("button", { name: "Generate acknowledgment letter" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(hoisted.mockNavigate).toHaveBeenCalledWith({
        to: "/reports/$reportId",
        params: { reportId: "generated-grant-report" },
      });
      expect(hoisted.mockNavigate).toHaveBeenCalledWith({
        to: "/reports/$reportId",
        params: { reportId: "generated-audit-report" },
      });
      expect(hoisted.mockNavigate).toHaveBeenCalledWith({
        to: "/reports/$reportId",
        params: { reportId: "generated-irs-report" },
      });
      expect(hoisted.mockNavigate).toHaveBeenCalledWith({
        to: "/reports/$reportId",
        params: { reportId: "generated-board-report" },
      });
      expect(hoisted.mockNavigate).toHaveBeenCalledWith({
        to: "/reports/$reportId",
        params: { reportId: "generated-acknowledgment-report" },
      });
    });
  });

  it("sends the selected board cadence when generating a board report", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Board fiscal year"), {
      target: { value: "FY2029" },
    });

    await user.click(screen.getByRole("combobox", { name: "Board cadence" }));
    await user.click(await screen.findByRole("option", { name: "Quarterly" }));
    await user.click(screen.getByRole("button", { name: "Generate board report" }));

    await waitFor(() => {
      expect(hoisted.boardMutateAsync).toHaveBeenCalledWith({
        fiscalYear: "FY2029",
        title: "FY2029 Board Packet",
        cadence: "quarterly",
        sections: [
          "executive_snapshot",
          "fundraising",
          "grant_pipeline",
          "fund_balances",
          "compliance_deadlines",
        ],
      });
    });
  });

  it("shows inline mutation errors from report actions via destructive Alert", async () => {
    hoisted.mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Grant not found")),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    // Grant select is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "STEM Expansion" }));

    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

    expect(await screen.findByText("Grant not found")).toBeInTheDocument();
    expect(hoisted.mockNavigate).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((node) => node.getAttribute("data-variant") === "destructive")).toBe(true);
  });

  it("clears fiscal-year export errors when the year input changes", async () => {
    hoisted.mockUseGenerateAuditReport.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Audit export failed")),
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateIrs990Report.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("IRS export failed")),
      isPending: false,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateBoardReport.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Board export failed")),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Generate audit export" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate IRS 990 prep export" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate board report" }));

    expect(await screen.findByText("Audit export failed")).toBeInTheDocument();
    expect(await screen.findByText("IRS export failed")).toBeInTheDocument();
    expect(await screen.findByText("Board export failed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Audit fiscal year"), {
      target: { value: "FY2027" },
    });
    fireEvent.change(screen.getByLabelText("IRS 990 fiscal year"), {
      target: { value: "FY2027" },
    });
    fireEvent.change(screen.getByLabelText("Board fiscal year"), {
      target: { value: "FY2027" },
    });

    expect(screen.queryByText("Audit export failed")).not.toBeInTheDocument();
    expect(screen.queryByText("IRS export failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Board export failed")).not.toBeInTheDocument();
  });

  it("selecting a grant from the dropdown enables the compliance report button", async () => {
    render(<ReportsPage />);

    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();

    // Grant select is a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Community STEM" }));

    expect(hoisted.mockUseGenerateGrantComplianceReport).toHaveBeenLastCalledWith("grant-2");
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "  donation-2  " },
    });

    expect(hoisted.mockUseGenerateAcknowledgmentLetter).toHaveBeenLastCalledWith("donation-2");
    expect(screen.getByRole("button", { name: "Generate acknowledgment letter" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));
      fireEvent.click(screen.getByRole("button", { name: "Generate acknowledgment letter" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(hoisted.grantMutateAsync).toHaveBeenCalledWith({
        title: "Quarterly Compliance Report",
      });
      expect(hoisted.acknowledgmentMutateAsync).toHaveBeenCalledWith({
        title: "Donation Receipt",
      });
    });
  });

  it("exposes grant options beyond the first 100 records in the reports selector", async () => {
    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: Array.from({ length: 105 }, (_, index) => ({
        id: `grant-${index + 1}`,
        name: `Grant ${index + 1}`,
      })),
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));

    expect(await screen.findByText("Grant 105")).toBeInTheDocument();
  }, 10000);

  it("does not render a free-text Grant ID manual input — only the dropdown", () => {
    render(<ReportsPage />);
    expect(screen.queryByLabelText("Grant ID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Grant")).toBeInTheDocument();
  });

  it("disambiguates same-named grants in the picker by funder and period year", async () => {
    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: [
        {
          id: "grant-renewal-2026",
          name: "Mobile Dental Outreach Expansion",
          funderName: "The Hartwell Family Foundation",
          startDate: "2026-01-01",
        },
        {
          id: "grant-renewal-2025",
          name: "Mobile Dental Outreach Expansion",
          funderName: "Riverbend Community Trust",
          startDate: "2025-01-01",
        },
      ],
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));

    // Both same-named grants must be individually selectable: the funder and the
    // grant period year appear alongside the name so the user can tell them apart.
    const hartwell = await screen.findByRole("option", {
      name: /Mobile Dental Outreach Expansion.*The Hartwell Family Foundation.*2026/s,
    });
    const riverbend = await screen.findByRole("option", {
      name: /Mobile Dental Outreach Expansion.*Riverbend Community Trust.*2025/s,
    });
    expect(hartwell).toBeInTheDocument();
    expect(riverbend).toBeInTheDocument();

    fireEvent.click(riverbend);
    expect(hoisted.mockUseGenerateGrantComplianceReport).toHaveBeenLastCalledWith(
      "grant-renewal-2025",
    );
  });

  it("shows the acknowledgment template as read-only for non-admins", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      isLoading: false,
    });

    render(<ReportsPage />);

    expect(screen.getByText("Admins manage the acknowledgment template.")).toBeInTheDocument();
    expect(screen.getByLabelText("Acknowledgment intro")).toBeDisabled();
    expect(screen.getByLabelText("Acknowledgment body")).toBeDisabled();
    expect(screen.getByLabelText("Acknowledgment closing")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save acknowledgment template" }),
    ).not.toBeInTheDocument();
  });

  it("allows members with compliance manage permission to save the acknowledgment template", async () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { compliance: "manage" },
      isLoading: false,
    });

    render(<ReportsPage />);

    expect(screen.getByLabelText("Acknowledgment intro")).toBeEnabled();
    expect(screen.getByLabelText("Acknowledgment body")).toBeEnabled();
    expect(screen.getByLabelText("Acknowledgment closing")).toBeEnabled();
    expect(
      screen.queryByText("Admins manage the acknowledgment template."),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Thanks so much" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    await waitFor(() => {
      expect(hoisted.templateMutateAsync).toHaveBeenCalledWith({
        intro: "Thanks so much",
        body: "We appreciate your support.",
        closing: "Sincerely",
      });
    });
  });

  it("shows character counts beneath each acknowledgment template textarea", () => {
    render(<ReportsPage />);

    // Default values from mock: intro="Thanks", body="We appreciate your support.", closing="Sincerely"
    const counts = screen.getAllByText(/characters$/);
    expect(counts.length).toBeGreaterThanOrEqual(3);

    // Intro: "Thanks" = 6 chars
    expect(screen.getByText("6 characters")).toBeInTheDocument();
    // Body: "We appreciate your support." = 27 chars
    expect(screen.getByText("27 characters")).toBeInTheDocument();
    // Closing: "Sincerely" = 9 chars
    expect(screen.getByText("9 characters")).toBeInTheDocument();
  });

  it("updates character counts in real time as template fields are edited", () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Hello there" },
    });

    expect(screen.getByText("11 characters")).toBeInTheDocument();
  });

  it("shows 0 characters when a template field is cleared", () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "" },
    });

    expect(screen.getByText("0 characters")).toBeInTheDocument();
  });

  it("fires the beforeunload event handler when the template has unsaved changes", () => {
    render(<ReportsPage />);

    // Template has a saved value — edit it to create unsaved changes
    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Modified intro" },
    });

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("does not call preventDefault on beforeunload when the template has no unsaved changes", () => {
    render(<ReportsPage />);

    // No changes made — template is clean
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("clears the unsaved-guard after a successful template save", async () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Edited intro" },
    });

    // Guard is active — beforeunload should call preventDefault
    const dirtyEvent = new Event("beforeunload") as BeforeUnloadEvent;
    const dirtySpy = vi.spyOn(dirtyEvent, "preventDefault");
    window.dispatchEvent(dirtyEvent);
    expect(dirtySpy).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByText("Acknowledgment template saved for future receipts."),
      ).toBeInTheDocument();
    });

    // After save, draft is cleared so guard should be inactive
    const cleanEvent = new Event("beforeunload") as BeforeUnloadEvent;
    const cleanSpy = vi.spyOn(cleanEvent, "preventDefault");
    window.dispatchEvent(cleanEvent);
    expect(cleanSpy).not.toHaveBeenCalled();
  });

  it("shows confirmation after saving the acknowledgment template and clears it on edit", async () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment closing"), {
      target: { value: "Warm regards" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    expect(
      await screen.findByText("Acknowledgment template saved for future receipts."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Fresh intro" },
    });

    expect(
      screen.queryByText("Acknowledgment template saved for future receipts."),
    ).not.toBeInTheDocument();
  });

  it("renders 3 skeleton divs while report artifacts are loading", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: true,
      error: undefined,
    });

    const { container } = render(<ReportsPage />);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBe(3);
    expect(screen.queryByText("Your reports live here")).not.toBeInTheDocument();
  });

  it("renders TeachAndActEmptyState when no reports have been generated", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: { data: [] },
      isError: false,
      isPending: false,
      error: undefined,
    });

    const { container } = render(<ReportsPage />);

    const emptyStates = container.querySelectorAll("[data-slot='teach-and-act-empty-state']");
    expect(emptyStates.length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Your reports live here" })).toBeInTheDocument();
    expect(screen.getByText("Your reports live here")).toBeInTheDocument();
    expect(
      screen.getByText("Build reports for funders and audits. Save them here to open later."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate your first report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /How reports work/ })).toBeInTheDocument();
  });

  it("hides the page filter, list subtext, and PDF help in the true-empty state", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: { data: [] },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    // Section heading still orients the user, but the chrome that implies an
    // existing list is hidden so it doesn't contradict the empty state.
    expect(screen.getByRole("heading", { name: "Recently generated" })).toBeInTheDocument();
    expect(screen.getByText("Your reports live here")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter current page")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Open any report to preview or download it."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Need help with PDFs?")).not.toBeInTheDocument();
  });

  it("shows the page filter, list subtext, and PDF help once reports exist", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    expect(screen.getByLabelText("Filter current page")).toBeInTheDocument();
    expect(screen.getByText("Open any report to preview or download it.")).toBeInTheDocument();
    expect(screen.getByText("Need help with PDFs?")).toBeInTheDocument();
  });

  it("primary action on TeachAndActEmptyState scrolls to the generation section", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: { data: [] },
      isError: false,
      isPending: false,
      error: undefined,
    });

    const mockScrollIntoView = vi.fn();
    vi.spyOn(document, "querySelector").mockImplementation((selector) => {
      if (selector === "[data-report-generation]") {
        return { scrollIntoView: mockScrollIntoView } as unknown as Element;
      }
      return null;
    });

    render(<ReportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Generate your first report" }));

    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    vi.restoreAllMocks();
  });

  it("shows filter-active empty state when search is active and no reports match", async () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Filter current page"), {
      target: { value: "nonexistent" },
    });

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_list_filtered", {
      filter_count: 1,
      filter_keys: ["search"],
      has_search: true,
      query_length_bucket: "1-20",
    });
    expect(JSON.stringify(hoisted.mockCaptureEvent.mock.calls)).not.toContain("nonexistent");
    expect(screen.getByText("No reports match these filters.")).toBeInTheDocument();
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it("Clear filters button in filter-active empty state resets report search", async () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    const searchInput = screen.getByLabelText("Filter current page");
    fireEvent.change(searchInput, { target: { value: "something" } });

    expect(screen.getByText("No reports match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clear filters"));

    expect(hoisted.mockCaptureEvent).toHaveBeenLastCalledWith("report_list_filtered", {
      filter_count: 0,
      filter_keys: [],
      has_search: false,
      query_length_bucket: "0",
    });
    expect(searchInput).toHaveValue("");
    expect(screen.queryByText("No reports match these filters.")).not.toBeInTheDocument();
  });

  it("keeps cached report artifacts visible when a refetch fails", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: true,
      isPending: false,
      error: new Error("Artifact refresh failed"),
    });

    render(<ReportsPage />);

    expect(screen.getByText("Artifact refresh failed")).toBeInTheDocument();
    expect(screen.getByText("Quarterly compliance")).toBeInTheDocument();
    expect(screen.queryByText("No generated reports yet.")).not.toBeInTheDocument();
  });

  it("trims the audit fiscal year before wiring the audit export hook", () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Audit fiscal year"), {
      target: { value: "  FY2027  " },
    });

    expect(hoisted.mockUseGenerateAuditReport).toHaveBeenLastCalledWith("FY2027");
  });

  it("disables fiscal-year exports when the year input is blank", () => {
    render(<ReportsPage />);

    const auditButton = screen.getByRole("button", { name: "Generate audit export" });
    const irsButton = screen.getByRole("button", { name: "Generate IRS 990 prep export" });
    const boardButton = screen.getByRole("button", { name: "Generate board report" });

    expect(auditButton).toBeEnabled();
    expect(irsButton).toBeEnabled();
    expect(boardButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Audit fiscal year"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText("IRS 990 fiscal year"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Board fiscal year"), {
      target: { value: " " },
    });

    expect(screen.getByRole("button", { name: "Generate audit export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate IRS 990 prep export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate board report" })).toBeDisabled();
  });

  it("disables report actions while generation requests are pending", () => {
    hoisted.mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: hoisted.grantMutateAsync,
      reset: vi.fn(),
      isPending: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateAuditReport.mockReturnValue({
      mutateAsync: hoisted.auditMutateAsync,
      isPending: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateIrs990Report.mockReturnValue({
      mutateAsync: hoisted.irsMutateAsync,
      isPending: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateBoardReport.mockReturnValue({
      mutateAsync: hoisted.boardMutateAsync,
      isPending: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseGenerateAcknowledgmentLetter.mockReturnValue({
      mutateAsync: hoisted.acknowledgmentMutateAsync,
      reset: vi.fn(),
      isPending: true,
      isError: false,
      error: undefined,
    });
    hoisted.mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: hoisted.templateMutateAsync,
      isPending: true,
    });

    render(<ReportsPage />);

    // Grant select is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(screen.getByRole("option", { name: "STEM Expansion" }));
    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-1" },
    });

    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate audit export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate IRS 990 prep export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate board report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate acknowledgment letter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save acknowledgment template" })).toBeDisabled();
  });

  it("disables the Save acknowledgment template button until a field is edited", () => {
    render(<ReportsPage />);

    // Draft matches the saved template on load, so there is nothing to save.
    expect(screen.getByRole("button", { name: "Save acknowledgment template" })).toBeDisabled();
    // The textareas stay editable so the user can make a change.
    expect(screen.getByLabelText("Acknowledgment intro")).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Thanks again" },
    });

    expect(screen.getByRole("button", { name: "Save acknowledgment template" })).toBeEnabled();
  });

  it("locks the acknowledgment template editor after a template fetch failure", () => {
    const refetch = vi.fn();
    hoisted.mockUseAcknowledgmentTemplate.mockReturnValue({
      data: undefined,
      isError: true,
      isPending: false,
      error: new Error("Template lookup failed"),
      refetch,
    });

    render(<ReportsPage />);

    expect(screen.getByText("Unable to load template.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByLabelText("Acknowledgment intro")).toBeDisabled();
    expect(screen.getByLabelText("Acknowledgment body")).toBeDisabled();
    expect(screen.getByLabelText("Acknowledgment closing")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save acknowledgment template" })).toBeDisabled();
  });

  it("omits report freshness metadata when no artifact history is available yet", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: { data: [] },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    expect(screen.queryByText(/Latest artifact/)).not.toBeInTheDocument();
  });

  it("surfaces a destructive Alert when the grants query fails", () => {
    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: undefined,
      isError: true,
      isPending: false,
      error: new Error("Grant lookup failed"),
    });

    render(<ReportsPage />);

    expect(screen.getByText("Unable to load grants.")).toBeInTheDocument();
    expect(screen.getByText("Grant lookup failed")).toBeInTheDocument();
  });

  it("surfaces the acknowledgment mutation error in a destructive Alert", async () => {
    hoisted.mockUseGenerateAcknowledgmentLetter.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Donation not found")),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Donation reference"), {
      target: { value: "donation-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate acknowledgment letter" }));

    expect(await screen.findByText("Donation not found")).toBeInTheDocument();
    expect(screen.getByText("Unable to generate acknowledgment letter.")).toBeInTheDocument();
  });

  it("renders a destructive Alert when saving the acknowledgment template fails", async () => {
    hoisted.mockUseUpdateAcknowledgmentTemplate.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Template save failed")),
      isPending: false,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "Edited before save" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    expect(await screen.findByText("Template save failed")).toBeInTheDocument();
    expect(screen.getByText("Unable to save acknowledgment template.")).toBeInTheDocument();
  });

  it("tracks acknowledgment template updates without sending template copy", async () => {
    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Acknowledgment intro"), {
      target: { value: "New private intro" },
    });
    fireEvent.change(screen.getByLabelText("Acknowledgment closing"), {
      target: { value: "New private closing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save acknowledgment template" }));

    await waitFor(() => {
      expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("acknowledgment_template_updated", {
        field_count: 2,
        fields_updated: ["intro", "closing"],
      });
    });
    expect(JSON.stringify(hoisted.mockCaptureEvent.mock.calls)).not.toContain("New private intro");
    expect(JSON.stringify(hoisted.mockCaptureEvent.mock.calls)).not.toContain(
      "New private closing",
    );
  });

  it("formats IRS 990 artifact metadata with the canonical label", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-2",
            title: "FY2026 IRS 990",
            type: "irs_990",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    const { container } = render(<ReportsPage />);

    expect(screen.getByText("IRS 990 prep")).toBeInTheDocument();
    // The type label is rendered inside the font-mono subtitle of the artifact card
    const monoEl = container.querySelector(".font-mono");
    expect(monoEl?.textContent).toContain("IRS 990");
    expect(monoEl?.textContent).not.toContain("irs_990");
    expect(screen.queryByText("Irs 990")).not.toBeInTheDocument();
    expect(screen.queryByText("irs_990")).not.toBeInTheDocument();
  });

  it("surfaces mutation-hook errors via destructive Alerts for each export action", () => {
    hoisted.mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: hoisted.grantMutateAsync,
      reset: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error("Grant export hook failure"),
    });
    hoisted.mockUseGenerateAuditReport.mockReturnValue({
      mutateAsync: hoisted.auditMutateAsync,
      isPending: false,
      isError: true,
      error: new Error("Audit export hook failure"),
    });
    hoisted.mockUseGenerateIrs990Report.mockReturnValue({
      mutateAsync: hoisted.irsMutateAsync,
      isPending: false,
      isError: true,
      error: new Error("IRS export hook failure"),
    });
    hoisted.mockUseGenerateBoardReport.mockReturnValue({
      mutateAsync: hoisted.boardMutateAsync,
      isPending: false,
      isError: true,
      error: new Error("Board export hook failure"),
    });
    hoisted.mockUseGenerateAcknowledgmentLetter.mockReturnValue({
      mutateAsync: hoisted.acknowledgmentMutateAsync,
      reset: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error("Acknowledgment hook failure"),
    });

    render(<ReportsPage />);

    expect(screen.getByText("Grant export hook failure")).toBeInTheDocument();
    expect(screen.getByText("Audit export hook failure")).toBeInTheDocument();
    expect(screen.getByText("IRS export hook failure")).toBeInTheDocument();
    expect(screen.getByText("Board export hook failure")).toBeInTheDocument();
    expect(screen.getByText("Acknowledgment hook failure")).toBeInTheDocument();
  });

  it("generates restricted rollforwards and navigates to the generated report", async () => {
    hoisted.rollforwardMutateAsync.mockResolvedValueOnce({
      report: { id: "generated-rollforward" },
    });
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "audit_ready", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Period start"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByLabelText(/Include evidence package/));
    fireEvent.click(screen.getByRole("button", { name: "Generate restricted rollforward" }));

    await waitFor(() =>
      expect(hoisted.rollforwardMutateAsync).toHaveBeenCalledWith({
        periodStart: "2026-02-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.999Z",
        includeEvidencePackage: true,
        title: "Restricted rollforward",
      }),
    );
    expect(hoisted.mockNavigate).toHaveBeenCalledWith({
      to: "/reports/$reportId",
      params: { reportId: "generated-rollforward" },
    });
  });

  it("shows the Ask Ledger CTA when accounting access allows it", () => {
    render(<ReportsPage />);

    const askLedgerSection = screen.getByText("Want a quick ledger answer?").closest("section");
    const link = within(askLedgerSection as HTMLElement).getByRole("link", { name: /Ask Ledger/ });
    expect(link).toHaveAttribute("href", "/reports/ask-ledger");
    expect(link).toHaveAttribute("data-router-link", "true");
  });

  it("hides the Ask Ledger CTA on Starter because the ledger assistant starts at Growth", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "starter", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    const askLedgerSection = screen.queryByText("Want a quick ledger answer?");
    expect(askLedgerSection).not.toBeInTheDocument();
  });

  it("hides the Ask Ledger CTA when accounting access is removed", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "editor",
      memberPermissions: getDefaultPermissionsForRole("editor"),
      isLoading: false,
    });
    // Override to explicitly remove accounting access
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "editor",
      memberPermissions: { ...getDefaultPermissionsForRole("editor"), accounting: "none" },
      isLoading: false,
    });

    render(<ReportsPage />);

    const askLedgerSection = screen.queryByText("Want a quick ledger answer?");
    expect(askLedgerSection).not.toBeInTheDocument();
  });

  it("shows the proposal drafting CTA only when plan and grant access allow it", () => {
    render(<ReportsPage />);

    const link = screen.getByRole("link", { name: /Draft from grant/ });
    expect(link).toHaveAttribute("href", "/reports/drafts");
    expect(link).toHaveAttribute("data-router-link", "true");
  });

  it("routes the report builder CTA through the client-side router", () => {
    render(<ReportsPage />);

    const link = screen.getByRole("link", { name: /Open report builder/ });
    expect(link).toHaveAttribute("href", "/reports/builder");
    expect(link).toHaveAttribute("data-router-link", "true");
  });

  it("hides the proposal drafting CTA below Growth", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "starter", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    expect(screen.queryByRole("link", { name: /Draft from grant/ })).not.toBeInTheDocument();
  });

  it("shows the proposal drafting CTA on Growth now that drafting moved down a tier", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "growth", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    expect(screen.getByRole("link", { name: /Draft from grant/ })).toHaveAttribute(
      "href",
      "/reports/drafts",
    );
  });

  it("hides the proposal drafting CTA when grant edit access is removed", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { reports: "view", grants: "view" },
      isLoading: false,
    });

    render(<ReportsPage />);

    expect(screen.queryByRole("link", { name: /Draft from grant/ })).not.toBeInTheDocument();
  });

  it("shows restricted rollforward errors and clears them when dates change", async () => {
    hoisted.mockUseGenerateRestrictedRollforward.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("rollforward failed"),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    fireEvent.change(screen.getByLabelText("Period start"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate restricted rollforward" }));

    expect(await screen.findByText("An unexpected error occurred.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Period end"), {
      target: { value: "2026-04-30" },
    });
    expect(screen.queryByText("An unexpected error occurred.")).not.toBeInTheDocument();
  });

  it("surfaces restricted rollforward hook errors", () => {
    hoisted.mockUseGenerateRestrictedRollforward.mockReturnValue({
      mutateAsync: hoisted.rollforwardMutateAsync,
      isPending: false,
      isError: true,
      error: new Error("Rollforward hook failure"),
    });

    render(<ReportsPage />);

    expect(screen.getByText("Rollforward hook failure")).toBeInTheDocument();
  });

  it("falls back to a generic message when a mutation rejects with a non-Error value", async () => {
    hoisted.mockUseGenerateGrantComplianceReport.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("network dropped"),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    // Grant select is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "STEM Expansion" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate grant compliance report" }));

    expect(await screen.findByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("omits the artifact card list when the reports query fails with no cached artifacts", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: { data: [] },
      isError: true,
      isPending: false,
      error: new Error("Artifact refresh failed"),
    });

    const { container } = render(<ReportsPage />);

    expect(screen.getByText("Unable to load reports.")).toBeInTheDocument();
    expect(screen.getByText("Artifact refresh failed")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='teach-and-act-empty-state']"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Your reports live here")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-testid='reports-artifact-list']"),
    ).not.toBeInTheDocument();
  });

  it("shows Starter orgs an upgrade prompt and disables the Growth report-pack actions", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: { planTier: "starter", status: "active" },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    const packAlert = screen
      .getByText("Upgrade to Growth to open the compliance report pack.")
      .closest('[data-slot="alert"]') as HTMLElement;
    expect(packAlert).toHaveAttribute("data-variant", "info");
    const upgradeLink = within(packAlert).getByRole("link", { name: /open billing settings/i });
    expect(upgradeLink).toHaveAttribute("href", "/settings#billing");
    expect(upgradeLink).toHaveAttribute("data-router-link", "true");
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate audit export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate board report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate IRS 990 prep export" })).toBeEnabled();
  });

  it("fails closed while billing is still loading", async () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: undefined,
    });

    render(<ReportsPage />);

    // Grant select is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "STEM Expansion" }));

    expect(
      screen.getByText("Upgrade to Growth to open the compliance report pack."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
  });

  it("fails closed when billing lookup errors", async () => {
    hoisted.mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Billing lookup failed"),
    });

    render(<ReportsPage />);

    // Grant select is now a Radix Select combobox
    fireEvent.click(screen.getByRole("combobox", { name: "Grant" }));
    fireEvent.click(await screen.findByRole("option", { name: "STEM Expansion" }));

    expect(
      screen.getByText("Upgrade to Growth to open the compliance report pack."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate grant compliance report" })).toBeDisabled();
  });

  it("paginates generated report artifacts when the total exceeds one page", () => {
    hoisted.mockUseReportArtifacts.mockReturnValue({
      data: {
        data: [
          {
            id: "report-1",
            title: "Quarterly compliance",
            type: "grant_compliance",
            status: "ready",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
        total: 60,
      },
      isError: false,
      isPending: false,
      error: undefined,
    });

    render(<ReportsPage />);

    const pagination = screen.getByTestId("reports-pagination");
    expect(pagination).toHaveTextContent("Page 1 of 3");

    const previous = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(previous).toBeDisabled();
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    expect(screen.getByTestId("reports-pagination")).toHaveTextContent("Page 2 of 3");
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByTestId("reports-pagination")).toHaveTextContent("Page 1 of 3");
  });

  it("shows full report title as title attribute on truncated artifact title div", () => {
    render(<ReportsPage />);

    expect(screen.getByTitle("Quarterly compliance")).toBeInTheDocument();
  });
});
