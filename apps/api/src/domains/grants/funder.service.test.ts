import { describe, expect, it, vi } from "vitest";
import { recordActivityLog } from "../../lib/activity-log";
import {
  createFunder,
  createFunderContact,
  deleteFunder,
  deleteFunderContact,
  getFunder,
  listFunders,
  updateFunder,
  updateFunderContact,
} from "./funder.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

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

describe("listFunders", () => {
  it("returns paginated funders", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const count = db.select.mock.calls.length;
        if (count === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([{ id: "funder-1" }]),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        };
      }),
    };

    const result = await listFunders(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(1);
    expect(result.data).toEqual([{ id: "funder-1" }]);
  });

  it("supports search, type filters, and alternate sorting", async () => {
    for (const sortBy of ["createdAt", "type"] as const) {
      const offset = vi.fn().mockResolvedValue([]);
      const limit = vi.fn().mockReturnValue({ offset });
      const orderBy = vi.fn().mockReturnValue({ limit });
      const where = vi.fn().mockReturnValue({ orderBy });
      const from = vi.fn().mockReturnValue({ where });
      const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });
      const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
      const db = { select };

      await listFunders(db as never, {
        orgId: "org-1",
        page: 2,
        pageSize: 10,
        search: "acme",
        type: "foundation",
        sortBy,
        sortOrder: "desc",
      });

      expect(offset).toHaveBeenCalledWith(10);
    }
  });

  it("includes entity scope and falls back to zero when count is missing", async () => {
    const offset = vi.fn().mockResolvedValue([{ id: "funder-1" }]);
    const limit = vi.fn().mockReturnValue({ offset });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const countWhere = vi.fn().mockResolvedValue([undefined]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
    const db = { select };

    const result = await listFunders(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(0);
    expect(result.data).toEqual([{ id: "funder-1" }]);
  });
});

