import { z } from "zod";
import { paginationSchema } from "./pagination";

export const OUTCOME_STATUSES = ["draft", "active", "at_risk", "achieved", "closed"] as const;
export const OUTCOME_INDICATOR_TYPES = ["output", "outcome", "quality"] as const;
export const OUTCOME_INDICATOR_DIRECTIONS = ["increase", "decrease", "maintain"] as const;
export const OUTCOME_REPORTING_CADENCES = [
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "final",
] as const;

const uuidSchema = z.uuid();
const optionalTextSchema = z.string().trim().min(1).max(500).optional();
const nullableTextSchema = z.string().trim().min(1).max(500).nullable().optional();
const numericInputSchema = z.union([z.number(), z.string().trim().min(1)]).refine(
  (value) => {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric);
  },
  { message: "Enter a valid number." },
);
const numericStringSchema = numericInputSchema.transform((value) => String(value));
const nullableNumericStringSchema = z
  .union([numericInputSchema, z.null()])
  .optional()
  .transform((value) => (value === undefined || value === null ? value : String(value)));

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const candidate = DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00.000Z` : value;
    if (
      !z.string().datetime().safeParse(candidate).success ||
      Number.isNaN(Date.parse(candidate))
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date or datetime" });
      return z.NEVER;
    }
    return candidate;
  });

const nullableDateInputSchema = dateInputSchema.nullable().optional();
const outcomeDateOrder = (data: { startDate?: string | null; endDate?: string | null }): boolean =>
  !data.startDate || !data.endDate || new Date(data.startDate) <= new Date(data.endDate);
const outcomeDateOrderMessage = {
  message: "End date must be on or after the start date.",
  path: ["endDate"],
};

function hasAtLeastOneField(value: Record<string, unknown>): boolean {
  return Object.values(value).some((fieldValue) => fieldValue !== undefined);
}

export const outcomeStatusSchema = z.enum(OUTCOME_STATUSES);
export const outcomeIndicatorTypeSchema = z.enum(OUTCOME_INDICATOR_TYPES);
export const outcomeIndicatorDirectionSchema = z.enum(OUTCOME_INDICATOR_DIRECTIONS);
export const outcomeReportingCadenceSchema = z.enum(OUTCOME_REPORTING_CADENCES);

export const outcomeListQuerySchema = paginationSchema.extend({
  status: outcomeStatusSchema.optional(),
  programId: uuidSchema.optional(),
  grantId: uuidSchema.optional(),
});
export type OutcomeListQuery = z.infer<typeof outcomeListQuerySchema>;

export const createOutcomeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    statement: z.string().trim().min(1).max(1000),
    programId: uuidSchema.nullable().optional(),
    grantId: uuidSchema.nullable().optional(),
    targetPopulation: optionalTextSchema,
    status: outcomeStatusSchema.default("draft"),
    startDate: dateInputSchema.optional(),
    endDate: dateInputSchema.optional(),
  })
  .refine(outcomeDateOrder, outcomeDateOrderMessage);
export type CreateOutcomeInput = z.input<typeof createOutcomeSchema>;
export type ParsedCreateOutcomeInput = z.output<typeof createOutcomeSchema>;

export const updateOutcomeSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    statement: z.string().trim().min(1).max(1000).optional(),
    programId: uuidSchema.nullable().optional(),
    grantId: uuidSchema.nullable().optional(),
    targetPopulation: nullableTextSchema,
    status: outcomeStatusSchema.optional(),
    startDate: nullableDateInputSchema,
    endDate: nullableDateInputSchema,
  })
  .refine(hasAtLeastOneField, { message: "Provide at least one field to update." })
  .refine(outcomeDateOrder, outcomeDateOrderMessage);
export type UpdateOutcomeInput = z.input<typeof updateOutcomeSchema>;
export type ParsedUpdateOutcomeInput = z.output<typeof updateOutcomeSchema>;

export const createOutcomeIndicatorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  indicatorType: outcomeIndicatorTypeSchema.default("outcome"),
  direction: outcomeIndicatorDirectionSchema.default("increase"),
  targetValue: numericStringSchema.optional(),
  baselineValue: numericStringSchema.optional(),
  unit: z.string().trim().min(1).max(80).optional(),
  impactMetricId: uuidSchema.nullable().optional(),
  source: optionalTextSchema,
  funderDefined: z.boolean().default(false),
  reportingCadence: outcomeReportingCadenceSchema.optional(),
});
export type CreateOutcomeIndicatorInput = z.input<typeof createOutcomeIndicatorSchema>;
export type ParsedCreateOutcomeIndicatorInput = z.output<typeof createOutcomeIndicatorSchema>;

export const updateOutcomeIndicatorSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    indicatorType: outcomeIndicatorTypeSchema.optional(),
    direction: outcomeIndicatorDirectionSchema.optional(),
    targetValue: nullableNumericStringSchema,
    baselineValue: nullableNumericStringSchema,
    unit: z.string().trim().min(1).max(80).nullable().optional(),
    impactMetricId: uuidSchema.nullable().optional(),
    source: nullableTextSchema,
    funderDefined: z.boolean().optional(),
    reportingCadence: outcomeReportingCadenceSchema.nullable().optional(),
  })
  .refine(hasAtLeastOneField, { message: "Provide at least one field to update." });
export type UpdateOutcomeIndicatorInput = z.input<typeof updateOutcomeIndicatorSchema>;
export type ParsedUpdateOutcomeIndicatorInput = z.output<typeof updateOutcomeIndicatorSchema>;
