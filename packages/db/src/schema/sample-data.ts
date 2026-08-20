import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const sampleDataRecords = pgTable(
  "sample_data_records",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    entityTable: text("entity_table").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("sample_data_records_org_idx").on(table.orgId),
    orgTableIdx: index("sample_data_records_org_table_idx").on(table.orgId, table.entityTable),
  }),
);

export type SampleDataRecord = typeof sampleDataRecords.$inferSelect;
export type NewSampleDataRecord = typeof sampleDataRecords.$inferInsert;
