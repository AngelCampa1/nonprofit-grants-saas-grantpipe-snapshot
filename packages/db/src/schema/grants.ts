import {
  index,
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { entities, organizations, user } from "./auth";
import { grantCloseoutItems, grantReportingRequirements, impactMetricEntries } from "./compliance";
// Imported lazily through the relations() thunk; the circular reference with
// ./programs is resolved at query-build time, not module-eval time.
import { expenseProgramAllocations, grantProgramAllocations } from "./programs";

type JsonRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// funders
// ---------------------------------------------------------------------------

export const funders = pgTable("funders", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // foundation | corporate | government | other
  website: text("website"),
  priorities: text("priorities"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// funderContacts
// ---------------------------------------------------------------------------

export const funderContacts = pgTable("funder_contacts", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  funderId: text("funder_id")
    .notNull()
    .references(() => funders.id),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// grants
// ---------------------------------------------------------------------------

export const grants = pgTable("grants", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  funderId: text("funder_id")
    .notNull()
    .references(() => funders.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("discovery"), // discovery | application | submitted | awarded | active | reporting | closeout | renewal | declined
  amountCents: bigint("amount_cents", { mode: "number" }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  applicationDeadline: timestamp("application_deadline", { withTimezone: true }),
  description: text("description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// funds
// ---------------------------------------------------------------------------

export const funds = pgTable("funds", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // temporarily_restricted | permanently_restricted | unrestricted
  description: text("description"),
  externalId: text("external_id"),
  restrictionPurpose: text("restriction_purpose"),
  restrictionSource: text("restriction_source"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// grantFundAllocations (many-to-many: grants ↔ funds)
// ---------------------------------------------------------------------------

export const grantFundAllocations = pgTable("grant_fund_allocations", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  fundId: text("fund_id")
    .notNull()
    .references(() => funds.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  allocatedAmountCents: bigint("allocated_amount_cents", { mode: "number" }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------------

export const expenses = pgTable("expenses", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id),
  grantId: text("grant_id").references(() => grants.id),
  fundId: text("fund_id").references(() => funds.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  description: text("description"),
  category: text("category"),
  // FK to chart_of_accounts.id enforced at DB level in migration 0018 (not declared
  // here to avoid circular imports: accounting.ts already imports from grants.ts).
  accountId: text("account_id"),
  vendor: text("vendor"),
  // When false the expense is explicitly excluded from reimbursement/drawdown requests.
  // Defaults to true so all expenses are eligible until explicitly excluded.
  reimbursable: boolean("reimbursable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// grantFederalAwardMetadata
// ---------------------------------------------------------------------------

export const grantFederalAwardMetadata = pgTable(
  "grant_federal_award_metadata",
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
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    assistanceListingNumber: text("assistance_listing_number"),
    assistanceListingTitle: text("assistance_listing_title"),
    federalAgency: text("federal_agency"),
    fain: text("fain"),
    passThroughEntityName: text("pass_through_entity_name"),
    passThroughIdentifyingNumber: text("pass_through_identifying_number"),
    programName: text("program_name"),
    clusterName: text("cluster_name"),
    sefaInclusionType: text("sefa_inclusion_type").notNull().default("cash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("grant_federal_award_metadata_grant_idx").on(table.grantId),
    index("grant_federal_award_metadata_org_idx").on(table.orgId),
    index("grant_federal_award_metadata_org_aln_idx").on(
      table.orgId,
      table.assistanceListingNumber,
    ),
    check(
      "grant_federal_award_metadata_inclusion_chk",
      sql`${table.sefaInclusionType} IN ('cash', 'noncash', 'loan', 'loan_guarantee')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// grantBudgetVersions
// ---------------------------------------------------------------------------

export const grantBudgetVersions = pgTable(
  "grant_budget_versions",
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
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("draft"),
    source: text("source").notNull().default("manual"),
    sourceDocumentId: text("source_document_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: text("approved_by_user_id").references(() => user.id),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededByVersionId: text("superseded_by_version_id"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_budget_versions_org_grant_idx").on(table.orgId, table.grantId),
    uniqueIndex("grant_budget_versions_org_grant_number_idx").on(
      table.orgId,
      table.grantId,
      table.versionNumber,
    ),
    uniqueIndex("grant_budget_versions_one_approved_idx")
      .on(table.orgId, table.grantId)
      .where(sql`${table.status} = 'approved' AND ${table.deletedAt} IS NULL`),
    check(
      "grant_budget_versions_status_chk",
      sql`${table.status} IN ('draft', 'approved', 'superseded')`,
    ),
    check(
      "grant_budget_versions_source_chk",
      sql`${table.source} IN ('manual', 'document_intake', 'amendment')`,
    ),
  ],
);

export const grantBudgetPeriods = pgTable(
  "grant_budget_periods",
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
    budgetVersionId: text("budget_version_id")
      .notNull()
      .references(() => grantBudgetVersions.id),
    label: text("label").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_budget_periods_org_version_idx").on(table.orgId, table.budgetVersionId),
    check("grant_budget_periods_date_order_chk", sql`${table.startDate} <= ${table.endDate}`),
  ],
);

export const grantBudgetLines = pgTable(
  "grant_budget_lines",
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
    budgetVersionId: text("budget_version_id")
      .notNull()
      .references(() => grantBudgetVersions.id),
    budgetPeriodId: text("budget_period_id").references(() => grantBudgetPeriods.id),
    category: text("category").notNull(),
    description: text("description"),
    approvedAmountCents: bigint("approved_amount_cents", { mode: "number" }).notNull(),
    allowable: boolean("allowable").notNull().default(true),
    costType: text("cost_type").notNull().default("direct"),
    programId: text("program_id"),
    fundId: text("fund_id").references(() => funds.id),
    accountingDimensionCode: text("accounting_dimension_code"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_budget_lines_org_version_idx").on(table.orgId, table.budgetVersionId),
    index("grant_budget_lines_org_period_idx").on(table.orgId, table.budgetPeriodId),
    index("grant_budget_lines_org_fund_idx").on(table.orgId, table.fundId),
    check("grant_budget_lines_amount_nonnegative_chk", sql`${table.approvedAmountCents} >= 0`),
    check("grant_budget_lines_cost_type_chk", sql`${table.costType} IN ('direct', 'indirect')`),
  ],
);

export const grantBudgetLineAllocations = pgTable(
  "grant_budget_line_allocations",
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
    expenseId: text("expense_id").references(() => expenses.id),
    journalLineId: text("journal_line_id"),
    budgetLineId: text("budget_line_id")
      .notNull()
      .references(() => grantBudgetLines.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_budget_line_allocations_org_expense_idx").on(table.orgId, table.expenseId),
    index("grant_budget_line_allocations_org_line_idx").on(table.orgId, table.budgetLineId),
    check("grant_budget_line_allocations_amount_positive_chk", sql`${table.amountCents} > 0`),
  ],
);

export const plannedExpenses = pgTable(
  "planned_expenses",
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
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    budgetLineId: text("budget_line_id")
      .notNull()
      .references(() => grantBudgetLines.id),
    budgetPeriodId: text("budget_period_id").references(() => grantBudgetPeriods.id),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    expectedDate: timestamp("expected_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("planned"),
    convertedExpenseId: text("converted_expense_id").references(() => expenses.id),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("planned_expenses_org_grant_idx").on(table.orgId, table.grantId),
    index("planned_expenses_org_line_idx").on(table.orgId, table.budgetLineId),
    check("planned_expenses_amount_positive_chk", sql`${table.amountCents} > 0`),
    check(
      "planned_expenses_status_chk",
      sql`${table.status} IN ('planned', 'committed', 'cancelled', 'converted')`,
    ),
  ],
);

export const grantBudgetAmendments = pgTable(
  "grant_budget_amendments",
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
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    previousBudgetVersionId: text("previous_budget_version_id")
      .notNull()
      .references(() => grantBudgetVersions.id),
    newBudgetVersionId: text("new_budget_version_id")
      .notNull()
      .references(() => grantBudgetVersions.id),
    reason: text("reason").notNull(),
    effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
    supportingDocumentId: text("supporting_document_id"),
    requestedByUserId: text("requested_by_user_id").references(() => user.id),
    approvedByUserId: text("approved_by_user_id").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_budget_amendments_org_grant_idx").on(table.orgId, table.grantId),
    index("grant_budget_amendments_org_previous_idx").on(
      table.orgId,
      table.previousBudgetVersionId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// grantImpactMetrics
// ---------------------------------------------------------------------------

export const grantImpactMetrics = pgTable("grant_impact_metrics", {
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
  name: text("name").notNull(),
  targetValue: numeric("target_value"),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// grantOpportunities
// ---------------------------------------------------------------------------

export const grantOpportunities = pgTable(
  "grant_opportunities",
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
    source: text("source").notNull().default("grants.gov"),
    sourceType: text("source_type").notNull().default("federal"),
    sourceName: text("source_name").notNull().default("Grants.gov"),
    sourceUrl: text("source_url"),
    funderType: text("funder_type").notNull().default("government"),
    deadlineSource: text("deadline_source").notNull().default("grants_gov"),
    externalId: text("external_id"),
    sourceOpportunityId: text("source_opportunity_id").notNull(),
    opportunityNumber: text("opportunity_number"),
    title: text("title").notNull(),
    agencyName: text("agency_name"),
    status: text("status"),
    postedDate: timestamp("posted_date", { withTimezone: true }),
    closeDate: timestamp("close_date", { withTimezone: true }),
    awardFloorCents: bigint("award_floor_cents", { mode: "number" }),
    awardCeilingCents: bigint("award_ceiling_cents", { mode: "number" }),
    eligibleApplicants: jsonb("eligible_applicants").$type<string[]>(),
    fundingCategories: jsonb("funding_categories").$type<string[]>(),
    officialUrl: text("official_url"),
    rawPayload: jsonb("raw_payload").$type<JsonRecord>(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("grant_opportunities_org_source_idx").on(
      table.orgId,
      table.entityId,
      table.source,
      table.sourceOpportunityId,
    ),
    index("grant_opportunities_org_close_date_idx").on(
      table.orgId,
      table.entityId,
      table.closeDate,
    ),
  ],
);

// ---------------------------------------------------------------------------
// grantOpportunitySavedSearches
// ---------------------------------------------------------------------------

export const grantOpportunitySavedSearches = pgTable(
  "grant_opportunity_saved_searches",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    createdBy: text("created_by").references(() => user.id),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<JsonRecord>().notNull(),
    emailRemindersEnabled: boolean("email_reminders_enabled").notNull().default(true),
    reminderDaysBeforeDeadline: integer("reminder_days_before_deadline").notNull().default(14),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("grant_opportunity_saved_searches_org_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// grantOpportunityActions
// ---------------------------------------------------------------------------

export const grantOpportunityActions = pgTable(
  "grant_opportunity_actions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => grantOpportunities.id),
    userId: text("user_id").references(() => user.id),
    state: text("state").notNull(),
    ownerUserId: text("owner_user_id").references(() => user.id),
    notes: text("notes"),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    convertedGrantId: text("converted_grant_id").references(() => grants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("grant_opportunity_actions_org_opportunity_idx").on(
      table.orgId,
      table.opportunityId,
    ),
    index("grant_opportunity_actions_org_state_idx").on(table.orgId, table.state),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const fundersRelations = relations(funders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [funders.orgId],
    references: [organizations.id],
  }),
  contacts: many(funderContacts),
  grants: many(grants),
}));

export const funderContactsRelations = relations(funderContacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [funderContacts.orgId],
    references: [organizations.id],
  }),
  funder: one(funders, {
    fields: [funderContacts.funderId],
    references: [funders.id],
  }),
}));

export const grantsRelations = relations(grants, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grants.orgId],
    references: [organizations.id],
  }),
  funder: one(funders, {
    fields: [grants.funderId],
    references: [funders.id],
  }),
  fundAllocations: many(grantFundAllocations),
  expenses: many(expenses),
  budgetVersions: many(grantBudgetVersions),
  plannedExpenses: many(plannedExpenses),
  budgetAmendments: many(grantBudgetAmendments),
  impactMetrics: many(grantImpactMetrics),
  reportingRequirements: many(grantReportingRequirements),
  closeoutItems: many(grantCloseoutItems),
  programAllocations: many(grantProgramAllocations),
  federalAwardMetadata: one(grantFederalAwardMetadata, {
    fields: [grants.id],
    references: [grantFederalAwardMetadata.grantId],
  }),
}));

export const grantFederalAwardMetadataRelations = relations(
  grantFederalAwardMetadata,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantFederalAwardMetadata.orgId],
      references: [organizations.id],
    }),
    entity: one(entities, {
      fields: [grantFederalAwardMetadata.entityId],
      references: [entities.id],
    }),
    grant: one(grants, {
      fields: [grantFederalAwardMetadata.grantId],
      references: [grants.id],
    }),
  }),
);

export const fundsRelations = relations(funds, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [funds.orgId],
    references: [organizations.id],
  }),
  grantAllocations: many(grantFundAllocations),
  expenses: many(expenses),
}));

export const grantFundAllocationsRelations = relations(grantFundAllocations, ({ one }) => ({
  grant: one(grants, {
    fields: [grantFundAllocations.grantId],
    references: [grants.id],
  }),
  fund: one(funds, {
    fields: [grantFundAllocations.fundId],
    references: [funds.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [expenses.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [expenses.grantId],
    references: [grants.id],
  }),
  fund: one(funds, {
    fields: [expenses.fundId],
    references: [funds.id],
  }),
  budgetAllocations: many(grantBudgetLineAllocations),
  programAllocations: many(expenseProgramAllocations),
}));

export const grantBudgetVersionsRelations = relations(grantBudgetVersions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantBudgetVersions.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantBudgetVersions.grantId],
    references: [grants.id],
  }),
  periods: many(grantBudgetPeriods),
  lines: many(grantBudgetLines),
}));

export const grantBudgetPeriodsRelations = relations(grantBudgetPeriods, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantBudgetPeriods.orgId],
    references: [organizations.id],
  }),
  budgetVersion: one(grantBudgetVersions, {
    fields: [grantBudgetPeriods.budgetVersionId],
    references: [grantBudgetVersions.id],
  }),
  lines: many(grantBudgetLines),
  plannedExpenses: many(plannedExpenses),
}));

export const grantBudgetLinesRelations = relations(grantBudgetLines, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantBudgetLines.orgId],
    references: [organizations.id],
  }),
  budgetVersion: one(grantBudgetVersions, {
    fields: [grantBudgetLines.budgetVersionId],
    references: [grantBudgetVersions.id],
  }),
  budgetPeriod: one(grantBudgetPeriods, {
    fields: [grantBudgetLines.budgetPeriodId],
    references: [grantBudgetPeriods.id],
  }),
  fund: one(funds, {
    fields: [grantBudgetLines.fundId],
    references: [funds.id],
  }),
  allocations: many(grantBudgetLineAllocations),
  plannedExpenses: many(plannedExpenses),
}));

export const grantBudgetLineAllocationsRelations = relations(
  grantBudgetLineAllocations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantBudgetLineAllocations.orgId],
      references: [organizations.id],
    }),
    expense: one(expenses, {
      fields: [grantBudgetLineAllocations.expenseId],
      references: [expenses.id],
    }),
    budgetLine: one(grantBudgetLines, {
      fields: [grantBudgetLineAllocations.budgetLineId],
      references: [grantBudgetLines.id],
    }),
  }),
);

export const plannedExpensesRelations = relations(plannedExpenses, ({ one }) => ({
  organization: one(organizations, {
    fields: [plannedExpenses.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [plannedExpenses.grantId],
    references: [grants.id],
  }),
  budgetLine: one(grantBudgetLines, {
    fields: [plannedExpenses.budgetLineId],
    references: [grantBudgetLines.id],
  }),
  budgetPeriod: one(grantBudgetPeriods, {
    fields: [plannedExpenses.budgetPeriodId],
    references: [grantBudgetPeriods.id],
  }),
  convertedExpense: one(expenses, {
    fields: [plannedExpenses.convertedExpenseId],
    references: [expenses.id],
  }),
}));

export const grantBudgetAmendmentsRelations = relations(grantBudgetAmendments, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantBudgetAmendments.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantBudgetAmendments.grantId],
    references: [grants.id],
  }),
  previousBudgetVersion: one(grantBudgetVersions, {
    fields: [grantBudgetAmendments.previousBudgetVersionId],
    references: [grantBudgetVersions.id],
  }),
  newBudgetVersion: one(grantBudgetVersions, {
    fields: [grantBudgetAmendments.newBudgetVersionId],
    references: [grantBudgetVersions.id],
  }),
}));

export const grantImpactMetricsRelations = relations(grantImpactMetrics, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantImpactMetrics.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantImpactMetrics.grantId],
    references: [grants.id],
  }),
  entries: many(impactMetricEntries),
}));

export const grantOpportunitiesRelations = relations(grantOpportunities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantOpportunities.orgId],
    references: [organizations.id],
  }),
  entity: one(entities, {
    fields: [grantOpportunities.entityId],
    references: [entities.id],
  }),
  actions: many(grantOpportunityActions),
}));

export const grantOpportunitySavedSearchesRelations = relations(
  grantOpportunitySavedSearches,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantOpportunitySavedSearches.orgId],
      references: [organizations.id],
    }),
    creator: one(user, {
      fields: [grantOpportunitySavedSearches.createdBy],
      references: [user.id],
    }),
  }),
);

export const grantOpportunityActionsRelations = relations(grantOpportunityActions, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantOpportunityActions.orgId],
    references: [organizations.id],
  }),
  opportunity: one(grantOpportunities, {
    fields: [grantOpportunityActions.opportunityId],
    references: [grantOpportunities.id],
  }),
  convertedGrant: one(grants, {
    fields: [grantOpportunityActions.convertedGrantId],
    references: [grants.id],
  }),
  owner: one(user, {
    fields: [grantOpportunityActions.ownerUserId],
    references: [user.id],
  }),
}));
