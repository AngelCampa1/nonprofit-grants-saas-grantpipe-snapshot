/**
 * Canonical formatters shared across web, api, and site.
 *
 * Money is always passed and stored as integer cents. Date helpers are
 * timezone-aware (all explicitly format in UTC) so server- and client-rendered
 * strings agree.
 */

export interface FormatCurrencyOptions {
  /**
   * Controls when fractional cents render.
   * - "auto" (default) — show cents only when the amount has a non-zero cents remainder
   * - "always" — always render two fractional digits
   * - "never" — render no fractional digits (rounds per Intl.NumberFormat default)
   */
  showCents?: "auto" | "always" | "never";
}

/**
 * Formats a cent-integer amount as a USD currency string.
 *
 * Returns `"--"` for `null`/`undefined`. `0` renders as `$0` (or `$0.00` with
 * `showCents: "always"`).
 */
export function formatCurrencyCents(
  cents: number | null | undefined,
  opts: FormatCurrencyOptions = {},
): string {
  if (cents == null) return "--";
  const showCents = opts.showCents ?? "auto";

  let minimumFractionDigits: number;
  let maximumFractionDigits: number;
  if (showCents === "always") {
    minimumFractionDigits = 2;
    maximumFractionDigits = 2;
  } else if (showCents === "never") {
    minimumFractionDigits = 0;
    maximumFractionDigits = 0;
  } else {
    const hasRemainder = cents % 100 !== 0;
    minimumFractionDigits = hasRemainder ? 2 : 0;
    maximumFractionDigits = hasRemainder ? 2 : 0;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(cents / 100);
}

/** Formats a number with thousand separators. Returns `"--"` for null/undefined. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "--";
  return n.toLocaleString("en-US");
}

/** Formats a UTC date as `Mon DD, YYYY`. Returns `"--"` for invalid input. */
export function formatUtcDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/** Formats a UTC date/time as `Mon DD, YYYY, h:mm AM/PM UTC`. */
export function formatUtcDateTime(value: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

/** Formats a long-form calendar date kicker (e.g. `Thursday, January 15, 2026`). */
export function formatDateKicker(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Formats a UTC calendar date string as `Mon DD, YYYY`. Returns `"--"` for null/undefined/invalid. */
export function formatUtcCalendarDate(dateString: string | null | undefined): string {
  if (!dateString) return "--";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}
