import { describe, it, expect } from "vitest";
import {
  classifyRestriction,
  classifyRestrictionInputSchema,
  DESIGNATION_KEYWORD_RULES,
} from "./restriction-classifier";

// ---------------------------------------------------------------------------
// classifyRestriction
// ---------------------------------------------------------------------------

describe("classifyRestriction — fund type signal (priority 1)", () => {
  it("permanently_restricted fund → permanently_restricted, restricted, high confidence", () => {
    const result = classifyRestriction({ fundType: "permanently_restricted" });
    expect(result.netAssetClass).toBe("permanently_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.confidence).toBe("high");
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.source).toBe("fund_type");
  });

  it("temporarily_restricted fund → temporarily_restricted, restricted, high confidence", () => {
    const result = classifyRestriction({ fundType: "temporarily_restricted" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.confidence).toBe("high");
    expect(result.signals[0]!.source).toBe("fund_type");
  });

  it("unrestricted fund still falls through to grant signal", () => {
    const result = classifyRestriction({ fundType: "unrestricted", hasLinkedGrant: true });
    // Grant signal fires because unrestricted fund doesn't short-circuit
    expect(result.donationRestriction).toBe("restricted");
    expect(result.signals.some((s) => s.source === "grant")).toBe(true);
  });

  it("unrestricted fund with no other signals → unrestricted fallback", () => {
    const result = classifyRestriction({ fundType: "unrestricted" });
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.donationRestriction).toBe("unrestricted");
  });

  it("permanently_restricted fund + existing term → inherits term fields", () => {
    const result = classifyRestriction({
      fundType: "permanently_restricted",
      existingTerm: {
        restrictionType: "purpose",
        releaseRule: "completion of endowment",
        startDate: "2024-01-01T00:00:00Z",
        endDate: null,
      },
    });
    expect(result.netAssetClass).toBe("permanently_restricted");
    expect(result.suggestedReleaseRule).toBe("completion of endowment");
    expect(result.suggestedStartDate).toBe("2024-01-01T00:00:00Z");
    expect(result.suggestedEndDate).toBeUndefined();
    expect(result.signals.some((s) => s.source === "existing_term")).toBe(true);
  });

  it("temporarily_restricted fund + existing term with time type", () => {
    const result = classifyRestriction({
      fundType: "temporarily_restricted",
      existingTerm: {
        restrictionType: "time",
        releaseRule: null,
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-12-31T00:00:00Z",
      },
    });
    expect(result.restrictionType).toBe("time");
    expect(result.suggestedEndDate).toBe("2024-12-31T00:00:00Z");
  });
});

describe("classifyRestriction — grant signal (priority 2)", () => {
  it("hasLinkedGrant=true → temporarily_restricted, restricted, high confidence", () => {
    const result = classifyRestriction({ hasLinkedGrant: true });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.restrictionType).toBe("purpose");
    expect(result.confidence).toBe("high");
    expect(result.signals[0]!.source).toBe("grant");
  });

  it("hasLinkedGrant=false → does not trigger grant signal", () => {
    const result = classifyRestriction({ hasLinkedGrant: false });
    expect(result.signals.every((s) => s.source !== "grant")).toBe(true);
  });

  it("grant + existing term → inherits term restrictionType", () => {
    const result = classifyRestriction({
      hasLinkedGrant: true,
      existingTerm: {
        restrictionType: "purpose_and_time",
        releaseRule: "grant period end",
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2025-06-30T00:00:00Z",
      },
    });
    expect(result.restrictionType).toBe("purpose_and_time");
    expect(result.suggestedReleaseRule).toBe("grant period end");
  });
});

describe("classifyRestriction — existing term signal (priority 3)", () => {
  it("purpose restriction term → temporarily_restricted, restricted, medium confidence", () => {
    const result = classifyRestriction({
      existingTerm: { restrictionType: "purpose" },
    });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.confidence).toBe("medium");
    expect(result.signals[0]!.source).toBe("existing_term");
  });

  it("time restriction term → temporarily_restricted", () => {
    const result = classifyRestriction({
      existingTerm: {
        restrictionType: "time",
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-12-31T00:00:00Z",
      },
    });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.restrictionType).toBe("time");
  });

  it("board_designated term → unrestricted, unrestricted", () => {
    const result = classifyRestriction({
      existingTerm: { restrictionType: "board_designated" },
    });
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.donationRestriction).toBe("unrestricted");
  });

  it("unrestricted term → unrestricted, unrestricted", () => {
    const result = classifyRestriction({
      existingTerm: { restrictionType: "unrestricted" },
    });
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.donationRestriction).toBe("unrestricted");
  });

  it("purpose_and_time term → temporarily_restricted", () => {
    const result = classifyRestriction({
      existingTerm: { restrictionType: "purpose_and_time" },
    });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.restrictionType).toBe("purpose_and_time");
  });
});

