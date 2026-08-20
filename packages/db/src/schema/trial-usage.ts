import { pgTable, text, timestamp, integer, index, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

// ---------------------------------------------------------------------------
// orgTrialFeatureUsage
//
// Records each tier-gated feature accessed by an organization while it is on
// a trial. Used at billing time to warn the user if their selected paid plan
// is below the highest tier they actually exercised during the trial.
//
// Only the higher tiers (growth, audit_ready, enterprise) are tracked —
// "starter" is the default and tracking it provides no signal.
// ---------------------------------------------------------------------------

export const orgTrialFeatureUsage = pgTable(
  "org_trial_feature_usage",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    requiredTier: text("required_tier").notNull(),
    firstUsedAt: timestamp("first_used_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    useCount: integer("use_count").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.orgId, table.requiredTier] }),
    index("org_trial_feature_usage_org_idx").on(table.orgId),
  ],
);

export const orgTrialFeatureUsageRelations = relations(orgTrialFeatureUsage, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgTrialFeatureUsage.orgId],
    references: [organizations.id],
  }),
}));
