import {
  pgTable,
  text,
  timestamp,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  uniqueIndex,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/** Stored as JSONB: feature area to permission level. Validated by shared validators. */
type PermissionRecord = Record<string, string> | null;

// ---------------------------------------------------------------------------
// Better Auth core tables
// Column names must match Better Auth's expectations exactly.
// Better Auth's Drizzle adapter expects snake_case DB column names.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// GrantPipe application tables
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ein: text("ein"),
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
    timezone: text("timezone").notNull().default("America/New_York"),
    logoUrl: text("logo_url"),
    address: text("address"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeStateEventCreatedAt: timestamp("stripe_state_event_created_at", { withTimezone: true }),
    stripeStateEventId: text("stripe_state_event_id"),
    stripeStateEventPriority: integer("stripe_state_event_priority"),
    planTier: text("plan_tier").notNull().default("starter"),
    billingCycle: text("billing_cycle").notNull().default("monthly"),
    subscriptionStatus: text("subscription_status").notNull().default("trialing"),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    trialWillEndNotifiedAt: timestamp("trial_will_end_notified_at", { withTimezone: true }),
    trialWrapupClaimedAt: timestamp("trial_wrapup_claimed_at", { withTimezone: true }),
    trialWrapupClaimToken: text("trial_wrapup_claim_token"),
    trialWrapupClaimedForEndAt: timestamp("trial_wrapup_claimed_for_end_at", {
      withTimezone: true,
    }),
    trialWrapupNotifiedForEndAt: timestamp("trial_wrapup_notified_for_end_at", {
      withTimezone: true,
    }),
    trialWrapupScheduledForEndAt: timestamp("trial_wrapup_scheduled_for_end_at", {
      withTimezone: true,
    }),
    trialExpiredEventAt: timestamp("trial_expired_event_at", { withTimezone: true }),
    promoCodeApplied: text("promo_code_applied"),
    planSelectedAt: timestamp("plan_selected_at", { withTimezone: true }),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    onboardingGoal: text("onboarding_goal"),
    accountingEnabled: boolean("accounting_enabled").notNull().default(false),
    defaultEntityId: text("default_entity_id").references((): AnyPgColumn => entities.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // One Stripe customer maps to at most one org. Partial index so the many
    // orgs without a customer (NULL) don't collide; prevents cross-tenant
    // billing mutation if a customer id were ever duplicated across orgs.
    uniqueIndex("organizations_stripe_customer_id_unique")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
    unique("organizations_id_default_entity_id_unique").on(table.id, table.defaultEntityId),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    parentEntityId: text("parent_entity_id").references((): AnyPgColumn => entities.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("root"),
    status: text("status").notNull().default("active"),
    fiscalSponsorModel: text("fiscal_sponsor_model").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("entities_org_status_idx").on(table.orgId, table.status),
    unique("entities_org_id_id_unique").on(table.orgId, table.id),
    uniqueIndex("entities_org_name_active_idx")
      .on(table.orgId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "entities_kind_chk",
      sql`${table.kind} IN ('root', 'legal_entity', 'sponsored_project', 'agency_client', 'consolidation_group')`,
    ),
    check("entities_status_chk", sql`${table.status} IN ('active', 'archived')`),
    check(
      "entities_fiscal_sponsor_model_chk",
      sql`${table.fiscalSponsorModel} IN ('none', 'model_a', 'model_c')`,
    ),
    foreignKey({
      name: "entities_parent_same_org_fk",
      columns: [table.orgId, table.parentEntityId],
      foreignColumns: [table.orgId, table.id],
    }),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull().default("viewer"),
    permissions: jsonb("permissions").$type<PermissionRecord>(),
    invitedBy: text("invited_by").references(() => user.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("org_members_org_user_idx").on(table.orgId, table.userId),
    unique("org_members_org_id_id_unique").on(table.orgId, table.id),
  ],
);

export const entityMembers = pgTable(
  "entity_members",
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
    orgMemberId: text("org_member_id")
      .notNull()
      .references(() => orgMembers.id),
    role: text("role").notNull().default("viewer"),
    permissions: jsonb("permissions").$type<PermissionRecord>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("entity_members_org_idx").on(table.orgId),
    index("entity_members_entity_idx").on(table.entityId),
    index("entity_members_org_member_idx").on(table.orgMemberId),
    uniqueIndex("entity_members_entity_org_member_active_idx")
      .on(table.entityId, table.orgMemberId)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "entity_members_role_chk",
      sql`${table.role} IN ('admin', 'editor', 'viewer', 'auditor')`,
    ),
    foreignKey({
      name: "entity_members_org_entity_fk",
      columns: [table.orgId, table.entityId],
      foreignColumns: [entities.orgId, entities.id],
    }),
    foreignKey({
      name: "entity_members_org_member_same_org_fk",
      columns: [table.orgId, table.orgMemberId],
      foreignColumns: [orgMembers.orgId, orgMembers.id],
    }),
  ],
);

export const inviteLinks = pgTable(
  "invite_links",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id").references(() => entities.id),
    token: text("token").notNull().unique(),
    mode: text("mode").notNull().default("shareable"),
    email: text("email"),
    role: text("role").notNull().default("viewer"),
    permissions: jsonb("permissions").$type<PermissionRecord>(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedBy: text("used_by").references(() => user.id),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "invite_links_org_entity_fk",
      columns: [table.orgId, table.entityId],
      foreignColumns: [entities.orgId, entities.id],
    }),
  ],
);

