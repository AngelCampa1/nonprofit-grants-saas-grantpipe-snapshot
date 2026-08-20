import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, isNotNull } from "drizzle-orm";
import { entities, organizations, user } from "./auth";
import { contacts } from "./contacts";

type DashboardHomeLayout = {
  pinnedWidgetIds: string[];
};

export type DonorMailMergeRequestSnapshot = {
  endpoint: string;
  idempotencyKey: string;
  payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
  };
};

export type NotificationEmailRequestSnapshot = {
  version: 1;
  idempotencyKey: string;
  orgId: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  source: {
    entityType: string;
    entityId: string;
    orgId?: string;
  };
};

export const donorMailMergeDeliveries = pgTable(
  "donor_mail_merge_deliveries",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    attemptId: text("attempt_id").notNull(),
    status: text("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    requestFingerprint: text("request_fingerprint"),
    requestSnapshot: jsonb("request_snapshot").$type<DonorMailMergeRequestSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deliveryUnique: uniqueIndex("donor_mail_merge_delivery_unique").on(
      table.orgId,
      table.contactId,
      table.attemptId,
    ),
    statusIdx: index("donor_mail_merge_delivery_status_idx").on(table.orgId, table.status),
  }),
);

// ---------------------------------------------------------------------------
// communicationLog
// ---------------------------------------------------------------------------

