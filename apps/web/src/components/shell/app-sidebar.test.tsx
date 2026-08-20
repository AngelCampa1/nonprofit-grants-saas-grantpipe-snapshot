import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const locationState = { pathname: "/dashboard" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    activeOptions,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    activeOptions?: { exact?: boolean };
  } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement(
      "a",
      { href: to, "data-active-exact": activeOptions?.exact ? "true" : undefined, ...props },
      children,
    ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: locationState.pathname } }),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    SidebarRoot: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement("div", { "data-testid": "sidebar-root", className }, children),
    SidebarHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "sidebar-header" }, children),
    SidebarNav: ({ children }: { children: React.ReactNode }) =>
      React.createElement("nav", { "data-testid": "sidebar-nav" }, children),
    SidebarFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "sidebar-footer" }, children),
    SidebarNavSection: ({ children, label }: { children: React.ReactNode; label?: string }) =>
      React.createElement(
        "div",
        { "data-testid": "sidebar-nav-section" },
        label ? React.createElement("span", { "data-testid": "section-label" }, label) : null,
        children,
      ),
    SidebarNavItem: ({
      children,
      label,
      isActive,
      icon,
      asChild: _asChild,
      ...props
    }: {
      children: React.ReactNode;
      label: string;
      isActive?: boolean;
      icon?: React.ReactNode;
      asChild?: boolean;
    } & React.HTMLAttributes<HTMLElement>) =>
      React.createElement(
        "div",
        {
          "data-testid": "sidebar-nav-item",
          "aria-current": isActive ? "page" : undefined,
          ...props,
        },
        icon,
        React.createElement("span", {}, label),
        children,
      ),
  };
});

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { AppSidebar } from "./app-sidebar";
import * as navModule from "../../config/nav";
import { captureEvent } from "../../lib/analytics";

const mockCaptureEvent = vi.mocked(captureEvent);

