import {
  EVENT_TYPE_LABELS,
  FUND_TYPE_LABELS,
  FUNDER_TYPE_LABELS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_REQUEST_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  formatCurrencyCents,
  type EventType,
  type FundType,
  type FunderType,
  type PaymentRequestStatus,
  type PaymentRequestType,
  type ReportStatus,
} from "@grantpipe/shared";

// Canonical date/number/currency formatters live in @grantpipe/shared so the
// API, web app, and marketing site stay byte-identical. Re-exported here for
// existing call sites; web-specific label helpers continue below.
export {
  formatNumber,
  formatUtcDate,
  formatUtcDateTime,
  formatUtcCalendarDate,
  formatDateKicker,
} from "@grantpipe/shared";

export function formatEventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type as EventType] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Title-case a snake_case enum value for display.
 * Example: `payment_request_line` `Payment Request Line`.
 */
export function humanizeEnum(value: string): string {
  return value
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

/**
 * Friendly, product-facing labels for activity-log entity types. The raw enum
 * values (`document_extraction`, `generated_report`, ...) are storage details
 * that should never reach end users — the marquee intake feature is "Award
 * Intake" everywhere in the UI, so the activity feed and dashboard must agree.
 */
const ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  document_extraction: "Award Intake",
  generated_report: "Report",
  import_history: "Import",
};

export function formatActivityEntityLabel(entityType: string): string {
  return ACTIVITY_ENTITY_LABELS[entityType] ?? humanizeEnum(entityType);
}

export function formatReportStatusLabel(status: string): string {
  return REPORT_STATUS_LABELS[status as ReportStatus] ?? humanizeEnum(status);
}

export function formatFundTypeLabel(type: string): string {
  return FUND_TYPE_LABELS[type as FundType] ?? humanizeEnum(type);
}

export function formatFunderTypeLabel(type: string): string {
  return FUNDER_TYPE_LABELS[type as FunderType] ?? humanizeEnum(type);
}

/**
 * The user's LOCAL calendar date as a `YYYY-MM-DD` string for prefilling
 * `<input type="date">` defaults. Uses local fields (not `toISOString`, which
 * is UTC) so a user west of UTC editing in the evening sees today, not tomorrow.
 */
export function todayLocalDateInput(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateInputEndOfDayIso(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

/**
 * Web alias for the canonical `formatCurrencyCents`. Existing routes import
 * `formatCurrency`; the implementation now lives in `@grantpipe/shared`.
 */
export function formatCurrency(cents: number | null | undefined): string {
  return formatCurrencyCents(cents);
}

export function formatThresholdLabel(thresholdState: string | null | undefined): string {
  const normalized = String(thresholdState ?? "")
    .trim()
    .replace(/%+$/u, "");
  return `Threshold ${normalized.length > 0 ? `${normalized}%` : "--"}`;
}

export function formatGrantStatusLabel(status: string | null | undefined): string {
  const normalized = String(status ?? "discovery").trim();

  if (normalized.length === 0) {
    return "Discovery";
  }

  return normalized
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatPaymentRequestStatus(status: string): string {
  return (
    PAYMENT_REQUEST_STATUS_LABELS[status as PaymentRequestStatus] ?? status.replaceAll("_", " ")
  );
}

export function formatPaymentRequestType(type: string): string {
  return PAYMENT_REQUEST_TYPE_LABELS[type as PaymentRequestType] ?? type.replaceAll("_", " ");
}
