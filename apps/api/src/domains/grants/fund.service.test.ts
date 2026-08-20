import { describe, expect, it, vi } from "vitest";
import { recordActivityLog } from "../../lib/activity-log";
import { postExpense } from "../accounting/postingEngine";
import {
  createExpense,
  createFund,
  deleteExpense,
  deleteFund,
  getFund,
  listFunds,
  updateExpense,
  updateFund,
} from "./fund.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../accounting/postingEngine", () => ({
  postExpense: vi.fn(),
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

describe("listFunds", () => {
  it("returns paginated funds with a summary field", async () => {
    let selectCallIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([{ id: "fund-1" }]),
                  }),
                }),
              }),
            }),
          };
        }
        if (selectCallIndex === 2) {
          return {
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 1 }]) }),
          };
        }
        if (selectCallIndex === 3) {
          // allocations aggregate
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          };
        }
        // expenses aggregate
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue([]) }),
          }),
        };
      }),
    };

    const result = await listFunds(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ id: "fund-1" });
    expect(result.data[0]).toHaveProperty("summary");
  });

  it("returns zero total when count result is undefined", async () => {
    const offset = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ offset });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const countWhere = vi.fn().mockResolvedValue([undefined]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
    const db = { select };

    const result = await listFunds(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(0);
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

      await listFunds(db as never, {
        orgId: "org-1",
        page: 2,
        pageSize: 10,
        search: "reserve",
        type: "unrestricted",
        sortBy,
        sortOrder: "desc",
      });

      expect(offset).toHaveBeenCalledWith(10);
    }
  });

  it("includes entity scope and treats non-numeric aggregate sums as zero", async () => {
    let selectCallIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([{ id: "fund-1" }]),
                  }),
                }),
              }),
            }),
          };
        }
        if (selectCallIndex === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: undefined }]),
            }),
          };
        }
        if (selectCallIndex === 3) {
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue([{ fundId: "fund-1", sum: "not-number" }]),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([{ fundId: "fund-1", sum: "" }]),
            }),
          }),
        };
      }),
    };

    const result = await listFunds(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.total).toBe(0);
    expect(result.data[0]!.summary.allocatedTotalCents).toBe(0);
    expect(result.data[0]!.summary.expenseTotalCents).toBe(0);
  });
});

describe("listFunds summary", () => {
  function makeListDb(
    funds: { id: string }[],
    allocRows: { fundId: string; sum: string }[],
    expRows: { fundId: string; sum: string }[],
  ) {
    let selectCallIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) {
          // main funds query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(funds),
                  }),
                }),
              }),
            }),
          };
        }
        if (selectCallIndex === 2) {
          // count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: funds.length }]),
            }),
          };
        }
        if (selectCallIndex === 3) {
          // allocations aggregate
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue(allocRows),
                }),
              }),
            }),
          };
        }
        // expenses aggregate
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(expRows),
            }),
          }),
        };
      }),
    };
    return db;
  }

  it("attaches summary with currentBalanceCents = allocated minus expenses", async () => {
    const db = makeListDb(
      [{ id: "fund-1" }],
      [{ fundId: "fund-1", sum: "500000" }],
      [{ fundId: "fund-1", sum: "200000" }],
    );

    const result = await listFunds(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.data[0]).toHaveProperty("summary");
    expect(result.data[0]!.summary.currentBalanceCents).toBe(300_000);
    expect(result.data[0]!.summary.allocatedTotalCents).toBe(500_000);
    expect(result.data[0]!.summary.expenseTotalCents).toBe(200_000);
  });

  it("reports currentBalanceCents 0 for a fund with no allocations or expenses", async () => {
    const db = makeListDb([{ id: "fund-empty" }], [], []);

    const result = await listFunds(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.data[0]!.summary.currentBalanceCents).toBe(0);
    expect(result.data[0]!.summary.allocatedTotalCents).toBe(0);
    expect(result.data[0]!.summary.expenseTotalCents).toBe(0);
    expect(result.data[0]!.summary.thresholdState).toBeNull();
  });

  it("skips aggregate queries and returns empty data when no funds match", async () => {
    let selectCallIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) {
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
        // count query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        };
      }),
    };

    const result = await listFunds(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    // Only 2 select calls (funds + count), no aggregate queries
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual([]);
  });
});

