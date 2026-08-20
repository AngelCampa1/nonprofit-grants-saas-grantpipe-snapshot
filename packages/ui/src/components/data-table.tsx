"use client";

import * as React from "react";
import {
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon, Columns3Icon } from "lucide-react";

import { cn } from "../lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./table";
import { Checkbox } from "./checkbox";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "./dropdown-menu";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  density?: "comfortable" | "compact";
  surface?: "default" | "plain";
  // Loading
  isLoading?: boolean;
  skeletonRows?: number;
  // Empty state
  emptyState?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  // Selection
  enableRowSelection?: boolean;
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  // Pagination
  enablePagination?: boolean;
  pageSize?: number;
  // Column visibility
  enableColumnVisibility?: boolean;
  // Caption
  caption?: string;
  className?: string;
}

/**
 * Coerce a cell value to a finite number for sorting. Numeric aggregates
 * (e.g. SUM of *_cents) arrive from the API as strings at runtime even when
 * their declared type is `number` — the default TanStack `auto` sortingFn then
 * compares them lexicographically ("$10,000" before "$20,000"). Anything that
 * is not a finite number sorts as 0.
 */
function toNumericValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sort a column by the numeric value of its cells regardless of whether the
 * underlying value is a `number` or a numeric string. Use this on every
 * currency/amount/count column so header-click sorting is numerically correct.
 */
export function numericSortingFn<TData>(
  rowA: Row<TData>,
  rowB: Row<TData>,
  columnId: string,
): number {
  const a = toNumericValue(rowA.getValue(columnId));
  const b = toNumericValue(rowB.getValue(columnId));
  return a < b ? -1 : a > b ? 1 : 0;
}

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (direction === "asc") {
    return <ChevronUpIcon className="ml-1 size-3.5 shrink-0" />;
  }
  if (direction === "desc") {
    return <ChevronDownIcon className="ml-1 size-3.5 shrink-0" />;
  }
  return <ChevronsUpDownIcon className="ml-1 size-3.5 shrink-0 opacity-50" />;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  density = "comfortable",
  surface = "default",
  isLoading = false,
  skeletonRows = 5,
  emptyState,
  emptyTitle,
  emptyDescription,
  enableRowSelection = false,
  onRowSelectionChange,
  enablePagination = false,
  pageSize = 10,
  enableColumnVisibility = false,
  caption,
  className,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  // Build columns with selection column prepended if needed
  const tableColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!enableRowSelection) return columns;

    const selectionColumn: ColumnDef<TData, TValue> = {
      id: "_select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select row ${String(row.index + 1)}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      rowSelection,
      sorting,
      columnVisibility,
      ...(enablePagination ? { pagination } : {}),
    },
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      // TanStack Table always passes a function updater; the object branch is a defensive fallback
      // v8 ignore next
      const newSelection = typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(newSelection);

      if (onRowSelectionChange) {
        const selectedRows = table
          .getRowModel()
          .rows.filter((row) => newSelection[row.id])
          .map((row) => row.original);
        onRowSelectionChange(selectedRows);
      }
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: enablePagination ? setPagination : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    manualPagination: !enablePagination,
  });

  // Pagination info
  const totalRows = data.length;
  // TanStack Table always initializes pagination state; the ?? fallbacks guard against edge cases
  // v8 ignore next 2
  const pageIndex = table.getState().pagination?.pageIndex ?? 0;
  const currentPageSize = table.getState().pagination?.pageSize ?? totalRows;
  const firstRow = totalRows === 0 ? 0 : pageIndex * currentPageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * currentPageSize, totalRows);

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  // Column visibility toggle list (exclude non-hideable columns)
  const hidableColumns = table.getAllColumns().filter((col) => col.getCanHide());

  const isCompact = density === "compact";
  const surfaceClassName =
    surface === "plain"
      ? "rounded-none border-0 bg-transparent shadow-none"
      : "rounded-2xl border border-border bg-card shadow-sm";
  const tableContainerClassName = "rounded-none border-0 bg-transparent shadow-none";
  const headClassName = isCompact ? "h-8 px-3 py-1.5 text-xs" : "h-10 px-3 py-2";
  const cellClassName = isCompact ? "px-3 py-1.5 text-xs" : "px-3 py-2.5";

  return (
    <div
      data-density={density}
      data-surface={surface}
      className={cn("flex flex-col gap-2", className)}
    >
      {/* Toolbar */}
      {enableColumnVisibility && (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3Icon className="mr-1.5 size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hidableColumns.map((col) => {
                const header =
                  typeof col.columnDef.header === "string" ? col.columnDef.header : col.id;
                return (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  >
                    {header}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Table */}
      <div data-slot="data-table-surface" className={cn("overflow-hidden", surfaceClassName)}>
        <Table containerClassName={tableContainerClassName}>
          {caption !== undefined && <TableCaption>{caption}</TableCaption>}

          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  // Screen readers should hear the visible column label, not the
                  // internal camelCase field key (e.g. "Total Giving" not
                  // "totalGivingCents"). Fall back to the id only when the
                  // header is not a plain string (e.g. a render function).
                  const sortName =
                    typeof header.column.columnDef.header === "string"
                      ? header.column.columnDef.header
                      : header.column.id;
                  const sortLabel =
                    sortDir === "asc"
                      ? `Sort by ${sortName} desc`
                      : sortDir === "desc"
                        ? `Sort by ${sortName} (clear)`
                        : `Sort by ${sortName}`;

                  return (
                    <TableHead key={header.id} colSpan={header.colSpan} className={headClassName}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={sortLabel}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon direction={sortDir} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              // Skeleton rows
              Array.from({ length: skeletonRows }).map((_, rowIdx) => (
                <TableRow key={`skeleton-row-${rowIdx}`}>
                  {headerGroups[0]?.headers.map((header) => (
                    <TableCell
                      key={`skeleton-cell-${rowIdx}-${header.id}`}
                      className={cellClassName}
                    >
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tableColumns.length} className="p-0">
                  {emptyState !== undefined ? (
                    emptyState
                  ) : (
                    <EmptyState title={emptyTitle ?? "No results"} description={emptyDescription} />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cellClassName}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>

          {/* Pagination footer */}
          {enablePagination && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={tableColumns.length}>
                  <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Showing {firstRow}–{lastRow} of {totalRows}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        aria-label="Previous page"
                      >
                        Prev
                      </Button>
                      <span className="px-2 text-sm">
                        Page {pageIndex + 1} of {table.getPageCount()}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        aria-label="Next page"
                      >
                        Next
                      </Button>
                    </div>
                  </nav>
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
