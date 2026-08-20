import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";
import { addScopes, removeScope, listScopes, checkScope, publicPortalScope } from "./scope.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
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

const mockSession = {
  id: "session-1",
  orgId: "org-1",
};

const mockScope = {
  sessionId: "session-1",
  scopeType: "grant",
  scopeId: "grant-1",
  grantedBy: "user-1",
  grantedAt: new Date("2026-01-01"),
};

function makeDb(overrides: Record<string, unknown> = {}) {
  const db: Record<string, unknown> = {
    query: {
      externalReviewSessions: {
        findFirst: vi.fn(async () => mockSession),
      },
      externalReviewScopes: {
        findFirst: vi.fn(async () => mockScope),
      },
      grants: {
        findFirst: vi.fn(async () => ({
          id: "grant-1",
          orgId: "org-1",
          deletedAt: null,
          name: "Annual Operating Grant",
        })),
      },
      funds: {
        findFirst: vi.fn(async () => ({ id: "fund-1", orgId: "org-1", deletedAt: null })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((rows: typeof mockScope | (typeof mockScope)[]) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => (Array.isArray(rows) ? rows : [rows])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => [mockScope]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [mockScope]),
      })),
    })),
    ...overrides,
  };

  return db as never;
}

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
});

describe("addScopes", () => {
  it("inserts scopes and records activity log per scope", async () => {
    const db = withTransaction(makeDb());
    await addScopes(db, "org-1", "session-1", "user-1", [
      { scopeType: "grant", scopeId: "grant-1" },
      { scopeType: "fund", scopeId: "fund-1" },
    ]);
    expect(recordActivityLog).toHaveBeenCalledTimes(2);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "create",
        entityType: "external_review_session",
        entityId: "session-1",
      }),
    );
  });

  it("does nothing when scopes array is empty", async () => {
    const db = withTransaction(makeDb());
    await addScopes(db, "org-1", "session-1", "user-1", []);
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("throws not found if session does not belong to org", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => null) },
          externalReviewScopes: { findFirst: vi.fn(async () => mockScope) },
        },
      }),
    );
    await expect(
      addScopes(db, "org-1", "session-1", "user-1", [{ scopeType: "grant", scopeId: "g-1" }]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects missing or foreign scope targets before inserting", async () => {
    const insertMock = vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => [mockScope]),
        })),
      })),
    }));
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => mockSession) },
          externalReviewScopes: { findFirst: vi.fn(async () => mockScope) },
          grants: { findFirst: vi.fn(async () => null) },
        },
        insert: insertMock,
      }),
    );

    await expect(
      addScopes(db, "org-1", "session-1", "user-1", [
        { scopeType: "grant", scopeId: "foreign-grant" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("uses onConflictDoNothing to avoid duplicate inserts", async () => {
    const onConflictDoNothing = vi.fn(() => ({
      returning: vi.fn(async () => []),
    }));
    const insertValues = vi.fn(() => ({
      onConflictDoNothing,
    }));
    const db = withTransaction(
      makeDb({
        insert: vi.fn(() => ({ values: insertValues })),
      }),
    );
    await addScopes(db, "org-1", "session-1", "user-1", [
      { scopeType: "grant", scopeId: "grant-1" },
    ]);
    expect(onConflictDoNothing).toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("atomicity: transaction is called once and activity log fires for inserted scope", async () => {
    const db = withTransaction(makeDb());
    await addScopes(db, "org-1", "session-1", "user-1", [
      { scopeType: "grant", scopeId: "grant-1" },
    ]);
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_review_session", action: "create" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      addScopes(db, "org-1", "session-1", "user-1", [{ scopeType: "grant", scopeId: "grant-1" }]),
    ).rejects.toThrow("audit log down");
  });
});

describe("removeScope", () => {
  it("deletes scope and records activity log", async () => {
    const db = withTransaction(makeDb());
    await removeScope(db, "org-1", "session-1", "user-1", "grant", "grant-1");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "delete",
        entityType: "external_review_session",
        entityId: "session-1",
        changes: { before: { scopeType: "grant", scopeId: "grant-1" } },
      }),
    );
  });

  it("does not record activity when no scope is deleted", async () => {
    const db = withTransaction(
      makeDb({
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      }),
    );

    await removeScope(db, "org-1", "session-1", "user-1", "grant", "missing-grant");

    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("throws not found if session does not belong to org", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => null) },
          externalReviewScopes: { findFirst: vi.fn(async () => mockScope) },
        },
      }),
    );
    await expect(
      removeScope(db, "org-1", "session-1", "user-1", "grant", "grant-1"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await removeScope(db, "org-1", "session-1", "user-1", "grant", "grant-1");
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_review_session", action: "delete" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      removeScope(db, "org-1", "session-1", "user-1", "grant", "grant-1"),
    ).rejects.toThrow("audit log down");
  });
});

describe("listScopes", () => {
  it("returns enriched internal scopes for authenticated admin consumers", async () => {
    const db = makeDb();
    const result = await listScopes(db, "org-1", "session-1");
    expect(result).toEqual([{ ...mockScope, scopeName: "Annual Operating Grant" }]);
  });

  it("falls back to a null name when the target entity is gone", async () => {
    const db = makeDb({
      query: {
        grants: { findFirst: vi.fn(async () => undefined) },
      },
    });
    const result = await listScopes(db, "org-1", "session-1");
    expect(result).toEqual([{ ...mockScope, scopeName: null }]);
  });

  it("returns empty array when no scopes exist", async () => {
    const db = makeDb({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
    });
    const result = await listScopes(db, "org-1", "session-1");
    expect(result).toEqual([]);
  });

  it("projects enriched scopes to the allowlisted public portal contract", async () => {
    const db = makeDb();
    const scopes = await listScopes(db, "org-1", "session-1");

    expect(scopes.map(publicPortalScope)).toEqual([
      {
        id: "session-1:grant:grant-1",
        sessionId: "session-1",
        scopeType: "grant",
        scopeId: "grant-1",
        scopeName: "Annual Operating Grant",
      },
    ]);
  });
});

describe("checkScope", () => {
  it("returns true when scope exists", async () => {
    const db = makeDb();
    const result = await checkScope(db, "session-1", "grant", "grant-1");
    expect(result).toBe(true);
  });

  it("returns false when scope does not exist", async () => {
    const db = makeDb({
      query: {
        externalReviewSessions: { findFirst: vi.fn(async () => mockSession) },
        externalReviewScopes: { findFirst: vi.fn(async () => undefined) },
      },
    });
    const result = await checkScope(db, "session-1", "grant", "grant-999");
    expect(result).toBe(false);
  });
});
