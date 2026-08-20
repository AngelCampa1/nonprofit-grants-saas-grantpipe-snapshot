import * as React from "react";
import { cn } from "../lib/utils";
import { HelpTooltip } from "./help-tooltip";

interface PageHeaderProps {
  title: string;
  description?: string;
  help?: React.ReactNode;
  helpLabel?: string;
  kicker?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  statusMeta?: React.ReactNode;
  variant?: "default" | "workbench";
  className?: string;
}

function PageHeader({
  title,
  description,
  help,
  helpLabel,
  kicker,
  actions,
  breadcrumb,
  statusMeta,
  variant = "default",
  className,
}: PageHeaderProps) {
  const isWorkbench = variant === "workbench";

  return (
    <div
      data-slot="page-header"
      data-variant={variant}
      className={cn(isWorkbench ? "space-y-2.5" : "space-y-2", className)}
    >
      {breadcrumb ? <div data-slot="page-header-breadcrumb">{breadcrumb}</div> : null}
      {kicker ? (
        <p
          data-slot="page-header-kicker"
          className={cn(
            "font-body text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground",
            isWorkbench && "tracking-caps",
          )}
        >
          {kicker}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className={cn("min-w-0", isWorkbench ? "space-y-1.5" : "space-y-1")}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1
              data-slot="page-header-title"
              className={cn(
                "min-w-0 break-words font-heading font-semibold tracking-tight text-foreground",
                isWorkbench ? "text-2xl" : "text-2xl sm:text-3xl",
              )}
            >
              {title}
            </h1>
            {help ? (
              <HelpTooltip className="shrink-0" label={helpLabel ?? `Help for ${title}`}>
                {help}
              </HelpTooltip>
            ) : null}
          </div>
          {description ? (
            <p
              data-slot="page-header-description"
              className={cn(
                "max-w-3xl text-sm leading-6 text-muted-foreground",
                isWorkbench && "leading-5",
              )}
            >
              {description}
            </p>
          ) : null}
          {statusMeta ? (
            <div
              data-slot="page-header-status-meta"
              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            >
              {statusMeta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="page-header-actions"
            className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:justify-end"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { PageHeader };
export type { PageHeaderProps };
