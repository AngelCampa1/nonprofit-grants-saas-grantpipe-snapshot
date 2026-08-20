import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProgramBudget, updateProgramBudget } from "./budget.service";
import { assertProgramInOrg } from "./program.service";

vi.mock("./program.service", () => ({
  assertProgramInOrg: vi.fn(),
}));
vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

function returningChain<T>(result: T) {
  return {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe("program budget service", () => {
  beforeEach(() => vi.resetAllMocks());

  const programId = "00000000-0000-4000-8000-000000000001";

  it("creates budgets and lines in one transaction", async () => {
    const budget = { id: "budget-1", name: "FY 2027" };
    const lines = [{ id: "line-1", category: "Personnel", budgetedCents: 100_00 }];
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([budget]))
        .mockReturnValueOnce(returningChain(lines)),
    };
    const db = { transaction: vi.fn(async (callback) => callback(tx)) } as never;

    const result = await createProgramBudget(db, {
      orgId: "org-1",
      actorId: "user-1",
      programId,
      name: "FY 2027",
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
      lines: [{ category: "Personnel", budgetedCents: 100_00 }],
    });

    expect(result).toEqual({ ...budget, lines });
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it("throws when budget creation does not return a row", async () => {
    const tx = {
      insert: vi.fn().mockReturnValueOnce(returningChain([])),
    };
    const db = { transaction: vi.fn(async (callback) => callback(tx)) } as never;

    await expect(
      createProgramBudget(db, {
        orgId: "org-1",
        programId,
        name: "FY 2027",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        lines: [{ category: "Personnel", budgetedCents: 100_00, notes: "Draft" }],
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects inverted budget periods before opening a transaction", async () => {
    const transaction = vi.fn();
    const db = { transaction } as never;

    await expect(
      createProgramBudget(db, {
        orgId: "org-1",
        programId,
        name: "FY 2027",
        periodStart: "2027-06-30",
        periodEnd: "2026-07-01",
        lines: [{ category: "Personnel", budgetedCents: 100_00 }],
      }),
    ).rejects.toThrow("Period start must be on or before period end");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid create input before asserting program or opening a transaction", async () => {
    const transaction = vi.fn();
    const db = { transaction } as never;

    await expect(
      createProgramBudget(db, {
        orgId: "org-1",
        programId: "not-a-uuid",
        name: " ",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        lines: [{ category: " ", budgetedCents: 0 }],
      }),
    ).rejects.toThrow();

    expect(assertProgramInOrg).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("updates budget metadata without replacing lines", async () => {
    const existing = { id: "budget-1", name: "FY 2027", lines: [{ id: "line-1" }] };
    const budget = { id: "budget-1", name: "Approved FY 2027" };
    const tx = { update: vi.fn(() => returningChain([budget])) };
    const db = {
      query: { programBudgets: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        actorId: "user-1",
        budgetId: "budget-1",
        data: { name: "Approved FY 2027" },
      }),
    ).resolves.toEqual({ ...budget, lines: existing.lines });
  });

  it("updates budget metadata without an actor", async () => {
    const existing = { id: "budget-1", name: "FY 2027", lines: [{ id: "line-1" }] };
    const budget = { id: "budget-1", name: "Draft FY 2027" };
    const tx = { update: vi.fn(() => returningChain([budget])) };
    const db = {
      query: { programBudgets: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        budgetId: "budget-1",
        data: { name: "Draft FY 2027" },
      }),
    ).resolves.toEqual({ ...budget, lines: existing.lines });
  });

  it("rejects one-sided period updates that invert the existing budget period", async () => {
    const existing = {
      id: "budget-1",
      name: "FY 2027",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      lines: [],
    };
    const transaction = vi.fn();
    const db = {
      query: { programBudgets: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction,
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        budgetId: "budget-1",
        data: { periodEnd: "2025-12-31" },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid update input before loading the existing budget", async () => {
    const findFirst = vi.fn();
    const transaction = vi.fn();
    const db = {
      query: { programBudgets: { findFirst } },
      transaction,
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        budgetId: "budget-1",
        data: {
          name: "",
          lines: [{ category: "Supplies", budgetedCents: 10.5 }],
        },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("replaces lines when update payload includes lines", async () => {
    const existing = { id: "budget-1", name: "FY 2027", lines: [{ id: "old-line" }] };
    const budget = { id: "budget-1", name: "FY 2027" };
    const newLines = [{ id: "line-2", category: "Supplies", budgetedCents: 50_00 }];
    const tx = {
      update: vi
        .fn()
        .mockReturnValueOnce(returningChain([budget]))
        .mockReturnValueOnce(returningChain([])),
      insert: vi.fn(() => returningChain(newLines)),
    };
    const db = {
      query: { programBudgets: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        actorId: "user-1",
        budgetId: "budget-1",
        data: {
          periodStart: "2026-07-01",
          periodEnd: "2027-06-30",
          lines: [{ category: "Supplies", budgetedCents: 50_00 }],
        },
      }),
    ).resolves.toEqual({ ...budget, lines: newLines });
  });

  it("throws when the budget is missing", async () => {
    const db = {
      query: { programBudgets: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        budgetId: "missing",
        data: { name: "Missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws when the updated budget row is missing", async () => {
    const db = {
      query: {
        programBudgets: {
          findFirst: vi.fn().mockResolvedValue({ id: "budget-1", lines: [] }),
        },
      },
      transaction: vi.fn(async (callback) => callback({ update: vi.fn(() => returningChain([])) })),
    } as never;

    await expect(
      updateProgramBudget(db, {
        orgId: "org-1",
        budgetId: "budget-1",
        data: { name: "Missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
