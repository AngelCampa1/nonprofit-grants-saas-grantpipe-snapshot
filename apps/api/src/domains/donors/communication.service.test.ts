import { describe, it, expect, vi, beforeEach } from "vitest";
import { listCommunications, createCommunication } from "./communication.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

// Helper: wraps a mock db object with a transaction that invokes the callback
// with the same mock object as the tx, so inner db ops and recordActivityLog fire.
function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// createCommunication
// ---------------------------------------------------------------------------

describe("createCommunication", () => {
  // Helper to build a mock DB with a query.contacts.findFirst stub
  function makeDb(contactResult: Record<string, unknown> | undefined) {
    const findContactFirst = vi.fn().mockResolvedValue(contactResult);
    const returningFn = vi.fn().mockResolvedValue([
      {
        id: "comm-1",
        orgId: "org-1",
        contactId: "c-1",
        type: "note",
        subject: "Follow-up",
        loggedBy: "user-1",
      },
    ]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    return withTransaction({
      insert: insertFn,
      query: { contacts: { findFirst: findContactFirst } },
    });
  }

  beforeEach(() => {
    vi.mocked(recordActivityLog).mockClear();
  });

  it("throws 404 when contact does not belong to the org (cross-org write prevented)", async () => {
    // query.contacts.findFirst returns null — contact not in org
    const db = makeDb(undefined);

    await expect(
      createCommunication(db as never, {
        orgId: "org-attacker",
        contactId: "c-victim",
        loggedBy: "user-1",
        type: "note",
        subject: "Infiltration attempt",
      }),
    ).rejects.toThrow("Contact not found");

    // The insert must NOT have been called
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid input before reading contacts", async () => {
    const findContactFirst = vi.fn();
    const insertFn = vi.fn();
    const db = withTransaction({
      insert: insertFn,
      query: { contacts: { findFirst: findContactFirst } },
    });

    await expect(
      createCommunication(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        loggedBy: "user-1",
        type: "note",
      }),
    ).rejects.toThrow("Either subject or body is required");

    expect(findContactFirst).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts a communication log entry when contact belongs to org", async () => {
    const contact = { id: "c-1", orgId: "org-1" };
    const db = makeDb(contact);

    const result = await createCommunication(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      loggedBy: "user-1",
      type: "note",
      subject: "Follow-up",
    });

    const insertedTable = (db.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const valuesMock = (db.insert as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const insertedValues = valuesMock?.values?.mock?.calls[0]?.[0] as Record<string, unknown>;
    // insert was called with the communicationLog table reference
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertedTable).toBeDefined();
    expect(insertedValues).toBeDefined();
    expect(insertedValues.orgId).toBe("org-1");
    expect(insertedValues.contactId).toBe("c-1");
    expect(insertedValues.loggedBy).toBe("user-1");
    expect(result.orgId).toBe("org-1");
    expect(result.contactId).toBe("c-1");
    expect(result.loggedBy).toBe("user-1");
  });

  it("records activity when an actor id is provided", async () => {
    const contact = { id: "c-1", orgId: "org-1" };
    const db = makeDb(contact);

    await createCommunication(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      loggedBy: "user-1",
      type: "note",
      subject: "Follow-up",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created_communication",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("skips activity logging when no actor id is provided", async () => {
    const contact = { id: "c-1", orgId: "org-1" };
    const db = makeDb(contact);

    await createCommunication(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      loggedBy: "user-1",
      type: "note",
      subject: "Follow-up",
    });

    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("throws when insert fails", async () => {
    const contact = { id: "c-1", orgId: "org-1" };
    // Override returning to return empty array
    const findContactFirst = vi.fn().mockResolvedValue(contact);
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      insert: insertFn,
      query: { contacts: { findFirst: findContactFirst } },
    });

    await expect(
      createCommunication(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        loggedBy: "user-1",
        type: "note",
        subject: "Test",
      }),
    ).rejects.toThrow("Failed to create communication");
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const contact = { id: "c-1", orgId: "org-1" };
    const db = makeDb(contact);

    await createCommunication(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      loggedBy: "user-1",
      type: "note",
      subject: "Follow-up",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "created_communication" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const contact = { id: "c-1", orgId: "org-1" };
    const db = makeDb(contact);

    await expect(
      createCommunication(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        loggedBy: "user-1",
        type: "note",
        subject: "Follow-up",
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// listCommunications
// ---------------------------------------------------------------------------

describe("listCommunications", () => {
  it("returns paginated communications for a contact", async () => {
    const entries = [
      { id: "comm-1", type: "note", subject: "Call notes" },
      { id: "comm-2", type: "email", subject: "Thank you" },
    ];

    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue(entries),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };
      }),
    };

    const result = await listCommunications(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.data).toEqual(entries);
    expect(result.total).toBe(2);
  });

  it("defaults total to 0 when count query returns empty", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };
      }),
    };

    const result = await listCommunications(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(0);
  });
});
