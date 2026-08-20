import { describe, expect, it } from "vitest";
import {
  BUSINESS_HOURS_END_HOUR,
  BUSINESS_HOURS_START_HOUR,
  isWithinBusinessHours,
} from "./business-hours";

// All instants below are expressed in UTC; the helper must convert to the
// supplied IANA timezone before deciding. America/New_York is UTC-4 in June
// (EDT), so local = UTC - 4 for these fixtures.
const TZ = "America/New_York";

describe("business-hours constants", () => {
  it("defines a 9am-5pm window", () => {
    expect(BUSINESS_HOURS_START_HOUR).toBe(9);
    expect(BUSINESS_HOURS_END_HOUR).toBe(17);
  });
});

describe("isWithinBusinessHours", () => {
  it("rejects midnight local time (the reported 12am sends)", () => {
    // 2026-06-11 04:00 UTC === 2026-06-11 00:00 EDT (a Thursday)
    expect(isWithinBusinessHours(new Date("2026-06-11T04:00:00Z"), TZ)).toBe(false);
  });

  it("accepts a weekday mid-morning local time", () => {
    // 2026-06-11 14:00 UTC === 2026-06-11 10:00 EDT (Thursday)
    expect(isWithinBusinessHours(new Date("2026-06-11T14:00:00Z"), TZ)).toBe(true);
  });

  it("accepts the opening boundary (9:00 local, inclusive)", () => {
    // 13:00 UTC === 09:00 EDT
    expect(isWithinBusinessHours(new Date("2026-06-11T13:00:00Z"), TZ)).toBe(true);
  });

  it("rejects the closing boundary (17:00 local, exclusive)", () => {
    // 21:00 UTC === 17:00 EDT
    expect(isWithinBusinessHours(new Date("2026-06-11T21:00:00Z"), TZ)).toBe(false);
  });

  it("accepts 16:59 local, just inside the window", () => {
    // 20:59 UTC === 16:59 EDT
    expect(isWithinBusinessHours(new Date("2026-06-11T20:59:00Z"), TZ)).toBe(true);
  });

  it("rejects early-morning weekday local time before 9am", () => {
    // 12:00 UTC === 08:00 EDT
    expect(isWithinBusinessHours(new Date("2026-06-11T12:00:00Z"), TZ)).toBe(false);
  });

  it("rejects Saturday during would-be business hours", () => {
    // 2026-06-13 is a Saturday; 14:00 UTC === 10:00 EDT
    expect(isWithinBusinessHours(new Date("2026-06-13T14:00:00Z"), TZ)).toBe(false);
  });

  it("rejects Sunday during would-be business hours", () => {
    // 2026-06-14 is a Sunday; 14:00 UTC === 10:00 EDT
    expect(isWithinBusinessHours(new Date("2026-06-14T14:00:00Z"), TZ)).toBe(false);
  });

  it("respects the supplied timezone rather than UTC", () => {
    // 2026-06-11 02:00 UTC is 10:00 the same day in Asia/Tokyo (UTC+9),
    // a Thursday — inside business hours there even though it is the middle
    // of the night in UTC.
    expect(isWithinBusinessHours(new Date("2026-06-11T02:00:00Z"), "Asia/Tokyo")).toBe(true);
    // The same instant is 22:00 the previous day in New_York — outside.
    expect(isWithinBusinessHours(new Date("2026-06-11T02:00:00Z"), TZ)).toBe(false);
  });

  it("defaults to America/New_York when no timezone is supplied", () => {
    // 14:00 UTC === 10:00 EDT on a Thursday — inside the default zone window.
    expect(isWithinBusinessHours(new Date("2026-06-11T14:00:00Z"))).toBe(true);
    // 04:00 UTC === 00:00 EDT — midnight in the default zone.
    expect(isWithinBusinessHours(new Date("2026-06-11T04:00:00Z"))).toBe(false);
  });

  it("falls back to America/New_York for an invalid timezone", () => {
    // Invalid zone should not throw; it should behave like the default zone.
    const instant = new Date("2026-06-11T14:00:00Z"); // 10:00 EDT, Thursday
    expect(isWithinBusinessHours(instant, "Not/AZone")).toBe(true);
  });
});
