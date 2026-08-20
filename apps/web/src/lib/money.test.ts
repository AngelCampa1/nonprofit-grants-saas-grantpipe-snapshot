import { describe, expect, it } from "vitest";
import { centsFromInput } from "./money";

describe("centsFromInput", () => {
  it('converts "12.34" to 1234', () => {
    expect(centsFromInput("12.34")).toBe(1234);
  });

  it('converts "0" to 0', () => {
    expect(centsFromInput("0")).toBe(0);
  });

  it('converts "" (empty string) to 0 — parseFloat returns NaN', () => {
    expect(centsFromInput("")).toBe(0);
  });

  it('converts "abc" to 0 — NaN branch', () => {
    expect(centsFromInput("abc")).toBe(0);
  });

  it('converts "-5" to 0 — negative clamp', () => {
    expect(centsFromInput("-5")).toBe(0);
  });

  it('converts "  7.5 " to 750 — parseFloat tolerates leading space', () => {
    expect(centsFromInput("  7.5 ")).toBe(750);
  });

  it('converts "100" to 10000', () => {
    expect(centsFromInput("100")).toBe(10000);
  });

  it('"1.005" yields 100 — floating-point rounding (Math.round(1.005*100) === 100)', () => {
    // Due to IEEE-754 floating-point representation, 1.005 * 100 is
    // slightly less than 100.5, so Math.round produces 100, not 101.
    expect(centsFromInput("1.005")).toBe(100);
  });
});
