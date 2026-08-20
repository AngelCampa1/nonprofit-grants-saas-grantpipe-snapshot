import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDbHandle, pledges, pledgeInstallments, pledgePayments } from "@grantpipe/db";
import {
  createPledge as createPledgeService,
  listPledges as listPledgesService,
  getPledge as getPledgeService,
  recordPayment as recordPaymentService,
  setAllowance as setAllowanceService,
  writeOff as writeOffService,
  promotePledge as promotePledgeService,
} from "./service";
import { recordActivityLog } from "../../lib/activity-log";

// ---------------------------------------------------------------------------
// Mock heavy dependencies
// ---------------------------------------------------------------------------

vi.mock("../accounting/postingEngine", () => ({
  postPledgeRecognition: vi.fn().mockResolvedValue(undefined),
  postPledgeAccretion: vi.fn().mockResolvedValue(undefined),
  postPledgePayment: vi.fn().mockResolvedValue(undefined),
  postPledgeWriteOff: vi.fn().mockResolvedValue(undefined),
  postPledgeAllowance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

type WithDefaultEntity<T extends { entityId: string }> = Omit<T, "entityId"> & {
  entityId?: string;
};

function withEntity<T extends { entityId: string }>(params: WithDefaultEntity<T>): T {
  return { entityId: "entity-1", ...params } as T;
}

function createPledge(
  db: Parameters<typeof createPledgeService>[0],
  params: WithDefaultEntity<Parameters<typeof createPledgeService>[1]>,
) {
  return createPledgeService(db, withEntity(params));
}

function listPledges(
  db: Parameters<typeof listPledgesService>[0],
  params: WithDefaultEntity<Parameters<typeof listPledgesService>[1]>,
) {
  return listPledgesService(db, withEntity(params));
}

function getPledge(
  db: Parameters<typeof getPledgeService>[0],
  params: WithDefaultEntity<Parameters<typeof getPledgeService>[1]>,
) {
  return getPledgeService(db, withEntity(params));
}

function recordPayment(
  db: Parameters<typeof recordPaymentService>[0],
  params: WithDefaultEntity<Parameters<typeof recordPaymentService>[1]>,
) {
  return recordPaymentService(db, withEntity(params));
}

function setAllowance(
  db: Parameters<typeof setAllowanceService>[0],
  params: WithDefaultEntity<Parameters<typeof setAllowanceService>[1]>,
) {
  return setAllowanceService(db, withEntity(params));
}

function writeOff(
  db: Parameters<typeof writeOffService>[0],
  params: WithDefaultEntity<Parameters<typeof writeOffService>[1]>,
) {
  return writeOffService(db, withEntity(params));
}

function promotePledge(
  db: Parameters<typeof promotePledgeService>[0],
  params: WithDefaultEntity<Parameters<typeof promotePledgeService>[1]>,
) {
  return promotePledgeService(db, withEntity(params));
}

// ---------------------------------------------------------------------------
// Minimal DB mock factory
// ---------------------------------------------------------------------------

const BASE_PLEDGE = {
  id: "pledge-1",
  orgId: "org-1",
  contactId: "contact-1",
  fundId: null,
  grantId: null,
  status: "active",
  isConditional: false,
  hasBarrier: false,
  hasRightOfReturn: false,
  conditionNote: null,
  faceAmountCents: 100_000,
  pledgeDate: new Date("2024-01-01"),
  discountRateBasisPoints: 0,
  presentValueCents: 100_000,
  discountCents: 0,
  netAssetClass: "temporarily_restricted",
  allowanceCents: 0,
  notes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
};

const BASE_INSTALLMENT = {
  id: "inst-1",
  orgId: "org-1",
  pledgeId: "pledge-1",
  dueDate: new Date("2025-01-01"),
  amountCents: 100_000,
  status: "scheduled",
  paidCents: 0,
  createdAt: new Date("2024-01-01"),
  deletedAt: null,
};

const BASE_PAYMENT = {
  id: "pay-1",
  orgId: "org-1",
  pledgeId: "pledge-1",
  installmentId: "inst-1",
  amountCents: 50_000,
  paymentDate: new Date("2024-06-01"),
  accretionCents: 0,
  notes: null,
  createdAt: new Date("2024-06-01"),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Table-aware transaction mock
//
// Routes each `tx.select().from(table)` to a queue of result rows keyed by the
// table object, so tests don't depend on the exact call ordering inside the
// service. `pledgePayments` selects return the running list of prior payments;
// each insert into pledgePayments appends to it so the next select sees it.
// ---------------------------------------------------------------------------

type TableResults = {
  pledges?: unknown[][];
  installments?: unknown[][];
  payments?: unknown[][];
};

function makeTableAwareTx(opts: {
  results: TableResults;
  insertReturns?: () => unknown[];
  updateReturns?: () => unknown[];
}) {
  const pledgeQueue = [...(opts.results.pledges ?? [])];
  const installmentQueue = [...(opts.results.installments ?? [])];
  const paymentQueue = [...(opts.results.payments ?? [])];
  const updateSets: unknown[] = [];

  function resolveFor(table: unknown): unknown[] {
    if (table === pledges) return pledgeQueue.shift() ?? [];
    if (table === pledgeInstallments) return installmentQueue.shift() ?? [];
    if (table === pledgePayments) return paymentQueue.shift() ?? [];
    return [];
  }

  const innerDb = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => ({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(resolveFor(table))),
        }),
      })),
    })),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(opts.insertReturns ? opts.insertReturns() : [{ ...BASE_PAYMENT }]),
          ),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((values: unknown) => {
        updateSets.push(values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockImplementation(() =>
                Promise.resolve(opts.updateReturns ? opts.updateReturns() : [{ ...BASE_PLEDGE }]),
              ),
          }),
        };
      }),
    }),
  };

  return {
    ...innerDb,
    __updateSets: updateSets,
    transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
  };
}

