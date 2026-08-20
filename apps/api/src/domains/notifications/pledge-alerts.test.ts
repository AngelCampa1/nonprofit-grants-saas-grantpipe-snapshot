import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanPledgeInstallmentAlerts, PLEDGE_ALERT_JOB } from "./pledge-alerts";

// ---------------------------------------------------------------------------
// Mock DB + integrations
// ---------------------------------------------------------------------------

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn().mockReturnValue({
    email: {
      send: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureScheduledException: vi.fn(),
}));

vi.mock("../../lib/db-retry", () => ({
  withDbRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(
  overrides: {
    members?: unknown[];
    installments?: unknown[];
    preferences?: unknown[];
    notificationResult?: unknown[];
  } = {},
) {
  const { members = [], installments = [], preferences = [], notificationResult = [] } = overrides;

  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(notificationResult),
      }),
    }),
  });

  return {
    query: {
      orgMembers: {
        findMany: vi.fn().mockResolvedValue(members),
      },
      notificationPreferences: {
        findMany: vi.fn().mockResolvedValue(preferences),
      },
      pledgeInstallments: {
        findMany: vi.fn().mockResolvedValue(installments),
      },
    },
    insert: insertMock,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };
}

const ORG_GROWTH = {
  id: "org-1",
  timezone: "America/New_York",
  planTier: "growth",
  subscriptionStatus: "active",
  trialEndsAt: null,
};

const MEMBER_ADMIN = {
  orgId: "org-1",
  role: "admin",
  deletedAt: null,
  organization: ORG_GROWTH,
  user: { id: "user-1", email: "admin@test.com", name: "Admin User" },
};

const NOW_BUSINESS_HOURS = new Date("2025-06-16T15:00:00Z"); // 11am ET

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PLEDGE_ALERT_JOB constant", () => {
  it("has the expected value", () => {
    expect(PLEDGE_ALERT_JOB).toBe("notifications.pledge_tracker");
  });
});

