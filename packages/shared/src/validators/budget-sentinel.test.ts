import { describe, expect, it } from "vitest";
import {
  BUDGET_OVERSPEND_BANDS,
  FUND_UNDERSPEND_BANDS,
  NEAR_LIMIT_RATIO,
  LAPSING_SOON_DAYS,
  LAPSE_WATCH_DAYS,
  budgetOverspendBandSchema,
  fundUnderspendBandSchema,
  budgetSentinelQuerySchema,
  classifyBudgetLineOverspend,
  classifyFundUnderspend,
} from "./budget-sentinel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("BUDGET_OVERSPEND_BANDS", () => {
  it("exposes the four bands in order", () => {
    expect(BUDGET_OVERSPEND_BANDS).toEqual([
      "ok",
      "near_limit",
      "projected_overspend",
      "over_budget",
    ]);
  });
});

describe("FUND_UNDERSPEND_BANDS", () => {
  it("exposes the four bands in order", () => {
    expect(FUND_UNDERSPEND_BANDS).toEqual(["ok", "lapse_watch", "lapsing_soon", "lapsed_unspent"]);
  });
});

describe("threshold constants", () => {
  it("NEAR_LIMIT_RATIO is 0.9", () => {
    expect(NEAR_LIMIT_RATIO).toBe(0.9);
  });

  it("LAPSING_SOON_DAYS is 30", () => {
    expect(LAPSING_SOON_DAYS).toBe(30);
  });

  it("LAPSE_WATCH_DAYS is 90", () => {
    expect(LAPSE_WATCH_DAYS).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe("budgetOverspendBandSchema", () => {
  it("accepts all valid bands", () => {
    for (const band of BUDGET_OVERSPEND_BANDS) {
      expect(budgetOverspendBandSchema.parse(band)).toBe(band);
    }
  });

  it("rejects unknown values", () => {
    expect(() => budgetOverspendBandSchema.parse("danger")).toThrow();
  });
});

describe("fundUnderspendBandSchema", () => {
  it("accepts all valid bands", () => {
    for (const band of FUND_UNDERSPEND_BANDS) {
      expect(fundUnderspendBandSchema.parse(band)).toBe(band);
    }
  });

  it("rejects unknown values", () => {
    expect(() => fundUnderspendBandSchema.parse("expired")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// budgetSentinelQuerySchema
// ---------------------------------------------------------------------------

describe("budgetSentinelQuerySchema", () => {
  it("accepts valid kinds array", () => {
    const result = budgetSentinelQuerySchema.parse({ kinds: ["overspend", "underspend"] });
    expect(result.kinds).toEqual(["overspend", "underspend"]);
  });

  it("accepts a single kind", () => {
    const result = budgetSentinelQuerySchema.parse({ kinds: ["overspend"] });
    expect(result.kinds).toEqual(["overspend"]);
  });

  it("accepts omitted kinds", () => {
    const result = budgetSentinelQuerySchema.parse({});
    expect(result.kinds).toBeUndefined();
  });

  it("rejects invalid kind tokens", () => {
    expect(() => budgetSentinelQuerySchema.parse({ kinds: ["invalid"] })).toThrow();
  });

  it("rejects mixed valid/invalid kind tokens", () => {
    expect(() => budgetSentinelQuerySchema.parse({ kinds: ["overspend", "bad"] })).toThrow();
  });

  it("accepts a numeric limit", () => {
    const result = budgetSentinelQuerySchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it("coerces string limit to number", () => {
    const result = budgetSentinelQuerySchema.parse({ limit: "25" });
    expect(result.limit).toBe(25);
  });

  it("rejects limit of zero", () => {
    expect(() => budgetSentinelQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit exceeding 500", () => {
    expect(() => budgetSentinelQuerySchema.parse({ limit: 501 })).toThrow();
  });

  it("accepts omitted limit", () => {
    const result = budgetSentinelQuerySchema.parse({});
    expect(result.limit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// classifyBudgetLineOverspend
// ---------------------------------------------------------------------------

describe("classifyBudgetLineOverspend", () => {
  // ok — well under 90%
  it("returns ok when projected is well under approved", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 20_000,
      plannedCents: 30_000,
    });
    expect(result.band).toBe("ok");
    expect(result.riskScore).toBe(0);
    expect(result.projectedCents).toBe(50_000);
    expect(result.overByCents).toBe(0);
  });

  // near_limit — projected >= 90% but not over
  it("returns near_limit when projected is exactly 90%", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 50_000,
      plannedCents: 40_000,
    });
    // projected = 90_000, ratio = 0.9 => near_limit
    expect(result.band).toBe("near_limit");
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.riskScore).toBeLessThan(60);
  });

  it("returns near_limit at just above 90%", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 50_000,
      plannedCents: 41_000,
    });
    expect(result.band).toBe("near_limit");
  });

  // projected_overspend — actual ok but projected > approved
  it("returns projected_overspend when actual is fine but projected exceeds approved", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 60_000,
      plannedCents: 50_000,
    });
    expect(result.band).toBe("projected_overspend");
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
    expect(result.riskScore).toBeLessThan(80);
    expect(result.overByCents).toBe(0); // not ALREADY over
    expect(result.projectedCents).toBe(110_000);
  });

  // over_budget — actual already over
  it("returns over_budget when actual already exceeds approved", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 110_000,
      plannedCents: 0,
    });
    expect(result.band).toBe("over_budget");
    expect(result.overByCents).toBe(10_000);
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  // already over with additional planned
  it("returns over_budget when actual is over even with more planned", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 105_000,
      plannedCents: 20_000,
    });
    expect(result.band).toBe("over_budget");
    expect(result.overByCents).toBe(5_000);
    expect(result.projectedCents).toBe(125_000);
  });

  // exactly at approved amount — should be ok (not over, projected == approved, ratio == 1 > 0.9 → near_limit)
  it("returns near_limit when actual equals approved (projected == approved)", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 100_000,
      plannedCents: 0,
    });
    // actual == approved → over_budget (actual > approved is false, projected == approved > 90% → near_limit)
    // Actually: actual (100000) is NOT > approved (100000), projected (100000) NOT > approved → near_limit since >= 0.9*approved
    expect(result.band).toBe("near_limit");
  });

  // zero approved amount — should return ok with null utilization
  it("returns ok with null utilizationPercent when approvedAmountCents is 0", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 0,
      actualCents: 5_000,
      plannedCents: 2_000,
    });
    expect(result.band).toBe("ok");
    expect(result.utilizationPercent).toBeNull();
    expect(result.riskScore).toBe(0);
  });

  // negative approved amount — should return ok
  it("returns ok when approvedAmountCents is negative", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: -1,
      actualCents: 0,
      plannedCents: 0,
    });
    expect(result.band).toBe("ok");
    expect(result.utilizationPercent).toBeNull();
  });

  // utilization percent computed correctly
  it("computes utilizationPercent rounded", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 300_000,
      actualCents: 100_000,
      plannedCents: 50_000,
    });
    // projected = 150_000, ratio = 0.5, utilization = 50
    expect(result.utilizationPercent).toBe(50);
  });

  it("rounds utilization to nearest integer", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 300_000,
      actualCents: 100_000,
      plannedCents: 51_000,
    });
    // projected = 151_000 / 300_000 = 50.333... → 50
    expect(result.utilizationPercent).toBe(50);
  });

  // riskScore finiteness
  it("riskScore is always a finite number", () => {
    const cases = [
      { approvedAmountCents: 0, actualCents: 0, plannedCents: 0 },
      { approvedAmountCents: 1_000_000, actualCents: 2_000_000, plannedCents: 0 },
      { approvedAmountCents: 100, actualCents: 0, plannedCents: 0 },
    ];
    for (const c of cases) {
      const { riskScore } = classifyBudgetLineOverspend(c);
      expect(Number.isFinite(riskScore)).toBe(true);
    }
  });

  // riskScore clamped at 100
  it("riskScore is clamped at 100 for very large overspend", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 100,
      actualCents: 100_000_000_00,
      plannedCents: 0,
    });
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  // riskScore for ok is 0
  it("riskScore is 0 for ok band", () => {
    const result = classifyBudgetLineOverspend({
      approvedAmountCents: 1_000_000,
      actualCents: 0,
      plannedCents: 0,
    });
    expect(result.riskScore).toBe(0);
    expect(result.band).toBe("ok");
  });

  // band ordering by score — over_budget scores higher than projected_overspend
  it("over_budget scores higher than projected_overspend for similar exposure", () => {
    const overBudget = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 110_000,
      plannedCents: 0,
    });
    const projectedOver = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 60_000,
      plannedCents: 50_000,
    });
    expect(overBudget.riskScore).toBeGreaterThan(projectedOver.riskScore);
  });

  it("projected_overspend scores higher than near_limit", () => {
    const projectedOver = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 60_000,
      plannedCents: 50_000,
    });
    const nearLimit = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 50_000,
      plannedCents: 40_000,
    });
    expect(projectedOver.riskScore).toBeGreaterThan(nearLimit.riskScore);
  });

  it("near_limit scores higher than ok", () => {
    const nearLimit = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 50_000,
      plannedCents: 40_000,
    });
    const ok = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 10_000,
      plannedCents: 0,
    });
    expect(nearLimit.riskScore).toBeGreaterThan(ok.riskScore);
  });

  // larger dollar exposure → higher risk within same band
  it("larger overspend exposure yields higher riskScore within over_budget band", () => {
    const small = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 101_000,
      plannedCents: 0,
    });
    const large = classifyBudgetLineOverspend({
      approvedAmountCents: 100_000,
      actualCents: 200_000,
      plannedCents: 0,
    });
    expect(large.riskScore).toBeGreaterThan(small.riskScore);
  });
});