describe("getFunder", () => {
  it("returns a funder with contacts and grants", async () => {
    const funder = {
      id: "funder-1",
      name: "Acme Foundation",
      contacts: [{ id: "contact-1" }],
      grants: [{ id: "grant-1" }],
    };
    const db = {
      query: {
        funders: {
          findFirst: vi.fn().mockResolvedValue(funder),
        },
      },
    };

    const result = await getFunder(db as never, { orgId: "org-1", funderId: "funder-1" });
    expect(result).toEqual(funder);
  });

  it("ignores soft-deleted child rows when returning a funder", async () => {
    const funder = {
      id: "funder-1",
      name: "Acme Foundation",
      contacts: [
        { id: "contact-1", deletedAt: null },
        { id: "contact-2", deletedAt: new Date("2026-03-01T00:00:00Z") },
      ],
      grants: [
        { id: "grant-1", deletedAt: null },
        { id: "grant-2", deletedAt: new Date("2026-03-01T00:00:00Z") },
      ],
    };
    const db = {
      query: {
        funders: {
          findFirst: vi.fn().mockResolvedValue(funder),
        },
      },
    };

    const result = await getFunder(db as never, { orgId: "org-1", funderId: "funder-1" });
    expect(result.contacts).toHaveLength(1);
    expect(result.grants).toHaveLength(1);
    expect(result.contacts[0]?.id).toBe("contact-1");
    expect(result.grants[0]?.id).toBe("grant-1");
  });

  it("keeps child rows with omitted deletedAt values", async () => {
    const funder = {
      id: "funder-1",
      name: "Acme Foundation",
      contacts: [{ id: "contact-1" }],
      grants: [{ id: "grant-1" }],
    };
    const db = {
      query: {
        funders: {
          findFirst: vi.fn().mockResolvedValue(funder),
        },
      },
    };

    const result = await getFunder(db as never, { orgId: "org-1", funderId: "funder-1" });

    expect(result.contacts).toEqual([{ id: "contact-1" }]);
    expect(result.grants).toEqual([{ id: "grant-1" }]);
  });

  it("throws when the funder is missing", async () => {
    const db = {
      query: {
        funders: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(getFunder(db as never, { orgId: "org-1", funderId: "missing" })).rejects.toThrow(
      "Funder not found",
    );
  });
});

describe("funder mutations", () => {
  it("creates a funder", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn, valuesFn } = makeInsertMock({ id: "funder-1" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: insertFn,
    });

    const result = await createFunder(db as never, {
      orgId: "org-1",
      name: "Acme Foundation",
      type: "foundation",
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        name: "Acme Foundation",
        type: "foundation",
      }),
    );
    expect(result).toEqual({ id: "funder-1" });
  });

  it("uses the organization default entity when creating funders and contacts", async () => {
    const funderInsert = makeInsertMock({ id: "funder-1", entityId: "entity-default" });
    const contactInsert = makeInsertMock({ id: "contact-1", entityId: "entity-default" });
    const db = withTransaction({
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
        funders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "funder-1",
            orgId: "org-1",
            entityId: undefined,
          }),
        },
      },
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: funderInsert.valuesFn,
        })
        .mockReturnValueOnce({
          values: contactInsert.valuesFn,
        }),
    });
    funderInsert.valuesFn.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "funder-1" }]),
    });
    contactInsert.valuesFn.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "contact-1" }]),
    });

    await createFunder(db as never, {
      orgId: "org-1",
      name: "Default Entity Funder",
      type: "foundation",
    });
    await createFunderContact(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      name: "Jane Officer",
    });

    expect(funderInsert.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-default" }),
    );
    expect(contactInsert.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-default" }),
    );
  });

  it("records funder mutation activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn } = makeInsertMock({ id: "funder-1" });
    const { updateFn } = makeUpdateMock({ id: "funder-1", notes: "Updated" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      select: selectMock,
      insert: insertFn,
      update: updateFn,
    });

    await createFunder(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      name: "Acme Foundation",
      type: "foundation",
    });
    await updateFunder(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      data: { notes: "Updated" },
    });
    await deleteFunder(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder" }),
    );
  });

  it("throws when a funder insert or update does not return a row", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: create.insertFn,
      update: update.updateFn,
    });

    await expect(
      createFunder(db as never, {
        orgId: "org-1",
        name: "Acme Foundation",
        type: "foundation",
      }),
    ).rejects.toThrow("Failed to create funder");

    await expect(
      updateFunder(db as never, {
        orgId: "org-1",
        funderId: "funder-1",
        data: { notes: "Updated" },
      }),
    ).rejects.toThrow("Funder not found");

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });
    const deleteDb = withTransaction({ select: selectMock, update: update.updateFn });
    await expect(
      deleteFunder(deleteDb as never, {
        orgId: "org-1",
        funderId: "funder-1",
      }),
    ).rejects.toThrow("Funder not found");
  });

  it("updates a funder", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn, setFn } = makeUpdateMock({ id: "funder-1", notes: "Updated" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      update: updateFn,
    });

    const result = await updateFunder(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      data: { notes: "Updated" },
    });

    expect((setFn.mock.calls[0]![0] as Record<string, unknown>).updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ id: "funder-1", notes: "Updated" });
  });

  it("updateFunder passes only allowed fields to set() — never id, orgId, or createdAt", async () => {
    const { updateFn, setFn } = makeUpdateMock({
      id: "funder-1",
      name: "Renamed",
      notes: "Updated",
    });
    const db = withTransaction({
      query: {
        funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" }) },
      },
      update: updateFn,
    });

    await updateFunder(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      data: { name: "Renamed", notes: "Updated" },
    });

    const setPayload = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setPayload).toHaveProperty("name", "Renamed");
    expect(setPayload).toHaveProperty("notes", "Updated");
    expect(setPayload).toHaveProperty("updatedAt");
    expect(setPayload).not.toHaveProperty("id");
    expect(setPayload).not.toHaveProperty("orgId");
    expect(setPayload).not.toHaveProperty("createdAt");
    expect(setPayload).not.toHaveProperty("deletedAt");
  });

  it("soft deletes a funder when no active grants exist", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn, setFn } = makeUpdateMock({ id: "funder-1" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      select: selectMock,
      update: updateFn,
    });

    await deleteFunder(db as never, { orgId: "org-1", funderId: "funder-1" });
    expect((setFn.mock.calls[0]![0] as Record<string, unknown>).deletedAt).toBeInstanceOf(Date);
  });

  it("scopes funder deletion grant checks by entity when provided", async () => {
    const { updateFn } = makeUpdateMock({ id: "funder-1" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: undefined }]),
      }),
    });
    const db = withTransaction({
      select: selectMock,
      update: updateFn,
    });

    await deleteFunder(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      funderId: "funder-1",
    });

    expect(updateFn).toHaveBeenCalled();
  });

  it("blocks deletion of a funder that has active grants", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      select: selectMock,
      update: vi.fn(),
    });

    await expect(
      deleteFunder(db as never, { orgId: "org-1", funderId: "funder-1" }),
    ).rejects.toThrow("Cannot delete funder with active grants");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("createFunder: transaction called and log fires with tx — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { insertFn } = makeInsertMock({ id: "funder-1", name: "Acme", type: "foundation" });
    const db = withTransaction({ insert: insertFn, query: { funders: { findFirst: vi.fn() } } });

    await createFunder(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      name: "Acme",
      type: "foundation",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder", action: "created" }),
    );
  });

  it("createFunder: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { insertFn } = makeInsertMock({ id: "funder-1", name: "Acme", type: "foundation" });
    const db = withTransaction({ insert: insertFn, query: { funders: { findFirst: vi.fn() } } });

    await expect(
      createFunder(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        name: "Acme",
        type: "foundation",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateFunder: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeUpdateMock({ id: "funder-1" });
    const db = withTransaction({ update: updateFn, query: { funders: { findFirst: vi.fn() } } });

    await updateFunder(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      data: { notes: "Updated" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder", action: "updated" }),
    );
  });

  it("updateFunder: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeUpdateMock({ id: "funder-1" });
    const db = withTransaction({ update: updateFn, query: { funders: { findFirst: vi.fn() } } });

    await expect(
      updateFunder(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        funderId: "funder-1",
        data: { notes: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteFunder: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeUpdateMock({ id: "funder-1" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });
    const db = withTransaction({
      select: selectMock,
      update: updateFn,
      query: { funders: { findFirst: vi.fn() } },
    });

    await deleteFunder(db as never, { orgId: "org-1", actorId: "actor-1", funderId: "funder-1" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder", action: "deleted" }),
    );
  });

  it("deleteFunder: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeUpdateMock({ id: "funder-1" });
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });
    const db = withTransaction({
      select: selectMock,
      update: updateFn,
      query: { funders: { findFirst: vi.fn() } },
    });

    await expect(
      deleteFunder(db as never, { orgId: "org-1", actorId: "actor-1", funderId: "funder-1" }),
    ).rejects.toThrow("audit log down");
  });
});

