import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBudgetLineAllocationWarnings,
  setExpenseBudgetAllocations,
  setJournalLineBudgetAllocations,
  totalBudgetAllocationCents,
} from "./budget-allocations.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

function chain<T>(result?: T) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe("grant budget allocation service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("totals split allocations", () => {
    expect(totalBudgetAllocationCents([{ amountCents: 4000 }, { amountCents: 6000 }])).toBe(10000);
  });

  it("replaces balanced expense budget allocations", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 10000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            orgId: "org-1",
            grantId: "grant-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            allowable: true,
            approvedAmountCents: 12000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        actorId: "user-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).resolves.toEqual({ allocations: inserted, warnings: [] });
  });

  it("rejects blank caller entity scope after validating the referenced budget line", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 10000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "journal-line-1",
            orgId: "org-1",
            grantId: "grant-1",
            debitCents: 10000,
            creditCents: 0,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            entityId: "entity-from-line",
            allowable: true,
            approvedAmountCents: 12000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    };

    await expect(
      setJournalLineBudgetAllocations(db as never, {
        orgId: "org-1",
        entityId: "",
        grantId: "grant-1",
        journalLineId: "journal-line-1",
        actorId: "user-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.query.grantBudgetLines.findFirst).toHaveBeenCalledOnce();
  });

  it("rejects clearing allocations when no active entity can be resolved", async () => {
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "journal-line-1",
            orgId: "org-1",
            grantId: "grant-1",
            debitCents: 0,
            creditCents: 0,
          }),
        },
        grantBudgetLineAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(),
    };

    await expect(
      setJournalLineBudgetAllocations(db as never, {
        orgId: "org-1",
        entityId: "",
        grantId: "grant-1",
        journalLineId: "journal-line-1",
        allocations: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uses expense entity scope for allocations and submitted duplicate line totals", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 10000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            orgId: "org-1",
            grantId: "grant-1",
            entityId: "entity-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            entityId: "entity-1",
            allowable: false,
            approvedAmountCents: 9000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ budgetLineId: "line-1", amountCents: 500 }]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        entityId: "entity-1",
        allocations: [
          { budgetLineId: "line-1", amountCents: 4000 },
          { budgetLineId: "line-1", amountCents: 6000, notes: "Split row" },
        ],
      }),
    ).resolves.toMatchObject({
      allocations: inserted,
      warnings: [
        {
          code: "line_over_budget",
          approvedAmountCents: 9000,
          projectedActualCents: 10500,
        },
        { code: "unallowable_category" },
      ],
    });
  });

  it("warns when existing allocations on the line push the replacement over budget", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 10000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            orgId: "org-1",
            grantId: "grant-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            allowable: true,
            approvedAmountCents: 15000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ budgetLineId: "line-1", amountCents: 9000 }]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).resolves.toMatchObject({
      warnings: [
        {
          code: "line_over_budget",
          approvedAmountCents: 15000,
          projectedActualCents: 19000,
        },
      ],
    });
  });

  it("aggregates duplicate submitted rows before checking a budget line for over-budget warnings", async () => {
    const inserted = [
      { id: "allocation-1", budgetLineId: "line-1", amountCents: 6000 },
      { id: "allocation-2", budgetLineId: "line-1", amountCents: 6000 },
    ];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            orgId: "org-1",
            grantId: "grant-1",
            amountCents: 12000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            allowable: true,
            approvedAmountCents: 10000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [
          { budgetLineId: "line-1", amountCents: 6000 },
          { budgetLineId: "line-1", amountCents: 6000 },
        ],
      }),
    ).resolves.toMatchObject({
      warnings: [
        {
          code: "line_over_budget",
          approvedAmountCents: 10000,
          projectedActualCents: 12000,
        },
      ],
    });
  });

  it("rejects split totals that do not equal the source expense amount", async () => {
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            grantId: "grant-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            allowable: true,
            approvedAmountCents: 12000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
      },
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 9000 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects allocations for a missing expense before loading budget lines", async () => {
    const db = {
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(null) },
        grantBudgetLineAllocations: { findMany: vi.fn() },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        expenseId: "missing-expense",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("replaces balanced journal-line budget allocations", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 8000, journalLineId: "jl-1" }];
    const insertChain = chain(inserted);
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => insertChain),
    };
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "jl-1",
            orgId: "org-1",
            grantId: "grant-1",
            debitCents: 8000,
            creditCents: 0,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            allowable: true,
            approvedAmountCents: 12000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              status: "approved",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setJournalLineBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "jl-1",
        actorId: "user-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 8000 }],
      }),
    ).resolves.toEqual({ allocations: inserted, warnings: [] });
    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        orgId: "org-1",
        journalLineId: "jl-1",
        expenseId: null,
        budgetLineId: "line-1",
        amountCents: 8000,
      }),
    ]);
  });

  it("checks existing journal-line allocations from other sources before replacement", async () => {
    const inserted = [{ id: "allocation-1", amountCents: 8000, journalLineId: "jl-1" }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "jl-1",
            orgId: "org-1",
            grantId: "grant-1",
            debitCents: 0,
            creditCents: 8000,
          }),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            entityId: undefined,
            allowable: true,
            approvedAmountCents: 9000,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              deletedAt: null,
            },
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: "existing-journal-allocation" }])
            .mockResolvedValueOnce([{ budgetLineId: "line-1", amountCents: 2000 }]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setJournalLineBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "jl-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 8000 }],
      }),
    ).resolves.toMatchObject({
      warnings: [
        {
          code: "line_over_budget",
          approvedAmountCents: 9000,
          projectedActualCents: 10000,
        },
      ],
    });
  });

  it("uses journal credit amount and clears allocations without inserting rows", async () => {
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(),
    };
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "jl-1",
            orgId: "org-1",
            grantId: "grant-1",
            debitCents: 0,
            creditCents: 0,
          }),
        },
        grantBudgetLineAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setJournalLineBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "jl-1",
        allocations: [],
      }),
    ).resolves.toEqual({ allocations: [], warnings: [] });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects journal-line allocations for another grant", async () => {
    const db = {
      query: {
        journalLines: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as never;

    await expect(
      setJournalLineBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "foreign-line",
        allocations: [{ budgetLineId: "line-1", amountCents: 8000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("clears existing allocations when the expense amount is zero", async () => {
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            grantId: "grant-1",
            amountCents: 0,
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi.fn().mockResolvedValue([{ id: "old-allocation" }]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [],
      }),
    ).resolves.toEqual({ allocations: [], warnings: [] });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns not found when an allocation references a line from another grant", async () => {
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            grantId: "grant-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            approvedAmountCents: 12000,
            allowable: true,
            budgetVersion: { grantId: "other-grant" },
          }),
        },
      },
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns not found when the budget line lookup misses entirely", async () => {
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            grantId: "grant-1",
            entityId: undefined,
            amountCents: 10000,
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [{ budgetLineId: "line-missing", amountCents: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns not found when an allocation references a deleted budget version", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: "expense-1",
            grantId: "grant-1",
            amountCents: 10000,
          }),
        },
        grantBudgetLineAllocations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            approvedAmountCents: 12000,
            allowable: true,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              deletedAt: new Date("2026-05-28T00:00:00.000Z"),
            },
          }),
        },
      },
      transaction,
    } as never;

    await expect(
      setExpenseBudgetAllocations(db, {
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        allocations: [{ budgetLineId: "line-1", amountCents: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("warns for over-budget and unallowable allocations", () => {
    expect(
      getBudgetLineAllocationWarnings({
        approvedAmountCents: 10000,
        existingActualCents: 9000,
        newAmountCents: 2000,
        allowable: false,
      }),
    ).toEqual([
      {
        code: "line_over_budget",
        approvedAmountCents: 10000,
        projectedActualCents: 11000,
      },
      { code: "unallowable_category" },
    ]);
  });
});
