// ---------------------------------------------------------------------------
// Allocation math — pure functions for basis-point weight validation and
// largest-remainder cent apportionment.
// ---------------------------------------------------------------------------

export const WEIGHT_TOTAL_BASIS_POINTS = 10000;

/**
 * Returns true iff the weights array is non-empty, every element is a
 * non-negative integer, and the elements sum to exactly 10 000 basis points.
 */
export function weightsAreComplete(weightsBasisPoints: number[]): boolean {
  if (weightsBasisPoints.length === 0) return false;
  for (const w of weightsBasisPoints) {
    if (!Number.isInteger(w) || w < 0) return false;
  }
  const total = weightsBasisPoints.reduce((a, b) => a + b, 0);
  return total === WEIGHT_TOTAL_BASIS_POINTS;
}

/**
 * Splits `amountCents` across `weightsBasisPoints` using the largest-remainder
 * method so the result array sums EXACTLY to `amountCents`.
 *
 * - `amountCents` must be an integer (throws RangeError otherwise).
 * - `weightsBasisPoints` must be non-empty and must not sum to 0 (throws
 *   RangeError otherwise — callers should validate with `weightsAreComplete`
 *   first).
 * - Negative amounts are supported; the sign is re-applied after apportionment.
 */
export function allocateCents(amountCents: number, weightsBasisPoints: number[]): number[] {
  if (!Number.isInteger(amountCents)) {
    throw new RangeError("amountCents must be an integer");
  }
  if (weightsBasisPoints.length === 0) {
    throw new RangeError("weightsBasisPoints must be non-empty");
  }
  const weightSum = weightsBasisPoints.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    throw new RangeError("weightsBasisPoints must not all be zero");
  }

  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);

  // Compute floor allocations and track fractional remainders.
  const floors: number[] = [];
  const fractions: number[] = [];
  let floorSum = 0;

  for (const w of weightsBasisPoints) {
    const exact = (absAmount * w) / weightSum;
    const f = Math.floor(exact);
    floors.push(f);
    fractions.push(exact - f);
    floorSum += f;
  }

  // Distribute leftover units to entries with the largest fractional parts;
  // ties broken by lower index (stable sort preserves original order for equal
  // fractions because we iterate indices in ascending order).
  const leftover = absAmount - floorSum;
  const indices = weightsBasisPoints.map((_, i) => i);
  indices.sort((a, b) => {
    const diff = fractions[b]! - fractions[a]!;
    if (diff !== 0) return diff;
    return a - b; // lower index wins on tie
  });

  const result = [...floors];
  for (let i = 0; i < leftover; i++) {
    result[indices[i]!]! += 1;
  }

  // Re-apply sign. Use `|| 0` to convert -0 → 0.
  return result.map((v) => sign * v || 0);
}
