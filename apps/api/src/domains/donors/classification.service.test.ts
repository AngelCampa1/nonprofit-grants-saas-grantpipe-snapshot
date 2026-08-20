import { describe, it, expect, vi } from "vitest";
import { resolveAndClassifyRestriction } from "./classification.service";
import { classifyRestrictionRequestSchema } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDb(overrides: {
  fund?: Record<string, unknown> | null;
  grant?: Record<string, unknown> | null;
  term?: Record<string, unknown> | null;
}) {
  return {
    query: {
      funds: {
        findFirst: vi.fn().mockResolvedValue(overrides.fund ?? null),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(overrides.grant ?? null),
      },
      restrictionTerms: {
        findFirst: vi.fn().mockResolvedValue(overrides.term ?? null),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// resolveAndClassifyRestriction — integration (uses real classifyRestriction)
// ---------------------------------------------------------------------------

describe("resolveAndClassifyRestriction", () => {
  it("returns unrestricted when no inputs supplied", async () => {
    const db = mockDb({});
    const result = await resolveAndClassifyRestriction(db as never, { orgId: "org-1" });
    expect(result.netAssetClass).toBe("unrestricted");
    expect(result.donationRestriction).toBe("unrestricted");
    expect(db.query.funds.findFirst).not.toHaveBeenCalled();
    expect(db.query.grants.findFirst).not.toHaveBeenCalled();
    expect(db.query.restrictionTerms.findFirst).not.toHaveBeenCalled();
  });

  it("resolves fundId → fundType and classifies temporarily_restricted", async () => {
    const db = mockDb({ fund: { type: "temporarily_restricted" } });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.confidence).toBe("high");
    expect(result.signals.some((s) => s.source === "fund_type")).toBe(true);
    expect(db.query.funds.findFirst).toHaveBeenCalledOnce();
  });

  it("resolves fundId → permanently_restricted classification", async () => {
    const db = mockDb({ fund: { type: "permanently_restricted" } });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.netAssetClass).toBe("permanently_restricted");
    expect(result.donationRestriction).toBe("restricted");
  });

  it("classifies unrestricted when fund is not found", async () => {
    const db = mockDb({ fund: null });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    // Fund not found → fundType stays undefined → fallback to unrestricted
    expect(result.netAssetClass).toBe("unrestricted");
  });

  it("resolves grantId → hasLinkedGrant=true → temporarily_restricted", async () => {
    const db = mockDb({ grant: { id: "grant-1" } });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      grantId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    });
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.donationRestriction).toBe("restricted");
    expect(result.signals.some((s) => s.source === "grant")).toBe(true);
    expect(db.query.grants.findFirst).toHaveBeenCalledOnce();
  });

  it("resolves grantId → hasLinkedGrant=false → unrestricted", async () => {
    const db = mockDb({ grant: null });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      grantId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    });
    // Grant not found → hasLinkedGrant=false → falls through to fallback
    expect(result.netAssetClass).toBe("unrestricted");
  });

  it("does not query grants when no grantId supplied", async () => {
    const db = mockDb({});
    await resolveAndClassifyRestriction(db as never, { orgId: "org-1" });
    expect(db.query.grants.findFirst).not.toHaveBeenCalled();
  });

  it("loads existing restriction term when fundId is supplied and applies it", async () => {
    const db = mockDb({
      fund: { type: "temporarily_restricted" },
      term: {
        restrictionType: "purpose",
        releaseRule: "project completion",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
      },
    });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.restrictionType).toBe("purpose");
    expect(result.suggestedReleaseRule).toBe("project completion");
    expect(result.suggestedStartDate).toBe("2024-01-01T00:00:00.000Z");
    expect(result.suggestedEndDate).toBe("2024-12-31T00:00:00.000Z");
    expect(result.signals.some((s) => s.source === "existing_term")).toBe(true);
  });

  it("handles null date fields on restriction term", async () => {
    const db = mockDb({
      fund: { type: "temporarily_restricted" },
      term: {
        restrictionType: "purpose",
        releaseRule: null,
        startDate: null,
        endDate: null,
      },
    });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.suggestedReleaseRule).toBeUndefined();
    expect(result.suggestedStartDate).toBeUndefined();
    expect(result.suggestedEndDate).toBeUndefined();
  });

  it("does not query restriction terms when no fund/grant id supplied", async () => {
    const db = mockDb({});
    await resolveAndClassifyRestriction(db as never, { orgId: "org-1" });
    expect(db.query.restrictionTerms.findFirst).not.toHaveBeenCalled();
  });

  it("passes existingTerm=undefined when term lookup returns null", async () => {
    const db = mockDb({ fund: { type: "temporarily_restricted" }, term: null });
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      fundId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    // Should still be restricted from fund_type signal alone
    expect(result.netAssetClass).toBe("temporarily_restricted");
    expect(result.signals.every((s) => s.source !== "existing_term")).toBe(true);
  });

  it("classifies from designation when no fund/grant supplied", async () => {
    const db = mockDb({});
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      designation: "endowment gift",
    });
    expect(result.netAssetClass).toBe("permanently_restricted");
    expect(result.signals.some((s) => s.source === "designation")).toBe(true);
  });

  it("passes date through for context", async () => {
    const db = mockDb({});
    const result = await resolveAndClassifyRestriction(db as never, {
      orgId: "org-1",
      date: "2024-06-01T00:00:00Z",
    });
    // date doesn't affect classification, just falls to default
    expect(result.netAssetClass).toBe("unrestricted");
  });

  it("returns full ClassificationResult shape", async () => {
    const db = mockDb({});
    const result = await resolveAndClassifyRestriction(db as never, { orgId: "org-1" });
    expect(result).toMatchObject({
      netAssetClass: expect.any(String),
      donationRestriction: expect.any(String),
      restrictionType: expect.any(String),
      confidence: expect.any(String),
      signals: expect.any(Array),
    });
  });
});

describe("classifyRestrictionRequestSchema", () => {
  it("accepts empty object", () => {
    expect(() => classifyRestrictionRequestSchema.parse({})).not.toThrow();
  });

  it("accepts valid UUID for fundId", () => {
    expect(() =>
      classifyRestrictionRequestSchema.parse({
        fundId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).not.toThrow();
  });

  it("accepts valid UUID for both fundId and grantId", () => {
    expect(() =>
      classifyRestrictionRequestSchema.parse({
        fundId: "550e8400-e29b-41d4-a716-446655440000",
        grantId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      }),
    ).not.toThrow();
  });

  it("rejects invalid UUID for fundId", () => {
    expect(() => classifyRestrictionRequestSchema.parse({ fundId: "not-a-uuid" })).toThrow();
  });

  it("rejects invalid UUID for grantId", () => {
    expect(() => classifyRestrictionRequestSchema.parse({ grantId: "bad" })).toThrow();
  });

  it("accepts designation and date", () => {
    expect(() =>
      classifyRestrictionRequestSchema.parse({
        designation: "endowment gift",
        date: "2024-01-01",
      }),
    ).not.toThrow();
  });

  it("rejects designation over 1000 chars", () => {
    expect(() =>
      classifyRestrictionRequestSchema.parse({ designation: "x".repeat(1001) }),
    ).toThrow();
  });

  it("accepts null designation", () => {
    expect(() => classifyRestrictionRequestSchema.parse({ designation: null })).not.toThrow();
  });

  it("accepts null date", () => {
    expect(() => classifyRestrictionRequestSchema.parse({ date: null })).not.toThrow();
  });
});
