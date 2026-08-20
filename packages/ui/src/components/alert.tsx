import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const alertVariants = cva("relative w-full rounded-2xl border p-4 text-sm", {
  variants: {
    variant: {
      default: "border-primary/20 bg-primary/5 text-foreground",
      success: "border-success/20 bg-success/5 text-foreground",
      warning: "border-warning/20 bg-warning/5 text-foreground",
      info: "border-info/20 bg-info/5 text-foreground",
      destructive: "border-destructive/20 bg-destructive/5 text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface AlertProps extends React.ComponentProps<"div">, VariantProps<typeof alertVariants> {
  title?: string;
  /** Visual icon for the alert header. Should be used alongside `title` for an accessible context label. */
  icon?: React.ReactNode;
}

function Alert({ className, variant = "default", title, icon, children, ...props }: AlertProps) {
  const hasHeader = title !== undefined || icon !== undefined;

  return (
    <div
      role="alert"
      data-slot="alert"
      data-variant={variant}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {hasHeader && (
        <div className="mb-1 flex items-center gap-2">
          {icon}
          {title !== undefined && (
            <p data-slot="alert-title" className="font-medium leading-none">
              {title}
            </p>
          )}
        </div>
      )}
      {children !== undefined && (
        <div data-slot="alert-content" className="text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

export { Alert, alertVariants };
export type { AlertProps };
