import * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { EmptyStateLinkContext } from "./empty-state-link-context";
import type { EmptyStateLinkProps } from "./empty-state-link-context";

export interface ActionProps {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface TeachAndActEmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  description?: string;
  primaryAction?: ActionProps;
  secondaryAction?: ActionProps;
  helpLink?: {
    label: string;
    href: string;
  };
  className?: string;
  footer?: React.ReactNode;
}

/**
 * Stable wrapper that reads the EmptyStateLinkContext and delegates to the
 * provided component or a plain <a>.
 *
 * We use React.createElement instead of JSX for the provided component because
 * JSX would trigger the react-hooks/static-components lint rule (it treats any
 * value retrieved from a hook that is later used as a JSX tag as a component
 * "created during render"). React.createElement is semantically identical.
 */
function EmptyStateLink({ href, className, children }: EmptyStateLinkProps) {
  const Provided = React.useContext(EmptyStateLinkContext);
  if (Provided !== null) {
    return React.createElement(Provided, { href, className }, children);
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

function RenderAction({
  action,
  variant,
}: {
  action: ActionProps;
  variant: "default" | "outline";
}) {
  if (action.href !== undefined) {
    return (
      <Button size="sm" variant={variant} asChild>
        <EmptyStateLink href={action.href}>{action.label}</EmptyStateLink>
      </Button>
    );
  }

  return (
    <Button size="sm" variant={variant} onClick={action.onClick} type="button">
      {action.label}
    </Button>
  );
}

function TeachAndActEmptyState({
  icon,
  heading,
  description,
  primaryAction,
  secondaryAction,
  helpLink,
  className,
  footer,
}: TeachAndActEmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={heading}
      data-slot="teach-and-act-empty-state"
      className={cn("rounded-2xl border border-border bg-card p-6", className)}
    >
      <div
        data-slot="teach-and-act-empty-state-icon"
        data-testid="teach-act-icon-wrapper"
        className="rounded-lg bg-muted p-2 w-fit"
      >
        <span className="block size-5 [&>*]:size-5">{icon}</span>
      </div>

      <h3
        data-slot="teach-and-act-empty-state-heading"
        className="text-base font-semibold text-foreground mt-3"
      >
        {heading}
      </h3>

      {description !== undefined ? (
        <p
          data-slot="teach-and-act-empty-state-description"
          className="mt-1 text-sm leading-6 text-muted-foreground max-w-prose"
        >
          {description}
        </p>
      ) : null}

      {primaryAction !== undefined || secondaryAction !== undefined || helpLink !== undefined ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {primaryAction !== undefined && <RenderAction action={primaryAction} variant="default" />}
          {secondaryAction !== undefined && (
            <RenderAction action={secondaryAction} variant="outline" />
          )}
          {helpLink !== undefined && (
            <EmptyStateLink
              href={helpLink.href}
              className="text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              {helpLink.label}
            </EmptyStateLink>
          )}
        </div>
      ) : null}

      {footer ? (
        <div
          data-slot="teach-and-act-empty-state-footer"
          className="mt-4 flex flex-col items-start gap-3 border-t border-border pt-4"
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export { TeachAndActEmptyState };
export type { TeachAndActEmptyStateProps };
