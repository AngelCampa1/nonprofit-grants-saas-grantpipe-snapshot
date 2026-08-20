/**
 * Converts a dollar-amount string to integer cents without float multiplication.
 *
 * Uses string-splitting instead of `parseFloat(s) * 100` to avoid IEEE-754
 * drift for values like "0.29" (where `0.29 * 100 === 28.999999999999996`).
 *
 * Handles:
 * - Optional leading/trailing whitespace
 * - Optional leading "$" and comma separators
 * - Optional leading "-" for negative amounts
 * - Zero, one, two, or more decimal digits (sub-cent digits are rounded)
 * - Empty / whitespace-only strings (after stripping "$" and ",") → 0
 *
 * Throws an Error for any non-numeric input that does not match the pattern
 * /^-?\d+(\.\d+)?$/ after stripping whitespace, "$", and "," characters.
 */
export function parseCentsFromString(raw: string): number {
  const trimmed = raw.trim().replace(/[$,\s]/g, "");

  if (trimmed === "" || trimmed === "-") return 0;

  // Validate: must be an optional minus, integer digits, optional decimal.
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid monetary amount: ${raw}`);
  }

  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIndex = abs.indexOf(".");
  if (dotIndex === -1) {
    // No decimal part — multiply whole dollars by 100.
    const result = Number(abs) * 100;
    return negative ? -result : result;
  }

  const dollarsPart = abs.slice(0, dotIndex);
  const decimalPart = abs.slice(dotIndex + 1); // everything after the "."

  const dollars = Number(dollarsPart);

  // Round the fractional dollars to the nearest cent using the decimal string
  // so we avoid IEEE-754 drift (e.g. "0.005" rounds to 1, not 0).
  // Math.round(Number("0." + decimalPart) * 100) is stable for up to ~15 digits.
  const centsFraction = Math.round(Number("0." + decimalPart) * 100);

  const result = dollars * 100 + centsFraction;
  return negative ? -result : result;
}
