// ---------------------------------------------------------------------------
// Anomaly & Misallocation Detector — pure classifier, no DB access
// All money values are integer cents.
// ---------------------------------------------------------------------------

export const ANOMALY_CLASSES = [
  "category_misallocation",
  "release_over_balance",
  "duplicate_donation",
  "indirect_rate_mismatch",
] as const;

export type AnomalyClass = (typeof ANOMALY_CLASSES)[number];

export const ANOMALY_SEVERITIES = ["info", "warning", "critical"] as const;

export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export const DUPLICATE_DONATION_WINDOW_DAYS = 3;

// ---------------------------------------------------------------------------
// compareSeverity
// ---------------------------------------------------------------------------

/**
 * Compare two AnomalySeverity values.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Ordering: info < warning < critical.
 */
export function compareSeverity(a: AnomalySeverity, b: AnomalySeverity): number {
  return ANOMALY_SEVERITIES.indexOf(a) - ANOMALY_SEVERITIES.indexOf(b);
}

// ---------------------------------------------------------------------------
// classifyCategoryMisallocation
// ---------------------------------------------------------------------------

/**
 * Mirrors `expenseMatchesAllowedCategory` from postingEngine.ts exactly:
 *
 * 1. If expense has neither category nor accountId => NOT an anomaly (matches anything).
 * 2. If allowedCategories is empty => NOT an anomaly (open set; term allows everything).
 * 3. Otherwise, a match requires EVERY non-null expense field to be satisfied by at
 *    least one allowed row. If no row satisfies this, it IS an anomaly.
 *
 * Match condition per row (same as the DB helper):
 *   (!expense.category || row.category === expense.category) &&
 *   (!expense.accountId || row.accountId === expense.accountId)
 */
export function classifyCategoryMisallocation(input: {
  expenseCategory: string | null;
  expenseAccountId: string | null;
  allowedCategories: Array<{ category: string | null; accountId: string | null }>;
}): { isAnomaly: boolean; severity: AnomalySeverity; reason: string } {
  const { expenseCategory, expenseAccountId, allowedCategories } = input;

  // Mirror: if expense has no category and no accountId, it matches any restriction term.
  if (!expenseCategory && !expenseAccountId) {
    return { isAnomaly: false, severity: "info", reason: "" };
  }

  // Open-set semantics: empty allowed list means everything is permitted.
  if (allowedCategories.length === 0) {
    return { isAnomaly: false, severity: "info", reason: "" };
  }

  const matches = allowedCategories.some(
    (row) =>
      (!expenseCategory || row.category === expenseCategory) &&
      (!expenseAccountId || row.accountId === expenseAccountId),
  );

  if (matches) {
    return { isAnomaly: false, severity: "info", reason: "" };
  }

  const label = expenseCategory ?? expenseAccountId ?? "unknown";
  return {
    isAnomaly: true,
    severity: "critical",
    reason: `Expense category "${label}" is not in the allowed category list for this restriction term.`,
  };
}

// ---------------------------------------------------------------------------
// classifyReleaseOverBalance
// ---------------------------------------------------------------------------

export function classifyReleaseOverBalance(input: {
  releaseAmountCents: number;
  availableBalanceCents: number;
}): { isAnomaly: boolean; severity: AnomalySeverity; overByCents: number; reason: string } {
  const { releaseAmountCents, availableBalanceCents } = input;
  const overByCents = Math.max(0, releaseAmountCents - availableBalanceCents);
  const isAnomaly = releaseAmountCents > availableBalanceCents;

  if (!isAnomaly) {
    return { isAnomaly: false, severity: "info", overByCents: 0, reason: "" };
  }

  return {
    isAnomaly: true,
    severity: "critical",
    overByCents,
    reason: `Release of $${(releaseAmountCents / 100).toFixed(2)} exceeds available balance of $${(availableBalanceCents / 100).toFixed(2)} by $${(overByCents / 100).toFixed(2)}.`,
  };
}

// ---------------------------------------------------------------------------
// classifyDuplicateDonationGroup
// ---------------------------------------------------------------------------

/**
 * Given a pre-grouped list of donations (same contactId + amountCents),
 * returns every donation id that falls within windowDays of at least one
 * other donation in the group. Window is inclusive (diff <= windowDays * 86_400_000 ms).
 */
export function classifyDuplicateDonationGroup(input: {
  donations: Array<{ id: string; dateMs: number }>;
  windowDays?: number;
}): { isAnomaly: boolean; severity: AnomalySeverity; duplicateIds: string[]; reason: string } {
  const { donations, windowDays = DUPLICATE_DONATION_WINDOW_DAYS } = input;
  const windowMs = windowDays * 86_400_000;

  if (donations.length < 2) {
    return { isAnomaly: false, severity: "info", duplicateIds: [], reason: "" };
  }

  // Sort by dateMs, then id for determinism
  const sorted = [...donations].sort((a, b) => {
    if (a.dateMs !== b.dateMs) return a.dateMs - b.dateMs;
    return a.id.localeCompare(b.id);
  });

  const withinWindow = new Set<string>();

  for (const [i, di] of sorted.entries()) {
    for (const dj of sorted.slice(i + 1)) {
      if (dj.dateMs - di.dateMs <= windowMs) {
        withinWindow.add(di.id);
        withinWindow.add(dj.id);
      } else {
        // sorted by date; once diff > window, no later donation is within window of di
        break;
      }
    }
  }

  const duplicateIds = sorted.filter((d) => withinWindow.has(d.id)).map((d) => d.id);

  if (duplicateIds.length < 2) {
    return { isAnomaly: false, severity: "info", duplicateIds: [], reason: "" };
  }

  return {
    isAnomaly: true,
    severity: "warning",
    duplicateIds,
    reason: `${duplicateIds.length} donations appear to be duplicates (within ${windowDays}-day window).`,
  };
}

// ---------------------------------------------------------------------------
// classifyIndirectRateMismatch
// ---------------------------------------------------------------------------

/**
 * Derive the effective indirect rate (in basis points) that the posted amount
 * actually represents against the computed base. Returns null when the base is
 * zero (no meaningful rate can be expressed for a posted amount over a zero base).
 */
export function deriveIndirectRateBasisPoints(input: {
  postedAmountCents: number;
  baseAmountCents: number;
}): number | null {
  const { postedAmountCents, baseAmountCents } = input;
  if (baseAmountCents <= 0) return null;
  return Math.round((postedAmountCents * 10000) / baseAmountCents);
}

export function classifyIndirectRateMismatch(input: {
  postedAmountCents: number;
  expectedRateBasisPoints: number;
  expectedAmountCents: number;
}): { isAnomaly: boolean; severity: AnomalySeverity; deltaCents: number; reason: string } {
  const { postedAmountCents, expectedAmountCents } = input;

  const deltaCents = postedAmountCents - expectedAmountCents;
  const isAnomaly = postedAmountCents !== expectedAmountCents;

  if (!isAnomaly) {
    return { isAnomaly: false, severity: "info", deltaCents: 0, reason: "" };
  }

  const direction = deltaCents > 0 ? "over" : "under";
  return {
    isAnomaly: true,
    severity: "warning",
    deltaCents,
    reason: `Indirect cost posted $${(postedAmountCents / 100).toFixed(2)} but the rate rule expects $${(expectedAmountCents / 100).toFixed(2)} ($${(Math.abs(deltaCents) / 100).toFixed(2)} ${direction}).`,
  };
}