describe("getFund", () => {
  it("returns a fund with computed summary", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue({
            id: "fund-1",
            grantAllocations: [{ allocatedAmountCents: 500_000 }],
            expenses: [{ amountCents: 410_000 }],
          }),
        },
      },
    };

    const result = await getFund(db as never, { orgId: "org-1", fundId: "fund-1" });
    expect(result.summary.allocatedTotalCents).toBe(500_000);
    expect(result.summary.expenseTotalCents).toBe(410_000);
    expect(result.summary.currentBalanceCents).toBe(90_000);
    expect(result.summary.thresholdState).toBe("80");
  });

  it("includes allocations with deletedAt=undefined (active-by-default) in summary", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue({
            id: "fund-1",
            grantAllocations: [
              // deletedAt and grant.deletedAt are both undefined (no soft-delete column returned)
              { allocatedAmountCents: 300_000 },
            ],
            expenses: [{ amountCents: 100_000 }],
          }),
        },
      },
    };

    const result = await getFund(db as never, { orgId: "org-1", fundId: "fund-1" });
    expect(result.summary.allocatedTotalCents).toBe(300_000);
    expect(result.summary.expenseTotalCents).toBe(100_000);
  });

  it("ignores soft-deleted child rows when computing a fund summary", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue({
            id: "fund-1",
            grantAllocations: [
              { allocatedAmountCents: 800_000, grant: { deletedAt: null } },
              {
                allocatedAmountCents: 200_000,
                grant: { deletedAt: new Date("2026-03-01T00:00:00Z") },
              },
            ],
            expenses: [
              { amountCents: 700_000, deletedAt: null },
              { amountCents: 300_000, deletedAt: new Date("2026-03-01T00:00:00Z") },
            ],
          }),
        },
      },
    };

    const result = await getFund(db as never, { orgId: "org-1", fundId: "fund-1" });
    expect(result.summary.currentBalanceCents).toBe(100_000);
    expect(result.summary.thresholdState).toBe("80");
  });

  it("ignores allocations with deletedAt when computing fund summary (explicit deletedAt check)", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue({
            id: "fund-1",
            grantAllocations: [
              { allocatedAmountCents: 500_000, deletedAt: null, grant: { deletedAt: null } },
              {
                allocatedAmountCents: 300_000,
                deletedAt: new Date("2026-03-01T00:00:00Z"),
                grant: { deletedAt: null },
              },
            ],
            expenses: [{ amountCents: 200_000, deletedAt: null }],
          }),
        },
      },
    };

    const result = await getFund(db as never, { orgId: "org-1", fundId: "fund-1" });
    expect(result.summary.allocatedTotalCents).toBe(500_000);
    expect(result.summary.expenseTotalCents).toBe(200_000);
    expect(result.summary.currentBalanceCents).toBe(300_000);
  });

  it("throws when the fund does not exist", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(getFund(db as never, { orgId: "org-1", fundId: "missing" })).rejects.toThrow(
      "Fund not found",
    );
  });
});

