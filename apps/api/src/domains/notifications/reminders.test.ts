import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@grantpipe/db";
import {
  buildCloseoutDeadlineReminder,
  buildGrantDeadlineReminder,
  buildReportingDeadlineReminder,
  checkGrantSpendDownThresholds,
  getDaysUntilDeadline,
  isEmailEligible,
  isThresholdDay,
  sendScheduledGrantDeadlineReminders,
} from "./reminders";

describe("getDaysUntilDeadline", () => {
  it("calculates day distance using the org timezone", () => {
    const now = new Date("2026-04-08T23:30:00.000Z");
    const deadline = new Date("2026-04-09T05:00:00.000Z");

    expect(getDaysUntilDeadline(deadline, "America/New_York", now)).toBe(1);
  });

  it("falls back to zero when the formatter omits the day part", () => {
    const formatToParts = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
      { type: "year", value: "2026" },
      { type: "month", value: "04" },
    ] as never);

    const now = new Date("2026-04-08T23:30:00.000Z");
    const deadline = new Date("2026-04-09T05:00:00.000Z");

    expect(getDaysUntilDeadline(deadline, "America/New_York", now)).toBe(0);

    formatToParts.mockRestore();
  });

  it("falls back to zero when the formatter omits the year and month parts", () => {
    const formatToParts = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([{ type: "day", value: "09" }] as never);

    const now = new Date("2026-04-08T23:30:00.000Z");
    const deadline = new Date("2026-04-09T05:00:00.000Z");

    // With year=0, month=0, day=9 for both dates (since mock applies to both calls),
    // the difference will be 0 days.
    expect(getDaysUntilDeadline(deadline, "America/New_York", now)).toBe(0);

    formatToParts.mockRestore();
  });
});

describe("isThresholdDay", () => {
  it("returns true for threshold days 0, 1, 7", () => {
    expect(isThresholdDay(0)).toBe(true);
    expect(isThresholdDay(1)).toBe(true);
    expect(isThresholdDay(7)).toBe(true);
  });

  it("returns false for non-threshold days 2–6", () => {
    for (const day of [2, 3, 4, 5, 6]) {
      expect(isThresholdDay(day)).toBe(false);
    }
  });

  it("returns false for negative days and days beyond 7", () => {
    expect(isThresholdDay(-1)).toBe(false);
    expect(isThresholdDay(8)).toBe(false);
    expect(isThresholdDay(30)).toBe(false);
  });
});

describe("buildGrantDeadlineReminder", () => {
  it("builds a stable title, body, and dedupe key", () => {
    const reminder = buildGrantDeadlineReminder({
      grantId: "grant-1",
      grantName: "Community Impact",
      deadline: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 2,
    });

    expect(reminder.title).toContain("Community Impact");
    expect(reminder.body).toContain("in 2 days");
    expect(reminder.dedupeKey).toContain("grant_deadline:grant-1");
  });

  it("uses today and tomorrow urgency labels", () => {
    const todayReminder = buildGrantDeadlineReminder({
      grantId: "grant-1",
      grantName: "Community Impact",
      deadline: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 0,
    });
    const tomorrowReminder = buildGrantDeadlineReminder({
      grantId: "grant-1",
      grantName: "Community Impact",
      deadline: new Date("2026-04-11T00:00:00.000Z"),
      daysUntilDeadline: 1,
    });

    expect(todayReminder.body).toContain("due today");
    expect(tomorrowReminder.body).toContain("due tomorrow");
  });
});

describe("isEmailEligible", () => {
  it("returns true for starter plan — automation emails now included in all plans", () => {
    expect(isEmailEligible("starter")).toBe(true);
  });

  it("returns true for growth plan", () => {
    expect(isEmailEligible("growth")).toBe(true);
  });

  it("returns true for audit_ready plan", () => {
    expect(isEmailEligible("audit_ready")).toBe(true);
  });
});

describe("buildReportingDeadlineReminder", () => {
  it("builds a stable title, body, and dedupe key", () => {
    const reminder = buildReportingDeadlineReminder({
      requirementId: "req-1",
      grantId: "grant-1",
      grantName: "Community Fund",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 2,
    });

    expect(reminder.title).toContain("Community Fund");
    expect(reminder.body).toContain("in 2 days");
    expect(reminder.dedupeKey).toContain("reporting_deadline:req-1");
  });

  it("uses today and tomorrow urgency labels", () => {
    const todayReminder = buildReportingDeadlineReminder({
      requirementId: "req-1",
      grantId: "grant-1",
      grantName: "Community Fund",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 0,
    });
    const tomorrowReminder = buildReportingDeadlineReminder({
      requirementId: "req-1",
      grantId: "grant-1",
      grantName: "Community Fund",
      dueDate: new Date("2026-04-11T00:00:00.000Z"),
      daysUntilDeadline: 1,
    });

    expect(todayReminder.body).toContain("due today");
    expect(tomorrowReminder.body).toContain("due tomorrow");
  });

  it("includes a 7-day urgency label", () => {
    const reminder = buildReportingDeadlineReminder({
      requirementId: "req-1",
      grantId: "grant-1",
      grantName: "Community Fund",
      dueDate: new Date("2026-04-15T00:00:00.000Z"),
      daysUntilDeadline: 7,
    });

    expect(reminder.body).toContain("in 7 days");
  });
});

