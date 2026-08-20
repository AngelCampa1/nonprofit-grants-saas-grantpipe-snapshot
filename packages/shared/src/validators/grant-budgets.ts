import { z } from "zod";
import {
  GRANT_BUDGET_LINE_COST_TYPES,
  GRANT_BUDGET_VERSION_SOURCES,
  PLANNED_EXPENSE_STATUSES,
} from "../constants";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date in YYYY-MM-DD format.");

const centsSchema = z.number().int().min(0);
const positiveCentsSchema = z.number().int().positive();

export const createGrantBudgetVersionSchema = z
  .object({
    source: z.enum(GRANT_BUDGET_VERSION_SOURCES).optional().default("manual"),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CreateGrantBudgetVersionInput = z.input<typeof createGrantBudgetVersionSchema>;

export const updateGrantBudgetVersionSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateGrantBudgetVersionInput = z.input<typeof updateGrantBudgetVersionSchema>;

export const approveGrantBudgetVersionSchema = z.object({
  approvedAt: isoDateSchema.optional(),
});
export type ApproveGrantBudgetVersionInput = z.input<typeof approveGrantBudgetVersionSchema>;

const grantBudgetPeriodFields = {
  budgetVersionId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(120),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  dueDate: isoDateSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
};

export const createGrantBudgetPeriodSchema = z
  .object(grantBudgetPeriodFields)
  .refine((value) => value.startDate <= value.endDate, {
    message: "Budget period startDate must be on or before endDate.",
    path: ["endDate"],
  });
export type CreateGrantBudgetPeriodInput = z.input<typeof createGrantBudgetPeriodSchema>;

export const updateGrantBudgetPeriodSchema = z
  .object(grantBudgetPeriodFields)
  .omit({ budgetVersionId: true })
  .partial()
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: "Budget period startDate must be on or before endDate.",
    path: ["endDate"],
  });
export type UpdateGrantBudgetPeriodInput = z.input<typeof updateGrantBudgetPeriodSchema>;

export const createGrantBudgetLineSchema = z.object({
  budgetVersionId: z.string().trim().min(1),
  budgetPeriodId: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  approvedAmountCents: centsSchema,
  allowable: z.boolean().default(true),
  costType: z.enum(GRANT_BUDGET_LINE_COST_TYPES).default("direct"),
  programId: z.string().trim().min(1).optional(),
  fundId: z.string().trim().min(1).optional(),
  accountingDimensionCode: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateGrantBudgetLineInput = z.input<typeof createGrantBudgetLineSchema>;

export const updateGrantBudgetLineSchema = createGrantBudgetLineSchema
  .omit({ budgetVersionId: true })
  .partial();
export type UpdateGrantBudgetLineInput = z.input<typeof updateGrantBudgetLineSchema>;

export const createPlannedExpenseSchema = z.object({
  budgetLineId: z.string().trim().min(1),
  budgetPeriodId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(300),
  amountCents: positiveCentsSchema,
  expectedDate: isoDateSchema,
  status: z.enum(PLANNED_EXPENSE_STATUSES).optional().default("planned"),
  notes: z.string().trim().max(2000).optional(),
});
export type CreatePlannedExpenseInput = z.input<typeof createPlannedExpenseSchema>;

export const updatePlannedExpenseSchema = createPlannedExpenseSchema
  .omit({ budgetLineId: true })
  .partial();
export type UpdatePlannedExpenseInput = z.input<typeof updatePlannedExpenseSchema>;

export const convertPlannedExpenseSchema = z.object({
  date: isoDateSchema.optional(),
  description: z.string().trim().min(1).max(300).optional(),
  fundId: z.string().trim().min(1).nullable().optional(),
  accountId: z.string().trim().min(1).nullable().optional(),
  vendor: z.string().trim().min(1).max(200).optional(),
  reimbursable: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ConvertPlannedExpenseInput = z.input<typeof convertPlannedExpenseSchema>;

export const createGrantBudgetAmendmentSchema = z.object({
  previousBudgetVersionId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000),
  effectiveDate: isoDateSchema,
  supportingDocumentId: z.string().trim().min(1).optional(),
});
export type CreateGrantBudgetAmendmentInput = z.input<typeof createGrantBudgetAmendmentSchema>;

export const expenseBudgetAllocationSchema = z.object({
  allocations: z.array(
    z.object({
      budgetLineId: z.string().trim().min(1),
      amountCents: positiveCentsSchema,
      notes: z.string().trim().max(1000).optional(),
    }),
  ),
});
export type ExpenseBudgetAllocationInput = z.input<typeof expenseBudgetAllocationSchema>;

export const budgetVarianceQuerySchema = z.object({
  periodId: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  programId: z.string().trim().min(1).optional(),
  fundId: z.string().trim().min(1).optional(),
  allowable: z.enum(["true", "false"]).optional(),
  costType: z.enum(GRANT_BUDGET_LINE_COST_TYPES).optional(),
});
export type BudgetVarianceQuery = z.input<typeof budgetVarianceQuerySchema>;

export const budgetExportQuerySchema = budgetVarianceQuerySchema.extend({
  format: z.enum(["csv"]).default("csv"),
});
export type BudgetExportQuery = z.input<typeof budgetExportQuerySchema>;

export const extractGrantBudgetDocumentSchema = z.object({
  documentId: z.string().trim().min(1),
  documentText: z.string().trim().min(1).max(200_000),
});
export type ExtractGrantBudgetDocumentInput = z.input<typeof extractGrantBudgetDocumentSchema>;

export const confirmGrantBudgetIntakeSchema = z.object({
  budgetVersionId: z.string().trim().min(1),
  sourceDocumentId: z.string().trim().min(1),
  rows: z
    .array(
      createGrantBudgetLineSchema
        .omit({ budgetVersionId: true })
        .extend({ confidence: z.number().min(0).max(1).optional() }),
    )
    .min(1)
    .max(500),
});
export type ConfirmGrantBudgetIntakeInput = z.input<typeof confirmGrantBudgetIntakeSchema>;

export type GrantBudgetLineRollup = {
  lineId: string;
  category: string;
  approvedAmountCents: number;
  actualCents: number;
  plannedCents: number;
  remainingCents: number;
  varianceCents: number;
  variancePercent: number | null;
  allowable: boolean;
  costType: string;
};

export type GrantBudgetAlert = {
  type: "over_budget" | "underspend" | "unallowable_category" | "upcoming_period_deadline";
  budgetLineId?: string;
  message: string;
};
