import { describe, it, expect, vi } from "vitest";
import {
  listAllocationBases,
  getAllocationBase,
  createAllocationBase,
  updateAllocationBase,
  softDeleteAllocationBase,
  getAllocationTargets,
  setAllocationTargets,
  listAllocationRules,
  createAllocationRule,
  updateAllocationRule,
  softDeleteAllocationRule,
  getAllocatedStatementOfFunctionalExpenses,
  type AllocationBaseRow,
  type AllocationTargetRow,
  type AllocationRuleRow,
} from "./service";
import type { Database } from "@grantpipe/db";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ROW: AllocationBaseRow = {
  id: "base-1",
  orgId: "org-1",
  name: "Headcount",
  description: null,
  method: "headcount_fte",
  status: "active",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const TARGET_ROW: AllocationTargetRow = {
  id: "target-1",
  orgId: "org-1",
  baseId: "base-1",
  functionalClass: "program",
  programId: "prog-1",
  label: "After-school program",
  weightBasisPoints: 7000,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const RULE_ROW: AllocationRuleRow = {
  id: "rule-1",
  orgId: "org-1",
  accountId: "acc-1",
  baseId: "base-1",
  status: "active",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

type QueryFinderMock = {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

function makeQueryTable(
  findFirstReturn: unknown = null,
  findManyReturn: unknown[] = [],
): QueryFinderMock {
  return {
    findFirst: vi.fn().mockResolvedValue(findFirstReturn),
    findMany: vi.fn().mockResolvedValue(findManyReturn),
  };
}

function makeDb(
  overrides: {
    allocationBases?: QueryFinderMock;
    allocationTargets?: QueryFinderMock;
    allocationRules?: QueryFinderMock;
    programs?: QueryFinderMock;
    chartOfAccounts?: QueryFinderMock;
    insertReturn?: unknown[];
    updateReturn?: unknown[];
    selectRows?: unknown[];
    txInsertReturn?: unknown[];
    txUpdateReturn?: unknown[];
    txInsert?: unknown;
    txUpdate?: unknown;
  } = {},
) {
  const insertReturn = overrides.insertReturn ?? [{ ...BASE_ROW }];
  const updateReturn = overrides.updateReturn ?? [{ ...BASE_ROW }];
  const selectRows = overrides.selectRows ?? [];
  const txInsertReturn = overrides.txInsertReturn ?? [{ ...TARGET_ROW }];
  const txUpdateReturn = overrides.txUpdateReturn ?? [];

  const innerTx = {
    update:
      overrides.txUpdate ??
      vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(txUpdateReturn),
        }),
      }),
    insert:
      overrides.txInsert ??
      vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(txInsertReturn),
        }),
      }),
  };

  const db = {
    query: {
      allocationBases: overrides.allocationBases ?? makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationTargets: overrides.allocationTargets ?? makeQueryTable(TARGET_ROW, [TARGET_ROW]),
      allocationRules: overrides.allocationRules ?? makeQueryTable(RULE_ROW, [RULE_ROW]),
      programs:
        overrides.programs ??
        makeQueryTable({ id: "prog-1", name: "After-school" }, [
          { id: "prog-1", name: "After-school" },
        ]),
      chartOfAccounts:
        overrides.chartOfAccounts ??
        makeQueryTable({ id: "acc-1", type: "expense", orgId: "org-1" }),
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(insertReturn),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateReturn),
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(selectRows),
              }),
            }),
          }),
        }),
      }),
    }),
    transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerTx)),
  };

  return db as unknown as Database;
}

// ---------------------------------------------------------------------------
// listAllocationBases
// ---------------------------------------------------------------------------

describe("listAllocationBases", () => {
  it("returns list of non-deleted bases", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]) });
    const result = await listAllocationBases(db, { orgId: "org-1" });
    expect(result).toEqual([BASE_ROW]);
  });

  it("returns empty array when no bases exist", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    const result = await listAllocationBases(db, { orgId: "org-1" });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAllocationBase
// ---------------------------------------------------------------------------

describe("getAllocationBase", () => {
  it("returns base when found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]) });
    const result = await getAllocationBase(db, { orgId: "org-1", baseId: "base-1" });
    expect(result).toEqual(BASE_ROW);
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    await expect(getAllocationBase(db, { orgId: "org-1", baseId: "base-1" })).rejects.toMatchObject(
      {
        status: 404,
      },
    );
  });
});

// ---------------------------------------------------------------------------
// createAllocationBase
// ---------------------------------------------------------------------------

