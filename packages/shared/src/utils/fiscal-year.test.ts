// packages/shared/src/utils/fiscal-year.test.ts
import { describe, it, expect } from "vitest";
import { getFiscalYearRange, getFiscalYearLabel, getFiscalYearsBack } from "./fiscal-year";

describe("getFiscalYearRange", () => {
  it("returns calendar year boundaries when fiscalYearStartMonth=1", () => {
    const range = getFiscalYearRange(1, new Date("2026-06-15"));
    expect(range.start).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-12-31T23:59:59.999Z"));
  });

  it("returns July–June boundaries when fiscalYearStartMonth=7", () => {
    // Reference date in October 2025 → FY starts July 2025, ends June 2026
    const range = getFiscalYearRange(7, new Date("2025-10-15"));
    expect(range.start).toEqual(new Date("2025-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("handles reference date before start month (wraps to previous year)", () => {
    // FY starts July. Reference date in March 2026 → FY is July 2025–June 2026
    const range = getFiscalYearRange(7, new Date("2026-03-15"));
    expect(range.start).toEqual(new Date("2025-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("handles fiscalYearStartMonth=10 (Oct–Sep)", () => {
    const range = getFiscalYearRange(10, new Date("2026-01-15"));
    expect(range.start).toEqual(new Date("2025-10-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-09-30T23:59:59.999Z"));
  });

  it("reference date exactly on start month boundary", () => {
    const range = getFiscalYearRange(7, new Date("2026-07-01"));
    expect(range.start).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2027-06-30T23:59:59.999Z"));
  });
});

describe("getFiscalYearLabel", () => {
  it("returns 'FY2026' for calendar year FY", () => {
    expect(getFiscalYearLabel(1, new Date("2026-06-15"))).toBe("FY2026");
  });

  it("returns 'FY2026' for July-start when reference is Oct 2025", () => {
    // FY July 2025–June 2026 → labeled by end year
    expect(getFiscalYearLabel(7, new Date("2025-10-15"))).toBe("FY2026");
  });
});

describe("getFiscalYearsBack", () => {
  it("returns 5 fiscal year ranges going backward", () => {
    const ranges = getFiscalYearsBack(1, 5, new Date("2026-06-15"));
    expect(ranges).toHaveLength(5);
    expect(ranges[0]!.label).toBe("FY2022");
    expect(ranges[4]!.label).toBe("FY2026");
  });

  it("returns correct ranges for July-start FY", () => {
    const ranges = getFiscalYearsBack(7, 3, new Date("2025-10-15"));
    expect(ranges).toHaveLength(3);
    // Current FY: July 2025–June 2026 (FY2026)
    // Previous: July 2024–June 2025 (FY2025)
    // Before that: July 2023–June 2024 (FY2024)
    expect(ranges[0]!.label).toBe("FY2024");
    expect(ranges[1]!.label).toBe("FY2025");
    expect(ranges[2]!.label).toBe("FY2026");
  });
});
