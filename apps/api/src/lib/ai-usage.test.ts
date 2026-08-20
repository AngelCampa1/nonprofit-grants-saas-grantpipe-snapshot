import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { aiUsageEvents } from "@grantpipe/db";
import {
  monthStartUtc,
  getMonthlyAiUsage,
  recordAiUsage,
  assertAiUsageWithinCap,
  lockAiUsageQuota,
} from "./ai-usage";
import { AppError } from "./app-error";

// ---------------------------------------------------------------------------
// Mock db factory
// ---------------------------------------------------------------------------

type SelectRow = { count: number };

function makeSimpleMockDb(opts: { selectRows?: SelectRow[]; insertError?: Error } = {}) {
  const selectRows = [...(opts.selectRows ?? [])];
  const capturedWhereArgs: unknown[] = [];
  const capturedInsertValues: unknown[] = [];

  const db = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(async (...args: unknown[]) => {
          capturedWhereArgs.push(...args);
          const next = selectRows.shift();
          return next !== undefined ? [next] : [{ count: 0 }];
        }),
      };
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (row: unknown) => {
        capturedInsertValues.push(row);
        if (opts.insertError) {
          throw opts.insertError;
        }
      }),
    })),
  };

  return { db, capturedWhereArgs, capturedInsertValues };
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

// ---------------------------------------------------------------------------
// monthStartUtc
// ---------------------------------------------------------------------------

describe("monthStartUtc", () => {
  it("returns the first instant of the UTC month", () => {
    const result = monthStartUtc(new Date("2026-06-20T12:34:00Z"));
    expect(result).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("handles month boundary correctly for January", () => {
    const result = monthStartUtc(new Date("2026-01-31T23:59:59Z"));
    expect(result).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });
});

// ---------------------------------------------------------------------------
// getMonthlyAiUsage
// ---------------------------------------------------------------------------

describe("getMonthlyAiUsage", () => {
  it("returns the count from the DB for a given org+feature", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [{ count: 2 }] });
    const result = await getMonthlyAiUsage(db as never, {
      orgId: "org-1",
      feature: "award_intake",
      now: new Date("2026-06-20T00:00:00Z"),
    });
    expect(result).toBe(2);
  });

  it("returns 0 when no rows returned", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [] });
    const result = await getMonthlyAiUsage(db as never, {
      orgId: "org-1",
      feature: "ask_your_ledger",
      now: new Date("2026-06-20T00:00:00Z"),
    });
    expect(result).toBe(0);
  });

  it("returns 0 when the DB returns an empty array with no count row", async () => {
    // Covers the `rows[0]?.count ?? 0` nullish-coalescing branch when rows is empty.
    const db = {
      select: vi.fn(() => {
        const chain = {
          from: vi.fn(() => chain),
          where: vi.fn(async () => []),
        };
        return chain;
      }),
    };
    const result = await getMonthlyAiUsage(db as never, {
      orgId: "org-1",
      feature: "award_intake",
      now: new Date("2026-06-20T00:00:00Z"),
    });
    expect(result).toBe(0);
  });

  it("passes monthStartUtc(now) as the gte lower bound in the where clause", async () => {
    const now = new Date("2026-06-20T12:00:00Z");
    const expectedMonthStart = monthStartUtc(now);

    // We verify by checking the rendered SQL contains the correct month-start timestamp
    const capturedWhereArgs: unknown[] = [];
    const db = {
      select: vi.fn(() => {
        const chain = {
          from: vi.fn(() => chain),
          where: vi.fn(async (...args: unknown[]) => {
            capturedWhereArgs.push(...args);
            return [{ count: 3 }];
          }),
        };
        return chain;
      }),
    };

    await getMonthlyAiUsage(db as never, { orgId: "org-1", feature: "award_intake", now });

    expect(capturedWhereArgs.length).toBeGreaterThan(0);
    const sql = renderSql(capturedWhereArgs[0]);
    // The rendered SQL should reference the created_at column via a >=  condition
    expect(sql.sql).toContain(aiUsageEvents.createdAt.name); // "created_at"
    // The params array should include the monthStartUtc date — PgDialect serialises
    // Date values as ISO strings (or leaves them as Date instances); check both forms.
    const expectedIso = expectedMonthStart.toISOString();
    const hasMonthStart = sql.params.some((p) => {
      if (p instanceof Date) return p.getTime() === expectedMonthStart.getTime();
      if (typeof p === "string") return p === expectedIso;
      return false;
    });
    expect(hasMonthStart).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recordAiUsage
// ---------------------------------------------------------------------------

describe("recordAiUsage", () => {
  it("happy path: inserts a row with correct fields and resolves void", async () => {
    const { db, capturedInsertValues } = makeSimpleMockDb();
    const now = new Date("2026-06-20T10:00:00Z");

    const result = await recordAiUsage(db as never, {
      orgId: "org-abc",
      feature: "award_intake",
      referenceId: "extraction-123",
      now,
    });

    expect(result).toBeUndefined();
    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0]).toMatchObject({
      orgId: "org-abc",
      feature: "award_intake",
      referenceId: "extraction-123",
      createdAt: now,
    });
  });

  it("uses null for referenceId when not provided", async () => {
    const { db, capturedInsertValues } = makeSimpleMockDb();

    await recordAiUsage(db as never, {
      orgId: "org-abc",
      feature: "ask_your_ledger",
    });

    expect(capturedInsertValues[0]).toMatchObject({
      referenceId: null,
    });
  });

  it("dedupe: swallows 23505 unique-violation error (idempotent for award_intake retries)", async () => {
    const dupeError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const { db } = makeSimpleMockDb({ insertError: dupeError });

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "award_intake",
        referenceId: "extraction-123",
      }),
    ).resolves.toBeUndefined();
  });

  it("dedupe: swallows error when message contains 'duplicate key' (no code property)", async () => {
    const dupeError = new Error("duplicate key value violates unique constraint");
    const { db } = makeSimpleMockDb({ insertError: dupeError });

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "award_intake",
        referenceId: "extraction-456",
      }),
    ).resolves.toBeUndefined();
  });

  it("dedupe: swallows error when cause.message contains 'duplicate key'", async () => {
    const cause = new Error("duplicate key value violates unique constraint");
    const wrappedError = Object.assign(new Error("insert failed"), { cause });
    const { db } = makeSimpleMockDb({ insertError: wrappedError });

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "award_intake",
        referenceId: "extraction-789",
      }),
    ).resolves.toBeUndefined();
  });

  it("other errors: rethrows non-dedupe errors", async () => {
    const genericError = new Error("connection refused");
    const { db } = makeSimpleMockDb({ insertError: genericError });

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "ask_your_ledger",
      }),
    ).rejects.toThrow("connection refused");
  });

  it("dedupe: rethrows when thrown value is not an object (string thrown)", async () => {
    // Covers the `err == null || typeof err !== "object"` branch returning false.
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(async () => {
          throw "string error" as unknown; // non-object thrown value: covers isUniqueViolation null/non-object branch
        }),
      })),
    };

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "award_intake",
        referenceId: "extraction-string",
      }),
    ).rejects.toBe("string error");
  });

  it("dedupe: rethrows object error with non-string message (covers msg fallback branch)", async () => {
    // Covers `typeof e["message"] === "string" ? e["message"] : ""` false branch.
    const objectWithNoStringMessage = Object.assign(new Error(""), {
      message: 42 as unknown as string,
    });
    const { db } = makeSimpleMockDb({ insertError: objectWithNoStringMessage });

    await expect(
      recordAiUsage(db as never, {
        orgId: "org-abc",
        feature: "award_intake",
        referenceId: "extraction-nonstr",
      }),
    ).rejects.toBe(objectWithNoStringMessage);
  });
});

