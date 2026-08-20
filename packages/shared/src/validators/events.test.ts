import { describe, expect, it } from "vitest";
import {
  createAttendeeDonationSchema,
  createAttendeeSchema,
  createEventSchema,
  createVolunteerHourSchema,
  eventListSchema,
  linkAttendeeDonationSchema,
  updateAttendeeSchema,
  updateEventSchema,
  updateVolunteerHourSchema,
  volunteerHourListSchema,
} from "./events";

describe("createEventSchema", () => {
  it("accepts a valid event", () => {
    const result = createEventSchema.safeParse({
      name: "Spring Gala",
      type: "gala",
      date: "2026-05-01T18:00:00Z",
      location: "Civic Center",
      description: "Annual fundraising dinner",
      revenueGoalCents: 2500000,
    });

    expect(result.success).toBe(true);
  });

  it("requires a non-empty name", () => {
    const result = createEventSchema.safeParse({
      name: " ",
      type: "gala",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid event type", () => {
    const result = createEventSchema.safeParse({
      name: "Spring Gala",
      type: "telethon",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateEventSchema", () => {
  it("accepts nullable optional fields", () => {
    const result = updateEventSchema.safeParse({
      location: null,
      description: null,
      date: null,
      revenueGoalCents: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("eventListSchema", () => {
  it("applies defaults", () => {
    const result = eventListSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe("date");
      expect(result.data.sortOrder).toBe("asc");
    }
  });

  it("accepts filters", () => {
    const result = eventListSchema.safeParse({
      search: "gala",
      type: "fundraiser",
      timeframe: "upcoming",
      sortBy: "name",
      sortOrder: "desc",
      page: "2",
      pageSize: "10",
    });

    expect(result.success).toBe(true);
  });
});

describe("createAttendeeSchema", () => {
  it("accepts an attendee from an existing contact", () => {
    const result = createAttendeeSchema.safeParse({
      mode: "existing_contact",
      contactId: "contact-1",
      rsvpStatus: "confirmed",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an attendee with inline contact creation", () => {
    const result = createAttendeeSchema.safeParse({
      mode: "new_contact",
      contact: {
        type: "individual",
        firstName: "Sam",
        lastName: "Rivera",
        email: "sam@example.com",
      },
      rsvpStatus: "invited",
    });

    expect(result.success).toBe(true);
  });

  it("defaults RSVP status to invited", () => {
    const result = createAttendeeSchema.safeParse({
      mode: "existing_contact",
      contactId: "contact-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rsvpStatus).toBe("invited");
    }
  });

  it("rejects an existing-contact attendee without contactId", () => {
    const result = createAttendeeSchema.safeParse({
      mode: "existing_contact",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a new-contact attendee without contact payload", () => {
    const result = createAttendeeSchema.safeParse({
      mode: "new_contact",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateAttendeeSchema", () => {
  it("accepts RSVP updates and nullable donation link", () => {
    const result = updateAttendeeSchema.safeParse({
      rsvpStatus: "attended",
      donationId: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("linkAttendeeDonationSchema", () => {
  it("requires a donation id", () => {
    expect(linkAttendeeDonationSchema.safeParse({ donationId: "donation-1" }).success).toBe(true);
    expect(linkAttendeeDonationSchema.safeParse({ donationId: "" }).success).toBe(false);
  });
});

describe("createAttendeeDonationSchema", () => {
  it("accepts inline donation creation payloads with ISO datetime", () => {
    const result = createAttendeeDonationSchema.safeParse({
      amountCents: 50000,
      date: "2026-05-01T00:00:00.000Z",
      type: "one_time",
      restriction: "unrestricted",
      paymentMethod: "credit_card",
      notes: "Paid at check-in",
    });

    expect(result.success).toBe(true);
  });

  it("requires a positive amount", () => {
    const result = createAttendeeDonationSchema.safeParse({
      amountCents: 0,
      date: "2026-05-01T00:00:00.000Z",
      type: "one_time",
    });

    expect(result.success).toBe(false);
  });

  it("rejects date-only YYYY-MM-DD string for date", () => {
    const result = createAttendeeDonationSchema.safeParse({
      amountCents: 50000,
      date: "2026-05-01",
      type: "one_time",
    });

    expect(result.success).toBe(false);
  });
});

describe("createVolunteerHourSchema", () => {
  it("accepts volunteer hours linked to an event", () => {
    const result = createVolunteerHourSchema.safeParse({
      contactId: "contact-1",
      eventId: "event-1",
      hours: "2.5",
      date: "2026-05-02T20:00:00Z",
      notes: "Table setup",
    });

    expect(result.success).toBe(true);
  });

  it("accepts volunteer hours linked to a program", () => {
    const result = createVolunteerHourSchema.safeParse({
      contactId: "contact-1",
      program: "Food Pantry",
      hours: "3",
      date: "2026-05-02T20:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts numeric volunteer hours", () => {
    const result = createVolunteerHourSchema.safeParse({
      contactId: "contact-1",
      program: "Food Pantry",
      hours: 1.5,
      date: "2026-05-02T20:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects hours without event or program", () => {
    const result = createVolunteerHourSchema.safeParse({
      contactId: "contact-1",
      hours: "3",
      date: "2026-05-02T20:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-positive hours", () => {
    const result = createVolunteerHourSchema.safeParse({
      contactId: "contact-1",
      program: "Food Pantry",
      hours: 0,
      date: "2026-05-02T20:00:00Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateVolunteerHourSchema", () => {
  it("accepts clearing one reference while retaining the other", () => {
    const result = updateVolunteerHourSchema.safeParse({
      eventId: null,
      program: "Food Pantry",
    });

    expect(result.success).toBe(true);
  });

  it("accepts clearing program while retaining the event", () => {
    const result = updateVolunteerHourSchema.safeParse({
      eventId: "event-1",
      program: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts updates that do not clear either reference", () => {
    const result = updateVolunteerHourSchema.safeParse({
      notes: "Worked check-in",
      hours: "4",
    });

    expect(result.success).toBe(true);
  });

  it("rejects clearing both event and program", () => {
    const result = updateVolunteerHourSchema.safeParse({
      eventId: null,
      program: null,
    });

    expect(result.success).toBe(false);
  });
});

describe("volunteerHourListSchema", () => {
  it("accepts filters and defaults", () => {
    const result = volunteerHourListSchema.safeParse({
      contactId: "contact-1",
      eventId: "event-1",
      sortBy: "date",
      sortOrder: "desc",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    }
  });
});
