import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        warning: "bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        info: "bg-info text-info-foreground [a&]:hover:bg-info/90",
        success: "bg-success text-success-foreground [a&]:hover:bg-success/90",
        "stage-cultivation":
          "bg-stage-cultivation text-stage-cultivation-foreground [a&]:hover:bg-stage-cultivation/80",
        "stage-solicitation":
          "bg-stage-solicitation text-stage-solicitation-foreground [a&]:hover:bg-stage-solicitation/80",
        "stage-stewardship":
          "bg-stage-stewardship text-stage-stewardship-foreground [a&]:hover:bg-stage-stewardship/80",
        "stage-donor": "bg-stage-donor text-stage-donor-foreground [a&]:hover:bg-stage-donor/80",
        "stage-lapsed":
          "bg-stage-lapsed text-stage-lapsed-foreground [a&]:hover:bg-stage-lapsed/80",
        "gs-discovery":
          "bg-gs-discovery text-gs-discovery-foreground [a&]:hover:bg-gs-discovery/80",
        "gs-application":
          "bg-gs-application text-gs-application-foreground [a&]:hover:bg-gs-application/80",
        "gs-submitted":
          "bg-gs-submitted text-gs-submitted-foreground [a&]:hover:bg-gs-submitted/80",
        "gs-awarded": "bg-gs-awarded text-gs-awarded-foreground [a&]:hover:bg-gs-awarded/80",
        "gs-active": "bg-gs-active text-gs-active-foreground [a&]:hover:bg-gs-active/80",
        "gs-reporting":
          "bg-gs-reporting text-gs-reporting-foreground [a&]:hover:bg-gs-reporting/80",
        "gs-closeout": "bg-gs-closeout text-gs-closeout-foreground [a&]:hover:bg-gs-closeout/80",
        "gs-renewal": "bg-gs-renewal text-gs-renewal-foreground [a&]:hover:bg-gs-renewal/80",
        "gs-declined": "bg-gs-declined text-gs-declined-foreground [a&]:hover:bg-gs-declined/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
