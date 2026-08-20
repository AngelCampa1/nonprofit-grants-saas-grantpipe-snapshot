import { describe, expect, it, vi } from "vitest";
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from "./event.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn };
}

describe("listEvents", () => {
  it("filters, sorts, and paginates event rows", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "event-1",
        orgId: "org-1",
        name: "Spring Gala",
        type: "gala",
        date: new Date("2099-05-01T18:00:00Z"),
        attendees: [{ id: "attendee-1" }, { id: "attendee-2" }],
      },
      {
        id: "event-2",
        orgId: "org-1",
        name: "Past Fundraiser",
        type: "fundraiser",
        date: new Date("2026-03-01T18:00:00Z"),
        attendees: [{ id: "attendee-3" }],
      },
    ]);
    const db = {
      query: {
        events: {
          findMany,
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "upcoming",
      search: "spring",
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: "event-1",
      attendeeCount: 2,
    });
  });

  it("supports past timeframe, date sorting, and summary fallbacks", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "event-1",
        orgId: "org-1",
        name: "No Date Event",
        type: "fundraiser",
        date: null,
        attendees: [{ id: "attendee-1", donation: { amountCents: null } }],
        volunteerHours: [{ id: "vh-1", hours: "invalid" }],
      },
      {
        id: "event-2",
        orgId: "org-1",
        name: "Past Fundraiser",
        type: "fundraiser",
        date: new Date("2020-03-01T18:00:00Z"),
        attendees: [],
        volunteerHours: [{ id: "vh-2", hours: 1.5 }],
      },
    ]);
    const db = {
      query: {
        events: {
          findMany,
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "past",
      type: "fundraiser",
      sortBy: "date",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.summary).toMatchObject({
      attendeeCount: 0,
      revenueCents: 0,
      volunteerHoursTotal: 1.5,
    });
  });

  it("sorts by date ascending and pushes null dates last", async () => {
    const db = {
      query: {
        events: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              name: "Null Date Event",
              type: "gala",
              date: null,
              attendees: [],
              volunteerHours: [],
            },
            {
              id: "event-2",
              name: "Early Event",
              type: "gala",
              date: new Date("2026-04-01T12:00:00Z"),
              attendees: [],
              volunteerHours: [],
            },
            {
              id: "event-3",
              name: "Later Event",
              type: "gala",
              date: new Date("2026-06-01T12:00:00Z"),
              attendees: [],
              volunteerHours: [],
            },
          ]),
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "all",
      sortBy: "date",
      sortOrder: "asc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["event-2", "event-3", "event-1"]);
  });

  it("sorts by createdAt ascending when requested", async () => {
    const rows = [
      {
        id: "event-1",
        name: "Alpha",
        type: "gala",
        createdAt: new Date("2026-05-02T10:00:00Z"),
        attendees: [],
        volunteerHours: [],
      },
      {
        id: "event-2",
        name: "Beta",
        type: "gala",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        attendees: [],
        volunteerHours: [],
      },
    ];
    const db = {
      query: {
        events: {
          findMany: vi.fn().mockResolvedValue(rows),
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "all",
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["event-2", "event-1"]);
  });

  it("sorts names in descending order", async () => {
    const db = {
      query: {
        events: {
          findMany: vi.fn().mockResolvedValue([
            { id: "event-1", name: "Alpha", type: "gala", attendees: [], volunteerHours: [] },
            { id: "event-2", name: "Beta", type: "gala", attendees: [], volunteerHours: [] },
          ]),
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "all",
      sortBy: "name",
      sortOrder: "desc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["event-2", "event-1"]);
  });

  it("handles undefined event query results", async () => {
    const db = {
      query: {
        events: {
          findMany: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    const result = await listEvents(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      timeframe: "all",
      sortBy: "date",
      sortOrder: "asc",
    });

    expect(result).toMatchObject({ data: [], total: 0, page: 1, pageSize: 10 });
  });
});

describe("getEvent", () => {
  it("returns event detail with derived revenue and volunteer summaries", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "event-1",
      name: "Spring Gala",
      type: "gala",
      attendees: [
        {
          id: "attendee-1",
          rsvpStatus: "attended",
          contact: { id: "contact-1", firstName: "Sam", lastName: "Rivera" },
          donation: {
            id: "donation-1",
            amountCents: 50000,
            date: new Date("2026-05-01T18:00:00Z"),
          },
        },
      ],
      volunteerHours: [
        { id: "vh-1", hours: "2.5", date: new Date("2026-05-01T12:00:00Z") },
        { id: "vh-2", hours: "1.5", date: new Date("2026-05-01T13:00:00Z") },
      ],
    });
    const db = {
      query: {
        events: {
          findFirst,
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary).toMatchObject({
      attendeeCount: 1,
      revenueCents: 50000,
      volunteerHoursTotal: 4,
    });
  });

  it("throws when event is not found", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(getEvent(db as never, { orgId: "org-1", eventId: "missing" })).rejects.toThrow(
      "Event not found",
    );
  });

  it("returns zeroed summaries when attendees and volunteer hours are missing", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary).toMatchObject({
      attendeeCount: 0,
      revenueCents: 0,
      volunteerHoursTotal: 0,
    });
  });

  it("ignores deleted donations when calculating revenue", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
            attendees: [
              {
                id: "attendee-1",
                donation: {
                  amountCents: 12500,
                  deletedAt: new Date("2026-05-01T00:00:00Z"),
                },
              },
              {
                id: "attendee-2",
                donation: {
                  amountCents: 8750,
                  deletedAt: null,
                },
              },
            ],
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary.revenueCents).toBe(8750);
  });

  it("counts a donation linked to multiple attendees only once in event revenue", async () => {
    // donationId on event_attendees has no uniqueness constraint, and linking a
    // donation to an attendee only verifies the donation belongs to the
    // attendee's contact — not that it isn't already linked elsewhere. So the
    // same donation row can be referenced by more than one attendee (e.g. a
    // contact with two attendee records in the same event). Event revenue must
    // count each distinct donation once; double-counting inflates the reported
    // total for finance/compliance reporting.
    const sharedDonation = {
      id: "donation-1",
      amountCents: 20000,
      deletedAt: null,
    };
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
            attendees: [
              { id: "attendee-1", deletedAt: null, donation: sharedDonation },
              { id: "attendee-2", deletedAt: null, donation: sharedDonation },
            ],
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary.revenueCents).toBe(20000);
    expect(result.summary.attendeeCount).toBe(2);
  });

  it("does not count soft-deleted attendees in event summaries", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
            attendees: [
              {
                id: "attendee-1",
                deletedAt: null,
                donation: {
                  amountCents: 12500,
                  deletedAt: null,
                },
              },
              {
                id: "attendee-2",
                deletedAt: new Date("2026-05-01T00:00:00Z"),
                donation: {
                  amountCents: 8750,
                  deletedAt: null,
                },
              },
            ],
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary).toMatchObject({
      attendeeCount: 1,
      revenueCents: 12500,
    });
    expect(result.attendees?.map((attendee) => attendee.id)).toEqual(["attendee-1"]);
  });

  it("treats null and invalid volunteer hour values as zero", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
            attendees: [],
            volunteerHours: [
              { id: "vh-1", hours: null },
              { id: "vh-2", hours: "not-a-number" },
            ],
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary.volunteerHoursTotal).toBe(0);
  });

  it("does not count soft-deleted volunteer hours in detail summaries", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-1",
            name: "Community Day",
            type: "fundraiser",
            attendees: [],
            volunteerHours: [
              { id: "vh-1", hours: "2.5", deletedAt: null },
              {
                id: "vh-2",
                hours: "10",
                deletedAt: new Date("2026-05-01T00:00:00Z"),
              },
            ],
          }),
        },
      },
    };

    const result = await getEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect(result.summary.volunteerHoursTotal).toBe(2.5);
  });
});

