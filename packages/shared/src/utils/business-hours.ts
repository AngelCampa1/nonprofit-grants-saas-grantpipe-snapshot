// packages/shared/src/utils/business-hours.ts
//
// Automated lifecycle and reminder emails are dispatched by an hourly
// Cloudflare cron that fires in UTC. Without a guard, a send queued for, say,
// 00:00 UTC goes out the moment the cron ticks — landing in recipients'
// inboxes in the middle of the night. This helper gates those scheduled sends
// to local business hours so nothing is delivered at 12am.

/** Local hour (inclusive) at which the business-hours window opens. */
export const BUSINESS_HOURS_START_HOUR = 9;
/** Local hour (exclusive) at which the business-hours window closes. */
export const BUSINESS_HOURS_END_HOUR = 17;

/** Fallback IANA zone when an org has no/invalid timezone configured. */
export const DEFAULT_BUSINESS_TIMEZONE = "America/New_York";

type LocalParts = { weekday: string; hour: number };

function getLocalParts(now: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  let weekday = "";
  let hour = 0;
  for (const part of formatter.formatToParts(now)) {
    if (part.type === "weekday") weekday = part.value;
    else if (part.type === "hour") hour = Number(part.value);
  }
  return { weekday, hour };
}

const WEEKEND_DAYS = new Set(["Sat", "Sun"]);

/**
 * True when `now`, expressed in `timeZone`, falls on a weekday (Mon–Fri)
 * between 9:00 (inclusive) and 17:00 (exclusive) local time.
 *
 * An invalid/unknown timezone falls back to {@link DEFAULT_BUSINESS_TIMEZONE}
 * rather than throwing, so a bad org record can never crash the scheduled job.
 */
export function isWithinBusinessHours(
  now: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): boolean {
  let parts: LocalParts;
  try {
    parts = getLocalParts(now, timeZone);
  } catch {
    parts = getLocalParts(now, DEFAULT_BUSINESS_TIMEZONE);
  }

  if (WEEKEND_DAYS.has(parts.weekday)) return false;
  return parts.hour >= BUSINESS_HOURS_START_HOUR && parts.hour < BUSINESS_HOURS_END_HOUR;
}
