import { isNull, relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, user } from "./auth";
import { grantReportingRequirements } from "./compliance";
import { expenses, funds, grantImpactMetrics, grants } from "./grants";

export const programs = pgTable(
  "programs",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    ownerUserId: text("owner_user_id").references(() => user.id),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("programs_org_name_idx").on(table.orgId, table.name),
    uniqueIndex("programs_org_code_active_idx")
      .on(table.orgId, table.code)
      .where(isNull(table.deletedAt)),
  ],
);

export const programBudgets = pgTable(
  "program_budgets",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("program_budgets_org_program_period_idx").on(
      table.orgId,
      table.programId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const programBudgetLines = pgTable(
  "program_budget_lines",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    budgetId: text("budget_id")
      .notNull()
      .references(() => programBudgets.id),
    category: text("category").notNull(),
    budgetedCents: bigint("budgeted_cents", { mode: "number" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("program_budget_lines_org_budget_idx").on(table.orgId, table.budgetId)],
);

export const grantProgramAllocations = pgTable(
  "grant_program_allocations",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    amountCents: bigint("amount_cents", { mode: "number" }),
    percentBasisPoints: bigint("percent_basis_points", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_program_allocations_org_grant_idx").on(table.orgId, table.grantId),
    index("grant_program_allocations_org_program_idx").on(table.orgId, table.programId),
  ],
);

export const expenseProgramAllocations = pgTable(
  "expense_program_allocations",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    fundId: text("fund_id").references(() => funds.id),
    grantId: text("grant_id").references(() => grants.id),
    amountCents: bigint("amount_cents", { mode: "number" }),
    percentBasisPoints: bigint("percent_basis_points", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("expense_program_allocations_org_expense_idx").on(table.orgId, table.expenseId),
    index("expense_program_allocations_org_program_idx").on(table.orgId, table.programId),
  ],
);

export const programImpactMetricLinks = pgTable(
  "program_impact_metric_links",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    impactMetricId: text("impact_metric_id")
      .notNull()
      .references(() => grantImpactMetrics.id),
    grantId: text("grant_id").references(() => grants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("program_impact_metric_links_org_metric_idx")
      .on(table.orgId, table.impactMetricId, table.programId)
      .where(isNull(table.deletedAt)),
    index("program_impact_metric_links_org_program_idx").on(table.orgId, table.programId),
  ],
);

export const programReportingRequirementLinks = pgTable(
  "program_reporting_requirement_links",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    reportingRequirementId: text("reporting_requirement_id")
      .notNull()
      .references(() => grantReportingRequirements.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("program_reporting_requirement_links_org_requirement_idx")
      .on(table.orgId, table.reportingRequirementId, table.programId)
      .where(isNull(table.deletedAt)),
    index("program_reporting_requirement_links_org_program_idx").on(table.orgId, table.programId),
  ],
);

export const programsRelations = relations(programs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [programs.orgId],
    references: [organizations.id],
  }),
  owner: one(user, {
    fields: [programs.ownerUserId],
    references: [user.id],
  }),
  budgets: many(programBudgets),
  grantAllocations: many(grantProgramAllocations),
  expenseAllocations: many(expenseProgramAllocations),
  impactMetricLinks: many(programImpactMetricLinks),
  reportingRequirementLinks: many(programReportingRequirementLinks),
}));

export const programBudgetsRelations = relations(programBudgets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [programBudgets.orgId],
    references: [organizations.id],
  }),
  program: one(programs, {
    fields: [programBudgets.programId],
    references: [programs.id],
  }),
  lines: many(programBudgetLines),
}));

export const programBudgetLinesRelations = relations(programBudgetLines, ({ one }) => ({
  organization: one(organizations, {
    fields: [programBudgetLines.orgId],
    references: [organizations.id],
  }),
  budget: one(programBudgets, {
    fields: [programBudgetLines.budgetId],
    references: [programBudgets.id],
  }),
}));

export const grantProgramAllocationsRelations = relations(grantProgramAllocations, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantProgramAllocations.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantProgramAllocations.grantId],
    references: [grants.id],
  }),
  program: one(programs, {
    fields: [grantProgramAllocations.programId],
    references: [programs.id],
  }),
}));

export const expenseProgramAllocationsRelations = relations(
  expenseProgramAllocations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [expenseProgramAllocations.orgId],
      references: [organizations.id],
    }),
    expense: one(expenses, {
      fields: [expenseProgramAllocations.expenseId],
      references: [expenses.id],
    }),
    program: one(programs, {
      fields: [expenseProgramAllocations.programId],
      references: [programs.id],
    }),
    fund: one(funds, {
      fields: [expenseProgramAllocations.fundId],
      references: [funds.id],
    }),
    grant: one(grants, {
      fields: [expenseProgramAllocations.grantId],
      references: [grants.id],
    }),
  }),
);

export const programImpactMetricLinksRelations = relations(programImpactMetricLinks, ({ one }) => ({
  organization: one(organizations, {
    fields: [programImpactMetricLinks.orgId],
    references: [organizations.id],
  }),
  program: one(programs, {
    fields: [programImpactMetricLinks.programId],
    references: [programs.id],
  }),
  impactMetric: one(grantImpactMetrics, {
    fields: [programImpactMetricLinks.impactMetricId],
    references: [grantImpactMetrics.id],
  }),
  grant: one(grants, {
    fields: [programImpactMetricLinks.grantId],
    references: [grants.id],
  }),
}));

export const programReportingRequirementLinksRelations = relations(
  programReportingRequirementLinks,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [programReportingRequirementLinks.orgId],
      references: [organizations.id],
    }),
    program: one(programs, {
      fields: [programReportingRequirementLinks.programId],
      references: [programs.id],
    }),
    reportingRequirement: one(grantReportingRequirements, {
      fields: [programReportingRequirementLinks.reportingRequirementId],
      references: [grantReportingRequirements.id],
    }),
  }),
);