describe("createAllocationBase", () => {
  it("inserts and returns new base", async () => {
    const db = makeDb({ insertReturn: [BASE_ROW] });
    const result = await createAllocationBase(db, {
      orgId: "org-1",
      input: { name: "Headcount", method: "headcount_fte", status: "active" },
    });
    expect(result).toEqual(BASE_ROW);
  });

  it("throws when insert returns empty", async () => {
    const db = makeDb({ insertReturn: [] });
    await expect(
      createAllocationBase(db, {
        orgId: "org-1",
        input: { name: "Headcount", method: "headcount_fte", status: "active" },
      }),
    ).rejects.toThrow("Failed to create allocation base");
  });

  it("defaults status to active when status is not provided", async () => {
    const db = makeDb({ insertReturn: [BASE_ROW] });
    const result = await createAllocationBase(db, {
      orgId: "org-1",
      // @ts-expect-error — deliberately omitting status to exercise the nullish fallback branch
      input: { name: "Headcount", method: "headcount_fte" },
    });
    expect(result).toEqual(BASE_ROW);
  });
});

// ---------------------------------------------------------------------------
// updateAllocationBase
// ---------------------------------------------------------------------------

describe("updateAllocationBase", () => {
  it("updates and returns updated base", async () => {
    const updated = { ...BASE_ROW, name: "Updated" };
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      updateReturn: [updated],
    });
    const result = await updateAllocationBase(db, {
      orgId: "org-1",
      baseId: "base-1",
      input: { name: "Updated" },
    });
    expect(result).toEqual(updated);
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    await expect(
      updateAllocationBase(db, {
        orgId: "org-1",
        baseId: "nonexistent",
        input: { name: "X" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when update returns empty (race condition)", async () => {
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      updateReturn: [],
    });
    await expect(
      updateAllocationBase(db, {
        orgId: "org-1",
        baseId: "base-1",
        input: { name: "X" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("falls back to existing values when no fields are provided in input", async () => {
    const updated = { ...BASE_ROW };
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      updateReturn: [updated],
    });
    const result = await updateAllocationBase(db, {
      orgId: "org-1",
      baseId: "base-1",
      input: {}, // no fields — all fall back to existing values
    });
    expect(result).toEqual(updated);
  });

  it("updates description to explicit value (including null/empty)", async () => {
    const updatedWithDescription = { ...BASE_ROW, description: "New description" };
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      updateReturn: [updatedWithDescription],
    });
    const result = await updateAllocationBase(db, {
      orgId: "org-1",
      baseId: "base-1",
      input: { description: "New description" },
    });
    expect(result.description).toBe("New description");
  });
});

// ---------------------------------------------------------------------------
// softDeleteAllocationBase
// ---------------------------------------------------------------------------

describe("softDeleteAllocationBase", () => {
  it("soft-deletes a base", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]) });
    await expect(
      softDeleteAllocationBase(db, { orgId: "org-1", baseId: "base-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    await expect(
      softDeleteAllocationBase(db, { orgId: "org-1", baseId: "nonexistent" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// getAllocationTargets
// ---------------------------------------------------------------------------

describe("getAllocationTargets", () => {
  it("returns targets for a base", async () => {
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
    });
    const result = await getAllocationTargets(db, { orgId: "org-1", baseId: "base-1" });
    expect(result).toEqual([TARGET_ROW]);
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    await expect(
      getAllocationTargets(db, { orgId: "org-1", baseId: "nonexistent" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// setAllocationTargets
// ---------------------------------------------------------------------------

describe("setAllocationTargets", () => {
  it("soft-deletes existing targets and inserts new ones in a transaction", async () => {
    const target2 = {
      ...TARGET_ROW,
      id: "target-2",
      functionalClass: "management" as const,
      programId: null,
      weightBasisPoints: 3000,
    };
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
      programs: makeQueryTable({ id: "prog-1", name: "After-school" }),
      txInsertReturn: [TARGET_ROW, target2],
    });
    const result = await setAllocationTargets(db, {
      orgId: "org-1",
      baseId: "base-1",
      targets: [
        { functionalClass: "program", programId: "prog-1", weightBasisPoints: 7000 },
        { functionalClass: "management", weightBasisPoints: 3000 },
      ],
    });
    expect(result).toEqual([TARGET_ROW, target2]);
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({ allocationBases: makeQueryTable(null, []) });
    await expect(
      setAllocationTargets(db, {
        orgId: "org-1",
        baseId: "nonexistent",
        targets: [{ functionalClass: "program", weightBasisPoints: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("propagates insert failures from the target replacement transaction", async () => {
    const txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const txInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("insert failed")),
      }),
    });
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      programs: makeQueryTable({ id: "prog-1", name: "After-school" }),
      txUpdate,
      txInsert,
    });

    await expect(
      setAllocationTargets(db, {
        orgId: "org-1",
        baseId: "base-1",
        targets: [{ functionalClass: "program", programId: "prog-1", weightBasisPoints: 10000 }],
      }),
    ).rejects.toThrow("insert failed");

    expect(txUpdate).toHaveBeenCalledOnce();
    expect(txInsert).toHaveBeenCalledOnce();
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledOnce();
  });

  it("passes label through when provided", async () => {
    const labeledTarget = { ...TARGET_ROW, id: "t-labeled", label: "My Label" };
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
      programs: makeQueryTable({ id: "prog-1", name: "After-school" }),
      txInsertReturn: [labeledTarget],
    });
    const result = await setAllocationTargets(db, {
      orgId: "org-1",
      baseId: "base-1",
      targets: [
        {
          functionalClass: "program",
          programId: "prog-1",
          label: "My Label",
          weightBasisPoints: 10000,
        },
      ],
    });
    expect(result[0]?.label).toBe("My Label");
  });

  it("throws 404 when a programId does not exist", async () => {
    const db = makeDb({
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      programs: makeQueryTable(null), // program not found
    });
    await expect(
      setAllocationTargets(db, {
        orgId: "org-1",
        baseId: "base-1",
        targets: [{ functionalClass: "program", programId: "bad-prog", weightBasisPoints: 10000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// listAllocationRules
// ---------------------------------------------------------------------------

describe("listAllocationRules", () => {
  it("returns list of non-deleted rules", async () => {
    const db = makeDb({ allocationRules: makeQueryTable(RULE_ROW, [RULE_ROW]) });
    const result = await listAllocationRules(db, { orgId: "org-1" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(RULE_ROW);
  });

  it("includes account and base display names when available", async () => {
    const db = makeDb({
      allocationRules: makeQueryTable(RULE_ROW, [RULE_ROW]),
      chartOfAccounts: makeQueryTable(null, [{ id: "acc-1", code: "6100", name: "Shared Rent" }]),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
    });
    const result = await listAllocationRules(db, { orgId: "org-1" });
    expect(result[0]).toMatchObject({
      accountName: "6100 Shared Rent",
      baseName: "Headcount",
    });
  });
});

// ---------------------------------------------------------------------------
// createAllocationRule
// ---------------------------------------------------------------------------

describe("createAllocationRule", () => {
  it("creates a rule and returns it", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(null, []), // no existing active rule
      insertReturn: [RULE_ROW],
    });
    const result = await createAllocationRule(db, {
      orgId: "org-1",
      input: { accountId: "acc-1", baseId: "base-1", status: "active" },
    });
    expect(result).toEqual(RULE_ROW);
  });

  it("throws 404 when account not found", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable(null),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(null, []),
    });
    await expect(
      createAllocationRule(db, {
        orgId: "org-1",
        input: { accountId: "bad-acc", baseId: "base-1", status: "active" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when base not found", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(null, []),
      allocationRules: makeQueryTable(null, []),
    });
    await expect(
      createAllocationRule(db, {
        orgId: "org-1",
        input: { accountId: "acc-1", baseId: "bad-base", status: "active" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when active rule already exists for account", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(RULE_ROW, [RULE_ROW]), // existing active rule
    });
    await expect(
      createAllocationRule(db, {
        orgId: "org-1",
        input: { accountId: "acc-1", baseId: "base-1", status: "active" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows creating an inactive rule even if active one exists", async () => {
    const inactiveRule = { ...RULE_ROW, id: "rule-2", status: "inactive" };
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(RULE_ROW, [RULE_ROW]), // existing active rule
      insertReturn: [inactiveRule],
    });
    const result = await createAllocationRule(db, {
      orgId: "org-1",
      input: { accountId: "acc-1", baseId: "base-1", status: "inactive" },
    });
    expect(result.status).toBe("inactive");
  });

  it("throws when insert returns empty", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(null, []),
      insertReturn: [],
    });
    await expect(
      createAllocationRule(db, {
        orgId: "org-1",
        input: { accountId: "acc-1", baseId: "base-1", status: "active" },
      }),
    ).rejects.toThrow("Failed to create allocation rule");
  });

  it("defaults status to active when status is not provided", async () => {
    const db = makeDb({
      chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
      allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
      allocationRules: makeQueryTable(null, []),
      insertReturn: [RULE_ROW],
    });
    // Pass input without status to exercise the `status ?? "active"` branch
    const result = await createAllocationRule(db, {
      orgId: "org-1",
      // @ts-expect-error — deliberately omitting status to exercise the nullish fallback
      input: { accountId: "acc-1", baseId: "base-1" },
    });
    expect(result).toEqual(RULE_ROW);
  });
});

// ---------------------------------------------------------------------------
// updateAllocationRule
// ---------------------------------------------------------------------------

describe("updateAllocationRule", () => {
  it("updates and returns updated rule", async () => {
    const updated = { ...RULE_ROW, baseId: "base-2" };
    // findFirst is called: 1st for existing rule, then for conflict check (if activating)
    const findFirstMock = vi
      .fn()
      .mockResolvedValueOnce(RULE_ROW) // existing rule
      .mockResolvedValueOnce(null); // no conflict

    const db = {
      query: {
        allocationRules: {
          findFirst: findFirstMock,
          findMany: vi.fn().mockResolvedValue([RULE_ROW]),
        },
        allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
        chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
        allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
        programs: makeQueryTable({ id: "prog-1", name: "Test" }),
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([RULE_ROW]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      }),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([TARGET_ROW]) }),
          }),
        }),
      ),
    } as unknown as Database;

    const result = await updateAllocationRule(db, {
      orgId: "org-1",
      ruleId: "rule-1",
      input: { baseId: "base-2" },
    });
    expect(result).toEqual(updated);
  });

  it("throws 404 when rule not found", async () => {
    const db = makeDb({ allocationRules: makeQueryTable(null, []) });
    await expect(
      updateAllocationRule(db, { orgId: "org-1", ruleId: "bad-rule", input: {} }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when activating a rule conflicts with another active rule", async () => {
    const inactiveRule = { ...RULE_ROW, id: "rule-2", status: "inactive" };
    const findFirstMock = vi
      .fn()
      .mockResolvedValueOnce(inactiveRule) // existing rule (inactive)
      .mockResolvedValueOnce(RULE_ROW); // conflict (another active rule)

    const db = {
      query: {
        allocationRules: {
          findFirst: findFirstMock,
          findMany: vi.fn().mockResolvedValue([RULE_ROW]),
        },
        allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
        chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
        allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
        programs: makeQueryTable({ id: "prog-1", name: "Test" }),
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([inactiveRule]),
          }),
        }),
      }),
    } as unknown as Database;

    await expect(
      updateAllocationRule(db, {
        orgId: "org-1",
        ruleId: "rule-2",
        input: { status: "active" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when updating account to a non-expense account", async () => {
    const findFirstMock = vi.fn().mockResolvedValueOnce(RULE_ROW);
    const db = {
      query: {
        allocationRules: { findFirst: findFirstMock, findMany: vi.fn().mockResolvedValue([]) },
        allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
        chartOfAccounts: makeQueryTable(null), // account not found
        allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
        programs: makeQueryTable({ id: "prog-1", name: "Test" }),
      },
    } as unknown as Database;

    await expect(
      updateAllocationRule(db, {
        orgId: "org-1",
        ruleId: "rule-1",
        input: { accountId: "new-acc" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when update returns empty (race condition)", async () => {
    const findFirstMock = vi.fn().mockResolvedValueOnce(RULE_ROW).mockResolvedValueOnce(null); // no conflict

    const db = {
      query: {
        allocationRules: { findFirst: findFirstMock, findMany: vi.fn().mockResolvedValue([]) },
        allocationBases: makeQueryTable(BASE_ROW, [BASE_ROW]),
        chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
        allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
        programs: makeQueryTable({ id: "prog-1", name: "Test" }),
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    await expect(
      updateAllocationRule(db, { orgId: "org-1", ruleId: "rule-1", input: {} }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when changing base and new base not found", async () => {
    const findFirstMock = vi.fn().mockResolvedValueOnce(RULE_ROW);
    const db = {
      query: {
        allocationRules: { findFirst: findFirstMock, findMany: vi.fn().mockResolvedValue([]) },
        allocationBases: makeQueryTable(null, []), // base not found
        chartOfAccounts: makeQueryTable({ id: "acc-1", type: "expense" }),
        allocationTargets: makeQueryTable(TARGET_ROW, [TARGET_ROW]),
        programs: makeQueryTable({ id: "prog-1", name: "Test" }),
      },
    } as unknown as Database;

    await expect(
      updateAllocationRule(db, { orgId: "org-1", ruleId: "rule-1", input: { baseId: "new-base" } }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// softDeleteAllocationRule
// ---------------------------------------------------------------------------

describe("softDeleteAllocationRule", () => {
  it("soft-deletes a rule", async () => {
    const db = makeDb({ allocationRules: makeQueryTable(RULE_ROW, [RULE_ROW]) });
    await expect(
      softDeleteAllocationRule(db, { orgId: "org-1", ruleId: "rule-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws 404 when rule not found", async () => {
    const db = makeDb({ allocationRules: makeQueryTable(null, []) });
    await expect(
      softDeleteAllocationRule(db, { orgId: "org-1", ruleId: "bad" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// getAllocatedStatementOfFunctionalExpenses
// ---------------------------------------------------------------------------

describe("getAllocatedStatementOfFunctionalExpenses", () => {
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-12-31");

  function makeExpenseSelectDb(
    expenseRows: unknown[],
    rules: AllocationRuleRow[],
    targets: AllocationTargetRow[],
    programRows: Array<{ id: string; name: string }> = [],
    baseRows: AllocationBaseRow[] = [BASE_ROW],
  ) {
    let selectCallCount = 0;

    return {
      query: {
        allocationRules: {
          findMany: vi.fn().mockResolvedValue(rules),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        allocationTargets: {
          findMany: vi.fn().mockResolvedValue(targets),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        programs: {
          findMany: vi.fn().mockResolvedValue(programRows),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        allocationBases: {
          findMany: vi.fn().mockResolvedValue(baseRows),
          findFirst: vi.fn().mockResolvedValue(BASE_ROW),
        },
        chartOfAccounts: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue(selectCallCount === 1 ? expenseRows : []),
                  }),
                }),
              }),
            }),
          }),
        };
      }),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    } as unknown as Database;
  }

  it("returns empty result when no expense rows", async () => {
    const db = makeExpenseSelectDb([], [], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });
    expect(result.rows).toEqual([]);
    expect(result.totals).toEqual({ program: 0, management: 0, fundraising: 0, total: 0 });
    expect(result.programBreakdown).toEqual([]);
  });

  it("assigns unallocated expense to its functionalClass column (direct)", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "Salaries",
      functionalClass: "program",
      debitTotal: 100_00,
      creditTotal: 0,
    };
    const db = makeExpenseSelectDb([expenseRow], [], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });
    expect(result.rows[0]).toMatchObject({
      accountId: "acc-1",
      program: 10000,
      management: 0,
      fundraising: 0,
      total: 10000,
    });
    expect(result.totals.program).toBe(10000);
  });

  it("splits allocated expense across targets using allocateCents", async () => {
    // 10000 cents split 70/30 across program and management
    const expenseRow = {
      id: "acc-1",
      name: "Office Rent",
      functionalClass: "management",
      debitTotal: 10000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const targetProgram: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: "prog-1",
      weightBasisPoints: 7000,
    };
    const targetMgmt: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-2",
      functionalClass: "management",
      programId: null,
      weightBasisPoints: 3000,
    };

    const db = makeExpenseSelectDb(
      [expenseRow],
      [rule],
      [targetProgram, targetMgmt],
      [{ id: "prog-1", name: "After-school" }],
    );
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    expect(result.rows[0]).toMatchObject({
      accountId: "acc-1",
      program: 7000,
      management: 3000,
      fundraising: 0,
      total: 10000,
    });
    // program + management + fundraising == total for each row
    for (const row of result.rows) {
      expect(row.program + row.management + row.fundraising).toBe(row.total);
    }
  });

  it("sum of p+m+f across all rows equals sum of all balances (no lost cents)", async () => {
    // Two expense rows: one pooled, one direct
    const directRow = {
      id: "acc-2",
      name: "Marketing",
      functionalClass: "fundraising",
      debitTotal: 333,
      creditTotal: 0,
    };
    const pooledRow = {
      id: "acc-1",
      name: "Salaries",
      functionalClass: "management",
      debitTotal: 1000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const t1: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: "prog-1",
      weightBasisPoints: 3334,
    };
    const t2: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-2",
      functionalClass: "management",
      programId: null,
      weightBasisPoints: 3333,
    };
    const t3: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-3",
      functionalClass: "fundraising",
      programId: null,
      weightBasisPoints: 3333,
    };

    const db = makeExpenseSelectDb(
      [pooledRow, directRow],
      [rule],
      [t1, t2, t3],
      [{ id: "prog-1", name: "After-school" }],
    );
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    const totalBalance = 1000 + 333;
    const sumPMF = result.rows.reduce((s, r) => s + r.program + r.management + r.fundraising, 0);
    expect(sumPMF).toBe(totalBalance);
    expect(result.totals.total).toBe(totalBalance);
  });

  it("builds programBreakdown with correct entries and sorts by name", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "Salaries",
      functionalClass: "management",
      debitTotal: 10000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const t1: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: "prog-2",
      weightBasisPoints: 6000,
    };
    const t2: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-2",
      functionalClass: "program",
      programId: "prog-1",
      weightBasisPoints: 4000,
    };
    const db = makeExpenseSelectDb(
      [expenseRow],
      [rule],
      [t1, t2],
      [
        { id: "prog-1", name: "Alpha Program" },
        { id: "prog-2", name: "Beta Program" },
      ],
    );
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    expect(result.programBreakdown[0]?.programName).toBe("Alpha Program");
    expect(result.programBreakdown[1]?.programName).toBe("Beta Program");
    expect(result.programBreakdown[0]?.amountCents).toBe(4000);
    expect(result.programBreakdown[1]?.amountCents).toBe(6000);
  });

  it("handles a base with no targets (treats as no rule)", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "Office",
      functionalClass: "management",
      debitTotal: 5000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };

    const db = makeExpenseSelectDb([expenseRow], [rule], []); // empty targets
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    // When targets are empty, falls through to direct functional class assignment
    expect(result.rows[0]).toMatchObject({
      program: 0,
      management: 5000,
      fundraising: 0,
      total: 5000,
    });
  });

  it("ignores allocation rules whose base is deleted or inactive", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "Office",
      functionalClass: "management",
      debitTotal: 5000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const target: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: "prog-1",
      weightBasisPoints: 10000,
    };

    const db = makeExpenseSelectDb([expenseRow], [rule], [target], [], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    expect(result.rows[0]).toMatchObject({
      program: 0,
      management: 5000,
      fundraising: 0,
      total: 5000,
    });
  });

  it("handles null programId program targets (Unassigned Program bucket)", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "General Salaries",
      functionalClass: "management",
      debitTotal: 2000,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const t1: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: null,
      weightBasisPoints: 10000,
    };

    const db = makeExpenseSelectDb([expenseRow], [rule], [t1], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });

    expect(result.programBreakdown[0]).toMatchObject({
      programId: null,
      programName: "Unassigned Program",
      amountCents: 2000,
    });
  });

  it("falls back to 'Unknown Program' when a programId is not found in programs table", async () => {
    const expenseRow = {
      id: "acc-1",
      name: "Salaries",
      functionalClass: "management",
      debitTotal: 500,
      creditTotal: 0,
    };
    const rule: AllocationRuleRow = { ...RULE_ROW, accountId: "acc-1", baseId: "base-1" };
    const t1: AllocationTargetRow = {
      ...TARGET_ROW,
      id: "t-1",
      functionalClass: "program",
      programId: "orphan-prog",
      weightBasisPoints: 10000,
    };
    // programs query returns empty — orphan-prog not found
    const db = makeExpenseSelectDb([expenseRow], [rule], [t1], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });
    expect(result.programBreakdown[0]).toMatchObject({
      programId: "orphan-prog",
      programName: "Unknown Program",
    });
  });

  it("direct program accounts contribute to Unassigned Program breakdown bucket", async () => {
    const expenseRow = {
      id: "acc-99",
      name: "Direct Program Cost",
      functionalClass: "program",
      debitTotal: 500,
      creditTotal: 0,
    };
    // No rules — direct
    const db = makeExpenseSelectDb([expenseRow], [], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });
    expect(result.programBreakdown[0]).toMatchObject({
      programId: null,
      programName: "Unassigned Program",
      amountCents: 500,
    });
  });

  it("handles fundraising direct accounts with zero in breakdown", async () => {
    const expenseRow = {
      id: "acc-5",
      name: "Direct Fundraising",
      functionalClass: "fundraising",
      debitTotal: 800,
      creditTotal: 0,
    };
    const db = makeExpenseSelectDb([expenseRow], [], []);
    const result = await getAllocatedStatementOfFunctionalExpenses(db, {
      orgId: "org-1",
      startDate,
      endDate,
    });
    expect(result.rows[0]).toMatchObject({ fundraising: 800, total: 800 });
    expect(result.programBreakdown).toEqual([]);
  });
});