describe("AppSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    locationState.pathname = "/dashboard";
    mockCaptureEvent.mockClear();
  });

  it("renders without crashing", () => {
    render(<AppSidebar />);
    expect(screen.getByTestId("sidebar-root")).toBeInTheDocument();
  });

  it("renders the GrantPipe brand link", () => {
    render(<AppSidebar />);
    const link = screen.getByRole("link", { name: "GrantPipe home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders the GrantPipe logo image in the brand link", () => {
    render(<AppSidebar />);
    const logo = document.querySelector(
      'a[aria-label="GrantPipe home"] img[src="/brand/grantpipe-logo-mark.svg"]',
    );
    expect(logo).toHaveAttribute("src", "/brand/grantpipe-logo-mark.svg");
    expect(logo).toHaveAttribute("alt", "");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).toHaveAttribute("width", "32");
    expect(logo).toHaveAttribute("height", "32");
  });

  it("renders nav item labels from navSections", () => {
    render(<AppSidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Donors")).toBeInTheDocument();
    expect(screen.getByText("Grants")).toBeInTheDocument();
  });

  it("renders Settings nav item for admin role", () => {
    render(<AppSidebar userRole="admin" />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does NOT render Settings nav item for editor role", () => {
    render(<AppSidebar userRole="editor" />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("does NOT render Settings nav item for viewer role", () => {
    render(<AppSidebar userRole="viewer" />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("marks exactly one active route with aria-current='page'", () => {
    locationState.pathname = "/dashboard";
    render(<AppSidebar />);
    const activeItems = screen
      .getAllByTestId("sidebar-nav-item")
      .filter((el) => el.getAttribute("aria-current") === "page");
    // Exactly one nav item announces itself as the current page — never two.
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]).toHaveTextContent("Dashboard");
  });

  it("marks the single Accounting nav item active by prefix match for a nested accounting route", () => {
    locationState.pathname = "/accounting/chart-of-accounts";
    localStorage.setItem("gp_nav_sections_anonymous", JSON.stringify({ Accounting: false }));

    render(<AppSidebar />);

    const activeItems = screen
      .getAllByTestId("sidebar-nav-item")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]).toHaveTextContent("Accounting");
  });

  it("sets aria-current on the anchor for the active route using exact matching", () => {
    locationState.pathname = "/accounting";
    localStorage.setItem("gp_nav_sections_anonymous", JSON.stringify({ Accounting: false }));

    render(<AppSidebar />);

    // The active anchor itself carries aria-current=page (not just the wrapper),
    // and opts into exact active matching so TanStack Router won't prefix-mark
    // other routes as active.
    const activeAnchor = document.querySelector('a[href="/accounting"]');
    expect(activeAnchor).toHaveAttribute("aria-current", "page");
    expect(activeAnchor).toHaveAttribute("data-active-exact", "true");

    // No other anchor announces itself as the current page.
    const otherActiveAnchors = Array.from(document.querySelectorAll("a[href]")).filter(
      (a) => a !== activeAnchor && a.getAttribute("aria-current") === "page",
    );
    expect(otherActiveAnchors).toHaveLength(0);
  });

  it("marks only the single Accounting anchor active (via prefix match) on a nested accounting route, never duplicating with another anchor", () => {
    locationState.pathname = "/accounting/journal/new";
    localStorage.setItem("gp_nav_sections_anonymous", JSON.stringify({ Accounting: false }));

    render(<AppSidebar />);

    const activeAnchor = document.querySelector('a[href="/accounting"]');
    expect(activeAnchor).toHaveAttribute("aria-current", "page");
    expect(activeAnchor).toHaveAttribute("data-active-exact", "true");

    const activeAnchors = Array.from(document.querySelectorAll("a[href]")).filter(
      (a) => a.getAttribute("aria-current") === "page",
    );
    expect(activeAnchors).toHaveLength(1);
  });

  it("does not mark non-active routes with aria-current", () => {
    locationState.pathname = "/donors";
    render(<AppSidebar />);
    // /dashboard should NOT be active
    const items = screen.getAllByTestId("sidebar-nav-item");
    // At least one item has aria-current=page (donors)
    const activeItems = items.filter((el) => el.getAttribute("aria-current") === "page");
    expect(activeItems.length).toBeGreaterThan(0);
    // dashboard item should not have aria-current
    // We can check that not ALL items are active
    const inactiveItems = items.filter((el) => el.getAttribute("aria-current") !== "page");
    expect(inactiveItems.length).toBeGreaterThan(0);
  });

  it("normalizes a root pathname to '/' without marking any nav item active", () => {
    locationState.pathname = "/";
    render(<AppSidebar />);
    const activeItems = screen
      .getAllByTestId("sidebar-nav-item")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(activeItems).toHaveLength(0);
  });

  it("leaves every nav item inactive when the path matches no item exactly or by prefix", () => {
    locationState.pathname = "/totally-unknown-route";
    render(<AppSidebar />);
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const activeAnchors = anchors.filter((a) => a.getAttribute("aria-current") === "page");
    expect(activeAnchors).toHaveLength(0);
  });

  it("calls onNavigate when a sidebar nav item link (not just the brand) is clicked", () => {
    const onNavigate = vi.fn();
    locationState.pathname = "/dashboard";
    render(<AppSidebar onNavigate={onNavigate} />);
    fireEvent.click(document.querySelector('a[href="/donors"]')!);
    expect(onNavigate).toHaveBeenCalled();
  });

  it("renders the footer slot when provided", () => {
    render(<AppSidebar footer={<div data-testid="footer-content">Footer</div>} />);
    expect(screen.getByTestId("sidebar-footer")).toBeInTheDocument();
    expect(screen.getByTestId("footer-content")).toBeInTheDocument();
  });

  it("does not render sidebar footer when no footer prop is passed", () => {
    render(<AppSidebar />);
    expect(screen.queryByTestId("sidebar-footer")).not.toBeInTheDocument();
  });

  it("calls onNavigate when a nav link is clicked", () => {
    const onNavigate = vi.fn();
    render(<AppSidebar onNavigate={onNavigate} />);
    // The brand link triggers onNavigate on click
    const brandLink = screen.getByRole("link", { name: "GrantPipe home" });
    brandLink.click();
    expect(onNavigate).toHaveBeenCalled();
  });

  it("tracks app sidebar nav item clicks with route metadata", () => {
    locationState.pathname = "/dashboard";
    render(<AppSidebar />);

    fireEvent.click(document.querySelector('a[href="/donors"]')!);

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_nav_item_clicked", {
      nav_area: "sidebar",
      nav_item: "Donors",
      nav_item_id: "donors",
      destination_path: "/donors",
      current_path: "/dashboard",
      section: "Fundraising",
      collapsed: false,
    });
  });

  it("tracks brand navigation separately from product nav items", () => {
    locationState.pathname = "/donors";
    render(<AppSidebar collapsed={true} />);

    fireEvent.click(screen.getByRole("link", { name: "GrantPipe home" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_nav_item_clicked", {
      nav_area: "sidebar_brand",
      nav_item: "GrantPipe home",
      nav_item_id: "dashboard",
      destination_path: "/dashboard",
      current_path: "/donors",
      collapsed: true,
    });
  });

  it("renders section labels from navSections", () => {
    render(<AppSidebar />);
    expect(screen.getByText("Fundraising")).toBeInTheDocument();
    expect(screen.getByText("Grants & Funding")).toBeInTheDocument();
    expect(screen.getByText("Reporting & Compliance")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders Events in the Fundraising section", () => {
    render(<AppSidebar />);
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("renders collapse toggle button when onToggleCollapse is provided", () => {
    const onToggleCollapse = vi.fn();
    render(<AppSidebar onToggleCollapse={onToggleCollapse} />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("does not render collapse toggle button when onToggleCollapse is omitted", () => {
    render(<AppSidebar />);
    // The section toggle buttons use aria-label="Toggle <Section> section" so exclude them
    expect(
      screen.queryByRole("button", { name: /collapse sidebar|expand sidebar/i }),
    ).not.toBeInTheDocument();
  });

  it("toggle button has aria-label 'Collapse sidebar' when expanded", () => {
    render(<AppSidebar onToggleCollapse={vi.fn()} collapsed={false} />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("toggle button has aria-label 'Expand sidebar' when collapsed", () => {
    render(<AppSidebar onToggleCollapse={vi.fn()} collapsed={true} />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("calls onToggleCollapse when toggle button is clicked", () => {
    const onToggleCollapse = vi.fn();
    render(<AppSidebar onToggleCollapse={onToggleCollapse} />);
    screen.getByRole("button", { name: "Collapse sidebar" }).click();
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("hides GrantPipe text when sidebar is collapsed", () => {
    render(<AppSidebar collapsed={true} />);
    expect(screen.queryByText("GrantPipe")).not.toBeInTheDocument();
    expect(
      document.querySelector(
        'a[aria-label="GrantPipe home"] img[src="/brand/grantpipe-logo-mark.svg"]',
      ),
    ).toBeInTheDocument();
  });

  it("hides section labels and count badges when sidebar is collapsed", () => {
    render(<AppSidebar collapsed={true} />);

    expect(screen.queryByText("Fundraising")).not.toBeInTheDocument();
    expect(screen.queryByText("Reporting & Compliance")).not.toBeInTheDocument();
    expect(screen.queryByTestId("section-count-badge")).not.toBeInTheDocument();
  });

  it("keeps section items reachable in the collapsed rail even when a section was previously collapsed", () => {
    localStorage.setItem(
      "gp_nav_sections_user-rail",
      JSON.stringify({ Fundraising: true, Accounting: true }),
    );

    render(<AppSidebar collapsed={true} userId="user-rail" />);

    expect(screen.getByText("Donors")).toBeInTheDocument();
    expect(screen.getByText("Accounting")).toBeInTheDocument();
  });

  it("shows GrantPipe text when sidebar is not collapsed", () => {
    render(<AppSidebar />);
    expect(screen.getByText("GrantPipe")).toBeInTheDocument();
  });

  it("collapse toggle button has type='button'", () => {
    render(<AppSidebar onToggleCollapse={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("collapse toggle button uses pill shape and standard focus ring", () => {
    render(<AppSidebar onToggleCollapse={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(button).toHaveClass("rounded-full");
    expect(button.className).toContain("focus-visible:ring-[3px]");
    expect(button.className).toContain("focus-visible:ring-ring/50");
  });

  // --- Section collapsibility ---

  it("renders section toggle buttons for collapsible sections", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("button", { name: "Toggle Fundraising section" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle Grants & Funding section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle Reporting & Compliance section" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Accounting section" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Workspace section" })).toBeInTheDocument();
  });

  it("Accounting section is collapsed by default on first load", () => {
    render(<AppSidebar />);
    // When Accounting is collapsed, only the section header shows the
    // "Accounting" text — its single item (also labeled "Accounting") is hidden.
    expect(screen.getAllByText("Accounting")).toHaveLength(1);
  });

  it("Fundraising and Grants & Funding sections are expanded by default", () => {
    render(<AppSidebar />);
    expect(screen.getByText("Donors")).toBeInTheDocument();
    expect(screen.getByText("Grants")).toBeInTheDocument();
  });

  it("clicking Accounting toggle expands it and shows its item", () => {
    render(<AppSidebar />);
    const toggleBtn = screen.getByRole("button", { name: "Toggle Accounting section" });
    fireEvent.click(toggleBtn);
    // Section header and its single item both render the "Accounting" text now.
    expect(screen.getAllByText("Accounting")).toHaveLength(2);
  });

  it("tracks sidebar section expand and collapse actions", () => {
    render(<AppSidebar />);
    const toggleBtn = screen.getByRole("button", { name: "Toggle Accounting section" });

    fireEvent.click(toggleBtn);

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_nav_section_toggled", {
      section: "Accounting",
      action: "expanded",
      current_path: "/dashboard",
    });
  });

  it("clicking Fundraising toggle collapses it and hides items", () => {
    render(<AppSidebar />);
    // Donors is visible initially
    expect(screen.getByText("Donors")).toBeInTheDocument();
    const toggleBtn = screen.getByRole("button", { name: "Toggle Fundraising section" });
    fireEvent.click(toggleBtn);
    expect(screen.queryByText("Donors")).not.toBeInTheDocument();
  });

  it("shows item count badge next to Accounting label when collapsed", () => {
    render(<AppSidebar />);
    // Accounting is collapsed by default — badge with count should appear
    const accountingBtn = screen.getByRole("button", { name: "Toggle Accounting section" });
    expect(accountingBtn.textContent).toMatch(/Accounting/);
    // The count badge text should contain a number
    expect(accountingBtn.textContent).toMatch(/\d+/);
  });

  it("does not show count badge when Accounting is expanded", () => {
    render(<AppSidebar />);
    const toggleBtn = screen.getByRole("button", { name: "Toggle Accounting section" });
    fireEvent.click(toggleBtn); // expand it
    // After expanding, the count badge should be gone; only label text remains
    // Check that the button text is just "Accounting" (no number badge content visible)
    // We look for the count badge element directly
    expect(screen.queryByTestId("section-count-badge")).not.toBeInTheDocument();
  });

  it("renders Help pinned at the bottom always visible regardless of Workspace section state", () => {
    render(<AppSidebar />);
    // Help should always be visible
    expect(screen.getByText("Help")).toBeInTheDocument();
    // Collapse Workspace section
    const workspaceToggle = screen.getByRole("button", { name: "Toggle Workspace section" });
    fireEvent.click(workspaceToggle);
    // Help should still be visible even when Workspace is collapsed
    expect(screen.getByText("Help")).toBeInTheDocument();
  });

  it("Help pinned item is rendered inside pinned region with border separator", () => {
    render(<AppSidebar />);
    const pinnedRegion = screen.getByTestId("pinned-nav-items");
    expect(pinnedRegion).toBeInTheDocument();
    expect(pinnedRegion).toHaveTextContent("Help");
  });

  it("persists section collapse state to localStorage keyed by userId", () => {
    render(<AppSidebar userId="user-123" />);
    const toggleBtn = screen.getByRole("button", { name: "Toggle Fundraising section" });
    fireEvent.click(toggleBtn); // collapse Fundraising
    const stored = localStorage.getItem("gp_nav_sections_user-123");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as Record<string, boolean>;
    expect(parsed["Fundraising"]).toBe(true);
  });

  it("reads persisted section state from localStorage on mount", () => {
    localStorage.setItem(
      "gp_nav_sections_user-xyz",
      JSON.stringify({ Fundraising: true, Accounting: false }),
    );
    render(<AppSidebar userId="user-xyz" />);
    // Fundraising was persisted as collapsed → items hidden
    expect(screen.queryByText("Donors")).not.toBeInTheDocument();
    // Accounting was persisted as expanded → header + its single item both render
    expect(screen.getAllByText("Accounting")).toHaveLength(2);
  });

  it("section toggle buttons have type='button'", () => {
    render(<AppSidebar />);
    const toggleBtns = screen.getAllByRole("button", { name: /Toggle .* section/ });
    for (const btn of toggleBtns) {
      expect(btn).toHaveAttribute("type", "button");
    }
  });

  it("renders non-collapsible labeled section as a span, not a button", () => {
    const LayoutDashboard = (props: React.SVGProps<SVGSVGElement>) =>
      React.createElement("svg", props);
    const staticSection: navModule.NavSection = {
      label: "Static Section",
      collapsible: false,
      items: [
        {
          to: "/static",
          label: "Static Item",
          navItemId: "static-item",
          icon: LayoutDashboard as navModule.NavIcon,
        },
      ],
    };
    const filterSpy = vi.spyOn(navModule, "filterNavForAccess").mockReturnValue([staticSection]);

    render(<AppSidebar />);

    // The label should render as a <span>, not a <button>
    const spans = screen
      .getAllByText("Static Section")
      .filter((el) => el.tagName.toLowerCase() === "span");
    expect(spans.length).toBeGreaterThan(0);
    // No button with this label text should exist
    expect(screen.queryByRole("button", { name: /Static Section/ })).not.toBeInTheDocument();

    filterSpy.mockRestore();
  });
});
