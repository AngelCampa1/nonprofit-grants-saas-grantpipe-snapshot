import { z } from "zod";

// ---------------------------------------------------------------------------
// Band constants + types
// ---------------------------------------------------------------------------

export const BUDGET_OVERSPEND_BANDS = [
  "ok",
  "near_limit",
  "projected_overspend",
  "over_budget",
] as const;

export type BudgetOverspendBand = (typeof BUDGET_OVERSPEND_BANDS)[number];

export const budgetOverspendBandSchema = z.enum(BUDGET_OVERSPEND_BANDS);

export const FUND_UNDERSPEND_BANDS = [
  "ok",
  "lapse_watch",
  "lapsing_soon",
  "lapsed_unspent",
] as const;

export type FundUnderspendBand = (typeof FUND_UNDERSPEND_BANDS)[number];

export const fundUnderspendBandSchema = z.enum(FUND_UNDERSPEND_BANDS);

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

/** Projected spend ratio that triggers near_limit warning. */
export const NEAR_LIMIT_RATIO = 0.9;

/** Days until fund end date that triggers lapsing_soon. */
export const LAPSING_SOON_DAYS = 30;

/** Days until fund end date that triggers lapse_watch. */
export const LAPSE_WATCH_DAYS = 90;

// ---------------------------------------------------------------------------
// Query schema (mirrors lapseRiskQuerySchema style)
// ---------------------------------------------------------------------------

export const budgetSentinelQuerySchema = z.object({
  kinds: z.array(z.enum(["overspend", "underspend"])).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export type BudgetSentinelQueryParams = z.infer<typeof budgetSentinelQuerySchema>;

// ---------------------------------------------------------------------------
// Shared log-scale bonus (mirrors donor-lapse formula)
// ---------------------------------------------------------------------------

function logScaleBonus(dollars: number): number {
  const safeDollars = Math.max(0, dollars);
  const maxDollars = 1_000_000;
  return Math.floor((19 * Math.log2(1 + safeDollars)) / Math.log2(1 + maxDollars));
}

// ---------------------------------------------------------------------------
// classifyBudgetLineOverspend
// ---------------------------------------------------------------------------

export type BudgetOverspendResult = {
  band: BudgetOverspendBand;
  projectedCents: number;
  overByCents: number;
  utilizationPercent: number | null;
  riskScore: number;
};

export function classifyBudgetLineOverspend(input: {
  approvedAmountCents: number;
  actualCents: number;
  plannedCents: number;
}): BudgetOverspendResult {
  const { approvedAmountCents, actualCents, plannedCents } = input;
  const projectedCents = actualCents + plannedCents;
  const overByCents = Math.max(0, actualCents - approvedAmountCents);

  // No meaningful ratio when approved <= 0
  if (approvedAmountCents <= 0) {
    return {
      band: "ok",
      projectedCents,
      overByCents,
      utilizationPercent: null,
      riskScore: 0,
    };
  }

  const utilizationPercent = Math.round((projectedCents / approvedAmountCents) * 100);

  let band: BudgetOverspendBand;
  if (actualCents > approvedAmountCents) {
    band = "over_budget";
  } else if (projectedCents > approvedAmountCents) {
    band = "projected_overspend";
  } else if (projectedCents >= NEAR_LIMIT_RATIO * approvedAmountCents) {
    band = "near_limit";
  } else {
    band = "ok";
  }

  if (band === "ok") {
    return { band, projectedCents, overByCents, utilizationPercent, riskScore: 0 };
  }

  const baseByBand: Record<Exclude<BudgetOverspendBand, "ok">, number> = {
    near_limit: 40,
    projected_overspend: 60,
    over_budget: 80,
  };

  const base = baseByBand[band];

  // Dollar exposure for bonus: for over_budget use overByCents; otherwise use projected overage
  const exposureDollars =
    band === "over_budget"
      ? Math.max(0, overByCents) / 100
      : Math.max(0, projectedCents - approvedAmountCents) / 100;

  const score = base + logScaleBonus(exposureDollars);
  return {
    band,
    projectedCents,
    overByCents,
    utilizationPercent,
    riskScore: Math.min(100, Math.max(0, score)),
  };
}

// ---------------------------------------------------------------------------
// classifyFundUnderspend
// ---------------------------------------------------------------------------

export type FundUnderspendResult = {
  band: FundUnderspendBand;
  daysUntilEnd: number;
  balanceCents: number;
  riskScore: number;
};

/** Compute UTC-midnight signed day difference: endDate - now (positive = future). */
function utcDayDiffSigned(now: Date, endDate: Date): number {
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endMidnight = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  return Math.floor((endMidnight - nowMidnight) / 86_400_000);
}

export function classifyFundUnderspend(input: {
  endDate: Date;
  balanceCents: number;
  now: Date;
}): FundUnderspendResult {
  const { endDate, balanceCents, now } = input;
  const daysUntilEnd = utcDayDiffSigned(now, endDate);

  // No risk when balance is already spent (or negative)
  if (balanceCents <= 0) {
    return { band: "ok", daysUntilEnd, balanceCents, riskScore: 0 };
  }

  let band: FundUnderspendBand;
  if (daysUntilEnd <= 0) {
    band = "lapsed_unspent";
  } else if (daysUntilEnd <= LAPSING_SOON_DAYS) {
    band = "lapsing_soon";
  } else if (daysUntilEnd <= LAPSE_WATCH_DAYS) {
    band = "lapse_watch";
  } else {
    band = "ok";
  }

  if (band === "ok") {
    return { band, daysUntilEnd, balanceCents, riskScore: 0 };
  }

  const baseByBand: Record<Exclude<FundUnderspendBand, "ok">, number> = {
    lapse_watch: 40,
    lapsing_soon: 60,
    lapsed_unspent: 80,
  };

  const base = baseByBand[band];
  const dollars = Math.max(0, balanceCents) / 100;
  const score = base + logScaleBonus(dollars);
  return {
    band,
    daysUntilEnd,
    balanceCents,
    riskScore: Math.min(100, Math.max(0, score)),
  };
}
