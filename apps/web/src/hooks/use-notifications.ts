import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiError } from "../lib/http-response";

const notifications = api.api.notifications;

export type NotificationRecord = {
  id: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  data: NotificationRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type NotificationPreferenceRecord = {
  id: string;
  notificationType: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

export type NotificationUnreadCountResponse = {
  unreadCount: number;
};

async function readResponseOrThrow<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;

  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = undefined;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new ApiError(record.error, response.status);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new ApiError(record.message, response.status);
      }
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      throw new ApiError(payload, response.status);
    }

    throw new ApiError("Request failed", response.status);
  }

  return payload as T;
}

export function useNotifications(options?: { page?: number; pageSize?: number }) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 25;
  return useQuery({
    queryKey: ["notifications", { page, pageSize }],
    queryFn: async (): Promise<NotificationsResponse> => {
      const res = await notifications.$get({
        query: {
          page: String(page),
          pageSize: String(pageSize),
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async (): Promise<NotificationPreferenceRecord[]> => {
      const res = await notifications.preferences.$get();
      return readResponseOrThrow<NotificationPreferenceRecord[]>(res);
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notification-unread-count"],
    queryFn: async (): Promise<NotificationUnreadCountResponse> => {
      const res = await notifications["unread-count"].$get();
      return readResponseOrThrow<NotificationUnreadCountResponse>(res);
    },
    refetchInterval: 60_000,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
  }

  return {
    markRead: useMutation({
      mutationFn: async (notificationId: string): Promise<NotificationRecord> => {
        const res = await notifications[":notificationId"].read.$patch({
          param: { notificationId },
        });
        return readResponseOrThrow<NotificationRecord>(res);
      },
      onSuccess: invalidate,
    }),
    markAllRead: useMutation({
      mutationFn: async () => {
        const res = await notifications["read-all"].$patch();
        await readResponseOrThrow(res);
      },
      onSuccess: invalidate,
    }),
    updatePreference: useMutation({
      mutationFn: async (data: {
        notificationType: string;
        emailEnabled: boolean;
        inAppEnabled: boolean;
      }): Promise<NotificationPreferenceRecord> => {
        const res = await notifications.preferences.$patch({ json: data as never });
        return readResponseOrThrow<NotificationPreferenceRecord>(res);
      },
      onSuccess: invalidate,
    }),
  };
}