function makeDb() {
  const txFn = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn(makeInnerDb());
  });

  function makeInnerDb(): Record<string, unknown> {
    return {
      transaction: txFn,
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE, id: `pledge-${Date.now()}` }]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
  }

  const db = makeInnerDb();
  (db as Record<string, unknown>).transaction = txFn;
  return db as unknown as Parameters<typeof createPledge>[0];
}

function validPledgeReferenceQueries() {
  return {
    contacts: { findFirst: vi.fn().mockResolvedValue({ id: "contact-1" }) },
    funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1" }) },
    grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
    organizations: { findFirst: vi.fn().mockResolvedValue({ id: "org-1" }) },
  };
}

// ---------------------------------------------------------------------------
// createPledge
// ---------------------------------------------------------------------------

describe("createPledge", () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  it("throws ZodError when input is invalid", async () => {
    await expect(
      createPledge(db, {
        orgId: "org-1",
        actorId: "user-1",
        // @ts-expect-error intentionally invalid
        input: { contactId: "", installments: [] },
      }),
    ).rejects.toThrow();
  });

  it.each([
    ["contact", { contactId: "contact-foreign" }],
    ["fund", { contactId: "contact-1", fundId: "fund-foreign" }],
    ["grant", { contactId: "contact-1", grantId: "grant-foreign" }],
  ] as const)("rejects a %s outside the active organization entity", async (invalidType, ids) => {
    let insertCount = 0;
    const innerDb = {
      query: {
        contacts: {
          findFirst: vi
            .fn()
            .mockResolvedValue(invalidType === "contact" ? undefined : { id: ids.contactId }),
        },
        funds: {
          findFirst: vi
            .fn()
            .mockResolvedValue(invalidType === "fund" ? undefined : { id: "fund-1" }),
        },
        grants: {
          findFirst: vi
            .fn()
            .mockResolvedValue(invalidType === "grant" ? undefined : { id: "grant-1" }),
        },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCount += 1;
        return {
          values: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue(
                insertCount === 1 ? [{ ...BASE_PLEDGE }] : [{ ...BASE_INSTALLMENT }],
              ),
          }),
        };
      }),
    };
    const scopedDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (work: (tx: unknown) => unknown) => work(innerDb)),
    };

    await expect(
      createPledge(scopedDb as unknown as Parameters<typeof createPledge>[0], {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        input: {
          ...ids,
          pledgeDate: new Date("2024-01-01"),
          discountRateBasisPoints: 0,
          netAssetClass: "unrestricted",
          hasBarrier: false,
          hasRightOfReturn: false,
          installments: [{ dueDate: new Date("2025-01-01"), amountCents: 10_000 }],
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(innerDb.insert).not.toHaveBeenCalled();
  });

  it("keeps donor ownership aliases stable in relational contact validation", async () => {
    let contactWhere: unknown;
    const innerDb = {
      query: {
        contacts: {
          findFirst: vi.fn().mockImplementation((options: { where: unknown }) => {
            contactWhere = options.where;
            return undefined;
          }),
        },
        funds: { findFirst: vi.fn() },
        grants: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };
    const scopedDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (work: (tx: unknown) => unknown) => work(innerDb)),
    };

    await expect(
      createPledge(scopedDb as unknown as Parameters<typeof createPledge>[0], {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        input: {
          contactId: "contact-1",
          pledgeDate: new Date("2024-01-01"),
          discountRateBasisPoints: 0,
          netAssetClass: "unrestricted",
          hasBarrier: false,
          hasRightOfReturn: false,
          installments: [{ dueDate: new Date("2025-01-01"), amountCents: 10_000 }],
        },
      }),
    ).rejects.toMatchObject({ status: 404 });

    const { db: relationalDb, close } = await createDbHandle(
      "postgresql://unused:unused@127.0.0.1:5432/unused",
    );
    try {
      const compiled = relationalDb.query.contacts
        .findFirst({
          where: contactWhere as never,
          columns: { id: true },
        })
        .toSQL();

      expect(compiled.sql).toContain('FROM "funds" "donor_scope_fund"');
      expect(compiled.sql).toContain('FROM "grants" "donor_scope_grant"');
      expect(compiled.sql).toContain('FROM "organizations" "donor_scope_org"');
      expect(compiled.sql).toContain('"contacts"."org_id" =');
      expect(compiled.sql).toContain('"contacts"."deleted_at" is null');
      expect(compiled.sql).not.toContain('"contacts"."entity_id"');
      expect(compiled.sql).not.toContain('"contacts"."default_entity_id"');
      expect(compiled.params).toContain("entity-1");
    } finally {
      await close();
    }
  });

  it("rejects an unlinked pledge outside the organization default entity", async () => {
    const innerDb = {
      query: {
        ...validPledgeReferenceQueries(),
        organizations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: vi.fn(),
    };
    const scopedDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (work: (tx: unknown) => unknown) => work(innerDb)),
    };

    await expect(
      createPledge(scopedDb as unknown as Parameters<typeof createPledge>[0], {
        orgId: "org-1",
        entityId: "entity-sibling",
        actorId: "user-1",
        input: {
          contactId: "contact-1",
          pledgeDate: new Date("2024-01-01"),
          discountRateBasisPoints: 0,
          netAssetClass: "unrestricted",
          hasBarrier: false,
          hasRightOfReturn: false,
          installments: [{ dueDate: new Date("2025-01-01"), amountCents: 10_000 }],
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(innerDb.insert).not.toHaveBeenCalled();
  });

  it("throws when pledge insert returns empty (database failure)", async () => {
    const innerDb = {
      query: validPledgeReferenceQueries(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]), // empty → !pledge → throw
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      createPledge(txDb as unknown as Parameters<typeof createPledge>[0], {
        orgId: "org-1",
        actorId: "user-1",
        input: {
          contactId: "contact-1",
          pledgeDate: new Date("2024-01-01"),
          discountRateBasisPoints: 0,
          netAssetClass: "unrestricted",
          hasBarrier: false,
          hasRightOfReturn: false,
          installments: [{ dueDate: new Date("2025-01-01"), amountCents: 10_000 }],
        },
      }),
    ).rejects.toThrow("Failed to insert pledge");
  });

  it("creates pledge with installments and returns result", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE }]),
      }),
    });
    const insertInstMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...BASE_INSTALLMENT }]),
      }),
    });

    // Track call count to alternate between pledge and installment inserts
    let callCount = 0;
    const innerDb = {
      query: validPledgeReferenceQueries(),
      insert: vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? insertMock() : insertInstMock();
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    const result = await createPledge(txDb as unknown as Parameters<typeof createPledge>[0], {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      input: {
        contactId: "contact-1",
        pledgeDate: new Date("2024-01-01"),
        discountRateBasisPoints: 0,
        netAssetClass: "temporarily_restricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: new Date("2025-01-01"), amountCents: 100_000 }],
      },
    });

    expect(result).toBeDefined();
    expect(result.pledge).toBeDefined();
    expect(result.installments).toBeDefined();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ activeEntityId: "entity-1" }),
    );
  });

  it("sets isConditional and status=conditional when hasBarrier+hasRightOfReturn", async () => {
    // For a conditional pledge, postPledgeRecognition should NOT be called
    const { postPledgeRecognition } = await import("../accounting/postingEngine");
    const recognitionMock = vi.mocked(postPledgeRecognition);

    let callCount = 0;
    const innerDb = {
      query: validPledgeReferenceQueries(),
      insert: vi.fn().mockImplementation(() => {
        callCount++;
        const row =
          callCount === 1
            ? { ...BASE_PLEDGE, isConditional: true, status: "conditional" }
            : { ...BASE_INSTALLMENT };
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        };
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await createPledge(txDb as unknown as Parameters<typeof createPledge>[0], {
      orgId: "org-1",
      actorId: "user-1",
      input: {
        contactId: "contact-1",
        pledgeDate: new Date("2024-01-01"),
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: true,
        hasRightOfReturn: true,
        installments: [{ dueDate: new Date("2025-01-01"), amountCents: 50_000 }],
      },
    });

    expect(recognitionMock).not.toHaveBeenCalled();
  });

  it("calls postPledgeRecognition for unconditional pledge", async () => {
    const { postPledgeRecognition } = await import("../accounting/postingEngine");
    const recognitionMock = vi.mocked(postPledgeRecognition);

    let callCount = 0;
    const innerDb = {
      query: validPledgeReferenceQueries(),
      insert: vi.fn().mockImplementation(() => {
        callCount++;
        const row = callCount === 1 ? { ...BASE_PLEDGE } : { ...BASE_INSTALLMENT };
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        };
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await createPledge(txDb as unknown as Parameters<typeof createPledge>[0], {
      orgId: "org-1",
      actorId: "user-1",
      input: {
        contactId: "contact-1",
        pledgeDate: new Date("2024-01-01"),
        discountRateBasisPoints: 0,
        netAssetClass: "unrestricted",
        hasBarrier: false,
        hasRightOfReturn: false,
        installments: [{ dueDate: new Date("2025-01-01"), amountCents: 50_000 }],
      },
    });

    expect(recognitionMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listPledges
// ---------------------------------------------------------------------------

describe("listPledges", () => {
  it("keeps donor ownership aliases stable in a relational pledge query", async () => {
    let whereClause: unknown;
    const db = {
      query: {
        pledges: {
          findMany: vi.fn().mockImplementation((options: { where: unknown }) => {
            whereClause = options.where;
            return [];
          }),
        },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    await listPledges(db, { orgId: "org-1", entityId: "entity-1" });

    const { db: relationalDb, close } = await createDbHandle(
      "postgresql://unused:unused@127.0.0.1:5432/unused",
    );
    try {
      const compiled = relationalDb.query.pledges
        .findMany({
          where: whereClause as never,
          limit: 25,
        })
        .toSQL();

      expect(compiled.sql).toContain('FROM "funds" "donor_scope_fund"');
      expect(compiled.sql).toContain('FROM "grants" "donor_scope_grant"');
      expect(compiled.sql).toContain('FROM "organizations" "donor_scope_org"');
      expect(compiled.sql).toContain('FROM "funds" "pledge_scope_fund"');
      expect(compiled.sql).toContain('FROM "grants" "pledge_scope_grant"');
      expect(compiled.sql).toContain('FROM "organizations" "pledge_scope_org"');
      expect(compiled.sql).toContain('"pledge_scope_fund"."id" = "pledges"."fund_id"');
      expect(compiled.sql).toContain('"pledge_scope_grant"."id" = "pledges"."grant_id"');
      expect(compiled.sql).toContain('entity_donation.contact_id = "pledge_contact"."id"');
      expect(compiled.sql).not.toContain('"pledges"."entity_id"');
      expect(compiled.sql).not.toContain('"pledges"."default_entity_id"');
      expect(compiled.params).toContain("entity-1");
    } finally {
      await close();
    }
  });

  it("preserves default-prospect and multi-entity donor ownership branches", async () => {
    let whereClause: unknown;
    const db = {
      query: {
        pledges: {
          findMany: vi.fn().mockImplementation((options: { where: unknown }) => {
            whereClause = options.where;
            return [];
          }),
        },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    await listPledges(db, { orgId: "org-1", entityId: "entity-2" });

    const { db: relationalDb, close } = await createDbHandle(
      "postgresql://unused:unused@127.0.0.1:5432/unused",
    );
    try {
      const compiled = relationalDb.query.pledges
        .findMany({
          where: whereClause as never,
          limit: 25,
        })
        .toSQL();

      expect(compiled.sql).toContain('entity_donation.contact_id = "pledge_contact"."id"');
      expect(compiled.sql).toContain('"donor_scope_fund"."entity_id" =');
      expect(compiled.sql).toContain('"donor_scope_grant"."entity_id" =');
      expect(compiled.sql).toContain('"donor_scope_org"."default_entity_id" =');
      expect(compiled.sql).toContain("NOT EXISTS");
      expect(compiled.params.filter((param) => param === "entity-2").length).toBeGreaterThan(1);
    } finally {
      await close();
    }
  });
  it("returns pledge list shape with totals", async () => {
    const installments = [{ ...BASE_INSTALLMENT, status: "scheduled", paidCents: 0 }];
    const db = {
      query: {
        pledges: {
          findMany: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE, installments }]),
        },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    const result = await listPledges(db, { orgId: "org-1" });
    expect(result).toHaveProperty("pledges");
    expect(result).toHaveProperty("totals");
    expect(Array.isArray(result.pledges)).toBe(true);
  });

  it("filters by status when provided", async () => {
    const findManyMock = vi.fn().mockResolvedValue([]);
    const db = {
      query: {
        pledges: { findMany: findManyMock },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    await listPledges(db, { orgId: "org-1", status: "active" });
    expect(findManyMock).toHaveBeenCalled();
    const callArg = findManyMock.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
  });

  it("handles string dueDate on installments (else branch in classifyInstallmentAging call)", async () => {
    const installmentsWithStringDate = [
      {
        ...BASE_INSTALLMENT,
        dueDate: "2025-01-01T00:00:00.000Z" as unknown as Date, // string not Date
        status: "scheduled",
        paidCents: 0,
      },
    ];
    const db = {
      query: {
        pledges: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ ...BASE_PLEDGE, installments: installmentsWithStringDate }]),
        },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    const result = await listPledges(db, { orgId: "org-1" });
    expect(result.pledges).toHaveLength(1);
  });

  it("accumulates totalWrittenOffCents for written_off pledges", async () => {
    const installments = [{ ...BASE_INSTALLMENT, status: "written_off", paidCents: 50_000 }];
    const db = {
      query: {
        pledges: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ ...BASE_PLEDGE, status: "written_off", installments }]),
        },
      },
    } as unknown as Parameters<typeof listPledges>[0];

    const result = await listPledges(db, { orgId: "org-1" });
    expect(result.totals.totalWrittenOffCents).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getPledge
// ---------------------------------------------------------------------------

describe("getPledge", () => {
  it("throws 404 when pledge not found", async () => {
    const db = {
      query: {
        pledges: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Parameters<typeof getPledge>[0];

    await expect(getPledge(db, { orgId: "org-1", pledgeId: "missing" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns pledge with installments, payments, amortization", async () => {
    const db = {
      query: {
        pledges: {
          findFirst: vi.fn().mockResolvedValue({
            ...BASE_PLEDGE,
            installments: [{ ...BASE_INSTALLMENT }],
            payments: [],
          }),
        },
      },
    } as unknown as Parameters<typeof getPledge>[0];

    const result = await getPledge(db, { orgId: "org-1", pledgeId: "pledge-1" });
    expect(result).toHaveProperty("pledge");
    expect(result).toHaveProperty("installments");
    expect(result).toHaveProperty("payments");
    expect(result).toHaveProperty("amortizationSchedule");
    expect(result).toHaveProperty("carryingValueCents");
  });

  it("handles pledgeDate as string (not Date object)", async () => {
    const db = {
      query: {
        pledges: {
          findFirst: vi.fn().mockResolvedValue({
            ...BASE_PLEDGE,
            pledgeDate: "2024-01-01T00:00:00.000Z", // string, not Date
            installments: [{ ...BASE_INSTALLMENT, dueDate: "2025-01-01T00:00:00.000Z" }],
            payments: [],
          }),
        },
      },
    } as unknown as Parameters<typeof getPledge>[0];

    const result = await getPledge(db, { orgId: "org-1", pledgeId: "pledge-1" });
    expect(result).toHaveProperty("carryingValueCents");
    expect(typeof result.carryingValueCents).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

describe("recordPayment", () => {
  it("takes the pledge advisory transaction lock before reading mutable state", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT }]],
      },
    });

    await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        amountCents: 10_000,
        paymentDate: new Date("2025-01-15"),
      },
    });

    expect(txDb.execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(txDb.execute.mock.calls[0]?.[0])).toContain("org-1:pledge-1");
    expect(txDb.execute.mock.invocationCallOrder[0]).toBeLessThan(
      txDb.select.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });
  it("throws ZodError for invalid input", async () => {
    const db = makeDb();
    await expect(
      recordPayment(db, {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        // @ts-expect-error intentionally invalid
        input: { amountCents: -1, paymentDate: "bad" },
      }),
    ).rejects.toThrow();
  });

  it("throws 404 when pledge not found in recordPayment", async () => {
    const txDb = makeTableAwareTx({ results: { pledges: [[]] } });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "missing",
        input: {
          amountCents: 10_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("handles string pledgeDate and paymentDate in recordPayment", async () => {
    // Covers else branches of `instanceof Date` checks
    const pledgeWithStringDate = {
      ...BASE_PLEDGE,
      pledgeDate: "2024-01-01T00:00:00.000Z" as unknown as Date,
    };

    const txDb = makeTableAwareTx({
      results: {
        pledges: [[pledgeWithStringDate]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, status: "scheduled" }]],
      },
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        amountCents: 50_000,
        paymentDate: "2025-06-01T00:00:00.000Z" as unknown as Date, // string
      },
    });
    expect(result).toBeDefined();
  });

  it("inserts payment and advances installment status", async () => {
    const { postPledgePayment } = await import("../accounting/postingEngine");
    const paymentMock = vi.mocked(postPledgePayment);

    const txDb = makeTableAwareTx({
      results: {
        // 1) load pledge, then completesPledge installment scan, then
        //    installment lookup, then remaining-installments scan
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [
          [{ ...BASE_INSTALLMENT }],
          [{ ...BASE_INSTALLMENT }],
          [{ ...BASE_INSTALLMENT, paidCents: 100_000, status: "paid" }],
        ],
      },
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-1",
        amountCents: 100_000,
        paymentDate: new Date("2025-01-15"),
      },
    });

    expect(result).toBeDefined();
    expect(paymentMock).toHaveBeenCalled();
  });

  it("rejects payments on conditional, completed, written off, or cancelled pledges", async () => {
    for (const status of ["conditional", "completed", "written_off", "cancelled"] as const) {
      const txDb = makeTableAwareTx({
        results: { pledges: [[{ ...BASE_PLEDGE, status }]] },
      });

      await expect(
        recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
          orgId: "org-1",
          actorId: "user-1",
          pledgeId: "pledge-1",
          input: {
            amountCents: 10_000,
            paymentDate: new Date("2025-01-15"),
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("rejects a payment tied to an installment from another pledge", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, id: "inst-owned" }]],
      },
    });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {
          installmentId: "inst-other",
          amountCents: 10_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects installment overpayment", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, paidCents: 90_000, amountCents: 100_000 }]],
      },
    });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {
          installmentId: "inst-1",
          amountCents: 20_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a payment tied to a written-off installment", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, status: "written_off", paidCents: 0 }]],
      },
    });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {
          installmentId: "inst-1",
          amountCents: 10_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(txDb.__updateSets).toEqual([]);
  });

  it("allocates untied payments against open installments so outstanding changes", async () => {
    const first = { ...BASE_INSTALLMENT, id: "inst-1", paidCents: 80_000, amountCents: 100_000 };
    const second = {
      ...BASE_INSTALLMENT,
      id: "inst-2",
      dueDate: new Date("2026-01-01"),
      paidCents: 0,
      amountCents: 100_000,
    };
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE, faceAmountCents: 200_000 }]],
        payments: [[]],
        installments: [
          [first, second],
          [
            { ...first, paidCents: 100_000, status: "paid" },
            { ...second, paidCents: 5_000, status: "partial" },
          ],
        ],
      },
      insertReturns: () => [{ ...BASE_PAYMENT, amountCents: 25_000, installmentId: null }],
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        amountCents: 25_000,
        paymentDate: new Date("2025-01-15"),
      },
    });

    expect(result.payment.amountCents).toBe(25_000);
    expect(txDb.__updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paidCents: 100_000, status: "paid" }),
        expect.objectContaining({ paidCents: 5_000, status: "partial" }),
      ]),
    );
  });

  it("rejects untied payments when no open installment balance can absorb the amount", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [
          [
            { ...BASE_INSTALLMENT, id: "paid-1", status: "paid", paidCents: 100_000 },
            { ...BASE_INSTALLMENT, id: "written-off-1", status: "written_off", paidCents: 0 },
          ],
        ],
      },
    });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {
          amountCents: 10_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(txDb.__updateSets).toEqual([]);
  });

  it("throws when payment insert returns empty (database failure)", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[BASE_INSTALLMENT]],
      },
      insertReturns: () => [], // empty → !payment → throw
    });

    await expect(
      recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {
          amountCents: 50_000,
          paymentDate: new Date("2025-01-15"),
        },
      }),
    ).rejects.toThrow("Failed to insert payment");
  });

  it("records partial payment when amount is less than installment total", async () => {
    const partialInstallment = { ...BASE_INSTALLMENT, paidCents: 0, amountCents: 100_000 };

    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[partialInstallment], [partialInstallment], [partialInstallment]],
      },
      insertReturns: () => [{ ...BASE_PAYMENT, amountCents: 30_000 }],
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-1",
        amountCents: 30_000, // less than 100_000 → "partial"
        paymentDate: new Date("2025-01-15"),
      },
    });
    expect(result).toBeDefined();
  });

  it("calls postPledgeAccretion when discount rate is non-zero", async () => {
    const { postPledgeAccretion } = await import("../accounting/postingEngine");
    const accretionMock = vi.mocked(postPledgeAccretion);

    // Pledge with 5% discount rate (500 basis points) — past due date triggers accretion
    const discountedPledge = {
      ...BASE_PLEDGE,
      discountRateBasisPoints: 500,
      presentValueCents: 90_000,
      discountCents: 10_000,
      pledgeDate: new Date("2023-01-01"), // 2+ years ago → significant accretion
    };

    const txDb = makeTableAwareTx({
      results: {
        pledges: [[discountedPledge]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, status: "scheduled" }]],
      },
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        amountCents: 50_000,
        paymentDate: new Date("2025-06-01"),
      },
    });

    expect(result).toBeDefined();
    expect(accretionMock).toHaveBeenCalled();
  });

  it("marks pledge completed when all installments paid", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[{ ...BASE_INSTALLMENT, paidCents: 0, status: "scheduled" }]],
      },
    });

    const result = await recordPayment(txDb as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-1",
        amountCents: 100_000,
        paymentDate: new Date("2025-01-15"),
      },
    });
    expect(result).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // BLOCKER 1: accretion must be posted INCREMENTALLY, never re-posting the
  // full cumulative figure. Across all payments the total accretion debited to
  // the discount contra must equal discountCents exactly and never exceed it.
  // -------------------------------------------------------------------------
  it("posts only incremental accretion across two payments (total == discountCents, never exceeds)", async () => {
    const { postPledgeAccretion } = await import("../accounting/postingEngine");
    const accretionMock = vi.mocked(postPledgeAccretion);
    accretionMock.mockClear();

    // Two-installment discounted pledge. discountCents = 1150.
    const discountCents = 1150;
    const discounted = {
      ...BASE_PLEDGE,
      discountRateBasisPoints: 500,
      presentValueCents: 100_000 - discountCents,
      discountCents,
      faceAmountCents: 100_000,
      pledgeDate: new Date("2023-01-01"),
    };

    const inst1 = {
      ...BASE_INSTALLMENT,
      id: "inst-1",
      amountCents: 50_000,
      dueDate: new Date("2024-01-01"),
    };
    const inst2 = {
      ...BASE_INSTALLMENT,
      id: "inst-2",
      amountCents: 50_000,
      dueDate: new Date("2025-01-01"),
    };

    // --- Payment 1 (not final: inst-2 still scheduled) ---
    const tx1 = makeTableAwareTx({
      results: {
        pledges: [[discounted]],
        payments: [[]], // no prior payments
        installments: [
          [inst1, inst2], // completesPledge scan → false (inst2 scheduled)
          [inst1], // installment lookup
          [{ ...inst1, paidCents: 50_000, status: "paid" }, inst2], // remaining scan
        ],
      },
    });

    await recordPayment(tx1 as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-1",
        amountCents: 50_000,
        paymentDate: new Date("2026-06-01"),
      },
    });

    const firstCallArg = accretionMock.mock.calls[0]?.[1] as { accretionCents: number } | undefined;
    const firstAccretion = firstCallArg?.accretionCents ?? 0;
    expect(firstAccretion).toBeGreaterThan(0);
    // The persisted payment row carries this incremental accretion.
    const persistedPayment1 = { ...BASE_PAYMENT, accretionCents: firstAccretion };

    accretionMock.mockClear();

    // --- Payment 2 (final: pays inst-2, completing the pledge) ---
    const tx2 = makeTableAwareTx({
      results: {
        pledges: [[discounted]],
        payments: [[persistedPayment1]], // prior accreted = firstAccretion
        installments: [
          [{ ...inst1, paidCents: 50_000, status: "paid" }, inst2], // completesPledge → true
          [inst2], // installment lookup
          [
            { ...inst1, paidCents: 50_000, status: "paid" },
            { ...inst2, paidCents: 50_000, status: "paid" },
          ], // remaining scan → all paid
        ],
      },
    });

    await recordPayment(tx2 as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-2",
        amountCents: 50_000,
        paymentDate: new Date("2026-06-02"),
      },
    });

    const secondCallArg = accretionMock.mock.calls[0]?.[1] as
      | { accretionCents: number }
      | undefined;
    const secondAccretion = secondCallArg?.accretionCents ?? 0;

    // Total accretion debited == discountCents exactly and never exceeds it.
    expect(firstAccretion + secondAccretion).toBe(discountCents);
    // The second payment posts only the delta (top-up), not the full cumulative.
    expect(secondAccretion).toBe(discountCents - firstAccretion);
  });

  // -------------------------------------------------------------------------
  // BLOCKER 2: on the FINAL payment the cumulative accretion is forced to
  // exactly discountCents, so the discount contra closes to exactly zero even
  // when rounded per-term PV leaves the effective-interest figure a cent short.
  // -------------------------------------------------------------------------
  it("closes the discount contra to exactly zero on the final payment (uneven installments)", async () => {
    const { postPledgeAccretion } = await import("../accounting/postingEngine");
    const accretionMock = vi.mocked(postPledgeAccretion);
    accretionMock.mockClear();

    // Three installments of 33_333 / 33_333 / 33_334 — they do not divide evenly.
    const discountCents = 777;
    const unevenPledge = {
      ...BASE_PLEDGE,
      discountRateBasisPoints: 400,
      presentValueCents: 100_000 - discountCents,
      discountCents,
      faceAmountCents: 100_000,
      pledgeDate: new Date("2023-01-01"),
    };

    const inst = {
      ...BASE_INSTALLMENT,
      id: "inst-only",
      amountCents: 100_000,
      dueDate: new Date("2024-01-01"),
    };

    // Single final payment that completes the pledge in one shot — no prior accretion.
    const tx = makeTableAwareTx({
      results: {
        pledges: [[unevenPledge]],
        payments: [[]],
        installments: [
          [inst], // completesPledge scan → true
          [inst], // installment lookup
          [{ ...inst, paidCents: 100_000, status: "paid" }], // remaining → all paid
        ],
      },
    });

    await recordPayment(tx as unknown as Parameters<typeof recordPayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {
        installmentId: "inst-only",
        amountCents: 100_000,
        paymentDate: new Date("2026-06-01"),
      },
    });

    const callArg = accretionMock.mock.calls[0]?.[1] as { accretionCents: number } | undefined;
    const accretion = callArg?.accretionCents ?? 0;

    // The final payment forces cumulative accretion to exactly discountCents,
    // so prior(0) + posted == discountCents → residual contra is exactly zero.
    expect(accretion).toBe(discountCents);
  });
});