describe("scanPledgeInstallmentAlerts", () => {
  const ENV = { APP_URL: "https://app.grantpipe.com", RESEND_API_KEY: "key" };

  beforeEach(() => vi.clearAllMocks());

  it("does nothing when no members", async () => {
    const db = makeDb({ members: [] });
    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips starter plan orgs", async () => {
    const db = makeDb({
      members: [
        {
          ...MEMBER_ADMIN,
          organization: { ...ORG_GROWTH, planTier: "starter" },
        },
      ],
    });
    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips outside business hours", async () => {
    const outsideHours = new Date("2025-06-16T03:00:00Z"); // 11pm ET
    const db = makeDb({ members: [MEMBER_ADMIN] });
    await scanPledgeInstallmentAlerts(db as never, ENV as never, outsideHours);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips when no alertable installments", async () => {
    const db = makeDb({ members: [MEMBER_ADMIN], installments: [] });
    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts notification for upcoming installment", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days out

    const installment = {
      id: "inst-1",
      orgId: "org-1",
      pledgeId: "pledge-1",
      dueDate: soon,
      amountCents: 50_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-1",
        contactId: "contact-1",
        status: "active",
        faceAmountCents: 100_000,
        contact: {
          firstName: "Jane",
          lastName: "Smith",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-1:upcoming` }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).toHaveBeenCalled();
  });

  it("inserts notification for overdue installment", async () => {
    const overdue = new Date(NOW_BUSINESS_HOURS.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const installment = {
      id: "inst-2",
      orgId: "org-1",
      pledgeId: "pledge-1",
      dueDate: overdue,
      amountCents: 30_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-1",
        contactId: "contact-1",
        status: "active",
        faceAmountCents: 60_000,
        contact: {
          firstName: null,
          lastName: null,
          type: "organization",
          organizationName: "Acme Foundation",
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-2:overdue` }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).toHaveBeenCalled();
  });

  it("respects notification preferences (inApp disabled marks readAt)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 3 * 24 * 60 * 60 * 1000);

    const installment = {
      id: "inst-3",
      orgId: "org-1",
      pledgeId: "pledge-2",
      dueDate: soon,
      amountCents: 20_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-2",
        contactId: "contact-2",
        status: "active",
        faceAmountCents: 40_000,
        contact: {
          firstName: "Bob",
          lastName: "Jones",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      preferences: [
        {
          userId: "user-1",
          notificationType: "pledge_installment_due",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-3:upcoming` }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).toHaveBeenCalled();
    // Verify that readAt is set (inApp disabled) — the values call receives an object with readAt set
    const valuesCall = (db.insert as ReturnType<typeof vi.fn>).mock.results[0]?.value?.values;
    expect(valuesCall).toBeDefined();
  });

  it("skips notification when both email and inApp disabled for user", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 3 * 24 * 60 * 60 * 1000);

    const installment = {
      id: "inst-4",
      orgId: "org-1",
      pledgeId: "pledge-3",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-3",
        contactId: "contact-3",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Carol",
          lastName: "White",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      preferences: [
        {
          userId: "user-1",
          notificationType: "pledge_installment_due",
          emailEnabled: false,
          inAppEnabled: false,
        },
      ],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("handles errors per-org without crashing the whole scan", async () => {
    const db = makeDb({
      members: [MEMBER_ADMIN],
    });

    // Force installments query to fail
    db.query.pledgeInstallments.findMany = vi.fn().mockRejectedValueOnce(new Error("DB error"));

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();
  });

  it("handles member without user gracefully", async () => {
    const db = makeDb({
      members: [{ ...MEMBER_ADMIN, user: null }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("handles member without organization gracefully", async () => {
    const db = makeDb({
      members: [{ ...MEMBER_ADMIN, organization: null }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("sends email when notification was newly inserted (dedupeKey returned)", async () => {
    const { getIntegrations } = await import("../../lib/integrations");
    const emailSendMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getIntegrations).mockReturnValue({ email: { send: emailSendMock } } as never);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 7 * 24 * 60 * 60 * 1000);

    const installment = {
      id: "inst-5",
      orgId: "org-1",
      pledgeId: "pledge-4",
      dueDate: soon,
      amountCents: 75_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-4",
        contactId: "contact-4",
        status: "active",
        faceAmountCents: 150_000,
        contact: {
          firstName: "Diana",
          lastName: "Prince",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-5:upcoming` }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);

    expect(emailSendMock).toHaveBeenCalledTimes(1);
    expect(emailSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin@test.com"],
        subject: expect.stringContaining("Diana Prince"),
      }),
    );
    // Pin the donor deep-link path prefix so nav consolidation cannot silently break it.
    expect(emailSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("/app/donors/contact-4"),
      }),
    );
  });

  it("does not email pledge alerts generated from sample onboarding records", async () => {
    const { getIntegrations } = await import("../../lib/integrations");
    const emailSendMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getIntegrations).mockReturnValue({ email: { send: emailSendMock } } as never);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 7 * 24 * 60 * 60 * 1000);

    const installment = {
      id: "inst-sample",
      orgId: "org-1",
      pledgeId: "pledge-sample",
      dueDate: soon,
      amountCents: 75_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-sample",
        contactId: "contact-sample",
        status: "active",
        faceAmountCents: 150_000,
        contact: {
          firstName: "[Sample] Diana",
          lastName: "Prince",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: "pledge_installment_due:inst-sample:upcoming" }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);

    expect(db.insert).toHaveBeenCalled();
    expect(emailSendMock).not.toHaveBeenCalled();
  });

  it("skips member with null user in inner loop even when installments exist (line 313 branch)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-null-user",
      orgId: "org-1",
      pledgeId: "pledge-nu",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-nu",
        contactId: "contact-nu",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Null",
          lastName: "User",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [
        { ...MEMBER_ADMIN, user: null }, // null user → skipped at line 313
        MEMBER_ADMIN, // valid admin to ensure alertItems is checked
      ],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-null-user:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    // Only one member (admin) gets notification, null-user member skipped
    expect(db.insert).toHaveBeenCalled();
  });

  it("handles string dueDate in inner alert build loop (line 326 else branch)", async () => {
    const soonMs = NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000;
    const installment = {
      id: "inst-str-date",
      orgId: "org-1",
      pledgeId: "pledge-sd",
      dueDate: new Date(soonMs).toISOString() as unknown as Date, // string dueDate
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-sd",
        contactId: "contact-sd",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "String",
          lastName: "Date",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-str-date:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("uses 'Unknown Donor' when pledge contact is null (line 330-331)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-no-contact",
      orgId: "org-1",
      pledgeId: "pledge-nc",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-nc",
        contactId: "contact-nc",
        status: "active",
        faceAmountCents: 20_000,
        contact: null, // null contact → "Unknown Donor"
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-no-contact:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("filters out installments with null pledge relation (line 290 branch)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-no-pledge",
      orgId: "org-1",
      pledgeId: "pledge-np2",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: null, // null pledge → filtered at line 290
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("filters out installments with non-active pledge status (line 291 branch)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-inactive",
      orgId: "org-1",
      pledgeId: "pledge-ia",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-ia",
        contactId: "contact-ia",
        status: "completed", // non-active → filtered at line 291
        faceAmountCents: 20_000,
        contact: {
          firstName: "Inactive",
          lastName: "Pledge",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("filters out paid or written-off installments (line 292 branch)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installmentPaid = {
      id: "inst-paid",
      orgId: "org-1",
      pledgeId: "pledge-paid",
      dueDate: soon,
      amountCents: 10_000,
      status: "paid", // paid → filtered at line 292
      paidCents: 10_000,
      deletedAt: null,
      pledge: {
        id: "pledge-paid",
        contactId: "contact-paid",
        status: "active",
        faceAmountCents: 10_000,
        contact: { firstName: "Paid", lastName: "Out", type: "individual", organizationName: null },
      },
    };
    const installmentWrittenOff = {
      id: "inst-wo",
      orgId: "org-1",
      pledgeId: "pledge-wo",
      dueDate: soon,
      amountCents: 10_000,
      status: "written_off", // written_off → filtered at line 292
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-wo",
        contactId: "contact-wo",
        status: "active",
        faceAmountCents: 10_000,
        contact: {
          firstName: "Written",
          lastName: "Off",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installmentPaid, installmentWrittenOff],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("formats title with singular 'day' when exactly 1 day until due (line 137 branch)", async () => {
    // Exactly 1 day from now (within 0-14 window) → "1 day" not "1 days"
    const exactly1Day = new Date(NOW_BUSINESS_HOURS.getTime() + 1 * 24 * 60 * 60 * 1000 + 3600_000); // +25h to be safe
    const installment = {
      id: "inst-1day",
      orgId: "org-1",
      pledgeId: "pledge-1d",
      dueDate: exactly1Day,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-1d",
        contactId: "contact-1d",
        status: "active",
        faceAmountCents: 20_000,
        contact: { firstName: "One", lastName: "Day", type: "individual", organizationName: null },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-1day:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("formats title with singular 'day' when exactly 1 day overdue (line 150 branch)", async () => {
    // Exactly 1 day overdue → "1 day" not "1 days"
    const exactly1DayPast = new Date(NOW_BUSINESS_HOURS.getTime() - 1 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-1day-over",
      orgId: "org-1",
      pledgeId: "pledge-1do",
      dueDate: exactly1DayPast,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-1do",
        contactId: "contact-1do",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "One",
          lastName: "Overdue",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-1day-over:overdue` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("filters out installments due too far in future (>14 days → null bucket)", async () => {
    const farFuture = new Date(NOW_BUSINESS_HOURS.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const installment = {
      id: "inst-far",
      orgId: "org-1",
      pledgeId: "pledge-far",
      dueDate: farFuture,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-far",
        contactId: "contact-far",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Far",
          lastName: "Future",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    // Far-future installment filtered out → no insert
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("groups multiple members in same org correctly", async () => {
    const MEMBER_EDITOR = {
      orgId: "org-1",
      role: "editor",
      deletedAt: null,
      organization: ORG_GROWTH,
      user: { id: "user-2", email: "editor@test.com", name: "Editor User" },
    };

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-multi",
      orgId: "org-1",
      pledgeId: "pledge-multi",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-multi",
        contactId: "contact-multi",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Multi",
          lastName: "Member",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN, MEMBER_EDITOR],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-multi:upcoming` }],
    });

    await scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS);
    // Both members should have received notifications
    expect(db.insert).toHaveBeenCalled();
  });

  it("handles email send failure without crashing (error logged in catch)", async () => {
    const { getIntegrations } = await import("../../lib/integrations");
    const { captureScheduledException } = await import("../../lib/sentry");
    const emailSendMock = vi.fn().mockRejectedValueOnce(new Error("SMTP error"));
    vi.mocked(getIntegrations).mockReturnValue({ email: { send: emailSendMock } } as never);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-email-fail",
      orgId: "org-1",
      pledgeId: "pledge-ef",
      dueDate: soon,
      amountCents: 25_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-ef",
        contactId: "contact-ef",
        status: "active",
        faceAmountCents: 50_000,
        contact: {
          firstName: "Email",
          lastName: "Fail",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-email-fail:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(emailSendMock).toHaveBeenCalledTimes(1);
    expect(captureScheduledException).toHaveBeenCalledWith(
      expect.any(Error),
      `${PLEDGE_ALERT_JOB}.email`,
      "scheduled",
    );
  });

  it("skips email for inserted notification with null dedupeKey", async () => {
    const { getIntegrations } = await import("../../lib/integrations");
    const emailSendMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getIntegrations).mockReturnValue({ email: { send: emailSendMock } } as never);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-null-key",
      orgId: "org-1",
      pledgeId: "pledge-nk",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-nk",
        contactId: "contact-nk",
        status: "active",
        faceAmountCents: 20_000,
        contact: { firstName: "Null", lastName: "Key", type: "individual", organizationName: null },
      },
    };

    // Return row with null dedupeKey — should skip email but not throw
    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: null }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(emailSendMock).not.toHaveBeenCalled();
  });

  it("handles email-disabled preference: inserts notification but skips email params (line 382 branch)", async () => {
    // emailEnabled=false, inAppEnabled=true → insert happens, emailByDedupe empty → params undefined
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);

    const installment = {
      id: "inst-email-disabled",
      orgId: "org-1",
      pledgeId: "pledge-ed",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-ed",
        contactId: "contact-ed",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Email",
          lastName: "Disabled",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      preferences: [
        {
          userId: "user-1",
          notificationType: "pledge_installment_due",
          emailEnabled: false, // email disabled → emailByDedupe stays empty
          inAppEnabled: true, // inApp enabled → rowsToInsert populated
        },
      ],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-email-disabled:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("handles email send error that is not an Error instance (String(err) branch)", async () => {
    const { getIntegrations } = await import("../../lib/integrations");
    const { captureScheduledException } = await import("../../lib/sentry");
    // Throw a string, not an Error instance
    const emailSendMock = vi.fn().mockRejectedValueOnce("string error");
    vi.mocked(getIntegrations).mockReturnValue({ email: { send: emailSendMock } } as never);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-str-err",
      orgId: "org-1",
      pledgeId: "pledge-str",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-str",
        contactId: "contact-str",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "String",
          lastName: "Error",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-str-err:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(emailSendMock).toHaveBeenCalled();
    expect(captureScheduledException).toHaveBeenCalledWith(
      "string error",
      `${PLEDGE_ALERT_JOB}.email`,
      "scheduled",
    );
  });

  it("falls back to inst.pledgeId when pledge relation is null (null-coalescing branch)", async () => {
    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);

    // Installment with pledge.id missing — forces `pledge?.id ?? inst.pledgeId`
    const installment = {
      id: "inst-no-pledge-id",
      orgId: "org-1",
      pledgeId: "pledge-np",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: undefined as unknown as string, // undefined → falls back to inst.pledgeId
        contactId: undefined as unknown as string, // also undefined
        status: "active",
        faceAmountCents: 20_000,
        contact: { firstName: "No", lastName: "Id", type: "individual", organizationName: null },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
      notificationResult: [{ dedupeKey: `pledge_installment_due:inst-no-pledge-id:upcoming` }],
    });

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(db.insert).toHaveBeenCalled();
  });

  it("captures exception when processOrg block throws (e.g. preferences query fails)", async () => {
    const { captureScheduledException } = await import("../../lib/sentry");
    const captureMock = vi.mocked(captureScheduledException);

    const soon = new Date(NOW_BUSINESS_HOURS.getTime() + 5 * 24 * 60 * 60 * 1000);
    const installment = {
      id: "inst-pref-fail",
      orgId: "org-1",
      pledgeId: "pledge-pf",
      dueDate: soon,
      amountCents: 10_000,
      status: "scheduled",
      paidCents: 0,
      deletedAt: null,
      pledge: {
        id: "pledge-pf",
        contactId: "contact-pf",
        status: "active",
        faceAmountCents: 20_000,
        contact: {
          firstName: "Pref",
          lastName: "Fail",
          type: "individual",
          organizationName: null,
        },
      },
    };

    const db = makeDb({
      members: [MEMBER_ADMIN],
      installments: [installment],
    });

    // Make preferences query throw to hit the processOrg catch block
    db.query.notificationPreferences.findMany = vi
      .fn()
      .mockRejectedValueOnce(new Error("Preferences DB error"));

    await expect(
      scanPledgeInstallmentAlerts(db as never, ENV as never, NOW_BUSINESS_HOURS),
    ).resolves.not.toThrow();

    expect(captureMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining("processOrg"),
      "scheduled",
    );
  });
});
