import { describe, expect, it } from "vitest";
import {
  DONOR_LAPSE_RISK_BANDS,
  LAPSED_RECENCY_DAYS,
  AT_RISK_CADENCE_MULTIPLIER,
  LAPSING_CADENCE_MULTIPLIER,
  donorLapseRiskBandSchema,
  classifyDonorLapseRisk,
} from "./donor-lapse";

// Helper: build a Date that is `days` days before `now`.
function daysAgo(days: number, now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

const NOW = new Date("2026-06-16T12:00:00Z");

describe("DONOR_LAPSE_RISK_BANDS", () => {
  it("exposes the four bands in order", () => {
    expect(DONOR_LAPSE_RISK_BANDS).toEqual(["none", "lapsing", "at_risk", "lapsed"]);
  });
});

describe("donorLapseRiskBandSchema", () => {
  it("accepts valid bands", () => {
    for (const band of DONOR_LAPSE_RISK_BANDS) {
      expect(donorLapseRiskBandSchema.parse(band)).toBe(band);
    }
  });

  it("rejects unknown values", () => {
    expect(() => donorLapseRiskBandSchema.parse("churned")).toThrow();
  });
});

describe("threshold constants", () => {
  it("LAPSED_RECENCY_DAYS is 548", () => {
    expect(LAPSED_RECENCY_DAYS).toBe(548);
  });

  it("AT_RISK_CADENCE_MULTIPLIER is 2", () => {
    expect(AT_RISK_CADENCE_MULTIPLIER).toBe(2);
  });

  it("LAPSING_CADENCE_MULTIPLIER is 1.25", () => {
    expect(LAPSING_CADENCE_MULTIPLIER).toBe(1.25);
  });
});

describe("classifyDonorLapseRisk — no gifts", () => {
  it("returns band none, nulls, riskScore 0 when giftDates is empty", () => {
    const result = classifyDonorLapseRisk({ giftDates: [], giftAmountsCents: [], now: NOW });
    expect(result.band).toBe("none");
    expect(result.daysSinceLastGift).toBeNull();
    expect(result.typicalCadenceDays).toBeNull();
    expect(result.riskScore).toBe(0);
    expect(result.lifetimeGivingCents).toBe(0);
  });
});

describe("classifyDonorLapseRisk — single gift", () => {
  it("single recent gift → band none", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(30, NOW)],
      giftAmountsCents: [10000],
      now: NOW,
    });
    expect(result.band).toBe("none");
    expect(result.daysSinceLastGift).toBe(30);
    expect(result.typicalCadenceDays).toBeNull();
    expect(result.riskScore).toBe(0);
    expect(result.lifetimeGivingCents).toBe(10000);
  });

  it("single gift >548 days ago → band lapsed", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(600, NOW)],
      giftAmountsCents: [5000],
      now: NOW,
    });
    expect(result.band).toBe("lapsed");
    expect(result.daysSinceLastGift).toBe(600);
    expect(result.typicalCadenceDays).toBeNull();
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("single gift exactly 548 days ago → band none (boundary: > not >=)", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(548, NOW)],
      giftAmountsCents: [5000],
      now: NOW,
    });
    expect(result.band).toBe("none");
  });

  it("single gift 549 days ago → band lapsed", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(549, NOW)],
      giftAmountsCents: [5000],
      now: NOW,
    });
    expect(result.band).toBe("lapsed");
  });
});

