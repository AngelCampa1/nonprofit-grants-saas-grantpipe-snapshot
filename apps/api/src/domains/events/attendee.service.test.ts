import { describe, expect, it, vi } from "vitest";
import {
  createAttendee,
  createAttendeeDonation,
  deleteAttendee,
  linkAttendeeDonation,
  updateAttendee,
} from "./attendee.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../accounting/postingEngine", () => ({
  postDonation: vi.fn().mockResolvedValue(undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { postDonation } from "../accounting/postingEngine";

function makeInsertSequence(returnValues: unknown[]) {
  const returningFns = returnValues.map((value) => vi.fn().mockResolvedValue([value]));
  const valuesFns = returningFns.map((returning) => vi.fn().mockReturnValue({ returning }));
  let callIndex = 0;
  const insertFn = vi.fn().mockImplementation(() => {
    const values = valuesFns[callIndex];
    callIndex += 1;
    return { values };
  });

  return { insertFn, valuesFns };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn };
}

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

describe("createAttendee", () => {
  it("rejects invalid attendee input before loading related records", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const db = {
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        data: {
          mode: "existing_contact",
          contactId: "contact-1",
          rsvpStatus: "not-a-status",
        } as never,
      }),
    ).rejects.toThrow();

    expect(contactLookup).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates an attendee from an existing contact", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn, valuesFns } = makeInsertSequence([
      { id: "attendee-1", contactId: "contact-1" },
    ]);
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    const result = await createAttendee(db as never, {
      eventId: "event-1",
      data: {
        mode: "existing_contact",
        contactId: "contact-1",
        rsvpStatus: "confirmed",
      },
    });

    expect(valuesFns[0]?.mock.calls[0]?.[0]).toMatchObject({
      eventId: "event-1",
      contactId: "contact-1",
      rsvpStatus: "confirmed",
    });
    expect(result).toEqual({ id: "attendee-1", contactId: "contact-1" });
  });

  it("creates an attendee from an existing contact after org checks pass", async () => {
    const eventLookup = vi.fn().mockResolvedValue({ id: "event-1", orgId: "org-1" });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn, valuesFns } = makeInsertSequence([
      { id: "attendee-1", contactId: "contact-1" },
    ]);
    const db = withTransaction({
      query: {
        events: {
          findFirst: eventLookup,
        },
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    const result = await createAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: {
        mode: "existing_contact",
        contactId: "contact-1",
        rsvpStatus: "confirmed",
      },
    });

    expect(valuesFns[0]?.mock.calls[0]?.[0]).toMatchObject({
      eventId: "event-1",
      contactId: "contact-1",
      rsvpStatus: "confirmed",
    });
    expect(result).toEqual({ id: "attendee-1", contactId: "contact-1" });
  });

  it("rejects existing contacts outside the org", async () => {
    const contactLookup = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        data: {
          mode: "existing_contact",
          contactId: "contact-foreign",
          rsvpStatus: "confirmed",
        },
      }),
    ).rejects.toThrow("Contact not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects attendees for events outside the org", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-foreign",
        data: {
          mode: "new_contact",
          contact: {
            type: "individual",
            firstName: "Jamie",
            pipelineStage: "prospect" as const,
          },
          rsvpStatus: "confirmed",
        },
      }),
    ).rejects.toThrow("Event not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a new contact before inserting the attendee", async () => {
    const { insertFn, valuesFns } = makeInsertSequence([
      { id: "contact-2", firstName: "Jamie" },
      { id: "attendee-2", contactId: "contact-2" },
    ]);
    const db = withTransaction({ insert: insertFn });

    const result = await createAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: {
        mode: "new_contact",
        contact: {
          type: "individual",
          firstName: "Jamie",
          lastName: "Lee",
          email: "jamie@example.com",
          pipelineStage: "prospect" as const,
        },
        rsvpStatus: "invited",
      },
    });

    expect(valuesFns[0]?.mock.calls[0]?.[0]).toMatchObject({
      orgId: "org-1",
      firstName: "Jamie",
    });
    expect(valuesFns[1]?.mock.calls[0]?.[0]).toMatchObject({
      eventId: "event-1",
      contactId: "contact-2",
      rsvpStatus: "invited",
    });
    expect(result).toEqual({ id: "attendee-2", contactId: "contact-2" });
  });

  it("rejects inline contacts whose affiliated org is outside the tenant", async () => {
    const contactLookup = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        data: {
          mode: "new_contact",
          contact: {
            type: "organization",
            organizationName: "Food Bank",
            affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
            pipelineStage: "prospect" as const,
          },
          rsvpStatus: "invited",
        },
      }),
    ).rejects.toThrow("Affiliated organization not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("normalizes optional inline-contact fields to null", async () => {
    const { insertFn, valuesFns } = makeInsertSequence([
      { id: "contact-3", organizationName: "Food Bank" },
      { id: "attendee-3", contactId: "contact-3" },
    ]);
    const db = withTransaction({ insert: insertFn });

    await createAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: {
        mode: "new_contact",
        contact: {
          type: "organization",
          organizationName: "Food Bank",
          pipelineStage: "prospect" as const,
        },
        rsvpStatus: "invited",
      },
    });

    expect(valuesFns[0]?.mock.calls[0]?.[0]).toMatchObject({
      firstName: null,
      lastName: null,
      organizationName: "Food Bank",
      email: null,
      phone: null,
      address: null,
      affiliatedOrgId: null,
      notes: null,
    });
  });

  it("throws when inline contact creation fails", async () => {
    const { insertFn } = makeInsertSequence([undefined]);
    const db = withTransaction({ insert: insertFn });

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        data: {
          mode: "new_contact",
          contact: {
            type: "individual",
            firstName: "Jamie",
            lastName: "Lee",
            email: "jamie@example.com",
            pipelineStage: "prospect" as const,
          },
          rsvpStatus: "invited",
        },
      }),
    ).rejects.toThrow("Failed to create contact");
  });

  it("throws when attendee insertion fails", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([undefined]);
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createAttendee(db as never, {
        eventId: "event-1",
        data: {
          mode: "existing_contact",
          contactId: "contact-1",
          rsvpStatus: "confirmed",
        },
      }),
    ).rejects.toThrow("Failed to create attendee");
  });

  it("wraps insert and activity log in a transaction", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([{ id: "attendee-1", contactId: "contact-1" }]);
    const db = withTransaction({
      query: { contacts: { findFirst: contactLookup } },
      insert: insertFn,
    });

    await createAttendee(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      data: { mode: "existing_contact", contactId: "contact-1", rsvpStatus: "confirmed" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "attendee", action: "created" }),
    );
  });

  it("rolls back when activity log throws during createAttendee", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([{ id: "attendee-1", contactId: "contact-1" }]);
    const db = withTransaction({
      query: { contacts: { findFirst: contactLookup } },
      insert: insertFn,
    });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createAttendee(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        eventId: "event-1",
        data: { mode: "existing_contact", contactId: "contact-1", rsvpStatus: "confirmed" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateAttendee", () => {
  it("rejects invalid attendee update input before loading the attendee", async () => {
    const attendeeLookup = vi.fn();
    const db = {
      query: {
        eventAttendees: {
          findFirst: attendeeLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: { rsvpStatus: "not-a-status" } as never,
      }),
    ).rejects.toThrow();

    expect(attendeeLookup).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates attendee fields", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn, setFn } = makeUpdateMock({ id: "attendee-1", rsvpStatus: "attended" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });

    const result = await updateAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: { rsvpStatus: "attended", donationId: null },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({
      rsvpStatus: "attended",
      donationId: null,
    });
    expect(result).toEqual({ id: "attendee-1", rsvpStatus: "attended" });
  });

  it("throws when attendee cannot be updated", async () => {
    const db = {
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "missing",
        data: { rsvpStatus: "attended" },
      }),
    ).rejects.toThrow("Attendee not found");
  });

  it("rejects attendee updates when the parent event is soft-deleted", async () => {
    const db = {
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue({
            id: "attendee-1",
            contactId: "contact-1",
            event: {
              id: "event-1",
              orgId: "org-1",
              deletedAt: new Date("2026-04-01T00:00:00.000Z"),
            },
          }),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: { rsvpStatus: "attended" },
      }),
    ).rejects.toThrow("Attendee not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects donation links outside the org", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const donationLookup = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        donations: { findFirst: donationLookup },
      },
      update: vi.fn(),
    };

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: { donationId: "donation-foreign" },
      }),
    ).rejects.toThrow("Donation not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects donation updates when the donation belongs to a different contact", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const donationLookup = vi.fn().mockResolvedValue({
      id: "donation-1",
      contactId: "contact-2",
      orgId: "org-1",
    });
    const db = {
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        donations: { findFirst: donationLookup },
      },
      update: vi.fn(),
    };

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: { donationId: "donation-1" },
      }),
    ).rejects.toThrow("Donation not found for attendee contact");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates an attendee when a donation belongs to the org", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const donationLookup = vi.fn().mockResolvedValue({
      id: "donation-1",
      contactId: "contact-1",
      orgId: "org-1",
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        donations: { findFirst: donationLookup },
      },
      update: updateFn,
    });

    const result = await updateAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: { donationId: "donation-1" },
    });

    expect(result).toEqual({ id: "attendee-1", donationId: "donation-1" });
  });

  it("wraps update and activity log in a transaction", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1", rsvpStatus: "attended" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });

    await updateAttendee(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: { rsvpStatus: "attended" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "attendee", action: "updated" }),
    );
  });

  it("rolls back when activity log throws during updateAttendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1", rsvpStatus: "attended" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateAttendee(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: { rsvpStatus: "attended" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("linkAttendeeDonation", () => {
  it("links an existing donation to the attendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const donationLookup = vi.fn().mockResolvedValue({
      id: "donation-1",
      contactId: "contact-1",
      orgId: "org-1",
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        donations: { findFirst: donationLookup },
      },
      update: updateFn,
    });

    const result = await linkAttendeeDonation(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
      donationId: "donation-1",
    });

    expect(result).toEqual({ id: "attendee-1", donationId: "donation-1" });
  });

  it("rejects donations for another contact", async () => {
    const db = {
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue({
            id: "attendee-1",
            contactId: "contact-1",
            event: { id: "event-1", orgId: "org-1" },
          }),
        },
        donations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    };

    await expect(
      linkAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        donationId: "donation-1",
      }),
    ).rejects.toThrow("Donation not found for attendee contact");
  });

  it("rejects missing attendees before donation lookup", async () => {
    const donationLookup = vi.fn();
    const db = {
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
        donations: {
          findFirst: donationLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      linkAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "missing",
        donationId: "donation-1",
      }),
    ).rejects.toThrow("Attendee not found");
    expect(donationLookup).not.toHaveBeenCalled();
  });

  it("rejects attendee contacts outside the org before donation creation", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-foreign",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      createAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: {
          amountCents: 50000,
          date: "2026-05-01T18:00:00Z",
          type: "one_time",
          restriction: "unrestricted",
        },
      }),
    ).rejects.toThrow("Contact not found");

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createAttendeeDonation", () => {
  it("creates a donation and links it to the attendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn, valuesFns } = makeInsertSequence([
      { id: "donation-1", contactId: "contact-1" },
    ]);
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
      },
      insert: insertFn,
      update: updateFn,
    });

    const result = await createAttendeeDonation(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: {
        amountCents: 50000,
        date: "2026-05-01T18:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      },
    });

    expect(valuesFns[0]?.mock.calls[0]?.[0]).toMatchObject({
      orgId: "org-1",
      contactId: "contact-1",
      amountCents: 50000,
    });
    expect(result).toEqual({ id: "donation-1", contactId: "contact-1" });
  });

  it("creates a donation with optional fund and grant links", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([{ id: "donation-1", contactId: "contact-1" }]);
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({ id: "allocation-1" }),
        },
      },
      insert: insertFn,
      update: updateFn,
    });

    const result = await createAttendeeDonation(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: {
        amountCents: 50000,
        date: "2026-05-01T18:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
        fundId: "fund-1",
        grantId: "grant-1",
      },
    });

    expect(result).toEqual({ id: "donation-1", contactId: "contact-1" });
    expect(fundLookup).toHaveBeenCalled();
    expect(grantLookup).toHaveBeenCalled();
  });

  it("rejects grant-backed donations when the fund is not allocated to the grant", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
        grantFundAllocations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: vi.fn(),
      update: vi.fn(),
    });

    await expect(
      createAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: {
          amountCents: 50000,
          date: "2026-05-01T18:00:00Z",
          type: "one_time",
          restriction: "restricted",
          fundId: "fund-1",
          grantId: "grant-1",
        },
      }),
    ).rejects.toThrow("Fund is not allocated to this grant");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts accounting entries for attendee-created donations when actorId is present", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([{ id: "donation-1", contactId: "contact-1" }]);
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
      },
      insert: insertFn,
      update: updateFn,
    });

    await createAttendeeDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: {
        amountCents: 50000,
        date: "2026-05-01T18:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      },
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(postDonation).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-2",
      donationId: "donation-1",
      action: "create",
    });
  });

  it("rejects grant-backed donations when the grant is outside the org", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue(undefined);
    const { insertFn } = makeInsertSequence([{ id: "donation-1", contactId: "contact-1" }]);
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
      },
      insert: insertFn,
      update: vi.fn(),
    });

    await expect(
      createAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: {
          amountCents: 50000,
          date: "2026-05-01T18:00:00Z",
          type: "one_time",
          restriction: "unrestricted",
          fundId: "fund-1",
          grantId: "grant-foreign",
        },
      }),
    ).rejects.toThrow("Grant not found");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects donation creation when attendee is missing", async () => {
    const db = {
      query: {
        eventAttendees: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      createAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "missing",
        data: {
          amountCents: 50000,
          date: "2026-05-01T18:00:00Z",
          type: "one_time",
          restriction: "unrestricted",
        },
      }),
    ).rejects.toThrow("Attendee not found");
  });

  it("throws when the donation insert returns no row", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([undefined]);
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
      },
      insert: insertFn,
      update: vi.fn(),
    });

    await expect(
      createAttendeeDonation(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
        data: {
          amountCents: 50000,
          date: "2026-05-01T18:00:00Z",
          type: "one_time",
          restriction: "unrestricted",
        },
      }),
    ).rejects.toThrow("Failed to create donation");
  });
});

