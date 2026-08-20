import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations, user } from "./auth";
import { journalEntries, bankTransactions } from "./accounting";
import { grants, expenses } from "./grants";

// ---------------------------------------------------------------------------
// grant_payment_requests
// ---------------------------------------------------------------------------

export const grantPaymentRequests = pgTable(
  "grant_payment_requests",
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
    // Per-org sequential number for human-readable reference
    requestNumber: integer("request_number").notNull(),
    // "drawdown" | "reimbursement" | "invoice" | "advance_liquidation" | "other"
    type: text("type").notNull(),
    // "draft" | "submitted" | "partially_approved" | "approved" | "rejected" | "paid" | "closed"
    status: text("status").notNull().default("draft"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Cached sum of line amount_cents for list performance
    requestedAmountCents: bigint("requested_amount_cents", { mode: "number" }).notNull().default(0),
    approvedAmountCents: bigint("approved_amount_cents", { mode: "number" }).notNull().default(0),
    // Funder-assigned reference number (e.g. ASAP drawdown ID)
    funderReference: text("funder_reference"),
    notes: text("notes"),
    // When true, recording a payment auto-posts a journal entry
    autoPostJournalEntry: boolean("auto_post_journal_entry").notNull().default(false),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("grant_payment_requests_org_number_idx").on(table.orgId, table.requestNumber),
    index("grant_payment_requests_org_grant_status_idx").on(
      table.orgId,
      table.grantId,
      table.status,
    ),
    index("grant_payment_requests_org_status_idx").on(table.orgId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// grant_payment_request_lines
// ---------------------------------------------------------------------------

export const grantPaymentRequestLines = pgTable(
  "grant_payment_request_lines",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    requestId: text("request_id")
      .notNull()
      .references(() => grantPaymentRequests.id),
    // Null for indirect or adjustment lines that have no single linked expense
    expenseId: text("expense_id").references(() => expenses.id),
    // Reserved for future grant-budget-model integration
    budgetLineId: text("budget_line_id"),
    // "direct" | "indirect" | "adjustment" | "other"
    category: text("category").notNull().default("direct"),
    description: text("description"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    approvedAmountCents: bigint("approved_amount_cents", { mode: "number" }),
    rejectionReason: text("rejection_reason"),
    dedupReleasedAt: timestamp("dedup_released_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_payment_request_lines_org_request_idx").on(table.orgId, table.requestId),
    // Fast lookup for the dedup guard in line.service.ts
    index("grant_payment_request_lines_expense_idx").on(table.expenseId),
    uniqueIndex("grant_payment_request_lines_org_expense_active_idx")
      .on(table.orgId, table.expenseId)
      .where(
        sql`${table.expenseId} IS NOT NULL AND ${table.deletedAt} IS NULL AND ${table.dedupReleasedAt} IS NULL`,
      ),
  ],
);

// ---------------------------------------------------------------------------
// grant_payment_request_adjustments
// ---------------------------------------------------------------------------

export const grantPaymentRequestAdjustments = pgTable(
  "grant_payment_request_adjustments",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    requestId: text("request_id")
      .notNull()
      .references(() => grantPaymentRequests.id),
    // "reduction" | "increase" | "note" | "dedup_override"
    kind: text("kind").notNull(),
    // Null for note-only adjustments
    amountCents: bigint("amount_cents", { mode: "number" }),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_payment_request_adjustments_org_request_idx").on(table.orgId, table.requestId),
  ],
);

// ---------------------------------------------------------------------------
// grant_payments
// ---------------------------------------------------------------------------

export const grantPayments = pgTable(
  "grant_payments",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    requestId: text("request_id")
      .notNull()
      .references(() => grantPaymentRequests.id),
    // Denormalized for fast org-level reporting without joining through requests
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    receivedDate: timestamp("received_date", { withTimezone: true }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    referenceNumber: text("reference_number"),
    // "ach" | "wire" | "check" | "card" | "other"
    method: text("method"),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    bankTransactionId: text("bank_transaction_id").references(() => bankTransactions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("grant_payments_org_grant_date_idx").on(table.orgId, table.grantId, table.receivedDate),
    index("grant_payments_org_request_idx").on(table.orgId, table.requestId),
  ],
);

// ---------------------------------------------------------------------------
// grant_indirect_cost_rules  (Audit-Ready+)
// ---------------------------------------------------------------------------

export const grantIndirectCostRules = pgTable(
  "grant_indirect_cost_rules",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    // Null = org-wide default; non-null = grant-specific override
    grantId: text("grant_id").references(() => grants.id),
    // "direct_costs" | "salaries_only" | "modified_total_direct"
    base: text("base").notNull(),
    // Stored as basis points (e.g. 1000 = 10.00%)
    rateBasisPoints: integer("rate_basis_points").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("grant_indirect_cost_rules_org_grant_idx").on(table.orgId, table.grantId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const grantPaymentRequestsRelations = relations(grantPaymentRequests, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grantPaymentRequests.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantPaymentRequests.grantId],
    references: [grants.id],
  }),
  createdByUser: one(user, {
    fields: [grantPaymentRequests.createdBy],
    references: [user.id],
  }),
  lines: many(grantPaymentRequestLines),
  adjustments: many(grantPaymentRequestAdjustments),
  payments: many(grantPayments),
}));

export const grantPaymentRequestLinesRelations = relations(grantPaymentRequestLines, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantPaymentRequestLines.orgId],
    references: [organizations.id],
  }),
  request: one(grantPaymentRequests, {
    fields: [grantPaymentRequestLines.requestId],
    references: [grantPaymentRequests.id],
  }),
  expense: one(expenses, {
    fields: [grantPaymentRequestLines.expenseId],
    references: [expenses.id],
  }),
}));

export const grantPaymentRequestAdjustmentsRelations = relations(
  grantPaymentRequestAdjustments,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantPaymentRequestAdjustments.orgId],
      references: [organizations.id],
    }),
    request: one(grantPaymentRequests, {
      fields: [grantPaymentRequestAdjustments.requestId],
      references: [grantPaymentRequests.id],
    }),
    createdByUser: one(user, {
      fields: [grantPaymentRequestAdjustments.createdBy],
      references: [user.id],
    }),
  }),
);

export const grantPaymentsRelations = relations(grantPayments, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantPayments.orgId],
    references: [organizations.id],
  }),
  request: one(grantPaymentRequests, {
    fields: [grantPayments.requestId],
    references: [grantPaymentRequests.id],
  }),
  grant: one(grants, {
    fields: [grantPayments.grantId],
    references: [grants.id],
  }),
  journalEntry: one(journalEntries, {
    fields: [grantPayments.journalEntryId],
    references: [journalEntries.id],
  }),
  bankTransaction: one(bankTransactions, {
    fields: [grantPayments.bankTransactionId],
    references: [bankTransactions.id],
  }),
}));

export const grantIndirectCostRulesRelations = relations(grantIndirectCostRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantIndirectCostRules.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, {
    fields: [grantIndirectCostRules.grantId],
    references: [grants.id],
  }),
}));
