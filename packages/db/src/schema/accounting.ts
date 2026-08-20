import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  index,
  uniqueIndex,
  unique,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "monthly",
  "quarterly",
  "annually",
]);
import { organizations, user } from "./auth";
import { funds, grants } from "./grants";

// ---------------------------------------------------------------------------
// chart_of_accounts
// ---------------------------------------------------------------------------

export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // "asset" | "liability" | "net_assets" | "revenue" | "expense"
    type: text("type").notNull(),
    subtype: text("subtype"),
    // Self-referential FK for account hierarchy — AnyPgColumn avoids circular init
    parentAccountId: text("parent_account_id").references((): AnyPgColumn => chartOfAccounts.id),
    // "unrestricted" | "temporarily_restricted" | "permanently_restricted"
    naturalRestriction: text("natural_restriction"),
    // "program" | "management" | "fundraising"
    functionalClass: text("functional_class"),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("chart_of_accounts_org_code_idx").on(table.orgId, table.code)],
);

// ---------------------------------------------------------------------------
// fiscal_periods
// ---------------------------------------------------------------------------

export const fiscalPeriods = pgTable("fiscal_periods", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  // "open" | "closed" | "locked"
  status: text("status").notNull().default("open"),
  closedBy: text("closed_by").references(() => user.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// journal_entries
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    // Sequential per org — app-generated, not auto-increment globally
    entryNumber: integer("entry_number").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    fiscalPeriodId: text("fiscal_period_id")
      .notNull()
      .references(() => fiscalPeriods.id),
    memo: text("memo"),
    // "manual" | "donation" | "expense" | "grant_allocation" | "grant_release"
    // | "grant_closeout" | "recurring" | "adjustment" | "opening_balance" | "year_end_close"
    // | "pledge"
    source: text("source").notNull(),
    // Name of the table that triggered auto-posting (e.g., "donations")
    sourceTable: text("source_table"),
    // ID of the source record
    sourceId: text("source_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    // User ID of who posted the entry
    postedBy: text("posted_by")
      .notNull()
      .references(() => user.id),
    // Self-referential FK for reversal tracking — AnyPgColumn avoids circular init
    reversedByEntryId: text("reversed_by_entry_id").references(
      (): AnyPgColumn => journalEntries.id,
    ),
    isAdjusting: boolean("is_adjusting").notNull().default(false),
    externalSourceSystem: text("external_source_system"),
    externalSourceObjectId: text("external_source_object_id"),
    externalSourceObjectType: text("external_source_object_type"),
    externalSourceSyncedAt: timestamp("external_source_synced_at", {
      withTimezone: true,
    }),
    externalSourceStatus: text("external_source_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // DB-level uniqueness prevents race conditions on concurrent entry number generation
    uniqueIndex("journal_entries_org_entry_number_idx").on(t.orgId, t.entryNumber),
    index("journal_entries_org_date_idx").on(t.orgId, t.date),
  ],
);

// ---------------------------------------------------------------------------
// bank_accounts
// ---------------------------------------------------------------------------

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Last 4 digits only, for display
  accountNumber: text("account_number"),
  // The cash account in the COA this bank account maps to
  glAccountId: text("gl_account_id").references(() => chartOfAccounts.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// bank_transactions
// ---------------------------------------------------------------------------

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    // Positive = credit/deposit, negative = debit/withdrawal
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    referenceNumber: text("reference_number"),
    // "unmatched" | "matched" | "ignored"
    status: text("status").notNull().default("unmatched"),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalSourceSystem: text("external_source_system"),
    externalSourceObjectId: text("external_source_object_id"),
    externalSourceObjectType: text("external_source_object_type"),
    externalSourceSyncedAt: timestamp("external_source_synced_at", {
      withTimezone: true,
    }),
    externalSourceStatus: text("external_source_status"),
  },
  (t) => [
    unique("bank_transactions_dedup_idx").on(
      t.bankAccountId,
      t.date,
      t.amountCents,
      t.referenceNumber,
    ),
  ],
);

// ---------------------------------------------------------------------------
// bank_reconciliations
// ---------------------------------------------------------------------------

export const bankReconciliations = pgTable("bank_reconciliations", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  bankAccountId: text("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "cascade" }),
  statementDate: timestamp("statement_date", { withTimezone: true }).notNull(),
  statementEndingBalanceCents: bigint("statement_ending_balance_cents", {
    mode: "number",
  }).notNull(),
  // null = in-progress, set when completed
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// journal_lines
// ---------------------------------------------------------------------------

export const journalLines = pgTable("journal_lines", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  journalEntryId: text("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id),
  lineNumber: integer("line_number").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => chartOfAccounts.id),
  fundId: text("fund_id").references(() => funds.id),
  grantId: text("grant_id").references(() => grants.id),
  // Contact ID — stored as plain text, no FK (contacts live in a separate domain)
  contactId: text("contact_id"),
  debitCents: bigint("debit_cents", { mode: "number" }).notNull().default(0),
  creditCents: bigint("credit_cents", { mode: "number" }).notNull().default(0),
  memo: text("memo"),
  // Set when a JE line is locked to a reconciliation session
  reconciliationId: text("reconciliation_id").references(() => bankReconciliations.id, {
    onDelete: "set null",
  }),
  externalSourceSystem: text("external_source_system"),
  externalSourceObjectId: text("external_source_object_id"),
  externalSourceObjectType: text("external_source_object_type"),
  externalSourceSyncedAt: timestamp("external_source_synced_at", {
    withTimezone: true,
  }),
  externalSourceStatus: text("external_source_status"),
});

// ---------------------------------------------------------------------------
// accounting_integrations
// ---------------------------------------------------------------------------

export const accountingIntegrations = pgTable(
  "accounting_integrations",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("connected"),
    realmId: text("realm_id"),
    companyName: text("company_name"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    syncStartDate: timestamp("sync_start_date", { withTimezone: true }),
    enabledObjectTypes: jsonb("enabled_object_types").notNull().$type<string[]>(),
    autoCreateMappings: boolean("auto_create_mappings").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("accounting_integrations_org_provider_idx").on(t.orgId, t.provider),
    index("accounting_integrations_org_status_idx").on(t.orgId, t.status),
  ],
);

export const accountingOAuthStates = pgTable(
  "accounting_oauth_states",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounting_oauth_states_nonce_hash_idx").on(t.nonceHash),
    index("accounting_oauth_states_org_provider_idx").on(t.orgId, t.provider),
    index("accounting_oauth_states_expires_idx").on(t.expiresAt),
  ],
);

export const accountingSyncRuns = pgTable(
  "accounting_sync_runs",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => accountingIntegrations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    objectTypes: jsonb("object_types").notNull().$type<string[]>(),
    importedCount: integer("imported_count").notNull().default(0),
    unmappedCount: integer("unmapped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounting_sync_runs_integration_created_idx").on(t.integrationId, t.createdAt),
    index("accounting_sync_runs_org_status_idx").on(t.orgId, t.status),
    uniqueIndex("accounting_sync_runs_one_active_idx")
      .on(t.orgId, t.integrationId)
      .where(sql`${t.status} IN ('queued', 'running')`),
  ],
);

