import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";
import {
  buildAllocationWarnings,
  replaceExpenseProgramAllocations,
  replaceGrantProgramAllocations,
  totalAllocatedCents,
} from "./allocation.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

const programId = "00000000-0000-4000-8000-000000000001";
const secondProgramId = "00000000-0000-4000-8000-000000000002";
const grantId = "00000000-0000-4000-8000-000000000101";
const expenseId = "00000000-0000-4000-8000-000000000201";
const fundId = "00000000-0000-4000-8000-000000000301";

function uuidForIndex(index: number) {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

const program = { id: programId };

function chain<T>(result?: T) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe("program allocation service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calculates amount and percent allocation totals", () => {
    expect(totalAllocatedCents([{ amountCents: 2000 }, { percentBasisPoints: 2500 }], 10_000)).toBe(
      4500,
    );
    expect(buildAllocationWarnings([{ amountCents: 11_000 }], 10_000)).toEqual([
      { code: "source_over_allocated", allocatedCents: 11_000, sourceAmountCents: 10_000 },
    ]);
    expect(buildAllocationWarnings([{ amountCents: 9_000 }], 10_000)).toEqual([]);
  });

  it("replaces grant allocations and returns over-allocation warnings", async () => {
    const inserted = [{ id: "alloc-1", programId, amountCents: 12_000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([{ id: "old" }]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    const result = await replaceGrantProgramAllocations(db, {
      orgId: "org-1",
      actorId: "user-1",
      grantId,
      allocations: [{ programId, amountCents: 12_000 }],
    });

    expect(result.allocations).toEqual(inserted);
    expect(result.warnings).toEqual([
      { code: "source_over_allocated", allocatedCents: 12_000, sourceAmountCents: 10_000 },
    ]);
    expect(tx.update).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledOnce();
  });

  it("clears grant allocations without inserting or recording actor activity", async () => {
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain([])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: null }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([{ id: "old" }]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: [],
      }),
    ).resolves.toEqual({ allocations: [], warnings: [] });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("throws not found when grant or program is outside the org", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
      },
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: [{ programId, amountCents: 100 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects duplicate grant program allocations before opening a transaction", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: [
          { programId, amountCents: 5_000 },
          { programId, amountCents: 5_000 },
        ],
      }),
    ).rejects.toThrow("Program allocations must be unique");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects grant allocation rows without exactly one allocation mode", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: [{ programId }],
      }),
    ).rejects.toThrow("Provide exactly one allocation mode");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects grant allocation rows with invalid amount cents", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: [{ programId, amountCents: 0 }],
      }),
    ).rejects.toThrow();

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects grant allocation batches above the shared row limit", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 }) },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId,
        allocations: Array.from({ length: 201 }, (_, index) => ({
          programId: uuidForIndex(index),
          amountCents: 1,
        })),
      }),
    ).rejects.toThrow();

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid grant allocation replacement input before loading the grant", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: grantId, amountCents: 10_000 });
    const transaction = vi.fn();
    const db = {
      query: {
        grants: { findFirst },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        grantProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceGrantProgramAllocations(db, {
        orgId: "org-1",
        grantId: "not-a-uuid",
        allocations: [{ programId: "also-not-a-uuid", amountCents: 100 }],
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("replaces expense allocations and rejects unbalanced amount replacements", async () => {
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: expenseId,
            amountCents: 10_000,
            fundId,
            grantId,
          }),
        },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        balanceMode: "replace_and_balance",
        allocations: [{ programId, amountCents: 9_000 }],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("replaces balanced expense allocations", async () => {
    const inserted = [{ id: "alloc-1", amountCents: 10_000 }];
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain(inserted)),
    };
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: expenseId,
            amountCents: 10_000,
            fundId,
            grantId,
          }),
        },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    const result = await replaceExpenseProgramAllocations(db, {
      orgId: "org-1",
      actorId: "user-1",
      expenseId,
      balanceMode: "replace_and_balance",
      allocations: [{ programId, amountCents: 10_000 }],
    });

    expect(result.allocations).toEqual(inserted);
    expect(result.warnings).toEqual([]);
  });

  it("clears expense allocations and allows balanced percent replacements", async () => {
    const tx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain([{ id: "alloc-1", percentBasisPoints: 10_000 }])),
    };
    const query = {
      expenses: {
        findFirst: vi.fn().mockResolvedValue({
          id: expenseId,
          amountCents: 10_000,
          fundId: null,
          grantId: null,
        }),
      },
      programs: { findFirst: vi.fn().mockResolvedValue(program) },
      expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([{ id: "old" }]) },
    };
    const db = {
      query,
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        balanceMode: "replace_and_balance",
        allocations: [{ programId, percentBasisPoints: 10_000 }],
      }),
    ).resolves.toMatchObject({ warnings: [] });

    const clearTx = {
      update: vi.fn(() => chain()),
      insert: vi.fn(() => chain([])),
    };
    const clearDb = {
      query,
      transaction: vi.fn(async (callback) => callback(clearTx)),
    } as never;
    await expect(
      replaceExpenseProgramAllocations(clearDb, {
        orgId: "org-1",
        expenseId,
        allocations: [],
      }),
    ).resolves.toEqual({ allocations: [], warnings: [] });
    expect(clearTx.insert).not.toHaveBeenCalled();
  });

  it("throws when an expense is outside the org", async () => {
    const db = {
      query: { expenses: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        allocations: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invalid expense allocation replacement input before loading the expense", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: expenseId,
      amountCents: 10_000,
      fundId,
      grantId,
    });
    const transaction = vi.fn();
    const db = {
      query: {
        expenses: { findFirst },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId: "not-a-uuid",
        balanceMode: "replace_and_balance",
        allocations: [{ programId: "also-not-a-uuid", percentBasisPoints: 10_000 }],
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects mixed balanced expense allocation modes before opening a transaction", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: expenseId,
            amountCents: 10_000,
            fundId,
            grantId,
          }),
        },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId, amountCents: 5_000 },
          { programId: secondProgramId, percentBasisPoints: 5_000 },
        ],
      }),
    ).rejects.toThrow("Balanced replacements cannot mix allocation modes");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects unbalanced percent expense allocations before opening a transaction", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: expenseId,
            amountCents: 10_000,
            fundId,
            grantId,
          }),
        },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        balanceMode: "replace_and_balance",
        allocations: [
          { programId, percentBasisPoints: 6_000 },
          { programId: secondProgramId, percentBasisPoints: 3_000 },
        ],
      }),
    ).rejects.toThrow("Percent allocations must total 10000 basis points");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects expense allocation rows with invalid percent basis points", async () => {
    const transaction = vi.fn();
    const db = {
      query: {
        expenses: {
          findFirst: vi.fn().mockResolvedValue({
            id: expenseId,
            amountCents: 10_000,
            fundId,
            grantId,
          }),
        },
        programs: { findFirst: vi.fn().mockResolvedValue(program) },
        expenseProgramAllocations: { findMany: vi.fn().mockResolvedValue([]) },
      },
      transaction,
    } as never;

    await expect(
      replaceExpenseProgramAllocations(db, {
        orgId: "org-1",
        expenseId,
        allocations: [{ programId, percentBasisPoints: 10_001 }],
      }),
    ).rejects.toThrow();

    expect(transaction).not.toHaveBeenCalled();
  });
});
