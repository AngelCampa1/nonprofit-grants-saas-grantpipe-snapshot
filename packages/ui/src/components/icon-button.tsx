import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

/**
 * IconButton — canonical primitive for icon-only buttons.
 *
 * Prefer IconButton over <Button size="icon" /> for any button that contains
 * only an icon. IconButton enforces accessibility (tooltip propagates to
 * aria-label; warns in dev when no accessible name is provided) and ships a
 * pill-shaped, focus-ring-standardised surface tuned for icon glyphs.
 */
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "xs" | "sm" | "md" | "lg";
  tooltip?: string;
  asChild?: boolean;
}

const sizeClasses: Record<NonNullable<IconButtonProps["size"]>, string> = {
  xs: "size-6 [&_svg:not([class*='size-'])]:size-3",
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
};

function IconButton({
  size = "md",
  tooltip,
  asChild = false,
  className,
  children,
  ...props
}: IconButtonProps) {
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];

  // When a tooltip is supplied but no explicit aria-label/labelledby is set,
  // mirror the tooltip into aria-label so screen readers announce the same
  // name the sighted user sees on hover.
  const resolvedAriaLabel = ariaLabel ?? (tooltip && !ariaLabelledBy ? tooltip : undefined);

  if (process.env.NODE_ENV !== "production" && !tooltip && !ariaLabel && !ariaLabelledBy) {
    console.warn(
      "IconButton: missing accessible name. Provide a `tooltip`, `aria-label`, or `aria-labelledby` prop so screen-reader users know what this button does.",
    );
  }

  const Comp = asChild ? Slot.Root : "button";

  const button = (
    <Comp
      data-slot="icon-button"
      data-size={size}
      type={asChild ? undefined : (props.type ?? "button")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
        "cursor-pointer",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        sizeClasses[size],
        className,
      )}
      {...props}
      aria-label={resolvedAriaLabel}
    >
      {children}
    </Comp>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

export { IconButton };
export type { IconButtonProps };