// ---------------------------------------------------------------------------
// setAllowance
// ---------------------------------------------------------------------------

describe("setAllowance", () => {
  it("throws ZodError for negative allowance", async () => {
    const db = makeDb();
    await expect(
      setAllowance(db, {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "p1",
        input: { allowanceCents: -1 },
      }),
    ).rejects.toThrow();
  });

  it("throws 404 when pledge not found", async () => {
    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      setAllowance(txDb as unknown as Parameters<typeof setAllowance>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "missing",
        input: { allowanceCents: 0 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws when update returns empty array (database failure)", async () => {
    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // empty → should throw
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      setAllowance(txDb as unknown as Parameters<typeof setAllowance>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: { allowanceCents: 5_000 },
      }),
    ).rejects.toThrow("Failed to update pledge allowance");
  });

  it("updates allowance and posts GL entry", async () => {
    const { postPledgeAllowance } = await import("../accounting/postingEngine");
    const allowanceMock = vi.mocked(postPledgeAllowance);

    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...BASE_PLEDGE, allowanceCents: 10_000 }]),
          }),
        }),
      }),
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    const result = await setAllowance(txDb as unknown as Parameters<typeof setAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: { allowanceCents: 10_000 },
    });

    expect(result).toBeDefined();
    expect(allowanceMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// writeOff
// ---------------------------------------------------------------------------

describe("writeOff", () => {
  it("takes the pledge advisory transaction lock before reading payment state", async () => {
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE }]],
        payments: [[]],
        installments: [[]],
      },
      updateReturns: () => [{ ...BASE_PLEDGE, status: "written_off" }],
    });

    await writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: {},
    });

    expect(txDb.execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(txDb.execute.mock.calls[0]?.[0])).toContain("org-1:pledge-1");
    expect(txDb.execute.mock.invocationCallOrder[0]).toBeLessThan(
      txDb.select.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("throws ZodError for invalid input (non-string reason)", async () => {
    const db = makeDb();
    await expect(
      writeOff(db, {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        // @ts-expect-error intentionally invalid: reason must be a string
        input: { reason: 123 },
      }),
    ).rejects.toThrow();
  });

  it("throws 404 when pledge not found", async () => {
    const txDb = makeTableAwareTx({ results: { pledges: [[]] } });

    await expect(
      writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "missing",
        input: {},
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("handles string pledgeDate in writeOff (else branch of instanceof Date)", async () => {
    const pledgeWithStringDate = {
      ...BASE_PLEDGE,
      pledgeDate: "2024-01-01T00:00:00.000Z" as unknown as Date, // string not Date
    };

    const txDb = makeTableAwareTx({
      results: {
        pledges: [[pledgeWithStringDate]],
        payments: [[]],
      },
      updateReturns: () => [{ ...pledgeWithStringDate, status: "written_off" }],
    });

    const result = await writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: { reason: "donor deceased" },
    });
    expect(result).toBeDefined();
  });

  it("throws when update returns empty (database failure in writeOff)", async () => {
    const txDb = makeTableAwareTx({
      results: { pledges: [[{ ...BASE_PLEDGE }]], payments: [[]] },
      updateReturns: () => [], // empty → !updated → throw
    });

    await expect(
      writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        input: {},
      }),
    ).rejects.toThrow("Failed to update pledge status");
  });

  it("calls postPledgeWriteOff and updates status", async () => {
    const { postPledgeWriteOff } = await import("../accounting/postingEngine");
    const writeOffMock = vi.mocked(postPledgeWriteOff);

    const txDb = makeTableAwareTx({
      results: { pledges: [[{ ...BASE_PLEDGE }]], payments: [[]] },
      updateReturns: () => [{ ...BASE_PLEDGE, status: "written_off" }],
    });

    await writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: { reason: "donor departed" },
    });

    expect(writeOffMock).toHaveBeenCalled();
  });

  it("preserves paid installments when writing off unpaid pledge balances", async () => {
    const paid = { ...BASE_INSTALLMENT, id: "paid-1", paidCents: 100_000, status: "paid" };
    const partial = { ...BASE_INSTALLMENT, id: "partial-1", paidCents: 25_000, status: "partial" };
    const txDb = makeTableAwareTx({
      results: {
        pledges: [[{ ...BASE_PLEDGE, faceAmountCents: 200_000 }]],
        payments: [[{ ...BASE_PAYMENT, amountCents: 125_000, accretionCents: 0 }]],
        installments: [[paid, partial]],
      },
      updateReturns: () => [{ ...BASE_PLEDGE, status: "written_off" }],
    });

    await writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: { reason: "uncollectible" },
    });

    expect(txDb.__updateSets).toContainEqual(expect.objectContaining({ status: "written_off" }));
    expect(txDb.__updateSets).not.toContainEqual(
      expect.objectContaining({ paidCents: 100_000, status: "written_off" }),
    );
  });

  it("closes the residual contra using actual posted accretion, not a single assumed figure", async () => {
    const { postPledgeWriteOff } = await import("../accounting/postingEngine");
    const writeOffMock = vi.mocked(postPledgeWriteOff);
    writeOffMock.mockClear();

    const discountCents = 1000;
    const discounted = {
      ...BASE_PLEDGE,
      discountCents,
      presentValueCents: 100_000 - discountCents,
      faceAmountCents: 100_000,
    };

    // Two prior payments already unwound 300 + 250 = 550 of the discount.
    const priorPayments = [
      { ...BASE_PAYMENT, id: "pay-a", amountCents: 20_000, accretionCents: 300 },
      { ...BASE_PAYMENT, id: "pay-b", amountCents: 10_000, accretionCents: 250 },
    ];

    const txDb = makeTableAwareTx({
      results: { pledges: [[discounted]], payments: [priorPayments] },
      updateReturns: () => [{ ...discounted, status: "written_off" }],
    });

    await writeOff(txDb as unknown as Parameters<typeof writeOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      input: { reason: "uncollectible" },
    });

    const arg = writeOffMock.mock.calls[0]?.[1] as
      | { writeOffCents: number; remainingDiscountCents: number }
      | undefined;
    // remainingDiscount = discountCents − sum(posted accretion) = 1000 − 550 = 450
    expect(arg?.remainingDiscountCents).toBe(discountCents - 550);
    // writeOff = face − total paid = 100_000 − 30_000 = 70_000
    expect(arg?.writeOffCents).toBe(70_000);
  });
});

