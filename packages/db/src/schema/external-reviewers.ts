import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, user } from "./auth";

// ---------------------------------------------------------------------------
// external_reviewers — people who may be invited to review org evidence
// ---------------------------------------------------------------------------

export const externalReviewers = pgTable(
  "external_reviewers",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** auditor | funder | board | other */
    reviewerType: text("reviewer_type").notNull(),
    organizationName: text("organization_name"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("external_reviewers_org_idx").on(table.orgId, table.deletedAt),
    index("external_reviewers_org_email_idx").on(table.orgId, table.email),
  ],
);

// ---------------------------------------------------------------------------
// external_review_sessions — one invite link = one session
// ---------------------------------------------------------------------------

export const externalReviewSessions = pgTable(
  "external_review_sessions",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => externalReviewers.id),
    /** SHA-256 HMAC of the raw token; raw token never stored */
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => user.id),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    // Legacy Workers send synchronously and omit this field. A completed default
    // keeps the migration-to-deploy window from redispatching those rows; all
    // durable writers explicitly insert pending.
    invitationDeliveryStatus: text("invitation_delivery_status").notNull().default("sent"),
    invitationDeliveryStartedAt: timestamp("invitation_delivery_started_at", {
      withTimezone: true,
    }),
    invitationDeliveryClaimedAt: timestamp("invitation_delivery_claimed_at", {
      withTimezone: true,
    }),
    invitationDeliverySentAt: timestamp("invitation_delivery_sent_at", { withTimezone: true }),
    invitationProviderId: text("invitation_provider_id"),
    invitationDeliveryError: text("invitation_delivery_error"),
    invitationDeliveryAttempt: integer("invitation_delivery_attempt").notNull().default(1),
    invitationDeliveryKind: text("invitation_delivery_kind").notNull().default("invite"),
    invitationDeliveryPayload: jsonb("invitation_delivery_payload").$type<{
      reviewerEmail: string;
      reviewerName: string;
      inviterName: string;
      orgName: string;
      purpose: string;
      expiresAt: string;
      deliveryKind: "invite" | "extension";
      requestFingerprint: string;
    }>(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("external_review_sessions_org_idx").on(table.orgId),
    index("external_review_sessions_reviewer_idx").on(table.reviewerId),
    index("external_review_sessions_token_hash_idx").on(table.tokenHash),
    index("external_review_sessions_invitation_delivery_idx").on(
      table.invitationDeliveryStatus,
      table.invitationDeliveryClaimedAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// external_review_scopes — which entities a session may access
// ---------------------------------------------------------------------------

export const externalReviewScopes = pgTable(
  "external_review_scopes",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => externalReviewSessions.id),
    /** grant | fund | program | document | generated_report | evidence_bundle |
     *  restriction_term | reimbursement_request | subrecipient_file */
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    grantedBy: text("granted_by").references(() => user.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.scopeType, table.scopeId] }),
    index("external_review_scopes_session_idx").on(table.sessionId),
    index("external_review_scopes_scope_idx").on(table.scopeType, table.scopeId),
  ],
);

// ---------------------------------------------------------------------------
// evidence_bundles — curated packages of evidence for a review cycle
// ---------------------------------------------------------------------------

export const evidenceBundles = pgTable(
  "evidence_bundles",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    description: text("description"),
    /** audit | funder_review | closeout | board_review | other */
    purpose: text("purpose").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("evidence_bundles_org_active_idx").on(table.orgId, table.deletedAt),
    index("evidence_bundles_org_purpose_idx").on(table.orgId, table.purpose),
  ],
);

// ---------------------------------------------------------------------------
// evidence_bundle_items — manifest of items in a bundle (no byte duplication)
// ---------------------------------------------------------------------------

export const evidenceBundleItems = pgTable(
  "evidence_bundle_items",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    bundleId: text("bundle_id")
      .notNull()
      .references(() => evidenceBundles.id),
    /** matches EXTERNAL_REVIEW_SCOPE_TYPES */
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("evidence_bundle_items_bundle_idx").on(table.bundleId),
    index("evidence_bundle_items_item_idx").on(table.itemType, table.itemId),
  ],
);

