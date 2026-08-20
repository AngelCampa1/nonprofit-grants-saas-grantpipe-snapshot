import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppError } from "../../lib/app-error";
import {
  createSession,
  getSession,
  getSessionByTokenHash,
  listSessions,
  revokeSession,
  extendSession,
  touchSession,
} from "./session.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { hashPortalTokenForStorage, signPortalToken, verifyPortalToken } from "./tokens";

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

const now = new Date("2026-05-04T12:00:00.000Z");
const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

const mockSession = {
  id: "session-1",
  orgId: "org-1",
  reviewerId: "reviewer-1",
  tokenHash: "hash-abc",
  purpose: "Annual audit 2026",
  expiresAt: future,
  revokedAt: null,
  revokedBy: null,
  lastAccessedAt: null,
  invitationDeliveryStatus: "pending",
  invitationDeliveryAttempt: 1,
  invitationDeliveryKind: "invite",
  createdBy: "user-1",
  createdAt: now,
};

function makeDb(overrides: Record<string, unknown> = {}) {
  const db: Record<string, unknown> = {
    query: {
      externalReviewSessions: {
        findFirst: vi.fn(async () => mockSession),
      },
      externalReviewers: {
        findFirst: vi.fn(async () => ({ id: "reviewer-1", orgId: "org-1", deletedAt: null })),
      },
      grants: {
        findFirst: vi.fn(async () => ({ id: "grant-1", orgId: "org-1", deletedAt: null })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockSession]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [mockSession]),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => [mockSession]),
        })),
      })),
    })),
    ...overrides,
  };

  return db as never;
}

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
});

