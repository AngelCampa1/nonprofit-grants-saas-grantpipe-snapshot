import { describe, it, expect, vi } from "vitest";
import {
  createDbHandle,
  grantPaymentRequestLines,
  grantPaymentRequests,
  type Database,
} from "@grantpipe/db";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";

import {
  listPaymentRequests,
  getOutstandingSummary,
  getPaymentRequest,
  createPaymentRequest,
  updatePaymentRequest,
  deletePaymentRequest,
  transitionPaymentRequest,
  recalcRequestAmounts,
} from "./request.service";

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
    status: "draft",
    periodStart: null,
    periodEnd: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    closedAt: null,
    requestedAmountCents: 0,
    approvedAmountCents: 0,
    funderReference: null,
    notes: null,
    autoPostJournalEntry: false,
    createdBy: "user-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listPaymentRequests
// ---------------------------------------------------------------------------

describe("listPaymentRequests", () => {
  it("scopes both list and count queries through grants in the active entity", async () => {
    const dataWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
      }),
    });
    const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi
            .fn()
            .mockReturnValue({ leftJoin: vi.fn().mockReturnValue({ where: dataWhere }) }),
        })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: countWhere }) }),
    } as unknown as Database;

    await listPaymentRequests(db, {
      orgId: "org-1",
      entityId: "entity-1",
      page: 1,
      pageSize: 25,
    });

    const collectStrings = (root: unknown): string[] => {
      const result: string[] = [];
      const seen = new WeakSet<object>();
      const visit = (value: unknown) => {
        if (typeof value === "string") result.push(value);
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") {
          if (seen.has(value)) return;
          seen.add(value);
          Object.values(value as Record<string, unknown>).forEach(visit);
        }
      };
      visit(root);
      return result;
    };
    const listSql = collectStrings(dataWhere.mock.calls[0]?.[0]).join(" ");
    const countSql = collectStrings(countWhere.mock.calls[0]?.[0]).join(" ");
    expect(listSql).toContain("payment_scope_grant.entity_id");
    expect(countSql).toContain("payment_scope_grant.entity_id");
  });

  it("returns paginated requests with all filters", async () => {
    const req = makeRequest();

    // Chain: select().from().leftJoin().where().orderBy().limit().offset()
    const dataFrom = {
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([req]) }),
          }),
        }),
      }),
    };
    const countFrom = {
      where: vi.fn().mockResolvedValue([{ count: 1 }]),
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(dataFrom) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(countFrom) }),
    } as unknown as Database;

    const result = await listPaymentRequests(db, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
      status: "draft",
      type: "reimbursement",
      page: 1,
      pageSize: 25,
    });

    expect(result.data).toEqual([req]);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("scopes the grants leftJoin by grants.orgId (not grantPaymentRequests.orgId) to prevent cross-org grant name leakage", async () => {
    const leftJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });
    const dataFrom = { leftJoin: leftJoinSpy };
    const countFrom = { where: vi.fn().mockResolvedValue([{ count: 0 }]) };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(dataFrom) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(countFrom) }),
    } as unknown as Database;

    await listPaymentRequests(db, { orgId: "org-1", page: 1, pageSize: 10 });

    expect(leftJoinSpy).toHaveBeenCalledTimes(1);
    const joinClause = leftJoinSpy.mock.calls[0]?.[1] as {
      queryChunks?: unknown[];
    };
    expect(joinClause?.queryChunks).toBeDefined();

    // Collect { columnName, tableName } pairs from the Drizzle SQL predicate.
    // A Drizzle column node has `.name` (column name) and `.table` (a Drizzle
    // table object). The table's SQL name lives under Symbol(drizzle:Name).
    // We inspect `.table` shallowly — name only — to avoid traversing sibling
    // columns and risking circular references.
    const drizzleNameSym = Symbol.for("drizzle:Name");
    const seenTableColumns: Array<{ col: string; table: string }> = [];
    const visited = new WeakSet<object>();
    const visit = (node: unknown) => {
      if (node === null || node === undefined) return;
      if (typeof node !== "object") return;
      if (visited.has(node as object)) return;
      visited.add(node as object);
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" && obj.table !== undefined) {
        const tbl = obj.table as Record<symbol, unknown>;
        const tableName =
          typeof tbl[drizzleNameSym] === "string" ? (tbl[drizzleNameSym] as string) : "";
        seenTableColumns.push({ col: obj.name, table: tableName });
        return; // do not recurse into table
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key === "table") continue;
        visit(value);
      }
    };
    visit(joinClause);

    // The predicate must reference orgId specifically on the `grants` table.
    // A bug joining on `grant_payment_requests.orgId` instead would put
    // "grant_payment_requests" here and fail this assertion.
    const grantsOrgId = seenTableColumns.find(
      ({ col, table }) => (col === "orgId" || col === "org_id") && table === "grants",
    );
    expect(grantsOrgId).toBeDefined();

    // Confirm no orgId reference from the payment-requests table appears in the join clause.
    const requestsOrgId = seenTableColumns.find(
      ({ col, table }) =>
        (col === "orgId" || col === "org_id") && table === "grant_payment_requests",
    );
    expect(requestsOrgId).toBeUndefined();
  });

  it("returns empty list when no requests", async () => {
    const dataFrom = {
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
    };
    const countFrom = { where: vi.fn().mockResolvedValue([{ count: 0 }]) };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(dataFrom) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(countFrom) }),
    } as unknown as Database;

    const result = await listPaymentRequests(db, { orgId: "org-1", page: 1, pageSize: 10 });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("handles missing count result gracefully", async () => {
    const dataFrom = {
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
    };
    const countFrom = { where: vi.fn().mockResolvedValue([undefined]) };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(dataFrom) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue(countFrom) }),
    } as unknown as Database;

    const result = await listPaymentRequests(db, { orgId: "org-1", page: 2, pageSize: 5 });
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getOutstandingSummary
// ---------------------------------------------------------------------------

