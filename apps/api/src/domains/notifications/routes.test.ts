import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { notificationRoutes } from "./routes";

vi.mock("./service", () => ({
  getUnreadNotificationCount: vi.fn(),
  listNotificationPreferences: vi.fn(),
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  upsertNotificationPreference: vi.fn(),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import {
  getUnreadNotificationCount,
  listNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreference,
} from "./service";
import { recordActivityLog } from "../../lib/activity-log";

function buildApp(role: "admin" | "editor" | "viewer" = "viewer") {
  return new Hono<AppEnv>()
    .use("/notifications/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/notifications", notificationRoutes);
}

describe("notification routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists notifications with viewer scope and pagination", async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      data: [{ id: "notification-1" }] as never,
      total: 1,
      page: 2,
      pageSize: 10,
    });

    const app = buildApp("viewer");
    const res = await app.request(
      "/notifications?read=false&type=grant_deadline&page=2&pageSize=10",
    );

    expect(res.status).toBe(200);
    expect(listNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        page: 2,
        pageSize: 10,
        read: false,
        type: "grant_deadline",
      }),
    );
  });

  it("returns the unread count for the current viewer", async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(7);

    const app = buildApp("viewer");
    const res = await app.request("/notifications/unread-count");

    expect(res.status).toBe(200);
    expect(getUnreadNotificationCount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
      }),
    );
  });

  it("marks one notification read and marks all notifications read", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue({ id: "notification-1" } as never);
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined as never);

    const app = buildApp("viewer");

    expect(
      await app.request("/notifications/notification-1/read", {
        method: "PATCH",
      }),
    ).toMatchObject({ status: 200 });
    expect(await app.request("/notifications/read-all", { method: "PATCH" })).toMatchObject({
      status: 204,
    });
    expect(markNotificationRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        notificationId: "notification-1",
      }),
    );
    expect(markAllNotificationsRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
      }),
    );
  });

  it("lists preferences and upserts one preference for the current viewer", async () => {
    vi.mocked(listNotificationPreferences).mockResolvedValue([
      {
        id: "pref-1",
        notificationType: "grant_deadline",
        emailEnabled: true,
        inAppEnabled: true,
      },
    ] as never);
    vi.mocked(upsertNotificationPreference).mockResolvedValue({
      id: "pref-1",
      notificationType: "report_due",
      emailEnabled: false,
      inAppEnabled: true,
    } as never);

    const app = buildApp("viewer");

    expect(await app.request("/notifications/preferences")).toMatchObject({ status: 200 });
    expect(
      await app.request("/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationType: "report_due",
          emailEnabled: false,
          inAppEnabled: true,
        }),
      }),
    ).toMatchObject({ status: 200 });
    expect(listNotificationPreferences).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
      }),
    );
    expect(upsertNotificationPreference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        data: {
          notificationType: "report_due",
          emailEnabled: false,
          inAppEnabled: true,
        },
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "notification",
        entityId: "pref-1",
      }),
    );
  });

  it("rejects invalid preference payloads", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationType: "report_due",
        emailEnabled: "nope",
        inAppEnabled: true,
      }),
    });

    expect(res.status).toBe(400);
  });
});