describe("funder contact mutations", () => {
  it("creates a funder contact", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn, valuesFn } = makeInsertMock({ id: "contact-1" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: insertFn,
    });

    const result = await createFunderContact(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      name: "Jane Officer",
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        funderId: "funder-1",
        name: "Jane Officer",
      }),
    );
    expect(result).toEqual({ id: "contact-1" });
  });

  it("records funder contact activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn } = makeInsertMock({ id: "contact-1", name: "Jane Officer" });
    const { updateFn } = makeUpdateMock({ id: "contact-1", title: "Director" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: insertFn,
      update: updateFn,
    });

    await createFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      name: "Jane Officer",
    });
    await updateFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      contactId: "contact-1",
      data: { title: "Director" },
    });
    await deleteFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      contactId: "contact-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder_contact" }),
    );
  });

  it("rejects funder contacts outside the org before insert", async () => {
    const funderLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createFunderContact(db as never, {
        orgId: "org-1",
        funderId: "funder-foreign",
        name: "Jane Officer",
      }),
    ).rejects.toThrow("Funder not found");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("updates a funder contact", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn } = makeUpdateMock({ id: "contact-1", title: "Director" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      update: updateFn,
    });

    const result = await updateFunderContact(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      contactId: "contact-1",
      data: { title: "Director" },
    });

    expect(result).toEqual({ id: "contact-1", title: "Director" });
  });

  it("updateFunderContact passes only explicit allowed fields to set() — never orgId, funderId, or id", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn, setFn } = makeUpdateMock({ id: "contact-1", name: "Jane", title: "VP" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      update: updateFn,
    });

    await updateFunderContact(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      contactId: "contact-1",
      data: {
        name: "Jane",
        title: "VP",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "VIP",
      },
    });

    const setPayload = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setPayload).toHaveProperty("name", "Jane");
    expect(setPayload).toHaveProperty("title", "VP");
    expect(setPayload).toHaveProperty("email", "jane@example.com");
    expect(setPayload).toHaveProperty("phone", "555-1234");
    expect(setPayload).toHaveProperty("notes", "VIP");
    expect(setPayload).not.toHaveProperty("id");
    expect(setPayload).not.toHaveProperty("orgId");
    expect(setPayload).not.toHaveProperty("funderId");
    expect(setPayload).not.toHaveProperty("deletedAt");
    expect(setPayload).not.toHaveProperty("createdAt");
  });

  it("rejects funder contact updates outside the org", async () => {
    const funderLookup = vi.fn().mockResolvedValue(undefined);
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      update: vi.fn(),
    });

    await expect(
      updateFunderContact(db as never, {
        orgId: "org-1",
        funderId: "funder-foreign",
        contactId: "contact-1",
        data: { title: "Director" },
      }),
    ).rejects.toThrow("Funder not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("throws when funder contact mutations do not return a row", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      insert: create.insertFn,
      update: update.updateFn,
    });

    await expect(
      createFunderContact(db as never, {
        orgId: "org-1",
        funderId: "funder-1",
        name: "Jane Officer",
      }),
    ).rejects.toThrow("Failed to create funder contact");

    await expect(
      updateFunderContact(db as never, {
        orgId: "org-1",
        funderId: "funder-1",
        contactId: "contact-1",
        data: { title: "Director" },
      }),
    ).rejects.toThrow("Funder contact not found");

    const deleteDb = withTransaction({
      update: update.updateFn,
      query: { funders: { findFirst: funderLookup } },
    });
    await expect(
      deleteFunderContact(deleteDb as never, {
        orgId: "org-1",
        funderId: "funder-1",
        contactId: "contact-1",
      }),
    ).rejects.toThrow("Funder contact not found");
  });

  it("soft deletes a funder contact", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn, setFn } = makeUpdateMock({ id: "contact-1" });
    const db = withTransaction({
      query: {
        funders: {
          findFirst: funderLookup,
        },
      },
      update: updateFn,
    });

    await deleteFunderContact(db as never, {
      orgId: "org-1",
      funderId: "funder-1",
      contactId: "contact-1",
    });

    expect((setFn.mock.calls[0]![0] as Record<string, unknown>).deletedAt).toBeInstanceOf(Date);
  });

  it("createFunderContact: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn } = makeInsertMock({ id: "contact-1", name: "Jane" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      insert: insertFn,
    });

    await createFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      name: "Jane",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder_contact", action: "created" }),
    );
  });

  it("createFunderContact: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { insertFn } = makeInsertMock({ id: "contact-1", name: "Jane" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      insert: insertFn,
    });

    await expect(
      createFunderContact(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        funderId: "funder-1",
        name: "Jane",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateFunderContact: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn } = makeUpdateMock({ id: "contact-1" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      update: updateFn,
    });

    await updateFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      contactId: "contact-1",
      data: { title: "Director" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder_contact", action: "updated" }),
    );
  });

  it("updateFunderContact: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn } = makeUpdateMock({ id: "contact-1" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      update: updateFn,
    });

    await expect(
      updateFunderContact(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        funderId: "funder-1",
        contactId: "contact-1",
        data: { title: "Director" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteFunderContact: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn } = makeUpdateMock({ id: "contact-1" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      update: updateFn,
    });

    await deleteFunderContact(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      funderId: "funder-1",
      contactId: "contact-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder_contact", action: "deleted" }),
    );
  });

  it("deleteFunderContact: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const { updateFn } = makeUpdateMock({ id: "contact-1" });
    const db = withTransaction({
      query: { funders: { findFirst: funderLookup } },
      update: updateFn,
    });

    await expect(
      deleteFunderContact(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        funderId: "funder-1",
        contactId: "contact-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
