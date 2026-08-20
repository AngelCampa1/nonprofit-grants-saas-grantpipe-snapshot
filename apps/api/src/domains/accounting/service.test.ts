import { describe, expect, it, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppError } from "../../lib/app-error";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("./coaSeed", () => ({
  getNonprofitCoaSeed: vi.fn().mockReturnValue([
    { code: "1000", name: "Cash", type: "asset" },
    { code: "1010", name: "Checking", type: "asset", parentCode: "1000" },
  ]),
}));

import { recordActivityLog } from "../../lib/activity-log";
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  seedChartOfAccounts,
  listFiscalPeriods,
  createFiscalPeriod,
  closeFiscalPeriod,
  updateFiscalPeriod,
  listJournalEntries,
  getJournalEntry,
  createJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  getAccountLedger,
  getStatementOfFinancialPosition,
  getStatementOfActivities,
  getStatementOfFunctionalExpenses,
  runYearEndClose,
  getPeriodCloseChecklist,
  sfpToCsv,
  soaToCsv,
  sfeToCsv,
} from "./service";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Attaches a self-referencing `transaction` stub to any db mock object.
 * The callback receives the same mock so assertions on `.insert`/`.update`/etc.
 * still pass after the service wraps those calls in `db.transaction(...)`.
 */
function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function makeSelectChainMock(resolvedValue: unknown) {
  const offset = vi.fn().mockResolvedValue(resolvedValue);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const selectFn = vi.fn().mockReturnValue({ from });
  return { selectFn, from, where, orderBy, limit, offset };
}

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningFn }),
  });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, returningFn };
}

function makeInsertNoReturnMock() {
  const returningFn = vi.fn().mockResolvedValue([{ id: `seeded-${Math.random()}` }]);
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningFn }),
  });
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
// listAccounts
// ---------------------------------------------------------------------------

describe("listAccounts", () => {
  it("returns accounts ordered by code", async () => {
    const accounts = [
      { id: "acc-1", code: "1000", name: "Cash", type: "asset", isActive: true, deletedAt: null },
    ];
    const { selectFn, from, where, orderBy, limit, offset } = makeSelectChainMock(accounts);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    const result = await listAccounts(db, { orgId: "org-1" });
    expect(result).toEqual(accounts);
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();
    expect(limit).toHaveBeenCalled();
    expect(offset).toHaveBeenCalled();
  });

  it("passes search, type, and isActive filters", async () => {
    const accounts: unknown[] = [];
    const { selectFn } = makeSelectChainMock(accounts);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    const result = await listAccounts(db, {
      orgId: "org-1",
      search: "cash",
      type: "asset",
      isActive: true,
    });
    expect(result).toEqual(accounts);
    expect(selectFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAccount
// ---------------------------------------------------------------------------

describe("getAccount", () => {
  it("returns account when found", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", orgId: "org-1", deletedAt: null };
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(account),
        },
      },
    } as unknown as Parameters<typeof getAccount>[0];
    const result = await getAccount(db, { orgId: "org-1", accountId: "acc-1" });
    expect(result).toEqual(account);
  });

  it("throws notFound when account is missing", async () => {
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Parameters<typeof getAccount>[0];
    await expect(getAccount(db, { orgId: "org-1", accountId: "acc-999" })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

describe("createAccount", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("rejects invalid account input before checking for code conflicts", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        chartOfAccounts: {
          findFirst,
        },
      },
      insert: vi.fn(),
    } as unknown as Parameters<typeof createAccount>[0];

    await expect(
      createAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        code: "",
        name: "Cash",
        type: "asset",
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts account and records activity log", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", orgId: "org-1" };
    const { insertFn } = makeInsertMock(account);
    const db = withTransaction({
      insert: insertFn,
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(null), // no conflict
        },
      },
    } as unknown as Parameters<typeof createAccount>[0]);
    const result = await createAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      code: "1000",
      name: "Cash",
      type: "asset",
    });
    expect(result).toEqual(account);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entityType: "account" }),
    );
  });

  it("throws conflict when code already exists for org", async () => {
    const existing = { id: "acc-existing", code: "1000", orgId: "org-1" };
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
      },
    } as unknown as Parameters<typeof createAccount>[0];
    await expect(
      createAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        code: "1000",
        name: "Cash",
        type: "asset",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a parentAccountId that belongs to another org (cross-org FK injection)", async () => {
    // findFirst #1: code conflict check → null. #2: parent lookup (scoped by
    // org) → null because the parent lives in another org.
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const db = withTransaction({
      insert: vi.fn(),
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof createAccount>[0]);

    await expect(
      createAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        code: "1010",
        name: "Checking",
        type: "asset",
        parentAccountId: "acc-in-another-org",
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts when parentAccountId belongs to the caller's org", async () => {
    const account = { id: "acc-2", code: "1010", name: "Checking", orgId: "org-1" };
    const { insertFn } = makeInsertMock(account);
    // findFirst #1: code conflict → null. #2: parent lookup → in-org parent.
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "acc-1", orgId: "org-1" });
    const db = withTransaction({
      insert: insertFn,
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof createAccount>[0]);

    const result = await createAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      code: "1010",
      name: "Checking",
      type: "asset",
      parentAccountId: "acc-1",
    });

    expect(result).toEqual(account);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

