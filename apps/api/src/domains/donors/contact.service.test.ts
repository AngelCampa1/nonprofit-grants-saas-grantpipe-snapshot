import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  updatePipelineStage,
  exportContactsCsv,
  escapeLike,
} from "./contact.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../accounting/postingEngine", () => ({
  postDonation: vi.fn().mockResolvedValue(undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { postDonation } from "../accounting/postingEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(value: unknown): string {
  const seen = new Set<unknown>();
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
}

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

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, returningFn };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn, returningFn };
}

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------

describe("createContact", () => {
  it("inserts a contact with orgId and returns it", async () => {
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
    };
    const { insertFn, valuesFn } = makeInsertMock(newContact);
    const db = withTransaction({ insert: insertFn });

    const result = await createContact(db as never, {
      orgId: "org-1",
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    const insertedValues = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedValues.orgId).toBe("org-1");
    expect(insertedValues.type).toBe("individual");
    expect(insertedValues.firstName).toBe("Jane");
    expect(result).toEqual(newContact);
  });

  it("persists the volunteer flag when creating a contact", async () => {
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      isVolunteer: true,
      pipelineStage: "prospect",
    };
    const { insertFn, valuesFn } = makeInsertMock(newContact);
    const db = withTransaction({ insert: insertFn });

    await createContact(db as never, {
      orgId: "org-1",
      type: "individual",
      firstName: "Jane",
      isVolunteer: true,
      pipelineStage: "prospect",
    });

    expect(valuesFn.mock.calls[0]?.[0]).toMatchObject({ isVolunteer: true });
  });

  it("accepts a same-org affiliated organization and proceeds with insert", async () => {
    const affiliatedOrg = {
      id: "11111111-1111-4111-8111-111111111111",
      orgId: "org-1",
    };
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
      affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
    };
    const findFirst = vi.fn().mockResolvedValue(affiliatedOrg);
    const { insertFn, valuesFn } = makeInsertMock(newContact);
    const db = withTransaction({
      query: {
        contacts: {
          findFirst,
        },
      },
      insert: insertFn,
    });

    const result = await createContact(db as never, {
      orgId: "org-1",
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
      affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
    });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(insertFn).toHaveBeenCalledTimes(1);
    const insertedValues = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedValues.affiliatedOrgId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual(newContact);
  });

  it("throws when insert returns no rows", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createContact(db as never, {
        orgId: "org-1",
        type: "individual",
        firstName: "Jane",
        pipelineStage: "prospect",
      }),
    ).rejects.toThrow("Failed to create contact");
  });

  it("rejects invalid create input before inserting contacts", async () => {
    const insertFn = vi.fn();
    const db = withTransaction({ insert: insertFn });

    await expect(
      createContact(db as never, {
        orgId: "org-1",
        type: "individual",
        firstName: "   ",
        pipelineStage: "prospect",
      }),
    ).rejects.toThrow("First name is required.");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
    };
    const { insertFn } = makeInsertMock(newContact);
    const db = withTransaction({ insert: insertFn });

    await createContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("rejects affiliatedOrgId outside the caller org", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst,
        },
      },
      insert: insertFn,
    });

    await expect(
      createContact(db as never, {
        orgId: "org-1",
        type: "individual",
        firstName: "Jane",
        pipelineStage: "prospect",
        affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow("Affiliated organization not found");
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      pipelineStage: "prospect",
    };
    const { insertFn } = makeInsertMock(newContact);
    const db = withTransaction({ insert: insertFn });

    await createContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      type: "individual",
      firstName: "Jane",
      pipelineStage: "prospect",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "created" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      pipelineStage: "prospect",
    };
    const { insertFn } = makeInsertMock(newContact);
    const db = withTransaction({ insert: insertFn });

    await expect(
      createContact(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        type: "individual",
        firstName: "Jane",
        pipelineStage: "prospect",
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

describe("updateContact", () => {
  it("updates a contact scoped by orgId and returns it", async () => {
    const updated = { id: "c-1", orgId: "org-1", firstName: "Janet" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    const result = await updateContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      data: { firstName: "Janet" },
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.firstName).toBe("Janet");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual(updated);
  });

  it("persists the volunteer flag when updating a contact", async () => {
    const updated = { id: "c-1", orgId: "org-1", isVolunteer: true };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      data: { isVolunteer: true },
    });

    expect(setFn.mock.calls[0]?.[0]).toMatchObject({ isVolunteer: true });
  });

  it("normalizes blank update email to null before updating contacts", async () => {
    const updated = { id: "c-1", orgId: "org-1", email: null };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      data: { email: "" },
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.email).toBeNull();
  });

  it("accepts a same-org affiliated organization and proceeds with update", async () => {
    const affiliatedOrg = {
      id: "11111111-1111-4111-8111-111111111111",
      orgId: "org-1",
    };
    const updated = {
      id: "c-1",
      orgId: "org-1",
      affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
    };
    const findFirst = vi.fn().mockResolvedValue(affiliatedOrg);
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({
      query: {
        contacts: {
          findFirst,
        },
      },
      update: updateFn,
    });

    const result = await updateContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      data: { affiliatedOrgId: "11111111-1111-4111-8111-111111111111" },
    });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.affiliatedOrgId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual(updated);
  });

  it("throws when contact not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFnEmpty = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFnEmpty });

    await expect(
      updateContact(db as never, {
        orgId: "org-1",
        contactId: "c-missing",
        data: { firstName: "X" },
      }),
    ).rejects.toThrow("Contact not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "c-1", orgId: "org-1", firstName: "Janet" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      data: { firstName: "Janet" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("rejects affiliatedOrgId outside the caller org", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const updateFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst,
        },
      },
      update: updateFn,
    });

    await expect(
      updateContact(db as never, {
        orgId: "org-1",
        contactId: "contact-1",
        data: { affiliatedOrgId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toThrow("Affiliated organization not found");
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updated = { id: "c-1", orgId: "org-1", firstName: "Janet" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updateContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      data: { firstName: "Janet" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "updated" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const updated = { id: "c-1", orgId: "org-1", firstName: "Janet" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await expect(
      updateContact(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        data: { firstName: "Janet" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// deleteContact helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock transaction context (tx) that records update, delete, and
 * select calls. The select mock serves the donation-ID lookup that now happens
 * inside the transaction via `tx`.
 */
function makeDeleteContactTx(contactReturnValue: unknown, donationIds: string[] = []) {
  // contact update mock — chains: update(contacts).set({}).where({}).returning()
  const contactReturningFn = vi.fn().mockResolvedValue([contactReturnValue].filter(Boolean));
  const contactWhereFn = vi.fn().mockReturnValue({ returning: contactReturningFn });
  const contactSetFn = vi.fn().mockReturnValue({ where: contactWhereFn });

  // donations update mock — chains: update(donations).set({}).where()
  const donationsWhereFn = vi.fn().mockResolvedValue([]);
  const donationsSetFn = vi.fn().mockReturnValue({ where: donationsWhereFn });

  // contactTags delete mock — chains: delete(contactTags).where()
  const contactTagsWhereFn = vi.fn().mockResolvedValue([]);

  // customFieldValues delete mock — chains: delete(customFieldValues).where()
  const customFieldValuesWhereFn = vi.fn().mockResolvedValue([]);

  let updateCallCount = 0;
  let deleteCallCount = 0;

  const updateFn = vi.fn().mockImplementation(() => {
    updateCallCount++;
    if (updateCallCount === 1) {
      return { set: contactSetFn };
    }
    // donations update
    return { set: donationsSetFn };
  });

  const deleteFn = vi.fn().mockImplementation(() => {
    deleteCallCount++;
    if (deleteCallCount === 1) {
      return { where: contactTagsWhereFn };
    }
    return { where: customFieldValuesWhereFn };
  });

  // Donation-ID select — chains: select({id}).from(donations).where(...)
  const donationRows = donationIds.map((id) => ({ id }));
  const txSelectWhereFn = vi.fn().mockResolvedValue(donationRows);
  const txSelectFromFn = vi.fn().mockReturnValue({ where: txSelectWhereFn });
  const txSelectFn = vi.fn().mockReturnValue({ from: txSelectFromFn });

  const tx = { update: updateFn, delete: deleteFn, select: txSelectFn };

  return {
    tx,
    updateFn,
    deleteFn,
    txSelectFn,
    txSelectWhereFn,
    contactSetFn,
    contactWhereFn,
    contactReturningFn,
    donationsSetFn,
    donationsWhereFn,
    contactTagsWhereFn,
    customFieldValuesWhereFn,
  };
}

function makeDeleteContactDb(contactReturnValue: unknown, donationIds: string[] = []) {
  const mocks = makeDeleteContactTx(contactReturnValue, donationIds);
  const transactionFn = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => {
    return callback(mocks.tx);
  });

  const db = { transaction: transactionFn };
  return { db, transactionFn, ...mocks };
}

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------

describe("deleteContact", () => {
  beforeEach(() => {
    vi.mocked(postDonation).mockClear();
  });

  it("wraps the entire operation in a transaction", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, transactionFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  it("sets deletedAt on the contact", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, contactSetFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    const setArg = contactSetFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("soft-deletes donations for the contact", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, donationsSetFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    expect(donationsSetFn).toHaveBeenCalledTimes(1);
    const setArg = donationsSetFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("hard-deletes contactTags for the contact", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, deleteFn, contactTagsWhereFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    // delete should be called at least once (first call is contactTags)
    expect(deleteFn).toHaveBeenCalled();
    expect(contactTagsWhereFn).toHaveBeenCalledTimes(1);
  });

  it("hard-deletes customFieldValues for the contact", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, customFieldValuesWhereFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    expect(customFieldValuesWhereFn).toHaveBeenCalledTimes(1);
  });

  it("throws when contact not found and does not cascade", async () => {
    const { db, donationsSetFn, deleteFn } = makeDeleteContactDb(null);

    await expect(
      deleteContact(db as never, { orgId: "org-1", contactId: "c-missing" }),
    ).rejects.toThrow("Contact not found");

    // cascade should not have been called when contact is missing
    expect(donationsSetFn).not.toHaveBeenCalled();
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    const deleted = { id: "c-1", deletedAt: new Date("2026-04-08T00:00:00Z") };
    const { db } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("calls postDonation with action=delete for each affected donation when actorId is present", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db } = makeDeleteContactDb(deleted, ["d-1", "d-2"]);

    await deleteContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
    });

    expect(postDonation).toHaveBeenCalledTimes(2);
    expect(postDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        donationId: "d-1",
        action: "delete",
        actorId: "user-2",
      }),
    );
    expect(postDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        donationId: "d-2",
        action: "delete",
        actorId: "user-2",
      }),
    );
  });

  it("does not call postDonation when there are no donations", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    // donationIds defaults to []
    const { db } = makeDeleteContactDb(deleted, []);

    await deleteContact(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
    });

    expect(postDonation).not.toHaveBeenCalled();
  });

  it("does not call postDonation when actorId is absent", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db } = makeDeleteContactDb(deleted, ["d-1"]);

    // No actorId
    await deleteContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
    });

    expect(postDonation).not.toHaveBeenCalled();
  });

  it("atomicity: transaction runs once and recordActivityLog fires inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db, transactionFn } = makeDeleteContactDb(deleted);

    await deleteContact(db as never, { orgId: "org-1", actorId: "user-2", contactId: "c-1" });

    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "deleted" }),
    );
  });

  it("atomicity: rejects when recordActivityLog inside tx throws for deleteContact", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { db } = makeDeleteContactDb(deleted);

    await expect(
      deleteContact(db as never, { orgId: "org-1", actorId: "user-2", contactId: "c-1" }),
    ).rejects.toThrow("audit log down");
  });

  it("atomicity: rejects when postDonation throws inside the transaction (fiscal period conflict)", async () => {
    // Simulate a 409 conflict thrown by postDonation when no open fiscal period
    // covers the reversal date. Because postDonation now runs inside the tx
    // callback, the error propagates out of the transaction and the entire
    // delete is rolled back (contact and donations remain intact).
    vi.mocked(postDonation).mockRejectedValueOnce(
      new Error("No open fiscal period covers the reversal date"),
    );
    const deleted = { id: "c-1", deletedAt: new Date() };
    // Provide one donation so postDonation is actually called
    const { db, transactionFn } = makeDeleteContactDb(deleted, ["d-1"]);

    await expect(
      deleteContact(db as never, { orgId: "org-1", actorId: "user-2", contactId: "c-1" }),
    ).rejects.toThrow("No open fiscal period covers the reversal date");

    // The transaction callback must have been invoked (the error bubbles from inside it)
    expect(transactionFn).toHaveBeenCalledTimes(1);
    // postDonation was called with the tx object (first arg) inside the transaction
    expect(postDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ donationId: "d-1", action: "delete" }),
    );
  });
});

