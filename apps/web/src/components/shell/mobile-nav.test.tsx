import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, ...props }, children),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/dashboard" } }),
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
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "sheet", "data-open": open ? "true" : "false" },
        // Render content only when open (simulates modal behavior)
        open ? children : null,
        // Always render a close button to simulate trigger
        React.createElement(
          "button",
          {
            onClick: () => onOpenChange(!open),
            "data-testid": "sheet-toggle",
            "aria-label": "Toggle sheet",
          },
          "Toggle",
        ),
      ),
    SheetContent: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      side?: string;
      className?: string;
      "data-slot"?: string;
    }) => React.createElement("div", { "data-testid": "sheet-content", ...props }, children),
    SheetHeader: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement("div", { "data-testid": "sheet-header", className }, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("h2", { "data-testid": "sheet-title" }, children),
    SheetDescription: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("p", { "data-testid": "sheet-description", className }, children),
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
        label ? React.createElement("span", {}, label) : null,
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

import { MobileNav } from "./mobile-nav";

describe("MobileNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<MobileNav open={false} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });

  it("does not show nav content when closed", () => {
    render(<MobileNav open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument();
  });

  it("shows nav content when open", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument();
  });

  it("renders the AppSidebar inside the sheet when open", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("sidebar-root")).toBeInTheDocument();
  });

  it("renders nav items when open", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Donors")).toBeInTheDocument();
  });

  it("renders 'Navigation' title for screen readers", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("renders a description for the mobile navigation dialog", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("sheet-description")).toHaveTextContent(
      "Primary navigation links for GrantPipe.",
    );
  });

  it("shows Settings for admin role when open", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} userRole="admin" />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides Settings for editor role when open", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} userRole="editor" />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("renders footer slot when provided and open", () => {
    render(
      <MobileNav
        open={true}
        onOpenChange={vi.fn()}
        footer={<div data-testid="mobile-footer">Footer</div>}
      />,
    );
    expect(screen.getByTestId("mobile-footer")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-footer")).toBeInTheDocument();
  });

  it("applies the mobile-nav layout token to the sheet content", () => {
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    const sheetContent = screen.getByTestId("sheet-content");
    expect(sheetContent.className).toContain(
      "w-[min(var(--spacing-layout-mobile-nav),calc(100vw-3rem))]",
    );
    expect(sheetContent.className).not.toContain("w-[280px]");
  });

  it("calls onOpenChange when sheet toggle is fired", () => {
    const onOpenChange = vi.fn();
    render(<MobileNav open={false} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId("sheet-toggle"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("closes the sheet (calls onOpenChange(false)) when a nav item link is clicked", () => {
    const onOpenChange = vi.fn();
    render(<MobileNav open={true} onOpenChange={onOpenChange} />);
    // Clicking the brand link should trigger onNavigate which calls close()
    const brandLink = screen.getByRole("link", { name: "GrantPipe home" });
    fireEvent.click(brandLink);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("passes userId to AppSidebar so collapse state is keyed per user", () => {
    const getItemSpy = vi.spyOn(localStorage, "getItem");
    render(<MobileNav open={true} onOpenChange={vi.fn()} userId="user-abc" />);
    const calledKeys = getItemSpy.mock.calls.map(([key]) => key);
    expect(calledKeys.some((k) => k === "gp_nav_sections_user-abc")).toBe(true);
    getItemSpy.mockRestore();
  });

  it("falls back to anonymous storage key when userId is omitted", () => {
    const getItemSpy = vi.spyOn(localStorage, "getItem");
    render(<MobileNav open={true} onOpenChange={vi.fn()} />);
    const calledKeys = getItemSpy.mock.calls.map(([key]) => key);
    expect(calledKeys.some((k) => k === "gp_nav_sections_anonymous")).toBe(true);
    getItemSpy.mockRestore();
  });
});
