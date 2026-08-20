import { z } from "zod";
import { BILLING_CYCLES, PLAN_TIERS } from "../constants";
import { DEFAULT_BILLING_CYCLE, SELF_SERVE_PLAN_TIERS } from "../pricing";
import {
  ENTITY_FEATURE_AREAS,
  ENTITY_KINDS,
  ENTITY_ROLES,
  ENTITY_STATUSES,
  FISCAL_SPONSOR_MODELS,
  PERMISSION_LEVELS,
  ROLES,
} from "../types";
import { createInviteSchema, permissionOverridesSchema } from "./auth";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const trimmedString = z.string().trim().min(1);
const nullableTrimmedString = z.string().trim().min(1).nullable();
const optionalNullableIdSchema = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const updateNullableIdSchema = z.string().trim().min(1).nullable().optional();

const entityPermissionOverridesSchema = z
  .object(
    Object.fromEntries(
      ENTITY_FEATURE_AREAS.map((feature) => [feature, z.enum(PERMISSION_LEVELS).optional()]),
    ),
  )
  .strict()
  .partial();

const entityBaseShape = {
  name: trimmedString.max(200),
  kind: z.enum(ENTITY_KINDS).default("legal_entity"),
  fiscalSponsorModel: z.enum(FISCAL_SPONSOR_MODELS).default("none"),
  parentEntityId: optionalNullableIdSchema,
};

const updateEntityShape = {
  name: trimmedString.max(200).optional(),
  kind: z.enum(ENTITY_KINDS).optional(),
  fiscalSponsorModel: z.enum(FISCAL_SPONSOR_MODELS).optional(),
  parentEntityId: updateNullableIdSchema,
  status: z.enum(ENTITY_STATUSES).optional(),
};

function validateFiscalSponsorModel(
  value: { kind?: string; fiscalSponsorModel?: string },
  context: z.RefinementCtx,
) {
  if (
    value.fiscalSponsorModel !== undefined &&
    value.fiscalSponsorModel !== "none" &&
    value.kind !== "sponsored_project"
  ) {
    context.addIssue({
      code: "custom",
      path: ["fiscalSponsorModel"],
      message: "Fiscal sponsor models only apply to sponsored project entities",
    });
  }
}

function validateEntityUpdate(
  value: { kind?: string; fiscalSponsorModel?: string },
  context: z.RefinementCtx,
) {
  validateFiscalSponsorModel(value, context);
  if (
    value.kind !== undefined &&
    value.kind !== "sponsored_project" &&
    value.fiscalSponsorModel === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["fiscalSponsorModel"],
      message: "Set fiscalSponsorModel to none when changing away from a sponsored project",
    });
  }
}

export const createEntitySchema = z.object(entityBaseShape).superRefine(validateFiscalSponsorModel);
export type CreateEntityInput = z.input<typeof createEntitySchema>;
export type CreateEntityParams = z.output<typeof createEntitySchema>;

export const updateEntitySchema = z.object(updateEntityShape).superRefine(validateEntityUpdate);
export type UpdateEntityInput = z.input<typeof updateEntitySchema>;
export type UpdateEntityParams = z.output<typeof updateEntitySchema>;

export const entityListQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});
export type EntityListQueryParams = z.output<typeof entityListQuerySchema>;

export const entityAccessSchema = z.object({
  entityId: idSchema,
  role: z.enum(ENTITY_ROLES),
  permissions: entityPermissionOverridesSchema.optional(),
});
export type EntityAccessInput = z.input<typeof entityAccessSchema>;
export type EntityAccessParams = z.output<typeof entityAccessSchema>;

export const updateEntityAccessSchema = z
  .object({
    role: z.enum(ENTITY_ROLES).optional(),
    permissions: entityPermissionOverridesSchema.optional(),
  })
  .refine((value) => value.role !== undefined || value.permissions !== undefined, {
    message: "At least one entity access field is required",
  });
export type UpdateEntityAccessInput = z.input<typeof updateEntityAccessSchema>;
export type UpdateEntityAccessParams = z.output<typeof updateEntityAccessSchema>;

export const orgProfileSchema = z.object({
  id: idSchema,
  name: trimmedString.max(200),
  slug: trimmedString.max(200),
  ein: nullableTrimmedString,
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: trimmedString.max(120),
  logoUrl: nullableTrimmedString,
  address: nullableTrimmedString,
  planTier: z.enum(PLAN_TIERS),
  onboardingCompleted: z.boolean(),
  accountingEnabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OrgProfile = z.infer<typeof orgProfileSchema>;

export const updateOrgProfileSchema = z.object({
  name: trimmedString.max(200),
  ein: z.string().trim().max(20).nullable().optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: trimmedString.max(120),
  logoUrl: z.string().trim().url().nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
});
export type UpdateOrgProfileInput = z.input<typeof updateOrgProfileSchema>;

export const orgTeamListSchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});
export type OrgTeamListParams = z.output<typeof orgTeamListSchema>;

export const updateOrgMemberSchema = z.object({
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  permissions: permissionOverridesSchema.optional(),
});
export type UpdateOrgMemberInput = z.input<typeof updateOrgMemberSchema>;

export const promoCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "Promo code may only contain letters, numbers, dashes, underscores, and dots",
  )
  .transform((value) => value.toUpperCase());

export const billingCheckoutSchema = z.object({
  planTier: z.enum(SELF_SERVE_PLAN_TIERS),
  billingCycle: z.enum(BILLING_CYCLES).default(DEFAULT_BILLING_CYCLE),
  promoCode: promoCodeSchema.optional(),
  surface: z.enum(["settings", "paywall", "feature_gate"]).default("settings"),
  checkoutAttemptId: z.uuid(),
});
export type BillingCheckoutInput = z.input<typeof billingCheckoutSchema>;
export type BillingCheckoutParams = z.output<typeof billingCheckoutSchema>;

export const billingSelectionSchema = z
  .object({
    planTier: z.enum(SELF_SERVE_PLAN_TIERS),
    billingCycle: z.enum(BILLING_CYCLES).default(DEFAULT_BILLING_CYCLE),
  })
  .strict();
export type BillingSelectionInput = z.input<typeof billingSelectionSchema>;
export type BillingSelectionParams = z.output<typeof billingSelectionSchema>;

// Alias used by the Stripe-backed trial checkout route in apps/api.
// Shape is identical to billingCheckoutSchema today; kept as a dedicated
// export so the trial-checkout contract can diverge later without touching
// the legacy mock-billing flow.
export const createTrialCheckoutSchema = billingCheckoutSchema;
export type CreateTrialCheckoutInput = z.input<typeof createTrialCheckoutSchema>;
export type CreateTrialCheckoutParams = z.output<typeof createTrialCheckoutSchema>;

export const billingPortalSchema = z.object({
  returnPath: z.string().trim().min(1).default("/settings"),
});
export type BillingPortalInput = z.output<typeof billingPortalSchema>;

export const debugInspectionListSchema = paginationSchema.extend({
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type DebugInspectionListParams = z.output<typeof debugInspectionListSchema>;

export { createInviteSchema };

export const updateOrgSettingsSchema = z.object({
  accountingEnabled: z.boolean().optional(),
});
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
