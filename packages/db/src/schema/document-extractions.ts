import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { isNotNull, relations } from "drizzle-orm";
import { organizations, user } from "./auth";
import { documents } from "./infrastructure";
import { grants } from "./grants";

// ---------------------------------------------------------------------------
// document_extractions
// ---------------------------------------------------------------------------

export const documentExtractions = pgTable(
  "document_extractions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    dispatchAttemptId: text("dispatch_attempt_id"),
    dispatchRequestFingerprint: text("dispatch_request_fingerprint"),
    processingClaimToken: text("processing_claim_token"),
    createdGrantId: text("created_grant_id").references(() => grants.id),
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull().default("openrouter"),
    modelId: text("model_id").notNull(),
    providerRequestId: text("provider_request_id"),
    promptVersion: text("prompt_version").notNull(),
    rawNormalizedJson: jsonb("raw_normalized_json"),
    tokenUsageJson: jsonb("token_usage_json"),
    estimatedCostCents: bigint("estimated_cost_cents", { mode: "number" }),
    failureMessage: text("failure_message"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("document_extractions_org_document_status_idx").on(
      table.orgId,
      table.documentId,
      table.status,
    ),
    index("document_extractions_org_created_grant_idx").on(table.orgId, table.createdGrantId),
    uniqueIndex("document_extractions_dispatch_attempt_unique")
      .on(table.orgId, table.dispatchAttemptId)
      .where(isNotNull(table.dispatchAttemptId)),
  ],
);

// ---------------------------------------------------------------------------
// document_extraction_fields
// ---------------------------------------------------------------------------

export const documentExtractionFields = pgTable(
  "document_extraction_fields",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    extractionId: text("extraction_id")
      .notNull()
      .references(() => documentExtractions.id),
    fieldKey: text("field_key").notNull(),
    section: text("section").notNull(),
    destinationEntityType: text("destination_entity_type").notNull(),
    destinationField: text("destination_field").notNull(),
    valueJson: jsonb("value_json").notNull(),
    normalizedValueJson: jsonb("normalized_value_json"),
    confidence: integer("confidence").notNull(),
    status: text("status").notNull().default("pending"),
    required: boolean("required").notNull().default(false),
    createdRecordType: text("created_record_type"),
    createdRecordId: text("created_record_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_extraction_fields_org_extraction_section_idx").on(
      table.orgId,
      table.extractionId,
      table.section,
    ),
  ],
);

// ---------------------------------------------------------------------------
// document_extraction_sources
// ---------------------------------------------------------------------------

export const documentExtractionSources = pgTable(
  "document_extraction_sources",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    extractionId: text("extraction_id")
      .notNull()
      .references(() => documentExtractions.id),
    fieldId: text("field_id").references(() => documentExtractionFields.id),
    pageNumber: integer("page_number"),
    snippet: text("snippet").notNull(),
    boundingBoxJson: jsonb("bounding_box_json"),
    sourceOffsetStart: integer("source_offset_start"),
    sourceOffsetEnd: integer("source_offset_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_extraction_sources_org_extraction_field_idx").on(
      table.orgId,
      table.extractionId,
      table.fieldId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// document_extraction_actions
// ---------------------------------------------------------------------------

export const documentExtractionActions = pgTable(
  "document_extraction_actions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    extractionId: text("extraction_id")
      .notNull()
      .references(() => documentExtractions.id),
    fieldId: text("field_id").references(() => documentExtractionFields.id),
    action: text("action").notNull(),
    previousValueJson: jsonb("previous_value_json"),
    nextValueJson: jsonb("next_value_json"),
    mappedEntityType: text("mapped_entity_type"),
    mappedEntityId: text("mapped_entity_id"),
    createdRecordType: text("created_record_type"),
    createdRecordId: text("created_record_id"),
    note: text("note"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_extraction_actions_org_extraction_created_idx").on(
      table.orgId,
      table.extractionId,
      table.createdAt,
    ),
  ],
);

export const documentExtractionsRelations = relations(documentExtractions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documentExtractions.orgId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [documentExtractions.documentId],
    references: [documents.id],
  }),
  createdGrant: one(grants, {
    fields: [documentExtractions.createdGrantId],
    references: [grants.id],
  }),
  createdByUser: one(user, {
    fields: [documentExtractions.createdBy],
    references: [user.id],
  }),
  fields: many(documentExtractionFields),
  sources: many(documentExtractionSources),
  actions: many(documentExtractionActions),
}));

export const documentExtractionFieldsRelations = relations(
  documentExtractionFields,
  ({ one, many }) => ({
    extraction: one(documentExtractions, {
      fields: [documentExtractionFields.extractionId],
      references: [documentExtractions.id],
    }),
    sources: many(documentExtractionSources),
    actions: many(documentExtractionActions),
  }),
);

export const documentExtractionSourcesRelations = relations(
  documentExtractionSources,
  ({ one }) => ({
    extraction: one(documentExtractions, {
      fields: [documentExtractionSources.extractionId],
      references: [documentExtractions.id],
    }),
    field: one(documentExtractionFields, {
      fields: [documentExtractionSources.fieldId],
      references: [documentExtractionFields.id],
    }),
  }),
);

export const documentExtractionActionsRelations = relations(
  documentExtractionActions,
  ({ one }) => ({
    extraction: one(documentExtractions, {
      fields: [documentExtractionActions.extractionId],
      references: [documentExtractions.id],
    }),
    field: one(documentExtractionFields, {
      fields: [documentExtractionActions.fieldId],
      references: [documentExtractionFields.id],
    }),
    actor: one(user, {
      fields: [documentExtractionActions.actorId],
      references: [user.id],
    }),
  }),
);
