import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { entities, organizations, user } from "./auth";
import { grants, grantImpactMetrics, funds } from "./grants";
import { donations } from "./contacts";

// ---------------------------------------------------------------------------
// grantReportingRequirements
// ---------------------------------------------------------------------------

export const grantReportingRequirements = pgTable("grant_reporting_requirements", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  reportType: text("report_type").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | in_progress | submitted | overdue
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// impactMetricEntries
// ---------------------------------------------------------------------------

export const impactMetricEntries = pgTable("impact_metric_entries", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => grantImpactMetrics.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  value: numeric("value").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// grantCloseoutItems
// ---------------------------------------------------------------------------

export const grantCloseoutItems = pgTable("grant_closeout_items", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  label: text("label").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by").references(() => user.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// generatedReports
// ---------------------------------------------------------------------------

export const generatedReports = pgTable(
  "generated_reports",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    type: text("type").notNull(),
    attemptId: text("attempt_id"),
    recoveryAttemptedAt: timestamp("recovery_attempted_at", { withTimezone: true }),
    readyEffectsStatus: text("ready_effects_status"),
    readyEffectsClaimedAt: timestamp("ready_effects_claimed_at", { withTimezone: true }),
    readyEffectsAnalyticsDeliveredAt: timestamp("ready_effects_analytics_delivered_at", {
      withTimezone: true,
    }),
    readyEffectsTrialTier: text("ready_effects_trial_tier"),
    readyEffectsTrialUsageRecordedAt: timestamp("ready_effects_trial_usage_recorded_at", {
      withTimezone: true,
    }),
    readyEffectsAttemptCount: integer("ready_effects_attempt_count").notNull().default(0),
    readyEffectsLastAttemptedAt: timestamp("ready_effects_last_attempted_at", {
      withTimezone: true,
    }),
    format: text("format").notNull().default("pdf"),
    status: text("status").notNull().default("pending"),
    title: text("title").notNull().default("Generated report"),
    grantId: text("grant_id").references(() => grants.id),
    fundId: text("fund_id").references(() => funds.id),
    donationId: text("donation_id").references(() => donations.id),
    fiscalYear: text("fiscal_year"),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull().default("report.pdf"),
    fileSizeBytes: integer("file_size_bytes"),
    metadata: jsonb("metadata"),
    generatedBy: text("generated_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_reports_org_type_attempt_idx")
      .on(table.orgId, table.entityId, table.type, table.attemptId)
      .where(sql`${table.attemptId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// reportTemplates
// ---------------------------------------------------------------------------

export const reportTemplates = pgTable(
  "report_templates",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    type: text("type").notNull(),
    intro: text("intro").notNull(),
    body: text("body").notNull(),
    closing: text("closing").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("report_templates_org_type_idx").on(table.orgId, table.type)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const grantReportingRequirementsRelations = relations(
  grantReportingRequirements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantReportingRequirements.orgId],
      references: [organizations.id],
    }),
    grant: one(grants, {
      fields: [grantReportingRequirements.grantId],
      references: [grants.id],
    }),
  }),
);

export const impactMetricEntriesRelations = relations(impactMetricEntries, ({ one }) => ({
  metric: one(grantImpactMetrics, {
    fields: [impactMetricEntries.metricId],
    references: [grantImpactMetrics.id],
  }),
}));

export const grantCloseoutItemsRelations = relations(grantCloseoutItems, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantCloseoutItems.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantCloseoutItems.grantId],
    references: [grants.id],
  }),
  completedByUser: one(user, {
    fields: [grantCloseoutItems.completedBy],
    references: [user.id],
  }),
}));

export const generatedReportsRelations = relations(generatedReports, ({ one }) => ({
  organization: one(organizations, {
    fields: [generatedReports.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [generatedReports.grantId],
    references: [grants.id],
  }),
  fund: one(funds, {
    fields: [generatedReports.fundId],
    references: [funds.id],
  }),
  generator: one(user, {
    fields: [generatedReports.generatedBy],
    references: [user.id],
  }),
  donation: one(donations, {
    fields: [generatedReports.donationId],
    references: [donations.id],
  }),
}));

export const reportTemplatesRelations = relations(reportTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [reportTemplates.orgId],
    references: [organizations.id],
  }),
  updater: one(user, {
    fields: [reportTemplates.updatedBy],
    references: [user.id],
  }),
}));
