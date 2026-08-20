import { describe, expect, it, vi } from "vitest";
import {
  createVolunteerHour,
  deleteVolunteerHour,
  listVolunteerHours,
  updateVolunteerHour,
} from "./volunteer.service";

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

describe("listVolunteerHours", () => {
  it("filters and paginates volunteer history", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-1",
        contactId: "contact-1",
        eventId: "event-1",
        hours: "2.5",
        date: new Date("2026-05-01T12:00:00Z"),
        event: { id: "event-1", name: "Spring Gala" },
        contact: { id: "contact-1", firstName: "Sam", lastName: "Rivera" },
      },
    ]);
    const db = {
      query: {
        volunteerHours: {
          findMany,
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      contactId: "contact-1",
      eventId: "event-1",
      sortBy: "date",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: "vh-1",
      hours: 2.5,
      event: { name: "Spring Gala" },
    });
  });

  it("sorts by hours and filters out non-matching records", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-1",
        contactId: "contact-1",
        eventId: "event-1",
        hours: 4,
        date: new Date("2026-05-01T12:00:00Z"),
      },
      {
        id: "vh-2",
        contactId: "contact-2",
        eventId: "event-1",
        hours: "1.5",
        date: new Date("2026-05-02T12:00:00Z"),
      },
    ]);
    const db = {
      query: {
        volunteerHours: {
          findMany,
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      contactId: "contact-2",
      sortBy: "hours",
      sortOrder: "asc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe("vh-2");
    expect(result.data[0]?.hours).toBe(1.5);
  });

  it("sorts by hours descending when requested", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-1",
        contactId: "contact-1",
        hours: 4,
        date: new Date("2026-05-01T12:00:00Z"),
      },
      {
        id: "vh-2",
        contactId: "contact-1",
        hours: "1.5",
        date: new Date("2026-05-02T12:00:00Z"),
      },
    ]);
    const db = {
      query: {
        volunteerHours: {
          findMany,
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      contactId: "contact-1",
      sortBy: "hours",
      sortOrder: "desc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["vh-1", "vh-2"]);
  });

  it("sorts by date ascending when requested", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-1",
        contactId: "contact-1",
        hours: "2",
        date: new Date("2026-05-02T12:00:00Z"),
      },
      {
        id: "vh-2",
        contactId: "contact-1",
        hours: "1",
        date: new Date("2026-05-01T12:00:00Z"),
      },
    ]);
    const db = {
      query: {
        volunteerHours: {
          findMany,
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      contactId: "contact-1",
      sortBy: "date",
      sortOrder: "asc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["vh-2", "vh-1"]);
  });

  it("sorts by createdAt ascending when requested", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-1",
        contactId: "contact-1",
        hours: "2",
        date: new Date("2026-05-02T12:00:00Z"),
        createdAt: new Date("2026-05-03T12:00:00Z"),
      },
      {
        id: "vh-2",
        contactId: "contact-1",
        hours: "1",
        date: new Date("2026-05-01T12:00:00Z"),
        createdAt: new Date("2026-05-02T12:00:00Z"),
      },
    ]);
    const db = {
      query: {
        volunteerHours: {
          findMany,
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      contactId: "contact-1",
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["vh-2", "vh-1"]);
  });

  it("handles undefined volunteer query results", async () => {
    const db = {
      query: {
        volunteerHours: {
          findMany: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "date",
      sortOrder: "desc",
    });

    expect(result).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("excludes soft-deleted volunteer hours", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "vh-live",
        contactId: "contact-1",
        hours: "2",
        date: new Date("2026-05-01T12:00:00Z"),
        deletedAt: null,
      },
      {
        id: "vh-deleted",
        contactId: "contact-1",
        hours: "4",
        date: new Date("2026-05-02T12:00:00Z"),
        deletedAt: new Date("2026-05-03T12:00:00Z"),
      },
    ]);
    const db = { query: { volunteerHours: { findMany } } };

    const result = await listVolunteerHours(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "date",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data.map((row) => row.id)).toEqual(["vh-live"]);
  });
});