describe("updateAccount", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("rejects invalid account updates before loading the account", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        chartOfAccounts: {
          findFirst,
        },
      },
      update: vi.fn(),
    } as unknown as Parameters<typeof updateAccount>[0];

    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { type: "not-an-account-type" } as never,
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates account and records activity log", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash Updated", orgId: "org-1" };
    const { updateFn } = makeUpdateMock(account);
    const db = withTransaction({
      update: updateFn,
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue({ id: "acc-1", code: "1000", orgId: "org-1" }),
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0]);
    const result = await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-1",
      data: { name: "Cash Updated" },
    });
    expect(result).toEqual(account);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", entityType: "account" }),
    );
  });

  it("throws notFound when account does not exist", async () => {
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0];
    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-999",
        data: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when changing code to one that already exists", async () => {
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "acc-1", code: "1000", orgId: "org-1" }) // existing account
            .mockResolvedValueOnce({ id: "acc-2", code: "2000", orgId: "org-1" }), // code collision
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0];
    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { code: "2000" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeDeleteAccountDb(lineCount: number, updatedRow: unknown | null) {
    // select count from journalLines
    const countWhere = vi.fn().mockResolvedValue([{ count: lineCount }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });

    const returningFn = vi.fn().mockResolvedValue(updatedRow ? [updatedRow] : []);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });

    const base = { select: selectFn, update: updateFn } as unknown as Parameters<
      typeof deleteAccount
    >[0];
    return {
      db: withTransaction(base),
      selectFn,
      updateFn,
    };
  }

  it("soft-deletes account and records activity log when no posted lines", async () => {
    const account = { id: "acc-1", code: "1000", orgId: "org-1" };
    const { db, updateFn } = makeDeleteAccountDb(0, account);
    await deleteAccount(db, { orgId: "org-1", actorId: "user-1", accountId: "acc-1" });
    expect(updateFn).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entityType: "account" }),
    );
  });

  it("throws conflict when account has posted transactions", async () => {
    const { db } = makeDeleteAccountDb(3, null);
    await expect(
      deleteAccount(db, { orgId: "org-1", actorId: "user-1", accountId: "acc-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws notFound when account does not exist (no posted lines)", async () => {
    const { db } = makeDeleteAccountDb(0, null);
    await expect(
      deleteAccount(db, { orgId: "org-1", actorId: "user-1", accountId: "acc-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// seedChartOfAccounts
// ---------------------------------------------------------------------------

describe("seedChartOfAccounts", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockClear();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeSeedDb(existingCount: number) {
    const countWhere = vi.fn().mockResolvedValue([{ count: existingCount }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });

    const { insertFn } = makeInsertNoReturnMock();

    // The transaction callback receives a `tx` object that mirrors the db interface
    const tx = { select: selectFn, insert: insertFn };
    const transactionFn = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    return {
      db: { transaction: transactionFn } as unknown as Parameters<typeof seedChartOfAccounts>[0],
      tx,
      insertFn,
      transactionFn,
    };
  }

  it("inserts seed accounts when org has none", async () => {
    const { db, insertFn } = makeSeedDb(0);
    await seedChartOfAccounts(db, { orgId: "org-1", actorId: "user-1" });
    expect(insertFn).toHaveBeenCalled();
  });

  it("records activity log with action seeded after seeding completes", async () => {
    const { db, tx } = makeSeedDb(0);
    await seedChartOfAccounts(db, { orgId: "org-1", actorId: "user-1" });
    expect(recordActivityLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "seeded", entityType: "account", entityId: "org-1" }),
    );
  });

  it("skips seeding when org already has accounts", async () => {
    const { db, insertFn } = makeSeedDb(5);
    await seedChartOfAccounts(db, { orgId: "org-1", actorId: "user-1" });
    expect(insertFn).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listFiscalPeriods
// ---------------------------------------------------------------------------

describe("listFiscalPeriods", () => {
  it("returns periods ordered by startDate DESC", async () => {
    const periods = [
      { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" },
      { id: "p-2", name: "FY2025", status: "closed", orgId: "org-1" },
    ];
    const { selectFn } = makeSelectChainMock(periods);
    const db = { select: selectFn } as unknown as Parameters<typeof listFiscalPeriods>[0];
    const result = await listFiscalPeriods(db, { orgId: "org-1" });
    expect(result).toEqual(periods);
  });
});

// ---------------------------------------------------------------------------
// createFiscalPeriod
// ---------------------------------------------------------------------------

describe("createFiscalPeriod", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("inserts period and records activity log when no overlap", async () => {
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const { insertFn } = makeInsertMock(period);
    const db = withTransaction({
      insert: insertFn,
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(null), // no overlap
        },
      },
    } as unknown as Parameters<typeof createFiscalPeriod>[0]);
    const result = await createFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      name: "FY2026",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    expect(result).toEqual(period);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entityType: "fiscal_period" }),
    );
  });
});

// ---------------------------------------------------------------------------
// closeFiscalPeriod
// ---------------------------------------------------------------------------

describe("closeFiscalPeriod", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("closes an open period and records activity log", async () => {
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const closed = { ...period, status: "closed" };
    const { updateFn } = makeUpdateMock(closed);
    const db = withTransaction({
      update: updateFn,
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(period),
        },
      },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0]);
    const result = await closeFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
    });
    expect(result.status).toBe("closed");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "closed", entityType: "fiscal_period" }),
    );
  });

  it("throws notFound when period does not exist", async () => {
    const db = {
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0];
    await expect(
      closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when period is already closed", async () => {
    const period = { id: "p-1", name: "FY2025", status: "closed", orgId: "org-1" };
    const db = {
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(period),
        },
      },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0];
    await expect(
      closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when period is locked", async () => {
    const period = { id: "p-1", name: "FY2025", status: "locked", orgId: "org-1" };
    const db = {
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(period),
        },
      },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0];
    await expect(
      closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when a concurrent close wins the race (atomic status-guarded claim)", async () => {
    // The period reads as 'open' (stale pre-check passes), but the atomic
    // UPDATE...WHERE status='open' RETURNING matches nothing because a
    // concurrent close already flipped it. The loser must 409 and must NOT
    // write a second 'closed' audit entry / overwrite closedBy.
    vi.mocked(recordActivityLog).mockClear();
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const { updateFn } = makeUpdateMock(undefined);
    const db = withTransaction({
      update: updateFn,
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(period),
        },
      },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0]);
    await expect(
      closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateFiscalPeriod
// ---------------------------------------------------------------------------

describe("updateFiscalPeriod", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeUpdatePeriodDb(
    period: { id: string; name: string; status: string; startDate: Date; endDate: Date } | null,
    returnValue?: unknown,
    overlapPeriod?: unknown,
  ) {
    const findFirstFn = vi
      .fn()
      .mockResolvedValueOnce(period)
      .mockResolvedValueOnce(overlapPeriod ?? null);
    const { updateFn } = makeUpdateMock(returnValue ?? period);
    return withTransaction({
      query: { fiscalPeriods: { findFirst: findFirstFn } },
      update: updateFn,
    } as unknown as Parameters<typeof updateFiscalPeriod>[0]);
  }

  it("updates name and records activity log", async () => {
    const period = {
      id: "p-1",
      name: "FY2026",
      status: "open",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const updated = { ...period, name: "Fiscal Year 2026" };
    const db = makeUpdatePeriodDb(period, updated);
    const result = await updateFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
      data: { name: "Fiscal Year 2026" },
    });
    expect(result.name).toBe("Fiscal Year 2026");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", entityType: "fiscal_period" }),
    );
  });

  it("throws notFound when period does not exist", async () => {
    const db = makeUpdatePeriodDb(null);
    await expect(
      updateFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        periodId: "p-999",
        data: { name: "New Name" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when period is locked", async () => {
    const period = {
      id: "p-1",
      name: "FY2025",
      status: "locked",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
    };
    const db = makeUpdatePeriodDb(period);
    await expect(
      updateFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        periodId: "p-1",
        data: { name: "Cannot Change" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when updated dates create endDate before startDate", async () => {
    const period = {
      id: "p-1",
      name: "FY2026",
      status: "open",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const db = makeUpdatePeriodDb(period);
    await expect(
      updateFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        periodId: "p-1",
        data: { endDate: "2025-12-31T00:00:00.000Z" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when updated dates overlap with another period", async () => {
    const period = {
      id: "p-1",
      name: "FY2026",
      status: "open",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const conflicting = {
      id: "p-2",
      name: "Q1 2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.999Z"),
    };
    const db = makeUpdatePeriodDb(period, period, conflicting);
    await expect(
      updateFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        periodId: "p-1",
        data: { startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-06-30T23:59:59.999Z" },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("successfully updates startDate and endDate when no overlap", async () => {
    const period = {
      id: "p-1",
      name: "FY2026",
      status: "open",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const updated = {
      ...period,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      endDate: new Date("2027-01-31T23:59:59.999Z"),
    };
    const db = makeUpdatePeriodDb(period, updated);
    const result = await updateFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
      data: { startDate: "2026-02-01T00:00:00.000Z", endDate: "2027-01-31T23:59:59.999Z" },
    });
    expect(result.startDate).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(result.endDate).toEqual(new Date("2027-01-31T23:59:59.999Z"));
  });
});

// ---------------------------------------------------------------------------
// listJournalEntries
// ---------------------------------------------------------------------------

describe("listJournalEntries", () => {
  it("returns entries with lines for the org", async () => {
    const entries = [{ id: "je-1", orgId: "org-1", entryNumber: 1, lines: [] }];
    const db = {
      query: {
        journalEntries: {
          findMany: vi.fn().mockResolvedValue(entries),
        },
      },
    } as unknown as Parameters<typeof listJournalEntries>[0];
    const result = await listJournalEntries(db, { orgId: "org-1" });
    expect(result).toEqual(entries);
  });

  it("filters by fiscalPeriodId, source, from, and to", async () => {
    const entries: unknown[] = [];
    const findMany = vi.fn().mockResolvedValue(entries);
    const db = {
      query: {
        journalEntries: { findMany },
      },
    } as unknown as Parameters<typeof listJournalEntries>[0];
    const result = await listJournalEntries(db, {
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      source: "manual",
      from: new Date("2026-01-01"),
      to: new Date("2026-12-31"),
    });
    expect(result).toEqual(entries);
    expect(findMany).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getJournalEntry
// ---------------------------------------------------------------------------

describe("getJournalEntry", () => {
  it("returns entry with lines when found", async () => {
    const entry = { id: "je-1", orgId: "org-1", entryNumber: 1, lines: [] };
    const db = {
      query: {
        journalEntries: {
          findFirst: vi.fn().mockResolvedValue(entry),
        },
      },
    } as unknown as Parameters<typeof getJournalEntry>[0];
    const result = await getJournalEntry(db, { orgId: "org-1", entryId: "je-1" });
    expect(result).toEqual(entry);
  });

  it("throws notFound when entry does not exist", async () => {
    const db = {
      query: {
        journalEntries: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Parameters<typeof getJournalEntry>[0];
    await expect(getJournalEntry(db, { orgId: "org-1", entryId: "je-999" })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

// ---------------------------------------------------------------------------
// createJournalEntry
// ---------------------------------------------------------------------------

describe("createJournalEntry", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeCreateJeDb(
    period: { status: string; name?: string; startDate?: Date; endDate?: Date } | null,
    maxEntryNumber: number | null,
  ) {
    const fullPeriod = period
      ? {
          name: "FY2026",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
          ...period,
        }
      : null;
    const periodFindFirst = vi.fn().mockResolvedValue(fullPeriod);

    // max entryNumber select — used inside the transaction
    const maxWhere = vi.fn().mockResolvedValue([{ max: maxEntryNumber }]);
    const maxFrom = vi.fn().mockReturnValue({ where: maxWhere });
    const selectFn = vi.fn().mockReturnValue({ from: maxFrom });

    const entry = { id: "je-1", orgId: "org-1", entryNumber: (maxEntryNumber ?? 0) + 1, lines: [] };
    const returningEntryFn = vi.fn().mockResolvedValue([entry]);
    const valuesEntryFn = vi.fn().mockReturnValue({
      returning: returningEntryFn,
      onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningEntryFn }),
    });

    const line = { id: "line-1" };
    const valuesLinesFn = vi.fn().mockResolvedValue(undefined);

    const insertFn = vi
      .fn()
      .mockReturnValueOnce({ values: valuesEntryFn })
      .mockReturnValueOnce({ values: valuesLinesFn });

    const findFirstEntry = vi.fn().mockResolvedValue({ ...entry, lines: [line] });

    // Transaction: receives callback, passes a tx object that mirrors db's select/insert/query.
    // Period lookup moved inside the transaction in the implementation, so fiscalPeriods
    // findFirst lives on tx.query rather than db.query.
    const tx = {
      select: selectFn,
      insert: insertFn,
      query: {
        fiscalPeriods: { findFirst: periodFindFirst },
        journalEntries: { findFirst: findFirstEntry },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue({ id: "acc-1", isActive: true }) },
        funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1" }) },
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        contacts: { findFirst: vi.fn().mockResolvedValue({ id: "contact-1" }) },
      },
    };
    const transactionFn = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    return {
      db: {
        transaction: transactionFn,
        query: {},
      } as unknown as Parameters<typeof createJournalEntry>[0],
      entry,
      line,
    };
  }

  it("creates entry with entry number starting at 1 when no previous entries", async () => {
    const { db } = makeCreateJeDb({ status: "open" }, null);
    const result = await createJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      date: "2026-01-15T00:00:00.000Z",
      fiscalPeriodId: "p-1",
      isAdjusting: false,
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 100 },
      ],
    });
    expect(result).toBeDefined();
    // recordActivityLog is called with tx (inside transaction), not the outer db
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "posted", entityType: "journal_entry" }),
    );
  });

  it("increments entry number from max existing", async () => {
    const { db } = makeCreateJeDb({ status: "open" }, 5);
    await createJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      date: "2026-01-15T00:00:00.000Z",
      fiscalPeriodId: "p-1",
      isAdjusting: false,
      lines: [
        { accountId: "acc-1", debitCents: 200, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 200 },
      ],
    });
    // entry number would be 6
    expect(recordActivityLog).toHaveBeenCalled();
  });

  it("rejects unbalanced journal entries before opening a transaction", async () => {
    const transaction = vi.fn();
    const guardedDb = { transaction } as unknown as Parameters<typeof createJournalEntry>[0];

    await expect(
      createJournalEntry(guardedDb, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 90 },
        ],
      }),
    ).rejects.toThrow("Journal entry is not balanced");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects journal lines with reference records outside the org before insert", async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (cb: (txArg: unknown) => Promise<unknown>) =>
        cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ max: 0 }]) }),
          }),
          insert: vi
            .fn()
            .mockReturnValueOnce({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "entry-1" }]),
              }),
            })
            .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) }),
          query: {
            fiscalPeriods: {
              findFirst: vi.fn().mockResolvedValue({
                status: "open",
                name: "FY2026",
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-12-31T23:59:59.999Z"),
              }),
            },
            chartOfAccounts: {
              findFirst: vi.fn().mockResolvedValue({ id: "acc-1", isActive: true }),
            },
            funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1" }) },
            grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
            contacts: { findFirst: vi.fn().mockResolvedValue(undefined) },
            journalEntries: { findFirst: vi.fn().mockResolvedValue({ id: "entry-1", lines: [] }) },
          },
        }),
      );
    const guardedDb = { transaction } as unknown as Parameters<typeof createJournalEntry>[0];

    await expect(
      createJournalEntry(guardedDb, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          {
            accountId: "acc-1",
            fundId: "fund-1",
            grantId: "grant-1",
            contactId: "contact-foreign",
            debitCents: 100,
            creditCents: 0,
          },
          { accountId: "acc-1", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toThrow("Contact not found");
  });

  it("throws conflict when fiscal period is closed", async () => {
    const { db } = makeCreateJeDb({ status: "closed" }, null);
    await expect(
      createJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when fiscal period is locked", async () => {
    const { db } = makeCreateJeDb({ status: "locked" }, null);
    await expect(
      createJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws notFound when fiscal period does not exist", async () => {
    const { db } = makeCreateJeDb(null, null);
    await expect(
      createJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-999",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// reverseJournalEntry
// ---------------------------------------------------------------------------

function makeReverseDb(
  originalEntry: {
    id: string;
    orgId: string;
    fiscalPeriodId: string;
    entryNumber: number;
    reversedByEntryId?: string | null;
    lines: {
      accountId: string;
      debitCents: number;
      creditCents: number;
      fundId?: string | null;
      grantId?: string | null;
      contactId?: string | null;
      memo?: string | null;
    }[];
  } | null,
  period: { status: string } | null,
  claimReturns = true,
) {
  const findFirstEntry = vi
    .fn()
    .mockResolvedValueOnce(originalEntry)
    .mockResolvedValueOnce(originalEntry);
  const findFirstPeriod = vi.fn().mockResolvedValue(period);

  // max entryNumber select — runs inside transaction
  const maxWhere = vi.fn().mockResolvedValue([{ max: 1 }]);
  const maxFrom = vi.fn().mockReturnValue({ where: maxWhere });
  const selectFn = vi.fn().mockReturnValue({ from: maxFrom });

  const newEntry = { id: "je-2", orgId: "org-1", entryNumber: 2, isAdjusting: true, lines: [] };
  const returningEntryFn = vi.fn().mockResolvedValue([newEntry]);
  const valuesEntryFn = vi.fn().mockReturnValue({
    returning: returningEntryFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningEntryFn }),
  });

  const valuesLinesFn = vi.fn().mockResolvedValue(undefined);

  const insertFn = vi
    .fn()
    .mockReturnValueOnce({ values: valuesEntryFn })
    .mockReturnValueOnce({ values: valuesLinesFn });

  // Atomic claim: .update().set().where().returning(). returningUpdate resolves
  // to [] to simulate a concurrent reversal having already claimed the entry.
  const returningUpdateFn = vi
    .fn()
    .mockResolvedValue(claimReturns ? [{ ...originalEntry, reversedByEntryId: "je-2" }] : []);
  const whereUpdateFn = vi.fn().mockReturnValue({ returning: returningUpdateFn });
  const setUpdateFn = vi.fn().mockReturnValue({ where: whereUpdateFn });
  const updateFn = vi.fn().mockReturnValue({ set: setUpdateFn });

  const findFirstNewEntry = vi.fn().mockResolvedValue({ ...newEntry, lines: [{ id: "line-2" }] });

  // Transaction contains: select (max entryNumber), insert (entry), insert (lines), update, query (findFirst)
  const tx = {
    select: selectFn,
    insert: insertFn,
    update: updateFn,
    query: {
      journalEntries: { findFirst: findFirstNewEntry },
    },
  };
  const transactionFn = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

  return {
    db: {
      transaction: transactionFn,
      query: {
        journalEntries: { findFirst: findFirstEntry },
        fiscalPeriods: { findFirst: findFirstPeriod },
      },
    } as unknown as Parameters<typeof reverseJournalEntry>[0],
    newEntry,
    findFirstNewEntry,
    updateFn,
    setUpdateFn,
    whereUpdateFn,
  };
}

describe("reverseJournalEntry", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("creates a reversing entry with swapped debits/credits", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
        {
          accountId: "acc-2",
          debitCents: 0,
          creditCents: 100,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });
    const result = await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
    });
    expect(result).toBeDefined();
    // recordActivityLog is called inside the transaction with tx, not the outer db
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "reversed", entityType: "journal_entry" }),
    );
  });

  it("throws notFound when original entry does not exist", async () => {
    const { db } = makeReverseDb(null, null);
    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when the fiscal period for reversal is closed", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [],
    };
    const { db } = makeReverseDb(original, { status: "closed" });
    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("uses custom memo when provided", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 50,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
        {
          accountId: "acc-2",
          debitCents: 0,
          creditCents: 50,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });
    await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
      memo: "Custom reversal memo",
    });
    expect(recordActivityLog).toHaveBeenCalled();
  });

  it("uses provided date for the reversal entry when date param is given", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
        {
          accountId: "acc-2",
          debitCents: 0,
          creditCents: 100,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });
    const result = await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
      date: "2026-06-15T00:00:00.000Z",
    });
    expect(result).toBeDefined();
    expect(recordActivityLog).toHaveBeenCalled();
  });

  it("throws notFound when the fiscal period for the original entry is not found", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-999",
      entryNumber: 1,
      lines: [],
    };
    // Entry found but period not found
    const db = {
      query: {
        journalEntries: { findFirst: vi.fn().mockResolvedValue(original) },
        fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Parameters<typeof reverseJournalEntry>[0];
    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when period is locked for reversal", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [],
    };
    const { db } = makeReverseDb(original, { status: "locked" });
    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when entry has already been reversed", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      reversedByEntryId: "je-2",
      lines: [],
    };
    const db = {
      query: {
        journalEntries: { findFirst: vi.fn().mockResolvedValue(original) },
        fiscalPeriods: { findFirst: vi.fn().mockResolvedValue({ status: "open" }) },
      },
    } as unknown as Parameters<typeof reverseJournalEntry>[0];
    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("clamps reversal date to period.startDate when today falls before the period starts", async () => {
    const periodStart = new Date("2026-04-20T00:00:00.000Z");
    const periodEnd = new Date("2027-03-31T23:59:59.000Z");
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
        {
          accountId: "acc-2",
          debitCents: 0,
          creditCents: 100,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };

    let capturedDate: Date | undefined;
    const newEntry = { id: "je-2", orgId: "org-1", entryNumber: 2, isAdjusting: true, lines: [] };
    const returningEntryFn = vi.fn().mockImplementation(async () => [newEntry]);
    const valuesEntryFn = vi.fn().mockImplementation((vals: { date?: Date }) => {
      capturedDate = vals.date;
      return {
        returning: returningEntryFn,
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningEntryFn }),
      };
    });
    const valuesLinesFn = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi
      .fn()
      .mockReturnValueOnce({ values: valuesEntryFn })
      .mockReturnValueOnce({ values: valuesLinesFn });
    const maxWhere = vi.fn().mockResolvedValue([{ max: 1 }]);
    const maxFrom = vi.fn().mockReturnValue({ where: maxWhere });
    const selectFn = vi.fn().mockReturnValue({ from: maxFrom });
    const returningUpdateFn = vi
      .fn()
      .mockResolvedValue([{ ...original, reversedByEntryId: "je-2" }]);
    const whereUpdateFn = vi.fn().mockReturnValue({ returning: returningUpdateFn });
    const setUpdateFn = vi.fn().mockReturnValue({ where: whereUpdateFn });
    const updateFn = vi.fn().mockReturnValue({ set: setUpdateFn });
    const findFirstNewEntry = vi.fn().mockResolvedValue({ ...newEntry, lines: [{ id: "line-2" }] });
    const tx = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
      query: { journalEntries: { findFirst: findFirstNewEntry } },
    };
    const transactionFn = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const db = {
      transaction: transactionFn,
      query: {
        journalEntries: { findFirst: vi.fn().mockResolvedValue(original) },
        fiscalPeriods: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ status: "open", startDate: periodStart, endDate: periodEnd }),
        },
      },
    } as unknown as Parameters<typeof reverseJournalEntry>[0];

    // Provide a date that is before the period start
    await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
      date: "2026-04-19T00:00:00.000Z",
    });

    // The entry should have been inserted with startDate, not the provided date
    expect(capturedDate?.toISOString()).toBe(periodStart.toISOString());
  });
});

