import * as React from "react";
import { cn } from "../lib/utils";

interface FilterBarProps {
  className?: string;
  children?: React.ReactNode;
}

function FilterBar({ className, children }: FilterBarProps) {
  return (
    <div data-slot="filter-bar" className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export { FilterBar };
export type { FilterBarProps };
