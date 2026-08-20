import { describe, expect, it } from "vitest";

import { parseCsvText } from "./csv";

describe("parseCsvText", () => {
  it("parses a simple comma-separated file with a header row", () => {
    const result = parseCsvText("name,amount\nAlice,100\nBob,200\n");
    expect(result.headers).toEqual(["name", "amount"]);
    expect(result.totalRows).toBe(2);
    expect(result.rows).toEqual([
      { name: "Alice", amount: "100" },
      { name: "Bob", amount: "200" },
    ]);
  });

  it("strips a leading UTF-8 BOM from the first header", () => {
    const result = parseCsvText("﻿name,amount\nAlice,100\n");
    expect(result.headers).toEqual(["name", "amount"]);
  });

  it("handles quoted fields containing commas and newlines", () => {
    const result = parseCsvText('name,note\n"Smith, Jane","line1\nline2"\n');
    expect(result.rows[0]).toEqual({ name: "Smith, Jane", note: "line1\nline2" });
  });

  it("normalizes carriage returns inside quoted multiline cells", () => {
    const result = parseCsvText('name,note\n"Smith","line1\r\nline2"\n');
    expect(result.rows[0]?.note).toBe("line1\nline2");
  });

  it("decodes escaped double-quotes inside a quoted field", () => {
    const result = parseCsvText('name\n"She said ""hi"""\n');
    expect(result.rows[0]?.name).toBe('She said "hi"');
  });

  it("treats CRLF row terminators the same as LF", () => {
    const result = parseCsvText("name,amount\r\nAlice,100\r\n");
    expect(result.rows).toEqual([{ name: "Alice", amount: "100" }]);
  });

  it("drops rows that are entirely blank", () => {
    const result = parseCsvText("name\nAlice\n\n   \nBob\n");
    expect(result.totalRows).toBe(2);
    expect(result.rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
  });

  it("fills missing trailing columns with empty strings", () => {
    const result = parseCsvText("name,amount\nAlice\n");
    expect(result.rows[0]).toEqual({ name: "Alice", amount: "" });
  });

  it("returns empty headers and rows for an empty document", () => {
    const result = parseCsvText("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
  });

  it("throws on an unterminated quoted field", () => {
    expect(() => parseCsvText('name\n"unterminated\n')).toThrow(/unterminated/i);
  });
});
