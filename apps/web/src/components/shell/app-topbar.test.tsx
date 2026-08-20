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
}));

const mockTopbarRoot = vi.fn();

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    TopbarRoot: ({
      children,
      sidebarWidth,
    }: {
      children: React.ReactNode;
      sidebarWidth?: string;
    }) => {
      mockTopbarRoot({ sidebarWidth });
      return React.createElement(
        "header",
        { "data-testid": "topbar-root", "data-sidebar-width": sidebarWidth },
        children,
      );
    },
    TopbarLeft: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "topbar-left" }, children),
    TopbarRight: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "topbar-right" }, children),
    IconButton: ({
      children,
      onClick,
      "aria-label": ariaLabel,
      asChild,
      tooltip: _tooltip,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      "aria-label"?: string;
      asChild?: boolean;
      tooltip?: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(
          children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
          {
            "aria-label": ariaLabel,
            ...(children.props as Record<string, unknown>),
          },
        );
      }
      return React.createElement(
        "button",
        { onClick, "aria-label": ariaLabel, type: "button", ...props },
        children,
      );
    },
  };
});

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { AppTopbar } from "./app-topbar";
import { captureEvent } from "../../lib/analytics";

const mockCaptureEvent = vi.mocked(captureEvent);

describe("AppTopbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the expanded sidebar width to the shared topbar shell by default", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    expect(screen.getByTestId("topbar-root")).toHaveAttribute(
      "data-sidebar-width",
      "var(--spacing-layout-sidebar)",
    );
    expect(mockTopbarRoot).toHaveBeenCalledWith({
      sidebarWidth: "var(--spacing-layout-sidebar)",
    });
  });

  it("passes the collapsed sidebar width to the shared topbar shell", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        sidebarCollapsed={true}
      />,
    );
    expect(screen.getByTestId("topbar-root")).toHaveAttribute(
      "data-sidebar-width",
      "var(--spacing-layout-sidebar-collapsed)",
    );
    expect(mockTopbarRoot).toHaveBeenCalledWith({
      sidebarWidth: "var(--spacing-layout-sidebar-collapsed)",
    });
  });

  it("renders without crashing", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    expect(screen.getByTestId("topbar-root")).toBeInTheDocument();
  });

  it("has a menu button for mobile nav", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
  });

  it("calls onOpenMobileNav when menu button is clicked", () => {
    const onOpenMobileNav = vi.fn();
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={onOpenMobileNav} />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(onOpenMobileNav).toHaveBeenCalledOnce();
  });

  it("tracks when the mobile app nav is opened from the topbar", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_mobile_nav_opened", {
      source: "topbar",
    });
  });

  it("has a search / command palette button", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    // Desktop search button (aria-label includes ⌘K) and mobile icon-only button both present
    expect(screen.getByRole("button", { name: "Open command palette (⌘K)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open command palette" })).toBeInTheDocument();
  });

  it("calls onOpenCommandPalette when the desktop search button is clicked", () => {
    const onOpenCommandPalette = vi.fn();
    render(<AppTopbar onOpenCommandPalette={onOpenCommandPalette} onOpenMobileNav={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open command palette (⌘K)" }));
    expect(onOpenCommandPalette).toHaveBeenCalledOnce();
  });

  it("tracks command palette opens from desktop and mobile controls", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);

    const commandButtons = screen.getAllByRole("button", { name: /Open command palette/ });
    fireEvent.click(commandButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("command_palette_opened", {
      source: "topbar_desktop",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("command_palette_opened", {
      source: "topbar_mobile",
    });
  });

  it("calls onOpenCommandPalette when the mobile search button is clicked", () => {
    const onOpenCommandPalette = vi.fn();
    render(<AppTopbar onOpenCommandPalette={onOpenCommandPalette} onOpenMobileNav={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    expect(onOpenCommandPalette).toHaveBeenCalledOnce();
  });

  it("has a notifications link", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });

  it("renders a custom notificationsSlot in place of the default bell", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        notificationsSlot={<div data-testid="notifications-slot">Bell</div>}
      />,
    );
    expect(screen.getByTestId("notifications-slot")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("does not render a theme toggle button", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /theme/i })).not.toBeInTheDocument();
  });

  it("renders the leftSlot when provided", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        leftSlot={<div data-testid="left-slot">breadcrumbs</div>}
      />,
    );
    expect(screen.getByTestId("left-slot")).toBeInTheDocument();
  });

  it("renders the userMenu slot when provided", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        userMenu={<div data-testid="user-menu">UserMenu</div>}
      />,
    );
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
  });

  it("keeps the mobile user menu from widening the topbar", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        userMenu={<div data-testid="user-menu">long account identity text</div>}
      />,
    );

    const wrapper = screen.getByTestId("user-menu").parentElement;
    expect(wrapper).toHaveClass("shrink-0");
    expect(wrapper).toHaveClass("md:hidden");
  });

  it("renders the status slot before the utility controls", () => {
    render(
      <AppTopbar
        onOpenCommandPalette={vi.fn()}
        onOpenMobileNav={vi.fn()}
        statusSlot={<div data-testid="status-slot">Trial</div>}
      />,
    );

    const right = screen.getByTestId("topbar-right");
    expect(screen.getByTestId("status-slot")).toBeInTheDocument();
    expect(right.firstElementChild).toHaveAttribute("data-testid", "status-slot");
  });

  it("desktop search button has pill shape and standard focus ring", () => {
    render(<AppTopbar onOpenCommandPalette={vi.fn()} onOpenMobileNav={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Open command palette (⌘K)" });
    expect(btn.className).toContain("rounded-full");
    expect(btn.className).not.toContain("rounded-md");
    expect(btn.className).not.toContain("rounded-lg");
  });
});