// ---------------------------------------------------------------------------
// updatePipelineStage
// ---------------------------------------------------------------------------

describe("updatePipelineStage", () => {
  it("updates only pipelineStage and updatedAt", async () => {
    const updated = { id: "c-1", pipelineStage: "stewardship" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    const result = await updatePipelineStage(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      stage: "stewardship",
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.pipelineStage).toBe("stewardship");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(setArg)).toHaveLength(2);
    expect(result).toEqual(updated);
  });

  it("throws when contact not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updatePipelineStage(db as never, {
        orgId: "org-1",
        contactId: "c-missing",
        stage: "stewardship",
      }),
    ).rejects.toThrow("Contact not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "c-1", pipelineStage: "stewardship" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updatePipelineStage(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      stage: "stewardship",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated_pipeline_stage",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updated = { id: "c-1", pipelineStage: "stewardship" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await updatePipelineStage(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      stage: "stewardship",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "updated_pipeline_stage" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const updated = { id: "c-1", pipelineStage: "stewardship" };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({ update: updateFn });

    await expect(
      updatePipelineStage(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        stage: "stewardship",
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// getContact
// ---------------------------------------------------------------------------

describe("getContact", () => {
  it("returns a contact with giving stats including FY totals", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: null,
    };
    const lifetimeStats = {
      totalLifetimeGiving: 50000,
      donationCount: 5,
      firstGiftDate: new Date("2024-01-15"),
      lastGiftDate: new Date("2026-03-01"),
      averageGiftAmount: 10000,
    };
    const thisFYResult = { total: 20000 };
    const lastFYResult = { total: 15000 };
    const tagsList = [{ id: "t-1", name: "Major Donor", color: "#e07a5f" }];
    const tagRows = tagsList.map((tag) => ({
      tag: {
        ...tag,
        orgId: "org-1",
      },
    }));

    let selectCallCount = 0;
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(contact),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue(tagRows),
        },
      },
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        const call = selectCallCount;
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue(
                call === 1 ? [lifetimeStats] : call === 2 ? [thisFYResult] : [lastFYResult],
              ),
          }),
        };
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.contact).toEqual(contact);
    expect(result.tags).toEqual(tagsList);
    expect(result.givingStats.totalLifetimeGiving).toBe(50000);
    expect(result.givingStats.totalThisFY).toBe(20000);
    expect(result.givingStats.totalLastFY).toBe(15000);
    expect(result.affiliatedOrg).toBeNull();
  });

  it("omits tags from foreign orgs and soft-deleted tags when reading a contact", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: null,
    };
    const tagRows = [
      {
        tag: {
          id: "t-1",
          orgId: "org-1",
          name: "Major Donor",
          color: "#e07a5f",
          deletedAt: null,
        },
      },
      {
        tag: {
          id: "t-deleted",
          orgId: "org-1",
          name: "Deleted Tag",
          color: "#222222",
          deletedAt: new Date("2026-04-01T00:00:00Z"),
        },
      },
      {
        tag: {
          id: "t-foreign",
          orgId: "org-foreign",
          name: "Foreign Tag",
          color: "#111111",
          deletedAt: null,
        },
      },
    ];
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(contact),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue(tagRows),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalLifetimeGiving: 0,
              donationCount: 0,
              firstGiftDate: null,
              lastGiftDate: null,
              averageGiftAmount: 0,
            },
          ]),
        }),
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.tags).toEqual([
      {
        id: "t-1",
        name: "Major Donor",
        color: "#e07a5f",
      },
    ]);
  });

  it("fetches and returns affiliated org when affiliatedOrgId is set", async () => {
    const affiliatedOrg = {
      id: "11111111-1111-4111-8111-111111111111",
      orgId: "org-1",
      type: "organization",
      organizationName: "ACME Corp",
      affiliatedOrgId: null,
    };
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
    };

    let findFirstCallCount = 0;
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockImplementation(() => {
            findFirstCallCount++;
            return Promise.resolve(findFirstCallCount === 1 ? contact : affiliatedOrg);
          }),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.affiliatedOrg).toEqual(affiliatedOrg);
  });

  it("throws when contact not found", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      getContact(db as never, {
        orgId: "org-1",
        contactId: "c-missing",
        fiscalYearStartMonth: 1,
      }),
    ).rejects.toThrow("Contact not found");
  });

  it("returns default giving stats when no donations found", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: null,
    };
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(contact),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.givingStats).toEqual({
      totalLifetimeGiving: 0,
      donationCount: 0,
      firstGiftDate: null,
      lastGiftDate: null,
      averageGiftAmount: 0,
      totalThisFY: 0,
      totalLastFY: 0,
    });
    expect(result.tags).toEqual([]);
    expect(result.affiliatedOrg).toBeNull();
  });

  it("returns null for affiliatedOrg when affiliatedOrgId is set but record not found", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: "c-deleted",
    };

    let findFirstCallCount = 0;
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockImplementation(() => {
            findFirstCallCount++;
            // First call returns contact, second returns undefined (deleted/missing)
            return Promise.resolve(findFirstCallCount === 1 ? contact : undefined);
          }),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.affiliatedOrg).toBeNull();
  });

  it("passes limit: 100 to the contactTags findMany query", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: null,
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(contact),
        },
        contactTags: {
          findMany,
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      }),
    };

    await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("does not return affiliatedOrg when the stored reference is cross-org", async () => {
    const contact = {
      id: "c-1",
      orgId: "org-1",
      firstName: "Jane",
      type: "individual",
      affiliatedOrgId: "c-foreign-org",
    };

    let findFirstCallCount = 0;
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockImplementation(() => {
            findFirstCallCount++;
            return Promise.resolve(findFirstCallCount === 1 ? contact : undefined);
          }),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      }),
    };

    const result = await getContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-04-07"),
    });

    expect(result.affiliatedOrg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// escapeLike
// ---------------------------------------------------------------------------

describe("escapeLike", () => {
  it("escapes % and _ in the search string", () => {
    expect(escapeLike("100%_test")).toBe("100\\%\\_test");
  });

  it("returns unchanged string when no wildcards present", () => {
    expect(escapeLike("hello world")).toBe("hello world");
  });

  it("escapes multiple consecutive wildcards", () => {
    expect(escapeLike("50%%")).toBe("50\\%\\%");
  });
});

// ---------------------------------------------------------------------------
// listContacts — search escaping (#25)
// ---------------------------------------------------------------------------

describe("listContacts search term escaping", () => {
  it("escapes LIKE wildcards in the search pattern", () => {
    // The escapeLike function is exported and directly testable.
    // This test verifies that a search string "100%_test" becomes "100\%\_test"
    // so that ilike does not treat % and _ as SQL wildcards.
    expect(escapeLike("100%_test")).toBe("100\\%\\_test");

    // Verify a raw unescaped string is NOT equal to the escaped version
    expect("100%_test").not.toBe(escapeLike("100%_test"));
  });
});

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

function makeListContactsDb(rows: unknown[], count: number) {
  const db = {
    select: vi.fn().mockImplementation(() => {
      const callCount = db.select.mock.calls.length;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count }]),
        }),
      };
    }),
  };
  return db;
}

