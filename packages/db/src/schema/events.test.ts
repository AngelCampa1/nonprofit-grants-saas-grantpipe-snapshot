import { describe, expect, it } from "vitest";
import { volunteerHours } from "./events";

const DRIZZLE_COLUMNS_KEY = Symbol.for("drizzle:Columns");

function columnNames(table: object): string[] {
  return Object.keys((table as Record<symbol, Record<string, unknown>>)[DRIZZLE_COLUMNS_KEY] ?? {});
}

describe("volunteerHours table", () => {
  it("supports soft delete", () => {
    expect(columnNames(volunteerHours)).toContain("deletedAt");
  });
});
