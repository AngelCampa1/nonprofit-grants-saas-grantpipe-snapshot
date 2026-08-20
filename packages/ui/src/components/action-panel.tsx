import * as React from "react";

import { cn } from "../lib/utils";

interface ActionPanelProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  variant?: "default" | "empty" | "error" | "success";
  className?: string;
}

function ActionPanel({
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  className,
}: ActionPanelProps) {
  const role = variant === "error" ? "alert" : "region";

  return (
    <section
      role={role}
      aria-label={title}
      data-slot="action-panel"
      data-variant={variant}
      className={cn(
        "rounded-2xl border p-4 text-sm shadow-sm",
        variant === "error"
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-border bg-muted/50 text-card-foreground",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 data-slot="action-panel-title" className="font-medium text-foreground">
            {title}
          </h3>
          {description ? (
            <div
              data-slot="action-panel-description"
              className="max-w-3xl leading-6 text-muted-foreground"
            >
              {description}
            </div>
          ) : null}
        </div>
        {action || secondaryAction ? (
          <div
            data-slot="action-panel-actions"
            className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export { ActionPanel };
export type { ActionPanelProps };
