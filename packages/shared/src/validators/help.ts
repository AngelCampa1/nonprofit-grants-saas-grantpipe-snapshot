import { z } from "zod";

export const GUIDE_KEYS = [
  "product_tour",
  "first_setup",
  "import_contacts",
  "record_donation",
  "track_pledges",
  "create_grant",
  "restricted_funds",
  "budget_sentinel",
  "generate_report",
  "statement_of_activities_report",
  "functional_expenses_report",
  "open_pdf_report",
  "invite_teammate",
] as const;
export type GuideKey = (typeof GUIDE_KEYS)[number];

export const GUIDE_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "dismissed",
] as const;
export type GuideProgressStatus = (typeof GUIDE_PROGRESS_STATUSES)[number];

export const guideKeySchema = z.enum(GUIDE_KEYS);
export const guideParamsSchema = z.object({
  guideKey: guideKeySchema,
});
export const guideProgressStatusSchema = z.enum(GUIDE_PROGRESS_STATUSES);

export const updateGuideProgressSchema = z.object({
  status: guideProgressStatusSchema,
  lastStep: z.string().trim().min(1).max(120).nullable().optional(),
});
export type UpdateGuideProgressInput = z.infer<typeof updateGuideProgressSchema>;

export const guideProgressRowSchema = z.object({
  guideKey: guideKeySchema,
  status: guideProgressStatusSchema,
  lastStep: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  dismissedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type GuideProgressRow = z.infer<typeof guideProgressRowSchema>;
