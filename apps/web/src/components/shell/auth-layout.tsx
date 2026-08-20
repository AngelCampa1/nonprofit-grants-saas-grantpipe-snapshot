import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@grantpipe/ui";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthLayout({ title, subtitle, children, footer, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden bg-background text-foreground",
        "grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,540px)]",
      )}
    >
      {/* Decorative art-directed gradient — intentional, no semantic token. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(5,150,105,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(217,119,6,0.12),transparent_28%),linear-gradient(180deg,transparent,rgba(6,95,70,0.04))]"
      />

      <aside
        aria-hidden
        className="relative hidden overflow-hidden border-r border-border/70 bg-[linear-gradient(180deg,oklch(0.24_0.035_165),oklch(0.18_0.018_200))] text-primary-foreground lg:block"
      >
        {/* Decorative art-directed gradient — intentional, no semantic token. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.18),transparent_0,transparent_32%),radial-gradient(circle_at_82%_74%,rgba(250,204,21,0.16),transparent_0,transparent_24%)]" />
        <div className="absolute inset-y-10 right-10 w-px bg-white/10" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-14">
          <Link to="/" aria-hidden tabIndex={-1} className="inline-flex items-center gap-3">
            <img
              src="/brand/grantpipe-logo-on-dark.svg"
              alt=""
              aria-hidden="true"
              width="154"
              height="40"
              className="h-10 w-auto"
            />
          </Link>

          <div className="max-w-xl space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-mono uppercase tracking-caps text-primary-foreground/60">
                Grant compliance, restricted funds, and audit evidence
              </p>
              <p className="max-w-lg font-heading text-4xl font-medium leading-[1.02] text-balance xl:text-5xl">
                Grants, funds, donors, and compliance in one place.
              </p>
              <p className="max-w-md text-base leading-7 text-primary-foreground/78">
                Connect awards, deadlines, restricted funds, donors, and fund accounting.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-primary-foreground/82">
              {[
                {
                  problem: "Restricted funds tracked in spreadsheets break at audit time",
                  solution: "Restriction lifecycle with evidence links and rollforward reports",
                },
                {
                  problem: "Compliance deadlines slip when reminders live in someone's inbox",
                  solution: "Compliance calendar with email reminders for each deadline",
                },
                {
                  problem: "Finance and grants each rebuild the same report",
                  solution: "One workspace for compliance, funds, donor records, and evidence",
                },
              ].map((row) => (
                <div
                  key={row.problem}
                  className="rounded-2xl border border-white/[0.10] bg-primary-foreground/[0.06] p-5"
                >
                  <p className="text-[11px] font-mono uppercase tracking-caps text-primary-foreground/55">
                    Problem
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-primary-foreground/80">
                    {row.problem}
                  </p>
                  <p className="mt-4 text-[11px] font-mono uppercase tracking-caps text-primary-foreground/55">
                    What you get
                  </p>
                  <p className="mt-1.5 font-heading text-base leading-snug text-primary-foreground">
                    {row.solution}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-px w-full bg-white/10" />
            <div className="text-xs font-mono uppercase tracking-wider text-primary-foreground/60">
              grantpipe.com
            </div>
          </div>
        </div>
      </aside>

      <section className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 sm:py-12">
        {/* Decorative art-directed gradient — intentional, no semantic token. */}
        <div className="absolute inset-x-6 top-6 h-px bg-[linear-gradient(90deg,transparent,rgba(6,95,70,0.18),transparent)] lg:hidden" />
        <div className={cn("w-full max-w-md", className)}>
          {/* backdrop-blur intentional: card is semi-transparent (bg-card/92), blur provides visual separation from the panel behind */}
          <div className="rounded-2xl border border-border/70 bg-card/92 p-6 shadow-xl backdrop-blur md:p-8">
            <div className="mb-8 space-y-3">
              <Link
                to="/"
                className="inline-flex items-center lg:hidden"
                aria-label="GrantPipe home"
              >
                <img
                  src="/brand/grantpipe-logo-light.svg"
                  alt=""
                  aria-hidden="true"
                  width="139"
                  height="36"
                  className="h-9 w-auto"
                />
              </Link>

              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-caps text-muted-foreground">
                  No credit card required
                </p>
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-[2.1rem]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">{children}</div>

            {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 px-2 text-[11px] font-mono uppercase tracking-caps text-muted-foreground/80">
            <span>Encrypted session</span>
            <span>Reduced-motion safe</span>
          </div>
        </div>
      </section>
    </div>
  );
}
