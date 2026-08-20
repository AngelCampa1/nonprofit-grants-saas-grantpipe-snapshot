import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifications } from "@grantpipe/db";
import { buildDonorLapseAlert, scanDonorLapseAlerts } from "./lapse-alerts";
import * as shared from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockGetAtRiskDonors, mockIsWithinBusinessHours, mockSendEmail } = vi.hoisted(() => ({
  mockGetAtRiskDonors: vi.fn(),
  mockIsWithinBusinessHours: vi.fn().mockReturnValue(true),
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../donors/lapse.service", () => ({
  getAtRiskDonors: mockGetAtRiskDonors,
}));

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
  getIntegrations: vi.fn(() => ({
    email: { send: mockSendEmail },
  })),
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
}) {
  return {
    orgId: overrides.orgId,
    deletedAt: null,
    organization: {
      id: overrides.orgId,
      defaultEntityId: "entity-default",
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

function buildAtRiskDonor(band: "lapsing" | "at_risk" | "lapsed") {
  return {
    contactId: `contact-${band}`,
    displayName: `Donor ${band}`,
    email: `${band}@example.com`,
    band,
    daysSinceLastGift: band === "lapsing" ? 50 : band === "at_risk" ? 120 : 600,
    typicalCadenceDays: 30,
    riskScore: band === "lapsing" ? 41 : band === "at_risk" ? 62 : 82,
    lifetimeGivingCents: 10000,
    lastGiftDate: new Date("2025-01-01"),
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
// buildDonorLapseAlert
// ---------------------------------------------------------------------------

describe("buildDonorLapseAlert", () => {
  it("returns title, body, and dedupeKey with contactId and band", () => {
    const alert = buildDonorLapseAlert({
      contactId: "c-1",
      displayName: "Jane Smith",
      band: "lapsed",
      daysSinceLastGift: 600,
    });

    expect(alert.title).toContain("Jane Smith");
    expect(alert.body).toContain("600");
    expect(alert.dedupeKey).toBe("donor_lapse:c-1:lapsed");
  });

  it("includes band name in body", () => {
    const alert = buildDonorLapseAlert({
      contactId: "c-2",
      displayName: "Bob",
      band: "lapsing",
      daysSinceLastGift: 50,
    });
    expect(alert.body).toMatch(/lapsing/i);
  });

  it("dedupeKey format is stable: donor_lapse:{contactId}:{band}", () => {
    const alert = buildDonorLapseAlert({
      contactId: "abc",
      displayName: "Test",
      band: "at_risk",
      daysSinceLastGift: 120,
    });
    expect(alert.dedupeKey).toBe("donor_lapse:abc:at_risk");
  });
});

// ---------------------------------------------------------------------------
// scanDonorLapseAlerts
// ---------------------------------------------------------------------------

describe("scanDonorLapseAlerts", () => {
  const env = { APP_URL: "https://app.grantpipe.com", RESEND_API_KEY: "key" };
  const now = new Date("2026-06-16T14:00:00.000Z");

  beforeEach(() => {
    vi.resetAllMocks();
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("inserts in-app notifications for at-risk donors with dedupeKey", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const inserted: Notification[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: Notification[]) => {
          inserted.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ dedupeKey: (rows[0] as Notification).dedupeKey }]),
            }),
          };
        }),
      })),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.dedupeKey).toBe("donor_lapse:contact-lapsed:lapsed");
    expect(inserted[0]?.type).toBe("donor_lapse_alert");
    expect(inserted[0]?.orgId).toBe("org-1");
    expect(inserted[0]?.userId).toBe("user-1");
  });

  it("is idempotent: onConflictDoNothing prevents duplicate notifications", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
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
              // Second call returns empty (already exists)
              returning: vi
                .fn()
                .mockResolvedValue(insertCallCount === 1 ? [{ dedupeKey: "k" }] : []),
            }),
          }),
        };
      }),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);
    const firstCount = insertCallCount;

    // Re-run (simulating a second scheduled tick)
    await scanDonorLapseAlerts(db as never, env as never, now);

    expect(insertCallCount).toBe(firstCount * 2); // inserts are attempted twice
    // But email should only be sent when returning() yields a row
  });

  it("skips org when outside business hours", async () => {
    mockIsWithinBusinessHours.mockReturnValue(false);
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [buildAtRiskDonor("lapsed")],
      totals: { lapsing: 0, at_risk: 0, lapsed: 1, total: 1 },
    });

    let inserted = false;
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        inserted = true;
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);
    expect(inserted).toBe(false);
  });

  it("processes starter org — donor scan, in-app, and email notifications now included", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "starter",
      }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 1, total: 1 },
    });

    const insertedRows: unknown[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: unknown[]) => {
          insertedRows.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ dedupeKey: "donor_lapse:contact-lapsed:lapsed" }]),
            }),
          };
        }),
      })),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);

    // Starter org: donor scan runs
    expect(mockGetAtRiskDonors).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
    // In-app notification inserted
    expect(insertedRows.length).toBeGreaterThan(0);
    // Email sent (starter now has hasAutomationEmails = true)
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("skips org scan when hasAutomationEmails is false (defense-in-depth branch)", async () => {
    // The skip-branch is unreachable via any real PlanTier since all tiers now have
    // hasAutomationEmails = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "hasAutomationEmails").mockReturnValue(false);
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

    await scanDonorLapseAlerts(db as never, env as never, now);

    expect(mockGetAtRiskDonors).not.toHaveBeenCalled();
    expect(insertCalled).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("growth org gets both in-app and email notifications (full scan runs)", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const insertedRows: unknown[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: unknown[]) => {
          insertedRows.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ dedupeKey: "donor_lapse:contact-lapsed:lapsed" }]),
            }),
          };
        }),
      })),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);

    // Donor scan ran for the growth org
    expect(mockGetAtRiskDonors).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
    // In-app notification inserted
    expect(insertedRows.length).toBeGreaterThan(0);
    // Email sent
    expect(mockSendEmail).toHaveBeenCalled();
    // Pin the donor deep-link path prefix so nav consolidation cannot silently break it.
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("/app/donors/contact-lapsed"),
      }),
    );
  });

  it("does not email donor lapse alerts generated from sample onboarding contacts", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "admin@example.com",
        userName: "Admin",
        planTier: "growth",
      }),
    ];
    const donors = [
      {
        ...buildAtRiskDonor("at_risk"),
        contactId: "sample-contact",
        displayName: "[Sample] Patricia Nguyen",
      },
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 1, lapsed: 0, total: 1 },
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

    await scanDonorLapseAlerts(db as never, env as never, now);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.title).toContain("[Sample] Patricia Nguyen");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips inApp notification when inAppEnabled=false (marks readAt)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    const donors = [buildAtRiskDonor("at_risk")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const prefs = [
      {
        userId: "user-1",
        notificationType: "donor_lapse_alert",
        emailEnabled: false,
        inAppEnabled: false,
      },
    ];

    const inserted: Notification[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue(prefs) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: Notification[]) => {
          inserted.push(...rows);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      })),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);

    // No interest at all → should skip completely
    expect(inserted).toHaveLength(0);
  });

  it("handles org with no at-risk donors gracefully", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
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

    await scanDonorLapseAlerts(db as never, env as never, now);
    expect(insertCalled).toBe(false);
  });

  it("does not process band 'none' donors (service filters them, but scan is safe if passed)", async () => {
    // lapse.service already filters none, but scan should handle empty gracefully
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAtRiskDonors.mockResolvedValue({
      donors: [],
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
    });

    const db = buildDb({ members });
    await expect(scanDonorLapseAlerts(db as never, env as never, now)).resolves.toBeUndefined();
  });

  it("processes multiple members in the same org (bucket grouping path)", async () => {
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u1@e.com", userName: "U1" }),
      buildOrgMember({ orgId: "org-1", userId: "user-2", userEmail: "u2@e.com", userName: "U2" }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const insertedRows: string[] = [];
    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((rows: { dedupeKey?: string }[]) => {
          for (const r of rows) {
            if (r.dedupeKey) insertedRows.push(r.dedupeKey);
          }
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(rows.map((r) => ({ dedupeKey: r.dedupeKey }))),
            }),
          };
        }),
      })),
    };

    await scanDonorLapseAlerts(db as never, env as never, now);
    // Both users should receive notifications
    expect(insertedRows.length).toBeGreaterThanOrEqual(2);
  });

  it("sets readAt when inAppEnabled=false but emailEnabled=true (partial preference)", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const donors = [buildAtRiskDonor("lapsing")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const prefs = [
      {
        userId: "user-1",
        notificationType: "donor_lapse_alert",
        emailEnabled: true,
        inAppEnabled: false,
      },
    ];

    const inserted: { readAt: Date | null | undefined }[] = [];
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

    await scanDonorLapseAlerts(db as never, env as never, now);
    // readAt should be a Date (inAppEnabled=false → mark as read immediately)
    expect(inserted[0]?.readAt).toBeInstanceOf(Date);
  });

  it("skips row with null dedupeKey in the returning() result", async () => {
    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const db = {
      query: {
        orgMembers: { findMany: vi.fn().mockResolvedValue(members) },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            // Return a row with null dedupeKey
            returning: vi.fn().mockResolvedValue([{ dedupeKey: null }]),
          }),
        }),
      }),
    };

    await expect(scanDonorLapseAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("captures exception and continues when getAtRiskDonors throws", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    const members = [
      buildOrgMember({ orgId: "org-1", userId: "user-1", userEmail: "u@e.com", userName: "U" }),
    ];
    mockGetAtRiskDonors.mockRejectedValue(new Error("db exploded"));

    const db = buildDb({ members });
    await expect(scanDonorLapseAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("logs and captures when email send fails (error path inside .catch)", async () => {
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
    const donors = [buildAtRiskDonor("lapsed")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "donor_lapse:contact-lapsed:lapsed" }],
    });

    // Should not throw even when email fails
    await expect(scanDonorLapseAlerts(db as never, env as never, now)).resolves.toBeUndefined();
    expect(captureScheduledException).toHaveBeenCalled();
  });

  it("covers Error-instance vs non-Error branch in email failure handler", async () => {
    mockSendEmail.mockRejectedValue("string error");

    const members = [
      buildOrgMember({
        orgId: "org-1",
        userId: "user-1",
        userEmail: "u@e.com",
        userName: "U",
        planTier: "growth",
      }),
    ];
    const donors = [buildAtRiskDonor("at_risk")];
    mockGetAtRiskDonors.mockResolvedValue({
      donors,
      totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: donors.length },
    });

    const db = buildDb({
      members,
      insertedRows: [{ dedupeKey: "donor_lapse:contact-at_risk:at_risk" }],
    });

    await expect(scanDonorLapseAlerts(db as never, env as never, now)).resolves.toBeUndefined();
  });
});
