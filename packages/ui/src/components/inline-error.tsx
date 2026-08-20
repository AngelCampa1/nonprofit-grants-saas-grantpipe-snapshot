import * as React from "react";

import { cn } from "../lib/utils";

type InlineErrorProps = React.ComponentProps<"div">;

/**
 * Soft inline error box for action/mutation feedback rendered next to a control
 * or form section — distinct from the page-level {@link Alert} card. Renders a
 * low-emphasis bordered destructive box and exposes `role="alert"` so assistive
 * tech announces the message when it appears. Extra `className` is merged so
 * callers can adjust width/spacing (e.g. `w-full`, `mt-3`).
 */
function InlineError({ className, children, ...props }: InlineErrorProps) {
  return (
    <div
      role="alert"
      data-slot="inline-error"
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { InlineError };
export type { InlineErrorProps };
