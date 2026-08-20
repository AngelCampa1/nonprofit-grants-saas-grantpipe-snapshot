import { index, pgTable, text, timestamp, bigint, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";
import { contacts, donations } from "./contacts";

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    date: timestamp("date", { withTimezone: true }),
    location: text("location"),
    description: text("description"),
    revenueGoalCents: bigint("revenue_goal_cents", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("events_org_id_idx").on(table.orgId),
    index("events_deleted_at_idx").on(table.deletedAt),
  ],
);

// ---------------------------------------------------------------------------
// eventAttendees
// ---------------------------------------------------------------------------

export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    rsvpStatus: text("rsvp_status").notNull().default("invited"),
    donationId: text("donation_id").references(() => donations.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("event_attendees_event_id_idx").on(table.eventId),
    index("event_attendees_contact_id_idx").on(table.contactId),
  ],
);

// ---------------------------------------------------------------------------
// volunteerHours
// ---------------------------------------------------------------------------

export const volunteerHours = pgTable(
  "volunteer_hours",
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
    eventId: text("event_id").references(() => events.id),
    program: text("program"),
    hours: numeric("hours").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("volunteer_hours_org_id_idx").on(table.orgId),
    index("volunteer_hours_contact_id_idx").on(table.contactId),
    index("volunteer_hours_event_id_idx").on(table.eventId),
    index("volunteer_hours_deleted_at_idx").on(table.deletedAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const eventsRelations = relations(events, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [events.orgId],
    references: [organizations.id],
  }),
  attendees: many(eventAttendees),
  volunteerHours: many(volunteerHours),
}));

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, {
    fields: [eventAttendees.eventId],
    references: [events.id],
  }),
  contact: one(contacts, {
    fields: [eventAttendees.contactId],
    references: [contacts.id],
  }),
  donation: one(donations, {
    fields: [eventAttendees.donationId],
    references: [donations.id],
  }),
}));

export const volunteerHoursRelations = relations(volunteerHours, ({ one }) => ({
  organization: one(organizations, {
    fields: [volunteerHours.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [volunteerHours.contactId],
    references: [contacts.id],
  }),
  event: one(events, {
    fields: [volunteerHours.eventId],
    references: [events.id],
  }),
}));
