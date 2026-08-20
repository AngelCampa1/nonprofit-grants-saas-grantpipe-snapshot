import { describe, it, expect, vi } from "vitest";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addContactTags,
  removeContactTag,
} from "./tag.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

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

const tagIdOne = "11111111-1111-4111-8111-111111111111";
const tagIdTwo = "22222222-2222-4222-8222-222222222222";
const tagIdThree = "33333333-3333-4333-8333-333333333333";
const foreignTagId = "44444444-4444-4444-8444-444444444444";

// ---------------------------------------------------------------------------
// listTags
// ---------------------------------------------------------------------------

describe("listTags", () => {
  it("returns all tags for the org", async () => {
    const orgTags = [
      { id: "t-1", name: "Major Donor", color: "#e07a5f" },
      { id: "t-2", name: "Board Member", color: "#065f46" },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(orgTags),
          }),
        }),
      }),
    };

    const result = await listTags(db as never, "org-1");
    expect(result).toEqual(orgTags);
  });

  it("filters out soft-deleted tags", async () => {
    const whereFn = vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereFn,
        }),
      }),
    };

    await listTags(db as never, "org-1");

    expect(safeJson(whereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });
});

// ---------------------------------------------------------------------------
// createTag
// ---------------------------------------------------------------------------

describe("createTag", () => {
  it("rejects invalid input before inserting", async () => {
    const insertFn = vi.fn();
    const db = withTransaction({ insert: insertFn });

    await expect(
      createTag(db as never, {
        orgId: "org-1",
        name: "",
        color: "red",
      }),
    ).rejects.toThrow("Tag name is required");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts a tag with orgId", async () => {
    const newTag = { id: "t-1", orgId: "org-1", name: "VIP", color: "#e07a5f" };
    const returningFn = vi.fn().mockResolvedValue([newTag]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    const result = await createTag(db as never, {
      orgId: "org-1",
      name: "VIP",
      color: "#e07a5f",
    });

    expect(result).toEqual(newTag);
  });

  it("throws when insert fails", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(createTag(db as never, { orgId: "org-1", name: "VIP" })).rejects.toThrow(
      "Failed to create tag",
    );
  });

  it("records activity when an actor id is provided", async () => {
    const newTag = { id: "t-1", orgId: "org-1", name: "VIP", color: "#e07a5f" };
    const returningFn = vi.fn().mockResolvedValue([newTag]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await createTag(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      name: "VIP",
      color: "#e07a5f",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "tag",
        entityId: "t-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const newTag = { id: "t-1", orgId: "org-1", name: "VIP", color: "#e07a5f" };
    const returningFn = vi.fn().mockResolvedValue([newTag]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await createTag(db as never, { orgId: "org-1", actorId: "user-2", name: "VIP" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "tag", action: "created" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const newTag = { id: "t-1", orgId: "org-1", name: "VIP", color: "#e07a5f" };
    const returningFn = vi.fn().mockResolvedValue([newTag]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createTag(db as never, { orgId: "org-1", actorId: "user-2", name: "VIP" }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// updateTag
// ---------------------------------------------------------------------------

describe("updateTag", () => {
  it("rejects invalid input before updating", async () => {
    const updateFn = vi.fn();
    const db = withTransaction({ update: updateFn });

    await expect(
      updateTag(db as never, {
        orgId: "org-1",
        tagId: "t-1",
        data: { color: "red" },
      }),
    ).rejects.toThrow("Invalid string");

    expect(updateFn).not.toHaveBeenCalled();
  });

  it("updates a tag scoped by orgId", async () => {
    const updated = { id: "t-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    const result = await updateTag(db as never, {
      orgId: "org-1",
      tagId: "t-1",
      data: { name: "Updated" },
    });

    expect(result).toEqual(updated);
  });

  it("does not update soft-deleted tags", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateTag(db as never, {
        orgId: "org-1",
        tagId: "t-deleted",
        data: { name: "Updated" },
      }),
    ).rejects.toThrow("Tag not found");

    expect(safeJson(whereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });

  it("throws when tag not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateTag(db as never, { orgId: "org-1", tagId: "t-missing", data: { name: "X" } }),
    ).rejects.toThrow("Tag not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "t-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateTag(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      tagId: "t-1",
      data: { name: "Updated" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "tag",
        entityId: "t-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updated = { id: "t-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateTag(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      tagId: "t-1",
      data: { name: "Updated" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "tag", action: "updated" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const updated = { id: "t-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateTag(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        tagId: "t-1",
        data: { name: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// deleteTag
// ---------------------------------------------------------------------------

function makeDeleteTagTxDb(tagRow: { id: string } | undefined) {
  const ctDeleteWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateReturningFn = vi
    .fn()
    .mockResolvedValue(tagRow ? [{ ...tagRow, deletedAt: new Date() }] : []);
  const updateWhereFn = vi.fn().mockReturnValue({ returning: updateReturningFn });
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const txMock = {
    delete: vi.fn().mockReturnValue({ where: ctDeleteWhereFn }),
    update: vi.fn().mockReturnValue({ set: updateSetFn }),
  };
  const db = {
    query: { tags: { findFirst: vi.fn().mockResolvedValue(tagRow) } },
    transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => {
      await fn(txMock);
    }),
  };
  return {
    db,
    txMock,
    ctDeleteWhereFn,
    updateSetFn,
    updateWhereFn,
    updateReturningFn,
  };
}

describe("deleteTag", () => {
  it("soft-deletes the tag and deletes its contact associations inside a transaction", async () => {
    const updateWhereFn = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "t-1", deletedAt: new Date() }]),
    });
    const setFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    const ctDeleteWhereFn = vi.fn().mockResolvedValue(undefined);
    const txMock = {
      delete: vi.fn().mockReturnValue({ where: ctDeleteWhereFn }),
      update: vi.fn().mockReturnValue({ set: setFn }),
    };
    const db = {
      query: { tags: { findFirst: vi.fn().mockResolvedValue({ id: "t-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => {
        await fn(txMock);
      }),
    };

    await deleteTag(db as never, { orgId: "org-1", tagId: "t-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txMock.delete).toHaveBeenCalledTimes(1);
    expect(txMock.update).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));

    // The first delete (contact_tags) must scope by orgId.
    const ctWhereArg = ctDeleteWhereFn.mock.calls[0]![0];
    expect(safeJson(ctWhereArg)).toContain("org-1");
    expect(safeJson(updateWhereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });

  it("throws when tag not found — does not open a transaction", async () => {
    const db = {
      query: {
        tags: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      transaction: vi.fn(),
    };

    await expect(deleteTag(db as never, { orgId: "org-1", tagId: "t-missing" })).rejects.toThrow(
      "Tag not found",
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses to open a transaction when the tag is outside the caller org", async () => {
    const db = {
      query: { tags: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      transaction: vi.fn(),
    };

    await expect(deleteTag(db as never, { orgId: "org-1", tagId: "tag-foreign" })).rejects.toThrow(
      "Tag not found",
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { db } = makeDeleteTagTxDb({ id: "t-1" });
    // Ensure recordActivityLog stub is accessible via the txMock so the in-tx call fires.
    // The makeDeleteTagTxDb transaction invokes fn(txMock), and recordActivityLog(tx, ...) will
    // use txMock as tx — our vi.mock intercepts all calls regardless of the first arg.

    await deleteTag(db as never, { orgId: "org-1", actorId: "user-2", tagId: "t-1" });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "tag",
        entityId: "t-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog fires inside tx for deleteTag", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { db } = makeDeleteTagTxDb({ id: "t-1" });

    await deleteTag(db as never, { orgId: "org-1", actorId: "user-2", tagId: "t-1" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "tag", action: "deleted" }),
    );
  });

  it("atomicity: rejects when recordActivityLog inside tx throws for deleteTag", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { db } = makeDeleteTagTxDb({ id: "t-1" });

    await expect(
      deleteTag(db as never, { orgId: "org-1", actorId: "user-2", tagId: "t-1" }),
    ).rejects.toThrow("audit log down");
  });

  it("rolls back association delete when tag soft-delete throws inside the transaction", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const findFirst = vi.fn().mockResolvedValue({ id: "t-1" });
    const ctDeleteWhereFn = vi.fn().mockResolvedValue(undefined);
    const updateReturningFn = vi.fn().mockRejectedValue(new Error("DB constraint violation"));
    const txMock = {
      delete: vi.fn().mockReturnValue({ where: ctDeleteWhereFn }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: updateReturningFn }),
        }),
      }),
    };
    let transactionCallbackError: Error | undefined;
    const db = {
      query: { tags: { findFirst } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => {
        try {
          await fn(txMock);
        } catch (err) {
          transactionCallbackError = err as Error;
          throw err; // real transaction would rollback here
        }
      }),
    };

    await expect(deleteTag(db as never, { orgId: "org-1", tagId: "t-1" })).rejects.toThrow(
      "DB constraint violation",
    );

    expect(txMock.delete).toHaveBeenCalledTimes(1);
    expect(txMock.update).toHaveBeenCalledTimes(1);
    expect(transactionCallbackError).toBeDefined();
    expect(transactionCallbackError?.message).toBe("DB constraint violation");
    expect(recordActivityLog).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "deleted",
        entityType: "tag",
        entityId: "t-1",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// addContactTags
// ---------------------------------------------------------------------------

describe("addContactTags", () => {
  it("rejects invalid tagIds before reading contacts", async () => {
    const findFirst = vi.fn();
    const selectFn = vi.fn();
    const insertFn = vi.fn();
    const db = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };

    await expect(
      addContactTags(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        tagIds: [],
      }),
    ).rejects.toThrow("At least one tag is required");

    expect(findFirst).not.toHaveBeenCalled();
    expect(selectFn).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts junction rows for each tagId", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: tagIdOne }, { id: tagIdTwo }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };
    const db = withTransaction(dbBase);

    await addContactTags(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      tagIds: [tagIdOne, tagIdTwo],
    });

    const insertedValues = valuesFn.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]!.orgId).toBe("org-1");
    expect(insertedValues[0]!.contactId).toBe("c-1");
    expect(insertedValues[0]!.tagId).toBe(tagIdOne);
    expect(insertedValues[1]!.orgId).toBe("org-1");
    expect(insertedValues[1]!.tagId).toBe(tagIdTwo);
  });

  it("includes orgId in every inserted junction row", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c-2" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: tagIdThree }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };
    const db = withTransaction(dbBase);

    await addContactTags(db as never, {
      orgId: "org-99",
      contactId: "c-2",
      tagIds: [tagIdThree],
    });

    const inserted = valuesFn.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(inserted[0]!.orgId).toBe("org-99");
    expect(inserted[0]!.contactId).toBe("c-2");
    expect(inserted[0]!.tagId).toBe(tagIdThree);
  });

  it("rejects when the contact is outside the caller org", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const addTags = addContactTags as (
      db: never,
      params: { orgId: string; contactId: string; tagIds: string[] },
    ) => Promise<void>;
    const db = {
      query: { contacts: { findFirst } },
      insert: insertFn,
    };

    await expect(
      addTags(db as never, {
        orgId: "org-1",
        contactId: "contact-foreign",
        tagIds: [tagIdOne],
      }),
    ).rejects.toThrow("Contact not found");
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects when any tag is outside the caller org", async () => {
    const findContact = vi.fn().mockResolvedValue({ id: "contact-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([]);
    const insertFn = vi.fn();
    const addTags = addContactTags as (
      db: never,
      params: { orgId: string; contactId: string; tagIds: string[] },
    ) => Promise<void>;
    const db = {
      query: { contacts: { findFirst: findContact } },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: selectWhereFn }),
      }),
      insert: insertFn,
    };

    await expect(
      addTags(db as never, {
        orgId: "org-1",
        contactId: "contact-1",
        tagIds: [foreignTagId],
      }),
    ).rejects.toThrow("Tag not found");
    expect(insertFn).not.toHaveBeenCalled();
    expect(safeJson(selectWhereFn.mock.calls[0]?.[0])).toContain("deleted_at");
  });

  it("records activity when an actor id is provided", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: tagIdOne }, { id: tagIdTwo }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };
    const db = withTransaction(dbBase);

    await addContactTags(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      tagIds: [tagIdOne, tagIdTwo],
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "tags_added",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: tagIdOne }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };
    const db = withTransaction(dbBase);

    await addContactTags(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      tagIds: [tagIdOne],
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "tags_added" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: tagIdOne }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      insert: insertFn,
    };
    const db = withTransaction(dbBase);

    await expect(
      addContactTags(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        tagIds: [tagIdOne],
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// removeContactTag
// ---------------------------------------------------------------------------

describe("removeContactTag", () => {
  it("deletes the junction row", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: "t-1" }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      delete: deleteFn,
    };
    const db = withTransaction(dbBase);

    await removeContactTag(db as never, { orgId: "org-1", contactId: "c-1", tagId: "t-1" });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it("rejects when the contact or tag is outside the caller org", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "contact-1" });
    const deleteFn = vi.fn();
    const removeTag = removeContactTag as (
      db: never,
      params: { orgId: string; contactId: string; tagId: string },
    ) => Promise<void>;
    const db = {
      query: { contacts: { findFirst } },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      delete: deleteFn,
    };

    await expect(
      removeTag(db as never, {
        orgId: "org-1",
        contactId: "contact-1",
        tagId: "tag-foreign",
      }),
    ).rejects.toThrow("Tag not found");
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: "t-1" }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      delete: deleteFn,
    };
    const db = withTransaction(dbBase);

    await removeContactTag(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      tagId: "t-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "tag_removed",
        entityType: "contact",
        entityId: "c-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: "t-1" }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      delete: deleteFn,
    };
    const db = withTransaction(dbBase);

    await removeContactTag(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      tagId: "t-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact", action: "tag_removed" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const findFirst = vi.fn().mockResolvedValue({ id: "c-1" });
    const selectWhereFn = vi.fn().mockResolvedValue([{ id: "t-1" }]);
    const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const dbBase = {
      query: { contacts: { findFirst } },
      select: selectFn,
      delete: deleteFn,
    };
    const db = withTransaction(dbBase);

    await expect(
      removeContactTag(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        tagId: "t-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