describe("classifyDonorLapseRisk — cadence (>=2 gifts)", () => {
  it("steady cadence donor within rhythm → none", () => {
    // gifts every 90 days; last gift 80 days ago → well within cadence
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(270, NOW), daysAgo(180, NOW), daysAgo(90, NOW), daysAgo(0, NOW)],
      giftAmountsCents: [10000, 10000, 10000, 10000],
      now: NOW,
    });
    expect(result.band).toBe("none");
    expect(result.typicalCadenceDays).toBe(90);
    expect(result.riskScore).toBe(0);
  });

  it("cadence broken past 1.25x → lapsing", () => {
    // cadence 90 days, last gift 115 days ago (> 90*1.25=112.5)
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(205, NOW), daysAgo(115, NOW)],
      giftAmountsCents: [10000, 10000],
      now: NOW,
    });
    expect(result.typicalCadenceDays).toBe(90);
    expect(result.band).toBe("lapsing");
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.riskScore).toBeLessThan(60);
  });

  it("cadence broken past 2x → at_risk", () => {
    // cadence 90 days, last gift 200 days ago (> 90*2=180)
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(290, NOW), daysAgo(200, NOW)],
      giftAmountsCents: [10000, 10000],
      now: NOW,
    });
    expect(result.typicalCadenceDays).toBe(90);
    expect(result.band).toBe("at_risk");
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
    expect(result.riskScore).toBeLessThan(80);
  });

  it(">548 days overrides cadence to lapsed", () => {
    // cadence 100 days, last gift 600 days ago
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(700, NOW), daysAgo(600, NOW)],
      giftAmountsCents: [10000, 10000],
      now: NOW,
    });
    expect(result.band).toBe("lapsed");
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
  });
});

describe("classifyDonorLapseRisk — median cadence", () => {
  it("odd number of gaps → exact median", () => {
    // 3 gifts → 2 gaps: [30, 60] → median = 45
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(90, NOW), daysAgo(60, NOW), daysAgo(0, NOW)],
      giftAmountsCents: [5000, 5000, 5000],
      now: NOW,
    });
    expect(result.typicalCadenceDays).toBe(45);
  });

  it("even number of gaps → average of two middle values rounded", () => {
    // 5 gifts → 4 gaps: [30, 60, 90, 120] → median = avg(60,90)=75
    const result = classifyDonorLapseRisk({
      giftDates: [
        daysAgo(300, NOW),
        daysAgo(270, NOW),
        daysAgo(210, NOW),
        daysAgo(120, NOW),
        daysAgo(0, NOW),
      ],
      giftAmountsCents: [5000, 5000, 5000, 5000, 5000],
      now: NOW,
    });
    expect(result.typicalCadenceDays).toBe(75);
  });

  it("guards against zero median by treating it as 1", () => {
    // Same date twice → gap 0 → median 0 → treated as 1
    const sameDay = daysAgo(90, NOW);
    const result = classifyDonorLapseRisk({
      giftDates: [sameDay, new Date(sameDay)],
      giftAmountsCents: [5000, 5000],
      now: NOW,
    });
    expect(result.typicalCadenceDays).toBe(1);
  });
});

