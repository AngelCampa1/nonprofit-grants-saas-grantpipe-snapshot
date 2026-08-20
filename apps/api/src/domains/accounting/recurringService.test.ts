import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";

// ---------------------------------------------------------------------------
// Module mocks — must appear before import of the module under test
// ---------------------------------------------------------------------------

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));
vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("@grantpipe/db", () => ({
  recurringJournalTemplates: {
    id: "recurringJournalTemplates.id",
    orgId: "recurringJournalTemplates.orgId",
    name: "recurringJournalTemplates.name",
    isActive: "recurringJournalTemplates.isActive",
    nextRunDate: "recurringJournalTemplates.nextRunDate",
    createdBy: "recurringJournalTemplates.createdBy",
    frequency: "recurringJournalTemplates.frequency",
    deletedAt: "recurringJournalTemplates.deletedAt",
  },
  fiscalPeriods: {
    id: "fiscalPeriods.id",
    orgId: "fiscalPeriods.orgId",
    status: "fiscalPeriods.status",
    startDate: "fiscalPeriods.startDate",
    endDate: "fiscalPeriods.endDate",
  },
  journalEntries: {
    id: "journalEntries.id",
    orgId: "journalEntries.orgId",
    entryNumber: "journalEntries.entryNumber",
  },
  journalLines: {
    id: "journalLines.id",
    orgId: "journalLines.orgId",
    journalEntryId: "journalLines.journalEntryId",
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  runTemplate,
  tickRecurring,
} from "./recurringService";

// ---------------------------------------------------------------------------
// DB mock builder
// ---------------------------------------------------------------------------

/**
 * Mocks the Drizzle ORM chain used in recurringService.
 *
 * query.*.findFirst resolves from queryQueue in order.
 * select() resolves from selectQueue.
 * insert().values().returning() resolves from insertQueue.
 * update().set().where() resolves to [].
 * delete().where() resolves to [].
 */
function makeDb(options: {
  queryQueue?: unknown[];
  selectQueue?: unknown[][];
  insertQueue?: unknown[][];
  updateResult?: unknown[];
}) {
  const queryQueue = [...(options.queryQueue ?? [])];
  const selectQueue = [...(options.selectQueue ?? [])];
  const insertQueue = [...(options.insertQueue ?? [])];
  const updateResult = options.updateResult ?? [];

  const findFirst = vi.fn().mockImplementation(() => {
    return Promise.resolve(queryQueue.shift() ?? null);
  });

  const queryProxy = new Proxy(
    {},
    {
      get: () => ({ findFirst }),
    },
  );

  const selectFn = vi.fn().mockImplementation(() => {
    const result = selectQueue.shift() ?? [];
    // Support both .from().where() (tickRecurring) and .from().where().orderBy() (listRecurringTemplates)
    const whereFn = vi.fn().mockImplementation(() => {
      const whereResult = Object.assign(Promise.resolve(result), {
        orderBy: vi.fn().mockResolvedValue(result),
      });
      return whereResult;
    });
    return {
      from: vi.fn().mockReturnValue({ where: whereFn }),
    };
  });

  const returningFn = vi.fn().mockImplementation(() => {
    return Promise.resolve(insertQueue.shift() ?? [{ id: "inserted-id" }]);
  });
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningFn }),
  });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });

  const updateWhereFn = vi.fn().mockResolvedValue(updateResult);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const deleteWhereFn = vi.fn().mockResolvedValue([]);
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhereFn });

  const transactionFn = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txDb = makeTxDb(insertQueue);
      return cb(txDb);
    });

  return {
    query: queryProxy,
    select: selectFn,
    insert: insertFn,
    update: updateFn,
    delete: deleteFn,
    transaction: transactionFn,
    // expose for assertions
    _findFirst: findFirst,
    _update: updateFn,
    _delete: deleteFn,
  };
}

/**
 * Minimal transaction db mock (used inside db.transaction callbacks).
 * It shares the same insertQueue reference from makeDb so inserts pop from the right place.
 */
