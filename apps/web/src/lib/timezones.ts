export const ORG_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export type OrgTimezone = (typeof ORG_TIMEZONES)[number];
