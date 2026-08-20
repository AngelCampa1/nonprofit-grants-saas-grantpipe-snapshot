import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifications } from "@grantpipe/db";
import { ANALYTICS_EVENTS, type PermissionOverrides, type Role } from "@grantpipe/shared";
import { buildBudgetSentinelAlert, scanBudgetSentinelAlerts } from "./sentinel-alerts";
import * as shared from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockAnalyticsCapture,
  mockGetBudgetSentinel,
  mockIsWithinBusinessHours,
  mockSendEmail,
  mockGetIntegrations,
} = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn().mockResolvedValue({ id: "evt-1" }),
  mockGetBudgetSentinel: vi.fn(),
  mockIsWithinBusinessHours: vi.fn().mockReturnValue(true),
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
  mockGetIntegrations: vi.fn(),
}));

vi.mock("../grants/sentinel.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../grants/sentinel.service")>();
  return {
    ...actual,
    getBudgetSentinel: mockGetBudgetSentinel,
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
  planTier?: string;
  timezone?: string;
  role?: Role;
  permissions?: PermissionOverrides | null;
}) {
  return {
    orgId: overrides.orgId,
    deletedAt: null,
    role: overrides.role ?? "viewer",
    permissions: overrides.permissions ?? null,
    organization: {
      id: overrides.orgId,
      timezone: overrides.timezone ?? "America/Chicago",
      planTier: overrides.planTier ?? "growth",
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

function buildOverspendItem(band: "over_budget" | "projected_overspend" | "near_limit") {
  return {
    kind: "overspend" as const,
    id: `line-${band}`,
    grantId: "g-1",
    grantName: "Grant A",
    category: "Personnel",
    band,
    approvedAmountCents: 10_000,
    actualCents: band === "over_budget" ? 12_000 : 9_500,
    plannedCents: band === "projected_overspend" ? 2_000 : 0,
    projectedCents: band === "over_budget" ? 12_000 : 11_500,
    overByCents: band === "over_budget" ? 2_000 : 0,
    utilizationPercent: band === "over_budget" ? 120 : 95,
    riskScore: band === "over_budget" ? 83 : band === "projected_overspend" ? 63 : 42,
  };
}

function buildUnderspendItem(band: "lapsed_unspent" | "lapsing_soon" | "lapse_watch") {
  return {
    kind: "underspend" as const,
    id: `term-${band}`,
    fundId: "fund-1",
    fundName: "Youth Fund",
    grantId: null,
    title: "Youth Program Restriction",
    band,
    balanceCents: 5_000,
    daysUntilEnd: band === "lapsed_unspent" ? -10 : band === "lapsing_soon" ? 15 : 60,
    endDate: new Date("2026-06-01"),
    riskScore: band === "lapsed_unspent" ? 82 : band === "lapsing_soon" ? 62 : 42,
  };
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
// buildBudgetSentinelAlert
// ---------------------------------------------------------------------------

describe("buildBudgetSentinelAlert", () => {
  it("overspend over_budget: title mentions grant and amount, dedupeKey is stable", () => {
    const item = buildOverspendItem("over_budget");
    const alert = buildBudgetSentinelAlert(item);
    expect(alert.title).toContain("Personnel");
    expect(alert.body).toMatch(/over/i);
    expect(alert.dedupeKey).toBe(`grant_overspend:line-over_budget:over_budget`);
  });

  it("overspend projected_overspend: dedupeKey encodes budgetLineId and band", () => {
    const item = buildOverspendItem("projected_overspend");
    const alert = buildBudgetSentinelAlert(item);
    expect(alert.dedupeKey).toBe(`grant_overspend:line-projected_overspend:projected_overspend`);
  });

  it("underspend lapsed_unspent: title mentions fund, body mentions lapse, dedupeKey is stable", () => {
    const item = buildUnderspendItem("lapsed_unspent");
    const alert = buildBudgetSentinelAlert(item);
    expect(alert.title).toContain("Youth Program Restriction");
    expect(alert.body).toMatch(/lapse|unspent/i);
    expect(alert.dedupeKey).toBe(`fund_underspend:term-lapsed_unspent:lapsed_unspent`);
  });

  it("underspend lapsing_soon: dedupeKey encodes termId and band", () => {
    const item = buildUnderspendItem("lapsing_soon");
    const alert = buildBudgetSentinelAlert(item);
    expect(alert.dedupeKey).toBe(`fund_underspend:term-lapsing_soon:lapsing_soon`);
  });

  it("underspend lapse_watch: dedupeKey encodes lapse_watch band", () => {
    const item = buildUnderspendItem("lapse_watch");
    const alert = buildBudgetSentinelAlert(item);
    expect(alert.dedupeKey).toBe(`fund_underspend:term-lapse_watch:lapse_watch`);
  });
});

// ---------------------------------------------------------------------------
// scanBudgetSentinelAlerts
// ---------------------------------------------------------------------------

describe("scanBudgetSentinelAlerts", () => {
  const env = { APP_URL: "https://app.grantpipe.com", RESEND_API_KEY: "key" };
  const now = new Date("2026-06-16T14:00:00.000Z");

  beforeEach(() => {
    vi.resetAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "evt-1" });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockSendEmail.mockResolvedValue(undefined);
    mockGetIntegrations.mockReturnValue({
      analytics: { capture: mockAnalyticsCapture },
      email: { send: mockSendEmail },
    });
  });

  it("processes starter org — budget sentinel now available on all plans", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "starter",
      }),
    ];
    const items = [buildOverspendItem("over_budget")];
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items, totals: {} });

    const insertedRows: unknown[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: unknown[]) => {
          insertedRows.push(...(Array.isArray(rows) ? rows : [rows]));
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ dedupeKey: "budget_sentinel:line-over_budget" }]),
            }),
          };
        }),
      })),
    };

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockGetBudgetSentinel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
    expect(insertedRows.length).toBeGreaterThan(0);
  });

  it("skips org scan when canUseGrantBudgetAlerts is false (defense-in-depth branch)", async () => {
    // The skip-branch is unreachable via any real PlanTier since all tiers now have
    // hasGrantBudgetAlerts = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "canUseGrantBudgetAlerts").mockReturnValue(false);
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

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockGetBudgetSentinel).not.toHaveBeenCalled();
    expect(insertCalled).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("growth org: scans sentinel and inserts notifications for alertable bands", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const items = [buildOverspendItem("over_budget"), buildUnderspendItem("lapsed_unspent")];
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items, totals: {} });

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

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockGetBudgetSentinel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
    expect(insertedRows.length).toBeGreaterThan(0);
    // Both alertable items should produce rows
    expect(insertedRows.some((r) => r.type === "grant_overspend_alert")).toBe(true);
    expect(insertedRows.some((r) => r.type === "fund_underspend_alert")).toBe(true);
  });

  it("near_limit overspend does NOT fire a notification", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    // Only a near_limit item — no alert
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("near_limit")],
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

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    // near_limit: shown in view, but NO notification inserted
    expect(insertCalled).toBe(false);
  });

  it("is idempotent via dedupeKey + onConflictDoNothing", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
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
              // Second call returns empty — already exists
              returning: vi
                .fn()
                .mockResolvedValue(insertCallCount === 1 ? [{ dedupeKey: "k" }] : []),
            }),
          }),
        };
      }),
    };

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    const firstCount = insertCallCount;
    await scanBudgetSentinelAlerts(db as never, env as never, now);
    // Inserts attempted twice (one per run), but email only for returned rows
    expect(insertCallCount).toBe(firstCount * 2);
  });

  it("skips org when outside business hours", async () => {
    mockIsWithinBusinessHours.mockReturnValue(false);
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
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

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(insertCalled).toBe(false);
  });

  it("respects notificationPreferences: both disabled → no insert", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });
    const prefs = [
      {
        userId: "user-1",
        notificationType: "grant_overspend_alert",
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

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(insertCalled).toBe(false);
  });

  it("inAppEnabled=false sets readAt to a Date", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });
    const prefs = [
      {
        userId: "user-1",
        notificationType: "grant_overspend_alert",
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
        values: vi.fn().mockImplementation((rows: { readAt?: Date | null }[]) => {
          inserted.push(...rows.map((r) => ({ readAt: r.readAt })));
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      })),
    };

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(inserted[0]?.readAt).toBeInstanceOf(Date);
  });

  it("per-org error isolation: org error is captured, other orgs still process", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");

    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-2", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];

    // org-1 throws, org-2 succeeds
    mockGetBudgetSentinel.mockImplementation((_, params: { orgId: string }) => {
      if (params.orgId === "org-1") return Promise.reject(new Error("db exploded"));
      return Promise.resolve({ asOf: now, items: [], totals: {} });
    });

    const db = buildDb({ members });
    await expect(scanBudgetSentinelAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("per-org error isolation: db.insert throw for one org does not abort other orgs", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");

    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-2", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];

    // Both orgs have an alertable item
    const item = buildOverspendItem("over_budget");
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    let insertCallCount = 0;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          // org-1's insert throws
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockRejectedValue(new Error("insert failed")),
              }),
            }),
          };
        }
        // org-2's insert succeeds
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    };

    await expect(scanBudgetSentinelAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
    // Both orgs attempted inserts (insert was called at least twice across two orgs)
    expect(insertCallCount).toBeGreaterThanOrEqual(2);
  });

  it("email path: overspend uses /app/grants/{grantId}", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const item = buildOverspendItem("over_budget");
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `grant_overspend:${item.id}:over_budget` }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(`/app/grants/${item.grantId}`),
      }),
    );
    // Must NOT contain old /budget suffix or /restrictions path
    const callText = (mockSendEmail.mock.calls[0] as [{ text: string }])[0].text;
    expect(callText).not.toContain("/budget");
    expect(callText).not.toContain("/restrictions");
  });

  it("email path: underspend with fundId uses /app/funds/{fundId}", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const item = buildUnderspendItem("lapsing_soon"); // fundId: "fund-1"
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `fund_underspend:${item.id}:lapsing_soon` }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(`/app/funds/${item.fundId}`),
      }),
    );
  });

  it("email path: underspend with only grantId (no fundId) uses /app/grants/{grantId}", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const item = {
      ...buildUnderspendItem("lapsing_soon"),
      fundId: null,
      fundName: null,
      grantId: "g-99",
    };
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `fund_underspend:${item.id}:lapsing_soon` }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("/app/grants/g-99"),
      }),
    );
  });

  it("email path: underspend with neither fundId nor grantId uses /app/grants", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const item = {
      ...buildUnderspendItem("lapsing_soon"),
      fundId: null,
      fundName: null,
      grantId: null,
    };
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `fund_underspend:${item.id}:lapsing_soon` }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("/app/grants"),
      }),
    );
  });

  it("does not email budget sentinel alerts generated from sample onboarding records", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "admin@example.com",
        userName: "Admin",
        planTier: "growth",
      }),
    ];
    const item = {
      ...buildUnderspendItem("lapsed_unspent"),
      id: "sample-term",
      title: "[Sample] Senior Wellbeing Initiative - closeout",
    };
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [item], totals: {} });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: `fund_underspend:${item.id}:lapsed_unspent` }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.budgetSentinelAlertCreated,
      }),
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("email only sent for rows returned by onConflictDoNothing (new inserts)", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "grant_overspend:line-over_budget:over_budget" }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("captures budget sentinel alert and email analytics for newly inserted rows", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "grant_overspend:line-over_budget:over_budget" }],
    });

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.budgetSentinelAlertCreated,
      payload: {
        alert_kind: "overspend",
        alert_band: "over_budget",
        entity_type: "grant_budget_line",
        delivery_channel: "in_app",
      },
    });
    expect(mockAnalyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.budgetSentinelEmailSent,
      payload: {
        alert_kind: "overspend",
        alert_band: "over_budget",
        entity_type: "grant_budget_line",
        delivery_channel: "email",
      },
    });
  });

  it("skips row with null dedupeKey in returning() result", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
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

    await expect(scanBudgetSentinelAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("captures email send failure without crashing", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "grant_overspend:line-over_budget:over_budget" }],
    });

    await expect(scanBudgetSentinelAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("captures analytics failures and non-Error email failures without crashing", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    mockAnalyticsCapture.mockRejectedValue(new Error("PostHog down"));
    mockSendEmail.mockRejectedValue("smtp down");

    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "grant_overspend:line-over_budget:over_budget" }],
    });

    await expect(scanBudgetSentinelAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalledWith(
      expect.any(Error),
      "notifications.budget_sentinel.analytics",
      "scheduled",
    );
    expect(captureScheduledException).toHaveBeenCalledWith(
      "smtp down",
      "notifications.budget_sentinel.email",
      "scheduled",
    );
  });

  it("skips members missing joined organization or user data", async () => {
    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              orgId: "org-1",
              deletedAt: null,
              role: "viewer",
              permissions: null,
              organization: null,
              user: { id: "user-1", email: "u@e.com", name: "U" },
            },
            {
              orgId: "org-2",
              deletedAt: null,
              role: "viewer",
              permissions: null,
              organization: {
                id: "org-2",
                timezone: "America/Chicago",
                planTier: "growth",
                subscriptionStatus: "active",
                trialEndsAt: null,
              },
              user: null,
            },
          ]),
        },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn(),
    };

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(mockGetBudgetSentinel).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("handles no at-risk items gracefully (no insert)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({ asOf: now, items: [], totals: {} });

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

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(insertCalled).toBe(false);
  });

  it("processes multiple members in same org (one notification per member per alert)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-1", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
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

    await scanBudgetSentinelAlerts(db as never, env as never, now);
    expect(insertedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("does not send grant overspend alerts to members without grants view access", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-allowed",
        userEmail: "allowed@example.com",
        userName: "Allowed",
        role: "viewer",
      }),
      buildOrgMember({
        orgId: "org-1",
        userId: "user-blocked",
        userEmail: "blocked@example.com",
        userName: "Blocked",
        role: "viewer",
        permissions: { grants: "none" },
      }),
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [buildOverspendItem("over_budget")],
      totals: {},
    });

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

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(insertedRows.map((row) => row.userId)).toEqual(["user-allowed"]);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["allowed@example.com"] }),
    );
  });

  it("uses the viewer fallback role and allows org-level underspend rows through funds access", async () => {
    const orgLevelUnderspend = {
      ...buildUnderspendItem("lapsed_unspent"),
      fundId: null,
      grantId: null,
    };
    const members = [
      {
        ...buildOrgMember({
          orgId: "org-1",
          userId: "user-1",
          userEmail: "funds@example.com",
          userName: "Funds",
          permissions: { funds: "view", grants: "none" },
        }),
        role: undefined,
      },
    ];
    mockGetBudgetSentinel.mockResolvedValue({
      asOf: now,
      items: [orgLevelUnderspend],
      totals: {},
    });

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
              returning: vi
                .fn()
                .mockResolvedValue(rows.map((row) => ({ dedupeKey: row.dedupeKey }))),
            }),
          };
        }),
      })),
    };

    await scanBudgetSentinelAlerts(db as never, env as never, now);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      userId: "user-1",
      type: "fund_underspend_alert",
    });
  });
});
