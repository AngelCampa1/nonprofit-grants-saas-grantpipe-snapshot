import { z } from "zod";

const idSchema = z.string().trim().min(1);
const trimmedString = z.string().trim().min(1);
const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValueSchema: z.ZodType = z.lazy(() =>
  z.union([jsonScalarSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const DOCUMENT_EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "provider_result_pending",
  "ready_for_review",
  "committing",
  "committed",
  "failed",
  "canceled",
] as const;
export type DocumentExtractionStatus = (typeof DOCUMENT_EXTRACTION_STATUSES)[number];

export const DOCUMENT_EXTRACTION_REVIEW_ACTIONS = [
  "accept",
  "edit",
  "reject",
  "defer",
  "map_existing",
] as const;
export type DocumentExtractionReviewAction = (typeof DOCUMENT_EXTRACTION_REVIEW_ACTIONS)[number];

export const documentExtractionSourceSchema = z.object({
  pageNumber: z.number().int().positive().optional(),
  snippet: trimmedString.max(1_000),
  boundingBox: z.record(z.string(), z.number()).optional(),
  sourceOffsetStart: z.number().int().min(0).optional(),
  sourceOffsetEnd: z.number().int().min(0).optional(),
});
export type DocumentExtractionSource = z.infer<typeof documentExtractionSourceSchema>;

export const documentExtractionFieldSchema = z.object({
  fieldKey: trimmedString.max(160),
  section: z.enum([
    "funder",
    "contacts",
    "grant_basics",
    "budget",
    "reporting",
    "restrictions",
    "special_conditions",
    "matching",
    "closeout",
    "evidence",
  ]),
  destinationEntityType: z.enum([
    "funder",
    "funder_contact",
    "grant",
    "fund",
    "allocation",
    "budget_line",
    "reporting_requirement",
    "restriction_term",
    "closeout_item",
    "document",
  ]),
  destinationField: trimmedString.max(160),
  value: jsonValueSchema,
  normalizedValue: jsonValueSchema.optional(),
  confidence: z.number().min(0).max(1),
  required: z.boolean().default(false),
  sources: z.array(documentExtractionSourceSchema).min(1),
});
export type DocumentExtractionField = z.input<typeof documentExtractionFieldSchema>;

const duplicateCandidateSchema = z.object({
  id: idSchema,
  name: trimmedString.max(240),
  confidence: z.number().min(0).max(1),
});

export const documentExtractionProviderResponseSchema = z.object({
  documentType: z.enum(["award_letter", "notice_of_award", "grant_agreement", "other"]),
  fields: z.array(documentExtractionFieldSchema).min(1),
  duplicateCandidates: z
    .object({
      funders: z.array(duplicateCandidateSchema).default([]),
      grants: z.array(duplicateCandidateSchema).default([]),
    })
    .default({ funders: [], grants: [] }),
});
export type DocumentExtractionProviderResponse = z.infer<
  typeof documentExtractionProviderResponseSchema
>;

export const documentExtractionStartSchema = z.object({
  documentId: idSchema,
  attemptId: z.string().uuid(),
});
export type DocumentExtractionStartInput = z.infer<typeof documentExtractionStartSchema>;

export const documentExtractionReviewActionSchema = z
  .object({
    fieldId: idSchema,
    action: z.enum(DOCUMENT_EXTRACTION_REVIEW_ACTIONS),
    nextValue: jsonValueSchema.optional(),
    mappedEntityType: trimmedString.max(120).optional(),
    mappedEntityId: idSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "edit" && data.nextValue === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextValue"],
        message: "Edited extraction fields require a replacement value",
      });
    }
    if (data.action === "map_existing" && (!data.mappedEntityType || !data.mappedEntityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mappedEntityId"],
        message: "Mapping requires an existing entity type and id",
      });
    }
  });
export type DocumentExtractionReviewActionInput = z.infer<
  typeof documentExtractionReviewActionSchema
>;

const duplicateDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_new") }),
  z.object({ action: z.literal("map_existing"), existingId: idSchema }),
]);

export const documentExtractionCommitSchema = z
  .object({
    funderDecision: duplicateDecisionSchema,
    grantDecision: duplicateDecisionSchema,
    requiredGrantBasics: z.object({
      name: trimmedString.max(200),
      amountCents: z.number().int().positive().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  })
  .superRefine((data, ctx) => {
    // The extracted grant dates are inserted directly into the grant on commit,
    // bypassing createGrantSchema's own start<=end refine. Guard the order here
    // so an accepted extraction can never persist a backwards grant period.
    const { startDate, endDate } = data.requiredGrantBasics;
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      ctx.addIssue({
        code: "custom",
        message: "End date must be on or after the start date.",
        path: ["requiredGrantBasics", "endDate"],
      });
    }
  });
export type DocumentExtractionCommitInput = z.infer<typeof documentExtractionCommitSchema>;
