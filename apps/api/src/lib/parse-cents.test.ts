import { describe, expect, it } from "vitest";
import { parseCentsFromString } from "./parse-cents";

describe("parseCentsFromString", () => {
  it.each([
    ["0.29", 29],
    ["0.99", 99],
    ["19.99", 1999],
    ["1.10", 110],
    ["100.01", 10001],
    ["0.01", 1],
    ["1000.00", 100000],
  ])("parses %s as %d cents without float multiplication", (input, expected) => {
    expect(parseCentsFromString(input)).toBe(expected);
  });

  it("parses negative dollar amounts as negative cents", () => {
    expect(parseCentsFromString("-0.29")).toBe(-29);
    expect(parseCentsFromString("-19.99")).toBe(-1999);
    expect(parseCentsFromString("-100.00")).toBe(-10000);
  });

  it("handles leading and trailing whitespace", () => {
    expect(parseCentsFromString("  1.99  ")).toBe(199);
    expect(parseCentsFromString("  -0.50  ")).toBe(-50);
  });

  it("handles amounts with no decimal part", () => {
    expect(parseCentsFromString("5")).toBe(500);
    expect(parseCentsFromString("100")).toBe(10000);
    expect(parseCentsFromString("-5")).toBe(-500);
  });

  it("handles amounts with one decimal digit", () => {
    expect(parseCentsFromString("1.5")).toBe(150);
  });

  it("returns 0 for an empty string", () => {
    expect(parseCentsFromString("")).toBe(0);
  });

  it("returns 0 for a string that is only whitespace", () => {
    expect(parseCentsFromString("   ")).toBe(0);
  });

  it("returns 0 for a bare dollar sign after stripping", () => {
    expect(parseCentsFromString("$")).toBe(0);
  });

  it("strips dollar-sign and comma formatting before parsing", () => {
    expect(parseCentsFromString("$1,234.56")).toBe(123456);
    expect(parseCentsFromString("1,000.00")).toBe(100000);
  });

  // --- malformed input: must throw ---

  it("throws for non-numeric input 'abc'", () => {
    expect(() => parseCentsFromString("abc")).toThrow("Invalid monetary amount: abc");
  });

  it("throws for non-numeric input '1.2.3'", () => {
    expect(() => parseCentsFromString("1.2.3")).toThrow("Invalid monetary amount: 1.2.3");
  });

  it("throws for input with letters mixed in '$12abc'", () => {
    expect(() => parseCentsFromString("$12abc")).toThrow("Invalid monetary amount: $12abc");
  });

  // --- rounding: cents past 2 digits must be ROUNDED not truncated ---

  it("rounds up when sub-cent portion >= 0.5: '1.999' → 200", () => {
    expect(parseCentsFromString("1.999")).toBe(200);
  });

  it("rounds down when sub-cent portion < 0.5: '1.994' → 199", () => {
    expect(parseCentsFromString("1.994")).toBe(199);
  });

  it("rounds a negative value correctly: '-2.005' → -201", () => {
    expect(parseCentsFromString("-2.005")).toBe(-201);
  });
});
