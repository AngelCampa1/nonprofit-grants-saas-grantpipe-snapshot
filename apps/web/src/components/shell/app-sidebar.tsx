import { Link, useRouterState } from "@tanstack/react-router";
import {
  Button,
  IconButton,
  SidebarRoot,
  SidebarHeader,
  SidebarNav,
  SidebarFooter,
  SidebarNavItem,
  SidebarNavSection,
} from "@grantpipe/ui";
import { ChevronDown, ChevronLeft as ChevronLeftIcon, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { PermissionMap, PermissionOverrides } from "@grantpipe/shared";

import { filterNavForAccess, navSections, type AppRole, type NavItem } from "../../config/nav";
import { useNavSections } from "../../hooks/use-nav-sections";
import { captureEvent } from "../../lib/analytics";

interface AppSidebarProps {
  userRole?: AppRole;
  userPermissions?: PermissionMap | PermissionOverrides | null;
  userId?: string;
  footer?: ReactNode;
  onNavigate?: () => void;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({
  userRole,
  userPermissions,
  userId,
  footer,
  onNavigate,
  className,
  collapsed,
  onToggleCollapse,
}: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sections = filterNavForAccess(userRole, userPermissions, navSections);
  const { isCollapsed, toggle } = useNavSections(sections, userId ?? null);
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  // Active state rules:
  //   * Exact-match wins for any item whose `to` exactly equals the current path
  //     (prevents prefix collisions like `/settings` highlighting while user is
  //     on `/settings/billing`).
  //   * For nested routes that no nav item points at directly, fall back to the
  //     longest `to` that is a true parent prefix (`startsWith(to + "/")`), so
  //     deep pages still highlight the closest parent in the nav.
  const allItems = sections.flatMap((section) => section.items);
  const exactMatch = allItems.find((item) => item.to === normalizedPath);
  const prefixMatch = exactMatch
    ? null
    : allItems
        .filter((item) => normalizedPath.startsWith(`${item.to}/`))
        .sort((a, b) => b.to.length - a.to.length)[0];
  const activePath = exactMatch?.to ?? prefixMatch?.to;

  // Separate pinned items (always visible) from regular section items
  function trackSidebarNavigation(
    navArea: "sidebar" | "sidebar_brand",
    navItem: string,
    navItemId: string,
    destinationPath: string,
    section?: string,
  ) {
    captureEvent("app_nav_item_clicked", {
      nav_area: navArea,
      nav_item: navItem,
      nav_item_id: navItemId,
      destination_path: destinationPath,
      current_path: normalizedPath,
      ...(section ? { section } : {}),
      collapsed: collapsed === true,
    });
  }

  function renderNavItem(item: NavItem, sectionLabel?: string) {
    const Icon = item.icon;
    const isActive = item.to === activePath;
    return (
      <SidebarNavItem
        key={item.to}
        icon={<Icon aria-hidden className="size-4" />}
        label={item.label}
        isActive={isActive}
        asChild
      >
        <Link
          to={item.to}
          // Use exact matching so TanStack Router does not prefix-mark parent
          // routes (e.g. `/accounting` while on `/accounting/ledger`) as active.
          // The single active item is computed above via `activePath`; mirror it
          // onto `aria-current` so only one nav link announces the current page.
          activeOptions={{ exact: true }}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            trackSidebarNavigation("sidebar", item.label, item.navItemId, item.to, sectionLabel);
            onNavigate?.();
          }}
        />
      </SidebarNavItem>
    );
  }

  // Collect all pinned items from all sections
  const pinnedItems = sections.flatMap((s) => s.items.filter((item) => item.pinned));

  return (
    <SidebarRoot className={className} collapsed={collapsed}>
      <SidebarHeader className="relative">
        <Link
          to="/dashboard"
          onClick={() => {
            trackSidebarNavigation("sidebar_brand", "GrantPipe home", "dashboard", "/dashboard");
            onNavigate?.();
          }}
          className="flex items-center gap-2 px-2 py-1.5"
          aria-label="GrantPipe home"
        >
          <img
            src="/brand/grantpipe-logo-mark.svg"
            alt=""
            aria-hidden="true"
            width="32"
            height="32"
            className="size-8 shrink-0"
          />
          {!collapsed && (
            <span className="font-heading text-base font-semibold tracking-tight text-foreground">
              GrantPipe
            </span>
          )}
        </Link>
        {onToggleCollapse && (
          <IconButton
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            tooltip={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            size="xs"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 md:flex"
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronLeftIcon className="size-3.5" />
            )}
          </IconButton>
        )}
      </SidebarHeader>
      <SidebarNav>
        {sections.map((section, i) => {
          const sectionKey = section.label ?? `nav-${i.toString()}`;
          const sectionCollapsed =
            !collapsed && section.collapsible && section.label ? isCollapsed(section.label) : false;

          // Non-pinned items for this section
          const regularItems = section.items.filter((item) => !item.pinned);
          // Count only non-pinned items (items hidden when the section collapses)
          const itemCount = regularItems.length;

          return (
            <SidebarNavSection key={sectionKey} label={undefined}>
              {section.label && section.collapsible && !collapsed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    captureEvent("app_nav_section_toggled", {
                      section: section.label!,
                      action: sectionCollapsed ? "expanded" : "collapsed",
                      current_path: normalizedPath,
                    });
                    toggle(section.label!);
                  }}
                  aria-label={`Toggle ${section.label} section`}
                  className="flex h-auto w-full items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{section.label}</span>
                    {sectionCollapsed && (
                      <span
                        data-testid="section-count-badge"
                        className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
                      >
                        {itemCount}
                      </span>
                    )}
                  </span>
                  {sectionCollapsed ? (
                    <ChevronRight className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0" />
                  )}
                </Button>
              ) : section.label && !collapsed ? (
                <span className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </span>
              ) : null}
              {!sectionCollapsed && regularItems.map((item) => renderNavItem(item, section.label))}
            </SidebarNavSection>
          );
        })}
      </SidebarNav>
      {/* Pinned items — outside the scrollable nav so they stay visible */}
      {pinnedItems.length > 0 && (
        <div data-testid="pinned-nav-items" className="shrink-0 border-t border-border px-2 py-2">
          {pinnedItems.map((item) => renderNavItem(item))}
        </div>
      )}
      {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
    </SidebarRoot>
  );
}