describe("classifyRestriction — designation keyword signal (priority 4)", () => {
  it('"endowment" in designation → permanently_restricted', () => {
    const result = classifyRestriction({ designation: "Gift to the endowment fund" });
    expect(result.netAssetClass).toBe("permanently_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.confidence).toBe("medium");
    expect(result.signals[0]!.source).toBe("designation");
  });

  it('"in perpetuity" → permanently_restricted', () => {
    const result = classifyRestriction({ designation: "held in perpetuity" });
    expect(result.netAssetClass).toBe("permanently_restricted");
  });

  it('"permanently" → permanently_restricted', () => {
    const result = classifyRestriction({ designation: "permanently restricted gift" });
    expect(result.netAssetClass).toBe("permanently_restricted");
  });

  it('"restricted to" → temporarily_restricted, low confidence', () => {
    const result = classifyRestriction({ designation: "restricted to youth programs" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.confidence).toBe("low");
  });

  it('"until" → temporarily_restricted', () => {
    const result = classifyRestriction({ designation: "until project completion" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
  });

  it('"program" → temporarily_restricted', () => {
    const result = classifyRestriction({ designation: "for the youth program" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
  });

  it('"scholarship" → temporarily_restricted', () => {
    const result = classifyRestriction({ designation: "scholarship fund contribution" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
  });

  it("designation with no matching keywords → fallback", () => {
    const result = classifyRestriction({ designation: "general support" });
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.signals[0]!.source).toBe("internal");
  });

  it("null designation → fallback", () => {
    const result = classifyRestriction({ designation: null });
    expect(result.netAssetClass).toBe("unrestricted");
  });
});

describe("classifyRestriction — default fallback (priority 5)", () => {
  it("empty input → unrestricted, low confidence, internal signal", () => {
    const result = classifyRestriction({});
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.donationRestriction).toBe("unrestricted");
    expect(result.restrictionType).toBe("unrestricted");
    expect(result.confidence).toBe("low");
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.source).toBe("internal");
  });

  it("all nulls input → unrestricted fallback", () => {
    const result = classifyRestriction({
      fundType: null,
      hasLinkedGrant: null,
      existingTerm: null,
      designation: null,
      date: null,
    });
    expect(result.netAssetClass).toBe("unrestricted");
  });
});

describe("classifyRestriction — signal accumulation", () => {
  it("fund type permanently_restricted + existing term records both signals", () => {
    const result = classifyRestriction({
      fundType: "permanently_restricted",
      existingTerm: { restrictionType: "purpose" },
    });
    const sources = result.signals.map((s) => s.source);
    expect(sources).toContain("fund_type");
    expect(sources).toContain("existing_term");
  });

  it("unrestricted fund + grant: both fund_type and grant signals appear", () => {
    const result = classifyRestriction({ fundType: "unrestricted", hasLinkedGrant: true });
    const sources = result.signals.map((s) => s.source);
    expect(sources).toContain("fund_type");
    expect(sources).toContain("grant");
  });
});

describe("classifyRestrictionInputSchema", () => {
  it("accepts empty object", () => {
    expect(() => classifyRestrictionInputSchema.parse({})).not.toThrow();
  });

  it("accepts full valid input", () => {
    expect(() =>
      classifyRestrictionInputSchema.parse({
        fundType: "temporarily_restricted",
        hasLinkedGrant: true,
        existingTerm: {
          restrictionType: "time",
          releaseRule: "end of project",
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-12-31T00:00:00Z",
        },
        designation: "for the youth program",
        date: "2024-06-01T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("rejects invalid fundType", () => {
    expect(() => classifyRestrictionInputSchema.parse({ fundType: "invalid_type" })).toThrow();
  });

  it("rejects invalid restrictionType in existingTerm", () => {
    expect(() =>
      classifyRestrictionInputSchema.parse({
        existingTerm: { restrictionType: "nonexistent" },
      }),
    ).toThrow();
  });

  it("accepts null values for nullable fields", () => {
    expect(() =>
      classifyRestrictionInputSchema.parse({
        fundType: null,
        hasLinkedGrant: null,
        existingTerm: null,
        designation: null,
        date: null,
      }),
    ).not.toThrow();
  });
});

describe("DESIGNATION_KEYWORD_RULES", () => {
  it("exports a non-empty array", () => {
    expect(DESIGNATION_KEYWORD_RULES.length).toBeGreaterThan(0);
  });

  it("each rule has patterns and family", () => {
    for (const rule of DESIGNATION_KEYWORD_RULES) {
      expect(Array.isArray(rule.patterns)).toBe(true);
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(["permanent", "temporary"]).toContain(rule.family);
      expect(typeof rule.detail).toBe("string");
    }
  });
});
