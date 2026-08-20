import { z } from "zod";
import {
  RESTRICTION_ALERT_TYPES,
  RESTRICTION_EVIDENCE_TYPES,
  RESTRICTION_LIFECYCLE_TYPES,
  RESTRICTION_SOURCES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const optionalIdSchema = idSchema.optional();
const isoDatetimeSchema = z.string().datetime();
const positiveMoneySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nullableTrimmedString = z.string().trim().min(1).nullable().optional();
const optionalTrimmedString = z.string().trim().min(1).optional();

function validateDateRange(data: { periodStart: string; periodEnd: string }, ctx: z.RefinementCtx) {
  if (new Date(data.periodStart).getTime() > new Date(data.periodEnd).getTime()) {
    ctx.addIssue({
      code: "custom",
      message: "Period start must be before or equal to period end",
      path: ["periodStart"],
    });
  }
}

function validateTermRequirements(
  data: {
    restrictionType?: string;
    purposeStatement?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
    ctx.addIssue({
      code: "custom",
      message: "End date must be on or after the start date.",
      path: ["endDate"],
    });
  }

  if (
    (data.restrictionType === "purpose" || data.restrictionType === "purpose_and_time") &&
    !data.purposeStatement?.trim()
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Purpose restrictions require a purpose statement",
      path: ["purposeStatement"],
    });
  }

  if (
    (data.restrictionType === "time" || data.restrictionType === "purpose_and_time") &&
    !data.endDate
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Time restrictions require an end date",
      path: ["endDate"],
    });
  }
}

export const restrictionTermListSchema = paginationSchema.extend({
  fundId: optionalIdSchema,
  grantId: optionalIdSchema,
  donationId: optionalIdSchema,
  sourceDocumentId: optionalIdSchema,
  restrictionType: z.enum(RESTRICTION_LIFECYCLE_TYPES).optional(),
});
export type RestrictionTermListParams = z.infer<typeof restrictionTermListSchema>;

const restrictionTermBaseSchema = z.object({
  fundId: optionalIdSchema,
  grantId: optionalIdSchema,
  donationId: optionalIdSchema,
  sourceDocumentId: optionalIdSchema,
  restrictionType: z.enum(RESTRICTION_LIFECYCLE_TYPES),
  source: z.enum(RESTRICTION_SOURCES),
  title: z.string().trim().min(1).max(200),
  purposeStatement: optionalTrimmedString,
  releaseRule: optionalTrimmedString,
  startDate: isoDatetimeSchema.optional(),
  endDate: isoDatetimeSchema.optional(),
  beginningBalanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  currency: z.string().trim().length(3).default("USD"),
  evidenceRequirement: optionalTrimmedString,
  allowedPrograms: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  allowedCategories: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(120),
        accountId: optionalIdSchema,
      }),
    )
    .max(50)
    .optional(),
});

export const createRestrictionTermSchema = restrictionTermBaseSchema.superRefine((data, ctx) => {
  if (!data.fundId && !data.grantId && !data.donationId && !data.sourceDocumentId) {
    ctx.addIssue({
      code: "custom",
      message: "Restriction terms must reference a fund, grant, donation, or source document",
      path: ["fundId"],
    });
  }
  validateTermRequirements(data, ctx);
});
export type CreateRestrictionTermInput = z.input<typeof createRestrictionTermSchema>;

export const updateRestrictionTermSchema = restrictionTermBaseSchema
  .partial()
  .superRefine(validateTermRequirements);
export type UpdateRestrictionTermInput = z.input<typeof updateRestrictionTermSchema>;

export const deleteRestrictionTermSchema = z.object({ termId: idSchema });
export type DeleteRestrictionTermInput = z.infer<typeof deleteRestrictionTermSchema>;

