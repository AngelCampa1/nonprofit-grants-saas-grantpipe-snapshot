import { z } from "zod";
import {
  ACTIVITY_ENTITY_TYPES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  DOCUMENT_ENTITY_TYPES,
  IMPORT_ENTITY_TYPES,
  IMPORT_HISTORY_STATUSES,
  MAX_DOCUMENT_BYTES,
  NOTIFICATION_TYPES,
} from "../constants";
import { MIGRATION_SOURCE_IDS } from "../migration-studio";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const trimmedString = z.string().trim().min(1);
const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValueSchema: z.ZodType = z.lazy(() =>
  z.union([jsonScalarSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const createDocumentSchema = z.object({
  entityType: z.enum(DOCUMENT_ENTITY_TYPES),
  entityId: idSchema,
  filename: trimmedString.max(255),
  mimeType: trimmedString
    .max(255)
    .refine((v) => ALLOWED_DOCUMENT_MIME_TYPES.has(v), "File type not allowed"),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;

export const documentListSchema = paginationSchema.extend({
  entityType: z.enum(DOCUMENT_ENTITY_TYPES),
  entityId: idSchema,
  sortBy: z.enum(["createdAt", "filename"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type DocumentListParams = z.infer<typeof documentListSchema>;

export const activityListSchema = paginationSchema.extend({
  entityType: z.enum(ACTIVITY_ENTITY_TYPES),
  entityId: idSchema,
  sortBy: z.enum(["createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ActivityListParams = z.infer<typeof activityListSchema>;

export const orgActivityListSchema = paginationSchema
  .extend({
    entityType: z.enum(ACTIVITY_ENTITY_TYPES).optional(),
    actorId: idSchema.optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((q) => !q.fromDate || !q.toDate || Date.parse(q.fromDate) <= Date.parse(q.toDate), {
    message: "fromDate must be before or equal to toDate",
    path: ["fromDate"],
  });
export type OrgActivityListParams = z.infer<typeof orgActivityListSchema>;

const customFieldOptionsSchema = z.array(trimmedString.max(120)).min(1).max(50);

export const createCustomFieldDefinitionSchema = z
  .object({
    entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
    name: trimmedString.max(120),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    options: customFieldOptionsSchema.optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    const requiresOptions = data.fieldType === "single_select" || data.fieldType === "multi_select";
    if (requiresOptions && !data.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Select fields require options",
      });
    }
    if (!requiresOptions && data.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only select fields accept options",
      });
    }
  });
export type CreateCustomFieldDefinitionInput = z.input<typeof createCustomFieldDefinitionSchema>;

export const updateCustomFieldDefinitionSchema = z.object({
  name: trimmedString.max(120).optional(),
  options: customFieldOptionsSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateCustomFieldDefinitionInput = z.input<typeof updateCustomFieldDefinitionSchema>;

export const upsertCustomFieldValueSchema = z.object({
  value: jsonValueSchema,
});
export type UpsertCustomFieldValueInput = z.input<typeof upsertCustomFieldValueSchema>;

export const notificationListSchema = paginationSchema.extend({
  read: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  sortBy: z.enum(["createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type NotificationListParams = z.output<typeof notificationListSchema>;

export const notificationPreferenceSchema = z.object({
  notificationType: z.enum(NOTIFICATION_TYPES),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});
export type NotificationPreferenceInput = z.input<typeof notificationPreferenceSchema>;

export const importPreviewSchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
  filename: trimmedString.max(255),
  csvText: trimmedString,
});
export type ImportPreviewInput = z.input<typeof importPreviewSchema>;

export const importCommitSchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
  filename: trimmedString.max(255),
  mapping: z.record(z.string(), z.string().trim().min(1)),
  rows: z.array(z.record(z.string(), jsonValueSchema)).min(1).max(10000),
});
export type ImportCommitInput = z.input<typeof importCommitSchema>;

export const importHistoryListSchema = paginationSchema.extend({
  entityType: z.enum(IMPORT_ENTITY_TYPES).optional(),
  status: z.enum(IMPORT_HISTORY_STATUSES).optional(),
  sortBy: z.enum(["createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ImportHistoryListParams = z.infer<typeof importHistoryListSchema>;

export const importMigrationPlanQuerySchema = z.object({
  source: z.enum(MIGRATION_SOURCE_IDS).default("generic"),
});
export type ImportMigrationPlanQueryParams = z.infer<typeof importMigrationPlanQuerySchema>;

export const importHistoryStatusSchema = z.enum(IMPORT_HISTORY_STATUSES);
export const customFieldEntityTypeSchema = z.enum(CUSTOM_FIELD_ENTITY_TYPES);
export const documentEntityTypeSchema = z.enum(DOCUMENT_ENTITY_TYPES);
