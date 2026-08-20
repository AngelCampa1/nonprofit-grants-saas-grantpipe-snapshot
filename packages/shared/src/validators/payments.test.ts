import { describe, expect, it } from "vitest";
import {
  createIndirectCostRuleSchema,
  createPaymentRequestAdjustmentSchema,
  createPaymentRequestLineSchema,
  createPaymentRequestSchema,
  eligibleExpenseQuerySchema,
  listIndirectCostRulesQuerySchema,
  paymentRequestListSchema,
  paymentRequestStatusTransitionSchema,
  recordPaymentSchema,
  updateIndirectCostRuleSchema,
  updatePaymentRequestLineSchema,
  updatePaymentRequestSchema,
  uniformGuidanceGuardrailPreviewSchema,
  uniformGuidanceGuardrailResultSchema,
} from "./payments";

// ---------------------------------------------------------------------------
// paymentRequestListSchema
// ---------------------------------------------------------------------------
describe("paymentRequestListSchema", () => {
  it("accepts valid params with all fields", () => {
    const result = paymentRequestListSchema.safeParse({
      page: "1",
      pageSize: "25",
      grantId: "grant-abc",
      status: "draft",
      type: "drawdown",
    });
    expect(result.success).toBe(true);
  });

  it("accepts params without optional grantId", () => {
    const result = paymentRequestListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts params with pagination as strings (query params)", () => {
    const result = paymentRequestListSchema.safeParse({ page: "2", pageSize: "10" });
    expect(result.success).toBe(true);
  });

  it("accepts params with only grantId", () => {
    const result = paymentRequestListSchema.safeParse({ grantId: "grant-123" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = paymentRequestListSchema.safeParse({ status: "not_a_status" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = paymentRequestListSchema.safeParse({ type: "not_a_type" });
    expect(result.success).toBe(false);
  });

  it("rejects empty grantId string", () => {
    const result = paymentRequestListSchema.safeParse({ grantId: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPaymentRequestSchema
// ---------------------------------------------------------------------------
describe("createPaymentRequestSchema", () => {
  it("accepts valid creation with required fields", () => {
    const result = createPaymentRequestSchema.safeParse({
      grantId: "grant-123",
      type: "reimbursement",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid creation with all fields", () => {
    const result = createPaymentRequestSchema.safeParse({
      grantId: "grant-123",
      type: "drawdown",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T23:59:59.000Z",
      funderReference: "REF-001",
      notes: "First quarter drawdown",
      autoPostJournalEntry: true,
    });
    expect(result.success).toBe(true);
  });

  it("fails when grantId is missing", () => {
    const result = createPaymentRequestSchema.safeParse({ type: "drawdown" });
    expect(result.success).toBe(false);
  });

  it("fails when grantId is empty string", () => {
    const result = createPaymentRequestSchema.safeParse({ grantId: "", type: "drawdown" });
    expect(result.success).toBe(false);
  });

  it("fails when type is invalid", () => {
    const result = createPaymentRequestSchema.safeParse({ grantId: "g1", type: "invalid_type" });
    expect(result.success).toBe(false);
  });

  it("fails when type is missing", () => {
    const result = createPaymentRequestSchema.safeParse({ grantId: "g1" });
    expect(result.success).toBe(false);
  });

  it("leaves autoPostJournalEntry undefined when not provided", () => {
    const result = createPaymentRequestSchema.safeParse({ grantId: "g1", type: "invoice" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoPostJournalEntry).toBeUndefined();
    }
  });

  it("fails when periodStart is not a valid ISO datetime", () => {
    const result = createPaymentRequestSchema.safeParse({
      grantId: "g1",
      type: "drawdown",
      periodStart: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a request whose period end precedes its period start", () => {
    const result = createPaymentRequestSchema.safeParse({
      grantId: "g1",
      type: "drawdown",
      periodStart: "2026-09-30T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("periodEnd");
    }
  });

  it("accepts a request whose period start and end are equal", () => {
    const result = createPaymentRequestSchema.safeParse({
      grantId: "g1",
      type: "drawdown",
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updatePaymentRequestSchema
// ---------------------------------------------------------------------------
describe("updatePaymentRequestSchema", () => {
  it("accepts valid update with type", () => {
    const result = updatePaymentRequestSchema.safeParse({ type: "invoice" });
    expect(result.success).toBe(true);
  });

  it("accepts valid update with notes", () => {
    const result = updatePaymentRequestSchema.safeParse({ notes: "Updated notes" });
    expect(result.success).toBe(true);
  });

  it("accepts valid update with autoPostJournalEntry", () => {
    const result = updatePaymentRequestSchema.safeParse({ autoPostJournalEntry: true });
    expect(result.success).toBe(true);
  });

  it("accepts null period dates so callers can clear them", () => {
    const result = updatePaymentRequestSchema.safeParse({
      periodStart: null,
      periodEnd: null,
    });
    expect(result.success).toBe(true);
  });

  it("fails when no fields are provided (empty object)", () => {
    const result = updatePaymentRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((e) => e.message.includes("At least one field"))).toBe(true);
    }
  });

  it("fails when type is invalid", () => {
    const result = updatePaymentRequestSchema.safeParse({ type: "bad_type" });
    expect(result.success).toBe(false);
  });

  it("accepts multiple fields at once", () => {
    const result = updatePaymentRequestSchema.safeParse({
      type: "advance_liquidation",
      notes: "Liquidating advance",
      funderReference: "ADV-2026-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an update whose period end precedes its period start", () => {
    const result = updatePaymentRequestSchema.safeParse({
      periodStart: "2026-09-30T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("periodEnd");
    }
  });
});

// ---------------------------------------------------------------------------
// paymentRequestStatusTransitionSchema
// ---------------------------------------------------------------------------
describe("paymentRequestStatusTransitionSchema", () => {
  it("accepts valid draft→submitted transition", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "draft",
      toStatus: "submitted",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid submitted→approved transition with approvedAmountCents", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "submitted",
      toStatus: "approved",
      approvedAmountCents: 50000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid submitted→partially_approved with approvedAmountCents", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "submitted",
      toStatus: "partially_approved",
      approvedAmountCents: 25000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero approvedAmountCents when approving", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "submitted",
      toStatus: "approved",
      approvedAmountCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts approved→paid transition without approvedAmountCents", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "approved",
      toStatus: "paid",
    });
    expect(result.success).toBe(true);
  });

  it("accepts rejected→draft transition", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "rejected",
      toStatus: "draft",
    });
    expect(result.success).toBe(true);
  });

  it("accepts paid→closed transition", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "paid",
      toStatus: "closed",
    });
    expect(result.success).toBe(true);
  });

  it("fails for invalid transition draft→approved (skipping submitted)", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "draft",
      toStatus: "approved",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((e) => e.message);
      expect(messages.some((m) => m.includes("Cannot transition"))).toBe(true);
    }
  });

  it("fails for invalid transition closed→draft", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "closed",
      toStatus: "draft",
    });
    expect(result.success).toBe(false);
  });

  it("fails when approvedAmountCents is missing for approved transition", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "submitted",
      toStatus: "approved",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((e) => e.message);
      expect(messages.some((m) => m.includes("approvedAmountCents is required"))).toBe(true);
    }
  });

  it("fails when approvedAmountCents is missing for partially_approved transition", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "submitted",
      toStatus: "partially_approved",
    });
    expect(result.success).toBe(false);
  });

  it("fails with invalid fromStatus", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "not_valid",
      toStatus: "submitted",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional notes", () => {
    const result = paymentRequestStatusTransitionSchema.safeParse({
      fromStatus: "draft",
      toStatus: "submitted",
      notes: "Submitting for review",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createPaymentRequestLineSchema
// ---------------------------------------------------------------------------
describe("createPaymentRequestLineSchema", () => {
  it("accepts valid line with required fields", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: 10000 });
    expect(result.success).toBe(true);
  });

  it("accepts valid line with all fields", () => {
    const result = createPaymentRequestLineSchema.safeParse({
      expenseId: "exp-123",
      budgetLineId: "bl-456",
      category: "indirect",
      description: "Office supplies",
      amountCents: 5000,
      sortOrder: 2,
    });
    expect(result.success).toBe(true);
  });

  it("defaults category to direct", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("direct");
    }
  });

  it("defaults sortOrder to 0", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it("fails when amountCents is zero", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: 0 });
    expect(result.success).toBe(false);
  });

  it("fails when amountCents is negative", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: -100 });
    expect(result.success).toBe(false);
  });

  it("fails when amountCents is missing", () => {
    const result = createPaymentRequestLineSchema.safeParse({ category: "direct" });
    expect(result.success).toBe(false);
  });

  it("fails when amountCents is a float", () => {
    const result = createPaymentRequestLineSchema.safeParse({ amountCents: 10.5 });
    expect(result.success).toBe(false);
  });

  it("fails with invalid category", () => {
    const result = createPaymentRequestLineSchema.safeParse({
      amountCents: 1000,
      category: "bad_cat",
    });
    expect(result.success).toBe(false);
  });
});

