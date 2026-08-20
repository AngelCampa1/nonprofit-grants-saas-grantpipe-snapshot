import React from "react";

type ReportBrandHeaderProps = {
  title: string;
  description: string;
  dateLabel: string;
};

export function ReportBrandHeader({ title, description, dateLabel }: ReportBrandHeaderProps) {
  return (
    <header className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm print:rounded-none print:border-primary/20 print:shadow-none">
      <div className="flex items-center justify-between gap-4 border-t-4 border-accent bg-primary px-4 py-3 text-primary-foreground [print-color-adjust:exact]">
        <img
          src="/brand/grantpipe-logo-light.svg"
          alt="GrantPipe"
          width="142"
          height="36"
          className="h-9 w-auto"
        />
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground">
          Prepared report
        </span>
      </div>
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
          {dateLabel}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}
