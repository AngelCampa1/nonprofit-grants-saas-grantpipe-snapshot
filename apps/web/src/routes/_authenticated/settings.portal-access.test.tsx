import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useReviewers: vi.fn(),
  useSessions: vi.fn(),
  useAuditEvents: vi.fn(),
  useReviewerMutations: vi.fn(),
  useSessionMutations: vi.fn(),
  createReviewer: vi.fn(),
  updateReviewer: vi.fn(),
  deleteReviewer: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  extendSession: vi.fn(),
  downloadViaOrgFetch: vi.fn(),
  captureAppException: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    to,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; hash?: string }) => (
    <a href={hash ? `${to ?? ""}#${hash}` : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../components/confirm-dialog", () => ({
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

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock("../../lib/download", () => ({
  downloadViaOrgFetch: (path: string, filename: string) =>
    mocks.downloadViaOrgFetch(path, filename),
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mocks.captureAppException(...args),
}));

vi.mock("../../hooks/use-external-reviewers", () => ({
  useReviewers: (params?: unknown, options?: unknown) => mocks.useReviewers(params, options),
  useSessions: (params?: unknown, options?: unknown) => mocks.useSessions(params, options),
  useAuditEvents: (params?: unknown, options?: unknown) => mocks.useAuditEvents(params, options),
  useReviewerMutations: () => mocks.useReviewerMutations(),
  useSessionMutations: () => mocks.useSessionMutations(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Sheet: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children?: React.ReactNode;
    }) =>
      open ? (
        <div>
          {children}
          <button type="button" onClick={() => onOpenChange?.(false)}>
            Close sheet
          </button>
        </div>
      ) : null,
    SheetContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SheetHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children?: React.ReactNode;
    }) => (
      <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

describe("PortalAccessSettingsPage card radius contracts", () => {
  it("uses rounded-2xl on the skeleton wrapper and all table-wrapper divs", () => {
    const source = readFileSync(join(__dirname, "settings.portal-access.tsx"), "utf8");
    // skeleton wrapper
    expect(source).toContain('className="overflow-x-auto rounded-2xl border border-border"');
    // data table wrappers (sessions, reviewers, activity)
    expect(source).toContain('className="overflow-x-auto rounded-2xl border border-border"');
  });

  it("Portal link Label has htmlFor and its Input has a matching id", () => {
    const source = readFileSync(join(__dirname, "settings.portal-access.tsx"), "utf8");
    expect(source).toContain('htmlFor="generated-portal-link"');
    expect(source).toContain('id="generated-portal-link"');
  });
});

describe("PortalAccessSettingsPage source contracts", () => {
  it("derives session duration options from shared constants", () => {
    const source = readFileSync(join(__dirname, "settings.portal-access.tsx"), "utf8");

    expect(source).toContain("PORTAL_SESSION_TTL_OPTIONS");
    expect(source).toContain("PORTAL_SESSION_EXTENSION_OPTIONS");
    expect(source).not.toContain("const TTL_OPTIONS");
    expect(source).not.toContain("const EXTENSION_OPTIONS");
    expect(source).not.toContain('{ label: "7 days", value: 7 * 24 * 60 * 60 * 1000 }');
    expect(source).not.toContain('{ label: "+30 days", value: 30 * 24 * 60 * 60 * 1000 }');
  });

  it("associates every reviewer/session select with its label via matching htmlFor and id", () => {
    const source = readFileSync(join(__dirname, "settings.portal-access.tsx"), "utf8");

    // Every Select trigger is keyed to its Label so clicking the label focuses the
    // control — an 80-year-old should be able to tap the word, not just the box.
    const triggerIds = [
      "portal-reviewer",
      "portal-new-reviewer-type",
      "portal-session-duration",
      "portal-initial-scope-type",
      "portal-edit-reviewer-type",
      "portal-add-reviewer-type",
    ];
    for (const id of triggerIds) {
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
    }

    // No Select trigger should remain without an id (i.e. unlabelled by click).
    expect(source).not.toMatch(/<SelectTrigger>/);
  });
});

import { PortalAccessSettingsPage } from "./settings.portal-access";
import { ApiError } from "../../lib/http-response";

describe("PortalAccessSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mocks.useSession.mockReturnValue({ memberRole: "admin" });
    mocks.useReviewers.mockReturnValue({
      data: {
        data: [
          {
            id: "reviewer-1",
            name: "Jane Auditor",
            email: "jane@example.org",
            reviewerType: "auditor",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useSessions.mockReturnValue({
      data: {
        data: [
          {
            id: "session-1",
            reviewerId: "reviewer-1",
            purpose: "Year-end audit",
            expiresAt: "2999-01-01T00:00:00.000Z",
            revokedAt: null,
            scopes: [{ scopeType: "grant", scopeId: "grant-1" }],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useAuditEvents.mockReturnValue({
      data: {
        data: [
          {
            id: "event-1",
            reviewerId: "reviewer-1",
            eventType: "portal_view",
            targetType: "grant",
            targetId: "grant-1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.createReviewer.mockResolvedValue({ id: "reviewer-new" });
    mocks.updateReviewer.mockResolvedValue({});
    mocks.deleteReviewer.mockResolvedValue({});
    mocks.createSession.mockResolvedValue({ portalUrl: "https://portal.test/session" });
    mocks.revokeSession.mockResolvedValue({});
    mocks.extendSession.mockResolvedValue({});
    mocks.useReviewerMutations.mockReturnValue({
      createReviewer: { mutateAsync: mocks.createReviewer, isPending: false },
      updateReviewer: { mutateAsync: mocks.updateReviewer, isPending: false },
      deleteReviewer: { mutateAsync: mocks.deleteReviewer, isPending: false },
    });
    mocks.useSessionMutations.mockReturnValue({
      createSession: { mutateAsync: mocks.createSession, isPending: false },
      revokeSession: { mutateAsync: mocks.revokeSession, isPending: false },
      extendSession: { mutateAsync: mocks.extendSession, isPending: false },
    });
  });

  it("renders sessions, reviewers, audit events, and active-session actions", async () => {
    render(<PortalAccessSettingsPage />);

    expect(
      screen.queryByRole("heading", { level: 1, name: "Portal access" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Portal access" })).toBeVisible();
    expect(screen.getByText("Year-end audit")).toBeVisible();
    expect(screen.getAllByText("Jane Auditor").length).toBeGreaterThan(0);
    expect(screen.getByText("Portal View")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "+30 days" }));

    await waitFor(() =>
      expect(mocks.extendSession).toHaveBeenCalledWith({
        id: "session-1",
        extensionMs: 2592000000,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const revokeDialog = await screen.findByTestId("confirm-dialog");
    fireEvent.click(revokeDialog.querySelector("button")!);
    await waitFor(() => expect(mocks.revokeSession).toHaveBeenCalledWith("session-1"));
  });

  it("renders reviewer and session rows when the API returns an {items, total} shape", async () => {
    mocks.useReviewers.mockReturnValue({
      data: {
        items: [
          {
            id: "reviewer-2",
            name: "Priya Funder",
            email: "priya@example.org",
            reviewerType: "funder",
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    mocks.useSessions.mockReturnValue({
      data: {
        items: [
          {
            id: "session-2",
            reviewerId: "reviewer-2",
            purpose: "Quarterly funder review",
            expiresAt: "2999-01-01T00:00:00.000Z",
            revokedAt: null,
            scopes: [],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Quarterly funder review")).toBeVisible();
    expect(screen.getAllByText("Priya Funder").length).toBeGreaterThan(0);

    // The invite dialog's reviewer picker should also show the {items}-shaped reviewer.
    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    expect(
      screen.getByRole("option", { name: "Priya Funder (priya@example.org)" }),
    ).toBeInTheDocument();
  });

  it("explains that board members can use portal access for board packets", async () => {
    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Board members can use this for board packets.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add reviewer" }));

    expect(await screen.findByRole("option", { name: "Board" })).toBeInTheDocument();
  });

  it("invites a reviewer, creates a scoped portal link, and copies it", async () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite a reviewer" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "New reviewer" }));
    expect(screen.getByRole("button", { name: "Create & continue" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "New reviewer" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reviewer-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "Restricted fund review" },
    });
    const sessionSelects = screen.getAllByRole("combobox");
    fireEvent.change(sessionSelects[0]!, { target: { value: "604800000" } });
    fireEvent.change(sessionSelects[1]!, { target: { value: "fund" } });
    fireEvent.change(screen.getByLabelText("Scope entity ID (optional)"), {
      target: { value: "fund-99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));

    await waitFor(() =>
      expect(mocks.createSession).toHaveBeenCalledWith({
        reviewerId: "reviewer-1",
        purpose: "Restricted fund review",
        ttlMs: 604800000,
        scopes: [{ scopeType: "fund", scopeId: "fund-99" }],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://portal.test/session");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeVisible());
  });

  it("navigates and closes portal access sheets", async () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reviewer-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "Close flow review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));
    expect(await screen.findByText("Portal link created")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Portal link created")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit reviewer" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Edit reviewer" })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Edit reviewer" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" })[0]!);
    expect(screen.getByRole("heading", { name: "Add reviewer" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Add reviewer" })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Add reviewer" })).not.toBeInTheDocument(),
    );
  });

  it("adds, edits, and removes reviewers with validation", async () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" }).at(-1)!);
    expect(screen.getByText("Email and name are required.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.org" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Reviewer" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "funder" } });
    fireEvent.change(screen.getByLabelText("Organization (optional)"), {
      target: { value: "Audit Firm" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" }).at(-1)!);
    await waitFor(() =>
      expect(mocks.createReviewer).toHaveBeenCalledWith({
        email: "new@example.org",
        name: "New Reviewer",
        reviewerType: "funder",
        organizationName: "Audit Firm",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Updated" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "funder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.updateReviewer).toHaveBeenCalledWith({
        id: "reviewer-1",
        data: { name: "Jane Updated", reviewerType: "funder" },
      }),
    );

    // Clicking "Remove" opens the ConfirmDialog; confirm by clicking the dialog's Remove button.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const confirmDialog = await screen.findByTestId("confirm-dialog");
    const confirmRemoveBtn = confirmDialog.querySelector("button")!;
    fireEvent.click(confirmRemoveBtn);
    await waitFor(() => expect(mocks.deleteReviewer).toHaveBeenCalledWith("reviewer-1"));
  });

  it("shows mutation and clipboard errors in portal access workflows", async () => {
    mocks.createReviewer.mockRejectedValueOnce(new Error("Create reviewer failed"));
    mocks.createSession.mockRejectedValueOnce(new Error("Create session failed"));
    mocks.updateReviewer.mockRejectedValueOnce(new Error("Update reviewer failed"));
    mocks.deleteReviewer.mockRejectedValueOnce(new Error("Delete reviewer failed"));
    mocks.revokeSession.mockRejectedValueOnce(new Error("Revoke failed"));
    mocks.extendSession.mockRejectedValueOnce(new Error("Extend failed"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "+30 days" }));
    expect(await screen.findByText("Extend failed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const errRevokeDialog = await screen.findByTestId("confirm-dialog");
    fireEvent.click(errRevokeDialog.querySelector("button")!);
    expect(await screen.findByText("Revoke failed")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "New reviewer" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad@example.org" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create & continue" }));
    expect(await screen.findByText("Create reviewer failed")).toBeVisible();
    expect(mocks.captureAppException).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reviewer-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Error review" } });
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));
    expect(await screen.findByText("Create session failed")).toBeVisible();

    mocks.createSession.mockResolvedValueOnce({ portalUrl: "https://portal.test/session" });
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));
    expect(await screen.findByText("Portal link created")).toBeVisible();
    mocks.captureAppException.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Clipboard unavailable.")).toBeVisible();
    expect(mocks.captureAppException).toHaveBeenCalledTimes(1);
    expect(mocks.captureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: { feature: "portal", operation: "copy_portal_link" },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(mocks.captureAppException.mock.calls)).not.toContain(
      "https://portal.test/session",
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Update" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Update reviewer failed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click((await screen.findByTestId("confirm-dialog")).querySelector("button")!);
    expect(await screen.findByText("Delete reviewer failed")).toBeVisible();
  });

  it("blocks direct portal access settings for non-admins without enabling queries", () => {
    mocks.useSession.mockReturnValue({ memberRole: "viewer" });

    render(<PortalAccessSettingsPage />);

    expect(mocks.useSessions).toHaveBeenCalledWith({ includeExpired: true }, { enabled: false });
    expect(mocks.useReviewers).toHaveBeenCalledWith(undefined, { enabled: false });
    expect(mocks.useAuditEvents).toHaveBeenCalledWith(undefined, { enabled: false });
    expect(screen.getByText("Only admins can manage portal access.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite a reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Year-end audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Auditor")).not.toBeInTheDocument();
  });

  it("does not render reviewer rows for direct viewer access", () => {
    mocks.useSession.mockReturnValue({ memberRole: "viewer" });

    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Only admins can manage portal access.")).toBeVisible();
    expect(screen.queryByText("Jane Auditor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("blocks direct portal access settings for editors", () => {
    mocks.useSession.mockReturnValue({ memberRole: "editor" });

    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Only admins can manage portal access.")).toBeVisible();
    expect(screen.queryByText("Year-end audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Auditor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite a reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+30 days" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("closes management sheets and prevents editor mutations after role loss", async () => {
    const { rerender } = render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    expect(screen.getByRole("heading", { name: "Invite a reviewer" })).toBeVisible();

    mocks.useSession.mockReturnValue({ memberRole: "editor" });
    rerender(<PortalAccessSettingsPage />);

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite a reviewer" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Only admins can manage portal access.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite a reviewer" })).not.toBeInTheDocument();
    expect(mocks.createReviewer).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.revokeSession).not.toHaveBeenCalled();
    expect(mocks.extendSession).not.toHaveBeenCalled();
    expect(mocks.updateReviewer).not.toHaveBeenCalled();
    expect(mocks.deleteReviewer).not.toHaveBeenCalled();
  });

  it("renders loading, empty, expired, revoked, and fallback row states", () => {
    mocks.useSessions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    mocks.useReviewers.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    mocks.useAuditEvents.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(<PortalAccessSettingsPage />);

    expect(screen.getByTestId("sessions-loading")).toBeVisible();
    expect(screen.getByTestId("reviewers-loading")).toBeVisible();
    expect(screen.getByTestId("activity-loading")).toBeVisible();

    mocks.useSessions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    mocks.useReviewers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    mocks.useAuditEvents.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    rerender(<PortalAccessSettingsPage />);

    expect(screen.getByText("No reviewers added yet.")).toBeVisible();
    expect(screen.getByText("No reviewer activity yet.")).toBeVisible();

    mocks.useSessions.mockReturnValue({
      data: [
        {
          id: "session-expired",
          reviewerId: "unknown-reviewer",
          purpose: "Expired review",
          expiresAt: "2000-01-01T00:00:00.000Z",
          revokedAt: null,
        },
        {
          id: "session-revoked",
          reviewerId: "revoked-reviewer",
          purpose: "Revoked review",
          expiresAt: "2999-01-01T00:00:00.000Z",
          revokedAt: "2026-01-01T00:00:00.000Z",
          scopes: [],
        },
      ],
      isLoading: false,
      isError: false,
    });
    mocks.useReviewers.mockReturnValue({
      data: [
        {
          id: "reviewer-array",
          name: "Array Reviewer",
          email: "array@example.org",
          reviewerType: "funder",
        },
      ],
      isLoading: false,
      isError: false,
    });
    mocks.useAuditEvents.mockReturnValue({
      data: [
        {
          id: "event-no-target",
          reviewerId: "missing-reviewer",
          eventType: "login",
          targetType: null,
          targetId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    });
    rerender(<PortalAccessSettingsPage />);

    expect(screen.getByText("Expired review")).toBeVisible();
    expect(screen.getByText("Revoked review")).toBeVisible();
    expect(screen.getByText("Expired")).toBeVisible();
    expect(screen.getByText("Revoked")).toBeVisible();
    expect(screen.getByText("unknown-")).toBeVisible();
    expect(screen.getByText("missing-")).toBeVisible();
    expect(screen.getByText("Array Reviewer")).toBeVisible();
  });

  it("renders query error messages and target fallbacks", () => {
    mocks.useSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "plain session error",
    });
    mocks.useReviewers.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Reviewer query failed"),
    });
    mocks.useAuditEvents.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Activity query failed"),
    });

    const { rerender } = render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Unable to load sessions.")).toBeVisible();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeVisible();
    expect(screen.getByText("Unable to load reviewers.")).toBeVisible();
    expect(screen.getByText("Reviewer query failed")).toBeVisible();
    expect(screen.getByText("Unable to load activity.")).toBeVisible();
    expect(screen.getByText("Activity query failed")).toBeVisible();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    mocks.useSessions.mockReturnValue({
      data: {
        data: [
          {
            id: "session-today",
            reviewerId: "reviewer-1",
            purpose: "Same day review",
            expiresAt: "2026-01-01T00:00:00.000Z",
            revokedAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useReviewers.mockReturnValue({
      data: {
        data: [
          {
            id: "reviewer-1",
            name: "Today Reviewer",
            email: "today@example.org",
            reviewerType: "auditor",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useAuditEvents.mockReturnValue({
      data: {
        data: [
          {
            id: "event-target-type-only",
            reviewerId: "reviewer-1",
            eventType: "document_view",
            targetType: "payment_request",
            targetId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    rerender(<PortalAccessSettingsPage />);

    expect(screen.getByText("Same day review")).toBeVisible();
    expect(screen.getByText("today")).toBeVisible();
    expect(screen.getByText("Payment Request")).toBeVisible();
    vi.useRealTimers();
  });

  it("creates a reviewer from the invite flow and handles blank-scope sessions", async () => {
    mocks.useReviewers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Create one" }));
    fireEvent.click(screen.getByRole("button", { name: "Create & continue" }));
    expect(screen.getByText("Email and name are required.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invite@example.org" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Invite Reviewer" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "funder" } });
    fireEvent.click(screen.getByRole("button", { name: "Create & continue" }));

    await waitFor(() =>
      expect(mocks.createReviewer).toHaveBeenCalledWith({
        email: "invite@example.org",
        name: "Invite Reviewer",
        reviewerType: "funder",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));
    expect(screen.getByText("Purpose is required.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Board review" } });
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));

    await waitFor(() =>
      expect(mocks.createSession).toHaveBeenCalledWith({
        reviewerId: "reviewer-new",
        purpose: "Board review",
        ttlMs: 2592000000,
        scopes: [],
      }),
    );
  });

  it("renders the audit-ready plan gate with billing navigation", () => {
    mocks.useSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
    });

    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Audit-Ready plan required")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open billing settings" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("handles pending, missing-url, and blank copy states for portal invites", async () => {
    mocks.useSessionMutations.mockReturnValue({
      createSession: { mutateAsync: mocks.createSession, isPending: true },
      revokeSession: { mutateAsync: mocks.revokeSession, isPending: false },
      extendSession: { mutateAsync: mocks.extendSession, isPending: false },
    });
    mocks.createSession.mockResolvedValueOnce({});
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { rerender } = render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Invite a reviewer" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reviewer-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Pending review" } });
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();

    mocks.useSessionMutations.mockReturnValue({
      createSession: { mutateAsync: mocks.createSession, isPending: false },
      revokeSession: { mutateAsync: mocks.revokeSession, isPending: false },
      extendSession: { mutateAsync: mocks.extendSession, isPending: false },
    });
    rerender(<PortalAccessSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalled());
    expect(screen.queryByText("Portal link created")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("adds a reviewer without an organization and validates blank edit names", async () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" })[0]!);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "blank@example.org" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Blank Org" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" }).at(-1)!);
    await waitFor(() =>
      expect(mocks.createReviewer).toHaveBeenCalledWith({
        email: "blank@example.org",
        name: "Blank Org",
        reviewerType: "auditor",
        organizationName: undefined,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Name is required.")).toBeVisible();
  });

  it("uses fallback messaging for non-Error add reviewer failures", async () => {
    mocks.createReviewer.mockRejectedValueOnce("plain failure");
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" })[0]!);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad@example.org" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Reviewer" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add reviewer" }).at(-1)!);

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeVisible();
  });

  it("exports the reviewer activity trail as CSV", async () => {
    mocks.downloadViaOrgFetch.mockResolvedValueOnce(undefined);
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(mocks.downloadViaOrgFetch).toHaveBeenCalledWith(
        "/api/external-reviewers/audit-events/export.csv",
        "reviewer-activity.csv",
      ),
    );
    expect(screen.queryByText("Unable to export reviewer activity.")).not.toBeInTheDocument();
  });

  it("surfaces an error when the CSV export fails", async () => {
    mocks.downloadViaOrgFetch.mockRejectedValueOnce(new ApiError("Export failed", 500));
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Export failed")).toBeVisible();
  });

  it("falls back to a generic message for non-Error CSV export failures", async () => {
    mocks.downloadViaOrgFetch.mockRejectedValueOnce("plain failure");
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeVisible();
  });

  it("scopes the reviewer Remove button disable to the in-flight row only", () => {
    mocks.useReviewers.mockReturnValue({
      data: {
        data: [
          {
            id: "reviewer-A",
            name: "Alice Auditor",
            email: "alice@example.org",
            reviewerType: "auditor",
          },
          {
            id: "reviewer-B",
            name: "Bob Auditor",
            email: "bob@example.org",
            reviewerType: "auditor",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useReviewerMutations.mockReturnValue({
      createReviewer: { mutateAsync: mocks.createReviewer, isPending: false },
      updateReviewer: { mutateAsync: mocks.updateReviewer, isPending: false },
      deleteReviewer: {
        mutateAsync: mocks.deleteReviewer,
        isPending: true,
        variables: "reviewer-A",
      },
    });

    render(<PortalAccessSettingsPage />);

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons[0]).toBeDisabled();
    expect(removeButtons[1]).not.toBeDisabled();
  });

  it("scopes the session Revoke and Extend buttons to the in-flight row only", () => {
    mocks.useSessions.mockReturnValue({
      data: {
        data: [
          {
            id: "session-A",
            reviewerId: "reviewer-1",
            purpose: "Audit A",
            expiresAt: "2999-01-01T00:00:00.000Z",
            revokedAt: null,
            scopes: [],
          },
          {
            id: "session-B",
            reviewerId: "reviewer-1",
            purpose: "Audit B",
            expiresAt: "2999-01-01T00:00:00.000Z",
            revokedAt: null,
            scopes: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.useSessionMutations.mockReturnValue({
      createSession: { mutateAsync: mocks.createSession, isPending: false },
      revokeSession: { mutateAsync: mocks.revokeSession, isPending: true, variables: "session-A" },
      extendSession: {
        mutateAsync: mocks.extendSession,
        isPending: true,
        variables: { id: "session-A", extensionMs: 2592000000 },
      },
    });

    render(<PortalAccessSettingsPage />);

    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    const extendButtons = screen.getAllByRole("button", { name: "+30 days" });
    expect(revokeButtons[0]).toBeDisabled();
    expect(revokeButtons[1]).not.toBeDisabled();
    expect(extendButtons[0]).toBeDisabled();
    expect(extendButtons[1]).not.toBeDisabled();
  });

  it("disables the CSV export when there is no reviewer activity", () => {
    mocks.useAuditEvents.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<PortalAccessSettingsPage />);

    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("clicking Revoke does NOT immediately call the revoke mutation — dialog appears first", () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(mocks.revokeSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("confirming the revoke dialog DOES call the revoke mutation with the session id", async () => {
    render(<PortalAccessSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByTestId("confirm-dialog");
    fireEvent.click(dialog.querySelector("button")!);

    await waitFor(() => expect(mocks.revokeSession).toHaveBeenCalledWith("session-1"));
  });

  it("shows full session purpose as title attribute on truncated purpose cell", () => {
    render(<PortalAccessSettingsPage />);

    expect(screen.getByTitle("Year-end audit")).toBeInTheDocument();
  });
});