function makeTxDb(insertQueue: unknown[][]) {
  const returningFn = vi.fn().mockImplementation(() => {
    return Promise.resolve(insertQueue.shift() ?? [{ id: "tx-inserted-id", entryNumber: 1 }]);
  });
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningFn }),
  });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });

  // select inside transaction: for getNextEntryNumber we need to return a max row
  const selectFn = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ max: 0 }]),
    }),
  }));

  // update inside transaction: nextRunDate update is now atomic inside the tx
  const updateWhereFn = vi.fn().mockResolvedValue([]);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  return {
    insert: insertFn,
    select: selectFn,
    update: updateFn,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BALANCED_LINES = [
  { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
  { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
];

const UNBALANCED_LINES = [
  { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
  { accountId: "acc-2", debitCents: 0, creditCents: 5000 },
];

const TEMPLATE_BASE = {
  id: "tmpl-1",
  orgId: "org-1",
  name: "Monthly Rent",
  description: null,
  frequency: "monthly" as const,
  nextRunDate: new Date(2026, 1, 1), // Feb 1, 2026 local
  isActive: true,
  fiscalPeriodId: null,
  memo: "Monthly rent expense",
  lines: BALANCED_LINES,
  createdBy: "user-1",
  createdAt: new Date(2026, 0, 1),
  updatedAt: new Date(2026, 0, 1),
};

const FISCAL_PERIOD_OPEN = {
  id: "fp-1",
  orgId: "org-1",
  status: "open",
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 11, 31),
};

// ---------------------------------------------------------------------------
// createRecurringTemplate
// ---------------------------------------------------------------------------

describe("createRecurringTemplate", () => {
  it("creates a template with balanced lines and explicit isActive", async () => {
    const created = { ...TEMPLATE_BASE, id: "new-tmpl" };
    const db = makeDb({ insertQueue: [[created]] });

    const result = await createRecurringTemplate(
      db as unknown as Parameters<typeof createRecurringTemplate>[0],
      {
        orgId: "org-1",
        actorId: "user-1",
        name: "Monthly Rent",
        frequency: "monthly",
        nextRunDate: "2026-02-01T00:00:00.000Z",
        isActive: true,
        lines: BALANCED_LINES,
      },
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(created);
  });

  it("uses isActive default (true) when not provided — covers isActive ?? true branch", async () => {
    // isActive is omitted: schema default(true) handles it, but the ?? true branch in the service
    // is exercised when isActive is undefined
    const created = { ...TEMPLATE_BASE, id: "new-tmpl-default" };
    const db = makeDb({ insertQueue: [[created]] });

    const result = await createRecurringTemplate(
      db as unknown as Parameters<typeof createRecurringTemplate>[0],
      {
        orgId: "org-1",
        actorId: "user-1",
        name: "Monthly Rent",
        frequency: "monthly",
        nextRunDate: "2026-02-01T00:00:00.000Z",
        isActive: undefined as unknown as boolean, // explicit undefined to hit ?? branch
        lines: BALANCED_LINES,
      },
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(created);
  });

  it("throws badRequest for unbalanced lines", async () => {
    const db = makeDb({});

    await expect(
      createRecurringTemplate(db as unknown as Parameters<typeof createRecurringTemplate>[0], {
        orgId: "org-1",
        actorId: "user-1",
        name: "Bad Template",
        frequency: "monthly",
        nextRunDate: "2026-02-01T00:00:00.000Z",
        isActive: true,
        lines: UNBALANCED_LINES,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateRecurringTemplate
// ---------------------------------------------------------------------------

describe("updateRecurringTemplate", () => {
  it("updates a template successfully (name only)", async () => {
    const updated = { ...TEMPLATE_BASE, name: "Updated Rent" };
    const db = makeDb({
      queryQueue: [TEMPLATE_BASE],
      updateResult: [updated],
    });

    // Wire up update().set().where().returning()
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    db._update.mockReturnValue({ set: setFn });

    const result = await updateRecurringTemplate(
      db as unknown as Parameters<typeof updateRecurringTemplate>[0],
      { orgId: "org-1", templateId: "tmpl-1", name: "Updated Rent" },
    );

    expect(result).toEqual(updated);
  });

  it("updates all fields including optional nullable ones", async () => {
    const updated = {
      ...TEMPLATE_BASE,
      name: "New Name",
      description: null,
      frequency: "quarterly" as const,
      nextRunDate: new Date(2026, 3, 1),
      isActive: false,
      fiscalPeriodId: null,
      memo: null,
      lines: BALANCED_LINES,
    };
    const db = makeDb({ queryQueue: [TEMPLATE_BASE] });
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    db._update.mockReturnValue({ set: setFn });

    const result = await updateRecurringTemplate(
      db as unknown as Parameters<typeof updateRecurringTemplate>[0],
      {
        orgId: "org-1",
        templateId: "tmpl-1",
        name: "New Name",
        description: null,
        frequency: "quarterly",
        nextRunDate: "2026-04-01T00:00:00.000Z",
        isActive: false,
        fiscalPeriodId: null,
        memo: null,
        lines: BALANCED_LINES,
      },
    );

    expect(result).toEqual(updated);
  });

  it("throws notFound when template does not exist", async () => {
    const db = makeDb({ queryQueue: [null] });

    await expect(
      updateRecurringTemplate(db as unknown as Parameters<typeof updateRecurringTemplate>[0], {
        orgId: "org-1",
        templateId: "missing",
        name: "x",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws badRequest for unbalanced lines on update", async () => {
    const db = makeDb({ queryQueue: [TEMPLATE_BASE] });

    await expect(
      updateRecurringTemplate(db as unknown as Parameters<typeof updateRecurringTemplate>[0], {
        orgId: "org-1",
        templateId: "tmpl-1",
        lines: UNBALANCED_LINES,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// deleteRecurringTemplate
// ---------------------------------------------------------------------------

describe("deleteRecurringTemplate", () => {
  it("soft-deletes an existing template", async () => {
    const db = makeDb({ queryQueue: [TEMPLATE_BASE] });

    await deleteRecurringTemplate(db as unknown as Parameters<typeof deleteRecurringTemplate>[0], {
      orgId: "org-1",
      templateId: "tmpl-1",
    });

    expect(db._update).toHaveBeenCalledTimes(1);
  });

  it("throws notFound when template does not exist", async () => {
    const db = makeDb({ queryQueue: [null] });

    await expect(
      deleteRecurringTemplate(db as unknown as Parameters<typeof deleteRecurringTemplate>[0], {
        orgId: "org-1",
        templateId: "missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// getRecurringTemplate
// ---------------------------------------------------------------------------

describe("getRecurringTemplate", () => {
  it("returns the template when found", async () => {
    const db = makeDb({ queryQueue: [TEMPLATE_BASE] });

    const result = await getRecurringTemplate(
      db as unknown as Parameters<typeof getRecurringTemplate>[0],
      { orgId: "org-1", templateId: "tmpl-1" },
    );

    expect(result).toEqual(TEMPLATE_BASE);
  });

  it("throws notFound when template is missing", async () => {
    const db = makeDb({ queryQueue: [null] });

    await expect(
      getRecurringTemplate(db as unknown as Parameters<typeof getRecurringTemplate>[0], {
        orgId: "org-1",
        templateId: "missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// listRecurringTemplates
// ---------------------------------------------------------------------------

describe("listRecurringTemplates", () => {
  it("lists all templates for org", async () => {
    const templates = [TEMPLATE_BASE];
    const db = makeDb({ selectQueue: [templates] });

    const result = await listRecurringTemplates(
      db as unknown as Parameters<typeof listRecurringTemplates>[0],
      { orgId: "org-1" },
    );

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(result).toEqual(templates);
  });

  it("filters by isActive = true", async () => {
    const templates = [TEMPLATE_BASE];
    const db = makeDb({ selectQueue: [templates] });

    await listRecurringTemplates(db as unknown as Parameters<typeof listRecurringTemplates>[0], {
      orgId: "org-1",
      isActive: true,
    });

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("filters by isActive = false", async () => {
    const db = makeDb({ selectQueue: [[]] });

    const result = await listRecurringTemplates(
      db as unknown as Parameters<typeof listRecurringTemplates>[0],
      { orgId: "org-1", isActive: false },
    );

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runTemplate
// ---------------------------------------------------------------------------

describe("runTemplate", () => {
  it("runs a monthly template and advances nextRunDate by 1 month", async () => {
    // nextRunDate = 2026-02-01 local, after run → 2026-03-01
    const template = { ...TEMPLATE_BASE, nextRunDate: new Date(2026, 1, 1) };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      // Lines insert uses .values() only (no .returning()), so only JE insert consumes insertQueue
      insertQueue: [[{ id: "je-new", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    expect(result.journalEntryId).toBe("je-new");
    // 2026-02-01 + 1 month = 2026-03-01
    expect(result.nextRunDate.getFullYear()).toBe(2026);
    expect(result.nextRunDate.getMonth()).toBe(2); // 0-indexed March
    expect(result.nextRunDate.getDate()).toBe(1);
  });

  it("runs a quarterly template and advances nextRunDate by 3 months", async () => {
    // Use local-safe date constructor to avoid UTC timezone shifts
    const template = {
      ...TEMPLATE_BASE,
      frequency: "quarterly" as const,
      nextRunDate: new Date(2026, 0, 15), // Jan 15, 2026 (local)
    };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-q", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    // 2026-01-15 + 3 months = 2026-04-15
    expect(result.nextRunDate.getFullYear()).toBe(2026);
    expect(result.nextRunDate.getMonth()).toBe(3); // 0-indexed April
    expect(result.nextRunDate.getDate()).toBe(15);
  });

  it("runs an annually template and advances nextRunDate by 1 year", async () => {
    // Use local-safe date constructor to avoid UTC timezone shifts
    const template = {
      ...TEMPLATE_BASE,
      frequency: "annually" as const,
      nextRunDate: new Date(2026, 2, 15), // Mar 15, 2026 (local)
    };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-a", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    // 2026-03-15 + 1 year = 2027-03-15
    expect(result.nextRunDate.getFullYear()).toBe(2027);
    expect(result.nextRunDate.getMonth()).toBe(2); // 0-indexed March
    expect(result.nextRunDate.getDate()).toBe(15);
  });

  it("annually: Feb 29 leap year clamps to Feb 28 next non-leap year", async () => {
    // 2024 is a leap year; 2024-02-29 annually → 2025-02-28 (not Mar 1)
    const template = {
      ...TEMPLATE_BASE,
      frequency: "annually" as const,
      nextRunDate: new Date(2024, 1, 29), // Feb 29, 2024
    };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-leap", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    // 2024-02-29 + 12 months → should clamp to 2025-02-28 (not 2025-03-01)
    expect(result.nextRunDate.getFullYear()).toBe(2025);
    expect(result.nextRunDate.getMonth()).toBe(1); // February (0-indexed)
    expect(result.nextRunDate.getDate()).toBe(28);
  });

  it("monthly: Jan 31 clamps to Feb 28 (non-leap year)", async () => {
    // 2025-01-31 + 1 month → 2025-02-28 (Feb 2025 has 28 days)
    const template = {
      ...TEMPLATE_BASE,
      frequency: "monthly" as const,
      nextRunDate: new Date(2025, 0, 31), // Jan 31, 2025
    };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-jan31", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    // 2025-01-31 + 1 month → should clamp to 2025-02-28 (not 2025-03-03)
    expect(result.nextRunDate.getFullYear()).toBe(2025);
    expect(result.nextRunDate.getMonth()).toBe(1); // February (0-indexed)
    expect(result.nextRunDate.getDate()).toBe(28);
  });

  it("quarterly: Jan 31 clamps to Apr 30 (not May 1)", async () => {
    // 2025-01-31 + 3 months → 2025-04-30 (April has 30 days)
    const template = {
      ...TEMPLATE_BASE,
      frequency: "quarterly" as const,
      nextRunDate: new Date(2025, 0, 31), // Jan 31, 2025
    };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-q-jan31", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    // 2025-01-31 + 3 months → should clamp to 2025-04-30 (not 2025-05-01)
    expect(result.nextRunDate.getFullYear()).toBe(2025);
    expect(result.nextRunDate.getMonth()).toBe(3); // April (0-indexed)
    expect(result.nextRunDate.getDate()).toBe(30);
  });

  it("throws notFound when template does not exist", async () => {
    const db = makeDb({ queryQueue: [null] });

    await expect(
      runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
        orgId: "org-1",
        actorId: "user-1",
        templateId: "missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws badRequest when no open fiscal period for current date", async () => {
    // Template has no fiscalPeriodId override, no open period found
    const template = { ...TEMPLATE_BASE, fiscalPeriodId: null };
    const db = makeDb({
      queryQueue: [template, null], // no period
    });

    await expect(
      runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
        orgId: "org-1",
        actorId: "user-1",
        templateId: "tmpl-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("uses fiscalPeriodId override on template (skips period lookup)", async () => {
    const template = { ...TEMPLATE_BASE, fiscalPeriodId: "fp-override" };
    const db = makeDb({
      queryQueue: [template], // only one query: the template itself
      insertQueue: [[{ id: "je-override", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    expect(result.journalEntryId).toBe("je-override");
    // findFirst only called once (for template, not period)
    expect(db._findFirst).toHaveBeenCalledTimes(1);
  });

  it("uses null memo when template has no memo — covers template.memo ?? null branch", async () => {
    const template = { ...TEMPLATE_BASE, memo: null };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-no-memo", entryNumber: 1 }]],
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    expect(result.journalEntryId).toBe("je-no-memo");
  });

  it("getNextEntryNumber handles null max (no prior entries) — covers row?.max ?? 0 branch", async () => {
    // This is exercised inside db.transaction() via txDb.select().from().where()
    // The txDb mock returns [{ max: null }] to cover the ?? 0 branch
    const template = { ...TEMPLATE_BASE };
    const db = makeDb({
      queryQueue: [template, FISCAL_PERIOD_OPEN],
      insertQueue: [[{ id: "je-first", entryNumber: 1 }]],
    });

    // Override txDb to return max=null
    db.transaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txWithNullMax = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ max: null }]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation(() => {
            const returning = vi.fn().mockResolvedValue([{ id: "je-first", entryNumber: 1 }]);
            return {
              returning,
              onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
            };
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      return cb(txWithNullMax);
    });

    const result = await runTemplate(db as unknown as Parameters<typeof runTemplate>[0], {
      orgId: "org-1",
      actorId: "user-1",
      templateId: "tmpl-1",
    });

    expect(result.journalEntryId).toBe("je-first");
  });
});

// ---------------------------------------------------------------------------
// tickRecurring
// ---------------------------------------------------------------------------

describe("tickRecurring", () => {
  it("runs due templates, counts ran and skips non-due", async () => {
    const dueTemplates = [
      { ...TEMPLATE_BASE, id: "t1", nextRunDate: new Date("2026-01-01") },
      { ...TEMPLATE_BASE, id: "t2", nextRunDate: new Date("2026-01-01") },
    ];

    const db = makeDb({
      selectQueue: [dueTemplates],
      // Each runTemplate internally: 1 query findFirst (template) + 1 query findFirst (period) + transaction
      queryQueue: [
        TEMPLATE_BASE, // t1 template lookup
        FISCAL_PERIOD_OPEN, // t1 period lookup
        TEMPLATE_BASE, // t2 template lookup
        FISCAL_PERIOD_OPEN, // t2 period lookup
      ],
      // Lines inserts (.values() only, no .returning()) do NOT consume from insertQueue
      insertQueue: [
        [{ id: "je-t1", entryNumber: 1 }], // t1 JE (uses .returning())
        [{ id: "je-t2", entryNumber: 2 }], // t2 JE (uses .returning())
      ],
    });

    const result = await tickRecurring(db as unknown as Parameters<typeof tickRecurring>[0]);

    expect(result.ran).toBe(2);
    expect(result.errors).toBe(0);
  });

  it("counts errors per-template without aborting the whole tick", async () => {
    const dueTemplates = [
      { ...TEMPLATE_BASE, id: "t1" },
      { ...TEMPLATE_BASE, id: "t2" },
    ];

    const db = makeDb({
      selectQueue: [dueTemplates],
      // t1 will error (template found but no period), t2 will succeed
      queryQueue: [
        TEMPLATE_BASE, // t1 template
        null, // t1 period → throws
        TEMPLATE_BASE, // t2 template
        FISCAL_PERIOD_OPEN, // t2 period
      ],
      insertQueue: [[{ id: "je-t2", entryNumber: 1 }]],
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await tickRecurring(db as unknown as Parameters<typeof tickRecurring>[0]);

    expect(result.ran).toBe(1);
    expect(result.errors).toBe(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "accounting-recurring",
      { template_id: "t1", org_id: "org-1" },
    );

    consoleSpy.mockRestore();
  });

  it("returns ran=0, errors=0 when no templates are due", async () => {
    const db = makeDb({ selectQueue: [[]] });

    const result = await tickRecurring(db as unknown as Parameters<typeof tickRecurring>[0]);

    expect(result.ran).toBe(0);
    expect(result.errors).toBe(0);
  });
});
