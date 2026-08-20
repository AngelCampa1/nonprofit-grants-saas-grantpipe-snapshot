import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifications } from "@grantpipe/db";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { buildAnomalyAlert, scanAccountingAnomalies } from "./anomaly-alerts";
import type { AnomalyItem } from "../accounting/anomaly.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockGetAnomalies,
  mockIsWithinBusinessHours,
  mockSendEmail,
  mockCaptureAnalytics,
  mockGetIntegrations,
} = vi.hoisted(() => ({
  mockGetAnomalies: vi.fn(),
  mockIsWithinBusinessHours: vi.fn().mockReturnValue(true),
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
  mockCaptureAnalytics: vi.fn().mockResolvedValue(undefined),
  mockGetIntegrations: vi.fn(),
}));

vi.mock("../accounting/anomaly.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../accounting/anomaly.service")>();
  return {
    ...actual,
    getAnomalies: mockGetAnomalies,
  };
});

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return {
    ...actual,
    isWithinBusinessHours: mockIsWithinBusinessHours,
  };
});

vi.mock("../../lib/sentry", () => ({
  captureScheduledException: vi.fn(),
}));

vi.mock("../../lib/db-retry", () => ({
  withDbRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: mockGetIntegrations,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Notification = typeof notifications.$inferInsert;

function buildOrgMember(overrides: {
  orgId: string;
  userId: string;
  userEmail: string;
  userName: string;
  orgMemberId?: string;
  role?: "admin" | "editor" | "viewer" | "auditor";
  permissions?: Record<string, string> | null;
  entityMembers?: Array<{
    entityId: string;
    role: "admin" | "editor" | "viewer" | "auditor";
    permissions?: Record<string, string> | null;
    deletedAt?: Date | null;
    entity?: { status: string; deletedAt: Date | null } | null;
  }>;
  planTier?: string;
  timezone?: string;
}) {
  return {
    id: overrides.orgMemberId ?? `member-${overrides.userId}`,
    orgId: overrides.orgId,
    role: overrides.role ?? "viewer",
    permissions: overrides.permissions ?? null,
    deletedAt: null,
    entityMembers: (
      overrides.entityMembers ?? [{ entityId: "entity-1", role: "viewer" as const }]
    ).map((entityMember) => ({
      ...entityMember,
      entity: entityMember.entity ?? { status: "active", deletedAt: null },
    })),
    organization: {
      id: overrides.orgId,
      timezone: overrides.timezone ?? "America/Chicago",
      planTier: overrides.planTier ?? "audit_ready",
      subscriptionStatus: "active",
      trialEndsAt: null,
    },
    user: {
      id: overrides.userId,
      email: overrides.userEmail,
      name: overrides.userName,
    },
  };
}

function buildAnomalyItem(
  overrides: Partial<AnomalyItem> & { severity?: AnomalyItem["severity"] } = {},
): AnomalyItem {
  return {
    class: "duplicate_donation",
    severity: overrides.severity ?? "warning",
    reason: "Duplicate donation detected with same amount and date",
    entityType: "donation",
    entityId: "don-1",
    contactId: "contact-1",
    duplicateGroupIds: ["don-1", "don-2"],
    ...overrides,
  } as AnomalyItem;
}

function buildDb({
  members,
  prefs = [],
  insertedRows = [],
}: {
  members: ReturnType<typeof buildOrgMember>[];
  prefs?: {
    userId: string;
    notificationType: string;
    emailEnabled: boolean;
    inAppEnabled: boolean;
  }[];
  insertedRows?: { dedupeKey: string }[];
}) {
  const inserted = insertedRows.map((r) => ({ dedupeKey: r.dedupeKey }));
  return {
    query: {
      orgMembers: {
        findMany: vi.fn().mockResolvedValue(members),
      },
      notificationPreferences: {
        findMany: vi.fn().mockResolvedValue(prefs),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// buildAnomalyAlert
// ---------------------------------------------------------------------------

describe("buildAnomalyAlert", () => {
  it("produces a human-readable title from the class name", () => {
    const item = buildAnomalyItem({ class: "duplicate_donation", entityId: "don-99" });
    const alert = buildAnomalyAlert(item);
    expect(alert.title).toContain("duplicate donation");
    expect(alert.body).toBe(item.reason);
    expect(alert.dedupeKey).toBe("anomaly:duplicate_donation:don-99");
  });

  it("dedupeKey encodes class and entityId for category_misallocation", () => {
    const item = buildAnomalyItem({
      class: "category_misallocation",
      entityType: "expense",
      entityId: "exp-42",
      severity: "critical",
      reason: "Expense category not allowed by restriction term",
      duplicateGroupIds: undefined,
      expenseCategory: "travel",
      expenseAccountId: null,
      termId: "term-1",
    } as unknown as AnomalyItem);
    const alert = buildAnomalyAlert(item);
    expect(alert.dedupeKey).toBe("anomaly:category_misallocation:exp-42");
  });

  it("dedupeKey encodes class and entityId for indirect_rate_mismatch", () => {
    const item: AnomalyItem = {
      class: "indirect_rate_mismatch",
      severity: "warning",
      reason: "Indirect rate mismatch on payment request",
      entityType: "payment_request",
      entityId: "pr-7",
      postedRateBasisPoints: 1000,
      postedAmountCents: 5000,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 7500,
      deltaCents: 2500,
    };
    const alert = buildAnomalyAlert(item);
    expect(alert.dedupeKey).toBe("anomaly:indirect_rate_mismatch:pr-7");
  });
});

// ---------------------------------------------------------------------------
// scanAccountingAnomalies
// ---------------------------------------------------------------------------

describe("scanAccountingAnomalies", () => {
  const env = { APP_URL: "https://app.grantpipe.com", RESEND_API_KEY: "key" };
  const now = new Date("2026-06-16T14:00:00.000Z");

  beforeEach(() => {
    vi.resetAllMocks();
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockSendEmail.mockResolvedValue(undefined);
    mockCaptureAnalytics.mockResolvedValue(undefined);
    mockGetIntegrations.mockReturnValue({
      email: { send: mockSendEmail },
      analytics: { capture: mockCaptureAnalytics },
    });
  });

  it("isolates entity scans and deliveries to eligible entity members", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        orgMemberId: "member-a",
        userId: "user-a",
        userEmail: "a@example.com",
        userName: "A",
        entityMembers: [{ entityId: "entity-a", role: "admin" }],
      }),
      buildOrgMember({
        orgId: "org-1",
        orgMemberId: "member-b",
        userId: "user-b",
        userEmail: "b@example.com",
        userName: "B",
        entityMembers: [{ entityId: "entity-b", role: "viewer" }],
      }),
      buildOrgMember({
        orgId: "org-1",
        orgMemberId: "member-no-accounting",
        userId: "user-no-accounting",
        userEmail: "none@example.com",
        userName: "No Accounting",
        entityMembers: [
          { entityId: "entity-a", role: "viewer", permissions: { accounting: "none" } },
        ],
      }),
    ];
    const insertedRows: Notification[][] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((rows: Notification[]) => {
          insertedRows.push(rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue(rows.map((row) => ({ dedupeKey: row.dedupeKey! }))),
            }),
          };
        }),
      }),
    };
    mockGetAnomalies.mockImplementation(async (_db: unknown, params: { entityId: string }) => ({
      asOf: now,
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 1,
        indirect_rate_mismatch: 0,
      },
      items: [
        buildAnomalyItem({
          entityId: params.entityId === "entity-a" ? "don-a" : "don-b",
        }),
      ],
    }));

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    const memberQuery = db.query.orgMembers.findMany.mock.calls[0]![0] as {
      with: {
        entityMembers: {
          where: (
            field: { deletedAt: string },
            operators: { isNull: (value: string) => string },
          ) => string;
        };
      };
    };
    expect(
      memberQuery.with.entityMembers.where(
        { deletedAt: "deleted-at" },
        { isNull: (value) => `is-null:${value}` },
      ),
    ).toBe("is-null:deleted-at");
    expect(mockGetAnomalies).toHaveBeenCalledTimes(2);
    expect(mockGetAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-a" }),
    );
    expect(mockGetAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-b" }),
    );
    expect(insertedRows.flat()).toEqual([
      expect.objectContaining({
        userId: "user-a",
        activeEntityId: "entity-a",
        entityId: "don-a",
        dedupeKey: "anomaly:entity-a:duplicate_donation:don-a",
      }),
      expect.objectContaining({
        userId: "user-b",
        activeEntityId: "entity-b",
        entityId: "don-b",
        dedupeKey: "anomaly:entity-b:duplicate_donation:don-b",
      }),
    ]);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@example.com"] }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["b@example.com"] }));
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: ["none@example.com"] }),
    );
  });

  it.each([
    ["archived", { status: "archived", deletedAt: null }],
    ["deleted", { status: "active", deletedAt: new Date("2026-07-01T00:00:00.000Z") }],
  ])("does not scan %s entities", async (_label, entity) => {
    const member = buildOrgMember({
      orgId: "org-1",
      userId: "user-1",
      userEmail: "user@example.com",
      userName: "User",
      entityMembers: [{ entityId: "entity-1", role: "viewer", entity }],
    });
    const db = buildDb({ members: [member] });

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(mockGetAnomalies).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("starts independent entity scans concurrently", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-a",
        userEmail: "a@example.com",
        userName: "A",
        entityMembers: [{ entityId: "entity-a", role: "viewer" }],
      }),
      buildOrgMember({
        orgId: "org-1",
        userId: "user-b",
        userEmail: "b@example.com",
        userName: "B",
        entityMembers: [{ entityId: "entity-b", role: "viewer" }],
      }),
    ];
    const db = buildDb({ members });
    let releaseEntityA!: () => void;
    const entityABlocked = new Promise<void>((resolve) => {
      releaseEntityA = resolve;
    });
    mockGetAnomalies.mockImplementation(async (_db: unknown, params: { entityId: string }) => {
      if (params.entityId === "entity-a") await entityABlocked;
      return {
        asOf: now,
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      };
    });

    const scheduled = scanAccountingAnomalies(
      db as unknown as import("@grantpipe/db").Database,
      env,
      now,
    );
    await vi.waitFor(() => {
      expect(mockGetAnomalies).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ entityId: "entity-b" }),
      );
    });
    releaseEntityA();
    await scheduled;
  });

  it("skips starter org entirely — no scan, no in-app, no email", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "starter",
      }),
    ];
    let insertCalled = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCalled = true;
        return { values: vi.fn() };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(mockGetAnomalies).not.toHaveBeenCalled();
    expect(insertCalled).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips growth org — audit_ready+ gating", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const db = buildDb({ members });

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(mockGetAnomalies).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips org when outside business hours", async () => {
    mockIsWithinBusinessHours.mockReturnValue(false);
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    let insertCalled = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCalled = true;
        return { values: vi.fn() };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertCalled).toBe(false);
    expect(mockGetAnomalies).not.toHaveBeenCalled();
  });

  it("audit_ready org: scans anomalies and inserts notifications for reviewable items", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "audit_ready",
      }),
    ];
    const items = [
      buildAnomalyItem({ severity: "warning", entityId: "don-1" }),
      buildAnomalyItem({ severity: "critical", entityId: "don-2" }),
    ];
    mockGetAnomalies.mockResolvedValue({ asOf: now, items, totals: {} });

    const insertedRows: Notification[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: Notification[]) => {
          insertedRows.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(rows.map((r) => ({ dedupeKey: r.dedupeKey }))),
            }),
          };
        }),
      })),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(mockGetAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", hasRestrictionData: true, hasIndirectRules: true }),
    );
    expect(insertedRows.length).toBe(2);
    expect(insertedRows.every((r) => r.type === "accounting_anomaly")).toBe(true);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingAnomalyAlertCreated,
      payload: {
        anomaly_class: "duplicate_donation",
        severity: "warning",
        entity_type: "donation",
        delivery_channel: "in_app",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingAnomalyAlertCreated,
      payload: {
        anomaly_class: "duplicate_donation",
        severity: "critical",
        entity_type: "donation",
        delivery_channel: "in_app",
      },
    });
  });

  it("captures analytics failures for anomaly alerts without crashing the scan", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    mockCaptureAnalytics.mockRejectedValueOnce(new Error("PostHog down"));
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "audit_ready",
      }),
    ];
    const item = buildAnomalyItem({ severity: "warning", entityId: "don-1" });
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [item], totals: {} });
    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "anomaly:entity-1:duplicate_donation:don-1" }],
    });

    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();

    await vi.waitFor(() => {
      expect(captureScheduledException).toHaveBeenCalledWith(
        expect.any(Error),
        "notifications.accounting_anomaly.analytics",
        "scheduled",
      );
    });
  });

  it("info severity anomalies are NOT notified", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "info" })],
      totals: {},
    });

    let insertCalled = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCalled = true;
        return { values: vi.fn() };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertCalled).toBe(false);
  });

  it("respects notificationPreferences: both disabled → no insert", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning" })],
      totals: {},
    });
    const prefs = [
      {
        userId: "user-1",
        notificationType: "accounting_anomaly",
        emailEnabled: false,
        inAppEnabled: false,
      },
    ];
    let insertCalled = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue(prefs) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCalled = true;
        return { values: vi.fn() };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertCalled).toBe(false);
  });

  it("inAppEnabled=false sets readAt to a Date", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning" })],
      totals: {},
    });
    const prefs = [
      {
        userId: "user-1",
        notificationType: "accounting_anomaly",
        emailEnabled: true,
        inAppEnabled: false,
      },
    ];
    const inserted: { readAt?: Date | null }[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue(prefs) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi
          .fn()
          .mockImplementation((rows: { dedupeKey?: string | null; readAt?: Date | null }[]) => {
            inserted.push(...rows.map((r) => ({ readAt: r.readAt })));
            return {
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue(rows.map((r) => ({ dedupeKey: r.dedupeKey }))),
              }),
            };
          }),
      })),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(inserted[0]?.readAt).toBeInstanceOf(Date);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingAnomalyAlertCreated,
      payload: {
        anomaly_class: "duplicate_donation",
        severity: "warning",
        entity_type: "donation",
        delivery_channel: "dedupe_only",
      },
    });
  });

  it("is idempotent via dedupeKey + onConflictDoNothing", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning", entityId: "don-1" })],
      totals: {},
    });

    let insertCallCount = 0;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCallCount++;
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue(insertCallCount === 1 ? [{ dedupeKey: "k" }] : []),
            }),
          }),
        };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    const firstCount = insertCallCount;
    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertCallCount).toBe(firstCount * 2);
  });

  it("per-org error isolation: getAnomalies failure captured, other orgs still process", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");

    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-2", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];

    mockGetAnomalies.mockImplementation((_: unknown, params: { orgId: string }) => {
      if (params.orgId === "org-1") return Promise.reject(new Error("db exploded"));
      return Promise.resolve({ asOf: now, items: [], totals: {} });
    });

    const db = buildDb({ members });
    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("per-org error isolation: db.insert throw captured, other orgs still process", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");

    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-2", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];

    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning" })],
      totals: {},
    });

    let insertCallCount = 0;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockRejectedValue(new Error("insert failed")),
              }),
            }),
          };
        }
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    };

    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
    expect(insertCallCount).toBeGreaterThanOrEqual(2);
  });

  it("notification payload shape: type, dedupeKey, entityType, entityId match item", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    const item = buildAnomalyItem({ severity: "critical", entityId: "don-99" });
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const capturedRows: Notification[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: Notification[]) => {
          capturedRows.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      })),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(capturedRows).toHaveLength(1);
    const row = capturedRows[0]!;
    expect(row.type).toBe("accounting_anomaly");
    expect(row.dedupeKey).toBe(`anomaly:entity-1:duplicate_donation:don-99`);
    expect(row.activeEntityId).toBe("entity-1");
    expect(row.entityType).toBe("donation");
    expect(row.entityId).toBe("don-99");
    expect(row.orgId).toBe("org-1");
    expect(row.userId).toBe("user-1");
  });

  it("email only sent for rows returned by onConflictDoNothing (new inserts)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    const item = buildAnomalyItem({ severity: "warning", entityId: "don-5" });
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `anomaly:entity-1:duplicate_donation:don-5` }],
    });

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(mockSendEmail).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "https://app.grantpipe.com/app/accounting/anomalies?entityId=entity-1",
        ),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingAnomalyEmailSent,
      payload: {
        anomaly_class: "duplicate_donation",
        severity: "warning",
        entity_type: "donation",
        delivery_channel: "email",
      },
    });
  });

  it("does not email accounting anomalies generated from sample onboarding records", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "admin@example.com",
        userName: "Admin",
      }),
    ];
    const item = buildAnomalyItem({
      severity: "warning",
      entityId: "sample-expense",
      reason: "[Sample] release over balance on Aging in Place Capacity Grant",
    });
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "anomaly:entity-1:duplicate_donation:sample-expense" }],
    });

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);

    expect(db.insert).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips row with null dedupeKey in returning() result", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning" })],
      totals: {},
    });

    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ dedupeKey: null }]),
          }),
        }),
      }),
    };

    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("captures email send failure without crashing", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning", entityId: "don-3" })],
      totals: {},
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "anomaly:entity-1:duplicate_donation:don-3" }],
    });

    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("handles no reviewable items gracefully (no insert)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [], totals: {} });

    let insertCalled = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCalled = true;
        return { values: vi.fn() };
      }),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertCalled).toBe(false);
  });

  it("processes multiple members in same org (one notification per member per alert)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-1", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];
    mockGetAnomalies.mockResolvedValue({
      asOf: now,
      items: [buildAnomalyItem({ severity: "warning", entityId: "don-1" })],
      totals: {},
    });

    const insertedKeys: string[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: { dedupeKey?: string }[]) => {
          for (const r of rows) if (r.dedupeKey) insertedKeys.push(r.dedupeKey);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(rows.map((r) => ({ dedupeKey: r.dedupeKey }))),
            }),
          };
        }),
      })),
    };

    await scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now);
    expect(insertedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("handles member with null organization or user gracefully", async () => {
    const members = [
      { orgId: "org-1", deletedAt: null, organization: null, user: null },
      buildOrgMember({ orgId: "org-2", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];
    mockGetAnomalies.mockResolvedValue({ asOf: now, items: [], totals: {} });

    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn(),
    };

    await expect(
      scanAccountingAnomalies(db as unknown as import("@grantpipe/db").Database, env, now),
    ).resolves.toBeUndefined();
  });
});
