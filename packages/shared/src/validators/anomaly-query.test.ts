import { describe, expect, it } from "vitest";
import { anomalyQuerySchema } from "./anomaly-query";

describe("anomalyQuerySchema", () => {
  it("accepts valid classes array", () => {
    const result = anomalyQuerySchema.parse({
      classes: ["category_misallocation", "duplicate_donation"],
    });
    expect(result.classes).toEqual(["category_misallocation", "duplicate_donation"]);
  });

  it("accepts all valid anomaly classes", () => {
    const result = anomalyQuerySchema.parse({
      classes: [
        "category_misallocation",
        "release_over_balance",
        "duplicate_donation",
        "indirect_rate_mismatch",
      ],
    });
    expect(result.classes).toHaveLength(4);
  });

  it("accepts no classes (undefined)", () => {
    const result = anomalyQuerySchema.parse({});
    expect(result.classes).toBeUndefined();
  });

  it("accepts valid numeric limit", () => {
    const result = anomalyQuerySchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it("coerces string limit to number", () => {
    const result = anomalyQuerySchema.parse({ limit: "25" });
    expect(result.limit).toBe(25);
  });

  it("accepts limit of 1 (minimum positive)", () => {
    const result = anomalyQuerySchema.parse({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it("accepts limit of 500 (maximum)", () => {
    const result = anomalyQuerySchema.parse({ limit: 500 });
    expect(result.limit).toBe(500);
  });

  it("rejects limit of 0 (not positive)", () => {
    expect(() => anomalyQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit of 501 (exceeds max)", () => {
    expect(() => anomalyQuerySchema.parse({ limit: 501 })).toThrow();
  });

  it("rejects invalid class value", () => {
    expect(() => anomalyQuerySchema.parse({ classes: ["invalid_class"] })).toThrow();
  });

  it("rejects mixed valid/invalid classes", () => {
    expect(() =>
      anomalyQuerySchema.parse({ classes: ["duplicate_donation", "bad_class"] }),
    ).toThrow();
  });

  it("accepts empty object (all optional)", () => {
    const result = anomalyQuerySchema.parse({});
    expect(result.classes).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it("accepts both classes and limit together", () => {
    const result = anomalyQuerySchema.parse({
      classes: ["indirect_rate_mismatch"],
      limit: 10,
    });
    expect(result.classes).toEqual(["indirect_rate_mismatch"]);
    expect(result.limit).toBe(10);
  });
});