describe("getOutstandingSummary", () => {
  it("returns aggregated summary", async () => {
    const summaryData = {
      totalOutstandingCents: "50000",
      submittedCount: "2",
      approvedCount: "1",
      overdueCount: "1",
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([summaryData]),
        }),
      }),
    } as unknown as Database;

    const result = await getOutstandingSummary(db, { orgId: "org-1" });
    expect(result.totalOutstandingCents).toBe(50000);
    expect(result.submittedCount).toBe(2);
    expect(result.approvedCount).toBe(1);
    expect(result.overdueCount).toBe(1);
  });

  it("scopes paid totals subquery by payment org id", async () => {
    const selectSpy = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([undefined]),
      }),
    });
    const db = { select: selectSpy } as unknown as Database;

    await getOutstandingSummary(db, { orgId: "org-1" });

    const selection = selectSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const strings: string[] = [];
    const visited = new WeakSet<object>();
    const visit = (node: unknown) => {
      if (node === null || node === undefined) return;
      if (typeof node === "string") {
        strings.push(node);
        return;
      }
      if (typeof node !== "object") return;
      if (visited.has(node as object)) return;
      visited.add(node as object);
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      for (const value of Object.values(node as Record<string, unknown>)) {
        visit(value);
      }
    };
    visit(selection.totalOutstandingCents);

    expect(strings.join(" ")).toContain("p.org_id");
  });

  it("returns zeros when no data", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([undefined]),
        }),
      }),
    } as unknown as Database;

    const result = await getOutstandingSummary(db, { orgId: "org-1" });
    expect(result.totalOutstandingCents).toBe(0);
    expect(result.submittedCount).toBe(0);
    expect(result.approvedCount).toBe(0);
    expect(result.overdueCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getPaymentRequest
// ---------------------------------------------------------------------------

describe("getPaymentRequest", () => {
  it("returns request with computed totals", async () => {
    const req = makeRequest({
      approvedAmountCents: 10000,
      lines: [{ id: "line-1", amountCents: 5000, deletedAt: null }],
      adjustments: [],
      payments: [{ id: "pay-1", amountCents: 3000, deletedAt: null }],
    });

    const db = {
      query: {
        grantPaymentRequests: {
          findFirst: vi.fn().mockResolvedValue(req),
        },
      },
    } as unknown as Database;

    const result = await getPaymentRequest(db, { orgId: "org-1", requestId: "req-1" });
    expect(result.requestedAmountCents).toBe(5000);
    expect(result.paidAmountCents).toBe(3000);
    expect(result.approvedAmountCents).toBe(10000);
    expect(result.outstandingCents).toBe(7000);
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(getPaymentRequest(db, { orgId: "org-1", requestId: "bad" })).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("computes outstanding as 0 when paid exceeds approved", async () => {
    const req = makeRequest({
      approvedAmountCents: 1000,
      lines: [],
      adjustments: [],
      payments: [{ id: "p1", amountCents: 5000, deletedAt: null }],
    });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(req) } },
    } as unknown as Database;

    const result = await getPaymentRequest(db, { orgId: "org-1", requestId: "req-1" });
    expect(result.outstandingCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createPaymentRequest
// ---------------------------------------------------------------------------

describe("createPaymentRequest", () => {
  it("creates a payment request with auto-assigned request number", async () => {
    const created = makeRequest({ requestNumber: 1 });
    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ nextNumber: 1 }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      }),
    };

    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await createPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      grantId: "grant-1",
      type: "reimbursement",
      autoPostJournalEntry: false,
    });

    expect(result.requestNumber).toBe(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entityType: "payment_request" }),
    );
  });

  it("throws notFound when grant does not belong to org", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      createPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "bad-grant",
        type: "reimbursement",
        autoPostJournalEntry: false,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invalid create input before reading grants", async () => {
    const findGrant = vi.fn();
    const db = {
      query: {
        grants: { findFirst: findGrant },
      },
    } as unknown as Database;

    await expect(
      createPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "",
        type: "reimbursement",
        autoPostJournalEntry: false,
      }),
    ).rejects.toThrow(/Too small/);
    expect(findGrant).not.toHaveBeenCalled();
  });

  it("throws internalError when insert returns nothing", async () => {
    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ nextNumber: 1 }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    const db = {
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      createPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "grant-1",
        type: "reimbursement",
        autoPostJournalEntry: false,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// updatePaymentRequest
// ---------------------------------------------------------------------------

describe("updatePaymentRequest", () => {
  it("updates a draft request", async () => {
    const existing = makeRequest({ status: "draft" });
    const updated = makeRequest({ status: "draft", notes: "updated" });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updatePaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { notes: "updated" },
    });

    expect(result.notes).toBe("updated");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated" }),
    );
  });

  it("throws badRequest when not in draft status", async () => {
    const existing = makeRequest({ status: "submitted" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
    } as unknown as Database;

    await expect(
      updatePaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { notes: "new" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      updatePaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "bad",
        data: { notes: "x" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invalid update input before reading payment requests", async () => {
    const findRequest = vi.fn();
    const db = {
      query: {
        grantPaymentRequests: { findFirst: findRequest },
      },
    } as unknown as Database;

    await expect(
      updatePaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {},
      }),
    ).rejects.toThrow(/At least one field/);
    expect(findRequest).not.toHaveBeenCalled();
  });

  it("throws notFound when update returns nothing (race condition)", async () => {
    const existing = makeRequest({ status: "draft" });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      updatePaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { notes: "x" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// deletePaymentRequest
// ---------------------------------------------------------------------------

describe("deletePaymentRequest", () => {
  it("soft deletes a draft request", async () => {
    const existing = makeRequest({ status: "draft" });
    const deleted = makeRequest({ status: "draft", deletedAt: new Date() });
    const updateChains: unknown[] = [];

    const txMock = {
      update: vi.fn().mockImplementation(() => {
        const chain = {
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
        updateChains.push(chain);
        return chain;
      }),
    };
    vi.mocked(txMock.update).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([deleted]),
        }),
      }),
    } as never);

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await deletePaymentRequest(db, { orgId: "org-1", actorId: "user-1", requestId: "req-1" });

    expect(txMock.update).toHaveBeenCalledWith(grantPaymentRequestLines);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("soft deletes a rejected request", async () => {
    const existing = makeRequest({ status: "rejected" });
    const deleted = makeRequest({ status: "rejected", deletedAt: new Date() });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deleted]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await deletePaymentRequest(db, { orgId: "org-1", actorId: "user-1", requestId: "req-1" });
    expect(recordActivityLog).toHaveBeenCalled();
  });

  it("throws badRequest when not in deletable status", async () => {
    const existing = makeRequest({ status: "submitted" });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      deletePaymentRequest(db, { orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Database;

    await expect(
      deletePaymentRequest(db, { orgId: "org-1", actorId: "user-1", requestId: "bad" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when update returns nothing", async () => {
    const existing = makeRequest({ status: "draft" });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      deletePaymentRequest(db, { orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// transitionPaymentRequest
// ---------------------------------------------------------------------------

describe("transitionPaymentRequest", () => {
  it("compiles the active entity into the relational transition ownership predicate", async () => {
    const { db: relationalDb, close } = await createDbHandle(
      "postgresql://unused:unused@127.0.0.1:5432/unused",
    );
    let compiled: ReturnType<
      ReturnType<typeof relationalDb.query.grantPaymentRequests.findFirst>["toSQL"]
    > | null = null;
    const db = {
      query: {
        grantPaymentRequests: {
          findFirst: vi.fn((config) => {
            compiled = relationalDb.query.grantPaymentRequests.findFirst(config).toSQL();
            return Promise.resolve(null);
          }),
        },
      },
    } as unknown as Database;

    try {
      await expect(
        transitionPaymentRequest(db, {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          requestId: "req-1",
          transition: { fromStatus: "draft", toStatus: "submitted" },
        }),
      ).rejects.toMatchObject({ status: 404 });

      expect(compiled).not.toBeNull();
      expect(compiled!.sql).toContain("from grants as payment_scope_grant");
      expect(compiled!.sql).toContain('payment_scope_grant.id = "grantPaymentRequests"."grant_id"');
      expect(compiled!.sql).toContain("payment_scope_grant.entity_id = $4");
      expect(compiled!.sql).toContain("payment_scope_grant.deleted_at is null");
      expect(compiled!.params).toEqual(["req-1", "org-1", "org-1", "entity-1", 1]);
    } finally {
      await close();
    }
  });

  it("transitions from draft to submitted", async () => {
    const existing = makeRequest({ status: "draft" });
    const updated = makeRequest({ status: "submitted", submittedAt: new Date() });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "draft", toStatus: "submitted" },
    });

    expect(result.status).toBe("submitted");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "transitioned" }),
    );
  });

  it("transitions from submitted to approved and sets approvedAmountCents", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 5000 });
    const updated = makeRequest({ status: "approved", approvedAmountCents: 5000 });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "submitted", toStatus: "approved", approvedAmountCents: 5000 },
    });

    expect(result.approvedAmountCents).toBe(5000);
  });

  it("defaults approvedAmountCents to requestedAmountCents when caller omits it on approve", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 7500 });
    const updated = makeRequest({ status: "approved", approvedAmountCents: 7500 });
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updated]),
      }),
    });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({ set: setSpy }),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "submitted", toStatus: "approved" },
    });

    expect(result.approvedAmountCents).toBe(7500);
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ approvedAmountCents: 7500 }));
  });

  it("throws badRequest when approving with approvedAmountCents of 0", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 5000 });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "submitted", toStatus: "approved", approvedAmountCents: 0 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws badRequest when approving with negative approvedAmountCents", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 5000 });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "submitted", toStatus: "approved", approvedAmountCents: -100 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws badRequest when approving above the requested amount", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 5000 });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: {
          fromStatus: "submitted",
          toStatus: "approved",
          approvedAmountCents: 5001,
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws badRequest when approving without approvedAmountCents and request has zero requestedAmountCents", async () => {
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 0 });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "submitted", toStatus: "partially_approved" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "bad",
        transition: { fromStatus: "draft", toStatus: "submitted" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws conflict when fromStatus doesn't match current status", async () => {
    const existing = makeRequest({ status: "submitted" });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "draft", toStatus: "submitted" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws badRequest for invalid transition", async () => {
    const existing = makeRequest({ status: "draft" });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "draft", toStatus: "closed" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sets rejectedAt when transitioning to rejected", async () => {
    const existing = makeRequest({ status: "submitted" });
    const updated = makeRequest({ status: "rejected", rejectedAt: new Date() });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "submitted", toStatus: "rejected" },
    });

    expect(result.status).toBe("rejected");
  });

  it("releases expense-line dedup claims when transitioning to rejected", async () => {
    const existing = makeRequest({ status: "submitted" });
    const updated = makeRequest({ status: "rejected", rejectedAt: new Date() });
    const update = vi.fn((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning:
            table === grantPaymentRequests ? vi.fn().mockResolvedValue([updated]) : undefined,
        })),
      })),
    }));
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      update,
    } as unknown as Database;

    await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "submitted", toStatus: "rejected" },
    });

    expect(update).toHaveBeenCalledWith(grantPaymentRequestLines);
  });

  it("sets closedAt when transitioning to closed", async () => {
    const existing = makeRequest({ status: "paid" });
    const updated = makeRequest({ status: "closed", closedAt: new Date() });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Database;

    await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "paid", toStatus: "closed" },
    });

    expect(recordActivityLog).toHaveBeenCalled();
  });

  it("throws conflict when the status-guarded update matches nothing (concurrent transition)", async () => {
    // The row existed at read time (findFirst returns it), but the atomic
    // claim UPDATE...WHERE status=fromStatus matched nothing — a concurrent
    // request already moved the status. This is a 409 conflict (TOCTOU loser),
    // not a 404: the row is present, its status simply changed underneath us.
    const existing = makeRequest({ status: "draft" });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "draft", toStatus: "submitted" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("does not double-approve under a concurrent transition race (atomic claim guards status)", async () => {
    // Two approvals race. Both read status='submitted' (the stale pre-check),
    // but the atomic UPDATE...WHERE status='submitted' RETURNING lets exactly
    // one win. The loser's returning() is empty -> 409, and crucially its
    // activity log + side effects never fire (no double-approval audit entry).
    vi.mocked(recordActivityLog).mockClear();
    const existing = makeRequest({ status: "submitted", requestedAmountCents: 5000 });
    const returning = vi.fn().mockResolvedValue([]);
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }),
      }),
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "submitted", toStatus: "approved", approvedAmountCents: 5000 },
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recalcRequestAmounts
// ---------------------------------------------------------------------------

