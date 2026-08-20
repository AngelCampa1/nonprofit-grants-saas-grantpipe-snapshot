import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PageShell,
  Skeleton,
  cn,
} from "@grantpipe/ui";
import { BellIcon, SlidersHorizontalIcon } from "lucide-react";
import {
  useNotificationMutations,
  useNotificationPreferences,
  useNotifications,
  useUnreadNotificationCount,
} from "../../hooks/use-notifications";
import { formatUtcDateTime } from "../../lib/format";

const NOTIFICATIONS_PAGE_SIZE = 25;

interface NotificationsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function NotificationsPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: NotificationsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div data-testid="notifications-pagination" className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function formatNotificationPreferenceLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const notificationsQuery = useNotifications({ page, pageSize: NOTIFICATIONS_PAGE_SIZE });
  const unreadCountQuery = useUnreadNotificationCount();
  const preferencesQuery = useNotificationPreferences();
  const { markAllRead, markRead, updatePreference } = useNotificationMutations();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set());

  const runNotificationAction = (
    run: (handlers: { onError: (error: unknown) => void }) => void,
  ) => {
    setActionError(null);
    run({
      onError: (error) =>
        setActionError(error instanceof Error ? error.message : "Unable to complete this action."),
    });
  };

  const notificationRows = notificationsQuery.data?.data ?? [];
  const notificationsTotal = notificationsQuery.data?.total ?? 0;
  const preferences = preferencesQuery.data ?? [];
  const loadedUnreadCount = notificationRows.filter((notification) => !notification.readAt).length;
  const unreadCount = unreadCountQuery.data?.unreadCount ?? null;
  const hasUnreadNotifications = unreadCount !== null ? unreadCount > 0 : loadedUnreadCount > 0;
  const unreadLabel =
    unreadCount !== null
      ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
      : notificationsQuery.isLoading
        ? "Loading unread count…"
        : "Unread count unavailable.";

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Inbox management"
        title="Notifications"
        actions={
          <Button
            className="w-full sm:w-auto"
            disabled={!hasUnreadNotifications || markAllRead.isPending}
            onClick={() =>
              runNotificationAction((handlers) => markAllRead.mutate(undefined, handlers))
            }
          >
            Mark all read
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">{unreadLabel}</p>
      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Inbox</h2>
          <p className="text-sm text-muted-foreground">
            Review unread items and clear them once the work is handled.
          </p>
        </header>
        <div className="space-y-3">
          {notificationsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : notificationsQuery.isError ? (
            <Alert variant="destructive" title="Unable to load notifications.">
              Refresh the page or try again in a moment.
            </Alert>
          ) : (
            notificationRows.map(
              (notification: {
                id: string;
                title: string;
                body?: string | null;
                readAt?: string | null;
                createdAt: string;
              }) => {
                const isUnread = !notification.readAt;
                return (
                  <article
                    key={notification.id}
                    data-testid={`notification-row-${notification.id}`}
                    data-unread={isUnread ? "true" : "false"}
                    className={cn(
                      "rounded-2xl border p-4 shadow-sm transition-colors",
                      isUnread ? "border-primary/40 bg-primary/5" : "border-border bg-card/95",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{notification.title}</p>
                          {isUnread ? <Badge variant="warning">Unread</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {notification.body ?? "No details."}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatUtcDateTime(notification.createdAt)}
                        </p>
                      </div>
                      {isUnread ? (
                        <Button
                          className="w-full sm:w-auto"
                          variant="outline"
                          disabled={pendingReadIds.has(notification.id)}
                          onClick={() => {
                            setPendingReadIds((prev) => new Set(prev).add(notification.id));
                            runNotificationAction((handlers) =>
                              markRead.mutate(notification.id, {
                                onError: handlers.onError,
                                onSettled: () =>
                                  setPendingReadIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(notification.id);
                                    return next;
                                  }),
                              }),
                            );
                          }}
                        >
                          Mark read
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read</span>
                      )}
                    </div>
                  </article>
                );
              },
            )
          )}
          {!notificationsQuery.isLoading &&
            !notificationsQuery.isError &&
            notificationRows.length === 0 && (
              <EmptyState
                icon={<BellIcon className="size-5" />}
                title="No notifications yet"
                description="New alerts will land here as grants, reports, and reminders change."
              />
            )}
          {!notificationsQuery.isError && notificationsTotal > 0 ? (
            <NotificationsPagination
              page={page}
              pageSize={NOTIFICATIONS_PAGE_SIZE}
              total={notificationsTotal}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Choose which alerts show up here. Others go to email only.
          </p>
        </header>
        <div className="space-y-3">
          {preferencesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : preferencesQuery.isError ? (
            <Alert variant="destructive" title="Unable to load notification preferences.">
              Refresh the page or try again in a moment.
            </Alert>
          ) : (
            preferences.map(
              (preference: {
                id: string;
                notificationType: string;
                emailEnabled: boolean;
                inAppEnabled: boolean;
              }) => (
                <div
                  key={preference.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {formatNotificationPreferenceLabel(preference.notificationType)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Email: {preference.emailEnabled ? "On" : "Off"} | In-app:{" "}
                      {preference.inAppEnabled ? "On" : "Off"}
                    </p>
                  </div>
                  <div
                    data-testid={`notification-preference-actions-${preference.id}`}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={
                        updatePreference.isPending &&
                        updatePreference.variables?.notificationType === preference.notificationType
                      }
                      onClick={() =>
                        runNotificationAction((handlers) =>
                          updatePreference.mutate(
                            {
                              ...preference,
                              emailEnabled: !preference.emailEnabled,
                            },
                            handlers,
                          ),
                        )
                      }
                    >
                      {preference.emailEnabled ? "Turn email off" : "Turn email on"}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={
                        updatePreference.isPending &&
                        updatePreference.variables?.notificationType === preference.notificationType
                      }
                      onClick={() =>
                        runNotificationAction((handlers) =>
                          updatePreference.mutate(
                            {
                              ...preference,
                              inAppEnabled: !preference.inAppEnabled,
                            },
                            handlers,
                          ),
                        )
                      }
                    >
                      {preference.inAppEnabled ? "Turn in-app off" : "Turn in-app on"}
                    </Button>
                  </div>
                </div>
              ),
            )
          )}
          {!preferencesQuery.isLoading && !preferencesQuery.isError && preferences.length === 0 && (
            <EmptyState
              icon={<SlidersHorizontalIcon className="size-5" />}
              title="No notification preferences saved yet"
              description="Right now, every alert goes to your inbox and email. Your saved rules show up here."
            />
          )}
        </div>
      </section>
    </PageShell>
  );
}
