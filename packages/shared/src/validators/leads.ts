import { z } from "zod";
import { LEAD_MAGNET_SLUGS } from "../constants/lead-magnets";

export const leadSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(320),
  firstName: z.string().trim().max(200).optional(),
  magnetSlug: z.enum(LEAD_MAGNET_SLUGS).optional(),
  sourcePage: z.string().trim().max(500).optional(),
  resendDelivery: z.boolean().default(false),
  utm: z
    .object({
      utmSource: z.string().trim().max(200).optional(),
      utmMedium: z.string().trim().max(200).optional(),
      utmCampaign: z.string().trim().max(200).optional(),
      referredBy: z.string().trim().max(200).optional(),
    })
    .optional(),
  companyWebsite: z.string().max(200).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

export type LeadSignupInput = z.infer<typeof leadSignupSchema>;
export type LeadSignupInputRaw = z.input<typeof leadSignupSchema>;
export const leadSignupAcceptedResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const LEAD_SIGNUP_ACCEPTED_RESPONSE = { ok: true } as const;
export type LeadSignupAcceptedResponse = z.infer<typeof leadSignupAcceptedResponseSchema>;
export type LeadDeliveryState =
  | "queued"
  | "in_progress"
  | "ambiguous"
  | "sent"
  | "unsubscribed"
  | "resend_unavailable";

export const leadUnsubscribeSchema = z.object({
  token: z.string().min(1, "Token is required").max(1024),
});

export type LeadUnsubscribeInput = z.infer<typeof leadUnsubscribeSchema>;