export const accountingSyncEvents = pgTable(
  "accounting_sync_events",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => accountingIntegrations.id, { onDelete: "cascade" }),
    syncRunId: text("sync_run_id").references(() => accountingSyncRuns.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    sourceObjectType: text("source_object_type"),
    sourceObjectId: text("source_object_id"),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounting_sync_events_integration_created_idx").on(t.integrationId, t.createdAt),
    index("accounting_sync_events_org_type_idx").on(t.orgId, t.eventType),
  ],
);

export const externalAccountingObjects = pgTable(
  "external_accounting_objects",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => accountingIntegrations.id, { onDelete: "cascade" }),
    sourceSystem: text("source_system").notNull(),
    sourceObjectType: text("source_object_type").notNull(),
    sourceObjectId: text("source_object_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    displayName: text("display_name"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    payloadHash: text("payload_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("external_accounting_objects_source_idx").on(
      t.orgId,
      t.sourceSystem,
      t.sourceObjectType,
      t.sourceObjectId,
    ),
    uniqueIndex("external_accounting_objects_idempotency_idx").on(t.orgId, t.idempotencyKey),
    index("external_accounting_objects_integration_type_idx").on(
      t.integrationId,
      t.sourceObjectType,
    ),
  ],
);

export const accountingDimensionMappings = pgTable(
  "accounting_dimension_mappings",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => accountingIntegrations.id, { onDelete: "cascade" }),
    externalObjectId: text("external_object_id")
      .notNull()
      .references(() => externalAccountingObjects.id, { onDelete: "cascade" }),
    targetType: text("target_type"),
    targetId: text("target_id"),
    status: text("status").notNull().default("unmapped"),
    mappedBy: text("mapped_by").references(() => user.id, { onDelete: "set null" }),
    mappedAt: timestamp("mapped_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("accounting_dimension_mappings_external_idx").on(t.orgId, t.externalObjectId),
    index("accounting_dimension_mappings_target_idx").on(t.orgId, t.targetType, t.targetId),
  ],
);

