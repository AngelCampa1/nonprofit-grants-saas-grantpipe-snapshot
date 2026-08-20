import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultPermissionsForRole } from "@grantpipe/shared";
import { ApiError } from "../../../lib/http-response";

const { mockUseSession, mockUseBundles, mockUseBundleMutations, mockUseReportArtifacts } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUseBundles: vi.fn(),
    mockUseBundleMutations: vi.fn(),
    mockUseReportArtifacts: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: unknown }) => ({ ...config, path }),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/evidence-bundles" } }),
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: mockUseSession,
}));

vi.mock("../../../hooks/use-external-reviewers", () => ({
  useBundles: mockUseBundles,
  useBundleMutations: mockUseBundleMutations,
}));

vi.mock("../../../hooks/use-reports", () => ({
  useReportArtifacts: mockUseReportArtifacts,
}));

const mockCaptureEvent = vi.fn();
vi.mock("../../../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const mockCaptureAppException = vi.fn();
vi.mock("../../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

const mockCaptureRecordFilterChanged = vi.fn();
vi.mock("../../../lib/record-discovery-analytics", () => ({
  captureRecordFilterChanged: (...args: unknown[]) => mockCaptureRecordFilterChanged(...args),
}));

import { EvidenceBundlesIndexPage } from "./index";

function mockAuditReadinessReports(auditTotal: number, irs990Total: number) {
  mockUseReportArtifacts.mockImplementation((params: { type?: string }) => ({
    data: { data: [], total: params.type === "audit" ? auditTotal : irs990Total },
    isLoading: false,
    isError: false,
  }));
}

describe("EvidenceBundlesIndexPage — extractBundles edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "viewer", effectivePlanTier: "audit_ready" });
    mockUseBundleMutations.mockReturnValue({
      createBundle: { mutateAsync: vi.fn(), isPending: false },
    });
    mockAuditReadinessReports(0, 0);
  });

  it("renders the page title in title case", () => {
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByRole("heading", { name: "Evidence Bundles" })).toBeInTheDocument();
  });

  it("renders the section kicker and description alongside the page title", () => {
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByText("Reporting & Compliance")).toBeInTheDocument();
    expect(
      screen.getByText("Group documents and proof into bundles. Share them with auditors."),
    ).toBeInTheDocument();
  });

  it("renders empty state when bundles data is an object without a data array", () => {
    mockUseBundles.mockReturnValue({
      data: { unexpected: "shape" },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByText("Your evidence bundles live here")).toBeInTheDocument();
  });

  it("renders table rows when bundles data is a bare array", () => {
    mockUseBundles.mockReturnValue({
      data: [
        {
          id: "bundle-direct",
          title: "Direct array bundle",
          purpose: "audit",
          periodStart: null,
          periodEnd: null,
          publishedAt: null,
          itemCount: 2,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByText("Direct array bundle")).toBeInTheDocument();
  });

  it("shows generic error text when a non-Error value is thrown from bundle creation", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseSession.mockReturnValue({ memberRole: "admin", effectivePlanTier: "audit_ready" });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    mockUseBundleMutations.mockReturnValue({
      createBundle: {
        mutateAsync: vi.fn().mockRejectedValue("unexpected string error"),
        isPending: false,
      },
    });

    render(<EvidenceBundlesIndexPage />);

    const headerNewBundleButton = screen.getAllByRole("button", { name: "Add bundle" })[0];
    if (!headerNewBundleButton) throw new Error("Expected header Add bundle button");
    await user.click(headerNewBundleButton);
    await user.type(screen.getByLabelText("Title"), "Test bundle");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });

  it("hides the billing link in the audit gate when the viewer cannot edit", () => {
    mockUseBundles.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new ApiError("Upgrade required", 402, "insufficient_plan"),
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByText("Audit-Ready plan required")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open billing settings" })).not.toBeInTheDocument();
  });

  it("uses explicit compliance permissions for bundle creation", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { compliance: "edit" },
      effectivePlanTier: "audit_ready",
    });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByRole("button", { name: "Add bundle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first bundle" })).toBeInTheDocument();
  });
});

