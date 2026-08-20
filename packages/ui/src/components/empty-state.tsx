import * as React from "react";

import { cn } from "../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl px-4 py-12 text-center",
        className,
      )}
    >
      {icon !== undefined && (
        <div
          data-slot="empty-state-icon"
          data-testid="empty-state-icon-wrapper"
          className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {icon}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3
          data-slot="empty-state-title"
          className="font-[family-name:--font-heading] text-base font-semibold text-foreground sm:text-lg"
        >
          {title}
        </h3>

        {description !== undefined && (
          <p data-slot="empty-state-description" className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {(action !== undefined || secondaryAction !== undefined) && (
        <div className="flex flex-col items-center gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
