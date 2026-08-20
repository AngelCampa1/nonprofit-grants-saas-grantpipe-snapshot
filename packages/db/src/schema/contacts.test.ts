import { describe, expect, it } from "vitest";
import { tags } from "./contacts";

const DRIZZLE_COLUMNS_KEY = Symbol.for("drizzle:Columns");

function columnNames(table: object): string[] {
  return Object.keys((table as Record<symbol, Record<string, unknown>>)[DRIZZLE_COLUMNS_KEY] ?? {});
}

describe("tags table", () => {
  it("supports soft delete so donor tag history remains auditable", () => {
    expect(columnNames(tags)).toContain("deletedAt");
  });
});