describe("classifyDonorLapseRisk — riskScore ordering", () => {
  it("none → riskScore 0", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(30, NOW)],
      giftAmountsCents: [1000000],
      now: NOW,
    });
    expect(result.riskScore).toBe(0);
  });

  it("lapsed major donor scores higher than at_risk major donor", () => {
    const majorLapsed = classifyDonorLapseRisk({
      giftDates: [daysAgo(600, NOW)],
      giftAmountsCents: [500000],
      now: NOW,
    });
    const majorAtRisk = classifyDonorLapseRisk({
      giftDates: [daysAgo(290, NOW), daysAgo(200, NOW)],
      giftAmountsCents: [250000, 250000],
      now: NOW,
    });
    expect(majorLapsed.band).toBe("lapsed");
    expect(majorAtRisk.band).toBe("at_risk");
    expect(majorLapsed.riskScore).toBeGreaterThan(majorAtRisk.riskScore);
  });

  it("at_risk major donor scores higher than lapsing small donor", () => {
    const majorAtRisk = classifyDonorLapseRisk({
      giftDates: [daysAgo(290, NOW), daysAgo(200, NOW)],
      giftAmountsCents: [250000, 250000],
      now: NOW,
    });
    const smallLapsing = classifyDonorLapseRisk({
      giftDates: [daysAgo(205, NOW), daysAgo(115, NOW)],
      giftAmountsCents: [100, 100],
      now: NOW,
    });
    expect(majorAtRisk.band).toBe("at_risk");
    expect(smallLapsing.band).toBe("lapsing");
    expect(majorAtRisk.riskScore).toBeGreaterThan(smallLapsing.riskScore);
  });

  it("riskScore is monotonically non-decreasing in lifetimeGivingCents within lapsing band", () => {
    const small = classifyDonorLapseRisk({
      giftDates: [daysAgo(205, NOW), daysAgo(115, NOW)],
      giftAmountsCents: [100, 100],
      now: NOW,
    });
    const large = classifyDonorLapseRisk({
      giftDates: [daysAgo(205, NOW), daysAgo(115, NOW)],
      giftAmountsCents: [500000, 500000],
      now: NOW,
    });
    expect(small.band).toBe("lapsing");
    expect(large.band).toBe("lapsing");
    expect(large.riskScore).toBeGreaterThanOrEqual(small.riskScore);
  });

  it("riskScore is clamped to [1, 100]", () => {
    // Extreme lifetime value should not exceed 100
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(600, NOW)],
      giftAmountsCents: [999_999_999],
      now: NOW,
    });
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskScore).toBeGreaterThanOrEqual(1);
  });

  it("riskScore for non-none band is at least 1", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(205, NOW), daysAgo(115, NOW)],
      giftAmountsCents: [0, 0],
      now: NOW,
    });
    expect(result.band).toBe("lapsing");
    expect(result.riskScore).toBeGreaterThanOrEqual(1);
  });
});

describe("classifyDonorLapseRisk — lifetimeGivingCents", () => {
  it("sums all amounts", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(10, NOW), daysAgo(5, NOW)],
      giftAmountsCents: [1000, 2000],
      now: NOW,
    });
    expect(result.lifetimeGivingCents).toBe(3000);
  });
});

describe("classifyDonorLapseRisk — now defaults to current time", () => {
  it("works without providing now", () => {
    // Just ensure it doesn't throw
    const result = classifyDonorLapseRisk({
      giftDates: [new Date()],
      giftAmountsCents: [5000],
    });
    expect(result.band).toBe("none");
    expect(result.daysSinceLastGift).toBe(0);
  });
});

describe("classifyDonorLapseRisk — daysSinceLastGift", () => {
  it("is 0 when gift is today (same UTC day)", () => {
    const today = new Date("2026-06-16T00:00:00Z");
    const result = classifyDonorLapseRisk({
      giftDates: [today],
      giftAmountsCents: [5000],
      now: new Date("2026-06-16T23:59:59Z"),
    });
    expect(result.daysSinceLastGift).toBe(0);
  });

  it("uses the most recent gift date when multiple gifts provided", () => {
    const result = classifyDonorLapseRisk({
      giftDates: [daysAgo(100, NOW), daysAgo(10, NOW), daysAgo(50, NOW)],
      giftAmountsCents: [5000, 5000, 5000],
      now: NOW,
    });
    expect(result.daysSinceLastGift).toBe(10);
  });
});

describe("classifyDonorLapseRisk — net-negative lifetime giving guard", () => {
  it("produces a finite riskScore when lifetimeGivingCents is net-negative", () => {
    // This can happen if refunds exceed donations. The log formula must not yield NaN.
    const result = classifyDonorLapseRisk({
      // Two old gifts; last one is > LAPSED_RECENCY_DAYS (548) ago → band = lapsed
      giftDates: [daysAgo(1000, NOW), daysAgo(600, NOW)],
      // Net-negative: refund represented as negative cents
      giftAmountsCents: [10000, -20000],
      now: NOW,
    });
    // lifetimeGivingCents = -10000 → clamped to 0 → log2(1) = 0 → bonus = 0
    expect(Number.isFinite(result.riskScore)).toBe(true);
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.band).toBe("lapsed");
    // lifetimeGivingCents reflects the raw sum (not clamped in the output)
    expect(result.lifetimeGivingCents).toBe(-10000);
  });
});

