import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  primaryKey,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

// ---------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------

export const contacts = pgTable(
  "contacts",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    type: text("type").notNull(), // individual | organization
    firstName: text("first_name"),
    lastName: text("last_name"),
    organizationName: text("organization_name"),
    email: text("email"),
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    phone: text("phone"),
    address: text("address"),
    pipelineStage: text("pipeline_stage").notNull().default("prospect"),
    affiliatedOrgId: text("affiliated_org_id").references((): AnyPgColumn => contacts.id),
    isVolunteer: boolean("is_volunteer").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("contacts_org_id_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// donations
// ---------------------------------------------------------------------------

export const donations = pgTable(
  "donations",
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
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: text("type").notNull(), // one_time | recurring | pledge
    restriction: text("restriction").notNull().default("unrestricted"),
    // Three-way net-asset class resolved server-side at entry (drives the GL
    // revenue account on posting): unrestricted | temporarily_restricted |
    // permanently_restricted. `restriction` stays the binary human-facing flag.
    netAssetClass: text("net_asset_class").notNull().default("unrestricted"),
    fundId: text("fund_id"), // FK added in grants schema phase
    grantId: text("grant_id"), // FK added in grants schema phase
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    designation: text("designation"),
    goodsServicesValueCents: bigint("goods_services_value_cents", { mode: "number" })
      .notNull()
      .default(0),
    goodsServicesDescription: text("goods_services_description"),
    receiptSent: boolean("receipt_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgContactDateIdx: index("donations_org_contact_date_idx").on(
      table.orgId,
      table.contactId,
      table.date,
    ),
  }),
);

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tags = pgTable("tags", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  color: text("color"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// contactTags (junction)
// ---------------------------------------------------------------------------

export const contactTags = pgTable(
  "contact_tags",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.tagId] }),
    index("contact_tags_org_contact_idx").on(table.orgId, table.contactId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.orgId],
    references: [organizations.id],
  }),
  affiliatedOrg: one(contacts, {
    fields: [contacts.affiliatedOrgId],
    references: [contacts.id],
    relationName: "affiliatedOrg",
  }),
  donations: many(donations),
  contactTags: many(contactTags),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  organization: one(organizations, {
    fields: [donations.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [donations.contactId],
    references: [contacts.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tags.orgId],
    references: [organizations.id],
  }),
  contactTags: many(contactTags),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  organization: one(organizations, {
    fields: [contactTags.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));
