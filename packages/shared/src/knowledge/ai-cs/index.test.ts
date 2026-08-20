import { describe, expect, it } from "vitest";
import { getFeatureKnowledge, FEATURE_KNOWLEDGE } from "./index";

describe("getFeatureKnowledge", () => {
  it("returns the entry whose route matches exactly", () => {
    const entry = getFeatureKnowledge("/grants");
    expect(entry?.key).toBe("grants");
  });

  it("matches ignoring a trailing slash", () => {
    expect(getFeatureKnowledge("/grants/")?.key).toBe("grants");
  });

  it("returns undefined for an unknown path", () => {
    expect(getFeatureKnowledge("/nope")).toBeUndefined();
  });

  it("exposes the full array", () => {
    expect(FEATURE_KNOWLEDGE.length).toBeGreaterThan(0);
  });
});
