import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./auth";

// ---------------------------------------------------------------------------
// ai_usage_events
//
// Append-only metering table. One row per billable AI action per org.
// Used to enforce per-feature monthly usage caps by counting rows per
// org + feature within a UTC calendar month.
//
// Supported features:
//   "award_intake"     — AI Award Document Intake (dedupes by referenceId = extractionId)
//   "ask_your_ledger"  — Ask-Your-Ledger query (referenceId is null; every call is counted)
//
// No soft-delete: rows are never updated or removed.
// ---------------------------------------------------------------------------

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    referenceId: text("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_usage_events_org_feature_created_idx").on(
      table.orgId,
      table.feature,
      table.createdAt,
    ),
    uniqueIndex("ai_usage_events_dedupe_idx")
      .on(table.orgId, table.feature, table.referenceId)
      .where(sql`reference_id is not null`),
  ],
);

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiUsageEvents.orgId],
    references: [organizations.id],
  }),
}));