export const createRestrictionAdditionSchema = z.object({
  donationId: optionalIdSchema,
  grantId: optionalIdSchema,
  journalLineId: optionalIdSchema,
  amountCents: positiveMoneySchema,
  date: isoDatetimeSchema,
  description: optionalTrimmedString,
});
export type CreateRestrictionAdditionInput = z.input<typeof createRestrictionAdditionSchema>;

export const deleteRestrictionAdditionSchema = z.object({ additionId: idSchema });
export type DeleteRestrictionAdditionInput = z.infer<typeof deleteRestrictionAdditionSchema>;

export const createRestrictionReleaseSchema = z.object({
  expenseId: optionalIdSchema,
  journalLineId: optionalIdSchema,
  amountCents: positiveMoneySchema,
  date: isoDatetimeSchema,
  reason: z.string().trim().min(1).max(500),
  program: optionalTrimmedString,
  category: optionalTrimmedString,
  accountId: optionalIdSchema,
});
export type CreateRestrictionReleaseInput = z.input<typeof createRestrictionReleaseSchema>;

export const deleteRestrictionReleaseSchema = z.object({ releaseId: idSchema });
export type DeleteRestrictionReleaseInput = z.infer<typeof deleteRestrictionReleaseSchema>;

export const createRestrictionEvidenceLinkSchema = z
  .object({
    documentId: optionalIdSchema,
    generatedReportId: optionalIdSchema,
    label: z.string().trim().min(1).max(200),
    evidenceType: z.enum(RESTRICTION_EVIDENCE_TYPES),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.documentId) === Boolean(data.generatedReportId)) {
      ctx.addIssue({
        code: "custom",
        message: "Evidence links require exactly one document or generated report target",
        path: ["documentId"],
      });
    }
  });
export type CreateRestrictionEvidenceLinkInput = z.input<
  typeof createRestrictionEvidenceLinkSchema
>;

export const deleteRestrictionEvidenceLinkSchema = z.object({ evidenceLinkId: idSchema });
export type DeleteRestrictionEvidenceLinkInput = z.infer<
  typeof deleteRestrictionEvidenceLinkSchema
>;

export const restrictionAlertFilterSchema = z
  .object({
    fundId: optionalIdSchema,
    grantId: optionalIdSchema,
    alertType: z.enum(RESTRICTION_ALERT_TYPES).optional(),
    periodStart: isoDatetimeSchema.optional(),
    periodEnd: isoDatetimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.periodStart && data.periodEnd) {
      validateDateRange({ periodStart: data.periodStart, periodEnd: data.periodEnd }, ctx);
    }
  });
export type RestrictionAlertFilterParams = z.infer<typeof restrictionAlertFilterSchema>;

export const restrictionBalanceSnapshotSchema = z
  .object({
    restrictionTermId: idSchema,
    fundId: optionalIdSchema,
    grantId: optionalIdSchema,
    periodStart: isoDatetimeSchema,
    periodEnd: isoDatetimeSchema,
    beginningBalanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    additionsCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    releasesCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    endingBalanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    generatedReportId: optionalIdSchema,
    source: z.enum(["manual_import", "rollforward_generation", "period_close"]),
  })
  .superRefine(validateDateRange);
export type RestrictionBalanceSnapshotInput = z.input<typeof restrictionBalanceSnapshotSchema>;

export const restrictedRollforwardFilterSchema = z
  .object({
    fundId: optionalIdSchema,
    grantId: optionalIdSchema,
    periodStart: isoDatetimeSchema,
    periodEnd: isoDatetimeSchema,
  })
  .superRefine(validateDateRange);
export type RestrictedRollforwardFilterParams = z.infer<typeof restrictedRollforwardFilterSchema>;

export const restrictedRollforwardExportSchema = restrictedRollforwardFilterSchema.extend({
  attemptId: z.uuid(),
  includeEvidencePackage: z.boolean().default(false),
  title: nullableTrimmedString,
});
export type RestrictedRollforwardExportInput = z.input<typeof restrictedRollforwardExportSchema>;
