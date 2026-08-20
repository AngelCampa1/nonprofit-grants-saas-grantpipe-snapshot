import { useState, useCallback, useEffect } from "react";
import { clsx } from "clsx";
import type { FilterDef, SortOption, ContentItem } from "../types";
import { trackEvent } from "../lib/analytics";

interface FilterChipsProps {
  filters?: FilterDef[];
  sortOptions?: SortOption[];
  defaultSort?: string;
  onFilterChange?: (activeFilters: Record<string, string>) => void;
  onSortChange?: (sort: string) => void;
  items: ContentItem[];
  onItemsFiltered?: (filtered: ContentItem[]) => void;
}

function getCountBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 3) return "1-3";
  if (count <= 10) return "4-10";
  return "10+";
}

export function FilterChips({
  filters = [],
  sortOptions,
  defaultSort,
  onFilterChange,
  onSortChange,
  items,
  onItemsFiltered,
}: FilterChipsProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [activeSort, setActiveSort] = useState(defaultSort ?? sortOptions?.[0]?.value ?? "");

  const getFilteredItems = useCallback(
    (currentFilters: Record<string, string>) =>
      items.filter((item) =>
        Object.entries(currentFilters).every(([key, value]) => {
          if (key === "buyerStage") return item.buyerStage === value;
          if (key === "featured") return String(item.featured) === value;
          return item.metadata?.[key] === value;
        }),
      ),
    [items],
  );

  const handleFilterClick = useCallback(
    (filterId: string, value: string) => {
      const next = { ...activeFilters };
      const action = next[filterId] === value ? "cleared" : "selected";

      if (action === "cleared") {
        delete next[filterId];
      } else {
        next[filterId] = value;
      }

      const filteredItems = getFilteredItems(next);
      setActiveFilters(next);
      onFilterChange?.(next);
      onItemsFiltered?.(filteredItems);
      trackEvent("resource_filter_changed", {
        filter_id: filterId,
        filter_value: value,
        action,
        active_filter_count: Object.keys(next).length,
        result_count_bucket: getCountBucket(filteredItems.length),
        total_count_bucket: getCountBucket(items.length),
      });
    },
    [activeFilters, onFilterChange, onItemsFiltered, getFilteredItems, items.length],
  );

  const clearFilters = useCallback(() => {
    const clearedFilterCount = Object.keys(activeFilters).length;
    setActiveFilters({});
    onFilterChange?.({});
    onItemsFiltered?.(items);
    trackEvent("resource_filters_cleared", {
      cleared_filter_count: clearedFilterCount,
      result_count_bucket: getCountBucket(items.length),
      total_count_bucket: getCountBucket(items.length),
    });
  }, [activeFilters, onFilterChange, onItemsFiltered, items]);

  useEffect(() => {
    onItemsFiltered?.(getFilteredItems(activeFilters));
  }, [activeFilters, getFilteredItems, onItemsFiltered]);

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  const filteredCount = getFilteredItems(activeFilters).length;

  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className="flex flex-wrap items-center mb-6"
      style={{ gap: "var(--component-gap-sm)" }}
    >
      {filters.map((filter) => (
        <div
          key={filter.id}
          role="group"
          aria-label={filter.label}
          className="flex items-center"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <span
            className="font-medium uppercase tracking-wider text-neutral-500"
            style={{ fontSize: "var(--text-caption)" }}
          >
            {filter.label}:
          </span>
          {filter.options.map((option) => {
            const isActive = activeFilters[filter.id] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFilterClick(filter.id, option.value)}
                className={clsx(
                  "transition-colors px-2.5 py-1 font-medium rounded-full border",
                  isActive
                    ? "bg-brand-primary text-surface-primary border-brand-primary"
                    : "bg-surface-primary text-brand-text border-neutral-200",
                )}
                style={{ fontSize: "var(--text-caption)" }}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ))}

      {sortOptions && sortOptions.length > 1 && (
        <div className="flex items-center gap-1.5 ml-auto">
          <label
            htmlFor="content-sort"
            className="font-medium uppercase tracking-wider text-neutral-500"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Sort results:
          </label>
          <select
            id="content-sort"
            value={activeSort}
            onChange={(e) => {
              const sortValue = e.target.value;
              setActiveSort(sortValue);
              onSortChange?.(sortValue);
              trackEvent("resource_sort_changed", {
                sort_value: sortValue,
                active_filter_count: Object.keys(activeFilters).length,
                result_count_bucket: getCountBucket(filteredCount),
                total_count_bucket: getCountBucket(items.length),
              });
            }}
            className="border border-neutral-200 rounded px-2 py-1 text-brand-text bg-surface-primary"
            style={{ fontSize: "var(--text-caption)" }}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <span className="text-neutral-500" style={{ fontSize: "var(--text-caption)" }}>
            {filteredCount} of {items.length}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="transition-colors underline text-brand-primary hover:opacity-75"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
