/**
 * Converts a dollar string from a form input to integer cents.
 *
 * Returns 0 for empty strings, non-numeric strings (NaN), and negative values.
 * Uses Math.round to convert the floating-point dollar amount to the nearest cent.
 */
export function centsFromInput(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}
