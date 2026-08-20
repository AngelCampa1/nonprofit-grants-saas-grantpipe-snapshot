import { z } from "zod";

export const REPORT_BUILDER_ENTITIES = ["donors", "donations", "grants", "funds"] as const;
export type ReportBuilderEntity = (typeof REPORT_BUILDER_ENTITIES)[number];

export const REPORT_BUILDER_COLUMNS = {
  donors: ["displayName", "type", "email", "phone", "pipelineStage", "emailOptOut", "createdAt"],
  donations: [
    "donorName",
    "amountCents",
    "date",
    "type",
    "restriction",
    "netAssetClass",
    "fundName",
    "grantName",
    "receiptSent",
  ],
  grants: [
    "name",
    "status",
    "funderName",
    "amountCents",
    "startDate",
    "endDate",
    "applicationDeadline",
  ],
  funds: ["name", "type", "restriction", "balanceCents", "createdAt"],
} as const satisfies Record<ReportBuilderEntity, readonly string[]>;

export type ReportBuilderColumn<E extends ReportBuilderEntity = ReportBuilderEntity> =
  (typeof REPORT_BUILDER_COLUMNS)[E][number];

export const REPORT_BUILDER_FILTER_OPERATORS = [
  "equals",
  "contains",
  "is_empty",
  "is_not_empty",
  "gte",
  "lte",
] as const;

export const reportBuilderEntitySchema = z.enum(REPORT_BUILDER_ENTITIES);
export const reportBuilderFilterOperatorSchema = z.enum(REPORT_BUILDER_FILTER_OPERATORS);

const idSchema = z.string().trim().min(1).max(120);

const uniqueStringArray = (message: string) =>
  z.array(z.string().trim().min(1).max(120)).superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: "custom", message });
    }
  });

export const reportBuilderFilterSchema = z.object({
  field: z.string().trim().min(1).max(120),
  operator: reportBuilderFilterOperatorSchema,
  value: z.string().trim().max(500).optional(),
});

export const reportBuilderSortSchema = z.object({
  field: z.string().trim().min(1).max(120),
  direction: z.enum(["asc", "desc"]),
});

const reportBuilderDefinitionBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  entity: reportBuilderEntitySchema,
  columns: uniqueStringArray("Choose each column only once.").min(1).max(24),
  customFieldIds: uniqueStringArray("Choose each custom field only once.").max(24).default([]),
  filters: z.array(reportBuilderFilterSchema).max(12).default([]),
  sort: z.array(reportBuilderSortSchema).max(3).default([]),
});

function assertEntityColumns(
  value: { entity?: ReportBuilderEntity; columns?: string[] },
  ctx: z.RefinementCtx,
) {
  if (!value.entity || !value.columns) return;
  const allowedColumns = REPORT_BUILDER_COLUMNS[value.entity];
  for (const column of value.columns) {
    if (!(allowedColumns as readonly string[]).includes(column)) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: `${column} is not available for ${value.entity} reports.`,
      });
    }
  }
}

export const reportBuilderDefinitionInputSchema = reportBuilderDefinitionBaseSchema.superRefine(
  (value, ctx) => {
    assertEntityColumns(value, ctx);
  },
);

export const createReportDefinitionSchema = reportBuilderDefinitionInputSchema;
export const updateReportDefinitionSchema = reportBuilderDefinitionBaseSchema
  .partial()
  .extend({
    columns: uniqueStringArray("Choose each column only once.").min(1).max(24).optional(),
    customFieldIds: uniqueStringArray("Choose each custom field only once.").max(24).optional(),
  })
  .superRefine((value, ctx) => {
    assertEntityColumns(value, ctx);
  });

export const reportBuilderDefinitionParamsSchema = z.object({
  definitionId: idSchema,
});

export const reportBuilderListSchema = z.object({
  entity: reportBuilderEntitySchema.optional(),
});

export const reportBuilderPreviewSchema = reportBuilderDefinitionBaseSchema
  .omit({ name: true, description: true })
  .extend({
    limit: z
      .union([z.string(), z.number()])
      .optional()
      .default(25)
      .transform(Number)
      .pipe(z.number().int().min(1))
      .transform((n) => Math.min(n, 100)),
  })
  .superRefine((value, ctx) => {
    assertEntityColumns(value, ctx);
  });

export const reportBuilderRunSchema = z.object({
  attemptId: z.uuid(),
  title: z.string().trim().min(1).max(160).optional(),
});

export type ParsedReportBuilderDefinitionInput = z.output<
  typeof reportBuilderDefinitionInputSchema
>;
export type ReportBuilderDefinitionInput = z.input<typeof reportBuilderDefinitionInputSchema>;
export type ParsedCreateReportDefinitionInput = z.output<typeof createReportDefinitionSchema>;
export type CreateReportDefinitionInput = z.input<typeof createReportDefinitionSchema>;
export type ParsedUpdateReportDefinitionInput = z.output<typeof updateReportDefinitionSchema>;
export type UpdateReportDefinitionInput = z.input<typeof updateReportDefinitionSchema>;
export type ReportBuilderListParams = z.infer<typeof reportBuilderListSchema>;
export type ParsedReportBuilderPreviewInput = z.output<typeof reportBuilderPreviewSchema>;
export type ReportBuilderPreviewInput = z.input<typeof reportBuilderPreviewSchema>;
export type ReportBuilderRunInput = z.infer<typeof reportBuilderRunSchema>;

export type ReportBuilderDefinition = ParsedReportBuilderDefinitionInput & {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportBuilderCustomFieldOption = {
  id: string;
  entity: ReportBuilderEntity;
  name: string;
  fieldType: string;
};

export type ReportBuilderFieldOption = {
  id: string;
  label: string;
};

export type ReportBuilderMetadata = {
  entities: Record<
    ReportBuilderEntity,
    {
      label: string;
      columns: ReportBuilderFieldOption[];
      customFields: ReportBuilderCustomFieldOption[];
    }
  >;
};

export type ReportBuilderPreview = {
  columns: ReportBuilderFieldOption[];
  rows: Array<Record<string, string | number | boolean | null>>;
  totalRows: number;
};