describe("recalcRequestAmounts", () => {
  it("sums line amounts and updates the request", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalCents: "7500" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as unknown as Database;

    await recalcRequestAmounts(db, { requestId: "req-1", orgId: "org-1" });

    expect(db.update).toHaveBeenCalled();
  });

  it("uses 0 when no lines exist", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ totalCents: null }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as unknown as Database;

    await recalcRequestAmounts(db, { requestId: "req-1", orgId: "org-1" });

    const setCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0]?.value?.set;
    expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ requestedAmountCents: 0 }));
  });
});

// ---------------------------------------------------------------------------
// updatePaymentRequest — additional branch coverage
// ---------------------------------------------------------------------------

describe("updatePaymentRequest — period date branches", () => {
  it("sets periodStart to new Date when provided as string", async () => {
    const existing = makeRequest({ status: "draft" });
    const updated = makeRequest({ periodStart: new Date("2026-01-01") });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updatePaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-03-31T00:00:00.000Z" },
    });

    expect(result).toBeDefined();
  });

  it("sets periodStart and periodEnd to null when passed as null", async () => {
    const existing = makeRequest({ status: "draft", periodStart: new Date("2026-01-01") });
    const updated = makeRequest({ periodStart: null, periodEnd: null });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updatePaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { periodStart: null, periodEnd: null },
    });

    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
  });
});