describe("deleteAttendee", () => {
  it("soft-deletes the attendee row", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn, setFn } = makeUpdateMock({ id: "attendee-1" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });

    await deleteAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
  });

  it("rejects attendee deletion across org boundaries", async () => {
    const db = {
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue({
            id: "attendee-1",
            contactId: "contact-1",
            event: { id: "event-1", orgId: "org-2" },
          }),
        },
      },
      update: vi.fn(),
    };

    await expect(
      deleteAttendee(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    ).rejects.toThrow("Attendee not found");
  });

  it("allows attendee deletion when the parent event is soft-deleted", async () => {
    const { updateFn, setFn } = makeUpdateMock({ id: "attendee-1" });
    const db = withTransaction({
      query: {
        eventAttendees: {
          findFirst: vi.fn().mockResolvedValue({
            id: "attendee-1",
            contactId: "contact-1",
            event: {
              id: "event-1",
              orgId: "org-1",
              deletedAt: new Date("2026-04-01T00:00:00.000Z"),
            },
          }),
        },
      },
      update: updateFn,
    });

    await deleteAttendee(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      attendeeId: "attendee-1",
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
  });

  it("records activity when creating a new contact attendee", async () => {
    const { insertFn } = makeInsertSequence([
      { id: "contact-2", firstName: "Jamie" },
      { id: "attendee-2", contactId: "contact-2", rsvpStatus: "invited" },
    ]);
    const db = withTransaction({
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({ id: "event-1", orgId: "org-1" }),
        },
      },
      insert: insertFn,
    });

    await createAttendee(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      data: {
        mode: "new_contact",
        contact: {
          type: "individual",
          firstName: "Jamie",
          lastName: "Lee",
          email: "jamie@example.com",
          pipelineStage: "prospect" as const,
        },
        rsvpStatus: "invited",
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "contact",
        entityId: "contact-2",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "attendee",
        entityId: "attendee-2",
      }),
    );
  });

  it("records activity when creating a donation for an attendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const contactLookup = vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" });
    const { insertFn } = makeInsertSequence([{ id: "donation-1", contactId: "contact-1" }]);
    const { updateFn } = makeUpdateMock({ id: "attendee-1", donationId: "donation-1" });
    const db = withTransaction({
      query: {
        eventAttendees: { findFirst: attendeeLookup },
        contacts: { findFirst: contactLookup },
      },
      insert: insertFn,
      update: updateFn,
    });

    await createAttendeeDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      attendeeId: "attendee-1",
      data: {
        amountCents: 50000,
        date: "2026-05-01T18:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "donation",
        entityId: "donation-1",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "attendee",
        entityId: "attendee-1",
      }),
    );
  });

  it("records activity when deleting an attendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });

    await deleteAttendee(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      attendeeId: "attendee-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "attendee",
        entityId: "attendee-1",
      }),
    );
  });

  it("wraps delete and activity log in a transaction", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });

    await deleteAttendee(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      attendeeId: "attendee-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "attendee", action: "deleted" }),
    );
  });

  it("rolls back when activity log throws during deleteAttendee", async () => {
    const attendeeLookup = vi.fn().mockResolvedValue({
      id: "attendee-1",
      contactId: "contact-1",
      event: { id: "event-1", orgId: "org-1" },
    });
    const { updateFn } = makeUpdateMock({ id: "attendee-1" });
    const db = withTransaction({
      query: { eventAttendees: { findFirst: attendeeLookup } },
      update: updateFn,
    });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteAttendee(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
