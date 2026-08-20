import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const markAllReadMutate = vi.fn();
  const markReadMutate = vi.fn();
  const updatePreferenceMutate = vi.fn();
  const notificationMutations = {
    markAllRead: { mutate: markAllReadMutate, isPending: false },
    markRead: {
      mutate: markReadMutate,
      isPending: false,
      variables: undefined as string | undefined,
    },
    updatePreference: {
      mutate: updatePreferenceMutate,
      isPending: false,
      variables: undefined as { notificationType: string } | undefined,
    },
  };

  return {
    mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
      component: config.component,
      path,
    })),
    mockUseNotifications: vi.fn(),
    mockUseUnreadNotificationCount: vi.fn(),
    mockUseNotificationPreferences: vi.fn(),
    mockUseNotificationMutations: vi.fn(() => notificationMutations),
    markAllReadMutate,
    markReadMutate,
    updatePreferenceMutate,
    notificationMutations,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
}));

vi.mock("../../hooks/use-notifications", () => ({
  useNotifications: hoisted.mockUseNotifications,
  useUnreadNotificationCount: hoisted.mockUseUnreadNotificationCount,
  useNotificationPreferences: hoisted.mockUseNotificationPreferences,
  useNotificationMutations: hoisted.mockUseNotificationMutations,
}));

vi.mock("@grantpipe/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div
      data-slot="page-shell"
      className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span data-slot="badge" {...props}>
      {children}
    </span>
  ),
  PageHeader: ({
    kicker,
    title,
    description,
    actions,
  }: {
    kicker?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div data-slot="page-header">
      {kicker ? <div data-slot="page-header-kicker">{kicker}</div> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div data-slot="page-header-actions">{actions}</div> : null}
    </div>
  ),
  Alert: ({
    title,
    variant,
    children,
  }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; variant?: string }) => (
    <div data-slot="alert" data-variant={variant ?? "default"} role="alert">
      {title ? <p data-slot="alert-title">{title}</p> : null}
      <div data-slot="alert-content">{children}</div>
    </div>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-slot="skeleton" data-testid="skeleton" className={className} aria-hidden="true" />
  ),
  EmptyState: ({
    title,
    description,
  }: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
  }) => (
    <div data-slot="empty-state" role="region" aria-label={title}>
      <h3 data-slot="empty-state-title">{title}</h3>
      {description ? <p data-slot="empty-state-description">{description}</p> : null}
    </div>
  ),
}));

import { NotificationsPage } from "./notifications";

