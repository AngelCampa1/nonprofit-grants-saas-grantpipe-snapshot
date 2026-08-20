/**
 * @deprecated The `page-shell` components are superseded by the new shell layout primitives:
 * - `PageHeader` from `./page-header` (replaces `PageHero`)
 * - `SidebarRoot`, `SidebarHeader`, `SidebarNav`, `SidebarFooter`, `SidebarNavItem`, `SidebarNavSection` from `./sidebar`
 * - `TopbarRoot`, `TopbarLeft`, `TopbarRight` from `./topbar`
 *
 * `PageShell`, `InsetPanel`, `SurfaceSection`, `StatusPanel`, and `MetricTile` remain in use
 * as page content primitives and are not deprecated.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const statusPanelVariants = cva("rounded-2xl border px-4 py-3 text-sm shadow-sm", {
  variants: {
    variant: {
      empty: "border-border bg-muted/60 text-muted-foreground",
      loading: "border-border/80 bg-card text-card-foreground",
      error: "border-destructive/20 bg-destructive/10 text-destructive",
      success: "border-primary/20 bg-primary/10 text-primary",
    },
  },
  defaultVariants: {
    variant: "empty",
  },
});

function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-shell"
      className={cn("space-y-8 p-4 sm:p-6 lg:p-8", className)}
      {...props}
    />
  );
}

function PageHero({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
  ...props
}: React.ComponentProps<"section"> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      data-slot="page-hero"
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
      {...props}
    >
      <div className="space-y-4 p-6 sm:p-8">
        {eyebrow ? (
          <div
            data-slot="page-hero-eyebrow"
            className="inline-flex w-fit items-center rounded-full border border-border bg-background/85 px-3 py-1 text-xs font-medium uppercase tracking-caps text-muted-foreground"
          >
            {eyebrow}
          </div>
        ) : null}
        <div className="space-y-2">
          <h1
            data-slot="page-hero-title"
            className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            {title}
          </h1>
          {description ? (
            <p
              data-slot="page-hero-description"
              className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base"
            >
              {description}
            </p>
          ) : null}
        </div>
        {meta || actions ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {meta ? (
              <div data-slot="page-hero-meta" className="text-sm text-muted-foreground">
                {meta}
              </div>
            ) : (
              <span />
            )}
            {actions ? <div data-slot="page-hero-actions">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InsetPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="inset-panel"
      className={cn(
        "rounded-2xl border border-border bg-muted/50 p-4 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function SurfaceSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ...props
}: React.ComponentProps<"section"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <section
      data-slot="surface-section"
      className={cn(
        "rounded-2xl border border-border/80 bg-card/90 p-5 text-card-foreground shadow-sm sm:p-6",
        className,
      )}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            {title ? (
              <h2
                data-slot="surface-section-title"
                className="text-sm font-semibold uppercase tracking-caps text-foreground"
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p data-slot="surface-section-description" className="text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div data-slot="surface-section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div
        data-slot="surface-section-content"
        className={cn(title || description || actions ? "mt-4" : "", contentClassName)}
      >
        {children}
      </div>
    </section>
  );
}

function StatusPanel({
  title,
  children,
  variant,
  className,
  role,
  "aria-live": ariaLive,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof statusPanelVariants> & { title?: React.ReactNode }) {
  const resolvedRole =
    role ??
    (variant === "error"
      ? "alert"
      : variant === "loading" || variant === "success"
        ? "status"
        : undefined);
  const resolvedAriaLive =
    ariaLive ??
    (variant === "error"
      ? "assertive"
      : variant === "loading" || variant === "success"
        ? "polite"
        : undefined);

  return (
    <div
      data-slot="status-panel"
      data-variant={variant ?? "empty"}
      role={resolvedRole}
      aria-live={resolvedAriaLive}
      className={cn(statusPanelVariants({ variant }), className)}
      {...props}
    >
      {variant === "loading" ? (
        <div
          aria-hidden="true"
          data-slot="status-panel-loading-indicator"
          data-testid="status-panel-loading-indicator"
          className="mb-3 h-1.5 w-16 overflow-hidden rounded-full bg-primary/15"
        >
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary/50" />
        </div>
      ) : null}
      {title ? (
        <p data-slot="status-panel-title" className="font-medium">
          {title}
        </p>
      ) : null}
      {children ? (
        <div data-slot="status-panel-description" className={cn(title ? "mt-1" : "")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  description,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div
      data-slot="metric-tile"
      className={cn(
        "rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    >
      <div
        data-slot="metric-tile-label"
        className="text-xs font-medium uppercase tracking-caps text-muted-foreground"
      >
        {label}
      </div>
      <div
        data-slot="metric-tile-value"
        className="mt-3 text-3xl font-semibold tracking-tight text-foreground"
      >
        {value}
      </div>
      {description ? (
        <p
          data-slot="metric-tile-description"
          className="mt-2 text-sm leading-6 text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

export { InsetPanel, MetricTile, PageHero, PageShell, StatusPanel, SurfaceSection };
