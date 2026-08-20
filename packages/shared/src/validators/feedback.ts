import { z } from "zod";

export const submitFeedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Feedback cannot be empty")
    .max(5000, "Feedback must be 5000 characters or fewer"),
  category: z.enum(["bug", "idea", "question", "other"]).default("other"),
  reporterEmail: z.string().trim().toLowerCase().email("Invalid email address").max(320).optional(),
  reporterName: z.string().trim().max(200).optional(),
  pageUrl: z.string().url().optional(),
  userAgent: z.string().max(500).optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export const publicSubmitFeedbackSchema = submitFeedbackSchema
  .extend({
    companyWebsite: z.string().max(200).optional(),
    turnstileToken: z.string().max(2048).optional(),
  })
  .refine((data) => !!data.reporterEmail, {
    message: "Email is required for public feedback",
    path: ["reporterEmail"],
  });

export type PublicSubmitFeedbackInput = z.infer<typeof publicSubmitFeedbackSchema>;
