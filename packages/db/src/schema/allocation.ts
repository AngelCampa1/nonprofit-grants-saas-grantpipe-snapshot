import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { chartOfAccounts } from "./accounting";
import { organizations } from "./auth";
import { programs } from "./programs";

// ---------------------------------------------------------------------------
// allocation_bases
// ---------------------------------------------------------------------------

export const allocationBases = pgTable(
  "allocation_bases",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    method: text("method").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("allocation_bases_org_status_idx").on(table.orgId, table.status)],
);

export type AllocationBase = typeof allocationBases.$inferSelect;
export type NewAllocationBase = typeof allocationBases.$inferInsert;

// ---------------------------------------------------------------------------
// allocation_targets
// ---------------------------------------------------------------------------

export const allocationTargets = pgTable(
  "allocation_targets",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    baseId: text("base_id")
      .notNull()
      .references(() => allocationBases.id),
    functionalClass: text("functional_class").notNull(),
    programId: text("program_id").references(() => programs.id),
    label: text("label"),
    weightBasisPoints: integer("weight_basis_points").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("allocation_targets_org_base_idx").on(table.orgId, table.baseId)],
);

export type AllocationTarget = typeof allocationTargets.$inferSelect;
export type NewAllocationTarget = typeof allocationTargets.$inferInsert;

// ---------------------------------------------------------------------------
// allocation_rules
// ---------------------------------------------------------------------------

export const allocationRules = pgTable(
  "allocation_rules",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => chartOfAccounts.id),
    baseId: text("base_id")
      .notNull()
      .references(() => allocationBases.id),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("allocation_rules_org_account_idx").on(table.orgId, table.accountId),
    index("allocation_rules_org_base_idx").on(table.orgId, table.baseId),
    uniqueIndex("allocation_rules_one_active_account_idx")
      .on(table.orgId, table.accountId)
      .where(sql`${table.status} = 'active' AND ${table.deletedAt} IS NULL`),
  ],
);

export type AllocationRule = typeof allocationRules.$inferSelect;
export type NewAllocationRule = typeof allocationRules.$inferInsert;

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const allocationBasesRelations = relations(allocationBases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [allocationBases.orgId],
    references: [organizations.id],
  }),
  targets: many(allocationTargets),
  rules: many(allocationRules),
}));

export const allocationTargetsRelations = relations(allocationTargets, ({ one }) => ({
  organization: one(organizations, {
    fields: [allocationTargets.orgId],
    references: [organizations.id],
  }),
  base: one(allocationBases, {
    fields: [allocationTargets.baseId],
    references: [allocationBases.id],
  }),
  program: one(programs, {
    fields: [allocationTargets.programId],
    references: [programs.id],
  }),
}));

export const allocationRulesRelations = relations(allocationRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [allocationRules.orgId],
    references: [organizations.id],
  }),
  base: one(allocationBases, {
    fields: [allocationRules.baseId],
    references: [allocationBases.id],
  }),
  account: one(chartOfAccounts, {
    fields: [allocationRules.accountId],
    references: [chartOfAccounts.id],
  }),
}));