describe("uniformGuidanceGuardrailPreviewSchema", () => {
  it("matches the payment request line input shape", () => {
    const result = uniformGuidanceGuardrailPreviewSchema.safeParse({
      expenseId: "exp-1",
      budgetLineId: "line-1",
      amountCents: 6000000,
      category: "direct",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it("rejects invalid preview line amounts", () => {
    const result = uniformGuidanceGuardrailPreviewSchema.safeParse({
      amountCents: 0,
      category: "direct",
    });

    expect(result.success).toBe(false);
  });
});

describe("uniformGuidanceGuardrailResultSchema", () => {
  it("accepts the canonical regulatory facts and finding shape", () => {
    const result = uniformGuidanceGuardrailResultSchema.safeParse({
      applicable: true,
      status: "warning",
      findingCount: 1,
      findings: [
        {
          code: "mtdc_subaward_cap",
          severity: "warning",
          title: "MTDC subaward cap",
          message: "Only the first $50,000 of each subaward can be included in MTDC.",
          source: "expense",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5000000,
        equipmentThresholdCents: 1000000,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects stale regulatory numbers", () => {
    const result = uniformGuidanceGuardrailResultSchema.safeParse({
      applicable: true,
      status: "warning",
      findingCount: 0,
      findings: [],
      regulatoryFacts: {
        deMinimisRatePercent: 10,
        mtdcSubawardCapCents: 2500000,
        equipmentThresholdCents: 500000,
      },
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePaymentRequestLineSchema
// ---------------------------------------------------------------------------
describe("updatePaymentRequestLineSchema", () => {
  it("accepts update with amountCents only", () => {
    const result = updatePaymentRequestLineSchema.safeParse({ amountCents: 5000 });
    expect(result.success).toBe(true);
  });

  it("accepts update with approvedAmountCents of zero", () => {
    const result = updatePaymentRequestLineSchema.safeParse({ approvedAmountCents: 0 });
    expect(result.success).toBe(true);
  });

  it("fails with empty object", () => {
    const result = updatePaymentRequestLineSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fails when amountCents is zero", () => {
    const result = updatePaymentRequestLineSchema.safeParse({ amountCents: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts rejectionReason", () => {
    const result = updatePaymentRequestLineSchema.safeParse({
      rejectionReason: "Not eligible",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createPaymentRequestAdjustmentSchema
// ---------------------------------------------------------------------------
describe("createPaymentRequestAdjustmentSchema", () => {
  it("accepts valid adjustment with all fields", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "reduction",
      amountCents: 5000,
      reason: "Duplicate expense removed",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid adjustment without amountCents", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "note",
      reason: "Flagged for review",
    });
    expect(result.success).toBe(true);
  });

  it("accepts dedup_override kind", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "dedup_override",
      reason: "Confirmed not a duplicate",
    });
    expect(result.success).toBe(true);
  });

  it("fails when reason is empty string", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "reduction",
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("fails when reason is whitespace only", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "reduction",
      reason: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("fails when reason is missing", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({ kind: "reduction" });
    expect(result.success).toBe(false);
  });

  it("fails when reason exceeds 500 characters", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "reduction",
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts reason of exactly 500 characters", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "reduction",
      reason: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("fails with invalid kind", () => {
    const result = createPaymentRequestAdjustmentSchema.safeParse({
      kind: "invalid_kind",
      reason: "Some reason",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordPaymentSchema
// ---------------------------------------------------------------------------
describe("recordPaymentSchema", () => {
  it("accepts valid payment with required fields", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15T00:00:00.000Z",
      amountCents: 100000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid payment with all fields", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15T00:00:00.000Z",
      amountCents: 100000,
      referenceNumber: "CHK-1001",
      method: "check",
      journalEntryId: "je-123",
      bankTransactionId: "bt-456",
      notes: "Q1 grant payment received",
    });
    expect(result.success).toBe(true);
  });

  it("fails when amountCents is zero", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15T00:00:00.000Z",
      amountCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("fails when amountCents is negative", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15T00:00:00.000Z",
      amountCents: -500,
    });
    expect(result.success).toBe(false);
  });

  it("fails when receivedDate is missing", () => {
    const result = recordPaymentSchema.safeParse({ amountCents: 100000 });
    expect(result.success).toBe(false);
  });

  it("fails when receivedDate is not a valid ISO datetime", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15",
      amountCents: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("fails with invalid payment method", () => {
    const result = recordPaymentSchema.safeParse({
      receivedDate: "2026-04-15T00:00:00.000Z",
      amountCents: 100000,
      method: "bitcoin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid payment methods", () => {
    const methods = ["ach", "wire", "check", "card", "other"] as const;
    for (const method of methods) {
      const result = recordPaymentSchema.safeParse({
        receivedDate: "2026-04-15T00:00:00.000Z",
        amountCents: 100000,
        method,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// createIndirectCostRuleSchema
// ---------------------------------------------------------------------------
describe("createIndirectCostRuleSchema", () => {
  it("accepts valid rule with required fields", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 2000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid rule with all fields", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      grantId: "grant-123",
      base: "salaries_only",
      rateBasisPoints: 2500,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: "2026-12-31T23:59:59.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts modified_total_direct base", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "modified_total_direct",
      rateBasisPoints: 1500,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("fails when effectiveTo is before effectiveFrom", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 2000,
      effectiveFrom: "2026-12-31T00:00:00.000Z",
      effectiveTo: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((e) => e.message);
      expect(messages.some((m) => m.includes("effectiveTo must be after effectiveFrom"))).toBe(
        true,
      );
    }
  });

  it("fails when effectiveTo equals effectiveFrom", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 2000,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveTo: "2026-06-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("fails when rateBasisPoints is zero", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 0,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("fails when rateBasisPoints exceeds 100000", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 100001,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rateBasisPoints at maximum (100000)", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "direct_costs",
      rateBasisPoints: 100000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("fails with invalid base", () => {
    const result = createIndirectCostRuleSchema.safeParse({
      base: "total_costs",
      rateBasisPoints: 2000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateIndirectCostRuleSchema
// ---------------------------------------------------------------------------
describe("updateIndirectCostRuleSchema", () => {
  it("accepts partial update with just rateBasisPoints", () => {
    const result = updateIndirectCostRuleSchema.safeParse({ rateBasisPoints: 3000 });
    expect(result.success).toBe(true);
  });

  it("fails when both dates are provided and effectiveTo is before effectiveFrom", () => {
    const result = updateIndirectCostRuleSchema.safeParse({
      effectiveFrom: "2026-12-31T00:00:00.000Z",
      effectiveTo: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty object (all fields optional)", () => {
    const result = updateIndirectCostRuleSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// eligibleExpenseQuerySchema
// ---------------------------------------------------------------------------
describe("eligibleExpenseQuerySchema", () => {
  it("accepts empty query", () => {
    const result = eligibleExpenseQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid query with all fields", () => {
    const result = eligibleExpenseQuerySchema.safeParse({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T23:59:59.000Z",
      category: "supplies",
      search: "office",
    });
    expect(result.success).toBe(true);
  });

  it("accepts periodStart equal to periodEnd", () => {
    const result = eligibleExpenseQuerySchema.safeParse({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("fails when periodStart is after periodEnd", () => {
    const result = eligibleExpenseQuerySchema.safeParse({
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((e) => e.message);
      expect(
        messages.some((m) => m.includes("periodStart must be before or equal to periodEnd")),
      ).toBe(true);
    }
  });

  it("fails when periodStart is not a valid ISO datetime", () => {
    const result = eligibleExpenseQuerySchema.safeParse({
      periodStart: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts query with only category", () => {
    const result = eligibleExpenseQuerySchema.safeParse({ category: "personnel" });
    expect(result.success).toBe(true);
  });

  it("accepts query with only search", () => {
    const result = eligibleExpenseQuerySchema.safeParse({ search: "travel" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listIndirectCostRulesQuerySchema
// ---------------------------------------------------------------------------
describe("listIndirectCostRulesQuerySchema", () => {
  it("accepts empty query (grantId optional)", () => {
    const result = listIndirectCostRulesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a valid grantId", () => {
    const result = listIndirectCostRulesQuerySchema.safeParse({ grantId: "grant-abc-123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.grantId).toBe("grant-abc-123");
  });

  it("rejects an empty-string grantId (min 1)", () => {
    const result = listIndirectCostRulesQuerySchema.safeParse({ grantId: "" });
    expect(result.success).toBe(false);
  });
});
