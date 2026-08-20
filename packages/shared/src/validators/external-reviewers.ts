import { z } from "zod";
import {
  EVIDENCE_BUNDLE_PURPOSES,
  EXTERNAL_REVIEW_SCOPE_TYPES,
  PORTAL_SESSION_DEFAULT_TTL_MS,
  PORTAL_SESSION_MAX_TTL_MS,
  REVIEWER_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();
const nullableString = z.string().trim().optional().nullable();
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

// ---------------------------------------------------------------------------
// External Reviewers
// ---------------------------------------------------------------------------

export const createReviewerSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(255),
  reviewerType: z.enum(REVIEWER_TYPES),
  organizationName: optionalTrimmedString,
  notes: nullableString,
});
export type CreateReviewerInput = z.infer<typeof createReviewerSchema>;

export const updateReviewerSchema = createReviewerSchema.partial();
export type UpdateReviewerInput = z.infer<typeof updateReviewerSchema>;

export const listReviewersSchema = paginationSchema.extend({
  reviewerType: z.enum(REVIEWER_TYPES).optional(),
  search: optionalTrimmedString,
});
export type ListReviewersInput = z.infer<typeof listReviewersSchema>;

// ---------------------------------------------------------------------------
// External Review Sessions
// ---------------------------------------------------------------------------

export const createSessionSchema = z
  .object({
    reviewerId: idSchema,
    purpose: z.string().trim().min(1).max(255),
    /** Duration in milliseconds from now. Defaults to PORTAL_SESSION_DEFAULT_TTL_MS. */
    ttlMs: z
      .number()
      .int()
      .positive()
      .max(PORTAL_SESSION_MAX_TTL_MS)
      .default(PORTAL_SESSION_DEFAULT_TTL_MS),
    /** Initial scope items to grant immediately on session creation */
    scopes: z
      .array(
        z.object({
          scopeType: z.enum(EXTERNAL_REVIEW_SCOPE_TYPES),
          scopeId: idSchema,
        }),
      )
      .max(100)
      .default([]),
  })
  .strict();
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const extendSessionSchema = z.object({
  /** Additional milliseconds to add to the current expiry */
  extensionMs: z.number().int().positive().max(PORTAL_SESSION_MAX_TTL_MS),
});
export type ExtendSessionInput = z.infer<typeof extendSessionSchema>;

export const listSessionsSchema = paginationSchema.extend({
  reviewerId: optionalTrimmedString,
  includeExpired: queryBooleanSchema.default(false),
  includeRevoked: queryBooleanSchema.default(false),
});
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

// ---------------------------------------------------------------------------
// External Review Scopes
// ---------------------------------------------------------------------------

export const addScopeSchema = z.object({
  scopeType: z.enum(EXTERNAL_REVIEW_SCOPE_TYPES),
  scopeId: idSchema,
});
export type AddScopeInput = z.infer<typeof addScopeSchema>;

export const addScopesSchema = z.object({
  scopes: z.array(addScopeSchema).min(1).max(100),
});
export type AddScopesInput = z.infer<typeof addScopesSchema>;

export const removeScopeSchema = z.object({
  scopeType: z.enum(EXTERNAL_REVIEW_SCOPE_TYPES),
  scopeId: idSchema,
});
export type RemoveScopeInput = z.infer<typeof removeScopeSchema>;

// ---------------------------------------------------------------------------
// Evidence Bundles
// ---------------------------------------------------------------------------

// The bundle period dates are written straight into the evidence bundle on
// create/update, so guard the order here — otherwise an accepted bundle could
// persist a backwards reporting period. Neither field is exposed by a web form
// today, so the schema is the correct (and only) defense.
const bundlePeriodOrderRefinement = (
  data: { periodStart?: string; periodEnd?: string },
  ctx: z.RefinementCtx,
) => {
  if (
    data.periodStart &&
    data.periodEnd &&
    Date.parse(data.periodStart) > Date.parse(data.periodEnd)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Period end must be on or after the period start.",
      path: ["periodEnd"],
    });
  }
};

const bundleFields = {
  title: z.string().trim().min(1).max(255),
  description: optionalTrimmedString,
  purpose: z.enum(EVIDENCE_BUNDLE_PURPOSES),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
};

export const createBundleSchema = z.object(bundleFields).superRefine(bundlePeriodOrderRefinement);
export type CreateBundleInput = z.infer<typeof createBundleSchema>;

export const updateBundleSchema = z
  .object(bundleFields)
  .partial()
  .superRefine(bundlePeriodOrderRefinement);
export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;

export const listBundlesSchema = paginationSchema.extend({
  purpose: z.enum(EVIDENCE_BUNDLE_PURPOSES).optional(),
  includeDeleted: queryBooleanSchema.default(false),
});
export type ListBundlesInput = z.infer<typeof listBundlesSchema>;

export const addBundleItemSchema = z.object({
  itemType: z.enum(EXTERNAL_REVIEW_SCOPE_TYPES),
  itemId: idSchema,
  caption: optionalTrimmedString,
  sortOrder: z.number().int().min(0).default(0),
});
export type AddBundleItemInput = z.infer<typeof addBundleItemSchema>;

export const reorderBundleItemsSchema = z.object({
  /** Array of item IDs in the desired order */
  itemIds: z.array(idSchema).min(1).max(1000),
});
export type ReorderBundleItemsInput = z.infer<typeof reorderBundleItemsSchema>;

// ---------------------------------------------------------------------------
// Audit Events
// ---------------------------------------------------------------------------

export const listAuditEventsSchema = paginationSchema
  .extend({
    sessionId: optionalTrimmedString,
    reviewerId: optionalTrimmedString,
    eventType: z.string().trim().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
  })
  .refine((q) => !q.fromDate || !q.toDate || Date.parse(q.fromDate) <= Date.parse(q.toDate), {
    message: "fromDate must be before or equal to toDate",
    path: ["fromDate"],
  });
export type ListAuditEventsInput = z.infer<typeof listAuditEventsSchema>;

// ---------------------------------------------------------------------------
// Portal auth (public routes)
// ---------------------------------------------------------------------------

export const portalAuthSchema = z.object({
  token: z.string().trim().min(1),
});
export type PortalAuthInput = z.infer<typeof portalAuthSchema>;

// ---------------------------------------------------------------------------
// Quick-share helper (create bundle + session in one shot from entity detail)
// ---------------------------------------------------------------------------

export const quickShareSchema = z
  .object({
    reviewerId: idSchema,
    purpose: z.string().trim().min(1).max(255),
    ttlMs: z
      .number()
      .int()
      .positive()
      .max(PORTAL_SESSION_MAX_TTL_MS)
      .default(PORTAL_SESSION_DEFAULT_TTL_MS),
    /** The entity being shared */
    scopeType: z.enum(EXTERNAL_REVIEW_SCOPE_TYPES),
    scopeId: idSchema,
    /** Bundle to attach this session to (optional — creates new bundle if absent) */
    bundleId: idSchema.optional(),
    bundleTitle: optionalTrimmedString,
  })
  .strict();
export type QuickShareInput = z.infer<typeof quickShareSchema>;