describe("createEvent", () => {
  it("rejects invalid event input before inserting", async () => {
    const db = withTransaction({ insert: vi.fn() });

    await expect(
      createEvent(
        db as never,
        {
          orgId: "org-1",
          name: "Spring Gala",
          type: "not-an-event-type",
        } as never,
      ),
    ).rejects.toThrow();

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts an event scoped to the org", async () => {
    const created = { id: "event-1", orgId: "org-1", name: "Spring Gala" };
    const { insertFn, valuesFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    const result = await createEvent(db as never, {
      orgId: "org-1",
      name: "Spring Gala",
      type: "gala",
    });

    expect(valuesFn.mock.calls[0]?.[0]).toMatchObject({
      orgId: "org-1",
      name: "Spring Gala",
      type: "gala",
    });
    expect(result).toEqual(created);
  });

  it("converts provided event dates to Date objects", async () => {
    const created = { id: "event-1", orgId: "org-1", name: "Spring Gala" };
    const { insertFn, valuesFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    await createEvent(db as never, {
      orgId: "org-1",
      name: "Spring Gala",
      type: "gala",
      date: "2026-05-01T18:00:00Z",
    });

    expect((valuesFn.mock.calls[0]?.[0] as Record<string, unknown>).date).toBeInstanceOf(Date);
  });

  it("throws when insert returns no row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createEvent(db as never, {
        orgId: "org-1",
        name: "Spring Gala",
        type: "gala",
      }),
    ).rejects.toThrow("Failed to create event");
  });

  it("records activity when an actor id is provided", async () => {
    const created = { id: "event-1", orgId: "org-1", name: "Spring Gala", type: "gala" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    await createEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      name: "Spring Gala",
      type: "gala",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "event",
        entityId: "event-1",
      }),
    );
  });

  it("wraps insert and activity log in a transaction", async () => {
    const created = { id: "event-1", orgId: "org-1", name: "Spring Gala", type: "gala" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    await createEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      name: "Spring Gala",
      type: "gala",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "event", action: "created" }),
    );
  });

  it("rolls back when activity log throws during create", async () => {
    const created = { id: "event-1", orgId: "org-1", name: "Spring Gala", type: "gala" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createEvent(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        name: "Spring Gala",
        type: "gala",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateEvent", () => {
  it("rejects invalid event update input before updating", async () => {
    const db = withTransaction({ update: vi.fn() });

    await expect(
      updateEvent(db as never, {
        orgId: "org-1",
        eventId: "event-1",
        data: { revenueGoalCents: -1 },
      }),
    ).rejects.toThrow();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates event fields", async () => {
    const updated = { id: "event-1", name: "Updated Gala" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    const result = await updateEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: { name: "Updated Gala" },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({
      name: "Updated Gala",
    });
    expect(result).toEqual(updated);
  });

  it("maps nullable and date fields when updating", async () => {
    const updated = { id: "event-1", location: null };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: {
        date: null,
        location: null,
        description: "Updated description",
        revenueGoalCents: 5000,
        type: "other",
      },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({
      date: null,
      location: null,
      description: "Updated description",
      revenueGoalCents: 5000,
      type: "other",
    });
  });

  it("converts provided update dates to Date objects", async () => {
    const updated = { id: "event-1", date: new Date("2026-05-02T18:00:00Z") };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
      data: {
        date: "2026-05-02T18:00:00Z",
      },
    });

    expect((setFn.mock.calls[0]?.[0] as Record<string, unknown>).date).toBeInstanceOf(Date);
  });

  it("throws when the event is missing during update", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateEvent(db as never, {
        orgId: "org-1",
        eventId: "missing",
        data: { name: "Updated Gala" },
      }),
    ).rejects.toThrow("Event not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "event-1", name: "Updated Gala" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      data: { name: "Updated Gala" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "event",
        entityId: "event-1",
      }),
    );
  });

  it("wraps update and activity log in a transaction", async () => {
    const updated = { id: "event-1", name: "Updated Gala" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
      data: { name: "Updated Gala" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "event", action: "updated" }),
    );
  });

  it("rolls back when activity log throws during update", async () => {
    const updated = { id: "event-1", name: "Updated Gala" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateEvent(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        eventId: "event-1",
        data: { name: "Updated Gala" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("deleteEvent", () => {
  it("soft deletes an event", async () => {
    const deleted = { id: "event-1" };
    const { updateFn, setFn } = makeUpdateMock(deleted);
    const db = withTransaction({ update: updateFn });

    await deleteEvent(db as never, {
      orgId: "org-1",
      eventId: "event-1",
    });

    expect((setFn.mock.calls[0]?.[0] as Record<string, unknown>).deletedAt).toBeInstanceOf(Date);
  });

  it("throws when the event is missing during delete", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteEvent(db as never, {
        orgId: "org-1",
        eventId: "missing",
      }),
    ).rejects.toThrow("Event not found");
  });

  it("records activity when an actor id is provided", async () => {
    const deleted = { id: "event-1" };
    const { updateFn } = makeUpdateMock(deleted);
    const db = withTransaction({ update: updateFn });

    await deleteEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "event",
        entityId: "event-1",
      }),
    );
  });

  it("wraps delete and activity log in a transaction", async () => {
    const deleted = { id: "event-1" };
    const { updateFn } = makeUpdateMock(deleted);
    const db = withTransaction({ update: updateFn });

    await deleteEvent(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      eventId: "event-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "event", action: "deleted" }),
    );
  });

  it("rolls back when activity log throws during delete", async () => {
    const deleted = { id: "event-1" };
    const { updateFn } = makeUpdateMock(deleted);
    const db = withTransaction({ update: updateFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteEvent(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        eventId: "event-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