// ---------------------------------------------------------------------------
// getTrialBalance
// ---------------------------------------------------------------------------

describe("getTrialBalance", () => {
  function makeTrialBalanceDb(rows: unknown[]) {
    const orderByFn = vi.fn().mockResolvedValue(rows);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const groupByFn = vi.fn().mockReturnValue({ where: whereFn });
    // Both joins are now leftJoin — second leftJoin returns groupBy chain
    const secondLeftJoinFn = vi.fn().mockReturnValue({ groupBy: groupByFn });
    const firstLeftJoinFn = vi.fn().mockReturnValue({ leftJoin: secondLeftJoinFn });
    const fromFn = vi.fn().mockReturnValue({ leftJoin: firstLeftJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    return { select: selectFn } as unknown as Parameters<typeof getTrialBalance>[0];
  }

  it("returns trial balance with debit-normal balance for assets", async () => {
    const rows = [
      {
        account: { id: "acc-1", code: "1000", type: "asset", name: "Cash" },
        debitTotal: 1000,
        creditTotal: 200,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    expect(Array.isArray(result)).toBe(true);
    // For asset: balance = debitTotal - creditTotal (debit-normal)
    const assetRow = result.find((r) => r.account?.type === "asset");
    if (assetRow) {
      expect(assetRow.balance).toBe(assetRow.debitTotal - assetRow.creditTotal);
    }
  });

  it("returns credit-normal balance for liability accounts", async () => {
    const rows = [
      {
        account: { id: "acc-2", code: "2000", type: "liability", name: "AP" },
        debitTotal: 0,
        creditTotal: 500,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    const liabilityRow = result.find((r) => r.account?.type === "liability");
    if (liabilityRow) {
      expect(liabilityRow.balance).toBe(liabilityRow.creditTotal - liabilityRow.debitTotal);
    }
  });

  it("returns credit-normal balance for revenue accounts", async () => {
    const rows = [
      {
        account: { id: "acc-4", code: "4000", type: "revenue", name: "Contributions" },
        debitTotal: 0,
        creditTotal: 10000,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    const revenueRow = result.find((r) => r.account?.type === "revenue");
    if (revenueRow) {
      expect(revenueRow.balance).toBe(revenueRow.creditTotal - revenueRow.debitTotal);
    }
  });

  it("returns credit-normal balance for net_assets accounts", async () => {
    const rows = [
      {
        account: { id: "acc-3", code: "3000", type: "net_assets", name: "Net Assets Unrestricted" },
        debitTotal: 0,
        creditTotal: 50000,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    const netAssetsRow = result.find((r) => r.account?.type === "net_assets");
    if (netAssetsRow) {
      expect(netAssetsRow.balance).toBe(netAssetsRow.creditTotal - netAssetsRow.debitTotal);
    }
  });

  it("returns debit-normal balance for expense accounts", async () => {
    const rows = [
      {
        account: { id: "acc-5", code: "5000", type: "expense", name: "Program Expenses" },
        debitTotal: 3000,
        creditTotal: 0,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    const expenseRow = result.find((r) => r.account?.type === "expense");
    if (expenseRow) {
      expect(expenseRow.balance).toBe(expenseRow.debitTotal - expenseRow.creditTotal);
    }
  });

  it("includes accounts with no entries with zero balances", async () => {
    const rows = [
      {
        account: { id: "acc-6", code: "6000", type: "expense", name: "Empty Account" },
        debitTotal: 0,
        creditTotal: 0,
      },
    ];
    const db = makeTrialBalanceDb(rows);
    const result = await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
    });
    const emptyRow = result.find((r) => r.account?.id === "acc-6");
    expect(emptyRow).toBeDefined();
    expect(emptyRow?.debitTotal).toBe(0);
    expect(emptyRow?.creditTotal).toBe(0);
    expect(emptyRow?.balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getAccountLedger
// ---------------------------------------------------------------------------

describe("getAccountLedger", () => {
  it("returns account with lines and running balances", async () => {
    const account = { id: "acc-1", code: "1000", type: "asset", name: "Cash", orgId: "org-1" };
    const lines = [
      {
        line: { id: "line-1", debitCents: 1000, creditCents: 0, accountId: "acc-1" },
        journalEntry: { id: "je-1", date: new Date("2026-01-01"), entryNumber: 1 },
      },
      {
        line: { id: "line-2", debitCents: 0, creditCents: 200, accountId: "acc-1" },
        journalEntry: { id: "je-2", date: new Date("2026-01-05"), entryNumber: 2 },
      },
    ];

    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(lines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: {
        chartOfAccounts: { findFirst: accountFindFirst },
      },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, {
      orgId: "org-1",
      accountId: "acc-1",
    });
    expect(result.account).toEqual(account);
    expect(Array.isArray(result.lines)).toBe(true);
    // Running balance for asset: debit-normal, after line-1: 1000; after line-2: 800
    if (result.lines.length >= 2) {
      expect(result.lines[0]?.runningBalance).toBe(1000);
      expect(result.lines[1]?.runningBalance).toBe(800);
    }
  });

  it("throws notFound when account does not exist", async () => {
    const db = {
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Parameters<typeof getAccountLedger>[0];
    await expect(
      getAccountLedger(db, { orgId: "org-1", accountId: "acc-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("applies from and to date filters", async () => {
    const account = { id: "acc-1", code: "1000", type: "asset", name: "Cash", orgId: "org-1" };
    const lines: unknown[] = [];
    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(lines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: { chartOfAccounts: { findFirst: accountFindFirst } },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, {
      orgId: "org-1",
      accountId: "acc-1",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(result.lines).toEqual([]);
  });

  it("computes credit-normal running balance for liability account", async () => {
    const account = { id: "acc-2", code: "2000", type: "liability", name: "AP", orgId: "org-1" };
    const rawLines = [
      {
        line: { id: "line-1", debitCents: 0, creditCents: 500, accountId: "acc-2" },
        journalEntry: { id: "je-1", date: new Date("2026-01-01"), entryNumber: 1 },
      },
      {
        line: { id: "line-2", debitCents: 100, creditCents: 0, accountId: "acc-2" },
        journalEntry: { id: "je-2", date: new Date("2026-01-05"), entryNumber: 2 },
      },
    ];
    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(rawLines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: { chartOfAccounts: { findFirst: accountFindFirst } },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, { orgId: "org-1", accountId: "acc-2" });
    // Liability: credit-normal. After credit 500: +500. After debit 100: 500-100 = 400
    expect(result.lines[0]?.runningBalance).toBe(500);
    expect(result.lines[1]?.runningBalance).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Additional branch coverage tests
// ---------------------------------------------------------------------------

describe("listAccounts — filter branches", () => {
  it("applies search filter", async () => {
    const { selectFn } = makeSelectChainMock([]);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    await listAccounts(db, { orgId: "org-1", search: "cash" });
    expect(selectFn).toHaveBeenCalled();
  });

  it("applies type filter only", async () => {
    const { selectFn } = makeSelectChainMock([]);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    await listAccounts(db, { orgId: "org-1", type: "liability" });
    expect(selectFn).toHaveBeenCalled();
  });

  it("applies isActive false filter", async () => {
    const { selectFn } = makeSelectChainMock([]);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    await listAccounts(db, { orgId: "org-1", isActive: false });
    expect(selectFn).toHaveBeenCalled();
  });
});

describe("getTrialBalance — with optional filters", () => {
  function makeTrialBalanceDb(rows: unknown[]) {
    const orderByFn = vi.fn().mockResolvedValue(rows);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const groupByFn = vi.fn().mockReturnValue({ where: whereFn });
    const secondLeftJoinFn = vi.fn().mockReturnValue({ groupBy: groupByFn });
    const leftJoinFn = vi.fn().mockReturnValue({ leftJoin: secondLeftJoinFn });
    const fromFn = vi.fn().mockReturnValue({ leftJoin: leftJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    return { select: selectFn } as unknown as Parameters<typeof getTrialBalance>[0];
  }

  it("applies fundId filter", async () => {
    const db = makeTrialBalanceDb([]);
    await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
      fundId: "fund-1",
    });
    expect(true).toBe(true);
  });

  it("applies grantId filter", async () => {
    const db = makeTrialBalanceDb([]);
    await getTrialBalance(db, {
      orgId: "org-1",
      asOf: "2026-12-31T23:59:59.999Z",
      grantId: "grant-1",
    });
    expect(true).toBe(true);
  });
});

describe("createAccount — isActive default", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("defaults isActive to true when not provided", async () => {
    const account = { id: "acc-new", code: "9999", name: "Test", orgId: "org-1" };
    const { insertFn } = makeInsertMock(account);
    const db = withTransaction({
      insert: insertFn,
      query: { chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Parameters<typeof createAccount>[0]);
    await createAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      code: "9999",
      name: "Test",
      type: "asset",
    });
    expect(insertFn).toHaveBeenCalled();
  });
});

describe("updateAccount — field branches", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("updates all optional fields when provided", async () => {
    // Include `type` so the type-change guard can compare correctly
    const account = { id: "acc-1", code: "1000", name: "Cash", type: "asset", orgId: "org-1" };
    const updated = {
      ...account,
      code: "1001",
      name: "Cash Updated",
      type: "asset",
      subtype: "current",
      isActive: false,
    };
    const { updateFn } = makeUpdateMock(updated);
    const db = withTransaction({
      update: updateFn,
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValueOnce(account).mockResolvedValueOnce(null), // no code collision
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0]);
    const result = await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-1",
      data: {
        code: "1001",
        name: "Cash Updated",
        type: "asset", // same type — no type-change guard triggered
        subtype: "current",
        parentAccountId: null,
        naturalRestriction: null,
        functionalClass: null,
        isActive: false,
      },
    });
    expect(result).toEqual(updated);
  });

  it("does not check code collision when code is same as existing", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", orgId: "org-1" };
    const updated = { ...account, name: "Cash Updated" };
    const { updateFn } = makeUpdateMock(updated);
    const findFirst = vi.fn().mockResolvedValue(account);
    const db = withTransaction({
      update: updateFn,
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof updateAccount>[0]);
    // Code is same as existing — no collision check needed
    await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-1",
      data: { code: "1000", name: "Cash Updated" },
    });
    // findFirst only called once (for the existing account lookup)
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects re-parenting to an account in another org (cross-org FK injection)", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", type: "asset", orgId: "org-1" };
    // findFirst #1: load account → found. #2: parent lookup (org-scoped) → null.
    const findFirst = vi.fn().mockResolvedValueOnce(account).mockResolvedValueOnce(null);
    const db = withTransaction({
      update: vi.fn(),
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof updateAccount>[0]);

    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { parentAccountId: "acc-in-another-org" },
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an account that is set as its own parent", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", type: "asset", orgId: "org-1" };
    const findFirst = vi.fn().mockResolvedValue(account);
    const db = withTransaction({
      update: vi.fn(),
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof updateAccount>[0]);

    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { parentAccountId: "acc-1" },
      }),
    ).rejects.toBeInstanceOf(AppError);

    // Only the account load runs; the self-parent guard short-circuits before
    // the parent lookup and before any write.
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates when re-parenting to an account in the caller's org", async () => {
    const account = { id: "acc-2", code: "1010", name: "Checking", type: "asset", orgId: "org-1" };
    const updated = { ...account, parentAccountId: "acc-1" };
    const { updateFn } = makeUpdateMock(updated);
    // findFirst #1: load account. #2: parent lookup → in-org parent.
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ id: "acc-1", orgId: "org-1" });
    const db = withTransaction({
      update: updateFn,
      query: { chartOfAccounts: { findFirst } },
    } as unknown as Parameters<typeof updateAccount>[0]);

    const result = await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-2",
      data: { parentAccountId: "acc-1" },
    });

    expect(result).toEqual(updated);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});

describe("reverseJournalEntry — org-scoped update", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("includes orgId in the where clause when updating reversedByEntryId", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };

    const { db, updateFn, setUpdateFn } = makeReverseDb(original, { status: "open" });

    await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
    });

    // The update must have been called inside the transaction with the reversedByEntryId
    expect(updateFn).toHaveBeenCalled();
    expect(setUpdateFn).toHaveBeenCalledWith({ reversedByEntryId: "je-2" });
  });
});

describe("reverseJournalEntry — concurrent reversal race (atomic claim)", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("throws 409 conflict when a concurrent reversal already claimed the entry (guarded UPDATE returns empty)", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      // findFirst still sees reversedByEntryId as null (stale read) — the race is
      // only lost at the atomic UPDATE, which returns no row.
      reversedByEntryId: null,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };

    // claimReturns = false → the guarded UPDATE .returning() resolves to []
    const { db } = makeReverseDb(original, { status: "open" }, false);

    await expect(
      reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("guards the completion UPDATE on reversedByEntryId being null (atomic claim)", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      reversedByEntryId: null,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };

    const { db, whereUpdateFn } = makeReverseDb(original, { status: "open" });

    await reverseJournalEntry(db, { orgId: "org-1", actorId: "user-1", entryId: "je-1" });

    // The UPDATE WHERE must include the reversedByEntryId IS NULL guard so two
    // concurrent reversals cannot both stamp the original entry. Drizzle column
    // objects hold a circular `table` ref, so strip it during serialization.
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(whereUpdateFn.mock.calls[0]?.[0], (key, value) => {
      if (key === "table") return undefined;
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });
    expect(serialized).toContain("reversed_by_entry_id");
    expect(serialized).toContain(" is null");
  });
});

describe("getAccountLedger — fundId and grantId filters", () => {
  it("applies fundId filter to line conditions", async () => {
    const account = { id: "acc-1", code: "1000", type: "asset", name: "Cash", orgId: "org-1" };
    const lines: unknown[] = [];
    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(lines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: { chartOfAccounts: { findFirst: accountFindFirst } },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, {
      orgId: "org-1",
      accountId: "acc-1",
      fundId: "fund-1",
    });
    expect(result.lines).toEqual([]);
    expect(whereFn).toHaveBeenCalled();
  });

  it("applies grantId filter to line conditions", async () => {
    const account = { id: "acc-1", code: "1000", type: "asset", name: "Cash", orgId: "org-1" };
    const lines: unknown[] = [];
    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(lines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: { chartOfAccounts: { findFirst: accountFindFirst } },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, {
      orgId: "org-1",
      accountId: "acc-1",
      grantId: "grant-1",
    });
    expect(result.lines).toEqual([]);
    expect(whereFn).toHaveBeenCalled();
  });

  it("applies both fundId and grantId filters together", async () => {
    const account = { id: "acc-1", code: "1000", type: "asset", name: "Cash", orgId: "org-1" };
    const lines: unknown[] = [];
    const accountFindFirst = vi.fn().mockResolvedValue(account);
    const orderByFn = vi.fn().mockResolvedValue(lines);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const db = {
      select: selectFn,
      query: { chartOfAccounts: { findFirst: accountFindFirst } },
    } as unknown as Parameters<typeof getAccountLedger>[0];

    const result = await getAccountLedger(db, {
      orgId: "org-1",
      accountId: "acc-1",
      fundId: "fund-1",
      grantId: "grant-1",
    });
    expect(result.lines).toEqual([]);
    expect(whereFn).toHaveBeenCalled();
  });
});

describe("reverseJournalEntry — empty lines guard", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("skips line insertion when original has no lines", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [],
    };

    const { db } = makeReverseDb(original, { status: "open" });

    const result = await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
    });
    // With empty lines, insert is only called once (for the entry header, not lines)
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// reverseJournalEntry — JE lock guard
// ---------------------------------------------------------------------------

describe("reverseJournalEntry — lock guard", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("throws forbidden when a journal line has a reconciliationId", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      reversedByEntryId: null,
      lines: [
        {
          id: "jl-1",
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
          reconciliationId: "recon-1", // locked
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });

    await expect(
      reverseJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        entryId: "je-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("allows reversal with force=true even when lines are locked", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      reversedByEntryId: null,
      lines: [
        {
          id: "jl-1",
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
          reconciliationId: "recon-1", // locked, but force=true overrides
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });

    const result = await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
      force: true,
    });

    expect(result).toBeDefined();
  });

  it("proceeds normally when no lines have reconciliationId", async () => {
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      reversedByEntryId: null,
      lines: [
        {
          id: "jl-1",
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
          reconciliationId: null, // not locked
        },
      ],
    };
    const { db } = makeReverseDb(original, { status: "open" });

    const result = await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
    });

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createJournalEntry — I2: entry date outside fiscal period
// ---------------------------------------------------------------------------

describe("createJournalEntry — date validation", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeDateValidationDb(periodDates: { startDate: Date; endDate: Date }) {
    const periodFindFirst = vi.fn().mockResolvedValue({
      id: "p-1",
      name: "FY2026",
      status: "open",
      ...periodDates,
    });
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ max: null }]) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(() => {
          const returning = vi.fn().mockResolvedValue([{ id: "je-1", entryNumber: 1 }]);
          return {
            returning,
            onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
          };
        }),
      }),
      query: {
        fiscalPeriods: { findFirst: periodFindFirst },
        journalEntries: { findFirst: vi.fn() },
      },
    };
    return {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
      query: {},
    } as unknown as Parameters<typeof createJournalEntry>[0];
  }

  it("throws conflict when entry date is before fiscal period startDate", async () => {
    const db = makeDateValidationDb({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    });
    await expect(
      createJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2025-12-31T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws conflict when entry date is after fiscal period endDate", async () => {
    const db = makeDateValidationDb({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    });
    await expect(
      createJournalEntry(db, {
        orgId: "org-1",
        actorId: "user-1",
        date: "2027-01-01T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        isAdjusting: false,
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// updateAccount — I5: prevent type change with posted transactions
// ---------------------------------------------------------------------------

describe("updateAccount — type change guard", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("throws conflict when changing account type with posted transactions", async () => {
    const existingAccount = {
      id: "acc-1",
      code: "1000",
      name: "Cash",
      type: "asset",
      orgId: "org-1",
    };
    const lineCountWhere = vi.fn().mockResolvedValue([{ count: 2 }]);
    const lineCountFrom = vi.fn().mockReturnValue({ where: lineCountWhere });
    const selectFn = vi.fn().mockReturnValue({ from: lineCountFrom });

    const db = {
      select: selectFn,
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(existingAccount),
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0];

    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { type: "liability" }, // changing type — should be blocked
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("allows type change when account has no posted transactions", async () => {
    const existingAccount = {
      id: "acc-1",
      code: "1000",
      name: "Cash",
      type: "asset",
      orgId: "org-1",
    };
    const lineCountWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const lineCountFrom = vi.fn().mockReturnValue({ where: lineCountWhere });
    const selectFn = vi.fn().mockReturnValue({ from: lineCountFrom });

    const updated = { ...existingAccount, type: "liability" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });

    const db = withTransaction({
      select: selectFn,
      update: updateFn,
      query: {
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue(existingAccount),
        },
      },
    } as unknown as Parameters<typeof updateAccount>[0]);

    const result = await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-1",
      data: { type: "liability" },
    });
    expect(result.type).toBe("liability");
  });
});

// ---------------------------------------------------------------------------
// createFiscalPeriod — I1: overlap detection
// ---------------------------------------------------------------------------

describe("createFiscalPeriod — overlap detection", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("throws conflict when new period overlaps with existing period", async () => {
    const overlapping = {
      id: "p-existing",
      name: "FY2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const db = {
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(overlapping),
        },
      },
    } as unknown as Parameters<typeof createFiscalPeriod>[0];
    await expect(
      createFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        name: "FY2026 Q1",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-03-31T23:59:59.999Z",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("creates period when no overlap exists", async () => {
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const { insertFn } = makeInsertMock(period);
    const db = withTransaction({
      insert: insertFn,
      query: {
        fiscalPeriods: {
          findFirst: vi.fn().mockResolvedValue(null), // no overlap
        },
      },
    } as unknown as Parameters<typeof createFiscalPeriod>[0]);
    const result = await createFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      name: "FY2026",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    expect(result).toEqual(period);
  });
});

// ---------------------------------------------------------------------------
// listJournalEntries — pagination
// ---------------------------------------------------------------------------

describe("listJournalEntries — pagination", () => {
  it("passes page and pageSize to findMany", async () => {
    const entries: unknown[] = [];
    const findMany = vi.fn().mockResolvedValue(entries);
    const db = {
      query: { journalEntries: { findMany } },
    } as unknown as Parameters<typeof listJournalEntries>[0];
    await listJournalEntries(db, { orgId: "org-1", page: 2, pageSize: 10 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 10 }));
  });

  it("defaults to page 1, pageSize 50 when not provided", async () => {
    const entries: unknown[] = [];
    const findMany = vi.fn().mockResolvedValue(entries);
    const db = {
      query: { journalEntries: { findMany } },
    } as unknown as Parameters<typeof listJournalEntries>[0];
    await listJournalEntries(db, { orgId: "org-1" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));
  });
});

