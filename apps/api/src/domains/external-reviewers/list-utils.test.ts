import { describe, expect, it } from "vitest";
import { toJsonSafeCount } from "./list-utils";

describe("toJsonSafeCount", () => {
  it("converts bigint counts to numbers", () => {
    expect(toJsonSafeCount(1n)).toBe(1);
  });

  it("converts string counts to numbers", () => {
    expect(toJsonSafeCount("2")).toBe(2);
  });

  it("defaults missing counts to 0", () => {
    expect(toJsonSafeCount(undefined)).toBe(0);
    expect(toJsonSafeCount(null)).toBe(0);
  });
});
