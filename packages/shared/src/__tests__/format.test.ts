import { describe, expect, it } from "vitest";
import {
  formatCurrencyCents,
  formatNumber,
  formatUtcDate,
  formatUtcDateTime,
  formatUtcCalendarDate,
  formatDateKicker,
} from "../format";

describe("formatCurrencyCents", () => {
  it("returns '--' for null", () => {
    expect(formatCurrencyCents(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatCurrencyCents(undefined)).toBe("--");
  });

  it("formats zero cents as $0", () => {
    expect(formatCurrencyCents(0)).toBe("$0");
  });

  it("formats whole-dollar amounts without decimals (auto)", () => {
    expect(formatCurrencyCents(100)).toBe("$1");
    expect(formatCurrencyCents(500000)).toBe("$5,000");
    expect(formatCurrencyCents(100000000)).toBe("$1,000,000");
  });

  it("shows cents when the value has a non-zero cents remainder (auto)", () => {
    expect(formatCurrencyCents(150)).toBe("$1.50");
    expect(formatCurrencyCents(12345)).toBe("$123.45");
  });

  it("formats with always-show-cents when opts.showCents='always'", () => {
    expect(formatCurrencyCents(100, { showCents: "always" })).toBe("$1.00");
    expect(formatCurrencyCents(0, { showCents: "always" })).toBe("$0.00");
    expect(formatCurrencyCents(12345, { showCents: "always" })).toBe("$123.45");
  });

  it("formats with never-show-cents when opts.showCents='never'", () => {
    // Truncates/rounds — matches Intl rounding behavior (round-half-even default)
    expect(formatCurrencyCents(150, { showCents: "never" })).toBe("$2");
    expect(formatCurrencyCents(149, { showCents: "never" })).toBe("$1");
    expect(formatCurrencyCents(100, { showCents: "never" })).toBe("$1");
  });

  it("returns '--' for null/undefined regardless of opts", () => {
    expect(formatCurrencyCents(null, { showCents: "always" })).toBe("--");
    expect(formatCurrencyCents(undefined, { showCents: "never" })).toBe("--");
  });

  it("handles negative amounts", () => {
    expect(formatCurrencyCents(-100)).toBe("-$1");
    expect(formatCurrencyCents(-150)).toBe("-$1.50");
  });
});

describe("formatNumber", () => {
  it("returns '--' for null", () => {
    expect(formatNumber(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatNumber(undefined)).toBe("--");
  });

  it("formats integers with thousand separators", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("formats decimals", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
  });
});

describe("formatUtcDate", () => {
  it("formats a UTC ISO date", () => {
    expect(formatUtcDate("2026-01-15T00:00:00Z")).toBe("Jan 15, 2026");
  });

  it("returns '--' for invalid input", () => {
    expect(formatUtcDate("not-a-date")).toBe("--");
  });

  it("ignores local timezone — interprets the timestamp as UTC", () => {
    // 2026-01-01T00:00:00Z is Jan 1 in UTC even if local time is Dec 31
    expect(formatUtcDate("2026-01-01T00:00:00Z")).toBe("Jan 1, 2026");
  });
});

describe("formatUtcDateTime", () => {
  it("formats date and time in UTC with explicit UTC suffix", () => {
    expect(formatUtcDateTime("2026-01-15T13:30:00Z")).toBe("Jan 15, 2026, 1:30 PM UTC");
  });

  it("formats midnight UTC", () => {
    expect(formatUtcDateTime("2026-01-15T00:00:00Z")).toBe("Jan 15, 2026, 12:00 AM UTC");
  });
});

describe("formatUtcCalendarDate", () => {
  it("returns '--' for null", () => {
    expect(formatUtcCalendarDate(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatUtcCalendarDate(undefined)).toBe("--");
  });

  it("returns '--' for invalid input", () => {
    expect(formatUtcCalendarDate("not-a-date")).toBe("--");
  });

  it("formats a UTC calendar date", () => {
    expect(formatUtcCalendarDate("2026-01-15")).toBe("Jan 15, 2026");
  });

  it("respects UTC boundary — 2026-01-01 stays Jan 1, 2026", () => {
    expect(formatUtcCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("formatDateKicker", () => {
  it("formats a kicker date string with weekday", () => {
    expect(formatDateKicker("2026-01-15T00:00:00Z")).toBe("Thursday, January 15, 2026");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-01-15T00:00:00Z");
    expect(formatDateKicker(d)).toBe("Thursday, January 15, 2026");
  });
});