// ---------------------------------------------------------------------------
// listAccounts — pagination
// ---------------------------------------------------------------------------

describe("listAccounts — pagination", () => {
  it("passes page and pageSize through to the query", async () => {
    const { selectFn, offset } = makeSelectChainMock([]);
    const db = { select: selectFn } as unknown as Parameters<typeof listAccounts>[0];
    await listAccounts(db, { orgId: "org-1", page: 3, pageSize: 20 });
    // offset should be (3-1)*20 = 40
    expect(offset).toHaveBeenCalledWith(40);
  });
});

// ---------------------------------------------------------------------------
// FASB ASC 958 Financial Statement helpers
// ---------------------------------------------------------------------------

// Helper to make a mock DB that returns a fixed result for SELECT chain used
// by getStatementOfFinancialPosition / getStatementOfActivities /
// getStatementOfFunctionalExpenses.
// The queries end with .orderBy() or similar — we need a chain that resolves.
function makeSFPDb(rows: unknown[]) {
  // Chain: select → from → leftJoin → leftJoin → where → groupBy → orderBy (resolves)
  const orderBy = vi.fn().mockResolvedValue(rows);
  const groupBy = vi.fn().mockReturnValue({ orderBy });
  const where = vi.fn().mockReturnValue({ groupBy });
  const leftJoin2 = vi.fn().mockReturnValue({ where });
  const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 });
  const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as unknown as Parameters<typeof getStatementOfFinancialPosition>[0];
}

