import { z } from "zod";
import { EVENT_TYPES, RSVP_STATUSES } from "../constants";
import { createContactSchema, createDonationSchema } from "./donors";
import type { CreateContactInput } from "./donors";
import { paginationSchema } from "./pagination";

const idSchema = z.string().trim().min(1);
const isoDatetimeSchema = z.string().datetime();
const nullableDatetimeSchema = isoDatetimeSchema.nullable().optional();
const optionalTrimmedString = z.string().trim().min(1).optional();
const nullableOptionalString = z.string().trim().min(1).nullable().optional();
const positiveMoneySchema = z.number().int().positive();
const nullablePositiveMoneySchema = positiveMoneySchema.nullable().optional();
const positiveHoursSchema = z.union([z.number().positive(), z.string().trim().min(1)]).refine(
  (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  },
  {
    message: "Hours must be greater than zero",
  },
);

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(EVENT_TYPES),
  date: isoDatetimeSchema.optional(),
  location: optionalTrimmedString,
  description: optionalTrimmedString,
  revenueGoalCents: positiveMoneySchema.optional(),
});
export type CreateEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(EVENT_TYPES).optional(),
  date: nullableDatetimeSchema,
  location: nullableOptionalString,
  description: nullableOptionalString,
  revenueGoalCents: nullablePositiveMoneySchema,
});
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const eventListSchema = paginationSchema.extend({
  search: z.string().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  timeframe: z.enum(["upcoming", "past", "all"]).default("all"),
  sortBy: z.enum(["date", "name", "createdAt"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type EventListParams = z.infer<typeof eventListSchema>;

const attendeeBaseSchema = z.object({
  rsvpStatus: z.enum(RSVP_STATUSES).default("invited"),
});

export const createAttendeeSchema = z.discriminatedUnion("mode", [
  attendeeBaseSchema.extend({
    mode: z.literal("existing_contact"),
    contactId: idSchema,
  }),
  attendeeBaseSchema.extend({
    mode: z.literal("new_contact"),
    contact: createContactSchema,
  }),
]);
export type CreateAttendeeInput =
  | {
      mode: "existing_contact";
      contactId: string;
      rsvpStatus?: (typeof RSVP_STATUSES)[number];
    }
  | {
      mode: "new_contact";
      contact: CreateContactInput;
      rsvpStatus?: (typeof RSVP_STATUSES)[number];
    };

export const updateAttendeeSchema = z.object({
  rsvpStatus: z.enum(RSVP_STATUSES).optional(),
  donationId: idSchema.nullable().optional(),
});
export type UpdateAttendeeInput = z.input<typeof updateAttendeeSchema>;

export const linkAttendeeDonationSchema = z.object({
  donationId: idSchema,
});
export type LinkAttendeeDonationInput = z.input<typeof linkAttendeeDonationSchema>;

export const createAttendeeDonationSchema = createDonationSchema;
export type CreateAttendeeDonationInput = z.input<typeof createAttendeeDonationSchema>;

export const createVolunteerHourSchema = z
  .object({
    contactId: idSchema,
    eventId: idSchema.optional(),
    program: optionalTrimmedString,
    hours: positiveHoursSchema,
    date: isoDatetimeSchema,
    notes: optionalTrimmedString,
  })
  .refine((data) => Boolean(data.eventId || data.program), {
    message: "Volunteer hours must reference an event or program",
    path: ["eventId"],
  });
export type CreateVolunteerHourInput = z.input<typeof createVolunteerHourSchema>;

export const updateVolunteerHourSchema = z
  .object({
    eventId: idSchema.nullable().optional(),
    program: nullableOptionalString,
    hours: positiveHoursSchema.optional(),
    date: isoDatetimeSchema.optional(),
    notes: nullableOptionalString,
  })
  .refine(
    (data) => {
      const clearsEvent = data.eventId === null;
      const clearsProgram = data.program === null;
      if (!clearsEvent && !clearsProgram) {
        return true;
      }

      return Boolean(data.eventId || data.program);
    },
    {
      message: "Volunteer hours cannot clear both event and program",
      path: ["eventId"],
    },
  );
export type UpdateVolunteerHourInput = z.input<typeof updateVolunteerHourSchema>;

export const volunteerHourListSchema = paginationSchema.extend({
  contactId: idSchema.optional(),
  eventId: idSchema.optional(),
  sortBy: z.enum(["date", "createdAt", "hours"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type VolunteerHourListParams = z.infer<typeof volunteerHourListSchema>;
