import { z } from "zod";

export const LEDGER_ASSISTANT_ANSWER_MODES = ["deterministic", "ai_assisted"] as const;
export type LedgerAssistantAnswerMode = (typeof LEDGER_ASSISTANT_ANSWER_MODES)[number];

export const LEDGER_ASSISTANT_CITATION_TYPES = [
  "report_row",
  "journal_entry",
  "grant",
  "fund",
] as const;
export type LedgerAssistantCitationType = (typeof LEDGER_ASSISTANT_CITATION_TYPES)[number];

export const ledgerAssistantAskSchema = z.object({
  question: z
    .string()
    .trim()
    .min(8, "Ask a question with at least 8 characters.")
    .max(500, "Ask a shorter question."),
  mode: z.enum(LEDGER_ASSISTANT_ANSWER_MODES).default("deterministic"),
});

export type LedgerAssistantAskInput = z.input<typeof ledgerAssistantAskSchema>;
export type ParsedLedgerAssistantAskInput = z.output<typeof ledgerAssistantAskSchema>;

export const ledgerAssistantCitationSchema = z.object({
  type: z.enum(LEDGER_ASSISTANT_CITATION_TYPES),
  label: z.string(),
  href: z.string(),
  value: z.string().optional(),
});

export const ledgerAssistantAnswerSchema = z.object({
  answer: z.string(),
  mode: z.enum(LEDGER_ASSISTANT_ANSWER_MODES),
  confidence: z.enum(["high", "medium", "low"]),
  safeguards: z.array(z.string()).min(1),
  citations: z.array(ledgerAssistantCitationSchema).min(1),
  suggestedFollowUps: z.array(z.string()).max(3),
});

export type LedgerAssistantCitation = z.infer<typeof ledgerAssistantCitationSchema>;
export type LedgerAssistantAnswer = z.infer<typeof ledgerAssistantAnswerSchema>;
