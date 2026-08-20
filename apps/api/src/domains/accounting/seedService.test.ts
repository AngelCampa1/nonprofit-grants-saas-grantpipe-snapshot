import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the posting engine — we want to verify it's called, not re-test its internals
vi.mock("./postingEngine", () => ({
  postDonation: vi.fn(),
  postExpense: vi.fn(),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: vi.fn(),
}));

import { postDonation, postExpense } from "./postingEngine";
import { seedOpeningBalances, getOpeningBalancePreview } from "./seedService";
import { badRequest, conflict } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock insert chain: .insert().values().returning()
 */
function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  return { insertFn: vi.fn().mockReturnValue({ values: valuesFn }), returningFn };
}

/**
 * Build a minimal mock update chain: .update().set().where().returning()
 */
function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  return { updateFn: vi.fn().mockReturnValue({ set: setFn }), returningFn };
}

// ---------------------------------------------------------------------------
// Structured DB mock factory
// ---------------------------------------------------------------------------

interface MockDbOptions {
  accountingEnabled: boolean;
  orgCreatedAt?: Date;
  firstFiscalPeriod?: { id: string; startDate: Date } | null;
  existingOpeningPeriod?: { id: string; name: string } | null;
  donations?: Array<{ id: string }>;
  expenses?: Array<{ id: string }>;
}

