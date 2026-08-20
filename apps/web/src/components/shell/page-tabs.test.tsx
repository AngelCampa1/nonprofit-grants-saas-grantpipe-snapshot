import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultPermissionsForRole, type PermissionMap, type Role } from "@grantpipe/shared";

const locationState = { pathname: "/grants" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    onClick,
    "aria-current": ariaCurrent,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; "aria-current"?: "page" }) => (
    <a href={to} className={className} aria-current={ariaCurrent} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: locationState.pathname } }),
}));

const mockCaptureEvent = vi.fn();
vi.mock("../../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const mockUseSession = vi.fn();
vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

import { AppPageTabs } from "./page-tabs";
import { donorTabs, grantsTabs, fundsTabs } from "../../config/page-tabs";

function sessionFor(role: Role | null, permissions: PermissionMap | null = null) {
  return {
    memberRole: role,
    memberPermissions: permissions,
  };
}

describe("AppPageTabs", () => {
  beforeEach(() => {
    locationState.pathname = "/grants";
    mockCaptureEvent.mockClear();
    mockUseSession.mockReset();
  });

  it("renders every grantsTabs item for an admin", () => {
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    for (const tab of grantsTabs) {
      expect(screen.getByRole("link", { name: tab.label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(grantsTabs.length);
  });

  it("renders null for an auditor on fundsTabs using the real auditor permission defaults", () => {
    // Auditors get `programs: "none"` in the shared role-default permission map
    // (packages/shared/src/types/index.ts AUDITOR_PERMISSIONS), so only the
    // Funds "Overview" tab remains visible — one tab is noise, not navigation.
    mockUseSession.mockReturnValue(sessionFor("auditor", getDefaultPermissionsForRole("auditor")));
    const { container } = render(<AppPageTabs groupId="funds" items={fundsTabs} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the Email tab for an editor on donorTabs", () => {
    mockUseSession.mockReturnValue(sessionFor("editor", getDefaultPermissionsForRole("editor")));
    render(<AppPageTabs groupId="donors" items={donorTabs} />);

    expect(screen.getByRole("link", { name: "Email" })).toBeInTheDocument();
  });

  it("hides the Email tab for a viewer on donorTabs (donors:edit gate)", () => {
    mockUseSession.mockReturnValue(sessionFor("viewer", getDefaultPermissionsForRole("viewer")));
    render(<AppPageTabs groupId="donors" items={donorTabs} />);

    expect(screen.queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
  });

  it("fires app_page_tab_clicked with the exact payload shape on click", () => {
    locationState.pathname = "/grants";
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    fireEvent.click(screen.getByRole("link", { name: "Pipeline" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_page_tab_clicked", {
      group_id: "grants",
      tab_label: "Pipeline",
      destination_path: "/grants/pipeline",
      current_path: "/grants",
    });
  });

  it("marks the active tab with aria-current='page' and leaves others unmarked", () => {
    locationState.pathname = "/grants/pipeline";
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders nothing when a single visible item remains", () => {
    mockUseSession.mockReturnValue(sessionFor("admin"));
    const { container } = render(<AppPageTabs groupId="grants" items={grantsTabs.slice(0, 1)} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when zero items are visible", () => {
    mockUseSession.mockReturnValue(sessionFor("admin"));
    const { container } = render(<AppPageTabs groupId="grants" items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("derives a default ariaLabel by capitalizing groupId", () => {
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    expect(screen.getByRole("navigation", { name: "Grants sections" })).toBeInTheDocument();
  });

  it("uses a provided ariaLabel over the derived default", () => {
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} ariaLabel="Custom label" />);

    expect(screen.getByRole("navigation", { name: "Custom label" })).toBeInTheDocument();
  });

  it("never includes the router's /app basepath in hrefs or the current_path analytics property", () => {
    // TanStack Router registers with basepath "/app" (main.tsx), but
    // `location.pathname` from useRouterState is already basepath-relative —
    // AppSidebar and AccountingSectionNav both compare it directly against
    // unprefixed route paths ("/dashboard", "/accounting"). This test would
    // fail if AppPageTabs ever started expecting or re-adding the prefix.
    locationState.pathname = "/grants";
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/grants");

    fireEvent.click(screen.getByRole("link", { name: "Funders" }));
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "app_page_tab_clicked",
      expect.objectContaining({ current_path: "/grants", destination_path: "/funders" }),
    );
  });

  it("treats a null memberRole as visible-by-default, matching isNavItemVisible's contract", () => {
    mockUseSession.mockReturnValue(sessionFor(null));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    expect(screen.getAllByRole("link")).toHaveLength(grantsTabs.length);
  });

  it("normalizes a trailing-slash pathname before comparing to tab destinations", () => {
    locationState.pathname = "/grants/";
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("falls back to '/' when the pathname strips down to an empty string", () => {
    // "/".replace(/\/+$/, "") produces "", so the `|| "/"` fallback keeps
    // activePath a valid root path instead of an empty one.
    locationState.pathname = "/";
    mockUseSession.mockReturnValue(sessionFor("admin"));
    render(<AppPageTabs groupId="grants" items={grantsTabs} />);

    for (const tab of grantsTabs) {
      expect(screen.getByRole("link", { name: tab.label })).not.toHaveAttribute("aria-current");
    }
  });
});