// ---------------------------------------------------------------------------
// assertAiUsageWithinCap
// ---------------------------------------------------------------------------

describe("assertAiUsageWithinCap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starter ask_your_ledger at cap 0 rejects immediately with 402 AppError cap error", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [{ count: 0 }] });

    const error = await assertAiUsageWithinCap(db as never, {
      orgId: "org-1",
      feature: "ask_your_ledger",
      planTier: "starter",
      now: new Date("2026-06-20T00:00:00Z"),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    const e = error as AppError;
    expect(e.status).toBe(402);
    expect(e.errorCode).toBe("ai_usage_cap_reached");
    expect(e.details).toEqual({
      feature: "ask_your_ledger",
      cap: 0,
      used: 0,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
  });

  it("starter award_intake at cap (5) rejects with AppError cap:5, upgradeToPlan:growth", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [{ count: 5 }] });

    const error = await assertAiUsageWithinCap(db as never, {
      orgId: "org-1",
      feature: "award_intake",
      planTier: "starter",
      now: new Date("2026-06-20T00:00:00Z"),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    const e = error as AppError;
    expect(e.status).toBe(402);
    expect(e.errorCode).toBe("ai_usage_cap_reached");
    expect(e.details).toEqual({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
  });

  it("starter award_intake below cap (4 of 5) resolves undefined", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [{ count: 4 }] });

    await expect(
      assertAiUsageWithinCap(db as never, {
        orgId: "org-1",
        feature: "award_intake",
        planTier: "starter",
        now: new Date("2026-06-20T00:00:00Z"),
      }),
    ).resolves.toBeUndefined();
  });

  it("growth (uncapped) resolves without calling db.select", async () => {
    const { db } = makeSimpleMockDb({ selectRows: [{ count: 999 }] });

    await expect(
      assertAiUsageWithinCap(db as never, {
        orgId: "org-1",
        feature: "award_intake",
        planTier: "growth",
        now: new Date("2026-06-20T00:00:00Z"),
      }),
    ).resolves.toBeUndefined();

    expect(db.select).not.toHaveBeenCalled();
  });

  it("enterprise (uncapped) resolves without calling db.select", async () => {
    const { db } = makeSimpleMockDb();

    await expect(
      assertAiUsageWithinCap(db as never, {
        orgId: "org-1",
        feature: "ask_your_ledger",
        planTier: "enterprise",
        now: new Date("2026-06-20T00:00:00Z"),
      }),
    ).resolves.toBeUndefined();

    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("lockAiUsageQuota", () => {
  it("takes a transaction-scoped advisory lock for a finite monthly quota", async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await lockAiUsageQuota({ execute } as never, {
      orgId: "org-1",
      feature: "award_intake",
      planTier: "starter",
      now: new Date("2026-07-12T10:00:00.000Z"),
    });

    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not lock uncapped plans", async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await lockAiUsageQuota({ execute } as never, {
      orgId: "org-1",
      feature: "award_intake",
      planTier: "growth",
      now: new Date("2026-07-12T10:00:00.000Z"),
    });

    expect(execute).not.toHaveBeenCalled();
  });
});
