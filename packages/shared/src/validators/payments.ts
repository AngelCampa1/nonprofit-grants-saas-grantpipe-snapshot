import { z } from "zod";
import {
  ADJUSTMENT_KINDS,
  INDIRECT_COST_BASES,
  PAYMENT_METHODS,
  PAYMENT_REQUEST_LINE_CATEGORIES,
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const optionalIdSchema = idSchema.optional();
const isoDatetimeSchema = z.string().datetime();
const positiveMoneySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeMoneySchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optionalTrimmedString = z.string().trim().min(1).optional();

// When both reporting-period bounds are supplied, periodEnd must be on or after
// periodStart. Equal dates describe a valid single-day period.
const periodDateOrderRefine = (data: {
  periodStart?: string | null;
  periodEnd?: string | null;
}): boolean =>
  !data.periodStart || !data.periodEnd || new Date(data.periodStart) <= new Date(data.periodEnd);
const periodDateOrderRefineOptions = {
  message: "End date must be on or after the start date.",
  path: ["periodEnd"],
};

// Valid status transitions from each state
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["partially_approved", "approved", "rejected"],
  partially_approved: ["approved", "rejected", "paid"],
  approved: ["paid", "rejected"],
  rejected: ["draft"],
  paid: ["closed"],
  closed: [],
};

// ---------------------------------------------------------------------------
// Payment Requests
// ---------------------------------------------------------------------------

export const paymentRequestListSchema = paginationSchema.extend({
  grantId: optionalIdSchema,
  status: z.enum(PAYMENT_REQUEST_STATUSES).optional(),
  type: z.enum(PAYMENT_REQUEST_TYPES).optional(),
});
export type PaymentRequestListParams = z.infer<typeof paymentRequestListSchema>;

export const createPaymentRequestSchema = z
  .object({
    grantId: idSchema,
    type: z.enum(PAYMENT_REQUEST_TYPES),
    periodStart: isoDatetimeSchema.optional(),
    periodEnd: isoDatetimeSchema.optional(),
    funderReference: optionalTrimmedString,
    notes: optionalTrimmedString,
    autoPostJournalEntry: z.boolean().optional(),
  })
  .refine(periodDateOrderRefine, periodDateOrderRefineOptions);
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;

export const updatePaymentRequestSchema = z
  .object({
    type: z.enum(PAYMENT_REQUEST_TYPES).optional(),
    periodStart: isoDatetimeSchema.nullable().optional(),
    periodEnd: isoDatetimeSchema.nullable().optional(),
    funderReference: optionalTrimmedString,
    notes: optionalTrimmedString,
    autoPostJournalEntry: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided for update",
  })
  .refine(periodDateOrderRefine, periodDateOrderRefineOptions);
export type UpdatePaymentRequestInput = z.infer<typeof updatePaymentRequestSchema>;

export const paymentRequestStatusTransitionSchema = z
  .object({
    toStatus: z.enum(PAYMENT_REQUEST_STATUSES),
    fromStatus: z.enum(PAYMENT_REQUEST_STATUSES),
    approvedAmountCents: nonNegativeMoneySchema.optional(),
    notes: optionalTrimmedString,
  })
  .superRefine((data, ctx) => {
    const allowed = STATUS_TRANSITIONS[data.fromStatus] ?? [];
    if (!allowed.includes(data.toStatus)) {
      ctx.addIssue({
        code: "custom",
        message: `Cannot transition from '${data.fromStatus}' to '${data.toStatus}'`,
        path: ["toStatus"],
      });
    }
    if (
      (data.toStatus === "approved" || data.toStatus === "partially_approved") &&
      data.approvedAmountCents === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "approvedAmountCents is required when approving a request",
        path: ["approvedAmountCents"],
      });
    }
  });
export type PaymentRequestStatusTransitionInput = z.infer<
  typeof paymentRequestStatusTransitionSchema
>;

// ---------------------------------------------------------------------------
// Payment Request Lines
// ---------------------------------------------------------------------------

export const createPaymentRequestLineSchema = z.object({
  expenseId: optionalIdSchema,
  budgetLineId: optionalIdSchema,
  category: z.enum(PAYMENT_REQUEST_LINE_CATEGORIES).default("direct"),
  description: optionalTrimmedString,
  amountCents: positiveMoneySchema,
  sortOrder: z.number().int().min(0).default(0),
});
export type CreatePaymentRequestLineInput = z.infer<typeof createPaymentRequestLineSchema>;

export const updatePaymentRequestLineSchema = z
  .object({
    category: z.enum(PAYMENT_REQUEST_LINE_CATEGORIES).optional(),
    description: optionalTrimmedString,
    amountCents: positiveMoneySchema.optional(),
    approvedAmountCents: nonNegativeMoneySchema.optional(),
    rejectionReason: optionalTrimmedString,
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided for update",
  });
export type UpdatePaymentRequestLineInput = z.infer<typeof updatePaymentRequestLineSchema>;

export const uniformGuidanceGuardrailPreviewSchema = createPaymentRequestLineSchema;
export type UniformGuidanceGuardrailPreviewInput = z.infer<
  typeof uniformGuidanceGuardrailPreviewSchema
>;

