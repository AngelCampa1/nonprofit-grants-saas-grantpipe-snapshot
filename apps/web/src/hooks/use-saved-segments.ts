import { useEffect, useState } from "react";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

export interface SavedSegment<T> {
  id: string;
  name: string;
  filters: T;
}

export type SavedSegmentRecordType = "donors" | "grants" | "funds";

interface SavedSegmentsOptions {
  recordType?: SavedSegmentRecordType;
}

interface SavedViewFilterSummary extends Record<string, unknown> {
  filter_count: number;
  filter_keys: string[];
  has_search: boolean;
  record_type?: SavedSegmentRecordType;
}

function readFromStorage<T>(key: string): SavedSegment<T>[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedSegment<T>[];
  } catch {
    return [];
  }
}

function writeToStorage<T>(key: string, segments: SavedSegment<T>[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(segments));
  } catch (error) {
    captureAppException(
      error,
      {
        tags: {
          feature: "saved_segments",
          operation: "persist",
        },
      },
      { includeExpected: true, sanitize: true },
    );
  }
}

function hasActiveFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function summarizeSavedViewFilters<T>(
  filters: T,
  options?: SavedSegmentsOptions,
): SavedViewFilterSummary {
  const entries =
    filters !== null && typeof filters === "object" && !Array.isArray(filters)
      ? Object.entries(filters as Record<string, unknown>)
      : [];
  const filterKeys = entries
    .filter(([, value]) => hasActiveFilterValue(value))
    .map(([filterKey]) => filterKey)
    .sort();

  return {
    filter_count: filterKeys.length,
    filter_keys: filterKeys,
    has_search: filterKeys.includes("search") || filterKeys.includes("query"),
    ...(options?.recordType ? { record_type: options.recordType } : {}),
  };
}

export function useSavedSegments<T>(key: string, options?: SavedSegmentsOptions) {
  const [segments, setSegments] = useState<SavedSegment<T>[]>(() => readFromStorage<T>(key));

  useEffect(() => {
    setSegments(readFromStorage<T>(key));
  }, [key]);

  function saveSegment(name: string, filters: T): void {
    const segment: SavedSegment<T> = {
      id: crypto.randomUUID(),
      name,
      filters,
    };
    setSegments((current) => {
      const next = [...current, segment];
      writeToStorage(key, next);
      return next;
    });
    captureEvent("saved_view_created", summarizeSavedViewFilters(filters, options));
  }

  function deleteSegment(id: string): void {
    setSegments((current) => {
      const next = current.filter((seg) => seg.id !== id);
      writeToStorage(key, next);
      return next;
    });
  }

  function applySegment(id: string): T | undefined {
    const segment = segments.find((seg) => seg.id === id);
    if (segment) {
      captureEvent("saved_view_applied", summarizeSavedViewFilters(segment.filters, options));
    }
    return segment?.filters;
  }

  return { segments, saveSegment, deleteSegment, applySegment };
}
