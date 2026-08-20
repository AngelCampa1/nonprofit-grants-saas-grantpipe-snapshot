import { describe, expect, it } from "vitest";
import {
  approveGrantBudgetVersionSchema,
  budgetExportQuerySchema,
  budgetVarianceQuerySchema,
  confirmGrantBudgetIntakeSchema,
  convertPlannedExpenseSchema,
  createGrantBudgetAmendmentSchema,
  createGrantBudgetLineSchema,
  createGrantBudgetPeriodSchema,
  createGrantBudgetVersionSchema,
  createPlannedExpenseSchema,
  expenseBudgetAllocationSchema,
  extractGrantBudgetDocumentSchema,
  updateGrantBudgetLineSchema,
  updateGrantBudgetVersionSchema,
  updateGrantBudgetPeriodSchema,
  updatePlannedExpenseSchema,
} from "./grant-budgets";

describe("grant budget validators", () => {
  it("accepts a draft manual budget version", () => {
    const result = createGrantBudgetVersionSchema.safeParse({
      source: "manual",
      notes: "Initial award budget",
    });

    expect(result.success).toBe(true);
  });

  it("rejects direct approval and source document assignment during budget version creation", () => {
    expect(
      createGrantBudgetVersionSchema.safeParse({
        source: "manual",
        status: "approved",
      }).success,
    ).toBe(false);

    expect(
      createGrantBudgetVersionSchema.safeParse({
        source: "manual",
        sourceDocumentId: "document-from-another-org",
      }).success,
    ).toBe(false);
  });

  it("validates budget version update and approval payloads", () => {
    expect(updateGrantBudgetVersionSchema.safeParse({ notes: null }).success).toBe(true);
    expect(updateGrantBudgetVersionSchema.safeParse({ notes: "Reviewed by finance" }).success).toBe(
      true,
    );
    expect(updateGrantBudgetVersionSchema.safeParse({ notes: "x".repeat(2001) }).success).toBe(
      false,
    );

    expect(approveGrantBudgetVersionSchema.safeParse({ approvedAt: "2026-05-01" }).success).toBe(
      true,
    );
    expect(approveGrantBudgetVersionSchema.safeParse({ approvedAt: "05/01/2026" }).success).toBe(
      false,
    );
  });

  it("rejects invalid budget line money and accepts unallowable lines", () => {
    expect(
      createGrantBudgetLineSchema.safeParse({
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: -1,
        allowable: false,
        costType: "direct",
      }).success,
    ).toBe(false);

    expect(
      createGrantBudgetLineSchema.safeParse({
        budgetVersionId: "version-1",
        category: "Lobbying",
        approvedAmountCents: 0,
        allowable: false,
        costType: "indirect",
      }).success,
    ).toBe(true);
  });

  it("accepts partial budget line updates", () => {
    expect(updateGrantBudgetLineSchema.safeParse({ approvedAmountCents: 125000 }).success).toBe(
      true,
    );
    expect(updateGrantBudgetLineSchema.safeParse({ approvedAmountCents: -1 }).success).toBe(false);
    expect(updateGrantBudgetLineSchema.safeParse({ costType: "capitalized" }).success).toBe(false);
  });

  it("validates budget period dates", () => {
    expect(
      createGrantBudgetPeriodSchema.safeParse({
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }).success,
    ).toBe(true);

    expect(
      createGrantBudgetPeriodSchema.safeParse({
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-03-31",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);

    expect(
      updateGrantBudgetPeriodSchema.safeParse({
        startDate: "2026-02-01",
      }).success,
    ).toBe(true);

    expect(
      updateGrantBudgetPeriodSchema.safeParse({
        startDate: "2026-03-31",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("requires positive planned expense amounts", () => {
    expect(
      createPlannedExpenseSchema.safeParse({
        budgetLineId: "line-1",
        description: "Workshop supplies",
        amountCents: 25000,
        expectedDate: "2026-07-15",
      }).success,
    ).toBe(true);

    expect(
      createPlannedExpenseSchema.safeParse({
        budgetLineId: "line-1",
        description: "Workshop supplies",
        amountCents: 0,
        expectedDate: "2026-07-15",
      }).success,
    ).toBe(false);
  });

  it("accepts partial planned expense updates", () => {
    expect(
      updatePlannedExpenseSchema.safeParse({
        status: "committed",
        amountCents: 1500,
      }).success,
    ).toBe(true);

    expect(updatePlannedExpenseSchema.safeParse({ amountCents: 0 }).success).toBe(false);
  });

  it("validates planned expense conversion overrides", () => {
    expect(
      convertPlannedExpenseSchema.safeParse({
        date: "2026-08-15",
        description: "Actual workshop supplies",
        fundId: null,
        accountId: "account-1",
        vendor: "Office Depot",
        reimbursable: false,
        notes: "Receipt attached",
      }).success,
    ).toBe(true);

    expect(convertPlannedExpenseSchema.safeParse({ date: "08/15/2026" }).success).toBe(false);
  });

  it("validates amendments and expense allocations", () => {
    expect(
      createGrantBudgetAmendmentSchema.safeParse({
        previousBudgetVersionId: "version-1",
        reason: "Funder approved a rebudget request",
        effectiveDate: "2026-08-01",
      }).success,
    ).toBe(true);

    expect(
      createGrantBudgetAmendmentSchema.safeParse({
        previousBudgetVersionId: "version-1",
        reason: "",
        effectiveDate: "2026-08-01",
      }).success,
    ).toBe(false);

    expect(
      expenseBudgetAllocationSchema.safeParse({
        allocations: [{ budgetLineId: "line-1", amountCents: 1000 }],
      }).success,
    ).toBe(true);

    expect(expenseBudgetAllocationSchema.safeParse({ allocations: [] }).success).toBe(true);
  });

  it("accepts variance and export filters", () => {
    expect(
      budgetVarianceQuerySchema.safeParse({
        periodId: "period-1",
        category: "Personnel",
        programId: "program-1",
        fundId: "fund-1",
        allowable: "true",
        costType: "direct",
      }).success,
    ).toBe(true);

    expect(budgetExportQuerySchema.safeParse({ format: "csv", periodId: "period-1" }).success).toBe(
      true,
    );
    expect(budgetExportQuerySchema.safeParse({ format: "xlsx" }).success).toBe(false);
  });

  it("validates AI document extraction and user-confirmed intake rows", () => {
    expect(
      extractGrantBudgetDocumentSchema.safeParse({
        documentId: "document-1",
        documentText: "Personnel $1,000",
      }).success,
    ).toBe(true);

    expect(
      extractGrantBudgetDocumentSchema.safeParse({
        documentId: "document-1",
      }).success,
    ).toBe(false);

    expect(
      confirmGrantBudgetIntakeSchema.safeParse({
        budgetVersionId: "version-1",
        sourceDocumentId: "document-1",
        rows: [
          {
            category: "Personnel",
            approvedAmountCents: 100000,
            allowable: true,
            costType: "direct",
            confidence: 0.84,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts intake rows up to the cap (500)", () => {
    const row = {
      category: "Personnel",
      approvedAmountCents: 100000,
      allowable: true,
      costType: "direct" as const,
    };
    expect(
      confirmGrantBudgetIntakeSchema.safeParse({
        budgetVersionId: "version-1",
        sourceDocumentId: "document-1",
        rows: Array.from({ length: 500 }, () => ({ ...row })),
      }).success,
    ).toBe(true);
  });

  it("rejects intake rows over the cap (501)", () => {
    const row = {
      category: "Personnel",
      approvedAmountCents: 100000,
      allowable: true,
      costType: "direct" as const,
    };
    expect(
      confirmGrantBudgetIntakeSchema.safeParse({
        budgetVersionId: "version-1",
        sourceDocumentId: "document-1",
        rows: Array.from({ length: 501 }, () => ({ ...row })),
      }).success,
    ).toBe(false);
  });
});
