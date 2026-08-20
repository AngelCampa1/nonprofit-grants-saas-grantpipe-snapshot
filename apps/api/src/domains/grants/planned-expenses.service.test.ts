import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordActivityLog } from "../../lib/activity-log";
import {
  convertPlannedExpense,
  createPlannedExpense,
  deletePlannedExpense,
  listPlannedExpenses,
  updatePlannedExpense,
} from "./planned-expenses.service";

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

function returningChain<T>(result: T) {
  return {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe("grant planned expenses service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists non-deleted planned expenses for a grant in the org", async () => {
    const rows = [{ id: "planned-1", description: "Laptops" }];
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        plannedExpenses: { findMany: vi.fn().mockResolvedValue(rows) },
      },
    } as never;

    await expect(listPlannedExpenses(db, { orgId: "org-1", grantId: "grant-1" })).resolves.toEqual(
      rows,
    );
  });

  it("lists planned expenses within an explicit entity scope", async () => {
    const rows = [{ id: "planned-entity", description: "Entity materials" }];
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }) },
        plannedExpenses: { findMany: vi.fn().mockResolvedValue(rows) },
      },
    } as never;

    await expect(
      listPlannedExpenses(db, {
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
      }),
    ).resolves.toEqual(rows);
  });

  it("rejects listing planned expenses when the grant is missing", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
        plannedExpenses: { findMany: vi.fn() },
      },
    };

    await expect(
      listPlannedExpenses(db as never, { orgId: "org-1", grantId: "missing" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.query.plannedExpenses.findMany).not.toHaveBeenCalled();
  });

  it("creates a planned expense only for a budget line in the grant", async () => {
    const planned = { id: "planned-1", amountCents: 25_000 };
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: {
          findFirst: vi.fn().mockResolvedValue({ id: "period-1" }),
        },
      },
      insert: vi.fn(() => returningChain([planned])),
    } as never);

    await expect(
      createPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetLineId: "line-1",
        budgetPeriodId: "period-1",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
        status: "planned",
      }),
    ).resolves.toEqual(planned);
  });

  it("creates a planned expense without optional actor, period, status, or notes", async () => {
    const planned = { id: "planned-1", description: "Materials" };
    const chain = returningChain([planned]);
    const dbBase = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: { findFirst: vi.fn() },
      },
      insert: vi.fn(() => chain),
    };
    const db = withTransaction(dbBase);

    await expect(
      createPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetLineId: "line-1",
        description: "Materials",
        amountCents: 10_000,
        expectedDate: "2026-07-01",
      }),
    ).resolves.toEqual(planned);

    expect(db.query.grantBudgetPeriods.findFirst).not.toHaveBeenCalled();
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetPeriodId: null,
        status: "planned",
        notes: null,
        createdByUserId: null,
      }),
    );
  });

  it("rejects invalid planned expense creation input before reading grants", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        grants: { findFirst },
      },
      insert: vi.fn(),
    } as never;

    await expect(
      createPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetLineId: "line-1",
        description: "Laptops",
        amountCents: 0,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toThrow(/Too small/);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects planned expenses against a line from another grant", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { grantId: "other-grant" },
          }),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetLineId: "line-1",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects planned expenses against a line from a deleted budget version", async () => {
    const planned = { id: "planned-1" };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              deletedAt: new Date("2026-05-28T00:00:00.000Z"),
            },
          }),
        },
      },
      insert: vi.fn(() => returningChain([planned])),
    };

    await expect(
      createPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetLineId: "line-1",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects planned expenses when the selected budget period is missing", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersionId: "version-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(),
    };

    await expect(
      createPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetLineId: "line-1",
        budgetPeriodId: "period-missing",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when planned expense creation returns no row", async () => {
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      insert: vi.fn(() => returningChain([])),
    } as never);

    await expect(
      createPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetLineId: "line-1",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("updates a planned expense and validates replacement periods against the line version", async () => {
    const updated = { id: "planned-1", description: "Updated laptops" };
    const db = withTransaction({
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            budgetLineId: "line-1",
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersionId: "version-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: {
          findFirst: vi.fn().mockResolvedValue({ id: "period-2" }),
        },
      },
      update: vi.fn(() => returningChain([updated])),
    } as never);

    await expect(
      updatePlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: {
          budgetPeriodId: "period-2",
          description: "Updated laptops",
        },
      }),
    ).resolves.toEqual(updated);
  });

  it("rejects invalid planned expense update input before reading planned expenses", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        plannedExpenses: { findFirst },
      },
      update: vi.fn(),
    } as never;

    await expect(
      updatePlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { amountCents: 0 },
      }),
    ).rejects.toThrow(/Too small/);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("updates a planned expense without optional period, date, or actor", async () => {
    const updated = { id: "planned-1", description: "Updated laptops" };
    const chain = returningChain([updated]);
    const dbBase3 = {
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            budgetLineId: "line-1",
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersionId: "version-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: { findFirst: vi.fn() },
      },
      update: vi.fn(() => chain),
    };
    const db = withTransaction(dbBase3);

    await expect(
      updatePlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { description: "Updated laptops" },
      }),
    ).resolves.toEqual(updated);

    expect(db.query.grantBudgetPeriods.findFirst).not.toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetPeriodId: undefined,
        expectedDate: undefined,
      }),
    );
  });

  it("updates expectedDate when provided and keeps existing entity scope", async () => {
    const updated = { id: "planned-1", description: "Updated laptops" };
    const chain = returningChain([updated]);
    const db = withTransaction({
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            entityId: "entity-1",
            budgetLineId: "line-1",
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersionId: "version-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        grantBudgetPeriods: { findFirst: vi.fn() },
      },
      update: vi.fn(() => chain),
    } as never);

    await updatePlannedExpense(db, {
      orgId: "org-1",
      grantId: "grant-1",
      plannedExpenseId: "planned-1",
      data: { expectedDate: "2026-09-01" },
    });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDate: new Date("2026-09-01T00:00:00.000Z"),
      }),
    );
  });

  it("rejects updates for missing planned expenses and empty update results", async () => {
    const missingDb = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      update: vi.fn(),
    };

    await expect(
      updatePlannedExpense(missingDb as never, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "missing",
        data: { description: "Updated laptops" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(missingDb.update).not.toHaveBeenCalled();

    const emptyDb = withTransaction({
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            budgetLineId: "line-1",
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      update: vi.fn(() => returningChain([])),
    } as never);

    await expect(
      updatePlannedExpense(emptyDb, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { description: "Updated laptops" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("soft-deletes planned expenses", async () => {
    const deleted = { id: "planned-1", description: "Laptops" };
    const db = withTransaction({
      update: vi.fn(() => returningChain([deleted])),
    } as never);

    await expect(
      deletePlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
      }),
    ).resolves.toEqual(deleted);
  });

  it("rejects deleting missing planned expenses", async () => {
    const db = withTransaction({
      update: vi.fn(() => returningChain([])),
    } as never);

    await expect(
      deletePlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("converts a planned expense into an actual expense and links it back", async () => {
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      budgetLineId: "line-1",
      budgetPeriodId: "period-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "committed",
      convertedExpenseId: null,
      notes: "Original plan",
    };
    const line = {
      id: "line-1",
      category: "Supplies",
      fundId: "fund-1",
      budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
    };
    const expense = {
      id: "expense-1",
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-1",
      amountCents: 25_000,
    };
    const converted = {
      ...planned,
      status: "converted",
      convertedExpenseId: "expense-1",
    };
    const insertChain = returningChain([expense]);
    const updateChain = returningChain([converted]);
    const tx = {
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };
    const db = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
        grantBudgetLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn(async (fn: (txArg: unknown) => unknown) => fn(tx)),
    } as never;

    await expect(
      convertPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: { date: "2026-08-15", vendor: "Office Depot" },
      }),
    ).resolves.toEqual({ plannedExpense: converted, expense });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        fundId: "fund-1",
        amountCents: 25_000,
        description: "Workshop supplies",
        category: "Supplies",
        date: new Date("2026-08-15T00:00:00.000Z"),
        vendor: "Office Depot",
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "converted",
        convertedExpenseId: "expense-1",
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("converts using existing expected date, description, notes, and explicit null fund", async () => {
    const expectedDate = new Date("2026-08-01T00:00:00.000Z");
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      entityId: "entity-1",
      budgetLineId: "line-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate,
      status: "committed",
      convertedExpenseId: null,
      notes: "Original notes",
    };
    const expense = { id: "expense-1", amountCents: 25_000 };
    const converted = { ...planned, status: "converted", convertedExpenseId: "expense-1" };
    const insertChain = returningChain([expense]);
    const updateChain = returningChain([converted]);
    const tx = {
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };
    const db = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            category: "Supplies",
            fundId: "fund-from-line",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      transaction: vi.fn(async (fn: (txArg: unknown) => unknown) => fn(tx)),
    } as never;

    await expect(
      convertPlannedExpense(db, {
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { fundId: null, reimbursable: false },
      }),
    ).resolves.toEqual({ plannedExpense: converted, expense });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "entity-1",
        fundId: null,
        date: expectedDate,
        description: "Workshop supplies",
        vendor: null,
        reimbursable: false,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "Original notes",
      }),
    );
  });

  it("throws when conversion expense creation returns no row", async () => {
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      entityId: "entity-1",
      budgetLineId: "line-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "committed",
      convertedExpenseId: null,
      notes: null,
    };
    const tx = {
      insert: vi.fn(() => returningChain([])),
      update: vi.fn(),
    };
    const db = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            category: "Supplies",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      transaction: vi.fn(async (fn: (txArg: unknown) => unknown) => fn(tx)),
    } as never;

    await expect(
      convertPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: {},
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects invalid conversion input before reading planned expenses", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        plannedExpenses: { findFirst },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      convertPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { date: "08/15/2026" },
      }),
    ).rejects.toThrow(/Use an ISO date/);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects double conversion of a planned expense", async () => {
    const db = {
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            orgId: "org-1",
            grantId: "grant-1",
            status: "converted",
            convertedExpenseId: "expense-1",
          }),
        },
      },
      transaction: vi.fn(),
    };

    await expect(
      convertPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects conversion of cancelled planned expenses", async () => {
    const db = {
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "planned-1",
            orgId: "org-1",
            grantId: "grant-1",
            status: "cancelled",
            convertedExpenseId: null,
          }),
        },
      },
      transaction: vi.fn(),
    };

    await expect(
      convertPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("validates conversion fund and account overrides before creating the expense", async () => {
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      budgetLineId: "line-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "committed",
      convertedExpenseId: null,
      notes: null,
    };
    const expense = {
      id: "expense-1",
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-2",
      accountId: "account-1",
      amountCents: 25_000,
    };
    const converted = {
      ...planned,
      status: "converted",
      convertedExpenseId: "expense-1",
    };
    const insertChain = returningChain([expense]);
    const updateChain = returningChain([converted]);
    const tx = {
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };
    const db = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            category: "Supplies",
            fundId: "fund-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
        funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-2" }) },
        chartOfAccounts: {
          findFirst: vi.fn().mockResolvedValue({ id: "account-1" }),
        },
      },
      transaction: vi.fn(async (fn: (txArg: unknown) => unknown) => fn(tx)),
    } as never;

    await expect(
      convertPlannedExpense(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: { fundId: "fund-2", accountId: "account-1" },
      }),
    ).resolves.toEqual({ plannedExpense: converted, expense });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-2",
        accountId: "account-1",
      }),
    );
  });

  it("rejects conversion overrides for funds or accounts outside the org", async () => {
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      budgetLineId: "line-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "committed",
      convertedExpenseId: null,
      notes: null,
    };
    const baseQuery = {
      plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
      grantBudgetLines: {
        findFirst: vi.fn().mockResolvedValue({
          id: "line-1",
          category: "Supplies",
          budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
        }),
      },
    };
    const missingFundDb = {
      query: {
        ...baseQuery,
        funds: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      transaction: vi.fn(),
    };
    const missingAccountDb = {
      query: {
        ...baseQuery,
        funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-2" }) },
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      transaction: vi.fn(),
    };

    await expect(
      convertPlannedExpense(missingFundDb as never, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { fundId: "fund-2" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      convertPlannedExpense(missingAccountDb as never, {
        orgId: "org-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { fundId: "fund-2", accountId: "account-1" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(missingFundDb.transaction).not.toHaveBeenCalled();
    expect(missingAccountDb.transaction).not.toHaveBeenCalled();
  });

  it("createPlannedExpense: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const planned = { id: "planned-1", description: "Laptops" };
    const dbBase4 = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      insert: vi.fn(() => returningChain([planned])),
    };
    const db = withTransaction(dbBase4);

    await createPlannedExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      budgetLineId: "line-1",
      description: "Laptops",
      amountCents: 25_000,
      expectedDate: "2026-06-01",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "planned_expense", action: "created" }),
    );
  });

  it("createPlannedExpense: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const planned = { id: "planned-1", description: "Laptops" };
    const dbBase5 = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      insert: vi.fn(() => returningChain([planned])),
    };
    const db = withTransaction(dbBase5);

    await expect(
      createPlannedExpense(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        budgetLineId: "line-1",
        description: "Laptops",
        amountCents: 25_000,
        expectedDate: "2026-06-01",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updatePlannedExpense: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updated = { id: "planned-1", description: "Updated" };
    const dbBase6 = {
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({ id: "planned-1", budgetLineId: "line-1" }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      update: vi.fn(() => returningChain([updated])),
    };
    const db = withTransaction(dbBase6);

    await updatePlannedExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      plannedExpenseId: "planned-1",
      data: { description: "Updated" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "planned_expense", action: "updated" }),
    );
  });

  it("updatePlannedExpense: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const updated = { id: "planned-1", description: "Updated" };
    const dbBase7 = {
      query: {
        plannedExpenses: {
          findFirst: vi.fn().mockResolvedValue({ id: "planned-1", budgetLineId: "line-1" }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      update: vi.fn(() => returningChain([updated])),
    };
    const db = withTransaction(dbBase7);

    await expect(
      updatePlannedExpense(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
        data: { description: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deletePlannedExpense: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const deleted = { id: "planned-1", description: "Laptops" };
    const dbBase8 = { update: vi.fn(() => returningChain([deleted])) };
    const db = withTransaction(dbBase8);

    await deletePlannedExpense(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      plannedExpenseId: "planned-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "planned_expense", action: "deleted" }),
    );
  });

  it("deletePlannedExpense: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const deleted = { id: "planned-1", description: "Laptops" };
    const dbBase9 = { update: vi.fn(() => returningChain([deleted])) };
    const db = withTransaction(dbBase9);

    await expect(
      deletePlannedExpense(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        plannedExpenseId: "planned-1",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("rejects a conversion race when the planned expense was converted during the transaction", async () => {
    const planned = {
      id: "planned-1",
      orgId: "org-1",
      grantId: "grant-1",
      budgetLineId: "line-1",
      description: "Workshop supplies",
      amountCents: 25_000,
      expectedDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "committed",
      convertedExpenseId: null,
      notes: null,
    };
    const tx = {
      insert: vi.fn(() => returningChain([{ id: "expense-1" }])),
      update: vi.fn(() => returningChain([])),
    };
    const db = {
      query: {
        plannedExpenses: { findFirst: vi.fn().mockResolvedValue(planned) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            category: "Supplies",
            budgetVersion: { orgId: "org-1", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      transaction: vi.fn(async (fn: (txArg: unknown) => unknown) => fn(tx)),
    };

    await expect(
      convertPlannedExpense(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
