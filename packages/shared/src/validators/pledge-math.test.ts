import { describe, expect, it } from "vitest";
import {
  presentValuePledge,
  accretionThrough,
  buildAmortizationSchedule,
  classifyInstallmentAging,
  isPledgeConditional,
} from "./pledge-math";

// Helpers
const d = (iso: string) => new Date(iso);
const pledgeDate = d("2024-01-01");

// ---------------------------------------------------------------------------
// presentValuePledge
// ---------------------------------------------------------------------------

describe("presentValuePledge", () => {
  it("returns zero pv/face/discount for empty installment list", () => {
    const r = presentValuePledge([], 500, pledgeDate);
    expect(r).toEqual({ pvCents: 0, discountCents: 0, faceCents: 0 });
  });

  it("uses face value for single within-year installment (no discount)", () => {
    const installments = [{ amountCents: 100_000, dueDate: d("2024-06-01") }];
    const r = presentValuePledge(installments, 500, pledgeDate);
    expect(r.faceCents).toBe(100_000);
    expect(r.pvCents).toBe(100_000);
    expect(r.discountCents).toBe(0);
  });

  it("uses face value for installment exactly at 1-year boundary", () => {
    // Use 2023-01-01 as base (2023 is not a leap year): 2024-01-01 - 2023-01-01 = 365 days exactly
    const base = d("2023-01-01");
    const installments = [{ amountCents: 50_000, dueDate: d("2024-01-01") }];
    const r = presentValuePledge(installments, 1000, base);
    // t = 1.0 exactly → face
    expect(r.pvCents).toBe(50_000);
    expect(r.discountCents).toBe(0);
  });

  it("discounts installments beyond 1 year", () => {
    // $1,000 due in 2 years at 10%. Due to leap year 2024, t = 731/365 ≈ 2.00274
    const installments = [{ amountCents: 100_000, dueDate: d("2026-01-01") }];
    const r = presentValuePledge(installments, 1000, pledgeDate);
    expect(r.faceCents).toBe(100_000);
    expect(r.pvCents).toBeGreaterThan(0);
    expect(r.pvCents).toBeLessThan(100_000);
    expect(r.discountCents).toBeGreaterThan(0);
    expect(r.discountCents).toBe(r.faceCents - r.pvCents);
  });

  it("handles zero rate (no discounting regardless of years)", () => {
    const installments = [{ amountCents: 100_000, dueDate: d("2030-01-01") }];
    const r = presentValuePledge(installments, 0, pledgeDate);
    expect(r.pvCents).toBe(100_000);
    expect(r.discountCents).toBe(0);
  });

  it("handles negative rate (treated as zero)", () => {
    const installments = [{ amountCents: 100_000, dueDate: d("2026-01-01") }];
    const r = presentValuePledge(installments, -500, pledgeDate);
    expect(r.pvCents).toBe(100_000);
    expect(r.discountCents).toBe(0);
  });

  it("sums multiple installments correctly", () => {
    // 2 within-year + 1 multi-year
    const installments = [
      { amountCents: 50_000, dueDate: d("2024-06-01") }, // within year → face
      { amountCents: 50_000, dueDate: d("2024-12-31") }, // within year → face
      { amountCents: 100_000, dueDate: d("2026-01-01") }, // >1 yr → discounted
    ];
    const r = presentValuePledge(installments, 1000, pledgeDate);
    expect(r.faceCents).toBe(200_000);
    // pvCents = 50000 + 50000 + discounted_value < 200000
    expect(r.pvCents).toBeGreaterThan(100_000);
    expect(r.pvCents).toBeLessThan(200_000);
    expect(r.discountCents).toBeGreaterThan(0);
    expect(r.discountCents).toBe(r.faceCents - r.pvCents);
  });

  it("discount is never negative", () => {
    // Edge: pv could theoretically exceed face with negative rates (clamped to zero)
    const installments = [{ amountCents: 100_000, dueDate: d("2026-01-01") }];
    const r = presentValuePledge(installments, -200, pledgeDate);
    expect(r.discountCents).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// accretionThrough
// ---------------------------------------------------------------------------

describe("accretionThrough", () => {
  it("returns 0 when throughDate equals pledgeDate", () => {
    expect(accretionThrough(100_000, 1000, pledgeDate, pledgeDate, 10_000)).toBe(0);
  });

  it("returns 0 when throughDate is before pledgeDate", () => {
    expect(accretionThrough(100_000, 1000, pledgeDate, d("2023-06-01"), 10_000)).toBe(0);
  });

  it("computes 1-year accretion at 10% on 100000 pv", () => {
    // 2024 is a leap year: 366/365 ≈ 1.00274 years → slightly more than 10000
    const a = accretionThrough(100_000, 1000, pledgeDate, d("2025-01-01"), 50_000);
    expect(a).toBeGreaterThan(9_900);
    expect(a).toBeLessThan(10_200);
  });

  it("never exceeds totalDiscountCents", () => {
    // Cap at small discount
    const a = accretionThrough(100_000, 1000, pledgeDate, d("2030-01-01"), 500);
    expect(a).toBe(500);
  });

  it("handles zero rate (no accretion)", () => {
    const a = accretionThrough(100_000, 0, pledgeDate, d("2027-01-01"), 20_000);
    expect(a).toBe(0);
  });

  it("handles negative rate (clamped to zero, no accretion)", () => {
    const a = accretionThrough(100_000, -500, pledgeDate, d("2027-01-01"), 20_000);
    expect(a).toBe(0);
  });

  it("partial year accretes proportionally", () => {
    // ~6 months = 0.5 years at 10%: 100000 * (1.1^0.5 - 1) ≈ 4881
    const through = d("2024-07-01"); // ~182 days from 2024-01-01
    const a = accretionThrough(100_000, 1000, pledgeDate, through, 50_000);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// buildAmortizationSchedule
// ---------------------------------------------------------------------------

describe("buildAmortizationSchedule", () => {
  it("returns empty array for empty periodEndDates", () => {
    const s = buildAmortizationSchedule(100_000, 1000, pledgeDate, []);
    expect(s).toEqual([]);
  });

  it("builds a single-period schedule", () => {
    const endDate = d("2025-01-01");
    const s = buildAmortizationSchedule(100_000, 1000, pledgeDate, [endDate]);
    expect(s).toHaveLength(1);
    const period = s[0];
    expect(period).toBeDefined();
    if (!period) throw new Error("Expected period");
    expect(period.openingCents).toBe(100_000);
    expect(period.periodEndDate).toBe(endDate);
    expect(period.closingCents).toBe(period.openingCents + period.accretionCents);
    expect(period.accretionCents).toBeGreaterThan(0);
  });

  it("exposes web-facing period, date, carrying value, and cumulative accretion fields", () => {
    const endDate = d("2025-01-01");
    const s = buildAmortizationSchedule(100_000, 1000, pledgeDate, [endDate]);
    const period = s[0];
    expect(period).toBeDefined();
    if (!period) throw new Error("Expected period");
    expect(period.period).toBe(1);
    expect(period.date).toBe(endDate);
    expect(period.carryingValueCents).toBe(period.closingCents);
    expect(period.cumulativeAccretionCents).toBe(period.accretionCents);
  });

  it("caps cumulative and period accretion at provided discount cents", () => {
    const dates = [d("2025-01-01"), d("2026-01-01"), d("2027-01-01")];
    const s = buildAmortizationSchedule(100_000, 1000, pledgeDate, dates, 1_500);
    const last = s.at(-1);
    expect(last).toBeDefined();
    if (!last) throw new Error("Expected final period");
    expect(last.cumulativeAccretionCents).toBe(1_500);
    expect(s.reduce((sum, period) => sum + period.accretionCents, 0)).toBe(1_500);
    expect(s.every((period) => period.cumulativeAccretionCents <= 1_500)).toBe(true);
  });

  it("carries forward prior closing to next opening", () => {
    const dates = [d("2025-01-01"), d("2026-01-01")];
    const s = buildAmortizationSchedule(100_000, 1000, pledgeDate, dates);
    expect(s).toHaveLength(2);
    const first = s[0];
    const second = s[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) throw new Error("Expected periods");
    expect(second.openingCents).toBe(first.closingCents);
    expect(second.closingCents).toBe(second.openingCents + second.accretionCents);
  });

  it("each period accretion is non-negative at positive rate", () => {
    const dates = [d("2024-07-01"), d("2025-01-01"), d("2025-07-01"), d("2026-01-01")];
    const s = buildAmortizationSchedule(90_000, 800, pledgeDate, dates);
    for (const p of s) {
      expect(p.accretionCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("produces zero accretion for zero rate", () => {
    const dates = [d("2025-01-01"), d("2026-01-01")];
    const s = buildAmortizationSchedule(100_000, 0, pledgeDate, dates);
    for (const p of s) {
      expect(p.accretionCents).toBe(0);
      expect(p.closingCents).toBe(p.openingCents);
    }
  });
});

// ---------------------------------------------------------------------------
// classifyInstallmentAging
// ---------------------------------------------------------------------------

describe("classifyInstallmentAging", () => {
  const asOf = d("2024-06-01");

  it("returns current when not outstanding (paid)", () => {
    expect(classifyInstallmentAging(d("2024-01-01"), asOf, false)).toBe("current");
  });

  it("returns current when not yet due", () => {
    expect(classifyInstallmentAging(d("2024-12-31"), asOf, true)).toBe("current");
  });

  it("returns current on the due date itself", () => {
    expect(classifyInstallmentAging(d("2024-06-01"), asOf, true)).toBe("current");
  });

  it("classifies 1–30 days past due as 1_30", () => {
    expect(classifyInstallmentAging(d("2024-05-15"), asOf, true)).toBe("1_30");
    expect(classifyInstallmentAging(d("2024-05-02"), asOf, true)).toBe("1_30");
  });

  it("classifies 31–60 days past due as 31_60", () => {
    // 2024-06-01 - 2024-04-25 = 37 days past due
    expect(classifyInstallmentAging(d("2024-04-25"), asOf, true)).toBe("31_60");
  });

  it("classifies 61–90 days past due as 61_90", () => {
    // 2024-06-01 - 2024-03-20 = 73 days past due
    expect(classifyInstallmentAging(d("2024-03-20"), asOf, true)).toBe("61_90");
  });

  it("classifies >90 days past due as 90_plus", () => {
    expect(classifyInstallmentAging(d("2024-01-01"), asOf, true)).toBe("90_plus");
  });

  it("boundary: exactly 30 days past due → 1_30", () => {
    // asOf = 2024-06-01, dueDate = 2024-05-02 → 30 days past
    expect(classifyInstallmentAging(d("2024-05-02"), asOf, true)).toBe("1_30");
  });

  it("boundary: exactly 31 days past due → 31_60", () => {
    // asOf = 2024-06-01, dueDate = 2024-05-01 → 31 days past
    expect(classifyInstallmentAging(d("2024-05-01"), asOf, true)).toBe("31_60");
  });
});

// ---------------------------------------------------------------------------
// isPledgeConditional
// ---------------------------------------------------------------------------

describe("isPledgeConditional", () => {
  it("returns true only when both barrier and right of return are true", () => {
    expect(isPledgeConditional(true, true)).toBe(true);
  });

  it("returns false when barrier is missing", () => {
    expect(isPledgeConditional(false, true)).toBe(false);
  });

  it("returns false when right of return is missing", () => {
    expect(isPledgeConditional(true, false)).toBe(false);
  });

  it("returns false when both are false", () => {
    expect(isPledgeConditional(false, false)).toBe(false);
  });
});