describe("updatePaymentRequest — all optional fields", () => {
  it("updates type, funderReference, and autoPostJournalEntry fields", async () => {
    const existing = makeRequest({ status: "draft" });
    const updated = makeRequest({
      status: "draft",
      type: "drawdown",
      funderReference: "REF-XYZ",
      autoPostJournalEntry: true,
    });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updatePaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      data: {
        type: "drawdown",
        funderReference: "REF-XYZ",
        autoPostJournalEntry: true,
        notes: "updated notes",
      },
    });

    expect(result.type).toBe("drawdown");
    expect(result.funderReference).toBe("REF-XYZ");
    expect(result.autoPostJournalEntry).toBe(true);
  });
});

describe("createPaymentRequest — all optional fields", () => {
  it("creates a request with periodStart, periodEnd, funderReference, notes", async () => {
    const created = makeRequest({
      requestNumber: 2,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-03-31"),
      funderReference: "REF-789",
      notes: "Some notes",
    });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ nextNumber: 2 }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      }),
    };

    const db = {
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await createPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      grantId: "grant-1",
      type: "reimbursement",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
      funderReference: "REF-789",
      notes: "Some notes",
      autoPostJournalEntry: true,
    });

    expect(result.requestNumber).toBe(2);
  });

  it("uses 1 as requestNumber when numberRow is undefined (fallback)", async () => {
    const created = makeRequest({ requestNumber: 1 });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([undefined]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      }),
    };

    const db = {
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await createPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      grantId: "grant-1",
      type: "reimbursement",
      autoPostJournalEntry: false,
    });

    expect(result.requestNumber).toBe(1);
  });
});