describe("fund and expense mutations", () => {
  it("creates, updates, and soft deletes funds", async () => {
    const create = makeInsertMock({ id: "fund-1" });
    const update = makeUpdateMock({ id: "fund-1", description: "Updated" });

    expect(
      await createFund(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        name: "General Operations",
        type: "unrestricted",
      }),
    ).toEqual({ id: "fund-1" });

    expect(
      await updateFund(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        fundId: "fund-1",
        data: { description: "Updated" },
      }),
    ).toEqual({ id: "fund-1", description: "Updated" });

    await deleteFund(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      fundId: "fund-1",
    });
  });

  it("uses the organization default entity when creating a fund without explicit entity scope", async () => {
    const create = makeInsertMock({ id: "fund-1", entityId: "entity-default" });
    const db = withTransaction({
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
      },
      insert: create.insertFn,
    });

    await createFund(db as never, {
      orgId: "org-1",
      name: "Default Entity Fund",
      type: "temporarily_restricted",
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-default" }),
    );
  });

  it("creates a grant-only expense with a Date value, explicit entity, and active account", async () => {
    const grantLookup = vi.fn().mockResolvedValue({
      id: "grant-1",
      orgId: "org-1",
      entityId: "entity-1",
    });
    const accountLookup = vi.fn().mockResolvedValue({ id: "account-1" });
    const create = makeInsertMock({ id: "expense-1" });
    const db = {
      query: {
        grants: { findFirst: grantLookup },
        chartOfAccounts: { findFirst: accountLookup },
      },
      transaction: vi.fn(async (callback) => callback({ insert: create.insertFn })),
    };
    const date = "2026-08-01T00:00:00.000Z";

    await createExpense(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
      accountId: "account-1",
      amountCents: 25_000,
      date,
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "entity-1",
        grantId: "grant-1",
        date: new Date(date),
      }),
    );
  });

  it("rejects expense creation when the selected account is not active in the org", async () => {
    const fundLookup = vi.fn().mockResolvedValue({
      id: "fund-1",
      orgId: "org-1",
      entityId: "entity-1",
    });
    const db = {
      query: {
        funds: { findFirst: fundLookup },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      transaction: vi.fn(),
    };

    await expect(
      createExpense(db as never, {
        orgId: "org-1",
        entityId: "entity-1",
        fundId: "fund-1",
        accountId: "missing-account",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Account not found");

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("records fund mutation activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const create = makeInsertMock({
      id: "fund-1",
      name: "General Operations",
      type: "unrestricted",
    });
    const update = makeUpdateMock({ id: "fund-1", description: "Updated" });
    const db = withTransaction({
      insert: create.insertFn,
      update: update.updateFn,
    });

    await createFund(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      name: "General Operations",
      type: "unrestricted",
    });
    await updateFund(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      fundId: "fund-1",
      data: { description: "Updated" },
    });
    await deleteFund(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      fundId: "fund-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fund" }),
    );
  });

  it("rejects relation-backed expense creation outside the org", async () => {
    const grantLookup = vi.fn().mockResolvedValue(undefined);
    const fundLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = {
      query: {
        grants: {
          findFirst: grantLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
      },
      insert: insertFn,
    };

    await expect(
      createExpense(db as never, {
        orgId: "org-1",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00Z",
        fundId: "fund-foreign",
      }),
    ).rejects.toThrow("Fund not found");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects expense creation without a grant or fund reference before opening a transaction", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn() },
        funds: { findFirst: vi.fn() },
        chartOfAccounts: { findFirst: vi.fn() },
      },
      transaction,
    };

    await expect(
      createExpense(db as never, {
        orgId: "org-1",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00Z",
      }),
    ).rejects.toThrow("Expense must reference a grant or fund");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws when fund mutations do not return a row", async () => {
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    await expect(
      createFund(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        name: "General Operations",
        type: "unrestricted",
      }),
    ).rejects.toThrow("Failed to create fund");

    await expect(
      updateFund(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        fundId: "fund-1",
        data: { description: "Updated" },
      }),
    ).rejects.toThrow("Fund not found");

    await expect(
      deleteFund(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        fundId: "fund-1",
      }),
    ).rejects.toThrow("Fund not found");
  });

  it("creates, updates, and soft deletes expenses", async () => {
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const txForCreate = { insert: create.insertFn, query: { funds: { findFirst: fundLookup } } };
    const txForUpdate = {
      update: update.updateFn,
      query: { expenses: { findFirst: expenseLookup } },
    };
    const txForDelete = {
      update: update.updateFn,
      query: { expenses: { findFirst: expenseLookup } },
    };
    const transactionForCreate = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const transactionForDelete = vi.fn().mockImplementation((callback) => callback(txForDelete));

    const dbCreate = {
      query: {
        funds: { findFirst: fundLookup },
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionForCreate,
    };

    expect(
      await createExpense(dbCreate as never, {
        orgId: "org-1",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00Z",
        fundId: "fund-1",
      }),
    ).toEqual({ id: "expense-1" });

    const dbUpdate = {
      query: {
        expenses: { findFirst: expenseLookup },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue({ id: "account-2" }) },
      },
      transaction: transactionForUpdate,
    };

    expect(
      await updateExpense(dbUpdate as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { description: "Updated" },
      }),
    ).toEqual({ id: "expense-1", description: "Updated" });

    const deleteExpenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const dbDelete = {
      query: { expenses: { findFirst: deleteExpenseLookup } },
      transaction: transactionForDelete,
    };
    await deleteExpense(dbDelete as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });
  });

  it("persists reimbursable when creating and updating expenses", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1", reimbursable: false });
    const update = makeUpdateMock({ id: "expense-1", reimbursable: true });
    const transactionForCreate = vi.fn().mockImplementation((callback) =>
      callback({
        insert: create.insertFn,
      }),
    );
    const transactionForUpdate = vi.fn().mockImplementation((callback) =>
      callback({
        update: update.updateFn,
      }),
    );

    await createExpense(
      {
        query: {
          grants: { findFirst: grantLookup },
        },
        transaction: transactionForCreate,
      } as never,
      {
        orgId: "org-1",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00Z",
        grantId: "grant-1",
        reimbursable: false,
      },
    );

    expect(create.valuesFn.mock.calls[0]![0]).toMatchObject({
      reimbursable: false,
    });

    await updateExpense(
      {
        query: {
          expenses: { findFirst: expenseLookup },
        },
        transaction: transactionForUpdate,
      } as never,
      {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { reimbursable: true },
      },
    );

    expect(update.setFn.mock.calls[0]![0]).toMatchObject({
      reimbursable: true,
    });
  });

  it("rejects createExpense when accountId is inactive or outside the org", async () => {
    const insert = makeInsertMock({ id: "expense-1" });
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }) },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insert.insertFn,
      transaction: vi.fn(),
    };

    await expect(
      createExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        accountId: "foreign-or-inactive-account",
        amountCents: 2500,
        date: "2026-04-15T00:00:00.000Z",
      }),
    ).rejects.toThrow("Account not found");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects updateExpense when accountId is inactive or outside the org", async () => {
    const update = makeUpdateMock({ id: "expense-1" });
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({ id: "expense-1", grantId: "grant-1" }),
        },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      update: update.updateFn,
      transaction: vi.fn(),
    };

    await expect(
      updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { accountId: "foreign-or-inactive-account" },
      }),
    ).rejects.toThrow("Account not found");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("records expense mutation activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    vi.mocked(postExpense).mockClear();
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1", grantId: "grant-1", fundId: "fund-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const txForCreate = {
      insert: create.insertFn,
      query: { funds: { findFirst: fundLookup }, grants: { findFirst: grantLookup } },
    };
    const txForUpdate = {
      update: update.updateFn,
      query: { expenses: { findFirst: expenseLookup } },
    };
    const txForDelete = {
      update: update.updateFn,
      query: { expenses: { findFirst: expenseLookup } },
    };
    const transactionForCreate = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const transactionForDelete = vi.fn().mockImplementation((callback) => callback(txForDelete));

    const dbCreate = {
      query: {
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionForCreate,
    };

    const dbUpdate = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionForUpdate,
    };

    const dbDelete = {
      query: { expenses: { findFirst: expenseLookup } },
      transaction: transactionForDelete,
    };

    await createExpense(dbCreate as never, {
      orgId: "org-1",
      actorId: "actor-1",
      amountCents: 25_000,
      date: "2026-08-01T00:00:00Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });
    await updateExpense(dbUpdate as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { description: "Updated" },
    });
    await deleteExpense(dbDelete as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
  });

  it("parses all expense fields and throws on missing rows", async () => {
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    // grantLookup: first call (for data.grantId="grant-1" in second updateExpense) returns grant;
    // second call (for data.grantId="grant-foreign") returns undefined → "Grant not found"
    const grantLookup = vi
      .fn()
      .mockResolvedValueOnce({ id: "grant-1", orgId: "org-1" })
      .mockResolvedValueOnce(undefined);
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    // createExpense: fails because insert returns undefined
    const txForCreate = {
      insert: create.insertFn,
      query: { funds: { findFirst: fundLookup }, grants: { findFirst: vi.fn() } },
    };
    const transactionForCreate = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const dbCreate = {
      query: {
        funds: { findFirst: fundLookup },
        grants: { findFirst: vi.fn() },
        expenses: { findFirst: vi.fn() },
      },
      transaction: transactionForCreate,
    };

    await expect(
      createExpense(dbCreate as never, {
        orgId: "org-1",
        amountCents: 25_000,
        date: "2026-08-01T00:00:00Z",
        fundId: "fund-1",
      }),
    ).rejects.toThrow("Failed to create expense");

    // updateExpense: assertExpenseInGrant fails → "Expense not found"
    const expenseLookupMissing = vi.fn().mockResolvedValue(undefined);
    await expect(
      updateExpense(
        {
          query: { expenses: { findFirst: expenseLookupMissing } },
          update: update.updateFn,
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          expenseId: "expense-1",
          data: {
            grantId: "grant-1",
            fundId: "fund-1",
            amountCents: 10,
            date: "2026-09-01T00:00:00Z",
            description: "Travel",
            category: "program",
            vendor: "Vendor",
          },
        },
      ),
    ).rejects.toThrow("Expense not found");

    // updateExpense: assertExpenseInGrant passes, but data.grantId="grant-foreign" fails → "Grant not found"
    const expenseLookupFound = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const transactionMock = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const dbUpdateGrantCheck = {
      query: {
        expenses: { findFirst: expenseLookupFound },
        grants: { findFirst: grantLookup },
        funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" }) },
      },
      transaction: transactionMock,
    };

    await expect(
      updateExpense(dbUpdateGrantCheck as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: {
          grantId: "grant-1",
          amountCents: 10,
          date: "2026-09-01T00:00:00Z",
          description: "Travel",
          category: "program",
          vendor: "Vendor",
        },
      }),
    ).rejects.toThrow("Expense not found");

    await expect(
      updateExpense(dbUpdateGrantCheck as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: {
          grantId: "grant-foreign",
          amountCents: 10,
          date: "2026-09-01T00:00:00Z",
          description: "Travel",
          category: "program",
          vendor: "Vendor",
        },
      }),
    ).rejects.toThrow("Grant not found");

    const deleteExpenseLookupMissing = vi.fn().mockResolvedValue(undefined);
    await expect(
      deleteExpense(
        {
          update: update.updateFn,
          query: { expenses: { findFirst: deleteExpenseLookupMissing } },
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          expenseId: "expense-1",
        },
      ),
    ).rejects.toThrow("Expense not found");
  });

  it("rejects expense update when expense does not belong to the specified grantId", async () => {
    const expenseLookup = vi.fn().mockResolvedValue(undefined); // expense not found for this grantId
    const update = makeUpdateMock({ id: "expense-1" });
    const db = {
      query: {
        expenses: {
          findFirst: expenseLookup,
        },
      },
    };

    await expect(
      updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-foreign",
        data: { description: "Tampered" },
      }),
    ).rejects.toThrow("Expense not found");

    expect(update.updateFn).not.toHaveBeenCalled();
  });

  it("rejects expense delete when expense does not belong to the specified grantId", async () => {
    const expenseLookup = vi.fn().mockResolvedValue(undefined); // expense not found for this grantId
    const update = makeUpdateMock({ id: "expense-1" });
    const db = {
      query: {
        expenses: {
          findFirst: expenseLookup,
        },
      },
    };

    await expect(
      deleteExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-foreign",
      }),
    ).rejects.toThrow("Expense not found");

    expect(update.updateFn).not.toHaveBeenCalled();
  });

  it("rejects expense update when the found expense belongs to a different grant", async () => {
    // findFirst returns the row by id+org (the mock does not evaluate the where
    // clause), but the row's grantId does not match the grantId in the URL path.
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-2", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1" });
    const db = {
      query: { expenses: { findFirst: expenseLookup } },
      update: update.updateFn,
      transaction: vi.fn(),
    };

    await expect(
      updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { description: "Tampered" },
      }),
    ).rejects.toThrow("Expense not found");

    expect(db.transaction).not.toHaveBeenCalled();
    expect(update.updateFn).not.toHaveBeenCalled();
  });

  it("rejects expense delete when the found expense belongs to a different grant", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-2", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1" });
    const db = {
      query: { expenses: { findFirst: expenseLookup } },
      update: update.updateFn,
      transaction: vi.fn(),
    };

    await expect(
      deleteExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
      }),
    ).rejects.toThrow("Expense not found");

    expect(db.transaction).not.toHaveBeenCalled();
    expect(update.updateFn).not.toHaveBeenCalled();
  });

  it("allows editing and deleting a fund-only expense (grantId null) through any grant path", async () => {
    // An expense whose grantId was cleared to null (fund-only) must stay reachable
    // through a grant-scoped expense route — there is no fund-scoped expense route,
    // so otherwise it would become permanently uneditable and undeletable.
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: null, fundId: "fund-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const transaction = vi.fn().mockImplementation((callback) =>
      callback({
        update: update.updateFn,
        query: { expenses: { findFirst: expenseLookup } },
      }),
    );

    const dbUpdate = {
      query: { expenses: { findFirst: expenseLookup } },
      transaction,
    };

    expect(
      await updateExpense(dbUpdate as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { description: "Updated" },
      }),
    ).toEqual({ id: "expense-1", description: "Updated" });

    const deleteUpdate = makeUpdateMock({ id: "expense-1" });
    const deleteTransaction = vi.fn().mockImplementation((callback) =>
      callback({
        update: deleteUpdate.updateFn,
        query: { expenses: { findFirst: expenseLookup } },
      }),
    );
    const dbDelete = {
      query: { expenses: { findFirst: expenseLookup } },
      transaction: deleteTransaction,
    };

    await deleteExpense(dbDelete as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });

    expect(deleteUpdate.updateFn).toHaveBeenCalled();
  });

  it("updateFund passes only allowed fields to set() — never id, orgId, or createdAt", async () => {
    const { updateFn, setFn } = makeUpdateMock({
      id: "fund-1",
      name: "Renamed",
      type: "unrestricted",
      description: "Desc",
    });

    await updateFund(withTransaction({ update: updateFn }) as never, {
      orgId: "org-1",
      fundId: "fund-1",
      data: { name: "Renamed", type: "unrestricted", description: "Desc" },
    });

    const setPayload = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setPayload).toHaveProperty("name", "Renamed");
    expect(setPayload).toHaveProperty("type", "unrestricted");
    expect(setPayload).toHaveProperty("description", "Desc");
    expect(setPayload).not.toHaveProperty("id");
    expect(setPayload).not.toHaveProperty("orgId");
    expect(setPayload).not.toHaveProperty("createdAt");
    expect(setPayload).not.toHaveProperty("deletedAt");
  });

  it("createExpense accepts a Date object for date (parseDateValue Date branch)", async () => {
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1" });
    const txForCreate = { insert: create.insertFn, query: { funds: { findFirst: fundLookup } } };
    const transactionForCreate = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const db = {
      query: { funds: { findFirst: fundLookup } },
      transaction: transactionForCreate,
    };

    const result = await createExpense(db as never, {
      orgId: "org-1",
      amountCents: 5_000,
      date: "2026-08-01T00:00:00.000Z",
      fundId: "fund-1",
    });

    expect(result).toEqual({ id: "expense-1" });
  });

  it("throws when updateExpense returns no row", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock(undefined);
    const txForUpdate = { update: update.updateFn };
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const db = {
      query: { expenses: { findFirst: expenseLookup } },
      transaction: transactionForUpdate,
    };

    await expect(
      updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { description: "x" },
      }),
    ).rejects.toThrow("Expense not found");
  });

  it("updateExpense handles fundId: null branch (clear fund reference)", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", fundId: null });
    const txForUpdate = { update: update.updateFn };
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue({ id: "account-2" }) },
      },
      transaction: transactionForUpdate,
    };

    const result = await updateExpense(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { fundId: null },
    });

    expect(result).toEqual({ id: "expense-1", fundId: null });
  });

  it("rejects updateExpense when clearing the last grant or fund reference", async () => {
    const expenseLookup = vi.fn().mockResolvedValue({
      id: "expense-1",
      grantId: "grant-1",
      fundId: null,
      orgId: "org-1",
    });
    const update = makeUpdateMock({ id: "expense-1", grantId: null });
    const transactionForUpdate = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionForUpdate,
    };

    await expect(
      updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { grantId: null },
      }),
    ).rejects.toThrow("Expense must reference a grant or fund");
    expect(transactionForUpdate).not.toHaveBeenCalled();
    expect(update.updateFn).not.toHaveBeenCalled();
  });

  it("allows expense update and delete when expense belongs to the specified grantId", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const txForUpdate = { update: update.updateFn };
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const db = {
      query: {
        expenses: {
          findFirst: expenseLookup,
        },
      },
      transaction: transactionForUpdate,
    };

    expect(
      await updateExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        data: { description: "Updated" },
      }),
    ).toEqual({ id: "expense-1", description: "Updated" });

    const deleteUpdate = makeUpdateMock({ id: "expense-1" });
    const txForDelete = { update: deleteUpdate.updateFn };
    const transactionForDelete = vi.fn().mockImplementation((callback) => callback(txForDelete));
    const deleteExpenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const dbDelete = {
      query: {
        expenses: {
          findFirst: deleteExpenseLookup,
        },
      },
      transaction: transactionForDelete,
    };
    await deleteExpense(dbDelete as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });
  });

  it("updates expense fundId when provided (non-null asserts fund, null clears fund)", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-2", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", fundId: "fund-2" });
    const txForUpdate = { update: update.updateFn };
    const transactionForUpdate = vi.fn().mockImplementation((callback) => callback(txForUpdate));
    const dbWithFund = {
      query: {
        expenses: { findFirst: expenseLookup },
        funds: { findFirst: fundLookup },
      },
      transaction: transactionForUpdate,
    };

    await updateExpense(dbWithFund as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { fundId: "fund-2" },
    });
    expect(fundLookup).toHaveBeenCalled();

    const updateNull = makeUpdateMock({ id: "expense-1", fundId: null });
    const txForUpdateNull = { update: updateNull.updateFn };
    const transactionForUpdateNull = vi
      .fn()
      .mockImplementation((callback) => callback(txForUpdateNull));
    const fundLookupForNull = vi.fn();
    const dbNullFund = {
      query: {
        expenses: { findFirst: expenseLookup },
        funds: { findFirst: fundLookupForNull },
      },
      transaction: transactionForUpdateNull,
    };

    await updateExpense(dbNullFund as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { fundId: null },
    });
    expect(fundLookupForNull).not.toHaveBeenCalled();
  });

  it("wraps createExpense in db.transaction", async () => {
    vi.mocked(postExpense).mockClear();
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1", grantId: "grant-1", fundId: "fund-1" });
    const txForCreate = {
      insert: create.insertFn,
      query: { funds: { findFirst: fundLookup }, grants: { findFirst: grantLookup } },
    };
    const transactionFn = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const db = {
      query: {
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
      },
      transaction: transactionFn,
    };

    await createExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      amountCents: 25_000,
      date: "2026-08-01T00:00:00Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });

    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  it("calls postExpense within createExpense transaction when actorId is present", async () => {
    vi.mocked(postExpense).mockClear();
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1", grantId: "grant-1", fundId: "fund-1" });
    const txForCreate = {
      insert: create.insertFn,
      query: { funds: { findFirst: fundLookup }, grants: { findFirst: grantLookup } },
    };
    const transactionFn = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const db = {
      query: {
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
      },
      transaction: transactionFn,
    };

    await createExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      amountCents: 25_000,
      date: "2026-08-01T00:00:00Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });

    expect(vi.mocked(postExpense)).toHaveBeenCalledWith(expect.any(Object), {
      orgId: "org-1",
      actorId: "actor-1",
      expenseId: "expense-1",
      action: "create",
    });
  });

  it("does not call postExpense within createExpense when actorId is absent", async () => {
    vi.mocked(postExpense).mockClear();
    const fundLookup = vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "expense-1", grantId: "grant-1", fundId: "fund-1" });
    const txForCreate = {
      insert: create.insertFn,
      query: { funds: { findFirst: fundLookup }, grants: { findFirst: grantLookup } },
    };
    const transactionFn = vi.fn().mockImplementation((callback) => callback(txForCreate));
    const db = {
      query: {
        funds: { findFirst: fundLookup },
        grants: { findFirst: grantLookup },
      },
      transaction: transactionFn,
    };

    await createExpense(db as never, {
      orgId: "org-1",
      amountCents: 25_000,
      date: "2026-08-01T00:00:00Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });

    expect(vi.mocked(postExpense)).not.toHaveBeenCalled();
  });

  it("wraps updateExpense in db.transaction", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await updateExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { description: "Updated" },
    });

    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  it("calls postExpense within updateExpense transaction when actorId is present", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await updateExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { description: "Updated" },
    });

    expect(vi.mocked(postExpense)).toHaveBeenCalledWith(expect.any(Object), {
      orgId: "org-1",
      actorId: "actor-1",
      expenseId: "expense-1",
      action: "update",
    });
  });

  it("does not call postExpense within updateExpense when actorId is absent", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", description: "Updated" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await updateExpense(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { description: "Updated" },
    });

    expect(vi.mocked(postExpense)).not.toHaveBeenCalled();
  });

  it("wraps deleteExpense in db.transaction", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await deleteExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });

    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  it("calls postExpense within deleteExpense transaction when actorId is present", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await deleteExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });

    expect(vi.mocked(postExpense)).toHaveBeenCalledWith(expect.any(Object), {
      orgId: "org-1",
      actorId: "actor-1",
      expenseId: "expense-1",
      action: "delete",
    });
  });

  it("does not call postExpense within deleteExpense when actorId is absent", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
    };

    await deleteExpense(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
    });

    expect(vi.mocked(postExpense)).not.toHaveBeenCalled();
  });

  it("includes accountId in updateExpense payload when provided", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", accountId: "account-2" });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue({ id: "account-2" }) },
      },
      transaction: transactionFn,
      update: update.updateFn,
    };

    await updateExpense(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { accountId: "account-2" },
    });

    const setPayload = update.setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setPayload).toHaveProperty("accountId", "account-2");
  });

  it("handles accountId: null in updateExpense (clear account reference)", async () => {
    vi.mocked(postExpense).mockClear();
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock({ id: "expense-1", accountId: null });
    const transactionFn = vi
      .fn()
      .mockImplementation((callback) => callback({ update: update.updateFn }));
    const db = {
      query: {
        expenses: { findFirst: expenseLookup },
      },
      transaction: transactionFn,
      update: update.updateFn,
    };

    await updateExpense(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      expenseId: "expense-1",
      data: { accountId: null },
    });

    const setPayload = update.setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setPayload).toHaveProperty("accountId", null);
  });

  it("throws when deleteExpense update returns no row", async () => {
    const expenseLookup = vi
      .fn()
      .mockResolvedValue({ id: "expense-1", grantId: "grant-1", orgId: "org-1" });
    const update = makeUpdateMock(undefined);
    const txForDelete = { update: update.updateFn };
    const transactionForDelete = vi.fn().mockImplementation((callback) => callback(txForDelete));
    const db = {
      query: { expenses: { findFirst: expenseLookup } },
      transaction: transactionForDelete,
    };

    await expect(
      deleteExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
      }),
    ).rejects.toThrow("Expense not found");
  });

  it("createFund: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { insertFn } = makeInsertMock({
      id: "fund-1",
      name: "General Operations",
      type: "unrestricted",
    });
    const db = withTransaction({ insert: insertFn });

    await createFund(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      name: "General Operations",
      type: "unrestricted",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fund", action: "created" }),
    );
  });

  it("createFund: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { insertFn } = makeInsertMock({
      id: "fund-1",
      name: "General Operations",
      type: "unrestricted",
    });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createFund(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        name: "General Operations",
        type: "unrestricted",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateFund: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeUpdateMock({ id: "fund-1" });
    const db = withTransaction({ update: updateFn });

    await updateFund(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      fundId: "fund-1",
      data: { description: "Updated" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fund", action: "updated" }),
    );
  });

  it("updateFund: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeUpdateMock({ id: "fund-1" });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateFund(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        fundId: "fund-1",
        data: { description: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteFund: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeUpdateMock({ id: "fund-1" });
    const db = withTransaction({ update: updateFn });

    await deleteFund(db as never, { orgId: "org-1", actorId: "actor-1", fundId: "fund-1" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "fund", action: "deleted" }),
    );
  });

  it("deleteFund: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeUpdateMock({ id: "fund-1" });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteFund(db as never, { orgId: "org-1", actorId: "actor-1", fundId: "fund-1" }),
    ).rejects.toThrow("audit log down");
  });
});
