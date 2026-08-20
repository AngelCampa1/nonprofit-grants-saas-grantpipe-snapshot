import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordActivityLog } from "../../lib/activity-log";
import {
  approveBudgetVersion,
  createBudgetAmendment,
  createBudgetLine,
  createBudgetPeriod,
  createBudgetVersion,
  getBudgetVersion,
  getCurrentBudgetVersion,
  listBudgetAmendments,
  listBudgetVersions,
} from "./budget.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
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

describe("grant budget lifecycle service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a draft budget version with the next version number", async () => {
    const version = { id: "version-2", versionNumber: 2, status: "draft" };
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ versionNumber: 1 }),
        },
      },
      insert: vi.fn(() => returningChain([version])),
    } as never);

    await expect(
      createBudgetVersion(db, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        source: "manual",
      }),
    ).resolves.toEqual(version);
  });

  it("creates an initial manual budget version without optional metadata", async () => {
    const version = { id: "version-1", versionNumber: 1, status: "draft" };
    const chain = returningChain([version]);
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn(() => chain),
    } as never);

    await expect(
      createBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
      }),
    ).resolves.toEqual(version);

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 1,
        source: "manual",
        notes: null,
        createdByUserId: null,
      }),
    );
  });

  it("returns a conflict when concurrent version creation reuses a version number", async () => {
    const duplicate = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ versionNumber: 1 }),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(duplicate),
      })),
    } as never);

    await expect(
      createBudgetVersion(db, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        source: "manual",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rethrows non-unique version creation errors", async () => {
    const insertError = new Error("connection failed");
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ versionNumber: 1 }),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(insertError),
      })),
    } as never);

    await expect(
      createBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        source: "manual",
      }),
    ).rejects.toBe(insertError);
  });

  it("returns not found when creating a version for a grant outside the org", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(),
    };

    await expect(
      createBudgetVersion(db as never, {
        orgId: "org-1",
        grantId: "missing-grant",
        source: "manual",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("surfaces internal errors when inserts return no budget rows", async () => {
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn(() => returningChain([])),
    } as never);

    await expect(
      createBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        source: "manual",
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("lists budget versions with periods and lines for a grant in the org", async () => {
    const versions = [
      {
        id: "version-2",
        versionNumber: 2,
        periods: [{ id: "period-1", sortOrder: 1 }],
        lines: [{ id: "line-1", sortOrder: 1 }],
      },
    ];
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findMany: vi.fn().mockResolvedValue(versions),
        },
      },
    } as never;

    await expect(listBudgetVersions(db, { orgId: "org-1", grantId: "grant-1" })).resolves.toEqual(
      versions,
    );
  });

  it("returns a single budget version with periods and lines", async () => {
    const version = {
      id: "version-1",
      grantId: "grant-1",
      periods: [{ id: "period-1" }],
      lines: [{ id: "line-1" }],
    };
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue(version),
        },
      },
    } as never;

    await expect(
      getBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        versionId: "version-1",
      }),
    ).resolves.toEqual(version);
  });

  it("returns not found when a requested budget version is missing", async () => {
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    } as never;

    await expect(
      getBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        versionId: "missing-version",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns the current approved budget version and null when none is approved", async () => {
    const current = {
      id: "version-3",
      status: "approved",
      periods: [],
      lines: [],
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(null),
        },
      },
    } as never;

    await expect(
      getCurrentBudgetVersion(db, { orgId: "org-1", grantId: "grant-1" }),
    ).resolves.toEqual(current);
    await expect(
      getCurrentBudgetVersion(db, { orgId: "org-1", grantId: "grant-1" }),
    ).resolves.toBeNull();
  });

  it("lists budget amendments for a grant in the org", async () => {
    const amendments = [{ id: "amendment-1", reason: "Rebudget personnel" }];
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetAmendments: { findMany: vi.fn().mockResolvedValue(amendments) },
      },
    } as never;

    await expect(listBudgetAmendments(db, { orgId: "org-1", grantId: "grant-1" })).resolves.toEqual(
      amendments,
    );
  });

  it("creates an amendment draft by copying the approved budget version", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [
        {
          id: "period-1",
          label: "Q1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-03-31T00:00:00.000Z"),
          dueDate: null,
          sortOrder: 0,
        },
      ],
      lines: [
        {
          id: "line-1",
          budgetPeriodId: "period-1",
          category: "Personnel",
          description: "Staff time",
          approvedAmountCents: 100000,
          allowable: true,
          costType: "direct",
          programId: "program-1",
          fundId: "fund-1",
          accountingDimensionCode: "5000",
          notes: "Original",
          sortOrder: 0,
        },
      ],
    };
    const draftVersion = { id: "version-2", versionNumber: 2, source: "amendment" };
    const copiedPeriod = { id: "period-2" };
    const copiedLine = { id: "line-2" };
    const amendment = { id: "amendment-1", newBudgetVersionId: "version-2" };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([draftVersion]))
        .mockReturnValueOnce(returningChain([copiedPeriod]))
        .mockReturnValueOnce(returningChain([copiedLine]))
        .mockReturnValueOnce(returningChain([amendment])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({
            versionNumber: 1,
          }),
        },
        documents: { findFirst: vi.fn().mockResolvedValue({ id: "doc-1" }) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
        supportingDocumentId: "doc-1",
      }),
    ).resolves.toEqual({
      amendment,
      budgetVersion: draftVersion,
      periods: [copiedPeriod],
      lines: [copiedLine],
    });
    expect(tx.insert).toHaveBeenCalledTimes(4);
  });

  it("creates an amendment from an approved version with no copied rows or optional metadata", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 7,
      periods: [],
      lines: [],
    };
    const draftVersion = { id: "version-8", versionNumber: 8, source: "amendment" };
    const amendment = { id: "amendment-1", newBudgetVersionId: "version-8" };
    const versionChain = returningChain([draftVersion]);
    const amendmentChain = returningChain([amendment]);
    const tx = {
      insert: vi.fn().mockReturnValueOnce(versionChain).mockReturnValueOnce(amendmentChain),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "  Rebudget personnel  ",
        effectiveDate: "2026-07-01",
      }),
    ).resolves.toEqual({
      amendment,
      budgetVersion: draftVersion,
      periods: [],
      lines: [],
    });

    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(versionChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 8,
        sourceDocumentId: null,
        notes: "Rebudget personnel",
        createdByUserId: null,
      }),
    );
    expect(amendmentChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Rebudget personnel",
        supportingDocumentId: null,
        requestedByUserId: null,
      }),
    );
  });

  it("copies amendment lines without periods as unperioded lines", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [],
      lines: [
        {
          id: "line-1",
          budgetPeriodId: null,
          category: "Supplies",
          description: null,
          approvedAmountCents: 1000,
          allowable: true,
          costType: "direct",
          programId: null,
          fundId: null,
          accountingDimensionCode: null,
          notes: null,
          sortOrder: 0,
        },
      ],
    };
    const draftVersion = { id: "version-2", versionNumber: 2, source: "amendment" };
    const copiedLine = { id: "line-2" };
    const amendment = { id: "amendment-1", newBudgetVersionId: "version-2" };
    const lineChain = returningChain([copiedLine]);
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([draftVersion]))
        .mockReturnValueOnce(lineChain)
        .mockReturnValueOnce(returningChain([amendment])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({
            versionNumber: 1,
          }),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        previousBudgetVersionId: "version-1",
        reason: "Move unperioded line",
        effectiveDate: "2026-07-01",
      }),
    ).resolves.toMatchObject({ lines: [copiedLine] });

    expect(lineChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ budgetPeriodId: null, category: "Supplies" }),
    ]);
  });

  it("treats amendment sources with omitted relation arrays as empty", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
    };
    const draftVersion = { id: "version-2", versionNumber: 2 };
    const amendment = { id: "amendment-1" };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([draftVersion]))
        .mockReturnValueOnce(returningChain([amendment])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({
            versionNumber: 1,
          }),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "No relation arrays",
        effectiveDate: "2026-07-01",
      }),
    ).resolves.toMatchObject({ periods: [], lines: [] });
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it("sets copied line period to null when copied period creation omits the row", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [
        {
          id: "period-1",
          label: "Q1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-03-31T00:00:00.000Z"),
          dueDate: null,
          sortOrder: 0,
        },
      ],
      lines: [
        {
          id: "line-1",
          budgetPeriodId: "period-1",
          category: "Personnel",
          description: null,
          approvedAmountCents: 1000,
          allowable: true,
          costType: "direct",
          programId: null,
          fundId: null,
          accountingDimensionCode: null,
          notes: null,
          sortOrder: 0,
        },
      ],
    };
    const lineChain = returningChain([{ id: "line-2" }]);
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([{ id: "version-2" }]))
        .mockReturnValueOnce(returningChain([]))
        .mockReturnValueOnce(lineChain)
        .mockReturnValueOnce(returningChain([{ id: "amendment-1" }])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({
            versionNumber: 1,
          }),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "Missing copied period",
        effectiveDate: "2026-07-01",
      }),
    ).resolves.toMatchObject({ lines: [{ id: "line-2" }] });

    expect(lineChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ budgetPeriodId: null }),
    ]);
  });

  it("returns not found for missing amendment sources and supporting documents", async () => {
    const missingPreviousDb = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      createBudgetAmendment(missingPreviousDb, {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "missing-version",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const missingDocumentDb = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "approved" }),
        },
        documents: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      createBudgetAmendment(missingDocumentDb, {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
        supportingDocumentId: "missing-doc",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("surfaces internal errors when amendment inserts return no rows", async () => {
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [],
      lines: [],
    };
    const baseDb = (tx: unknown) =>
      ({
        query: {
          grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
          grantBudgetVersions: {
            findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(null),
          },
        },
        transaction: vi.fn(async (callback) => callback(tx)),
      }) as never;

    await expect(
      createBudgetAmendment(baseDb({ insert: vi.fn().mockReturnValueOnce(returningChain([])) }), {
        orgId: "org-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
      }),
    ).rejects.toMatchObject({ status: 500 });

    await expect(
      createBudgetAmendment(
        baseDb({
          insert: vi
            .fn()
            .mockReturnValueOnce(returningChain([{ id: "version-2" }]))
            .mockReturnValueOnce(returningChain([])),
        }),
        {
          orgId: "org-1",
          grantId: "grant-1",
          previousBudgetVersionId: "version-1",
          reason: "Rebudget personnel",
          effectiveDate: "2026-07-01",
        },
      ),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects amendments from non-approved versions", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "draft" }),
        },
      },
      transaction: vi.fn(),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("adds periods and lines only to draft versions", async () => {
    const version = { id: "version-1", status: "draft", grantId: "grant-1" };
    const db = {
      query: {
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(version) },
      },
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([{ id: "period-1" }]))
        .mockReturnValueOnce(returningChain([{ id: "line-1" }])),
    } as never;

    await expect(
      createBudgetPeriod(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }),
    ).resolves.toMatchObject({ id: "period-1" });

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
        allowable: true,
        costType: "direct",
      }),
    ).resolves.toMatchObject({ id: "line-1" });
  });

  it("rejects invalid period input before reading budget versions", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
      },
      insert: vi.fn(),
    } as never;

    await expect(
      createBudgetPeriod(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-04-01",
        endDate: "2026-03-31",
      }),
    ).rejects.toThrow(/Budget period startDate/);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects invalid budget line input before reading budget versions", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: { findFirst },
      },
      insert: vi.fn(),
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: -1,
      }),
    ).rejects.toThrow(/Too small/);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("creates periods with due dates and lines with optional dimensions", async () => {
    const version = { id: "version-1", status: "draft", grantId: "grant-1" };
    const db = {
      query: {
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(version) },
        grantBudgetPeriods: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) },
        programs: { findFirst: vi.fn().mockResolvedValue({ id: "program-1" }) },
        funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1" }) },
      },
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([{ id: "period-1" }]))
        .mockReturnValueOnce(returningChain([{ id: "line-1" }])),
    } as never;

    await expect(
      createBudgetPeriod(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetVersionId: "version-1",
        label: "Q2",
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        dueDate: "2026-07-15",
        sortOrder: 2,
      }),
    ).resolves.toMatchObject({ id: "period-1" });

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetVersionId: "version-1",
        budgetPeriodId: "period-1",
        category: "Indirect",
        description: "Federally approved indirect costs",
        approvedAmountCents: 25000,
        allowable: false,
        costType: "indirect",
        programId: "program-1",
        fundId: "fund-1",
        accountingDimensionCode: "6000",
        notes: "Reviewed",
        sortOrder: 3,
      }),
    ).resolves.toMatchObject({ id: "line-1" });
  });

  it("rejects budget lines assigned to programs outside the org", async () => {
    const version = { id: "version-1", status: "draft", grantId: "grant-1" };
    const insert = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(version) },
        programs: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert,
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
        programId: "program-other-org",
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces internal errors when period and line inserts return no rows", async () => {
    const version = { id: "version-1", status: "draft", grantId: "grant-1" };
    const db = {
      query: {
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(version) },
      },
      insert: vi.fn(() => returningChain([])),
    } as never;

    await expect(
      createBudgetPeriod(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }),
    ).rejects.toMatchObject({ status: 500 });

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects direct line creation on approved versions", async () => {
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "approved" }),
        },
      },
      insert: vi.fn(),
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("returns not found when adding a line to a missing budget version", async () => {
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn(),
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "missing-version",
        category: "Personnel",
        approvedAmountCents: 100000,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects budget lines that reference a period outside the current version", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "draft" }),
        },
        grantBudgetPeriods: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert,
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        budgetPeriodId: "period-from-another-version",
        category: "Personnel",
        approvedAmountCents: 100000,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects budget lines that reference a fund outside the org", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "draft" }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert,
    } as never;

    await expect(
      createBudgetLine(db, {
        orgId: "org-1",
        grantId: "grant-1",
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
        fundId: "fund-from-another-org",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("approves a draft version and supersedes all prior approved versions", async () => {
    const approved = { id: "version-2", status: "approved" };
    const findMany = vi.fn().mockResolvedValue([
      { id: "version-1", status: "approved" },
      { id: "version-0", status: "approved" },
    ]);
    const tx = {
      update: vi
        .fn()
        .mockReturnValueOnce(returningChain([{ id: "version-1", status: "superseded" }]))
        .mockReturnValueOnce(returningChain([approved])),
    };
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "version-2", status: "draft", grantId: "grant-1" }),
          findMany,
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      approveBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        versionId: "version-2",
      }),
    ).resolves.toEqual(approved);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);
  });

  it("approves a draft version at an explicit approval date", async () => {
    const approved = { id: "version-2", status: "approved" };
    const tx = {
      update: vi.fn().mockReturnValue(returningChain([approved])),
    };
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "version-2", status: "draft", grantId: "grant-1" }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      approveBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        versionId: "version-2",
        approvedAt: "2026-02-01",
      }),
    ).resolves.toEqual(approved);
  });

  it("returns a conflict when concurrent approval violates the approved version guardrail", async () => {
    const duplicate = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-2", status: "draft" }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      transaction: vi.fn().mockRejectedValue(duplicate),
    } as never;

    await expect(
      approveBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        versionId: "version-2",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("surfaces internal errors when approval updates no rows", async () => {
    const tx = {
      update: vi.fn(() => returningChain([])),
    };
    const db = {
      query: {
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValue({ id: "version-2", status: "draft" }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never;

    await expect(
      approveBudgetVersion(db, {
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        versionId: "version-2",
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("createBudgetVersion: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const version = { id: "version-1", versionNumber: 1, status: "draft" };
    const dbBase = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(() => returningChain([version])),
    };
    const db = withTransaction(dbBase);

    await createBudgetVersion(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      source: "manual",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant_budget_version", action: "created" }),
    );
  });

  it("createBudgetVersion: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const version = { id: "version-1", versionNumber: 1, status: "draft" };
    const dbBase2 = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(() => returningChain([version])),
    };
    const db = withTransaction(dbBase2);

    await expect(
      createBudgetVersion(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        source: "manual",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createBudgetAmendment: log fires inside transaction — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [],
      lines: [],
    };
    const draftVersion = { id: "version-2", versionNumber: 2 };
    const amendment = { id: "amendment-1" };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([draftVersion]))
        .mockReturnValueOnce(returningChain([amendment])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx)),
    } as never;

    await createBudgetAmendment(db, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      previousBudgetVersionId: "version-1",
      reason: "Rebudget",
      effectiveDate: "2026-07-01",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant_budget_amendment", action: "created" }),
    );
  });

  it("createBudgetAmendment: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const previous = {
      id: "version-1",
      status: "approved",
      versionNumber: 1,
      periods: [],
      lines: [],
    };
    const draftVersion = { id: "version-2", versionNumber: 2 };
    const amendment = { id: "amendment-1" };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(returningChain([draftVersion]))
        .mockReturnValueOnce(returningChain([amendment])),
    };
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Grant" }) },
        grantBudgetVersions: {
          findFirst: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx)),
    } as never;

    await expect(
      createBudgetAmendment(db, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget",
        effectiveDate: "2026-07-01",
      }),
    ).rejects.toThrow("audit log down");
  });
});
