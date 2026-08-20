import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppError } from "../../lib/app-error";
import {
  createReviewer,
  updateReviewer,
  softDeleteReviewer,
  getReviewer,
  listReviewers,
} from "./reviewer.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
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

const mockReviewer = {
  id: "reviewer-1",
  orgId: "org-1",
  email: "auditor@firm.com",
  name: "Jane Auditor",
  reviewerType: "auditor",
  organizationName: "Audit Firm LLC",
  notes: null,
  createdBy: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
};

function makeDb(overrides: Record<string, unknown> = {}) {
  const selectOrderBy = vi.fn(() => ({
    limit: vi.fn(() => ({
      offset: vi.fn(async () => [mockReviewer]),
    })),
  }));

  const selectFromWhere = vi.fn(() =>
    Object.assign(Promise.resolve([{ value: 1 }]), {
      orderBy: selectOrderBy,
    }),
  );

  const selectFrom = vi.fn(() => ({ where: selectFromWhere }));
  const selectFn = vi.fn(() => ({ from: selectFrom }));

  const db: Record<string, unknown> = {
    query: {
      externalReviewers: {
        findFirst: vi.fn(async () => mockReviewer),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockReviewer]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [mockReviewer]),
        })),
      })),
    })),
    select: selectFn,
    ...overrides,
  };

  return db as never;
}

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
});

