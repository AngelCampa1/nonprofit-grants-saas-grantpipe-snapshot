import { describe, expect, it } from "vitest";
import { escapeCsvCell, neutralizeCsvFormula } from "./csv";

describe("neutralizeCsvFormula", () => {
  it("prefixes formula triggers and coerces nullish to empty", () => {
    expect(neutralizeCsvFormula("=cmd()")).toBe("'=cmd()");
    expect(neutralizeCsvFormula("+1")).toBe("'+1");
    expect(neutralizeCsvFormula("\t-2")).toBe("'\t-2");
    expect(neutralizeCsvFormula(null)).toBe("");
    expect(neutralizeCsvFormula(42)).toBe("42");
  });

  it("leaves non-trigger values untouched and does not quote", () => {
    expect(neutralizeCsvFormula("Acme")).toBe("Acme");
    expect(neutralizeCsvFormula("a,b")).toBe("a,b");
  });

  it("prefixes @ trigger", () => {
    expect(neutralizeCsvFormula("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("prefixes trigger hidden behind leading whitespace", () => {
    expect(neutralizeCsvFormula("   =danger()")).toBe("'   =danger()");
    expect(neutralizeCsvFormula("\t=danger()")).toBe("'\t=danger()");
  });

  it("coerces undefined to empty string", () => {
    expect(neutralizeCsvFormula(undefined)).toBe("");
  });

  it("coerces boolean to string", () => {
    expect(neutralizeCsvFormula(true)).toBe("true");
    expect(neutralizeCsvFormula(false)).toBe("false");
  });
});

describe("escapeCsvCell", () => {
  it("returns plain values unchanged", () => {
    expect(escapeCsvCell("Acme Foundation")).toBe("Acme Foundation");
    expect(escapeCsvCell("hello world")).toBe("hello world");
  });

  it("coerces null and undefined to an empty string", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("coerces numbers and booleans via String()", () => {
    expect(escapeCsvCell(1234)).toBe("1234");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("RFC 4180 quotes cells containing a comma", () => {
    expect(escapeCsvCell("Smith, Jane")).toBe('"Smith, Jane"');
  });

  it("RFC 4180 quotes and doubles embedded double quotes", () => {
    expect(escapeCsvCell('She said "hi"')).toBe('"She said ""hi"""');
  });

  it("quotes cells containing a line feed", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes cells containing a bare carriage return so row boundaries stay intact", () => {
    expect(escapeCsvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("neutralizes a leading = formula trigger with a single quote prefix", () => {
    expect(escapeCsvCell("=cmd()")).toBe("'=cmd()");
  });

  it("neutralizes leading +, -, and @ formula triggers", () => {
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutralizes a formula trigger hidden behind leading whitespace or tab", () => {
    expect(escapeCsvCell("   =danger()")).toBe("'   =danger()");
    expect(escapeCsvCell("\t=danger()")).toBe("'\t=danger()");
  });

  it("neutralizes and then RFC 4180 quotes a formula that also contains a comma", () => {
    expect(escapeCsvCell("=HYPERLINK(1,2)")).toBe('"\'=HYPERLINK(1,2)"');
  });

  it("leaves a date string starting with a digit untouched", () => {
    expect(escapeCsvCell("2026-01-01")).toBe("2026-01-01");
  });

  it("neutralizes a negative-number string that begins with a hyphen", () => {
    expect(escapeCsvCell("-500")).toBe("'-500");
  });

  it("leaves a plain leading digit untouched", () => {
    expect(escapeCsvCell("123 Main St")).toBe("123 Main St");
  });
});
