import { describe, expect, it } from "vitest";
import { BOTTOM_CTA_TRUST_NOTE } from "./bottom-cta-copy";

describe("BOTTOM_CTA_TRUST_NOTE", () => {
  it("communicates a 1-month free trial without requiring a credit card", () => {
    expect(BOTTOM_CTA_TRUST_NOTE).toBe("Start a 1-month free trial with no credit card required.");
  });

  it("does not promise a 14-day trial (stale copy)", () => {
    expect(BOTTOM_CTA_TRUST_NOTE).not.toMatch(/14[- ]day/i);
  });
});
