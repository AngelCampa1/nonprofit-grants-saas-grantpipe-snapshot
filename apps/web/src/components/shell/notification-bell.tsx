import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { IconButton } from "@grantpipe/ui";

import { useUnreadNotificationCount } from "../../hooks/use-notifications";

export function NotificationBell() {
  const { data } = useUnreadNotificationCount();
  const unreadCount = data?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const ariaLabel = hasUnread ? `Notifications (${unreadCount} unread)` : "Notifications";

  return (
    <IconButton asChild tooltip="Notifications" aria-label={ariaLabel}>
      <Link to="/notifications" className="relative">
        <Bell className="size-4" aria-hidden />
        {hasUnread ? (
          <span
            aria-hidden
            className="absolute right-0 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold leading-none text-destructive-foreground"
          >
            {badgeLabel}
          </span>
        ) : null}
      </Link>
    </IconButton>
  );
}
