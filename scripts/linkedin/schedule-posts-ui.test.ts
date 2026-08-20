import { describe, expect, it } from "vitest";

import { assertLocalSchedulingPlatform } from "./schedule-posts-ui";

describe("schedule-posts-ui platform guard", () => {
  it("only allows the local UI scheduler on macOS", () => {
    expect(() => assertLocalSchedulingPlatform("darwin")).not.toThrow();
    expect(() => assertLocalSchedulingPlatform("win32")).toThrow(/macOS/i);
    expect(() => assertLocalSchedulingPlatform("linux")).toThrow(/macOS/i);
  });
});
