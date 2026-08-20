import * as React from "react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// TopbarRoot
// ---------------------------------------------------------------------------

interface TopbarRootProps {
  height?: string;
  sidebarWidth?: string;
  className?: string;
  children?: React.ReactNode;
}

function TopbarRoot({
  height = "var(--spacing-layout-topbar-height)",
  sidebarWidth = "var(--spacing-layout-sidebar)",
  className,
  children,
}: TopbarRootProps) {
  return (
    <header
      data-slot="topbar-root"
      style={
        {
          "--topbar-height": height,
          "--topbar-sidebar-width": sidebarWidth,
          height,
        } as React.CSSProperties
      }
      className={cn(
        "fixed inset-x-0 left-0 right-0 top-0 z-30 flex items-center border-b border-border bg-background px-4 md:left-[var(--topbar-sidebar-width)]",
        className,
      )}
    >
      {children}
    </header>
  );
}

// ---------------------------------------------------------------------------
// TopbarLeft
// ---------------------------------------------------------------------------

interface TopbarLeftProps {
  className?: string;
  children?: React.ReactNode;
}

function TopbarLeft({ className, children }: TopbarLeftProps) {
  return (
    <div data-slot="topbar-left" className={cn("flex min-w-0 flex-1 items-center", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopbarRight
// ---------------------------------------------------------------------------

interface TopbarRightProps {
  className?: string;
  children?: React.ReactNode;
}

function TopbarRight({ className, children }: TopbarRightProps) {
  return (
    <div data-slot="topbar-right" className={cn("flex shrink-0 items-center gap-1", className)}>
      {children}
    </div>
  );
}

export { TopbarRoot, TopbarLeft, TopbarRight };
export type { TopbarRootProps, TopbarLeftProps, TopbarRightProps };