describe("createReviewer", () => {
  it("inserts a new reviewer and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await createReviewer(db, "org-1", "user-1", {
      email: "auditor@firm.com",
      name: "Jane Auditor",
      reviewerType: "auditor",
    });
    expect(result).toEqual(mockReviewer);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "create",
        entityType: "external_reviewer",
        entityId: "reviewer-1",
      }),
    );
  });

  it("throws if insert returns nothing", async () => {
    const db = withTransaction(
      makeDb({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      }),
    );
    await expect(
      createReviewer(db, "org-1", "user-1", {
        email: "x@x.com",
        name: "X",
        reviewerType: "other",
      }),
    ).rejects.toThrow("Failed to create reviewer");
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await createReviewer(db, "org-1", "user-1", {
      email: "auditor@firm.com",
      name: "Jane Auditor",
      reviewerType: "auditor",
    });
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_reviewer", action: "create" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      createReviewer(db, "org-1", "user-1", {
        email: "auditor@firm.com",
        name: "Jane Auditor",
        reviewerType: "auditor",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateReviewer", () => {
  it("revokes every active portal bearer when the reviewer email changes", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const conditions: unknown[] = [];
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn((condition: unknown) => {
                conditions.push(condition);
                return "email" in values
                  ? {
                      returning: vi.fn(async () => [
                        { ...mockReviewer, email: String(values.email) },
                      ]),
                    }
                  : Promise.resolve(undefined);
              }),
            };
          }),
        })),
      }),
    );

    await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
      email: "corrected@firm.com",
    });

    expect(sets).toHaveLength(2);
    expect(sets[1]).toEqual(
      expect.objectContaining({
        invitationDeliveryAttempt: expect.anything(),
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryPayload: null,
        invitationDeliveryClaimedAt: null,
        invitationDeliveryStartedAt: null,
        invitationProviderId: null,
        invitationDeliveryError: null,
        revokedAt: expect.any(Date),
        revokedBy: "user-1",
      }),
    );
    const condition = renderSql(conditions[1]);
    expect(condition.params).toEqual(expect.arrayContaining(["org-1", "reviewer-1"]));
    expect(condition.sql).toContain('"revoked_at" is null');
    expect(condition.sql).toContain('"expires_at" >');
  });

  it.each(["sent", "sending", "ambiguous"])(
    "does not leave a %s invitation bearer valid after an email correction",
    async (deliveryStatus) => {
      const sets: Array<Record<string, unknown>> = [];
      const conditions: unknown[] = [];
      const db = withTransaction(
        makeDb({
          update: vi.fn(() => ({
            set: vi.fn((values: Record<string, unknown>) => {
              sets.push(values);
              return {
                where: vi.fn((condition: unknown) => {
                  conditions.push(condition);
                  return "email" in values
                    ? {
                        returning: vi.fn(async () => [
                          { ...mockReviewer, email: "corrected@firm.com" },
                        ]),
                      }
                    : Promise.resolve(undefined);
                }),
              };
            }),
          })),
        }),
      );

      await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
        email: "corrected@firm.com",
      });

      expect(sets[1]).toEqual(
        expect.objectContaining({
          revokedAt: expect.any(Date),
          revokedBy: "user-1",
          invitationDeliveryStatus: "suppressed",
          invitationDeliveryAttempt: expect.anything(),
        }),
      );
      // No delivery-status predicate means the revocation covers every state,
      // including the possibly-delivered state named by this table case.
      expect(renderSql(conditions[1]).params).not.toContain(deliveryStatus);
    },
  );

  it("fences a concurrent email or session mutation with the prior reviewer email", async () => {
    const conditions: unknown[] = [];
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn((condition: unknown) => {
              conditions.push(condition);
              return "email" in values
                ? {
                    returning: vi.fn(async () => [
                      { ...mockReviewer, email: "corrected@firm.com" },
                    ]),
                  }
                : Promise.resolve(undefined);
            }),
          })),
        })),
      }),
    );

    await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
      email: "corrected@firm.com",
    });

    const reviewerCas = renderSql(conditions[0]);
    expect(reviewerCas.params).toContain("auditor@firm.com");
    expect(renderSql(conditions[1]).sql).toContain('"revoked_at" is null');
  });

  it("does not rotate invitation delivery state when the normalized email is unchanged", async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => [mockReviewer]) })),
      })),
    }));
    const db = withTransaction(makeDb({ update }));

    await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
      email: "AUDITOR@FIRM.COM",
    });

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("updates reviewer and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
      name: "Jane Updated",
    });
    expect(result).toEqual(mockReviewer);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "update",
        entityType: "external_reviewer",
      }),
    );
  });

  it("throws not found if reviewer does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewers: {
            findFirst: vi.fn(async () => null),
          },
        },
      }),
    );
    await expect(
      updateReviewer(db, "org-1", "reviewer-1", "user-1", { name: "X" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws not found if update returns nothing", async () => {
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => []),
            })),
          })),
        })),
      }),
    );
    await expect(
      updateReviewer(db, "org-1", "reviewer-1", "user-1", { name: "X" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("handles empty input (no fields to update — covers false branches of conditionals)", async () => {
    const db = withTransaction(makeDb());
    // Pass empty object — all conditionals take the false branch (undefined !== undefined = false)
    const result = await updateReviewer(db, "org-1", "reviewer-1", "user-1", {});
    expect(result).toEqual(mockReviewer);
  });

  it("updates all fields when all are provided (covers all truthy branches)", async () => {
    const db = withTransaction(makeDb());
    const result = await updateReviewer(db, "org-1", "reviewer-1", "user-1", {
      email: "new@firm.com",
      name: "Updated Name",
      reviewerType: "funder",
      organizationName: "New Org",
      notes: "Some notes",
    });
    expect(result).toEqual(mockReviewer);
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await updateReviewer(db, "org-1", "reviewer-1", "user-1", { name: "Updated" });
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_reviewer", action: "update" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      updateReviewer(db, "org-1", "reviewer-1", "user-1", { name: "X" }),
    ).rejects.toThrow("audit log down");
  });
});

