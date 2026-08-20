import type { ReactNode } from "react";

interface AppShellProps {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  beforeMain?: ReactNode;
  afterMain?: ReactNode;
  variant?: "default" | "minimal";
  sidebarCollapsed?: boolean;
  children: ReactNode;
}

export function AppShell({
  sidebar,
  topbar,
  beforeMain,
  afterMain,
  variant = "default",
  sidebarCollapsed,
  children,
}: AppShellProps) {
  const contentSpacingClass = topbar ? "pt-[var(--spacing-layout-topbar-offset)]" : "";

  if (variant === "minimal") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main id="main-content" tabIndex={-1} className="mx-auto w-full">
          {children}
        </main>
        {afterMain}
      </div>
    );
  }
  return (
    <div
      className="min-h-screen bg-background text-foreground md:grid"
      style={
        sidebar
          ? {
              gridTemplateColumns: sidebarCollapsed
                ? "var(--spacing-layout-sidebar-collapsed) minmax(0,1fr)"
                : "var(--spacing-layout-sidebar) minmax(0,1fr)",
              transition: "grid-template-columns 150ms ease-in-out",
            }
          : undefined
      }
    >
      {sidebar ? (
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </div>
      ) : null}
      <div className="flex min-h-screen min-w-0 flex-col">
        {topbar}
        <div className={contentSpacingClass}>
          {beforeMain}
          <main id="main-content" tabIndex={-1} className="flex-1">
            <div className="mx-auto w-full max-w-layout-shell pb-24">{children}</div>
          </main>
        </div>
        {afterMain}
      </div>
    </div>
  );
}