// ---------------------------------------------------------------------------
// external_review_audit_events — immutable append-only viewer activity log
// ---------------------------------------------------------------------------

export const externalReviewAuditEvents = pgTable(
  "external_review_audit_events",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => externalReviewSessions.id),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => externalReviewers.id),
    /** session_open | view | download | expired | revoked | extended | bundle_view */
    eventType: text("event_type").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** SHA-256(IP + secret) — keeps PII low while preserving anomaly detection */
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("external_review_audit_events_org_idx").on(table.orgId),
    index("external_review_audit_events_session_idx").on(table.sessionId),
    index("external_review_audit_events_reviewer_idx").on(table.reviewerId),
    index("external_review_audit_events_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const externalReviewersRelations = relations(externalReviewers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [externalReviewers.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(user, {
    fields: [externalReviewers.createdBy],
    references: [user.id],
  }),
  sessions: many(externalReviewSessions),
  auditEvents: many(externalReviewAuditEvents),
}));

export const externalReviewSessionsRelations = relations(
  externalReviewSessions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [externalReviewSessions.orgId],
      references: [organizations.id],
    }),
    reviewer: one(externalReviewers, {
      fields: [externalReviewSessions.reviewerId],
      references: [externalReviewers.id],
    }),
    revokedByUser: one(user, {
      fields: [externalReviewSessions.revokedBy],
      references: [user.id],
    }),
    createdByUser: one(user, {
      fields: [externalReviewSessions.createdBy],
      references: [user.id],
    }),
    scopes: many(externalReviewScopes),
    auditEvents: many(externalReviewAuditEvents),
  }),
);

export const externalReviewScopesRelations = relations(externalReviewScopes, ({ one }) => ({
  session: one(externalReviewSessions, {
    fields: [externalReviewScopes.sessionId],
    references: [externalReviewSessions.id],
  }),
  grantedByUser: one(user, {
    fields: [externalReviewScopes.grantedBy],
    references: [user.id],
  }),
}));

export const evidenceBundlesRelations = relations(evidenceBundles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [evidenceBundles.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(user, {
    fields: [evidenceBundles.createdBy],
    references: [user.id],
  }),
  items: many(evidenceBundleItems),
}));

export const evidenceBundleItemsRelations = relations(evidenceBundleItems, ({ one }) => ({
  bundle: one(evidenceBundles, {
    fields: [evidenceBundleItems.bundleId],
    references: [evidenceBundles.id],
  }),
}));

export const externalReviewAuditEventsRelations = relations(
  externalReviewAuditEvents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [externalReviewAuditEvents.orgId],
      references: [organizations.id],
    }),
    session: one(externalReviewSessions, {
      fields: [externalReviewAuditEvents.sessionId],
      references: [externalReviewSessions.id],
    }),
    reviewer: one(externalReviewers, {
      fields: [externalReviewAuditEvents.reviewerId],
      references: [externalReviewers.id],
    }),
  }),
);

// Inferred types exported for use in services
export type ExternalReviewer = typeof externalReviewers.$inferSelect;
export type NewExternalReviewer = typeof externalReviewers.$inferInsert;
export type ExternalReviewSession = typeof externalReviewSessions.$inferSelect;
export type NewExternalReviewSession = typeof externalReviewSessions.$inferInsert;
export type ExternalReviewScope = typeof externalReviewScopes.$inferSelect;
export type NewExternalReviewScope = typeof externalReviewScopes.$inferInsert;
export type EvidenceBundle = typeof evidenceBundles.$inferSelect;
export type NewEvidenceBundle = typeof evidenceBundles.$inferInsert;
export type EvidenceBundleItem = typeof evidenceBundleItems.$inferSelect;
export type NewEvidenceBundleItem = typeof evidenceBundleItems.$inferInsert;
export type ExternalReviewAuditEvent = typeof externalReviewAuditEvents.$inferSelect;
export type NewExternalReviewAuditEvent = typeof externalReviewAuditEvents.$inferInsert;
