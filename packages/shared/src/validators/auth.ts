import { z } from "zod";
import { BILLING_CYCLES } from "../constants";
import { SELF_SERVE_PLAN_TIERS } from "../pricing";
import { FEATURE_AREAS, PERMISSION_LEVELS, ROLES } from "../types";

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Invalid email address").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(320),
  password: z.string().min(1, "Password is required").max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const ONBOARDING_GOALS = ["donors", "grants", "compliance"] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];
export const onboardingGoalSchema = z.enum(ONBOARDING_GOALS);

export const onboardingSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required").max(200),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: z.string().trim().min(1, "Timezone is required"),
  onboardingGoal: onboardingGoalSchema.optional(),
  planTier: z.enum(SELF_SERVE_PLAN_TIERS).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const permissionOverridesSchema = z
  .object(
    Object.fromEntries(
      FEATURE_AREAS.map((feature) => [feature, z.enum(PERMISSION_LEVELS).optional()]),
    ),
  )
  .partial();

export const createInviteSchema = z
  .object({
    mode: z.enum(["email", "shareable"]).default("shareable"),
    email: z.string().trim().email("Invalid email address").optional(),
    role: z.enum(ROLES).default("viewer"),
    permissions: permissionOverridesSchema.optional(),
    entityId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "email" && !value.email) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Email is required for email invites",
      });
    }
  });
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
