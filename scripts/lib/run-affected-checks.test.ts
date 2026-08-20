import { describe, expect, it } from "vitest";
import { formatFailure, isEntrypoint } from "../run-affected-checks";

describe("formatFailure", () => {
  it("renders the original error message for hook failures", () => {
    expect(formatFailure(new Error("coverage gate failed"))).toBe("coverage gate failed");
  });

  it("falls back to a stringified value for non-Error failures", () => {
    expect(formatFailure("plain failure")).toBe("plain failure");
  });
});

describe("isEntrypoint", () => {
  it("matches direct tsx invocation on Windows-style paths", () => {
    expect(
      isEntrypoint(
        "file:///C:/repo/scripts/run-affected-checks.ts",
        "C:\\repo\\scripts\\run-affected-checks.ts",
      ),
    ).toBe(true);
  });
});
