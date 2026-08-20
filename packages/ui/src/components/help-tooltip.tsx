import * as React from "react";
import { CircleHelp } from "lucide-react";

import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface HelpTooltipProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
}

function HelpTooltip({ label, children, className, side = "top" }: HelpTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-slot="help-tooltip-trigger"
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              className,
            )}
          >
            <CircleHelp aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[min(22rem,calc(100vw-2rem))] text-left leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { HelpTooltip };
export type { HelpTooltipProps };