describe("transitionPaymentRequest — STATUS_TRANSITIONS fallback", () => {
  it("throws badRequest when fromStatus has no transitions (unknown status)", async () => {
    // Use a made-up status that isn't in STATUS_TRANSITIONS
    const existing = makeRequest({ status: "legacy_status" });
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: {
          fromStatus: "legacy_status" as "draft",
          toStatus: "submitted",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("transitionPaymentRequest — called with plain Database (transaction branch)", () => {
  it("wraps runUpdate in a transaction when db has a transaction method", async () => {
    const existing = makeRequest({ status: "draft" });
    const updated = makeRequest({ status: "submitted", submittedAt: new Date() });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      // Presence of `transaction` triggers the "wrap in transaction" branch (line 450)
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "draft", toStatus: "submitted" },
    });

    expect(result.status).toBe("submitted");
    expect(db.transaction).toHaveBeenCalled();
  });
});

describe("createPaymentRequest — retry logic", () => {
  it("retries on unique constraint violation and succeeds on second attempt", async () => {
    const created = makeRequest({ requestNumber: 2 });

    let attempt = 0;
    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ nextNumber: 1 }]),
        }),
      }),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            attempt++;
            if (attempt === 1) {
              throw new Error("unique constraint violation");
            }
            return Promise.resolve([created]);
          }),
        }),
      })),
    };

    const db = {
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await createPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      grantId: "grant-1",
      type: "reimbursement",
      autoPostJournalEntry: false,
    });

    expect(result.requestNumber).toBe(2);
    expect(txMock.insert).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on a non-unique error", async () => {
    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ nextNumber: 1 }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("foreign key constraint")),
        }),
      }),
    };

    const db = {
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      createPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "grant-1",
        type: "reimbursement",
        autoPostJournalEntry: false,
      }),
    ).rejects.toThrow("foreign key constraint");
  });
});

