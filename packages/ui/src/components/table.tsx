"use client";

import * as React from "react";

import { cn } from "../lib/utils";

type TableProps = React.ComponentProps<"table"> & {
  containerClassName?: string;
};

function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-sm",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm text-card-foreground", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/45 [&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

type DenseCellProps<TElement extends "th" | "td"> = React.ComponentProps<TElement> & {
  "data-sticky"?: "first";
  "data-align"?: "numeric";
  "data-truncate"?: boolean | "";
};

function TableHead({
  className,
  "data-sticky": dataSticky,
  "data-align": dataAlign,
  "data-truncate": dataTruncate,
  ...props
}: DenseCellProps<"th">) {
  const sticky = dataSticky === "first";
  const numeric = dataAlign === "numeric";
  const truncate = dataTruncate !== undefined && dataTruncate !== false;
  return (
    <th
      data-slot="table-head"
      data-sticky={dataSticky}
      data-align={dataAlign}
      data-truncate={dataTruncate}
      className={cn(
        "h-10 px-3 text-left align-middle font-semibold whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        sticky && "sticky left-0 z-20 bg-muted/95 shadow-[1px_0_0_var(--border)]",
        numeric && "text-right font-mono tabular-nums",
        truncate && "max-w-xs truncate",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  "data-sticky": dataSticky,
  "data-align": dataAlign,
  "data-truncate": dataTruncate,
  ...props
}: DenseCellProps<"td">) {
  const sticky = dataSticky === "first";
  const numeric = dataAlign === "numeric";
  const truncate = dataTruncate !== undefined && dataTruncate !== false;
  return (
    <td
      data-slot="table-cell"
      data-sticky={dataSticky}
      data-align={dataAlign}
      data-truncate={dataTruncate}
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        sticky && "sticky left-0 z-10 bg-card shadow-[1px_0_0_var(--border)]",
        numeric && "text-right font-mono tabular-nums",
        truncate && "max-w-xs truncate",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