describe("createVolunteerHour", () => {
  it("rejects invalid volunteer hour input before loading related records", async () => {
    const contactLookup = vi.fn().mockResolvedValue({
      id: "contact-1",
      orgId: "org-1",
    });
    const db = {
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createVolunteerHour(db as never, {
        orgId: "org-1",
        data: {
          contactId: "contact-1",
          hours: -1,
          date: "2026-05-01T12:00:00Z",
        },
      }),
    ).rejects.toThrow();

    expect(contactLookup).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts an org-scoped volunteer hour entry", async () => {
    const created = { id: "vh-1", contactId: "contact-1", hours: "2.5" };
    const { insertFn, valuesFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    const result = await createVolunteerHour(db as never, {
      orgId: "org-1",
      data: {
        contactId: "contact-1",
        eventId: "event-1",
        hours: "2.5",
        date: "2026-05-01T12:00:00Z",
      },
    });

    expect(valuesFn.mock.calls[0]?.[0]).toMatchObject({
      orgId: "org-1",
      contactId: "contact-1",
      eventId: "event-1",
      hours: "2.5",
    });
    expect(result).toEqual({ ...created, hours: 2.5 });
  });

  it("throws when insertion returns no row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createVolunteerHour(db as never, {
        orgId: "org-1",
        data: {
          contactId: "contact-1",
          program: "Food Pantry",
          hours: "2.5",
          date: "2026-05-01T12:00:00Z",
        },
      }),
    ).rejects.toThrow("Failed to create volunteer hour");
  });

  it("rejects volunteer hours that reference records outside the org", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
        events: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createVolunteerHour(db as never, {
        orgId: "org-1",
        data: {
          contactId: "contact-foreign",
          eventId: "event-foreign",
          hours: "2.5",
          date: "2026-05-01T12:00:00Z",
        },
      }),
    ).rejects.toThrow("Contact not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects volunteer hours when the event lookup fails after the contact passes", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue({ id: "contact-1", orgId: "org-1" }),
        },
        events: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createVolunteerHour(db as never, {
        orgId: "org-1",
        data: {
          contactId: "contact-1",
          eventId: "event-foreign",
          hours: "2.5",
          date: "2026-05-01T12:00:00Z",
        },
      }),
    ).rejects.toThrow("Event not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    const created = { id: "vh-1", contactId: "contact-1", hours: "2.5" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    await createVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      data: {
        contactId: "contact-1",
        eventId: "event-1",
        hours: "2.5",
        date: "2026-05-01T12:00:00Z",
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "volunteer_hour",
        entityId: "vh-1",
      }),
    );
  });

  it("wraps insert and activity log in a transaction", async () => {
    const created = { id: "vh-1", contactId: "contact-1", hours: "2.5" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });

    await createVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      data: {
        contactId: "contact-1",
        program: "Food Pantry",
        hours: "2.5",
        date: "2026-05-01T12:00:00Z",
      },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "volunteer_hour", action: "created" }),
    );
  });

  it("rolls back when activity log throws during createVolunteerHour", async () => {
    const created = { id: "vh-1", contactId: "contact-1", hours: "2.5" };
    const { insertFn } = makeInsertMock(created);
    const db = withTransaction({ insert: insertFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createVolunteerHour(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        data: {
          contactId: "contact-1",
          program: "Food Pantry",
          hours: "2.5",
          date: "2026-05-01T12:00:00Z",
        },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateVolunteerHour", () => {
  it("updates volunteer hour fields", async () => {
    const updated = { id: "vh-1", program: "Food Pantry", hours: "3" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    const result = await updateVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
      data: {
        eventId: null,
        program: "Food Pantry",
      },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({
      eventId: null,
      program: "Food Pantry",
    });
    expect(result).toEqual({ ...updated, hours: 3 });
  });

  it("rejects volunteer hour updates when the linked event is soft-deleted", async () => {
    const db = {
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vh-1",
            orgId: "org-1",
            eventId: "event-1",
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
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        volunteerHourId: "vh-1",
        data: { program: "Food Pantry" },
      }),
    ).rejects.toThrow("Volunteer hour not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects volunteer hour updates when the existing row is missing before mutation", async () => {
    const db = {
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        volunteerHourId: "missing",
        data: { program: "Food Pantry" },
      }),
    ).rejects.toThrow("Volunteer hour not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows moving a volunteer hour to an active event in the same org", async () => {
    const updated = { id: "vh-1", eventId: "event-2" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vh-1",
            orgId: "org-1",
            eventId: "event-1",
            event: { id: "event-1", orgId: "org-1", deletedAt: null },
          }),
        },
        events: {
          findFirst: vi.fn().mockResolvedValue({
            id: "event-2",
            orgId: "org-1",
            deletedAt: null,
          }),
        },
      },
      update: updateFn,
    });

    const result = await updateVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
      data: { eventId: "event-2" },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({ eventId: "event-2" });
    expect(result).toEqual(updated);
  });

  it("rejects updates that would clear the only event or program reference", async () => {
    const db = {
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vh-1",
            orgId: "org-1",
            eventId: "event-1",
            program: null,
            event: { id: "event-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        volunteerHourId: "vh-1",
        data: { eventId: null },
      }),
    ).rejects.toThrow("Volunteer hours must reference an event or program");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows clearing program when the existing event reference remains", async () => {
    const updated = { id: "vh-1", eventId: "event-1", program: null, hours: "2" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vh-1",
            orgId: "org-1",
            eventId: "event-1",
            program: "Food Pantry",
            event: { id: "event-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateFn,
    });

    const result = await updateVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
      data: { program: null },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({ program: null });
    expect(result).toEqual({ ...updated, hours: 2 });
  });

  it("converts hours and dates when updating", async () => {
    const updated = { id: "vh-1", hours: "3" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
      data: {
        hours: 3,
        date: "2026-05-03T12:00:00Z",
        notes: null,
      },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({
      hours: "3",
      notes: null,
    });
    expect((setFn.mock.calls[0]?.[0] as Record<string, unknown>).date).toBeInstanceOf(Date);
  });

  it("rejects volunteer hour updates when the event is outside the org", async () => {
    const db = {
      query: {
        events: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        volunteerHourId: "vh-1",
        data: {
          eventId: "event-foreign",
        },
      }),
    ).rejects.toThrow("Event not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("throws when volunteer hour is missing", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        volunteerHourId: "missing",
        data: { program: "Food Pantry" },
      }),
    ).rejects.toThrow("Volunteer hour not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "vh-1", program: "Food Pantry" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      volunteerHourId: "vh-1",
      data: {
        eventId: null,
        program: "Food Pantry",
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "volunteer_hour",
        entityId: "vh-1",
      }),
    );
  });

  it("wraps update and activity log in a transaction", async () => {
    const updated = { id: "vh-1", program: "Food Pantry" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      volunteerHourId: "vh-1",
      data: { eventId: null, program: "Food Pantry" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "volunteer_hour", action: "updated" }),
    );
  });

  it("rolls back when activity log throws during updateVolunteerHour", async () => {
    const updated = { id: "vh-1", program: "Food Pantry" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateVolunteerHour(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        volunteerHourId: "vh-1",
        data: { eventId: null, program: "Food Pantry" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("deleteVolunteerHour", () => {
  it("soft-deletes a volunteer hour row", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "vh-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(setFn.mock.calls[0]?.[0]).toEqual({ deletedAt: expect.any(Date) });
  });

  it("allows volunteer hour deletes when the linked event is soft-deleted", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "vh-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({
      query: {
        volunteerHours: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vh-1",
            orgId: "org-1",
            eventId: "event-1",
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

    await deleteVolunteerHour(db as never, {
      orgId: "org-1",
      volunteerHourId: "vh-1",
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  it("records activity when an actor id is provided", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "vh-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      volunteerHourId: "vh-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "volunteer_hour",
        entityId: "vh-1",
      }),
    );
  });

  it("wraps delete and activity log in a transaction", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "vh-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteVolunteerHour(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      volunteerHourId: "vh-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "volunteer_hour", action: "deleted" }),
    );
  });

  it("rolls back when activity log throws during deleteVolunteerHour", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "vh-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteVolunteerHour(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        volunteerHourId: "vh-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
