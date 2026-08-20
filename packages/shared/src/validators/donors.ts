import { z } from "zod";
import {
  DONOR_PIPELINE_STAGES,
  CONTACT_TYPES,
  DONATION_TYPES,
  RESTRICTION_TYPES,
  COMMUNICATION_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

// ---------------------------------------------------------------------------
// Contact schemas
// ---------------------------------------------------------------------------

function normalizeOptionalString(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const optionalTrimmedString = (max: number) =>
  z.preprocess(normalizeOptionalString, z.string().max(max).optional()).optional();

const optionalEmailSchema = z
  .preprocess(normalizeOptionalString, z.string().email("Enter a valid email address.").optional())
  .optional();

const contactBaseSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  firstName: optionalTrimmedString(200),
  lastName: optionalTrimmedString(200),
  organizationName: optionalTrimmedString(200),
  email: optionalEmailSchema,
  emailOptOut: z.boolean().default(false),
  phone: optionalTrimmedString(50),
  address: optionalTrimmedString(500),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).default("prospect"),
  isVolunteer: z.boolean().default(false),
  affiliatedOrgId: z.uuid().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

export const createContactSchema = contactBaseSchema.superRefine((data, ctx) => {
  if (data.type === "individual" && !data.firstName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "First name is required.",
      path: ["firstName"],
    });
  }
  if (data.type === "organization" && !data.organizationName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Organization name is required.",
      path: ["organizationName"],
    });
  }
});
export type CreateContactInput = Omit<
  z.infer<typeof createContactSchema>,
  "emailOptOut" | "isVolunteer"
> & {
  emailOptOut?: boolean;
  isVolunteer?: boolean;
};

export const updateContactSchema = z.object({
  type: z.enum(CONTACT_TYPES).optional(),
  firstName: optionalTrimmedString(200),
  lastName: optionalTrimmedString(200),
  organizationName: optionalTrimmedString(200),
  email: z
    .preprocess(
      (v) => (v == null || v === "" ? null : typeof v === "string" ? v.trim() : v),
      z.string().email("Enter a valid email address.").nullable().optional(),
    )
    .optional(),
  phone: optionalTrimmedString(50),
  address: optionalTrimmedString(500),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  isVolunteer: z.boolean().optional(),
  emailOptOut: z.boolean().optional(),
  affiliatedOrgId: z.uuid().nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const updatePipelineStageSchema = z.object({
  stage: z.enum(DONOR_PIPELINE_STAGES),
});
export type UpdatePipelineStageInput = z.infer<typeof updatePipelineStageSchema>;

export const contactListSchema = paginationSchema.extend({
  search: z.string().optional(),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  tagId: z.string().uuid().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  sortBy: z.enum(["name", "createdAt", "lastDonationDate", "totalGiving"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ContactListParams = z.infer<typeof contactListSchema>;

// ---------------------------------------------------------------------------
// Donation schemas
// ---------------------------------------------------------------------------

// Route-level classify-restriction input (resolves fundId/grantId server-side).
export const classifyRestrictionRequestSchema = z.object({
  fundId: z.uuid().optional(),
  grantId: z.uuid().optional(),
  designation: z.string().max(1_000).nullable().optional(),
  date: z.string().nullable().optional(),
});
export type ClassifyRestrictionRequest = z.infer<typeof classifyRestrictionRequestSchema>;

// Accepted classifier output embedded in a create-donation request.
// When present with a restricted classification and a linked fund/grant/donation,
// the API service will auto-create a restriction term + addition via the existing
// restrictions service.
export const acceptedClassificationSchema = z.object({
  restrictionType: z.enum([
    "purpose",
    "time",
    "purpose_and_time",
    "board_designated",
    "unrestricted",
  ]),
  title: z.string().min(1).max(200),
  releaseRule: z.string().max(500).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});
export type AcceptedClassificationInput = z.infer<typeof acceptedClassificationSchema>;

export const createDonationSchema = z
  .object({
    amountCents: z.number().int().positive("Amount must be positive"),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
    date: z.string().datetime(),
    type: z.enum(DONATION_TYPES),
    restriction: z.enum(RESTRICTION_TYPES).default("unrestricted"),
    fundId: z.string().uuid().optional(),
    grantId: z.string().uuid().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().max(10_000).optional(),
    designation: z.string().max(1_000).nullable().optional(),
    goodsServicesValueCents: z.number().int().nonnegative().optional(),
    goodsServicesDescription: z.string().trim().max(1_000).nullable().optional(),
    // Optional: when the user accepts a classifier suggestion, pass this to
    // auto-create a restriction term + addition linked to the donation.
    acceptedClassification: acceptedClassificationSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.goodsServicesValueCents !== undefined &&
      data.goodsServicesValueCents > data.amountCents
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goods and services value cannot exceed the donation amount.",
        path: ["goodsServicesValueCents"],
      });
    }
  });
export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const updateDonationSchema = z
  .object({
    amountCents: z.number().int().positive().optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/)
      .optional(),
    date: z.string().datetime().optional(),
    type: z.enum(DONATION_TYPES).optional(),
    restriction: z.enum(RESTRICTION_TYPES).optional(),
    fundId: z.string().uuid().nullable().optional(),
    grantId: z.string().uuid().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    notes: z.string().max(10_000).nullable().optional(),
    designation: z.string().max(1_000).nullable().optional(),
    goodsServicesValueCents: z.number().int().nonnegative().optional(),
    goodsServicesDescription: z.string().trim().max(1_000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.amountCents !== undefined &&
      data.goodsServicesValueCents !== undefined &&
      data.goodsServicesValueCents > data.amountCents
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goods and services value cannot exceed the donation amount.",
        path: ["goodsServicesValueCents"],
      });
    }
  });
