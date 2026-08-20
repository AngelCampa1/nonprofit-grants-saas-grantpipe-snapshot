import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { sessionMiddleware } from "./session";

type User = { id: string; email: string; name: string };
type Session = { id: string; userId: string };
type AuthSession = Session & { token: string };

type TestVariables = {
  user: User;
  session: Session;
};

describe("sessionMiddleware", () => {
  function createApp(
    getSession: (headers: Headers) => Promise<{ user: User; session: AuthSession } | null>,
  ) {
    const app = new Hono<{ Variables: TestVariables }>();
    app.use("/test", sessionMiddleware(getSession));
    app.get("/test", (c) => {
      const user = c.get("user");
      const session = c.get("session");
      return c.json({ user, session });
    });
    return app;
  }

  it("returns 401 JSON when getSession returns null", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const app = createApp(getSession);

    const res = await app.request("/test");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("sets user and session on context when session is valid", async () => {
    const mockUser: User = { id: "user-1", email: "user@example.com", name: "Test User" };
    const mockSession: AuthSession = { id: "session-1", userId: "user-1", token: "tok_abc123" };
    const getSession = vi.fn().mockResolvedValue({ user: mockUser, session: mockSession });
    const app = createApp(getSession);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: mockUser,
      session: { id: "session-1", userId: "user-1" },
    });
  });

  it("passes request headers to getSession", async () => {
    const mockUser: User = { id: "user-2", email: "other@example.com", name: "Other User" };
    const mockSession: AuthSession = { id: "session-2", userId: "user-2", token: "tok_xyz789" };
    const getSession = vi.fn().mockResolvedValue({ user: mockUser, session: mockSession });
    const app = createApp(getSession);

    const req = new Request("http://localhost/test", {
      headers: { cookie: "session=tok_xyz789", "x-custom": "value" },
    });
    await app.request(req);

    expect(getSession).toHaveBeenCalledOnce();
    const receivedHeaders = getSession.mock.calls[0]![0] as Headers;
    expect(receivedHeaders.get("cookie")).toBe("session=tok_xyz789");
    expect(receivedHeaders.get("x-custom")).toBe("value");
  });

  it("does not expose the raw session token on context", async () => {
    const mockUser: User = { id: "user-3", email: "third@example.com", name: "Third User" };
    const mockSession: AuthSession = { id: "session-3", userId: "user-3", token: "tok_hidden" };
    const getSession = vi.fn().mockResolvedValue({ user: mockUser, session: mockSession });
    const app = createApp(getSession);

    const res = await app.request("/test");
    const body = (await res.json()) as { session: Session & { token?: string } };

    expect(body.session).toEqual({ id: "session-3", userId: "user-3" });
    expect(body.session).not.toHaveProperty("token");
  });

  it("retries once when getSession throws and recovers", async () => {
    const mockUser: User = { id: "user-4", email: "retry@example.com", name: "Retry User" };
    const mockSession: AuthSession = { id: "session-4", userId: "user-4", token: "tok_retry" };
    const getSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to get session"))
      .mockResolvedValueOnce({ user: mockUser, session: mockSession });
    const app = createApp(getSession);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({
      user: mockUser,
      session: { id: "session-4", userId: "user-4" },
    });
  });

  it("propagates the error after the retry also throws", async () => {
    const error = new Error("Failed to get session");
    const getSession = vi.fn().mockRejectedValue(error);
    const app = createApp(getSession);
    app.onError((err, c) => c.json({ error: err.message }, 500));

    const res = await app.request("/test");

    expect(res.status).toBe(500);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ error: "Failed to get session" });
  });
});