describe("NotificationsPage", () => {
  beforeEach(() => {
    hoisted.mockUseNotifications.mockReset();
    hoisted.mockUseUnreadNotificationCount.mockReset();
    hoisted.mockUseNotificationPreferences.mockReset();
    hoisted.mockUseNotificationMutations.mockClear();
    hoisted.markAllReadMutate.mockReset();
    hoisted.markReadMutate.mockReset();
    hoisted.updatePreferenceMutate.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
    hoisted.notificationMutations.markAllRead.isPending = false;
    hoisted.notificationMutations.markRead.isPending = false;
    hoisted.notificationMutations.markRead.variables = undefined;
    hoisted.notificationMutations.updatePreference.isPending = false;
    hoisted.notificationMutations.updatePreference.variables = undefined;
  });

  it("shows empty states when there are no notifications or preferences", () => {
    hoisted.mockUseNotifications.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.getByText("0 unread notifications.")).toBeInTheDocument();
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(screen.getByText("No notification preferences saved yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Right now, every alert goes to your inbox and email. Your saved rules show up here.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  });

  it("shows skeleton loading states instead of empty inbox placeholders", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<NotificationsPage />);

    // 3 skeletons for notifications + 2 skeletons for preferences = 5 total
    expect(screen.getAllByTestId("skeleton")).toHaveLength(5);
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No notification preferences saved yet")).not.toBeInTheDocument();
  });

  it("renders 3 notification skeletons and 2 preference skeletons while loading", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<NotificationsPage />);

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons).toHaveLength(5);
    expect(skeletons[0]).toHaveClass("h-20");
    expect(skeletons[3]).toHaveClass("h-16");
  });

  it("shows explicit error states instead of false empty states", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<NotificationsPage />);

    expect(screen.getByText("Unable to load notifications.")).toBeInTheDocument();
    expect(screen.getByText("Unable to load notification preferences.")).toBeInTheDocument();
  });

  it("renders notification bodies and degrades the unread summary when the count is missing", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant approved",
            body: "The board approved the grant.",
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.getByText("Unread count unavailable.")).toBeInTheDocument();
    expect(screen.getByText("The board approved the grant.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeEnabled();
  });

  it("falls back to empty lists when notification data is not loaded yet", () => {
    hoisted.mockUseNotifications.mockReturnValue({ data: undefined });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 2 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: undefined });

    render(<NotificationsPage />);

    expect(screen.getByText("2 unread notifications.")).toBeInTheDocument();
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(screen.getByText("No notification preferences saved yet")).toBeInTheDocument();
  });

  it("marks unread notifications and toggles preferences", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
          {
            id: "notif-2",
            title: "Read notification",
            body: "Already seen",
            readAt: "2026-04-07T21:00:00.000Z",
            createdAt: "2026-04-07T19:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-1",
          notificationType: "grant_status",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ],
    });

    render(<NotificationsPage />);

    expect(screen.getByText("Grant due soon")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByTestId("notification-row-notif-1")).toHaveAttribute("data-unread", "true");
    expect(screen.getByTestId("notification-row-notif-1")).toHaveClass("border-primary/40");
    expect(screen.getByTestId("notification-row-notif-1")).toHaveClass("bg-primary/5");
    expect(screen.getByTestId("notification-row-notif-2")).toHaveAttribute("data-unread", "false");
    expect(screen.getByTestId("notification-row-notif-2")).toHaveClass("border-border");
    expect(screen.getByText("No details.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByTestId("notification-preference-actions-pref-1")).toHaveClass("flex-col");
    expect(screen.getByTestId("notification-preference-actions-pref-1")).toHaveClass("sm:flex-row");

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn email off" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn in-app on" }));

    expect(hoisted.markAllReadMutate).toHaveBeenCalledWith(undefined, {
      onError: expect.any(Function),
    });
    expect(hoisted.markReadMutate).toHaveBeenCalledWith("notif-1", {
      onError: expect.any(Function),
      onSettled: expect.any(Function),
    });
    expect(hoisted.updatePreferenceMutate).toHaveBeenCalledWith(
      {
        id: "pref-1",
        notificationType: "grant_status",
        emailEnabled: false,
        inAppEnabled: false,
      },
      { onError: expect.any(Function) },
    );
    expect(hoisted.updatePreferenceMutate).toHaveBeenCalledWith(
      {
        id: "pref-1",
        notificationType: "grant_status",
        emailEnabled: true,
        inAppEnabled: true,
      },
      { onError: expect.any(Function) },
    );
  });

  it("surfaces an error alert when marking all notifications read fails", () => {
    hoisted.markAllReadMutate.mockImplementation((_vars, opts) =>
      opts?.onError?.(new Error("Mark all read failed")),
    );
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.queryByText("Unable to complete the action")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Mark all read failed")).toBeInTheDocument();
  });

  it("surfaces an error alert when marking a single notification read fails", () => {
    hoisted.markReadMutate.mockImplementation((_id, opts) =>
      opts?.onError?.(new Error("Mark read failed")),
    );
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Mark read failed")).toBeInTheDocument();
  });

  it("surfaces an error alert when a preference toggle fails", () => {
    hoisted.updatePreferenceMutate.mockImplementation((_vars, opts) =>
      opts?.onError?.(new Error("Preference update failed")),
    );
    hoisted.mockUseNotifications.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-1",
          notificationType: "grant_status",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ],
    });

    render(<NotificationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Turn email off" }));
    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Preference update failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when an action fails without an Error", () => {
    hoisted.markAllReadMutate.mockImplementation((_vars, opts) =>
      opts?.onError?.("unexpected non-error rejection"),
    );
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.getByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("clears a prior action error when a later action starts", () => {
    hoisted.markAllReadMutate.mockImplementationOnce((_vars, opts) =>
      opts?.onError?.(new Error("First failure")),
    );
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.getByText("First failure")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.queryByText("First failure")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to complete the action")).not.toBeInTheDocument();
  });

  it("renders alternate preference states", () => {
    hoisted.mockUseNotifications.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-2",
          notificationType: "donation_receipt",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    });

    render(<NotificationsPage />);

    expect(screen.getByText("Email: Off | In-app: On")).toBeInTheDocument();
  });

  it("renders human preference labels and stateful action copy", () => {
    hoisted.mockUseNotifications.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-2",
          notificationType: "grant_status",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ],
    });

    render(<NotificationsPage />);

    expect(screen.getByText("Grant Status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn email off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn in-app on" })).toBeInTheDocument();
  });

  it("formats notification timestamps as UTC date-time strings", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-utc",
            title: "Timestamped",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:30:00.000Z",
          },
        ],
        total: 1,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    // formatUtcDateTime appends " UTC"
    expect(screen.getByText(/UTC$/)).toBeInTheDocument();
    // Should include the canonical month/day fragment in en-US formatting
    expect(screen.getByText(/Apr 7, 2026/)).toBeInTheDocument();
  });

  it("does not render pagination when total fits within a single page", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-only",
            title: "Only",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
        total: 1,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.queryByTestId("notifications-pagination")).not.toBeInTheDocument();
  });

  it("renders pagination and advances pages when Next is clicked", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "One",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
        total: 60,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.getByTestId("notifications-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("disables Next on the last page and supports navigating back with Previous", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "One",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
        total: 26,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("hides pagination when the notifications query errors", () => {
    hoisted.mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: undefined });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    expect(screen.queryByTestId("notifications-pagination")).not.toBeInTheDocument();
  });

  it("disables row-level Mark read button while its id is pending (after click)", () => {
    // markRead.mutate captures the call but never calls onSettled — simulating in-flight
    hoisted.markReadMutate.mockImplementation(() => {
      // intentionally does not call onSettled
    });
    hoisted.notificationMutations.updatePreference.isPending = true;
    hoisted.notificationMutations.updatePreference.variables = { notificationType: "grant_status" };
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-1",
          notificationType: "grant_status",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ],
    });

    render(<NotificationsPage />);

    // Before click the Mark read button is not yet disabled by pending set
    const markReadBtn = screen.getByRole("button", { name: "Mark read" });
    expect(markReadBtn).not.toBeDisabled();

    fireEvent.click(markReadBtn);

    // After click the id is in pendingReadIds so button becomes disabled
    expect(markReadBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turn email off" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turn in-app on" })).toBeDisabled();
  });

  it("only disables the preference row whose toggle request is in flight", () => {
    hoisted.notificationMutations.updatePreference.isPending = true;
    hoisted.notificationMutations.updatePreference.variables = { notificationType: "grant_status" };
    hoisted.mockUseNotifications.mockReturnValue({ data: { data: [] } });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 0 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({
      data: [
        {
          id: "pref-1",
          notificationType: "grant_status",
          emailEnabled: true,
          inAppEnabled: false,
        },
        {
          id: "pref-2",
          notificationType: "report_due",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    });

    render(<NotificationsPage />);

    const row1 = screen.getByTestId("notification-preference-actions-pref-1");
    const row2 = screen.getByTestId("notification-preference-actions-pref-2");
    within(row1)
      .getAllByRole("button")
      .forEach((btn) => expect(btn).toBeDisabled());
    within(row2)
      .getAllByRole("button")
      .forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("only disables the row whose mark-read button was clicked while in flight", () => {
    // mutate stays pending — never calls onSettled
    hoisted.markReadMutate.mockImplementation(() => {
      // intentionally does not call onSettled
    });
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-1",
            title: "Grant due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
          {
            id: "notif-2",
            title: "Report due soon",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T21:00:00.000Z",
          },
        ],
        total: 2,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 2 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    const markReadButtons = screen.getAllByRole("button", { name: "Mark read" });
    expect(markReadButtons).toHaveLength(2);

    // Click row A (notif-1) — mutation stays in flight
    fireEvent.click(markReadButtons[0]!);

    // Row A is now disabled; row B is still clickable
    expect(markReadButtons[0]).toBeDisabled();
    expect(markReadButtons[1]).not.toBeDisabled();
  });

  it("cross-row isolation: clicking row A does not disable row B while A is in flight", () => {
    // mutate never settles — simulates network in-flight
    hoisted.markReadMutate.mockImplementation(() => {
      // intentionally does not call onSettled
    });
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-a",
            title: "Notification A",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
          {
            id: "notif-b",
            title: "Notification B",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T21:00:00.000Z",
          },
        ],
        total: 2,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 2 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    const buttons = screen.getAllByRole("button", { name: "Mark read" });
    expect(buttons).toHaveLength(2);

    // Both enabled before any click
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();

    // Click row A — stays in flight
    fireEvent.click(buttons[0]!);

    // Row A disabled, row B still enabled
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("re-enables the Mark read button after onSettled fires", () => {
    let capturedOnSettled: (() => void) | undefined;
    hoisted.markReadMutate.mockImplementation((_id, opts) => {
      capturedOnSettled = opts?.onSettled;
    });
    hoisted.mockUseNotifications.mockReturnValue({
      data: {
        data: [
          {
            id: "notif-settle",
            title: "Settling notification",
            body: null,
            readAt: null,
            createdAt: "2026-04-07T20:00:00.000Z",
          },
        ],
        total: 1,
      },
    });
    hoisted.mockUseUnreadNotificationCount.mockReturnValue({ data: { unreadCount: 1 } });
    hoisted.mockUseNotificationPreferences.mockReturnValue({ data: [] });

    render(<NotificationsPage />);

    const btn = screen.getByRole("button", { name: "Mark read" });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(btn).toBeDisabled();

    // Simulate mutation settling — wrap in act because it triggers setState
    act(() => {
      capturedOnSettled?.();
    });
    expect(btn).not.toBeDisabled();
  });
});
