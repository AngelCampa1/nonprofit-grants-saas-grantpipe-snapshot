import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const { mockUseUnreadNotificationCount } = vi.hoisted(() => ({
  mockUseUnreadNotificationCount: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    IconButton: ({
      children,
      "aria-label": ariaLabel,
      asChild,
      tooltip: _tooltip,
      ...props
    }: {
      children: React.ReactNode;
      "aria-label"?: string;
      asChild?: boolean;
      tooltip?: string;
    } & React.HTMLAttributes<HTMLElement>) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(
          children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
          {
            "aria-label": ariaLabel,
            ...(children.props as Record<string, unknown>),
          },
        );
      }
      return React.createElement("button", { "aria-label": ariaLabel, ...props }, children);
    },
  };
});

vi.mock("../../hooks/use-notifications", () => ({
  useUnreadNotificationCount: mockUseUnreadNotificationCount,
}));

import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a notifications link to /notifications", () => {
    mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    render(<NotificationBell />);
    const link = screen.getByRole("link", { name: "Notifications" });
    expect(link).toHaveAttribute("href", "/notifications");
  });

  it("does not render a badge when there are no unread notifications", () => {
    mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    const { container } = render(<NotificationBell />);
    expect(container.querySelector(".bg-destructive")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });

  it("renders the unread count badge and an accessible label when there are unread notifications", () => {
    mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 7 } });
    const { container } = render(<NotificationBell />);
    const badge = container.querySelector(".bg-destructive");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("7");
    expect(badge).toHaveClass("right-0");
    expect(badge).toHaveClass("top-0");
    expect(badge).not.toHaveClass("-right-1");
    expect(badge).not.toHaveClass("-top-1");
    expect(screen.getByRole("link", { name: "Notifications (7 unread)" })).toBeInTheDocument();
  });

  it("caps the displayed badge count at 99+", () => {
    mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 250 } });
    const { container } = render(<NotificationBell />);
    expect(container.querySelector(".bg-destructive")).toHaveTextContent("99+");
    expect(screen.getByRole("link", { name: "Notifications (250 unread)" })).toBeInTheDocument();
  });

  it("treats missing data as zero unread", () => {
    mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    const { container } = render(<NotificationBell />);
    expect(container.querySelector(".bg-destructive")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });
});