// ---------------------------------------------------------------------------
// transitionPaymentRequest — rejected → draft clears rejectedAt
// ---------------------------------------------------------------------------

describe("transitionPaymentRequest — rejected to draft", () => {
  it("clears rejectedAt when transitioning from rejected back to draft", async () => {
    const existing = makeRequest({ status: "rejected", rejectedAt: new Date() });
    const updated = makeRequest({ status: "draft", rejectedAt: null });

    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "rejected", toStatus: "draft" },
    });

    expect(result.status).toBe("draft");
    expect(result.rejectedAt).toBeNull();
  });

  it("restores expense-line dedup claims when a rejected request returns to draft", async () => {
    const existing = makeRequest({ status: "rejected", rejectedAt: new Date() });
    const updated = makeRequest({ status: "draft", rejectedAt: null });
    const update = vi.fn((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning:
            table === grantPaymentRequests ? vi.fn().mockResolvedValue([updated]) : undefined,
        })),
      })),
    }));
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      update,
    } as unknown as Database;

    await transitionPaymentRequest(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      requestId: "req-1",
      transition: { fromStatus: "rejected", toStatus: "draft" },
    });

    expect(update).toHaveBeenCalledWith(grantPaymentRequestLines);
  });

  it("rejects returning to draft when another active request has claimed the same expense", async () => {
    const existing = makeRequest({ status: "rejected", rejectedAt: new Date() });
    const updated = makeRequest({ status: "draft", rejectedAt: null });
    const where = vi.fn().mockResolvedValue([{ id: "line-conflict" }]);
    const db = {
      query: { grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(existing) } },
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([updated]),
          })),
        })),
      })),
    } as unknown as Database;

    await expect(
      transitionPaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: { fromStatus: "rejected", toStatus: "draft" },
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(db.update).not.toHaveBeenCalledWith(grantPaymentRequests);
  });
});

// ---------------------------------------------------------------------------
// updatePaymentRequest — null periodStart/periodEnd branch
// ---------------------------------------------------------------------------

describe("updatePaymentRequest — null period date branches", () => {
  it("rejects empty-string period dates before reading payment requests", async () => {
    const findRequest = vi.fn();
    const db = {
      query: { grantPaymentRequests: { findFirst: findRequest } },
    } as unknown as Database;

    await expect(
      updatePaymentRequest(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { periodStart: "", periodEnd: "" },
      }),
    ).rejects.toThrow(/Invalid ISO datetime/);
    expect(findRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPaymentRequest — empty lines and payments arrays (default branches)
// ---------------------------------------------------------------------------

describe("getPaymentRequest — empty relations", () => {
  it("returns zeros when request has no lines, adjustments, or payments", async () => {
    const request = makeRequest({ approvedAmountCents: 0 });

    const db = {
      query: {
        grantPaymentRequests: {
          findFirst: vi.fn().mockResolvedValue({
            ...request,
            lines: null,
            adjustments: null,
            payments: null,
          }),
        },
      },
    } as unknown as Database;

    const result = await getPaymentRequest(db, { orgId: "org-1", requestId: "req-1" });

    expect(result.requestedAmountCents).toBe(0);
    expect(result.paidAmountCents).toBe(0);
    expect(result.outstandingCents).toBe(0);
  });
});