export const trialEmailSchedule = pgTable(
  "trial_email_schedule",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    emailKind: text("email_kind").notNull(),
    trialDeadlineAt: timestamp("trial_deadline_at", { withTimezone: true }),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    deliverySnapshot: jsonb("delivery_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserNonWrapupUniqueIdx: uniqueIndex("trial_email_schedule_org_user_non_wrapup_unique")
      .on(table.orgId, table.userId, table.emailKind)
      .where(sql`${table.emailKind} <> 'trial_wrapup'`),
    orgWrapupUniqueIdx: uniqueIndex("trial_email_schedule_org_wrapup_deadline_unique")
      .on(table.orgId, table.trialDeadlineAt)
      .where(sql`${table.emailKind} = 'trial_wrapup' AND ${table.sentAt} IS NULL`),
    dueIdx: index("trial_email_schedule_due_idx").on(table.sendAfter),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  orgMembers: many(orgMembers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  defaultEntity: one(entities, {
    fields: [organizations.defaultEntityId],
    references: [entities.id],
    relationName: "organizationDefaultEntity",
  }),
  entities: many(entities),
  members: many(orgMembers),
  inviteLinks: many(inviteLinks),
}));

export const trialEmailScheduleRelations = relations(trialEmailSchedule, ({ one }) => ({
  organization: one(organizations, {
    fields: [trialEmailSchedule.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [trialEmailSchedule.userId],
    references: [user.id],
  }),
}));

export const orgMembersRelations = relations(orgMembers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [orgMembers.userId],
    references: [user.id],
  }),
  inviter: one(user, {
    fields: [orgMembers.invitedBy],
    references: [user.id],
    relationName: "inviter",
  }),
  entityMembers: many(entityMembers),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [entities.orgId],
    references: [organizations.id],
  }),
  defaultForOrganization: one(organizations, {
    fields: [entities.id],
    references: [organizations.defaultEntityId],
    relationName: "organizationDefaultEntity",
  }),
  parentEntity: one(entities, {
    fields: [entities.parentEntityId],
    references: [entities.id],
    relationName: "entityHierarchy",
  }),
  childEntities: many(entities, { relationName: "entityHierarchy" }),
  members: many(entityMembers),
  inviteLinks: many(inviteLinks),
}));

export const entityMembersRelations = relations(entityMembers, ({ one }) => ({
  entity: one(entities, {
    fields: [entityMembers.entityId],
    references: [entities.id],
  }),
  orgMember: one(orgMembers, {
    fields: [entityMembers.orgMemberId],
    references: [orgMembers.id],
  }),
}));

export const inviteLinksRelations = relations(inviteLinks, ({ one }) => ({
  organization: one(organizations, {
    fields: [inviteLinks.orgId],
    references: [organizations.id],
  }),
  entity: one(entities, {
    fields: [inviteLinks.entityId],
    references: [entities.id],
  }),
  creator: one(user, {
    fields: [inviteLinks.createdBy],
    references: [user.id],
    relationName: "creator",
  }),
  acceptor: one(user, {
    fields: [inviteLinks.usedBy],
    references: [user.id],
    relationName: "acceptor",
  }),
}));