function buildMockDb(opts: MockDbOptions) {
  const orgCreatedAt = opts.orgCreatedAt ?? new Date("2024-01-01T00:00:00Z");
  const org = {
    id: "org-1",
    createdAt: orgCreatedAt,
    accountingEnabled: opts.accountingEnabled,
  };
  const firstPeriod =
    opts.firstFiscalPeriod !== undefined
      ? opts.firstFiscalPeriod
      : { id: "fp-1", startDate: new Date("2024-07-01T00:00:00Z") };
  const existingOpeningPeriod =
    opts.existingOpeningPeriod !== undefined ? opts.existingOpeningPeriod : null;
  const donationRows = opts.donations ?? [{ id: "d-1" }, { id: "d-2" }];
  const expenseRows = opts.expenses ?? [{ id: "e-1" }];

  // select() calls in order:
  //   1. organizations → [org]
  //   2. fiscalPeriods (ordered by startDate) → [firstPeriod] or []
  // Then for dryRun:
  //   3. count donations → [{ count: N }]
  //   4. count expenses  → [{ count: N }]
  // For commit (inside transaction — handled separately):
  //   see txDb below

  let outerSelectIdx = 0;
  const outerSelectSequence = [
    [org],
    firstPeriod ? [firstPeriod] : [],
    [{ count: donationRows.length }],
    [{ count: expenseRows.length }],
  ];

  const outerSelectFn = vi.fn().mockImplementation(() => {
    const response = outerSelectSequence[outerSelectIdx++] ?? [];
    const offsetFn = vi.fn().mockResolvedValue(response);
    const limitFn = vi.fn().mockReturnValue({ offset: offsetFn });
    const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
    const whereResult = Object.assign(Promise.resolve(response), {
      orderBy: orderByFn,
      limit: limitFn,
    });
    const whereFn = vi.fn().mockReturnValue(whereResult);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    return { from: fromFn };
  });

  const { insertFn } = makeInsertMock({
    id: "op-1",
    name: "Opening Balances",
    status: "open",
  });
  const { updateFn } = makeUpdateMock({ id: "op-1", status: "closed" });

  // Transaction mock — the callback receives a tx object
  const txFn = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => {
    let txSelectIdx = 0;
    // Inside tx, select calls in order:
    //   0. fiscalPeriods WHERE name = 'Opening Balances' → existingOpeningPeriod or []
    //   1. donations in range → donationRows
    //   2. expenses in range  → expenseRows
    const txSelectSequence = [
      existingOpeningPeriod ? [existingOpeningPeriod] : [],
      donationRows,
      expenseRows,
    ];

    const txSelectFn = vi.fn().mockImplementation(() => {
      const response = txSelectSequence[txSelectIdx++] ?? [];
      const offsetFn = vi.fn().mockResolvedValue(response);
      const limitFn = vi.fn().mockReturnValue({ offset: offsetFn });
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereResult = Object.assign(Promise.resolve(response), {
        orderBy: orderByFn,
        limit: limitFn,
      });
      const whereFn = vi.fn().mockReturnValue(whereResult);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      return { from: fromFn };
    });

    const txInsertFn = vi.fn().mockImplementation(() => {
      const returningFn = vi
        .fn()
        .mockResolvedValue([{ id: "op-1", name: "Opening Balances", status: "open" }]);
      return { values: vi.fn().mockReturnValue({ returning: returningFn }) };
    });

    const txUpdateFn = vi.fn().mockImplementation(() => {
      const returningFn = vi.fn().mockResolvedValue([{ id: "op-1", status: "closed" }]);
      const whereFn2 = vi.fn().mockReturnValue({ returning: returningFn });
      const setFn = vi.fn().mockReturnValue({ where: whereFn2 });
      return { set: setFn };
    });

    const tx = {
      select: txSelectFn,
      insert: txInsertFn,
      update: txUpdateFn,
    };
    return callback(tx);
  });

  return {
    select: outerSelectFn,
    insert: insertFn,
    update: updateFn,
    transaction: txFn,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const BASE_PARAMS = { orgId: "org-1", actorId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedOpeningBalances", () => {
  describe("org not found", () => {
    it("throws badRequest when organization does not exist", async () => {
      // Simulate org not found: make the first select return []
      let outerSelectIdx = 0;
      const outerSelectSequence: unknown[][] = [
        [], // organizations → empty
      ];
      const outerSelectFn = vi.fn().mockImplementation(() => {
        const response = outerSelectSequence[outerSelectIdx++] ?? [];
        const offsetFn = vi.fn().mockResolvedValue(response);
        const limitFn = vi.fn().mockReturnValue({ offset: offsetFn });
        const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
        const whereResult = Object.assign(Promise.resolve(response), {
          orderBy: orderByFn,
          limit: limitFn,
        });
        const whereFn = vi.fn().mockReturnValue(whereResult);
        const fromFn = vi.fn().mockReturnValue({ where: whereFn });
        return { from: fromFn };
      });
      const db = { select: outerSelectFn, transaction: vi.fn() };

      await expect(
        seedOpeningBalances(db as never, { ...BASE_PARAMS, dryRun: false }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("accountingEnabled = false", () => {
    it("throws badRequest when accounting is not enabled", async () => {
      const db = buildMockDb({ accountingEnabled: false });
      await expect(
        seedOpeningBalances(db as never, { ...BASE_PARAMS, dryRun: false }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("inverted period guard", () => {
    it("throws badRequest when openingEnd <= openingStart (org created on or after first fiscal period start)", async () => {
      // org created on 2024-07-01 = same day as firstFiscalPeriod.startDate
      // openingEnd = firstPeriodStart - 1ms = 2024-06-30T23:59:59.999Z < orgCreatedAt = 2024-07-01T00:00:00Z
      // → openingEnd < openingStart → guard fires
      const db = buildMockDb({
        accountingEnabled: true,
        orgCreatedAt: new Date("2024-07-01T00:00:00Z"),
        firstFiscalPeriod: { id: "fp-1", startDate: new Date("2024-07-01T00:00:00Z") },
      });

      await expect(
        seedOpeningBalances(db as never, { ...BASE_PARAMS, dryRun: false }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("dryRun = true", () => {
    it("works even when accounting is not yet enabled (preview before enabling)", async () => {
      const db = buildMockDb({
        accountingEnabled: false,
        donations: [{ id: "d-1" }],
        expenses: [],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.donations).toBe(1);
      expect(result.expenses).toBe(0);
    });

    it("returns counts without inserting or calling posting engine", async () => {
      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }, { id: "d-2" }],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.donations).toBe(2);
      expect(result.expenses).toBe(1);
      expect(result.estimatedJEs).toBe(4); // 2 + (1 * 2)
      expect(result.fiscalPeriodCreated).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(postDonation).not.toHaveBeenCalled();
      expect(postExpense).not.toHaveBeenCalled();
      // Should not call transaction
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("handles no fiscal periods — uses current date as openingEnd", async () => {
      const db = buildMockDb({
        accountingEnabled: true,
        firstFiscalPeriod: null,
        donations: [],
        expenses: [],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.donations).toBe(0);
      expect(result.expenses).toBe(0);
      expect(result.estimatedJEs).toBe(0);
    });
  });

  describe("dryRun = false — full commit", () => {
    it("creates fiscal period, calls postDonation and postExpense, closes period", async () => {
      vi.mocked(postDonation).mockResolvedValue(undefined);
      vi.mocked(postExpense).mockResolvedValue(undefined);

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }, { id: "d-2" }],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.donations).toBe(2);
      expect(result.expenses).toBe(1);
      expect(result.fiscalPeriodCreated).toBe(true);
      expect(result.errors).toHaveLength(0);

      expect(postDonation).toHaveBeenCalledTimes(2);
      expect(postExpense).toHaveBeenCalledTimes(1);
      expect(postDonation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          donationId: "d-1",
          action: "create",
        }),
      );
      expect(postExpense).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          expenseId: "e-1",
          action: "create",
        }),
      );
    });

    it("throws badRequest when opening balances already seeded", async () => {
      const db = buildMockDb({
        accountingEnabled: true,
        existingOpeningPeriod: { id: "op-old", name: "Opening Balances" },
        donations: [],
        expenses: [],
      });

      await expect(
        seedOpeningBalances(db as never, { ...BASE_PARAMS, dryRun: false }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("per-record donation error (raw Error) → record id captured, raw message NOT leaked", async () => {
      // A raw Error (e.g. a Drizzle/Postgres failure) can carry SQL fragments,
      // table/column/constraint names, or connection detail. The result returned
      // to the client must surface only a generic message, never the raw text.
      vi.mocked(postDonation)
        .mockRejectedValueOnce(new Error('column "secret_col" violates constraint "pg_internal"'))
        .mockResolvedValue(undefined);
      vi.mocked(postExpense).mockResolvedValue(undefined);

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }, { id: "d-2" }],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("d-1");
      expect(result.errors[0]).not.toContain("secret_col");
      expect(result.errors[0]).not.toContain("pg_internal");
      expect(result.errors[0]).toContain("posting failed");
      expect(postDonation).toHaveBeenCalledTimes(2);
      expect(result.donations).toBe(2);
      expect(captureBackgroundException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Opening balance posting failed" }),
        "opening_balances",
        {
          org_id: "org-1",
          kind: "donation",
          operation: "seed_posting",
        },
      );
    });

    it("per-record donation error (AppError) → intentional safe message preserved", async () => {
      vi.mocked(postDonation)
        .mockRejectedValueOnce(conflict("Donation already posted"))
        .mockResolvedValue(undefined);
      vi.mocked(postExpense).mockResolvedValue(undefined);

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }],
        expenses: [],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("d-1");
      expect(result.errors[0]).toContain("Donation already posted");
      expect(captureBackgroundException).not.toHaveBeenCalled();
    });

    it("per-record donation error (non-Error) → raw value NOT leaked", async () => {
      vi.mocked(postDonation)
        .mockRejectedValueOnce("string error — not an Error instance")
        .mockResolvedValue(undefined);
      vi.mocked(postExpense).mockResolvedValue(undefined);

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }],
        expenses: [],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("d-1");
      expect(result.errors[0]).not.toContain("string error");
      expect(result.errors[0]).toContain("posting failed");
      expect(captureBackgroundException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Opening balance posting failed" }),
        "opening_balances",
        {
          org_id: "org-1",
          kind: "donation",
          operation: "seed_posting",
        },
      );
    });

    it("per-record expense error (raw Error) → record id captured, raw message NOT leaked", async () => {
      vi.mocked(postDonation).mockResolvedValue(undefined);
      vi.mocked(postExpense).mockRejectedValueOnce(
        new Error('relation "journal_entries" does not exist'),
      );

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [{ id: "d-1" }],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("e-1");
      expect(result.errors[0]).not.toContain("journal_entries");
      expect(result.errors[0]).toContain("posting failed");
      expect(postExpense).toHaveBeenCalledTimes(1);
      expect(captureBackgroundException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Opening balance posting failed" }),
        "opening_balances",
        {
          org_id: "org-1",
          kind: "expense",
          operation: "seed_posting",
        },
      );
    });

    it("per-record expense error (AppError) → intentional safe message preserved", async () => {
      vi.mocked(postDonation).mockResolvedValue(undefined);
      vi.mocked(postExpense).mockRejectedValueOnce(badRequest("No open period"));

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("e-1");
      expect(result.errors[0]).toContain("No open period");
      expect(captureBackgroundException).not.toHaveBeenCalled();
    });

    it("per-record expense error (non-Error) → raw value NOT leaked", async () => {
      vi.mocked(postDonation).mockResolvedValue(undefined);
      vi.mocked(postExpense).mockRejectedValueOnce(42);

      const db = buildMockDb({
        accountingEnabled: true,
        donations: [],
        expenses: [{ id: "e-1" }],
      });

      const result = await seedOpeningBalances(db as never, {
        ...BASE_PARAMS,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("e-1");
      expect(result.errors[0]).not.toContain("42");
      expect(result.errors[0]).toContain("posting failed");
    });
  });

  describe("null-row count branch", () => {
    it("dryRun: counts default to 0 when count row is missing from query result", async () => {
      // Build a db where count queries return [] (no row) to hit the `?? 0` branch
      let outerSelectIdx = 0;
      const org = {
        id: "org-1",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        accountingEnabled: true,
      };
      const firstPeriod = { id: "fp-1", startDate: new Date("2024-07-01T00:00:00Z") };
      const outerSelectSequence: unknown[][] = [
        [org], // organizations
        [firstPeriod], // first fiscal period
        [], // count donations → empty → row undefined → ?? 0
        [], // count expenses  → empty → row undefined → ?? 0
      ];
      const outerSelectFn = vi.fn().mockImplementation(() => {
        const response = outerSelectSequence[outerSelectIdx++] ?? [];
        const offsetFn = vi.fn().mockResolvedValue(response);
        const limitFn = vi.fn().mockReturnValue({ offset: offsetFn });
        const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
        const whereResult = Object.assign(Promise.resolve(response), {
          orderBy: orderByFn,
          limit: limitFn,
        });
        const whereFn = vi.fn().mockReturnValue(whereResult);
        const fromFn = vi.fn().mockReturnValue({ where: whereFn });
        return { from: fromFn };
      });
      const db = { select: outerSelectFn, transaction: vi.fn() };

      const result = await seedOpeningBalances(db as never, { ...BASE_PARAMS, dryRun: true });
      expect(result.donations).toBe(0);
      expect(result.expenses).toBe(0);
    });
  });
});

describe("getOpeningBalancePreview", () => {
  it("returns preview counts without modifying the DB", async () => {
    const db = buildMockDb({
      accountingEnabled: true,
      donations: [{ id: "d-1" }],
      expenses: [{ id: "e-1" }, { id: "e-2" }],
    });

    const result = await getOpeningBalancePreview(db as never, { orgId: "org-1" });

    expect(result.dryRun).toBe(true);
    expect(result.donations).toBe(1);
    expect(result.expenses).toBe(2);
    expect(result.estimatedJEs).toBe(5); // 1 + (2 * 2)
    expect(result.fiscalPeriodCreated).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(postDonation).not.toHaveBeenCalled();
    expect(postExpense).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
