import { and, asc, count as drizzleCount, desc, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { notificationPreferences, notifications, type Database } from "@grantpipe/db";
import type {
  NotificationListParams,
  NotificationPreferenceInput,
  NotificationType,
} from "@grantpipe/shared";
import { NOTIFICATION_TYPES } from "@grantpipe/shared";

export type PublicNotification = Pick<
  typeof notifications.$inferSelect,
  | "id"
  | "orgId"
  | "userId"
  | "type"
  | "title"
  | "body"
  | "entityType"
  | "entityId"
  | "activeEntityId"
  | "dedupeKey"
  | "readAt"
  | "createdAt"
>;

const publicNotificationColumns = {
  id: notifications.id,
  orgId: notifications.orgId,
  userId: notifications.userId,
  type: notifications.type,
  title: notifications.title,
  body: notifications.body,
  entityType: notifications.entityType,
  entityId: notifications.entityId,
  activeEntityId: notifications.activeEntityId,
  dedupeKey: notifications.dedupeKey,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

function toPublicNotification(notification: PublicNotification): PublicNotification {
  return {
    id: notification.id,
    orgId: notification.orgId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    entityType: notification.entityType,
    entityId: notification.entityId,
    activeEntityId: notification.activeEntityId,
    dedupeKey: notification.dedupeKey,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

function notificationEntityVisibility(entityId?: string) {
  if (!entityId) return undefined;
  return or(
    eq(notifications.activeEntityId, entityId),
    and(isNull(notifications.activeEntityId), ne(notifications.type, "accounting_anomaly")),
  );
}

function buildNotificationWhere(params: {
  orgId: string;
  entityId?: string;
  userId: string;
  read?: boolean;
  type?: NotificationType;
}) {
  const filters = [eq(notifications.orgId, params.orgId), eq(notifications.userId, params.userId)];

  if (params.entityId) {
    filters.push(notificationEntityVisibility(params.entityId)!);
  }

  if (params.read !== undefined) {
    filters.push(params.read ? isNotNull(notifications.readAt) : isNull(notifications.readAt));
  }

  if (params.type) {
    filters.push(eq(notifications.type, params.type));
  }

  return and(...filters);
}

function sortPreferences(rows: (typeof notificationPreferences.$inferSelect)[]) {
  const order = new Map<NotificationType, number>(
    NOTIFICATION_TYPES.map((type, index) => [type, index]),
  );

  return [...rows].sort((left, right) => {
    return (
      (order.get(left.notificationType as NotificationType) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.notificationType as NotificationType) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

export async function listNotifications(
  db: Database,
  params: { orgId: string; entityId?: string; userId: string } & NotificationListParams,
): Promise<{
  data: PublicNotification[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where = buildNotificationWhere(params);
  const offset = (params.page - 1) * params.pageSize;
  const orderBy =
    params.sortOrder === "asc" ? asc(notifications.createdAt) : desc(notifications.createdAt);

  const rows = await db
    .select(publicNotificationColumns)
    .from(notifications)
    .where(where)
    .orderBy(orderBy)
    .limit(params.pageSize)
    .offset(offset);

  const [totalRow] = await db.select({ count: drizzleCount() }).from(notifications).where(where);

  return {
    data: rows.map(toPublicNotification),
    total: totalRow?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getUnreadNotificationCount(
  db: Database,
  params: { orgId: string; entityId?: string; userId: string },
): Promise<number> {
  const [totalRow] = await db
    .select({ count: drizzleCount() })
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, params.orgId),
        eq(notifications.userId, params.userId),
        notificationEntityVisibility(params.entityId),
        isNull(notifications.readAt),
      ),
    );

  return totalRow?.count ?? 0;
}

export async function markNotificationRead(
  db: Database,
  params: { orgId: string; entityId?: string; userId: string; notificationId: string },
): Promise<PublicNotification> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, params.notificationId),
        eq(notifications.orgId, params.orgId),
        eq(notifications.userId, params.userId),
        notificationEntityVisibility(params.entityId),
      ),
    )
    .returning(publicNotificationColumns);

  if (!updated) {
    throw new Error("Notification not found");
  }

  return toPublicNotification(updated);
}

export async function markAllNotificationsRead(
  db: Database,
  params: { orgId: string; entityId?: string; userId: string },
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.orgId, params.orgId),
        eq(notifications.userId, params.userId),
        notificationEntityVisibility(params.entityId),
        isNull(notifications.readAt),
      ),
    )
    .returning();

  return rows.length;
}

export async function listNotificationPreferences(
  db: Database,
  params: { orgId: string; userId: string },
): Promise<(typeof notificationPreferences.$inferSelect)[]> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.orgId, params.orgId),
        eq(notificationPreferences.userId, params.userId),
      ),
    )
    .orderBy(asc(notificationPreferences.notificationType));

  const savedByType = new Map(rows.map((row) => [row.notificationType, row]));
  const defaults = NOTIFICATION_TYPES.filter((type) => !savedByType.has(type)).map((type) => ({
    id: `default:${type}`,
    orgId: params.orgId,
    userId: params.userId,
    notificationType: type,
    emailEnabled: true,
    inAppEnabled: true,
  }));

  return sortPreferences([...rows, ...defaults]);
}

export async function upsertNotificationPreference(
  db: Database,
  params: { orgId: string; userId: string; data: NotificationPreferenceInput },
): Promise<typeof notificationPreferences.$inferSelect> {
  const existing = await db.query.notificationPreferences.findFirst({
    where: and(
      eq(notificationPreferences.orgId, params.orgId),
      eq(notificationPreferences.userId, params.userId),
      eq(notificationPreferences.notificationType, params.data.notificationType),
    ),
    columns: { id: true },
  });

  if (existing) {
    const [updated] = await db
      .update(notificationPreferences)
      .set({
        emailEnabled: params.data.emailEnabled,
        inAppEnabled: params.data.inAppEnabled,
      })
      .where(
        and(
          eq(notificationPreferences.id, existing.id),
          eq(notificationPreferences.orgId, params.orgId),
          eq(notificationPreferences.userId, params.userId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Notification preference not found");
    }

    return updated;
  }

  const [created] = await db
    .insert(notificationPreferences)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      ...params.data,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create notification preference");
  }

  return created;
}