export const communicationLog = pgTable(
  "communication_log",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    type: text("type").notNull(), // note | email | call | meeting
    subject: text("subject"),
    body: text("body"),
    loggedBy: text("logged_by")
      .notNull()
      .references(() => user.id),
    mailMergeAttemptId: text("mail_merge_attempt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    mailMergeUnique: uniqueIndex("communication_log_mail_merge_unique")
      .on(table.orgId, table.contactId, table.mailMergeAttemptId)
      .where(isNotNull(table.mailMergeAttemptId)),
  }),
);

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    fileKey: text("file_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgEntityIdx: index("documents_org_entity_type_id_idx").on(
      table.orgId,
      table.entityType,
      table.entityId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// activityLog
// ---------------------------------------------------------------------------

export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    activeEntityId: text("active_entity_id").references(() => entities.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityLabel: text("entity_label"),
    changes: jsonb("changes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCreatedAtIdx: index("activity_log_org_created_at_idx").on(table.orgId, table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// customFieldDefinitions
// ---------------------------------------------------------------------------

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityType: text("entity_type").notNull(), // contact | donation | grant
  name: text("name").notNull(),
  fieldType: text("field_type").notNull(), // text | number | date | single_select | multi_select
  options: jsonb("options"),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// customFieldValues
// ---------------------------------------------------------------------------

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinitions.id),
    entityId: text("entity_id").notNull(),
    value: text("value"),
  },
  (table) => ({
    fieldEntityUniqueIdx: uniqueIndex("custom_field_values_field_entity_unique").on(
      table.fieldId,
      table.entityId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    activeEntityId: text("active_entity_id").references(() => entities.id),
    dedupeKey: text("dedupe_key"),
    emailDeliveryStatus: text("email_delivery_status"),
    emailRequestSnapshot: jsonb("email_request_snapshot").$type<NotificationEmailRequestSnapshot>(),
    emailRequestFingerprint: text("email_request_fingerprint"),
    emailClaimedAt: timestamp("email_claimed_at", { withTimezone: true }),
    emailAttemptCount: integer("email_attempt_count").notNull().default(0),
    emailProviderMessageId: text("email_provider_message_id"),
    emailLastError: text("email_last_error"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserDedupeUniqueIdx: uniqueIndex("notifications_org_user_dedupe_unique")
      .on(table.orgId, table.userId, table.dedupeKey)
      .where(isNotNull(table.dedupeKey)),
    emailDeliveryStatusIdx: index("notifications_email_delivery_status_idx").on(
      table.emailDeliveryStatus,
      table.emailClaimedAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// notificationPreferences
// ---------------------------------------------------------------------------

export const notificationPreferences = pgTable("notification_preferences", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  notificationType: text("notification_type").notNull(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
});

// ---------------------------------------------------------------------------
// userGuideProgress
// ---------------------------------------------------------------------------

export const userGuideProgress = pgTable(
  "user_guide_progress",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    guideKey: text("guide_key").notNull(),
    status: text("status").notNull().default("not_started"),
    lastStep: text("last_step"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserGuideUniqueIdx: uniqueIndex("user_guide_progress_org_user_guide_unique").on(
      table.orgId,
      table.userId,
      table.guideKey,
    ),
    orgUserIdx: index("user_guide_progress_org_user_idx").on(table.orgId, table.userId),
  }),
);

// ---------------------------------------------------------------------------
// dashboardHomePreferences
// ---------------------------------------------------------------------------

export const dashboardHomePreferences = pgTable(
  "dashboard_home_preferences",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    layout: jsonb("layout").notNull().$type<DashboardHomeLayout>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserUniqueIdx: uniqueIndex("dashboard_home_preferences_org_user_unique").on(
      table.orgId,
      table.userId,
    ),
  }),
);

type SavedReportSort = {
  field: string;
  direction: "asc" | "desc";
};

type SavedReportFilter = {
  field: string;
  operator: string;
  value?: string;
};

// ---------------------------------------------------------------------------
// savedReportDefinitions
// ---------------------------------------------------------------------------

export const savedReportDefinitions = pgTable(
  "saved_report_definitions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    entity: text("entity").notNull(),
    columns: jsonb("columns").notNull().$type<string[]>(),
    customFieldIds: jsonb("custom_field_ids").notNull().$type<string[]>(),
    filters: jsonb("filters").notNull().$type<SavedReportFilter[]>(),
    sort: jsonb("sort").notNull().$type<SavedReportSort[]>(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgEntityIdx: index("saved_report_definitions_org_entity_idx").on(table.orgId, table.entity),
    orgUpdatedIdx: index("saved_report_definitions_org_updated_idx").on(
      table.orgId,
      table.updatedAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// savedSegments
// ---------------------------------------------------------------------------

export const savedSegments = pgTable("saved_segments", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(),
  filters: jsonb("filters").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// importHistory
// ---------------------------------------------------------------------------

export const importHistory = pgTable("import_history", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id").references(() => entities.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  entityType: text("entity_type").notNull(),
  filename: text("filename").notNull(),
  mapping: jsonb("mapping").notNull(),
  status: text("status").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  insertedRows: integer("inserted_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  summary: jsonb("summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// ---------------------------------------------------------------------------
// billingEvents — audit log used by both the mock and real Stripe providers.
// Previously named mock_billing_events; renamed in migration 0007 since real
// mode also writes here for auditability and the "mock" prefix is misleading.
// ---------------------------------------------------------------------------

export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id").notNull(),
    stripeEventId: text("stripe_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stripeEventIdUniqueIdx: uniqueIndex("billing_events_stripe_event_id_unique")
      .on(table.stripeEventId)
      .where(isNotNull(table.stripeEventId)),
  }),
);
// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const communicationLogRelations = relations(communicationLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [communicationLog.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [communicationLog.contactId],
    references: [contacts.id],
  }),
  loggedByUser: one(user, {
    fields: [communicationLog.loggedBy],
    references: [user.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, {
    fields: [documents.orgId],
    references: [organizations.id],
  }),
  uploadedByUser: one(user, {
    fields: [documents.uploadedBy],
    references: [user.id],
  }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [activityLog.orgId],
    references: [organizations.id],
  }),
  actor: one(user, {
    fields: [activityLog.actorId],
    references: [user.id],
  }),
}));

export const customFieldDefinitionsRelations = relations(
  customFieldDefinitions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [customFieldDefinitions.orgId],
      references: [organizations.id],
    }),
    values: many(customFieldValues),
  }),
);

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.fieldId],
    references: [customFieldDefinitions.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(user, {
    fields: [notificationPreferences.userId],
    references: [user.id],
  }),
  organization: one(organizations, {
    fields: [notificationPreferences.orgId],
    references: [organizations.id],
  }),
}));

export const userGuideProgressRelations = relations(userGuideProgress, ({ one }) => ({
  user: one(user, {
    fields: [userGuideProgress.userId],
    references: [user.id],
  }),
  organization: one(organizations, {
    fields: [userGuideProgress.orgId],
    references: [organizations.id],
  }),
}));

export const savedSegmentsRelations = relations(savedSegments, ({ one }) => ({
  organization: one(organizations, {
    fields: [savedSegments.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(user, {
    fields: [savedSegments.createdBy],
    references: [user.id],
  }),
}));

export const savedReportDefinitionsRelations = relations(savedReportDefinitions, ({ one }) => ({
  organization: one(organizations, {
    fields: [savedReportDefinitions.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(user, {
    fields: [savedReportDefinitions.createdBy],
    references: [user.id],
  }),
}));

export const importHistoryRelations = relations(importHistory, ({ one }) => ({
  organization: one(organizations, {
    fields: [importHistory.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [importHistory.userId],
    references: [user.id],
  }),
  entity: one(entities, {
    fields: [importHistory.entityId],
    references: [entities.id],
  }),
}));
