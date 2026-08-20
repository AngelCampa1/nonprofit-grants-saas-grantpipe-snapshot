import { relations, sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { chartOfAccounts, journalLines } from "./accounting";
import { organizations, user } from "./auth";
import { donations } from "./contacts";
import { generatedReports } from "./compliance";
import { expenses, funds, grants } from "./grants";
import { documents } from "./infrastructure";

export const restrictionTerms = pgTable(
  "restriction_terms",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    fundId: text("fund_id").references(() => funds.id),
    grantId: text("grant_id").references(() => grants.id),
    donationId: text("donation_id").references(() => donations.id),
    sourceDocumentId: text("source_document_id").references(() => documents.id),
    restrictionType: text("restriction_type").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    purposeStatement: text("purpose_statement"),
    releaseRule: text("release_rule"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    beginningBalanceCents: bigint("beginning_balance_cents", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    evidenceRequirement: text("evidence_requirement"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_terms_org_active_idx").on(table.orgId, table.deletedAt),
    index("restriction_terms_org_fund_idx").on(table.orgId, table.fundId),
    index("restriction_terms_org_grant_idx").on(table.orgId, table.grantId),
    index("restriction_terms_org_donation_idx").on(table.orgId, table.donationId),
  ],
);

export const restrictionBalances = pgTable(
  "restriction_balances",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionTermId: text("restriction_term_id")
      .notNull()
      .references(() => restrictionTerms.id),
    fundId: text("fund_id").references(() => funds.id),
    grantId: text("grant_id").references(() => grants.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    beginningBalanceCents: bigint("beginning_balance_cents", { mode: "number" }).notNull(),
    additionsCents: bigint("additions_cents", { mode: "number" }).notNull(),
    releasesCents: bigint("releases_cents", { mode: "number" }).notNull(),
    endingBalanceCents: bigint("ending_balance_cents", { mode: "number" }).notNull(),
    generatedReportId: text("generated_report_id").references(() => generatedReports.id),
    source: text("source").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_balances_org_term_idx").on(table.orgId, table.restrictionTermId),
    index("restriction_balances_org_period_idx").on(
      table.orgId,
      table.periodStart,
      table.periodEnd,
    ),
    uniqueIndex("restriction_balances_report_term_idx")
      .on(table.generatedReportId, table.restrictionTermId)
      .where(sql`${table.generatedReportId} is not null`),
  ],
);

export const restrictionAdditions = pgTable(
  "restriction_additions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionTermId: text("restriction_term_id")
      .notNull()
      .references(() => restrictionTerms.id),
    donationId: text("donation_id").references(() => donations.id),
    grantId: text("grant_id").references(() => grants.id),
    journalLineId: text("journal_line_id").references(() => journalLines.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    description: text("description"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_additions_org_term_idx").on(table.orgId, table.restrictionTermId),
    index("restriction_additions_org_date_idx").on(table.orgId, table.date),
  ],
);

export const restrictionReleases = pgTable(
  "restriction_releases",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionTermId: text("restriction_term_id")
      .notNull()
      .references(() => restrictionTerms.id),
    expenseId: text("expense_id").references(() => expenses.id),
    journalLineId: text("journal_line_id").references(() => journalLines.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("manual"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_releases_org_term_idx").on(table.orgId, table.restrictionTermId),
    index("restriction_releases_org_date_idx").on(table.orgId, table.date),
  ],
);

export const restrictionEvidenceLinks = pgTable(
  "restriction_evidence_links",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionReleaseId: text("restriction_release_id")
      .notNull()
      .references(() => restrictionReleases.id),
    documentId: text("document_id").references(() => documents.id),
    generatedReportId: text("generated_report_id").references(() => generatedReports.id),
    label: text("label").notNull(),
    evidenceType: text("evidence_type").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_evidence_links_org_release_idx").on(table.orgId, table.restrictionReleaseId),
  ],
);

export const restrictionAllowedPrograms = pgTable(
  "restriction_allowed_programs",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionTermId: text("restriction_term_id")
      .notNull()
      .references(() => restrictionTerms.id),
    program: text("program").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_allowed_programs_org_term_idx").on(table.orgId, table.restrictionTermId),
  ],
);

export const restrictionAllowedCategories = pgTable(
  "restriction_allowed_categories",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    restrictionTermId: text("restriction_term_id")
      .notNull()
      .references(() => restrictionTerms.id),
    category: text("category").notNull(),
    accountId: text("account_id").references(() => chartOfAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("restriction_allowed_categories_org_term_idx").on(table.orgId, table.restrictionTermId),
  ],
);

export const restrictionTermsRelations = relations(restrictionTerms, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [restrictionTerms.orgId],
    references: [organizations.id],
  }),
  fund: one(funds, { fields: [restrictionTerms.fundId], references: [funds.id] }),
  grant: one(grants, { fields: [restrictionTerms.grantId], references: [grants.id] }),
  donation: one(donations, {
    fields: [restrictionTerms.donationId],
    references: [donations.id],
  }),
  sourceDocument: one(documents, {
    fields: [restrictionTerms.sourceDocumentId],
    references: [documents.id],
  }),
  additions: many(restrictionAdditions),
  releases: many(restrictionReleases),
  balances: many(restrictionBalances),
  allowedPrograms: many(restrictionAllowedPrograms),
  allowedCategories: many(restrictionAllowedCategories),
}));

export const restrictionBalancesRelations = relations(restrictionBalances, ({ one }) => ({
  term: one(restrictionTerms, {
    fields: [restrictionBalances.restrictionTermId],
    references: [restrictionTerms.id],
  }),
}));

export const restrictionAdditionsRelations = relations(restrictionAdditions, ({ one }) => ({
  term: one(restrictionTerms, {
    fields: [restrictionAdditions.restrictionTermId],
    references: [restrictionTerms.id],
  }),
}));

export const restrictionReleasesRelations = relations(restrictionReleases, ({ one, many }) => ({
  term: one(restrictionTerms, {
    fields: [restrictionReleases.restrictionTermId],
    references: [restrictionTerms.id],
  }),
  evidenceLinks: many(restrictionEvidenceLinks),
}));

export const restrictionEvidenceLinksRelations = relations(restrictionEvidenceLinks, ({ one }) => ({
  release: one(restrictionReleases, {
    fields: [restrictionEvidenceLinks.restrictionReleaseId],
    references: [restrictionReleases.id],
  }),
  document: one(documents, {
    fields: [restrictionEvidenceLinks.documentId],
    references: [documents.id],
  }),
  generatedReport: one(generatedReports, {
    fields: [restrictionEvidenceLinks.generatedReportId],
    references: [generatedReports.id],
  }),
}));

export const restrictionAllowedProgramsRelations = relations(
  restrictionAllowedPrograms,
  ({ one }) => ({
    term: one(restrictionTerms, {
      fields: [restrictionAllowedPrograms.restrictionTermId],
      references: [restrictionTerms.id],
    }),
  }),
);

export const restrictionAllowedCategoriesRelations = relations(
  restrictionAllowedCategories,
  ({ one }) => ({
    term: one(restrictionTerms, {
      fields: [restrictionAllowedCategories.restrictionTermId],
      references: [restrictionTerms.id],
    }),
    account: one(chartOfAccounts, {
      fields: [restrictionAllowedCategories.accountId],
      references: [chartOfAccounts.id],
    }),
  }),
);