describe("createSession", () => {
  it("stores the exact signed expiry when the clock advances before insertion", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now);
      const ttlMs = 30 * 24 * 60 * 60 * 1000;
      const sessionId = "session-clock-drift";
      const expiresAt = new Date(Date.now() + ttlMs);
      const secret = "portal-secret";
      const emailedToken = await signPortalToken(sessionId, expiresAt.getTime(), secret);
      const tokenHash = await hashPortalTokenForStorage(emailedToken, secret);
      let inserted: Record<string, unknown> | undefined;
      const values = vi.fn((value: Record<string, unknown>) => {
        inserted = value;
        return {
          returning: vi.fn(async () => [
            { ...mockSession, id: sessionId, tokenHash, expiresAt: value.expiresAt },
          ]),
        };
      });
      const db = withTransaction(makeDb({ insert: vi.fn(() => ({ values })) }));

      vi.advanceTimersByTime(250);
      await createSession(
        db,
        "org-1",
        "user-1",
        { reviewerId: "reviewer-1", purpose: "Audit", ttlMs, scopes: [] },
        emailedToken,
        tokenHash,
        sessionId,
        "email",
        expiresAt,
      );

      expect(inserted?.expiresAt).toEqual(expiresAt);
      const reconstructedToken = await signPortalToken(
        sessionId,
        (inserted?.expiresAt as Date).getTime(),
        secret,
      );
      expect(await hashPortalTokenForStorage(reconstructedToken, secret)).toBe(tokenHash);
      expect(await verifyPortalToken(reconstructedToken, secret)).toEqual({
        sessionId,
        expiresAt: expiresAt.getTime(),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("explicitly marks new sessions pending while the rollout-safe database default is sent", async () => {
    const values = vi.fn(() => ({ returning: vi.fn(async () => [mockSession]) }));
    const db = withTransaction(makeDb({ insert: vi.fn(() => ({ values })) }));

    await createSession(
      db,
      "org-1",
      "user-1",
      {
        reviewerId: "reviewer-1",
        purpose: "Audit",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopes: [],
      },
      "raw-token",
      "hash-abc",
      undefined,
      "email",
      future,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ invitationDeliveryStatus: "pending" }),
    );
  });

  it("marks link-only sessions not requested so recovery never emails them", async () => {
    const values = vi.fn(() => ({ returning: vi.fn(async () => [mockSession]) }));
    const db = withTransaction(makeDb({ insert: vi.fn(() => ({ values })) }));

    await createSession(
      db,
      "org-1",
      "user-1",
      {
        reviewerId: "reviewer-1",
        purpose: "Audit",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopes: [],
      },
      "raw-token",
      "hash-abc",
      undefined,
      "link_only",
      future,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ invitationDeliveryStatus: "not_requested" }),
    );
  });

  it("inserts session and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await createSession(
      db,
      "org-1",
      "user-1",
      {
        reviewerId: "reviewer-1",
        purpose: "Annual audit 2026",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopes: [],
      },
      "raw-token",
      "hash-abc",
      undefined,
      "email",
      future,
    );
    expect(result).toEqual(mockSession);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "create",
        entityType: "external_review_session",
        entityId: "session-1",
      }),
    );
  });

  it("inserts scopes when provided", async () => {
    const insertMock = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockSession]),
        onConflictDoNothing: vi.fn(async () => undefined),
      })),
    }));

    const db = withTransaction(makeDb({ insert: insertMock }));
    await createSession(
      db,
      "org-1",
      "user-1",
      {
        reviewerId: "reviewer-1",
        purpose: "Audit",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopes: [{ scopeType: "grant", scopeId: "grant-1" }],
      },
      "raw-token",
      "hash-abc",
      undefined,
      "email",
      future,
    );
    // insert called at least twice: once for session, once for scopes
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("rejects scopes for missing or foreign entities before creating the session", async () => {
    const insertMock = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockSession]),
        onConflictDoNothing: vi.fn(async () => undefined),
      })),
    }));
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => mockSession) },
          externalReviewers: {
            findFirst: vi.fn(async () => ({ id: "reviewer-1", orgId: "org-1", deletedAt: null })),
          },
          grants: { findFirst: vi.fn(async () => null) },
        },
        insert: insertMock,
      }),
    );

    await expect(
      createSession(
        db,
        "org-1",
        "user-1",
        {
          reviewerId: "reviewer-1",
          purpose: "Audit",
          ttlMs: 30 * 24 * 60 * 60 * 1000,
          scopes: [{ scopeType: "grant", scopeId: "foreign-grant" }],
        },
        "raw-token",
        "hash-abc",
        undefined,
        "email",
        future,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(insertMock).not.toHaveBeenCalled();
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
      createSession(
        db,
        "org-1",
        "user-1",
        { reviewerId: "r-1", purpose: "X", ttlMs: 1000, scopes: [] },
        "raw",
        "hash",
        undefined,
        "email",
        future,
      ),
    ).rejects.toThrow("Failed to create session");
  });

  it("rejects reviewer ids outside the caller org", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => mockSession) },
          externalReviewers: { findFirst: vi.fn(async () => null) },
        },
      }),
    );

    await expect(
      createSession(
        db,
        "org-1",
        "user-1",
        { reviewerId: "foreign-reviewer", purpose: "X", ttlMs: 1000, scopes: [] },
        "raw",
        "hash",
        undefined,
        "email",
        future,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await createSession(
      db,
      "org-1",
      "user-1",
      {
        reviewerId: "reviewer-1",
        purpose: "Annual audit 2026",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopes: [],
      },
      "raw-token",
      "hash-abc",
      undefined,
      "email",
      future,
    );
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
      createSession(
        db,
        "org-1",
        "user-1",
        { reviewerId: "reviewer-1", purpose: "X", ttlMs: 1000, scopes: [] },
        "raw",
        "hash",
        undefined,
        "email",
        future,
      ),
    ).rejects.toThrow("audit log down");
  });
});

describe("getSession", () => {
  it("returns session when found", async () => {
    const db = makeDb();
    const result = await getSession(db, "org-1", "session-1");
    expect(result).toEqual(mockSession);
  });

  it("returns null when not found", async () => {
    const db = makeDb({
      query: {
        externalReviewSessions: { findFirst: vi.fn(async () => undefined) },
      },
    });
    const result = await getSession(db, "org-1", "session-1");
    expect(result).toBeNull();
  });
});

describe("getSessionByTokenHash", () => {
  it("returns session by token hash", async () => {
    const db = makeDb();
    const result = await getSessionByTokenHash(db, "hash-abc");
    expect(result).toEqual(mockSession);
  });

  it("returns null when not found", async () => {
    const db = makeDb({
      query: {
        externalReviewSessions: { findFirst: vi.fn(async () => null) },
      },
    });
    const result = await getSessionByTokenHash(db, "bad-hash");
    expect(result).toBeNull();
  });
});

