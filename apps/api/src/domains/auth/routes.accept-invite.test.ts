import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { accountRoutes, authRoutes, inviteAcceptanceRoutes, publicInviteRoutes } from "./routes";

vi.mock("./service", () => ({
  AccountDeletionBlockedError: class AccountDeletionBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AccountDeletionBlockedError";
    }
  },
  acceptInvite: vi.fn(),
  checkInvite: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

const { mockCaptureAnalytics, mockCaptureError, mockCaptureBackgroundException } = vi.hoisted(
  () => ({
    mockCaptureAnalytics: vi.fn(),
    mockCaptureError: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }),
);

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
    errors: { capture: mockCaptureError },
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

import {
  AccountDeletionBlockedError,
  acceptInvite,
  checkInvite,
  deleteUserAccount,
} from "./service";

function buildApp() {
  return new Hono<AppEnv>()
    .use("/auth/*", async (c, next) => {
      c.set("user", { id: "user-1", email: "angel@example.com", name: "Angel" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("orgId", "org-1");
      c.set("memberRole", "admin");
      c.set("db", {} as never);
      await next();
    })
    .route("/auth", publicInviteRoutes)
    .route("/auth", inviteAcceptanceRoutes)
    .route("/auth", accountRoutes)
    .route("/auth", authRoutes);
}

function buildAppWithoutOrg() {
  return new Hono<AppEnv>()
    .use("/auth/*", async (c, next) => {
      c.set("user", { id: "user-1", email: "angel@example.com", name: "Angel" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("orgId", null);
      c.set("memberRole", null);
      c.set("db", {} as never);
      await next();
    })
    .route("/auth", publicInviteRoutes)
    .route("/auth", inviteAcceptanceRoutes)
    .route("/auth", accountRoutes)
    .route("/auth", authRoutes);
}

function buildUnauthenticatedApp() {
  return new Hono<AppEnv>()
    .use("/auth/*", async (c, next) => {
      c.set("db", {} as never);
      await next();
    })
    .route("/auth", accountRoutes);
}

describe("POST /auth/invites/:token/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
    mockCaptureError.mockResolvedValue(undefined);
  });

  it("accepts a valid invite token for the signed-in user", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ orgId: "org-2", role: "editor" });

    const res = await buildApp().request("/auth/invites/token-1/accept", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org-2", role: "editor" });
    expect(acceptInvite).toHaveBeenCalledWith(expect.anything(), {
      token: "token-1",
      userId: "user-1",
      userEmail: "angel@example.com",
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-2",
      eventName: ANALYTICS_EVENTS.inviteAccepted,
      payload: { actorId: "user-1", role: "editor" },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("token-1");
  });

  it("GET /invites/:token returns valid + role for a usable invite", async () => {
    vi.mocked(checkInvite).mockResolvedValue({ valid: true, role: "editor", email: null });

    const res = await buildApp().request("/auth/invites/tok-9");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, role: "editor" });
    expect(checkInvite).toHaveBeenCalledWith(expect.anything(), { token: "tok-9" });
  });

  it.each([
    [{ valid: false as const, error: "invite_not_found" as const }, "Invite not found"],
    [{ valid: false as const, error: "invite_expired" as const }, "Invite expired"],
    [{ valid: false as const, error: "invite_already_used" as const }, "Invite already used"],
    [{ valid: false as const, error: "unexpected" as never }, "Failed to accept invite"],
  ])("GET /invites/:token returns 400 for %s", async (result, message) => {
    vi.mocked(checkInvite).mockResolvedValue(result);

    const res = await buildApp().request("/auth/invites/tok-9");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message });
  });

  it.each([
    [{ error: "invite_not_found" as const }, "Invite not found"],
    [{ error: "invite_expired" as const }, "Invite expired"],
    [{ error: "invite_already_used" as const }, "Invite already used"],
    [{ error: "unexpected" as never }, "Failed to accept invite"],
  ])("returns a message for invalid invite outcomes: %s", async (result, message) => {
    vi.mocked(acceptInvite).mockResolvedValue(result);

    const res = await buildApp().request("/auth/invites/token-1/accept", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message });
    expect(mockCaptureError).toHaveBeenCalledWith({
      orgId: "org-1",
      message,
      payload: { actorId: "user-1" },
    });
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain("token-1");
  });

  it("passes orgId as undefined to error capture when orgId context is null", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ error: "invite_not_found" });

    const res = await buildAppWithoutOrg().request("/auth/invites/token-1/accept", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invite not found" });
    expect(mockCaptureError).toHaveBeenCalledWith(expect.objectContaining({ orgId: undefined }));
  });

  it("still returns the invite error when error capture throws synchronously", async () => {
    const captureError = new Error("capture unavailable");
    vi.mocked(acceptInvite).mockResolvedValue({ error: "invite_not_found" });
    mockCaptureError.mockImplementation(() => {
      throw captureError;
    });

    const res = await buildApp().request("/auth/invites/token-1/accept", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invite not found" });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(captureError, "auth", {
      step: "invite_error_capture",
    });
  });

  it("reports invite accepted analytics failures without failing acceptance", async () => {
    const analyticsError = new Error("analytics unavailable");
    vi.mocked(acceptInvite).mockResolvedValue({ orgId: "org-2", role: "editor" });
    mockCaptureAnalytics.mockRejectedValueOnce(analyticsError);

    const res = await buildApp().request("/auth/invites/token-1/accept", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org-2", role: "editor" });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(analyticsError, "auth", {
      step: "invite_accepted_analytics",
    });
  });
});

describe("DELETE /auth/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
    mockCaptureError.mockResolvedValue(undefined);
  });

  it("deletes the signed-in account after exact confirmation", async () => {
    vi.mocked(deleteUserAccount).mockResolvedValue(undefined);

    const res = await buildApp().request("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
    expect(deleteUserAccount).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("rejects requests without exact confirmation", async () => {
    const res = await buildApp().request("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "delete" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Type DELETE to confirm account deletion." });
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON as a missing confirmation", async () => {
    const res = await buildApp().request("/auth/account", {
      method: "DELETE",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Type DELETE to confirm account deletion." });
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated account deletion requests", async () => {
    const res = await buildUnauthenticatedApp().request("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("returns guard failures as bad requests", async () => {
    vi.mocked(deleteUserAccount).mockRejectedValue(
      new AccountDeletionBlockedError("This account is linked to organization memberships."),
    );

    const res = await buildAppWithoutOrg().request("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: "This account is linked to organization memberships.",
    });
  });
});