// ---------------------------------------------------------------------------
// classifyFundUnderspend
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-16T12:00:00Z");

function daysFromNow(days: number, base = NOW): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

describe("classifyFundUnderspend", () => {
  // ok — balance is zero
  it("returns ok when balanceCents is 0", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(200),
      balanceCents: 0,
      now: NOW,
    });
    expect(result.band).toBe("ok");
    expect(result.riskScore).toBe(0);
  });

  // ok — balance negative
  it("returns ok when balanceCents is negative", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(200),
      balanceCents: -500,
      now: NOW,
    });
    expect(result.band).toBe("ok");
    expect(result.riskScore).toBe(0);
  });

  // ok — far from end date with positive balance
  it("returns ok when daysUntilEnd > 90 with positive balance", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(91),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("ok");
  });

  // lapse_watch — 31–90 days
  it("returns lapse_watch when daysUntilEnd is 90 (exactly LAPSE_WATCH_DAYS)", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(90),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapse_watch");
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.riskScore).toBeLessThan(60);
  });

  it("returns lapse_watch when daysUntilEnd is 31", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(31),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapse_watch");
  });

  // lapsing_soon — 1–30 days
  it("returns lapsing_soon when daysUntilEnd is 30 (exactly LAPSING_SOON_DAYS)", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(30),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapsing_soon");
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
    expect(result.riskScore).toBeLessThan(80);
  });

  it("returns lapsing_soon when daysUntilEnd is 1", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(1),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapsing_soon");
  });

  // lapsed_unspent — daysUntilEnd <= 0
  it("returns lapsed_unspent when daysUntilEnd is 0 (end date is today)", () => {
    const result = classifyFundUnderspend({
      endDate: NOW,
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapsed_unspent");
    expect(result.daysUntilEnd).toBe(0);
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
  });

  it("returns lapsed_unspent when endDate is in the past", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(-10),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.band).toBe("lapsed_unspent");
    expect(result.daysUntilEnd).toBeLessThanOrEqual(0);
  });

  // daysUntilEnd returned correctly
  it("returns correct daysUntilEnd for future date", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(45),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(result.daysUntilEnd).toBe(45);
    expect(result.band).toBe("lapse_watch");
  });

  // balanceCents passed through
  it("passes balanceCents through to result", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(50),
      balanceCents: 12_345,
      now: NOW,
    });
    expect(result.balanceCents).toBe(12_345);
  });

  // riskScore finiteness
  it("riskScore is always finite", () => {
    const cases = [
      { endDate: daysFromNow(0), balanceCents: 0 },
      { endDate: daysFromNow(-1), balanceCents: 100_000_000 },
      { endDate: daysFromNow(200), balanceCents: 0 },
    ];
    for (const c of cases) {
      const { riskScore } = classifyFundUnderspend({ ...c, now: NOW });
      expect(Number.isFinite(riskScore)).toBe(true);
    }
  });

  // riskScore clamped at 100
  it("riskScore clamped at 100 for very large balance", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(-1),
      balanceCents: 100_000_000_000,
      now: NOW,
    });
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  // ok → 0
  it("riskScore is 0 for ok band", () => {
    const result = classifyFundUnderspend({
      endDate: daysFromNow(200),
      balanceCents: 0,
      now: NOW,
    });
    expect(result.riskScore).toBe(0);
  });

  // band ordering by score
  it("lapsed_unspent scores higher than lapsing_soon", () => {
    const lapsed = classifyFundUnderspend({
      endDate: daysFromNow(0),
      balanceCents: 50_000,
      now: NOW,
    });
    const lapsingSoon = classifyFundUnderspend({
      endDate: daysFromNow(15),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(lapsed.riskScore).toBeGreaterThan(lapsingSoon.riskScore);
  });

  it("lapsing_soon scores higher than lapse_watch", () => {
    const lapsingSoon = classifyFundUnderspend({
      endDate: daysFromNow(15),
      balanceCents: 50_000,
      now: NOW,
    });
    const lapseWatch = classifyFundUnderspend({
      endDate: daysFromNow(60),
      balanceCents: 50_000,
      now: NOW,
    });
    expect(lapsingSoon.riskScore).toBeGreaterThan(lapseWatch.riskScore);
  });

  it("lapse_watch scores higher than ok", () => {
    const lapseWatch = classifyFundUnderspend({
      endDate: daysFromNow(60),
      balanceCents: 50_000,
      now: NOW,
    });
    const ok = classifyFundUnderspend({
      endDate: daysFromNow(200),
      balanceCents: 0,
      now: NOW,
    });
    expect(lapseWatch.riskScore).toBeGreaterThan(ok.riskScore);
  });

  // larger balance → higher risk within same band
  it("larger unspent balance yields higher riskScore within lapsed_unspent band", () => {
    const small = classifyFundUnderspend({
      endDate: daysFromNow(0),
      balanceCents: 1_000,
      now: NOW,
    });
    const large = classifyFundUnderspend({
      endDate: daysFromNow(0),
      balanceCents: 500_000,
      now: NOW,
    });
    expect(large.riskScore).toBeGreaterThan(small.riskScore);
  });
});
