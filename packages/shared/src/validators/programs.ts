import { z } from "zod";
import { paginationSchema } from "./pagination";

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();
const moneyCentsSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const percentBasisPointsSchema = z.number().int().min(1).max(10_000);

export const PROGRAM_STATUSES = ["active", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_BUDGET_STATUSES = ["draft", "approved", "archived"] as const;
export type ProgramBudgetStatus = (typeof PROGRAM_BUDGET_STATUSES)[number];

export const PROGRAM_ALLOCATION_MODES = ["amount", "percent"] as const;
export type ProgramAllocationMode = (typeof PROGRAM_ALLOCATION_MODES)[number];

export const PROGRAM_ALLOCATION_WARNINGS = [
  "source_over_allocated",
  "grant_over_allocated",
  "fund_over_allocated",
  "expense_unbalanced",
] as const;
export type ProgramAllocationWarning = (typeof PROGRAM_ALLOCATION_WARNINGS)[number];

export const programCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().min(1).max(2_000).optional(),
  ownerUserId: uuidSchema.nullable().optional(),
  status: z.enum(PROGRAM_STATUSES).default("active"),
});
export type ProgramCreateInput = z.input<typeof programCreateSchema>;

export const programUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().min(1).max(50).nullable().optional(),
  description: z.string().trim().min(1).max(2_000).nullable().optional(),
  ownerUserId: uuidSchema.nullable().optional(),
  status: z.enum(PROGRAM_STATUSES).optional(),
});
export type ProgramUpdateInput = z.input<typeof programUpdateSchema>;

export const programListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(PROGRAM_STATUSES).optional(),
  sortBy: z.enum(["name", "code", "updatedAt", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ProgramListQuery = z.infer<typeof programListQuerySchema>;

export const programBudgetLineSchema = z.object({
  id: uuidSchema.optional(),
  category: z.string().trim().min(1).max(120),
  budgetedCents: moneyCentsSchema,
  notes: z.string().trim().min(1).max(1_000).nullable().optional(),
});
export type ProgramBudgetLineInput = z.input<typeof programBudgetLineSchema>;

const periodRangeSchema = z
  .object({
    periodStart: dateSchema,
    periodEnd: dateSchema,
  })
  .refine((data) => data.periodStart <= data.periodEnd, {
    message: "Period start must be on or before period end",
    path: ["periodEnd"],
  });

export const programBudgetCreateSchema = periodRangeSchema.extend({
  programId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(PROGRAM_BUDGET_STATUSES).default("draft"),
  lines: z.array(programBudgetLineSchema).min(1).max(200),
});
export type ProgramBudgetCreateInput = z.input<typeof programBudgetCreateSchema>;

export const programBudgetUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    periodStart: dateSchema.optional(),
    periodEnd: dateSchema.optional(),
    status: z.enum(PROGRAM_BUDGET_STATUSES).optional(),
    lines: z.array(programBudgetLineSchema).min(1).max(200).optional(),
  })
  .refine(
    (data) =>
      data.periodStart === undefined ||
      data.periodEnd === undefined ||
      data.periodStart <= data.periodEnd,
    {
      message: "Period start must be on or before period end",
      path: ["periodEnd"],
    },
  );
export type ProgramBudgetUpdateInput = z.input<typeof programBudgetUpdateSchema>;

const allocationRowSchema = z
  .object({
    programId: uuidSchema,
    amountCents: moneyCentsSchema.optional(),
    percentBasisPoints: percentBasisPointsSchema.optional(),
  })
  .refine((data) => (data.amountCents === undefined) !== (data.percentBasisPoints === undefined), {
    message: "Provide exactly one allocation mode",
    path: ["amountCents"],
  });

function rejectDuplicatePrograms<T extends { allocations: Array<{ programId: string }> }>(
  data: T,
): boolean {
  return (
    new Set(data.allocations.map((allocation) => allocation.programId)).size ===
    data.allocations.length
  );
}

export const grantProgramAllocationReplaceSchema = z
  .object({
    grantId: uuidSchema,
    allocations: z.array(allocationRowSchema).max(200),
  })
  .refine(rejectDuplicatePrograms, {
    message: "Program allocations must be unique",
    path: ["allocations"],
  });
export type GrantProgramAllocationReplaceInput = z.input<
  typeof grantProgramAllocationReplaceSchema
>;

export const expenseProgramAllocationReplaceSchema = z
  .object({
    expenseId: uuidSchema,
    balanceMode: z.enum(["replace", "replace_and_balance"]).default("replace"),
    allocations: z.array(allocationRowSchema).max(200),
  })
  .refine(rejectDuplicatePrograms, {
    message: "Program allocations must be unique",
    path: ["allocations"],
  })
  .refine(
    (data) =>
      data.balanceMode !== "replace_and_balance" ||
      data.allocations.every((allocation) => allocation.percentBasisPoints !== undefined) ||
      data.allocations.every((allocation) => allocation.amountCents !== undefined),
    {
      message: "Balanced replacements cannot mix allocation modes",
      path: ["allocations"],
    },
  )
  .refine(
    (data) =>
      data.balanceMode !== "replace_and_balance" ||
      data.allocations.some((allocation) => allocation.amountCents !== undefined) ||
      data.allocations.reduce(
        (total, allocation) => total + (allocation.percentBasisPoints as number),
        0,
      ) === 10_000,
    {
      message: "Percent allocations must total 10000 basis points",
      path: ["allocations"],
    },
  );
export type ExpenseProgramAllocationReplaceInput = z.input<
  typeof expenseProgramAllocationReplaceSchema
>;

export const programImpactMetricLinkSchema = z.object({
  programId: uuidSchema,
  impactMetricId: uuidSchema,
  grantId: uuidSchema.nullable().optional(),
});
export type ProgramImpactMetricLinkInput = z.input<typeof programImpactMetricLinkSchema>;

export const programReportingRequirementLinkSchema = z.object({
  programId: uuidSchema,
  reportingRequirementId: uuidSchema,
});
export type ProgramReportingRequirementLinkInput = z.input<
  typeof programReportingRequirementLinkSchema
>;

export const programBudgetVsActualQuerySchema = periodRangeSchema.extend({
  programId: uuidSchema.optional(),
  grantId: uuidSchema.optional(),
  fundId: uuidSchema.optional(),
});
export type ProgramBudgetVsActualQuery = z.infer<typeof programBudgetVsActualQuerySchema>;

export const programBudgetVsActualExportQuerySchema = programBudgetVsActualQuerySchema.extend({
  format: z.enum(["csv"]).default("csv"),
});
export type ProgramBudgetVsActualExportQuery = z.infer<
  typeof programBudgetVsActualExportQuerySchema
>;
