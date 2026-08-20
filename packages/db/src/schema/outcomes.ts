import { relations } from "drizzle-orm";
import { boolean, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { grants, grantImpactMetrics } from "./grants";
import { programs } from "./programs";

export const outcomeGoals = pgTable(
  "outcome_goals",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    programId: text("program_id").references(() => programs.id),
    grantId: text("grant_id").references(() => grants.id),
    name: text("name").notNull(),
    statement: text("statement").notNull(),
    targetPopulation: text("target_population"),
    status: text("status").notNull().default("draft"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("outcome_goals_org_status_idx").on(table.orgId, table.status),
    index("outcome_goals_org_program_idx").on(table.orgId, table.programId),
    index("outcome_goals_org_grant_idx").on(table.orgId, table.grantId),
  ],
);

export const outcomeIndicators = pgTable(
  "outcome_indicators",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    outcomeId: text("outcome_id")
      .notNull()
      .references(() => outcomeGoals.id),
    impactMetricId: text("impact_metric_id").references(() => grantImpactMetrics.id),
    name: text("name").notNull(),
    indicatorType: text("indicator_type").notNull().default("outcome"),
    direction: text("direction").notNull().default("increase"),
    targetValue: numeric("target_value"),
    baselineValue: numeric("baseline_value"),
    unit: text("unit"),
    source: text("source"),
    funderDefined: boolean("funder_defined").notNull().default(false),
    reportingCadence: text("reporting_cadence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("outcome_indicators_org_outcome_idx").on(table.orgId, table.outcomeId),
    index("outcome_indicators_org_metric_idx").on(table.orgId, table.impactMetricId),
  ],
);

export const outcomeGoalsRelations = relations(outcomeGoals, ({ one, many }) => ({
  org: one(organizations, {
    fields: [outcomeGoals.orgId],
    references: [organizations.id],
  }),
  program: one(programs, {
    fields: [outcomeGoals.programId],
    references: [programs.id],
  }),
  grant: one(grants, {
    fields: [outcomeGoals.grantId],
    references: [grants.id],
  }),
  indicators: many(outcomeIndicators),
}));

export const outcomeIndicatorsRelations = relations(outcomeIndicators, ({ one }) => ({
  org: one(organizations, {
    fields: [outcomeIndicators.orgId],
    references: [organizations.id],
  }),
  outcome: one(outcomeGoals, {
    fields: [outcomeIndicators.outcomeId],
    references: [outcomeGoals.id],
  }),
  impactMetric: one(grantImpactMetrics, {
    fields: [outcomeIndicators.impactMetricId],
    references: [grantImpactMetrics.id],
  }),
}));
