import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEvent, listAuditEvents, exportAuditEventsCSV } from "./audit-event.service";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

const now = new Date("2026-05-04T12:00:00.000Z");

const mockEvent = {
  id: "event-1",
  orgId: "org-1",
  sessionId: "session-1",
  reviewerId: "reviewer-1",
  eventType: "view",
  targetType: "grant",
  targetId: "grant-1",
  ipHash: null,
  userAgentHash: null,
  createdAt: now,
};

function makeSelectCountThenItems(countValue: number, items: unknown[]) {
  let callCount = 0;
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Object.assign(Promise.resolve([{ value: countValue }]), {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(async () => items),
              })),
            })),
          });
        }
        return Object.assign(Promise.resolve([{ value: countValue }]), {
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(async () => items),
            })),
          })),
        });
      }),
    })),
  }));
}

function makeSelectForExport(items: unknown[]) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(async () => items),
      })),
    })),
  }));
}

type MockDb = { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };

function makeDb(
  overrides: Record<string, unknown> = {},
): MockDb & Parameters<typeof recordAuditEvent>[0] {
  const db: MockDb = {
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
    select: makeSelectCountThenItems(1, [mockEvent]),
    ...overrides,
  } as MockDb;

  return db as unknown as MockDb & Parameters<typeof recordAuditEvent>[0];
}

describe("recordAuditEvent", () => {
  beforeEach(() => {
    mockCaptureBackgroundException.mockClear();
  });

  it("inserts an audit event", async () => {
    const db = makeDb();
    await recordAuditEvent(db, {
      orgId: "org-1",
      sessionId: "session-1",
      reviewerId: "reviewer-1",
      eventType: "view",
      targetType: "grant",
      targetId: "grant-1",
    });
    expect(vi.mocked(db.insert)).toHaveBeenCalled();
  });

  it("does not throw when insert fails (fire and forget)", async () => {
    const db = makeDb({
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error("DB error");
        }),
      })),
    });
    await expect(
      recordAuditEvent(db, {
        orgId: "org-1",
        sessionId: "session-1",
        reviewerId: "reviewer-1",
        eventType: "session_open",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs the error to console.error when insert fails so it appears in Worker logs (fix #12)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const insertError = new Error("Postgres connection timeout");
    const db = makeDb({
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw insertError;
        }),
      })),
    });

    await recordAuditEvent(db, {
      orgId: "org-1",
      sessionId: "session-1",
      reviewerId: "reviewer-1",
      eventType: "session_open",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith("[audit-event] failed to record:", insertError);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      insertError,
      "external-reviewer-portal",
      expect.objectContaining({
        step: "audit_event_record",
        audit_event_type: "session_open",
      }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("throws when audit persistence is required", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const insertError = new Error("Postgres connection timeout");
    const db = makeDb({
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw insertError;
        }),
      })),
    });

    await expect(
      recordAuditEvent(
        db,
        {
          orgId: "org-1",
          sessionId: "session-1",
          reviewerId: "reviewer-1",
          eventType: "download",
        },
        { throwOnFailure: true },
      ),
    ).rejects.toThrow("Postgres connection timeout");

    consoleErrorSpy.mockRestore();
  });

  it("handles all optional fields being omitted", async () => {
    const db = makeDb();
    await expect(
      recordAuditEvent(db, {
        orgId: "org-1",
        sessionId: "session-1",
        reviewerId: "reviewer-1",
        eventType: "expired",
      }),
    ).resolves.toBeUndefined();
  });

  it("records with ipHash and userAgentHash when provided", async () => {
    const valuesSpy = vi.fn(async () => undefined);
    const db = makeDb({
      insert: vi.fn(() => ({ values: valuesSpy })),
    });
    await recordAuditEvent(db, {
      orgId: "org-1",
      sessionId: "session-1",
      reviewerId: "reviewer-1",
      eventType: "download",
      ipHash: "hash-ip",
      userAgentHash: "hash-ua",
    });
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ipHash: "hash-ip", userAgentHash: "hash-ua" }),
    );
  });
});

describe("listAuditEvents", () => {
  it("returns paginated items and total", async () => {
    const db = makeDb();
    const result = await listAuditEvents(db, "org-1", {
      page: 1,
      pageSize: 25,
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("applies sessionId filter", async () => {
    const db = makeDb();
    const result = await listAuditEvents(db, "org-1", {
      page: 1,
      pageSize: 25,
      sessionId: "session-1",
    });
    expect(result).toBeDefined();
  });

  it("applies reviewerId filter", async () => {
    const db = makeDb();
    const result = await listAuditEvents(db, "org-1", {
      page: 1,
      pageSize: 25,
      reviewerId: "reviewer-1",
    });
    expect(result).toBeDefined();
  });

  it("applies eventType filter", async () => {
    const db = makeDb();
    const result = await listAuditEvents(db, "org-1", {
      page: 1,
      pageSize: 25,
      eventType: "view",
    });
    expect(result).toBeDefined();
  });

  it("applies fromDate and toDate filters", async () => {
    const db = makeDb();
    const result = await listAuditEvents(db, "org-1", {
      page: 1,
      pageSize: 25,
      fromDate: "2026-01-01T00:00:00.000Z",
      toDate: "2026-12-31T00:00:00.000Z",
    });
    expect(result).toBeDefined();
  });

  it("returns zero total when no events match", async () => {
    const db = makeDb({ select: makeSelectCountThenItems(0, []) });
    const result = await listAuditEvents(db, "org-1", { page: 1, pageSize: 25 });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("returns a JSON-safe number when the database count is a bigint", async () => {
    const db = makeDb({ select: makeSelectCountThenItems(1n as unknown as number, []) });
    const result = await listAuditEvents(db, "org-1", { page: 1, pageSize: 25 });
    expect(result.total).toBe(1);
    expect(typeof result.total).toBe("number");
  });
});

describe("exportAuditEventsCSV", () => {
  it("returns CSV with correct headers", async () => {
    const db = makeDb({ select: makeSelectForExport([mockEvent]) });
    const csv = await exportAuditEventsCSV(db, "org-1");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,session_id,reviewer_id,event_type,target_type,target_id,created_at");
  });

  it("returns one data row per event", async () => {
    const db = makeDb({ select: makeSelectForExport([mockEvent]) });
    const csv = await exportAuditEventsCSV(db, "org-1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
  });

  it("filters by sessionId when provided", async () => {
    const db = makeDb({ select: makeSelectForExport([mockEvent]) });
    const csv = await exportAuditEventsCSV(db, "org-1", "session-1");
    expect(csv).toContain("session-1");
  });

  it("returns only headers when no events", async () => {
    const db = makeDb({ select: makeSelectForExport([]) });
    const csv = await exportAuditEventsCSV(db, "org-1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });

  it("handles null targetType and targetId gracefully", async () => {
    const eventWithNulls = { ...mockEvent, targetType: null, targetId: null };
    const db = makeDb({ select: makeSelectForExport([eventWithNulls]) });
    const csv = await exportAuditEventsCSV(db, "org-1");
    expect(csv).toContain('""'); // empty quoted cells for null values
  });

  it("escapes double quotes in CSV cells", async () => {
    const eventWithQuotes = {
      ...mockEvent,
      eventType: 'view "special"',
    };
    const db = makeDb({ select: makeSelectForExport([eventWithQuotes]) });
    const csv = await exportAuditEventsCSV(db, "org-1");
    expect(csv).toContain('""special""');
  });
});