describe("listSessions", () => {
  it("returns paginated items", async () => {
    const db = makeDb();
    const result = await listSessions(db, "org-1", {
      page: 1,
      pageSize: 25,
      includeExpired: true,
      includeRevoked: true,
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("filters out expired sessions when includeExpired is false", async () => {
    // When includeExpired is false, the expiry filter is pushed into the SQL WHERE
    // clause. The mock DB returns whatever is mocked — here we simulate the DB
    // returning an empty array as it would when the SQL gte(expiresAt, now) matches
    // no rows.
    const db = makeDb({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => []),
          })),
        })),
      })),
    });
    const result = await listSessions(db, "org-1", {
      page: 1,
      pageSize: 25,
      includeExpired: false,
      includeRevoked: true,
    });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("applies reviewerId filter", async () => {
    const db = makeDb();
    const result = await listSessions(db, "org-1", {
      page: 1,
      pageSize: 25,
      reviewerId: "reviewer-1",
      includeExpired: true,
      includeRevoked: true,
    });
    expect(result).toBeDefined();
  });

  it("paginates correctly", async () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      ...mockSession,
      id: `session-${i}`,
      expiresAt: future,
    }));
    const db = makeDb({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => sessions),
          })),
        })),
      })),
    });
    const result = await listSessions(db, "org-1", {
      page: 2,
      pageSize: 3,
      includeExpired: true,
      includeRevoked: true,
    });
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(10);
  });
});

