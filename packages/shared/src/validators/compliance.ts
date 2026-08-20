import { z } from "zod";
import {
  GENERATED_REPORT_ARTIFACT_STATUSES,
  GENERATED_REPORT_FORMATS,
  GENERATED_REPORT_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();

const generatedReportTypeSchema = z.enum(GENERATED_REPORT_TYPES);
const generatedReportFormatSchema = z.enum(GENERATED_REPORT_FORMATS);
const generatedReportArtifactStatusSchema = z.enum(GENERATED_REPORT_ARTIFACT_STATUSES);
const centsSchema = z.number().int();

export const BOARD_PACKET_SECTIONS = [
  "executive_snapshot",
  "fundraising",
  "grant_pipeline",
  "fund_balances",
  "compliance_deadlines",
] as const;
export const BOARD_PACKET_CADENCES = ["one_time", "monthly", "quarterly"] as const;

const boardPacketSectionSchema = z.enum(BOARD_PACKET_SECTIONS);
const boardPacketCadenceSchema = z.enum(BOARD_PACKET_CADENCES);

export const generateGrantComplianceReportSchema = z.object({
  title: optionalTrimmedString,
});
export type GenerateGrantComplianceReportInput = z.input<
  typeof generateGrantComplianceReportSchema
>;

export const generateAuditReportSchema = z.object({
  title: optionalTrimmedString,
});
export type GenerateAuditReportInput = z.input<typeof generateAuditReportSchema>;

export const generateIrs990ReportSchema = z.object({
  fiscalYear: z.string().trim().min(1).max(20),
  title: optionalTrimmedString,
});
export type GenerateIrs990ReportInput = z.input<typeof generateIrs990ReportSchema>;

export const generateBoardReportSchema = z.object({
  fiscalYear: z.string().trim().min(1).max(20),
  title: optionalTrimmedString,
  meetingDate: z.string().date().optional(),
  cadence: boardPacketCadenceSchema.default("one_time"),
  sections: z.array(boardPacketSectionSchema).min(1).optional(),
});
export type GenerateBoardReportInput = z.input<typeof generateBoardReportSchema>;
export type BoardPacketSection = (typeof BOARD_PACKET_SECTIONS)[number];
export type BoardPacketCadence = (typeof BOARD_PACKET_CADENCES)[number];

export const generateAcknowledgmentLetterSchema = z.object({
  title: optionalTrimmedString,
});
export type GenerateAcknowledgmentLetterInput = z.input<typeof generateAcknowledgmentLetterSchema>;

export const generateDonorYearEndStatementRunSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  deliveryMode: z.literal("download").default("download"),
  minimumAmountCents: z.number().int().nonnegative().default(0),
  title: optionalTrimmedString,
});
export type GenerateDonorYearEndStatementRunInput = z.input<
  typeof generateDonorYearEndStatementRunSchema
>;

export const generatedReportListSchema = paginationSchema.extend({
  type: generatedReportTypeSchema.optional(),
  status: generatedReportArtifactStatusSchema.optional(),
  sortBy: z.enum(["createdAt", "title", "type"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type GeneratedReportListParams = z.infer<typeof generatedReportListSchema>;

export const generatedReportParamsSchema = z.object({
  reportId: idSchema,
});
export type GeneratedReportParams = z.infer<typeof generatedReportParamsSchema>;

export const acknowledgmentTemplateSchema = z.object({
  intro: z.string().trim().min(1).max(2000),
  body: z.string().trim().min(1).max(4000),
  closing: z.string().trim().min(1).max(1000),
});
export type AcknowledgmentTemplateInput = z.input<typeof acknowledgmentTemplateSchema>;

export const spendDownQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type SpendDownQueryParams = z.infer<typeof spendDownQuerySchema>;

export const generateSpendDownReportSchema = z
  .object({
    grantId: idSchema,
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    title: optionalTrimmedString,
  })
  .refine((input) => !input.from || !input.to || Date.parse(input.from) <= Date.parse(input.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type GenerateSpendDownReportInput = z.input<typeof generateSpendDownReportSchema>;

export const generateSefaReportSchema = z.object({
  fiscalYear: z.string().trim().min(1).max(20),
  title: optionalTrimmedString,
});
export type GenerateSefaReportInput = z.input<typeof generateSefaReportSchema>;

export const sefaTripwireStateSchema = z.enum(["clear", "watch", "crossed"]);
export const sefaMetadataStatusSchema = z.enum(["complete", "missing_metadata"]);
export const sefaTripwireWarningSchema = z.object({
  grantId: z.string(),
  grantName: z.string().optional(),
  field: z.string(),
  message: z.string(),
});
export const sefaTripwireRowSchema = z.object({
  grantId: z.string(),
  grantName: z.string(),
  federalAgency: z.string().nullable(),
  assistanceListingNumber: z.string().nullable(),
  assistanceListingTitle: z.string().nullable().optional(),
  fain: z.string().nullable().optional(),
  passThroughEntityName: z.string().nullable().optional(),
  passThroughIdentifyingNumber: z.string().nullable().optional(),
  programName: z.string().nullable().optional(),
  clusterName: z.string().nullable().optional(),
  expendituresCents: centsSchema,
  metadataStatus: sefaMetadataStatusSchema,
  warnings: z.array(sefaTripwireWarningSchema),
});
export const sefaTripwireResultSchema = z.object({
  fiscalYear: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  thresholdCents: centsSchema,
  totalFederalExpendituresCents: centsSchema,
  remainingToThresholdCents: centsSchema,
  thresholdPercent: z.number(),
  state: sefaTripwireStateSchema,
  rows: z.array(sefaTripwireRowSchema),
  warnings: z.array(sefaTripwireWarningSchema),
});
export type SefaTripwireResult = z.infer<typeof sefaTripwireResultSchema>;

export const spendDownByCategorySchema = z.object({
  category: z.string(),
  amountCents: centsSchema,
});
export const spendDownByFundSchema = z.object({
  fundId: z.string(),
  fundName: z.string(),
  allocatedAmountCents: centsSchema,
  expensesCents: centsSchema,
});
export const spendDownByMonthSchema = z.object({
  month: z.string(),
  amountCents: centsSchema,
});
export const spendDownResultSchema = z.object({
  budgetCents: centsSchema.nullable(),
  expensesCents: centsSchema,
  remainingCents: centsSchema.nullable(),
  burnRateCentsPerMonth: centsSchema.nullable(),
  projectedExhaustionDate: z.string().nullable(),
  thresholdState: z.string().nullable(),
  byCategory: z.array(spendDownByCategorySchema),
  byFund: z.array(spendDownByFundSchema),
  byMonth: z.array(spendDownByMonthSchema),
});
export type SpendDownResult = z.infer<typeof spendDownResultSchema>;

export const generatedReportArtifactSchema = z.object({
  id: idSchema,
  type: generatedReportTypeSchema,
  format: generatedReportFormatSchema,
  status: generatedReportArtifactStatusSchema,
  title: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  previewPath: z.string().trim().min(1).optional(),
  internalPath: z.string().trim().min(1).optional(),
  downloadPath: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  grantId: z.string().trim().min(1).nullable().optional(),
  fundId: z.string().trim().min(1).nullable().optional(),
  donationId: z.string().trim().min(1).nullable().optional(),
  fiscalYear: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type GeneratedReportArtifact = z.infer<typeof generatedReportArtifactSchema>;
