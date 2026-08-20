import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ahaBannerStorageKey,
  markAhaBannerPending,
  readPendingAhaGoal,
  clearAhaBannerPending,
  ahaBannerCopy,
} from "./aha-banner";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("aha-banner pending flag", () => {
  it("namespaces the key by org", () => {
    expect(ahaBannerStorageKey("org_1")).toBe("gp:aha-banner:org_1");
  });
  it("round-trips a pending goal then clears", () => {
    markAhaBannerPending("org_1", "donors");
    expect(readPendingAhaGoal("org_1")).toBe("donors");
    clearAhaBannerPending("org_1");
    expect(readPendingAhaGoal("org_1")).toBeNull();
  });
  it("returns null for an unknown stored goal", () => {
    localStorage.setItem(ahaBannerStorageKey("org_1"), "not-a-goal");
    expect(readPendingAhaGoal("org_1")).toBeNull();
  });
  it("returns null when org id is missing", () => {
    expect(readPendingAhaGoal(null)).toBeNull();
    expect(readPendingAhaGoal(undefined)).toBeNull();
  });
  it("does nothing when clearing without an org id", () => {
    expect(() => clearAhaBannerPending(null)).not.toThrow();
    expect(() => clearAhaBannerPending(undefined)).not.toThrow();
  });
  it("returns one route-neutral message for every goal (no entity claim)", () => {
    const expected =
      "We added sample data to your account. It shows how GrantPipe works. Clear it anytime.";
    expect(ahaBannerCopy("donors")).toBe(expected);
    expect(ahaBannerCopy("grants")).toBe(expected);
    expect(ahaBannerCopy("compliance")).toBe(expected);
    expect(ahaBannerCopy(null)).toBe(expected);
    expect(ahaBannerCopy()).toBe(expected);
    // Must not name a specific entity, so it stays true on any route.
    expect(expected).not.toMatch(/funds|donor|reports/i);
  });

  // Storage can throw in private mode or when the quota is exceeded. Each helper
  // swallows the error so a broken localStorage never breaks the onboarding flow.
  it("swallows a setItem failure when arming the banner", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => markAhaBannerPending("org_1", "donors")).not.toThrow();
  });
  it("returns null when reading throws", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(readPendingAhaGoal("org_1")).toBeNull();
  });
  it("swallows a removeItem failure when clearing", () => {
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => clearAhaBannerPending("org_1")).not.toThrow();
  });
});