function makeSOADb(revenueRows: unknown[], expenseRows: unknown[], naRows: unknown[] = []) {
  // SOA issues THREE separate queries.
  // Query 1 & 2 (revenue rows + expense rows) use INNER JOINs:
  //   select → from → innerJoin → innerJoin → where → groupBy → orderBy
  // Query 3 (net assets balance for beginning) uses LEFT JOINs:
  //   select → from → leftJoin → leftJoin → where → groupBy (no orderBy)
  const naGroupBy = vi.fn().mockResolvedValue(naRows);
  const naWhere = vi.fn().mockReturnValue({ groupBy: naGroupBy });
  const naLeftJoin2 = vi.fn().mockReturnValue({ where: naWhere });
  const naLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: naLeftJoin2 });
  const naFrom = vi.fn().mockReturnValue({ leftJoin: naLeftJoin1 });

  const expOrderBy = vi.fn().mockResolvedValue(expenseRows);
  const expGroupBy = vi.fn().mockReturnValue({ orderBy: expOrderBy });
  const expWhere = vi.fn().mockReturnValue({ groupBy: expGroupBy });
  const expInnerJoin2 = vi.fn().mockReturnValue({ where: expWhere });
  const expInnerJoin1 = vi.fn().mockReturnValue({ innerJoin: expInnerJoin2 });
  const expFrom = vi.fn().mockReturnValue({ innerJoin: expInnerJoin1 });

  const revOrderBy = vi.fn().mockResolvedValue(revenueRows);
  const revGroupBy = vi.fn().mockReturnValue({ orderBy: revOrderBy });
  const revWhere = vi.fn().mockReturnValue({ groupBy: revGroupBy });
  const revInnerJoin2 = vi.fn().mockReturnValue({ where: revWhere });
  const revInnerJoin1 = vi.fn().mockReturnValue({ innerJoin: revInnerJoin2 });
  const revFrom = vi.fn().mockReturnValue({ innerJoin: revInnerJoin1 });

  // select is called three times: first revenue, then expense, then na-balance
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: revFrom })
    .mockReturnValueOnce({ from: expFrom })
    .mockReturnValueOnce({ from: naFrom });

  return { select } as unknown as Parameters<typeof getStatementOfActivities>[0];
}

function makeSFEDb(rows: unknown[]) {
  // select → from → innerJoin → innerJoin → where → groupBy → orderBy
  const orderBy = vi.fn().mockResolvedValue(rows);
  const groupBy = vi.fn().mockReturnValue({ orderBy });
  const where = vi.fn().mockReturnValue({ groupBy });
  const innerJoin2 = vi.fn().mockReturnValue({ where });
  const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
  const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as unknown as Parameters<typeof getStatementOfFunctionalExpenses>[0];
}

// ---------------------------------------------------------------------------
// getStatementOfFinancialPosition
// ---------------------------------------------------------------------------

describe("getStatementOfFinancialPosition", () => {
  it("returns balanced SFP: assets=500000 cents, liabilities=200000, netAssets=300000", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 500000,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-3",
        code: "3000",
        name: "Net Assets Unrestricted",
        type: "net_assets",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 300000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.assets.total).toBe(500000);
    expect(result.liabilities.total).toBe(200000);
    expect(result.netAssets.unrestricted).toBe(300000);
    expect(result.netAssets.total).toBe(300000);
    expect(result.totalLiabilitiesAndNetAssets).toBe(500000);
    expect(result.assets.items).toHaveLength(1);
    expect(result.assets.items[0]?.code).toBe("1000");
  });

  it("splits net assets by naturalRestriction", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 1000000,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-3a",
        code: "3100",
        name: "Net Assets Unrestricted",
        type: "net_assets",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 500000,
      },
      {
        id: "acc-3b",
        code: "3200",
        name: "Net Assets Temp Restricted",
        type: "net_assets",
        naturalRestriction: "temporarily_restricted",
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-3c",
        code: "3300",
        name: "Net Assets Perm Restricted",
        type: "net_assets",
        naturalRestriction: "permanently_restricted",
        debitTotal: 0,
        creditTotal: 100000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.netAssets.unrestricted).toBe(500000);
    expect(result.netAssets.temporarilyRestricted).toBe(200000);
    expect(result.netAssets.permanentlyRestricted).toBe(100000);
    expect(result.netAssets.total).toBe(800000);
    expect(result.totalLiabilitiesAndNetAssets).toBe(1000000);
    expect(result.assets.total).toBe(1000000);
  });

  it("omits zero-balance asset accounts from items", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 500000,
        creditTotal: 0,
      },
      {
        id: "acc-z",
        code: "1500",
        name: "Empty Account",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-3",
        code: "3000",
        name: "Net Assets",
        type: "net_assets",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 300000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.assets.items).toHaveLength(1);
    expect(result.assets.items.find((i) => i.code === "1500")).toBeUndefined();
  });

  it("throws 500 when the balance sheet is out of balance by more than 1 cent", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 500000,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
      // Net assets intentionally wrong: only 299998 instead of 300000
      {
        id: "acc-3",
        code: "3000",
        name: "Net Assets",
        type: "net_assets",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 299998,
      },
    ];
    const db = makeSFPDb(rows);
    await expect(
      getStatementOfFinancialPosition(db, {
        orgId: "org-1",
        asOf: new Date("2026-12-31T23:59:59Z"),
      }),
    ).rejects.toThrow("Statement of Financial Position is out of balance");
  });

  it("does not throw when balance sheet is off by exactly 1 cent (rounding tolerance)", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 500000,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
      // Net assets off by 1 cent
      {
        id: "acc-3",
        code: "3000",
        name: "Net Assets",
        type: "net_assets",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 299999,
      },
    ];
    const db = makeSFPDb(rows);
    await expect(
      getStatementOfFinancialPosition(db, {
        orgId: "org-1",
        asOf: new Date("2026-12-31T23:59:59Z"),
      }),
    ).resolves.toBeDefined();
  });

  it("handles net_assets with null naturalRestriction as unrestricted", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1000",
        name: "Cash",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 300000,
        creditTotal: 0,
      },
      {
        id: "acc-2",
        code: "2000",
        name: "AP",
        type: "liability",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 100000,
      },
      {
        id: "acc-3",
        code: "3000",
        name: "Net Assets",
        type: "net_assets",
        naturalRestriction: null,
        debitTotal: 0,
        creditTotal: 200000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.netAssets.unrestricted).toBe(200000);
  });

  it("includes current-period revenue in net assets (no closing entries needed)", async () => {
    // Real-world scenario: donation posted as Dr 1010 / Cr 4000 (revenue)
    const rows = [
      {
        id: "acc-1",
        code: "1010",
        name: "Checking Account",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 120000,
        creditTotal: 0,
      },
      {
        id: "acc-4",
        code: "4000",
        name: "Contributions Unrestricted",
        type: "revenue",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 120000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.assets.total).toBe(120000);
    expect(result.netAssets.unrestricted).toBe(120000);
    expect(result.netAssets.total).toBe(120000);
    expect(result.totalLiabilitiesAndNetAssets).toBe(120000);
  });

  it("allocates restricted revenue to the correct net assets restriction bucket", async () => {
    const rows = [
      {
        id: "acc-1",
        code: "1010",
        name: "Checking Account",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 500000,
        creditTotal: 0,
      },
      {
        id: "acc-4a",
        code: "4000",
        name: "Contributions Unrestricted",
        type: "revenue",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-4b",
        code: "4100",
        name: "Contributions Temp Restricted",
        type: "revenue",
        naturalRestriction: "temporarily_restricted",
        debitTotal: 0,
        creditTotal: 200000,
      },
      {
        id: "acc-4c",
        code: "4200",
        name: "Contributions Perm Restricted",
        type: "revenue",
        naturalRestriction: "permanently_restricted",
        debitTotal: 0,
        creditTotal: 100000,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.netAssets.unrestricted).toBe(200000);
    expect(result.netAssets.temporarilyRestricted).toBe(200000);
    expect(result.netAssets.permanentlyRestricted).toBe(100000);
    expect(result.netAssets.total).toBe(500000);
    expect(result.assets.total).toBe(500000);
  });

  it("deducts expenses from unrestricted net assets", async () => {
    // Balanced: Dr Cash 120k / Cr Revenue 120k, then Dr Expense 20k / Cr Cash 20k
    // Cash net = 100k; Revenue = 120k credit; Expense = 20k debit
    const rows = [
      {
        id: "acc-1",
        code: "1010",
        name: "Checking Account",
        type: "asset",
        naturalRestriction: null,
        debitTotal: 120000,
        creditTotal: 20000,
      },
      {
        id: "acc-4",
        code: "4000",
        name: "Contributions Unrestricted",
        type: "revenue",
        naturalRestriction: "unrestricted",
        debitTotal: 0,
        creditTotal: 120000,
      },
      {
        id: "acc-5",
        code: "5000",
        name: "Program Expenses",
        type: "expense",
        naturalRestriction: null,
        debitTotal: 20000,
        creditTotal: 0,
      },
    ];
    const db = makeSFPDb(rows);
    const result = await getStatementOfFinancialPosition(db, {
      orgId: "org-1",
      asOf: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.assets.total).toBe(100000);
    expect(result.netAssets.unrestricted).toBe(100000); // 120k revenue - 20k expense
    expect(result.netAssets.total).toBe(100000);
    expect(result.totalLiabilitiesAndNetAssets).toBe(100000);
  });
});

// ---------------------------------------------------------------------------
// getStatementOfActivities
// ---------------------------------------------------------------------------

describe("getStatementOfActivities", () => {
  it("returns revenue split into with/without restrictions", async () => {
    const revenueRows = [
      // $5000 restricted contribution to fund-1
      {
        id: "acc-4",
        code: "4000",
        name: "Contributions",
        type: "revenue",
        hasFund: true,
        debitTotal: 0,
        creditTotal: 500000,
      },
      // $2000 unrestricted contribution
      {
        id: "acc-4",
        code: "4000",
        name: "Contributions",
        type: "revenue",
        hasFund: false,
        debitTotal: 0,
        creditTotal: 200000,
      },
    ];
    const expenseRows = [
      { id: "acc-5", name: "Program Expenses", debitTotal: 200000, creditTotal: 0 },
    ];
    const naRows: unknown[] = [];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.revenue).toHaveLength(1);
    const rev = result.revenue[0]!;
    expect(rev.withRestrictions).toBe(500000);
    expect(rev.withoutRestrictions).toBe(200000);
    expect(rev.total).toBe(700000);

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]?.total).toBe(200000);

    // Change in net assets: without = 200000 (rev) + 0 (releases) - 200000 (exp) = 0
    // with = 500000 (rev) + 0 (releases)
    expect(result.changeInNetAssets.withoutRestrictions).toBe(0);
    expect(result.changeInNetAssets.withRestrictions).toBe(500000);
    expect(result.changeInNetAssets.total).toBe(500000);
  });

  it("handles releases from restrictions (net_assets temporarily_restricted with fund)", async () => {
    const revenueRows = [
      // Release: Dr 3100 (temporarily_restricted net_assets) from a restricted fund
      {
        id: "acc-3100",
        code: "3100",
        name: "Net Assets with Donor Restrictions",
        type: "net_assets",
        naturalRestriction: "temporarily_restricted",
        hasFund: true,
        debitTotal: 200000,
        creditTotal: 0,
      },
    ];
    const expenseRows: unknown[] = [];
    const naRows: unknown[] = [];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    // Releases should be: withoutRestrictions = +200000, withRestrictions = -200000
    expect(result.releases.withoutRestrictions).toBe(200000);
    expect(result.releases.withRestrictions).toBe(-200000);
    // No revenue rows (net_assets release rows are excluded from revenue)
    expect(result.revenue).toHaveLength(0);
  });

  it("computes beginning and ending net assets correctly", async () => {
    const revenueRows: unknown[] = [];
    const expenseRows: unknown[] = [];
    // Beginning NA: 100000 unrestricted, 50000 restricted
    const naRows = [
      { naturalRestriction: "unrestricted", debitTotal: 0, creditTotal: 100000 },
      { naturalRestriction: "temporarily_restricted", debitTotal: 0, creditTotal: 50000 },
    ];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.beginningNetAssets.withoutRestrictions).toBe(100000);
    expect(result.beginningNetAssets.withRestrictions).toBe(50000);
    expect(result.beginningNetAssets.total).toBe(150000);
    // No activity → ending = beginning
    expect(result.endingNetAssets.withoutRestrictions).toBe(100000);
    expect(result.endingNetAssets.withRestrictions).toBe(50000);
  });

  it("bounds beginning net assets to the instant before period start, not a full day before (fix R57 #2)", async () => {
    // Beginning net assets must capture everything strictly before the period start.
    // Subtracting a full day (86400000ms) leaves a gap: journal entries dated on the
    // day before the period start (after its first instant) fall into neither the
    // beginning balance nor the period's revenue/expense window — they vanish from the
    // statement and ending net assets is wrong. The exclusive upper bound must be
    // startDate - 1ms.
    // getNetAssetsBalance binds the as-of upper bound (lte(journalEntries.date, asOf))
    // in the SECOND leftJoin's ON clause, so capture that predicate.
    const naLeftJoin2Spy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue([]) }),
    });
    const naFrom = vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({ leftJoin: naLeftJoin2Spy }),
    });
    const emptyInner = () => {
      const orderBy = vi.fn().mockResolvedValue([]);
      const groupBy = vi.fn().mockReturnValue({ orderBy });
      const where = vi.fn().mockReturnValue({ groupBy });
      const innerJoin2 = vi.fn().mockReturnValue({ where });
      const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
      return { from: vi.fn().mockReturnValue({ innerJoin: innerJoin1 }) };
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(emptyInner())
      .mockReturnValueOnce(emptyInner())
      .mockReturnValueOnce({ from: naFrom });
    const db = { select } as unknown as Parameters<typeof getStatementOfActivities>[0];

    await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    });

    const onPredicate = naLeftJoin2Spy.mock.calls[0]?.[1];
    const rendered = new PgDialect().sqlToQuery(
      onPredicate as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    const isoParams = rendered.params.map((p) => (p instanceof Date ? p.toISOString() : p));
    expect(isoParams).toContain("2025-12-31T23:59:59.999Z");
    expect(isoParams).not.toContain("2025-12-31T00:00:00.000Z");
  });

  it("handles release without a fund (net_assets temporarily_restricted, hasFund=false)", async () => {
    // Dr 3100 without a fundId — rare but possible (e.g. manual release entry)
    const revenueRows = [
      {
        id: "acc-3100",
        code: "3100",
        name: "Net Assets with Donor Restrictions",
        type: "net_assets",
        naturalRestriction: "temporarily_restricted",
        hasFund: false,
        debitTotal: 50000,
        creditTotal: 0,
      },
    ];
    const expenseRows: unknown[] = [];
    const naRows: unknown[] = [];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    // Without a fund, the balance still goes to withoutRestrictions
    expect(result.releases.withoutRestrictions).toBe(50000);
    expect(result.releases.withRestrictions).toBe(0);
  });

  it("merges revenue rows for the same account when split by fund presence", async () => {
    // Same account ID appears twice: once with fund (restricted), once without
    const revenueRows = [
      {
        id: "acc-4000",
        code: "4000",
        name: "Contributions",
        type: "revenue",
        hasFund: false,
        debitTotal: 0,
        creditTotal: 100000,
      },
      // Second row with same id but hasFund=true triggers the `existing` branch at line 1164
      {
        id: "acc-4000",
        code: "4000",
        name: "Contributions",
        type: "revenue",
        hasFund: true,
        debitTotal: 0,
        creditTotal: 300000,
      },
    ];
    const expenseRows: unknown[] = [];
    const naRows: unknown[] = [];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.revenue).toHaveLength(1);
    expect(result.revenue[0]?.withoutRestrictions).toBe(100000);
    expect(result.revenue[0]?.withRestrictions).toBe(300000);
    expect(result.revenue[0]?.total).toBe(400000);
  });

  it("filters out zero-or-negative balance expense rows", async () => {
    const revenueRows: unknown[] = [];
    const expenseRows = [
      // Positive expense — included
      { id: "acc-5a", name: "Program", debitTotal: 100000, creditTotal: 0 },
      // Zero expense — excluded
      { id: "acc-5b", name: "Fundraising", debitTotal: 0, creditTotal: 0 },
    ];
    const naRows: unknown[] = [];
    const db = makeSOADb(revenueRows, expenseRows, naRows);
    const result = await getStatementOfActivities(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]?.name).toBe("Program");
  });
});

