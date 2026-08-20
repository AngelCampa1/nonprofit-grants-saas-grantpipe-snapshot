import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges truthy classes and omits falsey values", () => {
    expect(cn("base", null, undefined, "content")).toBe("base content");
  });

  it("resolves conflicting Tailwind classes in favor of the last one", () => {
    expect(cn("px-2", "px-4", "text-sm", "text-lg")).toBe("px-4 text-lg");
  });
});
