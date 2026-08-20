import { z } from "zod";

export const DONOR_LAPSE_RISK_BANDS = ["none", "lapsing", "at_risk", "lapsed"] as const;

export type DonorLapseRiskBand = (typeof DONOR_LAPSE_RISK_BANDS)[number];

export const donorLapseRiskBandSchema = z.enum(DONOR_LAPSE_RISK_BANDS);

export const lapseRiskQuerySchema = z.object({
  bands: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

/** 18 months ≈ 548 days. Any donor silent longer than this is lapsed regardless of cadence. */
export const LAPSED_RECENCY_DAYS = 548;

/** If daysSinceLastGift exceeds cadence × this multiplier → at_risk. */
export const AT_RISK_CADENCE_MULTIPLIER = 2;

/** If daysSinceLastGift exceeds cadence × this multiplier → lapsing. */
export const LAPSING_CADENCE_MULTIPLIER = 1.25;

export type DonorLapseRisk = {
  band: DonorLapseRiskBand;
  daysSinceLastGift: number | null; // null if no gifts
  typicalCadenceDays: number | null; // null if <2 gifts
  riskScore: number; // 0-100 integer; 0 when band==="none" or no gifts
  lifetimeGivingCents: number;
};

/** Return the number of UTC-midnight days between two dates (floor, min 0). */
function utcDayDiff(earlier: Date, later: Date): number {
  const earlierMidnight = Date.UTC(
    earlier.getUTCFullYear(),
    earlier.getUTCMonth(),
    earlier.getUTCDate(),
  );
  const laterMidnight = Date.UTC(
    later.getUTCFullYear(),
    later.getUTCMonth(),
    later.getUTCDate(),
  );
  const diff = Math.floor((laterMidnight - earlierMidnight) / 86_400_000);
  return Math.max(0, diff);
}

/** Compute the median of a sorted numeric array (ascending). For even length,
 *  averages the two middle values and rounds to nearest integer. */
function medianSorted(sorted: number[]): number {
  const len = sorted.length;
  if (len === 0) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 === 1) {
    return sorted[mid] as number;
  }
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/**
 * riskScore formula (deterministic, 0-100 integer):
 *   - band "none": 0
 *   - Otherwise: base + valueBonus, clamped to [1, 100]
 *   - base: lapsing=40, at_risk=60, lapsed=80
 *   - valueBonus: up to 19 points from a saturating log transform of lifetime dollars.
 *       bonus = floor(19 * log2(1 + lifetimeDollars) / log2(1 + 1_000_000))
 *     This ensures bands never overlap (lapsing ≤ 59, at_risk ≤ 79, lapsed ≤ 99)
 *     and is monotonically increasing in lifetimeGivingCents.
 */
function computeRiskScore(band: DonorLapseRiskBand, lifetimeGivingCents: number): number {
  if (band === "none") return 0;

  const baseByBand: Record<Exclude<DonorLapseRiskBand, "none">, number> = {
    lapsing: 40,
    at_risk: 60,
    lapsed: 80,
  };

  const base = baseByBand[band];
  // Clamp to zero so Math.log2(1 + lifetimeDollars) is always finite (net-negative input guard).
  const lifetimeDollars = Math.max(0, lifetimeGivingCents / 100);
  // Saturates at 19 points when lifetimeDollars ≥ 1,000,000 (=$10M in cents)
  const maxDollars = 1_000_000;
  const bonus = Math.floor((19 * Math.log2(1 + lifetimeDollars)) / Math.log2(1 + maxDollars));
  const score = base + bonus;
  return Math.min(100, Math.max(1, score));
}

export function classifyDonorLapseRisk(input: {
  giftDates: Date[];
  giftAmountsCents: number[];
  now?: Date;
}): DonorLapseRisk {
  const now = input.now ?? new Date();
  const { giftDates, giftAmountsCents } = input;

  const lifetimeGivingCents = giftAmountsCents.reduce((sum, amt) => sum + amt, 0);

  if (giftDates.length === 0) {
    return {
      band: "none",
      daysSinceLastGift: null,
      typicalCadenceDays: null,
      riskScore: 0,
      lifetimeGivingCents,
    };
  }

  // Most recent gift
  const sortedAsc = [...giftDates].sort((a, b) => a.getTime() - b.getTime());
  const lastGift = sortedAsc[sortedAsc.length - 1] as Date;
  const daysSinceLastGift = utcDayDiff(lastGift, now);

  // Typical cadence — needs ≥2 gifts
  let typicalCadenceDays: number | null = null;
  if (sortedAsc.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < sortedAsc.length; i++) {
      gaps.push(utcDayDiff(sortedAsc[i - 1] as Date, sortedAsc[i] as Date));
    }
    gaps.sort((a, b) => a - b);
    const median = medianSorted(gaps);
    typicalCadenceDays = Math.max(1, median);
  }

  // Band classification
  let band: DonorLapseRiskBand;
  if (daysSinceLastGift > LAPSED_RECENCY_DAYS) {
    band = "lapsed";
  } else if (
    typicalCadenceDays !== null &&
    daysSinceLastGift > AT_RISK_CADENCE_MULTIPLIER * typicalCadenceDays
  ) {
    band = "at_risk";
  } else if (
    typicalCadenceDays !== null &&
    daysSinceLastGift > LAPSING_CADENCE_MULTIPLIER * typicalCadenceDays
  ) {
    band = "lapsing";
  } else {
    band = "none";
  }

  return {
    band,
    daysSinceLastGift,
    typicalCadenceDays,
    riskScore: computeRiskScore(band, lifetimeGivingCents),
    lifetimeGivingCents,
  };
}
