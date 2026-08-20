import { z } from "zod";
import {
  SUBAWARD_STATUSES,
  SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES,
  SUBRECIPIENT_FINDING_SEVERITIES,
  SUBRECIPIENT_FINDING_STATUSES,
  SUBRECIPIENT_MONITORING_LOG_TYPES,
  SUBRECIPIENT_MONITORING_TASK_STATUSES,
  SUBRECIPIENT_RISK_CHECKLIST_ANSWERS,
  SUBRECIPIENT_RISK_RATINGS,
  SUBRECIPIENT_STATUSES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const optionalIdSchema = idSchema.optional();
const isoDatetimeSchema = z.string().datetime();
const optionalTrimmedString = z.string().trim().min(1).max(1000).optional();
const nullableTrimmedString = z.string().trim().min(1).max(1000).nullable().optional();
const moneySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const riskRatingSchema = z.enum(SUBRECIPIENT_RISK_RATINGS);
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

function validateDateRange(data: { startDate?: string; endDate?: string }, ctx: z.RefinementCtx) {
  if (
    data.startDate &&
    data.endDate &&
    new Date(data.startDate).getTime() > new Date(data.endDate).getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Start date must be before or equal to end date",
      path: ["startDate"],
    });
  }
}

export const subrecipientListSchema = paginationSchema.extend({
  status: z.enum(SUBRECIPIENT_STATUSES).optional(),
  riskRating: riskRatingSchema.optional(),
  ownerId: optionalIdSchema,
  grantId: optionalIdSchema,
  overdueTasks: queryBooleanSchema.optional(),
  openFindings: queryBooleanSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type SubrecipientListParams = z.infer<typeof subrecipientListSchema>;

export const createSubrecipientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  uei: z.string().trim().min(1).max(12).optional(),
  primaryContactId: optionalIdSchema,
  status: z.enum(SUBRECIPIENT_STATUSES).default("active"),
  ownerId: optionalIdSchema,
  notes: optionalTrimmedString,
});
export type CreateSubrecipientInput = z.input<typeof createSubrecipientSchema>;

export const updateSubrecipientSchema = createSubrecipientSchema.partial();
export type UpdateSubrecipientInput = z.input<typeof updateSubrecipientSchema>;

const subawardFields = {
  grantId: idSchema,
  title: z.string().trim().min(1).max(200),
  subawardNumber: z.string().trim().min(1).max(80).optional(),
  amountCents: moneySchema,
  startDate: isoDatetimeSchema,
  endDate: isoDatetimeSchema,
  status: z.enum(SUBAWARD_STATUSES).default("draft"),
  scopeSummary: optionalTrimmedString,
};

export const createSubawardSchema = z.object(subawardFields).superRefine(validateDateRange);
export type CreateSubawardInput = z.input<typeof createSubawardSchema>;

export const updateSubawardSchema = z
  .object(subawardFields)
  .partial()
  .superRefine(validateDateRange);
export type UpdateSubawardInput = z.input<typeof updateSubawardSchema>;

export const riskChecklistSchema = z.object({
  priorFindings: z.enum(SUBRECIPIENT_RISK_CHECKLIST_ANSWERS),
  newPartner: z.enum(SUBRECIPIENT_RISK_CHECKLIST_ANSWERS),
  complexRequirements: z.enum(SUBRECIPIENT_RISK_CHECKLIST_ANSWERS),
  highDollarAward: z.enum(SUBRECIPIENT_RISK_CHECKLIST_ANSWERS),
  weakControls: z.enum(SUBRECIPIENT_RISK_CHECKLIST_ANSWERS),
});
export type RiskChecklistInput = z.input<typeof riskChecklistSchema>;

export const createRiskAssessmentSchema = z
  .object({
    checklist: riskChecklistSchema,
    suggestedRiskRating: riskRatingSchema,
    finalRiskRating: riskRatingSchema.optional(),
    overrideReason: optionalTrimmedString,
    assessedAt: isoDatetimeSchema.optional(),
  })
  .transform((data) => ({
    ...data,
    finalRiskRating: data.finalRiskRating ?? data.suggestedRiskRating,
  }))
  .superRefine((data, ctx) => {
    if (data.finalRiskRating !== data.suggestedRiskRating && !data.overrideReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Manual overrides require a reason",
        path: ["overrideReason"],
      });
    }
  });
export type CreateRiskAssessmentInput = z.input<typeof createRiskAssessmentSchema>;

export const generateMonitoringTasksSchema = z.object({
  riskRating: riskRatingSchema.optional(),
});
export type GenerateMonitoringTasksInput = z.input<typeof generateMonitoringTasksSchema>;

export const createMonitoringTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: nullableTrimmedString,
  dueDate: isoDatetimeSchema,
  ownerId: optionalIdSchema,
  status: z.enum(SUBRECIPIENT_MONITORING_TASK_STATUSES).default("open"),
  evidenceDocumentId: optionalIdSchema,
});
export type CreateMonitoringTaskInput = z.input<typeof createMonitoringTaskSchema>;

export const updateMonitoringTaskSchema = createMonitoringTaskSchema.partial().extend({
  completedAt: isoDatetimeSchema.nullable().optional(),
});
export type UpdateMonitoringTaskInput = z.input<typeof updateMonitoringTaskSchema>;

export const createMonitoringLogSchema = z.object({
  logType: z.enum(SUBRECIPIENT_MONITORING_LOG_TYPES),
  title: z.string().trim().min(1).max(200),
  occurredAt: isoDatetimeSchema,
  summary: z.string().trim().min(1).max(4000),
  documentId: optionalIdSchema,
});
export type CreateMonitoringLogInput = z.input<typeof createMonitoringLogSchema>;

export const createFindingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  severity: z.enum(SUBRECIPIENT_FINDING_SEVERITIES),
  status: z.enum(SUBRECIPIENT_FINDING_STATUSES).default("open"),
  description: z.string().trim().min(1).max(4000),
  monitoringTaskId: optionalIdSchema,
});
export type CreateFindingInput = z.input<typeof createFindingSchema>;

export const updateFindingSchema = createFindingSchema.partial();
export type UpdateFindingInput = z.input<typeof updateFindingSchema>;

export const createCorrectiveActionSchema = z.object({
  findingId: idSchema,
  title: z.string().trim().min(1).max(200),
  dueDate: isoDatetimeSchema,
  ownerId: optionalIdSchema,
  status: z.enum(SUBRECIPIENT_CORRECTIVE_ACTION_STATUSES).default("open"),
  resolutionNotes: nullableTrimmedString,
});
export type CreateCorrectiveActionInput = z.input<typeof createCorrectiveActionSchema>;

// findingId is intentionally omitted: a corrective action's parent finding is
// immutable. Allowing it on update would let a client re-parent the action to a
// finding in another org (the update is scoped by actionId + orgId only).
export const updateCorrectiveActionSchema = createCorrectiveActionSchema
  .omit({ findingId: true })
  .partial();
export type UpdateCorrectiveActionInput = z.input<typeof updateCorrectiveActionSchema>;
