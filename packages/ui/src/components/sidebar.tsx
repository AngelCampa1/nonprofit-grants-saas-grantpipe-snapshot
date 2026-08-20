import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// SidebarContext
// ---------------------------------------------------------------------------

interface SidebarContextValue {
  collapsed: boolean;
}

const SidebarContext = React.createContext<SidebarContextValue>({ collapsed: false });

// ---------------------------------------------------------------------------
// SidebarRoot
// ---------------------------------------------------------------------------

interface SidebarRootProps {
  width?: string;
  className?: string;
  children?: React.ReactNode;
  collapsed?: boolean;
}

function SidebarRoot({
  width = "var(--spacing-layout-sidebar)",
  className,
  children,
  collapsed = false,
}: SidebarRootProps) {
  const resolvedWidth = collapsed ? "var(--spacing-layout-sidebar-collapsed)" : width;
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div
        data-slot="sidebar-root"
        style={{ "--sidebar-width": resolvedWidth, width: resolvedWidth } as React.CSSProperties}
        className={cn(
          "h-full flex flex-col border-r border-border bg-card text-card-foreground",
          "transition-[width] duration-150 ease-in-out",
          className,
        )}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// SidebarHeader
// ---------------------------------------------------------------------------

interface SidebarHeaderProps {
  className?: string;
  children?: React.ReactNode;
}

function SidebarHeader({ className, children }: SidebarHeaderProps) {
  return (
    <div data-slot="sidebar-header" className={cn("shrink-0 px-3 py-4", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarNav
// ---------------------------------------------------------------------------

interface SidebarNavProps {
  className?: string;
  children?: React.ReactNode;
}

// Edge fade depth. Matches the nav's vertical rhythm so a partially hidden
// item reads as "there's more" rather than as a clipped row.
const SCROLL_FADE = "16px";

/**
 * Build the CSS mask that fades whichever edges have off-screen content.
 * Returns undefined when nothing is scrollable so no mask is applied.
 */
function scrollMask(canScrollUp: boolean, canScrollDown: boolean): string | undefined {
  if (canScrollUp && canScrollDown) {
    return `linear-gradient(to bottom, transparent, black ${SCROLL_FADE}, black calc(100% - ${SCROLL_FADE}), transparent)`;
  }
  if (canScrollUp) {
    return `linear-gradient(to bottom, transparent, black ${SCROLL_FADE})`;
  }
  if (canScrollDown) {
    return `linear-gradient(to bottom, black calc(100% - ${SCROLL_FADE}), transparent)`;
  }
  return undefined;
}

function SidebarNav({ className, children }: SidebarNavProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ up: false, down: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const syncEdges = () => {
      const up = el.scrollTop > 0;
      const down = Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight;
      setEdges((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
    };
    syncEdges();
    el.addEventListener("scroll", syncEdges, { passive: true });
    const observer = new ResizeObserver(syncEdges);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", syncEdges);
      observer.disconnect();
    };
  }, []);

  const maskImage = scrollMask(edges.up, edges.down);

  return (
    <div
      ref={ref}
      data-slot="sidebar-nav"
      data-can-scroll-up={edges.up ? "true" : undefined}
      data-can-scroll-down={edges.down ? "true" : undefined}
      className={cn("flex-1 overflow-y-auto px-2 py-1", className)}
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarFooter
// ---------------------------------------------------------------------------

interface SidebarFooterProps {
  className?: string;
  children?: React.ReactNode;
}

function SidebarFooter({ className, children }: SidebarFooterProps) {
  return (
    <div data-slot="sidebar-footer" className={cn("shrink-0 px-3 py-3", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarNavSection
// ---------------------------------------------------------------------------

interface SidebarNavSectionProps {
  label?: string;
  className?: string;
  children: React.ReactNode;
}

function SidebarNavSection({ label, className, children }: SidebarNavSectionProps) {
  const { collapsed } = React.useContext(SidebarContext);
  return (
    <div data-slot="sidebar-nav-section" className={cn("mb-1", className)}>
      {label && !collapsed ? (
        <p
          data-slot="sidebar-nav-section-label"
          className="mb-1 px-3 pt-3 text-[10px] font-medium uppercase tracking-caps text-muted-foreground"
        >
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarNavItem
// ---------------------------------------------------------------------------

interface SidebarNavItemProps {
  icon?: React.ReactNode;
  label: string;
  isActive?: boolean;
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function SidebarNavItem({
  icon,
  label,
  isActive = false,
  asChild = false,
  className,
  children,
  ...props
}: SidebarNavItemProps) {
  const { collapsed } = React.useContext(SidebarContext);

  const sharedProps = {
    "data-slot": "sidebar-nav-item" as const,
    "data-active": isActive ? "true" : undefined,
    title: collapsed ? label : undefined,
    className: cn(
      "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
      collapsed && "justify-center px-0 gap-0",
      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      "data-[active]:bg-primary/10 data-[active]:text-primary",
      className,
    ),
  };

  const content = (
    <>
      {icon ? (
        <span data-slot="sidebar-nav-item-icon" className="shrink-0 size-4">
          {icon}
        </span>
      ) : null}
      {!collapsed ? (
        <span data-slot="sidebar-nav-item-label" className="truncate">
          {label}
        </span>
      ) : null}
    </>
  );

  if (asChild) {
    return (
      <Slot.Root {...sharedProps} {...(props as React.HTMLAttributes<HTMLElement>)}>
        {React.cloneElement(
          React.Children.only(children) as React.ReactElement<{ children?: React.ReactNode }>,
          undefined,
          content,
        )}
      </Slot.Root>
    );
  }

  return (
    <button {...sharedProps} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
      {children}
    </button>
  );
}

export {
  SidebarContext,
  SidebarRoot,
  SidebarHeader,
  SidebarNav,
  SidebarFooter,
  SidebarNavSection,
  SidebarNavItem,
  scrollMask,
};
export type {
  SidebarRootProps,
  SidebarHeaderProps,
  SidebarNavProps,
  SidebarFooterProps,
  SidebarNavSectionProps,
  SidebarNavItemProps,
};
