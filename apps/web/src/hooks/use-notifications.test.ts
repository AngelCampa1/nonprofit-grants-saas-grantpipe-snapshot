import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockNotificationsGet,
  mockNotificationReadPatch,
  mockNotificationsPreferencesGet,
  mockNotificationsPreferencesPatch,
  mockNotificationsUnreadCountGet,
  mockNotificationsReadAllPatch,
} = vi.hoisted(() => ({
  mockNotificationsGet: vi.fn(),
  mockNotificationReadPatch: vi.fn(),
  mockNotificationsPreferencesGet: vi.fn(),
  mockNotificationsPreferencesPatch: vi.fn(),
  mockNotificationsUnreadCountGet: vi.fn(),
  mockNotificationsReadAllPatch: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      notifications: {
        $get: mockNotificationsGet,
        ":notificationId": {
          read: {
            $patch: mockNotificationReadPatch,
          },
        },
        preferences: {
          $get: mockNotificationsPreferencesGet,
          $patch: mockNotificationsPreferencesPatch,
        },
        "unread-count": {
          $get: mockNotificationsUnreadCountGet,
        },
        "read-all": {
          $patch: mockNotificationsReadAllPatch,
        },
      },
    },
  },
}));

import {
  useNotificationMutations,
  useNotificationPreferences,
  useNotifications,
  useUnreadNotificationCount,
} from "./use-notifications";

function createWrapper(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function createClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return client;
}

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches notifications successfully", async () => {
    mockNotificationsGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "notification-1",
              title: "Grant updated",
              body: "Quarterly report due soon.",
              readAt: null,
              createdAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockNotificationsGet).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "25",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    });
    expect(result.current.data?.data[0]?.title).toBe("Grant updated");
  });

  it("passes custom page and pageSize options through to the API", async () => {
    mockNotificationsGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 2, pageSize: 10 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotifications({ page: 2, pageSize: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockNotificationsGet).toHaveBeenCalledWith({
      query: {
        page: "2",
        pageSize: "10",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    });
  });

  it("surfaces non-OK notification list responses as errors", async () => {
    mockNotificationsGet.mockResolvedValue(
      new Response(JSON.stringify({ error: "Notifications unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Notifications unavailable");
  });
});

describe("useNotificationMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a notification as read and invalidates related queries", async () => {
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");

    mockNotificationReadPatch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "notification-1",
          title: "Grant updated",
          body: null,
          readAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(client),
    });

    await expect(result.current.markRead.mutateAsync("notification-1")).resolves.toMatchObject({
      id: "notification-1",
      readAt: "2026-04-02T00:00:00.000Z",
    });

    expect(mockNotificationReadPatch).toHaveBeenCalledWith({
      param: { notificationId: "notification-1" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notification-unread-count"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notification-preferences"] });
  });

  it("surfaces non-OK notification mutations as errors", async () => {
    mockNotificationReadPatch.mockResolvedValue(
      new Response(JSON.stringify({ message: "Read failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.markRead.mutateAsync("notification-1")).rejects.toThrow(
      "Read failed",
    );
  });
});

describe("notification query helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches unread notification counts", async () => {
    mockNotificationsUnreadCountGet.mockResolvedValue(
      new Response(JSON.stringify({ unreadCount: 7 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.unreadCount).toBe(7);
  });

  it("surfaces non-OK unread count responses as errors", async () => {
    mockNotificationsUnreadCountGet.mockResolvedValue(
      new Response("Unread count unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Unread count unavailable");
  });

  it("falls back to a generic error when a plain-text notification response body cannot be read", async () => {
    mockNotificationsUnreadCountGet.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "text/plain",
      },
      json: vi.fn(),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Request failed");
  });

  it("fetches notification preferences", async () => {
    mockNotificationsPreferencesGet.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "preference-1",
            notificationType: "grant_update",
            emailEnabled: true,
            inAppEnabled: false,
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.notificationType).toBe("grant_update");
  });

  it("surfaces non-OK notification preference responses as errors", async () => {
    mockNotificationsPreferencesGet.mockResolvedValue(
      new Response(JSON.stringify({ error: "Preferences unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Preferences unavailable");
  });

  it("surfaces JSON message notification preference failures", async () => {
    mockNotificationsPreferencesGet.mockResolvedValue(
      new Response(JSON.stringify({ message: "Preference request failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Preference request failed");
  });

  it("surfaces non-OK notification preference updates as errors", async () => {
    mockNotificationsPreferencesPatch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Preference update failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.updatePreference.mutateAsync({
        notificationType: "grant_update",
        emailEnabled: true,
        inAppEnabled: true,
      }),
    ).rejects.toThrow("Preference update failed");
  });

  it("surfaces non-OK mark-all-read responses as errors", async () => {
    mockNotificationsReadAllPatch.mockResolvedValue(
      new Response("Mark all read failed", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.markAllRead.mutateAsync()).rejects.toThrow("Mark all read failed");
  });

  it("marks all notifications as read and updates preferences successfully", async () => {
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");

    mockNotificationsReadAllPatch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockNotificationsPreferencesPatch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "preference-1",
          notificationType: "grant_update",
          emailEnabled: false,
          inAppEnabled: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(client),
    });

    await expect(result.current.markAllRead.mutateAsync()).resolves.toBeUndefined();
    await expect(
      result.current.updatePreference.mutateAsync({
        notificationType: "grant_update",
        emailEnabled: false,
        inAppEnabled: true,
      }),
    ).resolves.toMatchObject({
      id: "preference-1",
      emailEnabled: false,
      inAppEnabled: true,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notification-unread-count"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notification-preferences"] });
  });

  it("falls back to a generic error when notification responses cannot be parsed", async () => {
    mockNotificationsPreferencesPatch.mockResolvedValue({
      ok: false,
      headers: {
        get: () => "application/json",
      },
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
      text: vi.fn().mockRejectedValue(new Error("missing body")),
    });

    const { result } = renderHook(() => useNotificationMutations(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.updatePreference.mutateAsync({
        notificationType: "grant_update",
        emailEnabled: true,
        inAppEnabled: true,
      }),
    ).rejects.toThrow("Request failed");
  });
});
