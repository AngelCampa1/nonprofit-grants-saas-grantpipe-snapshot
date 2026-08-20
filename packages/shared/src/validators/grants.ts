import { z } from "zod";
import {
  FUND_TYPES,
  FUNDER_TYPES,
  GRANT_OPPORTUNITY_DEADLINE_SOURCES,
  GRANT_SOURCE_TYPES,
  GRANT_STATUSES,
  REPORT_STATUSES,
  REPORT_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();
const nullableOptionalString = z.string().trim().min(1).nullable().optional();

const isoDatetimeSchema = z.string().datetime();
const nullableDatetimeSchema = isoDatetimeSchema.nullable().optional();

// Date fields bound to a browser `<input type="date">` arrive as a date-only
// string ("2026-07-01"), but downstream contracts expect a full ISO datetime.
// Accept either form and normalize a date-only value to midnight UTC so the
// grant create/update flows accept award dates entered in the form.
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const candidate = DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00.000Z` : value;
    const isIsoDatetime = z.string().datetime().safeParse(candidate).success;
    if (!isIsoDatetime || Number.isNaN(Date.parse(candidate))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date or datetime" });
      return z.NEVER;
    }
    return candidate;
  });
const nullableDateInputSchema = dateInputSchema.nullable().optional();
const positiveMoneySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nullablePositiveMoneySchema = positiveMoneySchema.nullable().optional();
const httpUrlSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  },
  { message: "URL must use http or https." },
);

const thresholdSchema = z.enum(["80", "90", "100"]);

export const grantOpportunityStatusSchema = z.enum(["forecasted", "posted", "closed", "archived"]);
export type GrantOpportunityStatus = z.infer<typeof grantOpportunityStatusSchema>;

export const grantOpportunitySearchSchema = paginationSchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  keyword: z.string().trim().min(1).max(100).optional(),
  agency: z.string().trim().min(1).max(100).optional(),
  opportunityStatus: grantOpportunityStatusSchema.optional(),
  applicantTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  fundingCategories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  sourceType: z.enum(GRANT_SOURCE_TYPES).optional(),
  funderType: z.enum(FUNDER_TYPES).optional(),
  closeFrom: isoDatetimeSchema.optional(),
  closeTo: isoDatetimeSchema.optional(),
});
export type GrantOpportunitySearchParams = z.infer<typeof grantOpportunitySearchSchema>;

export const foundationProspectLookupSchema = paginationSchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().min(1).max(120).optional(),
  ein: z
    .string()
    .trim()
    .regex(/^\d{2}-?\d{7}$/)
    .optional(),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  nteeMajorGroup: z.coerce.number().int().min(1).max(10).optional(),
});
export type FoundationProspectLookupParams = z.infer<typeof foundationProspectLookupSchema>;

export const createGrantOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    sourceType: z.enum(GRANT_SOURCE_TYPES),
    sourceName: z.string().trim().min(1).max(200),
    sourceUrl: httpUrlSchema.optional(),
    funderType: z.enum(FUNDER_TYPES).default("other"),
    deadlineSource: z.enum(GRANT_OPPORTUNITY_DEADLINE_SOURCES).default("manual"),
    externalId: z.string().trim().min(1).max(200).optional(),
    opportunityNumber: z.string().trim().min(1).max(200).optional(),
    status: grantOpportunityStatusSchema.optional(),
    closeDate: nullableDatetimeSchema,
    awardFloorCents: nullablePositiveMoneySchema,
    awardCeilingCents: nullablePositiveMoneySchema,
    eligibleApplicants: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    fundingCategories: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    notes: z.string().trim().min(1).max(5_000).optional(),
  })
  .refine((data) => data.sourceType !== "federal", {
    message: "Use Grants.gov search for federal opportunities.",
    path: ["sourceType"],
  });
export type CreateGrantOpportunityInput = z.input<typeof createGrantOpportunitySchema>;

const savedOpportunitySearchFiltersSchema = grantOpportunitySearchSchema
  .omit({ page: true, pageSize: true })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one search filter is required",
  });

export const createGrantOpportunitySavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: savedOpportunitySearchFiltersSchema,
  emailRemindersEnabled: z.boolean().default(true),
  reminderDaysBeforeDeadline: z.number().int().min(1).max(90).default(14),
});
export type CreateGrantOpportunitySavedSearchInput = z.input<
  typeof createGrantOpportunitySavedSearchSchema
>;

export const updateGrantOpportunitySavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  filters: savedOpportunitySearchFiltersSchema.optional(),
  emailRemindersEnabled: z.boolean().optional(),
  reminderDaysBeforeDeadline: z.number().int().min(1).max(90).optional(),
});
export type UpdateGrantOpportunitySavedSearchInput = z.input<
  typeof updateGrantOpportunitySavedSearchSchema
>;

export const grantOpportunityActionSchema = z.object({
  ownerUserId: idSchema.nullable().optional(),
  notes: nullableOptionalString,
  reminderAt: nullableDatetimeSchema,
});
export type GrantOpportunityActionInput = z.input<typeof grantOpportunityActionSchema>;

export const convertGrantOpportunitySchema = grantOpportunityActionSchema.extend({
  status: z.enum(["discovery", "application"]).default("discovery"),
});
export type ConvertGrantOpportunityInput = z.input<typeof convertGrantOpportunitySchema>;

export const createFunderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a funder name.")
    .max(200, "Funder name must be 200 characters or fewer."),
  type: z.enum(FUNDER_TYPES),
  website: z.url("Enter a valid website URL, including https://").optional(),
  priorities: optionalTrimmedString,
  notes: optionalTrimmedString,
});
export type CreateFunderInput = z.input<typeof createFunderSchema>;

export const updateFunderSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(FUNDER_TYPES).optional(),
  website: z.url().nullable().optional(),
  priorities: nullableOptionalString,
  notes: nullableOptionalString,
});
export type UpdateFunderInput = z.input<typeof updateFunderSchema>;

export const funderListSchema = paginationSchema.extend({
  search: z.string().optional(),
  type: z.enum(FUNDER_TYPES).optional(),
  sortBy: z.enum(["name", "type", "updatedAt", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type FunderListParams = z.infer<typeof funderListSchema>;

export const createFunderContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: optionalTrimmedString,
  email: z.email().optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  notes: optionalTrimmedString,
});
export type CreateFunderContactInput = z.input<typeof createFunderContactSchema>;

export const updateFunderContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: nullableOptionalString,
  email: z.email().nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  notes: nullableOptionalString,
});
export type UpdateFunderContactInput = z.input<typeof updateFunderContactSchema>;

// A grant's period of performance cannot run backwards: when both bounds are
// supplied, the end date must be on or after the start date. (Equal dates are a
// valid one-day grant.) Mirrors the fiscal-period refine in accounting.ts.
const grantDateOrderRefine = (data: {
  startDate?: string | null;
  endDate?: string | null;
}): boolean =>
  !data.startDate || !data.endDate || new Date(data.startDate) <= new Date(data.endDate);
const grantDateOrderRefineOptions = {
  message: "End date must be on or after the start date.",
  path: ["endDate"],
};

// The same ordering rule applies to any reporting period (impact-metric entries,
// payment requests): when both bounds are supplied, periodEnd must be on or after
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

export const createGrantSchema = z
  .object({
    funderId: idSchema,
    name: z.string().trim().min(1).max(200),
    status: z.enum(GRANT_STATUSES).default("discovery"),
    amountCents: positiveMoneySchema.optional(),
    startDate: dateInputSchema.optional(),
    endDate: dateInputSchema.optional(),
    applicationDeadline: dateInputSchema.optional(),
    description: optionalTrimmedString,
    notes: optionalTrimmedString,
  })
  .refine(grantDateOrderRefine, grantDateOrderRefineOptions);
export type CreateGrantInput = z.input<typeof createGrantSchema>;

export const updateGrantSchema = z
  .object({
    funderId: idSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(GRANT_STATUSES).optional(),
    amountCents: nullablePositiveMoneySchema,
    startDate: nullableDateInputSchema,
    endDate: nullableDateInputSchema,
    applicationDeadline: nullableDateInputSchema,
    description: nullableOptionalString,
    notes: nullableOptionalString,
  })
  .refine(grantDateOrderRefine, grantDateOrderRefineOptions);
export type UpdateGrantInput = z.input<typeof updateGrantSchema>;

export const grantListSchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.enum(GRANT_STATUSES).optional(),
  funderId: idSchema.optional(),
  fundId: idSchema.optional(),
  threshold: thresholdSchema.optional(),
  sortBy: z
    .enum(["name", "status", "amountCents", "applicationDeadline", "updatedAt", "createdAt"])
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type GrantListParams = z.infer<typeof grantListSchema>;

export const createFundSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(FUND_TYPES),
  description: optionalTrimmedString,
});
export type CreateFundInput = z.input<typeof createFundSchema>;

export const updateFundSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(FUND_TYPES).optional(),
  description: nullableOptionalString,
});
export type UpdateFundInput = z.input<typeof updateFundSchema>;

export const fundListSchema = paginationSchema.extend({
  search: z.string().optional(),
  type: z.enum(FUND_TYPES).optional(),
  sortBy: z.enum(["name", "type", "balanceCents", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type FundListParams = z.infer<typeof fundListSchema>;

export const createAllocationSchema = z.object({
  fundId: idSchema,
  allocatedAmountCents: positiveMoneySchema,
});
export type CreateAllocationInput = z.input<typeof createAllocationSchema>;

export const updateAllocationSchema = z.object({
  fundId: idSchema.optional(),
  allocatedAmountCents: positiveMoneySchema.optional(),
});
export type UpdateAllocationInput = z.input<typeof updateAllocationSchema>;

const expenseBaseSchema = z.object({
  grantId: idSchema.optional(),
  fundId: idSchema.optional(),
  amountCents: positiveMoneySchema,
  date: isoDatetimeSchema,
  description: optionalTrimmedString,
  category: optionalTrimmedString,
  accountId: idSchema.optional(),
  vendor: optionalTrimmedString,
  reimbursable: z.boolean().optional(),
});

export const createExpenseSchema = expenseBaseSchema.refine(
  (data) => Boolean(data.grantId || data.fundId),
  {
    message: "Expense must reference a grant or fund",
    path: ["grantId"],
  },
);
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const createGrantExpenseSchema = expenseBaseSchema.omit({ grantId: true });
export type CreateGrantExpenseInput = z.input<typeof createGrantExpenseSchema>;

export const updateExpenseSchema = z
  .object({
    grantId: idSchema.nullable().optional(),
    fundId: idSchema.nullable().optional(),
    amountCents: positiveMoneySchema.optional(),
    date: isoDatetimeSchema.optional(),
    description: nullableOptionalString,
    category: nullableOptionalString,
    accountId: idSchema.nullable().optional(),
    vendor: nullableOptionalString,
    reimbursable: z.boolean().optional(),
  })
  .refine((data) => data.grantId !== null || data.fundId !== null, {
    message: "Expense cannot clear both references",
    path: ["grantId"],
  });
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export const createImpactMetricSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetValue: z.union([z.string(), z.number()]).optional(),
  unit: optionalTrimmedString,
});
export type CreateImpactMetricInput = z.input<typeof createImpactMetricSchema>;

export const updateImpactMetricSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  targetValue: z.union([z.string(), z.number()]).nullable().optional(),
  unit: nullableOptionalString,
});
export type UpdateImpactMetricInput = z.input<typeof updateImpactMetricSchema>;

export const createImpactMetricEntrySchema = z
  .object({
    value: z.union([z.string(), z.number()]),
    periodStart: isoDatetimeSchema,
    periodEnd: isoDatetimeSchema,
    notes: optionalTrimmedString,
  })
  .refine(periodDateOrderRefine, periodDateOrderRefineOptions);
export type CreateImpactMetricEntryInput = z.input<typeof createImpactMetricEntrySchema>;

export const updateImpactMetricEntrySchema = z
  .object({
    value: z.union([z.string(), z.number()]).optional(),
    periodStart: isoDatetimeSchema.optional(),
    periodEnd: isoDatetimeSchema.optional(),
    notes: nullableOptionalString,
  })
  .refine(periodDateOrderRefine, periodDateOrderRefineOptions);
export type UpdateImpactMetricEntryInput = z.input<typeof updateImpactMetricEntrySchema>;

export const createReportingRequirementSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  dueDate: isoDatetimeSchema,
  status: z.enum(REPORT_STATUSES).default("upcoming"),
  submittedAt: isoDatetimeSchema.optional(),
  notes: optionalTrimmedString,
});
export type CreateReportingRequirementInput = z.input<typeof createReportingRequirementSchema>;

export const updateReportingRequirementSchema = z.object({
  reportType: z.enum(REPORT_TYPES).optional(),
  dueDate: isoDatetimeSchema.optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  submittedAt: nullableDatetimeSchema,
  notes: nullableOptionalString,
});
export type UpdateReportingRequirementInput = z.input<typeof updateReportingRequirementSchema>;

export const createCloseoutItemSchema = z.object({
  label: z.string().trim().min(1).max(300),
  dueDate: nullableDatetimeSchema,
});
export type CreateCloseoutItemInput = z.input<typeof createCloseoutItemSchema>;

export const updateCloseoutItemSchema = z.object({
  label: z.string().trim().min(1).max(300).optional(),
  completed: z.boolean().optional(),
  dueDate: nullableDatetimeSchema,
});
export type UpdateCloseoutItemInput = z.input<typeof updateCloseoutItemSchema>;

export const grantCloseoutSchema = z.object({
  closeoutDisposition: z.enum(["release", "return"]),
});
export type GrantCloseoutInput = z.infer<typeof grantCloseoutSchema>;