export const accountingSyncConflicts = pgTable(
  "accounting_sync_conflicts",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => accountingIntegrations.id, { onDelete: "cascade" }),
    externalObjectId: text("external_object_id")
      .notNull()
      .references(() => externalAccountingObjects.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    status: text("status").notNull().default("open"),
    fieldPath: text("field_path").notNull(),
    sourceValue: jsonb("source_value").$type<unknown>(),
    localValue: jsonb("local_value").$type<unknown>(),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounting_sync_conflicts_org_status_idx").on(t.orgId, t.status),
    index("accounting_sync_conflicts_integration_idx").on(t.integrationId),
    uniqueIndex("accounting_sync_conflicts_open_identity_idx")
      .on(t.orgId, t.integrationId, t.externalObjectId, t.targetType, t.targetId, t.fieldPath)
      .where(sql`${t.status} = 'open'`),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const chartOfAccountsRelations = relations(chartOfAccounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [chartOfAccounts.orgId],
    references: [organizations.id],
  }),
  parentAccount: one(chartOfAccounts, {
    fields: [chartOfAccounts.parentAccountId],
    references: [chartOfAccounts.id],
    relationName: "accountHierarchy",
  }),
  childAccounts: many(chartOfAccounts, { relationName: "accountHierarchy" }),
  journalLines: many(journalLines),
}));

export const fiscalPeriodsRelations = relations(fiscalPeriods, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [fiscalPeriods.orgId],
    references: [organizations.id],
  }),
  closedByUser: one(user, {
    fields: [fiscalPeriods.closedBy],
    references: [user.id],
  }),
  journalEntries: many(journalEntries),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [journalEntries.orgId],
    references: [organizations.id],
  }),
  fiscalPeriod: one(fiscalPeriods, {
    fields: [journalEntries.fiscalPeriodId],
    references: [fiscalPeriods.id],
  }),
  postedByUser: one(user, {
    fields: [journalEntries.postedBy],
    references: [user.id],
  }),
  reversedByEntry: one(journalEntries, {
    fields: [journalEntries.reversedByEntryId],
    references: [journalEntries.id],
    relationName: "entryReversal",
  }),
  reversalOf: many(journalEntries, { relationName: "entryReversal" }),
  lines: many(journalLines),
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  organization: one(organizations, {
    fields: [journalLines.orgId],
    references: [organizations.id],
  }),
  journalEntry: one(journalEntries, {
    fields: [journalLines.journalEntryId],
    references: [journalEntries.id],
  }),
  account: one(chartOfAccounts, {
    fields: [journalLines.accountId],
    references: [chartOfAccounts.id],
  }),
  fund: one(funds, {
    fields: [journalLines.fundId],
    references: [funds.id],
  }),
  grant: one(grants, {
    fields: [journalLines.grantId],
    references: [grants.id],
  }),
  reconciliation: one(bankReconciliations, {
    fields: [journalLines.reconciliationId],
    references: [bankReconciliations.id],
  }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [bankAccounts.orgId],
    references: [organizations.id],
  }),
  glAccount: one(chartOfAccounts, {
    fields: [bankAccounts.glAccountId],
    references: [chartOfAccounts.id],
  }),
  transactions: many(bankTransactions),
  reconciliations: many(bankReconciliations),
}));

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [bankTransactions.orgId],
    references: [organizations.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [bankTransactions.bankAccountId],
    references: [bankAccounts.id],
  }),
  journalEntry: one(journalEntries, {
    fields: [bankTransactions.journalEntryId],
    references: [journalEntries.id],
  }),
}));

export const bankReconciliationsRelations = relations(bankReconciliations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [bankReconciliations.orgId],
    references: [organizations.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [bankReconciliations.bankAccountId],
    references: [bankAccounts.id],
  }),
  journalLines: many(journalLines),
}));

// ---------------------------------------------------------------------------
// RecurringTemplateLine — shape of each line stored in the JSONB column
// ---------------------------------------------------------------------------

export interface RecurringTemplateLine {
  accountId: string;
  fundId?: string;
  grantId?: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
}

// ---------------------------------------------------------------------------
// recurring_journal_templates
// ---------------------------------------------------------------------------

export const recurringJournalTemplates = pgTable("recurring_journal_templates", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  nextRunDate: timestamp("next_run_date", { withTimezone: true, mode: "date" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Optional target fiscal period override for generated JEs
  fiscalPeriodId: text("fiscal_period_id").references(() => fiscalPeriods.id, {
    onDelete: "set null",
  }),
  // Memo to stamp on generated journal entries
  memo: text("memo"),
  // Template lines as a JSON array of RecurringTemplateLine
  lines: jsonb("lines").notNull().$type<RecurringTemplateLine[]>(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Relations — recurringJournalTemplates
// ---------------------------------------------------------------------------

export const recurringJournalTemplatesRelations = relations(
  recurringJournalTemplates,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [recurringJournalTemplates.orgId],
      references: [organizations.id],
    }),
    fiscalPeriod: one(fiscalPeriods, {
      fields: [recurringJournalTemplates.fiscalPeriodId],
      references: [fiscalPeriods.id],
    }),
    createdByUser: one(user, {
      fields: [recurringJournalTemplates.createdBy],
      references: [user.id],
    }),
  }),
);
