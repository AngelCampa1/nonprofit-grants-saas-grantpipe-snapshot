// packages/shared/src/utils/fiscal-year.ts

export type FiscalYearRange = {
  start: Date;
  end: Date;
  label: string;
};

/**
 * Get the fiscal year date range that contains the reference date.
 * `fiscalYearStartMonth` is 1-based (1=January, 7=July, etc.).
 */
export function getFiscalYearRange(
  fiscalYearStartMonth: number,
  referenceDate: Date = new Date(),
): { start: Date; end: Date } {
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth() + 1; // 1-based

  let startYear: number;
  if (refMonth >= fiscalYearStartMonth) {
    startYear = refYear;
  } else {
    startYear = refYear - 1;
  }

  const start = new Date(Date.UTC(startYear, fiscalYearStartMonth - 1, 1));

  let endYear: number;
  let endMonth: number;
  if (fiscalYearStartMonth === 1) {
    endYear = startYear;
    endMonth = 12;
  } else {
    endYear = startYear + 1;
    endMonth = fiscalYearStartMonth - 1;
  }

  // Last day of the end month
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const end = new Date(Date.UTC(endYear, endMonth - 1, lastDay, 23, 59, 59, 999));

  return { start, end };
}

/**
 * Label for the fiscal year containing the reference date.
 * Uses the year in which the FY ends: July 2025–June 2026 → "FY2026".
 * Calendar-year FYs: Jan–Dec 2026 → "FY2026".
 */
export function getFiscalYearLabel(
  fiscalYearStartMonth: number,
  referenceDate: Date = new Date(),
): string {
  const { end } = getFiscalYearRange(fiscalYearStartMonth, referenceDate);
  return `FY${end.getUTCFullYear()}`;
}

/**
 * Returns `count` fiscal year ranges ending with the current FY,
 * ordered chronologically (oldest first).
 */
export function getFiscalYearsBack(
  fiscalYearStartMonth: number,
  count: number,
  referenceDate: Date = new Date(),
): FiscalYearRange[] {
  const ranges: FiscalYearRange[] = [];
  const currentFY = getFiscalYearRange(fiscalYearStartMonth, referenceDate);

  for (let i = count - 1; i >= 0; i--) {
    // Shift the start date back by `i` years
    const shiftedRef = new Date(currentFY.start);
    shiftedRef.setUTCFullYear(shiftedRef.getUTCFullYear() - i);
    // Use a date in the middle of that FY to avoid edge cases
    shiftedRef.setUTCMonth(shiftedRef.getUTCMonth() + 1);

    const range = getFiscalYearRange(fiscalYearStartMonth, shiftedRef);
    const label = getFiscalYearLabel(fiscalYearStartMonth, shiftedRef);
    ranges.push({ ...range, label });
  }

  return ranges;
}
