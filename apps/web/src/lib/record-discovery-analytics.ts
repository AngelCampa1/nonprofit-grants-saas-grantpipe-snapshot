import { captureEvent } from "./analytics";

export type RecordDiscoveryRecordType =
  | "donors"
  | "grants"
  | "funds"
  | "funders"
  | "programs"
  | "payments"
  | "evidence-bundles"
  | "subrecipients"
  | "dashboard";

type RecordDiscoveryFilters = Record<string, unknown>;

interface FilterSummary extends Record<string, unknown> {
  filter_count: number;
  filter_keys: string[];
  has_search: boolean;
  record_type: RecordDiscoveryRecordType;
}

function hasActiveFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function summarizeFilters(
  recordType: RecordDiscoveryRecordType,
  filters: RecordDiscoveryFilters,
): FilterSummary {
  const filterKeys = Object.entries(filters)
    .filter(([, value]) => hasActiveFilterValue(value))
    .map(([filterKey]) => filterKey)
    .sort();

  return {
    filter_count: filterKeys.length,
    filter_keys: filterKeys,
    has_search: filterKeys.includes("search") || filterKeys.includes("query"),
    record_type: recordType,
  };
}

export function captureRecordFilterChanged(
  recordType: RecordDiscoveryRecordType,
  changedFilterKey: string,
  filters: RecordDiscoveryFilters,
): void {
  captureEvent("record_filter_changed", {
    changed_filter_key: changedFilterKey,
    ...summarizeFilters(recordType, filters),
  });
}

export function captureRecordViewChanged(
  recordType: RecordDiscoveryRecordType,
  toView: string,
  fromView: string,
): void {
  if (toView === fromView) return;
  captureEvent("record_view_changed", {
    from_view: fromView,
    record_type: recordType,
    to_view: toView,
  });
}

export function captureDetailTabViewed(
  recordType: RecordDiscoveryRecordType,
  toTab: string,
  fromTab: string,
): void {
  if (toTab === fromTab) return;
  captureEvent("detail_tab_viewed", {
    from_tab: fromTab,
    record_type: recordType,
    to_tab: toTab,
  });
}

export function captureDonorExportCompleted(filters: RecordDiscoveryFilters): void {
  captureEvent("donor_export_completed", {
    export_format: "csv",
    ...summarizeFilters("donors", filters),
  });
}
