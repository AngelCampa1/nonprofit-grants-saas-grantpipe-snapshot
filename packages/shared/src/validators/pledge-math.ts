// ---------------------------------------------------------------------------
// pledge-math.ts — Pure financial math for pledge present-value accounting
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/** Fractional years between two dates (actual/365). */
function yearsFrac(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (MS_PER_DAY * DAYS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// presentValuePledge
// ---------------------------------------------------------------------------

export type PledgePVResult = {
  pvCents: number;
  discountCents: number;
  faceCents: number;
};

/**
 * Compute the present value of a pledge's installment stream.
 *
 * Installments with tᵢ ≤ 1 year from pledgeDate use face value.
 * Installments with tᵢ > 1 year are discounted: amount / (1 + r)^t
 * where r = annualRateBasisPoints / 10000.
 * Each discounted term is Math.round-ed to cents.
 */
export function presentValuePledge(
  installments: { amountCents: number; dueDate: Date }[],
  annualRateBasisPoints: number,
  pledgeDate: Date,
): PledgePVResult {
  const r = Math.max(0, annualRateBasisPoints) / 10_000;

  let faceCents = 0;
  let pvCents = 0;

  for (const inst of installments) {
    faceCents += inst.amountCents;
    const t = yearsFrac(pledgeDate, inst.dueDate);
    if (t <= 1 || r === 0) {
      pvCents += inst.amountCents;
    } else {
      pvCents += Math.round(inst.amountCents / Math.pow(1 + r, t));
    }
  }

  const discountCents = Math.max(0, faceCents - pvCents);
  return { pvCents, discountCents, faceCents };
}

// ---------------------------------------------------------------------------
// accretionThrough
// ---------------------------------------------------------------------------

/**
 * Effective-interest accretion earned from pledgeDate through throughDate.
 *
 * Accretes on the opening carrying value (pvCents) at the stated rate,
 * day-count actual/365. Never exceeds totalDiscountCents. Returns 0 when
 * throughDate ≤ pledgeDate.
 */
export function accretionThrough(
  pvCents: number,
  annualRateBasisPoints: number,
  pledgeDate: Date,
  throughDate: Date,
  totalDiscountCents: number,
): number {
  if (throughDate <= pledgeDate) return 0;
  const r = Math.max(0, annualRateBasisPoints) / 10_000;
  const t = yearsFrac(pledgeDate, throughDate);
  const accreted = Math.round(pvCents * (Math.pow(1 + r, t) - 1));
  return Math.min(accreted, totalDiscountCents);
}

// ---------------------------------------------------------------------------
// buildAmortizationSchedule
// ---------------------------------------------------------------------------

export type AmortizationPeriod = {
  period: number;
  date: Date;
  periodEndDate: Date;
  openingCents: number;
  accretionCents: number;
  cumulativeAccretionCents: number;
  carryingValueCents: number;
  closingCents: number;
};

/**
 * Build a period-by-period effective-interest amortization schedule.
 *
 * Each period's accretion is computed from cumulative accretion at the
 * period end minus cumulative accretion at the prior period end.
 */
export function buildAmortizationSchedule(
  pvCents: number,
  annualRateBasisPoints: number,
  pledgeDate: Date,
  periodEndDates: Date[],
  totalDiscountCents = Number.MAX_SAFE_INTEGER,
): AmortizationPeriod[] {
  const totalDiscount = Math.max(0, totalDiscountCents);

  const schedule: AmortizationPeriod[] = [];
  let prevCumulativeAccretion = 0;
  let runningCarrying = pvCents;

  for (const [index, endDate] of periodEndDates.entries()) {
    const cumulativeAccretion = accretionThrough(
      pvCents,
      annualRateBasisPoints,
      pledgeDate,
      endDate,
      totalDiscount,
    );
    const periodAccretion = cumulativeAccretion - prevCumulativeAccretion;
    const carryingValueCents = runningCarrying + periodAccretion;
    schedule.push({
      period: index + 1,
      date: endDate,
      periodEndDate: endDate,
      openingCents: runningCarrying,
      accretionCents: periodAccretion,
      cumulativeAccretionCents: cumulativeAccretion,
      carryingValueCents,
      closingCents: carryingValueCents,
    });
    runningCarrying = carryingValueCents;
    prevCumulativeAccretion = cumulativeAccretion;
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// classifyInstallmentAging
// ---------------------------------------------------------------------------

export type InstallmentAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

/**
 * Classify an installment's aging relative to a given "as of" date.
 *
 * If not yet due, or already paid (isOutstanding = false) → "current".
 * Otherwise days past due drives the bucket.
 */
export function classifyInstallmentAging(
  dueDate: Date,
  asOf: Date,
  isOutstanding: boolean,
): InstallmentAgingBucket {
  if (!isOutstanding) return "current";

  const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / MS_PER_DAY);

  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1_30";
  if (daysPastDue <= 60) return "31_60";
  if (daysPastDue <= 90) return "61_90";
  return "90_plus";
}

// ---------------------------------------------------------------------------
// isPledgeConditional
// ---------------------------------------------------------------------------

/**
 * A pledge is conditional (ASC 958-605) when BOTH a barrier to entitlement
 * AND a right of return / release exist.
 */
export function isPledgeConditional(hasBarrier: boolean, hasRightOfReturn: boolean): boolean {
  return hasBarrier && hasRightOfReturn;
}
