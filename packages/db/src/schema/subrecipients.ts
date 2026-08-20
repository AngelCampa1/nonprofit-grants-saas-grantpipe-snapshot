import { relations } from "drizzle-orm";
import { bigint, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, user } from "./auth";
import { contacts } from "./contacts";
import { documents } from "./infrastructure";
import { grants } from "./grants";

export const subrecipients = pgTable(
  "subrecipients",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    uei: text("uei"),
    primaryContactId: text("primary_contact_id").references(() => contacts.id),
    status: text("status").notNull().default("active"),
    ownerId: text("owner_id").references(() => user.id),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgStatusIdx: index("subrecipients_org_status_idx").on(table.orgId, table.status),
  }),
);

export const subawards = pgTable(
  "subawards",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subrecipientId: text("subrecipient_id")
      .notNull()
      .references(() => subrecipients.id),
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    title: text("title").notNull(),
    subawardNumber: text("subaward_number"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("draft"),
    scopeSummary: text("scope_summary"),
    riskRating: text("risk_rating"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgGrantIdx: index("subawards_org_grant_idx").on(table.orgId, table.grantId),
    orgSubrecipientIdx: index("subawards_org_subrecipient_idx").on(
      table.orgId,
      table.subrecipientId,
    ),
    orgRiskIdx: index("subawards_org_risk_idx").on(table.orgId, table.riskRating),
  }),
);

export const subrecipientRiskAssessments = pgTable(
  "subrecipient_risk_assessments",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subawardId: text("subaward_id")
      .notNull()
      .references(() => subawards.id),
    checklist: jsonb("checklist").notNull(),
    suggestedRiskRating: text("suggested_risk_rating").notNull(),
    finalRiskRating: text("final_risk_rating").notNull(),
    overrideReason: text("override_reason"),
    assessedBy: text("assessed_by")
      .notNull()
      .references(() => user.id),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgSubawardIdx: index("subrecipient_risk_org_subaward_idx").on(table.orgId, table.subawardId),
  }),
);

export const subrecipientMonitoringTasks = pgTable(
  "subrecipient_monitoring_tasks",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subawardId: text("subaward_id")
      .notNull()
      .references(() => subawards.id),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    ownerId: text("owner_id").references(() => user.id),
    status: text("status").notNull().default("open"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by").references(() => user.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgSubawardStatusIdx: index("subrecipient_tasks_org_subaward_status_idx").on(
      table.orgId,
      table.subawardId,
      table.status,
    ),
    orgDueDateIdx: index("subrecipient_tasks_org_due_date_idx").on(table.orgId, table.dueDate),
  }),
);

export const subrecipientMonitoringLogs = pgTable(
  "subrecipient_monitoring_logs",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subawardId: text("subaward_id")
      .notNull()
      .references(() => subawards.id),
    monitoringTaskId: text("monitoring_task_id").references(() => subrecipientMonitoringTasks.id),
    logType: text("log_type").notNull(),
    title: text("title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    documentId: text("document_id").references(() => documents.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgSubawardIdx: index("subrecipient_logs_org_subaward_idx").on(table.orgId, table.subawardId),
  }),
);

export const subrecipientFindings = pgTable(
  "subrecipient_findings",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subawardId: text("subaward_id")
      .notNull()
      .references(() => subawards.id),
    monitoringTaskId: text("monitoring_task_id").references(() => subrecipientMonitoringTasks.id),
    title: text("title").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    description: text("description").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgSubawardStatusIdx: index("subrecipient_findings_org_subaward_status_idx").on(
      table.orgId,
      table.subawardId,
      table.status,
    ),
  }),
);

export const subrecipientCorrectiveActions = pgTable(
  "subrecipient_corrective_actions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    findingId: text("finding_id")
      .notNull()
      .references(() => subrecipientFindings.id),
    title: text("title").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    ownerId: text("owner_id").references(() => user.id),
    status: text("status").notNull().default("open"),
    resolutionNotes: text("resolution_notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgFindingIdx: index("subrecipient_actions_org_finding_idx").on(table.orgId, table.findingId),
    orgDueDateIdx: index("subrecipient_actions_org_due_date_idx").on(table.orgId, table.dueDate),
  }),
);

export const subrecipientsRelations = relations(subrecipients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subrecipients.orgId],
    references: [organizations.id],
  }),
  primaryContact: one(contacts, {
    fields: [subrecipients.primaryContactId],
    references: [contacts.id],
  }),
  owner: one(user, { fields: [subrecipients.ownerId], references: [user.id] }),
  subawards: many(subawards),
}));

export const subawardsRelations = relations(subawards, ({ one, many }) => ({
  organization: one(organizations, { fields: [subawards.orgId], references: [organizations.id] }),
  subrecipient: one(subrecipients, {
    fields: [subawards.subrecipientId],
    references: [subrecipients.id],
  }),
  grant: one(grants, { fields: [subawards.grantId], references: [grants.id] }),
  riskAssessments: many(subrecipientRiskAssessments),
  monitoringTasks: many(subrecipientMonitoringTasks),
  monitoringLogs: many(subrecipientMonitoringLogs),
  findings: many(subrecipientFindings),
}));

export const subrecipientRiskAssessmentsRelations = relations(
  subrecipientRiskAssessments,
  ({ one }) => ({
    subaward: one(subawards, {
      fields: [subrecipientRiskAssessments.subawardId],
      references: [subawards.id],
    }),
    assessor: one(user, {
      fields: [subrecipientRiskAssessments.assessedBy],
      references: [user.id],
    }),
  }),
);

export const subrecipientMonitoringTasksRelations = relations(
  subrecipientMonitoringTasks,
  ({ one, many }) => ({
    subaward: one(subawards, {
      fields: [subrecipientMonitoringTasks.subawardId],
      references: [subawards.id],
    }),
    evidenceDocument: one(documents, {
      fields: [subrecipientMonitoringTasks.evidenceDocumentId],
      references: [documents.id],
    }),
    logs: many(subrecipientMonitoringLogs),
    findings: many(subrecipientFindings),
  }),
);

export const subrecipientMonitoringLogsRelations = relations(
  subrecipientMonitoringLogs,
  ({ one }) => ({
    subaward: one(subawards, {
      fields: [subrecipientMonitoringLogs.subawardId],
      references: [subawards.id],
    }),
    monitoringTask: one(subrecipientMonitoringTasks, {
      fields: [subrecipientMonitoringLogs.monitoringTaskId],
      references: [subrecipientMonitoringTasks.id],
    }),
  }),
);

export const subrecipientFindingsRelations = relations(subrecipientFindings, ({ one, many }) => ({
  subaward: one(subawards, {
    fields: [subrecipientFindings.subawardId],
    references: [subawards.id],
  }),
  monitoringTask: one(subrecipientMonitoringTasks, {
    fields: [subrecipientFindings.monitoringTaskId],
    references: [subrecipientMonitoringTasks.id],
  }),
  correctiveActions: many(subrecipientCorrectiveActions),
}));

export const subrecipientCorrectiveActionsRelations = relations(
  subrecipientCorrectiveActions,
  ({ one }) => ({
    finding: one(subrecipientFindings, {
      fields: [subrecipientCorrectiveActions.findingId],
      references: [subrecipientFindings.id],
    }),
  }),
);