export type UpdateDonationInput = z.infer<typeof updateDonationSchema>;

// ---------------------------------------------------------------------------
// Tag schemas
// ---------------------------------------------------------------------------

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color like #e07a5f")
    .optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const addTagsSchema = z.object({
  tagIds: z.array(z.uuid()).min(1, "At least one tag is required"),
});
export type AddTagsInput = z.infer<typeof addTagsSchema>;

// ---------------------------------------------------------------------------
// Communication schemas
// ---------------------------------------------------------------------------

export const createCommunicationSchema = z
  .object({
    type: z.enum(COMMUNICATION_TYPES),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().max(50_000).optional(),
  })
  .refine((data) => data.subject || data.body, {
    message: "Either subject or body is required",
    path: ["subject"],
  });
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

const mailMergeTokenSchema = z.enum([
  "firstName",
  "lastName",
  "fullName",
  "organizationName",
  "email",
]);

export const donorMailMergeSendSchema = z
  .object({
    attemptId: z.uuid(),
    contactIds: z
      .array(z.uuid())
      .min(1, "Choose at least one donor.")
      .max(250, "Send to 250 donors or fewer at a time."),
    subject: z.string().trim().min(1, "Subject is required.").max(120),
    body: z.string().trim().min(1, "Message is required.").max(20_000),
  })
  .superRefine((data, ctx) => {
    const tokenPattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    const supportedTokens = new Set<string>(mailMergeTokenSchema.options);
    for (const match of data.subject.matchAll(tokenPattern)) {
      if (!supportedTokens.has(match[1]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported merge token: ${match[1]}.`,
          path: ["subject"],
        });
      }
    }
    for (const match of data.body.matchAll(tokenPattern)) {
      if (!supportedTokens.has(match[1]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported merge token: ${match[1]}.`,
          path: ["body"],
        });
      }
    }
  });
export type DonorMailMergeSendInput = z.infer<typeof donorMailMergeSendSchema>;

export const donorMailMergeRecipientStatusSchema = z.enum([
  "sent",
  "skipped_missing_email",
  "skipped_unsubscribed",
  "failed",
]);
export type DonorMailMergeRecipientStatus = z.infer<typeof donorMailMergeRecipientStatusSchema>;

export const donorMailMergeSendResultSchema = z.object({
  requested: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  recipients: z.array(
    z.object({
      contactId: z.uuid(),
      email: z.string().email().nullable(),
      name: z.string(),
      status: donorMailMergeRecipientStatusSchema,
      error: z.string().optional(),
    }),
  ),
});
export type DonorMailMergeSendResult = z.infer<typeof donorMailMergeSendResultSchema>;

// ---------------------------------------------------------------------------
// Segment schemas
// ---------------------------------------------------------------------------

const segmentFiltersSchema = z.object({
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  tagId: z.string().uuid().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  search: z.string().optional(),
});

export const createSegmentSchema = z.object({
  name: z.string().trim().min(1, "Segment name is required").max(200),
  filters: segmentFiltersSchema,
});
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

export const updateSegmentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  filters: segmentFiltersSchema.optional(),
});
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;

// ---------------------------------------------------------------------------
// Export schema
// ---------------------------------------------------------------------------

export const contactExportSchema = z.object({
  search: z.string().optional(),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  tagId: z.string().uuid().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
});
export type ContactExportParams = z.infer<typeof contactExportSchema>;
