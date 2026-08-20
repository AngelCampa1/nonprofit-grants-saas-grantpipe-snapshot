import { describe, expect, it } from "vitest";
import { WEIGHT_TOTAL_BASIS_POINTS, weightsAreComplete, allocateCents } from "./allocation-math";

// ---------------------------------------------------------------------------
// WEIGHT_TOTAL_BASIS_POINTS
// ---------------------------------------------------------------------------

describe("WEIGHT_TOTAL_BASIS_POINTS", () => {
  it("equals 10000", () => {
    expect(WEIGHT_TOTAL_BASIS_POINTS).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// weightsAreComplete
// ---------------------------------------------------------------------------

describe("weightsAreComplete", () => {
  it("returns true when weights sum to 10000", () => {
    expect(weightsAreComplete([5000, 3000, 2000])).toBe(true);
  });

  it("returns true for single weight of 10000", () => {
    expect(weightsAreComplete([10000])).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(weightsAreComplete([])).toBe(false);
  });

  it("returns false when sum != 10000", () => {
    expect(weightsAreComplete([5000, 3000])).toBe(false);
  });

  it("returns false when sum exceeds 10000", () => {
    expect(weightsAreComplete([5000, 6000])).toBe(false);
  });

  it("returns false when any element is negative", () => {
    expect(weightsAreComplete([-100, 10100])).toBe(false);
  });

  it("returns false when any element is non-integer", () => {
    expect(weightsAreComplete([5000.5, 4999.5])).toBe(false);
  });

  it("returns true when all weights are zero-sum via one weight of 10000", () => {
    expect(weightsAreComplete([0, 10000])).toBe(true);
  });

  it("returns false when a weight is non-integer float", () => {
    expect(weightsAreComplete([3333.33, 3333.33, 3333.34])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allocateCents
// ---------------------------------------------------------------------------

describe("allocateCents", () => {
  it("throws RangeError on empty weights array", () => {
    expect(() => allocateCents(1000, [])).toThrow(RangeError);
  });

  it("throws RangeError when weights sum to 0", () => {
    expect(() => allocateCents(1000, [0, 0])).toThrow(RangeError);
  });

  it("throws RangeError when amountCents is not an integer", () => {
    expect(() => allocateCents(1000.5, [5000, 5000])).toThrow(RangeError);
  });

  it("allocates exactly for even split", () => {
    const result = allocateCents(1000, [5000, 5000]);
    expect(result).toEqual([500, 500]);
    expect(result[0]! + result[1]!).toBe(1000);
  });

  it("allocates single weight — all goes to it", () => {
    const result = allocateCents(999, [10000]);
    expect(result).toEqual([999]);
  });

  it("sums exactly to amountCents for three-way split with remainder", () => {
    // 100 cents / 3 = 33.33 each; remainder 1 goes to first entry
    const result = allocateCents(100, [3334, 3333, 3333]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    expect(result.length).toBe(3);
  });

  it("largest-remainder distributes remainder to highest fractional entries", () => {
    // 10 cents across equal thirds: 3 + 3 + 3 = 9, remainder 1 goes to index 0
    const result = allocateCents(10, [3334, 3333, 3333]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(10);
  });

  it("handles zero amount — all zeros", () => {
    const result = allocateCents(0, [5000, 3000, 2000]);
    expect(result).toEqual([0, 0, 0]);
  });

  it("handles negative amount correctly", () => {
    const result = allocateCents(-1000, [5000, 5000]);
    expect(result).toEqual([-500, -500]);
    expect(result[0]! + result[1]!).toBe(-1000);
  });

  it("negative amount with remainder sums exactly", () => {
    const result = allocateCents(-10, [3334, 3333, 3333]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(-10);
  });

  it("tie-breaking goes to lower index", () => {
    // 2 cents / [5000, 5000]: exact = 1 each, no remainder — both get 1
    const result = allocateCents(2, [5000, 5000]);
    expect(result).toEqual([1, 1]);
  });

  it("tie in fractional remainder resolves to lower index first", () => {
    // 1 cent across [5000, 5000]: floor(0.5) = 0 each, remainder 1 → index 0
    const result = allocateCents(1, [5000, 5000]);
    expect(result[0]! + result[1]!).toBe(1);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0);
  });

  it("four weights exact divisible", () => {
    const result = allocateCents(400, [2500, 2500, 2500, 2500]);
    expect(result).toEqual([100, 100, 100, 100]);
  });

  it("large amount sums correctly", () => {
    const result = allocateCents(1_000_000, [3000, 4000, 3000]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(1_000_000);
    expect(result[1]).toBe(400_000);
  });

  it("very uneven weights sum correctly", () => {
    const result = allocateCents(7, [9999, 1]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(7);
  });

  it("negative 1 cent distributed to lower index", () => {
    const result = allocateCents(-1, [5000, 5000]);
    expect(result[0]! + result[1]!).toBe(-1);
    expect(result[0]).toBe(-1);
    expect(result[1]).toBe(0);
  });

  it("returns array same length as weights", () => {
    const weights = [1000, 2000, 3000, 4000];
    const result = allocateCents(999, weights);
    expect(result.length).toBe(weights.length);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBe(999);
  });
});
