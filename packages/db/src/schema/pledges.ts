import { bigint, boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";
import { contacts } from "./contacts";

// FKs to funds.id and grants.id are intentionally omitted here (no hard
// FK declaration) to avoid circular imports: grants.ts already imports
// contacts.ts indirectly, and contacts.ts would pull in grants.ts again.
// This mirrors how donations.fundId / donations.grantId are declared in
// contacts.ts ("FK added in grants schema phase" convention).

// ---------------------------------------------------------------------------
// pledges
// ---------------------------------------------------------------------------

export const pledges = pgTable(
  "pledges",
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
    // FK to funds.id — omitted to avoid circular import; enforced at migration level
    fundId: text("fund_id"),
    // FK to grants.id — omitted to avoid circular import; enforced at migration level
    grantId: text("grant_id"),
    status: text("status").notNull().default("active"),
    isConditional: boolean("is_conditional").notNull().default(false),
    hasBarrier: boolean("has_barrier").notNull().default(false),
    hasRightOfReturn: boolean("has_right_of_return").notNull().default(false),
    conditionNote: text("condition_note"),
    faceAmountCents: bigint("face_amount_cents", { mode: "number" }).notNull(),
    pledgeDate: timestamp("pledge_date", { withTimezone: true }).notNull(),
    discountRateBasisPoints: integer("discount_rate_basis_points").notNull().default(0),
    presentValueCents: bigint("present_value_cents", { mode: "number" }).notNull(),
    discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
    netAssetClass: text("net_asset_class").notNull().default("temporarily_restricted"),
    allowanceCents: bigint("allowance_cents", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pledges_org_status_pledge_date_idx").on(table.orgId, table.status, table.pledgeDate),
  ],
);

// ---------------------------------------------------------------------------
// pledge_installments
// ---------------------------------------------------------------------------

export const pledgeInstallments = pgTable(
  "pledge_installments",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    pledgeId: text("pledge_id")
      .notNull()
      .references(() => pledges.id),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: text("status").notNull().default("scheduled"),
    paidCents: bigint("paid_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pledge_installments_org_pledge_due_date_idx").on(
      table.orgId,
      table.pledgeId,
      table.dueDate,
    ),
  ],
);

// ---------------------------------------------------------------------------
// pledge_payments
// ---------------------------------------------------------------------------

export const pledgePayments = pgTable(
  "pledge_payments",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    pledgeId: text("pledge_id")
      .notNull()
      .references(() => pledges.id),
    installmentId: text("installment_id").references(() => pledgeInstallments.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    accretionCents: bigint("accretion_cents", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pledge_payments_org_pledge_payment_date_idx").on(
      table.orgId,
      table.pledgeId,
      table.paymentDate,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const pledgesRelations = relations(pledges, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [pledges.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [pledges.contactId],
    references: [contacts.id],
  }),
  installments: many(pledgeInstallments),
  payments: many(pledgePayments),
}));

export const pledgeInstallmentsRelations = relations(pledgeInstallments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [pledgeInstallments.orgId],
    references: [organizations.id],
  }),
  pledge: one(pledges, {
    fields: [pledgeInstallments.pledgeId],
    references: [pledges.id],
  }),
  payments: many(pledgePayments),
}));

export const pledgePaymentsRelations = relations(pledgePayments, ({ one }) => ({
  organization: one(organizations, {
    fields: [pledgePayments.orgId],
    references: [organizations.id],
  }),
  pledge: one(pledges, {
    fields: [pledgePayments.pledgeId],
    references: [pledges.id],
  }),
  installment: one(pledgeInstallments, {
    fields: [pledgePayments.installmentId],
    references: [pledgeInstallments.id],
  }),
}));