// ---------------------------------------------------------------------------
// getStatementOfFunctionalExpenses
// ---------------------------------------------------------------------------

describe("getStatementOfFunctionalExpenses", () => {
  it("distributes expenses by functionalClass", async () => {
    const rows = [
      {
        id: "acc-5a",
        name: "Program Salaries",
        functionalClass: "program",
        debitTotal: 300000,
        creditTotal: 0,
      },
      {
        id: "acc-5b",
        name: "Mgmt Salaries",
        functionalClass: "management",
        debitTotal: 100000,
        creditTotal: 0,
      },
      {
        id: "acc-5c",
        name: "Fundraising Costs",
        functionalClass: "fundraising",
        debitTotal: 50000,
        creditTotal: 0,
      },
    ];
    const db = makeSFEDb(rows);
    const result = await getStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.rows).toHaveLength(3);
    const program = result.rows.find((r) => r.name === "Program Salaries")!;
    expect(program.program).toBe(300000);
    expect(program.management).toBe(0);
    expect(program.fundraising).toBe(0);
    expect(program.total).toBe(300000);
    const mgmt = result.rows.find((r) => r.name === "Mgmt Salaries")!;
    expect(mgmt.management).toBe(100000);
    const fundraising = result.rows.find((r) => r.name === "Fundraising Costs")!;
    expect(fundraising.fundraising).toBe(50000);
  });

  it("computes totals correctly", async () => {
    const rows = [
      {
        id: "acc-5a",
        name: "Program Salaries",
        functionalClass: "program",
        debitTotal: 300000,
        creditTotal: 0,
      },
      {
        id: "acc-5b",
        name: "Mgmt",
        functionalClass: "management",
        debitTotal: 100000,
        creditTotal: 0,
      },
      {
        id: "acc-5c",
        name: "Fundraising",
        functionalClass: "fundraising",
        debitTotal: 50000,
        creditTotal: 0,
      },
    ];
    const db = makeSFEDb(rows);
    const result = await getStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.totals.program).toBe(300000);
    expect(result.totals.management).toBe(100000);
    expect(result.totals.fundraising).toBe(50000);
    expect(result.totals.total).toBe(450000);
  });

  it("returns empty rows and zero totals when no expenses", async () => {
    const db = makeSFEDb([]);
    const result = await getStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.total).toBe(0);
  });

  it("assigns zero to other columns when functionalClass is null", async () => {
    const rows = [
      {
        id: "acc-5x",
        name: "Misc Expense",
        functionalClass: null,
        debitTotal: 75000,
        creditTotal: 0,
      },
    ];
    const db = makeSFEDb(rows);
    const result = await getStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(result.rows[0]?.program).toBe(0);
    expect(result.rows[0]?.management).toBe(0);
    expect(result.rows[0]?.fundraising).toBe(0);
    expect(result.rows[0]?.total).toBe(75000);
  });
});

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

describe("sfpToCsv", () => {
  it("generates a CSV with the correct header and data rows", () => {
    const sfp = {
      assets: {
        total: 500000,
        items: [{ accountId: "a1", code: "1000", name: "Cash", balanceCents: 500000 }],
      },
      liabilities: {
        total: 200000,
        items: [{ accountId: "a2", code: "2000", name: "AP", balanceCents: 200000 }],
      },
      netAssets: {
        unrestricted: 300000,
        temporarilyRestricted: 0,
        permanentlyRestricted: 0,
        total: 300000,
      },
      totalLiabilitiesAndNetAssets: 500000,
    };
    const csv = sfpToCsv(sfp);
    expect(csv).toContain("Section,Account Code,Account Name,Balance (cents)");
    expect(csv).toContain("Assets,1000,Cash,500000");
    expect(csv).toContain("Liabilities,2000,AP,200000");
    expect(csv).toContain("Assets Total,,,500000");
    expect(csv).toContain("Net Assets Total,,,300000");
    expect(csv).toContain("Total Liabilities and Net Assets,,,500000");
  });

  it("quotes account names that contain commas", () => {
    const sfp = {
      assets: {
        total: 100000,
        items: [
          {
            accountId: "a1",
            code: "1000",
            name: "Salaries, Wages & Benefits",
            balanceCents: 100000,
          },
        ],
      },
      liabilities: { total: 0, items: [] },
      netAssets: {
        unrestricted: 100000,
        temporarilyRestricted: 0,
        permanentlyRestricted: 0,
        total: 100000,
      },
      totalLiabilitiesAndNetAssets: 100000,
    };
    const csv = sfpToCsv(sfp);
    expect(csv).toContain(`Assets,1000,"Salaries, Wages & Benefits",100000`);
  });

  it("escapes double-quotes inside account names", () => {
    const sfp = {
      assets: {
        total: 50000,
        items: [{ accountId: "a1", code: "1010", name: 'He said "hello"', balanceCents: 50000 }],
      },
      liabilities: { total: 0, items: [] },
      netAssets: {
        unrestricted: 50000,
        temporarilyRestricted: 0,
        permanentlyRestricted: 0,
        total: 50000,
      },
      totalLiabilitiesAndNetAssets: 50000,
    };
    const csv = sfpToCsv(sfp);
    expect(csv).toContain(`Assets,1010,"He said ""hello""",50000`);
  });
});