describe("revokeSession", () => {
  it("atomically suppresses and fences the active invitation attempt", async () => {
    const set = vi.fn((value: Record<string, unknown>) => {
      expect(value).toMatchObject({
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryPayload: null,
        invitationDeliveryError: null,
      });
      expect(renderSql(value.invitationDeliveryAttempt).sql).toContain(
        '"external_review_sessions"."invitation_delivery_attempt" + 1',
      );
      return {
        where: vi.fn(() => ({ returning: vi.fn(async () => [mockSession]) })),
      };
    });
    const db = withTransaction(makeDb({ update: vi.fn(() => ({ set })) }));

    await revokeSession(db, "org-1", "session-1", "user-1");
  });

  it("sets revokedAt and records activity log", async () => {
    const db = withTransaction(makeDb());
    await revokeSession(db, "org-1", "session-1", "user-1");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "delete",
        entityType: "external_review_session",
        entityId: "session-1",
      }),
    );
  });

  it("throws not found if session does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => null) },
        },
      }),
    );
    await expect(revokeSession(db, "org-1", "session-1", "user-1")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("only revokes active session rows", async () => {
    const returning = vi.fn(async () => [mockSession]);
    const where = vi.fn((_condition: unknown) => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({ set })),
      }),
    );

    await revokeSession(db, "org-1", "session-1", "user-1");

    const renderedWhere = renderSql(where.mock.calls[0]?.[0]).sql.toLowerCase();
    expect(renderedWhere).toContain('"external_review_sessions"."revoked_at" is null');
  });

  it("throws not found when a concurrent revoke wins before the update", async () => {
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

    await expect(revokeSession(db, "org-1", "session-1", "user-1")).rejects.toBeInstanceOf(
      AppError,
    );
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await revokeSession(db, "org-1", "session-1", "user-1");
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_review_session", action: "delete" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(revokeSession(db, "org-1", "session-1", "user-1")).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("extendSession", () => {
  it("does not revive a session that expires before the compare-and-set update", async () => {
    vi.useFakeTimers();
    try {
      const expiresAt = new Date("2026-05-04T12:00:01.000Z");
      vi.setSystemTime(new Date("2026-05-04T12:00:00.999Z"));

      const where = vi.fn((condition: unknown) => {
        const rendered = renderSql(condition);
        const hasWriteTimeExpiryFence = rendered.sql.includes(
          '"external_review_sessions"."expires_at" >=',
        );
        const hasExpiredAtWriteTime = rendered.params.includes(
          new Date("2026-05-04T12:00:01.001Z").toISOString(),
        );
        return {
          returning: vi.fn(async () =>
            hasWriteTimeExpiryFence && hasExpiredAtWriteTime ? [] : [{ ...mockSession, expiresAt }],
          ),
        };
      });
      const db = withTransaction(
        makeDb({
          query: {
            externalReviewSessions: {
              findFirst: vi.fn(async () => ({ ...mockSession, expiresAt })),
            },
          },
          update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
        }),
      );

      await expect(
        extendSession(db, "org-1", "session-1", "user-1", { extensionMs: 1000 }, async () => {
          vi.setSystemTime(new Date("2026-05-04T12:00:01.001Z"));
          return "hash-extended";
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: "Session changed while it was being extended",
      });
      expect(recordActivityLog).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows only one of two concurrent extensions to rotate the token", async () => {
    let updateCount = 0;
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({
          set: vi.fn((value: Record<string, unknown>) => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => {
                updateCount += 1;
                return updateCount === 1
                  ? [
                      {
                        ...mockSession,
                        expiresAt: value.expiresAt,
                        tokenHash: value.tokenHash,
                        invitationDeliveryAttempt: 2,
                      },
                    ]
                  : [];
              }),
            })),
          })),
        })),
      }),
    );

    const results = await Promise.allSettled([
      extendSession(
        db,
        "org-1",
        "session-1",
        "user-1",
        { extensionMs: 1000 },
        async () => "hash-extension-a",
      ),
      extendSession(
        db,
        "org-1",
        "session-1",
        "user-1",
        { extensionMs: 2000 },
        async () => "hash-extension-b",
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      status: 409,
      message: "Session changed while it was being extended",
    });
  });

  it("compare-and-sets the original expiry, token hash, and delivery attempt", async () => {
    const where = vi.fn((_condition: unknown) => ({
      returning: vi.fn(async () => [mockSession]),
    }));
    const db = withTransaction(
      makeDb({ update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })) }),
    );

    await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 1000 },
      async () => "hash-extended",
    );

    const rendered = renderSql(where.mock.calls[0]?.[0]);
    expect(rendered.sql).toContain('"external_review_sessions"."expires_at" =');
    expect(rendered.sql).toContain('"external_review_sessions"."token_hash" =');
    expect(rendered.sql).toContain('"external_review_sessions"."invitation_delivery_attempt" =');
    expect(rendered.params).toContain(mockSession.expiresAt.toISOString());
    expect(rendered.params).toContain(mockSession.tokenHash);
    expect(rendered.params).toContain(mockSession.invitationDeliveryAttempt);
  });

  it("supersedes an in-flight email attempt with a fresh durable extension attempt", async () => {
    const set = vi.fn((setArg: Record<string, unknown>) => {
      expect(setArg).toMatchObject({
        invitationDeliveryStatus: "pending",
        invitationDeliveryKind: "extension",
        invitationDeliveryPayload: null,
        invitationDeliveryStartedAt: null,
        invitationDeliveryClaimedAt: null,
        invitationDeliverySentAt: null,
        invitationProviderId: null,
        invitationDeliveryError: null,
      });
      expect(renderSql(setArg.invitationDeliveryAttempt).sql).toContain(
        '"external_review_sessions"."invitation_delivery_attempt" + 1',
      );
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => [
            {
              ...mockSession,
              invitationDeliveryAttempt: 2,
              invitationDeliveryKind: "extension",
              invitationDeliveryStatus: "pending",
            },
          ]),
        })),
      };
    });
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: {
            findFirst: vi.fn(async () => ({
              ...mockSession,
              invitationDeliveryStatus: "processing",
            })),
          },
        },
        update: vi.fn(() => ({ set })),
      }),
    );

    const result = await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 1000 },
      async () => "hash-extended",
    );

    expect(result.invitationDeliveryAttempt).toBe(2);
  });

  it("keeps link-only extensions out of email delivery", async () => {
    const set = vi.fn((setArg: Record<string, unknown>) => {
      expect(setArg.invitationDeliveryStatus).toBe("not_requested");
      return {
        where: vi.fn(() => ({ returning: vi.fn(async () => [mockSession]) })),
      };
    });
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: {
            findFirst: vi.fn(async () => ({
              ...mockSession,
              invitationDeliveryStatus: "not_requested",
            })),
          },
        },
        update: vi.fn(() => ({ set })),
      }),
    );

    await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 1000 },
      async () => "hash-extended",
    );
  });

  it("extends expiresAt and records activity log", async () => {
    const db = withTransaction(makeDb());
    const createTokenHash = vi.fn(async () => "hash-extended");
    const result = await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      {
        extensionMs: 7 * 24 * 60 * 60 * 1000,
      },
      createTokenHash,
    );
    expect(result).toEqual(mockSession);
    expect(createTokenHash).toHaveBeenCalledWith(expect.any(Date));
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "update",
        entityType: "external_review_session",
      }),
    );
  });

  it("rotates the stored token hash when extending access", async () => {
    const set = vi.fn((setArg: { expiresAt: Date; tokenHash?: string }) => {
      expect(setArg.tokenHash).toBe("hash-extended");
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ ...mockSession, tokenHash: setArg.tokenHash }]),
        })),
      };
    });
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({ set })),
      }),
    );

    const result = await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 7 * 24 * 60 * 60 * 1000 },
      async () => "hash-extended",
    );

    expect(result.tokenHash).toBe("hash-extended");
  });

  it("caps extension at PORTAL_SESSION_MAX_TTL_MS from now", async () => {
    // Session with expiresAt far in the future — extension should be capped
    const farFuture = new Date(Date.now() + 85 * 24 * 60 * 60 * 1000);
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: {
            findFirst: vi.fn(async () => ({ ...mockSession, expiresAt: farFuture })),
          },
        },
        update: vi.fn(() => ({
          set: vi.fn((setArg: { expiresAt: Date }) => {
            // expiresAt should be capped
            const maxAllowed = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            expect(setArg.expiresAt <= maxAllowed).toBe(true);
            return {
              where: vi.fn(() => ({
                returning: vi.fn(async () => [{ ...mockSession, expiresAt: setArg.expiresAt }]),
              })),
            };
          }),
        })),
      }),
    );
    await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      {
        extensionMs: 30 * 24 * 60 * 60 * 1000,
      },
      async () => "hash-extended",
    );
  });

  it("throws not found if session does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: {
          externalReviewSessions: { findFirst: vi.fn(async () => null) },
        },
      }),
    );
    await expect(
      extendSession(
        db,
        "org-1",
        "session-1",
        "user-1",
        { extensionMs: 1000 },
        async () => "hash-extended",
      ),
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
      extendSession(
        db,
        "org-1",
        "session-1",
        "user-1",
        { extensionMs: 1000 },
        async () => "hash-extended",
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("only extends the active row version that was originally read", async () => {
    const returning = vi.fn(async () => [mockSession]);
    const where = vi.fn((_condition: unknown) => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = withTransaction(
      makeDb({
        update: vi.fn(() => ({ set })),
      }),
    );

    await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 1000 },
      async () => "hash-extended",
    );

    const renderedWhere = renderSql(where.mock.calls[0]?.[0]).sql.toLowerCase();
    expect(renderedWhere).toContain('"external_review_sessions"."revoked_at" is null');
    expect(renderedWhere).toContain('"external_review_sessions"."expires_at" =');
    expect(renderedWhere).toContain('"external_review_sessions"."token_hash" =');
    expect(renderedWhere).toContain('"external_review_sessions"."invitation_delivery_attempt" =');
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await extendSession(
      db,
      "org-1",
      "session-1",
      "user-1",
      { extensionMs: 7 * 24 * 60 * 60 * 1000 },
      async () => "hash-extended",
    );
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "external_review_session", action: "update" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      extendSession(
        db,
        "org-1",
        "session-1",
        "user-1",
        { extensionMs: 1000 },
        async () => "hash-extended",
      ),
    ).rejects.toThrow("audit log down");
  });
});

describe("touchSession", () => {
  it("updates lastAccessedAt without recording activity log", async () => {
    const db = makeDb();
    await touchSession(db, "session-1");
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});
