import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { notificationPreferences, notifications } from "@grantpipe/db";
import {
  getUnreadNotificationCount,
  listNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreference,
} from "./service";

function makeListDb(rows: unknown[], total: number) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  const countWhere = vi.fn().mockResolvedValue([{ count: total }]);
  const countFrom = vi.fn().mockReturnValue({ where: countWhere });

  const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });

  return {
    select,
    query: {
      notifications: {
        findFirst: vi.fn(),
      },
      notificationPreferences: {
        findFirst: vi.fn(),
      },
    },
  };
}

function makeUpdateDb(returningRows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningRows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return { update };
}

function makeInsertDb(returningRows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningRows);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return { insert };
}

describe("listNotifications", () => {
  it("keeps legacy unscoped anomaly rows out of entity feeds", async () => {
    const db = makeListDb([], 0);

    await listNotifications(db as never, {
      orgId: "org-1",
      entityId: "entity-a",
      userId: "user-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const listBuilder = db.select.mock.results[0]!.value;
    const where = listBuilder.from.mock.results[0]!.value.where.mock.calls[0]![0];
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"notifications"."active_entity_id"');
    expect(query.sql).toContain('"notifications"."type" <>');
    expect(query.params).toContain("accounting_anomaly");
    expect(query.params).toContain("entity-a");
  });

  it("returns paginated notifications for the current org and user", async () => {
    const createdAt = new Date("2026-04-08T10:00:00Z");
    const db = makeListDb(
      [
        {
          id: "notification-1",
          orgId: "org-1",
          userId: "user-1",
          type: "grant_deadline",
          title: "Grant deadline coming up",
          body: "The grant is due soon.",
          entityType: "grant",
          entityId: "grant-1",
          activeEntityId: "entity-1",
          dedupeKey: "deadline:grant-1",
          readAt: null,
          createdAt,
          emailDeliveryStatus: "sent",
          emailRequestSnapshot: {
            to: ["private@example.com"],
            text: "private provider body",
            idempotencyKey: "notification-email/private",
          },
          emailRequestFingerprint: "private-fingerprint",
          emailClaimedAt: createdAt,
          emailAttemptCount: 1,
          emailProviderMessageId: "resend-private",
          emailLastError: "private provider error",
          emailSentAt: createdAt,
        },
      ],
      1,
    );

    const result = await listNotifications(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      type: "grant_deadline",
      read: false,
    });

    expect(result).toEqual({
      data: [
        {
          id: "notification-1",
          orgId: "org-1",
          userId: "user-1",
          type: "grant_deadline",
          title: "Grant deadline coming up",
          body: "The grant is due soon.",
          entityType: "grant",
          entityId: "grant-1",
          activeEntityId: "entity-1",
          dedupeKey: "deadline:grant-1",
          readAt: null,
          createdAt,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it("supports ascending sort order and read filtering", async () => {
    const db = makeListDb(
      [
        {
          id: "notification-2",
          orgId: "org-1",
          userId: "user-1",
          title: "Read notification",
          readAt: new Date("2026-04-08T12:00:00Z"),
        },
      ],
      1,
    );

    const result = await listNotifications(db as never, {
      orgId: "org-1",
      userId: "user-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "asc",
      read: true,
    });

    expect(result.data[0]?.readAt).toBeInstanceOf(Date);
  });

  it("defaults total to zero when the count query returns no rows", async () => {
    const offset = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ offset });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const countWhere = vi.fn().mockResolvedValue([]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
    const db = {
      select,
      query: {
        notifications: {
          findFirst: vi.fn(),
        },
        notificationPreferences: {
          findFirst: vi.fn(),
        },
      },
    };

    const result = await listNotifications(db as never, {
      orgId: "org-1",
      userId: "user-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(0);
  });
});

describe("getUnreadNotificationCount", () => {
  it("returns the unread notification count for the current user", async () => {
    const countWhere = vi.fn().mockResolvedValue([{ count: 3 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValue({ from: countFrom });

    const count = await getUnreadNotificationCount(
      {
        select,
        query: {
          notifications: {
            findFirst: vi.fn(),
          },
          notificationPreferences: {
            findFirst: vi.fn(),
          },
        },
      } as never,
      {
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
      },
    );

    expect(count).toBe(3);
  });

  it("defaults unread notification count to zero when no row is returned", async () => {
    const countWhere = vi.fn().mockResolvedValue([]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValue({ from: countFrom });

    const count = await getUnreadNotificationCount(
      {
        select,
        query: {
          notifications: {
            findFirst: vi.fn(),
          },
          notificationPreferences: {
            findFirst: vi.fn(),
          },
        },
      } as never,
      {
        orgId: "org-1",
        userId: "user-1",
      },
    );

    expect(count).toBe(0);
  });
});

describe("markNotificationRead", () => {
  it("marks a notification read and returns the updated row", async () => {
    const readAt = new Date("2026-04-08T12:00:00Z");
    const db = makeUpdateDb([
      {
        id: "notification-1",
        orgId: "org-1",
        userId: "user-1",
        type: "grant_deadline",
        title: "Deadline soon",
        body: "The grant is due soon.",
        entityType: "grant",
        entityId: "grant-1",
        activeEntityId: "entity-1",
        dedupeKey: "deadline:grant-1",
        readAt,
        createdAt: new Date("2026-04-08T10:00:00Z"),
        emailRequestSnapshot: { to: ["private@example.com"], text: "private" },
        emailRequestFingerprint: "private-fingerprint",
        emailProviderMessageId: "resend-private",
        emailLastError: "private provider error",
      },
    ]);

    const result = await markNotificationRead(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      notificationId: "notification-1",
    });

    expect(result).toEqual({
      id: "notification-1",
      orgId: "org-1",
      userId: "user-1",
      type: "grant_deadline",
      title: "Deadline soon",
      body: "The grant is due soon.",
      entityType: "grant",
      entityId: "grant-1",
      activeEntityId: "entity-1",
      dedupeKey: "deadline:grant-1",
      readAt,
      createdAt: new Date("2026-04-08T10:00:00Z"),
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("resend-private");
    expect(db.update).toHaveBeenCalledWith(notifications);
  });

  it("throws when no notification row is updated", async () => {
    const db = makeUpdateDb([]);

    await expect(
      markNotificationRead(db as never, {
        orgId: "org-1",
        userId: "user-1",
        notificationId: "notification-missing",
      }),
    ).rejects.toThrow("Notification not found");
  });
});

describe("markAllNotificationsRead", () => {
  it("marks every unread notification for the current org and user", async () => {
    const db = makeUpdateDb([]);

    await markAllNotificationsRead(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
    });

    expect(db.update).toHaveBeenCalledWith(notifications);
  });
});

describe("listNotificationPreferences", () => {
  it("returns preferences for the current org and user", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "pref-1",
                notificationType: "grant_deadline",
                emailEnabled: true,
                inAppEnabled: true,
              },
            ]),
          }),
        }),
      }),
    };

    const result = await listNotificationPreferences(db as never, {
      orgId: "org-1",
      userId: "user-1",
    });

    expect(result).toHaveLength(14);
    expect(result[0]?.notificationType).toBe("grant_deadline");
    expect(result[0]).toMatchObject({
      id: "pref-1",
      emailEnabled: true,
      inAppEnabled: true,
    });
    expect(result.at(-1)).toMatchObject({
      id: "default:trial_lifecycle",
      notificationType: "trial_lifecycle",
    });
  });

  it("adds enabled default rows for known preference types with no saved row", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const result = await listNotificationPreferences(db as never, {
      orgId: "org-1",
      userId: "user-1",
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "default:trial_lifecycle",
          notificationType: "trial_lifecycle",
          emailEnabled: true,
          inAppEnabled: true,
        }),
      ]),
    );
  });

  it("keeps unknown notification types at the end when sorting preferences", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "pref-1",
                notificationType: "grant_deadline",
                emailEnabled: true,
                inAppEnabled: true,
              },
              {
                id: "pref-2",
                notificationType: "unknown_type",
                emailEnabled: true,
                inAppEnabled: false,
              },
            ]),
          }),
        }),
      }),
    };

    const result = await listNotificationPreferences(db as never, {
      orgId: "org-1",
      userId: "user-1",
    });

    expect(result[0]?.id).toBe("pref-1");
    expect(result.at(-1)?.id).toBe("pref-2");
  });

  it("treats unknown notification types as the lowest priority during sorting", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "pref-unknown",
                notificationType: "unknown_type",
                emailEnabled: true,
                inAppEnabled: false,
              },
              {
                id: "pref-known",
                notificationType: "grant_deadline",
                emailEnabled: true,
                inAppEnabled: true,
              },
            ]),
          }),
        }),
      }),
    };

    const result = await listNotificationPreferences(db as never, {
      orgId: "org-1",
      userId: "user-1",
    });

    expect(result[0]?.id).toBe("pref-known");
    expect(result.at(-1)?.id).toBe("pref-unknown");
  });
});

