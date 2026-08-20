import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { recordActivityLog } from "../../lib/activity-log";
import { requireRole } from "../../middleware/require-role";
import { notificationListSchema, notificationPreferenceSchema } from "@grantpipe/shared";
import {
  getUnreadNotificationCount,
  listNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreference,
} from "./service";

export const notificationRoutes = new Hono<AppEnv>()
  .get("/", requireRole("viewer"), zValidator("query", notificationListSchema), async (c) => {
    const result = await listNotifications(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      userId: c.get("user")!.id,
      ...c.req.valid("query"),
    });
    return c.json(result);
  })
  .get("/unread-count", requireRole("viewer"), async (c) => {
    const unreadCount = await getUnreadNotificationCount(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      userId: c.get("user")!.id,
    });
    return c.json({ unreadCount });
  })
  .patch("/:notificationId/read", requireRole("viewer"), async (c) => {
    const notification = await markNotificationRead(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      userId: c.get("user")!.id,
      notificationId: c.req.param("notificationId"),
    });
    return c.json(notification);
  })
  .patch("/read-all", requireRole("viewer"), async (c) => {
    await markAllNotificationsRead(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      userId: c.get("user")!.id,
    });
    return c.body(null, 204);
  })
  .get("/preferences", requireRole("viewer"), async (c) => {
    const preferences = await listNotificationPreferences(c.get("db"), {
      orgId: c.get("orgId")!,
      userId: c.get("user")!.id,
    });
    return c.json(preferences);
  })
  .patch(
    "/preferences",
    requireRole("viewer"),
    zValidator("json", notificationPreferenceSchema),
    async (c) => {
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const preference = await upsertNotificationPreference(c.get("db"), {
        orgId,
        userId,
        data: c.req.valid("json"),
      });
      await recordActivityLog(c.get("db"), {
        orgId,
        actorId: userId,
        action: "updated",
        entityType: "notification",
        entityId: preference.id,
        changes: c.req.valid("json"),
      });
      return c.json(preference);
    },
  );
