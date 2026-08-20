export const SAMPLE_NOTIFICATION_MARKER = "[Sample]";

export function isSampleNotificationContent(...values: Array<string | null | undefined>): boolean {
  return values.some((value) =>
    typeof value === "string" ? value.toLowerCase().includes("[sample]") : false,
  );
}
