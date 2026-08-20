import { z } from "zod";

export const DRAFTING_ASSISTANT_MODEL_ID = "minimax/minimax-m2.7";
export const DRAFTING_ASSISTANT_PROMPT_VERSION = "proposal-report-drafting-v1";

export const DRAFTING_ASSISTANT_DRAFT_TYPES = [
  "proposal_narrative",
  "interim_report",
  "final_report",
] as const;
export type DraftingAssistantDraftType = (typeof DRAFTING_ASSISTANT_DRAFT_TYPES)[number];

export const DRAFTING_ASSISTANT_CITATION_TYPES = [
  "grant",
  "budget",
  "outcome",
  "metric",
  "report_row",
] as const;
export type DraftingAssistantCitationType = (typeof DRAFTING_ASSISTANT_CITATION_TYPES)[number];

export const draftingAssistantGenerateSchema = z.object({
  grantId: z.string().uuid("Choose a grant before drafting."),
  draftType: z.enum(DRAFTING_ASSISTANT_DRAFT_TYPES),
  userPrompt: z
    .string()
    .trim()
    .min(12, "Add a little more context for the draft.")
    .max(1_500, "Use a shorter prompt."),
  reportPeriodStart: z.string().date().optional(),
  reportPeriodEnd: z.string().date().optional(),
});

export type DraftingAssistantGenerateInput = z.input<typeof draftingAssistantGenerateSchema>;
export type ParsedDraftingAssistantGenerateInput = z.output<typeof draftingAssistantGenerateSchema>;

export const draftingAssistantCitationSchema = z.object({
  type: z.enum(DRAFTING_ASSISTANT_CITATION_TYPES),
  label: z.string().min(1),
  href: z.string().min(1),
  value: z.string().optional(),
});
export type DraftingAssistantCitation = z.infer<typeof draftingAssistantCitationSchema>;

export const draftingAssistantSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
});

export const draftingAssistantResponseSchema = z.object({
  draftTitle: z.string().min(1),
  draftType: z.enum(DRAFTING_ASSISTANT_DRAFT_TYPES),
  draftBody: z.string().min(1),
  sections: z.array(draftingAssistantSectionSchema).min(1),
  citations: z.array(draftingAssistantCitationSchema).min(1),
  safeguards: z
    .array(z.string().min(1))
    .min(1)
    .refine(
      (values) =>
        values.some(
          (value) =>
            value.toLowerCase().includes("editable draft") && value.toLowerCase().includes("human"),
        ),
      "Draft responses must state that a human reviews the editable draft.",
    ),
  modelId: z.literal(DRAFTING_ASSISTANT_MODEL_ID),
  promptVersion: z.literal(DRAFTING_ASSISTANT_PROMPT_VERSION),
  generatedAt: z.string().datetime(),
});

export type DraftingAssistantResponse = z.infer<typeof draftingAssistantResponseSchema>;
