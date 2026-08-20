import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "@grantpipe/db";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../accounting/postingEngine", () => ({
  postGrantPayment: vi.fn().mockResolvedValue(null),
  reverseGrantPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./request.service", () => ({
  transitionPaymentRequest: vi.fn().mockResolvedValue(undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { postGrantPayment } from "../accounting/postingEngine";
import { transitionPaymentRequest } from "./request.service";
import { recordPayment, removePayment, listPayments } from "./payment.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    orgId: "org-1",
    entityId: "entity-1",
    grantId: "grant-1",
    requestNumber: 1,
    type: "reimbursement",
    status: "approved",
    approvedAmountCents: 10000,
    requestedAmountCents: 10000,
    autoPostJournalEntry: false,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    orgId: "org-1",
    entityId: "entity-1",
    requestId: "req-1",
    grantId: "grant-1",
    receivedDate: new Date("2026-03-01"),
    amountCents: 5000,
    referenceNumber: null,
    method: null,
    journalEntryId: null,
    bankTransactionId: null,
    notes: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function collectWhereColumnNames(value: unknown): string[] {
  const names: string[] = [];

  function walk(node: unknown) {
    if (node == null || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record.name === "string") names.push(record.name);
    if (Array.isArray(record.queryChunks)) walk(record.queryChunks);
  }

  walk(value);
  return names;
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

describe("recordPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a payment and does NOT auto-advance when total < approved", async () => {
    const request = makeRequest({ approvedAmountCents: 10000 });
    const payment = makePayment({ amountCents: 5000 });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await recordPayment(
      db,
      {},
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          receivedDate: "2026-03-01T00:00:00.000Z",
          amountCents: 5000,
        },
      },
    );

    expect(result.amountCents).toBe(5000);
    expect(txMock.execute).toHaveBeenCalledTimes(1);
    expect(txMock.execute.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.select.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(txMock.execute.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.insert.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(transitionPaymentRequest).not.toHaveBeenCalled();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "recorded", entityType: "payment" }),
    );
  });

  it("treats a missing total row as zero paid", async () => {
    const request = makeRequest({ approvedAmountCents: 10000 });
    const payment = makePayment({ amountCents: 1000 });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([undefined]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await recordPayment(
      db,
      {},
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          receivedDate: "2026-03-01T00:00:00.000Z",
          amountCents: 1000,
        },
      },
    );

    expect(transitionPaymentRequest).not.toHaveBeenCalled();
  });

  it("auto-advances to paid when total paid >= approvedAmountCents", async () => {
    const request = makeRequest({ approvedAmountCents: 5000 });
    const payment = makePayment({ amountCents: 5000 });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await recordPayment(
      db,
      {},
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          receivedDate: "2026-03-01T00:00:00.000Z",
          amountCents: 5000,
        },
      },
    );

    expect(transitionPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: expect.objectContaining({ toStatus: "paid" }),
      }),
    );
  });

  it("rejects payments that would exceed the approved amount", async () => {
    const request = makeRequest({ approvedAmountCents: 5000 });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makePayment({ amountCents: 2000 })]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "4000" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          data: {
            receivedDate: "2026-03-01T00:00:00.000Z",
            amountCents: 2000,
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(txMock.insert).not.toHaveBeenCalled();
    expect(transitionPaymentRequest).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("calls postGrantPayment when autoPostJournalEntry is true and no journalEntryId", async () => {
    const request = makeRequest({ autoPostJournalEntry: true, approvedAmountCents: 5000 });
    const payment = makePayment({ amountCents: 3000 });

    vi.mocked(postGrantPayment).mockResolvedValue("je-1");

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await recordPayment(
      db,
      { INTEGRATION_MODE: "mock" },
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          receivedDate: "2026-03-01T00:00:00.000Z",
          amountCents: 3000,
        },
      },
    );

    expect(postGrantPayment).toHaveBeenCalled();
    expect(result.journalEntryId).toBe("je-1");
  });

  it("does NOT call postGrantPayment when journalEntryId is provided", async () => {
    const request = makeRequest({ autoPostJournalEntry: true, approvedAmountCents: 5000 });
    const payment = makePayment({ amountCents: 3000, journalEntryId: "manual-je" });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        journalEntries: {
          findFirst: vi.fn().mockResolvedValue({ id: "manual-je", orgId: "org-1" }),
        },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await recordPayment(
      db,
      {},
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          receivedDate: "2026-03-01T00:00:00.000Z",
          amountCents: 3000,
          journalEntryId: "manual-je",
        },
      },
    );

    expect(postGrantPayment).not.toHaveBeenCalled();
  });

  it("rejects a manual journal entry outside the current org before inserting payment", async () => {
    const request = makeRequest({ autoPostJournalEntry: true });
    const findFirstJournalEntry = vi.fn(async (query: { where?: unknown }) => {
      const columns = collectWhereColumnNames(query.where);
      return columns.includes("id") && columns.includes("org_id")
        ? undefined
        : { id: "foreign-je", orgId: "org-2" };
    });
    const transaction = vi.fn();

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        journalEntries: { findFirst: findFirstJournalEntry },
      },
      transaction,
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          data: {
            receivedDate: "2026-03-01T00:00:00.000Z",
            amountCents: 3000,
            journalEntryId: "foreign-je",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(findFirstJournalEntry).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(postGrantPayment).not.toHaveBeenCalled();
  });

  it("rejects a bank transaction outside the current org before inserting payment", async () => {
    const request = makeRequest();
    const findFirstBankTransaction = vi.fn(async (query: { where?: unknown }) => {
      const columns = collectWhereColumnNames(query.where);
      return columns.includes("id") && columns.includes("org_id")
        ? undefined
        : { id: "foreign-btxn", orgId: "org-2" };
    });
    const transaction = vi.fn();

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        bankTransactions: { findFirst: findFirstBankTransaction },
      },
      transaction,
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          data: {
            receivedDate: "2026-03-01T00:00:00.000Z",
            amountCents: 3000,
            bankTransactionId: "foreign-btxn",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(findFirstBankTransaction).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "bad",
          data: { receivedDate: "2026-03-01T00:00:00.000Z", amountCents: 1000 },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws badRequest when request not in approved/partially_approved status", async () => {
    const request = makeRequest({ status: "draft" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          data: { receivedDate: "2026-03-01T00:00:00.000Z", amountCents: 1000 },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows partially_approved status", async () => {
    const request = makeRequest({ status: "partially_approved", approvedAmountCents: 5000 });
    const payment = makePayment({ amountCents: 2000 });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([payment]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await recordPayment(
      db,
      {},
      {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { receivedDate: "2026-03-01T00:00:00.000Z", amountCents: 2000 },
      },
    );

    expect(result.amountCents).toBe(2000);
  });

  it("throws internalError when insert returns nothing", async () => {
    const request = makeRequest();

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "0" }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      recordPayment(
        db,
        {},
        {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          data: { receivedDate: "2026-03-01T00:00:00.000Z", amountCents: 1000 },
        },
      ),
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// removePayment
// ---------------------------------------------------------------------------

describe("removePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft deletes a payment", async () => {
    const payment = makePayment();
    const request = makeRequest();
    const deleted = makePayment({ deletedAt: new Date() });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deleted]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removePayment(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      paymentId: "pay-1",
    });

    // The reversal must take a per-(org,request) advisory lock before mutating,
    // and acquire it before the soft-delete UPDATE runs.
    expect(txMock.execute).toHaveBeenCalledTimes(1);
    const lockOrder = txMock.execute.mock.invocationCallOrder[0] ?? 0;
    const updateOrder = txMock.update.mock.invocationCallOrder[0] ?? 0;
    expect(lockOrder).toBeLessThan(updateOrder);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "reversed", entityType: "payment" }),
    );
  });

  it("throws notFound when payment not found", async () => {
    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(null) },
        grantPaymentRequests: { findFirst: vi.fn() },
      },
    } as unknown as Database;

    await expect(
      removePayment(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        paymentId: "bad",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when update returns nothing", async () => {
    const payment = makePayment();
    const request = makeRequest();

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      removePayment(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        paymentId: "pay-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when the payment request is missing", async () => {
    const payment = makePayment();
    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      removePayment(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        paymentId: "pay-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("logs hadJournalEntry true when payment had a JE", async () => {
    const payment = makePayment({ journalEntryId: "je-123" });
    const request = makeRequest();
    const deleted = makePayment({ journalEntryId: "je-123", deletedAt: new Date() });

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deleted]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removePayment(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      paymentId: "pay-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({ hadJournalEntry: true }),
      }),
    );
  });

  it("reopens a paid request when reversal makes it outstanding again", async () => {
    const payment = makePayment({ amountCents: 5000 });
    const request = makeRequest({
      status: "paid",
      requestedAmountCents: 10000,
      approvedAmountCents: 10000,
    });
    const deleted = makePayment({ amountCents: 5000, deletedAt: new Date() });
    const setMock = vi.fn().mockImplementation((patch: Record<string, unknown>) => ({
      where: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(patch.deletedAt ? [deleted] : [{ ...request, ...patch }]),
      }),
    }));

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({ set: setMock }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "5000" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removePayment(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      paymentId: "pay-1",
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        updatedAt: expect.any(Date),
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "transitioned",
        entityType: "payment_request",
        changes: expect.objectContaining({
          fromStatus: "paid",
          toStatus: "approved",
        }),
      }),
    );
  });

  it("reopens a partially approved paid request to partially_approved", async () => {
    const payment = makePayment({ amountCents: 5000 });
    const request = makeRequest({
      status: "paid",
      requestedAmountCents: 10000,
      approvedAmountCents: 7000,
    });
    const deleted = makePayment({ amountCents: 5000, deletedAt: new Date() });
    const setMock = vi.fn().mockImplementation((patch: Record<string, unknown>) => ({
      where: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(patch.deletedAt ? [deleted] : [{ ...request, ...patch }]),
      }),
    }));

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({ set: setMock }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "5000" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removePayment(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      paymentId: "pay-1",
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partially_approved",
      }),
    );
  });

  it("keeps a paid request closed when remaining payments still cover approval", async () => {
    const payment = makePayment({ amountCents: 5000 });
    const request = makeRequest({
      status: "paid",
      requestedAmountCents: 10000,
      approvedAmountCents: 7000,
    });
    const deleted = makePayment({ amountCents: 5000, deletedAt: new Date() });
    const setMock = vi.fn().mockImplementation((patch: Record<string, unknown>) => ({
      where: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(patch.deletedAt ? [deleted] : [{ ...request, ...patch }]),
      }),
    }));

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnValue({ set: setMock }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalPaid: "7000" }]),
        }),
      }),
    };

    const db = {
      query: {
        grantPayments: { findFirst: vi.fn().mockResolvedValue(payment) },
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removePayment(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      paymentId: "pay-1",
    });

    expect(setMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.any(String),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// listPayments
// ---------------------------------------------------------------------------

describe("listPayments", () => {
  it("returns payments ordered by receivedDate desc", async () => {
    const payments = [makePayment(), makePayment({ id: "pay-2", amountCents: 3000 })];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(payments),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await listPayments(db, { orgId: "org-1", requestId: "req-1" });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no payments", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await listPayments(db, { orgId: "org-1", requestId: "req-1" });
    expect(result).toEqual([]);
  });
});
