import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { PageTabs, type PageTabItem } from "@grantpipe/ui";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

import { isNavItemVisible } from "../../config/nav";
import type { AppPageTabItem } from "../../config/page-tabs";
import { useSession } from "../../hooks/use-session";
import { captureEvent } from "../../lib/analytics";

export interface AppPageTabsProps {
  groupId: string;
  items: AppPageTabItem[];
  ariaLabel?: string;
}

interface RouterLinkProps {
  to: string;
  className?: string;
  "aria-current"?: "page";
  onClick?: () => void;
  children: ReactNode;
}

// Adapter so the router-agnostic `PageTabs` primitive (packages/ui) can render
// real TanStack Router links. TanStack Router is registered with basepath
// "/app" (see main.tsx), but `location.pathname` from `useRouterState` is
// already basepath-relative — it never includes the "/app" prefix (mirrors
// AppSidebar's and AccountingSectionNav's active-path handling, which compare
// `state.location.pathname` directly against route paths like "/dashboard"
// with no basepath stripping of their own).
function RouterLink({
  to,
  className,
  "aria-current": ariaCurrent,
  onClick,
  children,
}: RouterLinkProps) {
  return (
    <Link to={to} className={className} aria-current={ariaCurrent} onClick={onClick}>
      {children}
    </Link>
  );
}

function defaultAriaLabel(groupId: string): string {
  return `${groupId.charAt(0).toUpperCase()}${groupId.slice(1)} sections`;
}

/**
 * Permission-aware wrapper around the presentational `PageTabs` primitive.
 * Filters `items` down to what the current session's role/permissions allow
 * (mirroring the same `isNavItemVisible` precedence the sidebar uses), and
 * renders nothing when zero or one tab remains visible — a lone tab is noise,
 * not navigation (e.g. an auditor on the Funds tabs only keeps "Overview"
 * since `programs` is permission level "none" for the auditor role).
 */
export function AppPageTabs({ groupId, items, ariaLabel }: AppPageTabsProps): ReactNode {
  const { memberRole, memberPermissions } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activePath = pathname.replace(/\/+$/, "") || "/";

  const visibleItems: PageTabItem[] = items.filter((item) =>
    isNavItemVisible(item, memberRole ?? undefined, memberPermissions),
  );

  if (visibleItems.length <= 1) {
    return null;
  }

  return (
    <PageTabs
      items={visibleItems}
      activePath={activePath}
      linkComponent={RouterLink}
      ariaLabel={ariaLabel ?? defaultAriaLabel(groupId)}
      className="mt-4"
      onSelect={(item) => {
        captureEvent(ANALYTICS_EVENTS.appPageTabClicked, {
          group_id: groupId,
          tab_label: item.label,
          destination_path: item.to,
          current_path: activePath,
        });
      }}
    />
  );
}