describe("upsertNotificationPreference", () => {
  it("updates an existing preference row when one exists", async () => {
    const update = makeUpdateDb([
      {
        id: "pref-1",
        notificationType: "report_due",
        emailEnabled: false,
        inAppEnabled: true,
      },
    ]);
    const db = {
      query: {
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            id: "pref-1",
            orgId: "org-1",
            userId: "user-1",
            notificationType: "report_due",
          }),
        },
      },
      update: update.update,
    };

    const result = await upsertNotificationPreference(db as never, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        notificationType: "report_due",
        emailEnabled: false,
        inAppEnabled: true,
      },
    });

    expect(result.notificationType).toBe("report_due");
    expect(update.update).toHaveBeenCalledWith(notificationPreferences);
  });

  it("throws when updating an existing preference returns no row", async () => {
    const update = makeUpdateDb([]);
    const db = {
      query: {
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            id: "pref-1",
            orgId: "org-1",
            userId: "user-1",
            notificationType: "report_due",
          }),
        },
      },
      update: update.update,
    };

    await expect(
      upsertNotificationPreference(db as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          notificationType: "report_due",
          emailEnabled: false,
          inAppEnabled: true,
        },
      }),
    ).rejects.toThrow("Notification preference not found");
  });

  it("inserts a preference row when one does not exist", async () => {
    const insert = makeInsertDb([
      {
        id: "pref-2",
        notificationType: "grant_deadline",
        emailEnabled: true,
        inAppEnabled: false,
      },
    ]);
    const db = {
      query: {
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: insert.insert,
    };

    const result = await upsertNotificationPreference(db as never, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        notificationType: "grant_deadline",
        emailEnabled: true,
        inAppEnabled: false,
      },
    });

    expect(result.id).toBe("pref-2");
    expect(insert.insert).toHaveBeenCalledWith(notificationPreferences);
  });

  it("throws when inserting a preference returns no row", async () => {
    const insert = makeInsertDb([]);
    const db = {
      query: {
        notificationPreferences: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: insert.insert,
    };

    await expect(
      upsertNotificationPreference(db as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          notificationType: "grant_deadline",
          emailEnabled: true,
          inAppEnabled: false,
        },
      }),
    ).rejects.toThrow("Failed to create notification preference");
  });
});
