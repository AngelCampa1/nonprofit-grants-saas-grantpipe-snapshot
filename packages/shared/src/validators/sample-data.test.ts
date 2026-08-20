import { describe, expect, it } from "vitest";
import { sampleDataStatusSchema } from "./sample-data";
describe("sample data validators", () => {
  it("parses a seeded status", () => {
    expect(sampleDataStatusSchema.parse({ seeded: true, recordCount: 42 })).toEqual({
      seeded: true,
      recordCount: 42,
    });
  });
  it("rejects a negative record count", () => {
    expect(() => sampleDataStatusSchema.parse({ seeded: false, recordCount: -1 })).toThrow();
  });
});