// ---------------------------------------------------------------------------
// promotePledge
// ---------------------------------------------------------------------------

describe("promotePledge", () => {
  it("throws 404 when pledge not found", async () => {
    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      promotePledge(txDb as unknown as Parameters<typeof promotePledge>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "missing",
        promotionDate: new Date(),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when pledge is not conditional", async () => {
    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ ...BASE_PLEDGE, status: "active", isConditional: false }]),
          }),
        }),
      }),
    };
    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      promotePledge(txDb as unknown as Parameters<typeof promotePledge>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        promotionDate: new Date(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws when update returns empty in promotePledge (database failure)", async () => {
    const conditionalPledge = {
      ...BASE_PLEDGE,
      status: "conditional",
      isConditional: true,
    };

    const installment = { ...BASE_INSTALLMENT };

    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([conditionalPledge]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // empty → !updated → throw
          }),
        }),
      }),
      query: {
        pledgeInstallments: {
          findMany: vi.fn().mockResolvedValue([installment]),
        },
      },
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    await expect(
      promotePledge(txDb as unknown as Parameters<typeof promotePledge>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        promotionDate: new Date("2024-06-01"),
      }),
    ).rejects.toThrow("Failed to promote pledge");
  });

  it("handles string dueDate in installment rows during promotePledge", async () => {
    const conditionalPledge = {
      ...BASE_PLEDGE,
      status: "conditional",
      isConditional: true,
    };

    // Installment with string dueDate (else branch of instanceof Date check)
    const installmentWithStringDate = {
      ...BASE_INSTALLMENT,
      dueDate: "2025-01-01T00:00:00.000Z" as unknown as Date,
    };

    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([conditionalPledge]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([
                { ...conditionalPledge, status: "active", isConditional: false },
              ]),
          }),
        }),
      }),
      query: {
        pledgeInstallments: {
          findMany: vi.fn().mockResolvedValue([installmentWithStringDate]),
        },
      },
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    const result = await promotePledge(txDb as unknown as Parameters<typeof promotePledge>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      promotionDate: new Date("2024-06-01"),
    });
    expect(result).toBeDefined();
    expect(result.pledge.status).toBe("active");
  });

  it("promotes conditional pledge to active and posts recognition", async () => {
    const { postPledgeRecognition } = await import("../accounting/postingEngine");
    const recognitionMock = vi.mocked(postPledgeRecognition);
    const promotionDate = new Date("2024-06-01");

    const conditionalPledge = {
      ...BASE_PLEDGE,
      status: "conditional",
      isConditional: true,
      hasBarrier: true,
      hasRightOfReturn: true,
    };

    const installment = { ...BASE_INSTALLMENT };

    let selectCount = 0;
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...conditionalPledge, status: "active" }]),
      }),
    });
    const innerDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCount++;
              return Promise.resolve(selectCount === 1 ? [conditionalPledge] : []);
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: setMock,
      }),
      query: {
        pledgeInstallments: {
          findMany: vi.fn().mockResolvedValue([installment]),
        },
      },
    };

    const txDb = {
      ...innerDb,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(innerDb)),
    };

    const result = await promotePledge(txDb as unknown as Parameters<typeof promotePledge>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      promotionDate,
    });

    expect(result).toBeDefined();
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ pledgeDate: promotionDate }));
    expect(recognitionMock).toHaveBeenCalled();
  });
});