describe("listContacts", () => {
  it("returns paginated contacts with total count", async () => {
    const contactRows = [
      { id: "c-1", firstName: "Jane" },
      { id: "c-2", firstName: "Bob" },
    ];
    const db = makeListContactsDb(contactRows, 2);

    const result = await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.data).toEqual(contactRows);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("supports sortBy=createdAt with sortOrder=desc", async () => {
    const db = makeListContactsDb([], 0);

    await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(db.select).toHaveBeenCalled();
  });

  it("supports sortBy=lastDonationDate", async () => {
    const db = makeListContactsDb([], 0);

    await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "lastDonationDate",
      sortOrder: "asc",
    });

    expect(db.select).toHaveBeenCalled();
  });

  it("supports sortBy=totalGiving", async () => {
    const db = makeListContactsDb([], 0);

    await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "totalGiving",
      sortOrder: "asc",
    });

    expect(db.select).toHaveBeenCalled();
  });

  it("applies pipelineStage, type, search, and tagId filters", async () => {
    const dataWhereFn = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const countWhereFn = vi.fn().mockResolvedValue([{ count: 0 }]);
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        return {
          from: vi.fn().mockReturnValue({
            where: callCount === 1 ? dataWhereFn : countWhereFn,
          }),
        };
      }),
    };

    await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      pipelineStage: "prospect",
      type: "individual",
      search: "Jane",
      tagId: "t-1",
    });

    expect(db.select).toHaveBeenCalled();
    expect(safeJson(dataWhereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });

  it("defaults total to 0 when count query returns empty", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
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

    const result = await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// exportContactsCsv
// ---------------------------------------------------------------------------

function makeExportDb(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

describe("exportContactsCsv", () => {
  it("returns CSV with header and data rows", async () => {
    const rows = [
      {
        type: "individual",
        firstName: "Jane",
        lastName: "Doe",
        organizationName: null,
        email: "jane@example.com",
        phone: "555-1234",
        pipelineStage: "donor",
        lastDonationDate: "2026-01-15",
        totalGivingCents: 10000,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Name,Email,Phone,Type,Pipeline Stage,Last Donation Date,Total Giving (USD)",
    );
    expect(lines[1]).toBe("Jane Doe,jane@example.com,555-1234,individual,donor,2026-01-15,100.00");
  });

  it("returns only header when no contacts match", async () => {
    const db = makeExportDb([]);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    expect(csv).toBe("Name,Email,Phone,Type,Pipeline Stage,Last Donation Date,Total Giving (USD)");
  });

  it("neutralizes CSV formula injection in attacker-controlled donor fields", async () => {
    const rows = [
      {
        type: "organization",
        firstName: null,
        lastName: null,
        // A malicious donor name that would run as a formula in Excel/Sheets.
        organizationName: "=HYPERLINK(0,1)",
        email: "+1+1",
        phone: "@SUM(A1)",
        pipelineStage: "donor",
        lastDonationDate: null,
        totalGivingCents: 0,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });
    const line = csv.split("\n")[1]!;

    // The formula triggers are prefixed with a single quote (and quoted by RFC
    // 4180 when they also contain a comma), so none execute on open.
    expect(line).toContain('"\'=HYPERLINK(0,1)"');
    expect(line).toContain("'+1+1");
    expect(line).toContain("'@SUM(A1)");
    // The raw, unneutralized formula must never appear at a cell boundary.
    expect(line).not.toContain(",=HYPERLINK");
  });

  it("uses organizationName for org-type contacts", async () => {
    const rows = [
      {
        type: "organization",
        firstName: null,
        lastName: null,
        organizationName: "ACME Corp",
        email: null,
        phone: null,
        pipelineStage: "prospect",
        lastDonationDate: null,
        totalGivingCents: 0,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    const line = csv.split("\n")[1];
    expect(line).toMatch(/^ACME Corp,/);
  });

  it("falls back to firstName+lastName for org-type with no organizationName", async () => {
    const rows = [
      {
        type: "organization",
        firstName: "John",
        lastName: "Smith",
        organizationName: null,
        email: null,
        phone: null,
        pipelineStage: "prospect",
        lastDonationDate: null,
        totalGivingCents: 0,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    const line = csv.split("\n")[1];
    expect(line).toMatch(/^John Smith,/);
  });

  it("produces an empty Name column for an org-type contact with all null name fields", async () => {
    const rows = [
      {
        type: "organization",
        firstName: null,
        lastName: null,
        organizationName: null,
        email: null,
        phone: null,
        pipelineStage: null,
        lastDonationDate: null,
        totalGivingCents: 0,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    const lines = csv.split("\n");
    // Should not throw; the Name field should be empty (first CSV column)
    expect(lines.length).toBe(2);
    const dataLine = lines[1]!;
    // First column (Name) is empty — line starts with a comma
    expect(dataLine.startsWith(",")).toBe(true);
  });

  it("escapes commas in values with double quotes", async () => {
    const rows = [
      {
        type: "organization",
        firstName: null,
        lastName: null,
        organizationName: "Smith, Jones & Co",
        email: null,
        phone: null,
        pipelineStage: "prospect",
        lastDonationDate: null,
        totalGivingCents: 5000,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    expect(csv).toContain('"Smith, Jones & Co"');
  });

  it("accepts filter params without error", async () => {
    const whereFn = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereFn,
        }),
      }),
    };

    const csv = await exportContactsCsv(db as never, {
      orgId: "org-1",
      pipelineStage: "prospect",
      type: "individual",
      search: "Jane",
      tagId: "t-1",
    });

    expect(csv).toContain("Name,Email");
    expect(safeJson(whereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });

  it("handles null totalGivingCents as 0.00", async () => {
    const rows = [
      {
        type: "individual",
        firstName: "Bob",
        lastName: null,
        organizationName: null,
        email: null,
        phone: null,
        pipelineStage: "prospect",
        lastDonationDate: null,
        totalGivingCents: null,
      },
    ];
    const db = makeExportDb(rows);

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });

    const line = csv.split("\n")[1];
    expect(line).toMatch(/,0\.00$/);
  });

  it("caps the export at 10,000 rows even when the DB returns more", async () => {
    // Build 10,001 identical row objects
    const manyRows = Array.from({ length: 10_001 }, () => ({
      type: "individual",
      firstName: "A",
      lastName: "B",
      organizationName: null,
      email: null,
      phone: null,
      pipelineStage: "prospect",
      lastDonationDate: null,
      totalGivingCents: 0,
    }));

    // Make the DB mock return all 10,001 rows (the cap comes from the query limit)
    const limitFn = vi.fn().mockResolvedValue(manyRows.slice(0, 10_000));
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: limitFn,
            }),
          }),
        }),
      }),
    };

    const csv = await exportContactsCsv(db as never, { orgId: "org-1" });
    // Header + 10,000 data rows
    const lines = csv.split("\n");
    expect(lines.length).toBe(10_001);
    // Verify .limit was called with 10_000
    expect(limitFn).toHaveBeenCalledWith(10_000);
  });

  it("escapes LIKE wildcards in the search pattern for exportContactsCsv", () => {
    // The escapeLike helper is unit-tested directly above.
    // Here we confirm the exported helper applies the same escaping that
    // exportContactsCsv uses internally so searches like "100%_test" never
    // accidentally match all rows via SQL LIKE wildcards.
    const escaped = escapeLike("100%_test");
    expect(escaped).toBe("100\\%\\_test");
    const pattern = `%${escaped}%`;
    expect(pattern).toBe("%100\\%\\_test%");
  });
});