describe("EvidenceBundlesIndexPage plan gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin", effectivePlanTier: "audit_ready" });
    mockUseBundleMutations.mockReturnValue({
      createBundle: { mutateAsync: vi.fn(), isPending: false },
    });
    mockAuditReadinessReports(0, 0);
  });

  it("shows the gate without firing the bundles request when the plan lacks the auditor portal entitlement", () => {
    mockUseSession.mockReturnValue({ memberRole: "admin", effectivePlanTier: "starter" });
    mockUseBundles.mockReturnValue({ isLoading: false, isError: false, data: undefined });

    render(<EvidenceBundlesIndexPage />);

    // Gate renders purely from the client-side entitlement — no failed 402 fetch.
    expect(screen.getByText("Audit-Ready plan required")).toBeInTheDocument();
    // The query is disabled so the network request never fires behind the gate.
    expect(mockUseBundles).toHaveBeenCalled();
    const lastCallOptions = mockUseBundles.mock.calls.at(-1)?.[1];
    expect(lastCallOptions).toEqual(expect.objectContaining({ enabled: false }));
    for (const reportCall of mockUseReportArtifacts.mock.calls) {
      expect(reportCall[1]).toEqual(expect.objectContaining({ enabled: false }));
    }
    // Even an admin (canEdit) cannot reach the create path that would POST a 402.
    expect(screen.queryByRole("button", { name: "Add bundle" })).not.toBeInTheDocument();
  });

  it("renders an Audit-Ready upgrade state for bundle 402s instead of raw status copy", () => {
    mockUseBundles.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new ApiError("Upgrade required", 402, "insufficient_plan"),
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByText("Audit-Ready plan required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open billing settings" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
    expect(screen.queryByText(/Failed to load bundles: 402/i)).not.toBeInTheDocument();
  });

  it("renders loading, generic error, and empty viewer states", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer", effectivePlanTier: "audit_ready" });
    mockUseBundles.mockReturnValue({ isLoading: true, isError: false });
    const { rerender } = render(<EvidenceBundlesIndexPage />);
    expect(screen.getByTestId("bundles-loading")).toBeInTheDocument();

    mockUseBundles.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("Network failed"),
    });
    rerender(<EvidenceBundlesIndexPage />);
    expect(screen.getByText("Unable to load bundles.")).toBeInTheDocument();
    expect(screen.getByText("Network failed")).toBeInTheDocument();

    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    rerender(<EvidenceBundlesIndexPage />);
    expect(screen.getByText("Your evidence bundles live here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add bundle" })).not.toBeInTheDocument();
  });

  it("creates a bundle from the empty state and resets the dialog", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const createBundle = vi.fn().mockResolvedValue({ id: "bundle-1" });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    mockUseBundleMutations.mockReturnValue({
      createBundle: { mutateAsync: createBundle, isPending: false },
    });

    render(<EvidenceBundlesIndexPage />);

    const emptyStateNewBundleButton = screen.getByRole("button", {
      name: "Add your first bundle",
    });
    await user.click(emptyStateNewBundleButton);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");

    await user.type(screen.getByLabelText("Title"), "FY2025 Audit Pack");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Closeout" }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(createBundle).toHaveBeenCalledWith({
        title: "FY2025 Audit Pack",
        purpose: "closeout",
      }),
    );
  });

  it("closing the dialog via Escape resets title and purpose state", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    const headerNewBundleButton = screen.getAllByRole("button", { name: "Add bundle" })[0];
    if (!headerNewBundleButton) throw new Error("Expected header Add bundle button");
    await user.click(headerNewBundleButton);

    expect(screen.getByLabelText("Title")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    });
  });

  it("keeps the create dialog open when bundle creation fails", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    mockUseBundleMutations.mockReturnValue({
      createBundle: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Create failed")),
        isPending: false,
      },
    });

    render(<EvidenceBundlesIndexPage />);

    const headerNewBundleButton = screen.getAllByRole("button", { name: "Add bundle" })[0];
    if (!headerNewBundleButton) throw new Error("Expected header Add bundle button");
    await user.click(headerNewBundleButton);
    await user.type(screen.getByLabelText("Title"), "Draft bundle");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Create failed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Create failed")).not.toBeInTheDocument();
  });

  it("renders bundle table rows with period, item, status, and links", () => {
    mockUseBundles.mockReturnValue({
      data: {
        data: [
          {
            id: "bundle-1",
            title: "Published pack",
            purpose: "audit",
            periodStart: "2025-01-01T00:00:00.000Z",
            periodEnd: "2025-12-31T00:00:00.000Z",
            publishedAt: "2026-01-15T00:00:00.000Z",
            itemCount: 7,
          },
          {
            id: "bundle-2",
            title: "Draft pack",
            purpose: "funder_review",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: null,
            publishedAt: null,
            itemCount: undefined,
          },
          {
            id: "bundle-3",
            title: "No period pack",
            purpose: "board_report",
            periodStart: null,
            periodEnd: null,
            publishedAt: null,
            itemCount: 0,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByRole("link", { name: "Published pack" })).toHaveAttribute(
      "href",
      "/evidence-bundles/$bundleId",
    );
    expect(screen.getByText(/Jan\s+1,\s+2025.*Dec\s+31,\s+2025/)).toBeInTheDocument();
    expect(screen.getByText(/From\s+Jan\s+1,\s+2026/)).toBeInTheDocument();
    expect(screen.getByText("Funder Review")).toBeInTheDocument();
    expect(screen.getByText("Board Report")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getAllByText("Draft")).toHaveLength(2);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("shows a filtered empty state and clears the purpose filter", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseSession.mockReturnValue({ memberRole: "viewer", effectivePlanTier: "audit_ready" });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    await user.click(screen.getByRole("combobox", { name: "Purpose" }));
    await user.click(await screen.findByRole("option", { name: "Audit" }));

    expect(screen.getByTestId("bundles-filter-empty")).toHaveTextContent(
      "No evidence bundles match this purpose.",
    );
    expect(mockUseBundles).toHaveBeenLastCalledWith(
      {
        page: 1,
        pageSize: 25,
        purpose: "audit",
      },
      { enabled: true },
    );

    await user.click(screen.getByRole("button", { name: /Clear filter/ }));

    expect(mockUseBundles).toHaveBeenLastCalledWith(
      {
        page: 1,
        pageSize: 25,
      },
      { enabled: true },
    );
  });

  it("renders pagination controls and advances bundle pages", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseSession.mockReturnValue({ memberRole: "viewer", effectivePlanTier: "audit_ready" });
    mockUseBundles.mockReturnValue({
      data: {
        data: [
          {
            id: "bundle-paged",
            title: "Paged evidence pack",
            purpose: "audit",
            periodStart: null,
            periodEnd: null,
            publishedAt: null,
            createdAt: "2026-04-15T00:00:00.000Z",
            itemCount: 1,
          },
        ],
        total: 30,
      },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByTestId("bundles-pagination")).toHaveTextContent("Page 1 of 2");
    expect(screen.getByText(/Apr\s+15,\s+2026/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(mockUseBundles).toHaveBeenLastCalledWith(
      {
        page: 2,
        pageSize: 25,
      },
      { enabled: true },
    );
  });

  it("renders bundle rows returned from the paginated API shape", () => {
    mockUseBundles.mockReturnValue({
      data: {
        items: [
          {
            id: "bundle-api-1",
            title: "Title III-C Closeout Evidence Pack",
            purpose: "closeout",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-03-31T00:00:00.000Z",
            publishedAt: "2026-05-12T00:00:00.000Z",
            itemCount: 4,
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(
      screen.getByRole("link", { name: "Title III-C Closeout Evidence Pack" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No evidence bundles yet")).not.toBeInTheDocument();
  });

  it("renders bundle rows returned from the paginated API shape", () => {
    mockUseBundles.mockReturnValue({
      data: {
        items: [
          {
            id: "bundle-api-1",
            title: "Title III-C Closeout Evidence Pack",
            purpose: "closeout",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-03-31T00:00:00.000Z",
            publishedAt: "2026-05-12T00:00:00.000Z",
            itemCount: 4,
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(
      screen.getByRole("link", { name: "Title III-C Closeout Evidence Pack" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No evidence bundles yet")).not.toBeInTheDocument();
  });

  it("fires captureRecordFilterChanged with record_type=evidence-bundles on purpose filter change", async () => {
    mockCaptureRecordFilterChanged.mockClear();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseSession.mockReturnValue({ memberRole: "viewer", effectivePlanTier: "audit_ready" });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    await user.click(screen.getByRole("combobox", { name: "Purpose" }));
    await user.click(await screen.findByRole("option", { name: "Audit" }));

    await waitFor(() => {
      expect(mockCaptureRecordFilterChanged).toHaveBeenCalledWith(
        "evidence-bundles",
        "purpose",
        expect.objectContaining({ purpose: "audit" }),
      );
    });
  });

  it("renders an audit readiness score from binder and report artifacts", () => {
    mockAuditReadinessReports(1, 1);
    mockUseBundles.mockReturnValue({
      data: {
        data: [
          {
            id: "bundle-audit",
            title: "FY2026 Audit Binder",
            purpose: "audit",
            periodStart: null,
            periodEnd: null,
            publishedAt: null,
            itemCount: 3,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EvidenceBundlesIndexPage />);

    expect(screen.getByRole("heading", { name: "Audit readiness" })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Audit binder starter")).toBeInTheDocument();
    expect(screen.getByText("Audit export")).toBeInTheDocument();
    expect(screen.getByText("IRS 990 prep export")).toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(4);
  });

  it("creates an audit binder from the readiness panel with feature analytics", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const createBundle = vi.fn().mockResolvedValue({ id: "bundle-audit" });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    mockUseBundleMutations.mockReturnValue({
      createBundle: { mutateAsync: createBundle, isPending: false },
    });

    render(<EvidenceBundlesIndexPage />);

    await user.click(screen.getByRole("button", { name: "Create audit binder starter" }));

    await waitFor(() =>
      expect(createBundle).toHaveBeenCalledWith({
        title: "2026 Audit Binder Starter",
        purpose: "audit",
      }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("audit_readiness_binder_created", {
      score_bucket: "0-49",
      missing_check_count: 3,
    });
  });

  it("tracks audit binder preset failures without exposing raw messages", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    mockUseBundleMutations.mockReturnValue({
      createBundle: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("database host secret")),
        isPending: false,
      },
    });

    render(<EvidenceBundlesIndexPage />);

    await user.click(screen.getByRole("button", { name: "Create audit binder starter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to create the audit binder. Please try again.",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("audit_readiness_binder_failed", {
      score_bucket: "0-49",
      failure_type: "request_error",
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "audit_readiness",
          operation: "create_audit_binder_starter",
        },
        extra: {
          score_bucket: "0-49",
          failure_type: "request_error",
        },
      },
      { includeExpected: true, sanitize: true },
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("database host secret");
    expect(JSON.stringify(mockCaptureAppException.mock.calls[0]?.slice(1))).not.toContain(
      "database host secret",
    );
  });

  it("renders the Reports tab navigation after the page header", () => {
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: getDefaultPermissionsForRole("admin"),
      effectivePlanTier: "audit_ready",
    });
    mockUseBundles.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<EvidenceBundlesIndexPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    expect(nav).toBeInTheDocument();

    const links = within(nav).getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Builder");
    expect(labels).toContain("Drafts");
    expect(labels).toContain("Evidence Bundles");
  });
});
