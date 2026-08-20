import { describe, expect, it } from "vitest";
import {
  ALLOCATION_METHODS,
  createAllocationBaseSchema,
  updateAllocationBaseSchema,
  allocationTargetInputSchema,
  setAllocationTargetsSchema,
  createAllocationRuleSchema,
  updateAllocationRuleSchema,
} from "./allocation-studio";

// ---------------------------------------------------------------------------
// ALLOCATION_METHODS
// ---------------------------------------------------------------------------

describe("ALLOCATION_METHODS", () => {
  it("contains the four expected methods", () => {
    expect(ALLOCATION_METHODS).toContain("headcount_fte");
    expect(ALLOCATION_METHODS).toContain("square_footage");
    expect(ALLOCATION_METHODS).toContain("time_study");
    expect(ALLOCATION_METHODS).toContain("manual_percentage");
    expect(ALLOCATION_METHODS.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// createAllocationBaseSchema
// ---------------------------------------------------------------------------

describe("createAllocationBaseSchema", () => {
  const valid = {
    name: "Headcount Split",
    method: "headcount_fte",
    status: "active",
  } as const;

  it("accepts valid input", () => {
    expect(createAllocationBaseSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status to active when omitted", () => {
    const r = createAllocationBaseSchema.safeParse({ name: "X", method: "headcount_fte" });
    expect(r.success && r.data.status).toBe("active");
  });

  it("trims name whitespace", () => {
    const r = createAllocationBaseSchema.safeParse({ name: "  X  ", method: "headcount_fte" });
    expect(r.success && r.data.name).toBe("X");
  });

  it("rejects empty name", () => {
    expect(createAllocationBaseSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name exceeding 120 chars", () => {
    expect(createAllocationBaseSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(
      false,
    );
  });

  it("accepts name at exactly 120 chars", () => {
    expect(createAllocationBaseSchema.safeParse({ ...valid, name: "a".repeat(120) }).success).toBe(
      true,
    );
  });

  it("rejects invalid method", () => {
    expect(createAllocationBaseSchema.safeParse({ ...valid, method: "alien" }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(createAllocationBaseSchema.safeParse({ ...valid, status: "pending" }).success).toBe(
      false,
    );
  });

  it("accepts optional description", () => {
    const r = createAllocationBaseSchema.safeParse({
      ...valid,
      description: "Some description",
    });
    expect(r.success).toBe(true);
  });

  it("rejects description exceeding 500 chars", () => {
    expect(
      createAllocationBaseSchema.safeParse({ ...valid, description: "a".repeat(501) }).success,
    ).toBe(false);
  });

  it("accepts description at exactly 500 chars", () => {
    expect(
      createAllocationBaseSchema.safeParse({ ...valid, description: "a".repeat(500) }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateAllocationBaseSchema
// ---------------------------------------------------------------------------

describe("updateAllocationBaseSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(updateAllocationBaseSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update", () => {
    expect(updateAllocationBaseSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("rejects invalid method in partial update", () => {
    expect(updateAllocationBaseSchema.safeParse({ method: "bad" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allocationTargetInputSchema
// ---------------------------------------------------------------------------

describe("allocationTargetInputSchema", () => {
  const valid = {
    functionalClass: "program",
    programId: "prog-123",
    weightBasisPoints: 5000,
  } as const;

  it("accepts valid program target with programId", () => {
    expect(allocationTargetInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts management target without programId", () => {
    expect(
      allocationTargetInputSchema.safeParse({
        functionalClass: "management",
        weightBasisPoints: 3000,
      }).success,
    ).toBe(true);
  });

  it("accepts fundraising target without programId", () => {
    expect(
      allocationTargetInputSchema.safeParse({
        functionalClass: "fundraising",
        weightBasisPoints: 2000,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid functionalClass", () => {
    expect(
      allocationTargetInputSchema.safeParse({ ...valid, functionalClass: "admin" }).success,
    ).toBe(false);
  });

  it("rejects negative weightBasisPoints", () => {
    expect(allocationTargetInputSchema.safeParse({ ...valid, weightBasisPoints: -1 }).success).toBe(
      false,
    );
  });

  it("rejects weightBasisPoints > 10000", () => {
    expect(
      allocationTargetInputSchema.safeParse({ ...valid, weightBasisPoints: 10001 }).success,
    ).toBe(false);
  });

  it("accepts weightBasisPoints of 0", () => {
    expect(allocationTargetInputSchema.safeParse({ ...valid, weightBasisPoints: 0 }).success).toBe(
      true,
    );
  });

  it("accepts weightBasisPoints of 10000", () => {
    expect(
      allocationTargetInputSchema.safeParse({
        functionalClass: "program",
        programId: "x",
        weightBasisPoints: 10000,
      }).success,
    ).toBe(true);
  });

  it("rejects non-integer weightBasisPoints", () => {
    expect(
      allocationTargetInputSchema.safeParse({ ...valid, weightBasisPoints: 5000.5 }).success,
    ).toBe(false);
  });

  it("accepts optional label up to 120 chars", () => {
    expect(
      allocationTargetInputSchema.safeParse({ ...valid, label: "a".repeat(120) }).success,
    ).toBe(true);
  });

  it("rejects label exceeding 120 chars", () => {
    expect(
      allocationTargetInputSchema.safeParse({ ...valid, label: "a".repeat(121) }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setAllocationTargetsSchema
// ---------------------------------------------------------------------------

describe("setAllocationTargetsSchema", () => {
  const program = (w: number, id = "prog-1") => ({
    functionalClass: "program" as const,
    programId: id,
    weightBasisPoints: w,
  });
  const mgmt = (w: number) => ({
    functionalClass: "management" as const,
    weightBasisPoints: w,
  });
  const fund = (w: number) => ({
    functionalClass: "fundraising" as const,
    weightBasisPoints: w,
  });

  it("accepts valid targets totaling 10000", () => {
    const r = setAllocationTargetsSchema.safeParse({
      targets: [program(5000), mgmt(3000), fund(2000)],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty targets array", () => {
    expect(setAllocationTargetsSchema.safeParse({ targets: [] }).success).toBe(false);
  });

  it("rejects targets not totaling 10000", () => {
    const r = setAllocationTargetsSchema.safeParse({
      targets: [program(5000), mgmt(3000)],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("100%"))).toBe(true);
    }
  });

  it("rejects non-program target with programId set", () => {
    const r = setAllocationTargetsSchema.safeParse({
      targets: [{ functionalClass: "management", programId: "prog-1", weightBasisPoints: 10000 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("program"))).toBe(true);
    }
  });

  it("rejects fundraising target with programId set", () => {
    const r = setAllocationTargetsSchema.safeParse({
      targets: [{ functionalClass: "fundraising", programId: "prog-1", weightBasisPoints: 10000 }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts single program target at 10000", () => {
    expect(setAllocationTargetsSchema.safeParse({ targets: [program(10000)] }).success).toBe(true);
  });

  it("accepts management only at 10000", () => {
    expect(setAllocationTargetsSchema.safeParse({ targets: [mgmt(10000)] }).success).toBe(true);
  });

  it("rejects weights summing to 10001", () => {
    expect(
      setAllocationTargetsSchema.safeParse({ targets: [program(5001), mgmt(5000)] }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAllocationRuleSchema
// ---------------------------------------------------------------------------

describe("createAllocationRuleSchema", () => {
  const valid = { accountId: "acc-1", baseId: "base-1", status: "active" } as const;

  it("accepts valid input", () => {
    expect(createAllocationRuleSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status to active", () => {
    const r = createAllocationRuleSchema.safeParse({ accountId: "acc-1", baseId: "base-1" });
    expect(r.success && r.data.status).toBe("active");
  });

  it("rejects empty accountId", () => {
    expect(createAllocationRuleSchema.safeParse({ ...valid, accountId: "" }).success).toBe(false);
  });

  it("rejects empty baseId", () => {
    expect(createAllocationRuleSchema.safeParse({ ...valid, baseId: "" }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(createAllocationRuleSchema.safeParse({ ...valid, status: "draft" }).success).toBe(false);
  });

  it("accepts inactive status", () => {
    expect(createAllocationRuleSchema.safeParse({ ...valid, status: "inactive" }).success).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// updateAllocationRuleSchema
// ---------------------------------------------------------------------------

describe("updateAllocationRuleSchema", () => {
  it("accepts empty object", () => {
    expect(updateAllocationRuleSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial status update", () => {
    expect(updateAllocationRuleSchema.safeParse({ status: "inactive" }).success).toBe(true);
  });

  it("rejects invalid status in partial update", () => {
    expect(updateAllocationRuleSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});