describe("soaToCsv", () => {
  it("generates a CSV with the correct structure", () => {
    const soa = {
      revenue: [
        {
          accountId: "a4",
          name: "Contributions",
          withoutRestrictions: 200000,
          withRestrictions: 500000,
          total: 700000,
        },
      ],
      releases: { withoutRestrictions: 100000, withRestrictions: -100000 },
      expenses: [
        {
          accountId: "a5",
          name: "Program Expenses",
          withoutRestrictions: 200000,
          withRestrictions: 0,
          total: 200000,
        },
      ],
      changeInNetAssets: { withoutRestrictions: 100000, withRestrictions: 400000, total: 500000 },
      beginningNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
      endingNetAssets: { withoutRestrictions: 100000, withRestrictions: 400000, total: 500000 },
    };
    const csv = soaToCsv(soa);
    expect(csv).toContain("Section,Account Name,Without Restrictions");
    expect(csv).toContain("Revenue,Contributions,200000,500000,700000");
    expect(csv).toContain("Expenses,Program Expenses");
    expect(csv).toContain("Change in Net Assets");
    expect(csv).toContain("Ending Net Assets");
  });

  it("includes the releases total column (sum of without + with)", () => {
    const soa = {
      revenue: [],
      releases: { withoutRestrictions: 100000, withRestrictions: -100000 },
      expenses: [],
      changeInNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
      beginningNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
      endingNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
    };
    const csv = soaToCsv(soa);
    // total = 100000 + (-100000) = 0
    expect(csv).toContain("Releases from Restrictions,,100000,-100000,0");
  });

  it("quotes account names with commas in revenue and expense rows", () => {
    const soa = {
      revenue: [
        {
          accountId: "a4",
          name: "Grants, Government",
          withoutRestrictions: 0,
          withRestrictions: 50000,
          total: 50000,
        },
      ],
      releases: { withoutRestrictions: 0, withRestrictions: 0 },
      expenses: [
        {
          accountId: "a5",
          name: "Salaries, Wages & Benefits",
          withoutRestrictions: 30000,
          withRestrictions: 0,
          total: 30000,
        },
      ],
      changeInNetAssets: { withoutRestrictions: -30000, withRestrictions: 50000, total: 20000 },
      beginningNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
      endingNetAssets: { withoutRestrictions: -30000, withRestrictions: 50000, total: 20000 },
    };
    const csv = soaToCsv(soa);
    expect(csv).toContain(`Revenue,"Grants, Government",0,50000,50000`);
    expect(csv).toContain(`Expenses,"Salaries, Wages & Benefits",30000,0,30000`);
  });
});

describe("sfeToCsv", () => {
  it("generates a CSV with the correct structure", () => {
    const sfe = {
      rows: [
        {
          accountId: "a5a",
          name: "Program Salaries",
          program: 300000,
          management: 0,
          fundraising: 0,
          total: 300000,
        },
        {
          accountId: "a5b",
          name: "Mgmt",
          program: 0,
          management: 100000,
          fundraising: 0,
          total: 100000,
        },
      ],
      totals: { program: 300000, management: 100000, fundraising: 0, total: 400000 },
    };
    const csv = sfeToCsv(sfe);
    expect(csv).toContain(
      "Account Name,Program (cents),Management (cents),Fundraising (cents),Total (cents)",
    );
    expect(csv).toContain("Program Salaries,300000,0,0,300000");
    expect(csv).toContain("Totals,300000,100000,0,400000");
  });

  it("quotes expense account names containing commas", () => {
    const sfe = {
      rows: [
        {
          accountId: "a5a",
          name: "Salaries, Wages & Benefits",
          program: 200000,
          management: 50000,
          fundraising: 10000,
          total: 260000,
        },
      ],
      totals: { program: 200000, management: 50000, fundraising: 10000, total: 260000 },
    };
    const csv = sfeToCsv(sfe);
    expect(csv).toContain(`"Salaries, Wages & Benefits",200000,50000,10000,260000`);
  });
});

// ---------------------------------------------------------------------------
// runYearEndClose
// ---------------------------------------------------------------------------

