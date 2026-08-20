import { Link } from "@tanstack/react-router";
import { Bell, Menu, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button, IconButton, TopbarLeft, TopbarRight, TopbarRoot } from "@grantpipe/ui";

import { captureEvent } from "../../lib/analytics";

interface AppTopbarProps {
  onOpenCommandPalette: () => void;
  onOpenMobileNav: () => void;
  sidebarCollapsed?: boolean;
  leftSlot?: ReactNode;
  statusSlot?: ReactNode;
  notificationsSlot?: ReactNode;
  userMenu?: ReactNode;
}

export function AppTopbar({
  onOpenCommandPalette,
  onOpenMobileNav,
  sidebarCollapsed = false,
  leftSlot,
  statusSlot,
  notificationsSlot,
  userMenu,
}: AppTopbarProps) {
  const handleOpenMobileNav = () => {
    captureEvent("app_mobile_nav_opened", {
      source: "topbar",
    });
    onOpenMobileNav();
  };

  const handleOpenCommandPalette = (source: "topbar_desktop" | "topbar_mobile") => {
    captureEvent("command_palette_opened", {
      source,
    });
    onOpenCommandPalette();
  };

  return (
    <TopbarRoot
      sidebarWidth={
        sidebarCollapsed
          ? "var(--spacing-layout-sidebar-collapsed)"
          : "var(--spacing-layout-sidebar)"
      }
    >
      <TopbarLeft>
        <IconButton
          className="md:hidden"
          onClick={handleOpenMobileNav}
          tooltip="Navigation"
          aria-label="Open navigation"
        >
          <Menu className="size-4" aria-hidden />
        </IconButton>
        {leftSlot}
      </TopbarLeft>
      <TopbarRight>
        {statusSlot}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleOpenCommandPalette("topbar_desktop")}
          aria-label="Open command palette (⌘K)"
          className="hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span>Search</span>
          <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
            <span>⌘K</span>
          </kbd>
        </Button>
        <IconButton
          className="md:hidden"
          onClick={() => handleOpenCommandPalette("topbar_mobile")}
          tooltip="Search (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="size-4" aria-hidden />
        </IconButton>
        {notificationsSlot ?? (
          <IconButton asChild tooltip="Notifications" aria-label="Notifications">
            <Link to="/notifications">
              <Bell className="size-4" aria-hidden />
            </Link>
          </IconButton>
        )}
        {userMenu ? <span className="shrink-0 md:hidden">{userMenu}</span> : null}
      </TopbarRight>
    </TopbarRoot>
  );
}
