import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";

import { cn } from "../lib/utils";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pagination"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" className={cn(className)} {...props} />;
}

function PaginationLink({
  className,
  isActive,
  ...props
}: React.ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      data-slot="pagination-link"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
        isActive
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  disabled,
  ...props
}: React.ComponentProps<"a"> & { disabled?: boolean }) {
  return (
    <a
      data-slot="pagination-previous"
      aria-disabled={disabled ? "true" : undefined}
      aria-label="Go to previous page"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1 rounded-full border border-transparent px-3 text-sm font-medium transition-colors",
        disabled
          ? "pointer-events-none opacity-50"
          : "hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <ChevronLeftIcon className="size-4" />
      <span>Previous</span>
    </a>
  );
}

function PaginationNext({
  className,
  disabled,
  ...props
}: React.ComponentProps<"a"> & { disabled?: boolean }) {
  return (
    <a
      data-slot="pagination-next"
      aria-disabled={disabled ? "true" : undefined}
      aria-label="Go to next page"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1 rounded-full border border-transparent px-3 text-sm font-medium transition-colors",
        disabled
          ? "pointer-events-none opacity-50"
          : "hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <span>Next</span>
      <ChevronRightIcon className="size-4" />
    </a>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pagination-ellipsis"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
