import { describe, it, expect } from "vitest";
import { paginationSchema } from "./pagination";

describe("paginationSchema", () => {
  it("parses valid page and pageSize", () => {
    const result = paginationSchema.safeParse({ page: "2", pageSize: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("accepts already-normalized numeric page and pageSize", () => {
    const result = paginationSchema.safeParse({ page: 2, pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("applies defaults when omitted", () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it("rejects page < 1", () => {
    const result = paginationSchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("caps pageSize at 100", () => {
    const result = paginationSchema.safeParse({ pageSize: "200" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(100);
    }
  });

  it("accepts page at max bound of 10000", () => {
    const result = paginationSchema.safeParse({ page: "10000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(10000);
    }
  });

  it("rejects page above max bound (10001)", () => {
    const result = paginationSchema.safeParse({ page: "10001" });
    expect(result.success).toBe(false);
  });
});
