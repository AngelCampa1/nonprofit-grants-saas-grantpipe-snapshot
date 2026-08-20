import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const attentionBannerVariants = cva("w-full rounded-2xl border px-4 py-3 text-sm shadow-sm", {
  variants: {
    variant: {
      warning: "border-warning/45 bg-warning/15 text-warning-foreground",
      destructive: "border-destructive/35 bg-destructive/10 text-destructive",
      info: "border-info/25 bg-info/10 text-info-foreground",
    },
  },
  defaultVariants: {
    variant: "warning",
  },
});

interface AttentionBannerProps
  extends Omit<React.ComponentProps<"div">, "title">, VariantProps<typeof attentionBannerVariants> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

function AttentionBanner({
  title,
  description,
  icon,
  action,
  variant = "warning",
  className,
  role,
  "aria-live": ariaLive,
  children,
  ...props
}: AttentionBannerProps) {
  const resolvedRole = role ?? (variant === "destructive" ? "alert" : "status");
  const resolvedAriaLive = ariaLive ?? (variant === "destructive" ? "assertive" : "polite");

  return (
    <div
      data-slot="attention-banner"
      data-variant={variant}
      role={resolvedRole}
      aria-live={resolvedAriaLive}
      className={cn(attentionBannerVariants({ variant }), className)}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-layout-shell flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              data-slot="attention-banner-icon"
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <p data-slot="attention-banner-title" className="font-semibold text-foreground">
              {title}
            </p>
            {description ? (
              <p data-slot="attention-banner-description" className="mt-0.5 text-muted-foreground">
                {description}
              </p>
            ) : null}
            {children ? <div className="mt-2">{children}</div> : null}
          </div>
        </div>
        {action ? (
          <div data-slot="attention-banner-action" className="shrink-0">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { AttentionBanner, attentionBannerVariants };
export type { AttentionBannerProps };
