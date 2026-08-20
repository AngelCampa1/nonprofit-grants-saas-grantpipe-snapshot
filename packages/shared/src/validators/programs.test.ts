import { describe, expect, it } from "vitest";
import {
  expenseProgramAllocationReplaceSchema,
  grantProgramAllocationReplaceSchema,
  programBudgetCreateSchema,
  programBudgetLineSchema,
  programBudgetUpdateSchema,
  programBudgetVsActualQuerySchema,
  programListQuerySchema,
  programBudgetVsActualExportQuerySchema,
  programCreateSchema,
  programImpactMetricLinkSchema,
  programReportingRequirementLinkSchema,
  programUpdateSchema,
} from "./programs";

const uuid = "11111111-1111-4111-8111-111111111111";
const otherUuid = "22222222-2222-4222-8222-222222222222";

describe("program validators", () => {
  it("trims program names and rejects empty names", () => {
    expect(programCreateSchema.parse({ name: " Health Access " }).name).toBe("Health Access");
    expect(() => programCreateSchema.parse({ name: " " })).toThrow();
    expect(() => programUpdateSchema.parse({ name: "" })).toThrow();
  });

  it("requires budget line cents to be positive integers", () => {
    expect(
      programBudgetLineSchema.parse({
        category: "Personnel",
        budgetedCents: 125_00,
      }).budgetedCents,
    ).toBe(125_00);
    expect(() =>
      programBudgetLineSchema.parse({ category: "Personnel", budgetedCents: 0 }),
    ).toThrow();
    expect(() =>
      programBudgetLineSchema.parse({ category: "Personnel", budgetedCents: 10.5 }),
    ).toThrow();
  });

  it("accepts program budgets with period filters and budget lines", () => {
    const parsed = programBudgetCreateSchema.parse({
      programId: uuid,
      name: "FY 2027",
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
      lines: [{ category: "Supplies", budgetedCents: 50_00 }],
    });

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.status).toBe("draft");
  });

  it("parses program list defaults and partial budget updates", () => {
    expect(programListQuerySchema.parse({}).sortBy).toBe("name");
    expect(programListQuerySchema.parse({}).sortOrder).toBe("asc");
    expect(programBudgetUpdateSchema.parse({ periodStart: "2026-01-01" })).toEqual({
      periodStart: "2026-01-01",
    });
    expect(
      programBudgetUpdateSchema.parse({
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      }).periodEnd,
    ).toBe("2026-12-31");
    expect(() =>
      programBudgetUpdateSchema.parse({
        periodStart: "2026-12-31",
        periodEnd: "2026-01-01",
      }),
    ).toThrow();
  });

  it("rejects grant allocation rows with both amount and percent modes", () => {
    expect(
      grantProgramAllocationReplaceSchema.parse({
        grantId: uuid,
        allocations: [{ programId: otherUuid, amountCents: 100_00 }],
      }).allocations[0]?.amountCents,
    ).toBe(100_00);

    expect(
      grantProgramAllocationReplaceSchema.parse({
        grantId: uuid,
        allocations: [{ programId: otherUuid, percentBasisPoints: 2500 }],
      }).allocations[0]?.percentBasisPoints,
    ).toBe(2500);

    expect(() =>
      grantProgramAllocationReplaceSchema.parse({
        grantId: uuid,
        allocations: [{ programId: otherUuid, amountCents: 100_00, percentBasisPoints: 2500 }],
      }),
    ).toThrow();
    expect(() =>
      grantProgramAllocationReplaceSchema.parse({
        grantId: uuid,
        allocations: [{ programId: otherUuid }],
      }),
    ).toThrow();
  });

  it("requires replace-and-balance expense allocation percents to total 10000", () => {
    expect(
      expenseProgramAllocationReplaceSchema.parse({
        expenseId: uuid,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId: uuid, percentBasisPoints: 7000 },
          { programId: otherUuid, percentBasisPoints: 3000 },
        ],
      }).allocations,
    ).toHaveLength(2);

    expect(() =>
      expenseProgramAllocationReplaceSchema.parse({
        expenseId: uuid,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId: uuid, percentBasisPoints: 7000 },
          { programId: otherUuid, percentBasisPoints: 2000 },
        ],
      }),
    ).toThrow();
  });

  it("allows balanced expense allocation amounts and rejects mixed balanced modes", () => {
    expect(
      expenseProgramAllocationReplaceSchema.parse({
        expenseId: uuid,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId: uuid, amountCents: 70_00 },
          { programId: otherUuid, amountCents: 30_00 },
        ],
      }).allocations,
    ).toHaveLength(2);

    expect(() =>
      expenseProgramAllocationReplaceSchema.parse({
        expenseId: uuid,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId: uuid, amountCents: 70_00 },
          { programId: otherUuid, percentBasisPoints: 3000 },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate programs in allocation replacements", () => {
    expect(() =>
      grantProgramAllocationReplaceSchema.parse({
        grantId: uuid,
        allocations: [
          { programId: otherUuid, amountCents: 100_00 },
          { programId: otherUuid, amountCents: 50_00 },
        ],
      }),
    ).toThrow();
  });

  it("accepts impact metric and reporting requirement program links", () => {
    expect(
      programImpactMetricLinkSchema.parse({ programId: uuid, impactMetricId: otherUuid }),
    ).toMatchObject({ programId: uuid, impactMetricId: otherUuid });
    expect(
      programReportingRequirementLinkSchema.parse({
        programId: uuid,
        reportingRequirementId: otherUuid,
      }),
    ).toMatchObject({ programId: uuid, reportingRequirementId: otherUuid });
  });

  it("accepts export period filters and rejects inverted dates", () => {
    expect(
      programBudgetVsActualExportQuerySchema.parse({
        programId: uuid,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        format: "csv",
      }).format,
    ).toBe("csv");

    expect(() =>
      programBudgetVsActualExportQuerySchema.parse({
        programId: uuid,
        periodStart: "2026-12-31",
        periodEnd: "2026-01-01",
      }),
    ).toThrow();

    expect(() =>
      programBudgetVsActualQuerySchema.parse({
        periodStart: "2026-12-31",
        periodEnd: "2026-01-01",
      }),
    ).toThrow();
  });
});
