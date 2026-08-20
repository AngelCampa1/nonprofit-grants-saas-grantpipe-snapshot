import * as React from "react";
import { cn } from "../lib/utils";

export interface PageTabItem {
  to: string;
  label: string;
}

export interface PageTabsProps {
  items: PageTabItem[];
  /** normalized current pathname; exact match decides active state */
  activePath: string;
  /** injected link renderer so this package stays router-agnostic */
  linkComponent: React.ComponentType<{
    to: string;
    className?: string;
    "aria-current"?: "page";
    onClick?: () => void;
    children: React.ReactNode;
  }>;
  onSelect?: (item: PageTabItem) => void;
  className?: string;
  /** accessible label for the nav landmark, e.g. "Grants sections" */
  ariaLabel: string;
}

export function PageTabs({
  items,
  activePath,
  linkComponent: Link,
  onSelect,
  className,
  ariaLabel,
}: PageTabsProps): React.ReactNode {
  return (
    <nav
      data-slot="page-tabs"
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full min-w-0 w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded-2xl border border-border bg-card/85 p-1 shadow-sm [scrollbar-width:thin]",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.to === activePath;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect?.(item)}
            className={cn(
              "relative inline-flex min-h-9 flex-none items-center justify-center gap-1.5 rounded-full border border-transparent px-4 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isActive && "bg-background text-foreground shadow-sm",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
