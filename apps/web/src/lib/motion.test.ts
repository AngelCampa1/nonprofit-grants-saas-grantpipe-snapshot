import { describe, it, expect, vi, afterEach } from "vitest";
import { EASING, DURATION, prefersReducedMotion } from "./motion";

describe("EASING", () => {
  it("exports outQuart easing value", () => {
    expect(EASING.outQuart).toBe("cubic-bezier(0.25, 1, 0.5, 1)");
  });

  it("exports outCubic easing value", () => {
    expect(EASING.outCubic).toBe("cubic-bezier(0.33, 1, 0.68, 1)");
  });

  it("exports outExpo easing value", () => {
    expect(EASING.outExpo).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("exports inOutCubic easing value", () => {
    expect(EASING.inOutCubic).toBe("cubic-bezier(0.65, 0, 0.35, 1)");
  });
});

describe("DURATION", () => {
  it("exports fast duration as 150ms", () => {
    expect(DURATION.fast).toBe(150);
  });

  it("exports normal duration as 200ms", () => {
    expect(DURATION.normal).toBe(200);
  });

  it("exports slow duration as 300ms", () => {
    expect(DURATION.slow).toBe(300);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when window is undefined (SSR)", () => {
    const original = globalThis.window;
    // @ts-expect-error — simulating SSR environment
    delete globalThis.window;
    expect(prefersReducedMotion()).toBe(false);
    globalThis.window = original;
  });

  it("returns true when user prefers reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });
    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("returns false when user does not prefer reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
    expect(prefersReducedMotion()).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