export const uniformGuidanceGuardrailFindingSchema = z.object({
  code: z.enum([
    "unallowable_budget_line",
    "mtdc_subaward_cap",
    "equipment_threshold_exclusion",
    "missing_indirect_cost_rule",
    "indirect_rate_mismatch",
  ]),
  severity: z.enum(["block", "warning"]),
  title: z.string(),
  message: z.string(),
  source: z.enum(["budget_line", "expense", "indirect_rule"]),
});
export type UniformGuidanceGuardrailFinding = z.infer<typeof uniformGuidanceGuardrailFindingSchema>;

export const uniformGuidanceGuardrailResultSchema = z.object({
  applicable: z.boolean(),
  status: z.enum(["clear", "warning", "blocked"]),
  findingCount: z.number().int().min(0),
  findings: z.array(uniformGuidanceGuardrailFindingSchema),
  regulatoryFacts: z.object({
    deMinimisRatePercent: z.literal(15),
    mtdcSubawardCapCents: z.literal(5_000_000),
    equipmentThresholdCents: z.literal(1_000_000),
  }),
});
export type UniformGuidanceGuardrailResult = z.infer<typeof uniformGuidanceGuardrailResultSchema>;

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

export const createPaymentRequestAdjustmentSchema = z.object({
  kind: z.enum(ADJUSTMENT_KINDS),
  amountCents: nonNegativeMoneySchema.optional(),
  reason: z.string().trim().min(1).max(500),
});
export type CreatePaymentRequestAdjustmentInput = z.infer<
  typeof createPaymentRequestAdjustmentSchema
>;

// ---------------------------------------------------------------------------
// Payments (cash receipts)
// ---------------------------------------------------------------------------

export const recordPaymentSchema = z.object({
  receivedDate: isoDatetimeSchema,
  amountCents: positiveMoneySchema,
  referenceNumber: optionalTrimmedString,
  method: z.enum(PAYMENT_METHODS).optional(),
  journalEntryId: optionalIdSchema,
  bankTransactionId: optionalIdSchema,
  notes: optionalTrimmedString,
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ---------------------------------------------------------------------------
// Indirect Cost Rules  (Audit-Ready+)
// ---------------------------------------------------------------------------

export const createIndirectCostRuleSchema = z
  .object({
    grantId: optionalIdSchema,
    base: z.enum(INDIRECT_COST_BASES),
    rateBasisPoints: z.number().int().min(1).max(100_000),
    effectiveFrom: isoDatetimeSchema,
    effectiveTo: isoDatetimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.effectiveTo && data.effectiveFrom >= data.effectiveTo) {
      ctx.addIssue({
        code: "custom",
        message: "effectiveTo must be after effectiveFrom",
        path: ["effectiveTo"],
      });
    }
  });
export type CreateIndirectCostRuleInput = z.infer<typeof createIndirectCostRuleSchema>;

export const updateIndirectCostRuleSchema = z
  .object({
    // Nullable so a grant-scoped rule can be re-scoped org-wide (grantId: null);
    // undefined leaves the existing scope unchanged. The service honors both.
    grantId: idSchema.nullish(),
    base: z.enum(INDIRECT_COST_BASES).optional(),
    rateBasisPoints: z.number().int().min(1).max(100_000).optional(),
    effectiveFrom: isoDatetimeSchema.optional(),
    effectiveTo: isoDatetimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.effectiveFrom && data.effectiveTo && data.effectiveFrom >= data.effectiveTo) {
      ctx.addIssue({
        code: "custom",
        message: "effectiveTo must be after effectiveFrom",
        path: ["effectiveTo"],
      });
    }
  });
export type UpdateIndirectCostRuleInput = z.infer<typeof updateIndirectCostRuleSchema>;

// ---------------------------------------------------------------------------
// Indirect cost rules list query
// ---------------------------------------------------------------------------

export const listIndirectCostRulesQuerySchema = z.object({
  grantId: optionalIdSchema,
});
export type ListIndirectCostRulesQueryParams = z.infer<typeof listIndirectCostRulesQuerySchema>;

// ---------------------------------------------------------------------------
// Eligible expense lookup
// ---------------------------------------------------------------------------

export const eligibleExpenseQuerySchema = z
  .object({
    periodStart: isoDatetimeSchema.optional(),
    periodEnd: isoDatetimeSchema.optional(),
    category: optionalTrimmedString,
    search: optionalTrimmedString,
  })
  .superRefine((data, ctx) => {
    if (data.periodStart && data.periodEnd && data.periodStart > data.periodEnd) {
      ctx.addIssue({
        code: "custom",
        message: "periodStart must be before or equal to periodEnd",
        path: ["periodStart"],
      });
    }
  });
export type EligibleExpenseQueryParams = z.infer<typeof eligibleExpenseQuerySchema>;

// ---------------------------------------------------------------------------
// Status transition helpers exported for service use
// ---------------------------------------------------------------------------
export { STATUS_TRANSITIONS };

// ---------------------------------------------------------------------------
// Re-export constants as a convenience for consumers importing from validators
// ---------------------------------------------------------------------------
export {
  ADJUSTMENT_KINDS,
  INDIRECT_COST_BASES,
  PAYMENT_METHODS,
  PAYMENT_REQUEST_LINE_CATEGORIES,
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_TYPES,
  type AdjustmentKind,
  type IndirectCostBase,
  type PaymentMethod,
  type PaymentRequestLineCategory,
  type PaymentRequestStatus,
  type PaymentRequestType,
} from "../constants";