describe("buildCloseoutDeadlineReminder", () => {
  it("builds a stable title, body, and dedupe key", () => {
    const reminder = buildCloseoutDeadlineReminder({
      itemId: "item-1",
      grantId: "grant-1",
      grantName: "Impact Grant",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 7,
    });

    expect(reminder.title).toContain("Impact Grant");
    expect(reminder.body).toContain("in 7 days");
    expect(reminder.dedupeKey).toContain("closeout_deadline:item-1");
  });

  it("uses today and tomorrow urgency labels", () => {
    const todayReminder = buildCloseoutDeadlineReminder({
      itemId: "item-1",
      grantId: "grant-1",
      grantName: "Impact Grant",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
      daysUntilDeadline: 0,
    });
    const tomorrowReminder = buildCloseoutDeadlineReminder({
      itemId: "item-1",
      grantId: "grant-1",
      grantName: "Impact Grant",
      dueDate: new Date("2026-04-11T00:00:00.000Z"),
      daysUntilDeadline: 1,
    });

    expect(todayReminder.body).toContain("due today");
    expect(tomorrowReminder.body).toContain("due tomorrow");
  });
});

describe("sendScheduledGrantDeadlineReminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // 2026-04-08 is a Wednesday; 16:00Z === 12:00 in America/New_York (EDT),
    // inside business hours. The local calendar date is still 2026-04-08, so
    // every day-distance assertion below is unchanged by the hour shift.
    vi.setSystemTime(new Date("2026-04-08T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates in-app reminders and sends email when preferences allow it", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).toHaveBeenCalledWith(notifications);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        type: "grant_deadline",
        entityType: "grant",
        entityId: "grant-1",
      }),
    );
    // bodyText maps to params.text in createMockEmailProvider — this verifies the email text content
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: expect.stringContaining("https://grantpipe.test/app/grants/grant-1"),
      }),
    );
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("does not email deadline reminders generated from sample onboarding grants", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "admin@example.com",
                name: "Admin",
              },
            },
          ]),
        },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "[Sample] Senior Wellbeing Initiative",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("[Sample] Senior Wellbeing Initiative"),
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("defers the whole org when the current tick is outside business hours", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-1", email: "person@example.com", name: "Person" },
            },
          ]),
        },
        notificationPreferences: { findMany: vi.fn().mockResolvedValue([]) },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert,
    };

    // 2026-04-08 06:00Z === 02:00 EDT — the middle of the night locally. The
    // org is skipped entirely; neither the snapshot reads nor any insert run.
    await sendScheduledGrantDeadlineReminders(
      db as never,
      { APP_URL: "https://grantpipe.test", RESEND_API_KEY: "resend-key" },
      "test-cron",
      new Date("2026-04-08T06:00:00.000Z"),
    );

    expect(insert).not.toHaveBeenCalled();
    expect(db.query.grants.findMany).not.toHaveBeenCalled();
  });

  it("skips email and notifications when the user disabled both", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: false,
            inAppEnabled: false,
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              userId: "user-1",
              notificationType: "grant_deadline",
              emailEnabled: false,
              inAppEnabled: false,
            },
            {
              userId: "user-1",
              notificationType: "reporting_deadline",
              emailEnabled: false,
              inAppEnabled: false,
            },
            {
              userId: "user-1",
              notificationType: "closeout_deadline",
              emailEnabled: false,
              inAppEnabled: false,
            },
          ]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("does not resend reminder emails when the dedupe key already exists", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).toHaveBeenCalledWith(notifications);
  });

  it("skips email delivery when resend is not configured", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).toHaveBeenCalledWith(notifications);
  });

  it("defaults missing preferences to email and in-app reminders enabled", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue(undefined),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        readAt: null,
      }),
    );
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("writes a read timestamp when only email reminders are enabled", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: false,
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              userId: "user-1",
              notificationType: "grant_deadline",
              emailEnabled: true,
              inAppEnabled: false,
            },
            {
              userId: "user-1",
              notificationType: "reporting_deadline",
              emailEnabled: true,
              inAppEnabled: false,
            },
            {
              userId: "user-1",
              notificationType: "closeout_deadline",
              emailEnabled: true,
              inAppEnabled: false,
            },
          ]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-1",
              grantId: "grant-1",
              dueDate: new Date("2026-04-09T05:00:00.000Z"),
              status: "pending",
              deletedAt: null,
              grant: { name: "Community Impact" },
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "close-1",
              grantId: "grant-1",
              dueDate: new Date("2026-04-09T05:00:00.000Z"),
              label: "Final budget",
              deletedAt: null,
              grant: { name: "Community Impact" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // All three notification types (grant_deadline, reporting_deadline,
    // closeout_deadline) should carry a readAt when in-app is disabled,
    // covering the ternary for each type.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "grant_deadline", readAt: expect.any(Date) }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reporting_deadline", readAt: expect.any(Date) }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "closeout_deadline", readAt: expect.any(Date) }),
    );
  });

  it("skips grants without deadlines or outside the reminder window", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-no-deadline",
              name: "No Deadline",
              applicationDeadline: null,
            },
            {
              id: "grant-future",
              name: "Future Grant",
              applicationDeadline: new Date("2026-05-10T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips org members that are missing organization or user relations", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: null,
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
              },
              user: null,
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn(),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(db.query.notificationPreferences.findFirst).not.toHaveBeenCalled();
    expect(db.query.grants.findMany).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("fires on threshold days 0, 1, 7 but skips days 2–6 for application deadline", async () => {
    // day 3 from now = 2026-04-11 (skipped), day 7 = 2026-04-15 (fired)
    // system time is 2026-04-08
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-skip",
              name: "Skipped Grant",
              applicationDeadline: new Date("2026-04-11T05:00:00.000Z"), // 3 days
            },
            {
              id: "grant-fire",
              name: "Threshold Grant",
              applicationDeadline: new Date("2026-04-15T05:00:00.000Z"), // 7 days
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    const grantIds = values.mock.calls.map((call) => (call[0] as { entityId?: string }).entityId);
    expect(grantIds).not.toContain("grant-skip");
    expect(grantIds).toContain("grant-fire");
  });

  it("sends email for reporting requirements when email enabled, plan eligible, and notification inserted", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-reporting" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-email",
              grantId: "grant-report",
              dueDate: new Date("2026-04-09T05:00:00.000Z"), // 1 day — threshold
              status: "pending",
              grant: { name: "Report Grant" },
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // Notification insert + email insert
    expect(insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reporting_deadline",
        entityId: "grant-report",
      }),
    );
    // Pin the grant deep-link path prefix so nav consolidation cannot silently break it.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: expect.stringContaining("https://grantpipe.test/app/grants/grant-report"),
      }),
    );
  });

  it("skips closeout items that have no dueDate", async () => {
    const insert = vi.fn();

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-no-date",
              grantId: "grant-1",
              label: "No date closeout",
              dueDate: null,
              grant: { name: "Some Grant" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips reporting requirements outside the threshold window", async () => {
    const insert = vi.fn();

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-far",
              grantId: "grant-1",
              dueDate: new Date("2026-04-13T05:00:00.000Z"), // 5 days — NOT a threshold day
              status: "pending",
              grant: { name: "Far Report Grant" },
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips reporting requirements with status = submitted", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-submitted",
              grantId: "grant-1",
              grantName: "Org Grant",
              dueDate: new Date("2026-04-15T05:00:00.000Z"), // 7 days — threshold
              status: "submitted",
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips soft-deleted reporting requirements", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-deleted",
              grantId: "grant-1",
              dueDate: new Date("2026-04-15T05:00:00.000Z"),
              status: "pending",
              deletedAt: new Date("2026-04-01T00:00:00.000Z"),
              grant: { name: "Deleted Report Grant" },
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("sends grant deadline emails for Starter orgs — automation emails now included in all plans", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "starter",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // In-app notification insert + mock email provider insert = 2 calls
    expect(insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "grant_deadline",
        entityId: "grant-1",
      }),
    );
  });

  it("sends grant deadline emails for active Starter trials", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "starter",
                subscriptionStatus: "trialing",
                trialEndsAt: new Date("2099-05-01T00:00:00.000Z"),
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            emailEnabled: true,
            inAppEnabled: true,
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community Impact",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("inserts closeout_deadline notification for closeout items with a due date at threshold", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-closeout" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-1",
              grantId: "grant-1",
              label: "Final report",
              dueDate: new Date("2026-04-09T05:00:00.000Z"), // 1 day — threshold
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "closeout_deadline",
        entityId: "closeout-1",
      }),
    );
  });

  it("skips soft-deleted closeout items", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-closeout" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-deleted",
              grantId: "grant-1",
              dueDate: new Date("2026-04-15T05:00:00.000Z"),
              label: "Deleted closeout",
              deletedAt: new Date("2026-04-01T00:00:00.000Z"),
              grant: { name: "Deleted Closeout Grant" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips closeout items that are outside the reminder threshold window", async () => {
    const insert = vi.fn();

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-far",
              grantId: "grant-1",
              label: "Final report",
              dueDate: new Date("2026-04-14T05:00:00.000Z"), // 6 days — NOT a threshold day
              grant: { name: "Far Future Grant" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("sends email for closeout items when email enabled, plan eligible, and notification was inserted", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-closeout" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-1",
              grantId: "grant-99",
              label: "Final report",
              dueDate: new Date("2026-04-09T05:00:00.000Z"), // 1 day — threshold
              grant: { name: "Closeout Grant" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // One notification insert + one email insert
    expect(insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "closeout_deadline",
        entityId: "closeout-1",
        orgId: "org-1",
      }),
    );
    // Pin the grant deep-link path prefix so nav consolidation cannot silently break it.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: expect.stringContaining("https://grantpipe.test/app/grants/grant-99"),
      }),
    );
  });

  it("falls back to 'Unknown Grant' for closeout items with no associated grant", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-closeout" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-orphan",
              grantId: "grant-deleted",
              label: "Orphan closeout",
              dueDate: new Date("2026-04-09T05:00:00.000Z"), // 1 day — threshold
              grant: null,
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Unknown Grant"),
        type: "closeout_deadline",
      }),
    );
  });

  it("does not send closeout reminders for completed closeout items", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-closeout" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "closeout-complete",
              grantId: "grant-1",
              label: "Final report submitted",
              dueDate: new Date("2026-04-09T05:00:00.000Z"),
              completed: true,
              deletedAt: null,
              grant: { name: "Grant One" },
            },
          ]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("reuses cached org snapshots when two members share the same org", async () => {
    // Regression guard for the O(members × 3 scans) blow-up that exhausted
    // the scheduled handler's wall-time budget. Two members of the same
    // org must trigger one read of each of the three scan tables total,
    // not two reads each.
    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const grantFindMany = vi.fn().mockResolvedValue([]);
    const reportingFindMany = vi.fn().mockResolvedValue([]);
    const closeoutFindMany = vi.fn().mockResolvedValue([]);

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-shared",
                name: "Shared Org",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-a", email: "a@example.com", name: "A" },
            },
            {
              organization: {
                id: "org-shared",
                name: "Shared Org",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-b", email: "b@example.com", name: "B" },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: { findMany: grantFindMany },
        grantReportingRequirements: { findMany: reportingFindMany },
        grantCloseoutItems: { findMany: closeoutFindMany },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(grantFindMany).toHaveBeenCalledTimes(1);
    expect(reportingFindMany).toHaveBeenCalledTimes(1);
    expect(closeoutFindMany).toHaveBeenCalledTimes(1);
  });

  it("swallows individual email send failures instead of failing the job", async () => {
    // A single Resend outage must not bubble past the scheduled handler.
    // The per-iteration emailPromises array is awaited with allSettled;
    // individual rejections are logged + captured to Sentry and dropped.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const returning = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });

    // First insert call = notification (with chained values/onConflictDoNothing/returning).
    // Second insert call = mock email provider → rejects the whole chain.
    const emailInsertChain = {
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("resend down")),
        }),
      }),
    };
    const notificationInsertChain = { values };

    let insertCall = 0;
    const insert = vi.fn().mockImplementation(() => {
      insertCall += 1;
      return insertCall === 1 ? notificationInsertChain : emailInsertChain;
    });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-1", email: "a@example.com", name: "A" },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert,
    };

    await expect(
      sendScheduledGrantDeadlineReminders(db as never, {
        APP_URL: "https://grantpipe.test",
        RESEND_API_KEY: "resend-key",
      }),
    ).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });

  it("queues emails after the iteration's DB inserts so they do not block the db connection", async () => {
    // Ordering check: for a given member iteration, the notification insert
    // must complete before integrations.email.send is observed. This proves
    // the email send is not awaited inline in the middle of the DB work.
    const callOrder: string[] = [];

    const returning = vi.fn().mockImplementation(async () => {
      callOrder.push("notification.returning");
      return [{ id: "notification-1" }];
    });
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });

    const emailReturning = vi.fn().mockImplementation(async () => {
      callOrder.push("email.returning");
      return [{ id: "email-1" }];
    });
    const emailOnConflictDoNothing = vi.fn().mockReturnValue({ returning: emailReturning });
    const emailValues = vi.fn().mockReturnValue({ onConflictDoNothing: emailOnConflictDoNothing });
    const emailInsertChain = { values: emailValues };
    const notificationInsertChain = { values };

    let insertCall = 0;
    const insert = vi.fn().mockImplementation(() => {
      insertCall += 1;
      return insertCall === 1 ? notificationInsertChain : emailInsertChain;
    });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-1", email: "a@example.com", name: "A" },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              name: "Community",
              applicationDeadline: new Date("2026-04-09T05:00:00.000Z"),
            },
          ]),
        },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // Notification insert returning must be observed before the email
    // provider's insert returning — the email is queued, not inline-awaited.
    const notificationIndex = callOrder.indexOf("notification.returning");
    const emailIndex = callOrder.indexOf("email.returning");
    expect(notificationIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeGreaterThanOrEqual(0);
    expect(notificationIndex).toBeLessThan(emailIndex);
  });

  it("falls back to 'Unknown Grant' for reporting requirements with no associated grant", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "notification-reporting" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: {
                id: "user-1",
                email: "person@example.com",
                name: "Person",
              },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: false, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        grantReportingRequirements: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-orphan",
              grantId: "grant-deleted",
              dueDate: new Date("2026-04-09T05:00:00.000Z"), // 1 day — threshold
              status: "pending",
              grant: null,
            },
          ]),
        },
        grantCloseoutItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert,
    };

    await sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Unknown Grant"),
        type: "reporting_deadline",
      }),
    );
  });

  it("retries a transient database control-plane failure on the org-members fetch (GRANTPIPE-API-Y)", async () => {
    // Fake timers already enabled by beforeEach; advance past withDbRetry's
    // 250ms backoff so the retry attempt runs without sleeping wall-clock time.
    const transient = Object.assign(new Error("Failed query: select from org_members ..."), {
      cause: new Error("Control plane request failed"),
    });

    const findMany = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue([]);
    const db = {
      query: {
        orgMembers: { findMany },
        notificationPreferences: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: { findMany: vi.fn().mockResolvedValue([]) },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn(),
    };

    const promise = sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBeUndefined();

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("retries a transient database control-plane failure inside the org snapshot Promise.all (GRANTPIPE-API-Y)", async () => {
    const transient = Object.assign(
      new Error("Failed query: select from grant_reporting_requirements ..."),
      {
        cause: new Error("Control plane request failed"),
      },
    );

    const reportingFindMany = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue([]);
    const grantsFindMany = vi.fn().mockResolvedValue([]);
    const closeoutFindMany = vi.fn().mockResolvedValue([]);

    const db = {
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            {
              organization: {
                id: "org-1",
                name: "Org One",
                timezone: "America/New_York",
                planTier: "growth",
              },
              user: { id: "user-1", email: "person@example.com", name: "Person" },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: { findMany: grantsFindMany },
        grantReportingRequirements: { findMany: reportingFindMany },
        grantCloseoutItems: { findMany: closeoutFindMany },
      },
      insert: vi.fn(),
    };

    const promise = sendScheduledGrantDeadlineReminders(db as never, {
      APP_URL: "https://grantpipe.test",
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBeUndefined();

    expect(reportingFindMany).toHaveBeenCalledTimes(2);
    // Snapshot is built once per org; the retry re-runs the whole Promise.all,
    // so the other two queries each fire twice as well — that's the intended
    // tradeoff for a transient retry on read-only reads.
    expect(grantsFindMany).toHaveBeenCalledTimes(2);
    expect(closeoutFindMany).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient query failure", async () => {
    const fatal = Object.assign(new Error('syntax error at or near "WHERE"'), {
      code: "42601",
    });

    const findMany = vi.fn().mockRejectedValue(fatal);
    const db = {
      query: {
        orgMembers: { findMany },
        notificationPreferences: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        grants: { findMany: vi.fn().mockResolvedValue([]) },
        grantReportingRequirements: { findMany: vi.fn().mockResolvedValue([]) },
        grantCloseoutItems: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn(),
    };

    await expect(
      sendScheduledGrantDeadlineReminders(db as never, {
        APP_URL: "https://grantpipe.test",
      }),
    ).rejects.toBe(fatal);

    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe("checkGrantSpendDownThresholds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Wednesday 12:00 EDT — inside business hours (orgs default to NY).
    vi.setSystemTime(new Date("2026-04-08T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeThresholdDb(params: {
    grants: Array<{
      id: string;
      orgId: string;
      name: string;
      amountCents: number | null;
      // Fixtures may carry extra columns that the code ignores; keep loose
      // typings so tests can hand in richer rows without type friction.
      startDate?: Date | null;
      organization: {
        id: string;
        planTier: string | null;
        subscriptionStatus?: string | null;
        trialEndsAt?: Date | string | null;
        name?: string;
      } | null;
    }>;
    expensesByGrant: Record<string, Array<{ amountCents: number }>>;
    members: Array<{
      orgId: string;
      user: { id: string; email: string; name: string } | null;
    }>;
    /**
     * Dedupe keys that the bulk notifications insert should return — these
     * represent the rows that were actually inserted (i.e. did not hit the
     * onConflictDoNothing unique constraint). Defaults to returning every
     * row that was passed into values().
     */
    insertedDedupeKeys?: string[] | "all";
    /**
     * Optional override of notification-preference rows returned by the
     * batched loadOrgNotificationPreferences query.
     */
    preferenceRows?: Array<{
      userId: string;
      notificationType: string;
      emailEnabled: boolean;
      inAppEnabled: boolean;
    }>;
  }) {
    // Emulate the bulk insert's returning() contract: it yields a row per
    // freshly-inserted dedupeKey, skipping any rows that conflicted.
    const lastValuesArg: { rows: Array<{ dedupeKey: string }> } = { rows: [] };
    const returning = vi.fn().mockImplementation(async () => {
      if (params.insertedDedupeKeys === undefined || params.insertedDedupeKeys === "all") {
        return lastValuesArg.rows.map((r) => ({ dedupeKey: r.dedupeKey }));
      }
      const allowed = new Set(params.insertedDedupeKeys);
      return lastValuesArg.rows
        .filter((r) => allowed.has(r.dedupeKey))
        .map((r) => ({ dedupeKey: r.dedupeKey }));
    });
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockImplementation((arg: unknown) => {
      lastValuesArg.rows = Array.isArray(arg)
        ? (arg as Array<{ dedupeKey: string }>)
        : [arg as { dedupeKey: string }];
      return { onConflictDoNothing };
    });
    const insert = vi.fn().mockReturnValue({ values });

    // db.select().from().where().groupBy() returns one row per grantId
    // with the summed expense total. Drizzle's sum() returns a string, so
    // we match that contract.
    const groupBy = vi.fn().mockImplementation(async () => {
      return Object.entries(params.expensesByGrant).map(([grantId, rows]) => ({
        grantId,
        total: String(rows.reduce((sum, r) => sum + r.amountCents, 0)),
      }));
    });
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    return {
      db: {
        query: {
          grants: {
            findMany: vi.fn().mockResolvedValue(params.grants),
          },
          notificationPreferences: {
            findMany: vi.fn().mockResolvedValue(params.preferenceRows ?? []),
          },
          orgMembers: {
            findMany: vi.fn().mockResolvedValue(params.members),
          },
        },
        insert,
        select,
      },
      insert,
      values,
      onConflictDoNothing,
      returning,
      select,
      from,
      where,
      groupBy,
    };
  }

  it("retries a transient database control-plane failure on the active grants fetch", async () => {
    vi.useFakeTimers();

    try {
      const transient = Object.assign(new Error("Failed query: select from grants ..."), {
        cause: new Error("Control plane request failed"),
      });

      const { db } = makeThresholdDb({
        grants: [],
        expensesByGrant: {},
        members: [],
      });
      db.query.grants.findMany = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue([]);

      const promise = checkGrantSpendDownThresholds(db as never, {
        APP_URL: "https://grantpipe.test",
      });
      await vi.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toBeUndefined();

      expect(db.query.grants.findMany).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // Builds a db mock where the first insert (notifications) succeeds but the
  // second insert (mock-email provider) rejects with the provided failure.
  // Used by the email-failure-swallowing tests to verify the scheduled job
  // logs + resolves cleanly when Resend is down.
  function makeEmailFailureSpendDownDb({ failure }: { failure: unknown }) {
    const notifReturning = vi
      .fn()
      .mockResolvedValue([{ dedupeKey: "grant_spend_threshold:grant-1:user-1:80" }]);
    const notifOnConflict = vi.fn().mockReturnValue({ returning: notifReturning });
    const notifValues = vi.fn().mockReturnValue({ onConflictDoNothing: notifOnConflict });
    const notificationInsertChain = { values: notifValues };

    const emailInsertChain = {
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(failure),
        }),
      }),
    };

    let insertCall = 0;
    const insert = vi.fn().mockImplementation(() => {
      insertCall += 1;
      return insertCall === 1 ? notificationInsertChain : emailInsertChain;
    });

    const groupBy = vi.fn().mockResolvedValue([{ grantId: "grant-1", total: "80000" }]);
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    return {
      query: {
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              orgId: "org-1",
              name: "Summer Programs",
              amountCents: 100_000,
              organization: { id: "org-1", planTier: "growth" },
            },
          ]),
        },
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({ emailEnabled: true, inAppEnabled: true }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        expenses: {
          findMany: vi.fn().mockResolvedValue([{ amountCents: 80_000 }]),
        },
        orgMembers: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { orgId: "org-1", user: { id: "user-1", email: "a@example.com", name: "A" } },
            ]),
        },
      },
      insert,
      select,
    };
  }

  it("inserts notification and sends email at 80% threshold for growth org", async () => {
    const { db, insert, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        {
          orgId: "org-1",
          user: { id: "user-1", email: "admin@example.com", name: "Admin" },
        },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).toHaveBeenCalledWith(notifications);
    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          orgId: "org-1",
          userId: "user-1",
          type: "spend_down_threshold",
          entityType: "grant",
          entityId: "grant-1",
          dedupeKey: "grant_spend_threshold:grant-1:user-1:80",
        }),
      ]),
    );
    // Pin the grant deep-link path prefix so nav consolidation cannot silently break it.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: expect.stringContaining("https://grantpipe.test/app/grants/grant-1"),
      }),
    );
  });

  it("defers spend-down alerts when the org is outside business hours", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          organization: {
            id: "org-1",
            name: "Org One",
            planTier: "growth",
            timezone: "America/New_York",
          } as never,
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        {
          orgId: "org-1",
          user: { id: "user-1", email: "admin@example.com", name: "Admin" },
        },
      ],
    });

    // 2026-04-08 06:00Z === 02:00 EDT — the middle of the night locally.
    await checkGrantSpendDownThresholds(
      db as never,
      { APP_URL: "https://grantpipe.test", RESEND_API_KEY: "resend-key" },
      "test-cron",
      new Date("2026-04-08T06:00:00.000Z"),
    );

    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts notification at 90% threshold", async () => {
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "starter" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 90_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dedupeKey: "grant_spend_threshold:grant-1:user-1:90" }),
      ]),
    );
  });

  it("inserts notification at 100% threshold", async () => {
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "starter" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 100_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dedupeKey: "grant_spend_threshold:grant-1:user-1:100" }),
      ]),
    );
  });

  it("does not insert notification when expenses are below 80%", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 70_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips grants with no budget", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "No Budget Grant",
          amountCents: null,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: {},
      members: [],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("sends both in-app and email notifications for starter tier — automation emails now included in all plans", async () => {
    const { db, insert, returning } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "starter" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // Notification is inserted
    expect(insert).toHaveBeenCalledWith(notifications);
    // returning called twice: once for notification insert, once for mock email provider insert
    expect(returning).toHaveBeenCalledTimes(3);
    // insert is called twice: notification + mock email provider
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("sends spend-down threshold email for active Starter trials", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: {
            id: "org-1",
            name: "Org One",
            planTier: "starter",
            subscriptionStatus: "trialing",
            trialEndsAt: new Date("2099-05-01T00:00:00.000Z"),
          },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("does not email spend-down alerts generated from sample onboarding grants", async () => {
    const { db, insert, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "[Sample] Senior Wellbeing Initiative",
          amountCents: 100_000,
          startDate: null,
          organization: {
            id: "org-1",
            name: "Org One",
            planTier: "growth",
            subscriptionStatus: "active",
            trialEndsAt: null,
          },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 90_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Spend-down alert: [Sample] Senior Wellbeing Initiative",
        }),
      ]),
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("respects spend-down threshold notification preferences before inserting or emailing", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    db.query.notificationPreferences = {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: "user-1",
          notificationType: "grant_deadline",
          emailEnabled: false,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "reporting_deadline",
          emailEnabled: false,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "closeout_deadline",
          emailEnabled: false,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "spend_down_threshold",
          emailEnabled: false,
          inAppEnabled: false,
        },
      ]),
    };

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(db.query.notificationPreferences.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      }),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("marks spend-down notifications as read when only email delivery is enabled", async () => {
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    db.query.notificationPreferences = {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: "user-1",
          notificationType: "grant_deadline",
          emailEnabled: true,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "reporting_deadline",
          emailEnabled: true,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "closeout_deadline",
          emailEnabled: true,
          inAppEnabled: false,
        },
        {
          userId: "user-1",
          notificationType: "spend_down_threshold",
          emailEnabled: true,
          inAppEnabled: false,
        },
      ]),
    };

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          readAt: expect.any(Date),
          type: "spend_down_threshold",
        }),
      ]),
    );
  });

  it("does not insert duplicate notification when dedupeKey already exists", async () => {
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
      // Simulate onConflictDoNothing returning nothing (already exists)
      insertedDedupeKeys: [],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // values was called once for the bulk notification insert. No email goes
    // out because returning() resolved empty (dedupe conflict), so there is
    // no second insert for the mock email row.
    expect(values).toHaveBeenCalledTimes(1);
  });

  it("bulk-inserts one row per (grant, member) when multiple grants share an org", async () => {
    // Covers the bucket-push branch: when a triggered grant's orgId is
    // already present in triggeredByOrg, the new grant is appended to the
    // existing bucket instead of starting a fresh one. Also validates the
    // "grant missing from expenseTotals" path — the third grant has no
    // expense row, so the `?? 0` fallback keeps it out of the results.
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
        {
          id: "grant-2",
          orgId: "org-1",
          name: "Winter Programs",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
        {
          id: "grant-3",
          orgId: "org-1",
          name: "Unused Grant",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
      ],
      expensesByGrant: {
        "grant-1": [{ amountCents: 80_000 }],
        "grant-2": [{ amountCents: 90_000 }],
      },
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // One bulk notification insert (with both dedupe keys), then separate
    // mock-email inserts per recipient. We assert on the array shape, not
    // the call count (mock email provider also goes through .values()).
    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dedupeKey: "grant_spend_threshold:grant-1:user-1:80" }),
        expect.objectContaining({ dedupeKey: "grant_spend_threshold:grant-2:user-1:90" }),
      ]),
    );
  });

  it("skips grants whose organization relation is missing", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-ghost",
          orgId: "org-1",
          name: "Orphan Grant",
          amountCents: 100_000,
          startDate: null,
          organization: null,
        },
      ],
      expensesByGrant: { "grant-ghost": [{ amountCents: 80_000 }] },
      members: [],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips org members whose user relation is missing", async () => {
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          startDate: null,
          organization: { id: "org-1", name: "Org One", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [{ orgId: "org-1", user: null }],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("ignores null-user members when another member in the same org is valid", async () => {
    // Covers the inner `if (!member.user) continue;` branch: the earlier
    // `userIds.length === 0` short-circuit only fires when every member has
    // a null user. This test keeps one valid member so we reach the inner
    // loop and exercise the guard for a mixed roster.
    const { db, values } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
      ],
      expensesByGrant: { "grant-1": [{ amountCents: 80_000 }] },
      members: [
        { orgId: "org-1", user: null },
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(values).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ userId: "user-1" })]),
    );
  });

  it("treats a null expense total as zero and skips the grant", async () => {
    // Drizzle's sum() returns null when a grouped key has no rows matching
    // the filter. The `?? 0` fallback keeps the computation safe.
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
      ],
      expensesByGrant: {},
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });
    // Override the groupBy result to include a row with total=null for grant-1.
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([{ grantId: "grant-1", total: null }]),
        }),
      }),
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips expense rows with a null grantId", async () => {
    // Defensive: if drizzle ever hands back a row with grantId=null
    // (shouldn't happen given the group-by, but the guard exists), we skip
    // it rather than bucket it under an undefined key.
    const { db, insert } = makeThresholdDb({
      grants: [
        {
          id: "grant-1",
          orgId: "org-1",
          name: "Summer Programs",
          amountCents: 100_000,
          organization: { id: "org-1", planTier: "growth" },
        },
      ],
      expensesByGrant: {},
      members: [
        { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
      ],
    });
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([{ grantId: null, total: "80000" }]),
        }),
      }),
    });

    await checkGrantSpendDownThresholds(db as never, { APP_URL: "https://grantpipe.test" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips returning rows without a dedupeKey when emailing", async () => {
    // The `returning()` call yields one row per inserted notification; rows
    // missing a dedupeKey (defensive — the column is nullable) are skipped
    // so we don't mismap to the emailByDedupe lookup.
    //
    // We build the db by hand here so the single `insert` spy IS the one
    // referenced in the assertion (otherwise a test that replaces db.insert
    // after destructuring from makeThresholdDb would orphan the original
    // mock and silently pass regardless of branch behavior).
    const returning = vi.fn().mockResolvedValue([{ dedupeKey: null }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const groupBy = vi.fn().mockResolvedValue([{ grantId: "grant-1", total: "80000" }]);
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    const db = {
      query: {
        grants: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "grant-1",
              orgId: "org-1",
              name: "Summer Programs",
              amountCents: 100_000,
              organization: { id: "org-1", planTier: "growth" },
            },
          ]),
        },
        notificationPreferences: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        orgMembers: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { orgId: "org-1", user: { id: "user-1", email: "admin@example.com", name: "Admin" } },
            ]),
        },
      },
      insert,
      select,
    };

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    // Only the notifications insert happened — no email insert was triggered
    // because the returning row had no dedupeKey to look up.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("swallows individual spend-down email failures instead of failing the job", async () => {
    // Mirrors the deadline-reminder email swallow test but for the spend-down
    // job. A single Resend outage must not abort the scheduled handler — the
    // rejection is logged and reported via Sentry, and the overall job resolves.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const db = makeEmailFailureSpendDownDb({ failure: new Error("resend down") });

    await expect(
      checkGrantSpendDownThresholds(db as never, {
        APP_URL: "https://grantpipe.test",
        RESEND_API_KEY: "resend-key",
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[scheduled] email send failed",
      expect.objectContaining({
        job: "notifications.spend-down",
        orgId: "org-1",
        error: expect.stringContaining("resend down"),
      }),
    );

    errorSpy.mockRestore();
  });

  it("stringifies non-Error email failures for the scheduled log", async () => {
    // Covers the `err instanceof Error ? err.message : String(err)` branch
    // so a thrown string or object still produces a readable log entry.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const db = makeEmailFailureSpendDownDb({ failure: "resend string failure" });

    await checkGrantSpendDownThresholds(db as never, {
      APP_URL: "https://grantpipe.test",
      RESEND_API_KEY: "resend-key",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[scheduled] email send failed",
      expect.objectContaining({ error: "resend string failure" }),
    );

    errorSpy.mockRestore();
  });
});
