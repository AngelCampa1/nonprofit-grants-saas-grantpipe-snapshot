import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveProgram,
  assertProgramInOrg,
  createProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "./program.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

function listChain<T>(result: T) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
}

function whereChain<T>(result: T) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function returningChain<T>(result: T) {
  return {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe("program service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists programs with search and count", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(listChain([{ id: "program-1" }]))
        .mockReturnValueOnce(whereChain([{ count: 1 }])),
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    const result = await listPrograms(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      search: "health",
      status: "active",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(result.data).toEqual([{ id: "program-1" }]);
  });

  it("lists programs with default sort and zero count fallback", async () => {
    const db = {
      select: vi.fn().mockReturnValueOnce(listChain([])).mockReturnValueOnce(whereChain([])),
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      listPrograms(db, {
        orgId: "org-1",
        page: 2,
        pageSize: 10,
        sortBy: "name",
        sortOrder: "asc",
      }),
    ).resolves.toEqual({ data: [], total: 0, page: 2, pageSize: 10 });
  });

  it("lists programs sorted by code", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(listChain([{ id: "program-1" }]))
        .mockReturnValueOnce(whereChain([{ count: 1 }])),
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      listPrograms(db, {
        orgId: "org-1",
        page: 1,
        pageSize: 10,
        sortBy: "code",
        sortOrder: "asc",
      }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("gets and asserts programs scoped to the org", async () => {
    const db = {
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValueOnce({ id: "program-1" }).mockResolvedValueOnce({
            id: "program-1",
            budgets: [],
            grantAllocations: [],
            expenseAllocations: [],
            impactMetricLinks: [],
            reportingRequirementLinks: [],
          }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(assertProgramInOrg(db, "org-1", "program-1")).resolves.toBeUndefined();
    await expect(getProgram(db, { orgId: "org-1", programId: "program-1" })).resolves.toEqual({
      id: "program-1",
      budgets: [],
      grantAllocations: [],
      expenseAllocations: [],
      impactMetricLinks: [],
      reportingRequirementLinks: [],
    });
  });

  it("omits soft-deleted related rows when getting a program", async () => {
    const deletedAt = new Date("2026-05-28T00:00:00.000Z");
    const db = {
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValue({
            id: "program-1",
            budgets: [
              {
                id: "budget-active",
                deletedAt: null,
                lines: [
                  { id: "line-active", deletedAt: null },
                  { id: "line-deleted", deletedAt },
                ],
              },
              {
                id: "budget-deleted",
                deletedAt,
                lines: [{ id: "line-on-deleted-budget", deletedAt: null }],
              },
            ],
            grantAllocations: [
              { id: "grant-allocation-active", deletedAt: null },
              { id: "grant-allocation-deleted", deletedAt },
            ],
            expenseAllocations: [
              { id: "expense-allocation-active", deletedAt: null },
              { id: "expense-allocation-deleted", deletedAt },
            ],
            impactMetricLinks: [
              { id: "impact-link-active", deletedAt: null },
              { id: "impact-link-deleted", deletedAt },
            ],
            reportingRequirementLinks: [
              { id: "reporting-link-active", deletedAt: null },
              { id: "reporting-link-deleted", deletedAt },
            ],
          }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(getProgram(db, { orgId: "org-1", programId: "program-1" })).resolves.toEqual({
      id: "program-1",
      budgets: [
        {
          id: "budget-active",
          deletedAt: null,
          lines: [{ id: "line-active", deletedAt: null }],
        },
      ],
      grantAllocations: [{ id: "grant-allocation-active", deletedAt: null }],
      expenseAllocations: [{ id: "expense-allocation-active", deletedAt: null }],
      impactMetricLinks: [{ id: "impact-link-active", deletedAt: null }],
      reportingRequirementLinks: [{ id: "reporting-link-active", deletedAt: null }],
    });
  });

  it("throws when a program is not in the org", async () => {
    const db = { query: { programs: { findFirst: vi.fn().mockResolvedValue(null) } } } as never;

    await expect(assertProgramInOrg(db, "org-1", "missing")).rejects.toMatchObject({
      status: 404,
    });
    await expect(getProgram(db, { orgId: "org-1", programId: "missing" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("creates, updates, and archives programs with activity evidence", async () => {
    const created = { id: "program-1", name: "Health" };
    const updated = { id: "program-1", name: "Health Access", deletedAt: null };
    const archived = { ...updated, deletedAt: new Date("2026-05-02T00:00:00.000Z") };
    const db = {
      insert: vi.fn(() => returningChain([created])),
      update: vi
        .fn()
        .mockReturnValueOnce(returningChain([updated]))
        .mockReturnValueOnce(returningChain([archived])),
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValue({ id: "program-1", name: "Health" }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      createProgram(db, { orgId: "org-1", actorId: "user-1", name: "Health" }),
    ).resolves.toEqual(created);
    await expect(
      updateProgram(db, {
        orgId: "org-1",
        actorId: "user-1",
        programId: "program-1",
        data: { name: "Health Access" },
      }),
    ).resolves.toEqual(updated);
    await expect(
      archiveProgram(db, { orgId: "org-1", actorId: "user-1", programId: "program-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects invalid create input before inserting", async () => {
    const insert = vi.fn();
    const db = {
      insert,
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      createProgram(db, {
        orgId: "org-1",
        name: " ",
        code: "",
      }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invalid update input before updating", async () => {
    const update = vi.fn();
    const findFirst = vi.fn();
    const db = {
      update,
      query: {
        programs: {
          findFirst,
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "program-1",
        data: { ownerUserId: "not-a-uuid" },
      }),
    ).rejects.toThrow("Invalid UUID");
    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("requires program owners to belong to the same org", async () => {
    const ownerUserId = "00000000-0000-4000-8000-000000000002";
    const outsideUserId = "00000000-0000-4000-8000-000000000003";
    const created = { id: "program-1", name: "Health", ownerUserId };
    const updated = { id: "program-1", name: "Health", ownerUserId };
    const db = {
      insert: vi.fn(() => returningChain([created])),
      update: vi.fn(() => returningChain([updated])),
      query: {
        orgMembers: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "member-2" })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "member-2" })
            .mockResolvedValueOnce(null),
        },
        programs: {
          findFirst: vi.fn().mockResolvedValue({ id: "program-1", name: "Health" }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      createProgram(db, {
        orgId: "org-1",
        name: "Health",
        ownerUserId,
      }),
    ).resolves.toEqual(created);
    await expect(
      createProgram(db, {
        orgId: "org-1",
        name: "Health",
        ownerUserId: outsideUserId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "program-1",
        data: { ownerUserId },
      }),
    ).resolves.toEqual(updated);
    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "program-1",
        data: { ownerUserId: outsideUserId },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("supports mutations without an actor", async () => {
    const created = { id: "program-1", name: "Health" };
    const updated = { id: "program-1", name: "Health Access" };
    const archived = { id: "program-1", name: "Health Access", deletedAt: new Date() };
    const db = {
      insert: vi.fn(() => returningChain([created])),
      update: vi
        .fn()
        .mockReturnValueOnce(returningChain([updated]))
        .mockReturnValueOnce(returningChain([archived])),
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValue({ id: "program-1", name: "Health" }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(createProgram(db, { orgId: "org-1", name: "Health" })).resolves.toEqual(created);
    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "program-1",
        data: { name: "Health Access" },
      }),
    ).resolves.toEqual(updated);
    await expect(
      archiveProgram(db, { orgId: "org-1", programId: "program-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws when program mutation returning rows are missing", async () => {
    const db = {
      insert: vi.fn(() => returningChain([])),
      update: vi
        .fn()
        .mockReturnValueOnce(returningChain([]))
        .mockReturnValueOnce(returningChain([])),
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValue({ id: "program-1", name: "Health" }),
        },
      },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(createProgram(db, { orgId: "org-1", name: "Health" })).rejects.toMatchObject({
      status: 500,
    });
    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "program-1",
        data: { name: "Health" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      archiveProgram(db, { orgId: "org-1", programId: "program-1" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws when updating a missing program", async () => {
    const db = {
      query: { programs: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as never;
    (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(db),
    );

    await expect(
      updateProgram(db, {
        orgId: "org-1",
        programId: "missing",
        data: { name: "Missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("program mutation activity-log atomicity", () => {
  beforeEach(() => vi.resetAllMocks());

  function txDb(overrides: Record<string, unknown>) {
    const db = { ...overrides } as Record<string, unknown>;
    db.transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(db));
    return db as never;
  }

  it("creates a program and records the audit log inside one transaction", async () => {
    const created = { id: "program-1", name: "Health" };
    const db = txDb({ insert: vi.fn(() => returningChain([created])) });

    await expect(
      createProgram(db, { orgId: "org-1", actorId: "user-1", name: "Health" }),
    ).resolves.toEqual(created);
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "program", action: "created" }),
    );
  });

  it("propagates an audit-log failure so the create transaction rolls back", async () => {
    const created = { id: "program-1", name: "Health" };
    const db = txDb({ insert: vi.fn(() => returningChain([created])) });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createProgram(db, { orgId: "org-1", actorId: "user-1", name: "Health" }),
    ).rejects.toThrow("audit log down");
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it("updates a program and records the audit log inside one transaction", async () => {
    const updated = { id: "program-1", name: "Health Access", deletedAt: null };
    const db = txDb({
      update: vi.fn(() => returningChain([updated])),
      query: {
        programs: {
          findFirst: vi.fn().mockResolvedValue({ id: "program-1", name: "Health" }),
        },
      },
    });

    await expect(
      updateProgram(db, {
        orgId: "org-1",
        actorId: "user-1",
        programId: "program-1",
        data: { name: "Health Access" },
      }),
    ).resolves.toEqual(updated);
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "program", action: "updated" }),
    );
  });

  it("archives a program and records the audit log inside one transaction", async () => {
    const archived = { id: "program-1", name: "Health", deletedAt: new Date() };
    const db = txDb({ update: vi.fn(() => returningChain([archived])) });

    await expect(
      archiveProgram(db, { orgId: "org-1", actorId: "user-1", programId: "program-1" }),
    ).resolves.toBeUndefined();
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "program", action: "archived" }),
    );
  });
});