describe("softDeleteReviewer", () => {
  it("sets deletedAt and records activity log", async () => {
    const db = withTransaction(makeDb());
    await softDeleteReviewer(db, "org-1", "reviewer-1", "user-1");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "delete",
        entityType: "external_reviewer",
        entityId: "reviewer-1",
      }),
    );
  });

  it("suppresses queued invitations in the same transaction as reviewer deletion", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const conditions: unknown[] = [];
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(async (condition: unknown) => {
                conditions.push(condition);
                return undefined;
              }),
            };
          }),
        })),
      }),
    );

    await softDeleteReviewer(db, "org-1", "reviewer-1", "user-1");

    expect(sets).toContainEqual(expect.objectContaining({ deletedAt: expect.any(Date) }));
    expect(sets).toContainEqual(
      expect.objectContaining({
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryAttempt: expect.anything(),
      }),
    );
    expect(renderSql(conditions[1]).params).toContain("sending");
  });

  it("throws not found if reviewer does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewers: {
            findFirst: vi.fn(async () => null),
          },
        },
      }),
    );
    await expect(softDeleteReviewer(db, "org-1", "reviewer-1", "user-1")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await softDeleteReviewer(db, "org-1", "reviewer-1", "user-1");
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_reviewer", action: "delete" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(softDeleteReviewer(db, "org-1", "reviewer-1", "user-1")).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("getReviewer", () => {
  it("returns reviewer when found", async () => {
    const db = makeDb();
    const result = await getReviewer(db, "org-1", "reviewer-1");
    expect(result).toEqual(mockReviewer);
  });

  it("returns null when not found", async () => {
    const db = makeDb({
      query: {
        externalReviewers: {
          findFirst: vi.fn(async () => undefined),
        },
      },
    });
    const result = await getReviewer(db, "org-1", "reviewer-1");
    expect(result).toBeNull();
  });
});

describe("listReviewers", () => {
  it("returns items and total", async () => {
    const db = makeDb();
    const result = await listReviewers(db, "org-1", {
      page: 1,
      pageSize: 25,
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("applies reviewerType filter when provided", async () => {
    const db = makeDb();
    const result = await listReviewers(db, "org-1", {
      page: 1,
      pageSize: 25,
      reviewerType: "auditor",
    });
    expect(result).toBeDefined();
  });

  it("applies search filter when provided", async () => {
    const db = makeDb();
    const result = await listReviewers(db, "org-1", {
      page: 1,
      pageSize: 25,
      search: "Jane",
    });
    expect(result).toBeDefined();
  });

  it("handles empty results", async () => {
    const selectOrderBy = vi.fn(() => ({
      limit: vi.fn(() => ({
        offset: vi.fn(async () => []),
      })),
    }));

    const selectFromWhere = vi.fn(() =>
      Object.assign(Promise.resolve([{ value: 0 }]), {
        orderBy: selectOrderBy,
      }),
    );

    const selectFrom = vi.fn(() => ({ where: selectFromWhere }));
    const selectFn = vi.fn(() => ({ from: selectFrom }));

    const db = makeDb({ select: selectFn });
    const result = await listReviewers(db, "org-1", { page: 1, pageSize: 25 });
    expect(result.total).toBe(0);
  });

  it("defaults total to 0 when count result is undefined (covers ?? 0 branch)", async () => {
    // First select returns [] (no count row) — covers countResult?.value ?? 0
    const selectOrderBy = vi.fn(() => ({
      limit: vi.fn(() => ({
        offset: vi.fn(async () => []),
      })),
    }));

    const selectFromWhere = vi.fn(() =>
      Object.assign(Promise.resolve([]), {
        orderBy: selectOrderBy,
      }),
    );

    const selectFrom = vi.fn(() => ({ where: selectFromWhere }));
    const selectFn = vi.fn(() => ({ from: selectFrom }));

    const db = makeDb({ select: selectFn });
    const result = await listReviewers(db, "org-1", { page: 1, pageSize: 25 });
    expect(result.total).toBe(0);
  });

  it("returns a JSON-safe number when the database count is a bigint", async () => {
    const selectOrderBy = vi.fn(() => ({
      limit: vi.fn(() => ({
        offset: vi.fn(async () => []),
      })),
    }));

    const selectFromWhere = vi.fn(() =>
      Object.assign(Promise.resolve([{ value: 1n }]), {
        orderBy: selectOrderBy,
      }),
    );

    const selectFrom = vi.fn(() => ({ where: selectFromWhere }));
    const selectFn = vi.fn(() => ({ from: selectFrom }));

    const db = makeDb({ select: selectFn });
    const result = await listReviewers(db, "org-1", { page: 1, pageSize: 25 });
    expect(result.total).toBe(1);
    expect(typeof result.total).toBe("number");
  });
});