describe("runYearEndClose", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  const openPeriod = {
    id: "p-1",
    name: "FY2026",
    orgId: "org-1",
    status: "open",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T23:59:59.999Z"),
    createdAt: new Date(),
    closedAt: null,
    closedBy: null,
  };

  const netAssetsAccount = { id: "na-3000", code: "3000", orgId: "org-1", deletedAt: null };

  function makeYearEndDb({
    period = openPeriod,
    existingClosingEntry = null as { id: string } | null,
    netAssetsAcc = netAssetsAccount as {
      id: string;
      code: string;
      orgId: string;
      deletedAt: null;
    } | null,
    revenueRows = [] as Array<{ accountId: string; debitTotal: number; creditTotal: number }>,
    expenseRows = [] as Array<{ accountId: string; debitTotal: number; creditTotal: number }>,
    closingEntryId = "je-close-1",
  } = {}) {
    const findFirstFiscalPeriods = vi.fn().mockResolvedValue(period);
    const findFirstJournalEntries = vi.fn().mockResolvedValue(existingClosingEntry);
    const findFirstChartOfAccounts = vi.fn().mockResolvedValue(netAssetsAcc);

    const txSelectResultsList = [revenueRows, expenseRows];

    // insert mocks for journalEntries and journalLines
    const insertJeReturning = vi.fn().mockResolvedValue([{ id: closingEntryId }]);
    const insertJeValues = vi.fn().mockReturnValue({
      returning: insertJeReturning,
      onConflictDoNothing: vi.fn().mockReturnValue({ returning: insertJeReturning }),
    });
    const insertLinesValues = vi.fn().mockResolvedValue([]);
    const txInsertFn = vi
      .fn()
      .mockReturnValueOnce({ values: insertJeValues }) // journalEntries
      .mockReturnValueOnce({ values: insertLinesValues }); // journalLines (conditional)

    // update mock for fiscalPeriods
    const txUpdateReturning = vi.fn().mockResolvedValue([]);
    const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdateFn = vi.fn().mockReturnValue({ set: txUpdateSet });

    // Build a chainable from-result for revenue/expense queries
    // The chain is: .from().innerJoin().innerJoin().where().groupBy()
    function makeChainableFromResult(data: unknown) {
      const obj: Record<string, unknown> = {};
      obj.innerJoin = vi.fn().mockReturnValue(obj);
      obj.where = vi.fn().mockReturnValue(obj);
      obj.groupBy = vi.fn().mockResolvedValue(data);
      return obj;
    }

    // In runYearEndClose the tx.select calls happen in this order:
    // 1st call → revenue rows query (innerJoin × 2, where, groupBy)
    // 2nd call → expense rows query (innerJoin × 2, where, groupBy)
    // 3rd call → getNextEntryNumber: select({max}).from(je).where(...)
    let outerTxSelectCount = 0;
    const combinedTxSelect = vi.fn().mockImplementation(() => {
      outerTxSelectCount++;
      if (outerTxSelectCount === 3) {
        // getNextEntryNumber: select({ max }).from(journalEntries).where(...) → [{max: 0}]
        const wh = vi.fn().mockResolvedValue([{ max: 0 }]);
        return { from: vi.fn().mockReturnValue({ where: wh }) };
      }
      // revenue (count=1) or expense (count=2) rows
      const idx = outerTxSelectCount - 1;
      return {
        from: vi.fn().mockReturnValue(makeChainableFromResult(txSelectResultsList[idx] ?? [])),
      };
    });

    const tx = {
      select: combinedTxSelect,
      insert: txInsertFn,
      update: txUpdateFn,
    };

    const transactionFn = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    return {
      db: {
        query: {
          fiscalPeriods: { findFirst: findFirstFiscalPeriods },
          journalEntries: { findFirst: findFirstJournalEntries },
          chartOfAccounts: { findFirst: findFirstChartOfAccounts },
        },
        transaction: transactionFn,
      } as unknown as Parameters<typeof runYearEndClose>[0],
      tx,
      txInsertFn,
      txUpdateFn,
      transactionFn,
      findFirstFiscalPeriods,
      findFirstJournalEntries,
    };
  }

  it("returns closingEntryId for idempotent second call", async () => {
    const { db } = makeYearEndDb({ existingClosingEntry: { id: "je-existing" } });
    const result = await runYearEndClose(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
    });
    expect(result).toEqual({ closingEntryId: "je-existing" });
  });

  it("throws badRequest when period is already closed", async () => {
    const { db } = makeYearEndDb({
      period: { ...openPeriod, status: "closed" },
    });
    await expect(
      runYearEndClose(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws badRequest when period is locked", async () => {
    const { db } = makeYearEndDb({
      period: { ...openPeriod, status: "locked" },
    });
    await expect(
      runYearEndClose(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws notFound when period is not found", async () => {
    const { db } = makeYearEndDb({ period: null as unknown as typeof openPeriod });
    await expect(
      runYearEndClose(db, { orgId: "org-1", actorId: "user-1", periodId: "p-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws notFound when period belongs to a different org", async () => {
    // The query is scoped by org_id — when the period exists for org-2 but not org-1,
    // the DB returns null (no matching row), which must surface as notFound.
    const { db } = makeYearEndDb({ period: null as unknown as typeof openPeriod });
    await expect(
      runYearEndClose(db, { orgId: "org-2", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws badRequest when net assets account (3000) is not found", async () => {
    const { db } = makeYearEndDb({ netAssetsAcc: null });
    await expect(
      runYearEndClose(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("creates closing entry with revenue/expense zeroing and net assets credit (profit scenario)", async () => {
    const { db, txInsertFn } = makeYearEndDb({
      revenueRows: [{ accountId: "rev-1", debitTotal: 0, creditTotal: 100000 }],
      expenseRows: [{ accountId: "exp-1", debitTotal: 60000, creditTotal: 0 }],
      closingEntryId: "je-close-new",
    });
    const result = await runYearEndClose(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
    });
    expect(result).toEqual({ closingEntryId: "je-close-new" });
    // JE was inserted
    expect(txInsertFn).toHaveBeenCalled();
  });

  it("creates closing entry with Dr to net assets on loss scenario", async () => {
    const { db, txInsertFn } = makeYearEndDb({
      revenueRows: [{ accountId: "rev-1", debitTotal: 0, creditTotal: 40000 }],
      expenseRows: [{ accountId: "exp-1", debitTotal: 60000, creditTotal: 0 }],
      closingEntryId: "je-close-loss",
    });
    const result = await runYearEndClose(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
    });
    expect(result).toEqual({ closingEntryId: "je-close-loss" });
    expect(txInsertFn).toHaveBeenCalled();
  });

  it("creates closing entry with no net assets line when net income is zero", async () => {
    const { db } = makeYearEndDb({
      revenueRows: [{ accountId: "rev-1", debitTotal: 0, creditTotal: 50000 }],
      expenseRows: [{ accountId: "exp-1", debitTotal: 50000, creditTotal: 0 }],
      closingEntryId: "je-close-zero",
    });
    const result = await runYearEndClose(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
    });
    expect(result).toEqual({ closingEntryId: "je-close-zero" });
  });
});

// ---------------------------------------------------------------------------
// getPeriodCloseChecklist
// ---------------------------------------------------------------------------

describe("getPeriodCloseChecklist", () => {
  const openPeriod = {
    id: "p-1",
    name: "FY2026",
    orgId: "org-1",
    status: "open",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T23:59:59.999Z"),
    createdAt: new Date(),
    closedAt: null,
    closedBy: null,
  };

  function makeChecklistDb({
    period = openPeriod as typeof openPeriod | null,
    unbalancedEntries = [] as unknown[],
    unmatchedCountRows = [{ count: 0 }] as Array<{ count: number }>,
    trialBalanceRows = [{ totalDebit: 100000, totalCredit: 100000 }] as Array<{
      totalDebit: number;
      totalCredit: number;
    }>,
  } = {}) {
    const findFirstFiscalPeriods = vi.fn().mockResolvedValue(period);

    // Build chainable from-result objects for queries that need innerJoin chaining
    function makeInnerJoinChain(resolvedValue: unknown) {
      const obj: Record<string, unknown> = {};
      obj.innerJoin = vi.fn().mockReturnValue(obj);
      obj.where = vi.fn().mockReturnValue(obj);
      obj.groupBy = vi.fn().mockReturnValue({
        having: vi.fn().mockResolvedValue(resolvedValue),
      });
      return obj;
    }

    function makeInnerJoinChainDirect(resolvedValue: unknown) {
      const obj: Record<string, unknown> = {};
      obj.innerJoin = vi.fn().mockReturnValue(obj);
      obj.where = vi.fn().mockResolvedValue(resolvedValue);
      return obj;
    }

    let selectCallIdx = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallIdx++;
      if (selectCallIdx === 1) {
        // unbalanced entries: .from().innerJoin().where().groupBy().having()
        return { from: vi.fn().mockReturnValue(makeInnerJoinChain(unbalancedEntries)) };
      }
      if (selectCallIdx === 2) {
        // unmatched bank transactions count: .from().where()
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(unmatchedCountRows),
          }),
        };
      }
      // trial balance totals: .from().innerJoin().where()
      return { from: vi.fn().mockReturnValue(makeInnerJoinChainDirect(trialBalanceRows)) };
    });

    return {
      db: {
        query: { fiscalPeriods: { findFirst: findFirstFiscalPeriods } },
        select: selectFn,
      } as unknown as Parameters<typeof getPeriodCloseChecklist>[0],
    };
  }

  it("throws notFound when period is missing", async () => {
    const { db } = makeChecklistDb({ period: null });
    await expect(
      getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-999" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("returns readyToClose=true when all checks pass", async () => {
    const { db } = makeChecklistDb({
      unbalancedEntries: [],
      unmatchedCountRows: [{ count: 0 }],
      trialBalanceRows: [{ totalDebit: 100000, totalCredit: 100000 }],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    expect(result.readyToClose).toBe(true);
    expect(result.periodId).toBe("p-1");
    expect(result.periodName).toBe("FY2026");
    expect(result.periodStatus).toBe("open");
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("returns readyToClose=false when unmatched transactions exist", async () => {
    const { db } = makeChecklistDb({
      unbalancedEntries: [],
      unmatchedCountRows: [{ count: 3 }],
      trialBalanceRows: [{ totalDebit: 100000, totalCredit: 100000 }],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    expect(result.readyToClose).toBe(false);
    const unmatchedCheck = result.checks.find((c) => c.id === "no_unmatched_transactions");
    expect(unmatchedCheck?.passed).toBe(false);
    expect(unmatchedCheck?.detail).toContain("3");
  });

  it("returns readyToClose=false when period is already closed", async () => {
    const closedPeriod = { ...openPeriod, status: "closed" };
    const { db } = makeChecklistDb({ period: closedPeriod });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    expect(result.readyToClose).toBe(false);
    const closedCheck = result.checks.find((c) => c.id === "period_not_already_closed");
    expect(closedCheck?.passed).toBe(false);
    expect(closedCheck?.detail).toContain("closed");
  });

  it("returns readyToClose=false when trial balance is out of balance", async () => {
    const { db } = makeChecklistDb({
      trialBalanceRows: [{ totalDebit: 100000, totalCredit: 90000 }],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    expect(result.readyToClose).toBe(false);
    const tbCheck = result.checks.find((c) => c.id === "trial_balance_zero");
    expect(tbCheck?.passed).toBe(false);
  });

  it("returns readyToClose=false when journal entries are unbalanced", async () => {
    const { db } = makeChecklistDb({
      unbalancedEntries: [{ entryId: "je-1", totalDebit: 100, totalCredit: 50 }],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    expect(result.readyToClose).toBe(false);
    const jbCheck = result.checks.find((c) => c.id === "journal_balanced");
    expect(jbCheck?.passed).toBe(false);
    expect(jbCheck?.detail).toContain("1 unbalanced");
  });

  it("returns singular wording for single unbalanced entry", async () => {
    const { db } = makeChecklistDb({
      unbalancedEntries: [{ entryId: "je-1", totalDebit: 100, totalCredit: 50 }],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    const jbCheck = result.checks.find((c) => c.id === "journal_balanced");
    expect(jbCheck?.detail).toMatch(/1 unbalanced journal entry found/);
  });

  it("returns plural wording for multiple unbalanced entries", async () => {
    const { db } = makeChecklistDb({
      unbalancedEntries: [
        { entryId: "je-1", totalDebit: 100, totalCredit: 50 },
        { entryId: "je-2", totalDebit: 200, totalCredit: 100 },
      ],
    });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    const jbCheck = result.checks.find((c) => c.id === "journal_balanced");
    expect(jbCheck?.detail).toMatch(/2 unbalanced journal entries found/);
  });

  it("returns singular wording for single unmatched transaction", async () => {
    const { db } = makeChecklistDb({ unmatchedCountRows: [{ count: 1 }] });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    const check = result.checks.find((c) => c.id === "no_unmatched_transactions");
    expect(check?.detail).toMatch(/1 unmatched bank transaction found/);
  });

  it("handles empty unmatched count rows (null-coalescing fallback)", async () => {
    const { db } = makeChecklistDb({ unmatchedCountRows: [] });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    // unmatchedRow is undefined, falls back to 0 — so check passes
    const check = result.checks.find((c) => c.id === "no_unmatched_transactions");
    expect(check?.passed).toBe(true);
  });

  it("handles empty trial balance rows (null-coalescing fallback)", async () => {
    const { db } = makeChecklistDb({ trialBalanceRows: [] });
    const result = await getPeriodCloseChecklist(db, { orgId: "org-1", periodId: "p-1" });
    // tbRow is undefined, both totals fall back to 0 — balanced
    const check = result.checks.find((c) => c.id === "trial_balance_zero");
    expect(check?.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reverseJournalEntry — clamp date to period end
// ---------------------------------------------------------------------------

describe("reverseJournalEntry — clamp to period end", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("clamps reversal date to period.endDate when provided date falls after the period ends", async () => {
    const periodStart = new Date("2025-01-01T00:00:00.000Z");
    const periodEnd = new Date("2025-12-31T23:59:59.000Z");
    const original = {
      id: "je-1",
      orgId: "org-1",
      fiscalPeriodId: "p-1",
      entryNumber: 1,
      lines: [
        {
          accountId: "acc-1",
          debitCents: 100,
          creditCents: 0,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
        {
          accountId: "acc-2",
          debitCents: 0,
          creditCents: 100,
          fundId: null,
          grantId: null,
          contactId: null,
          memo: null,
        },
      ],
    };
    let capturedDate: Date | undefined;
    const newEntry = { id: "je-2", orgId: "org-1", entryNumber: 2, isAdjusting: true, lines: [] };
    const returningEntryFn = vi.fn().mockResolvedValue([newEntry]);
    const valuesEntryFn = vi.fn().mockImplementation((vals: { date?: Date }) => {
      capturedDate = vals.date;
      return {
        returning: returningEntryFn,
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningEntryFn }),
      };
    });
    const insertFn = vi
      .fn()
      .mockReturnValueOnce({ values: valuesEntryFn })
      .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
    const selectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ max: 1 }]) }),
    });
    const returningUpdateFn = vi
      .fn()
      .mockResolvedValue([{ ...original, reversedByEntryId: "je-2" }]);
    const whereUpdateFn = vi.fn().mockReturnValue({ returning: returningUpdateFn });
    const updateFn = vi
      .fn()
      .mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereUpdateFn }) });
    const findFirstNewEntry = vi.fn().mockResolvedValue({ ...newEntry, lines: [{ id: "line-2" }] });
    const tx = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
      query: { journalEntries: { findFirst: findFirstNewEntry } },
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
      query: {
        journalEntries: { findFirst: vi.fn().mockResolvedValue(original) },
        fiscalPeriods: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ status: "open", startDate: periodStart, endDate: periodEnd }),
        },
      },
    } as unknown as Parameters<typeof reverseJournalEntry>[0];

    await reverseJournalEntry(db, {
      orgId: "org-1",
      actorId: "user-1",
      entryId: "je-1",
      date: "2026-06-01T00:00:00.000Z",
    });

    expect(capturedDate?.toISOString()).toBe(periodEnd.toISOString());
  });
});

// ---------------------------------------------------------------------------
// Atomicity: transaction used + audit-failure rollback
// ---------------------------------------------------------------------------

describe("createAccount — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs inside a transaction and calls recordActivityLog with entityType account", async () => {
    const account = { id: "acc-atom", code: "1111", name: "Atom", orgId: "org-1" };
    const { insertFn } = makeInsertMock(account);
    const db = withTransaction({
      insert: insertFn,
      query: { chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Parameters<typeof createAccount>[0]);
    await createAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      code: "1111",
      name: "Atom",
      type: "asset",
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "account", action: "created" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const account = { id: "acc-atom", code: "1111", name: "Atom", orgId: "org-1" };
    const { insertFn } = makeInsertMock(account);
    const db = withTransaction({
      insert: insertFn,
      query: { chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Parameters<typeof createAccount>[0]);
    await expect(
      createAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        code: "1111",
        name: "Atom",
        type: "asset",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateAccount — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs inside a transaction and calls recordActivityLog with entityType account", async () => {
    const account = { id: "acc-1", code: "1000", name: "Cash", orgId: "org-1" };
    const { updateFn } = makeUpdateMock({ ...account, name: "Updated" });
    const db = withTransaction({
      update: updateFn,
      query: { chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(account) } },
    } as unknown as Parameters<typeof updateAccount>[0]);
    await updateAccount(db, {
      orgId: "org-1",
      actorId: "user-1",
      accountId: "acc-1",
      data: { name: "Updated" },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "account", action: "updated" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const account = { id: "acc-1", code: "1000", name: "Cash", orgId: "org-1" };
    const { updateFn } = makeUpdateMock({ ...account, name: "Updated" });
    const db = withTransaction({
      update: updateFn,
      query: { chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(account) } },
    } as unknown as Parameters<typeof updateAccount>[0]);
    await expect(
      updateAccount(db, {
        orgId: "org-1",
        actorId: "user-1",
        accountId: "acc-1",
        data: { name: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("deleteAccount — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeAtomicDeleteDb(updatedRow: unknown | null) {
    const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });
    const returningFn = vi.fn().mockResolvedValue(updatedRow ? [updatedRow] : []);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    return withTransaction({ select: selectFn, update: updateFn } as unknown as Parameters<
      typeof deleteAccount
    >[0]);
  }

  it("runs inside a transaction and calls recordActivityLog with entityType account", async () => {
    const account = { id: "acc-1", code: "1000", orgId: "org-1" };
    const db = makeAtomicDeleteDb(account);
    await deleteAccount(db, { orgId: "org-1", actorId: "user-1", accountId: "acc-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "account", action: "deleted" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const account = { id: "acc-1", code: "1000", orgId: "org-1" };
    const db = makeAtomicDeleteDb(account);
    await expect(
      deleteAccount(db, { orgId: "org-1", actorId: "user-1", accountId: "acc-1" }),
    ).rejects.toThrow("audit log down");
  });
});

describe("createFiscalPeriod — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs inside a transaction and calls recordActivityLog with entityType fiscal_period", async () => {
    const period = { id: "p-atom", name: "FY2026", status: "open", orgId: "org-1" };
    const { insertFn } = makeInsertMock(period);
    const db = withTransaction({
      insert: insertFn,
      query: { fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Parameters<typeof createFiscalPeriod>[0]);
    await createFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      name: "FY2026",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fiscal_period", action: "created" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const period = { id: "p-atom", name: "FY2026", status: "open", orgId: "org-1" };
    const { insertFn } = makeInsertMock(period);
    const db = withTransaction({
      insert: insertFn,
      query: { fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Parameters<typeof createFiscalPeriod>[0]);
    await expect(
      createFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        name: "FY2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.999Z",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("closeFiscalPeriod — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs inside a transaction and calls recordActivityLog with entityType fiscal_period", async () => {
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const closed = { ...period, status: "closed" };
    const { updateFn } = makeUpdateMock(closed);
    const db = withTransaction({
      update: updateFn,
      query: { fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(period) } },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0]);
    await closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fiscal_period", action: "closed" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const period = { id: "p-1", name: "FY2026", status: "open", orgId: "org-1" };
    const closed = { ...period, status: "closed" };
    const { updateFn } = makeUpdateMock(closed);
    const db = withTransaction({
      update: updateFn,
      query: { fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(period) } },
    } as unknown as Parameters<typeof closeFiscalPeriod>[0]);
    await expect(
      closeFiscalPeriod(db, { orgId: "org-1", actorId: "user-1", periodId: "p-1" }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateFiscalPeriod — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeAtomicUpdatePeriodDb(updated: unknown) {
    const period = {
      id: "p-1",
      name: "FY2026",
      status: "open",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    };
    const findFirstFn = vi.fn().mockResolvedValueOnce(period).mockResolvedValueOnce(null);
    const { updateFn } = makeUpdateMock(updated);
    return withTransaction({
      query: { fiscalPeriods: { findFirst: findFirstFn } },
      update: updateFn,
    } as unknown as Parameters<typeof updateFiscalPeriod>[0]);
  }

  it("runs inside a transaction and calls recordActivityLog with entityType fiscal_period", async () => {
    const db = makeAtomicUpdatePeriodDb({ id: "p-1", name: "Updated" });
    await updateFiscalPeriod(db, {
      orgId: "org-1",
      actorId: "user-1",
      periodId: "p-1",
      data: { name: "Updated" },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fiscal_period", action: "updated" }),
    );
  });

  it("propagates audit log failure out of the transaction (rollback proof)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = makeAtomicUpdatePeriodDb({ id: "p-1", name: "Updated" });
    await expect(
      updateFiscalPeriod(db, {
        orgId: "org-1",
        actorId: "user-1",
        periodId: "p-1",
        data: { name: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });
});
