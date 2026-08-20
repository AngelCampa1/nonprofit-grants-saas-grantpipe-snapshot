import { describe, expect, it } from "vitest";
import { isSampleNotificationContent, SAMPLE_NOTIFICATION_MARKER } from "./sample-alerts";

describe("isSampleNotificationContent", () => {
  it("detects the sample marker across notification text fields", () => {
    expect(
      isSampleNotificationContent("Normal title", `Body with ${SAMPLE_NOTIFICATION_MARKER}`),
    ).toBe(true);
  });

  it("ignores normal alert text and missing values", () => {
    expect(isSampleNotificationContent("Spend-down alert", null, undefined, "Normal body")).toBe(
      false,
    );
  });
});
